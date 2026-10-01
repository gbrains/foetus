@echo off
rem Windows: double-click this file, or right-click > Send to > Desktop (create shortcut).
cd /d "%~dp0"
if not exist node_modules call npm run setup
node nyt-pass.js
if errorlevel 1 pause
