@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Bot JIJA$ - WhatsApp
set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"

echo ==========================================
echo    BOT JIJA$ - mensajes al grupo de WhatsApp
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 goto instalarnode
goto revisarenv

:instalarnode
echo [1/3] Instalando Node.js, espera unos minutos...
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
set "PATH=%PATH%;C:\Program Files\nodejs"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo No se pudo instalar Node.js automaticamente.
  echo Instalalo desde https://nodejs.org y vuelve a abrir este archivo.
  pause
  exit /b
)

:revisarenv
if exist ".env" goto dependencias
echo.
echo Falta el archivo .env con la direccion del dashboard y la llave del bot.
echo Pidele a Claude que lo cree y vuelve a abrir este archivo.
pause
exit /b

:dependencias
if not exist "bot\node_modules" (
  echo [2/3] Instalando el bot de WhatsApp, puede tardar unos minutos...
  call npm install --prefix bot
)

echo.
echo [3/3] Prendiendo el bot. Deja esta ventana ABIERTA.
echo Si sale un QR, escanealo con el numero secundario:
echo WhatsApp - Dispositivos vinculados - Vincular dispositivo
echo.
node bot\bot.js
echo.
echo El bot se detuvo.
pause
