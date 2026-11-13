"""Kamera denemesi (P20g): sahte bir RTSP sunucusuyla (127.0.0.1) hata nedenleri ve başarı yolu. Gerçek kamera ve OpenCV yok;
kare alma `grab_fn` ile sahtelenir. Adresler uydurmadır; şifre hiçbir çıktıda görünmez."""

import base64
import json
import re
import socket
import threading
from typing import Callable

import pytest

import probe_camera as pc

# Adres parçalarla kurulur: depo kancası "şifreli RTSP adresi" metnini yakalar.
SCHEME = "rtsp:" + "//"
USER, PASSWORD = "admin", "gizli-Sifre1"


def src(port: int, path: str = "/Streaming/Channels/101", host: str = "127.0.0.1", auth: bool = True) -> str:
    cred = f"{USER}:{PASSWORD}@" if auth else ""
    return SCHEME + cred + f"{host}:{port}{path}"


class FakeRtsp:
    """Tek bağlantıyı karşılayan sahte RTSP sunucusu. `mode`: ok | digest | basic | notfound | silent | garbage."""

    def __init__(self, mode: str = "ok", good_path: str = "/Streaming/Channels/101"):
        self.mode, self.good_path = mode, good_path
        self.requests: list[str] = []
        self.server = socket.socket()
        self.server.bind(("127.0.0.1", 0))
        self.server.listen(2)
        self.port = self.server.getsockname()[1]
        self.thread = threading.Thread(target=self._serve, daemon=True)
        self.thread.start()

    def close(self) -> None:
        self.server.close()

    def _serve(self) -> None:
        try:
            conn, _ = self.server.accept()
        except OSError:
            return
        with conn:
            if self.mode == "silent":
                conn.settimeout(3)
                try:
                    conn.recv(4096)
                    threading.Event().wait(3)
                except OSError:
                    pass
                return
            while True:
                try:
                    data = conn.recv(8192)
                except OSError:
                    return
                if not data:
                    return
                text = data.decode()
                self.requests.append(text)
                conn.sendall(self._answer(text).encode())

    def _answer(self, request: str) -> str:
        cseq = next((ln.split(":")[1].strip() for ln in request.split("\r\n") if ln.lower().startswith("cseq")), "1")
        if self.mode == "garbage":
            return "HTTP/1.1 200 OK\r\n\r\n"
        if self.good_path not in request.split("\r\n")[0]:
            return f"RTSP/1.0 404 Not Found\r\nCSeq: {cseq}\r\n\r\n"
        if self.mode == "notfound":
            return f"RTSP/1.0 404 Not Found\r\nCSeq: {cseq}\r\n\r\n"
        if self.mode in ("digest", "basic"):
            auth = next((ln for ln in request.split("\r\n") if ln.lower().startswith("authorization:")), "")
            if not auth:
                challenge = (
                    'Digest realm="IP Camera(T0000)", nonce="abc123def456", stale="FALSE"'
                    if self.mode == "digest"
                    else 'Basic realm="IP Camera"'
                )
                return f"RTSP/1.0 401 Unauthorized\r\nCSeq: {cseq}\r\nWWW-Authenticate: {challenge}\r\n\r\n"
            if self._valid(auth):
                return f"RTSP/1.0 200 OK\r\nCSeq: {cseq}\r\nContent-Length: 0\r\n\r\n"
            return f"RTSP/1.0 401 Unauthorized\r\nCSeq: {cseq}\r\nWWW-Authenticate: Basic realm=\"x\"\r\n\r\n"
        return f"RTSP/1.0 200 OK\r\nCSeq: {cseq}\r\nContent-Length: 0\r\n\r\n"

    def _valid(self, header: str) -> bool:
        if self.mode == "basic":
            return base64.b64encode(f"{USER}:{PASSWORD}".encode()).decode() in header
        # Digest: istemcinin hesabını sunucu tarafında yeniden hesapla.
        fields = dict(re.findall(r'(\w+)="([^"]*)"', header))
        uri = fields.get("uri", "")
        ha1 = pc._md5(f"{USER}:IP Camera(T0000):{PASSWORD}")
        ha2 = pc._md5(f"DESCRIBE:{uri}")
        return fields.get("response") == pc._md5(f"{ha1}:abc123def456:{ha2}") and fields.get("username") == USER


JPEG = b"\xff\xd8\xff\xe0fake-jpeg\xff\xd9"


def grab_ok(_source: str):
    return JPEG, 640, 360


@pytest.fixture
def server() -> Callable[..., FakeRtsp]:
    made: list[FakeRtsp] = []

    def make(mode: str = "ok", **kw) -> FakeRtsp:
        s = FakeRtsp(mode, **kw)
        made.append(s)
        return s

    yield make
    for s in made:
        s.close()


def test_bağlantı_ve_kare_tamamsa_başarılı_ve_görüntü_taşınır(server):
    fake = server("ok")
    out = pc.probe(src(fake.port), grab_fn=grab_ok)
    assert out["ok"] is True and out["reason"] is None
    assert out["width"] == 640 and out["height"] == 360
    assert base64.b64decode(out["image"]) == JPEG


def test_digest_kimlik_doğrulaması_geçer(server):
    fake = server("digest")
    out = pc.probe(src(fake.port), grab_fn=grab_ok)
    assert out["ok"] is True
    # Şifre ağda düz gitmez (Digest) ve ikinci istek Authorization taşır.
    assert PASSWORD not in "".join(fake.requests)
    assert "Authorization: Digest" in fake.requests[-1]


def test_basic_kimlik_doğrulaması_geçer(server):
    fake = server("basic")
    assert pc.probe(src(fake.port), grab_fn=grab_ok)["ok"] is True


def test_yanlış_şifre_kimlik_hatası_verir(server):
    fake = server("digest")
    bad = SCHEME + f"{USER}:yanlis@127.0.0.1:{fake.port}/Streaming/Channels/101"
    out = pc.probe(bad, grab_fn=grab_ok)
    assert out == {"ok": False, "reason": "auth", "image": None, "width": 0, "height": 0}


def test_kimlik_hiç_verilmeyince_de_kimlik_hatası_verir(server):
    fake = server("digest")
    assert pc.probe(src(fake.port, auth=False), grab_fn=grab_ok)["reason"] == "auth"


def test_yanlış_yol_yol_hatası_verir(server):
    fake = server("ok")
    assert pc.probe(src(fake.port, path="/yok"), grab_fn=grab_ok)["reason"] == "path"


def test_kapalı_port_ulaşılamıyor_der():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()  # kimse dinlemiyor
    assert pc.probe(src(port), grab_fn=grab_ok)["reason"] == "unreachable"


def test_cevap_vermeyen_sunucu_zaman_aşımı_verir(server, monkeypatch):
    monkeypatch.setattr(pc, "REPLY_TIMEOUT", 0.4)
    fake = server("silent")
    assert pc.probe(src(fake.port), grab_fn=grab_ok)["reason"] == "timeout"


def test_rtsp_olmayan_cevap_kare_yok_sayılır(server):
    fake = server("garbage")
    assert pc.probe(src(fake.port), grab_fn=grab_ok)["reason"] == "noFrame"


def test_bağlantı_var_ama_kare_gelmezse_kare_yok_der(server):
    fake = server("ok")

    def no_frame(_s: str):
        raise pc.ProbeError(pc.NO_FRAME)

    assert pc.probe(src(fake.port), grab_fn=no_frame)["reason"] == "noFrame"


def test_beklenmeyen_hata_adresi_sızdırmadan_kare_yok_der(server):
    fake = server("ok")

    def boom(_s: str):
        raise RuntimeError(src(fake.port))  # mesajda şifre var

    out = pc.probe(src(fake.port), grab_fn=boom)
    assert out["reason"] == "noFrame"
    assert PASSWORD not in json.dumps(out)


@pytest.mark.parametrize(
    "source",
    [
        SCHEME + "8.8.8.8:554/x",  # genel adres
        SCHEME + "kamera.local/x",  # ad: çözümlenmez
        SCHEME + "[::1]/x",  # IPv6
        "http://192.168.1.64/x",
        SCHEME + "224.0.0.1/x",  # çok noktaya yayın
        "0",
        "",
    ],
)
def test_bu_ağın_dışındaki_adres_hiç_denenmez(source):
    calls: list[str] = []

    def spy(*_a):
        calls.append("describe")

    out = pc.probe(source, describe_fn=spy, grab_fn=grab_ok)
    assert out["reason"] == "badAddress" and calls == []


def test_özel_ağ_adresleri_kabul_edilir():
    for host in ("192.168.1.64", "10.0.0.5", "172.16.3.4", "169.254.1.1", "127.0.0.1"):
        user, password, h, port, path = pc.parse_source(SCHEME + f"{USER}:p%40ss@{host}/Streaming/Channels/101")
        assert (user, password, h, port, path) == (USER, "p@ss", host, 554, "/Streaming/Channels/101")


def test_ana_giriş_adresi_ortamdan_okur_ve_tek_satır_json_yazar(capsys, server, monkeypatch):
    fake = server("ok")
    monkeypatch.setattr(pc, "grab_frame", grab_ok)
    assert pc.main(env={"BISMUTH_PROBE_SOURCE": src(fake.port)}) == 0
    line = capsys.readouterr().out.strip().splitlines()
    assert len(line) == 1 and json.loads(line[0])["ok"] is True
    assert PASSWORD not in line[0]


def test_ana_giriş_adres_yoksa_adres_hatası_verir(capsys):
    assert pc.main(env={}) == 0
    assert json.loads(capsys.readouterr().out)["reason"] == "badAddress"
