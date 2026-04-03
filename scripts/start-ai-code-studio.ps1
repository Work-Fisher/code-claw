param(
  [switch]$ForceBuild
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$uiDir = Join-Path $root 'ai-code-studio'
$distDir = Join-Path $uiDir 'dist'
$uiPort = if ($env:CLAW_UI_PORT) { $env:CLAW_UI_PORT } else { '8891' }
$electronCmd = Join-Path $root 'node_modules\.bin\electron.cmd'

if ($ForceBuild -or -not (Test-Path $distDir)) {
  Push-Location $uiDir
  try {
    if (-not (Test-Path (Join-Path $uiDir 'node_modules'))) {
      npm install
    }
    npm run build
  }
  finally {
    Pop-Location
  }
}

$env:CLAW_UI_PUBLIC_DIR = $distDir
$env:CLAW_UI_PORT = $uiPort

Set-Location $root

if (Test-Path $electronCmd) {
  Write-Host "claw-code desktop starting..."
  & $electronCmd .\desktop\main.mjs
}
else {
  Write-Host "Electron not found, falling back to browser mode at http://127.0.0.1:$uiPort"
  Start-Process "http://127.0.0.1:$uiPort"
  node .\tools\claw-launcher-ui\server.mjs
}
