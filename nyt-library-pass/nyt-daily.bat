@echo off
rem Run by the "NYT via Library (daily)" scheduled task. Output goes to logs\nyt-pass.log.
cd /d "%~dp0"
if not exist logs mkdir logs
if not exist node_modules call npm run setup >> logs\nyt-pass.log 2>&1
echo ==== %date% %time% ==== >> logs\nyt-pass.log
node nyt-pass.js --scheduled >> logs\nyt-pass.log 2>&1
