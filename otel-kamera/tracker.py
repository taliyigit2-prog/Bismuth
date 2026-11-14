"""Kişi izleme ve alarm kararı.

P20a düzeltmeleri: doğrulanmış kimliğin ömrü var ve yalnız gerçek eşleşmeyle tazelenir; yabancı yüz tekrar tekrar
eşleşmezse kimlik düşer (3, tailgating); kayıtsız sayaç zaman pencereli ve sözlükler periyodik temizlenir (4);
tüm paylaşılan durum tek kilit altında (15); poligon 0..1 oranlı verilebilir ve ayrıştırma hatası görünür (26).
P20d: kişi ve yüz izleme `bytetrack_lite` (IoU, iki aşamalı; kod bulgusu 2); kişi kutusu yokken yüz de izlenir (5);
alarm tekrar-tanıma tek ayarlı eşiği kullanır (6); bölge dışı yüzler `face_in_zone` ile elenir.
"""

import logging
import threading
import time
from typing import Callable, Dict, List, Optional, Tuple

import cv2
import numpy as np
import supervision as sv

from bytetrack_lite import ByteTrackLite
from config import Config
from config import config as default_config

log = logging.getLogger("otel-kamera.tracker")

MatchInfo = Tuple[str, str, str, float]
PRUNE_EVERY_SECONDS = 30.0
FACE_ID_BASE = 1000  # kişi kutusuna bağlanamayan yüzlerin iz kimlikleri bu değerden başlar


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

        track_args = dict(
            high_score=settings.TRACK_HIGH_SCORE,
            low_score=settings.TRACK_LOW_SCORE,
            buffer_seconds=settings.TRACK_BUFFER_SECONDS,
            clock=clock,
        )
        self._persons = ByteTrackLite(match_iou=settings.TRACK_MATCH_IOU, first_id=1, **track_args)
        # Kişi kutusu olmayan yüzler (1000+): yüz kutuları küçük ve oynak olduğundan eşik daha gevşek
        face_args = {**track_args, "high_score": 0.0}  # yüzler `MIN_FACE_DET_SCORE` ile zaten süzülmüştür
        self._faces = ByteTrackLite(match_iou=min(settings.TRACK_MATCH_IOU, 0.2), first_id=FACE_ID_BASE, **face_args)

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
        """Kişi kutularına kalıcı iz kimliği verir (ByteTrack benzeri). Zaten kimliği olan tespit olduğu gibi döner.
        Düşük güvenli ve eşleşmeyen tespitler iz açmaz, listeden çıkar."""
        if detections.tracker_id is not None:
            return detections
        confidence = detections.confidence if detections.confidence is not None else np.ones(len(detections))
        with self._lock:
            ids = self._persons.update(detections.xyxy, confidence)
        keep = ids >= 0
        detections = detections[keep]
        detections.tracker_id = ids[keep].astype(int)
        return detections

    def filter_by_zone(self, detections: sv.Detections) -> sv.Detections:
        if self.zone is None or len(detections) == 0:
            return detections
        is_inside = self.zone.trigger(detections=detections)
        return detections[is_inside]

    def face_in_zone(self, face_bbox: np.ndarray) -> bool:
        """Yüzün merkezi geçiş bölgesinde mi? Bölge yoksa her yüz bölgededir."""
        with self._lock:
            polygon = self.polygon
        if polygon is None:
            return True
        cx = float((face_bbox[0] + face_bbox[2]) / 2.0)
        cy = float((face_bbox[1] + face_bbox[3]) / 2.0)
        return cv2.pointPolygonTest(polygon.reshape(-1, 1, 2).astype(np.float32), (cx, cy), False) >= 0

    @staticmethod
    def _person_for_face(face_bbox: np.ndarray, person_detections: sv.Detections) -> Optional[int]:
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
        return best_tid

    def assign_faces(
        self,
        face_bboxes: List[np.ndarray],
        person_detections: sv.Detections,
        face_scores: Optional[List[float]] = None,
    ) -> List[int]:
        """Her yüze iz kimliği verir: önce yüzü içeren kişi kutusunun kimliği; kişi kutusu yoksa (YOLO kaçırdı / yakın
        çekim, kod bulgusu 5) yüz kutusunun kendi izi (1000+). Kişi kutuları varken kutulara düşmeyen KÜÇÜK yüzler
        (arka plan) -1 alır ve yok sayılır. Yüz izleyici her çağrıda bir kez ilerler (çağrı başına tek analiz turu)."""
        tids: List[int] = [-1] * len(face_bboxes)
        pending: List[int] = []
        for i, bbox in enumerate(face_bboxes):
            owner = self._person_for_face(bbox, person_detections)
            if owner is not None:
                tids[i] = owner
                continue
            small = float(bbox[2] - bbox[0]) < 95 and float(bbox[3] - bbox[1]) < 95
            if small and len(person_detections) > 0:
                continue
            pending.append(i)
        boxes = np.array([face_bboxes[i] for i in pending], dtype=np.float64).reshape(-1, 4)
        scores = np.array([1.0 if face_scores is None else face_scores[i] for i in pending], dtype=np.float64)
        with self._lock:
            ids = self._faces.update(boxes, scores)
        for slot, face_id in zip(pending, ids):
            tids[slot] = int(face_id)
        return tids

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
                    if self._cosine_sim(embedding, prev_emb) >= self.settings.FACE_SIMILARITY_THRESHOLD:
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
