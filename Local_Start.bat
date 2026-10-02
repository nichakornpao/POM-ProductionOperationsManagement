@echo off
SETLOCAL EnableDelayedExpansion

:: --- Sub-process routing ---
if "%~1"=="--backend" goto :RUN_BACKEND
if "%~1"=="--frontend" goto :RUN_FRONTEND

:: =============================================
::   MAIN SCRIPT (MONITOR)
:: =============================================
title POM-Local-Monitor
set "SELF=%~f0"
set "BACKEND_PATH=%~dp0backend"
set "FRONTEND_PATH=%~dp0frontend"
set "BACKEND_PORT=3000"
set "FRONTEND_PORT=9696"

echo ======================================================
echo   POM Project Startup
echo ======================================================
echo.

echo [1/3] Checking Directories...
if not exist "%BACKEND_PATH%" (echo Error: Backend path not found & pause & exit)
if not exist "%FRONTEND_PATH%" (echo Error: Frontend path not found & pause & exit)
if not exist "%BACKEND_PATH%\node_modules" (
    echo [WARNING] Backend node_modules not found.
)
if not exist "%FRONTEND_PATH%\node_modules" (
    echo [WARNING] Frontend node_modules not found.
)
echo       OK
echo.

:: Clear old status flags
if exist "%TEMP%\pom_backend_ok.tmp" del "%TEMP%\pom_backend_ok.tmp"
if exist "%TEMP%\pom_frontend_ok.tmp" del "%TEMP%\pom_frontend_ok.tmp"

echo [2/3] Launching Backend and Frontend...
start "POM-Backend" "%SELF%" --backend
start "POM-Frontend" "%SELF%" --frontend
echo       Done
echo.

echo [3/3] Monitor starting... (Waiting 20 seconds for services to boot)
timeout /t 20 /nobreak >nul

:MONITOR_LOOP
:: --- Check Backend Status ---
netstat -ano | findstr /R /C:":%BACKEND_PORT%[^0-9]" | findstr "LISTENING" >nul
if !ERRORLEVEL! EQU 0 (
    set "BACKEND_STATUS=[BACKEND]  RUNNING ^| Port %BACKEND_PORT%"
    :: แสตมป์ตรายางว่าเซิร์ฟเวอร์รันสำเร็จแล้ว
    echo OK > "%TEMP%\pom_backend_ok.tmp"
) else (
    set "BACKEND_STATUS=[BACKEND]  DOWN (Process stopped)"
)

:: --- Check Frontend Status ---
netstat -ano | findstr /R /C:":%FRONTEND_PORT%[^0-9]" | findstr "LISTENING" >nul
if !ERRORLEVEL! EQU 0 (
    set "FRONTEND_STATUS=[FRONTEND] RUNNING ^| Port %FRONTEND_PORT%"
    :: แสตมป์ตรายางว่าเซิร์ฟเวอร์รันสำเร็จแล้ว
    echo OK > "%TEMP%\pom_frontend_ok.tmp"
) else (
    set "FRONTEND_STATUS=[FRONTEND] DOWN (Process stopped)"
)

:: --- Dashboard (Updates every 60s without fast clear screen loops) ---
cls
echo ======================================================
echo   POM Project Monitor - !DATE! !TIME!
echo ======================================================
echo   * Keep this window open. It verifies running services.
echo.
echo   !BACKEND_STATUS!
echo   !FRONTEND_STATUS!
echo.
echo   Next check in 60 seconds...
timeout /t 60 /nobreak
goto MONITOR_LOOP


:: =============================================
::   BACKEND RUNNER
:: =============================================
:RUN_BACKEND
title POM-Backend
set FAIL_COUNT=0

:BACKEND_LOOP
:: ลบตรายางสถานะเก่าทิ้งก่อนรันเสมอ
if exist "%TEMP%\pom_backend_ok.tmp" del "%TEMP%\pom_backend_ok.tmp"

echo.
echo ======================================================
echo   [BACKEND] Starting... (%DATE% %TIME%)
echo ======================================================
echo.
cd /d "%~dp0backend"
call npm run dev

echo.
echo   [BACKEND] Process exited at %DATE% %TIME%

:: เช็ค Logic 2: ถ้าระหว่างที่รัน Monitor เห็นว่ารันติดแล้ว ให้ล้าง Counter เป็น 0
if exist "%TEMP%\pom_backend_ok.tmp" (
    echo   [BACKEND] Server was running successfully. Resetting fail counter.
    set FAIL_COUNT=0
)

:: เช็ค Logic 1: นับจำนวนครั้งที่พัง
set /a FAIL_COUNT+=1
if !FAIL_COUNT! GEQ 5 (
    echo.
    echo   [BACKEND] Failed !FAIL_COUNT! times consecutively. Limit reached.
    echo   [BACKEND] Pausing... Fix the issue, then press any key to retry.
    pause >nul
    set FAIL_COUNT=0
)

echo   [BACKEND] Auto-Restarting at %DATE% %TIME%... (!FAIL_COUNT!/5)
:: ใช้ timeout ปกติเพื่อแสดงเวลานับถอยหลัง โดยไม่เคลียร์จอ จะได้อ่าน Error Log ได้
timeout /t 60 /nobreak
goto BACKEND_LOOP


:: =============================================
::   FRONTEND RUNNER
:: =============================================
:RUN_FRONTEND
title POM-Frontend
set FAIL_COUNT=0

:FRONTEND_LOOP
:: ลบตรายางสถานะเก่าทิ้งก่อนรันเสมอ
if exist "%TEMP%\pom_frontend_ok.tmp" del "%TEMP%\pom_frontend_ok.tmp"

echo.
echo ======================================================
echo   [FRONTEND] Starting... (%DATE% %TIME%)
echo ======================================================
echo.
cd /d "%~dp0frontend"
call npm run start

echo.
echo   [FRONTEND] Process exited at %DATE% %TIME%

:: เช็ค Logic 2: ถ้าระหว่างที่รัน Monitor เห็นว่ารันติดแล้ว ให้ล้าง Counter เป็น 0
if exist "%TEMP%\pom_frontend_ok.tmp" (
    echo   [FRONTEND] Server was running successfully. Resetting fail counter.
    set FAIL_COUNT=0
)

:: เช็ค Logic 1: นับจำนวนครั้งที่พัง
set /a FAIL_COUNT+=1
if !FAIL_COUNT! GEQ 5 (
    echo.
    echo   [FRONTEND] Failed !FAIL_COUNT! times consecutively. Limit reached.
    echo   [FRONTEND] Pausing... Fix the issue, then press any key to retry.
    pause >nul
    set FAIL_COUNT=0
)

echo   [FRONTEND] Auto-Restarting at %DATE% %TIME%... (!FAIL_COUNT!/5)
:: ใช้ timeout ปกติเพื่อแสดงเวลานับถอยหลัง โดยไม่เคลียร์จอ จะได้อ่าน Error Log ได้
timeout /t 60 /nobreak
goto FRONTEND_LOOP
