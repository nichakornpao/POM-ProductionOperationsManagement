@echo off

setlocal enabledelayedexpansion

@REM Setup Color for variable ESC
for /F "tokens=1,2 delims=#" %%a in ('"prompt #$H#$E# & echo on & for %%b in (1) do rem"') do set "ESC=%%b"

@REM Backend
set "Backend=%~dp0backend"
set Backend_Node=%Backend%\node_modules
set Backend_env=%Backend%\.env
set Backend_env_dependency=%Backend%\package.json


@REM Frontend
set "Frontend=%~dp0frontend"
set Frontend_Node=%Frontend%\node_modules
set Frontend_env_dependency=%Frontend%\package.json

@REM Color Variables
set "setColor_Green=%ESC%[92m"
set "setColor_Red=%ESC%[91m"
set "setColor_Yellow=%ESC%[93m"
set "resetColor=%ESC%[0m"

@REM Padding Space in text make text show output same space
set "filterSpace=                    "

@REM Title
echo.
echo             ========================================
echo             [SETUP Indirect-Expense Request Tooling]
echo             ========================================
echo.


@REM Check Backend Folder
set "title=Check Backend Folder"
set "row=!title!!filterSpace!"

if exist "%Backend%" (
  echo !row:~0,30! : %setColor_Green%[OK] Folder backend found%resetColor%
) else (
  echo !row:~0,30! : %setColor_Red%[ERROR] Not found folder backend%resetColor% & pause & exit
)

@REM Check Node_Module Folder
set "title=Check Backend Node_Module"
set "row=!title!!filterSpace!"

if exist "%Backend_Node%" (
  echo !row:~0,30! : %setColor_Green%[OK] Found backend Node_Module%resetColor%
) else (
  echo !row:~0,30! : %setColor_Red%[ERROR] Not found backend Node_Module%resetColor%
  goto :Install_Node_Modules_Backend
)

@REM Check dotenv dependency and .env file
set "title=Check Dotenv dependency"
set "row=!title!!filterSpace!"

if exist "%Backend_env_dependency%" (
    @REM ค้นหาคำว่า dotenv ใน package.json
    findstr /i "dotenv" "%Backend_env_dependency%" > nul

    if !errorlevel! EQU 0 (
        echo !row:~0,30! : %setColor_Green%[OK] Found .env backend dependency%resetColor%
    ) else (
        echo !row:~0,30! : %setColor_Yellow%[WARN] Not found .env backend dependency%resetColor%
    )

    @REM เช็คไฟล์ .env ต่อ (Nested Check)
    set "title=Check Backend .env file"
    set "row=!title!!filterSpace!"
    if exist "%Backend_env%" (
        echo !row:~0,30! : %setColor_Green%[OK] Found backend .env file%resetColor%
    ) else (
        echo !row:~0,30! : %setColor_Yellow%[WARN] Not found backend .env file%resetColor%
    )
) else (
    echo !row:~0,30! : %setColor_Red%[ERROR] package.json missing%resetColor%
)

@REM Check Frontend Folder
    set "title=Check Frontend Folder"
    set "row=!title!!filterSpace!"
if exist %Frontend% (
  echo !row:~0,30! : %setColor_Green%[OK] Folder frontend found%resetColor%
) else (
  echo !row:~0,30! : %setColor_Red%[ERROR] Not found folder frontend%resetColor% & pause & exit
)

@REM Check Node_Module Folder
set "title=Check Frontend Node_Module"
set "row=!title!!filterSpace!"

if exist "%Frontend_Node%" (
  echo !row:~0,30! : %setColor_Green%[OK] Found frontend Node_Module%resetColor%
) else (
  echo !row:~0,30! : %setColor_Red%[ERROR] Not found frontend Node_Module%resetColor%
  goto :Install_Node_Modules_Frontend
)

REM ============================================================
REM   Check Backend Dependencies (Check ALL first, then install)
REM ============================================================
echo.
echo %setColor_Yellow%[Checking Backend Dependencies]%resetColor%
set "backend_install_list="
if exist "%~dp0Backend_Dependency.txt" (
    for /f "usebackq tokens=*" %%L in ("%~dp0Backend_Dependency.txt") do (
        set "line=%%L"
        @REM Replace @ with space to split name and version easily
        set "split=!line:@= !"
        for /f "tokens=1,2" %%a in ("!split!") do (
            findstr /i /l /c:"%%a" "%Backend_env_dependency%" | findstr /l /c:"%%b" >nul
            if !errorlevel! equ 0 (
                echo   %setColor_Green%[OK]%resetColor% %%L
            ) else (
                echo   %setColor_Red%[MISSING]%resetColor% %%L
                set "backend_install_list=!backend_install_list! %%L"
            )
        )
    )
)
@REM Install all missing backend dependencies at once
if defined backend_install_list (
    echo.
    echo %setColor_Yellow%[ACTION] Installing missing backend dependencies...%resetColor%
    echo %setColor_Yellow%Packages:!backend_install_list!%resetColor%
    echo %setColor_Red%[WARNING] You must use outside Internet to Install Dependencies%resetColor%
    echo %setColor_Red%[WARNING] If download not spin press ctrl+c%resetColor%
    echo.
    pushd "%Backend%"
    npm install !backend_install_list!
    echo.
    echo   %setColor_Green%[DONE] Backend dependency installation completed%resetColor%
    popd
    pause
) else (
    echo   %setColor_Green%All backend dependencies are OK%resetColor%
)

REM ============================================================
REM   Check Frontend Dependencies (Check ALL first, then install)
REM ============================================================
echo.
echo %setColor_Yellow%[Checking Frontend Dependencies]%resetColor%
set "frontend_install_list="
if exist "%~dp0Frontend_Dependency.txt" (
    for /f "usebackq tokens=*" %%L in ("%~dp0Frontend_Dependency.txt") do (
        set "line=%%L"
        set "split=!line:@= !"
        for /f "tokens=1,2" %%a in ("!split!") do (
            findstr /i /l /c:"%%a" "%Frontend_env_dependency%" | findstr /l /c:"%%b" >nul
            if !errorlevel! equ 0 (
                echo   %setColor_Green%[OK]%resetColor% %%L
            ) else (
                echo   %setColor_Red%[MISSING]%resetColor% %%L
                set "frontend_install_list=!frontend_install_list! %%L"
            )
        )
    )
)
@REM Install all missing frontend dependencies at once
if defined frontend_install_list (
    echo.
    echo %setColor_Yellow%[ACTION] Installing missing frontend dependencies...%resetColor%
    echo %setColor_Yellow%Packages:!frontend_install_list!%resetColor%
    echo %setColor_Red%[WARNING] You must use outside Internet to Install Dependencies%resetColor%
    echo %setColor_Red%[WARNING] If download not spin press ctrl+c%resetColor%
    echo.
    pushd "%Frontend%"
    npm install !frontend_install_list!
    echo.
    echo   %setColor_Green%[DONE] Frontend dependency installation completed%resetColor%
    popd
    pause
) else (
    echo   %setColor_Green%All frontend dependencies are OK%resetColor%
)

pause
@REM Exit program don't let it process function down below
exit /b

:Install_Node_Modules_Backend
echo %setColor_Yellow%[ACTION] Installing Node Modules for Backend...%resetColor%
echo %setColor_Red%[WARNING] You must use outside Internet to Install Dependencies%resetColor%
echo %setColor_Red%[WARNING] If download not spin press ctrl+c%resetColor%
echo.
@REM Get into Backend
pushd %Backend%
npm install
echo %setColor_Green%[FINISH] Node Modules installed successfully%resetColor%
@REM Out backend
popd
@REM Return to process
goto :eof

:Install_Node_Modules_Frontend
echo %setColor_Yellow%[ACTION] Installing Node Modules for Frontend...%resetColor%
echo %setColor_Red%[WARNING] You must use outside Internet to Install Dependencies%resetColor%
echo %setColor_Red%[WARNING] If download not spin press ctrl+c%resetColor%
echo.
@REM Get into Frontend
pushd %Frontend%
npm install
echo %setColor_Green%[FINISH] Node Modules installed successfully%resetColor%
@REM Out Frontend
popd
@REM Return to process
goto :eof

