"""Ortak test araçları: sentetik görüntüler, sahte saat, geçici dizinli ayarlar. Ağır model (ultralytics, insightface)
ve gerçek kamera gerekmez."""

import threading
from dataclasses import replace
from datetime import datetime, timedelta

import numpy as np
import pytest

from config import Config

TOKEN = "t" * 32
PORT = 47511


class FakeClock:
    """Hem `datetime` (veritabanı) hem `float` (izleyici) saati; test ilerletir."""

    def __init__(self, start: datetime | None = None):
        self.now = start or datetime(2026, 11, 13, 12, 0, 0)
        self._lock = threading.Lock()

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kwargs) -> None:
        self.now = self.now + timedelta(**kwargs)

    def seconds(self) -> float:
        return self.now.timestamp()


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def settings(tmp_path) -> Config:
    return replace(
        Config(),
        DB_PATH=str(tmp_path / "guests.db"),
        ALERTS_DIR=str(tmp_path / "alerts"),
        GUEST_PHOTOS_DIR=str(tmp_path / "guest_photos"),
        WEB_PORT=PORT,
    )


def unit_embedding(seed: int, dim: int = 512) -> np.ndarray:
    vec = np.random.default_rng(seed).standard_normal(dim).astype(np.float32)
    return vec / np.linalg.norm(vec)


def noise_frame(h: int = 120, w: int = 160, seed: int = 1) -> np.ndarray:
    """Karanlık/kapalı sayılmayacak, sentetik (gürültülü) renkli kare."""
    return np.random.default_rng(seed).integers(60, 200, size=(h, w, 3), dtype=np.uint8)
