# Registers (or removes, with -Remove) a Windows scheduled task that redeems the
# library NYT pass every day. Use schedule-daily.bat / unschedule-daily.bat rather
# than running this directly.
param(
  [string]$Time = '06:30',
  [switch]$Remove
)
$ErrorActionPreference = 'Stop'
$TaskName = 'NYT via Library (daily)'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

if ($Remove) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed the '$TaskName' task."
  return
}

if (-not (Test-Path (Join-Path $here '.env'))) {
  throw "No .env file yet. Copy .env.example to .env and fill it in first."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not installed (or not on PATH). Install it from https://nodejs.org/ and try again."
}
$at = [datetime]::ParseExact($Time, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)

$bat = Join-Path $here 'nyt-daily.bat'
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c `"`"$bat`"`"" -WorkingDirectory $here
$trigger = New-ScheduledTaskTrigger -Daily -At $at
# StartWhenAvailable: if the PC was off or asleep at that time, run as soon as it's back.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
# Interactive: runs in your signed-in session so the browser window can show a CAPTCHA if NYT asks.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
  -Description 'Redeems the Homewood/JCLC library NYT pass and logs in to NYTimes.com.' -Force | Out-Null

Write-Host "Scheduled '$TaskName' every day at $($at.ToString('h:mm tt'))."
Write-Host "Log: $(Join-Path $here 'logs\nyt-pass.log')"
