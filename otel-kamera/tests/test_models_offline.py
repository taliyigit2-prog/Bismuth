"""K-57 / P20d: modeller yalnız yerel dosyadan, çevrimdışı. Her testte ağ kapalıdır: soket, DNS ve urllib yamalıdır;
herhangi bir ağ çağrısı `NetworkAttempt` ile testi düşürür. Gerçek ultralytics/insightface kurulmadan, sahte
modüllerle (aynı çağrı biçimi) doğrulanır."""

import hashlib
import socket
import sys
import types
import urllib.request
from dataclasses import replace
from types import SimpleNamespace

import numpy as np
import pytest

import model_loader as models
from face_store import AlertQueue, FaceStore
from model_loader import ModelMissingError
from security_service import SecurityService
from tests.conftest import noise_frame
from tests.fakes import FakeGrabber, FakeInsightApp, Recorder


class NetworkAttempt(AssertionError):
    pass


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """Ağ kapalı: dışarı çıkmaya çalışan her yol testi düşürür."""

    def blocked(*args, **kwargs):
        raise NetworkAttempt(f"ağ çağrısı denendi: {args[:2]}")

    monkeypatch.setattr(socket.socket, "connect", blocked)
    monkeypatch.setattr(socket.socket, "connect_ex", blocked)
    monkeypatch.setattr(socket, "getaddrinfo", blocked)
    monkeypatch.setattr(socket, "create_connection", blocked)
    monkeypatch.setattr(urllib.request, "urlopen", blocked)


def test_ağ_koruması_gerçekten_çalışır_dns_ve_soket_çağrısı_testi_düşürür():
    with pytest.raises(NetworkAttempt):
        socket.getaddrinfo("one.one.one.one", 0)
    with pytest.raises(NetworkAttempt):
        socket.create_connection(("example.com", 443))
    with pytest.raises(NetworkAttempt):
        urllib.request.urlopen("https://example.com")


def make_models(tmp_path, with_yolo=True, insight_files=("det_500m.onnx", "w600k_mbf.onnx")):
    base = tmp_path / "models"
    base.mkdir()
    if with_yolo:
        (base / "yolo11n.pt").write_bytes(b"sentetik-yolo")
    folder = base / "insightface" / "models" / "buffalo_s"
    folder.mkdir(parents=True)
    for name in insight_files:
        (folder / name).write_bytes(b"sentetik-onnx")
    return base


def cfg_for(settings, base):
    return replace(settings, MODELS_DIR=str(base))


class FakeUltralytics(types.ModuleType):
    """`from ultralytics import settings, YOLO` ile aynı yüzey."""

    def __init__(self) -> None:
        super().__init__("ultralytics")
        self.calls: list = []
        outer = self

        class _Settings(dict):
            def update(self, *args, **kwargs):
                outer.calls.append(("settings.update", dict(*args, **kwargs)))
                super().update(*args, **kwargs)

        class _YOLO:
            def __init__(self, path):
                outer.calls.append(("YOLO", path))

            def __call__(self, frame, classes=None, verbose=False):
                boxes = SimpleNamespace(
                    cls=np.array([0]),
                    xyxy=np.array([[10.0, 10.0, 150.0, 110.0]]),
                    conf=np.array([0.9]),
                    id=None,
                )
                return [SimpleNamespace(boxes=boxes, names={0: "person"}, masks=None, obb=None)]

        self.settings = _Settings(sync=True)
        self.YOLO = _YOLO


class FakeInsightFaceApp(types.ModuleType):
    def __init__(self, faces=()) -> None:
        super().__init__("insightface.app")
        self.created: list = []
        outer = self

        class _FaceAnalysis(FakeInsightApp):
            def __init__(self, name, root, allowed_modules, providers):
                super().__init__(list(faces))
                outer.created.append({"name": name, "root": root, "allowed_modules": allowed_modules, "providers": providers})

            def prepare(self, ctx_id, det_size):
                outer.created[-1]["prepared"] = (ctx_id, det_size)

        self.FaceAnalysis = _FaceAnalysis


def test_çevrimdışı_ortam_zorlanır_ortamdan_gelen_değer_ezilir(tmp_path):
    env = {"YOLO_OFFLINE": "0", "HF_HUB_OFFLINE": "0"}
    models.apply_offline_env(str(tmp_path / "yolo-ayar"), environ=env)
    assert env["YOLO_OFFLINE"] == "1"  # ultralytics içe aktarmada DNS yoklaması yapmaz
    assert env["YOLO_AUTOINSTALL"] == "false"
    assert env["HF_HUB_OFFLINE"] == "1"
    assert env["YOLO_CONFIG_DIR"] == str(tmp_path / "yolo-ayar")


def test_yolo_dosyası_yoksa_açık_hata_verilir_ultralytics_hiç_çağrılmaz_indirme_yok(settings, tmp_path):
    base = make_models(tmp_path, with_yolo=False)
    called = []
    with pytest.raises(ModelMissingError, match="İndirme yapılmaz"):
        models.load_yolo(cfg_for(settings, base), importer=lambda: called.append("içe aktarıldı"))
    assert called == []  # YOLO("yolo11n.pt") çağrılsaydı ultralytics dosyayı indirmeye çalışırdı


def test_yolo_yerel_yoldan_yüklenir_ve_telemetri_önce_kapatılır(settings, tmp_path):
    base = make_models(tmp_path)
    fake = FakeUltralytics()
    model = models.load_yolo(cfg_for(settings, base), importer=lambda: fake)
    assert fake.calls[0] == ("settings.update", {"sync": False})  # telemetri model yüklenmeden önce kapanır
    assert fake.calls[1] == ("YOLO", str(base / "yolo11n.pt"))  # ad değil, yerel dosyanın tam yolu
    assert fake.settings["sync"] is False
    assert model is not None


def test_insightface_eksik_dosya_adıyla_açık_hata_verir_indirme_denenmez(settings, tmp_path):
    base = make_models(tmp_path, insight_files=("det_500m.onnx",))
    fake = FakeInsightFaceApp()
    with pytest.raises(ModelMissingError, match="w600k_mbf.onnx"):
        models.load_insightface(cfg_for(settings, base), importer=lambda: fake.FaceAnalysis)
    assert fake.created == []  # FaceAnalysis hiç kurulmadı (o, eksik modeli indirirdi)


def test_insightface_yerel_kökten_yalnız_tespit_ve_tanıma_modülüyle_yüklenir(settings, tmp_path):
    base = make_models(tmp_path)
    fake = FakeInsightFaceApp()
    models.load_insightface(cfg_for(settings, base), importer=lambda: fake.FaceAnalysis)
    created = fake.created[0]
    assert created["root"] == str(base / "insightface")
    assert created["name"] == "buffalo_s"
    assert created["allowed_modules"] == ["detection", "recognition"]  # yaş/cinsiyet/nirengi modeli yüklenmez
    assert created["providers"] == ["CPUExecutionProvider"]


def test_sha256sums_varsa_doğrulanır_bozuk_ve_klasör_dışı_yol_reddedilir(settings, tmp_path):
    base = make_models(tmp_path)
    digest = hashlib.sha256(b"sentetik-yolo").hexdigest()
    (base / "SHA256SUMS").write_text(f"# not\n{digest}  yolo11n.pt\n", encoding="utf-8")
    assert models.verify_checksums(base) == 1
    (base / "SHA256SUMS").write_text(f"{'0' * 64}  yolo11n.pt\n", encoding="utf-8")
    with pytest.raises(ModelMissingError, match="bozuk"):
        models.verify_checksums(base)
    (base / "SHA256SUMS").write_text(f"{digest}  ../yolo11n.pt\n", encoding="utf-8")
    with pytest.raises(ModelMissingError, match="dışına"):
        models.verify_checksums(base)


def test_sha256sums_yoksa_doğrulama_atlanır(tmp_path):
    assert models.verify_checksums(make_models(tmp_path)) == 0


def test_model_klasörü_varsayılanı_depodaki_resources_camera_models_dir(settings):
    assert models.models_dir(settings).as_posix().endswith("resources/camera/models")


def test_ağ_kapalıyken_hizmet_gerçek_yükleyicilerle_açılır_tanır_ve_alarm_üretir(settings, tmp_path, monkeypatch):
    """Ağ yamalı; modeller yalnız yerel dosyadan; kare işlenir. Herhangi bir ağ çağrısı `NetworkAttempt` ile düşürür."""
    from tests.conftest import unit_embedding
    from tests.fakes import fake_face

    base = make_models(tmp_path)
    cfg = replace(settings, MODELS_DIR=str(base), CONFIRMATION_FRAMES=1, PROCESS_EVERY_N_FRAMES=1)
    ultralytics = FakeUltralytics()
    insight = FakeInsightFaceApp(faces=[fake_face(unit_embedding(3))])
    monkeypatch.setitem(sys.modules, "ultralytics", ultralytics)
    monkeypatch.setitem(sys.modules, "insightface", types.ModuleType("insightface"))
    monkeypatch.setitem(sys.modules, "insightface.app", insight)
    rec = Recorder()
    service = SecurityService(  # face_engine ve person_detector verilmez: gerçek yükleyiciler çalışır
        faces=FaceStore(), alerts=AlertQueue(), settings=cfg, recorder=rec, grabber_factory=FakeGrabber, sleep=lambda _s: None
    )
    service._grabber = FakeGrabber(frame=noise_frame())
    from security_service import _LoopState

    service._tick(_LoopState())
    assert ultralytics.calls[0] == ("settings.update", {"sync": False})
    assert insight.created and insight.created[0]["root"] == str(base / "insightface")
    assert len(rec.calls) == 1  # kayıtsız yüz → alarm; hepsi ağsız


def _write_sums(base, names):
    lines = [f"{hashlib.sha256((base / n).read_bytes()).hexdigest()}  {n}" for n in names]
    (base / "SHA256SUMS").write_text("\n".join(lines) + "\n", encoding="utf-8")


def test_paketli_sürümde_sha256sums_zorunlu(settings, tmp_path, monkeypatch):
    base = make_models(tmp_path)
    monkeypatch.setenv("BISMUTH_CAMERA_PACKAGED", "1")
    with pytest.raises(ModelMissingError, match="zorunlu"):
        models.load_yolo(cfg_for(settings, base), importer=lambda: object())


def test_paketli_sürümde_listede_olmayan_model_reddedilir(settings, tmp_path, monkeypatch):
    base = make_models(tmp_path)
    folder = "insightface/models/buffalo_s/"
    _write_sums(base, [folder + "det_500m.onnx", folder + "w600k_mbf.onnx"])  # yolo11n.pt listede yok
    monkeypatch.setenv("BISMUTH_CAMERA_PACKAGED", "1")
    with pytest.raises(ModelMissingError, match="listesinde yok"):
        models.load_yolo(cfg_for(settings, base), importer=lambda: object())


def test_paketli_sürümde_listedeki_modeller_yüklenir(settings, tmp_path, monkeypatch):
    base = make_models(tmp_path)
    folder = "insightface/models/buffalo_s/"
    _write_sums(base, ["yolo11n.pt", folder + "det_500m.onnx", folder + "w600k_mbf.onnx"])
    monkeypatch.setenv("BISMUTH_CAMERA_PACKAGED", "1")
    fake = FakeInsightFaceApp()
    models.load_insightface(cfg_for(settings, base), importer=lambda: fake.FaceAnalysis)
    assert fake.created[0]["name"] == "buffalo_s"
    assert models.verify_checksums(base, required=[base / "yolo11n.pt"]) == 3
