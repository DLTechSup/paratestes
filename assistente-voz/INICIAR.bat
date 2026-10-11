@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem --- pede permissao de administrador (UAC) e reabre sozinho ---
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
if not exist ".instalado" (
  echo Instalando pela primeira vez, aguarde...
  python -m pip install -r requisitos.txt && echo ok> .instalado
)
rem pythonw = abre so a janela do programa, sem a tela preta
start "" pythonw app.py
