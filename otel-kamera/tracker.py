"""Kişi izleme ve alarm kararı.

P20a düzeltmeleri: doğrulanmış kimliğin ömrü var ve yalnız gerçek eşleşmeyle tazelenir; yabancı yüz tekrar tekrar
eşleşmezse kimlik düşer (3, tailgating); kayıtsız sayaç zaman pencereli ve sözlükler periyodik temizlenir (4);
tüm paylaşılan durum tek kilit altında (15); poligon 0..1 oranlı verilebilir ve ayrıştırma hatası görünür (26).
ByteTrack/IoU değişimi ve eşik birleştirme P20d'dedir.
"""

import logging
import threading
import time
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np
import supervision as sv

from config import Config
from config import config as default_config

log = logging.getLogger("otel-kamera.tracker")

MatchInfo = Tuple[int, str, str, float]
PRUNE_EVERY_SECONDS = 30.0


def parse_polygon(text: str) -> Tuple[Optional[np.ndarray], bool]:
    """'x1,y1;x2,y2;x3,y3' → (noktalar, oranlı_mı). Tüm değerler 0..1 ise oranlıdır. Hatalıysa (None, False) ve uyarı."""
    if not text or not text.strip():
        return None, False
    try:
        points = []
        for pair in text.split(";"):
            x_s, y_s = pair.strip().split(",")
            points.append([float(x_s), float(y_s)])
        if len(points) < 3:
            raise ValueError("en az 3 nokta gerekir")
        arr = np.array(points, dtype=np.float64)
        return arr, bool(np.all((arr >= 0.0) & (arr <= 1.0)))
    except ValueError as exc:
        log.warning("Bölge poligonu okunamadı, bölge devre dışı: %s", exc)
        return None, False


class SecurityTracker:
    def __init__(
        self,
        polygon: Optional[np.ndarray] = None,
        settings: Config = default_config,
        clock: Callable[[], float] = time.time,
    ):
        self.settings = settings
        self._clock = clock
        self._lock = threading.RLock()

        self._raw_polygon: Optional[np.ndarray] = None
        self._normalized = False
        self.polygon: Optional[np.ndarray] = None
        self.zone: Optional[sv.PolygonZone] = None
        self._frame_size: Optional[Tuple[int, int]] = None
        if polygon is not None:
            self._raw_polygon, self._normalized = polygon.astype(np.float64), False
        else:
            self._raw_polygon, self._normalized = parse_polygon(settings.ZONE_POLYGON)
        self._build_zone(None)

        self._next_id = 1
        self._prev_centroids: Dict[int, Tuple[float, float, float]] = {}
        self._next_face_id = 1000
        self._prev_face_centroids: Dict[int, Tuple[float, float, float]] = {}

        self.alert_history: Dict[int, float] = {}
        self.recent_alert_embeddings: List[Tuple[np.ndarray, float]] = []
        # {tid: (eşleşme bilgisi, son gerçek eşleşme zamanı)}
        self.verified_tracks: Dict[int, Tuple[MatchInfo, float]] = {}
        # {tid: (ardışık kayıtsız sayı, son kayıtsız kare zamanı)}
        self.unknown_counts: Dict[int, Tuple[int, float]] = {}
        # doğrulanmış izde ardışık eşleşmeyen yüz sayısı
        self.mismatch_counts: Dict[int, int] = {}
        self._last_prune = clock()

    # ------------------------------------------------------------------ bölge

    def _build_zone(self, frame_size: Optional[Tuple[int, int]]) -> None:
        raw = self._raw_polygon
        if raw is None:
            self.polygon, self.zone = None, None
            return
        if self._normalized:
            if frame_size is None:
                return  # ilk kareyi bekler
            w, h = frame_size
            pixels = np.round(raw * np.array([w, h])).astype(np.int32)
        else:
            pixels = raw.astype(np.int32)
        self.polygon = pixels
        self.zone = sv.PolygonZone(polygon=pixels)

    def configure_frame(self, width: int, height: int) -> None:
        """Oranlı poligon ilk karede (ve çözünürlük değişince) piksele çevrilir."""
        with self._lock:
            if self._frame_size != (width, height):
                self._frame_size = (width, height)
                self._build_zone(self._frame_size)

    # ------------------------------------------------------------------ izleme

    def update_tracks(self, detections: sv.Detections) -> sv.Detections:
        if len(detections) == 0:
            return detections
        if detections.tracker_id is not None:
            return detections
        with self._lock:
            now = self._clock()
            self._prev_centroids = {tid: (cx, cy, ts) for tid, (cx, cy, ts) in self._prev_centroids.items() if now - ts < 6.0}
            assigned_ids: List[int] = []
            for xyxy in detections.xyxy:
                cx = float((xyxy[0] + xyxy[2]) / 2.0)
                cy = float((xyxy[1] + xyxy[3]) / 2.0)
                best_id = None
                best_dist = 380.0**2
                for tid, (px, py, _) in self._prev_centroids.items():
                    dist = (cx - px) ** 2 + (cy - py) ** 2
                    if dist < best_dist and tid not in assigned_ids:
                        best_dist = dist
                        best_id = tid
                if best_id is None:
                    best_id = self._next_id
                    self._next_id += 1
                self._prev_centroids[best_id] = (cx, cy, now)
                assigned_ids.append(best_id)
            detections.tracker_id = np.array(assigned_ids, dtype=int)
        return detections

    def filter_by_zone(self, detections: sv.Detections) -> sv.Detections:
        if self.zone is None or len(detections) == 0:
            return detections
        is_inside = self.zone.trigger(detections=detections)
        return detections[is_inside]

    def assign_face_to_tracker_id(self, face_bbox: np.ndarray, person_detections: sv.Detections) -> int:
        fx1, fy1, fx2, fy2 = face_bbox
        fcx = float((fx1 + fx2) / 2.0)
        fcy = float((fy1 + fy2) / 2.0)
        fw = float(fx2 - fx1)
        fh = float(fy2 - fy1)

        best_tid = None
        min_dist = float("inf")
        if len(person_detections) > 0 and person_detections.tracker_id is not None:
            for xyxy, tid in zip(person_detections.xyxy, person_detections.tracker_id):
                px1, py1, px2, py2 = xyxy
                pw = float(px2 - px1)
                ph = float(py2 - py1)
                x_ok = (px1 - 0.15 * pw) <= fcx <= (px2 + 0.15 * pw)
                y_ok = (py1 - 0.30 * ph) <= fcy <= (py1 + 0.75 * ph)
                if fh > 160 or fw > 160:
                    y_ok = (py1 - 0.35 * ph) <= fcy <= (py2 + 0.10 * ph)
                if x_ok and y_ok:
                    pcx = float((px1 + px2) / 2.0)
                    head_anchor_y = float(py1 + 0.22 * ph)
                    dist = (fcx - pcx) ** 2 + (fcy - head_anchor_y) ** 2
                    if dist < min_dist:
                        min_dist = dist
                        best_tid = int(tid)
        if best_tid is not None:
            return best_tid
        if fw < 95 and fh < 95 and len(person_detections) > 0:
            return -1

        with self._lock:
            now = self._clock()
            self._prev_face_centroids = {fid: (cx, cy, ts) for fid, (cx, cy, ts) in self._prev_face_centroids.items() if now - ts < 6.0}
            best_fid = None
            best_fdist = 280.0**2
            for fid, (px, py, _) in self._prev_face_centroids.items():
                d = (fcx - px) ** 2 + (fcy - py) ** 2
                if d < best_fdist:
                    best_fdist = d
                    best_fid = fid
            if best_fid is None:
                best_fid = self._next_face_id
                self._next_face_id += 1
            self._prev_face_centroids[best_fid] = (fcx, fcy, now)
            return best_fid

    # ------------------------------------------------------------------ kimlik doğrulama

    def register_verified(self, tracker_id: int, match_info: MatchInfo) -> None:
        """Gerçek bir eşleşme: kimlik tazelenir, sayaçlar sıfırlanır."""
        if tracker_id < 0:
            return
        with self._lock:
            self.verified_tracks[tracker_id] = (match_info, self._clock())
            self.unknown_counts.pop(tracker_id, None)
            self.mismatch_counts.pop(tracker_id, None)

    def get_verified(self, tracker_id: int) -> Optional[MatchInfo]:
        """Ömrü dolmamış doğrulanmış kimlik; dolduysa silinir ve None döner."""
        if tracker_id < 0:
            return None
        with self._lock:
            entry = self.verified_tracks.get(tracker_id)
            if entry is None:
                return None
            info, ts = entry
            if self._clock() - ts > self.settings.VERIFIED_TTL_SECONDS:
                del self.verified_tracks[tracker_id]
                self.mismatch_counts.pop(tracker_id, None)
                return None
            return info

    def resolve_unmatched(self, tracker_id: int) -> Optional[MatchInfo]:
        """Doğrulanmış izde yüz eşleşmedi. Ardışık CONFIRMATION_FRAMES kez eşleşmezse kimlik düşer (None);
        değilse (açı değişimi olabilir) bilgi korunur ama TAZELENMEZ — yabancı kimliği devralamaz."""
        with self._lock:
            info = self.get_verified(tracker_id)
            if info is None:
                return None
            misses = self.mismatch_counts.get(tracker_id, 0) + 1
            if misses >= self.settings.CONFIRMATION_FRAMES:
                self.verified_tracks.pop(tracker_id, None)
                self.mismatch_counts.pop(tracker_id, None)
                return None
            self.mismatch_counts[tracker_id] = misses
            return info

    @staticmethod
    def _cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
        na = float(np.linalg.norm(a))
        nb = float(np.linalg.norm(b))
        if na == 0.0 or nb == 0.0:
            return 0.0
        return float(np.dot(a, b)) / (na * nb)

    def record_unknown_and_check_alarm(self, tracker_id: int, embedding: Optional[np.ndarray] = None) -> bool:
        """Kayıtsız yüz görüldü. Alarm ancak CONFIRMATION_WINDOW_SECONDS içinde CONFIRMATION_FRAMES kez ardışık
        görülürse ve soğuma süresi (iz kimliği + yüz benzerliği) geçtiyse verilir."""
        if tracker_id < 0 or self.get_verified(tracker_id) is not None:
            return False
        with self._lock:
            now = self._clock()
            self._prune_locked(now)

            count, last = self.unknown_counts.get(tracker_id, (0, now))
            if now - last > self.settings.CONFIRMATION_WINDOW_SECONDS:
                count = 0
            count += 1
            self.unknown_counts[tracker_id] = (count, now)
            if count < self.settings.CONFIRMATION_FRAMES:
                return False

            cooldown = self.settings.ALARM_COOLDOWN_SECONDS
            self.recent_alert_embeddings = [(e, ts) for e, ts in self.recent_alert_embeddings if now - ts < cooldown]
            if now - self.alert_history.get(tracker_id, 0.0) < cooldown:
                return False
            if embedding is not None:
                for prev_emb, prev_ts in self.recent_alert_embeddings:
                    if self._cosine_sim(embedding, prev_emb) >= 0.40:
                        self.alert_history[tracker_id] = prev_ts
                        return False
            self.alert_history[tracker_id] = now
            self.unknown_counts[tracker_id] = (0, now)
            if embedding is not None:
                self.recent_alert_embeddings.append((embedding.copy(), now))
            return True

    # ------------------------------------------------------------------ bakım

    def _prune_locked(self, now: float) -> None:
        if now - self._last_prune < PRUNE_EVERY_SECONDS:
            return
        self._last_prune = now
        window = self.settings.CONFIRMATION_WINDOW_SECONDS
        ttl = self.settings.VERIFIED_TTL_SECONDS
        cooldown = self.settings.ALARM_COOLDOWN_SECONDS
        self.unknown_counts = {t: v for t, v in self.unknown_counts.items() if now - v[1] <= window}
        self.verified_tracks = {t: v for t, v in self.verified_tracks.items() if now - v[1] <= ttl}
        self.mismatch_counts = {t: n for t, n in self.mismatch_counts.items() if t in self.verified_tracks}
        self.alert_history = {t: ts for t, ts in self.alert_history.items() if now - ts <= cooldown}

    def prune(self) -> None:
        with self._lock:
            self._last_prune = float("-inf")
            self._prune_locked(self._clock())

    def clear_memory(self) -> None:
        """Misafir listesi değişince izleme hafızası sıfırlanır (kilit altında; kod bulgusu 15)."""
        with self._lock:
            self.verified_tracks.clear()
            self.unknown_counts.clear()
            self.mismatch_counts.clear()
            self.alert_history.clear()
            self.recent_alert_embeddings.clear()
