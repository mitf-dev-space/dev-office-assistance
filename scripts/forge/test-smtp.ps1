#requires -Version 7.0
<#
.SYNOPSIS
  Send styled Helm Forge sample emails (success + failure) via the admin API.
.PARAMETER ApiBase
  API origin (default http://localhost:4000)
.PARAMETER To
  Recipient (default a.almesbahi@masarat.ly)
.PARAMETER ConnectivityOnly
  Send a plain SMTP ping instead of branded samples
#>
param(
  [string]$ApiBase = "http://localhost:4000",
  [string]$To = "a.almesbahi@masarat.ly",
  [switch]$ConnectivityOnly
)

$ErrorActionPreference = "Stop"

$pw = if ($env:SEED_FORGE_MOBILE_LEAD_PASSWORD) {
  $env:SEED_FORGE_MOBILE_LEAD_PASSWORD
} elseif ($env:SEED_FORGE_ADMIN_PASSWORD) {
  $env:SEED_FORGE_ADMIN_PASSWORD
} else {
  "ForgeMobileLead1!"
}

$res = Invoke-WebRequest -Uri "$ApiBase/api/auth/login" -Method POST `
  -ContentType "application/json" `
  -Body (@{ email = "forge-mobile-lead@local.dev"; password = $pw } | ConvertTo-Json) `
  -SkipHttpErrorCheck
if ($res.StatusCode -ne 200) { throw "Admin login failed: $($res.StatusCode)" }
$token = ($res.Content | ConvertFrom-Json).token

$body = @{
  to = $To
  samples = -not $ConnectivityOnly.IsPresent
}

$res = Invoke-WebRequest -Uri "$ApiBase/api/forge/admin/test-email" -Method POST `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body ($body | ConvertTo-Json) `
  -SkipHttpErrorCheck

if ($res.StatusCode -ne 200) {
  throw "Test email failed: $($res.StatusCode) $($res.Content)"
}

$data = $res.Content | ConvertFrom-Json
Write-Host "Forge email(s) sent to $($data.to) kind=$($data.kind)"
if ($data.sent) {
  Write-Host ("Sent samples: " + ($data.sent -join ", "))
}
