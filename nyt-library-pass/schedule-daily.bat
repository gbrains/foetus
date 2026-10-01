@echo off
rem Windows: double-click once to have the NYT pass redeemed automatically every day.
cd /d "%~dp0"
if not exist node_modules call npm run setup
set "T="
set /p T=What time each day? 24-hour clock, e.g. 06:30 or 18:00 [06:30]: 
if "%T%"=="" set "T=06:30"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0schedule-daily.ps1" -Time "%T%"
if errorlevel 1 goto failed
echo.
set "RUNNOW="
set /p RUNNOW=Run it once now to test? [Y/n]: 
if /i "%RUNNOW%"=="n" goto done
schtasks /run /tn "NYT via Library (daily)"
goto done
:failed
echo.
echo Scheduling failed - see the message above.
:done
pause
