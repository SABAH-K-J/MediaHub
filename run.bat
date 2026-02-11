@echo off
REM MediaHub Launcher - Clean Start
REM This launches MediaHub without showing console windows

echo Starting MediaHub...
start /B pythonw launch.py

REM Wait a moment for the app to start
timeout /t 3 /nobreak >nul

echo MediaHub is starting...
echo The application window will appear shortly.
