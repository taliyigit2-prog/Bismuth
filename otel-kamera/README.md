# 🏨 Mango Suites — Otel Kamera ve KBS Denetim Sistemi (`Otel Kamera`)

Otel güvenlik kamerası üzerinden **KBS kayıtlı misafirleri** yüz imzasıyla tanıyan, kayıtsız girişleri **yakınlaştırılmış yüz (PIP)** kanıtıyla yakalayan ve Telegram grubuna anlık bildiren yerel yapay zeka sistemi.

> 🤖 **Geliştiriciler ve Yapay Zeka Ajanları İçin Not:**
> Bu projenin tam teknik mimarisi, çözülmüş kritik problemleri, veritabanı şeması ve hand-off notları için lütfen **[AI_GELISTIRICI_NOTLARI.md](file:///Users/yigittali/Desktop/Otel%20Kamera/AI_GELISTIRICI_NOTLARI.md)** dosyasını inceleyin.

---

## 📁 Proje Dosya Yapısı

```text
Otel Kamera/
├── web_app.py                               # FastAPI Web Sunucusu ve Güvenlik API'leri
├── security_service.py                      # Kamera Okuyucu, Otomatik Yeniden Bağlanma & 30 Gün Temizliği
├── face_engine.py                           # InsightFace (buffalo_s) ONNX Yüz Tanıma Motoru
├── tracker.py                               # YOLO11n + ByteTrack Takip ve Alarm Karar Motoru
├── database.py                              # SQLite WAL Veritabanı (Çoklu Açı Yüz Profili Destekli)
├── notifier.py                              # Telegram Grup Bildirimi ve PIP Yüz Yakınlaştırma
├── config.py                                # Sistem ve Güvenlik Ayarları (.env Okuyucu)
├── test_system.py                           # Otomatik Sistem, Yüz Tanıma ve Güvenlik Testi
├── requirements.txt                         # Python Kütüphane Bağımlılıkları
├── yolo11n.pt                               # YOLO11 Nesne Tespit Modeli
├── hotel_guests.db                          # SQLite Veritabanı
├── .env                                     # Kamera, Telegram ve Eşik Ayarları
├── static/
│   └── index.html                           # Resepsiyon Kamera & KBS Yönetim Arayüzü
├── Baslat_Mac                               # macOS Manuel Başlatıcı (Çift Tıkla & tmux)
├── Durdur_Mac                               # macOS Durdurucu (Çift Tıkla)
├── Otel_Ilk_Kurulum_Windows.bat             # Windows İlk Kurulum Sihirbazı (1 Kez Çalıştırılır)
├── Otel_Baslat_Windows.bat                  # Windows Başlatıcı + Otomatik Tarayıcı + Sonsuz Bekçi
├── Otel_Otomatik_Baslangica_Kur_Windows.bat # Elektrik Kesintisi Sonrası Windows Açılışında Otomatik Başlatıcı
├── README.md                                # Hızlı Başlangıç Kılavuzu
└── AI_GELISTIRICI_NOTLARI.md                # Kapsamlı Geliştirici ve Yapay Zeka El Kitabı
```

---

## 🪟 Otel Bilgisayarında (Windows) Adım Adım Kurulum

1. **Python 3.11 veya 3.12 Kurulumu:**
   - Bilgisayarda Python yoksa [python.org/downloads](https://www.python.org/downloads/) adresinden indirin.
   - Kurulum ekranının en altındaki **`Add Python to PATH`** kutucuğunu mutlaka işaretleyin.
2. **Klasörü Masaüstüne Çıkarın:**
   - Google Drive'dan indirdiğiniz `Otel Kamera` klasörünü Masaüstüne çıkarın.
3. **Kamera Adresini Girin (`.env`):**
   - Klasör içindeki `.env` dosyasını Not Defteri ile açın.
   - `CAMERA_SOURCE=0` satırını otel kamerasının RTSP adresiyle değiştirin (Örn: `CAMERA_SOURCE=rtsp://admin:sifre@192.168.1.64:554/stream1`).
   - `TELEGRAM_BOT_TOKEN` ve `TELEGRAM_CHAT_ID` bilgilerini girin.
4. **İlk Kurulumu Yapın (Sadece 1 Kez):**
   - `Otel_Ilk_Kurulum_Windows.bat` dosyasına çift tıklayın. Gerekli yapay zeka kütüphaneleri otomatik kurulacaktır.
5. **Elektrik Kesintisi Sonrası Otomatik Açılışı Aktif Edin:**
   - `Otel_Otomatik_Baslangica_Kur_Windows.bat` dosyasına çift tıklayın.
   - Artık bilgisayar her açıldığında arka planda sistem çalışacak ve resepsiyon ekranında `http://localhost:8000` otomatik açılacaktır.

---

## 🍎 Kendi Bilgisayarınızda (macOS) Kullanım

- **Başlatmak için:** Klasördeki `Baslat_Mac` dosyasına çift tıklayın. Arka planda `tmux` içinde başlar ve `http://localhost:8000` otomatik açılır.
- **Durdurmak için:** `Durdur_Mac` dosyasına çift tıklayın.
