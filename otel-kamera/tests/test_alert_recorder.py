"""Alarm kırpması: yalnız bellekte JPEG, diske hiçbir şey yazılmaz (P20c), ham kare (kod bulgusu 1)."""

import cv2
import numpy as np

from alert_recorder import AlertRecorder
from tests.conftest import noise_frame


def _decode(jpeg: bytes) -> np.ndarray:
    return cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)


def test_yüz_kutusu_verilince_240x240_yüz_kırpması_döner(tmp_path):
    jpeg = AlertRecorder().crop_jpeg(noise_frame(360, 640), np.array([200, 100, 320, 220]))
    assert jpeg[:2] == b"\xff\xd8"
    assert _decode(jpeg).shape[:2] == (240, 240)
    assert list(tmp_path.iterdir()) == []


def test_yüz_kutusu_yoksa_küçültülmüş_sahne_döner():
    jpeg = AlertRecorder().crop_jpeg(noise_frame(720, 1280), None)
    assert _decode(jpeg).shape[1] == 480


def test_kırpma_ağa_çıkmaz_Telegram_ya_da_dış_çağrı_yok(monkeypatch):
    import socket

    def no_network(*_a, **_k):
        raise AssertionError("alarm kırpması ağa çıkmamalı (K-49/K-50)")

    monkeypatch.setattr(socket.socket, "connect", no_network)
    assert AlertRecorder().crop_jpeg(noise_frame(360, 640), np.array([200, 100, 320, 220]))
