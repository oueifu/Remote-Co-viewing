@echo off
title Remote Co-Viewing
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js 环境！
    echo 请先前往 https://nodejs.org/ 下载安装 Node.js (推荐 LTS 版本)。
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo 正在首次初始化依赖，请稍候...
    call npm install --no-audit --no-fund
)

if exist "node_modules\electron" (
    echo 正在启动桌面客户端...
    start "" npx electron electron/main.js
) else (
    echo 正在启动本地同步服务并打开浏览器...
    call npm start
)
