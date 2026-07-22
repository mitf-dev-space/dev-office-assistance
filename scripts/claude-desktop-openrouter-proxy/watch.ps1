#requires -Version 7.0
<#
.SYNOPSIS
  Keep the Claude Desktop → OpenRouter proxy running; restart on exit/crash.
#>
$ErrorActionPreference = "Continue"
$Root = $PSScriptRoot
$LogPath = Join-Path $Root "proxy-watch.log"
$Port = 8787
$RestartDelaySec = 2

function Write-WatchLog([string]$Message) {
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffK"), $Message
  Add-Content -Path $LogPath -Value $line -Encoding utf8
  Write-Host $line
}

function Clear-PortListener([int]$ListenPort) {
  try {
    $conns = Get-NetTCPConnection -LocalPort $ListenPort -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
      $procId = $c.OwningProcess
      if ($procId -and $procId -ne $PID) {
        Write-WatchLog "Freeing port $ListenPort (pid=$procId)"
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {
    # ignore
  }
}

Write-WatchLog "Watchdog started (dir=$Root)"

while ($true) {
  Clear-PortListener -ListenPort $Port
  Write-WatchLog "Starting node server.mjs"
  $exitCode = 0
  try {
    Push-Location $Root
    & node server.mjs
    $exitCode = $LASTEXITCODE
    if ($null -eq $exitCode) { $exitCode = 0 }
  } catch {
    $exitCode = 1
    Write-WatchLog "node threw: $($_.Exception.Message)"
  } finally {
    Pop-Location
  }

  Write-WatchLog "Proxy exited code=$exitCode — restarting in ${RestartDelaySec}s"
  Start-Sleep -Seconds $RestartDelaySec
}
