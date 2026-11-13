"""Bellekteki yüz listesi ve alarm kuyruğu (P20c; K-51, K-53).

Yan süreç diske misafir, yüz vektörü, kırpma ya da alarm kaydı YAZMAZ. Tek kaynak Bismuth'tur: içerideki misafirlerin
yüzlerini `PUT /api/faces/active` ile verir (burada yalnız bellekte durur), alarmları `GET /api/alerts` ile çeker ve kendi
şifreli veritabanına yazar. Süreç kapanınca ikisi de gider. Ad ve oda yalnız ekran etiketi için bellekte tutulur,
günlüğe yazılmaz.
"""

import base64
import binascii
import threading
import uuid
from collections import deque
from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Deque, List, Optional, Sequence, Tuple

import numpy as np

from timeutil import fmt, now_local

EMBEDDING_DIM = 512
MAX_FACES = 500

# (yüz kimliği, ad, oda, vektör): `face_engine` ve izleyici bu biçimi kullanır.
ActiveFace = Tuple[str, str, str, np.ndarray]


class FaceListError(ValueError):
    """Bismuth'tan gelen yüz listesi geçersiz."""


def decode_embedding(text: str) -> np.ndarray:
    """base64 (float32, küçük-endian, 512 değer) → vektör. Sonlu olmayan ya da sıfır vektör reddedilir."""
    try:
        raw = base64.b64decode(text, validate=True)
    except (binascii.Error, ValueError, TypeError) as exc:
        raise FaceListError("vektör base64 değil") from exc
    if len(raw) != EMBEDDING_DIM * 4:
        raise FaceListError("vektör boyutu yanlış")
    vec = np.frombuffer(raw, dtype="<f4").astype(np.float32)
    if not np.all(np.isfinite(vec)) or float(np.linalg.norm(vec)) == 0.0:
        raise FaceListError("vektör geçersiz")
    return vec


def encode_embedding(vec: np.ndarray) -> str:
    return base64.b64encode(np.asarray(vec, dtype="<f4").tobytes()).decode("ascii")


class FaceStore:
    """İçerideki misafirlerin yüzleri. Okuma anlık görüntü verir; tam değiştirme tek kilit altındadır."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._faces: List[ActiveFace] = []

    def replace(self, items: Sequence[Tuple[str, str, str, str]]) -> int:
        """`(id, ad, oda, base64 vektör)` listesiyle tüm listeyi değiştirir; biri geçersizse hiçbiri alınmaz."""
        if len(items) > MAX_FACES:
            raise FaceListError("çok fazla yüz")
        parsed: List[ActiveFace] = [(fid, name, room, decode_embedding(emb)) for fid, name, room, emb in items]
        with self._lock:
            self._faces = parsed
        return len(parsed)

    def snapshot(self) -> List[ActiveFace]:
        with self._lock:
            return list(self._faces)

    def clear(self) -> None:
        with self._lock:
            self._faces = []

    def guest_count(self) -> int:
        """Aynı kişinin birkaç açısı tek sayılır (ad + oda)."""
        with self._lock:
            return len({(n.strip().lower(), r.strip().lower()) for _, n, r, _ in self._faces})


@dataclass(frozen=True)
class StoredAlert:
    id: int
    alert_time: str
    track: int
    crop: bytes


class AlertQueue:
    """Bismuth'un çektiği alarmlar için sınırlı bellek kuyruğu. Numara bu çalışmaya özgüdür (`boot` ile birlikte
    tekil): süreç yeniden başlayınca sayaç sıfırlanır, Bismuth `boot` değişince baştan ister."""

    def __init__(self, max_items: int = 200, clock: Callable[[], datetime] = now_local) -> None:
        self.boot = uuid.uuid4().hex
        self._clock = clock
        self._lock = threading.Lock()
        self._items: Deque[StoredAlert] = deque(maxlen=max(1, max_items))
        self._next = 1

    def add(self, track_id: int, crop_jpeg: bytes) -> int:
        with self._lock:
            alert_id = self._next
            self._next += 1
            self._items.append(StoredAlert(alert_id, fmt(self._clock()), int(track_id), crop_jpeg))
            return alert_id

    def since(self, after: int = 0, limit: int = 50) -> List[StoredAlert]:
        """`after`'dan büyük numaralı alarmlar, eskiden yeniye."""
        with self._lock:
            return [a for a in self._items if a.id > after][: max(1, limit)]

    def count(self) -> int:
        with self._lock:
            return len(self._items)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


def parse_boot(value: Optional[str]) -> Optional[str]:
    return value if value and len(value) <= 64 else None
