@echo off
cd /d "%~dp0"
echo ==================================================
echo  Starting Local Web Server...
echo ==================================================
echo.
echo Opening http://localhost:8080 in your browser...
start "" "http://localhost:8080"
echo.

python -m http.server 8080
if %errorlevel% neq 0 (
    py -m http.server 8080
)

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Python is not installed or port 8080 is already in use.
    echo Please install Python to run this app locally.
    echo.
    pause
)
