@echo off
setlocal
cd /d "%~dp0"
title Code-Claw Launcher

echo.
echo   ========================================
echo     Code-Claw (小龙虾) 🦞
echo     本地 AI 编程助手
echo   ========================================
echo.

:: Check Node.js
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed.
  echo Please install Node.js 22+ from https://nodejs.org/
  pause
  exit /b 1
)

:: Install dependencies if needed
if not exist "node_modules\.bin\electron.cmd" (
  echo [INFO] First time setup - installing dependencies...
  echo.
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
  echo.
  echo [INFO] Installing frontend dependencies...
  cd ai-code-studio
  call npm install
  if errorlevel 1 (
    echo [ERROR] Frontend npm install failed.
    cd ..
    pause
    exit /b 1
  )
  echo.
  echo [INFO] Building frontend...
  call npm run build
  cd ..
  echo.
  echo [OK] Setup complete!
  echo.
)

:: Launch
echo [INFO] Starting Code-Claw...
.\node_modules\.bin\electron.cmd .\desktop\main.mjs
