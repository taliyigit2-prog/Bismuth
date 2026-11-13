"""Alarm için yüz kırpması üretir — YALNIZ bellekte (P20c; K-51, K-53).

K-50: Python tarafında dış servis yoktur; Telegram gönderimi Bismuth'tadır (`src/main/network/telegram/`).
Diske hiçbir şey yazılmaz: kırpma JPEG baytı olarak `AlertQueue`'ya girer, Bismuth çekip şifreli veritabanına yazar.
Kod bulgusu 1: kırpma HAM karedendir — kayıtlı misafirin adı/oda etiketi çizilmez.
"""

import logging
from typing import Optional

import cv2
import numpy as np

log = logging.getLogger("otel-kamera.alerts")

CROP_SIZE = 240
CROP_QUALITY = 88
SCENE_MAX_WIDTH = 480
SCENE_QUALITY = 80


class AlertRecorder:
    @staticmethod
    def extract_zoomed_face(frame: np.ndarray, face_bbox: Optional[np.ndarray] = None) -> Optional[np.ndarray]:
        if face_bbox is None:
            return None
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = face_bbox.astype(int)
        pad_x = int((x2 - x1) * 0.30)
        pad_y = int((y2 - y1) * 0.30)
        crop = frame[max(0, y1 - pad_y) : min(h, y2 + pad_y), max(0, x1 - pad_x) : min(w, x2 + pad_x)]
        if crop.size == 0:
            return None
        return cv2.resize(crop, (CROP_SIZE, CROP_SIZE))

    def crop_jpeg(self, frame: np.ndarray, face_bbox: Optional[np.ndarray]) -> bytes:
        """Yakın yüz kırpması (JPEG). Yüz kutusu yoksa küçültülmüş sahne. Kodlanamazsa boş bayt."""
        zoomed = self.extract_zoomed_face(frame, face_bbox)
        if zoomed is not None:
            ok, buf = cv2.imencode(".jpg", zoomed, [int(cv2.IMWRITE_JPEG_QUALITY), CROP_QUALITY])
        else:
            h, w = frame.shape[:2]
            scene = frame
            if w > SCENE_MAX_WIDTH:
                scene = cv2.resize(frame, (SCENE_MAX_WIDTH, max(1, int(h * SCENE_MAX_WIDTH / w))), interpolation=cv2.INTER_AREA)
            ok, buf = cv2.imencode(".jpg", scene, [int(cv2.IMWRITE_JPEG_QUALITY), SCENE_QUALITY])
        return buf.tobytes() if ok else b""
