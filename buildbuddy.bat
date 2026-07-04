@echo off
setlocal EnableDelayedExpansion

:: ════════════════════════════════════════════════════════════════════
::  BuildBuddy — Unified Start / Stop Script
::  Usage:  buildbuddy.bat start    (starts backend + frontend)
::          buildbuddy.bat stop     (kills both services)
::          buildbuddy.bat status   (shows running services)
:: ════════════════════════════════════════════════════════════════════

set "ROOT=%~dp0"
set "PIDFILE_BACKEND=%ROOT%\.backend.pid"
set "PIDFILE_FRONTEND=%ROOT%\.frontend.pid"

:: Ensure Node.js is available
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    :: Fallback to local node path
    if exist "C:\Users\ashis\Downloads\nodejs\node-v20.18.0-win-x64\node.exe" (
        set "PATH=C:\Users\ashis\Downloads\nodejs\node-v20.18.0-win-x64;%PATH%"
    ) else (
        echo ERROR: Node.js not found. Install from https://nodejs.org
        exit /b 1
    )
)

:: Parse command
if "%~1"=="" goto :usage
if /I "%~1"=="start" goto :start
if /I "%~1"=="stop" goto :stop
if /I "%~1"=="status" goto :status
goto :usage

:: ─── START ──────────────────────────────────────────────────────────────────
:start
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   BuildBuddy — Starting Services     ║
echo  ╚══════════════════════════════════════╝
echo.

:: Check if already running
call :check_running
if !BACKEND_RUNNING!==1 (
    echo  [!] Backend already running (PID in .backend.pid^)
    echo      Run "buildbuddy.bat stop" first.
    echo.
    exit /b 1
)

:: Check node_modules
if not exist "%ROOT%node_modules" (
    echo  [1/5] Installing dependencies...
    cd /d "%ROOT%"
    npm install
    if %ERRORLEVEL% NEQ 0 (
        echo  ERROR: npm install failed.
        exit /b 1
    )
) else (
    echo  [1/5] Dependencies OK.
)

:: Check backend .env
if not exist "%ROOT%backend\.env" (
    echo.
    echo  ERROR: backend\.env not found!
    echo  Copy backend\.env.example to backend\.env and fill in your values.
    echo  See SETUP.md for details.
    echo.
    exit /b 1
)

:: Build backend
echo  [2/5] Building backend...
cd /d "%ROOT%"
call npx tsc --project backend\tsconfig.json
if %ERRORLEVEL% NEQ 0 (
    echo  ERROR: Backend TypeScript compilation failed.
    exit /b 1
)
echo        Done.

:: Build MCP server (non-critical)
echo  [3/5] Building MCP server...
call npx tsc --project mcp-server\tsconfig.json 2>nul
if %ERRORLEVEL% EQU 0 (
    echo        Done.
) else (
    echo        Skipped (non-critical^).
)

:: Start backend
echo  [4/5] Starting backend (port 3001^)...
cd /d "%ROOT%"
start "BuildBuddy-Backend" /min cmd /c "node backend\dist\server.js"

:: Give it a moment to grab a PID
timeout /t 2 /nobreak >nul

:: Find the backend PID
for /f "tokens=2" %%a in ('tasklist /fi "WINDOWTITLE eq BuildBuddy-Backend" /fo list ^| findstr /i "PID"') do (
    echo %%a> "%PIDFILE_BACKEND%"
    echo        Backend started (PID %%a^)
)

:: Start frontend
echo  [5/5] Starting frontend (port 3000^)...
cd /d "%ROOT%frontend"
start "BuildBuddy-Frontend" /min cmd /c "npx next dev"

timeout /t 2 /nobreak >nul

for /f "tokens=2" %%a in ('tasklist /fi "WINDOWTITLE eq BuildBuddy-Frontend" /fo list ^| findstr /i "PID"') do (
    echo %%a> "%PIDFILE_FRONTEND%"
    echo        Frontend started (PID %%a^)
)

echo.
echo  ════════════════════════════════════════
echo   All services started!
echo.
echo   Backend:   http://localhost:3001
echo   Frontend:  http://localhost:3000
echo   Health:    http://localhost:3001/health
echo.
echo   Stop with: buildbuddy.bat stop
echo  ════════════════════════════════════════
echo.
goto :eof

:: ─── STOP ───────────────────────────────────────────────────────────────────
:stop
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   BuildBuddy — Stopping Services     ║
echo  ╚══════════════════════════════════════╝
echo.

set "KILLED=0"

:: Kill by window title (most reliable on Windows)
taskkill /fi "WINDOWTITLE eq BuildBuddy-Backend" /t /f >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo  [x] Backend stopped.
    set "KILLED=1"
) else (
    echo  [-] Backend was not running.
)

taskkill /fi "WINDOWTITLE eq BuildBuddy-Frontend" /t /f >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo  [x] Frontend stopped.
    set "KILLED=1"
) else (
    echo  [-] Frontend was not running.
)

:: Also kill any node processes on our ports as fallback
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001.*LISTENING"') do (
    taskkill /pid %%a /t /f >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        echo  [x] Killed process on port 3001 (PID %%a^)
        set "KILLED=1"
    )
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000.*LISTENING"') do (
    taskkill /pid %%a /t /f >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        echo  [x] Killed process on port 3000 (PID %%a^)
        set "KILLED=1"
    )
)

:: Clean up PID files
if exist "%PIDFILE_BACKEND%" del "%PIDFILE_BACKEND%"
if exist "%PIDFILE_FRONTEND%" del "%PIDFILE_FRONTEND%"

echo.
if !KILLED!==1 (
    echo  All services stopped.
) else (
    echo  No BuildBuddy services were running.
)
echo.
goto :eof

:: ─── STATUS ─────────────────────────────────────────────────────────────────
:status
echo.
echo  ╔══════════════════════════════════════╗
echo  ║   BuildBuddy — Service Status        ║
echo  ╚══════════════════════════════════════╝
echo.

set "ANY_RUNNING=0"

:: Check port 3001 (backend)
netstat -aon | findstr ":3001.*LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo  [RUNNING]  Backend   — http://localhost:3001
    set "ANY_RUNNING=1"
) else (
    echo  [STOPPED]  Backend
)

:: Check port 3000 (frontend)
netstat -aon | findstr ":3000.*LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo  [RUNNING]  Frontend  — http://localhost:3000
    set "ANY_RUNNING=1"
) else (
    echo  [STOPPED]  Frontend
)

echo.
if !ANY_RUNNING!==0 (
    echo  No services running. Use "buildbuddy.bat start" to launch.
)
echo.
goto :eof

:: ─── HELPER: check_running ──────────────────────────────────────────────────
:check_running
set "BACKEND_RUNNING=0"
netstat -aon | findstr ":3001.*LISTENING" >nul 2>&1
if %ERRORLEVEL% EQU 0 set "BACKEND_RUNNING=1"
goto :eof

:: ─── USAGE ──────────────────────────────────────────────────────────────────
:usage
echo.
echo  BuildBuddy Service Manager
echo  ─────────────────────────────────────
echo.
echo  Usage:  buildbuddy.bat [command]
echo.
echo  Commands:
echo    start    Install deps, build, and start backend + frontend
echo    stop     Stop all running BuildBuddy services
echo    status   Check which services are currently running
echo.
echo  Examples:
echo    buildbuddy.bat start
echo    buildbuddy.bat stop
echo    buildbuddy.bat status
echo.
goto :eof
