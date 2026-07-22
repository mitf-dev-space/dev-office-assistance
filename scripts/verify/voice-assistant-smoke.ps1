#requires -Version 7.0
<#
.SYNOPSIS
  Smoke-check Helm voice assistant wiring (fake providers).
#>
param(
  [string]$ApiBase = "http://localhost:4000",
  [string]$SpeechBase = "http://localhost:8000"
)

$ErrorActionPreference = "Stop"

Write-Host "Checking speech /healthz ..."
try {
  $h = Invoke-RestMethod -Uri "$SpeechBase/healthz" -TimeoutSec 5
  Write-Host "  speech live: $($h.status)"
} catch {
  Write-Host "  speech not running (ok if profile voice is down): $_"
}

Write-Host "Checking API /health/live ..."
$api = Invoke-RestMethod -Uri "$ApiBase/health/live" -TimeoutSec 5
Write-Host "  api live: $($api.status)"

Write-Host "Voice smoke incomplete without JWT login — use UI /apps/ai/voice with VOICE_ASSISTANT_ENABLED=true"
Write-Host "Done."
