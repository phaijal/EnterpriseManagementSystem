$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Human-readable URL in the browser (loopback; supported by current Edge/Chrome/Firefox).
$Script:EmsBrowseUrl = "http://ems.localhost:3000"
# Reliable readiness probe (no DNS).
$Script:EmsHealthUrl = "http://127.0.0.1:3000"

$Script:Form = $null
$Script:LogBox = $null
$Script:CloseBtn = $null
$Script:AllowClose = $false

function Write-Status {
  param([string]$Message)
  if ($null -eq $Script:LogBox) {
    return
  }
  $timestamp = Get-Date -Format "HH:mm:ss"
  $line = "[$timestamp] $Message"
  $Script:LogBox.AppendText("$line`r`n")
  $Script:LogBox.SelectionStart = $Script:LogBox.Text.Length
  $Script:LogBox.ScrollToCaret()
}

function Complete-StatusWindow {
  param(
    [bool]$Ok,
    [string]$Summary
  )
  $Script:AllowClose = $true
  if ($Ok) {
    $Script:Form.Text = "EMS — Ready"
  }
  else {
    $Script:Form.Text = "EMS — Error"
  }
  Write-Status $Summary
  $Script:CloseBtn.Enabled = $true
}

function Ensure-DockerInstalled {
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    return
  }

  Write-Status "Docker not found. Opening Docker Desktop download page."
  Start-Process "https://www.docker.com/products/docker-desktop/"
  throw "Docker Desktop is not installed. Install it, then run EMS Launcher again."
}

function Ensure-DockerRunning {
  $dockerOk = $false
  try {
    docker info 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $dockerOk = $true
    }
  }
  catch {
    $dockerOk = $false
  }
  if ($dockerOk) {
    return
  }

  $dockerDesktopExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dockerDesktopExe) {
    Write-Status "Starting Docker Desktop — please wait…"
    Start-Process $dockerDesktopExe | Out-Null
  }
  else {
    Write-Status "Docker Desktop executable not found at default path."
  }

  $maxSeconds = 120
  for ($i = 0; $i -lt $maxSeconds; $i++) {
    try {
      docker info 2>&1 | Out-Null
      if ($LASTEXITCODE -eq 0) {
        Write-Status "Docker is running."
        return
      }
    }
    catch {
      # Keep waiting.
    }
    if (($i % 10) -eq 0 -and $i -gt 0) {
      Write-Status "Still waiting for Docker… ($i s)"
    }
    Start-Sleep -Seconds 1
    [System.Windows.Forms.Application]::DoEvents()
  }

  throw "Docker Desktop is not running. Start Docker Desktop and run EMS Launcher again."
}

function Stop-UiIfRunning {
  Write-Status "Stopping UI container (if running)…"
  try {
    Invoke-DockerLogged -Arguments "compose -f docker-compose.erpnext.yml stop ui"
  }
  catch {
    Write-Status "(UI stop skipped or not applicable: $($_.Exception.Message))"
  }
}

function Invoke-DockerLogged {
  param([string]$Arguments)

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "docker"
  $psi.Arguments = $Arguments
  $psi.WorkingDirectory = (Get-Location).Path
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true

  $proc = New-Object System.Diagnostics.Process
  $proc.EnableRaisingEvents = $true
  $proc.StartInfo = $psi

  $append = [System.Action[string]]{
    param($text)
    if ([string]::IsNullOrEmpty($text)) {
      return
    }
    $ts = Get-Date -Format "HH:mm:ss"
    $Script:LogBox.AppendText("[$ts] $text`r`n")
    $Script:LogBox.SelectionStart = $Script:LogBox.Text.Length
    $Script:LogBox.ScrollToCaret()
  }

  $onLine = [System.Diagnostics.DataReceivedEventHandler]{
    param($sender, $e)
    $text = $e.Data
    if ($null -eq $text) {
      return
    }
    [void]$Script:Form.Invoke($append, $text)
  }

  $proc.add_OutputDataReceived($onLine)
  $proc.add_ErrorDataReceived($onLine)

  try {
    [void]$proc.Start()
    $proc.BeginOutputReadLine()
    $proc.BeginErrorReadLine()

    while (-not $proc.HasExited) {
      [System.Windows.Forms.Application]::DoEvents()
      Start-Sleep -Milliseconds 50
    }
    Start-Sleep -Milliseconds 150
    [System.Windows.Forms.Application]::DoEvents()

    if ($proc.ExitCode -ne 0) {
      throw "Docker failed (exit $($proc.ExitCode)). See log above."
    }
  }
  finally {
    if ($null -ne $proc) {
      $proc.Dispose()
    }
  }
}

function Restart-Compose {
  Write-Status "Running: docker compose down"
  Invoke-DockerLogged -Arguments "compose -f docker-compose.erpnext.yml down"
  Write-Status "Running: docker compose up -d --build (may take several minutes on first run)…"
  Invoke-DockerLogged -Arguments "compose -f docker-compose.erpnext.yml up -d --build"
}

function Wait-ForServer {
  $url = $Script:EmsHealthUrl
  $maxSeconds = 300
  Write-Status "Waiting for UI at $url …"
  Write-Status "Browser will open: $($Script:EmsBrowseUrl)"

  for ($i = 0; $i -lt $maxSeconds; $i++) {
    try {
      $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 5 -UseBasicParsing
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        Write-Status "UI is responding."
        return
      }
    }
    catch {
      # Keep waiting.
    }
    if (($i % 15) -eq 0 -and $i -gt 0) {
      Write-Status "Still waiting for UI… ($i s). First build may still be compiling the UI image."
    }
    Start-Sleep -Seconds 1
    [System.Windows.Forms.Application]::DoEvents()
  }

  throw "UI did not become ready in time at $url. Check Docker logs for the ""ui"" service."
}

function Find-RepoRoot {
  $starts = New-Object System.Collections.Generic.List[string]
  if ($PSScriptRoot) {
    $starts.Add((Resolve-Path $PSScriptRoot).Path) | Out-Null
  }
  try {
    $exePath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    if ($exePath -and ($exePath -match '\.(exe|EXE)$')) {
      $starts.Add((Split-Path -Parent $exePath)) | Out-Null
    }
  }
  catch {
    # Ignore if MainModule is unavailable.
  }

  foreach ($start in ($starts | Select-Object -Unique)) {
    $dir = $start
    for ($i = 0; $i -lt 8; $i++) {
      if ([string]::IsNullOrWhiteSpace($dir)) {
        break
      }
      $compose = Join-Path $dir "docker-compose.erpnext.yml"
      if (Test-Path $compose) {
        return (Resolve-Path $dir).Path
      }
      $parent = Split-Path -Parent $dir
      if ($parent -eq $dir) {
        break
      }
      $dir = $parent
    }
  }

  throw "Could not find docker-compose.erpnext.yml. Place EMSLauncher.exe in the project folder (same folder as docker-compose.erpnext.yml) or run windows\EMSLauncher.ps1 from the repo."
}

function Invoke-EmsStartupWork {
  Write-Status "EMS Launcher started."
  Write-Status "Locating project folder…"

  Set-Location (Find-RepoRoot)
  Write-Status "Project: $(Get-Location)"

  Ensure-DockerInstalled
  Ensure-DockerRunning
  Stop-UiIfRunning
  Restart-Compose
  Wait-ForServer

  Write-Status "Opening browser: $($Script:EmsBrowseUrl)"
  Start-Process $Script:EmsBrowseUrl

  Complete-StatusWindow -Ok $true -Summary "All done. If the page does not load, try $($Script:EmsHealthUrl). You can close this window."
}

# --- Main window (message pump) ---
$form = New-Object System.Windows.Forms.Form
$form.Text = "EMS — Starting"
$form.Size = New-Object System.Drawing.Size(720, 520)
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.MinimizeBox = $true
$form.MaximizeBox = $true

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Multiline = $true
$logBox.ReadOnly = $true
$logBox.ScrollBars = [System.Windows.Forms.ScrollBars]::Both
$logBox.Dock = [System.Windows.Forms.DockStyle]::Fill
$logBox.Font = New-Object System.Drawing.Font("Consolas", 9)
$logBox.WordWrap = $false

$closeBtn = New-Object System.Windows.Forms.Button
$closeBtn.Text = "Close"
$closeBtn.Height = 36
$closeBtn.Dock = [System.Windows.Forms.DockStyle]::Fill
$closeBtn.Enabled = $false
$closeBtn.Add_Click({ $form.Close() })

$bottom = New-Object System.Windows.Forms.Panel
$bottom.Height = 44
$bottom.Dock = [System.Windows.Forms.DockStyle]::Bottom
$bottom.Padding = New-Object System.Windows.Forms.Padding(8, 4, 8, 4)
$bottom.Controls.Add($closeBtn)

$form.Controls.Add($logBox)
$form.Controls.Add($bottom)

$form.Add_FormClosing({
  if (-not $Script:AllowClose) {
    $_.Cancel = $true
  }
})

$Script:Form = $form
$Script:LogBox = $logBox
$Script:CloseBtn = $closeBtn

$form.Add_Shown({
  $form.BeginInvoke([System.Action]{
    try {
      Invoke-EmsStartupWork
    }
    catch {
      $msg = $_.Exception.Message
      Write-Status "ERROR: $msg"
      Complete-StatusWindow -Ok $false -Summary "Startup failed. Fix the issue above, then run EMS Launcher again."
    }
  })
})

[System.Windows.Forms.Application]::Run($form)
