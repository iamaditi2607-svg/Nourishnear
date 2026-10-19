@echo off
title NourishNear - Community Food Sharing & AI
echo ===================================================
echo     Starting NourishNear Server & Public URL
echo ===================================================
echo.

REM Start Python Server
start /b python server.py

echo Local URL : http://127.0.0.1:8000
echo.
echo Connecting Public HTTPS Tunnel (localhost.run)...
echo Look for the https://*.lhr.life link below:
echo ===================================================
echo.

ssh -o StrictHostKeyChecking=no -R 80:127.0.0.1:8000 nokey@localhost.run

pause
