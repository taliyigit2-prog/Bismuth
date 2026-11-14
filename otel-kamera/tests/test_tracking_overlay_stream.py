"""P20d kod bulguları: 2 (ByteTrack benzeri izleme), 5 (kişi yokken yüz arama), 6 (tek eşik + emin değil bandı),
20 (kutu/etiket verisi, OpenCV yazısı yok), 23 ve 24 (yayın yalnız yeni karede, küçültülmüş, çizimsiz)."""

import pathlib
import re
from dataclasses import replace

import numpy as np
import pytest
import supervision as sv

from bytetrack_lite import ByteTrackLite, iou_matrix
from face_engine import FaceEngine
from face_store import AlertQueue, FaceStore
from security_service import SecurityService, _LoopState
from tests.conftest import noise_frame, unit_embedding
from tests.fakes import FakeGrabber, FakeInsightApp, Recorder, add_guest, fake_face, one_person_detector
from tracker import SecurityTracker

ROOT = pathlib.Path(__file__).resolve().parent.parent


class Clock:
    def __init__(self) -> None:
        self.t = 100.0

    def __call__(self) -> float:
        return self.t


def with_similarity(base: np.ndarray, similarity: float, seed: int = 99) -> np.ndarray:
    """`base` ile tam olarak `similarity` kosinüs benzerliğinde birim vektör (Gram-Schmidt)."""
    other = unit_embedding(seed)
    other = other - float(np.dot(other, base)) * base
    other = other / np.linalg.norm(other)
    return (similarity * base + np.sqrt(1 - similarity**2) * other).astype(np.float32)


def box(x, y=50.0, w=60.0, h=140.0):
    return [x, y, x + w, y + h]


# ---------------------------------------------------------------- 2: izleme


def test_iki_yan_yana_kişi_ayrı_kimlik_alır_ve_hareket_ederken_korur():
    clock = Clock()
    bt = ByteTrackLite(clock=clock)
    first = bt.update(np.array([box(100), box(260)]), np.array([0.9, 0.9]))
    assert first[0] != first[1]
    for step in range(1, 15):
        clock.t += 0.2
        ids = bt.update(np.array([box(100 + 8 * step), box(260 + 8 * step)]), np.array([0.9, 0.9]))
        assert list(ids) == list(first)


def test_ayrılan_kişinin_kimliği_yakındaki_yabancıya_geçmez():
    """Eski merkez-yakınlığı izleyici 380 px içindeki yabancıya eski kimliği devrediyordu."""
    clock = Clock()
    bt = ByteTrackLite(clock=clock, buffer_seconds=4.0)
    guest = bt.update(np.array([box(100)]), np.array([0.9]))[0]
    clock.t += 0.4
    stranger = bt.update(np.array([box(300)]), np.array([0.9]))[0]  # örtüşme yok, 200 px yanında
    assert stranger != guest


def test_kısa_kaybolma_kimliği_korur_buffer_sonrası_yeni_kimlik_verilir():
    clock = Clock()
    bt = ByteTrackLite(clock=clock, buffer_seconds=2.0)
    tid = bt.update(np.array([box(100)]), np.array([0.9]))[0]
    clock.t += 1.0
    bt.update(np.empty((0, 4)), np.empty(0))
    clock.t += 0.5
    assert bt.update(np.array([box(104)]), np.array([0.9]))[0] == tid
    clock.t += 3.0
    assert bt.update(np.array([box(104)]), np.array([0.9]))[0] != tid
    assert bt.track_count == 1  # süresi dolan iz silindi (bellek büyümez)


def test_düşük_güvenli_tespit_izi_sürdürür_ama_tek_başına_iz_açmaz():
    clock = Clock()
    bt = ByteTrackLite(clock=clock)
    tid = bt.update(np.array([box(100)]), np.array([0.9]))[0]
    clock.t += 0.2
    assert bt.update(np.array([box(104)]), np.array([0.3]))[0] == tid  # kısmen örtülü kişi izi koparmaz
    assert bt.update(np.array([box(500)]), np.array([0.3]))[0] == -1  # düşük güvenli yabancı iz açmaz
    assert bt.track_count == 1


def test_iou_matrisi_bilinen_değerler():
    iou = iou_matrix(np.array([[0, 0, 10, 10.0]]), np.array([[0, 0, 10, 10.0], [5, 0, 15, 10.0], [20, 20, 30, 30.0]]))
    assert iou[0, 0] == pytest.approx(1.0)
    assert iou[0, 1] == pytest.approx(50 / 150)
    assert iou[0, 2] == 0.0


def test_izleyici_tespitlere_kalıcı_kimlik_verir_eşleşmeyen_düşük_güvenliyi_listeden_çıkarır(settings):
    clock = Clock()
    tracker = SecurityTracker(settings=settings, clock=clock)
    det = sv.Detections(
        xyxy=np.array([box(100), box(300)], dtype=float), confidence=np.array([0.9, 0.2]), class_id=np.array([0, 0])
    )
    out = tracker.update_tracks(det)
    assert len(out) == 1 and out.tracker_id is not None  # 0.2 güvenli yabancı iz açmadı


# ---------------------------------------------------------------- 5: kişi yokken yüz


def build(cfg, faces, detector=None):
    app = FakeInsightApp(faces)
    rec = Recorder()
    service = SecurityService(
        faces=FaceStore(loaded=True),
        alerts=AlertQueue(),
        settings=cfg,
        face_engine=FaceEngine(settings=cfg, app=app),
        person_detector=detector or (lambda _f: sv.Detections.empty()),
        recorder=rec,
        grabber_factory=FakeGrabber,
        sleep=lambda _s: None,
    )
    service._grabber = FakeGrabber(frame=noise_frame())
    return service, service.faces, rec


def test_kişi_kutusu_yokken_de_yüz_aranır_ve_kayıtsız_yüz_alarm_üretir(settings):
    """Eski kod: YOLO kişiyi kaçırırsa yüz hiç işlenmezdi → alarm yoktu."""
    cfg = replace(settings, CONFIRMATION_FRAMES=1, PROCESS_EVERY_N_FRAMES=1, IDLE_FACE_SCAN_EVERY=1)
    service, _, rec = build(cfg, [fake_face(unit_embedding(4))])
    state = _LoopState()
    service._tick(state)
    assert [f["kind"] for f in state.face_boxes] == ["unknown"]
    assert len(rec.calls) == 1
    assert state.person_boxes == []


def test_kişi_yokken_yüz_araması_her_nci_turda_yapılır(settings):
    cfg = replace(settings, PROCESS_EVERY_N_FRAMES=1, IDLE_FACE_SCAN_EVERY=3)
    service, _, _ = build(cfg, [fake_face(unit_embedding(4))])
    calls = []
    real_detect = service.face_engine.detect_faces
    service.face_engine.detect_faces = lambda *a, **k: calls.append(1) or real_detect(*a, **k)
    state = _LoopState()
    for _ in range(9):
        service._tick(state)
    assert len(calls) == 3


def test_kişi_yokken_arama_kapatılabilir(settings):
    cfg = replace(settings, PROCESS_EVERY_N_FRAMES=1, IDLE_FACE_SCAN_EVERY=0)
    service, _, rec = build(cfg, [fake_face(unit_embedding(4))])
    state = _LoopState()
    for _ in range(5):
        service._tick(state)
    assert state.face_boxes == [] and rec.calls == []


def test_kişi_yokken_geçiş_bölgesi_dışındaki_yüz_yok_sayılır(settings):
    cfg = replace(
        settings,
        CONFIRMATION_FRAMES=1,
        PROCESS_EVERY_N_FRAMES=1,
        IDLE_FACE_SCAN_EVERY=1,
        ZONE_POLYGON="0.5,0;1,0;1,1;0.5,1",  # karenin sağ yarısı (kare 160 px geniş)
    )
    service, _, rec = build(cfg, [fake_face(unit_embedding(4), bbox=(10, 20, 70, 80))])  # sol yarı
    state = _LoopState()
    service._tick(state)
    assert state.face_boxes == [] and rec.calls == []
    service.face_engine.app.faces = [fake_face(unit_embedding(4), bbox=(95, 20, 155, 80))]  # sağ yarı
    service._tick(state)
    assert [f["kind"] for f in state.face_boxes] == ["unknown"]


def test_kişi_kutusuz_iki_yüz_ayrı_iz_alır(settings):
    clock = Clock()
    tracker = SecurityTracker(settings=settings, clock=clock)
    empty = sv.Detections.empty()
    faces = [np.array([20, 20, 80, 80]), np.array([400, 20, 460, 80])]
    first = tracker.assign_faces(faces, empty)
    clock.t += 0.3
    again = tracker.assign_faces(faces, empty)
    assert first[0] != first[1] and first == again and min(first) >= 1000


def test_kişi_kutuları_varken_kutuya_düşmeyen_küçük_yüz_yok_sayılır(settings):
    tracker = SecurityTracker(settings=settings, clock=Clock())
    person = sv.Detections(xyxy=np.array([box(100)], dtype=float), confidence=np.array([0.9]), class_id=np.array([0]))
    person = tracker.update_tracks(person)
    far_small_face = np.array([500, 20, 540, 60])
    assert tracker.assign_faces([far_small_face], person) == [-1]


# ---------------------------------------------------------------- 6: tek eşik + emin değil


def test_alarm_tekrar_tanıma_ve_tekilleştirme_tek_ayarlı_eşiği_kullanır(settings):
    source = (ROOT / "tracker.py").read_text(encoding="utf-8") + (ROOT / "face_store.py").read_text(encoding="utf-8")
    assert "0.40" not in source and "0.46" not in source and "DEDUP_SIMILARITY_THRESHOLD" not in source
    assert "FACE_SIMILARITY_THRESHOLD" in source


def test_eşik_değişince_alarm_tekrar_tanıma_da_değişir(settings):
    cfg = replace(settings, CONFIRMATION_FRAMES=1, FACE_SIMILARITY_THRESHOLD=0.9)
    clock = Clock()
    tracker = SecurityTracker(settings=cfg, clock=clock)
    a = unit_embedding(1)
    b = with_similarity(a, 0.7)  # 0.9 eşiğinde farklı kişi
    assert tracker.record_unknown_and_check_alarm(1, embedding=a)
    clock.t += 5
    assert tracker.record_unknown_and_check_alarm(2, embedding=b)  # eski sabit 0.40 bunu "aynı kişi" sayardı


def test_emin_değil_bandındaki_yüz_kayıtsız_sayılmaz_alarm_sayacına_girmez(settings):
    cfg = replace(settings, CONFIRMATION_FRAMES=1, PROCESS_EVERY_N_FRAMES=1, IDLE_FACE_SCAN_EVERY=1)
    guest = unit_embedding(10)
    lookalike = with_similarity(guest, 0.33)  # eşik 0.36, marj 0.06 → bant
    service, db, rec = build(cfg, [fake_face(lookalike)])
    add_guest(service, "Bant Örnek", "7", guest)
    state = _LoopState()
    for _ in range(3):
        service._tick(state)
    face = state.face_boxes[0]
    assert 0.3 <= face["score"] < 0.36
    assert face["kind"] == "uncertain" and rec.calls == []


def test_marj_sıfırsa_bant_yoktur_aynı_yüz_kayıtsız_alarmı_üretir(settings):
    cfg = replace(
        settings, CONFIRMATION_FRAMES=1, PROCESS_EVERY_N_FRAMES=1, IDLE_FACE_SCAN_EVERY=1, FACE_UNCERTAIN_MARGIN=0.0
    )
    guest = unit_embedding(10)
    lookalike = with_similarity(guest, 0.33)
    service, db, rec = build(cfg, [fake_face(lookalike)])
    add_guest(service, "Bant Örnek", "7", guest)
    state = _LoopState()
    service._tick(state)
    assert state.face_boxes[0]["kind"] == "unknown" and len(rec.calls) == 1


# ---------------------------------------------------------------- 20: kutu verisi, yazı yok


def test_kutu_ve_etiket_verisi_normalleştirilmiş_koordinatla_api_ye_verilir(settings):
    cfg = replace(settings, CONFIRMATION_FRAMES=1, PROCESS_EVERY_N_FRAMES=1)
    guest = unit_embedding(5)
    service, db, _ = build(cfg, [fake_face(guest, bbox=(40, 20, 100, 80))], detector=one_person_detector())
    add_guest(service, "Ayşe Örnek", "12", guest)
    service._tick(_LoopState())
    overlay = service.get_overlay()
    assert overlay["frame"] == {"width": 160, "height": 120}
    face = overlay["faces"][0]
    assert face["kind"] == "known" and face["name"] == "Ayşe Örnek" and face["room"] == "12"
    assert face["box"] == [0.25, 0.1667, 0.625, 0.6667]
    assert overlay["persons"][0]["name"] == "Ayşe Örnek"
    assert all(0.0 <= v <= 1.0 for v in face["box"])
    assert overlay["camera_connected"] is True and overlay["guests_count"] == 1


def test_çizim_yazısı_kaynaktan_kalktı_opencv_puttext_ve_çizim_yok():
    for name in ("security_service.py", "web_app.py", "tracker.py", "face_engine.py"):
        source = (ROOT / name).read_text(encoding="utf-8")
        assert not re.search(r"cv2\.(putText|rectangle|polylines|getTextSize)", source), name
        assert "draw_overlays" not in source, name


def test_örtülü_kamerada_kutu_verisi_boştur_durum_bayrağı_gelir(settings):
    cfg = replace(settings, PROCESS_EVERY_N_FRAMES=1)
    service, _, _ = build(cfg, [fake_face(unit_embedding(1))])
    service._grabber = FakeGrabber(frame=np.zeros((120, 160, 3), dtype=np.uint8))
    service._tick(_LoopState())
    overlay = service.get_overlay()
    assert overlay["camera_covered"] is True and overlay["faces"] == [] and overlay["persons"] == []


# ---------------------------------------------------------------- 23, 24: yayın


def test_yayın_aynı_kareyi_tekrar_göndermez_yalnız_yeni_karede_kodlar(settings):
    service, _, _ = build(replace(settings, PROCESS_EVERY_N_FRAMES=1), [])
    state = _LoopState()
    service._tick(state)
    seq, jpeg = service.stream_frame(-2)
    assert jpeg and jpeg[:2] == b"\xff\xd8"
    assert service.stream_frame(seq) == (seq, None)  # yeni kare yok → gönderme yok
    service._tick(state)
    seq2, jpeg2 = service.stream_frame(seq)
    assert seq2 == seq + 1 and jpeg2


def test_yayın_izleyiciler_arasında_önbellekten_paylaşılır_tek_kodlama(settings, monkeypatch):
    service, _, _ = build(settings, [])
    service._tick(_LoopState())
    count = []
    real = service._encode_stream
    monkeypatch.setattr(service, "_encode_stream", lambda f: count.append(1) or real(f))
    a = service.stream_frame(-2)
    b = service.stream_frame(-2)
    assert a == b and len(count) == 1


def test_yayın_küçültülür_ve_çizimsizdir(settings):
    import cv2

    cfg = replace(settings, STREAM_MAX_WIDTH=160)
    service, _, _ = build(cfg, [])
    big = noise_frame(h=480, w=640)
    service._grabber = FakeGrabber(frame=big)
    service._tick(_LoopState())
    _, jpeg = service.stream_frame(-2)
    decoded = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
    assert decoded.shape[:2] == (120, 160)  # oran korunur
    original = cv2.resize(big, (160, 120), interpolation=cv2.INTER_AREA)
    assert float(np.mean(np.abs(decoded.astype(int) - original.astype(int)))) < 25  # yalnız JPEG kaybı; üstüne çizim yok


def test_kamera_yokken_düz_koyu_kare_bir_kez_gider_yazı_yok(settings):
    import cv2

    service, _, _ = build(settings, [])  # hiç kare işlenmedi
    seq, jpeg = service.stream_frame(-2)
    assert seq == -1 and jpeg
    assert service.stream_frame(seq) == (seq, None)
    decoded = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
    assert float(np.std(decoded)) < 3  # düz renk: metin çizilmemiş


def test_aynı_karede_analiz_iki_kez_çalışmaz_gerçek_okuyucu_kare_numarası_verir(settings):
    class Seq(FakeGrabber):
        frame_seq = 5

    cfg = replace(settings, PROCESS_EVERY_N_FRAMES=1)
    service, _, _ = build(cfg, [])
    service._grabber = Seq(frame=noise_frame())
    analyses = []
    real = service._analyze
    service._analyze = lambda f, st: analyses.append(1) or real(f, st)
    state = _LoopState()
    for _ in range(4):
        service._tick(state)
    assert len(analyses) == 1 and service.frame_seq == 1
