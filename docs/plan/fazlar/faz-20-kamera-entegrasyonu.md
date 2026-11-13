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
- [ ] Bismuth kapanınca yan süreç ölür; 3 çökme → bildirim; e2e sahte sidecar ile (P20a).
- [ ] Yan süreç `0.0.0.0`'a bağlanamaz; belirteçsiz istek 401; Origin dışı POST 403 (Python testi).
- [ ] Kamera sekmesi 1366×768 ve 390×844 açık/koyu görüntüleri `ui-reviewer` + `turkish-ui-copy` temiz.
- [ ] Çıkışta `guest_faces` silinir + audit; yedek/dışa aktarma/kopyada yüz verisi yok (birim test + `privacy-auditor`); aydınlatma
      metni sihirbazda ve Kamera sekmesinde üç dilde yazdırılabilir.
- [ ] Alarm → bildirim merkezi ve telefon listesi; `camera.telegram.enabled` açıkken Telegram'a da gider, ağ yokken program
      bildirimi yine düşer (sahte sunucu testi, 5 sn zaman aşımı); "misafir olarak kaydet" mevcut kişi akışını açar (e2e).
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
