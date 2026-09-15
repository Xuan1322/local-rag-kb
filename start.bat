@echo off
chcp 65001 >nul
title RAG KB - 本地轻量知识库
echo ============================================
echo   本地轻量 RAG 知识库 — 一键启动
echo ============================================
echo.

cd /d "%~dp0"

REM 检查虚拟环境
if not exist ".venv\Scripts\python.exe" (
    echo [错误] 未找到 .venv 虚拟环境，请先执行：
    echo   python -m venv .venv
    echo   .venv\Scripts\python.exe -m pip install -r backend\requirements.txt
    pause
    exit /b 1
)

REM 检查前端依赖
if not exist "frontend\node_modules" (
    echo [提示] 前端依赖未安装，正在安装...
    cd frontend
    call npm install
    cd ..
)

echo [1/2] 启动后端 (localhost:8765)...
start "RAG KB Backend" cmd /k ".venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8765"

REM 等后端启动
timeout /t 2 /nobreak >nul

echo [2/2] 启动前端 (localhost:5173)...
start "RAG KB Frontend" cmd /k "cd frontend && npx vite --host 127.0.0.1 --port 5173"

echo.
echo ============================================
echo   ✅ 启动完成！
echo   打开浏览器访问：http://localhost:5173
echo   设置页配置 API Key：http://localhost:5173/settings
echo   搜索测试：http://localhost:5173/search
echo ============================================
echo.
echo 关闭此窗口不会停止服务，关闭对应的 cmd 窗口即可停止。
pause
