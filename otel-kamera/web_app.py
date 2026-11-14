"""Kamera yan sürecinin HTTP yüzü (FastAPI). Yalnız 127.0.0.1; her istek `X-Bismuth-Token` ister (`bridge_security`).

P20a: uygulama bir fabrikadan kurulur (içe aktarma sırasında DB açılmaz; kod bulgusu 28); bloklayan uç noktalar `def`
(iş parçacığı havuzu; kod bulgusu 14); Telegram uç noktası ve `api.telegram.org` yok (K-50); panel (`/`, `/static`) yok
(P20b: Bismuth içindeki Kamera sekmesi); modeller arka planda yüklenir, `/api/health` açılışta da cevap verir.

P20d: `/api/stream` düz (çizimsiz) MJPEG'dir, yalnız yeni karede ve izleyici varken kodlanır, küçültülür (kod bulguları
23, 24); kutu/etiket verisi `/api/overlay` ile gelir ve Bismuth penceresi çizer (kod bulgusu 20); modeller yalnız yerel
dosyadan yüklenir, indirme yoktur (`model_loader.py`).

P20c (K-51, K-53): yan süreç DİSKE HİÇBİR ŞEY yazmaz ve misafir tutmaz. Misafir adı/oda/yüzü tek kaynak Bismuth'tur:
`PUT /api/faces/active` içerideki misafirlerin yüz listesini bellekteki `FaceStore`'a koyar; `POST /api/faces/capture`
ve `/api/faces/extract` yüz vektörü + kırpmayı yalnız yanıt olarak verir (saklanmaz); `GET /api/alerts` bellekteki alarm
kuyruğunu verir (Bismuth çeker ve şifreli veritabanına yazar). Eski misafir/alarm/fotoğraf uç noktaları, `/alerts` ve
`/guest_photos` statik yolları ve SQLite deposu kaldırıldı.
"""

import asyncio
import base64
import logging
import os
import re
import threading
import time
from contextlib import asynccontextmanager
from typing import Callable, List, Optional

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from bridge_security import BridgeGuard, redact
from config import Config, load_config, load_token
from face_store import MAX_FACES, AlertQueue, FaceListError, FaceStore, encode_embedding
from model_loader import apply_offline_env
from parent_watch import WATCH_ENV, hard_exit, start_parent_watch

log = logging.getLogger("otel-kamera.web")

MAX_UPLOAD_BYTES = 10 * 1024 * 1024


def sanitize_text(val: str, max_len: int = 100) -> str:
    """Kontrol karakterleri ve `<>"` silinir; kesme işareti kalır (O'Brien bozulmaz)."""
    clean = re.sub(r"[<>\"`\x00-\x1f]", "", (val or "")).strip()
    return clean[:max_len]


class ActiveFaceIn(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(default="", max_length=100)
    room: str = Field(default="", max_length=24)
    embedding: str = Field(..., min_length=1, max_length=4000)


class ActiveFacesIn(BaseModel):
    faces: List[ActiveFaceIn] = Field(default_factory=list, max_length=MAX_FACES)


class ExtractIn(BaseModel):
    image: str = Field(..., min_length=1, max_length=MAX_UPLOAD_BYTES * 2)


class ServiceHolder:
    """Modeller arka planda yüklenirken `/api/health` 'starting' der; hata olursa 'failed' + sebep."""

    def __init__(self) -> None:
        self.service = None
        self.state = "starting"
        self.error: Optional[str] = None
        self.started_at = time.time()


def create_app(
    settings: Config,
    token: str,
    faces: FaceStore,
    alerts: AlertQueue,
    service_builder: Callable[[], object],
) -> FastAPI:
    holder = ServiceHolder()

    def boot() -> None:
        try:
            service = service_builder()
            service.start()  # type: ignore[attr-defined]
            holder.service = service
            holder.state = "running"
            log.info("Kamera hizmeti hazır")
        except Exception as exc:  # noqa: BLE001
            holder.state = "failed"
            holder.error = redact(f"{type(exc).__name__}: {exc}")[:300]
            log.exception("Kamera hizmeti başlatılamadı")

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        threading.Thread(target=boot, name="service-boot", daemon=True).start()
        yield
        if holder.service is not None:
            holder.service.stop()  # type: ignore[attr-defined]

    app = FastAPI(title="Otel Kamera yan süreci", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.holder = holder

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path.startswith("/api/") and request.url.path != "/api/stream":
            response.headers["Cache-Control"] = "no-store"
        return response

    def service():
        if holder.service is None:
            raise HTTPException(status_code=503, detail=f"service_{holder.state}")
        return holder.service

    @app.get("/api/health")
    def health():
        body = {
            "ok": holder.state == "running",
            "state": holder.state,
            "error": holder.error,
            "uptime_seconds": round(time.time() - holder.started_at, 1),
            "boot": alerts.boot,
        }
        if holder.service is not None:
            body["loop"] = holder.service.health.snapshot()  # type: ignore[attr-defined]
        return body

    @app.get("/api/status")
    def get_status():
        if holder.service is None:
            return {"camera_connected": False, "active_guests_count": 0, "state": holder.state}
        return holder.service.get_status()  # type: ignore[attr-defined]

    @app.get("/api/overlay")
    def get_overlay():
        """Kutular ve etiket verisi (0..1 koordinat). Hizmet hazır değilse boş ama aynı biçimde döner."""
        if holder.service is None:
            return {
                "seq": 0,
                "frame": {"width": 0, "height": 0},
                "camera_connected": False,
                "camera_covered": False,
                "alarms_paused": False,
                "guests_count": 0,
                "zone": None,
                "persons": [],
                "faces": [],
                "state": holder.state,
            }
        return holder.service.get_overlay()  # type: ignore[attr-defined]

    @app.get("/api/stream")
    async def video_stream(request: Request):
        interval = 1.0 / settings.STREAM_MAX_FPS

        async def frames():
            svc = holder.service
            if svc is not None:
                svc.viewer_joined()  # type: ignore[attr-defined]
            last_seq = -2
            try:
                while True:
                    if await request.is_disconnected():
                        break
                    current = holder.service
                    if current is None:
                        if holder.state != "starting":
                            break
                        await asyncio.sleep(0.5)
                        continue
                    if svc is None:
                        svc = current
                        svc.viewer_joined()  # type: ignore[attr-defined]
                    if not current._running:  # type: ignore[attr-defined]
                        break
                    seq, jpeg = await run_in_threadpool(current.stream_frame, last_seq)  # type: ignore[attr-defined]
                    last_seq = seq
                    if jpeg:
                        yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
                    await asyncio.sleep(interval)
            finally:
                if svc is not None:
                    svc.viewer_left()  # type: ignore[attr-defined]

        return StreamingResponse(frames(), media_type="multipart/x-mixed-replace; boundary=frame")

    def jpeg_b64(image: np.ndarray) -> str:
        ok, buf = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
        return base64.b64encode(buf.tobytes()).decode("ascii") if ok else ""

    def face_answer(res) -> dict:
        embedding, portrait = res
        return {"embedding": encode_embedding(embedding), "crop": jpeg_b64(portrait), "model": settings.INSIGHTFACE_MODEL_NAME}

    @app.put("/api/faces/active")
    def put_active_faces(body: ActiveFacesIn):
        """İçerideki misafirlerin yüz listesi (Bismuth verir); tüm liste değişir, yalnız bellekte durur."""
        items = [(f.id, sanitize_text(f.name, 100), sanitize_text(f.room, 24), f.embedding) for f in body.faces]
        try:
            count = faces.replace(items)
        except FaceListError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if holder.service is not None:
            holder.service.faces_changed()  # type: ignore[attr-defined]
        return {"ok": True, "count": count}

    @app.post("/api/faces/capture")
    def capture_face():
        """Kameradaki yüzün vektörü ve kırpması; SAKLANMAZ, yanıt olarak döner (Bismuth şifreleyip yazar)."""
        svc = service()
        if not svc.camera_connected:
            raise HTTPException(status_code=409, detail="camera_not_connected")
        res = svc.extract_face_from_live_camera()
        if res is None:
            raise HTTPException(status_code=400, detail="no_face")
        return face_answer(res)

    @app.post("/api/faces/extract")
    def extract_face(body: ExtractIn):
        """Gönderilen fotoğraftaki (alarm kırpması) yüzün vektörü; SAKLANMAZ."""
        svc = service()
        try:
            raw = base64.b64decode(body.image, validate=True)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="bad_image") from exc
        if len(raw) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="image_too_large")
        img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(status_code=400, detail="bad_image")
        res = svc.extract_face_from_image(img)
        if res is None:
            raise HTTPException(status_code=400, detail="no_face")
        return face_answer(res)

    @app.get("/api/alerts")
    def get_alerts(after: int = 0, limit: int = 50, boot: Optional[str] = None):
        """Bellekteki alarmlar (`after`'dan yeni, eskiden yeniye). `boot` bu çalışmanın değilse numaralar bu sürece ait
        değildir: baştan verilir. Her alarm bir yüz kırpması (base64 JPEG) taşır; Bismuth şifreleyerek yazar."""
        start = after if (boot is not None and boot == alerts.boot) else 0
        items = alerts.since(max(0, start), min(max(1, limit), 100))
        return {
            "boot": alerts.boot,
            "alerts": [
                {
                    "id": a.id,
                    "alert_time": a.alert_time,
                    "track": a.track,
                    "crop": base64.b64encode(a.crop).decode("ascii") if a.crop else "",
                }
                for a in items
            ],
        }

    @app.post("/api/system/toggle-alarms")
    def toggle_alarms():
        svc = service()
        svc.alarms_paused = not svc.alarms_paused
        return {"ok": True, "alarms_paused": svc.alarms_paused}

    # En son eklenen en dıştadır: Host → Origin → belirteç, her şeyden önce.
    app.add_middleware(BridgeGuard, token=token, port=settings.WEB_PORT)
    return app


def main() -> None:  # pragma: no cover - süreç girişi
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = load_config()
    token = load_token()
    # Çevrimdışı zorunlu ve ultralytics/insightface içe aktarılmadan ÖNCE (K-57): indirme, telemetri, DNS yoklaması yok.
    apply_offline_env(os.path.join(os.path.abspath(settings.RUNTIME_DIR or "."), "ultralytics"))
    if os.environ.get(WATCH_ENV) == "1":
        start_parent_watch(hard_exit)
    from face_engine import FaceEngine
    from security_service import SecurityService

    faces = FaceStore()
    alerts = AlertQueue(max_items=settings.MAX_ALERT_COUNT)

    def build() -> SecurityService:
        return SecurityService(faces=faces, alerts=alerts, settings=settings, face_engine=FaceEngine(settings=settings))

    uvicorn.run(
        create_app(settings, token, faces, alerts, build),
        host=settings.WEB_HOST,
        port=settings.WEB_PORT,
        log_level="warning",
        timeout_graceful_shutdown=1,
    )


if __name__ == "__main__":
    main()
