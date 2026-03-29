$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms

function Show-Info([string]$message, [string]$title = "EMS Launcher") {
  [System.Windows.Forms.MessageBox]::Show($message, $title, "OK", "Information") | Out-Null
}

function Show-Error([string]$message, [string]$title = "EMS Launcher") {
  [System.Windows.Forms.MessageBox]::Show($message, $title, "OK", "Error") | Out-Null
}

function Ensure-DockerInstalled {
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    return
  }

  Show-Error "Docker Desktop is not installed. It will now open the download page."
  Start-Process "https://www.docker.com/products/docker-desktop/"
  exit 1
}

function Ensure-DockerRunning {
  try {
    docker info | Out-Null
    return
  }
  catch {
    $dockerDesktopExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerDesktopExe) {
      Start-Process $dockerDesktopExe | Out-Null
      Show-Info "Starting Docker Desktop. Please wait..."
    }
  }

  $maxSeconds = 120
  for ($i = 0; $i -lt $maxSeconds; $i++) {
    try {
      docker info | Out-Null
      return
    }
    catch {
      Start-Sleep -Seconds 1
    }
  }

  Show-Error "Docker Desktop is not running. Start Docker Desktop and run EMSLauncher again."
  exit 1
}

function Stop-UiIfRunning {
  try {
    docker compose -f docker-compose.erpnext.yml stop ui | Out-Null
  }
  catch {
    # Ignore if UI service does not exist yet.
  }
}

function Restart-Compose {
  docker compose -f docker-compose.erpnext.yml down
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose down failed."
  }

  docker compose -f docker-compose.erpnext.yml up -d --build
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose up failed."
  }
}

function Wait-ForServer {
  $url = "http://localhost:3000"
  $maxSeconds = 240

  for ($i = 0; $i -lt $maxSeconds; $i++) {
    try {
      $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 5 -UseBasicParsing
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return
      }
    }
    catch {
      # Keep waiting for app warmup.
    }
    Start-Sleep -Seconds 1
  }

  throw "UI did not become ready in time at $url."
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

try {
  Set-Location (Find-RepoRoot)

  Ensure-DockerInstalled
  Ensure-DockerRunning
  Stop-UiIfRunning
  Restart-Compose
  Wait-ForServer

  Start-Process "http://localhost:3000"
  Show-Info "EMS is up and running."
}
catch {
  Show-Error "Launch failed: $($_.Exception.Message)"
  exit 1
}
