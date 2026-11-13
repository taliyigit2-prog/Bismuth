"""Ayarlar. Bismuth yan süreci başlatırken ayarları JSON olarak `BISMUTH_CAMERA_CONFIG` ortam değişkeniyle verir
(G-09: eşikler koda yazılmaz; K-49: sır komut satırında görünmez). Geliştirmede aynı adlı ortam değişkenleri de okunur.
`.env` dosyası yüklenmez. Dış servis ayarı yoktur (Telegram Bismuth'tadır, K-50). Veritabanı/dosya yolu ayarı yoktur (P20c).
"""

import ipaddress
import json
import os
from dataclasses import dataclass, fields
from typing import Any, Mapping, Optional

# RTSP için TCP + 5 sn kopma zaman aşımı + düşük gecikme. OpenCV/FFmpeg içe aktarılmadan ÖNCE ayarlanmalıdır; `config`
# her modülden önce yüklendiği için burada durur (kod bulgusu 10: sıra belirsizdi).
os.environ.setdefault(
    "OPENCV_FFMPEG_CAPTURE_OPTIONS",
    "rtsp_transport;tcp|stimeout;5000000|rw_timeout;5000000|fflags;nobuffer|flags;low_delay",
)

CONFIG_ENV = "BISMUTH_CAMERA_CONFIG"
TOKEN_ENV = "BISMUTH_CAMERA_TOKEN"
MIN_TOKEN_LENGTH = 32


class ConfigError(ValueError):
    pass


def is_loopback(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


@dataclass(frozen=True)
class Config:
    # Kamera kaynağı: RTSP URL (kullanıcı:şifre içerebilir = SIR) veya webcam indeksi ("0")
    CAMERA_SOURCE: str = "0"
    CAMERA_LOCATION: str = "Merdiven / Kat Girisi"

    # Yüz tanıma ve doğrulama
    # TEK "aynı kişi" eşiği (kod bulgusu 6): misafir eşleşmesi, alarm tekrar-tanıma ve alarm çoğaltma tekilleştirmesi bunu
    # kullanır; ayrı sabit yoktur. Sahada FAR/FRR ölçümüyle ayarlanır (camera.similarityThreshold).
    FACE_SIMILARITY_THRESHOLD: float = 0.36
    # "Emin değil" bandı: eşiğin bu kadar altına kadar (eşik - marj ≤ skor < eşik) yüz kayıtsız sayılmaz ve alarm
    # sayacına girmez; yalnız "belirsiz" etiketlenir. 0 = bant yok (camera.uncertainMargin).
    FACE_UNCERTAIN_MARGIN: float = 0.06
    CHECKOUT_MIN_SIMILARITY: float = 0.45  # kameradan tanıma/çıkış önerisi için daha sıkı eşik (kod bulgusu 18)
    MIN_FACE_DET_SCORE: float = 0.62
    MIN_FACE_SIZE_PX: int = 55
    CONFIRMATION_FRAMES: int = 3
    CONFIRMATION_WINDOW_SECONDS: float = 6.0  # "üst üste" kayıtsız kare penceresi (kod bulgusu 4)
    VERIFIED_TTL_SECONDS: float = 20.0  # doğrulanmış kimlik ömrü (kod bulgusu 3)

    # Performans ve alarm
    PROCESS_EVERY_N_FRAMES: int = 3
    # Kişi kutusu yokken (YOLO kaçırdı / yakın çekim) yüz araması her N. analizde yapılır (kod bulgusu 5); 0 = kapalı.
    IDLE_FACE_SCAN_EVERY: int = 3
    ALARM_COOLDOWN_SECONDS: int = 60
    STALL_SECONDS: float = 15.0  # bu kadar kare gelmezse okuyucu yeniden başlatılır (kod bulgusu 10)

    # P20c (K-51, K-53): yan süreç diske misafir/yüz/alarm YAZMAZ; veritabanı ve resim klasörleri yoktur. Yalnız model
    # çalışma zamanının kendi ayar/önbellek klasörü (misafir verisi değil): Bismuth `userData/camera` yolunu verir.
    RUNTIME_DIR: str = ""
    # Bellekteki alarm kuyruğu üst sınırı (Bismuth çekip kendi tablosuna yazar; kırpmalar Bismuth'ta saklanır).
    MAX_ALERT_COUNT: int = 200

    # Web: yalnız loopback; başka bir adres reddedilir (K-49)
    WEB_HOST: str = "127.0.0.1"
    WEB_PORT: int = 8000

    INSIGHTFACE_MODEL_NAME: str = "buffalo_s"
    # Model klasörü (Bismuth verir: resources/camera/models); boşsa `model_loader.default_models_dir()`. İndirme yoktur (K-57).
    MODELS_DIR: str = ""

    # Canlı yayın (kod bulguları 23, 24): yalnız izleyici varken, yalnız yeni karede, küçültülmüş JPEG. Çizim yoktur;
    # kutular ve etiketler `/api/overlay` ile gelir, Bismuth penceresi çizer (OpenCV yazı çizimi kaldırıldı, kod bulgusu 20).
    STREAM_MAX_WIDTH: int = 960
    STREAM_JPEG_QUALITY: int = 75
    STREAM_MAX_FPS: int = 15

    # ByteTrack benzeri izleme (kod bulgusu 2)
    TRACK_HIGH_SCORE: float = 0.5
    TRACK_LOW_SCORE: float = 0.1
    TRACK_MATCH_IOU: float = 0.3
    TRACK_BUFFER_SECONDS: float = 4.0

    # Geçiş bölgesi: "x1,y1;x2,y2;..." piksel ya da 0..1 oranlı (çözünürlükten bağımsız, kod bulgusu 26)
    ZONE_POLYGON: str = ""


def _convert(kind: Any, raw: Any, name: str) -> Any:
    try:
        if kind is bool:
            return raw if isinstance(raw, bool) else str(raw).lower() in ("true", "1", "yes")
        return kind(raw)
    except (TypeError, ValueError) as exc:
        raise ConfigError(f"{name}: geçersiz değer") from exc


def _validate(cfg: Config) -> None:
    if not is_loopback(cfg.WEB_HOST):
        raise ConfigError("WEB_HOST yalnızca loopback olabilir (127.0.0.1)")
    if not 0 <= cfg.WEB_PORT <= 65535:
        raise ConfigError("WEB_PORT 0..65535 olmalı")
    for name in (
        "FACE_SIMILARITY_THRESHOLD",
        "CHECKOUT_MIN_SIMILARITY",
        "MIN_FACE_DET_SCORE",
        "TRACK_HIGH_SCORE",
        "TRACK_LOW_SCORE",
        "TRACK_MATCH_IOU",
    ):
        if not 0.0 <= getattr(cfg, name) <= 1.0:
            raise ConfigError(f"{name} 0..1 olmalı")
    for name in ("CONFIRMATION_FRAMES", "PROCESS_EVERY_N_FRAMES", "ALARM_COOLDOWN_SECONDS", "MIN_FACE_SIZE_PX"):
        if getattr(cfg, name) < 1:
            raise ConfigError(f"{name} en az 1 olmalı")
    if not 0.0 <= cfg.FACE_UNCERTAIN_MARGIN <= 0.5:
        raise ConfigError("FACE_UNCERTAIN_MARGIN 0..0.5 olmalı")
    if cfg.IDLE_FACE_SCAN_EVERY < 0:
        raise ConfigError("IDLE_FACE_SCAN_EVERY 0 ya da daha büyük olmalı")
    if not 160 <= cfg.STREAM_MAX_WIDTH <= 3840:
        raise ConfigError("STREAM_MAX_WIDTH 160..3840 olmalı")
    if not 30 <= cfg.STREAM_JPEG_QUALITY <= 95 or not 1 <= cfg.STREAM_MAX_FPS <= 60:
        raise ConfigError("STREAM_JPEG_QUALITY 30..95, STREAM_MAX_FPS 1..60 olmalı")
    if cfg.TRACK_BUFFER_SECONDS <= 0:
        raise ConfigError("TRACK_BUFFER_SECONDS pozitif olmalı")


def load_config(env: Optional[Mapping[str, str]] = None) -> Config:
    source = os.environ if env is None else env
    given: dict[str, Any] = {}
    blob = source.get(CONFIG_ENV, "")
    if blob.strip():
        try:
            parsed = json.loads(blob)
        except json.JSONDecodeError as exc:
            raise ConfigError(f"{CONFIG_ENV} geçerli JSON değil") from exc
        if not isinstance(parsed, dict):
            raise ConfigError(f"{CONFIG_ENV} bir nesne olmalı")
        given = parsed
    values: dict[str, Any] = {}
    for field in fields(Config):
        if field.name in given:
            values[field.name] = _convert(field.type, given[field.name], field.name)
        elif field.name in source:
            values[field.name] = _convert(field.type, source[field.name], field.name)
    cfg = Config(**values)
    _validate(cfg)
    return cfg


def load_token(env: Optional[Mapping[str, str]] = None) -> str:
    """Electron'un ürettiği 32 baytlık belirteç (hex). Yoksa ya da kısaysa servis başlamaz."""
    # Okunduktan sonra ortamdan silinir: alt süreçlere ve hata dökümlerine geçmez.
    token = (os.environ.pop(TOKEN_ENV, "") if env is None else env.get(TOKEN_ENV, "")).strip()
    if len(token) < MIN_TOKEN_LENGTH:
        raise ConfigError(f"{TOKEN_ENV} en az {MIN_TOKEN_LENGTH} karakter olmalı (Bismuth verir)")
    return token


config = load_config()
