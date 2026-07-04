@echo off
set PATH=C:\Users\ashis\Downloads\nodejs\node-v20.18.0-win-x64;%PATH%
cd /d C:\Users\ashis\Downloads\buildbuddy\BuildBuddy

echo === Node Version === > build-log.txt
node --version >> build-log.txt 2>&1

echo === TypeScript Check Backend === >> build-log.txt
node node_modules\typescript\bin\tsc --project backend\tsconfig.json --noEmit >> build-log.txt 2>&1
if %ERRORLEVEL% EQU 0 (
    echo BACKEND: OK >> build-log.txt
) else (
    echo BACKEND: ERRORS >> build-log.txt
)

echo === TypeScript Check MCP === >> build-log.txt
node node_modules\typescript\bin\tsc --project mcp-server\tsconfig.json --noEmit >> build-log.txt 2>&1
if %ERRORLEVEL% EQU 0 (
    echo MCP: OK >> build-log.txt
) else (
    echo MCP: ERRORS >> build-log.txt
)

echo === DONE === >> build-log.txt
