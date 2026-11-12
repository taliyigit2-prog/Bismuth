# Faz 20 — Kamera entegrasyonu (otel-kamera → Bismuth içinde sekme)

> Kaynak: `docs/analiz/06-kamera-entegrasyonu.md` (seçenekler, mimari A', veri sözleşmesi, hukuk/lisans, aşamalar),
> `.claude/rules/camera.md`; paket kartları `08-gelistirme-plani.md` §4. Dalgalar 7–9. **Ön koşul: sahip kararları
> S-107…S-112 (ya da varsayılanlar) ve K-49…K-53 taslaklarının kabulü.** Ürünleştirme öncesi KVKK avukat görüşü sahip
> onay paketindedir; geliştirme bunu beklemez.

## Amaç
Yüz tanıma kamera sistemi Bismuth'un içinde bir sekme olarak çalışır; misafir verisi tek kaynaktan (Bismuth) akar;
biyometrik veri şifreli, süreli ve yedek dışıdır; dış servis yoktur; modeller açık lisanslıdır; kurulum sahibe görünmez.

## Gereksinimler
Ö-20 (kamera entegrasyonu; sahip kabulüyle G-197 olur), G-01/G-02 (çevrimdışı), G-07 (dış servis yok), G-23 (yetki),
G-60 (tek giriş), K-25 (ekler), K-49…K-53 (taslak).

## Sorular
S-107 (personel), S-108 (telefon görünümü), S-109 (Telegram), S-110 (modeller), S-111 (rıza), S-112 (donanım).

## Teslimatlar
1. **P20a Yan süreç iskeleti + Python hijyeni** — `src/main/camera/sidecar.ts`, `bridge.ts` (belirteç, `127.0.0.1`,
   sağlık, 5 çökme/10 dk → durdur + bildirim), `camera` yetki alanı, `camera.*` ayarları; Python: `requirements.txt` `==`,
   analiz döngüsünde try/except + sağlık, Telegram kodu kaldırılır, belirteç/Origin denetimi, `pytest` + `ruff`.
2. **P20b Kamera sekmesi** — `features/camera/`: canlı yayın (MJPEG `<img>`), durum kartı, alarm listesi, "alarmları
   duraklat"; CSP istisnası yalnız `127.0.0.1:<port>`; menü + yetki; telefon/Mac yalnız alarm listesi (S-108 varsayılanı).
3. **P20c Veri entegrasyonu** — migrasyon 0021 (`guest_faces`: occupant_id, embedding_enc, crop_path, model, consent_at,
   deleted_at; `camera_events`: kind, at, camera, score, crop_enc, occupant_id, notification_id); `crypto.ts` AES-GCM;
   "Kameradan yüz al" (Kişiler sekmesi, rıza kutusu zorunlu); check-in/out → aktif liste; alarm → `notifications`;
   "misafir olarak kaydet"; dışa aktarma/yedek/kopya dışı; silme + audit.
4. **P20d Model değişimi** — YuNet (tespit) + SFace ya da AuraFace (tanıma) + ByteTrack, hepsi ONNX; torch/ultralytics/
   insightface kaldırılır; eşik ölçüm betiği (sentetik set, FAR/FRR); CPU/RSS ölçümü raporda.
5. **P20e KVKK paketi** — rıza kaydı ve geri alma; aydınlatma metni şablonu (3 dil, yazdırılabilir); saklama/imha
   ayarları ve imha raporu (`camera.faceRetentionDays`, `camera.alertRetentionDays`); personel dışlama listesi;
   `privacy-auditor` temiz.
6. **P20f Paketleme** — gömülü Python + bağımlılıklar + model dosyaları `resources/camera/` (`extraResources`), Windows
   x64 ve macOS arm64/x64; boyut ve açılış süresi ölçümü; kurulum belgesine "Kamera" bölümü; `THIRD_PARTY_NOTICES`.

## Kabul ölçütleri
- [ ] Bismuth kapanınca yan süreç ölür; 3 çökme → bildirim; e2e sahte sidecar ile (P20a).
- [ ] Yan süreç `0.0.0.0`'a bağlanamaz; belirteçsiz istek 401; Origin dışı POST 403 (Python testi).
- [ ] Kamera sekmesi 1366×768 ve 390×844 açık/koyu görüntüleri `ui-reviewer` + `turkish-ui-copy` temiz.
- [ ] Yüz kaydı rıza olmadan reddedilir; çıkışta `guest_faces` silinir + audit; yedek/dışa aktarma/kopyada yüz verisi yok (birim test + `privacy-auditor`).
- [ ] Alarm → bildirim merkezi ve telefon listesi; "misafir olarak kaydet" mevcut kişi akışını açar (e2e).
- [ ] Depoda AGPL/ticari-olmayan model yok (`THIRD_PARTY_NOTICES` + lisans tablosu); modeller paket içinde, ilk açılış çevrimdışı.
- [ ] Sentetik sette FAR ≤ %1 / FRR ≤ %10 (hedef; ölçüm raporda) ve i5-8 GB sınıfında ≥ 4 analiz/sn (gerçek makine: sahip onay paketi).
- [ ] `security-reviewer` (CSP, köprü, belirteç) ve `privacy-auditor` Kritik/Yüksek yok; `decision-auditor` K-49…K-53 uyumu.

## Teknik notlar
Mimari A' (06 §2–3). `no-network-guard` kancası `src/main/camera/` için yalnız `127.0.0.1` ve `rtsp://` desenlerine izin
verecek şekilde güncellenir (P20a içinde, test ile). Python yan süreç bağımlılıkları Codespace'te venv ile; model
dosyaları `resources/camera/models/` (lisans dosyalarıyla).

## Yapılmayacaklar
Telegram/WhatsApp/e-posta ile fotoğraf gönderme; bulut yüz tanıma API'si; kamera kaydı (NVR); personel mesai takibi
(KVKK 2026/921).

## Sonuç
