$ErrorActionPreference = "Stop"

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force

if (-not (Get-Command Invoke-ps2exe -ErrorAction SilentlyContinue)) {
  Install-Module -Name ps2exe -Scope CurrentUser -Force -AllowClobber
}

$root = Resolve-Path "$PSScriptRoot\.."
$inputFile = Join-Path $root "windows\EMSLauncher.ps1"
$outputFile = Join-Path $root "EMSLauncher.exe"

Invoke-ps2exe `
  -inputFile $inputFile `
  -outputFile $outputFile `
  -title "EMS Launcher" `
  -description "Starts ERPNext backend and UI containers for EMS" `
  -company "EMS" `
  -product "EMS Launcher" `
  -version "1.0.0.0" `
  -noConsole

Write-Host "Built: $outputFile"
