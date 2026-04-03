param(
  [Parameter(Mandatory = $true)]
  [string]$UpstreamBaseUrl,

  [Parameter(Mandatory = $false)]
  [string]$UpstreamApiKey = "",

  [Parameter(Mandatory = $false)]
  [string]$UpstreamModel = "",

  [Parameter(Mandatory = $false)]
  [string]$WorkspaceDir = (Get-Location).Path,

  [Parameter(Mandatory = $false)]
  [int]$GatewayPort = 8787,

  [Parameter(Mandatory = $false)]
  [switch]$AutoApproveShell
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$gatewayScript = Join-Path $root "tools\model-gateway\server.mjs"
$cliScript = Join-Path $root "compatible-shell\src\cli.mjs"

Write-Host "Starting compatible shell..."
Write-Host "Workspace: $WorkspaceDir"
Write-Host "Gateway: http://127.0.0.1:$GatewayPort"
Write-Host "Upstream: $UpstreamBaseUrl"

$gatewayJob = Start-Job -ScriptBlock {
  param($GatewayScriptPath, $BaseUrl, $ApiKey, $Model, $Port)

  $env:OPENAI_COMPAT_BASE_URL = $BaseUrl
  $env:OPENAI_COMPAT_API_KEY = $ApiKey
  $env:OPENAI_COMPAT_MODEL = $Model
  $env:GATEWAY_HOST = "127.0.0.1"
  $env:GATEWAY_PORT = [string]$Port

  node $GatewayScriptPath
} -ArgumentList $gatewayScript, $UpstreamBaseUrl, $UpstreamApiKey, $UpstreamModel, $GatewayPort

try {
  $healthUrl = "http://127.0.0.1:$GatewayPort/health"
  $ready = $false

  for ($i = 0; $i -lt 50; $i++) {
    Start-Sleep -Milliseconds 200

    if ($gatewayJob.State -match "Failed|Stopped|Completed") {
      throw "Gateway job exited early."
    }

    try {
      $response = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 2
      if ($response.ok) {
        $ready = $true
        break
      }
    } catch {
    }
  }

  if (-not $ready) {
    throw "Gateway did not become healthy in time."
  }

  $env:ANTHROPIC_BASE_URL = "http://127.0.0.1:$GatewayPort"
  $env:ANTHROPIC_API_KEY = "dummy"

  $arguments = @($cliScript, "--cwd", $WorkspaceDir)
  if ($AutoApproveShell) {
    $arguments += "--auto-approve-shell"
  }

  Write-Host ""
  Write-Host "Compatible shell is ready."
  Write-Host "Press Ctrl+C to exit."
  Write-Host ""

  node @arguments
}
finally {
  if ($gatewayJob) {
    Stop-Job $gatewayJob -ErrorAction SilentlyContinue | Out-Null
    Receive-Job $gatewayJob -ErrorAction SilentlyContinue | Out-Null
    Remove-Job $gatewayJob -Force -ErrorAction SilentlyContinue | Out-Null
  }
}
