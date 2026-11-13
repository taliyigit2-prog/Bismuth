"""Analiz hizmeti: kamera karesi → kişi tespiti → yüz tanıma → alarm kararı.

P20a: döngü gövdesi try/except + sağlık sayacı içindedir, bir istisna iş parçacığını öldürmez (12, 13); alarm
karesi etiketsiz ham karedir (1); kayıtlı yüz her karede yeniden eşleştirilir, kimlik devralınamaz (3); ağır
bağımlılıklar (ultralytics, insightface) yalnız varsayılan kurulumda içe aktarılır, bu yüzden hizmet sahte
bileşenlerle (`person_detector`, `face_engine`, `grabber_factory`) test edilir.
"""

import logging
import os
import sys
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

import cv2
import numpy as np
import supervision as sv

from alert_recorder import AlertRecorder
from camera_grabber import ResilientCameraGrabber
from config import Config
from config import config as default_config
from database import GuestDatabase
from face_engine import FaceEngine
from health import LoopHealth
from timeutil import now_local
from tracker import SecurityTracker

log = logging.getLogger("otel-kamera.service")

PersonDetector = Callable[[np.ndarray], sv.Detections]
Box = Tuple[np.ndarray, int, str, Tuple[int, int, int]]
FaceBox = Tuple[np.ndarray, str, Tuple[int, int, int]]

GREEN = (120, 175, 65)
RED = (95, 75, 225)
ERROR_BACKOFF_MAX = 5.0


def build_person_detector(model_path: str = "yolo11n.pt") -> PersonDetector:
    """YOLO11n insan tespiti. `ultralytics` yalnız burada içe aktarılır (model paket içindedir; ilk açılışta indirme
    yok: P20d). Çıktı supervision `Detections`."""
    from ultralytics import YOLO

    model = YOLO(model_path)

    def detect(frame: np.ndarray) -> sv.Detections:
        results = model(frame, classes=[0], verbose=False)[0]
        return sv.Detections.from_ultralytics(results)

    return detect


@dataclass
class _LoopState:
    frame_count: int = 0
    last_db_sync: float = field(default_factory=time.time)
    last_expiry_sync: float = field(default_factory=time.time)
    last_maintenance: float = field(default_factory=time.time)
    last_fps_time: float = field(default_factory=time.time)
    fps_counter: int = 0
    was_connected: bool = True
    person_boxes: List[Box] = field(default_factory=list)
    face_boxes: List[FaceBox] = field(default_factory=list)


class SecurityService:
    def __init__(
        self,
        db: GuestDatabase,
        settings: Config = default_config,
        face_engine: Optional[FaceEngine] = None,
        person_detector: Optional[PersonDetector] = None,
        recorder: Optional[AlertRecorder] = None,
        tracker: Optional[SecurityTracker] = None,
        grabber_factory: Callable[..., Any] = ResilientCameraGrabber,
        clock: Callable[[], float] = time.time,
        sleep: Callable[[float], None] = time.sleep,
        run_maintenance_on_start: bool = True,
    ):
        self.db = db
        self.settings = settings
        self.face_engine = face_engine or FaceEngine(settings.INSIGHTFACE_MODEL_NAME, settings=settings)
        self.person_detector = person_detector or build_person_detector()
        self.recorder = recorder or AlertRecorder(settings)
        self.tracker = tracker or SecurityTracker(settings=settings)
        self._grabber_factory = grabber_factory
        self._clock = clock
        self._sleep = sleep
        self.health = LoopHealth(clock)

        os.makedirs(settings.GUEST_PHOTOS_DIR, exist_ok=True)
        if run_maintenance_on_start:
            maint = db.run_storage_maintenance()
            log.info("Açılış temizliği: %s", maint)

        self._lock = threading.Lock()
        self._engine_lock = threading.Lock()
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._grabber: Any = None

        self.camera_connected = False
        self.camera_covered = False
        self.alarms_paused = False
        self.latest_raw_frame: Optional[np.ndarray] = None
        self.latest_jpeg: Optional[bytes] = None
        self.active_guests: List[Tuple[int, str, str, np.ndarray]] = db.get_active_guests()
        self.last_detection_summary = "İzleme hazır"
        self.fps = 0.0
        self.reconnect_count = 0

    # ------------------------------------------------------------------ yardımcılar

    @staticmethod
    def _prevent_windows_sleep() -> None:
        if sys.platform == "win32" or os.name == "nt":
            try:
                import ctypes

                ctypes.windll.kernel32.SetThreadExecutionState(0x80000000 | 0x00000001)  # type: ignore[attr-defined]
            except Exception:
                pass

    @staticmethod
    def enhance_low_light_frame(frame: np.ndarray) -> np.ndarray:
        small = cv2.resize(frame, (64, 36))
        mean_lum = float(np.mean(small))
        if 14.0 <= mean_lum <= 72.0:
            lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
            l_chan, a_chan, b_chan = cv2.split(lab)
            l_chan = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l_chan)
            return cv2.cvtColor(cv2.merge((l_chan, a_chan, b_chan)), cv2.COLOR_LAB2BGR)
        return frame

    @staticmethod
    def is_frame_dark_or_covered(frame: Optional[np.ndarray]) -> bool:
        if frame is None or frame.size == 0:
            return True
        small = cv2.resize(frame, (64, 36))
        mean_val = float(np.mean(small))
        std_val = float(np.std(small))
        return mean_val < 14.0 or (mean_val < 24.0 and std_val < 7.5)

    @staticmethod
    def crop_face_portrait(frame: np.ndarray, bbox: np.ndarray) -> np.ndarray:
        h, w = frame.shape[:2]
        x1, y1, x2, y2 = bbox.astype(int)
        pad_x = int((x2 - x1) * 0.32)
        pad_y = int((y2 - y1) * 0.32)
        crop = frame[max(0, y1 - pad_y) : min(h, y2 + pad_y), max(0, x1 - pad_x) : min(w, x2 + pad_x)]
        if crop.size == 0:
            return frame
        return cv2.resize(crop, (240, 240))

    def reload_guests(self) -> None:
        with self._lock:
            self.active_guests = self.db.get_active_guests()
        self.tracker.clear_memory()
        log.info("Aktif misafir imzası güncellendi (%d yüz profili)", len(self.active_guests))

    def _unique_guest_count(self) -> int:
        with self._lock:
            return len({(n.strip().lower(), r.strip().lower()) for _, n, r, _ in self.active_guests})

    # ------------------------------------------------------------------ yüz çıkarma (kayıt)

    def extract_face_from_image(self, image: np.ndarray) -> Optional[Tuple[np.ndarray, np.ndarray]]:
        if image is None or image.size == 0:
            return None
        enhanced = self.enhance_low_light_frame(image)
        with self._engine_lock:
            res = self.face_engine.extract_primary_embedding(enhanced)
            if res is None and image.shape[0] > 220 and image.shape[1] > 400:
                h, w = image.shape[:2]
                pip_region = image[25:220, max(0, w - 210) : w]
                if pip_region.size > 0:
                    pip_res = self.face_engine.extract_primary_embedding(pip_region)
                    if pip_res is not None:
                        emb, pbbox = pip_res
                        return emb, self.crop_face_portrait(pip_region, pbbox)
        if res is None:
            return None
        embedding, bbox = res
        return embedding, self.crop_face_portrait(image, bbox)

    def extract_face_from_live_camera(self, prefer_unregistered: bool = True) -> Optional[Tuple[np.ndarray, np.ndarray]]:
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
        if prefer_unregistered and len(all_faces) > 1 and current_guests:
            for emb, bbox in all_faces:
                if self.face_engine.match_face(emb, current_guests) is None:
                    return emb, self.crop_face_portrait(frame_copy, bbox)
        best_emb, best_bbox = all_faces[0]
        return best_emb, self.crop_face_portrait(frame_copy, best_bbox)

    def identify_guest_from_live_camera(self) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """Kameradaki kişiyi aktif misafirlerle eşleştirir ve ADAYI döner; çıkışı KENDİSİ YAPMAZ (kod bulgusu 18).
        Çıkış, kullanıcı adayı onaylayınca `POST /api/guests/{id}/checkout` ile yapılır. Eşik CHECKOUT_MIN_SIMILARITY."""
        with self._lock:
            if self.latest_raw_frame is None or self.camera_covered:
                return False, "Şu anda kamera kapalı veya net bir görüntü yok.", None
            frame_copy = self.latest_raw_frame.copy()
            current_guests = list(self.active_guests)
        enhanced = self.enhance_low_light_frame(frame_copy)
        with self._engine_lock:
            all_faces = self.face_engine.extract_all_embeddings(enhanced)
        if not all_faces:
            return False, "Şu anda kamerada net bir yüz görünmüyor.", None

        best = None
        for emb, _ in all_faces:
            m = self.face_engine.match_face(emb, current_guests, threshold=self.settings.CHECKOUT_MIN_SIMILARITY)
            if m is not None and (best is None or m[3] > best[3]):
                best = m
        if best is None:
            return False, "Kameradaki kişi aktif misafir listesinde bulunamadı.", None
        gid, name, room, score = best
        info = self.db.get_guest_by_id(gid)
        return True, f"{name} (Oda {room}) tanındı (%{int(score * 100)}); çıkışı onaylayın.", info

    # ------------------------------------------------------------------ çizim

    @classmethod
    def draw_overlays(
        cls,
        raw_frame: np.ndarray,
        person_boxes: List[Box],
        face_boxes: List[FaceBox],
        polygon: Optional[np.ndarray] = None,
        active_guest_count: int = 0,
        alarms_paused: bool = False,
        include_pip: bool = True,
        camera_covered: bool = False,
        location: str = "",
    ) -> np.ndarray:
        canvas = raw_frame.copy()
        h, w = canvas.shape[:2]
        now_str = now_local().strftime("%d.%m.%Y %H:%M:%S")
        if camera_covered:
            alarm_status, bar_color = "KAMERA KAPALI / KARANLIK EKRAN", (30, 65, 140)
        elif alarms_paused:
            alarm_status, bar_color = "ALARMLAR DURAKLATILDI", (25, 85, 165)
        else:
            alarm_status, bar_color = "KBS DENETIM AKTIF", (18, 18, 22)
        cv2.rectangle(canvas, (0, 0), (w, 34), bar_color, -1)
        header = f"{location}  |  Kayitli KBS Misafir: {active_guest_count}  |  {alarm_status}  |  {now_str}"
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
                cv2.putText(canvas, f"#{tid} {status_text}", (x1, max(52, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 2)
        for bbox, label, color in face_boxes:
            fx1, fy1, fx2, fy2 = bbox.astype(int)
            cv2.rectangle(canvas, (fx1, fy1), (fx2, fy2), color, 2)
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.56, 2)
            ty = max(th + 46, fy1)
            cv2.rectangle(canvas, (fx1, ty - th - 8), (fx1 + tw + 10, ty), color, -1)
            cv2.putText(canvas, label, (fx1 + 5, ty - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.56, (255, 255, 255), 2)
        if include_pip and face_boxes:
            primary_bbox, _, primary_color = face_boxes[0]
            zoom_crop = cls.crop_face_portrait(raw_frame, primary_bbox)
            pip, margin, y1p = 144, 14, 46
            x1p = w - pip - margin
            if y1p + pip < h and x1p > 0:
                canvas[y1p : y1p + pip, x1p : x1p + pip] = cv2.resize(zoom_crop, (pip, pip))
                cv2.rectangle(canvas, (x1p, y1p), (x1p + pip, y1p + pip), primary_color, 2)
        return canvas

    @staticmethod
    def _create_placeholder_jpeg(message: str) -> bytes:
        img = np.zeros((540, 960, 3), dtype=np.uint8)
        img[:] = (19, 18, 23)
        cv2.putText(img, "HOTEL SENTINEL", (330, 230), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (240, 240, 245), 2)
        cv2.putText(img, message, (210, 285), cv2.FONT_HERSHEY_SIMPLEX, 0.60, (138, 140, 146), 1)
        _, buf = cv2.imencode(".jpg", img)
        return buf.tobytes()

    # ------------------------------------------------------------------ yaşam döngüsü

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._prevent_windows_sleep()
        self.latest_jpeg = self._create_placeholder_jpeg("Kamera baglantisi kuruluyor...")
        self._grabber = self._grabber_factory(self.settings.CAMERA_SOURCE, stall_seconds=self.settings.STALL_SECONDS)
        self._thread = threading.Thread(target=self._run_loop, name="analysis-loop", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._running = False
        if self._grabber:
            self._grabber.stop()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3.0)

    def _run_loop(self) -> None:
        """Hiçbir istisna döngüyü öldürmez: sayılır, sağlık uç noktasına yansır, geri çekilerek devam edilir."""
        state = _LoopState(
            last_db_sync=self._clock(),
            last_expiry_sync=self._clock(),
            last_maintenance=self._clock(),
            last_fps_time=self._clock(),
        )
        while self._running:
            try:
                self._tick(state)
                self.health.ok()
            except Exception as exc:  # noqa: BLE001 - döngü her şeye dayanmalı
                streak = self.health.error(exc, "analysis-loop")
                log.exception("Analiz döngüsü hatası (ardışık %d)", streak)
                self._sleep(min(0.5 * streak, ERROR_BACKOFF_MAX))

    def _tick(self, st: _LoopState) -> None:
        ok_frame, frame = self._grabber.get_latest_frame() if self._grabber else (False, None)
        if not ok_frame or frame is None:
            if st.was_connected:
                self.reconnect_count += 1
                st.was_connected = False
            self.camera_connected = False
            self.last_detection_summary = "Kamera Bağlantısı Bekleniyor..."
            self.latest_jpeg = self._create_placeholder_jpeg("Kamera sinyali bekleniyor...")
            self._sleep(1.0)
            return
        if not st.was_connected:
            log.info("Kamera bağlantısı yeniden kuruldu")
            st.was_connected = True

        self.camera_connected = True
        st.frame_count += 1
        st.fps_counter += 1
        now = self._clock()
        if now - st.last_fps_time >= 1.0:
            self.fps = round(st.fps_counter / (now - st.last_fps_time), 1)
            st.fps_counter = 0
            st.last_fps_time = now
        with self._lock:
            self.latest_raw_frame = frame
        self.tracker.configure_frame(frame.shape[1], frame.shape[0])

        if now - st.last_db_sync > 10.0:  # salt okuma
            guests = self.db.get_active_guests()
            with self._lock:
                self.active_guests = guests
            st.last_db_sync = now
        if now - st.last_expiry_sync > 60.0:  # süresi dolanları pasifle (yazma, seyrek)
            self.db.cleanup_expired_guests()
            st.last_expiry_sync = now
        if now - st.last_maintenance > 3600.0:
            self._prevent_windows_sleep()
            st.last_maintenance = now
            try:
                self.db.run_storage_maintenance()
            except Exception as exc:  # noqa: BLE001
                self.health.error(exc, "maintenance")

        if self.is_frame_dark_or_covered(frame):
            self.camera_covered = True
            self.last_detection_summary = "Kamera Kapalı / Karanlık"
            st.person_boxes, st.face_boxes = [], []
            dark = self.draw_overlays(
                frame, [], [], self.tracker.polygon, self._unique_guest_count(), self.alarms_paused,
                include_pip=False, camera_covered=True, location=self.settings.CAMERA_LOCATION,
            )  # fmt: skip
            ok, encoded = cv2.imencode(".jpg", dark, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
            if ok:
                self.latest_jpeg = encoded.tobytes()
            self._sleep(0.04)
            return
        self.camera_covered = False

        if st.frame_count % self.settings.PROCESS_EVERY_N_FRAMES == 0:
            self._analyze(frame, st)

        annotated = self.draw_overlays(
            frame, st.person_boxes, st.face_boxes, self.tracker.polygon, self._unique_guest_count(),
            self.alarms_paused, include_pip=True, camera_covered=False, location=self.settings.CAMERA_LOCATION,
        )  # fmt: skip
        ok, encoded = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
        if ok:
            self.latest_jpeg = encoded.tobytes()
        self._sleep(0.015)

    def _analyze(self, frame: np.ndarray, st: _LoopState) -> None:
        new_person_boxes: List[Box] = []
        new_face_boxes: List[FaceBox] = []
        pending: List[Tuple[int, np.ndarray, np.ndarray]] = []
        with self._lock:
            current_guests = list(self.active_guests)
        analysis_frame = self.enhance_low_light_frame(frame)

        with self._engine_lock:
            detections = self.person_detector(analysis_frame)
            detections = self.tracker.update_tracks(detections)
            valid = self.tracker.filter_by_zone(detections)
            faces = self.face_engine.detect_faces(analysis_frame) if len(valid) > 0 else []

        for face in faces:
            bbox = face.bbox.astype(int)
            embedding = face.embedding
            tid = self.tracker.assign_face_to_tracker_id(bbox, valid)
            if tid < 0:
                continue
            # Kayıtlı bile olsa yüz HER karede yeniden eşleştirilir (kod bulgusu 3).
            match = self.face_engine.match_face(embedding, current_guests)
            if match is not None:
                _, name, room, score = match
                self.tracker.register_verified(tid, match)
                new_face_boxes.append((bbox, f"KAYITLI: {name} (Oda {room}) %{int(score * 100)}", GREEN))
                self.last_detection_summary = f"Kayıtlı: {name} (Oda {room})"
                continue
            trusted = self.tracker.resolve_unmatched(tid)
            if trusted is not None:
                _, name, room, _ = trusted
                new_face_boxes.append((bbox, f"KAYITLI: {name} (Oda {room})", GREEN))
                continue
            new_face_boxes.append((bbox, "TANIMSIZ / KBS KAYITSIZ!", RED))
            self.last_detection_summary = f"Tanımsız Kişi (#{tid})"
            if not self.alarms_paused and self.tracker.record_unknown_and_check_alarm(tid, embedding=embedding):
                pending.append((tid, bbox, embedding))

        if len(valid) > 0 and valid.tracker_id is not None:
            for xyxy, tid_val in zip(valid.xyxy, valid.tracker_id):
                tid_int = int(tid_val)
                ver = self.tracker.get_verified(tid_int)
                if ver is not None:
                    new_person_boxes.append((xyxy, tid_int, f"{ver[1]} ({ver[2]})", GREEN))
                else:
                    new_person_boxes.append((xyxy, tid_int, "", (140, 140, 145)))

        for tid, bbox, embedding in pending:
            try:
                # Alarm karesi HAM karedir: kayıtlı misafirin adı/oda etiketi çizilmez (kod bulgusu 1).
                scene_path, face_crop_path = self.recorder.record(frame, bbox, tid)
                self.db.log_alert(
                    image_path=scene_path,
                    details=f"Tanımsız Kişi (Takip #{tid})",
                    face_crop_path=face_crop_path,
                    embedding=embedding,
                )
            except Exception as exc:  # noqa: BLE001 - disk/DB hatası döngüyü öldürmez (kod bulgusu 13)
                self.health.error(exc, "alarm")
                log.exception("Alarm kaydedilemedi")

        st.person_boxes, st.face_boxes = new_person_boxes, new_face_boxes

    # ------------------------------------------------------------------ durum

    def get_status(self) -> Dict[str, Any]:
        return {
            "camera_connected": self.camera_connected,
            "camera_covered": self.camera_covered,
            "camera_location": self.settings.CAMERA_LOCATION,
            "active_guests_count": self._unique_guest_count(),
            "alarms_paused": self.alarms_paused,
            "fps": self.fps,
            "last_detection": self.last_detection_summary,
            "retention_days": self.settings.ALERT_RETENTION_DAYS,
            "reconnect_count": self.reconnect_count,
            "grabber_stall_restarts": getattr(self._grabber, "stall_restarts", 0),
            "health": self.health.snapshot(),
        }
