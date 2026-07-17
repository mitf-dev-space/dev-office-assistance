#requires -Version 7.0
<#
.SYNOPSIS
  Forge module — Windows prerequisite audit (Helm / dev-office-assistance).
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-CommandExists {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-VersionOutput {
    param([string]$Command, [string[]]$Args = @('--version'))
    try {
        $output = & $Command @Args 2>&1 | Select-Object -First 1
        return [string]$output
    } catch {
        return $null
    }
}

Write-Host 'Forge — Windows prerequisite check' -ForegroundColor Cyan
Write-Host ('OS: {0}' -f [System.Environment]::OSVersion.VersionString)
Write-Host ''

$checks = @(
    @{ Label = 'Node.js';     Command = 'node';    Required = $true }
    @{ Label = 'npm';         Command = 'npm';     Required = $true }
    @{ Label = 'Docker';      Command = 'docker';  Required = $true }
    @{ Label = 'Git';         Command = 'git';     Required = $true }
    @{ Label = '.NET SDK';    Command = 'dotnet';  Required = $false }
    @{ Label = 'Java';        Command = 'java';    Required = $false }
    @{ Label = 'Flutter';     Command = 'flutter'; Required = $false }
    @{ Label = 'Android SDK'; Command = 'adb';     Required = $false }
)

$missingRequired = @()

foreach ($check in $checks) {
    $exists = Test-CommandExists -Name $check.Command
    $version = if ($exists) { Get-VersionOutput -Command $check.Command } else { $null }
    $status = if ($exists) { 'OK' } else { if ($check.Required) { 'MISSING (required)' } else { 'MISSING (optional)' } }
    $color = if ($exists) { 'Green' } elseif ($check.Required) { 'Red' } else { 'Yellow' }

    Write-Host ('[{0}] {1}' -f $status, $check.Label) -ForegroundColor $color
    if ($version) { Write-Host ('      {0}' -f $version) }

    if (-not $exists -and $check.Required) { $missingRequired += $check.Label }
}

Write-Host ''
Write-Host 'Helm portal: npm run dev (web :5173, API :4000)' -ForegroundColor Cyan
Write-Host 'Optional Mailpit: docker compose --profile forge-dev up -d mailpit'

if ($missingRequired.Count -gt 0) {
    Write-Host ('Missing required: {0}' -f ($missingRequired -join ', ')) -ForegroundColor Red
    exit 1
}

Write-Host 'All required Helm/Forge portal tools detected.' -ForegroundColor Green
exit 0
