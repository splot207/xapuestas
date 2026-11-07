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
echo [1/4] Instalando Node.js, espera unos minutos...
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
echo [2/4] Creando el archivo .env con las claves de Upstash...
powershell -NoProfile -Command "$c = Get-Clipboard -Raw; if ($c -match 'UPSTASH_REDIS_REST_TOKEN=\"[^*\"]{20,}\"') { Set-Content -Path '.env' -Value $c.Trim() -Encoding ascii; exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo.
  echo No encontre las claves en el portapapeles.
  echo Ve a Upstash, cuadro Connect, haz clic en el ojito y luego en el boton copiar.
  echo Despues vuelve aqui y presiona cualquier tecla.
  pause >nul
  goto revisarenv
)
echo Archivo .env creado.

:dependencias
if not exist "node_modules" (
  echo [3/4] Instalando lo necesario del proyecto...
  call npm install
)
if not exist "bot\node_modules" (
  echo [3/4] Instalando el bot de WhatsApp, puede tardar unos minutos...
  call npm install --prefix bot
)

echo.
echo [4/4] Prendiendo el bot. Deja esta ventana ABIERTA.
echo Si sale un QR, escanealo con el numero secundario:
echo WhatsApp - Dispositivos vinculados - Vincular dispositivo
echo.
call npm run bot
echo.
echo El bot se detuvo.
pause
