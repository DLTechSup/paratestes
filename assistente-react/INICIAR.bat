@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem --- abre o programa direto do codigo (sem gerar o .exe), como administrador ---
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo O Node.js nao esta instalado. Baixe a versao LTS em https://nodejs.org e rode de novo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando pela primeira vez, aguarde alguns minutos...
  call npm install --no-audit --no-fund || (echo FALHOU & pause & exit /b 1)
)
call npm start
