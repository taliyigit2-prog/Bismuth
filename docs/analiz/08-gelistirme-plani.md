# 08 — Geliştirme planı (Faz 17–21, dalgalar ve paketler)

> Hazırlayan: Fable (2026-11-12). Uygulayan: Opus 5.5 (`/orkestra`). Faz dosyaları: `docs/plan/fazlar/faz-17…21-*.md`.
> Dalga tablosu ve ilerleme: `docs/plan/fazlar/YURUTME.md` (tek kaynak). Öncelik: 1) resepsiyonun dört maddesi ve
> kritik hatalar, 2) ekran/tam ekran ve çalışmayan öğeler, 3) kurulum ve dağıtım, 4) kamera, 5) diğer (çoklu otel vb.).
> Her paket: kimlik · amaç · dosya/ad alanları · bağımlılık · kabul ölçütleri · testler · ajan (model/çaba ajan
> dosyasında) · büyüklük (S ≈ ½ gün ajan işi, M ≈ 1–2, L ≈ 3+).

## 1. Faz 17 — Resepsiyon düzeltmeleri (G-193…G-196, K-48, K-55)

### P17a · Vazgeçme ve iade akışı (Kritik)
- **Amaç:** Madde 1 ve 3. Check-in sonrası vazgeçme, iptal/çıkışta ödeme uyarısı ve iade, kapalı rezervasyonda menü.
- **Dosyalar:** `src/main/services/reservations-service.ts` (yeni `undoCheckIn`, `endReservation` kapalı durumda iade
  yolu), `payments-service.ts` (iade bağlama), `src/shared/contract/procedures/booking.ts` (`booking.undoCheckIn`,
  `booking.cancel` girdi: `refund?`), `src/main/api/handlers/booking.ts`, `src/renderer/features/calendar/`
  (`reservation-panel.tsx`, `stay-dialogs.tsx`, `payment-dialog.tsx`, yeni `giveup-dialog.tsx`), i18n `booking.*`,
  `errors.*`; `docs/kullanim-kilavuzu.md` §3 iptal/iade; `src/renderer/guide/`.
- **Bağımlılık:** yok (ilk dalga). S-100 cevabı yoksa varsayılan (resepsiyon iade giremez, park eder).
- **Kabul:** (1) `in_house` rezervasyonda üç nokta menüsünde "Vazgeçme ve iade" var, üç seçenek sunar; (2) `checked_out`
  rezervasyonda üç nokta menüsü görünür ("İade gir", "Geçmiş", "Not"); (3) iptal penceresi tahsilat varsa tutarı
  gösterir ve "İade gir / İade bekliyor park / Tahsilat kalsın (neden)" sunar; (4) `undoCheckIn` yalnız giriş gününde,
  `calendar.edit` + yeni `booking.undoCheckIn` yetkisi (owner/manager E, reception ayar), audit `checkin.undo`; (5) iade
  satırı defter gününde ve kasa tesliminde görünür; (6) hiçbir kayıt silinmez; (7) raporlarda iade ayrı satır
  (yoksa eklenir).
- **Testler:** servis (in_house iptal reddi, undoCheckIn yetki/gün kuralı, iade > tahsilat reddi, park refund_pending),
  panel vitest (durum × menü matrisi: 7 durum), e2e masaüstü + telefon "girdi, vazgeçti, iade" (03 §2 A/B/C).
- **Ajan:** `calendar-specialist`. **Büyüklük:** M.

### P17b · Grup rezervasyonu ve toplu giriş (G-194)
- **Amaç:** Madde 2 (yorum a). Grup kimliği, oda başına misafir adı, toplu giriş/çıkış/not, takvimde grup deseni.
- **Dosyalar:** migrasyon 0019 (`reservations.group_id`, `reservation_groups` tablosu: id, name, leader_guest_id,
  folio_mode), `reservations-service.ts` (`createGroup`, `checkInMany`, `checkOutMany`), `procedures/booking.ts`,
  `handlers/booking.ts`, `features/calendar/` (`group-panel.tsx`, `new-reservation-dialog.tsx` grup seçeneği,
  `calendar-grid.tsx` desen), `services/calendar/grid.ts` (`groupId` alanı), i18n `booking.group.*`.
- **Bağımlılık:** P17a (panel değişiklikleri aynı dosya) birleştikten sonra; migrasyon numarası 0019 (`db-migration-builder`
  önce, aynı dalgada).
- **Kabul:** 3 odalı grup oluşturma; oda başına ad; grup panelinden toplu giriş tek transaction (biri başarısızsa
  hiçbiri); takvimde grup kenarlık deseni + lejant; tek folyo / oda başına folyo (S-106 ayarı); mevcut çok odalı
  rezervasyonlar grup olmadan çalışmaya devam eder.
- **Testler:** migrasyon testi; servis (toplu giriş atomik, yetki); grid testi; e2e toplu giriş (masaüstü + telefon liste).
- **Ajan:** `db-migration-builder` (0019) → `calendar-specialist`. **Büyüklük:** L.

### P17c · Hızlı takvim işlemleri (G-195)
- **Amaç:** Madde 2 (sadeleşme). Sağ tık/uzun basma menüsü, hızlı rezervasyon çubuğu, çoklu seçim, bugün şeridi, panel
  başlığında üç büyük düğme.
- **Dosyalar:** `features/calendar/` (`calendar-grid.tsx` onContextMenu, `quick-book-bar.tsx`, `context-menu.tsx`,
  `today-strip.tsx`, `calendar-page.tsx`), `components/ui/context-menu` (shadcn), `lib/shortcuts/registry.ts`,
  `layouts/mobile/mobile-calendar.tsx` (uzun basma), i18n `calendar.quick.*`.
- **Bağımlılık:** P17a (panel), P17b (grup seçim). Servis değişikliği yok (mevcut yordamlar).
- **Kabul:** boş hücre tık → çubuk (ad, kişi, gece, fiyat, kanal; Enter kaydeder; "Ayrıntı" diyaloğu açar); sağ tık
  menüsü 10 işlem; Ctrl/Shift seçimle toplu not/giriş/çıkış; bugün şeridi `today.summary` ile; klavyeyle erişilebilir;
  telefonda uzun basma.
- **Testler:** vitest (çubuk doğrulama, menü görünürlüğü yetkiye göre), e2e (sağ tık → giriş yap; hızlı rezervasyon).
- **Ajan:** `feature-builder`. **Büyüklük:** M.

### P17d · Gündüz kullanımı 2.0 ve ikinci tur hatası (G-196, K-48)
- **Amaç:** Madde 4. Saat aralıklı gündüz yuvası, çoklu gündüz satışı (ayar), temizlik arası uyarısı, gündüz fiyatı,
  rapor satırı; hata C düzeltmesi.
- **Dosyalar:** migrasyon 0020 (`room_nights.start_time/end_time`, indeks `(room_id,date,slot,start_time)`,
  `room_types.day_use_price_minor`), `src/shared/domain/stays.ts` (saat çakışması), `booking.ts` (`checkoutPlan`),
  `reservations-service.ts` (`checkOut` :1388-1421, `checkSlots`), `settings.ts` (`dayUse.*`), `features/calendar/`
  (yarım çubuk, saat alanı, çıkış penceresi), `features/settings/` (gündüz bölümü), `reports/queries.ts`
  (gündüz satırı), `tourism/ministry-table.ts` değişmez; i18n `booking.dayUse.*`, `settings.dayUse.*`.
- **Bağımlılık:** P17a birleşmiş olmalı (çıkış penceresi). Migrasyon 0020 (`db-migration-builder`).
- **Kabul:** betikteki C senaryosu: ikinci tur çıkışında oda o gece satılabilir; aynı gün iki gündüz (ayar 2) saat
  çakışmazsa olur, çakışırsa `roomOccupied` saatli mesaj; temizlik arası dolmadan satışta uyarı; gündüz fiyat kipi
  ayardan; raporda "Gündüz" satırı; doluluğa katılım ayarı; istatistik kuralı değişmedi; eski verilerde `start_time`
  null = tüm gün (geriye uyumlu).
- **Testler:** domain (saat çakışması 8 senaryo), servis (C, B, D betik senaryoları beklenen davranışa), migrasyon,
  grid, e2e "sabah gündüz, akşam gece, ertesi sabah gündüz".
- **Ajan:** `db-migration-builder` (0020) → `calendar-specialist`. **Büyüklük:** L.

### P17e · Kritik ve yüksek hata düzeltmeleri (02-hata-raporu)
- **Amaç:** `02-hata-raporu.md`'de Kritik/Yüksek işaretli ve P17a–d kapsamına girmeyen bulgular (akış testi ve kod
  incelemesinden; liste faz dosyasında).
- **Dosyalar:** bulguya göre (faz-17 dosyasında paket kartı doldurulur).
- **Bağımlılık:** yok; P17a ile aynı dosyaya dokunanlar P17a'dan sonra.
- **Kabul:** her bulgu için yeniden üretim testi kırmızıdan yeşile.
- **Ajan:** `feature-builder` (takvim dosyaları: `calendar-specialist`). **Büyüklük:** M.

## 2. Faz 18 — Ekran ve tam ekran uyumu (`05-ekran-ve-tam-ekran-uyumu.md`)

### P18a · Çoklu çözünürlük ekran görüntüsü betiği
- `scripts/ui-shot.mjs`: `--size WxH[,WxH…]`, `--scale`, `--langs`; ölçüm JSON (taşma/kesilme/44 px) çıktısı;
  `screen-auditor` bunu kullanır. **Ajan:** `feature-builder-lite`. **S**. Kabul: 7 boyut × 2 tema × 3 dil tek komutla; ölçüm dosyası.

### P18b · Düzen düzeltmeleri
- 05 raporundaki Kritik/Yüksek/Orta düzen bulguları (taşma, kesilen metin, küçük hedefler, diyalog yüksekliği) ekran
  ekran. Dosyalar: ilgili `features/*`, `styles/globals.css` (yalnız değişken/ölçek), `layouts/*`. **Ajan:**
  `feature-builder`. **M**. Kabul: `screen-auditor` tüm kombinasyonlarda 0 Kritik/Yüksek; e2e viewport testleri.

### P18c · Pencere ve tam ekran davranışı (Ö-23)
- F11 ve `Ctrl/Cmd+Shift+F` tam ekran; tam ekran/maximize durumunun hatırlanması; yakınlaştırma (`Ctrl +/-/0`)
  `ui.zoom` kişisel ayar olarak kalıcı; çoklu monitörde pencerenin kaldığı ekranda açılması; pencere durumunun
  boyut/taşıma sonrası (debounce) kaydı; `minWidth` 960 altı ekranlarda (1280 ölçek 1.5 = 853 px) düzen kırılımı.
  Dosyalar: `src/main/windows/main-window.ts`, `src/main/app/window-state.ts`, `src/main/app/menu.ts`,
  `lib/shortcuts/registry.ts`, `features/settings/appearance-section.tsx`. **Ajan:** `feature-builder` (+
  `security-reviewer` sonrası). **M**. Kabul: `screen-auditor` pencere bölümü yeşil; birim testler `window-state`.

### P18d · Çalışmayan öğeler
- Akış testi raporundaki "çalışmıyor / hiçbir şey yapmıyor / yanlış yere götürüyor" öğeleri (liste faz-18'de).
  **Ajan:** `feature-builder`. **M**. Kabul: `flow-tester` yeniden koşunca 0 Kritik/Yüksek.

## 3. Faz 19 — Kurulum ve dağıtım (`07-kurulum-ve-dagitim.md`)

### P19a · Sürüm iş akışı tekleştirme
- `release.yml` dispatch + tag; Linux verify (check + e2e) → Windows NSIS Linux'ta (deneme; olmazsa Windows runner
  yalnız tag'de) → macOS DMG tek iş → Releases; `ci.yml` package işi kaldırılır; Playwright/npm önbelleği;
  `faz0-*.yml` kaldırılır (P19c ile). **Ajan:** `packager`. **M**. Kabul: iş akışı dosyaları `actionlint`/YAML geçerli,
  `npm run package:win` Codespace'te denendi (sonuç raporda), tahmini dakika tablosu belgede; **tetikleme sahipte**.

### P19b · Kurulum belgeleri ve program içi kılavuz
- `docs/kurulum.md` sadeleştirme (xattr kaldır, doğrula işaretleri S-80'e bağlı), `kurulum-rehberi-basit.md`
  son hali, program içi kılavuza "Kurulum" bölümü (3 dil), kurulum sihirbazında tek "kâğıda yazın" adımı + yazdır
  (K-41). **Ajan:** `feature-builder-lite` (+ sihirbaz adımı `feature-builder`). **S/M**.

### P19c · Depo temizliği
- `git tag archive/faz0`; `prototypes/` ve `faz0-*.yml` silinir; kanca istisnaları ve testleri güncellenir;
  `resources/icon.png` + `make-icon.mjs:39`; `otel-kamera/README.md` ve notlardaki yerel yollar; kök README'ye analiz
  işaretçisi. **Ajan:** `feature-builder-lite`. **S**. Kabul: `npm run check` + kanca testleri yeşil; plan belgelerinde
  prototip yolları "arşiv etiketi" notuyla.

### P19d · Ajan sistemi bakımı (09 §6)
- `protect-files` kaçış değişkeni, `stop-gate` kapsamı, `deps-guard` yarn, `owner-review` kalıcı yol. **Ajan:**
  `feature-builder-lite`. **S**.

## 4. Faz 20 — Kamera entegrasyonu (`06-kamera-entegrasyonu.md` §8; K-49…K-53)

| Paket | 06 aşaması | İçerik | Ajan | Büyüklük | Bağımlılık |
|---|---|---|---|---|---|
| P20a | K1 + K2 | Python hijyen (requirements `==`, `.env.example` ✅, yerel yol temizliği, döngüde try/except, sağlık), `src/main/camera/sidecar.ts` + `bridge.ts` (belirteç, 127.0.0.1, yeniden başlatma), `camera` yetki alanı, ayar anahtarları `camera.*` | `camera-integrator` | M | S-107…S-112 cevapları ya da varsayılan |
| P20b | K3 | `features/camera/` Kamera sekmesi (canlı yayın MJPEG, durum, alarm listesi), CSP istisnası, telefon alarm listesi, menü + yetki | `camera-integrator` | M | P20a |
| P20c | K4 | migrasyon 0021 `guest_faces`, `camera_events`; şifreleme (`crypto.ts`); "Kameradan yüz al" (rıza); check-in/out eşitleme; alarm → bildirim; "misafir olarak kaydet"; dışa aktarma/yedek dışı | `db-migration-builder` → `camera-integrator` | L | P20b |
| P20d | K5 | Model değişimi: YuNet + SFace/AuraFace + ByteTrack (ONNX), torch/ultralytics/insightface kaldırılır, eşik ölçüm betiği, CPU ölçümü | `camera-integrator` | L | P20a (paralel P20c) |
| P20e | K6 | KVKK paketi: rıza kaydı, aydınlatma metni şablonu (3 dil), saklama/imha ayarları ve raporu, çalışan dışlama listesi; `privacy-auditor` | `camera-integrator` | M | P20c |
| P20f | K7 | Paketleme: gömülü Python + bağımlılıklar `resources/camera/`, model dosyaları, `extraResources`, boyut/açılış ölçümü, kurulum belgesi bölümü | `packager` | L | P20d, P20e |

Kabul ölçütleri aşama tablosunda (06 §8). Sahip onay paketi: gerçek kamera ve otel bilgisayarında deneme; avukat görüşü.

## 5. Faz 21 — Çoklu otel ve diğer iyileştirmeler

| Paket | İçerik | Ajan | Büyüklük | Bağımlılık |
|---|---|---|---|---|
| P21a | Profil altyapısı (K-54): `userData/hotels/<kod>/`, taşıma, otel seçici, "Oteller" ayarı, sahip hesabı kopyalama, yedek yolu | `feature-builder` | M | S-114…S-117 |
| P21b | İstemci çoklu ana bilgisayar: bağlan ekranı kayıt listesi, kopya klasörleri otel başına | `feature-builder` | M | P21a |
| P21c | Portföy özeti `features/portfolio/` (owner), telefon düzeni | `feature-builder` | M | P21a, P21b |
| P21d | Geç çıkış ücreti, no-show bedeli kalemi, yazdırılabilir gece raporu (Ö-22) | `feature-builder` | M | P17d |
| P21e | 02 raporundaki Orta/Düşük bulgular (liste faz-21'de) | `feature-builder-lite` / `feature-builder` | M | — |

## 6. Dalgalar (YURUTME.md ile aynı), tahmini maliyet ve süre

Makine: 2 çekirdek → dalga başına en çok 2 kodlayan ajan; kontrol ajanları sonra. Maliyet tahmini (sonnet kodlayan
$3–9/paket, kontrol $1–6, orkestra opus $8–15/dalga; 09 §2).

| Dalga | Paketler | Kontrol ajanları | Tahmini maliyet | Tahmini süre |
|---|---|---|---|---|
| 1 | P17a (calendar-specialist), P19c (lite) | ui-reviewer, turkish-ui-copy, db-reviewer, decision-auditor | $20–30 | 3–4 sa |
| 2 | P17d (db-migration-builder → calendar-specialist), P18a (lite) | db-reviewer, ui-reviewer, screen-auditor | $25–35 | 4–5 sa |
| 3 | P17b (db-migration-builder → calendar-specialist), P17c (feature-builder) | ui-reviewer, turkish-ui-copy, flow-tester (takvim) | $30–40 | 5–6 sa |
| 4 | P17e, P18b | screen-auditor, bug-hunter (takvim), decision-auditor | $20–30 | 3–4 sa |
| 5 | P18c, P18d | security-reviewer, screen-auditor, flow-tester | $20–30 | 3–4 sa |
| 6 | P19a (packager), P19b + P19d (lite) | security-reviewer, turkish-ui-copy | $15–25 | 2–3 sa |
| 7 | P20a, P20d | security-reviewer, privacy-auditor | $30–45 | 5–6 sa |
| 8 | P20b, P20c (db-migration-builder → camera-integrator) | ui-reviewer, privacy-auditor, db-reviewer | $30–45 | 5–6 sa |
| 9 | P20e, P20f | privacy-auditor, security-reviewer, decision-auditor | $25–40 | 4–5 sa |
| 10 | P21a, P21b | db-reviewer, security-reviewer | $20–30 | 3–4 sa |
| 11 | P21c, P21d, P21e | ui-reviewer, turkish-ui-copy, requirements-tracer | $20–30 | 3–4 sa |
| Son | Tam kontrol: modül başına bug-hunter + flow-tester, decision-auditor, security, db, ui, screen, privacy, copy, tracer → düzeltme turu → `/owner-review` | hepsi | $40–60 | 6–8 sa |
| **Toplam** | | | **$300–440** (Opus orkestra dahil) | ~50–60 sa ajan süresi |

Model başına kabaca: Opus (orkestra + decision-auditor) $90–130 · Sonnet (kodlayan + kontrol) $190–280 · Haiku $10–20.
Bütçe küçükse öncelik sırası dalga sırasıdır: Faz 17 ($95–135) tek başına resepsiyonun dört maddesini kapatır.

## 7. Gereksinim ve karar değişiklikleri (yapıldı)
- `01-gereksinimler.md`: G-193…G-196 (ZORUNLU/ÖNEMLİ), G-37 notu, Ö-20…Ö-24 (`/requirement-change` yolu ile).
- `06-kararlar.md`: K-48…K-56 taslak + 7. tur "Sahip cevapları" boş tablo.
- `05-sorular.md`: S-100…S-118 varsayılanlarıyla.
