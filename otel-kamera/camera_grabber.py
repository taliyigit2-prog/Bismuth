"""Kamera okuyucu: her zaman en güncel kareyi tutar, ana programı asla dondurmaz.

P20a: gözcü (watchdog) iş parçacığı — `cap.read()` ya da açma `STALL_SECONDS` boyunca dönmezse okuyucu bırakılır,
kapatma denenir ve yeni bir okuyucu başlar (kod bulgusu 10); yeniden bağlanma geri çekilmesi artar ve günlüğe yazılır
(kod bulgusu 11); kaynak adresindeki şifre günlüklerde maskelenir.
"""

import logging
import threading
import time
from typing import Any, Callable, Optional, Tuple

import numpy as np

from bridge_security import redact

log = logging.getLogger("otel-kamera.grabber")

INITIAL_BACKOFF = 2.0
MAX_BACKOFF = 30.0
FRAME_STALE_SECONDS = 8.0


def next_backoff(current: float) -> float:
    """2 → 4 → 8 → 16 → 30 sn (kamera uzun süre kapalıyken sürekli açma denemesi yapılmaz)."""
    return min(current * 2.0, MAX_BACKOFF)


def open_capture(source: Any):  # pragma: no cover - gerçek kamera/OpenCV gerektirir
    import cv2

    cap = cv2.VideoCapture(source)
    if cap.isOpened():
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        try:
            cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000)
            cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000)
        except Exception:
            pass
    return cap


class ResilientCameraGrabber:
    def __init__(
        self,
        source_str: str,
        capture_factory: Callable[[Any], Any] = open_capture,
        stall_seconds: float = 15.0,
        watchdog_interval: float = 1.0,
        clock: Callable[[], float] = time.time,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.source: Any = int(source_str) if source_str.isdigit() else source_str
        self._label = redact(str(source_str)) if not str(source_str).isdigit() else f"kamera {source_str}"
        self._factory = capture_factory
        self._stall = stall_seconds
        self._watchdog_interval = watchdog_interval
        self._clock = clock
        self._sleep = sleep

        self._lock = threading.Lock()
        self._frame: Optional[np.ndarray] = None
        self._frame_seq = 0  # her yeni kare +1: analiz döngüsü aynı kareyi iki kez işlemez (kod bulgusu 24)
        self._last_frame_ts = 0.0
        self._connected = False
        self._running = True
        self._generation = 0
        self._cap: Any = None
        self._busy_since: Optional[float] = None
        self.stall_restarts = 0

        self._start_reader()
        self._watchdog = threading.Thread(target=self._watchdog_loop, name="camera-watchdog", daemon=True)
        self._watchdog.start()

    # ------------------------------------------------------------------ okuyucu

    def _start_reader(self) -> None:
        with self._lock:
            self._generation += 1
            gen = self._generation
        threading.Thread(target=self._reader_loop, args=(gen,), name=f"camera-reader-{gen}", daemon=True).start()

    def _stale(self, gen: int) -> bool:
        return not self._running or gen != self._generation

    def _reader_loop(self, gen: int) -> None:
        cap: Any = None
        backoff = INITIAL_BACKOFF
        while not self._stale(gen):
            if cap is None:
                with self._lock:
                    self._connected = False
                    self._busy_since = self._clock()
                try:
                    cap = self._factory(self.source)
                except Exception as exc:
                    log.warning("Kamera açılamadı (%s): %s", self._label, redact(str(exc)))
                    cap = None
                with self._lock:
                    self._busy_since = None
                    if cap is not None and not self._stale(gen):
                        self._cap = cap
                if cap is None or not cap.isOpened():
                    self._release(cap)
                    cap = None
                    log.warning("Kamera bağlantısı yok (%s); %.0f sn sonra yeniden denenecek", self._label, backoff)
                    self._sleep(backoff)
                    backoff = next_backoff(backoff)
                    continue
                backoff = INITIAL_BACKOFF

            with self._lock:
                self._busy_since = self._clock()
            try:
                ret, frame = cap.read()
            except Exception as exc:
                log.warning("Kare okunamadı (%s): %s", self._label, redact(str(exc)))
                ret, frame = False, None
            with self._lock:
                self._busy_since = None
            if self._stale(gen):
                self._release(cap)
                return
            if not ret or frame is None:
                with self._lock:
                    self._connected = False
                self._release(cap)
                cap = None
                log.warning("Sinyal kesildi (%s); yeniden bağlanılacak", self._label)
                self._sleep(3.0)
                continue

            now = self._clock()
            with self._lock:
                self._frame = frame
                self._frame_seq += 1
                self._last_frame_ts = now
                self._connected = True
            self._sleep(0.005)
        self._release(cap)

    @staticmethod
    def _release(cap: Any) -> None:
        if cap is None:
            return
        try:
            cap.release()
        except Exception:
            pass

    # ------------------------------------------------------------------ gözcü

    def _watchdog_loop(self) -> None:
        while self._running:
            self._sleep(self._watchdog_interval)
            with self._lock:
                since = self._busy_since
                stuck = since is not None and self._clock() - since > self._stall
                cap = self._cap
            if stuck:
                self.stall_restarts += 1
                log.warning("Kamera okuyucu %.0f sn takıldı (%s); yeniden başlatılıyor", self._stall, self._label)
                with self._lock:
                    self._busy_since = None
                    self._connected = False
                self._release(cap)
                self._start_reader()

    # ------------------------------------------------------------------ dış

    @property
    def frame_seq(self) -> int:
        with self._lock:
            return self._frame_seq

    def get_latest_frame(self) -> Tuple[bool, Optional[np.ndarray]]:
        with self._lock:
            if not self._connected or self._frame is None or (self._clock() - self._last_frame_ts > FRAME_STALE_SECONDS):
                return False, None
            return True, self._frame

    def stop(self) -> None:
        self._running = False
        with self._lock:
            cap = self._cap
        self._release(cap)
