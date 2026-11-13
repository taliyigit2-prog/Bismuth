"""Kamera yan sürecinin HTTP yüzü (FastAPI). Yalnız 127.0.0.1; her istek `X-Bismuth-Token` ister (`bridge_security`).

P20a: uygulama bir fabrikadan kurulur (içe aktarma sırasında DB açılmaz; kod bulgusu 28); bloklayan uç noktalar `def`
(iş parçacığı havuzu; kod bulgusu 14); Telegram uç noktası ve `api.telegram.org` yok (K-50); panel (`/`, `/static`) yok
(P20b: Bismuth içindeki Kamera sekmesi); çıkış tarihi `strptime` ile doğrulanır (422; kod bulgusu 17); kayıt atomik
(kod bulgusu 19); modeller arka planda yüklenir, `/api/health` açılışta da cevap verir.

P20d: `/api/stream` düz (çizimsiz) MJPEG'dir, yalnız yeni karede ve izleyici varken kodlanır, küçültülür (kod bulguları
23, 24); kutu/etiket verisi `/api/overlay` ile gelir ve Bismuth penceresi çizer (kod bulgusu 20); modeller yalnız yerel
dosyadan yüklenir, indirme yoktur (`model_loader.py`).
"""

import asyncio
import logging
import os
import re
import threading
import time
import uuid
from contextlib import asynccontextmanager
from typing import Callable, Optional

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from bridge_security import BridgeGuard, redact
from config import Config, load_config, load_token
from database import GuestDatabase, face_sibling
from model_loader import apply_offline_env
from parent_watch import WATCH_ENV, hard_exit, start_parent_watch
from timeutil import checkout_deadline

log = logging.getLogger("otel-kamera.web")

MAX_UPLOAD_BYTES = 10 * 1024 * 1024


def sanitize_text(val: str, max_len: int = 100) -> str:
    """Kontrol karakterleri ve `<>"` silinir; kesme işareti kalır (O'Brien bozulmaz)."""
    clean = re.sub(r"[<>\"`\x00-\x1f]", "", (val or "")).strip()
    return clean[:max_len]


def photo_url(path: str, prefix: str) -> str:
    return f"/{prefix}/{os.path.basename(path)}" if path else ""


class GuestRegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    room_number: str = Field(..., min_length=1, max_length=24)
    days: int = Field(default=30, ge=1, le=3650)
    check_out_date: Optional[str] = Field(default=None, max_length=32)


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
    db: GuestDatabase,
    service_builder: Callable[[], object],
) -> FastAPI:
    holder = ServiceHolder()
    os.makedirs(settings.ALERTS_DIR, exist_ok=True)
    os.makedirs(settings.GUEST_PHOTOS_DIR, exist_ok=True)

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

    app.mount("/alerts", StaticFiles(directory=settings.ALERTS_DIR), name="alerts")
    app.mount("/guest_photos", StaticFiles(directory=settings.GUEST_PHOTOS_DIR), name="guest_photos")

    def service():
        if holder.service is None:
            raise HTTPException(status_code=503, detail=f"service_{holder.state}")
        return holder.service

    def save_guest(
        name: str,
        room_number: str,
        days: int,
        check_out_date: Optional[str],
        embedding: np.ndarray,
        portrait: Optional[np.ndarray] = None,
        fallback_img_path: str = "",
        msg_suffix: str = "kaydedildi.",
    ) -> dict:
        clean_name = sanitize_text(name, 100)
        clean_room = sanitize_text(room_number, 24)
        if not clean_name or not clean_room:
            raise HTTPException(status_code=400, detail="Lütfen geçerli bir misafir adı ve oda numarası girin.")
        try:
            checkout = checkout_deadline(days, check_out_date)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        # Atomik kayıt: fotoğraf ÖNCE yazılır, satır yolla birlikte eklenir; hata/çift tıklamada dosya silinir.
        photo_path = ""
        written = False
        if portrait is not None or (fallback_img_path and os.path.exists(fallback_img_path)):
            photo_path = os.path.join(settings.GUEST_PHOTOS_DIR, f"guest_{uuid.uuid4().hex[:10]}_{int(time.time())}.jpg")
            if portrait is not None:
                written = bool(cv2.imwrite(photo_path, portrait, [int(cv2.IMWRITE_JPEG_QUALITY), 88]))
            else:
                import shutil

                shutil.copy2(fallback_img_path, photo_path)
                written = True
        try:
            guest_id = db.add_guest(clean_name, clean_room, embedding, checkout, photo_path if written else "")
            guest = db.get_guest_by_id(guest_id)
        except Exception:
            if written and os.path.exists(photo_path):
                os.remove(photo_path)
            raise
        if written and guest and guest["photo_path"] != photo_path and os.path.exists(photo_path):
            os.remove(photo_path)  # çift tıklama: mevcut satır döndü, yeni dosya gereksiz
        if holder.service is not None:
            holder.service.reload_guests()  # type: ignore[attr-defined]
        guest = db.get_guest_by_id(guest_id) or {}
        guest["photo_url"] = photo_url(guest.get("photo_path", ""), "guest_photos")
        return {"ok": True, "message": f"{clean_name} (Oda {clean_room}) {msg_suffix}", "guest": guest}

    @app.get("/api/health")
    def health():
        body = {
            "ok": holder.state == "running",
            "state": holder.state,
            "error": holder.error,
            "uptime_seconds": round(time.time() - holder.started_at, 1),
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

    @app.get("/api/guests")
    def list_guests():
        guests = db.list_active_guests_info()
        for g in guests:
            g["photo_url"] = photo_url(g.get("photo_path", ""), "guest_photos")
        return {"guests": guests, "total": len(guests)}

    @app.post("/api/guests/from-camera")
    def register_guest_from_camera(req: GuestRegisterRequest):
        svc = service()
        if not svc.camera_connected:
            raise HTTPException(status_code=400, detail="Kamera şu anda bağlı değil.")
        res = svc.extract_face_from_live_camera()
        if res is None:
            raise HTTPException(status_code=400, detail="Şu anda kamerada net bir yüz görünmüyor.")
        embedding, portrait = res
        return save_guest(req.name, req.room_number, req.days, req.check_out_date, embedding, portrait)

    @app.post("/api/guests/identify-from-camera")
    def identify_guest_from_camera():
        """Kameradaki kişiyi tanır ve ADAYI döner; çıkışı yapmaz (onay sonrası `/api/guests/{id}/checkout`)."""
        svc = service()
        if not svc.camera_connected:
            raise HTTPException(status_code=400, detail="Kamera şu anda bağlı değil.")
        ok, msg, info = svc.identify_guest_from_live_camera()
        if not ok:
            raise HTTPException(status_code=400, detail=msg)
        return {"ok": True, "needs_confirmation": True, "message": msg, "guest": info}

    @app.post("/api/guests/from-photo")
    def register_guest_from_photo(
        name: str = Form(...),
        room_number: str = Form(...),
        days: int = Form(30),
        check_out_date: Optional[str] = Form(None),
        photo: UploadFile = File(...),
    ):
        svc = service()
        contents = photo.file.read(MAX_UPLOAD_BYTES + 1)
        if len(contents) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Fotoğraf boyutu en fazla 10 MB olabilir.")
        img = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(status_code=400, detail="Yüklenen dosya geçerli bir fotoğraf değil.")
        res = svc.extract_face_from_image(img)
        if res is None:
            raise HTTPException(status_code=400, detail="Fotoğrafta net bir yüz tespit edilemedi.")
        embedding, portrait = res
        return save_guest(name, room_number, days, check_out_date, embedding, portrait, msg_suffix="fotoğraftan kaydedildi.")

    @app.post("/api/alerts/{alert_id}/register")
    def register_guest_from_alert(alert_id: int, req: GuestRegisterRequest):
        alert = db.get_alert_by_id(alert_id)
        if not alert:
            raise HTTPException(status_code=404, detail="Alarm kaydı bulunamadı.")
        embedding = alert.get("embedding")
        image_path = alert.get("image_path", "")
        crop_path = alert.get("face_crop_path", "") or (face_sibling(image_path) if image_path else "")
        portrait = cv2.imread(crop_path) if crop_path and os.path.exists(crop_path) else None
        if embedding is None:
            svc = service()
            src = crop_path if (crop_path and os.path.exists(crop_path)) else image_path
            if not src or not os.path.exists(src):
                raise HTTPException(status_code=400, detail="Bu alarma ait görüntü dosyası bulunamadı.")
            img = cv2.imread(src)
            res = svc.extract_face_from_image(img) if img is not None else None
            if res is None:
                raise HTTPException(status_code=400, detail="Bu alarm karesinde yüz imzası çıkarılamadı.")
            embedding, extracted = res
            portrait = portrait if portrait is not None else extracted
        result = save_guest(
            req.name, req.room_number, req.days, req.check_out_date, embedding, portrait,
            fallback_img_path=image_path, msg_suffix="alarm karesinden kaydedildi.",
        )  # fmt: skip
        img_p, crop_p = db.delete_alert(alert_id)
        for p in (img_p, crop_p):
            GuestDatabase._safe_remove_file(p)
        return result

    @app.post("/api/guests/{guest_id}/checkout")
    def checkout_single_guest(guest_id: int):
        guest = db.get_guest_by_id(guest_id)
        if not guest:
            raise HTTPException(status_code=404, detail="Misafir bulunamadı.")
        if not db.deactivate_guest(guest_id):
            raise HTTPException(status_code=400, detail="Misafir zaten çıkış yapmış.")
        if holder.service is not None:
            holder.service.reload_guests()  # type: ignore[attr-defined]
        return {"ok": True, "message": f"{guest['name']} (Oda {guest['room_number']}) çıkış yaptı."}

    @app.get("/api/alerts")
    def get_alerts(limit: int = 24):
        alerts = db.get_recent_alerts(limit=min(max(1, limit), 100))
        for a in alerts:
            img = a.get("image_path", "")
            crop = a.get("face_crop_path", "") or (face_sibling(img) if img else "")
            a["image_url"] = photo_url(img, "alerts") if (img and os.path.exists(img)) else ""
            a["face_url"] = photo_url(crop, "alerts") if (crop and os.path.exists(crop)) else a["image_url"]
        return {"alerts": alerts}

    @app.delete("/api/alerts/{alert_id}")
    def delete_single_alert(alert_id: int):
        for p in db.delete_alert(alert_id):
            GuestDatabase._safe_remove_file(p)
        return {"ok": True}

    @app.post("/api/alerts/clear")
    def clear_all_alerts():
        for p in db.clear_alerts():
            GuestDatabase._safe_remove_file(p)
        return {"ok": True}

    @app.post("/api/system/cleanup-storage")
    def run_storage_cleanup():
        return {"ok": True, "stats": db.run_storage_maintenance()}

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
    apply_offline_env(os.path.join(os.path.dirname(os.path.abspath(settings.DB_PATH)), "ultralytics"))
    if os.environ.get(WATCH_ENV) == "1":
        start_parent_watch(hard_exit)
    from face_engine import FaceEngine
    from security_service import SecurityService

    db = GuestDatabase(settings.DB_PATH, settings)

    def build() -> SecurityService:
        return SecurityService(db=db, settings=settings, face_engine=FaceEngine(settings=settings))

    uvicorn.run(
        create_app(settings, token, db, build),
        host=settings.WEB_HOST,
        port=settings.WEB_PORT,
        log_level="warning",
        timeout_graceful_shutdown=1,
    )


if __name__ == "__main__":
    main()
