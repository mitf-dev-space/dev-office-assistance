#requires -Version 7.0
<#
.SYNOPSIS
  Smoke-test Helm workspace AI settings + assist status (local API).
#>
param(
  [string]$BaseUrl = "http://localhost:4000",
  [string]$Email = "lead@local.dev",
  [string]$Password = "lead"
)

$ErrorActionPreference = "Stop"

$login = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/auth/login" -ContentType "application/json" -Body (@{
  email = $Email
  password = $Password
} | ConvertTo-Json)

$token = $login.token ?? $login.accessToken
if (-not $token) { throw "login_failed: no token" }
$headers = @{ Authorization = "Bearer $token" }

$settings = Invoke-RestMethod -Method GET -Uri "$BaseUrl/api/settings/llm" -Headers $headers
Write-Host "LLM enabled=$($settings.enabled) preset=$($settings.providerPreset) model=$($settings.model) hasKey=$($settings.hasApiKey)"

$status = Invoke-RestMethod -Method GET -Uri "$BaseUrl/api/assist/status" -Headers $headers
Write-Host "Assist enabled=$($status.enabled) billing=$($status.billingSource) remaining=$($status.usage.remaining)"

$test = Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/settings/llm/test" -Headers $headers
Write-Host "Test ok=$($test.ok) latencyMs=$($test.latencyMs) error=$($test.error)"

if (-not $test.ok) { exit 1 }
Write-Host "ai-assist-smoke: OK"
