#requires -Version 7.0
<#
.SYNOPSIS
  Register a per-user Scheduled Task that starts the proxy watchdog at logon.
#>
$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$WatchScript = Join-Path $Root "watch.ps1"
$TaskName = "ClaudeDesktopOpenRouterProxy"

if (-not (Test-Path $WatchScript)) {
  throw "Missing watch.ps1 at $WatchScript"
}

$pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue)?.Source
if (-not $pwsh) {
  $pwsh = (Get-Command powershell -ErrorAction SilentlyContinue)?.Source
}
if (-not $pwsh) {
  throw "Neither pwsh nor powershell found on PATH"
}

# Remove prior registration if present
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction `
  -Execute $pwsh `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$WatchScript`"" `
  -WorkingDirectory $Root

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Auto-restart Claude Desktop OpenRouter local proxy (127.0.0.1:8787)" `
  | Out-Null

# Start immediately if not already healthy
$healthy = $false
try {
  $r = Invoke-RestMethod -Uri "http://127.0.0.1:8787/health" -TimeoutSec 2
  $healthy = [bool]$r.ok
} catch {
  $healthy = $false
}

if (-not $healthy) {
  Start-ScheduledTask -TaskName $TaskName
  Write-Host "Scheduled task '$TaskName' registered and started."
} else {
  Write-Host "Scheduled task '$TaskName' registered (proxy already healthy; will auto-start at next logon)."
}

Write-Host "To stop autostart later: .\uninstall-autostart.ps1"
