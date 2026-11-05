@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Khong tim thay Node.js trong PATH.
  pause
  exit /b 1
)
where mongosh >nul 2>&1
if errorlevel 1 (
  echo Khong tim thay mongosh trong PATH.
  pause
  exit /b 1
)
node server.mjs
pause
