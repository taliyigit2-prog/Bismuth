import os
from datetime import datetime, timedelta
import cv2
import numpy as np
from fastapi.testclient import TestClient

from database import GuestDatabase
from face_engine import FaceEngine
from notifier import TelegramNotifier
import web_app


def _cleanup_db_files(base_path: str):
    for suffix in ("", "-wal", "-shm"):
        p = f"{base_path}{suffix}"
        if os.path.exists(p):
            os.remove(p)


def run_tests():
    print("=" * 68)
    print("🧪 OTEL KAMERA — TAM KAPSAMLI SİSTEM, YÜZ TANIMA & GÜVENLİK TESTİ")
    print("=" * 68)

    test_db_path = "test_verification.db"
    _cleanup_db_files(test_db_path)

    # 1. Veritabanı ve Tekil Kişi Çıkış (Check-out) Testi
    print("\n[1/5] SQLite Veritabanı & Tekil Misafir Silme Testi...")
    db = GuestDatabase(test_db_path)
    emb1 = np.random.randn(512).astype(np.float32)
    emb1 /= np.linalg.norm(emb1)
    emb2 = np.random.randn(512).astype(np.float32)
    emb2 /= np.linalg.norm(emb2)
    checkout = (datetime.now() + timedelta(days=15)).strftime("%Y-%m-%d %H:%M:%S")

    gid1 = db.add_guest("Ahmet Yılmaz", "204", emb1, checkout)
    gid2 = db.add_guest("Mehmet Yılmaz", "204", emb2, checkout)
    assert len(db.get_active_guests()) == 2

    db.deactivate_guest(gid1)
    active = db.get_active_guests()
    assert len(active) == 1 and active[0][0] == gid2
    print(f"  ✅ Aynı odadaki 2 kişiden sadece 1'ini silme (Check-out) başarılı! Kalan: {active[0][1]}")

    # 2. Yakalanan Alarm Fotoğrafından KBS'ye Tanımlama & Güvenlik Başlıkları Testi
    print("\n[2/5] Yakalanan Tanımsız Yüzden KBS'ye Kayıt & Güvenlik Denetimi...")
    friend_emb = np.random.randn(512).astype(np.float32)
    friend_emb /= np.linalg.norm(friend_emb)

    dummy_crop_path = "alerts/test_friend_crop.jpg"
    os.makedirs("alerts", exist_ok=True)
    cv2.imwrite(dummy_crop_path, np.zeros((240, 240, 3), dtype=np.uint8))

    alert_id = db.log_alert(
        image_path=dummy_crop_path,
        details="Tanımsız Kişi (Takip #9)",
        face_crop_path=dummy_crop_path,
        embedding=friend_emb,
    )

    web_app.db = db
    client = TestClient(web_app.app)

    res_reg = client.post(
        f"/api/alerts/{alert_id}/register",
        json={"name": "Caner Kaya <script>", "room_number": "204", "days": 15},
    )
    assert res_reg.status_code == 200 and res_reg.json()["ok"] is True
    assert res_reg.headers.get("X-Frame-Options") == "DENY"
    assert res_reg.headers.get("X-Content-Type-Options") == "nosniff"
    assert "<" not in res_reg.json()["message"]

    guests_after = client.get("/api/guests").json()
    alerts_after = client.get("/api/alerts").json()
    assert guests_after["total"] == 2
    assert len(alerts_after["alerts"]) == 0
    print("  ✅ Alarm fotoğrafından KBS kaydı ve XSS/Clickjacking güvenlik filtreleri doğrulandı!")

    # 3. InsightFace Eşleştirme Testi
    print("\n[3/5] InsightFace (buffalo_s) CPU Motoru ile Yeni Kayıt Doğrulaması...")
    engine = FaceEngine("buffalo_s")
    active_all = db.get_active_guests()
    match_friend = engine.match_face(friend_emb, active_all)
    assert match_friend is not None and "Caner Kaya" in match_friend[1]
    print(f"  ✅ Alarmdan kaydedilen misafir artık kamerada Yeşil (Kayıtlı) olarak tanınıyor: {match_friend[1]}")

    # 4. Yakınlaştırılmış Yüz (PIP) ve Alarm Kayıt Testi
    print("\n[4/5] Yakınlaştırılmış Yüz (PIP) ve Alarm Kayıt Testi...")
    notifier = TelegramNotifier(bot_token="", chat_ids_str="")
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    scene_p, face_p = notifier.send_alert_with_crop(
        frame=dummy_frame,
        face_bbox=np.array([200, 100, 320, 220]),
        raw_frame=dummy_frame,
        tracker_id=77,
        async_send=False,
    )
    assert os.path.exists(scene_p) and os.path.exists(face_p)
    os.remove(scene_p)
    os.remove(face_p)
    print("  ✅ Hem tam sahne hem de yakınlaştırılmış yüz (face crop) ayrı ayrı üretildi ve doğrulandı.")

    # 5. Temizlik
    print("\n[5/5] Test Veritabanı Temizleniyor...")
    _cleanup_db_files(test_db_path)
    if os.path.exists(dummy_crop_path):
        os.remove(dummy_crop_path)
    for g in guests_after.get("guests", []):
        p = g.get("photo_path", "")
        if p and os.path.exists(p):
            os.remove(p)
    print("  ✅ Temizlik tamamlandı.")

    print("\n" + "=" * 68)
    print("🎉 TÜM TESTLER GEÇTİ! OTEL KAMERA SİSTEMİ %100 HAZIR.")
    print("=" * 68)


if __name__ == "__main__":
    run_tests()
