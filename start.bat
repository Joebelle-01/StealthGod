@echo off
title System Utility
echo Starting StealthGod...

:: Start Python audio bridge in background (minimized)
start "Audio Bridge" /min python audio_bridge\server.py

:: Give Python 1.5s to start
timeout /t 2 /nobreak >nul

:: Launch Electron app
npx electron .
