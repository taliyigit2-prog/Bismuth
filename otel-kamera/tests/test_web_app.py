"""Uç noktalar: Telegram yok (K-50), panel yok, `def` uç noktaları (14); P20c: yüz listesi, yakalama, alarm çekme, diske yazma yok."""

import base64
import inspect

import cv2
import numpy as np
import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from face_store import AlertQueue, FaceStore, decode_embedding, encode_embedding
from tests.conftest import PORT, TOKEN, noise_frame, unit_embedding
from tests.fakes import FakeService, wait_until
from web_app import create_app, sanitize_text

H = {"X-Bismuth-Token": TOKEN}


@pytest.fixture
def env(settings):
    faces, alerts = FaceStore(), AlertQueue()
    service = FakeService()
    service.live_face = (unit_embedding(1), np.zeros((240, 240, 3), dtype=np.uint8))
    app = create_app(settings, TOKEN, faces, alerts, lambda: service)
    with TestClient(app, base_url=f"http://127.0.0.1:{PORT}") as client:
        assert wait_until(lambda: client.get("/api/health", headers=H).json()["state"] == "running")
        yield client, faces, alerts, service, app


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


def test_eski_misafir_alarm_ve_fotoğraf_uç_noktaları_ve_statik_yollar_yok(env):
    client, *_, app = env
    paths = [r.path for r in app.routes]
    assert not [p for p in paths if p.startswith(("/api/guests", "/alerts", "/guest_photos", "/api/system/cleanup"))]
    assert client.post("/api/guests/from-camera", headers=H, json={}).status_code == 404
    assert client.get("/guest_photos/x.jpg", headers=H).status_code == 404
    assert client.delete("/api/alerts/1", headers=H).status_code == 404


def test_yüz_listesi_bellekte_tam_değişir_ve_hizmete_haber_verir(env):
    client, faces, _, service, _ = env
    body = {"faces": [{"id": "f1", "name": "D'Arcy <b>", "room": "204", "embedding": encode_embedding(unit_embedding(2))}]}
    res = client.put("/api/faces/active", headers=H, json=body)
    assert res.status_code == 200 and res.json() == {"ok": True, "count": 1}
    assert faces.snapshot()[0][1:3] == ("D'Arcy b", "204")  # etiket karakterleri silinir, kesme işareti kalır
    assert service.changes == 1
    assert client.put("/api/faces/active", headers=H, json={"faces": []}).json()["count"] == 0
    assert faces.snapshot() == []


def test_bozuk_yüz_listesi_422_döner_eski_liste_korunur(env):
    client, faces, *_ = env
    ok = {"id": "f1", "name": "Ayşe", "room": "1", "embedding": encode_embedding(unit_embedding(2))}
    client.put("/api/faces/active", headers=H, json={"faces": [ok]})
    bad = client.put("/api/faces/active", headers=H, json={"faces": [{**ok, "id": "f2", "embedding": "###"}]})
    assert bad.status_code == 422
    assert [f[0] for f in faces.snapshot()] == ["f1"]
    assert client.put("/api/faces/active", json={"faces": []}).status_code == 401


def test_yakalama_vektör_ve_kırpmayı_yanıt_olarak_verir_hiçbir_yerde_saklamaz(env):
    client, faces, alerts, service, _ = env
    res = client.post("/api/faces/capture", headers=H)
    assert res.status_code == 200
    body = res.json()
    assert np.array_equal(decode_embedding(body["embedding"]), unit_embedding(1))
    assert base64.b64decode(body["crop"])[:2] == b"\xff\xd8" and body["model"] == "buffalo_s"
    assert faces.snapshot() == [] and alerts.count() == 0
    service.live_face = None
    assert client.post("/api/faces/capture", headers=H).status_code == 400
    service.camera_connected = False
    assert client.post("/api/faces/capture", headers=H).status_code == 409


def test_alarm_kırpmasından_vektör_çıkarma(env):
    client, *_ = env
    ok, jpeg = cv2.imencode(".jpg", noise_frame(240, 240))
    img = base64.b64encode(jpeg.tobytes()).decode()
    res = client.post("/api/faces/extract", headers=H, json={"image": img})
    assert res.status_code == 200 and len(base64.b64decode(res.json()["embedding"])) == 2048
    assert client.post("/api/faces/extract", headers=H, json={"image": "###"}).status_code == 400
    not_image = base64.b64encode(b"yazi").decode()
    assert client.post("/api/faces/extract", headers=H, json={"image": not_image}).status_code == 400


def test_alarmlar_after_ve_boot_ile_çekilir_boot_değişince_baştan_verilir(env):
    client, _, alerts, *_ = env
    for track in (4, 5, 6):
        alerts.add(track, b"\xff\xd8" + bytes([track]))
    first = client.get("/api/alerts", headers=H).json()
    assert first["boot"] == alerts.boot and [a["id"] for a in first["alerts"]] == [1, 2, 3]
    assert base64.b64decode(first["alerts"][0]["crop"]) == b"\xff\xd8\x04" and first["alerts"][0]["track"] == 4
    assert client.get(f"/api/alerts?after=2&boot={alerts.boot}", headers=H).json()["alerts"][0]["id"] == 3
    # Başka bir çalışmanın numarası bu sürece ait değildir: `after` yok sayılır.
    assert len(client.get(f"/api/alerts?after=2&boot={'0' * 32}", headers=H).json()["alerts"]) == 3
    assert client.get("/api/alerts?after=3&limit=1&boot=" + alerts.boot, headers=H).json()["alerts"] == []


def test_alarm_yanıtı_ad_oda_ya_da_yol_taşımaz(env):
    client, faces, alerts, *_ = env
    faces.replace([("f1", "Gizli Ad", "999", encode_embedding(unit_embedding(2)))])
    alerts.add(1, b"\xff\xd8x")
    text = client.get("/api/alerts", headers=H).text
    assert "Gizli" not in text and "999" not in text and "path" not in text


def test_servis_hazır_değilken_uç_noktalar_503_verir(settings):
    def never_ready():
        raise RuntimeError("model dosyası yok")

    app = create_app(settings, TOKEN, FaceStore(), AlertQueue(), never_ready)
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
    app = create_app(settings, TOKEN, FaceStore(), AlertQueue(), _failing_builder)
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
    service = OneShotService()
    app = create_app(settings, TOKEN, FaceStore(), AlertQueue(), lambda: service)
    with TestClient(app, base_url=f"http://127.0.0.1:{PORT}") as client:
        assert wait_until(lambda: client.get("/api/health", headers=H).json()["state"] == "running")
        res = client.get("/api/stream", headers=H)
    assert res.headers["content-type"].startswith("multipart/x-mixed-replace")
    assert res.content.count(b"image/jpeg") == 1  # ikinci turda yeni kare yok → tekrar yazılmadı
    assert service.asked[:2] == [-2, 7]  # ilk istek "hiçbir kare görmedim", sonra son görülen numara
    assert service.max_viewers == 1 and service.stream_viewers == 0
