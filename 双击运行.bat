@echo off
title Remote Co-Viewing Launcher

echo ========================================
echo Starting Remote Co-Viewing Server...
echo ========================================

set "SYNC_CINEMA_MPV_PATH=C:\Tools\mpv\mpv.exe"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [Error] Node.js is not installed!
    echo Please download and install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Starting app and launching browser, please wait...
call npm start

if %errorlevel% neq 0 (
    echo [Error] Failed to start. Please check the errors above.
    pause
)
