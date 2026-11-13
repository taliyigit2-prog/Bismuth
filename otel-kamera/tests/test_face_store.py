"""Bellekteki yüz listesi ve alarm kuyruğu (P20c; K-51, K-53)."""

import base64

import numpy as np
import pytest

from face_store import EMBEDDING_DIM, AlertQueue, FaceListError, FaceStore, decode_embedding, encode_embedding
from tests.conftest import FakeClock, unit_embedding


def test_vektör_base64_gidiş_dönüş_aynı_kalır():
    vec = unit_embedding(3)
    assert np.array_equal(decode_embedding(encode_embedding(vec)), vec)


@pytest.mark.parametrize(
    "text",
    [
        "not base64!!",
        base64.b64encode(b"kisa").decode(),
        base64.b64encode(np.zeros(EMBEDDING_DIM, dtype="<f4").tobytes()).decode(),
        base64.b64encode(np.full(EMBEDDING_DIM, np.nan, dtype="<f4").tobytes()).decode(),
    ],
)
def test_geçersiz_vektör_reddedilir(text):
    with pytest.raises(FaceListError):
        decode_embedding(text)


def test_liste_tamamen_değişir_biri_geçersizse_hiçbiri_alınmaz():
    store = FaceStore()
    assert store.replace([("f1", "Ayşe Örnek", "12", encode_embedding(unit_embedding(1)))]) == 1
    with pytest.raises(FaceListError):
        store.replace([("f2", "Can Örnek", "3", encode_embedding(unit_embedding(2))), ("f3", "Bozuk", "4", "###")])
    assert [f[0] for f in store.snapshot()] == ["f1"]
    store.replace([])
    assert store.snapshot() == [] and store.guest_count() == 0


def test_aynı_kişinin_açıları_tek_misafir_sayılır():
    store = FaceStore()
    emb = encode_embedding(unit_embedding(1))
    store.replace([("a", "Ayşe Örnek", "12", emb), ("b", " ayşe örnek ", "12", emb), ("c", "Can Örnek", "12", emb)])
    assert store.guest_count() == 2


def test_adsız_odasız_yüzler_personel_sayılır_misafir_sayılmaz():
    store = FaceStore()
    emb = encode_embedding(unit_embedding(1))
    store.replace([("staff:1", "", "", emb), ("staff:2", " ", "", emb), ("a", "Ayşe Örnek", "12", emb)])
    assert len(store.snapshot()) == 3
    assert store.guest_count() == 1


def test_alarm_kuyruğu_numara_verir_after_ile_yalnız_yenileri_döner():
    queue = AlertQueue(clock=FakeClock())
    ids = [queue.add(track, b"\xff\xd8" + bytes([track])) for track in (5, 6, 7)]
    assert ids == [1, 2, 3]
    assert [a.id for a in queue.since(0)] == [1, 2, 3]
    assert [a.id for a in queue.since(2)] == [3]
    assert [a.id for a in queue.since(0, limit=2)] == [1, 2]
    assert queue.since(0)[0].alert_time == "2026-11-13T12:00:00"


def test_kuyruk_sınırlıdır_en_eski_düşer_ve_her_çalışmanın_kendi_boot_değeri_vardır():
    queue = AlertQueue(max_items=2, clock=FakeClock())
    for track in range(4):
        queue.add(track, b"x")
    assert [a.id for a in queue.since(0)] == [3, 4]
    assert AlertQueue().boot != AlertQueue().boot
