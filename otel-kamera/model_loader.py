"""Model yükleme: yalnız yerel dosyadan, çevrimdışı (K-57, G-01, G-07).

- Hiçbir model indirilmez. Dosya yoksa `ModelMissingError` ile açık hata verilir; sunucuya giden istek, otomatik kurulum,
  yazı tipi indirmesi ve Ultralytics telemetrisi (settings.sync, Sentry, DNS yoklaması) kapatılır.
- `YOLO_OFFLINE` Ultralytics'in içe aktarma sırasındaki DNS yoklamasını (`is_online`) da kapatır; bu yüzden ortam
  `ultralytics` içe aktarılmadan ÖNCE kurulmalıdır (`apply_offline_env`).
- Yerleşim (`resources/camera/models/`, bkz. oradaki README.md):
    yolo11n.pt
    insightface/models/<model_adı>/det_500m.onnx, w600k_mbf.onnx   (InsightFace `buffalo_s`)
    SHA256SUMS                                                      (isteğe bağlı; varsa doğrulanır)
"""

import hashlib
import logging
import os
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple

from config import Config

log = logging.getLogger("otel-kamera.models")

YOLO_FILE = "yolo11n.pt"
INSIGHTFACE_DIR = "insightface"
# buffalo_s içinden yalnız tespit + tanıma yüklenir: yaş/cinsiyet ve 3B/2B nirengi modelleri kullanılmaz (RAM, CPU ve
# biyometrik özellik çıkarımı azalır).
INSIGHTFACE_MODULES = ["detection", "recognition"]
INSIGHTFACE_FILES = {"buffalo_s": ["det_500m.onnx", "w600k_mbf.onnx"]}
CHECKSUM_FILE = "SHA256SUMS"

OFFLINE_ENV: Dict[str, str] = {
    "YOLO_OFFLINE": "1",  # ultralytics.utils.is_online() → False (içe aktarmada DNS yoklaması yapılmaz)
    "YOLO_AUTOINSTALL": "false",  # eksik paketi pip ile kurmaya çalışmaz
    "YOLO_VERBOSE": "false",
    "HF_HUB_OFFLINE": "1",
    "TRANSFORMERS_OFFLINE": "1",
}


class ModelMissingError(RuntimeError):
    """Model dosyası yok ya da bozuk. İndirme denenmez; kurulum paketi eksiktir."""


def apply_offline_env(config_dir: Optional[str] = None, environ: Optional[Dict[str, str]] = None) -> None:
    """Çevrimdışı ortam değişkenlerini ZORLA kurar (ortamdan gelen değer ezilir). `ultralytics` içe aktarılmadan önce
    çağrılmalıdır. `config_dir`: Ultralytics ayar dosyasının yeri (kullanıcı klasörüne yazmasın)."""
    env = os.environ if environ is None else environ
    env.update(OFFLINE_ENV)
    if config_dir:
        if environ is None:
            os.makedirs(config_dir, exist_ok=True)
        env["YOLO_CONFIG_DIR"] = config_dir


def default_models_dir() -> Path:
    """Paketli kurulumda `<kamera klasörü>/models`; geliştirmede depodaki `resources/camera/models`."""
    here = Path(__file__).resolve().parent
    packaged = here / "models"
    return packaged if packaged.is_dir() else here.parent / "resources" / "camera" / "models"


def models_dir(settings: Config) -> Path:
    return Path(settings.MODELS_DIR) if settings.MODELS_DIR else default_models_dir()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_checksums(base: Path) -> int:
    """`SHA256SUMS` (her satır `<sha256>  <göreli yol>`) varsa listedeki dosyaları doğrular; uyumsuzluk hata verir.
    Dosya yoksa 0 döner (doğrulama isteğe bağlı). Doğrulanan dosya sayısını döner."""
    sums = base / CHECKSUM_FILE
    if not sums.is_file():
        return 0
    checked = 0
    for raw in sums.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        if len(parts) != 2:
            raise ModelMissingError(f"{CHECKSUM_FILE} satırı okunamadı: {line[:60]}")
        expected, rel = parts[0].lower(), parts[1].strip().lstrip("*")
        target = (base / rel).resolve()
        if base.resolve() not in target.parents:
            raise ModelMissingError(f"{CHECKSUM_FILE}: model klasörü dışına yol: {rel}")
        if not target.is_file():
            raise ModelMissingError(f"Model dosyası yok: {rel}")
        if _sha256(target) != expected:
            raise ModelMissingError(f"Model dosyası bozuk (sha256 uyuşmuyor): {rel}")
        checked += 1
    return checked


def require_yolo_weights(settings: Config) -> Path:
    path = models_dir(settings) / YOLO_FILE
    if not path.is_file():
        raise ModelMissingError(f"Kişi tespiti modeli bulunamadı: {path}. İndirme yapılmaz; kurulum paketi eksik.")
    return path


def require_insightface(settings: Config) -> Tuple[Path, str]:
    """(kök, ad). InsightFace `root/models/<ad>/*.onnx` bekler; yoksa kendisi indirirdi, burada açık hata verilir."""
    name = settings.INSIGHTFACE_MODEL_NAME
    root = models_dir(settings) / INSIGHTFACE_DIR
    folder = root / "models" / name
    needed = INSIGHTFACE_FILES.get(name)
    if needed is None:
        # Bilinmeyen model adı: en azından klasör ve bir .onnx dosyası olmalı.
        if not folder.is_dir() or not any(folder.glob("*.onnx")):
            raise ModelMissingError(f"Yüz tanıma modeli bulunamadı: {folder}. İndirme yapılmaz; kurulum paketi eksik.")
        return root, name
    missing = [f for f in needed if not (folder / f).is_file()]
    if missing:
        raise ModelMissingError(
            f"Yüz tanıma modeli eksik ({', '.join(missing)}): {folder}. İndirme yapılmaz; kurulum paketi eksik."
        )
    return root, name


def load_yolo(settings: Config, importer: Optional[Callable[[], Any]] = None) -> Any:
    """YOLO11n'i yerel dosyadan yükler. `importer` yalnız testlerde (sahte `ultralytics`) verilir."""
    weights = require_yolo_weights(settings)  # dosya yoksa ultralytics'e hiç girilmez (o indirirdi)
    verify_checksums(models_dir(settings))
    apply_offline_env(str(Path(settings.DB_PATH).resolve().parent / "ultralytics"))
    if importer is None:
        import ultralytics as _ultralytics

        module = _ultralytics
    else:
        module = importer()
    # Telemetri (anonim analiz + Sentry) kapalı; ayar dosyasına da yazılır. Ultralytics koduna dokunulmaz (AGPL §13).
    module.settings.update({"sync": False})
    return module.YOLO(str(weights))


def load_insightface(settings: Config, importer: Optional[Callable[[], Any]] = None) -> Any:
    """InsightFace `FaceAnalysis`'i yerel klasörden yükler (yalnız tespit + tanıma modülü)."""
    root, name = require_insightface(settings)
    verify_checksums(models_dir(settings))
    apply_offline_env()
    if importer is None:
        from insightface.app import FaceAnalysis
    else:
        FaceAnalysis = importer()  # noqa: N806
    log.info("InsightFace '%s' yerel klasörden CPU sağlayıcısıyla yükleniyor", name)
    app = FaceAnalysis(name=name, root=str(root), allowed_modules=INSIGHTFACE_MODULES, providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=0, det_size=(640, 640))
    return app
