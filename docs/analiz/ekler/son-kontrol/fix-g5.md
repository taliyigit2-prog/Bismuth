# S2-G5 kamera düzeltmeleri

| # | Bulgu | Düzeltme | Test |
|---|-------|----------|------|
| 1 | Tırnaklı şifre maskelenmiyor | `redact.ts` ve `bridge_security.py` regex'i `\S*@` (kullanıcı bilgisi tamamen maskeli); `camera-source.ts` `! ' ( ) *` karakterlerini de kodlar | camera.test.ts (tırnaklı şifreler), camera-source.test.ts, test_config_and_bridge.py |
| 2 | Bugün kartı eski kayıtlara bakıyor | `todayNotice`: `camera.enabled` kapalıysa null; `newAlerts` son `camera.alertRetentionDays` gün içindeki `new` olaylar; `problem` canlı `runtime.snapshot()` (gaveUp ya da crashes>=3 ve çalışmıyor) | g3-fixes.test.ts (kapalı/açık, yaş penceresi, gaveUp sürerken kart kalır, düzelince kaybolur) |
| 3 | Yanlış alarm penceresi | `FaceStore.loaded` kapısı (ilk liste gelene kadar alarm sayacı yok); Telegram ateşle-unut (tur bloklanmaz); yeniden başlatma sonrası `index.ts` sidecar `running` olunca `tick({force:true})` ile listeyi hemen yollar | test_face_store.py, test_service_loop.py (Python) |
| 4 | Gereksiz/çift yeniden başlatma | `SIDECAR_SETTING_KEYS` (config.ts); yalnız bunlar yeniden başlatır, `camera.enabled` start/stop; başlat/yeniden başlat çağrıları 300 ms birleştirilir (sihirbaz = tek yeniden başlatma, servis `attach` sarmalı) | camera.test.ts anahtar listesi testi |
| 5 | Yapılandırma dışı başlatma hatası sonsuz döngü; guest_id kalıyor | `sidecar.ts`: `afterCrash()` ortak, başlatma hatası çökme gibi sayılır (sınırlı deneme + gaveUp bildirimi); `purgeExpired` kırpma temizlerken ve kırpması olmayan olaylarda `guest_id` null | camera.test.ts (EACCES -> gaveUp, tek bildirim), g3-fixes.test.ts (purge) |

Değişen: otel-kamera/{bridge_security,face_store,security_service}.py + 4 test; src/main/camera/{redact,config,index,sidecar,camera.test}.ts; src/main/index.ts; src/main/services/{camera-faces,camera-service,camera-sync,g3-fixes.test}.ts; src/shared/domain/camera-source{,.test}.ts.
Koşulan: typecheck, lint, prettier (temiz), vitest src/main/camera + g3-fixes + camera-source (7 dosya, 86 test geçti).
Koşulamadı: Python pytest (kurulu değil, kurulum yapılmadı); yalnız regex tek satırla elle doğrulandı.
Bırakılan: `camera_events.guest_id` ingest'te hiç yazılmıyor (yalnız temizlik eklendi); index.ts birleştirme/hızlı liste gönderimi birim testsiz (Electron girişi); i18n gerekmedi, migrasyon yok. Commit yok.
