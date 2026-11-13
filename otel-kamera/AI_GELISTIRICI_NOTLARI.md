# Otel Kamera — geliştirici ve yapay zeka el kitabı

> Bu belge **kodla eşitlenmiştir** (Faz 20 P20a, 2026-11-13; Ç-08). Eski sürümde bulunan ama kodda olmayan şeyler
> (`guest_face_profiles` tablosu, `.env.example`'a dayalı kurulum, gerçek ByteTrack) kaldırıldı ya da "yapılacak" olarak
> işaretlendi. Üst belgeler: `docs/analiz/06-kamera-entegrasyonu.md`, `.claude/rules/camera.md`, `docs/plan/fazlar/faz-20-*.md`.

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
├── security_service.py   # analiz döngüsü (try/except + sağlık), yüz çıkarma, çizim; ağır bileşenler enjekte edilir
├── face_engine.py        # InsightFace sarmalayıcısı (import tembel; sahte `app` ile test edilir)
├── tracker.py            # iz atama, doğrulanmış kimlik (TTL), kayıtsız sayaç (pencereli), poligon (oranlı), tek kilit
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
| `FACE_SIMILARITY_THRESHOLD` | `camera.similarityThreshold` | 0.36 |
| `CHECKOUT_MIN_SIMILARITY` | `camera.confirmSimilarity` | 0.45 |
| `MIN_FACE_DET_SCORE` / `MIN_FACE_SIZE_PX` | `camera.minFaceScore` / `camera.minFacePx` | 0.62 / 55 |
| `CONFIRMATION_FRAMES` | `camera.confirmationFrames` | 3 |
| `PROCESS_EVERY_N_FRAMES` | `camera.processEveryN` | 3 |
| `ALARM_COOLDOWN_SECONDS` | `camera.alarmCooldownSeconds` | 60 |
| `VERIFIED_TTL_SECONDS` | `camera.verifiedTtlSeconds` | 20 |
| `ZONE_POLYGON` | `camera.zonePolygon` | boş (tüm kare); `x,y;…` piksel ya da 0..1 oranlı |
| `ALERT_RETENTION_DAYS` | `camera.alertRetentionDays` | 3 (K-52) |
| `CONFIRMATION_WINDOW_SECONDS`, `STALL_SECONDS`, `ORPHAN_MIN_AGE_SECONDS`, dedup | Python varsayılanı | 6 / 15 / 300 / 0.46, 12 sa |

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

P20d'ye bırakılanlar: 2 (gerçek ByteTrack/IoU), 5 (kişi yokken yüz arama), 6 (tek eşik + saha ölçümü), 20 (Türkçe etiket →
renderer), 23–24 (MJPEG/çizim performansı).

## 7. Test ve kalite

```bash
./venv/bin/python -m pytest      # 50+ test, ~3 sn; model/ağ/kamera gerekmez
./venv/bin/ruff check .
```

Testler sentetik gürültü karesi, sahte `FaceAnalysis` (`tests/fakes.py::FakeInsightApp`) ve sahte tespit kullanır; gerçek
YOLO/InsightFace ile uçtan uca doğrulama P20d/P20f ve sahip onay paketindedir (i5-8 GB sınıfında ≥ 4 analiz/sn).

## 8. Durum

- **P20a (bu paket):** yan süreç sözleşmesi, hijyen, Telegram'ın Bismuth'a taşınması, testler. Kamera sekmesi P20b, veri
  entegrasyonu (şifreli `guest_faces`/`camera_events`) P20c, model sabitleme P20d, KVKK P20e, sihirbaz P20g, paketleme P20f.
- Eski `static/index.html` ve `Baslat_*`/`Otel_*` betikleri bağımsız dönemden kalmadır; belirteç zorunluluğuyla tek başına
  çalışmaz, P20b/P20f'de kaldırılır.
