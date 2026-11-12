import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()

@dataclass(frozen=True)
class Config:
    # Kamera kaynağı: RTSP URL veya Webcam indeksi ("0")
    CAMERA_SOURCE: str = os.getenv("CAMERA_SOURCE", "0")
    CAMERA_LOCATION: str = os.getenv("CAMERA_LOCATION", "Merdiven / Kat Girisi")

    # Yüz tanıma ve doğrulama parametreleri
    FACE_SIMILARITY_THRESHOLD: float = float(os.getenv("FACE_SIMILARITY_THRESHOLD", "0.36"))
    MIN_FACE_DET_SCORE: float = float(os.getenv("MIN_FACE_DET_SCORE", "0.62"))
    MIN_FACE_SIZE_PX: int = int(os.getenv("MIN_FACE_SIZE_PX", "55"))
    CONFIRMATION_FRAMES: int = int(os.getenv("CONFIRMATION_FRAMES", "3"))

    # Performans & Alarm ayarları
    PROCESS_EVERY_N_FRAMES: int = int(os.getenv("PROCESS_EVERY_N_FRAMES", "3"))
    ALARM_COOLDOWN_SECONDS: int = int(os.getenv("ALARM_COOLDOWN_SECONDS", "60"))
    HEADLESS: bool = os.getenv("HEADLESS", "false").lower() in ("true", "1", "yes")

    # Telegram Bildirim (Birden fazla Chat ID için virgülle ayırın: "-5390916610,12345")
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID: str = os.getenv("TELEGRAM_CHAT_ID", "")

    # Veritabanı ve Kayıt Dizinleri
    DB_PATH: str = os.getenv("DB_PATH", "hotel_guests.db")
    ALERTS_DIR: str = os.getenv("ALERTS_DIR", "alerts")
    GUEST_PHOTOS_DIR: str = os.getenv("GUEST_PHOTOS_DIR", "guest_photos")

    # Otomatik Disk Temizliği & 30 Günlük Saklama Politikası
    ALERT_RETENTION_DAYS: int = int(os.getenv("ALERT_RETENTION_DAYS", "30"))
    MAX_ALERT_COUNT: int = int(os.getenv("MAX_ALERT_COUNT", "500"))
    DEDUP_SIMILARITY_THRESHOLD: float = float(os.getenv("DEDUP_SIMILARITY_THRESHOLD", "0.46"))
    DEDUP_WINDOW_HOURS: int = int(os.getenv("DEDUP_WINDOW_HOURS", "12"))

    # Web Sunucu Ayarları (Güvenlik: Sadece yerel resepsiyon bilgisayarından erişim için 127.0.0.1)
    WEB_HOST: str = os.getenv("WEB_HOST", "127.0.0.1")
    WEB_PORT: int = int(os.getenv("WEB_PORT", "8000"))

    # InsightFace Model: 'buffalo_s' (hızlı/CPU) veya 'buffalo_l' (yüksek hassasiyet)
    INSIGHTFACE_MODEL_NAME: str = os.getenv("INSIGHTFACE_MODEL_NAME", "buffalo_s")

    # Geçiş Bölgesi Poligonu (Opsiyonel: "x1,y1;x2,y2;x3,y3;x4,y4")
    ZONE_POLYGON_STR: str = os.getenv("ZONE_POLYGON", "")

config = Config()
