param(
  [Parameter(Mandatory = $true)]
  [string]$UpstreamBaseUrl,

  [Parameter(Mandatory = $true)]
  [string]$UpstreamModel,

  [string]$UpstreamApiKey = '',

  [string]$RecoveredModel = '',

  [string]$GatewayHost = '127.0.0.1',

  [int]$GatewayPort = 8787,

  [switch]$Bare = $true,

  [string]$Prompt = '',

  [ValidateSet('text', 'json', 'stream-json')]
  [string]$OutputFormat = 'text',

  [string[]]$CliArgs = @()
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$recoveredDir = Join-Path $root 'recovered-claude-code'
$gatewayUrl = "http://${GatewayHost}:${GatewayPort}"

if (-not $RecoveredModel) {
  $RecoveredModel = $UpstreamModel
}

$gatewayJob = Start-Job -ScriptBlock {
  param($root, $baseUrl, $apiKey, $model, $gatewayHostValue, $gatewayPortValue)
  Set-Location $root
  $env:OPENAI_COMPAT_BASE_URL = $baseUrl
  $env:OPENAI_COMPAT_API_KEY = $apiKey
  $env:OPENAI_COMPAT_MODEL = $model
  $env:GATEWAY_HOST = $gatewayHostValue
  $env:GATEWAY_PORT = [string]$gatewayPortValue
  node .\tools\model-gateway\server.mjs
} -ArgumentList $root, $UpstreamBaseUrl, $UpstreamApiKey, $UpstreamModel, $GatewayHost, $GatewayPort

try {
  $gatewayReady = $false
  for ($i = 0; $i -lt 20; $i++) {
    try {
      Invoke-WebRequest "$gatewayUrl/health" -UseBasicParsing | Out-Null
      $gatewayReady = $true
      break
    }
    catch {
      Start-Sleep -Seconds 1
    }
  }

  if (-not $gatewayReady) {
    $gatewayLogs = Receive-Job $gatewayJob -Keep -ErrorAction SilentlyContinue | Out-String
    throw "Gateway did not become healthy at $gatewayUrl`n$gatewayLogs"
  }

  Write-Host "Gateway ready at $gatewayUrl"

  $env:ANTHROPIC_BASE_URL = $gatewayUrl
  $env:ANTHROPIC_API_KEY = if ($UpstreamApiKey) { $UpstreamApiKey } else { 'dummy' }
  $env:CLAUDE_CODE_DISABLE_BOOTSTRAP_FETCH = '1'

  $argsToRun = @()
  if ($Bare) {
    $argsToRun += '--bare'
  }
  $argsToRun += '--model'
  $argsToRun += $RecoveredModel

  if ($Prompt) {
    $argsToRun += '-p'
    if ($OutputFormat -ne 'text') {
      $argsToRun += '--output-format'
      $argsToRun += $OutputFormat
    }
    $argsToRun += $Prompt
  }

  if ($CliArgs) {
    $argsToRun += $CliArgs
  }

  Set-Location $recoveredDir
  $env:TS_NODE_TRANSPILE_ONLY = '1'
  & node `
    --loader ts-node/esm `
    --import ./src/shims/runtime.mjs `
    ./src/entrypoints/cli.tsx `
    @argsToRun

  exit $LASTEXITCODE
}
finally {
  if ($gatewayJob) {
    Stop-Job $gatewayJob -ErrorAction SilentlyContinue
    Remove-Job $gatewayJob -Force -ErrorAction SilentlyContinue
  }
}
