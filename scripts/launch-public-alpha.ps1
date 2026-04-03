param()

$ErrorActionPreference = "Stop"

function Read-RequiredValue {
  param(
    [string]$Prompt,
    [string]$DefaultValue = ""
  )

  while ($true) {
    if ($DefaultValue) {
      $value = Read-Host "$Prompt [$DefaultValue]"
      if ([string]::IsNullOrWhiteSpace($value)) {
        $value = $DefaultValue
      }
    } else {
      $value = Read-Host $Prompt
    }

    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value
    }
  }
}

$root = Split-Path -Parent $PSScriptRoot
$startScript = Join-Path $PSScriptRoot "start-compat-shell.ps1"

Write-Host "Compatible Agent Shell Alpha Launcher"
Write-Host ""
Write-Host "This is a Claude-inspired compatible alpha shell."
Write-Host "It is not the official Anthropic client."
Write-Host ""

$baseUrl = Read-RequiredValue -Prompt "OpenAI-compatible base URL"
$apiKey = Read-Host "API key (leave blank if your endpoint does not need one)"
$model = Read-Host "Model name (optional)"
$workspace = Read-RequiredValue -Prompt "Workspace directory" -DefaultValue $root
$autoApprove = Read-Host "Auto approve shell commands? (y/N)"

$arguments = @(
  "-ExecutionPolicy", "Bypass",
  "-File", $startScript,
  "-UpstreamBaseUrl", $baseUrl,
  "-UpstreamApiKey", $apiKey,
  "-UpstreamModel", $model,
  "-WorkspaceDir", $workspace
)

if ($autoApprove -match '^(y|yes)$') {
  $arguments += "-AutoApproveShell"
}

powershell @arguments
