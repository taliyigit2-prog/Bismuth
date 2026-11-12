import os
import re
import shutil
import time
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Optional
import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from config import config
from database import GuestDatabase
from security_service import SecurityService

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB üst sınır (DoS koruması)

os.makedirs(config.ALERTS_DIR, exist_ok=True)
os.makedirs(config.GUEST_PHOTOS_DIR, exist_ok=True)
os.makedirs("static", exist_ok=True)

db = GuestDatabase(config.DB_PATH)
security_service: Optional[SecurityService] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global security_service
    security_service = SecurityService(db=db)
    security_service.start()
    print("=" * 65)
    print(f"🌐 MANGO KAMERA KONTROL PANELİ HAZIR: http://localhost:{config.WEB_PORT}")
    print("=" * 65)
    yield
    if security_service:
        security_service.stop()


app = FastAPI(
    title="Mango Kamera - KBS ve Güvenlik Kontrol Paneli",
    lifespan=lifespan,
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    if request.url.path.startswith("/api/") and request.url.path != "/api/stream":
        response.headers["Cache-Control"] = "no-store"
    return response


app.mount("/alerts", StaticFiles(directory=config.ALERTS_DIR), name="alerts")
app.mount("/guest_photos", StaticFiles(directory=config.GUEST_PHOTOS_DIR), name="guest_photos")
app.mount("/static", StaticFiles(directory="static"), name="static")


class GuestRegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    room_number: str = Field(..., min_length=1, max_length=24)
    days: int = Field(default=30, ge=1, le=3650)
    check_out_date: Optional[str] = Field(default=None, max_length=32)


def _sanitize_text(val: str, max_len: int = 100) -> str:
    clean = re.sub(r"[<>\"'`\x00-\x1f]", "", (val or "")).strip()
    return clean[:max_len]


def _compute_checkout_str(days: int, custom_date: Optional[str] = None) -> str:
    if custom_date and custom_date.strip():
        clean = _sanitize_text(custom_date, 32)
        if len(clean) == 10:
            return f"{clean} 23:59:59"
        return clean
    clamped_days = min(max(1, int(days)), 3650)
    return (datetime.now() + timedelta(days=clamped_days)).strftime("%Y-%m-%d %H:%M:%S")


def _format_photo_url(path: str, prefix: str) -> str:
    if not path:
        return ""
    return f"/{prefix}/{os.path.basename(path)}"


def _save_and_respond_guest(
    name: str,
    room_number: str,
    days: int,
    check_out_date: Optional[str],
    embedding: np.ndarray,
    portrait: Optional[np.ndarray] = None,
    fallback_img_path: str = "",
    msg_suffix: str = "başarıyla KBS listesine tanımlandı.",
) -> dict:
    clean_name = _sanitize_text(name, 100)
    clean_room = _sanitize_text(room_number, 24)
    if not clean_name or not clean_room:
        raise HTTPException(status_code=400, detail="Lütfen geçerli bir misafir adı ve oda numarası girin.")

    checkout_str = _compute_checkout_str(days, check_out_date)
    guest_id = db.add_guest(
        name=clean_name,
        room_number=clean_room,
        embedding=embedding,
        check_out_date=checkout_str,
    )

    photo_path = ""
    if portrait is not None:
        filename = f"guest_{guest_id}_{int(time.time())}.jpg"
        photo_path = os.path.join(config.GUEST_PHOTOS_DIR, filename)
        cv2.imwrite(photo_path, portrait, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
        db.update_guest_photo(guest_id, photo_path)
    elif fallback_img_path and os.path.exists(fallback_img_path):
        filename = f"guest_{guest_id}_{int(time.time())}.jpg"
        photo_path = os.path.join(config.GUEST_PHOTOS_DIR, filename)
        shutil.copy2(fallback_img_path, photo_path)
        db.update_guest_photo(guest_id, photo_path)

    if security_service:
        security_service.reload_guests()

    guest = db.get_guest_by_id(guest_id)
    guest["photo_url"] = _format_photo_url(photo_path, "guest_photos")
    return {
        "ok": True,
        "message": f"{clean_name} (Oda {clean_room}) {msg_suffix}",
        "guest": guest,
    }


@app.get("/", response_class=HTMLResponse)
async def index():
    html_path = os.path.join("static", "index.html")
    if not os.path.exists(html_path):
        return HTMLResponse("<h1>Arayüz dosyası bulunamadı.</h1>", status_code=404)
    with open(html_path, "r", encoding="utf-8") as f:
        return HTMLResponse(f.read())


@app.get("/api/status")
async def get_status():
    if not security_service:
        return {"camera_connected": False, "active_guests_count": 0}
    return security_service.get_status()


@app.get("/api/stream")
async def video_stream(request: Request):
    async def frame_generator():
        while True:
            if await request.is_disconnected():
                break
            if not security_service or not security_service._running:
                break
            if security_service and security_service.latest_jpeg:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + security_service.latest_jpeg + b"\r\n"
                )
            await asyncio.sleep(0.05)

    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/api/guests")
async def list_guests():
    guests = db.list_active_guests_info()
    for g in guests:
        g["photo_url"] = _format_photo_url(g.get("photo_path", ""), "guest_photos")
    return {"guests": guests, "total": len(guests)}


@app.post("/api/guests/from-camera")
async def register_guest_from_camera(req: GuestRegisterRequest):
    if not security_service or not security_service.camera_connected:
        raise HTTPException(status_code=400, detail="Kamera şu anda bağlı değil.")

    res = security_service.extract_face_from_live_camera()
    if res is None:
        raise HTTPException(
            status_code=400,
            detail="Şu anda kamerada net bir yüz görünmüyor. Lütfen kişinin kameraya bakmasını sağlayıp tekrar deneyin.",
        )

    embedding, portrait = res
    return _save_and_respond_guest(
        name=req.name,
        room_number=req.room_number,
        days=req.days,
        check_out_date=req.check_out_date,
        embedding=embedding,
        portrait=portrait,
    )


@app.post("/api/guests/checkout-from-camera")
async def checkout_guest_from_camera():
    if not security_service or not security_service.camera_connected:
        raise HTTPException(status_code=400, detail="Kamera şu anda bağlı değil.")

    ok, msg, guest_info = security_service.identify_and_checkout_from_live_camera()
    if not ok:
        raise HTTPException(status_code=400, detail=msg)

    return {"ok": True, "message": msg, "guest": guest_info}


@app.post("/api/guests/from-photo")
async def register_guest_from_photo(
    name: str = Form(...),
    room_number: str = Form(...),
    days: int = Form(30),
    check_out_date: Optional[str] = Form(None),
    photo: UploadFile = File(...),
):
    if not security_service:
        raise HTTPException(status_code=500, detail="Güvenlik servisi henüz hazır değil.")

    contents = await photo.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Fotoğraf boyutu en fazla 10 MB olabilir.")

    np_arr = np.frombuffer(contents, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Yüklenen dosya geçerli bir fotoğraf değil.")

    res = security_service.extract_face_from_image(img)
    if res is None:
        raise HTTPException(
            status_code=400,
            detail="Yüklenen fotoğrafta net bir insan yüzü tespit edilemedi. Lütfen yüzün net göründüğü bir fotoğraf seçin.",
        )

    embedding, portrait = res
    return _save_and_respond_guest(
        name=name,
        room_number=room_number,
        days=days,
        check_out_date=check_out_date,
        embedding=embedding,
        portrait=portrait,
        msg_suffix="fotoğraftan başarıyla tanımlandı.",
    )


@app.post("/api/alerts/{alert_id}/register")
async def register_guest_from_alert(alert_id: int, req: GuestRegisterRequest):
    alert = db.get_alert_by_id(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alarm kaydı bulunamadı.")

    embedding = alert.get("embedding")
    portrait_img = None

    face_crop_path = alert.get("face_crop_path", "")
    image_path = alert.get("image_path", "")

    if not face_crop_path and image_path:
        inferred_crop = image_path.replace("alert_", "face_")
        if os.path.exists(inferred_crop):
            face_crop_path = inferred_crop

    if face_crop_path and os.path.exists(face_crop_path):
        portrait_img = cv2.imread(face_crop_path)

    if embedding is None:
        if not security_service:
            raise HTTPException(status_code=500, detail="Güvenlik servisi hazır değil.")
        src_path = face_crop_path if (face_crop_path and os.path.exists(face_crop_path)) else image_path
        if not src_path or not os.path.exists(src_path):
            raise HTTPException(status_code=400, detail="Bu alarma ait görüntü dosyası bulunamadı.")
        img = cv2.imread(src_path)
        if img is None:
            raise HTTPException(status_code=400, detail="Alarm görüntüsü okunamadı.")
        res = security_service.extract_face_from_image(img)
        if res is None:
            raise HTTPException(
                status_code=400,
                detail="Bu alarm karesinde yüz imzası çıkarılamadı. Lütfen yüzün daha net olduğu bir kare seçin.",
            )
        embedding, extracted_portrait = res
        if portrait_img is None:
            portrait_img = extracted_portrait

    result = _save_and_respond_guest(
        name=req.name,
        room_number=req.room_number,
        days=req.days,
        check_out_date=req.check_out_date,
        embedding=embedding,
        portrait=portrait_img,
        fallback_img_path=image_path,
        msg_suffix="yakalanan fotoğraftan KBS listesine kaydedildi!",
    )

    img_p, crop_p = db.delete_alert(alert_id)
    for p in (img_p, crop_p):
        if p and os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass

    return result


@app.post("/api/guests/{guest_id}/checkout")
async def checkout_single_guest(guest_id: int):
    guest = db.get_guest_by_id(guest_id)
    if not guest:
        raise HTTPException(status_code=404, detail="Misafir bulunamadı.")

    ok = db.deactivate_guest(guest_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Misafir zaten çıkış yapmış.")

    if security_service:
        security_service.reload_guests()

    return {
        "ok": True,
        "message": f"{guest['name']} (Oda {guest['room_number']}) çıkış işlemi yapıldı ve listeden kaldırıldı.",
    }


@app.get("/api/alerts")
async def get_alerts(limit: int = 24):
    clamped_limit = min(max(1, limit), 100)
    alerts = db.get_recent_alerts(limit=clamped_limit)
    for a in alerts:
        img_path = a.get("image_path", "")
        crop_path = a.get("face_crop_path", "")
        if not crop_path and img_path:
            inferred = img_path.replace("alert_", "face_")
            if os.path.exists(inferred):
                crop_path = inferred

        a["image_url"] = _format_photo_url(img_path, "alerts") if (img_path and os.path.exists(img_path)) else ""
        if crop_path and os.path.exists(crop_path):
            a["face_url"] = _format_photo_url(crop_path, "alerts")
        else:
            a["face_url"] = a["image_url"]
    return {"alerts": alerts}


@app.delete("/api/alerts/{alert_id}")
async def delete_single_alert(alert_id: int):
    img_path, crop_path = db.delete_alert(alert_id)
    for p in (img_path, crop_path):
        if p and os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass
    return {"ok": True}


@app.post("/api/alerts/clear")
async def clear_all_alerts():
    paths = db.clear_alerts()
    for p in paths:
        if p and os.path.exists(p):
            try:
                os.remove(p)
            except OSError:
                pass
    return {"ok": True, "message": "Tüm alarm geçmişi temizlendi."}


@app.post("/api/system/cleanup-storage")
async def run_storage_cleanup():
    stats = db.run_storage_maintenance()
    return {
        "ok": True,
        "stats": stats,
        "message": (
            f"Akıllı temizlik tamamlandı: {stats['removed_old_alerts']} eski, "
            f"{stats['removed_duplicate_alerts']} mükerrer yüz ve "
            f"{stats['removed_orphan_files']} gereksiz dosya silindi."
        ),
    }


@app.post("/api/system/toggle-alarms")
async def toggle_alarms():
    if not security_service:
        raise HTTPException(status_code=500, detail="Servis hazır değil.")
    security_service.alarms_paused = not security_service.alarms_paused
    state_str = "DURAKLATILDI" if security_service.alarms_paused else "AKTİF EDİLDİ"
    return {
        "ok": True,
        "alarms_paused": security_service.alarms_paused,
        "message": f"Telegram alarmları {state_str}.",
    }


@app.post("/api/system/test-telegram")
async def test_telegram_notification():
    if not security_service:
        raise HTTPException(status_code=500, detail="Servis hazır değil.")

    frame = security_service.latest_raw_frame
    if frame is None:
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        frame[:] = (19, 18, 23)
        cv2.putText(frame, "MANGO KAMERA TEST", (130, 240), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (68, 162, 130), 2)

    saved, _ = security_service.notifier.send_alert_with_crop(
        frame=frame,
        tracker_id=0,
        title="✅ MANGO KAMERA PANEL TESTİ",
        location="Resepsiyon Web Paneli",
        async_send=True,
    )
    return {
        "ok": True,
        "message": "Telegram grubuna test bildirimi gönderildi!",
        "saved_path": saved,
    }


if __name__ == "__main__":
    uvicorn.run(
        app,
        host=config.WEB_HOST,
        port=config.WEB_PORT,
        log_level="info",
        timeout_graceful_shutdown=1,
    )
