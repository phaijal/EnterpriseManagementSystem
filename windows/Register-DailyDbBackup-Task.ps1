param(
  # Stored in the scheduled task. Default: D:\erp backups. Override with env BACKUP_DIR or -BackupDir.
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
if ([string]::IsNullOrWhiteSpace($backupDirArg)) {
  $backupDirArg = "D:\erp backups"
}

$bd = $backupDirArg.Trim()
$psArgument = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`" -BackupDir `"$bd`""

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
  -Description "Daily ERPNext bench backup (database + files) for site frontend." `
  -Force | Out-Null

$timeLabel = "{0:00}:{1:00}" -f $hour, $minute
Write-Host "Registered scheduled task: $taskName (daily at $timeLabel - 24h clock, runs when you are logged in)."
Write-Host "Backup folder: $bd"
Write-Host ('View in Task Scheduler (taskschd.msc) or: Get-ScheduledTask -TaskName "{0}"' -f $taskName)
