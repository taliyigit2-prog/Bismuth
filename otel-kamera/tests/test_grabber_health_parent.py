"""Kamera okuyucu gözcüsü (10), geri çekilme ve günlük (11), sağlık sayacı, ebeveyn izleme (Bismuth kapanınca süreç ölür)."""

import io
import logging
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

import numpy as np

from camera_grabber import INITIAL_BACKOFF, MAX_BACKOFF, ResilientCameraGrabber, next_backoff
from health import LoopHealth
from parent_watch import start_parent_watch
from tests.conftest import noise_frame
from tests.fakes import wait_until


class FakeCap:
    def __init__(self, block: threading.Event | None = None):
        self.block = block
        self.released = False
        self.frame = noise_frame()

    def isOpened(self):  # noqa: N802 - OpenCV adı
        return True

    def read(self):
        if self.block is not None:
            self.block.wait()
        return True, self.frame

    def release(self):
        self.released = True
        if self.block is not None:
            self.block.set()


def quick_sleep(seconds: float) -> None:
    time.sleep(min(seconds, 0.01))


def test_takılan_okuma_gözcü_tarafından_yeniden_başlatılır():
    """Kod bulgusu 10: cap.read() sonsuz takılırsa okuyucu bırakılır, yenisi başlar, kare yeniden akar."""
    stuck = FakeCap(block=threading.Event())
    caps = [stuck]

    def factory(_source):
        return caps.pop(0) if caps else FakeCap()

    grabber = ResilientCameraGrabber("rtsp:" "//u:p@10.0.0.2/x", factory, stall_seconds=0.2, watchdog_interval=0.05, sleep=quick_sleep)
    try:
        assert wait_until(lambda: grabber.get_latest_frame()[0], timeout=5)
        assert grabber.stall_restarts >= 1 and stuck.released
        ok, frame = grabber.get_latest_frame()
        assert ok and isinstance(frame, np.ndarray)
    finally:
        grabber.stop()


def test_geri_çekilme_2_4_8_16_30_ile_büyür_30da_kalır():
    value, seen = INITIAL_BACKOFF, [INITIAL_BACKOFF]
    for _ in range(6):
        value = next_backoff(value)
        seen.append(value)
    assert seen == [2.0, 4.0, 8.0, 16.0, 30.0, 30.0, 30.0] and seen[-1] == MAX_BACKOFF


def test_bağlantı_hatası_günlüğe_yazılır_ama_şifre_sızmaz(caplog):
    def failing(_source):
        raise RuntimeError("rtsp:" "//admin:s3cret@10.0.0.2/x açılamadı")

    with caplog.at_level(logging.WARNING, logger="otel-kamera.grabber"):
        grabber = ResilientCameraGrabber("rtsp:" "//admin:s3cret@10.0.0.2/x", failing, sleep=quick_sleep)
        try:
            assert wait_until(lambda: "açılamadı" in caplog.text, timeout=3)
        finally:
            grabber.stop()
    assert "s3cret" not in caplog.text and "admin" not in caplog.text


def test_sağlık_sayacı_hata_ve_başarıyı_sayar_mesajdaki_şifreyi_maskeler():
    clock = {"t": 100.0}
    health = LoopHealth(lambda: clock["t"])
    assert health.snapshot()["state"] == "ok"
    assert health.error(RuntimeError("rtsp:" "//u:pw@h/x"), "loop") == 1
    assert health.error(ValueError("x"), "loop") == 2
    snap = health.snapshot()
    assert snap["state"] == "degraded" and snap["errors"] == 2 and "pw" not in snap["last_error"]
    health.ok()
    assert health.snapshot()["state"] == "ok" and health.snapshot()["consecutive_errors"] == 0
    clock["t"] += 60
    assert health.snapshot()["state"] == "stalled"


def test_ebeveyn_borusu_kapanınca_geri_çağrı_çalışır():
    done = threading.Event()
    thread = start_parent_watch(done.set, stream=io.BytesIO(b""))
    assert thread is not None and done.wait(2)


def test_stdin_kapanınca_yan_süreç_gerçekten_çıkar():
    """Bismuth kapanınca (boru kapanınca) süreç ölür."""
    root = Path(__file__).resolve().parent.parent
    code = "import os,time,parent_watch;parent_watch.start_parent_watch(lambda: os._exit(0));time.sleep(60)"
    proc = subprocess.Popen(
        [sys.executable, "-c", code],
        cwd=root,
        stdin=subprocess.PIPE,
        env={**os.environ, "PYTHONPATH": str(root)},
    )
    try:
        time.sleep(0.5)
        assert proc.poll() is None  # boru açıkken yaşıyor
        proc.stdin.close()
        assert proc.wait(timeout=10) == 0
    finally:
        if proc.poll() is None:
            proc.kill()
