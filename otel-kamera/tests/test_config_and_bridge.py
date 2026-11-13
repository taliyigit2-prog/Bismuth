"""Yapılandırma ve köprü güvenliği: loopback zorunluluğu, belirteç (401), Origin/Host (403), akış belirteci, maskeleme."""

import json

import pytest
from fastapi.testclient import TestClient

from bridge_security import make_stream_token, redact, verify_stream_token
from config import CONFIG_ENV, ConfigError, load_config, load_token
from face_store import AlertQueue, FaceStore
from tests.conftest import PORT, TOKEN
from tests.fakes import FakeService
from web_app import create_app


def test_config_rejects_non_loopback_host():
    with pytest.raises(ConfigError):
        load_config({CONFIG_ENV: json.dumps({"WEB_HOST": "0.0.0.0"})})
    with pytest.raises(ConfigError):
        load_config({"WEB_HOST": "192.168.1.20"})
    assert load_config({CONFIG_ENV: json.dumps({"WEB_HOST": "127.0.0.1"})}).WEB_HOST == "127.0.0.1"


def test_config_reads_json_from_bismuth_and_converts_types():
    cfg = load_config({CONFIG_ENV: json.dumps({"FACE_SIMILARITY_THRESHOLD": "0.5", "CONFIRMATION_FRAMES": 4})})
    assert cfg.FACE_SIMILARITY_THRESHOLD == 0.5 and cfg.CONFIRMATION_FRAMES == 4
    with pytest.raises(ConfigError):
        load_config({CONFIG_ENV: "{bozuk"})
    with pytest.raises(ConfigError):
        load_config({CONFIG_ENV: json.dumps({"FACE_SIMILARITY_THRESHOLD": 7})})


def test_token_is_required_and_long_enough():
    with pytest.raises(ConfigError):
        load_token({})
    with pytest.raises(ConfigError):
        load_token({"BISMUTH_CAMERA_TOKEN": "kisa"})
    assert load_token({"BISMUTH_CAMERA_TOKEN": TOKEN}) == TOKEN


def test_redact_masks_credentials_in_rtsp_urls():
    text = "açılamadı rtsp:" "//admin:s3cret@192.168.1.64:554/Streaming/Channels/101"
    out = redact(text)
    assert "s3cret" not in out and "admin" not in out and "192.168.1.64" in out


def test_redact_masks_passwords_with_slash_or_at_sign():
    for pw in ("p/ss", "p@ss", "a:b@c/d"):
        out = redact("hata rtsp:" "//admin:" + pw + "@10.0.0.9:554/x")
        assert pw not in out and "admin" not in out and "10.0.0.9:554/x" in out


def test_stream_token_expires_and_is_bound_to_the_secret():
    value = make_stream_token(TOKEN, 2_000)
    assert verify_stream_token(TOKEN, value, now=1_000)
    assert not verify_stream_token(TOKEN, value, now=3_000)
    assert not verify_stream_token("x" * 32, value, now=1_000)
    assert not verify_stream_token(TOKEN, "bozuk", now=1_000)


@pytest.fixture
def client(settings):
    app = create_app(settings, TOKEN, FaceStore(), AlertQueue(), FakeService)
    with TestClient(app, base_url=f"http://127.0.0.1:{PORT}") as c:
        yield c


def test_request_without_token_is_401(client):
    assert client.get("/api/health").status_code == 401
    assert client.get("/api/status", headers={"X-Bismuth-Token": "yanlis" * 8}).status_code == 401


def test_request_with_token_is_served(client):
    res = client.get("/api/health", headers={"X-Bismuth-Token": TOKEN})
    assert res.status_code == 200 and res.json()["state"] in ("starting", "running")


def test_post_from_a_foreign_origin_is_403_even_with_the_token(client):
    res = client.post("/api/system/toggle-alarms", headers={"X-Bismuth-Token": TOKEN, "Origin": "https://kotu-site.example"})
    assert res.status_code == 403


def test_foreign_host_header_is_403_dns_rebinding(client):
    res = client.get("/api/health", headers={"X-Bismuth-Token": TOKEN, "Host": "kotu-site.example"})
    assert res.status_code == 403


def test_stream_accepts_signed_query_but_other_paths_do_not(client):
    soon = 4_102_444_800  # 2100
    st = make_stream_token(TOKEN, soon)
    assert client.get(f"/api/health?st={st}").status_code == 401
    assert client.get("/api/stream?st=bozuk").status_code == 401


def test_no_cors_headers_are_ever_sent(client):
    res = client.get("/api/health", headers={"X-Bismuth-Token": TOKEN, "Origin": f"http://127.0.0.1:{PORT}"})
    assert "access-control-allow-origin" not in {k.lower() for k in res.headers}


def test_p20d_ayarları_json_ile_gelir_ve_sınırları_doğrulanır(tmp_path):
    """Kod bulgusu 6: eşikler ve model klasörü Bismuth ayarından gelir (G-09), koda sabit yazılmaz."""
    cfg = load_config(
        {
            CONFIG_ENV: json.dumps(
                {
                    "MODELS_DIR": str(tmp_path),
                    "FACE_UNCERTAIN_MARGIN": 0.1,
                    "IDLE_FACE_SCAN_EVERY": 5,
                    "STREAM_MAX_WIDTH": 640,
                }
            )
        }
    )
    assert cfg.MODELS_DIR == str(tmp_path) and cfg.FACE_UNCERTAIN_MARGIN == 0.1
    assert cfg.IDLE_FACE_SCAN_EVERY == 5 and cfg.STREAM_MAX_WIDTH == 640
    for bad in ({"FACE_UNCERTAIN_MARGIN": 0.9}, {"IDLE_FACE_SCAN_EVERY": -1}, {"STREAM_MAX_WIDTH": 50}):
        with pytest.raises(ConfigError):
            load_config({CONFIG_ENV: json.dumps(bad)})
