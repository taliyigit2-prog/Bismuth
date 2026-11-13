# Otel Kamera — geliştirici ve yapay zeka el kitabı

> Bu belge **kodla eşitlenmiştir** (Faz 20 P20a, 2026-11-13; Ç-08). Eski sürümde bulunan ama kodda olmayan şeyler
> (`guest_face_profiles` tablosu, `.env.example`'a dayalı kurulum) kaldırıldı ya da "yapılacak" olarak işaretlendi; P20d
> (2026-11-13) izleme, model yükleme ve yayını değiştirdi. Üst belgeler: `docs/analiz/06-kamera-entegrasyonu.md`, `.claude/rules/camera.md`, `docs/plan/fazlar/faz-20-*.md`.

## 1. Ne yapar?

Güvenlik kamerasından (RTSP ya da web kamerası) gelen görüntüyü yerelde işler:

1. YOLO11n ile kişiyi bulur, InsightFace `buffalo_s` ile yüzünü tanır (512-D vektör, kosinüs benzerliği).
2. Yüzü **aktif misafir listesiyle** eşleştirir; eşleşen = "kayıtlı", eşleşmeyen = "kayıtsız".
3. Kayıtsız kişi `CONFIRMATION_FRAMES` kez **zaman penceresi içinde ardışık** görülürse ve soğuma süresi geçtiyse alarm üretir
   (ham kare + yüz kırpması yerelde saklanır, alarm kaydı yazılır).
4. Canlı görüntüyü MJPEG olarak (`/api/stream`) ve durumu JSON olarak sunar.

Bismuth bu hizmeti **yan süreç** olarak çalıştırır (mimari A'); Telegram bildirimi Bismuth'tadır (K-50), Python dış servise bağlanmaz.

## 2. Süreç ve köprü (K-49)

| Konu | Kural | Kod |
|---|---|---|
| Başlatma | Electron `src/main/camera/sidecar.ts`: `python web_app.py`, `stdio=['pipe','pipe','pipe']` | `web_app.main` |
| Belirteç | Her başlatmada 32 bayt rastgele (hex), `BISMUTH_CAMERA_TOKEN` ortam değişkeni; komut satırında yok | `config.load_token` |
| Ayarlar | `BISMUTH_CAMERA_CONFIG` JSON (Bismuth `camera.*` ayarları + kamera adresi); `.env` yüklenmez | `config.load_config` |
| Adres | Yalnız `127.0.0.1`; başka adres `ConfigError` (0.0.0.0 reddedilir) | `config.is_loopback` |
| İstek denetimi | Sıra: `Host` (DNS rebinding) → `Origin` (CSRF; varsa yalnız kendi adresimiz) → `X-Bismuth-Token` (401). CORS yok | `bridge_security.BridgeGuard` |
| Canlı yayın | `<img>` başlık gönderemez: yalnız `GET /api/stream?st=<bitiş>.<hmac>` kısa ömürlü imza kabul edilir (belirteç URL'ye girmez) | `make_stream_token` (TS karşılığı `bridge.ts`) |
| Ebeveyn ölümü | `BISMUTH_CAMERA_WATCH_STDIN=1`: stdin kapanınca (Bismuth kapandı/çöktü) süreç çıkar | `parent_watch.py` |
| Sağlık | `GET /api/health`: `state` = `starting` (modeller yükleniyor) / `running` / `failed` + analiz döngüsü sağlığı (`ok`/`degraded`/`stalled`) | `web_app.health`, `health.LoopHealth` |
| Günlük | Kaynak adresindeki `kullanıcı:şifre@` ve bot belirteci günlüklerde maskelenir | `bridge_security.redact` |

Electron tarafı (`sidecar.ts`): çökmede artan bekleme ile yeniden başlatır; 10 dk içinde **3 çökme → bildirim**,
**5 çökme → vazgeç + bildirim** (Kamera ekranından elle yeniden başlatılır); sağlık yoklaması başlangıçta (modeller yüklenirken)
ve sonra her 10 sn (3 cevapsızlıkta süreç öldürülüp çökme sayılır).

## 3. Dosya düzeni

```text
otel-kamera/
├── web_app.py            # create_app(...) fabrikası + main(); uç noktalar `def` (iş parçacığı havuzu), modeller arka planda yüklenir
├── bridge_security.py    # Host/Origin/belirteç ara katmanı, akış imzası, redact
├── config.py             # Config (JSON/ortam), loopback ve aralık doğrulaması, OPENCV_FFMPEG_CAPTURE_OPTIONS
├── timeutil.py           # tek zaman kuralı (yerel, "YYYY-MM-DDTHH:MM:SS") ve çıkış tarihi doğrulaması
├── health.py             # analiz döngüsü sağlık sayacı
├── parent_watch.py       # stdin EOF → çık
├── camera_grabber.py     # kamera okuyucu + gözcü (takılan read() yeniden başlatılır) + artan geri çekilme
├── security_service.py   # analiz döngüsü (try/except + sağlık), yüz çıkarma, kutu verisi (`get_overlay`), yayın (`stream_frame`); ÇİZİM YOK; ağır bileşenler enjekte edilir
├── face_engine.py        # InsightFace sarmalayıcısı (yerel yükleme; sahte `app` ile test edilir)
├── model_loader.py       # YEREL model yükleme, çevrimdışı ortam, ultralytics sync=False, SHA256SUMS (K-57)
├── bytetrack_lite.py     # IoU tabanlı iki aşamalı izleyici (kişi ve kişi kutusuz yüz izleri)
├── tracker.py            # iz atama (bytetrack_lite), doğrulanmış kimlik (TTL), kayıtsız sayaç (pencereli), poligon (oranlı), tek kilit
├── alert_recorder.py     # alarm karesi (HAM kare) + yüz kırpması; Telegram yok
├── database.py           # yerel SQLite (misafir + alarm; P20c'de Bismuth DB'sine taşınır)
├── static/index.html     # eski tarayıcı paneli: yollar kaldırıldı, dosya P20b'de silinir
├── tests/                # pytest (sentetik görüntü + sahte bileşen; model ve ağ gerekmez)
├── requirements.txt      # `==` sabit; requirements-dev.txt: pytest, httpx, ruff
└── pyproject.toml        # pytest + ruff ayarı
```

Kaldırılanlar: `notifier.py` (Telegram — K-50), `test_system.py` (gerçek DB'ye dokunuyordu; yerine `tests/`), `.env` okuma
(`python-dotenv`), `requests`, `HEADLESS` ayarı (kullanılmıyordu), `/api/system/test-telegram`, `/`, `/static`.

## 4. Veri (yerel; P20c'ye kadar)

`database.py` (SQLite WAL, tek yazıcı kilidi, her çağrıda kapanan bağlantı):

- `guests(id, name, room_number, check_in_date, check_out_date, embedding BLOB, photo_path, is_active, created_at)` —
  çoklu açı = aynı ad+oda+çıkış tarihiyle birden çok satır (ayrı bir `guest_face_profiles` tablosu **yoktur**).
- `alert_logs(id, alert_time, image_path, face_crop_path, embedding BLOB, details)`.
- Tarihler **yerel ISO** (`YYYY-MM-DDTHH:MM:SS`); eski "boşluklu" satırlar açılışta dönüştürülür. Çıkış tarihi `YYYY-MM-DD`
  (günün sonu) ya da saatli yerel zaman; başka biçim 422.
- Okuma yolları yazmaz; süresi dolanları `cleanup_expired_guests()` pasifler (döngü dakikada bir).
- **K-51/K-53 hedefi:** yüz vektörü ve kırpma yalnız Bismuth DB'sinde şifreli tutulacak, Python diske veri yazmayacak,
  misafir tek kaynaktan (Bismuth) gelecek — bu P20c'dir. O zamana dek bu dizin `userData/camera/` altındadır ve yedeğe girmez.

## 5. Ayarlar (Bismuth `camera.*` → `BISMUTH_CAMERA_CONFIG`)

| Python adı | Bismuth ayarı | Varsayılan |
|---|---|---|
| `CAMERA_SOURCE` (SIR) | sırlar deposu (şifreli), ayar değil | — (yoksa başlamaz) |
| `CAMERA_LOCATION` | `camera.location` | boş = Python varsayılanı |
| `FACE_SIMILARITY_THRESHOLD` (TEK "aynı kişi" eşiği) | `camera.similarityThreshold` | 0.36 |
| `FACE_UNCERTAIN_MARGIN` | `camera.uncertainMargin` | 0.06 (0 = "emin değil" bandı kapalı) |
| `IDLE_FACE_SCAN_EVERY` | `camera.idleFaceScanEvery` | 3 (0 = kişi yokken yüz arama kapalı) |
| `STREAM_MAX_WIDTH` | `camera.streamMaxWidth` | 960 |
| `MODELS_DIR` | Bismuth verir (`resources/camera/models`) | boş = `model_loader.default_models_dir()` |
| `CHECKOUT_MIN_SIMILARITY` | `camera.confirmSimilarity` | 0.45 |
| `MIN_FACE_DET_SCORE` / `MIN_FACE_SIZE_PX` | `camera.minFaceScore` / `camera.minFacePx` | 0.62 / 55 |
| `CONFIRMATION_FRAMES` | `camera.confirmationFrames` | 3 |
| `PROCESS_EVERY_N_FRAMES` | `camera.processEveryN` | 3 |
| `ALARM_COOLDOWN_SECONDS` | `camera.alarmCooldownSeconds` | 60 |
| `VERIFIED_TTL_SECONDS` | `camera.verifiedTtlSeconds` | 20 |
| `ZONE_POLYGON` | `camera.zonePolygon` | boş (tüm kare); `x,y;…` piksel ya da 0..1 oranlı |
| `ALERT_RETENTION_DAYS` | `camera.alertRetentionDays` | 3 (K-52) |
| `CONFIRMATION_WINDOW_SECONDS`, `STALL_SECONDS`, `ORPHAN_MIN_AGE_SECONDS`, `DEDUP_WINDOW_HOURS`, `STREAM_JPEG_QUALITY`, `STREAM_MAX_FPS`, `TRACK_*` | Python varsayılanı | 6 / 15 / 300 / 12 sa / 75 / 15 / yüksek 0.5, düşük 0.1, IoU 0.3, tampon 4 sn |

Telegram (`camera.telegram.enabled`, `camera.telegram.photo`) ve bot belirteci/sohbet kimliği **Python'a hiç gitmez**.

## 6. Çözülen kritik problemler (kod bulgusu numarasıyla)

| # | Konu | Çözüm | Test |
|---|---|---|---|
| 1 | Telegram karesinde misafir adı/oda | Telegram Python'dan kalktı; alarm karesi etiketsiz ham kare | `test_service_loop::test_alarm_karesi_etiketsiz_ham_karedir…` |
| 3 | Doğrulanmış kimlik hiç bitmiyor, yabancı devralıyor | TTL + yalnız gerçek eşleşmeyle tazelenme + ardışık eşleşmemede düşme | `test_tracker` (3 test), `test_service_loop::test_kayıtlı_iz_yabancıya_geçmez…` |
| 4 | Kayıtsız sayaç "üst üste" değil, sözlükler büyüyor | Zaman pencereli sayaç + periyodik temizlik | `test_tracker::test_kayıtsız_alarm…`, `…sözlükler_periyodik_temizlenir…` |
| 7 | Bakım tekilleştirmesi tüm geçmişe | Yalnız `DEDUP_WINDOW_HOURS` içindeki alarmlar | `test_database::test_bakım_tekilleştirmesi…` |
| 8 | Sahipsiz dosya temizliği yarışı | Yeni dosyaya (yaş < 5 dk) dokunmaz + tek yazıcı kilidi | `test_database::test_sahipsiz_dosya…` |
| 9 | Telegram belirteci günlüğe | Python'da ağ çağrısı yok ("kaldırıldı"); kalan günlükler maskeli | `test_config_and_bridge::test_redact…`, `test_grabber…::test_bağlantı_hatası…` |
| 10 | Watchdog yok | `camera_grabber` gözcü iş parçacığı; `OPENCV_FFMPEG_CAPTURE_OPTIONS` `config.py`'de (import sırası) | `test_grabber…::test_takılan_okuma…` |
| 11 | Sabit geri çekilme, sessiz | 2→4→8→16→30 sn + günlük | `test_grabber…::test_geri_çekilme…` |
| 12, 13 | Döngüde try/except yok; alarm yolu hatası | Tüm döngü try/except + `LoopHealth`; alarm kaydı ayrı korunur | `test_service_loop::test_tespit_hatası…`, `…test_disk_hatası…` |
| 14 | Bloklayan `async def` | Uç noktalar `def` (iş parçacığı havuzu) | `test_web_app::test_bloklayan_uç_noktalar…` |
| 15 | Misafir listesi yarışı, 10 sn'de DB yazma | Tracker tek kilit; okuma yazmaz, süre dolumu dakikada bir | `test_tracker::test_eşzamanlı…` |
| 16 | Okuma yolunda yazma | `get_active_guests` UPDATE yapmaz | `test_database::test_okuma_yolu_yazmaz…` |
| 17 | Serbest metin çıkış tarihi | `strptime` doğrulaması, 422 | `test_database::test_geçersiz_çıkış_tarihi…`, `test_web_app::test_geçersiz…` |
| 18 | Yanlış kişi çıkışı | Aynı ad+oda+çıkış tarihi kapsamı; kameradan tanıma yalnız aday döner (onay), eşik 0.45 | `test_database::test_çıkış_yalnız…`, `test_service_loop::test_kameradan_tanıma…` |
| 19 | Kayıt atomik değil, çift tıklama | Fotoğraf önce yazılır, satır yolla birlikte eklenir; 5 sn içinde aynı kişi aynı satırı döner | `test_database::test_çift_tıklama…`, `test_web_app::test_kayıt_fotoğrafla…` |
| 21 | Karışık saat dilimi | Tek yerel ISO kuralı; `CURRENT_TIMESTAMP` yok | `test_database::test_zaman_damgaları…` |
| 22 | SQLite bağlantı sızıntısı | `_conn()` kilit + commit/rollback + her zaman `close()` | `test_database::test_her_bağlantı_kapanır…` |
| 25 | `HEADLESS` ölü ayar; ad/oda güncelleme yok | Kaldırıldı (misafir verisi Bismuth'ta, G-60) | — |
| 26 | Piksel poligonu çözünürlüğe bağlı; hata sessiz | 0..1 oranlı poligon; ayrıştırma hatası uyarı günlüğü | `test_tracker::test_oranlı_poligon…`, `…test_bozuk_poligon…` |
| 27 | Alarm dosya adı çakışması | Mikrosaniye + rastgele ek | `test_alert_recorder::test_aynı_saniyede…` |
| 28 | Test gerçek DB'ye dokunuyor | `tests/` geçici dizin; `web_app` içe aktarırken DB açmaz | tüm `tests/` |
| 2 | Gerçek ByteTrack yok; 380 px merkez-yakınlığı iz karıştırıyor | `bytetrack_lite.py`: IoU, iki aşamalı (yüksek/düşük güven), hız tahmini, süre bazlı tampon; `supervision` 0.31'de `ByteTrack` olmadığı için ek bağımlılıksız yazıldı. Kişi ve (kişi kutusuz) yüz izleri ayrı örnek | `test_tracking_overlay_stream::test_iki_yan_yana…`, `…ayrılan_kişinin_kimliği…`, `…kısa_kaybolma…`, `…düşük_güvenli…`, `…iou_matrisi…` |
| 5 | Yüz yalnız kişi kutusu varsa aranıyor | Kişi kutusu yoksa her `IDLE_FACE_SCAN_EVERY`. analizde yüz aranır, yalnız geçiş bölgesindeki yüzler alınır; kişi kutusu varken kutuya düşmeyen küçük yüz yok sayılır | `…kişi_kutusu_yokken_de_yüz_aranır…`, `…her_nci_turda…`, `…kapatılabilir`, `…bölgesi_dışındaki…`, `…kişi_kutusuz_iki_yüz…` |
| 6 | Üç eşik (0.36 / 0.40 / 0.46) aynı kavram için | TEK `FACE_SIMILARITY_THRESHOLD` (misafir eşleşmesi, alarm tekrar-tanıma, alarm tekilleştirme); `CHECKOUT_MIN_SIMILARITY` yalnız kameradan tanıma onayı için ayrı; "emin değil" bandı `FACE_UNCERTAIN_MARGIN` (kayıtsız sayılmaz, alarm saymaz; 0 = kapalı). Üçü de Bismuth ayarından gelir. **Saha FAR/FRR ölçümü yapılmadı** (sahip onay paketi); varsayılan 0.36 eski değerdir | `…tek_ayarlı_eşiği_kullanır`, `…eşik_değişince…`, `…emin_değil_bandındaki…`, `…marj_sıfırsa…`, `test_config_and_bridge::test_p20d_ayarları…` |
| 20 | Etiketlerde Türkçe/Kiril bozuluyor (`cv2.putText`) | OpenCV'de yazı/kutu çizimi KALDIRILDI (`draw_overlays` yok). Kutu ve ham etiket verisi `GET /api/overlay` ile (0..1 koordinat); yazıyı Bismuth penceresi (P20b) dizer. Alarm karesi zaten ham | `…çizim_yazısı_kaynaktan_kalktı…`, `…kutu_ve_etiket_verisi…`, `…örtülü_kamerada…`, `test_web_app::test_kutu_verisi_…` |
| 23 | MJPEG boşta aynı kareyi 20 Hz gönderiyor | Yayın yalnız `frame_seq` değişince kare yollar (`stream_frame(last_seq)`), en çok `STREAM_MAX_FPS` | `…yayın_aynı_kareyi_tekrar_göndermez…`, `test_web_app::test_canlı_yayın_son_kare…` |
| 24 | Her karede tam çözünürlük çizim + JPEG | Analiz döngüsünde çizim ve JPEG yok; JPEG yalnız izleyici isteyince, `STREAM_MAX_WIDTH`'e küçültülerek ve izleyiciler arasında paylaşılarak; gerçek okuyucu `frame_seq` verir, aynı kare iki kez analiz edilmez | `…önbellekten_paylaşılır…`, `…küçültülür_ve_çizimsizdir`, `…aynı_karede_analiz_iki_kez_çalışmaz…` |

### Model yükleme ve çevrimdışı (P20d, K-57)

`model_loader.py` modelleri YALNIZ yerel dosyadan yükler (`MODELS_DIR`; Bismuth `resources/camera/models` yolunu verir). Dosya
yoksa `ModelMissingError` (indirme yok; `/api/health` `state=failed` + sebep). `ultralytics` içe aktarılmadan ÖNCE
`YOLO_OFFLINE=1` (içe aktarmadaki DNS yoklaması da kapanır), `YOLO_AUTOINSTALL=false`, `HF_HUB_OFFLINE=1`; sonra
`settings.update({"sync": False})`. InsightFace `root/models/buffalo_s/` yerel klasöründen, yalnız `detection` + `recognition`
modülleriyle yüklenir. Dosya listesi, kaynak ve lisans: `resources/camera/models/README.md`. Test: `tests/test_models_offline.py`
(soket/DNS/urllib yamalı; ağ çağrısı testi düşürür).

### `/api/overlay` sözleşmesi (P20b'nin çizimi için)

```
{ "seq": 12, "at": "2026-11-13T12:00:00", "frame": {"width": 1920, "height": 1080},
  "camera_connected": true, "camera_covered": false, "alarms_paused": false, "guests_count": 3,
  "zone": [[0.1,0.2],[0.9,0.2],...] | null,
  "persons": [{"id": 4, "box": [x1,y1,x2,y2], "name": "..."|null, "room": "..."|null}],
  "faces":   [{"box": [x1,y1,x2,y2], "kind": "known"|"unknown"|"uncertain", "name": ..., "room": ..., "score": 0.71|null}] }
```
Kutular 0..1 (kare genişliği/yüksekliğine oranlı); yayın küçültülse de aynı kutu çizilir. Metni (ad, oda, "Tanımsız", "Belirsiz",
"Kamera kapalı") pencere `camera.*` anahtarlarıyla dizer. Hizmet hazır değilken boş ama aynı biçimde döner.

## 7. Test ve kalite

```bash
./venv/bin/python -m pytest      # 50+ test, ~3 sn; model/ağ/kamera gerekmez
./venv/bin/ruff check .
```

Testler sentetik gürültü karesi, sahte `FaceAnalysis` (`tests/fakes.py::FakeInsightApp`) ve sahte tespit kullanır; gerçek
YOLO/InsightFace ile uçtan uca doğrulama (gerçek model dosyalarıyla) P20f ve sahip onay paketindedir (i5-8 GB sınıfında
≥ 4 analiz/sn). Model yükleme testleri sahte `ultralytics`/`insightface` modülleriyle ve ağ yamalı çalışır
(`tests/test_models_offline.py`).

## 8. Durum

- **P20a:** yan süreç sözleşmesi, hijyen, Telegram'ın Bismuth'a taşınması, testler.
- **P20d (bu paket):** çevrimdışı yerel model yükleme, ByteTrack benzeri izleme, kişi yokken yüz arama, tek eşik + "emin değil"
  bandı, çizimsiz yayın + `/api/overlay`, yayın/analiz performansı; alternatif model planı yalnız belge (`06` §6.2.1).
  Kamera sekmesi P20b (kutuları `/api/overlay` ile çizer), veri entegrasyonu (şifreli `guest_faces`/`camera_events`) P20c,
  KVKK P20e, sihirbaz P20g, paketleme + model dosyaları P20f.
- Eski `static/index.html` ve `Baslat_*`/`Otel_*` betikleri bağımsız dönemden kalmadır; belirteç zorunluluğuyla tek başına
  çalışmaz, P20b/P20f'de kaldırılır.
