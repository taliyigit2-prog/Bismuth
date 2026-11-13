"""Alarm karesini yerelde saklar (eski `notifier.py`'nin Telegram'sız hâli).

K-50: Python tarafında dış servis yoktur; Telegram gönderimi Bismuth'tadır (`src/main/network/telegram/`).
Kod bulgusu 1: alarm karesi HAM karedir — kayıtlı misafirin adı/oda etiketi karenin üzerine çizilmez.
Kod bulgusu 27: dosya adı rastgele ek taşır, aynı saniyede aynı iz için üzerine yazılmaz.
"""

import logging
import os
import uuid
from datetime import datetime
from typing import Callable, Optional, Tuple

import cv2
import numpy as np

from config import Config
from config import config as default_config
from timeutil import now_local

log = logging.getLogger("otel-kamera.alerts")


class AlertRecorder:
    def __init__(
        self,
        settings: Config = default_config,
        clock: Callable[[], datetime] = now_local,
    ):
        self.settings = settings
        self.clock = clock
        os.makedirs(settings.ALERTS_DIR, exist_ok=True)

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
        return cv2.resize(crop, (240, 240))

    @classmethod
    def compose_alert_image(cls, frame: np.ndarray, face_bbox: Optional[np.ndarray] = None) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        """Ham kare + sağ üstte kayıtsız kişinin yakın yüz kırpması (yazısız)."""
        alert_img = frame.copy()
        zoomed = cls.extract_zoomed_face(frame, face_bbox)
        if zoomed is not None:
            h, w = alert_img.shape[:2]
            thumb, margin = 160, 14
            if h > thumb + margin * 2 and w > thumb + margin * 2:
                y0, y1 = margin + 30, margin + 30 + thumb
                if y1 < h:
                    x0, x1 = w - thumb - margin, w - margin
                    alert_img[y0:y1, x0:x1] = cv2.resize(zoomed, (thumb, thumb))
                    cv2.rectangle(alert_img, (x0, y0), (x1, y1), (45, 55, 225), 2)
        return alert_img, zoomed

    def snapshot_names(self, tracker_id: int) -> Tuple[str, str]:
        stamp = self.clock().strftime("%Y%m%d_%H%M%S_%f")
        unique = uuid.uuid4().hex[:8]
        base = f"{stamp}_id{tracker_id}_{unique}"
        return (
            os.path.join(self.settings.ALERTS_DIR, f"alert_{base}.jpg"),
            os.path.join(self.settings.ALERTS_DIR, f"face_{base}.jpg"),
        )

    def save_local_snapshots(self, alert_img: np.ndarray, zoomed_face: Optional[np.ndarray], tracker_id: int) -> Tuple[str, str]:
        scene_path, face_path = self.snapshot_names(tracker_id)
        save_img = alert_img
        h, w = alert_img.shape[:2]
        if w > 1280:
            save_img = cv2.resize(alert_img, (1280, int(h * 1280.0 / w)), interpolation=cv2.INTER_AREA)
        cv2.imwrite(scene_path, save_img, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
        if zoomed_face is None:
            return scene_path, ""
        cv2.imwrite(face_path, zoomed_face, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
        return scene_path, face_path

    def record(self, frame: np.ndarray, face_bbox: Optional[np.ndarray], tracker_id: int) -> Tuple[str, str]:
        alert_img, zoomed = self.compose_alert_image(frame, face_bbox)
        scene_path, face_path = self.save_local_snapshots(alert_img, zoomed, tracker_id)
        log.info("Alarm kaydedildi: %s", os.path.basename(scene_path))
        return scene_path, face_path
