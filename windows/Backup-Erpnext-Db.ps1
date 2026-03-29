param(
  # Optional. Example: 'D:\erp backups'. Else BACKUP_DIR env var, else <repo>\backups.
  [string]$BackupDir = ""
)

$ErrorActionPreference = "Stop"

function Find-RepoRoot {
  $starts = New-Object System.Collections.Generic.List[string]
  if ($PSScriptRoot) {
    $starts.Add((Resolve-Path (Join-Path $PSScriptRoot "..")).Path) | Out-Null
  }
  try {
    $exePath = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    if ($exePath -and ($exePath -match '\.(exe|EXE)$')) {
      $starts.Add((Split-Path -Parent $exePath)) | Out-Null
    }
  }
  catch {
    # Ignore.
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

  throw "Could not find docker-compose.erpnext.yml (run from the project repo root, or set location to the folder that contains docker-compose.erpnext.yml)."
}

function Read-DotEnvPassword {
  param([string]$RootPath)
  $envPath = Join-Path $RootPath ".env"
  if (-not (Test-Path $envPath)) {
    return "admin"
  }
  foreach ($line in Get-Content $envPath -Encoding UTF8) {
    $t = $line.Trim()
    if ($t.Length -eq 0 -or $t.StartsWith("#")) {
      continue
    }
    if ($t -match '^\s*ERPNEXT_DB_ROOT_PASSWORD\s*=\s*(.*)$') {
      $val = $Matches[1].Trim()
      if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
        $val = $val.Substring(1, $val.Length - 2)
      }
      return $val
    }
  }
  return "admin"
}

$root = Find-RepoRoot
Set-Location $root

$composeFile = "docker-compose.erpnext.yml"

$resolvedBackup = $BackupDir
if ([string]::IsNullOrWhiteSpace($resolvedBackup)) {
  $resolvedBackup = $env:BACKUP_DIR
}
if ([string]::IsNullOrWhiteSpace($resolvedBackup)) {
  $backupDir = Join-Path $root "backups"
}
else {
  $backupDir = [System.IO.Path]::GetFullPath($resolvedBackup.Trim())
}

$retentionDays = 14
if ($env:RETENTION_DAYS) {
  [int]$retentionDays = $env:RETENTION_DAYS
}

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$password = Read-DotEnvPassword -RootPath $root
$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$sqlName = "erpnext-db-$stamp.sql"
$sqlPath = Join-Path $backupDir $sqlName
$zipPath = "$sqlPath.zip"
$errPath = Join-Path $backupDir "erpnext-db-$stamp.stderr.txt"

$ping = & docker compose -f $composeFile exec -T db mysqladmin ping -h localhost -uroot "-p$password" --silent 2>&1
if ($LASTEXITCODE -ne 0) {
  throw "MariaDB (db service) is not reachable. Start Docker Desktop and your stack, then retry."
}

Write-Host "Backing up to $zipPath …"

$proc = Start-Process -FilePath "docker" -WorkingDirectory $root -ArgumentList @(
  "compose", "-f", $composeFile, "exec", "-T",
  "-e", "MYSQL_PWD=$password",
  "db", "mysqldump", "-uroot",
  "--single-transaction", "--quick", "--routines", "--events", "--all-databases"
) -RedirectStandardOutput $sqlPath -RedirectStandardError $errPath -NoNewWindow -Wait -PassThru

if ($proc.ExitCode -ne 0) {
  if (Test-Path $errPath) {
    Get-Content $errPath -ErrorAction SilentlyContinue | Write-Host
  }
  Remove-Item -LiteralPath $sqlPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $errPath -Force -ErrorAction SilentlyContinue
  throw "mysqldump failed (exit $($proc.ExitCode))."
}

if (Test-Path $errPath) {
  $warn = (Get-Content $errPath -Raw -ErrorAction SilentlyContinue).Trim()
  if ($warn.Length -gt 0) {
    Write-Host $warn
  }
  Remove-Item -LiteralPath $errPath -Force -ErrorAction SilentlyContinue
}

Compress-Archive -Path $sqlPath -DestinationPath $zipPath -Force
Remove-Item -LiteralPath $sqlPath -Force

$size = (Get-Item $zipPath).Length
Write-Host "Done ($([math]::Round($size / 1MB, 2)) MB zip)."

$cutoff = (Get-Date).AddDays(-$retentionDays)
Get-ChildItem -Path $backupDir -File -Filter "erpnext-db-*.sql.zip" -ErrorAction SilentlyContinue |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  ForEach-Object {
    Write-Host "Removing old backup: $($_.Name)"
    Remove-Item -LiteralPath $_.FullName -Force
  }
