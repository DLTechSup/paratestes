@echo off
chcp 65001 >nul
title NoteDeck - Criar instalador
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e execute este arquivo novamente.
  pause
  exit /b 1
)

echo === 1/3 Instalando dependencias ===
call npm install
if errorlevel 1 goto erro

echo.
echo === 2/3 Gerando o instalador (pode demorar alguns minutos) ===
call npm run dist
if errorlevel 1 goto erro

echo.
echo === 3/3 Concluido! ===
echo O instalador esta na pasta "release": NoteDeck-Setup-1.0.0.exe
start "" "%~dp0release"
pause
exit /b 0

:erro
echo.
echo [ERRO] Algo deu errado. Veja as mensagens acima.
pause
exit /b 1
