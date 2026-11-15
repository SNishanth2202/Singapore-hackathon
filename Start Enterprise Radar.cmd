@echo off
setlocal
title Singtel Scout
cd /d "%~dp0"
where node.exe >nul 2>&1
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    "%ProgramFiles%\nodejs\node.exe" "%~dp0scripts\start-desktop.cjs"
  ) else (
    echo Node.js is required. Install Node.js, then try again.
    pause
    exit /b 1
  )
) else (
  node.exe "%~dp0scripts\start-desktop.cjs"
)
if errorlevel 1 (
  echo.
  echo The project could not start. Review the message above.
  pause
)
