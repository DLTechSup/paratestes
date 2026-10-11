@echo off
cd /d "%~dp0"
python assistente.py
if errorlevel 1 pause
