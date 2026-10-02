@echo off
SETLOCAL EnableDelayedExpansion

:: --- Setup Colors using prompt injection ---
for /F "tokens=1,2 delims=#" %%a in ('"prompt #$H#$E# & echo on & for %%b in (1) do rem"') do set "ESC=%%b"
set "setColor_Green=%ESC%[92m"
set "setColor_Red=%ESC%[91m"
set "setColor_Yellow=%ESC%[93m"
set "setColor_Cyan=%ESC%[96m"
set "resetColor=%ESC%[0m"

echo.
echo %setColor_Cyan%======================================================%resetColor%
echo %setColor_Cyan%   POM Project - Stop Running Processes Tool%resetColor%
echo %setColor_Cyan%======================================================%resetColor%
echo.

:: --- 1/3 Close CMD startup and monitor windows FIRST ---
echo %setColor_Yellow%[1/3] Shutting down active runner and monitor windows...%resetColor%

:: Kill POM-Local-Monitor by Title (Tree-kill)
taskkill /FI "WINDOWTITLE eq POM-Local-Monitor*" /T /F >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo      %setColor_Red%[CLOSED]%resetColor% POM-Local-Monitor window closed.
)

:: Kill POM-Server-Monitor by Title (Tree-kill)
taskkill /FI "WINDOWTITLE eq POM-Server-Monitor*" /T /F >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo      %setColor_Red%[CLOSED]%resetColor% POM-Server-Monitor window closed.
)

:: Kill POM-Backend by Title (Tree-kill)
taskkill /FI "WINDOWTITLE eq POM-Backend*" /T /F >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo      %setColor_Red%[CLOSED]%resetColor% POM-Backend runner window closed.
)

:: Kill POM-Frontend by Title (Tree-kill)
taskkill /FI "WINDOWTITLE eq POM-Frontend*" /T /F >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo      %setColor_Red%[CLOSED]%resetColor% POM-Frontend runner window closed.
)

:: Ultra-Safe Directory-Specific Tree-kill:
:: Targets ONLY cmd.exe wrappers that are running scripts inside THIS specific project folder path (%~dp0).
:: Explicitly excludes Stop.bat itself to avoid killing this active session.
powershell -NoProfile -Command "$targetPath = '%~dp0'.TrimEnd('\'); Get-CimInstance Win32_Process -Filter \"Name = 'cmd.exe'\" | Where-Object { $_.CommandLine -like \"*$targetPath*\" -and $_.CommandLine -notlike '*Stop.bat*' } | ForEach-Object { taskkill /F /T /PID $_.ProcessId }" >nul 2>&1

echo      %setColor_Green%[OK]%resetColor% Scoped startup and sub-process CMD windows terminated.
echo.

:: --- 2/3 Stop processes by port ---
echo %setColor_Yellow%[2/3] Terminating active port listeners...%resetColor%

:: Kill Backend Local Port (3000)
set "KILLED_3000=0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":3000[^0-9]" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    set "KILLED_3000=1"
)
if "!KILLED_3000!"=="1" (
    echo      %setColor_Red%[KILLED]%resetColor% Backend Local listener (Port 3000) stopped.
) else (
    echo      %setColor_Cyan%[INACTIVE]%resetColor% Backend Local (Port 3000) was not running.
)

:: Kill Backend Server Port (3100)
set "KILLED_3100=0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":3100[^0-9]" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    set "KILLED_3100=1"
)
if "!KILLED_3100!"=="1" (
    echo      %setColor_Red%[KILLED]%resetColor% Backend Production listener (Port 3100) stopped.
) else (
    echo      %setColor_Cyan%[INACTIVE]%resetColor% Backend Production (Port 3100) was not running.
)

:: Kill Frontend Port (9696)
set "KILLED_9696=0"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":9696[^0-9]" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
    set "KILLED_9696=1"
)
if "!KILLED_9696!"=="1" (
    echo      %setColor_Red%[KILLED]%resetColor% Frontend listener (Port 9696) stopped.
) else (
    echo      %setColor_Cyan%[INACTIVE]%resetColor% Frontend (Port 9696) was not running.
)
echo.

:: --- 3/3 Clear status files ---
echo %setColor_Yellow%[3/3] Cleaning temporary status flags...%resetColor%
set "CLEANED_FLAGS=0"
if exist "%TEMP%\pom_backend_ok.tmp" (
    del "%TEMP%\pom_backend_ok.tmp" >nul 2>&1
    echo      %setColor_Green%-%resetColor% Backend status flag cleared.
    set "CLEANED_FLAGS=1"
)
if exist "%TEMP%\pom_frontend_ok.tmp" (
    del "%TEMP%\pom_frontend_ok.tmp" >nul 2>&1
    echo      %setColor_Green%-%resetColor% Frontend status flag cleared.
    set "CLEANED_FLAGS=1"
)
if "!CLEANED_FLAGS!"=="0" (
    echo      %setColor_Cyan%-%resetColor% No temporary status flags found.
)
echo.

echo %setColor_Green%======================================================%resetColor%
echo %setColor_Green%   SUCCESS: All POM Project processes have been stopped!%resetColor%
echo %setColor_Green%======================================================%resetColor%
echo.
pause
