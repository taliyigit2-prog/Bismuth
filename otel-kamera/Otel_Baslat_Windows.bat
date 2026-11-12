@echo off
chcp 65001 >nul
title Mango Suites - Otel Kamera ve KBS Denetim Sistemi
cd /d "%~dp0"

echo ====================================================================
echo   MANGO SUITES - OTEL KAMERA GUVENLIK SISTEMI BASLATILIYOR
echo ====================================================================

:: Sanal ortam kontrolu
if not exist "venv\Scripts\python.exe" (
    echo [UYARI] Sanal ortam bulunamadi, ilk kurulum baslatiliyor...
    call Otel_Ilk_Kurulum_Windows.bat
)

:: Sunucu hazir oldugunda tarayiciyi (http://localhost:8000) otomatik acan arka plan gorevi
start /b "" powershell -NoProfile -WindowStyle Hidden -Command "for($i=0; $i -lt 30; $i++){ Start-Sleep -Seconds 2; try { $r = Invoke-WebRequest -Uri 'http://localhost:8000/api/status' -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -eq 200){ Start-Process 'http://localhost:8000'; break } } catch {} }"

:loop
echo [%date% %time%] Otel Kamera motoru calisiyor (Port: 8000)...
"venv\Scripts\python.exe" web_app.py
echo [%date% %time%] Beklenmeyen kapanma algilandi! 5 saniye icinde otomatik yeniden baslatiliyor...
timeout /t 5 /nobreak >nul
goto loop
