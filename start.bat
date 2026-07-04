@echo off
echo ============================================
echo   BuildBuddy MVP - Setup and Start
echo ============================================
echo.

:: Set Node path
set PATH=C:\Users\ashis\Downloads\nodejs\node-v20.18.0-win-x64;%PATH%

:: Check node
echo [1/4] Checking Node.js...
node --version
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

:: Install deps if needed
if not exist "node_modules" (
    echo [2/4] Installing dependencies...
    npm install
) else (
    echo [2/4] Dependencies already installed.
)

:: Build backend
echo [3/4] Building backend...
node node_modules\typescript\bin\tsc --project backend\tsconfig.json
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: TypeScript compilation failed. See errors above.
    pause
    exit /b 1
)
echo     Backend built successfully.

:: Check .env
if not exist "backend\.env" (
    echo.
    echo ============================================
    echo   SETUP NEEDED: Create backend\.env
    echo ============================================
    echo.
    echo Copy backend\.env.example to backend\.env and fill in:
    echo   ORACLE_PRIVATE_KEY=0xYourKey
    echo   REGISTRY_CONTRACT_ADDRESS=0xDeployedAddress
    echo.
    echo Get free MON from https://faucet.monad.xyz
    echo Deploy contracts with: forge script script/Deploy.s.sol:Deploy --rpc-url https://testnet-rpc.monad.xyz --broadcast --private-key 0xYourKey
    echo.
    pause
    exit /b 1
)

:: Start
echo [4/4] Starting backend...
echo.
node backend\dist\server.js
