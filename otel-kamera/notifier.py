import os
import time
import threading
from datetime import datetime
from typing import Optional, List, Tuple
import cv2
import numpy as np
import requests
from config import config


class TelegramNotifier:
    def __init__(self, bot_token: Optional[str] = None, chat_ids_str: Optional[str] = None):
        self.bot_token = (bot_token if bot_token is not None else config.TELEGRAM_BOT_TOKEN).strip()
        raw_ids = chat_ids_str if chat_ids_str is not None else config.TELEGRAM_CHAT_ID
        self.chat_ids: List[str] = [cid.strip() for cid in raw_ids.split(",") if cid.strip()]

        os.makedirs(config.ALERTS_DIR, exist_ok=True)

    @staticmethod
    def extract_zoomed_face(frame: np.ndarray, face_bbox: Optional[np.ndarray] = None) -> Optional[np.ndarray]:
        """Şüphelinin yüzünü etrafında estetik bir pay bırakarak yüksek netlikte kırpar."""
        if face_bbox is None:
            return None
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = face_bbox.astype(int)
        pad_x = int((x2 - x1) * 0.30)
        pad_y = int((y2 - y1) * 0.30)
        cx1, cy1 = max(0, x1 - pad_x), max(0, y1 - pad_y)
        cx2, cy2 = min(w, x2 + pad_x), min(h, y2 + pad_y)
        face_crop = frame[cy1:cy2, cx1:cx2]
        if face_crop.size == 0:
            return None
        return cv2.resize(face_crop, (240, 240))

    @classmethod
    def compose_alert_image(
        cls,
        frame: np.ndarray,
        face_bbox: Optional[np.ndarray] = None,
        raw_frame: Optional[np.ndarray] = None,
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        """
        Tam kare görüntünün sağ üst köşesine şüphelinin yakınlaştırılmış yüzünü (PIP) ekler
        ve aynı zamanda kırpılmış yakın plan yüzü ayrı bir görsel olarak döner.
        """
        alert_img = frame.copy()
        source_for_crop = raw_frame if raw_frame is not None else frame
        zoomed_face = cls.extract_zoomed_face(source_for_crop, face_bbox)

        if zoomed_face is not None:
            h, w = alert_img.shape[:2]
            thumb_size = 160
            face_thumb = cv2.resize(zoomed_face, (thumb_size, thumb_size))
            margin = 14
            if h > thumb_size + margin * 2 and w > thumb_size + margin * 2:
                y_start, y_end = margin + 30, margin + 30 + thumb_size
                if y_end < h:
                    x_start, x_end = w - thumb_size - margin, w - margin
                    alert_img[y_start:y_end, x_start:x_end] = face_thumb
                    cv2.rectangle(alert_img, (x_start, y_start), (x_end, y_end), (45, 55, 225), 2)

        return alert_img, zoomed_face

    def save_local_snapshots(
        self,
        alert_img: np.ndarray,
        zoomed_face: Optional[np.ndarray],
        tracker_id: int,
    ) -> Tuple[str, str]:
        """
        Tam sahne alarm fotoğrafını (disk tasarrufu için 720p optimize JPEG olarak)
        ve yakınlaştırılmış yüz fotoğrafını 'alerts/' klasörüne kaydeder.
        """
        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:18]
        scene_filename = f"alert_{ts}_id{tracker_id}.jpg"
        scene_path = os.path.join(config.ALERTS_DIR, scene_filename)

        # Disk doluluğunu %75 azaltmak için >1280px genişlikteki kareleri 1280px HD boyuta ölçekle
        save_img = alert_img
        h, w = alert_img.shape[:2]
        if w > 1280:
            scale = 1280.0 / float(w)
            save_img = cv2.resize(alert_img, (1280, int(h * scale)), interpolation=cv2.INTER_AREA)

        cv2.imwrite(scene_path, save_img, [int(cv2.IMWRITE_JPEG_QUALITY), 82])

        face_path = ""
        if zoomed_face is not None:
            face_filename = f"face_{ts}_id{tracker_id}.jpg"
            face_path = os.path.join(config.ALERTS_DIR, face_filename)
            cv2.imwrite(face_path, zoomed_face, [int(cv2.IMWRITE_JPEG_QUALITY), 88])

        return scene_path, face_path

    def _send_telegram_worker(self, img_bytes: bytes, caption: str):
        """
        Xiaomi sinyal güçlendirici veya internet dalgalanmalarında mesajın kaybolmaması için
        3 kademeli otomatik yeniden deneme (retry) mekanizması içerir.
        """
        url = f"https://api.telegram.org/bot{self.bot_token}/sendPhoto"
        retry_delays = [0, 3, 8]
        for chat_id in self.chat_ids:
            for attempt, delay in enumerate(retry_delays, start=1):
                if delay > 0:
                    time.sleep(delay)
                files = {"photo": ("alert.jpg", img_bytes, "image/jpeg")}
                data = {"chat_id": chat_id, "caption": caption, "parse_mode": "Markdown"}
                try:
                    response = requests.post(url, data=data, files=files, timeout=12)
                    if response.status_code == 200:
                        print(f"[TELEGRAM] Bildirim gönderildi -> Chat ID: {chat_id}")
                        break
                    else:
                        print(f"[TELEGRAM HATA] Deneme {attempt} ({response.status_code}) -> {response.text}")
                except Exception as e:
                    print(f"[TELEGRAM BAĞLANTI HATASI] Deneme {attempt} ({chat_id}): {e}")

    def send_alert_with_crop(
        self,
        frame: np.ndarray,
        face_bbox: Optional[np.ndarray] = None,
        raw_frame: Optional[np.ndarray] = None,
        tracker_id: int = 0,
        title: str = "🚨 KBS DIŞI GİRİŞ UYARISI!",
        location: Optional[str] = None,
        async_send: bool = True,
    ) -> Tuple[str, str]:
        loc = location or config.CAMERA_LOCATION
        alert_img, zoomed_face = self.compose_alert_image(frame, face_bbox, raw_frame=raw_frame)
        scene_path, face_path = self.save_local_snapshots(alert_img, zoomed_face, tracker_id)
        now_str = datetime.now().strftime("%d.%m.%Y %H:%M:%S")

        print(f"[ALARM] Yetkisiz kişi kaydedildi: {scene_path} (Yüz: {face_path})")

        if not self.bot_token or not self.chat_ids:
            print("[BİLGİ] Telegram Token/Chat ID tanımlı değil (.env). Sadece yerel kayıt alındı.")
            return scene_path, face_path

        caption = (
            f"{title}\n\n"
            f"📍 *Konum:* {loc}\n"
            f"⏰ *Zaman:* {now_str}\n"
            f"🆔 *Takip No:* #{tracker_id}\n"
            f"⚠️ *Durum:* Bu kişi aktif KBS misafir listesinde bulunamadı!"
        )

        success, encoded_img = cv2.imencode(".jpg", alert_img, [int(cv2.IMWRITE_JPEG_QUALITY), 84])
        if not success:
            return scene_path, face_path

        img_bytes = encoded_img.tobytes()

        if async_send:
            t = threading.Thread(
                target=self._send_telegram_worker,
                args=(img_bytes, caption),
                daemon=True,
            )
            t.start()
        else:
            self._send_telegram_worker(img_bytes, caption)

        return scene_path, face_path
