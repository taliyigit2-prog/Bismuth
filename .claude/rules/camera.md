---
paths:
  - "otel-kamera/**"
  - "src/main/camera/**"
  - "src/renderer/features/camera/**"
  - "src/shared/contract/procedures/camera.ts"
  - "src/main/api/handlers/camera.ts"
---

# Kamera modülü kuralları (K-49…K-53 taslakları; `docs/analiz/06-kamera-entegrasyonu.md`)

- **Mimari A':** Python yan süreç (FastAPI + onnxruntime) Electron tarafından başlatılır/durdurulur; Bismuth'un içinde
  Kamera sekmesi; `webview`/`iframe` yok. Yan süreç yalnız `127.0.0.1`, rastgele port, `X-Bismuth-Token` zorunlu,
  `Origin`/`Host` denetimi, CORS yok.
- **Ağ (K-49):** Bismuth tarafında ağ kodu yalnız `src/main/camera/`; hedef yalnız `127.0.0.1` ve `rtsp://` (yerel ağ).
  Dış servis (Telegram vb.) **yok** (K-50); bildirim = Bismuth bildirim merkezi (`notifications`).
- **Veri (K-51, K-53):** yüz vektörü ve kırpma yalnız Bismuth DB'de (`guest_faces`, `camera_events`) AES-GCM şifreli
  (anahtar `safeStorage`); yedek, dışa aktarma, kopya ve kutuya **girmez**; Python tarafı diske veri yazmaz. Misafir
  adı/oda/tarih tek kaynaktan (Bismuth) gelir; kamera panelinde elle giriş yok (G-60).
- **Silme (K-52):** biyometrik veri "veri silinmez" kuralının istisnasıdır: çıkışta / `camera.faceRetentionDays` sonunda
  fiziksel silme + `audit_log` kaydı; alarm kırpmaları `camera.alertRetentionDays` (varsayılan 3 gün).
- **Rıza:** `guest_faces.consent_at` olmadan kayıt yok; çalışan dışlama listesi; aydınlatma metni üç dilde şablon.
- **Yetki:** alan `camera` (`view`/`edit`/`enroll`), her yordam `requirePermission`; telefon/HTTP aynı kapı.
- **Ayarlar (G-09):** eşikler, kamera adresleri (şifreli), saklama süreleri, sekme görünürlüğü `camera.*` ayarları; koda
  sabit yazılmaz; Python'a başlangıçta JSON ile iletilir.
- **Lisans:** AGPL (ultralytics) ve ticari olmayan ağırlıklar (insightface buffalo_*) yasak; yalnız açık lisanslı
  modeller (`docs/analiz/ekler/kamera-kaynaklar.md` §B); model dosyaları paket içinde, ilk açılışta indirme yok (G-01).
- **Python:** `requirements.txt` `==` sabit; `pytest` + `ruff`; analiz döngüsünde try/except ve sağlık sayacı;
  `datetime` tek kural (yerel ISO); görüntü dosyaları, `.env`, `*.db`, ağırlıklar depoya girmez (`camera-data-guard`).
- **UI:** `features/camera/` yalnız shadcn; canlı yayın `<img>` MJPEG; CSP `img-src` istisnası yalnız `127.0.0.1:<port>`;
  telefon yalnız alarm listesi (S-108 varsayılanı); metinler `camera.*` ad alanı, üç dil; Türkçe/Kiril etiketler
  renderer'da (OpenCV yazı çizimi yok).
