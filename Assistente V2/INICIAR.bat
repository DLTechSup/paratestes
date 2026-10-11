@echo off
cd /d "%~dp0"
if not exist ".instalado" (
  echo Primeira execucao: instalando dependencias...
  python setup.py && echo ok> .instalado
)
python main.py
pause
