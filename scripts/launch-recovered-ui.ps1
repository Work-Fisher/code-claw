param(
  [string]$UiHost = "127.0.0.1",
  [int]$Port = 8891
)

$root = Split-Path -Parent $PSScriptRoot
$serverScript = Join-Path $root "tools\recovered-launcher-ui\server.mjs"

$encodedCommand = @"
`$env:RECOVERED_UI_HOST='$UiHost'
`$env:RECOVERED_UI_PORT='$Port'
Set-Location '$root'
node '$serverScript'
"@

Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy",
  "Bypass",
  "-Command",
  $encodedCommand
)

Start-Sleep -Milliseconds 1200
Start-Process "http://$UiHost`:$Port"
