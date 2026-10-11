@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist ".instalado" (
  echo Instalando pela primeira vez...
  python -m pip install -r requisitos.txt && echo ok> .instalado
)
python voz_gemini.py %*
pause
