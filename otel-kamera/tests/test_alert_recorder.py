"""Alarm kaydı: dosya adı çakışması (kod bulgusu 27) ve ham kare (1)."""

import os

import numpy as np

from alert_recorder import AlertRecorder
from tests.conftest import noise_frame


def test_aynı_saniyede_aynı_iz_için_dosya_adları_çakışmaz(settings, clock):
    recorder = AlertRecorder(settings, clock)
    names = {recorder.snapshot_names(7)[0] for _ in range(200)}
    assert len(names) == 200  # saat sabit (FakeClock) olsa bile rastgele ek ayırır


def test_alarm_ham_kareyi_ve_yüz_kırpmasını_yazar_Telegram_ya_da_ağ_çağrısı_yok(settings, clock, monkeypatch):
    import socket

    def no_network(*_a, **_k):
        raise AssertionError("alarm kaydı ağa çıkmamalı (K-49/K-50)")

    monkeypatch.setattr(socket.socket, "connect", no_network)
    recorder = AlertRecorder(settings, clock)
    frame = noise_frame(360, 640)
    scene, face = recorder.record(frame, np.array([200, 100, 320, 220]), tracker_id=3)
    assert os.path.exists(scene) and os.path.exists(face)
    assert os.path.basename(scene).startswith("alert_") and os.path.basename(face).startswith("face_")
    assert not os.path.exists(os.path.join(settings.ALERTS_DIR, "x"))


def test_yüz_kutusu_yoksa_yalnız_sahne_kaydedilir(settings, clock):
    scene, face = AlertRecorder(settings, clock).record(noise_frame(), None, tracker_id=1)
    assert os.path.exists(scene) and face == ""
