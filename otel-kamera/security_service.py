"""Analiz hizmeti: kamera karesi → kişi tespiti → yüz tanıma → alarm kararı.

P20a: döngü gövdesi try/except + sağlık sayacı içindedir, bir istisna iş parçacığını öldürmez (12, 13); alarm
karesi etiketsiz ham karedir (1); kayıtlı yüz her karede yeniden eşleştirilir, kimlik devralınamaz (3); ağır
bağımlılıklar (ultralytics, insightface) yalnız varsayılan kurulumda içe aktarılır, bu yüzden hizmet sahte
bileşenlerle (`person_detector`, `face_engine`, `grabber_factory`) test edilir.

P20d: modeller yalnız yerel dosyadan, çevrimdışı yüklenir (`model_loader.py`); izleme ByteTrack benzeri (2); kişi yokken de
düşük sıklıkta yüz aranır (5); tek eşik + "emin değil" bandı (6); OpenCV ile yazı/kutu ÇİZİLMEZ — kutular ve etiketler
`get_overlay()` ile (normalleştirilmiş koordinat) verilir, Bismuth penceresi çizer (20); canlı yayın yalnız yeni karede
ve yalnız izleyici isteyince, küçültülmüş JPEG olarak üretilir (23, 24).
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
from model_loader import load_yolo
from timeutil import now_local
from tracker import SecurityTracker

log = logging.getLogger("otel-kamera.service")

PersonDetector = Callable[[np.ndarray], sv.Detections]
# Kutular piksel koordinatlıdır; `get_overlay` bunları 0..1'e çevirir.
PersonBox = Dict[str, Any]  # {"id": int, "box": [x1,y1,x2,y2], "name": str|None, "room": str|None}
FaceBox = Dict[str, Any]  # {"box": [...], "kind": "known"|"unknown"|"uncertain", "name", "room", "score"}

ERROR_BACKOFF_MAX = 5.0
PLACEHOLDER_SEQ = -1
KIND_KNOWN, KIND_UNKNOWN, KIND_UNCERTAIN = "known", "unknown", "uncertain"


def build_person_detector(settings: Config = default_config) -> PersonDetector:
    """YOLO11n insan tespiti; model yerel dosyadan, çevrimdışı yüklenir (`model_loader.load_yolo`: indirme yok, telemetri
    kapalı). Çıktı supervision `Detections`."""
    model = load_yolo(settings)

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
    analysis_count: int = 0
    idle_scans: int = 0
    last_frame_seq: int = -1
    person_boxes: List[PersonBox] = field(default_factory=list)
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
        self.face_engine = face_engine or FaceEngine(settings=settings)
        self.person_detector = person_detector or build_person_detector(settings)
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
        self.frame_seq = 0  # işlenen her yeni kare +1 (canlı yayın yalnız yeni karede kodlanır)
        self._stream_cache: Optional[Tuple[int, bytes]] = None
        self._placeholder_jpeg: Optional[bytes] = None
        self.stream_viewers = 0
        self._overlay_state: Tuple[List[PersonBox], List[FaceBox], int, int, int] = ([], [], 0, 0, 0)
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

    # ------------------------------------------------------------------ yayın ve kutu verisi

    @staticmethod
    def _blank_jpeg() -> bytes:
        """Kamera yokken gösterilen düz koyu kare; YAZI YOK (durum metni Bismuth penceresindedir, kod bulgusu 20)."""
        img = np.full((270, 480, 3), (23, 22, 26), dtype=np.uint8)
        ok, buf = cv2.imencode(".jpg", img)
        return buf.tobytes() if ok else b""

    def _encode_stream(self, frame: np.ndarray) -> bytes:
        width = self.settings.STREAM_MAX_WIDTH
        h, w = frame.shape[:2]
        if w > width:
            frame = cv2.resize(frame, (width, max(1, int(h * width / w))), interpolation=cv2.INTER_AREA)
        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), self.settings.STREAM_JPEG_QUALITY])
        return buf.tobytes() if ok else b""

    def stream_frame(self, last_seq: int) -> Tuple[int, Optional[bytes]]:
        """MJPEG için bir sonraki kare. `last_seq`'ten yeni kare yoksa (last_seq, None) döner: aynı kare tekrar
        gönderilmez (kod bulgusu 23). Kare izleyici isteyince kodlanır ve izleyiciler arasında önbellekten paylaşılır;
        çizim yoktur (kod bulgusu 24). Kare yoksa düz koyu kare bir kez döner."""
        with self._lock:
            seq, frame, cached = self.frame_seq, self.latest_raw_frame, self._stream_cache
        if frame is None or not self.camera_connected:
            if last_seq == PLACEHOLDER_SEQ:
                return last_seq, None
            if self._placeholder_jpeg is None:
                self._placeholder_jpeg = self._blank_jpeg()
            return PLACEHOLDER_SEQ, self._placeholder_jpeg
        if seq == last_seq:
            return last_seq, None
        if cached is not None and cached[0] == seq:
            return seq, cached[1]
        jpeg = self._encode_stream(frame)
        with self._lock:
            self._stream_cache = (seq, jpeg)
        return seq, jpeg

    def viewer_joined(self) -> None:
        with self._lock:
            self.stream_viewers += 1

    def viewer_left(self) -> None:
        with self._lock:
            self.stream_viewers = max(0, self.stream_viewers - 1)

    def get_overlay(self) -> Dict[str, Any]:
        """Kutu ve etiket verisi (kod bulgusu 20). Koordinatlar 0..1 (kare genişliği/yüksekliğine oranlı): yayın
        küçültülse de pencere aynı kutuyu çizer. Etiket METNİ yoktur; ad/oda/skor ham veridir, yazıyı pencere dizer."""
        with self._lock:
            persons, faces, width, height, seq = self._overlay_state
            guests = len({(n.strip().lower(), r.strip().lower()) for _, n, r, _ in self.active_guests})

        def norm(box: List[float]) -> List[float]:
            if width <= 0 or height <= 0:
                return [0.0, 0.0, 0.0, 0.0]
            x1, y1, x2, y2 = box
            return [round(max(0.0, min(1.0, v)), 4) for v in (x1 / width, y1 / height, x2 / width, y2 / height)]

        polygon = self.tracker.polygon
        zone = None
        if polygon is not None and width > 0 and height > 0:
            zone = [[round(float(x) / width, 4), round(float(y) / height, 4)] for x, y in polygon.reshape(-1, 2)]
        return {
            "seq": seq,
            "at": now_local().isoformat(timespec="seconds"),
            "frame": {"width": width, "height": height},
            "camera_connected": self.camera_connected,
            "camera_covered": self.camera_covered,
            "alarms_paused": self.alarms_paused,
            "guests_count": guests,
            "zone": zone,
            "persons": [{**p, "box": norm(p["box"])} for p in persons],
            "faces": [{**f, "box": norm(f["box"])} for f in faces],
        }

    def _publish_overlay(self, st: _LoopState, frame: np.ndarray) -> None:
        h, w = frame.shape[:2]
        with self._lock:
            self._overlay_state = (list(st.person_boxes), list(st.face_boxes), w, h, self.frame_seq)

    # ------------------------------------------------------------------ yaşam döngüsü

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._prevent_windows_sleep()
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
            st.person_boxes, st.face_boxes = [], []
            self._sleep(1.0)
            return
        # Gerçek okuyucu yeni kare numarası verir: aynı kare ikinci kez işlenmez (kod bulgusu 24).
        seq = getattr(self._grabber, "frame_seq", None)
        if seq is not None and seq == st.last_frame_seq:
            self._sleep(0.005)
            return
        if seq is not None:
            st.last_frame_seq = seq
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
            self.frame_seq += 1
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
            self._publish_overlay(st, frame)
            self._sleep(0.04)
            return
        self.camera_covered = False

        if st.frame_count % self.settings.PROCESS_EVERY_N_FRAMES == 0:
            self._analyze(frame, st)
        self._publish_overlay(st, frame)
        self._sleep(0.015)

    def _analyze(self, frame: np.ndarray, st: _LoopState) -> None:
        new_person_boxes: List[PersonBox] = []
        new_face_boxes: List[FaceBox] = []
        pending: List[Tuple[int, np.ndarray, np.ndarray]] = []
        with self._lock:
            current_guests = list(self.active_guests)
        analysis_frame = self.enhance_low_light_frame(frame)
        threshold = self.settings.FACE_SIMILARITY_THRESHOLD
        margin = self.settings.FACE_UNCERTAIN_MARGIN
        st.analysis_count += 1

        with self._engine_lock:
            detections = self.person_detector(analysis_frame)
            detections = self.tracker.update_tracks(detections)
            valid = self.tracker.filter_by_zone(detections)
            # Kişi kutusu varsa her turda yüz aranır. Kişi kutusu YOKSA (YOLO kaçırdı, yakın çekim, gece) yüz yine de
            # her IDLE_FACE_SCAN_EVERY. turda aranır ve yalnız geçiş bölgesindeki yüzler alınır (kod bulgusu 5).
            scan_idle = False
            if len(valid) == 0 and self.settings.IDLE_FACE_SCAN_EVERY > 0:
                st.idle_scans += 1
                scan_idle = st.idle_scans % self.settings.IDLE_FACE_SCAN_EVERY == 0
            faces = self.face_engine.detect_faces(analysis_frame) if (len(valid) > 0 or scan_idle) else []
        if len(valid) == 0:
            faces = [f for f in faces if self.tracker.face_in_zone(f.bbox)]

        tids = self.tracker.assign_faces(
            [f.bbox.astype(int) for f in faces], valid, [float(f.det_score) for f in faces]
        )
        for face, tid in zip(faces, tids):
            if tid < 0:
                continue
            bbox = face.bbox.astype(int)
            embedding = face.embedding
            # Kayıtlı bile olsa yüz HER karede yeniden eşleştirilir (kod bulgusu 3).
            best = self.face_engine.best_match(embedding, current_guests)
            if best is not None and best[3] >= threshold:
                _, name, room, score = best
                self.tracker.register_verified(tid, best)
                new_face_boxes.append(
                    {"box": bbox.tolist(), "kind": KIND_KNOWN, "name": name, "room": room, "score": round(float(score), 3)}
                )
                self.last_detection_summary = f"Kayıtlı: {name} (Oda {room})"
                continue
            trusted = self.tracker.resolve_unmatched(tid)
            if trusted is not None:
                _, name, room, _ = trusted
                new_face_boxes.append(
                    {"box": bbox.tolist(), "kind": KIND_KNOWN, "name": name, "room": room, "score": None}
                )
                continue
            if best is not None and margin > 0 and best[3] >= threshold - margin:
                # "Emin değil" bandı (kod bulgusu 6): misafire benziyor ama eşiğin altında. Kayıtlı sayılmaz, alarm
                # sayacına da girmez; yalnız belirsiz olarak gösterilir. camera.uncertainMargin = 0 bandı kapatır.
                _, name, room, score = best
                new_face_boxes.append(
                    {"box": bbox.tolist(), "kind": KIND_UNCERTAIN, "name": name, "room": room, "score": round(float(score), 3)}
                )
                self.last_detection_summary = f"Belirsiz yüz (#{tid})"
                continue
            new_face_boxes.append({"box": bbox.tolist(), "kind": KIND_UNKNOWN, "name": None, "room": None, "score": None})
            self.last_detection_summary = f"Tanımsız Kişi (#{tid})"
            if not self.alarms_paused and self.tracker.record_unknown_and_check_alarm(tid, embedding=embedding):
                pending.append((tid, bbox, embedding))

        if len(valid) > 0 and valid.tracker_id is not None:
            for xyxy, tid_val in zip(valid.xyxy, valid.tracker_id):
                tid_int = int(tid_val)
                ver = self.tracker.get_verified(tid_int)
                new_person_boxes.append(
                    {
                        "id": tid_int,
                        "box": [float(v) for v in xyxy],
                        "name": ver[1] if ver is not None else None,
                        "room": ver[2] if ver is not None else None,
                    }
                )

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
            "stream_viewers": self.stream_viewers,
            "health": self.health.snapshot(),
        }
