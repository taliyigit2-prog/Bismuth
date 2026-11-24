---
trigger: model_decision
description: Apply when editing the camera sidecar, camera service, camera bridge, or camera UI (otel-kamera/**, src/main/camera/**, src/renderer/features/camera/**, src/shared/contract/procedures/camera.ts, src/main/api/handlers/camera.ts).
---

# Kamera Modülü Kuralları (K-49…K-53, K-57…K-59, `docs/analiz/06-kamera-entegrasyonu.md`)

- **Mimari A':** Python yan süreç (FastAPI + onnxruntime) Electron tarafından başlatılır/durdurulur; Bismuth'un içinde Kamera sekmesi; `webview`/`iframe` yok. Yan süreç yalnız `127.0.0.1`, rastgele port, `X-Bismuth-Token` zorunlu, `Origin`/`Host` denetimi, CORS yok.
- **Ağ (K-49):** Bismuth tarafında kamera ağ kodu yalnız `src/main/camera/`; hedef yalnız `127.0.0.1`, `rtsp://` ve yerel ağ keşfi (ONVIF WS-Discovery / Hikvision SADP, yalnız özel IP aralıkları). Python yan süreç dış servise bağlanmaz.
- **Telegram (K-50, tek istisna):** alarm her zaman Bismuth bildirim merkezine (`notifications`) düşer; `camera.telegram.enabled` açıksa Bismuth aynı alarmı `src/main/network/telegram/` üzerinden Telegram'a da gönderir (token/sohbet kimliği `safeStorage` ile şifreli ayar; fotoğraf eki `camera.telegram.photo`; 5 sn zaman aşımı; sessiz başarısızlık; kuyruk yok; `network.enabled=false` ile kapanır). Telegram kodu Python tarafında bulunmaz.
- **Veri (K-51, K-53):** yüz vektörü ve kırpma yalnız Bismuth DB'de (`guest_faces`, `camera_events`) AES-GCM şifreli (anahtar `safeStorage`); yedek, dışa aktarma, kopya ve kutuya **girmez**; Python tarafı diske veri yazmaz. Misafir adı/oda/tarih tek kaynaktan (Bismuth) gelir; kamera panelinde elle giriş yok (G-60).
- **Silme (K-52):** biyometrik veri "veri silinmez" kuralının istisnasıdır: çıkışta / `camera.faceRetentionDays` sonunda fiziksel silme + `audit_log` kaydı; alarm kırpmaları `camera.alertRetentionDays` (varsayılan 3 gün).
- **Aydınlatma (K-58):** yazılı rıza akışı ve `consent_at` **yok**; kurulum sihirbazı ve Kamera sekmesinde üç dilde yazdırılabilir aydınlatma metni şablonu; `guest_faces.enrolled_at/enrolled_by`; çalışan dışlama listesi.
- **Yetki:** alan `camera` (`view`/`edit`/`enroll`), her yordam `requirePermission`; telefon/HTTP aynı kapı.
- **Ayarlar (G-09):** eşikler, kamera adresleri (şifreli), saklama süreleri, sekme görünürlüğü `camera.*` ayarları; koda sabit yazılmaz; Python'a başlangıçta JSON ile iletilir.
- **Modeller (K-57):** mevcut InsightFace `buffalo_s` + YOLO11n korunur; Ultralytics `settings.update({"sync": False})` ve çevrimdışı zorunlu (telemetri yok, G-07); model dosyaları paket içinde, ilk açılışta indirme yok (G-01).
- **Kurulum sihirbazı (K-59):** donanım otomatik okunur → `camera.profile`; kamera keşfi + Hikvision RTSP kalıbı önerisi + görüntü testi; şifre `safeStorage` ile şifreli.
- **Python:** `requirements.txt` `==` sabit; `pytest` + `ruff`; analiz döngüsünde try/except ve sağlık sayacı; `datetime` tek kural (yerel ISO); görüntü dosyaları, `.env`, `*.db`, ağırlıklar depoya girmez (`camera-data-guard`).
- **UI:** `features/camera/` yalnız shadcn; canlı yayın `<img>` MJPEG; CSP `img-src` istisnası yalnız `127.0.0.1:<port>`; telefon yalnız alarm listesi (S-108); metinler `camera.*` ad alanı, üç dil; Türkçe/Kiril etiketler renderer'da (OpenCV yazı çizimi yok).
