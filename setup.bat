@echo off
echo.
echo ========================================================
echo    Philosophy Series Engine — Setup
echo ========================================================
echo.

REM ── 1. Check Node.js ──────────────────────────────────
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is NOT installed!
    echo.
    echo    Please download and install Node.js v18+ from:
    echo    https://nodejs.org/
    echo.
    echo    After installing, RESTART this terminal and re-run setup.bat
    echo.
    pause
    exit /b 1
)

for /f "tokens=1 delims=v" %%a in ('node -v') do set NODE_VER=%%a
echo [OK] Node.js detected: 
node -v

REM ── 2. Check npm ──────────────────────────────────────
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not installed. It should come with Node.js.
    pause
    exit /b 1
)
echo [OK] npm detected

REM ── 3. Install dependencies ───────────────────────────
echo.
echo Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm install failed!
    pause
    exit /b 1
)
echo [OK] Dependencies installed

REM ── 4. Setup environment variables ────────────────────
if not exist .env.local (
    echo.
    echo Setting up environment variables...
    echo.
    
    set /p SUPABASE_URL="Enter your Supabase Project URL (e.g., https://xxx.supabase.co): "
    set /p SUPABASE_ANON_KEY="Enter your Supabase Anon Key: "
    set /p SUPABASE_SERVICE_KEY="Enter your Supabase Service Role Key (optional, press Enter to skip): "

    (
        echo # Supabase
        echo NEXT_PUBLIC_SUPABASE_URL=%SUPABASE_URL%
        echo NEXT_PUBLIC_SUPABASE_ANON_KEY=%SUPABASE_ANON_KEY%
        echo SUPABASE_SERVICE_ROLE_KEY=%SUPABASE_SERVICE_KEY%
    ) > .env.local

    echo.
    echo [OK] .env.local created
) else (
    echo.
    echo [OK] .env.local already exists, skipping
)

REM ── 5. Start dev server ──────────────────────────────
echo.
echo ========================================================
echo    Starting dev server...
echo    Open http://localhost:3000 in your browser
echo ========================================================
echo.
call npm run dev
