"""P20c (K-51, K-53): yan süreç diske misafir, yüz vektörü, kırpma ya da alarm YAZMAZ.

Kaynak taraması (SQLite, resim yazımı, dosya yazma yok) ve çalışan hizmetle davranış testi: yüz listesi yüklenir, alarm
üretilir, yakalama ve vektör çıkarma çağrılır; bu sırada diske yazma girişimi testi düşürür ve geçici klasör boş kalır.
"""

import builtins
import pathlib
import re
import sqlite3

import cv2
import numpy as np
import pytest

from alert_recorder import AlertRecorder
from face_engine import FaceEngine
from face_store import AlertQueue, FaceStore
from security_service import SecurityService, _LoopState
from tests.conftest import unit_embedding
from tests.fakes import FakeGrabber, FakeInsightApp, add_guest, fake_face, one_person_detector

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCES = [p for p in ROOT.glob("*.py")]


def test_kaynakta_sqlite_resim_yazımı_ya_da_yazma_kipli_dosya_açma_yok():
    assert SOURCES
    for path in SOURCES:
        text = path.read_text(encoding="utf-8")
        assert "sqlite3" not in text, path.name
        assert "imwrite" not in text, path.name
        assert not re.search(r"open\([^)]*[\"'][wax]b?\+?[\"']", text), path.name
        assert "StaticFiles" not in text, path.name


def test_veritabanı_ve_resim_dosyaları_modülleri_kalktı():
    assert not (ROOT / "database.py").exists()


class NoWrites:
    """Yazma kipinde `open`, `sqlite3.connect` ve `cv2.imwrite` çağrılırsa test düşer."""

    def __init__(self, monkeypatch) -> None:
        real_open = builtins.open

        def guarded_open(file, mode="r", *args, **kwargs):
            if any(flag in str(mode) for flag in "wax+"):
                raise AssertionError(f"yan süreç dosyaya yazamaz: {file!r}")
            return real_open(file, mode, *args, **kwargs)

        def refuse(*_a, **_k):
            raise AssertionError("yan süreç diske yazamaz")

        monkeypatch.setattr(builtins, "open", guarded_open)
        monkeypatch.setattr(sqlite3, "connect", refuse)
        monkeypatch.setattr(cv2, "imwrite", refuse)


def test_alarm_yüz_listesi_yakalama_ve_çıkarma_diske_hiçbir_şey_yazmaz(settings, tmp_path, monkeypatch):
    from dataclasses import replace

    cfg = replace(settings, CONFIRMATION_FRAMES=1, PROCESS_EVERY_N_FRAMES=1)
    stranger, guest = unit_embedding(1), unit_embedding(2)
    faces, alerts = FaceStore(), AlertQueue()
    service = SecurityService(
        faces=faces,
        alerts=alerts,
        settings=cfg,
        face_engine=FaceEngine(settings=cfg, app=FakeInsightApp([fake_face(stranger), fake_face(guest, (110, 20, 170, 80))])),
        person_detector=one_person_detector(),
        recorder=AlertRecorder(),  # gerçek kodlayıcı: JPEG bellekte üretilir
        grabber_factory=FakeGrabber,
        sleep=lambda _s: None,
    )
    service._grabber = FakeGrabber()
    NoWrites(monkeypatch)

    add_guest(service, "Ayşe Örnek", "12", guest)
    service._tick(_LoopState())
    queued = alerts.since(0)
    assert len(queued) == 1 and queued[0].crop[:2] == b"\xff\xd8"  # alarm bellekte, kırpma JPEG

    # Yakalama ve vektör çıkarma da yalnız bellekte çalışır.
    service.latest_raw_frame = service._grabber.frame
    assert service.extract_face_from_live_camera() is not None
    assert service.extract_face_from_image(np.zeros((240, 240, 3), dtype=np.uint8) + 90) is not None

    assert list(tmp_path.iterdir()) == []
    faces.clear()
    alerts.clear()


def test_hizmet_başlarken_kayıt_klasörü_ya_da_veritabanı_açmaz(settings, tmp_path):
    SecurityService(
        faces=FaceStore(),
        alerts=AlertQueue(),
        settings=settings,
        face_engine=FaceEngine(settings=settings, app=FakeInsightApp([])),
        person_detector=one_person_detector(),
        recorder=AlertRecorder(),
        grabber_factory=FakeGrabber,
        sleep=lambda _s: None,
    )
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize("name", ["alerts", "guest_photos"])
def test_eski_klasör_adları_yapılandırmada_yok(name):
    from config import Config

    assert not any(name.upper() in field for field in Config.__dataclass_fields__)
