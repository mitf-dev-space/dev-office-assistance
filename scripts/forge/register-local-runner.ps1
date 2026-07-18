#requires -Version 7.0
<#
.SYNOPSIS
  Create a local Windows Android Forge runner and write agent.env for the worker.
.PARAMETER ApiBase
  Helm API URL (default http://localhost:4000)
#>
param(
  [string]$ApiBase = "http://localhost:4000",
  [string]$RunnerName = "local-windows-android"
)

$ErrorActionPreference = "Stop"

function Login([string]$Email, [string]$Password) {
  $res = Invoke-WebRequest -Uri "$ApiBase/api/auth/login" -Method POST `
    -ContentType "application/json" `
    -Body (@{ email = $Email; password = $Password } | ConvertTo-Json) `
    -SkipHttpErrorCheck
  if ($res.StatusCode -ne 200) { throw "Login failed: $($res.StatusCode)" }
  ($res.Content | ConvertFrom-Json).token
}

Write-Host "Registering Forge runner at $ApiBase"
$pw = if ($env:SEED_FORGE_MOBILE_LEAD_PASSWORD) { $env:SEED_FORGE_MOBILE_LEAD_PASSWORD } elseif ($env:SEED_FORGE_ADMIN_PASSWORD) { $env:SEED_FORGE_ADMIN_PASSWORD } else { "ForgeMobileLead1!" }
$token = Login "forge-mobile-lead@local.dev" $pw

$body = @{
  name = $RunnerName
  operatingSystem = "Windows"
  architecture = "x64"
  supportedPlatforms = @("Android")
  maximumConcurrentJobs = 1
} | ConvertTo-Json

$res = Invoke-WebRequest -Uri "$ApiBase/api/forge/runners" -Method POST `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body $body `
  -SkipHttpErrorCheck

if ($res.StatusCode -eq 409) {
  Write-Host "Runner '$RunnerName' already exists. Create a new name or delete the old runner in admin."
  exit 1
}
if ($res.StatusCode -ne 201) {
  throw "Create runner failed: $($res.StatusCode) $($res.Content)"
}

$data = $res.Content | ConvertFrom-Json
$agentDir = Join-Path $env:USERPROFILE ".forge"
New-Item -ItemType Directory -Force -Path $agentDir | Out-Null
$agentFile = Join-Path $agentDir "agent.env"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$workspacesRoot = Join-Path $repoRoot "data\forge-workspaces"
New-Item -ItemType Directory -Force -Path $workspacesRoot | Out-Null

@"
FORGE_API_URL=$ApiBase
FORGE_RUNNER_ID=$($data.runner.id)
FORGE_RUNNER_TOKEN=$($data.token)
FORGE_WORKSPACES_ROOT=$workspacesRoot
"@ | Set-Content -Path $agentFile -Encoding utf8

Write-Host "Runner registered: $($data.runner.name) ($($data.runner.id))"
Write-Host "Token hint: $($data.runner.tokenHint)"
Write-Host "Agent env written to: $agentFile"
Write-Host ""
Write-Host "Start worker:"
Write-Host "  cd dev-office-assistance"
Write-Host "  Get-Content `$env:USERPROFILE\.forge\agent.env | ForEach-Object { if (`$_ -match '^([^#=]+)=(.*)$') { Set-Item env:`$matches[1] `$matches[2] } }"
Write-Host "  npm run forge:worker"
