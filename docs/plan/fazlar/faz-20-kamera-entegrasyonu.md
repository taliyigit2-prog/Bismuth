# Faz 20 — Kamera entegrasyonu (otel-kamera → Bismuth içinde sekme)

> Kaynak: `docs/analiz/06-kamera-entegrasyonu.md` (seçenekler, mimari A', veri sözleşmesi, hukuk/lisans, aşamalar),
> `.claude/rules/camera.md`; paket kartları `08-gelistirme-plani.md` §4. Dalgalar 7–11. **Sahip kararları S-107…S-112
> 2026-11-13'te geldi; K-49…K-53 kesin, K-57…K-59 eklendi** (`06-kararlar.md`). Sahibin avukat görüşü (aydınlatma
> yeterli) kayda geçti; Fable'ın farklı KVKK notu `06` §6.1'de.

## Amaç
Yüz tanıma kamera sistemi Bismuth'un içinde bir sekme olarak çalışır; misafir verisi tek kaynaktan (Bismuth) akar;
biyometrik veri şifreli, süreli ve yedek dışıdır; tek dış servis ayarlı Telegram'dır (K-50); modeller sahibin kararıyla mevcut
InsightFace + YOLO11n'dir (K-57, çevrimdışı ve telemetrisiz); kamera kurulumu sihirbazla yapılır (K-59).

## Gereksinimler
Ö-20 (kamera entegrasyonu; sahip kabulüyle G-197 olur), G-01/G-02 (çevrimdışı), G-07 (dış servis yok; K-50 istisnası),
G-23 (yetki), G-60 (tek giriş), K-25 (ekler), K-49…K-53, K-57…K-59 (kesin).

## Sorular
Cevaplandı (2026-11-13): S-107 personel dışlama (varsayılan); S-108 canlı yayın yalnız ana bilgisayar; S-109 Telegram kalır
(ayarlı); S-110 modeller korunur; S-111 aydınlatma yeterli, yazılı rıza yok; S-112 Hikvision (Hik-Connect), donanım otomatik.

## Teslimatlar
1. **P20a Yan süreç iskeleti + Python hijyeni** — `src/main/camera/sidecar.ts`, `bridge.ts` (belirteç, `127.0.0.1`,
   sağlık, 5 çökme/10 dk → durdur + bildirim), `camera` yetki alanı, `camera.*` ayarları; Python: `requirements.txt` `==`,
   analiz döngüsünde try/except + sağlık, Telegram gönderimi Python'dan kaldırılıp Bismuth'a taşınır
   (`src/main/network/telegram/`, `camera.telegram.*` ayarları, fotoğraf eki ayarı, 5 sn, sessiz; K-50), belirteç/Origin
   denetimi, `pytest` + `ruff`; `no-network-guard` kancası `src/main/camera/` için güncellenir;
   `docs/analiz/ekler/kamera-kod-bulgulari.md` §0'da "P20a" işaretli kod bulguları; `AI_GELISTIRICI_NOTLARI.md` kodla
   eşitlenir (Ç-08); `docs/plan/bagimliliklar.md`'ye kamera bölümü. Dalga 7'de tek paket (P20d ile aynı dizin).
2. **P20b Kamera sekmesi** — `features/camera/`: canlı yayın (MJPEG `<img>`), durum kartı, alarm listesi, "alarmları
   duraklat"; CSP istisnası yalnız `127.0.0.1:<port>`; menü + yetki; telefon/Mac yalnız alarm listesi (S-108 varsayılanı).
3. **P20c Veri entegrasyonu** — migrasyon 0021 (`guest_faces`: occupant_id, embedding_enc, crop_path, model, enrolled_at,
   enrolled_by, deleted_at — rıza alanı yok, K-58; `camera_events`: kind, at, camera, score, crop_enc, occupant_id,
   notification_id); `crypto.ts` AES-GCM; "Kameradan yüz al" (Kişiler sekmesi); check-in/out → aktif liste; alarm →
   `notifications` (+ Telegram, P20a); "misafir olarak kaydet"; dışa aktarma/yedek/kopya dışı; silme + audit.
4. **P20d Model sabitleme ve çevrimdışı (K-57)** — mevcut InsightFace `buffalo_s` + YOLO11n kalır; `ultralytics`
   `settings.update({"sync": False})` + ağ kapalı test (indirme yok, yazı tipi/ağırlık paket içinde); model dosyaları
   `resources/camera/models/` lisans notlarıyla; `THIRD_PARTY_NOTICES` kamera bölümü + K-57 lisans uyarısı; kod
   bulguları §0 "P20d" maddeleri (etiket çizimi renderer'a, eşikler); alternatif model planı yalnız belge. Dalga 8.
5. **P20e KVKK paketi (K-58)** — aydınlatma metni şablonu (3 dil, yazdırılabilir; kurulum sihirbazı + Kamera sekmesi);
   saklama/imha ayarları ve imha raporu (`camera.faceRetentionDays`, `camera.alertRetentionDays`); personel dışlama
   listesi; rıza kaydı yok; `privacy-auditor` sahibin kararını not eder. Dalga 10.
6. **P20g Kamera kurulum sihirbazı (K-59)** — donanım otomatik okunur (CPU, RAM, OS) → `camera.profile`; yerel ağ keşfi
   (ONVIF WS-Discovery + Hikvision SADP; `otel-kamera/discovery.py` + `src/main/camera/discovery.ts`); IP / kullanıcı /
   şifre formu; Hikvision RTSP kalıbı önerisi (kullanıcı, şifre, IP, 554, `/Streaming/Channels/<kanal>01`); bağlantı
   ve görüntü testi; kanal sayısı; şifre `safeStorage`; `features/setup/camera-step.tsx` + Ayarlar → Kamera "yeniden tara".
   Dalga 10 (P20e ile).
7. **P20f Paketleme** — gömülü Python + bağımlılıklar (torch CPU + ultralytics + insightface + onnxruntime) + model
   dosyaları `resources/camera/` (`extraResources`), Windows x64 ve macOS arm64/x64; boyut ve açılış süresi ölçümü;
   gerekirse ayrı "kamera eki" kurulum dosyası; kurulum belgesine "Kamera" bölümü; `THIRD_PARTY_NOTICES`. Dalga 11.

## Kabul ölçütleri
- [x] Bismuth kapanınca yan süreç ölür; 3 çökme → bildirim; sahte sidecar ile (P20a) — `src/main/camera/camera.test.ts`
      (gerçek alt süreç: "durdurulunca süreç ölür", "ebeveyn borusu kapanınca çıkar", "3. çökmede bildirim, 5.'de vazgeçme");
      Python tarafı `tests/test_grabber_health_parent.py::test_stdin_kapanınca_yan_süreç_gerçekten_çıkar`. Playwright e2e değil,
      vitest bütünleşme testi (Electron penceresi gerekmez).
- [x] Yan süreç `0.0.0.0`'a bağlanamaz; belirteçsiz istek 401; Origin dışı POST 403 (Python testi) —
      `tests/test_config_and_bridge.py` (`WEB_HOST=0.0.0.0` → `ConfigError`, 401, 403 Origin, 403 Host).
- [ ] Kamera sekmesi 1366×768 ve 390×844 açık/koyu görüntüleri `ui-reviewer` + `turkish-ui-copy` temiz.
- [x] Çıkışta `guest_faces` silinir + audit; yedek/dışa aktarma/kopyada yüz verisi yok (birim test + `privacy-auditor`); aydınlatma
      metni sihirbazda ve Kamera sekmesinde üç dilde yazdırılabilir.
      _Kapandı (dalga 10): aydınlatma metni Kamera ekranında ve sihirbazın Kamera adımında (`PrivacyNoticeButton`), privacy-auditor dalga 9–10 temiz (Yüksekler düzeltildi)._
      _P20c kısmı:_ çıkışta fiziksel silme + audit, bayt audit'te yok
      (`tests/unit/camera-data.test.ts`: "çıkış yapınca yüz satırı fiziksel silinir…"), yedek/dışa aktarma/kopya dışı
      (`migrations-0021.test.ts`, `backup-biometric.test.ts`, adım 1).
- [x] Alarm → bildirim merkezi ve telefon listesi; `camera.telegram.enabled` açıkken Telegram'a da gider, ağ yokken program
      bildirimi yine düşer (sahte sunucu testi, 5 sn zaman aşımı); "misafir olarak kaydet" mevcut kişi akışını açar (e2e).
      Telegram istemcisi, 5 sn zaman aşımı, `network.enabled=false` → 0 istek: `src/main/network/telegram/telegram.test.ts`;
      alarm → `camera_events` + `notifications`, mesajda misafir adı yok, ağ kapalıyken de düşer:
      `tests/unit/camera-data.test.ts` ("Telegram açıkken fotoğraflı mesaj gider…", "ağ kapalıyken Telegram isteği çıkmaz…");
      telefon yalnız kimlik/zaman/durum: `camera-data.test.ts` + `tests/e2e/mobile/camera.spec.ts`; "misafir olarak kaydet"
      (otelde kalan mevcut misafire yüz bağlama): `tests/e2e/electron/camera.spec.ts` ("Kişiler kartı: …").
- [ ] Ultralytics telemetrisi kapalı (`settings.sync=False` testi); ağ kapalıyken yan süreç açılır ve tanır; model dosyaları
      paket içinde; `THIRD_PARTY_NOTICES` K-57 lisans notunu içerir.
      _P20d kısmı hazır (kutu P20f'de kapanır; model dosyalarını paketleme getirir):_ `settings.sync=False` + çevrimdışı ortam
      (`otel-kamera/tests/test_models_offline.py::test_yolo_yerel_yoldan_yüklenir_ve_telemetri_önce_kapatılır`), ağ yamalı
      ortamda açılış-tanıma-alarm (`…test_ağ_kapalıyken_hizmet_gerçek_yükleyicilerle_açılır…`), dosya yoksa açık hata (indirme yok),
      `THIRD_PARTY_NOTICES` K-57 (`tests/unit/camera-notices.test.ts`).
- [x] Kamera sihirbazı: sahte ONVIF/SADP yanıtıyla keşif listesi; RTSP kalıbı önerisi; görüntü testi başarısız/başarılı
      durumları; donanım profili otomatik (e2e) — `tests/e2e/electron/camera-wizard.spec.ts` (keşif listesi, yanlış/doğru şifre,
      önizleme, kayıt, kurulum bitince kamera açılır); ayrıştırıcılar `src/main/camera/discovery.test.ts` (ONVIF ProbeMatch + SADP
      örnek yanıtları), profil `src/shared/domain/camera-profile.test.ts`, Python `otel-kamera/tests/test_probe_camera.py`.
- [ ] i5-8 GB sınıfında ≥ 4 analiz/sn (gerçek makine: sahip onay paketi); CPU/RSS ölçümü raporda.
- [ ] `security-reviewer` (CSP, köprü, belirteç, Telegram istemcisi) ve `privacy-auditor` Kritik/Yüksek yok; `decision-auditor`
      K-49…K-53, K-57…K-59 uyumu.

## Teknik notlar
Mimari A' (06 §2–3). `no-network-guard` kancası `src/main/camera/` için yalnız `127.0.0.1` ve `rtsp://` desenlerine izin
verecek şekilde güncellenir (P20a içinde, test ile). Python yan süreç bağımlılıkları Codespace'te venv ile; model
dosyaları `resources/camera/models/` (lisans dosyalarıyla).

## Yapılmayacaklar
WhatsApp/e-posta bildirimi (yalnız Telegram, K-50); bulut yüz tanıma API'si; kamera kaydı (NVR); personel mesai takibi
(KVKK 2026/921); model değişimi (K-57; satış gündeme gelirse ayrı faz).

## Sonuç

### P20a — Yan süreç iskeleti ve Python hijyeni (2026-11-13)

**Yapılanlar**
- `src/main/camera/`: `sidecar.ts` (başlat/durdur/izle: rastgele 32 bayt belirteç + boş port ortamla, ayarlar JSON, stdin borusu,
  çökmede artan beklemeyle yeniden başlatma, 3 çökme → bildirim, 5 çökme → vazgeç + bildirim, sağlık yoklaması, SIGTERM + 5 sn + SIGKILL),
  `bridge.ts` (yalnız `127.0.0.1`, `X-Bismuth-Token`, `/api/` yolu zorunlu, canlı yayın için imzalı kısa ömürlü adres),
  `secrets.ts` (kamera adresi + Telegram belirteci `safeStorage` ile mühürlü; ayar değil), `config.ts`, `redact.ts`.
- `camera` yetki alanı (`camera` view/edit, `camera.enroll`), 16 `camera.*` ayarı (`settings.ts`; migrasyon gerekmedi: ayarlar
  anahtar-değer tablosu), `camera.status/restart/setSecrets/testTelegram` yordamları, `camera-service.ts` (yetki + audit; sır
  değeri hiçbir yerde dönmez/yazılmaz; sır ve yeniden başlatma yalnız otelin kendi penceresinden), crash bildirimi
  (`notifications` satırı + OS bildirimi), ana süreç bağlantısı (`index.ts`: `camera.enabled` ile başlar, çıkışta durur).
- Telegram Python'dan çıktı, `src/main/network/telegram/`: yalnız `api.telegram.org`, 5 sn, sessiz başarısızlık, kuyruk yok,
  `network.enabled` + `camera.telegram.enabled` kapalıyken 0 istek, fotoğraf eki `camera.telegram.photo`, belirteç/sohbet biçimi
  doğrulanır (URL'ye sızamaz), belirteç hiçbir yanıtta/günlükte yok.
- `no-network-guard` kancası `src/main/camera/` için güncellendi (yalnız `127.0.0.1`/`localhost`/`rtsp://`; dış URL, LAN `http`,
  `0.0.0.0`, WebSocket yasak) + 9 kanca testi (106 senaryo geçer); ESLint `src/main/camera/**` ağ kuralından muaf, `otel-kamera/**` lint dışı.
- Python (`otel-kamera/`): kod bulguları 1, 3, 4, 7–19, 21, 22, 25–28 (tablo ve test adları `AI_GELISTIRICI_NOTLARI.md` §6),
  `requirements.txt` `==`, `requirements-dev.txt`, `pyproject.toml` (pytest + ruff), yerel yol temizliği (`../deneme`), ayarlar
  JSON/ortamdan (`.env` ve `python-dotenv` yok), `bridge_security.py`, `health.py`, `parent_watch.py`, `camera_grabber.py` gözcüsü,
  `alert_recorder.py` (ham kare), 56 pytest testi, `ruff check` temiz. `AI_GELISTIRICI_NOTLARI.md` kodla eşitlendi (Ç-08);
  `docs/plan/bagimliliklar.md`'ye kamera bölümü.

**Karşılanan:** K-49, K-50 (istemci tarafı), K-51/K-53'ün P20a payı (sırlar şifreli; Python'a Telegram/DB sırrı gitmez), G-23, G-09, G-01.

**Varsayılanlar (otonom varsayılan)**
- `camera.enroll` varsayılanı: Sahip, Müdür, Resepsiyon = düzenler; `camera` varsayılanı: Sahip, Müdür = düzenler, Resepsiyon = görür.
- Sır deposu `camera-secrets.json` (userData kökü, yedek/dışa aktarma dışı); anahtar deposu yoksa düz metin + 0600 (`network/state.ts` ile aynı).
- Yan sürecin yerel dosyaları (`hotel_guests.db`, `alerts/`, `guest_photos/`) `userData/camera/` altında (yedeğe girmez) — P20c'ye kadar.
- Çökme eşikleri: 10 dk pencerede 3 → bildirim, 5 → vazgeç (faz belgesindeki "5 çökme/10 dk" ve paket kartındaki "3 çökme" birleştirildi).
- Kameradan tanıma artık çıkış yapmaz, aday döner (onay adımı; kod bulgusu 18); eski `checkout-from-camera` ve tarayıcı paneli yolları kaldırıldı.
- Eski `static/index.html` ve `Baslat_*`/`Otel_*` betikleri duruyor (belirteç zorunluluğuyla tek başına çalışmaz): P20b/P20f'de silinir.

**Ölçümler (Codespace, modelsiz iskelet; gerçek model ölçümü sahip onay paketinde):** gerçek `web_app.py` süreci boşta RSS ≈ 134 MB
(fastapi + opencv + numpy + supervision), yalnız `127.0.0.1:<port>` dinler (`ss`), belirteçsiz istek 401, yabancı Origin 403, stdin
boruyu kapatınca süreç kendiliğinden çıkar; sentetik 1080p karede sahte modellerle `_tick` (kare okuma, çizim, JPEG, izleme, her 3. karede
analiz) ≈ 10,8 ms/kare, tepe RSS 149 MB. Modeller (YOLO11n + buffalo_s) bu ölçüme dahil değildir (`torch` kurulmadı).

**Kalanlar:** gerçek modellerle (ultralytics, insightface) uçtan uca doğrulama P20d/P20f ve sahip onay paketi (Codespace'te `torch` kurulmadı);
Kamera sekmesi, CSP `img-src` istisnası (P20b); `guest_faces`/`camera_events`, alarm → `notifications` + Telegram bağlantısı (P20c);
`Ayarlar → Kamera` ekranı olmadığı için `camera.*` ayarları şimdilik yalnız servis/yordam ile yazılır.

### P20b — Kamera sekmesi (2026-11-13)

**Yapılanlar**
- `features/camera/`: Kamera ekranı (durum kartı: çalışıyor / başlıyor / hata / kapalı + yeniden başlat ve alarmları duraklat, yetkiye göre),
  canlı yayın (MJPEG `<img>`, yalnız ana bilgisayarın kendi penceresi; üst şerit ve yüz kutuları/Kiril etiketler renderer'da SVG ile),
  alarm listesi ("Notification Panel" kalıbı: güne göre gruplu, süzgeçli, yeni → görüldü → halledildi; CSS geçişi, framer-motion yok),
  boş/yükleniyor/hata/yetkisiz durumları; telefonda ve HTTP istemcisinde yalnız durum + alarm listesi (S-108).
- Menü girişi `/camera` (yetki `camera` view, telefonda "Daha fazla"), rota, kılavuz eşlemesi; `Ayarlar → Kamera`
  (`camera.*` ayarları, kamera adresi ve Telegram sırları yalnız yazılır, "Telegram'ı dene", tanıma eşikleri "Tanıma ayarları" altında).
- Yeni yordamlar `camera.streamUrl`, `camera.live`, `camera.alerts`, `camera.markAlert`, `camera.setAlarmsPaused` (servis: yetki + audit;
  canlı adres/şerit ve duraklatma yalnız IPC = otelin kendi penceresi). Alarm işaretleri `camera-alert-state.json` (userData; alarm anahtarı +
  durum, kişisel veri yok, yedek dışı) — P20c `camera_events` tablosuna taşır.
- CSP: `index.html` `img-src … http://127.0.0.1:*`; asıl kapı `security/policy.ts` istek süzgeci: yalnız çalışan yan sürecin **tam portundaki**
  `/api/stream?…` yüklenir (`isCameraStream`; başka yol, başka port, `localhost` engelli — birim ve e2e testli). Sunucu modunun CSP başlığı değişmedi.
- 3 dil: `camera.*`, `settings.camera.*`, `nav.camera`, `settings.tab.camera`, `audit.entity.camera_alert` (129 anahtar).

**Karşılanan:** K-49 (yalnız 127.0.0.1), K-51/K-53 (alarm metni, resim yolu ve adres dışarı çıkmaz; sır geri dönmez), G-23, G-09, G-08; S-108.

**Varsayılanlar (otonom varsayılan)**
- Alarm işaretlemek `camera` **view** yeterli (resepsiyon günlük işi); yeniden başlat, duraklat, sır ve Telegram denemesi **edit** + yalnız IPC.
- Menüde Kamera girişi yetkiye göre görünür (ayarla gizlenmez); kapalıyken ekran "Kapalı" + nereden açılacağını söyler. "Sekme görünürlüğü" ayarı ayrı paket.
- Yüz kutuları için yan sürecin `GET /api/overlay` ({frame:{width,height}, boxes:[{x,y,w,h,label,kind}]}) vermesi beklenir; yoksa (404) kutu listesi boş.
  Şerit yazısı mevcut `/api/status`'tan gelir. **P20d'ye not:** OpenCV etiket çizimi kaldırılırken bu uç nokta eklenmeli.
- `Ayarlar → Kamera` Resepsiyon'a salt görüntüleme olarak açılır (menüdeki `camera` view hakkı).
- Alarm metni ("Tanımsız Kişi (Takip #n)") ve resim yolları arayüze verilmez; başlık yerelleştirilmiş sabit metindir.

**Testler:** vitest — `camera-screen-service.test.ts` (canlı adres, şerit, kutu, alarm işareti, duraklat), `camera-page.test.tsx`, `camera-section.test.tsx`,
`camera-state.test.ts`, `app-url.test.ts` (istek süzgeci), `permissions-camera`/`permission-matrix`/`permissions-summary` genişletildi.
E2E (sahte yan süreç `tests/fixtures/fake-sidecar.mjs`): `tests/e2e/electron/camera.spec.ts` (durum, canlı görüntü, süzgeç, işaretler, yeniden başlat),
`tests/e2e/mobile/camera.spec.ts` (telefon: canlı yok, servis 403).

**Kalanlar:** `ui-reviewer` + `turkish-ui-copy` (kabul kutusu açık); alarmların Bismuth tablosuna ve bildirim merkezine taşınması (P20c);
kılavuza Kamera bölümü; aydınlatma metni (P20e).

### P20d — Model sabitleme ve çevrimdışı (2026-11-13)

**Yapılanlar**
- `otel-kamera/model_loader.py`: modeller YALNIZ yerel dosyadan (`MODELS_DIR`, Bismuth `resources/camera/models` yolunu verir);
  dosya yoksa `ModelMissingError` (indirme yok). `ultralytics` içe aktarılmadan önce `YOLO_OFFLINE=1` (içe aktarmadaki DNS
  yoklaması da kapanır; ultralytics 8.4.212 kaynağından doğrulandı), `YOLO_AUTOINSTALL=false`, `HF_HUB_OFFLINE=1`; ardından
  `settings.update({"sync": False})`. InsightFace `root/models/buffalo_s/` yerelden, yalnız `detection`+`recognition` modülleriyle
  (yaş/cinsiyet/nirengi yüklenmez). İsteğe bağlı `SHA256SUMS` doğrulaması.
- `resources/camera/models/README.md` (dosya, kaynak, lisans, yerleşim; sha256 bilerek boş: dosyalar indirilmediği için hesaplanamaz,
  P20f paketlerken `SHA256SUMS` üretir) + `.gitignore` (yalnız README ve SHA256SUMS izlenir; `camera-data-guard` ile uyumlu).
- `THIRD_PARTY_NOTICES.md` "Camera module" bölümü (K-57 uyarısı, model dosyaları, `requirements.txt`'ten üretilen paket tablosu);
  `scripts/notices.mjs` bölümü üretir ve notu olmayan yeni Python paketinde durur.
- Kod bulguları: 2 (`bytetrack_lite.py`, IoU iki aşamalı), 5 (kişi yokken bölge süzmeli yüz arama), 6 (tek eşik + "emin değil" bandı),
  20 (OpenCV yazı/kutu çizimi kaldırıldı; `GET /api/overlay`), 23 + 24 (yayın yalnız yeni karede, izleyici isteyince, küçültülmüş;
  aynı kare iki kez analiz edilmez). Tablo ve test adları `otel-kamera/AI_GELISTIRICI_NOTLARI.md` §6.
- Ayarlar: `camera.uncertainMargin` (0,06), `camera.idleFaceScanEvery` (3), `camera.streamMaxWidth` (960) eklendi
  (`src/shared/contract/settings.ts`, `src/main/camera/config.ts`); `MODELS_DIR` ana süreçten verilir (`src/main/index.ts`).
  **Ayarlar ekranında alan yok** (P20b/ayar ekranı paketinin işi; ayar varsayılanlarla çalışır).
- Alternatif model geçiş planı (YuNet + SFace) yalnız belge: `docs/analiz/06-kamera-entegrasyonu.md` §6.2.1.

**Karşılanan:** K-57, G-01, G-07, G-09, yasak 14.

**Varsayılanlar (otonom varsayılan)**
- Eşik varsayılanı 0,36 KORUNDU (saha FAR/FRR ölçümü yok; kod bulgusu 6'nın "0,4–0,5" önerisi tahmindir). Alarm tekilleştirmesi artık
  0,46 yerine aynı tek eşiği kullanır (aynı kişi = sistemin kendi tanımı); sahip onay paketinde sahada doğrulanmalı.
- "Emin değil" bandı varsayılan 0,06: eşiğin altındaki bu aralıktaki yüz alarm üretmez (yalnız "belirsiz" görünür). Güvenlik/yanlış
  alarm dengesi sahibin kararıdır; `camera.uncertainMargin = 0` bandı kapatır.
- `supervision` 0.31.7'de `ByteTrack` yok (ayrı pakete taşınmış); ek bağımlılık eklenmeden numpy ile iki aşamalı IoU izleyici yazıldı.
- Etiket/kutu verisi ad ve oda içerir ve yalnız loopback + belirteçli `/api/overlay`'den Bismuth'a gider; Telegram'a hiçbir yolla gitmez.

**Sahip onay paketine:** gerçek model dosyalarıyla (`yolo11n.pt`, `buffalo_s`) ölçüm ve sha256 (P20f); sahada eşik/marj kalibrasyonu;
InsightFace izin e-postası (`06` §6.4); gerçek kamerada ≥ 4 analiz/sn ve kişi-yokken-yüz taraması CPU maliyeti. Gerçek `ultralytics` ve
`insightface` Codespace'te kurulmadı (torch ~1 GB); testler aynı çağrı biçimini taklit eden sahte modüllerle çalışır.

### P20c — Veri entegrasyonu (2026-11-13; adım 1: migrasyon 0021 + şifreleme, adım 2: bu bölüm)

**Yapılanlar**
- **Kameradan yüz al** (Kişiler → misafir kartı → Bilgiler): `camera.enroll` yetkisi (görme/düzenleme), yalnız otelin ana bilgisayar
  penceresi; yüz vektörü + kırpma yan süreçten anlık alınır, AES-GCM ile `guest_faces`'e yazılır (`enrolled_at/by`, rıza alanı yok,
  K-58); kartta "yüz kaydı var/yok", resim, silme (onaylı). Misafir başına en çok 5 yüz; yalnız otelde kalan misafir için; anahtar deposu
  yoksa hiç alınmaz (düz yüz asla yazılmaz). Yordamlar: `camera.faceStatus/enrollFace/deleteFaces/candidates/alertCrop/saveAlertAsGuest`.
- **Eşitleme** (`src/main/services/camera-sync.ts`): Bismuth 3 sn'de bir yan süreçten alarmları çeker ve içerideki misafirlerin yüz
  listesini (ad/oda/vektör, tüm liste) verir; liste yalnız değişince ya da yan süreç yeniden başlayınca (`boot`) gönderilir. Check-in/out,
  yüz ekleme/silme, oda değişikliği listeyi kendiliğinden değiştirir (liste "otelde kalan misafirin yüzü"nden türetilir).
- **Yan süreç diske yazmaz** (K-51, K-53): `database.py` (SQLite), `/alerts` ve `/guest_photos` statik yolları, `/api/guests*`,
  fotoğraf yazımı ve bakım işi kalktı; yüzler bellekte (`face_store.FaceStore`), alarmlar bellek kuyruğunda
  (`AlertQueue`, `boot` + numara); yeni uçlar `PUT /api/faces/active`, `POST /api/faces/capture|extract`, `GET /api/alerts?after&boot`.
  `tests/test_no_disk.py` (kaynakta sqlite/imwrite/yazma yok; çalışırken yazma girişimi testi düşürür).
- **Alarm → Bismuth:** alarmlar `camera_events`'e (`source_ref` = `boot:no`, tekil), kırpma şifreli, `expires_at` =
  alarm + `camera.alertRetentionDays`; her biri `notifications` satırı (`camera_alert`), pencere bildirimi ve (açıksa) Telegram
  (fotoğraf ayara göre, mesajda ad yok, K-50). P20b'nin `camera-alert-state.json` dosyası kalktı; işaretler `camera_events.state`
  (+ `seen_by/at`, `handled_by/at`). Eski sürümlerin düz dosyaları (`hotel_guests.db`, `alerts/`, `guest_photos/`,
  `camera-alert-state.json`) açılışta silinir (`src/main/camera/legacy.ts`).
- **Silme (K-52):** çıkışta aynı işlemde (`checkOutIn` → `releaseFaces`): `camera.faceRetentionDays` = 0 → fiziksel silme + audit
  (`guest_face` / `delete` / `checkout`); > 0 → `expires_at` konur. Saklama işi (açılışta + saatlik; `purgeExpired`): süresi gelen
  yüzler, çıkışı görülmeden ayrılan misafirlerin yüzleri, `alertRetentionDays` geçen alarm kırpmaları (olay satırı kalır); sayılar audit'te.
  Şifreli bayt audit'e hiç yazılmaz (testli).
- **Kamera ekranı** alarm listesi `camera_events`'ten okunur; telefon yalnız kimlik/zaman/durum (`hasCrop` telefonda hep false);
  "Misafir olarak kaydet" (yalnız ana bilgisayar penceresi, `camera.enroll`): alarm kırpması açılır, otelde kalan misafir seçilir,
  yan sürece vektör çıkarttırılıp misafire yüz olarak bağlanır; alarm "halledildi" olur.

**Karşılanan:** K-50, K-51, K-52, K-53, K-58 (rıza alanı yok), G-23, G-60.

**Varsayılanlar (otonom varsayılan)**
- Yüz yalnız **otelde kalan** misafir için alınır; kimliği olmayan/ayrılmış misafire yüz bağlanmaz.
- Telegram fotoğrafı alarm **yüz kırpması**dır (sahne karesi değil): Bismuth yalnız kırpmayı saklar, gönderdiği de odur.
- Alarm kırpması için anahtar deposu yoksa olay yine yazılır, kırpma tutulmaz (düz kırpma asla yazılmaz).
- "Misafir olarak kaydet" alarmı `handled` yapar ve olaya `guest_id` yazar.
- `camera.faceRetentionDays` > 0: çıkıştan sonra yüz pasif (yan sürece verilmez), süre sonunda silinir.
- Test/e2e için `BISMUTH_FACE_KEY=memory` (yalnız paketsiz derlemede): anahtar deposu olmayan makinede bellek anahtarı; paketli sürüm yok sayar.
- Yeni yetki alanı yok (`camera.enroll` P20a'da vardı); alarm kırpmasını görmek ve aday listesi de `camera.enroll` ister.

**Ölçümler (Codespace, gerçek model yok):** 200 yüz + 200 alarm kırpması bellekte: RSS 43 → 66 MB; kırpma + kuyruğa alma ≈ 0,6 ms/alarm
(1080p kareden). Analiz döngüsünün CPU/RSS değerleri P20a/P20d ölçümlerinden değişmedi (bu pakette döngüye yalnız veritabanı kalktı).

**Sahip onay paketine:** gerçek kamerada "Kameradan yüz al" → tanınma → çıkışta silinme; Windows/macOS anahtar deposu ile yüz
kaydı (Codespace'te anahtar deposu yok: e2e bellek anahtarıyla koştu); alarm → Telegram'a uçtan uca (gerçek bot).

**Kalanlar:** `privacy-auditor` ve `db-reviewer` turu; `otel-kamera/static/index.html` (eski panel, ölü) P20f'de
silinir; bildirim merkezi ekranı yok (satırlar yazılır, pencere bildirimi çıkar).

### P20e — KVKK paketi (2026-11-13)

**Yapılanlar**
- **Aydınlatma metni (K-58):** `features/camera/privacy-notice.tsx` — `PrivacyNotice` (metin), `PrivacyNoticeDialog` (görüntüle + dil seç + yazdır),
  `PrivacyNoticeButton` (giriş düğmesi); KVKK m.10 unsurları (veri sorumlusu, işlenen veri, amaç, hukuki sebep, aktarım, saklama, çalışanlar,
  m.11 hakları) + tabela satırı; tr/en/ru; tek A4 yazdırma. Otel adı/şehir/e-posta, saklama günleri ve Telegram durumu ayarlardan türetilir
  (Telegram açık ve ağ açıksa yurt dışı aktarım notu; fotoğraf ayarına göre). Kamera ekranında sayfa başlığında "Aydınlatma metni".
  Yeni ayar `camera.privacyContact` (başvuru adresi/telefon; boşsa e-posta, o da yoksa elle doldurulacak çizgi); değişince yan süreç yeniden başlamaz.
- **Ayarlar → Kamera → "Gizlilik ve saklama"** (`privacy-settings.tsx`, `camera-section.tsx`'e tek satır): başvuru adresi, aydınlatma metni, personel
  listesi, imha raporu. Saklama süresi alanları (`faceRetentionDays`, `alertRetentionDays`) mevcut "Alarm ve saklama" kartında.
- **İmha raporu** (`camera.retentionReport`, `camera` view): tarih aralığında `audit_log` silme kayıtlarından sayılar (çıkışta / süre sonunda / elle silinen
  misafir yüzü; listeden çıkarılan / ayrılan personel yüzü; süresi dolan alarm görüntüsü) + elde kalanlar + geçerli kurallar; ad ve görüntü yok; yazdırılabilir.
- **Personel dışlama listesi (S-107):** yeni tablo `staff_faces` (migrasyon 0022; mühürlü vektör, kırpma yok), yordamlar `camera.staff` /
  `camera.enrollStaff` / `camera.removeStaff` (`camera.enroll`); personel Personel kaydından seçilir (tek giriş), yüz kameradan alınır; yan sürece
  ad ve odası boş "bilinen" yüz olarak gider (alarm üretmez, canlı görüntüde "Personel"); listeden çıkarınca ya da işten ayrılınca (saklama işi) fiziksel
  silme + audit (`staff-removed` / `staff-left`). Biyometrik tablo listelerine (`BIOMETRIC_TABLES`, `LOCAL_ONLY_TABLES`) eklendi: yedek/dışa aktarma/kopya dışı.
- **P21e Orta (saklama):** `purgeExpired` içerideki misafirin yüzüne dokunmaz ve önceki konaklamadan kalan `expires_at`'ı temizler
  (`camera-data.test.ts`: "geri dönen misafirin yüzü"). Python: `FaceStore.guest_count` adsız/odasız (personel) yüzleri saymaz.

**Karşılanan:** K-51, K-52, K-58, S-107, G-23, G-60.

**Varsayılanlar (otonom varsayılan)**
- Personel dışlama = personelin yüzü "alarm vermeyen bilinen yüz" olarak tutulur (tanınmadan alarm vermemek mümkün değil); ad/oda yan sürece gitmez, kırpma
  tutulmaz, mesai takibi yok; en çok 3 yüz/kişi; yalnız ana bilgisayar penceresinde alınır. Sahibin avukatı değerlendirmeli (Kurul 2026/921 notu `06` §6.1).
- Hukuki sebep metni: 6698 m.5/2-f (meşru menfaat); aydınlatma metni şablondur, iletişim ekranında "avukatınıza gösterin" uyarısı.
- Rıza alanı yok (K-58). `camera.view` imha raporunu görür (yalnız sayı); personel listesi `camera.enroll` ister.
- Çalışan "ayrıldı" = `employees.end_date` bugünden önce.

**Sahip onay paketine:** aydınlatma metninin avukat onayı; gerçek kamerada personel yüzünün tanınıp alarm vermemesi; A4 yazdırma görünümü.
**Kalanlar:** kurulum sihirbazına aydınlatma metni bağlama (ana oturum; `PrivacyNoticeButton facts={{…}}`); alarmdan "personel olarak kaydet" kısayolu yapılmadı.
### P20g — Kamera kurulum sihirbazı (2026-11-13; K-59)
- **Donanım:** `src/main/camera/hardware.ts` (`node:os`: işlemci modeli, iş parçacığı, bellek, işletim sistemi) → `camera.hardware`
  (+ ayardaki eşiklere göre önerilen profil). Profil ayarları: `camera.profile` (`light/standard/high`) ve `camera.profiles` (JSON:
  profili seçen bellek/iş parçacığı eşikleri + her profilin `processEveryN`, `streamMaxWidth`, `idleFaceScanEvery` değerleri);
  kurallar `src/shared/domain/camera-profile.ts` (saf, testli). Koda gömülü eşik yok; tablo ayardır (G-09).
- **Keşif (otonom varsayılan: Node tarafı yapar, `discovery.py` yazılmadı):** Python yan süreci kurulum sırasında henüz çalışmıyor ve
  paketli Python'a bağımlılık getirmemek için `src/main/camera/discovery.ts` (`node:dgram`; ESLint ve `no-network-guard` istisnası yalnız
  bu dosyaya) ONVIF WS-Discovery (239.255.255.250:3702) ve Hikvision SADP (37020) sorgusunu **yalnız istenince** gönderir, 5 sn dinler,
  kapatır. Sorgu yalnız bilgisayarın özel IPv4 arayüzlerinden çıkar; yalnız özel adresten gelen ve özel adres bildiren cevap sayılır
  (10/8, 172.16/12, 192.168/16, 169.254/16); XML motoru yok (etiket eşleme, varlık/dış başvuru çözülmez); paket ≤ 16 KB, ≤ 50 cihaz.
  `network.enabled`'dan bağımsız (yerel ağ). SADP yanıt biçimi bilinen alanlardan yazıldı, gerçek cihazla doğrulanmadı.
- **Deneme:** `otel-kamera/probe_camera.py` tek seferlik süreç (adres ortam değişkeniyle, komut satırında yok): yalnız özel/loopback IPv4
  kabul eder, RTSP DESCRIBE (Digest/Basic) ile *zaman aşımı / ulaşılamıyor / kimlik / yol* ayrımı yapar, OpenCV ile bir kare alır,
  ≤ 640 px JPEG döner. Node tarafı `src/main/camera/probe.ts` çıktıyı alan alan doğrular, 20 sn'de öldürür. Önizleme yanıtta `data:` adresi
  olarak gelir (CSP `img-src data:` zaten var; yeni loopback/CSP istisnası gerekmedi).
- **Sözleşme:** `camera.hardware`, `camera.discover`, `camera.probe` (+ `camera.status` ve `camera.setSecrets` kurulum penceresine de açıldı);
  erişim `['setup','user']`; servis: `camera` edit + yalnız ana pencere (`desktopOnly`); adres/şifre audit'e, günlüğe, ayara yazılmaz.
- **Arayüz:** `features/setup/camera-flow.tsx` (akış), `camera-step.tsx` (sihirbazın 12. adımı, isteğe bağlı, "Atla"), Ayarlar → Kamera →
  "Yeniden tara" (`settings/camera-rescan.tsx`, aynı akış diyalogda). Hikvision adresi `buildHikvisionRtsp` ile kurulur (kullanıcı/şifre
  yüzde kodlu); ekranda şifre maskeli. Profil "Profili uygula" ile ya da kamera kaydedilirken yazılır.
- **Kurulum sırasında sidecar başlamaz:** ayar değişikliği kurulum bitmeden yan süreci başlatmaz; kurulum bitince ilk kamera turu
  (3 sn) `camera.enabled` ise başlatır (`src/main/index.ts`, e2e'de doğrulandı).

**Karşılanan:** K-49, K-51 (şifre yalnız mühürlü depo), K-59, G-01, G-09, G-23.

**Varsayılanlar (otonom varsayılan)**
- Kanal sayısı yalnız kanal seçimini sınırlar; yan süreç tek kaynak okur, seçilen kanalın adresi kaydedilir (çok kameralı analiz bu paketin dışı).
- Wizard'da adres "Kamerayı kaydet" ile hemen mühürlenir (sihirbazın taslağına girmez); kaydetmeden "İleri" kamera eklemez, ekranda söylenir.
- Port alanı varsayılan 554; kullanıcı adı varsayılan `admin`; boş şifre kabul.
- Profil tablosundaki varsayılan değerler: hafif 5/640/6, standart 3/960/3, yüksek 2/1280/2; eşikler 6 GB / 4 iş parçacığı altı hafif, 16 GB ve 8 iş parçacığı ve üstü yüksek.

**Ölçümler:** keşif ve deneme birim/e2e testleri (sahte soket, sahte RTSP sunucusu, Node sahte süreç); Python `pytest` 122 test geçti
(`test_probe_camera.py` 21), `ruff check` temiz. Gerçek ağ/kamera ölçümü yok.

**Sahip onay paketine:** gerçek Hikvision kamerada ONVIF/SADP keşfi (SADP yanıt alanları), Digest kimlik doğrulaması, görüntü önizlemesi;
Windows güvenlik duvarı ilk UDP isteğinde soru sorabilir; kamera ekranı 1366×768 / 390×844 görüntüleri (`ui-reviewer`).

**Kalanlar:** gömülü Python'da `probe_camera.py` paketlenmesi (P20f: `extraResources` listesine `otel-kamera/*.py` zaten giriyorsa ek iş yok, kontrol edilmeli).
