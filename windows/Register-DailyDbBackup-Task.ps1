param(
  # Example: 'D:\erp backups' — stored in the scheduled task. Or set env BACKUP_DIR before running this script.
  [string]$BackupDir = ""
)

$ErrorActionPreference = "Stop"

# Run once (as Administrator recommended) to register a daily DB backup.
# Default: 14:00 (2:00 PM) daily, current user, only when logged on (Docker Desktop is usually available then).
# Override hour: BACKUP_TASK_HOUR=9 powershell -File .\Register-DailyDbBackup-Task.ps1
# Custom folder: .\Register-DailyDbBackup-Task.ps1 -BackupDir 'D:\erp backups'

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$scriptPath = Join-Path $root "windows\Backup-Erpnext-Db.ps1"
if (-not (Test-Path $scriptPath)) {
  throw "Missing $scriptPath"
}

$taskName = "EMS ERPNext DB Backup"
$hour = 14
$minute = 0
if ($env:BACKUP_TASK_HOUR) {
  [int]$hour = $env:BACKUP_TASK_HOUR
}

$backupDirArg = $BackupDir
if ([string]::IsNullOrWhiteSpace($backupDirArg)) {
  $backupDirArg = $env:BACKUP_DIR
}

if (-not [string]::IsNullOrWhiteSpace($backupDirArg)) {
  $bd = $backupDirArg.Trim()
  $psArgument = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`" -BackupDir `"$bd`""
}
else {
  $psArgument = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument $psArgument `
  -WorkingDirectory $root.Path

$trigger = New-ScheduledTaskTrigger -Daily -At ([DateTime]::Today.AddHours($hour).AddMinutes($minute))
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

$principal = New-ScheduledTaskPrincipal `
  -UserId $env:USERNAME `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Daily mysqldump of ERPNext MariaDB (docker compose erpnext-local)." `
  -Force | Out-Null

Write-Host "Registered scheduled task: $taskName (daily at $($hour.ToString('00')):$($minute.ToString('00')) — 24h clock, runs when you are logged in)."
if (-not [string]::IsNullOrWhiteSpace($backupDirArg)) {
  Write-Host "Backup folder: $($backupDirArg.Trim())"
}
else {
  Write-Host "Backup folder: $($root.Path)\backups (default)"
}
Write-Host "View in Task Scheduler (taskschd.msc) or: Get-ScheduledTask -TaskName '$taskName'"
