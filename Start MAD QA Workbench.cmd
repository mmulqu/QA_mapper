@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local-workbench.ps1"
if errorlevel 1 (
  echo.
  echo The MAD QA Workbench could not start. See the message above.
  pause
)
