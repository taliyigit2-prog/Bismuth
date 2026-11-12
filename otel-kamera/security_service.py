import os
import sys
import time
import ctypes
import threading
from datetime import datetime
from typing import List, Tuple, Optional, Dict, Any

# Xiaomi Wi-Fi Güçlendirici ve RTSP kameralar için TCP zorlama + 5 sn kopma zaman aşımı + sıfır gecikme tamponu
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
    "rtsp_transport;tcp|stimeout;5000000|rw_timeout;5000000|fflags;nobuffer|flags;low_delay"
)

import cv2
import numpy as np
from ultralytics import YOLO
import supervision as sv

from config import config
from database import GuestDatabase
from face_engine import FaceEngine
from tracker import SecurityTracker
from notifier import TelegramNotifier


class _ResilientCameraGrabber:
    """
    Elektrik kesintisi, NVR yeniden başlaması veya Xiaomi Wi-Fi sinyal güçlendirici
    anlık kopmalarında ana programı ASLA dondurmayan (Non-Blocking Watchdog) kamera okuyucu.
    Her zaman en güncel (0 gecikmeli) kareyi tutar; 8 saniye kare gelmezse bağlantıyı otomatik yeniler.
    """

    def __init__(self, source_str: str):
        self.source = int(source_str) if source_str.isdigit() else source_str
        self._lock = threading.Lock()
        self._frame: Optional[np.ndarray] = None
        self._last_frame_ts: float = 0.0
        self._connected: bool = False
        self._running: bool = True
        self._thread = threading.Thread(target=self._reader_loop, daemon=True)
        self._thread.start()

    def _open_cap(self) -> cv2.VideoCapture:
        cap = cv2.VideoCapture(self.source)
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            # OpenCV timeout parametreleri (desteklenen backend'ler için 5000 ms)
            try:
                cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
                cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
            except Exception:
                pass
        return cap

    def _reader_loop(self):
        cap: Optional[cv2.VideoCapture] = None
        backoff = 2.0

        while self._running:
            if cap is None or not cap.isOpened():
                with self._lock:
                    self._connected = False
                try:
                    if cap is not None:
                        cap.release()
                except Exception:
                    pass

                cap = self._open_cap()
                if not cap.isOpened():
                    time.sleep(min(backoff, 5.0))
                    continue

            ret, frame = cap.read()
            if not ret or frame is None:
                with self._lock:
                    self._connected = False
                try:
                    cap.release()
                except Exception:
                    pass
                cap = None
                print("[Kamera Watchdog] Sinyal kesildi! Elektrik/Ağ kontrol ediliyor, yeniden bağlanılacak...")
                time.sleep(3.0)
                continue

            now = time.time()
            with self._lock:
                self._frame = frame
                self._last_frame_ts = now
                self._connected = True

            # Webcam için CPU yormamak adına çok kısa bekleme
            time.sleep(0.005)

        if cap is not None:
            try:
                cap.release()
            except Exception:
                pass

    def get_latest_frame(self) -> Tuple[bool, Optional[np.ndarray]]:
        with self._lock:
            # Eğer son kareden bu yana 8 saniyeden fazla geçtiyse kamera donmuş demektir
            if not self._connected or self._frame is None or (time.time() - self._last_frame_ts > 8.0):
                return False, None
            return True, self._frame

    def stop(self):
        self._running = False


class SecurityService:
    def __init__(self, db: GuestDatabase):
        self.db = db
        self.face_engine = FaceEngine(config.INSIGHTFACE_MODEL_NAME)
        self.notifier = TelegramNotifier()
        self.tracker = SecurityTracker()

        print("[SecurityService] YOLO11 Nano (İnsan Tespiti) yükleniyor...")
        self.yolo_model = YOLO("yolo11n.pt")

        os.makedirs(config.GUEST_PHOTOS_DIR, exist_ok=True)
        os.makedirs(config.ALERTS_DIR, exist_ok=True)

        # Başlangıçta 30 günlük otomatik temizlik ve mükerrer fotoğraf ayıklamasını çalıştır
        maint = self.db.run_storage_maintenance()
        print(
            f"[Hafıza Yönetimi] 30 Günlük Temizlik Tamamlandı -> "
            f"Eski: {maint['removed_old_alerts']}, Mükerrer: {maint['removed_duplicate_alerts']}, "
            f"Sahipsiz Dosya: {maint['removed_orphan_files']} silindi."
        )

        self._lock = threading.Lock()
        self._engine_lock = threading.Lock()
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._grabber: Optional[_ResilientCameraGrabber] = None

        self.camera_connected: bool = False
        self.camera_covered: bool = False
        self.alarms_paused: bool = False
        self.latest_raw_frame: Optional[np.ndarray] = None
        self.latest_jpeg: Optional[bytes] = None
        self.active_guests: List[Tuple[int, str, str, np.ndarray]] = self.db.get_active_guests()
        self.last_detection_summary: str = "İzleme hazır"
        self.fps: float = 0.0
        self.reconnect_count: int = 0

    @staticmethod
    def _prevent_windows_sleep():
        """
        Otelin Windows bilgisayarının gece kimse dokunmadığında Uyku Moduna (Sleep)
        geçip kamera izlemesini durdurmasını engeller.
        """
        if sys.platform == "win32" or os.name == "nt":
            try:
                ES_CONTINUOUS = 0x80000000
                ES_SYSTEM_REQUIRED = 0x00000001
                ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)
            except Exception:
                pass

    @staticmethod
    def enhance_low_light_frame(frame: np.ndarray) -> np.ndarray:
        """
        Gece koridor ışıkları kısıldığında veya IR (kızılötesi) modda kontrastı
        otomatik iyileştirerek yüz tanıma başarısını korur.
        """
        small = cv2.resize(frame, (64, 36))
        mean_lum = float(np.mean(small))
        if 14.0 <= mean_lum <= 72.0:
            lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
            l_chan, a_chan, b_chan = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            l_chan = clahe.apply(l_chan)
            merged = cv2.merge((l_chan, a_chan, b_chan))
            return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)
        return frame

    def reload_guests(self):
        """Misafir eklendiğinde veya silindiğinde hafızayı anında tazeler."""
        with self._lock:
            self.active_guests = self.db.get_active_guests()
            self.tracker.clear_memory()
        print(f"[SecurityService] Aktif misafir imzası güncellendi (Toplam: {len(self.active_guests)} yüz profili).")

    @staticmethod
    def is_frame_dark_or_covered(frame: np.ndarray) -> bool:
        """
        Kamera kapatıldığında, telefon yüzüstü yatırıldığında veya tamamen siyah/boş
        bir ekran geldiğinde yanlış analiz ve alarm yapılmasını engeller.
        """
        if frame is None or frame.size == 0:
            return True
        small = cv2.resize(frame, (64, 36))
        mean_val = float(np.mean(small))
        std_val = float(np.std(small))
        if mean_val < 14.0:
            return True
        if mean_val < 24.0 and std_val < 7.5:
            return True
        return False

    @staticmethod
    def crop_face_portrait(frame: np.ndarray, bbox: np.ndarray) -> np.ndarray:
        """Misafir profil fotoğrafı için ham (yazısız/çizgisiz) kareden yüzü estetik payla kırpar."""
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = bbox.astype(int)
        pad_x = int((x2 - x1) * 0.32)
        pad_y = int((y2 - y1) * 0.32)
        cx1, cy1 = max(0, x1 - pad_x), max(0, y1 - pad_y)
        cx2, cy2 = min(w, x2 + pad_x), min(h, y2 + pad_y)
        crop = frame[cy1:cy2, cx1:cx2]
        if crop.size == 0:
            return frame
        return cv2.resize(crop, (240, 240))

    def extract_face_from_image(self, image: np.ndarray) -> Optional[Tuple[np.ndarray, np.ndarray]]:
        """
        Verilen görüntüden (kamera, yüklenen dosya veya alarm karesi) en net yüzün
        (512-D embedding, kırpılmış_portre_görseli) ikilisini döner.
        """
        if image is None or image.size == 0:
            return None
        enhanced = self.enhance_low_light_frame(image)
        with self._engine_lock:
            res = self.face_engine.extract_primary_embedding(enhanced)
            if res is None and image.shape[0] > 220 and image.shape[1] > 400:
                h, w = image.shape[:2]
                pip_region = image[25:220, max(0, w - 210):w]
                if pip_region.size > 0:
                    pip_res = self.face_engine.extract_primary_embedding(pip_region)
                    if pip_res is not None:
                        emb, pbbox = pip_res
                        portrait = self.crop_face_portrait(pip_region, pbbox)
                        return emb, portrait
        if res is None:
            return None
        embedding, bbox = res
        portrait = self.crop_face_portrait(image, bbox)
        return embedding, portrait

    def extract_face_from_live_camera(
        self, prefer_unregistered: bool = True
    ) -> Optional[Tuple[np.ndarray, np.ndarray]]:
        """
        O anki canlı kamera görüntüsünden misafir yüzünü yakalar.
        Eğer ekranda birden fazla kişi varsa (örneğin kayıtlı misafir + kayıtsız arkadaşı),
        öncelikli olarak henüz KBS'de KAYITLI OLMAYAN yüzü seçer!
        """
        with self._lock:
            if self.latest_raw_frame is None or self.camera_covered:
                return None
            frame_copy = self.latest_raw_frame.copy()
            current_guests = list(self.active_guests)

        enhanced = self.enhance_low_light_frame(frame_copy)
        with self._engine_lock:
            all_faces = self.face_engine.extract_all_embeddings(enhanced)

        if not all_faces:
            return None

        if prefer_unregistered and len(all_faces) > 1 and len(current_guests) > 0:
            for emb, bbox in all_faces:
                if self.face_engine.match_face(emb, current_guests) is None:
                    return emb, self.crop_face_portrait(frame_copy, bbox)

        best_emb, best_bbox = all_faces[0]
        return best_emb, self.crop_face_portrait(frame_copy, best_bbox)

    def identify_and_checkout_from_live_camera(self) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Kameranın önündeki kişileri yüzlerinden tarar ve aktif KBS misafiriyse
        anında çıkışını (Check-out) yapar.
        """
        with self._lock:
            if self.latest_raw_frame is None or self.camera_covered:
                return (
                    False,
                    "Şu anda kamera kapalı veya net bir görüntü yok.",
                    None,
                )
            frame_copy = self.latest_raw_frame.copy()
            current_guests = list(self.active_guests)

        enhanced = self.enhance_low_light_frame(frame_copy)
        with self._engine_lock:
            all_faces = self.face_engine.extract_all_embeddings(enhanced)

        if not all_faces:
            return (
                False,
                "Şu anda kamerada net bir yüz görünmüyor. Lütfen çıkış yapacak kişinin kameraya bakmasını sağlayın.",
                None,
            )

        best_match = None
        for emb, _ in all_faces:
            m = self.face_engine.match_face(emb, current_guests)
            if m is not None:
                if best_match is None or m[3] > best_match[3]:
                    best_match = m

        if best_match is None:
            return (
                False,
                "Kameradaki kişi aktif KBS listesinde kayıtlı bir misafir olarak bulunamadı.",
                None,
            )

        gid, name, room, score = best_match
        guest_info = self.db.get_guest_by_id(gid)
        ok = self.db.deactivate_guest(gid)
        if not ok:
            return False, f"{name} (Oda {room}) zaten çıkış yapmış.", None

        self.reload_guests()
        return (
            True,
            f"{name} (Oda {room}) yüzünden tanındı (%{int(score * 100)}) ve KBS çıkışı yapıldı.",
            guest_info,
        )

    def save_guest_photo(self, guest_id: int, portrait_img: np.ndarray) -> str:
        filename = f"guest_{guest_id}_{int(time.time())}.jpg"
        filepath = os.path.join(config.GUEST_PHOTOS_DIR, filename)
        cv2.imwrite(filepath, portrait_img, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
        return filepath

    @classmethod
    def draw_overlays(
        cls,
        raw_frame: np.ndarray,
        person_boxes: List[Tuple[np.ndarray, int, str, Tuple[int, int, int]]],
        face_boxes: List[Tuple[np.ndarray, str, Tuple[int, int, int]]],
        polygon: Optional[np.ndarray] = None,
        active_guest_count: int = 0,
        alarms_paused: bool = False,
        include_pip: bool = True,
        camera_covered: bool = False,
    ) -> np.ndarray:
        canvas = raw_frame.copy()
        h, w = canvas.shape[:2]

        now_str = datetime.now().strftime("%d.%m.%Y %H:%M:%S")
        if camera_covered:
            alarm_status = "KAMERA KAPALI / KARANLIK EKRAN"
            bar_color = (30, 65, 140)
        elif alarms_paused:
            alarm_status = "ALARMLAR DURAKLATILDI"
            bar_color = (25, 85, 165)
        else:
            alarm_status = "KBS DENETIM AKTIF"
            bar_color = (18, 18, 22)

        cv2.rectangle(canvas, (0, 0), (w, 34), bar_color, -1)
        header = f"{config.CAMERA_LOCATION}  |  Kayitli KBS Misafir: {active_guest_count}  |  {alarm_status}  |  {now_str}"
        cv2.putText(canvas, header, (12, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.50, (235, 235, 240), 1)

        if camera_covered:
            cv2.putText(
                canvas,
                "KAMERA KAPALI / KARANLIK EKRAN (ALARM URETILMEZ)",
                (max(20, w // 2 - 250), h // 2),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.65,
                (170, 175, 185),
                2,
            )
            return canvas

        if polygon is not None:
            cv2.polylines(canvas, [polygon], isClosed=True, color=(0, 165, 255), thickness=2)

        for xyxy, tid, status_text, color in person_boxes:
            x1, y1, x2, y2 = xyxy.astype(int)
            cv2.rectangle(canvas, (x1, y1), (x2, y2), color, 2)
            if status_text:
                cv2.putText(
                    canvas,
                    f"#{tid} {status_text}",
                    (x1, max(52, y1 - 8)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.55,
                    color,
                    2,
                )

        for bbox, label, color in face_boxes:
            fx1, fy1, fx2, fy2 = bbox.astype(int)
            cv2.rectangle(canvas, (fx1, fy1), (fx2, fy2), color, 2)
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.56, 2)
            ty = max(th + 46, fy1)
            cv2.rectangle(canvas, (fx1, ty - th - 8), (fx1 + tw + 10, ty), color, -1)
            cv2.putText(
                canvas,
                label,
                (fx1 + 5, ty - 5),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.56,
                (255, 255, 255),
                2,
            )

        if include_pip and len(face_boxes) > 0:
            primary_bbox, _, primary_color = face_boxes[0]
            zoom_crop = cls.crop_face_portrait(raw_frame, primary_bbox)
            pip_size = 144
            margin = 14
            y1_pip = 46
            y2_pip = y1_pip + pip_size
            x1_pip = w - pip_size - margin
            x2_pip = w - margin
            if y2_pip < h and x1_pip > 0:
                pip_resized = cv2.resize(zoom_crop, (pip_size, pip_size))
                canvas[y1_pip:y2_pip, x1_pip:x2_pip] = pip_resized
                cv2.rectangle(canvas, (x1_pip, y1_pip), (x2_pip, y2_pip), primary_color, 2)

        return canvas

    def _create_placeholder_jpeg(self, message: str) -> bytes:
        img = np.zeros((540, 960, 3), dtype=np.uint8)
        img[:] = (19, 18, 23)
        cv2.putText(img, "HOTEL SENTINEL", (330, 230), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (240, 240, 245), 2)
        cv2.putText(img, message, (210, 285), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (138, 140, 146), 1)
        cv2.putText(
            img,
            "Elektrik/Ag kesintisi sonrasi otomatik baglanti bekleniyor...",
            (195, 320),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.52,
            (105, 108, 115),
            1,
        )
        _, buf = cv2.imencode(".jpg", img)
        return buf.tobytes()

    def start(self):
        if self._running:
            return
        self._running = True
        self._prevent_windows_sleep()
        self.latest_jpeg = self._create_placeholder_jpeg("Kamera baglantisi kuruluyor...")
        self._grabber = _ResilientCameraGrabber(config.CAMERA_SOURCE)
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._grabber:
            self._grabber.stop()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3.0)

    def _UniqueGuestCount(self) -> int:
        with self._lock:
            unique_keys = {
                (name.strip().lower(), room.strip().lower())
                for _, name, room, _ in self.active_guests
            }
            return len(unique_keys)

    def _run_loop(self):
        frame_count = 0
        last_db_sync = time.time()
        last_maintenance_sync = time.time()
        last_fps_time = time.time()
        fps_counter = 0
        was_connected = True

        cached_person_boxes: List[Tuple[np.ndarray, int, str, Tuple[int, int, int]]] = []
        cached_face_boxes: List[Tuple[np.ndarray, str, Tuple[int, int, int]]] = []

        while self._running:
            ok_frame, frame = self._grabber.get_latest_frame() if self._grabber else (False, None)
            if not ok_frame or frame is None:
                if was_connected:
                    self.reconnect_count += 1
                    was_connected = False
                self.camera_connected = False
                self.last_detection_summary = "Kamera Bağlantısı Bekleniyor..."
                self.latest_jpeg = self._create_placeholder_jpeg(
                    "Kamera sinyali bekleniyor (Modem / NVR / Xiaomi Repeater)..."
                )
                time.sleep(1.0)
                continue

            if not was_connected:
                print("[SecurityService] Kamera bağlantısı otomatik olarak yeniden kuruldu!")
                was_connected = True

            self.camera_connected = True
            frame_count += 1
            fps_counter += 1

            now = time.time()
            if now - last_fps_time >= 1.0:
                self.fps = round(fps_counter / (now - last_fps_time), 1)
                fps_counter = 0
                last_fps_time = now

            with self._lock:
                self.latest_raw_frame = frame

            # Her 10 saniyede bir aktif misafir listesini tazele
            if now - last_db_sync > 10.0:
                with self._lock:
                    self.active_guests = self.db.get_active_guests()
                last_db_sync = now

            # Her 1 saatte bir 30 günlük otomatik disk/fotoğraf temizliğini ve Windows uyku engelleyiciyi çalıştır
            if now - last_maintenance_sync > 3600.0:
                self._prevent_windows_sleep()
                try:
                    self.db.run_storage_maintenance()
                except Exception as e:
                    print(f"[Hafıza Yönetimi Uyarısı] {e}")
                last_maintenance_sync = now

            # Siyah ekran / kapatılmış kamera kontrolü
            if self.is_frame_dark_or_covered(frame):
                self.camera_covered = True
                self.last_detection_summary = "Kamera Kapalı / Karanlık"
                cached_person_boxes = []
                cached_face_boxes = []
                annotated_dark = self.draw_overlays(
                    frame,
                    [],
                    [],
                    self.tracker.polygon,
                    self._UniqueGuestCount(),
                    self.alarms_paused,
                    include_pip=False,
                    camera_covered=True,
                )
                ok, encoded = cv2.imencode(".jpg", annotated_dark, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                if ok:
                    self.latest_jpeg = encoded.tobytes()
                time.sleep(0.04)
                continue
            else:
                self.camera_covered = False

            if frame_count % config.PROCESS_EVERY_N_FRAMES == 0:
                new_person_boxes = []
                new_face_boxes = []
                pending_alarms = []

                with self._lock:
                    current_guests = list(self.active_guests)

                analysis_frame = self.enhance_low_light_frame(frame)

                with self._engine_lock:
                    results = self.yolo_model(analysis_frame, classes=[0], verbose=False)[0]
                    detections = sv.Detections.from_ultralytics(results)
                    detections = self.tracker.update_tracks(detections)
                    valid_detections = self.tracker.filter_by_zone(detections)

                    detected_faces = (
                        self.face_engine.detect_faces(analysis_frame) if len(valid_detections) > 0 else []
                    )

                for face in detected_faces:
                    bbox = face.bbox.astype(int)
                    embedding = face.embedding
                    tid = self.tracker.assign_face_to_tracker_id(bbox, valid_detections)

                    if tid < 0:
                        continue

                    match = self.face_engine.match_face(embedding, current_guests)

                    if match is not None:
                        gid, name, room, score = match
                        self.tracker.register_verified(tid, match)
                        label = f"KAYITLI: {name} (Oda {room}) %{int(score * 100)}"
                        color = (120, 175, 65)  # BGR Yeşil (#44a282)
                        new_face_boxes.append((bbox, label, color))
                        self.last_detection_summary = f"Kayıtlı: {name} (Oda {room})"
                    else:
                        prev_verified = self.tracker.get_verified(tid)
                        if prev_verified is not None:
                            _, name, room, _ = prev_verified
                            label = f"KAYITLI: {name} (Oda {room})"
                            color = (120, 175, 65)
                            new_face_boxes.append((bbox, label, color))
                        else:
                            label = "TANIMSIZ / KBS KAYITSIZ!"
                            color = (95, 75, 225)  # BGR Kırmızı (#e5566f)
                            new_face_boxes.append((bbox, label, color))
                            self.last_detection_summary = f"Tanımsız Kişi (#{tid})"

                            if not self.alarms_paused and self.tracker.record_unknown_and_check_alarm(
                                tid, embedding=embedding
                            ):
                                pending_alarms.append((tid, bbox, embedding))

                if len(valid_detections) > 0 and valid_detections.tracker_id is not None:
                    for xyxy, tid_val in zip(valid_detections.xyxy, valid_detections.tracker_id):
                        tid_int = int(tid_val)
                        ver = self.tracker.get_verified(tid_int)
                        if ver is not None:
                            _, name, room, _ = ver
                            new_person_boxes.append((xyxy, tid_int, f"{name} ({room})", (120, 175, 65)))
                        else:
                            new_person_boxes.append((xyxy, tid_int, "", (140, 140, 145)))

                unique_guest_cnt = self._UniqueGuestCount()
                for tid, bbox, embedding in pending_alarms:
                    alert_canvas = self.draw_overlays(
                        frame,
                        new_person_boxes,
                        new_face_boxes,
                        self.tracker.polygon,
                        unique_guest_cnt,
                        self.alarms_paused,
                        include_pip=False,
                    )
                    scene_path, face_crop_path = self.notifier.send_alert_with_crop(
                        frame=alert_canvas,
                        face_bbox=bbox,
                        raw_frame=frame,
                        tracker_id=tid,
                        title="🚨 KBS KAYITSIZ GİRİŞ TESPİT EDİLDİ!",
                    )
                    self.db.log_alert(
                        image_path=scene_path,
                        details=f"Tanımsız Kişi (Takip #{tid})",
                        face_crop_path=face_crop_path,
                        embedding=embedding,
                    )

                cached_person_boxes = new_person_boxes
                cached_face_boxes = new_face_boxes

            annotated = self.draw_overlays(
                frame,
                cached_person_boxes,
                cached_face_boxes,
                self.tracker.polygon,
                self._UniqueGuestCount(),
                self.alarms_paused,
                include_pip=True,
                camera_covered=self.camera_covered,
            )

            ok, encoded = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
            if ok:
                self.latest_jpeg = encoded.tobytes()

            time.sleep(0.015)

    def get_status(self) -> Dict[str, Any]:
        return {
            "camera_connected": self.camera_connected,
            "camera_covered": self.camera_covered,
            "camera_location": config.CAMERA_LOCATION,
            "active_guests_count": self._UniqueGuestCount(),
            "alarms_paused": self.alarms_paused,
            "fps": self.fps,
            "last_detection": self.last_detection_summary,
            "telegram_configured": bool(config.TELEGRAM_BOT_TOKEN and config.TELEGRAM_CHAT_ID),
            "retention_days": config.ALERT_RETENTION_DAYS,
        }
