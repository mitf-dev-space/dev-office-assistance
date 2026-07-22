#requires -Version 7.0
$TaskName = "ClaudeDesktopOpenRouterProxy"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Removed scheduled task '$TaskName' (if it existed)."
Write-Host "Stop a running watchdog/proxy with: Get-NetTCPConnection -LocalPort 8787 | % { Stop-Process -Id $_.OwningProcess -Force }"
