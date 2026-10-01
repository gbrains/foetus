@echo off
rem Windows: double-click to stop the daily NYT pass task.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0schedule-daily.ps1" -Remove
pause
