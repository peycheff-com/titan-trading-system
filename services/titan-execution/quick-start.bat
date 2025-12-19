@echo off
REM Titan Execution - Quick Start Script (Windows)
REM This script automates the initial setup and deployment

echo.
echo 🚀 Titan Execution - Quick Start
echo ================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Error: Node.js not found
    echo    Install from: https://nodejs.org/
    pause
    exit /b 1
)

echo 📋 Checking Node.js version...
node -v
echo ✅ Node.js detected
echo.

REM Check if .env exists
if not exist .env (
    echo ❌ Error: .env file not found
    echo    Please configure .env file first
    pause
    exit /b 1
)
echo ✅ .env file found
echo.

REM Install dependencies
echo 📦 Installing dependencies...
if not exist node_modules (
    call npm install
    echo ✅ Dependencies installed
) else (
    echo ✅ Dependencies already installed
)
echo.

REM Initialize database
echo 💾 Initializing database...
if not exist titan_execution.db (
    call npm run migrate
    echo ✅ Database initialized
) else (
    echo ⚠️  Database already exists. Running migrations...
    call npm run migrate
    echo ✅ Migrations complete
)
echo.

REM Display configuration summary
echo 📊 Configuration Summary
echo ========================
findstr /B "PORT=" .env
findstr /B "NODE_ENV=" .env
findstr /B "DATABASE_URL=" .env
findstr /B "MAX_RISK_PCT=" .env
echo.

REM Ask if user wants to start the server
echo 🎯 Ready to start!
echo.
echo Options:
echo   1. Start production server (web UI)
echo   2. Start full server (terminal dashboard + web UI)
echo   3. Exit and start manually
echo.
set /p choice="Choose option (1-3): "

if "%choice%"=="1" (
    echo.
    echo 🚀 Starting production server...
    echo.
    echo 📱 Web UI will be available at: http://localhost:3000
    echo.
    echo Press Ctrl+C to stop the server
    echo.
    timeout /t 2 >nul
    call npm start
) else if "%choice%"=="2" (
    echo.
    echo 🚀 Starting full server...
    echo.
    echo 📱 Web UI: http://localhost:3000
    echo 💻 Terminal Dashboard: Active
    echo.
    echo Press Ctrl+C to stop the server
    echo.
    timeout /t 2 >nul
    call npm run start:full
) else if "%choice%"=="3" (
    echo.
    echo ✅ Setup complete!
    echo.
    echo To start the server manually:
    echo   npm start              # Production server (web UI)
    echo   npm run start:full     # Full server (terminal + web UI)
    echo.
    echo 📚 Read DEPLOYMENT-GUIDE.md for detailed instructions
    pause
) else (
    echo Invalid option. Exiting.
    pause
    exit /b 1
)
