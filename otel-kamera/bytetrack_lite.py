"""ByteTrack benzeri izleyici (kod bulgusu 2): yalnız numpy, ek bağımlılık yok.

Eski "merkez yakınlığı (380 px)" izleyicisi yan yana iki kişiyi karıştırabiliyor, ayrılan kişinin kimliğini yakındaki
yabancıya devrediyordu. Burada ilişkilendirme kutu örtüşmesine (IoU) dayanır ve ByteTrack'in iki aşamalı fikrini kullanır:

1. Yüksek güvenli tespitler, tüm izlerin (hız ile ileri taşınmış) tahminlerine IoU ile eşleştirilir.
2. Kalan düşük güvenli tespitler, hâlâ eşleşmemiş izlere bağlanır (kısmen örtülü kişi izi koparmaz); düşük güvenli bir
   tespit TEK BAŞINA yeni iz açmaz.
3. Eşleşmeyen yüksek güvenli tespit yeni iz olur; hiç görülmeyen iz `buffer_seconds` sonra silinir.

Zaman saniye cinsindendir (analiz her N. karede çalıştığı için kare sayısı değil gerçek süre esas alınır).
`supervision` 0.31'de `ByteTrack` yoktur (ayrı pakete taşındı); kalman süzgeci gerekmeyecek kadar küçük sahnelerde
(en çok birkaç kişi) sabit hız tahmini yeterlidir.
"""

import threading
import time
from dataclasses import dataclass
from typing import Callable, List, Optional, Tuple

import numpy as np

MAX_PREDICT_SECONDS = 1.0  # bundan uzun boşlukta konum tahmini ileri taşınmaz


def iou_matrix(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """(N,4) ve (M,4) xyxy kutuları için (N,M) IoU."""
    if len(a) == 0 or len(b) == 0:
        return np.zeros((len(a), len(b)), dtype=np.float64)
    ix1 = np.maximum(a[:, None, 0], b[None, :, 0])
    iy1 = np.maximum(a[:, None, 1], b[None, :, 1])
    ix2 = np.minimum(a[:, None, 2], b[None, :, 2])
    iy2 = np.minimum(a[:, None, 3], b[None, :, 3])
    inter = np.clip(ix2 - ix1, 0, None) * np.clip(iy2 - iy1, 0, None)
    area_a = np.clip(a[:, 2] - a[:, 0], 0, None) * np.clip(a[:, 3] - a[:, 1], 0, None)
    area_b = np.clip(b[:, 2] - b[:, 0], 0, None) * np.clip(b[:, 3] - b[:, 1], 0, None)
    union = area_a[:, None] + area_b[None, :] - inter
    return np.where(union > 0, inter / np.where(union > 0, union, 1.0), 0.0)


def greedy_match(iou: np.ndarray, threshold: float) -> List[Tuple[int, int]]:
    """En yüksek IoU'dan başlayarak bire bir eşleştirir (≥ eşik). Belirleyicidir; sahne küçük olduğundan yeterlidir."""
    pairs: List[Tuple[int, int]] = []
    if iou.size == 0:
        return pairs
    work = iou.copy()
    while True:
        flat = int(np.argmax(work))
        row, col = divmod(flat, work.shape[1])
        if work[row, col] < threshold:
            return pairs
        pairs.append((row, col))
        work[row, :] = -1.0
        work[:, col] = -1.0


@dataclass
class _Track:
    track_id: int
    box: np.ndarray  # son görülen xyxy
    last_seen: float
    velocity: np.ndarray  # px/sn, xyxy ile aynı boyutta (4)
    hits: int = 1

    def predicted(self, now: float) -> np.ndarray:
        dt = min(max(now - self.last_seen, 0.0), MAX_PREDICT_SECONDS)
        return self.box + self.velocity * dt


class ByteTrackLite:
    def __init__(
        self,
        high_score: float = 0.5,
        low_score: float = 0.1,
        match_iou: float = 0.3,
        buffer_seconds: float = 4.0,
        first_id: int = 1,
        clock: Optional[Callable[[], float]] = None,
    ):
        self.high_score = high_score
        self.low_score = low_score
        self.match_iou = match_iou
        self.buffer_seconds = buffer_seconds
        self._clock = clock or time.time
        self._next_id = first_id
        self._tracks: List[_Track] = []
        self._lock = threading.Lock()

    @property
    def track_count(self) -> int:
        with self._lock:
            return len(self._tracks)

    def reset(self) -> None:
        with self._lock:
            self._tracks.clear()

    def update(self, boxes: np.ndarray, scores: Optional[np.ndarray] = None) -> np.ndarray:
        """Her tespit için iz kimliği döner; iz açılmayan (düşük güvenli, eşleşmeyen) tespit için -1."""
        boxes = np.asarray(boxes, dtype=np.float64).reshape(-1, 4)
        count = len(boxes)
        confidences = np.ones(count) if scores is None else np.asarray(scores, dtype=np.float64).reshape(-1)
        ids = np.full(count, -1, dtype=int)
        with self._lock:
            now = self._clock()
            self._tracks = [t for t in self._tracks if now - t.last_seen <= self.buffer_seconds]
            if count == 0:
                return ids

            high = [i for i in range(count) if confidences[i] >= self.high_score]
            low = [i for i in range(count) if self.low_score <= confidences[i] < self.high_score]
            predicted = np.array([t.predicted(now) for t in self._tracks]).reshape(-1, 4)
            unmatched_tracks = list(range(len(self._tracks)))

            # 1. aşama: yüksek güvenli tespit ↔ tüm izler
            matches = greedy_match(iou_matrix(boxes[high], predicted), self.match_iou)
            matched_high = set()
            for det_pos, trk_pos in matches:
                self._apply(self._tracks[trk_pos], boxes[high[det_pos]], now)
                ids[high[det_pos]] = self._tracks[trk_pos].track_id
                matched_high.add(det_pos)
            used = {trk for _, trk in matches}
            unmatched_tracks = [t for t in unmatched_tracks if t not in used]

            # 2. aşama: düşük güvenli tespit ↔ eşleşmemiş izler (yeni iz açmaz)
            if low and unmatched_tracks:
                sub_pred = predicted[unmatched_tracks]
                for det_pos, trk_pos in greedy_match(iou_matrix(boxes[low], sub_pred), self.match_iou):
                    track = self._tracks[unmatched_tracks[trk_pos]]
                    self._apply(track, boxes[low[det_pos]], now)
                    ids[low[det_pos]] = track.track_id

            # Yeni izler: eşleşmeyen yüksek güvenli tespitler
            for det_pos, det in enumerate(high):
                if det_pos in matched_high:
                    continue
                track = _Track(self._next_id, boxes[det].copy(), now, np.zeros(4))
                self._next_id += 1
                self._tracks.append(track)
                ids[det] = track.track_id
        return ids

    @staticmethod
    def _apply(track: _Track, box: np.ndarray, now: float) -> None:
        dt = now - track.last_seen
        if 1e-3 < dt <= MAX_PREDICT_SECONDS:
            measured = (box - track.box) / dt
            track.velocity = 0.5 * track.velocity + 0.5 * measured  # gürültüyü yumuşat
        elif dt > MAX_PREDICT_SECONDS:
            track.velocity = np.zeros(4)
        track.box = box.copy()
        track.last_seen = now
        track.hits += 1
