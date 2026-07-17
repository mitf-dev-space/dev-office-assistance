#requires -Version 7.0
<#
.SYNOPSIS
  Send a Forge SMTP test email via the admin API.
.PARAMETER ApiBase
  API origin (default http://localhost:4000)
.PARAMETER To
  Recipient (default a.almesbahi@masarat.ly)
#>
param(
  [string]$ApiBase = "http://localhost:4000",
  [string]$To = "a.almesbahi@masarat.ly"
)

$ErrorActionPreference = "Stop"

$res = Invoke-WebRequest -Uri "$ApiBase/api/auth/login" -Method POST `
  -ContentType "application/json" `
  -Body (@{ email = "forge-admin@local.dev"; password = "ForgeAdmin1!" } | ConvertTo-Json) `
  -SkipHttpErrorCheck
if ($res.StatusCode -ne 200) { throw "Admin login failed: $($res.StatusCode)" }
$token = ($res.Content | ConvertFrom-Json).token

$res = Invoke-WebRequest -Uri "$ApiBase/api/forge/admin/test-email" -Method POST `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body (@{ to = $To } | ConvertTo-Json) `
  -SkipHttpErrorCheck

if ($res.StatusCode -ne 200) {
  throw "Test email failed: $($res.StatusCode) $($res.Content)"
}

$data = $res.Content | ConvertFrom-Json
Write-Host "SMTP test email sent to $($data.to)"
