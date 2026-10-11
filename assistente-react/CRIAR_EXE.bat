@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
rem --- precisa de administrador (o empacotador cria links simbolicos e o .exe pede administrador) ---
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
echo ============================================================
echo   Gerando o Assistente de Voz (.exe)   -   leva alguns minutos
echo ============================================================
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo O Node.js nao esta instalado. Baixe a versao LTS em https://nodejs.org , instale e rode este arquivo de novo.
  pause
  exit /b 1
)
set CSC_IDENTITY_AUTO_DISCOVERY=false
echo.
echo [1/2] Instalando dependencias (so demora na primeira vez)...
call npm install --no-audit --no-fund || goto erro
echo.
echo [2/2] Criando os programas...
call npm run dist || goto erro
echo.
echo ============================================================
echo   PRONTO!  Abra a pasta  release  :
echo     - "Assistente de Voz Setup 2.0.0.exe"  = instalador (recomendado; permite iniciar com o Windows)
echo     - "AssistenteDeVoz-portatil.exe"       = versao portatil (nao precisa instalar)
echo   Ao abrir, o Windows pede permissao de administrador: clique em SIM.
echo ============================================================
start "" "%~dp0release"
pause
exit /b 0
:erro
echo.
echo FALHOU. Copie a mensagem de erro acima e me envie.
pause
exit /b 1
