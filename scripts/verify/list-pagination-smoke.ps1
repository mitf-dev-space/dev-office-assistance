#requires -Version 7.0
<#
.SYNOPSIS
  Helm list API pagination + search smoke tests (core + Forge).
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

function Assert-PageMeta($Json, [string]$ItemsKey) {
  if ($null -eq $Json.page) { throw "Missing page on $ItemsKey response" }
  if ($null -eq $Json.limit) { throw "Missing limit on $ItemsKey response" }
  if ($null -eq $Json.total) { throw "Missing total on $ItemsKey response" }
  if ($null -eq $Json.totalPages) { throw "Missing totalPages on $ItemsKey response" }
  if ($null -eq $Json.$ItemsKey) { throw "Missing $ItemsKey array" }
}

Write-Host "List pagination smoke — API $ApiBase"

$assistantToken = Login "assistant@local.dev" "ChangeMe!Asst1"
$adminToken = Login "forge-admin@local.dev" "ForgeAdmin1!"

$coreEndpoints = @(
  @{ Path = "/api/triage-items?page=1&limit=5"; Key = "items" },
  @{ Path = "/api/triage-items/priority-queue?page=1&limit=5"; Key = "items" },
  @{ Path = "/api/planning?page=1&limit=5"; Key = "items" },
  @{ Path = "/api/developers?page=1&limit=5"; Key = "developers" },
  @{ Path = "/api/team-memberships?page=1&limit=5"; Key = "memberships" },
  @{ Path = "/api/expenses?page=1&limit=5"; Key = "expenses" },
  @{ Path = "/api/decisions?page=1&limit=5"; Key = "decisions" }
)

foreach ($ep in $coreEndpoints) {
  $r = ApiGet $assistantToken $ep.Path
  if ($r.StatusCode -ne 200) { throw "$($ep.Path) failed: $($r.StatusCode) $($r.Content)" }
  $json = $r.Content | ConvertFrom-Json
  Assert-PageMeta $json $ep.Key
  Write-Host "OK $($ep.Path) -> total=$($json.total) page=$($json.page)/$($json.totalPages)"
}

# Search filter (should still return page meta)
$r = ApiGet $assistantToken "/api/triage-items?page=1&limit=5&q=test"
if ($r.StatusCode -ne 200) { throw "triage search failed: $($r.StatusCode)" }
$j = $r.Content | ConvertFrom-Json
Assert-PageMeta $j "items"
Write-Host "OK triage search q=test -> total=$($j.total)"

# Limit clamp
$r = ApiGet $assistantToken "/api/developers?page=1&limit=999"
$j = $r.Content | ConvertFrom-Json
if ($j.limit -gt 500) { throw "developers limit should clamp to 500, got $($j.limit)" }
Write-Host "OK developers limit clamp -> limit=$($j.limit)"

$forgeEndpoints = @(
  @{ Path = "/api/forge/build-requests?page=1&limit=5"; Key = "items"; Token = $adminToken },
  @{ Path = "/api/forge/banks?page=1&limit=5"; Key = "items"; Token = $adminToken },
  @{ Path = "/api/forge/applications?page=1&limit=5"; Key = "items"; Token = $adminToken },
  @{ Path = "/api/forge/build-profiles?page=1&limit=5"; Key = "items"; Token = $adminToken },
  @{ Path = "/api/forge/runners?page=1&limit=5"; Key = "items"; Token = $adminToken }
)

$pmToken = Login "a.almesbahi@masarat.ly" "ForgePm1!"
$r = ApiGet $pmToken "/api/forge/build-requests?page=1&limit=5&q=dev"
if ($r.StatusCode -ne 200) { throw "forge build search failed: $($r.StatusCode)" }
$j = $r.Content | ConvertFrom-Json
Assert-PageMeta $j "items"
Write-Host "OK forge build-requests search -> total=$($j.total)"

foreach ($ep in $forgeEndpoints) {
  $r = ApiGet $ep.Token $ep.Path
  if ($r.StatusCode -ne 200) { throw "$($ep.Path) failed: $($r.StatusCode) $($r.Content)" }
  $json = $r.Content | ConvertFrom-Json
  Assert-PageMeta $json $ep.Key
  Write-Host "OK $($ep.Path) -> total=$($json.total)"
}

Write-Host "All list pagination smoke checks passed."
