@echo off
setlocal
cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE="

set "ELECTRON_EXE=node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON_EXE%" (
    echo [Error] SyncCinema is incomplete: %ELECTRON_EXE% is missing.
    pause
    exit /b 1
)

start "SyncCinema" /wait "%ELECTRON_EXE%" "electron\main.js"
exit /b %errorlevel%
