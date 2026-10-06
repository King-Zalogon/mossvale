@echo off
cd /d "%~dp0"
node scripts\local-integration.mjs %*
if errorlevel 1 pause
