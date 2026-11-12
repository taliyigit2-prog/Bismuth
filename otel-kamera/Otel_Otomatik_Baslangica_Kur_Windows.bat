@echo off
chcp 65001 >nul
title Mango Suites - Otel Kamera Elektrik Kesintisi Sonrasi Otomatik Baslatma Kurulumu
cd /d "%~dp0"

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_FILE=%STARTUP_DIR%\MangoSuites_OtelKamera_AutoStart.vbs"
set "BAT_PATH=%~dp0Otel_Baslat_Windows.bat"

echo ====================================================================
echo   MANGO SUITES - OTEL KAMERA OTOMATIK BASLANGIC KURULUMU
echo ====================================================================
echo.

(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo WshShell.CurrentDirectory = "%~dp0"
echo WshShell.Run chr^(34^) ^& "%BAT_PATH%" ^& chr^(34^), 0, False
echo Set WshShell = Nothing
) > "%VBS_FILE%"

if exist "%VBS_FILE%" (
    echo [BASARILI] Otomatik baslatma kuruldu!
    echo Konum: "%VBS_FILE%"
    echo.
    echo Artik elektrik kesintisi sonrasi calisanlar bilgisayari actigi anda:
    echo   1. Sistem arka planda GIZLI olarak (kapatilamaz sekilde) baslar.
    echo   2. http://localhost:8000 ekranda otomatik olarak acilir.
    echo   3. Modem, Xiaomi Sinyal Guclendirici ve Kamera acildiginda otomatik baglanir.
    echo.
    echo Simdi sistemi baslatmak icin bir tusa basin...
    pause >nul
    wscript.exe "%VBS_FILE%"
) else (
    echo [HATA] Baslangic klasorune yazilamadi. Lutfen Yonetici olarak calistirin.
    pause
)
