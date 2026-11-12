@echo off
chcp 65001 >nul
title Mango Suites - Otel Kamera Ilk Kurulum (Windows)
cd /d "%~dp0"

echo ====================================================================
echo   MANGO SUITES - OTEL KAMERA WINDOWS ILK KURULUM SIHIRBAZI
echo ====================================================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo [HATA] Bilgisayarda Python bulunamadi!
    echo Lutfen https://www.python.org/downloads/ adresinden Python 3.11 veya 3.12 yukleyin
    echo ve kurulumda "Add Python to PATH" kutucugunu isaretleyin.
    pause
    exit /b 1
)

if not exist "venv\Scripts\python.exe" (
    if exist "venv" (
        echo [!] Eski/Mac sanal ortami temizleniyor...
        rmdir /s /q "venv"
    )
    echo [1/2] Windows Python sanal ortami (venv) olusturuluyor...
    python -m venv venv
)

echo [2/2] Gerekli yapay zeka ve kamera kutuphaneleri yukleniyor...
"venv\Scripts\python.exe" -m pip install --upgrade pip
"venv\Scripts\python.exe" -m pip install -r requirements.txt

echo.
echo [TAMAMLANDI] Kurulum basariyla bitti!
echo Elektrik kesintisi sonrasi otomatik acilmasi icin "Otel_Otomatik_Baslangica_Kur_Windows.bat" dosyasina cift tiklayin.
pause
