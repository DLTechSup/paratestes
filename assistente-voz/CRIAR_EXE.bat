@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Gerando AssistenteVoz.exe (precisa de Python 3.11/3.12 e internet) ===
python -m pip install -r requisitos.txt pyinstaller || goto erro
python -m PyInstaller --noconfirm --clean --onedir --name AssistenteVoz --uac-admin ^
  --collect-all sounddevice --collect-all _sounddevice_data --collect-all google.genai voz_gemini.py || goto erro
if exist config.json copy /y config.json dist\AssistenteVoz\config.json >nul
if exist chave_api.txt copy /y chave_api.txt dist\AssistenteVoz\chave_api.txt >nul
echo.
echo PRONTO!  Abra:  dist\AssistenteVoz\AssistenteVoz.exe
echo (ao abrir, o Windows pede permissao de administrador - clique em Sim)
echo Dica: clique com o botao direito no .exe ^> Enviar para ^> Area de trabalho (atalho).
pause
exit /b 0
:erro
echo.
echo FALHOU. Copie a mensagem de erro acima e me envie.
pause
exit /b 1
