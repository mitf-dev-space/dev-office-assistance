#requires -Version 7.0
<#
.SYNOPSIS
  Forge module API smoke tests — auth, role gates, banks CRUD.
.PARAMETER ApiBase
  API origin (default http://localhost:4000)
#>
param(
  [string]$ApiBase = "http://localhost:4000"
)

$ErrorActionPreference = "Stop"

function Login([string]$Email, [string]$Password) {
  $res = Invoke-WebRequest -Uri "$ApiBase/api/auth/login" -Method POST `
    -ContentType "application/json" `
    -Body (@{ email = $Email; password = $Password } | ConvertTo-Json) `
    -SkipHttpErrorCheck
  if ($res.StatusCode -ne 200) {
    throw "Login failed for $Email ($($res.StatusCode)): $($res.Content)"
  }
  ($res.Content | ConvertFrom-Json).token
}

function ApiGet([string]$Token, [string]$Path) {
  Invoke-WebRequest -Uri "$ApiBase$Path" -Headers @{ Authorization = "Bearer $Token" } -SkipHttpErrorCheck
}

function ApiPost([string]$Token, [string]$Path, [object]$Body) {
  Invoke-WebRequest -Uri "$ApiBase$Path" -Method POST `
    -Headers @{ Authorization = "Bearer $Token" } `
    -ContentType "application/json" `
    -Body ($Body | ConvertTo-Json) `
    -SkipHttpErrorCheck
}

function ApiPut([string]$Token, [string]$Path, [object]$Body) {
  Invoke-WebRequest -Uri "$ApiBase$Path" -Method PUT `
    -Headers @{ Authorization = "Bearer $Token" } `
    -ContentType "application/json" `
    -Body ($Body | ConvertTo-Json) `
    -SkipHttpErrorCheck
}

Write-Host "Forge smoke — API $ApiBase"

$assistantToken = Login "assistant@local.dev" "ChangeMe!Asst1"
$pmToken = Login "pm@local.dev" "ForgePm1!"
$adminToken = Login "forge-admin@local.dev" "ForgeAdmin1!"

# Negative: assistant denied dashboard
$r = ApiGet $assistantToken "/api/forge/dashboard"
if ($r.StatusCode -ne 403) { throw "Expected 403 for assistant dashboard, got $($r.StatusCode)" }
Write-Host "OK assistant dashboard -> 403"

# PM dashboard
$r = ApiGet $pmToken "/api/forge/dashboard"
if ($r.StatusCode -ne 200) { throw "PM dashboard failed: $($r.StatusCode)" }
$dash = $r.Content | ConvertFrom-Json
if ($dash.moduleStatus -notin @("bootstrap", "loop5")) { throw "Unexpected moduleStatus: $($dash.moduleStatus)" }
Write-Host "OK pm dashboard -> 200 (moduleStatus=$($dash.moduleStatus))"

# PM denied banks admin
$r = ApiGet $pmToken "/api/forge/banks"
if ($r.StatusCode -ne 403) { throw "Expected 403 for pm banks, got $($r.StatusCode)" }
Write-Host "OK pm banks -> 403"

# Admin banks list
$r = ApiGet $adminToken "/api/forge/banks"
if ($r.StatusCode -ne 200) { throw "Admin banks list failed: $($r.StatusCode)" }
$banks = ($r.Content | ConvertFrom-Json).items
Write-Host "OK admin banks list -> $($banks.Count) bank(s)"

# Create bank
$code = "TST" + (Get-Random -Maximum 9999)
$r = ApiPost $adminToken "/api/forge/banks" @{ name = "Smoke Test Bank"; code = $code; isActive = $true }
if ($r.StatusCode -ne 201) { throw "Create bank failed: $($r.StatusCode) $($r.Content)" }
$created = ($r.Content | ConvertFrom-Json).bank
Write-Host "OK create bank -> $($created.code)"

# Duplicate code -> 409
$r = ApiPost $adminToken "/api/forge/banks" @{ name = "Dup"; code = $code; isActive = $true }
if ($r.StatusCode -ne 409) { throw "Expected 409 duplicate, got $($r.StatusCode)" }
Write-Host "OK duplicate bank -> 409"

# Toggle inactive
$r = ApiPut $adminToken "/api/forge/banks/$($created.id)" @{ isActive = $false }
if ($r.StatusCode -ne 200) { throw "Update bank failed: $($r.StatusCode)" }
Write-Host "OK update bank -> inactive"

# Build request still 501 for PM
$r = ApiPost $pmToken "/api/forge/build-requests" @{ note = "smoke" }
if ($r.StatusCode -ne 501) { throw "Expected 501 build submit, got $($r.StatusCode)" }
Write-Host "OK build submit stub -> 501"

Write-Host "Forge smoke passed."
