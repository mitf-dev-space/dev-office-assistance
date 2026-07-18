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
$mobileLeadPassword = if ($env:SEED_FORGE_MOBILE_LEAD_PASSWORD) {
  $env:SEED_FORGE_MOBILE_LEAD_PASSWORD
} elseif ($env:SEED_FORGE_ADMIN_PASSWORD) {
  $env:SEED_FORGE_ADMIN_PASSWORD
} else {
  "ForgeMobileLead1!"
}
$mobileLeadToken = Login "forge-mobile-lead@local.dev" $mobileLeadPassword

# Negative: assistant denied dashboard
$r = ApiGet $assistantToken "/api/forge/dashboard"
if ($r.StatusCode -ne 403) { throw "Expected 403 for assistant dashboard, got $($r.StatusCode)" }
Write-Host "OK assistant dashboard -> 403"

# Mobile lead dashboard
$r = ApiGet $mobileLeadToken "/api/forge/dashboard"
if ($r.StatusCode -ne 200) { throw "Mobile lead dashboard failed: $($r.StatusCode)" }
$dash = $r.Content | ConvertFrom-Json
if ($dash.moduleStatus -notin @("bootstrap", "loop5", "loop10")) { throw "Unexpected moduleStatus: $($dash.moduleStatus)" }
Write-Host "OK mobile lead dashboard -> 200 (moduleStatus=$($dash.moduleStatus))"

# Mobile lead banks list (admin)
$r = ApiGet $mobileLeadToken "/api/forge/banks"
if ($r.StatusCode -ne 200) { throw "Mobile lead banks list failed: $($r.StatusCode)" }
$banks = ($r.Content | ConvertFrom-Json).items
Write-Host "OK mobile lead banks list -> $($banks.Count) bank(s)"

# Create bank
$code = "TST" + (Get-Random -Maximum 9999)
$r = ApiPost $mobileLeadToken "/api/forge/banks" @{ name = "Smoke Test Bank"; code = $code; isActive = $true }
if ($r.StatusCode -ne 201) { throw "Create bank failed: $($r.StatusCode) $($r.Content)" }
$created = ($r.Content | ConvertFrom-Json).bank
Write-Host "OK create bank -> $($created.code)"

# Duplicate code -> 409
$r = ApiPost $mobileLeadToken "/api/forge/banks" @{ name = "Dup"; code = $code; isActive = $true }
if ($r.StatusCode -ne 409) { throw "Expected 409 duplicate, got $($r.StatusCode)" }
Write-Host "OK duplicate bank -> 409"

# Toggle inactive + shared path
$r = ApiPut $mobileLeadToken "/api/forge/banks/$($created.id)" @{
  isActive = $false
  sharedDeliveryPath = "D:\forge-shared-smoke\$code"
}
if ($r.StatusCode -ne 200) { throw "Update bank failed: $($r.StatusCode) $($r.Content)" }
Write-Host "OK update bank -> inactive + sharedDeliveryPath"

# Catalog
$r = ApiGet $mobileLeadToken "/api/forge/catalog"
if ($r.StatusCode -ne 200) { throw "Catalog failed: $($r.StatusCode)" }
$catalog = $r.Content | ConvertFrom-Json
Write-Host "OK catalog -> $($catalog.applications.Count) application(s)"

if ($catalog.applications.Count -gt 0) {
  $app = $catalog.applications[0]
  if ($app.profiles.Count -gt 0) {
    $profile = $app.profiles[0]
    $r = ApiPost $mobileLeadToken "/api/forge/build-requests" @{
      applicationId = $app.id
      buildProfileId = $profile.id
      gitReferenceType = "branch"
      gitReference = $app.defaultBranch
      platforms = @("Android")
      publishToSharedFolder = $false
    }
    if ($r.StatusCode -ne 201) { throw "Build submit failed: $($r.StatusCode) $($r.Content)" }
    $br = ($r.Content | ConvertFrom-Json).buildRequest
    Write-Host "OK build submit -> $($br.id) ($($br.overallStatus))"

    $r = ApiGet $mobileLeadToken "/api/forge/build-requests/$($br.id)"
    if ($r.StatusCode -ne 200) { throw "Build detail failed: $($r.StatusCode)" }
    Write-Host "OK build detail -> 200"
  } else {
    Write-Host "SKIP build submit — no profiles in catalog"
  }
} else {
  Write-Host "SKIP build submit — no applications in catalog (run seed)"
}

# Runners list
$r = ApiGet $mobileLeadToken "/api/forge/runners"
if ($r.StatusCode -ne 200) { throw "Runners list failed: $($r.StatusCode)" }
Write-Host "OK runners list -> 200"

Write-Host "Forge smoke passed."
