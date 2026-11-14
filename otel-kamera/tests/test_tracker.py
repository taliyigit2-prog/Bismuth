"""İzleyici: doğrulanmış kimlik ömrü (3), zaman pencereli sayaç ve temizlik (4), kilit (15), poligon (26)."""

import logging
import threading
from dataclasses import replace

import numpy as np
import pytest

from tests.conftest import unit_embedding
from tracker import SecurityTracker, parse_polygon

GUEST = (1, "Ali Örnek", "101", 0.8)


class Tick:
    def __init__(self) -> None:
        self.t = 1_000.0

    def __call__(self) -> float:
        return self.t


@pytest.fixture
def tick():
    return Tick()


@pytest.fixture
def tracker(settings, tick):
    return SecurityTracker(settings=replace(settings, CONFIRMATION_FRAMES=3), clock=tick)


def test_doğrulanmış_kimlik_süresi_dolunca_düşer(tracker, tick, settings):
    tracker.register_verified(5, GUEST)
    assert tracker.get_verified(5) == GUEST
    tick.t += settings.VERIFIED_TTL_SECONDS + 1
    assert tracker.get_verified(5) is None
    assert 5 not in tracker.verified_tracks


def test_yabancı_yüz_doğrulanmış_izi_devralamaz_üç_eşleşmeme_kimliği_düşürür(tracker):
    """Kod bulgusu 3 (tailgating): eşleşmeyen yüz kimliği tazelemez; ardışık eşleşmeme sonunda düşer."""
    tracker.register_verified(5, GUEST)
    assert tracker.resolve_unmatched(5) == GUEST
    assert tracker.resolve_unmatched(5) == GUEST
    assert tracker.resolve_unmatched(5) is None
    assert tracker.get_verified(5) is None


def test_eşleşmeme_sırasında_kimlik_tazelenmez_süre_yine_dolar(tracker, tick, settings):
    tracker.register_verified(5, GUEST)
    tick.t += settings.VERIFIED_TTL_SECONDS - 1
    assert tracker.resolve_unmatched(5) == GUEST
    tick.t += 2
    assert tracker.get_verified(5) is None


def test_gerçek_eşleşme_eşleşmeme_sayacını_sıfırlar(tracker):
    tracker.register_verified(5, GUEST)
    tracker.resolve_unmatched(5)
    tracker.resolve_unmatched(5)
    tracker.register_verified(5, GUEST)
    assert tracker.resolve_unmatched(5) == GUEST


def test_kayıtsız_alarm_yalnız_pencere_içinde_ardışık_karelerle_verilir(tracker, tick, settings):
    """Kod bulgusu 4: 'toplam' değil 'üst üste'; aralık pencereyi aşarsa sayaç yeniden başlar."""
    emb = unit_embedding(1)
    assert not tracker.record_unknown_and_check_alarm(9, emb)
    assert not tracker.record_unknown_and_check_alarm(9, emb)
    tick.t += settings.CONFIRMATION_WINDOW_SECONDS + 1  # aradan günler geçmiş gibi
    assert not tracker.record_unknown_and_check_alarm(9, emb)  # sayaç 1'den başladı
    assert not tracker.record_unknown_and_check_alarm(9, emb)
    assert tracker.record_unknown_and_check_alarm(9, emb)  # pencere içinde 3. kare


def test_soğuma_süresi_aynı_iz_ve_aynı_yüze_ikinci_alarmı_engeller(tracker, tick, settings):
    emb = unit_embedding(2)
    for _ in range(2):
        tracker.record_unknown_and_check_alarm(1, emb)
    assert tracker.record_unknown_and_check_alarm(1, emb)
    for _ in range(3):  # iz kimliği değişti ama yüz aynı
        fired = tracker.record_unknown_and_check_alarm(2, emb)
    assert not fired
    tick.t += settings.ALARM_COOLDOWN_SECONDS + 1
    for _ in range(3):
        fired = tracker.record_unknown_and_check_alarm(3, emb)
    assert fired


def test_sözlükler_periyodik_temizlenir_bellek_büyümez(tracker, tick, settings):
    for tid in range(200):
        tracker.record_unknown_and_check_alarm(tid, unit_embedding(tid))
        tracker.register_verified(1000 + tid, GUEST)
    assert len(tracker.unknown_counts) > 0 and len(tracker.verified_tracks) == 200
    tick.t += settings.ALARM_COOLDOWN_SECONDS + settings.VERIFIED_TTL_SECONDS + 1
    tracker.prune()
    assert tracker.unknown_counts == {} and tracker.verified_tracks == {}
    assert tracker.alert_history == {} and tracker.mismatch_counts == {}


def test_eşzamanlı_okuma_yazma_ve_hafıza_sıfırlama_istisna_vermez(settings):
    """Kod bulgusu 15: reload_guests clear_memory ile analiz iş parçacığı yarışmaz."""
    tr = SecurityTracker(settings=settings)
    errors: list[BaseException] = []
    stop = threading.Event()

    def analyzer() -> None:
        i = 0
        try:
            while not stop.is_set():
                tr.register_verified(i % 50, GUEST)
                tr.record_unknown_and_check_alarm(i % 50, unit_embedding(i % 7))
                tr.get_verified(i % 50)
                tr.resolve_unmatched(i % 50)
                i += 1
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    def reloader() -> None:
        try:
            for _ in range(2000):
                tr.clear_memory()
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    workers = [threading.Thread(target=analyzer) for _ in range(3)]
    [w.start() for w in workers]
    reloader()
    stop.set()
    [w.join() for w in workers]
    assert errors == []


def test_oranlı_poligon_çözünürlüğe_göre_pikselleşir(settings):
    """Kod bulgusu 26: 0..1 değerler kare boyutuyla ölçeklenir."""
    tr = SecurityTracker(settings=replace(settings, ZONE_POLYGON="0.1,0.1;0.9,0.1;0.9,0.9;0.1,0.9"))
    assert tr.polygon is None  # ilk kare gelene kadar bekler
    tr.configure_frame(1000, 500)
    assert tr.polygon.tolist() == [[100, 50], [900, 50], [900, 450], [100, 450]]
    tr.configure_frame(2000, 1000)  # çözünürlük değişti
    assert tr.polygon.tolist()[0] == [200, 100]


def test_piksel_poligonu_olduğu_gibi_kalır(settings):
    tr = SecurityTracker(settings=replace(settings, ZONE_POLYGON="10,10;200,10;200,150"))
    assert tr.polygon.tolist() == [[10, 10], [200, 10], [200, 150]]


def test_bozuk_poligon_sessiz_değil_uyarıyla_devre_dışı_kalır(caplog):
    with caplog.at_level(logging.WARNING, logger="otel-kamera.tracker"):
        poly, normalized = parse_polygon("1,2;abc")
    assert poly is None and not normalized
    assert "okunamadı" in caplog.text
    assert parse_polygon("1,1;2,2")[0] is None  # iki nokta yetmez
    assert isinstance(parse_polygon("0,0;1,0;1,1")[0], np.ndarray)
