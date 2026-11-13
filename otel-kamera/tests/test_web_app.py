"""Uç noktalar: Telegram yok (K-50), panel yok, `def` uç noktaları (14), 422 tarih doğrulaması (17), atomik kayıt (19)."""

import inspect
import os

import numpy as np
import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from database import GuestDatabase
from tests.conftest import PORT, TOKEN, unit_embedding
from tests.fakes import FakeService, wait_until
from web_app import create_app, sanitize_text

H = {"X-Bismuth-Token": TOKEN}


@pytest.fixture
def env(settings):
    db = GuestDatabase(settings.DB_PATH, settings)
    service = FakeService()
    service.live_face = (unit_embedding(1), np.zeros((240, 240, 3), dtype=np.uint8))
    app = create_app(settings, TOKEN, db, lambda: service)
    with TestClient(app, base_url=f"http://127.0.0.1:{PORT}") as client:
        assert wait_until(lambda: client.get("/api/health", headers=H).json()["state"] == "running")
        yield client, db, service, settings, app


def test_telegram_ve_panel_uç_noktaları_yok(env):
    client, *_, app = env
    paths = [r.path for r in app.routes]
    assert not any("telegram" in p for p in paths)
    assert "/" not in paths and not any(p.startswith("/static") for p in paths)
    assert client.get("/", headers=H).status_code == 404
    assert client.post("/api/system/test-telegram", headers=H).status_code in (404, 405)


def test_bloklayan_uç_noktalar_async_değil_iş_parçacığı_havuzunda_çalışır(env):
    *_, app = env
    blocking = [r for r in app.routes if isinstance(r, APIRoute) and r.path != "/api/stream"]
    assert blocking and not [r.path for r in blocking if inspect.iscoroutinefunction(r.endpoint)]


def test_sağlık_durumu_servis_hazır_olunca_running_ve_döngü_bilgisi_verir(env):
    client, *_ = env
    body = client.get("/api/health", headers=H).json()
    assert body["ok"] is True and body["loop"]["state"] in ("ok", "stalled")


def test_geçersiz_çıkış_tarihi_422_döner_ve_kayıt_açılmaz(env):
    client, db, *_ = env
    res = client.post(
        "/api/guests/from-camera",
        headers=H,
        json={"name": "Tarih Hatalı", "room_number": "1", "check_out_date": "12.05.2025"},
    )
    assert res.status_code == 422
    assert db.get_active_guests() == []


def test_kayıt_fotoğrafla_birlikte_atomik_çift_tık_tek_satır_tek_dosya(env):
    client, db, service, settings, _ = env
    body = {"name": "O'Brien <b>", "room_number": "204", "check_out_date": "2099-01-01"}
    first = client.post("/api/guests/from-camera", headers=H, json=body)
    second = client.post("/api/guests/from-camera", headers=H, json=body)
    assert first.status_code == second.status_code == 200
    assert first.json()["guest"]["id"] == second.json()["guest"]["id"]
    assert first.json()["guest"]["name"] == "O'Brien b"  # kesme işareti kalır, etiket karakterleri silinir
    assert len(os.listdir(settings.GUEST_PHOTOS_DIR)) == 1
    assert os.path.exists(first.json()["guest"]["photo_path"])
    assert service.reloads == 2


def test_alarmdan_kayıt_ve_çıkış_akışı_eski_sistem_testinin_karşılığı(env):
    client, db, service, settings, _ = env
    os.makedirs(settings.ALERTS_DIR, exist_ok=True)
    crop = os.path.join(settings.ALERTS_DIR, "alert_friend.jpg")
    open(crop, "wb").write(b"x")
    alert_id = db.log_alert(image_path=crop, face_crop_path=crop, embedding=unit_embedding(7), details="t")
    res = client.post(f"/api/alerts/{alert_id}/register", headers=H, json={"name": "Caner Kaya", "room_number": "204", "days": 15})
    assert res.status_code == 200 and res.json()["ok"] is True
    assert res.headers["X-Frame-Options"] == "DENY" and res.headers["X-Content-Type-Options"] == "nosniff"
    assert client.get("/api/guests", headers=H).json()["total"] == 1
    assert client.get("/api/alerts", headers=H).json()["alerts"] == []
    gid = res.json()["guest"]["id"]
    assert client.post(f"/api/guests/{gid}/checkout", headers=H).status_code == 200
    assert client.post(f"/api/guests/{gid}/checkout", headers=H).status_code == 400


def test_kameradan_tanıma_yalnız_aday_döner_çıkış_yapmaz(env):
    client, db, service, *_ = env
    gid = db.add_guest("Aday Kişi", "5", unit_embedding(2), "2099-01-01T23:59:59")
    service.identified = (True, "Aday Kişi tanındı", db.get_guest_by_id(gid))
    res = client.post("/api/guests/identify-from-camera", headers=H)
    assert res.status_code == 200 and res.json()["needs_confirmation"] is True
    assert db.get_guest_by_id(gid)["is_active"] is True
    assert client.post("/api/guests/checkout-from-camera", headers=H).status_code in (404, 405)


def test_servis_hazır_değilken_uç_noktalar_503_verir(settings):
    db = GuestDatabase(settings.DB_PATH, settings)

    def never_ready():
        raise RuntimeError("model dosyası yok")

    app = create_app(settings, TOKEN, db, never_ready)
    with TestClient(app, base_url=f"http://127.0.0.1:{PORT}") as client:
        assert wait_until(lambda: client.get("/api/health", headers=H).json()["state"] == "failed")
        health = client.get("/api/health", headers=H).json()
        assert health["ok"] is False and "model dosyası yok" in health["error"]
        assert client.post("/api/system/toggle-alarms", headers=H).status_code == 503


def test_metin_temizliği_kontrol_karakterlerini_siler_kesme_işaretini_korur():
    assert sanitize_text("  D'Arcy\x00<x>\n") == "D'Arcyx"


def test_kutu_verisi_uç_noktası_belirteç_ister_ve_hizmetin_verisini_döner(env):
    client, *_ = env
    assert client.get("/api/overlay").status_code == 401
    body = client.get("/api/overlay", headers=H).json()
    assert body["seq"] == 1 and body["persons"] == [] and body["faces"] == []


def _failing_builder():
    raise RuntimeError("model yok")


def test_kutu_verisi_hizmet_hazır_değilken_boş_ama_aynı_biçimde_döner(settings):
    db = GuestDatabase(settings.DB_PATH, settings)
    app = create_app(settings, TOKEN, db, _failing_builder)
    with TestClient(app, base_url=f"http://127.0.0.1:{PORT}") as client:
        assert wait_until(lambda: client.get("/api/health", headers=H).json()["state"] == "failed")
        body = client.get("/api/overlay", headers=H).json()
        assert body["faces"] == [] and body["persons"] == [] and body["camera_connected"] is False


class OneShotService(FakeService):
    """Tek kare gönderip durur: sonsuz akış TestClient'ı bekletmesin."""

    def __init__(self) -> None:
        super().__init__()
        self.max_viewers = 0
        self.asked: list = []

    def viewer_joined(self) -> None:
        super().viewer_joined()
        self.max_viewers = max(self.max_viewers, self.stream_viewers)

    def stream_frame(self, last_seq: int):
        self.asked.append(last_seq)
        if len(self.asked) > 1:
            self._running = False
            return last_seq, None
        return 7, b"\xff\xd8\xff"


def test_canlı_yayın_son_kare_numarasını_sorar_yalnız_yeni_kareyi_yazar_ve_izleyiciyi_sayar(settings):
    db = GuestDatabase(settings.DB_PATH, settings)
    service = OneShotService()
    app = create_app(settings, TOKEN, db, lambda: service)
    with TestClient(app, base_url=f"http://127.0.0.1:{PORT}") as client:
        assert wait_until(lambda: client.get("/api/health", headers=H).json()["state"] == "running")
        res = client.get("/api/stream", headers=H)
    assert res.headers["content-type"].startswith("multipart/x-mixed-replace")
    assert res.content.count(b"image/jpeg") == 1  # ikinci turda yeni kare yok → tekrar yazılmadı
    assert service.asked[:2] == [-2, 7]  # ilk istek "hiçbir kare görmedim", sonra son görülen numara
    assert service.max_viewers == 1 and service.stream_viewers == 0
