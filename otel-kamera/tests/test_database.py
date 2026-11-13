"""Yerel misafir/alarm veritabanı: kod bulguları 7, 8, 16, 17, 18, 19, 21, 22 ve 28 (gerçek hotel_guests.db'ye dokunulmaz)."""

import os
import sqlite3
import threading
import time
from dataclasses import replace

import numpy as np
import pytest

import database
from database import GuestDatabase, face_sibling
from tests.conftest import unit_embedding
from timeutil import checkout_deadline, fmt, parse_local


@pytest.fixture
def db(settings, clock):
    return GuestDatabase(settings.DB_PATH, settings, clock)


def _out(clock, days=10):
    return checkout_deadline(days, clock=clock)


def test_aynı_odada_iki_kişiden_yalnız_biri_çıkış_yapınca_diğeri_kalır(db, clock):
    a = db.add_guest("Ahmet Örnek", "204", unit_embedding(1), _out(clock))
    b = db.add_guest("Mehmet Örnek", "204", unit_embedding(2), _out(clock))
    assert len(db.get_active_guests()) == 2
    assert db.deactivate_guest(a)
    assert [g[0] for g in db.get_active_guests()] == [b]


def test_çıkış_yalnız_aynı_konaklamayı_kapatır_başka_tarihteki_aynı_ad_oda_kalır(db, clock):
    """Kod bulgusu 18: ad+oda eşitliği toplu çıkış yapmaz; çıkış tarihi de aynı olmalı."""
    short_stay = _out(clock, 3)
    first = db.add_guest("Ali Veli", "101", unit_embedding(1), short_stay)
    clock.advance(minutes=1)
    second = db.add_guest("Ali Veli", "101", unit_embedding(9), _out(clock, 20))
    angle = db.add_guest("Ali Veli", "101", unit_embedding(10), short_stay)  # aynı konaklamanın ikinci açısı
    assert db.deactivate_guest(first)
    remaining = {g[0] for g in db.get_active_guests()}
    assert remaining == {second}
    assert angle not in remaining


def test_okuma_yolu_yazmaz_süresi_dolan_gizlenir_ama_satır_değişmez(db, settings, clock):
    """Kod bulgusu 16: get_active_guests UPDATE yapmaz."""
    gid = db.add_guest("Süre Doldu", "5", unit_embedding(3), _out(clock, 1))
    clock.advance(days=2)
    assert db.get_active_guests() == []
    assert db.list_active_guests_info() == []
    raw = sqlite3.connect(settings.DB_PATH).execute("SELECT is_active FROM guests WHERE id=?", (gid,)).fetchone()
    assert raw[0] == 1
    assert db.cleanup_expired_guests() == 1  # yazma yalnız açık çağrıyla


def test_geçersiz_çıkış_tarihi_reddedilir_geçerli_biçimler_kabul_edilir():
    """Kod bulgusu 17."""
    for bad in ("12.05.2025", "abc", "2026-13-40", ""):
        with pytest.raises(ValueError):
            parse_local(bad)
    assert fmt(parse_local("2026-05-12")) == "2026-05-12T23:59:59"
    assert fmt(parse_local("2026-05-12 14:30")) == "2026-05-12T14:30:00"
    assert fmt(parse_local("2026-05-12T14:30:15")) == "2026-05-12T14:30:15"


def test_çift_tıklama_aynı_satırı_döner_beş_saniye_sonra_yeni_satır_açılır(db, clock):
    """Kod bulgusu 19."""
    emb = unit_embedding(4)
    first = db.add_guest("Çift Tık", "7", emb, _out(clock))
    assert db.add_guest("Çift Tık", "7", emb, _out(clock)) == first
    clock.advance(seconds=30)
    assert db.add_guest("Çift Tık", "7", emb, _out(clock)) != first


def test_zaman_damgaları_tek_yerel_biçimde_ve_eski_satırlar_dönüştürülür(settings, clock):
    """Kod bulgusu 21: 'YYYY-MM-DDTHH:MM:SS'; CURRENT_TIMESTAMP (UTC) kullanılmaz."""
    legacy = sqlite3.connect(settings.DB_PATH)
    legacy.execute(
        "CREATE TABLE guests (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, room_number TEXT NOT NULL,"
        " check_in_date TEXT NOT NULL, check_out_date TEXT NOT NULL, embedding BLOB NOT NULL, photo_path TEXT DEFAULT '',"
        " is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP)"
    )
    legacy.execute(
        "INSERT INTO guests (name, room_number, check_in_date, check_out_date, embedding) VALUES"
        " ('Eski', '1', '2026-11-01 10:00:00', '2026-11-20 23:59:59', ?)",
        (unit_embedding(5).tobytes(),),
    )
    legacy.commit()
    legacy.close()
    db = GuestDatabase(settings.DB_PATH, settings, clock)
    info = db.get_guest_by_id(1)
    assert info["check_in_date"] == "2026-11-01T10:00:00" and info["check_out_date"] == "2026-11-20T23:59:59"
    new_id = db.add_guest("Yeni", "2", unit_embedding(6), _out(clock))
    assert db.get_guest_by_id(new_id)["check_in_date"] == "2026-11-13T12:00:00"


def test_her_bağlantı_kapanır_ve_eşzamanlı_yazma_kilitlenmez(settings, clock, monkeypatch):
    """Kod bulgusu 22: bağlantı sızıntısı yok; çoklu iş parçacığı yazması 'database is locked' vermez."""
    real = sqlite3.connect
    counts = {"open": 0, "closed": 0}

    class Tracked(sqlite3.Connection):
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            counts["open"] += 1

        def close(self):
            counts["closed"] += 1
            super().close()

    monkeypatch.setattr(database.sqlite3, "connect", lambda *a, **k: real(*a, factory=Tracked, **k))
    db = GuestDatabase(settings.DB_PATH, settings, clock)
    errors: list[BaseException] = []

    def work(n: int) -> None:
        try:
            for i in range(10):
                db.add_guest(f"K{n}-{i}", str(n), unit_embedding(n * 100 + i), _out(clock))
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=work, args=(n,)) for n in range(4)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert errors == []
    assert len(db.get_active_guests()) == 40
    assert counts["open"] == counts["closed"] > 0


def _insert_alert(settings, at: str, emb: np.ndarray, tmp_path, name: str) -> str:
    os.makedirs(settings.ALERTS_DIR, exist_ok=True)
    img = os.path.join(settings.ALERTS_DIR, f"alert_{name}.jpg")
    open(img, "wb").write(b"x")
    conn = sqlite3.connect(settings.DB_PATH)
    conn.execute(
        "INSERT INTO alert_logs (alert_time, image_path, face_crop_path, embedding, details) VALUES (?,?,?,?,?)",
        (at, img, "", emb.tobytes(), "t"),
    )
    conn.commit()
    conn.close()
    return img


def test_bakım_tekilleştirmesi_yalnız_pencere_içindeki_aynı_yüzü_birleştirir(settings, clock, tmp_path):
    """Kod bulgusu 7: 12 saatten uzak iki alarm (aynı yüz) birleşmez; yakın olanlar birleşir."""
    db = GuestDatabase(settings.DB_PATH, settings, clock)
    emb = unit_embedding(7)
    far = _insert_alert(settings, "2026-11-12T08:00:00", emb, tmp_path, "far")  # 28 saat önce
    near_old = _insert_alert(settings, "2026-11-13T09:00:00", emb, tmp_path, "near_old")
    near_new = _insert_alert(settings, "2026-11-13T10:00:00", emb, tmp_path, "near_new")
    stats = db.run_storage_maintenance()
    assert stats["removed_duplicate_alerts"] == 1
    kept = {a["image_path"] for a in db.get_recent_alerts()}
    assert kept == {far, near_new}
    assert not os.path.exists(near_old)


def test_sahipsiz_dosya_temizliği_yeni_dosyaya_dokunmaz_eskisini_siler(db, settings):
    """Kod bulgusu 8: yazma yarışı — yaşı < ORPHAN_MIN_AGE_SECONDS olan dosya silinmez."""
    os.makedirs(settings.ALERTS_DIR, exist_ok=True)
    fresh = os.path.join(settings.ALERTS_DIR, "alert_fresh.jpg")
    stale = os.path.join(settings.ALERTS_DIR, "alert_stale.jpg")
    for p in (fresh, stale):
        open(p, "wb").write(b"x")
    old = time.time() - settings.ORPHAN_MIN_AGE_SECONDS - 60
    os.utime(stale, (old, old))
    stats = db.run_storage_maintenance()
    assert os.path.exists(fresh) and not os.path.exists(stale)
    assert stats["removed_orphan_files"] == 1


def test_saklama_süresi_ve_kota_eski_alarmları_siler(settings, clock):
    tight = replace(settings, MAX_ALERT_COUNT=2)
    db = GuestDatabase(tight.DB_PATH, tight, clock)
    for i in range(4):
        db.log_alert(image_path=_touch(tight, f"alert_q{i}.jpg"), embedding=unit_embedding(50 + i), details=f"a{i}")
    db.run_storage_maintenance()
    assert len(db.get_recent_alerts()) == 2
    clock.advance(days=40)
    db.run_storage_maintenance()
    assert db.get_recent_alerts() == []


def _touch(settings, name: str) -> str:
    os.makedirs(settings.ALERTS_DIR, exist_ok=True)
    path = os.path.join(settings.ALERTS_DIR, name)
    open(path, "wb").write(b"x")
    return path


def test_yüz_kırpması_yolu_klasör_adındaki_alert_ön_ekinden_etkilenmez():
    assert face_sibling("/data/alert_old/alert_X.jpg") == "/data/alert_old/face_X.jpg"
