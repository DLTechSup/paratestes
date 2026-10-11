@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem --- pede permissão de administrador (UAC) e reabre sozinho ---
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
if not exist ".instalado" (
  echo Instalando pela primeira vez...
  python -m pip install -r requisitos.txt && echo ok> .instalado
)
python voz_gemini.py %*
pause
