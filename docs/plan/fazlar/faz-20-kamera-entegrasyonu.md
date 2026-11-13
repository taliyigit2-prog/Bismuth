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
- [ ] Çıkışta `guest_faces` silinir + audit; yedek/dışa aktarma/kopyada yüz verisi yok (birim test + `privacy-auditor`); aydınlatma
      metni sihirbazda ve Kamera sekmesinde üç dilde yazdırılabilir.
- [ ] Alarm → bildirim merkezi ve telefon listesi; `camera.telegram.enabled` açıkken Telegram'a da gider, ağ yokken program
      bildirimi yine düşer (sahte sunucu testi, 5 sn zaman aşımı); "misafir olarak kaydet" mevcut kişi akışını açar (e2e).
      _P20a kısmı hazır (kutu P20c'de kapanır):_ Telegram istemcisi, 5 sn zaman aşımı, `network.enabled=false` → 0 istek,
      sahte yerel sunucu testi (`src/main/network/telegram/telegram.test.ts`, `tests/unit/permissions-camera.test.ts`).
- [ ] Ultralytics telemetrisi kapalı (`settings.sync=False` testi); ağ kapalıyken yan süreç açılır ve tanır; model dosyaları
      paket içinde; `THIRD_PARTY_NOTICES` K-57 lisans notunu içerir.
- [ ] Kamera sihirbazı: sahte ONVIF/SADP yanıtıyla keşif listesi; RTSP kalıbı önerisi; görüntü testi başarısız/başarılı
      durumları; donanım profili otomatik (e2e).
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
