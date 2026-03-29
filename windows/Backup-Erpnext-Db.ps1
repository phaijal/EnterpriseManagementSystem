param(
  # Optional. Else BACKUP_DIR env var, else D:\erp backups (if D: exists), else <repo>\backups.
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

$root = Find-RepoRoot
Set-Location $root

$composeFile = "docker-compose.erpnext.yml"
$siteName = "frontend"
$containerBackupDir = "/home/frappe/frappe-bench/sites/$siteName/private/backups"

$resolvedBackup = $BackupDir
if ([string]::IsNullOrWhiteSpace($resolvedBackup)) {
  $resolvedBackup = $env:BACKUP_DIR
}
if ([string]::IsNullOrWhiteSpace($resolvedBackup)) {
  if (Test-Path -LiteralPath "D:\") {
    $backupDir = "D:\erp backups"
  }
  else {
    $backupDir = Join-Path $root "backups"
  }
}
else {
  $backupDir = [System.IO.Path]::GetFullPath($resolvedBackup.Trim())
}

$retentionDays = 14
if ($env:RETENTION_DAYS) {
  [int]$retentionDays = $env:RETENTION_DAYS
}

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

Write-Host "Running bench backup for site '$siteName' (with files) …"
$backupRun = & docker compose -f $composeFile exec -T backend bench --site $siteName backup --with-files 2>&1
if ($LASTEXITCODE -ne 0) {
  $backupRun | Write-Host
  throw "bench backup failed. Ensure backend is running and site '$siteName' exists."
}

$latestDbPath = (
  & docker compose -f $composeFile exec -T backend bash -lc "ls -1t $containerBackupDir/*-$siteName-database.sql.gz 2>/dev/null | sed -n '1p'"
).Trim()

if ([string]::IsNullOrWhiteSpace($latestDbPath)) {
  throw "Could not locate latest bench database backup in $containerBackupDir."
}

$latestDbName = [System.IO.Path]::GetFileName($latestDbPath)
$prefix = $latestDbName -replace "-$siteName-database\.sql\.gz$", ""
if ([string]::IsNullOrWhiteSpace($prefix)) {
  throw "Could not parse backup prefix from '$latestDbName'."
}

$filesToCopy = (
  & docker compose -f $composeFile exec -T backend bash -lc "ls -1 $containerBackupDir/$prefix-$siteName-* 2>/dev/null"
) -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

if ($filesToCopy.Count -eq 0) {
  throw "No bench backup files found for prefix '$prefix'."
}

$backendCid = (& docker compose -f $composeFile ps -q backend).Trim()
if ([string]::IsNullOrWhiteSpace($backendCid)) {
  throw "Could not resolve backend container id for copying backup files."
}

Write-Host "Copying $($filesToCopy.Count) backup file(s) to $backupDir …"
foreach ($containerFile in $filesToCopy) {
  $target = Join-Path $backupDir ([System.IO.Path]::GetFileName($containerFile))
  & docker cp "$backendCid:$containerFile" "$target" | Out-Null
}

$copied = Get-ChildItem -Path $backupDir -File | Where-Object {
  $_.Name -like "$prefix-$siteName-*"
}
$totalBytes = ($copied | Measure-Object -Property Length -Sum).Sum
$totalMB = if ($null -eq $totalBytes) { 0 } else { [math]::Round($totalBytes / 1MB, 2) }
Write-Host "Done. Saved prefix '$prefix' ($($copied.Count) file(s), $totalMB MB total)."

$cutoff = (Get-Date).AddDays(-$retentionDays)
Get-ChildItem -Path $backupDir -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "*-$siteName-*" } |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  ForEach-Object {
    Write-Host "Removing old backup: $($_.Name)"
    Remove-Item -LiteralPath $_.FullName -Force
  }
