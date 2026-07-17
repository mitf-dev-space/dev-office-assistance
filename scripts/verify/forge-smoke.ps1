#requires -Version 7.0
<#
.SYNOPSIS
  Forge module API smoke tests — auth, role gates, banks CRUD, catalog, build submit.
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
$pmEmail = if ($env:SEED_FORGE_PM_EMAIL) { $env:SEED_FORGE_PM_EMAIL } else { "a.almesbahi@masarat.ly" }
$pmToken = Login $pmEmail "ForgePm1!"
$adminToken = Login "forge-admin@local.dev" "ForgeAdmin1!"

# Negative: assistant denied dashboard
$r = ApiGet $assistantToken "/api/forge/dashboard"
if ($r.StatusCode -ne 403) { throw "Expected 403 for assistant dashboard, got $($r.StatusCode)" }
Write-Host "OK assistant dashboard -> 403"

# PM dashboard
$r = ApiGet $pmToken "/api/forge/dashboard"
if ($r.StatusCode -ne 200) { throw "PM dashboard failed: $($r.StatusCode)" }
$dash = $r.Content | ConvertFrom-Json
if ($dash.moduleStatus -notin @("bootstrap", "loop5", "loop10")) { throw "Unexpected moduleStatus: $($dash.moduleStatus)" }
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

# PM catalog (seeded gateway tester when present)
$r = ApiGet $pmToken "/api/forge/catalog"
if ($r.StatusCode -ne 200) { throw "PM catalog failed: $($r.StatusCode)" }
$catalog = $r.Content | ConvertFrom-Json
Write-Host "OK pm catalog -> $($catalog.applications.Count) application(s)"

if ($catalog.applications.Count -gt 0) {
  $app = $catalog.applications[0]
  if ($app.profiles.Count -gt 0) {
    $profile = $app.profiles[0]
    $r = ApiPost $pmToken "/api/forge/build-requests" @{
      applicationId = $app.id
      buildProfileId = $profile.id
      gitReferenceType = "branch"
      gitReference = $app.defaultBranch
      platforms = @("Android")
    }
    if ($r.StatusCode -ne 201) { throw "Build submit failed: $($r.StatusCode) $($r.Content)" }
    $br = ($r.Content | ConvertFrom-Json).buildRequest
    Write-Host "OK build submit -> $($br.id) ($($br.overallStatus))"

    $r = ApiGet $pmToken "/api/forge/build-requests/$($br.id)"
    if ($r.StatusCode -ne 200) { throw "Build detail failed: $($r.StatusCode)" }
    Write-Host "OK build detail -> 200"
  } else {
    Write-Host "SKIP build submit — no profiles in catalog"
  }
} else {
  Write-Host "SKIP build submit — no applications in catalog (run seed)"
}

# Admin runners list
$r = ApiGet $adminToken "/api/forge/runners"
if ($r.StatusCode -ne 200) { throw "Runners list failed: $($r.StatusCode)" }
Write-Host "OK admin runners list -> 200"

Write-Host "Forge smoke passed."
