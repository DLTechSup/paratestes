@echo off
cd /d "%~dp0"
if not exist ".local_ok" (
  echo Instalando dependencias do modo local...
  python -m pip install -r requisitos-local.txt && echo ok> .local_ok
)
echo Dica: python modo_local.py --listar-mic  mostra os numeros dos microfones.
python modo_local.py %*
pause
