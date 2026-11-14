"""Sahte bileşenler: gerçek model, kamera ya da ağ olmadan servis ve uç nokta testleri."""

import time
from types import SimpleNamespace
from typing import Any, List, Optional, Tuple

import numpy as np
import supervision as sv

from face_store import encode_embedding
from health import LoopHealth
from tests.conftest import noise_frame


class FakeService:
    """`web_app.create_app` için en küçük hizmet."""

    def __init__(self) -> None:
        self.health = LoopHealth()
        self._running = True
        self.stream_viewers = 0
        self.camera_connected = True
        self.alarms_paused = False
        self.changes = 0
        self.live_face: Optional[Tuple[np.ndarray, np.ndarray]] = None

    def start(self) -> None:
        self._running = True

    def stop(self) -> None:
        self._running = False

    def faces_changed(self) -> None:
        self.changes += 1

    def viewer_joined(self) -> None:
        self.stream_viewers += 1

    def viewer_left(self) -> None:
        self.stream_viewers -= 1

    def stream_frame(self, last_seq: int):
        return (1, b"\xff\xd8\xff") if last_seq != 1 else (1, None)

    def get_overlay(self) -> dict:
        return {"seq": 1, "persons": [], "faces": []}

    def get_status(self) -> dict:
        return {"camera_connected": self.camera_connected, "health": self.health.snapshot()}

    def extract_face_from_live_camera(self):
        return self.live_face

    def extract_face_from_image(self, image):
        return self.live_face


class FakeGrabber:
    def __init__(self, source: str = "0", stall_seconds: float = 15.0, frame: Optional[np.ndarray] = None):
        self.frame = frame if frame is not None else noise_frame()
        self.stopped = False
        self.stall_restarts = 0

    def get_latest_frame(self):
        return True, self.frame

    def stop(self) -> None:
        self.stopped = True


class FakeInsightApp:
    """`FaceAnalysis.get` yerine: önceden verilen yüzleri döner."""

    def __init__(self, faces: List[Any]):
        self.faces = faces

    def get(self, frame):
        return list(self.faces)


def fake_face(embedding: np.ndarray, bbox=(40, 20, 100, 80), score: float = 0.9):
    return SimpleNamespace(det_score=score, bbox=np.array(bbox, dtype=float), embedding=embedding)


def one_person_detector(box=(10.0, 10.0, 150.0, 110.0)):
    def detect(frame):
        return sv.Detections(
            xyxy=np.array([box], dtype=float),
            confidence=np.array([0.9]),
            class_id=np.array([0]),
        )

    return detect


class Recorder:
    """`AlertRecorder.crop_jpeg` yerine: ne ile çağrıldığını tutar."""

    def __init__(self) -> None:
        self.calls: List[Tuple[np.ndarray, np.ndarray, Optional[int]]] = []
        self.fail = False

    def crop_jpeg(self, frame, bbox):
        if self.fail:
            raise OSError("kodlama hatası")
        self.calls.append((frame, bbox, None))
        return b"\xff\xd8\xffcrop"


def add_guest(service, name: str, room: str, embedding, face_id: Optional[str] = None) -> str:
    """Bismuth'un yaptığı gibi: yüz listesine bir misafir ekler (yalnız bellek) ve hizmete haber verir."""
    items = [(fid, n, r, encode_embedding(e)) for fid, n, r, e in service.faces.snapshot()]
    fid = face_id or f"f{len(items) + 1}"
    items.append((fid, name, room, encode_embedding(embedding)))
    service.faces.replace(items)
    service.faces_changed()
    return fid


def wait_until(predicate, timeout: float = 5.0, step: float = 0.01) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(step)
    return predicate()
