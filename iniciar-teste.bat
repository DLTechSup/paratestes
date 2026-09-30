@echo off
chcp 65001 >nul
title NoteDeck - Teste
cd /d "%~dp0"
if not exist node_modules call npm install
call npm start
