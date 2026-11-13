"""Analiz hizmeti: döngü istisnada ölmez (12, 13), alarm karesi etiketsiz ham karedir (1), kayıtlı kimlik devralınamaz (3).
Gerçek YOLO/InsightFace yok: sahte tespit ve sahte yüz uygulaması."""

from dataclasses import replace

import numpy as np
import pytest

from database import GuestDatabase
from face_engine import FaceEngine
from security_service import SecurityService
from tests.conftest import noise_frame, unit_embedding
from tests.fakes import FakeGrabber, FakeInsightApp, Recorder, fake_face, one_person_detector, wait_until
from timeutil import checkout_deadline


@pytest.fixture
def cfg(settings):
    return replace(settings, CONFIRMATION_FRAMES=1, PROCESS_EVERY_N_FRAMES=1)


def build(cfg, faces, detector=None, recorder=None):
    db = GuestDatabase(cfg.DB_PATH, cfg)
    app = FakeInsightApp(faces)
    service = SecurityService(
        db=db,
        settings=cfg,
        face_engine=FaceEngine(settings=cfg, app=app),
        person_detector=detector or one_person_detector(),
        recorder=recorder or Recorder(),
        grabber_factory=FakeGrabber,
        sleep=lambda _s: None,
        run_maintenance_on_start=False,
    )
    service._grabber = FakeGrabber()
    return service, db, app


def test_alarm_karesi_etiketsiz_ham_karedir_kayıtlı_misafirin_adı_çizilmez(cfg):
    """Kod bulgusu 1: kayıtlı + kayıtsız yüz aynı karede; alarma giden kare, kameradan alınan HAM karedir."""
    stranger, guest = unit_embedding(1), unit_embedding(2)
    faces = [fake_face(stranger, (40, 20, 100, 80)), fake_face(guest, (110, 20, 170, 80))]
    rec = Recorder()
    service, db, _ = build(cfg, faces, recorder=rec)
    db.add_guest("Ayşe Örnek", "12", guest, checkout_deadline(5))
    service.reload_guests()
    from security_service import _LoopState

    # iki yüz de aynı kişi kutusuna düşmesin: ikinci kutu
    service.person_detector = _two_people()
    state = _LoopState()
    service._tick(state)
    assert len(rec.calls) == 1
    sent_frame = rec.calls[0][0]
    assert np.array_equal(sent_frame, service._grabber.frame)
    known = [f for f in state.face_boxes if f["kind"] == "known"]
    assert known and known[0]["name"] == "Ayşe Örnek"  # kutu verisinde kalır, alarm karesine girmez


def _two_people():
    import supervision as sv

    def detect(_frame):
        return sv.Detections(
            xyxy=np.array([[10, 10, 100, 110], [105, 10, 190, 110]], dtype=float),
            confidence=np.array([0.9, 0.9]),
            class_id=np.array([0, 0]),
        )

    return detect


def test_tespit_hatası_döngüyü_öldürmez_sağlık_sayacı_hatayı_gösterir(cfg):
    """Kod bulgusu 12: analiz iş parçacığı bir istisnadan sonra da çalışmayı sürdürür."""
    calls = {"n": 0}
    good = one_person_detector()

    def flaky(frame):
        calls["n"] += 1
        if calls["n"] <= 2:
            raise RuntimeError("onnx hatası rtsp:" "//u:pw@h/x")
        return good(frame)

    service, _, _ = build(cfg, [fake_face(unit_embedding(3))], detector=flaky)
    service._grabber = None  # start() kendi sahte okuyucusunu kurar
    service.start()
    try:
        assert wait_until(lambda: service.health.snapshot()["ticks"] >= 3, timeout=10)
        snap = service.health.snapshot()
        assert snap["errors"] == 2 and snap["state"] in ("ok", "degraded")
        assert service._thread.is_alive()
        assert "pw" not in (snap["last_error"] or "")
        assert service.get_status()["health"]["errors"] == 2
    finally:
        service.stop()


def test_disk_hatası_alarm_yolunu_atlatır_döngü_ve_diğer_alarmlar_sürer(cfg):
    """Kod bulgusu 13."""
    rec = Recorder()
    rec.fail = True
    service, _, _ = build(cfg, [fake_face(unit_embedding(4))], recorder=rec)
    from security_service import _LoopState

    state = _LoopState()
    service._tick(state)  # istisna dışarı sızmaz
    assert service.health.snapshot()["errors"] == 1
    assert "alarm" in service.health.snapshot()["last_error"]
    assert state.face_boxes  # tick sonuna kadar gitti


def test_kayıtlı_iz_yabancıya_geçmez_ardışık_eşleşmemede_kayıtsız_olur(settings):
    """Kod bulgusu 3: kayıtlı misafirin izindeki başka yüz, TTL/eşleşmeme sonrası TANIMSIZ görünür."""
    cfg = replace(settings, CONFIRMATION_FRAMES=3, PROCESS_EVERY_N_FRAMES=1)
    guest, stranger = unit_embedding(5), unit_embedding(6)
    rec = Recorder()
    service, db, app = build(cfg, [fake_face(guest)], recorder=rec)
    db.add_guest("Can Örnek", "3", guest, checkout_deadline(5))
    service.reload_guests()
    from security_service import _LoopState

    state = _LoopState()
    service._tick(state)
    assert state.face_boxes[0]["kind"] == "known"
    app.faces = [fake_face(stranger)]  # aynı iz, başka yüz
    labels = []
    for _ in range(4):
        service._tick(state)
        labels.append(state.face_boxes[0]["kind"])
    assert [kind == "known" for kind in labels] == [True, True, False, False]
    assert labels[-1] == "unknown"
    assert rec.calls == []  # henüz CONFIRMATION_FRAMES kez kayıtsız görülmedi


def test_kameradan_tanıma_adayı_döner_çıkışı_kendisi_yapmaz(cfg):
    """Kod bulgusu 18: onay adımı; eşik CHECKOUT_MIN_SIMILARITY."""
    guest = unit_embedding(8)
    service, db, _ = build(cfg, [fake_face(guest)])
    gid = db.add_guest("Onay Gerek", "9", guest, checkout_deadline(5))
    service.reload_guests()
    service.latest_raw_frame = noise_frame()
    ok, msg, info = service.identify_guest_from_live_camera()
    assert ok and info["id"] == gid and "onaylayın" in msg
    assert db.get_guest_by_id(gid)["is_active"] is True
    service.face_engine.app.faces = [fake_face(0.3 * guest + 0.95 * unit_embedding(99))]  # benzerlik < 0.45
    ok, _, info = service.identify_guest_from_live_camera()
    assert not ok and info is None
