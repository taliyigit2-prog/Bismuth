# Kesintisiz Yürütme — Faz 5–16 (K-39) ve Faz 17–21 (analiz turu, 2026-11-12)

> Sahip (2026-10-04): fazlar arasında onay yok; hepsi tek seferde; sonda çok ayrıntılı kontrol, sonra tek onay.
> Bu dosya ana oturumun çalışma planıdır: her bağlam sıkıştırmasından sonra önce bu dosya okunur (`session-context` kancası
> açık paketleri özetler). Faz 17–21 paket kartları `docs/analiz/08-gelistirme-plani.md`; yürütme `/orkestra`.

## Düzen

- **Ana oturum** (orkestra): ortak altyapı, paketleri başlatma, birleştirme (`parallel-build` becerisi), tam kontrol,
  e2e, commit + push, bu dosya ve `DURUM.md`.
- **Modül dosyaları** (çakışmasız paralel çalışma için): sözleşme `src/shared/contract/procedures/<modül>.ts`, işleyici
  `src/main/api/handlers/<modül>.ts`. Paketler `contract/index.ts` ve `api/handlers.ts` dosyalarına dokunmaz.
- **Yetki testleri**: paket kendi dosyasına (`tests/unit/permissions-<modül>.test.ts`); ortak matris dosyası elle
  birleştirilir.
- **Migrasyon**: gereken paket şemayı değiştirip `npm run db:generate` ile üretir; birleştirmede numara çakışırsa ana
  oturum yeniden üretir (elle SQL varsa taşır).
- **Sorular**: cevapsız soru = varsayılan + "(varsayılan)" (K-39). Yalnız sahibin yapabileceği işler (gerçek cihaz,
  hesap) sona, onay paketine.
- **Kapanış**: her paket kendi faz dosyasında kabul kutularını işaretler ve "Sonuç" yazar; ana oturum birleştirip
  `DURUM.md`'yi günceller.

## Ajanlar, modeller, çaba

Tek kaynak: `.claude/agents/<ad>.md` ön bilgisi; tablo ve gerekçe `docs/analiz/09-ajan-sistemi.md` §2 (K-56).
Makine: **4 çekirdek, 15 GB** (Codespace) → aynı anda en çok **3 kodlayan ajan** (yük > 5 ise 2; tam test/e2e/build aynı anda tek); kontrol ajanları kodlayanlar bitince, en çok 3 paralel.
Faz 5–16'daki eski tablo (4 çekirdek, 6 ajan) geçersizdir.

## Dalgalar ve paketler

Port: paket n → ui:shot `474n1`, `E2E_PORT=474n2` (n = 1…9; 10+ için 475n1/475n2).

| Dalga | Paket | Faz | Modül dosyası | Ajan | Durum |
|---|---|---|---|---|---|
| 1 | P5a Takvim ızgarası, gezinme, lejant, özel günler, klavye | 5 | reservations | feature-builder | ✅ |
| 1 | P5b Rezervasyon paneli, kişiler/KBS, ödeme, park, çakışma, kara liste | 5 | booking | feature-builder | ✅ |
| 1 | P8 Personel ve maaş | 8 | staff | feature-builder | ✅ |
| 1 | P9a Oda durumu + arıza | 9 | housekeeping | feature-builder | ✅ |
| 1 | P11 Döviz, hava, bayram doğrulama | 11 | external | feature-builder | ✅ |
| 1 | P12 Rehber, tedarik, çamaşırhane, kayıp eşya | 12 | contacts, supply | feature-builder | ✅ |
| 1 | P14 Yedek, geri yükleme, dışa/içe aktarma | 14 | backup | feature-builder | ✅ |
| 2 | P5c Faz 5 bütünleştirme: takvimden blok, kirli oda, ödeme kuru, uçtan uca kabul | 5 | reservations, booking | feature-builder | ✅ |
| 2 | P6 Misafirler, firmalar, kara liste | 6 | guests | feature-builder | ✅ |
| 2 | P7 Defter, kasa, giderler | 7 | ledger | feature-builder | ✅ |
| 2 | P9b Görevler, vardiya devri, notlar | 9 | operations | feature-builder | ✅ |
| 2 | P9c Otelde kalanlar, Bugün, takvim notları | 9 | today | feature-builder | ✅ |
| 3 | P10a Raporlar, ay sonu, KPI | 10 | reports | feature-builder | ✅ |
| 1 | P10b Turizm istatistiği (öne alındı) | 10 | tourism | feature-builder | ✅ |
| 3 | P13a Sunucu modu, HTTP sertleştirme, istemci bağlantısı, telefon | 13 | remote | feature-builder | ✅ |
| 3 | P13b Değişiklik günlüğü, yedek kopya, şifreli kutu, devral | 13 | remote | feature-builder | ✅ |
| 4 | P15a1 Klavye, tutarlılık, boş durumlar, küçük ekran | 15 | — | feature-builder | ✅ |
| 4 | P15a2 24 saat, tema, erişilebilirlik, yazdırma, performans, sürükle-bırak | 15 | — | feature-builder | ✅ |
| 3 | P15b Program içi kılavuz (üç dil) + ilk açılış turu (öne alındı; K-40) | 15 | guide | feature-builder | ✅ |
| 3 | P15c Terim sözlüğü (üç dil) + çeviri tutarlılığı (öne alındı) | 15 | i18n | feature-builder-lite | ✅ |
| 3 | P16d Kurulum, yedek, geliştirici belgeleri (öne alındı) | 16 | docs | feature-builder-lite | ✅ |
| 3 | P7fix Defter/kasa/kur/maaş erken hata avı düzeltmeleri (29 bulgu; K-42, K-43) | 7, 8 | ledger, staff | feature-builder | ✅ |
| 3 | P5fix Takvim/rezervasyon/misafir/kara liste erken hata avı düzeltmeleri (22 bulgu; K-44) | 5, 6 | reservations, booking, guests | feature-builder | ✅ |
| 4 | P16a Sertleştirme: hata günlüğü, kurtarma, büyük veri, migrasyon, çevrimdışı | 16 | — | feature-builder | ✅ |
| 4 | P16b Paketleme, sürüm notu (etiket sahip onayından sonra) | 16 | — | feature-builder | ✅ |
| 4 | P9fix Faz 9 hata avı düzeltmeleri (19 bulgu) | 9 | operations, today | feature-builder | ✅ |
| 4 | P10fix Faz 10/12 hata avı düzeltmeleri (17 bulgu) | 10, 12 | reports, tourism, supply | feature-builder | ✅ |
| 4 | P16c-ci CI e2e yeşil (telefon projesi veri yalıtımı, gece listesi) | 16 | tests/e2e | feature-builder | ✅ |
| 4 | P13sec Uzaktan erişim güvenlik düzeltmeleri (K-45) | 13 | remote | feature-builder | ✅ |
| 4 | P14fix Faz 11/14 hata avı düzeltmeleri | 11, 14 | external, backup | feature-builder | ✅ |
| 4 | P4fix Faz 4 hata avı düzeltmeleri (kurulum/giriş/roller/odalar) | 4 | auth, rooms, settings | feature-builder | ✅ |
| 4 | P16c Uçtan uca senaryolar, üç dil, rol testleri, kapsam | 16 | — | feature-builder | ✅ |
| 5 | Son kontrol: modül başına bug-hunter + flow-tester, decision-auditor, security, db, ui, copy, tracer → düzeltme turları | — | — | hepsi | ➡ Son dalgası |
| 5 | QA1a Takvim aralığı + başlangıç yılı (G-31), oda/tarih araması (G-190) | 5, 6 | booking, guests | feature-builder | ✅ |
| 5 | QA1b Misafir etiketleri (G-50), ay sonu işaretleri kişi tercihinde, TR görev önerileri | 6, 10, 9 | guests, reports | feature-builder | ✅ |
| 5 | QA1c Raporda kur kaynağı, tedarik kartı, turizm karşılaştırması, hava UA, kapsam | 10, 11, 12, 16 | reports, tourism | feature-builder | ✅ |
| 5 | QA1d Plan belgelerini koda eşitleme | — | docs | feature-builder-lite | ✅ |
| 5 | P13sec2 Güvenlik yeniden incelemesinin kalan bulguları (N-1, N-3…N-10, N-12) | 13 | remote | feature-builder | ✅ |
| 5 | Akış testi A (defter, kasa, personel) ve B (operasyon, Bugün) | — | — | flow-tester | ✅ |
| 5 | QA2x Dışa aktarmada eksik tablolar (G-122, S-43) | 14 | backup | feature-builder | ✅ |
| 5 | QA2a Akış testi A bulguları (para alanı, iptal menüsü, sınırlar, kasa teslimi) | 7, 8 | ledger, staff | feature-builder | ✅ |
| 5 | QA2b Akış testi B bulguları (uzun metin taşması, kopyalama, alan sınırları, 44 px) | 9, 12 | operations | feature-builder | ➡ Son dalgası |
| 5 | Hata avı Faz 15 + 16 | 15, 16 | — | bug-hunter | ✅ |
| 5 | Akış testi C (takvim, rezervasyon, misafir, ayarlar, giriş, raporlar, turizm) ve D (döviz, yedek, aktarma, uzaktan, telefon) | — | — | flow-tester | ➡ Son dalgası |
| 5 | QA2c Faz 15/16 hata avı düzeltmeleri (çökme döngüsü, kişisel ayar sızıntısı, sürükle-bırak fiyatı) | 15, 16 | — | feature-builder | ✅ |
| 5 | QA2-copy Metin, kılavuz, otel e-postası, küçük düzeltmeler | 15 | — | feature-builder | ✅ |
| 6 | Sahip onay paketi (owner-review: tüm ekranlar + gerçek cihaz denemeleri listesi) | — | — | ana oturum | ➡ Son dalgası |

## Faz 17–21 dalgaları (analiz turu; paket kartları `08-gelistirme-plani.md`)

Port: paket n → ui:shot `475n1`, `E2E_PORT=475n2`. Durum: ⬜ bekliyor · 🔄 sürüyor · ✅ bitti · ⏸ durdu (neden günlükte).
Harcama sütunu: başlatıcının yazdığı `$` (dalga toplamı, gerçek).

| Dalga | Paket | Faz | Modül dosyası / ad alanı | Ajan | Tahmin | Harcama | Durum |
|---|---|---|---|---|---|---|---|
| 1 | P17a Vazgeçme ve iade akışı (undoCheckIn, iptal/çıkışta ödeme + iade, kapalı rezervasyonda menü, raporda iptal/gelmedi/iade satırları) | 17 | booking, calendar, reports | calendar-specialist | $12–18 | ~$15 | ✅ |
| 1 | P19c Depo temizliği (prototypes arşiv, faz0 iş akışları, icon, yerel yollar, kanca istisnaları) | 19 | — | feature-builder-lite | $2–4 | ~$3 | ✅ |
| 2 | P17d Gündüz kullanımı 2.0 + ikinci tur hatası + H-06 (migrasyon **0019**) | 17 | booking, reservations, settings | db-migration-builder → calendar-specialist | $15–22 | ~$45 | ✅ |
| 2 | P18a ui-shot çoklu boyut/ölçek/dil + ölçüm JSON; Electron e2e Codespace'te yeşil | 18 | scripts, tests/e2e | feature-builder-lite | $2–4 | ~$3 | ✅ |
| 3 | P17b Grup rezervasyonu + toplu giriş (migrasyon **0020**) | 17 | booking, reservations | db-migration-builder → calendar-specialist | $15–22 | ~$40 | ✅ |
| 3 | P18c Pencere: F11, tam ekran/zoom hatırlama, çoklu monitör | 18 | main/windows, main/app | feature-builder | $6–10 | ~$10 | ✅ |
| 4 | P17c Hızlı takvim: sağ tık, hızlı çubuk, çoklu seçim (+ toplu ödeme), bugün şeridi, son iptaller listesi, park nedeni etiketi | 17 | calendar | feature-builder | $8–12 | ~$30 | ✅ |
| 4 | P17e Yüksek/Orta hata düzeltmeleri (02 raporu; H-05, H-07, H-08, H-09, H-19, H-21, H-24, H-25, H-44) | 17 | bulguya göre | feature-builder / calendar-specialist | $10–14 | ~$14 | ✅ |
| 5 | P18b Düzen düzeltmeleri (05 raporu) | 18 | features/*, layouts | feature-builder | $8–12 | ~$12 | ✅ |
| 5 | P18d Çalışmayan öğeler (akış testi) | 18 | bulguya göre | feature-builder | $6–10 | ~$8 | ✅ |
| 6 | P19a Sürüm iş akışı tekleştirme (tetikleme sahipte) | 19 | .github, electron-builder | packager | $5–8 | ~$4 | ✅ |
| 6 | P19b Kurulum belgeleri + kılavuz + sihirbaz tek kâğıt adımı + belge çelişkileri (Ç-01/02/04/05); P19d ajan bakımı | 19 | docs, guide, setup, .claude | feature-builder-lite (+ feature-builder sihirbaz) | $4–8 | ~$12 | ✅ |
| 7 | P20a Kamera yan süreç iskeleti + Python hijyeni + Telegram'ın Bismuth'a taşınması (K-50; kod bulguları `ekler/kamera-kod-bulgulari.md` §0) | 20 | main/camera, main/network/telegram, otel-kamera | camera-integrator | $12–20 | ~$25 | ✅ |
| 8 | P20b Kamera sekmesi (canlı yayın yalnız ana bilgisayar; telefon alarm listesi) | 20 | features/camera | camera-integrator | $8–12 | ~$22 | ✅ |
| 8 | P20d Model sabitleme ve çevrimdışı (K-57: mevcut modeller kalır, telemetri kapalı, lisans notu) | 20 | otel-kamera, resources/camera | camera-integrator | $4–6 | ~$15 | ✅ |
| 9 | P20c Veri entegrasyonu (migrasyon 0021, şifreleme, alarm → bildirim; rıza alanı yok K-58) | 20 | camera, today | db-migration-builder → camera-integrator | $15–22 | ~$30 | ✅ |
| 10 | P20e KVKK paketi (aydınlatma şablonu, saklama/imha, personel dışlama) | 20 | camera settings | camera-integrator | $8–12 | ~$25 | ✅ |
| 10 | P20g Kamera kurulum sihirbazı (K-59: donanım otomatik, Hikvision keşif + RTSP kalıbı + test) | 20 | features/setup, main/camera/discovery, otel-kamera/discovery | camera-integrator | $10–15 | ~$25 | ✅ |
| 11 | P20f Kamera paketleme (torch dahil; gerekirse ayrı kamera eki kurulumu) | 20 | electron-builder, resources | packager | $12–18 | ~$25 | ✅ |
| 11 | P21b İstemci çoklu ana bilgisayar (K-54: kayıtlı otel listesi) | 21 | remote | feature-builder | $8–12 | ~$15 | ✅ |
| 12 | P21c Portföy özeti (iki otelin takvimi, gelir-gider, doluluk, kasa) | 21 | portfolio | feature-builder | $8–12 | ~$20 | ✅ |
| 12 | P21d Geç çıkış, no-show bedeli, hasar depozitosu kalemi, gece raporu | 21 | booking, reports | feature-builder | $6–9 | ~$18 | ✅ |
| 13 | P21e Orta/Düşük bulgular (02 + 04 listesi, faz-21) | 21 | bulguya göre | feature-builder-lite / feature-builder | $4–6 | ~$25 | ✅ |
| 13 | P21a Profil altyapısı (isteğe bağlı; tek makinede iki otel) | 21 | main/app/paths, auth, settings | feature-builder | $10–15 | | ⏭ atlandı (otonom varsayılan) |
| 14 | P22a Ölç ve hafiflet (perf betiği, Electron denemeleri, hafif mod) | 22 | scripts, main/windows, main/app | feature-builder | $15–30 | ~$20 | ✅ |
| 14 | P22b Kabuk soyutlaması `lib/shell` (Electron + tarayıcı) | 22 | renderer/lib/shell, preload | feature-builder | $20–40 | ~$12 | ✅ |
| 15 | P22c Tauri 2 prototipi + aynı ölçümle karşılaştırma + sahip karar sayfası (**durma noktası**) | 22 | shell-tauri/ (ürün dışı) | rust-shell-builder | $60–120 | ~$25 | ✅ |
| 16 | P22d Tauri ürünleştirme (yalnız sahip "devam" derse); P22e Rust servis pilotu (yalnız darboğazda) | 22 | shell-tauri, .github, docs | rust-shell-builder + packager | $80–160 (+$100–200) | | ⏭ açılmadı (K-62: ölçüm olumsuz; sahip "devam" demedi) |
| Son | Tam kontrol sürüsü (bug-hunter + flow-tester modül başına, decision, security, db, ui, screen, privacy, copy, tracer) → **modül başına Ponytail `full` sadeleştirme turu (K-61; testler aynı)** → düzeltme turu → `/owner-review` | — | — | hepsi | $50–75 | | 🔄 |

Dalga sırası kuralları: bir paket bağımlı olduğu paketten **sonraki** dalgada (P17c → P17b, P18b → P17c, P20b/P20d → P20a,
P20c → P20b, P21b/P21c → P21a); aynı dalgadaki iki paket aynı dizine dokunmaz. Migrasyon numarası dalga sırasıyla verilir
(`db:generate` sıradakini üretir): P17d 0019 → P17b 0020 → P20c 0021; çakışırsa yeniden üretilir. Kamera dalgaları 7–11, çoklu otel 11–13, performans/kabuk (Faz 22) 14–16 — dalga 15 sonunda sahip kararı (K-62).

Dalga toplamları (paket + kontrol ajanları $3–8 + orkestra Opus $3–8): 1: $20–38 · 2: $23–42 · 3: $27–48 · 4: $22–40 ·
5: $20–38 · 6: $15–32 · 7: $18–36 · 8: $18–34 · 9: $21–38 · 10: $24–43 · 11: $26–46 · 12: $20–37 · 13: $20–37 ·
Son: $55–85 → **toplam $330–595** (dalga 1–5 = Faz 17 + ekran ≈ $110–210; her dalgaya Ponytail sadeleştirme $2–4 dahil değil, +$30–55). Model başına: Opus $50–130 · Sonnet $255–420 ·
Haiku $15–30. Sahip cevapları (2026-11-13) işlendi: `08` §8. Ölçüm: Codespace 2026-11-12'de 4 çekirdek / 15 GB (paralel kodlayan ajan sınırı yine 2; üçüncü çekirdekler
test/paketleme için).

Kontrol ajanları dalga başına: `08-gelistirme-plani.md` §6. Faz 5–16'nın açık kalan satırları (5. dalga son kontrol,
QA2b, akış testleri C/D) bu plana **Son** satırında katılır; ayrı yürütülmez.

## Günlük

- 2026-10-04: 1. dalga başladı (8 paket: P5a, P5b, P8, P9a, P10b, P11, P12, P14; taban c41df07).
- 2026-10-04: K-39 kaydedildi; sözleşme/işleyici modül dosyalarına bölündü; ajan tanımları (model + çaba) yazıldı.
- 2026-10-05: 1. dalga birleşti ve push edildi (3501a7b, f80024b, 1c2cb20). 2. dalga başladı (P5c, P6, P7, P9b, P9c) ve
  P13a öne alındı.
- 2026-10-05: P6 + P9c + P5c birleşti (fdb1237). Commit kancası yük altında (4 çekirdek, 6 ajan) `npm test` süresini
  aştı; ajanlar hazır değişiklikleri bıraktı, ana oturum düşük yükte birleştirdi. Sonraki dalgalarda en çok 4 ajan.
- 2026-10-05: P7 + P9b birleşti. Rezervasyon panelindeki yazmalar artık defter, kasa, Bugün ve otelde kalanlar
  sorgularını da yeniliyor (`isCalendarQuery`).
- 2026-10-05: 3. dalga başladı: P10a raporlar, P15b kılavuz (öne alındı; içerik Markdown, K-40) ve bitmiş modüllerde
  erken hata avı (2 `bug-hunter`: takvim/rezervasyon/misafir; defter/kasa/personel). P13b, P13a birleşince başlar
  (aynı `src/main/server/` dosyaları).
- 2026-10-05: CI birim testlerde kırmızıydı (3 test `/data` klasörüne yazıyordu; saat dilimi adı ICU sürümüne göre
  değişiyordu) → c24beb1 ile düzeltildi. P15c (sözlük + çeviri tutarlılığı) ve P16d (belgeler) öne alındı.
- 2026-10-05: Erken hata avı (defter/kasa/personel) 29 bulgu + 1 tasarım notu verdi (yüksek: maaş satırları yetkisiz
  rollere görünüyor, ödemede elle kur yanlış çifte, ücretsiz izin düşmüyor, devirde gizli gider sızıyor). K-42, K-43
  kaydedildi; P7fix başladı. Not: hata avcılarının betikleri worktree temizlenince kayboluyor → sonrakiler scratchpad'e yazar.
- 2026-10-05: Erken hata avı (takvim/rezervasyon/misafir) 25 bulgu verdi (yüksek: gündüz kullanımı süren konaklamanın
  içine yazılabiliyor, aynı gün ayrılışta gece boşalmıyor, misafir geçmişi "son fiyat"ı ileri tarihli kayıttan alıyor,
  kara liste bağı birleştirmeden sonra kayboluyor). K-44 kaydedildi; ödemeyle ilgili 3 bulgu P7fix'e, kalan 22'si
  P5fix'e. Commit kancası yük 15'te zaman aşımına düştü; DOM testlerindeki `scrollTo` gürültüsü kapatıldı.
- 2026-10-05: Commit kancası tıkanması çözüldü: zaman aşımına düşen kanca `vitest`'i yetim bırakıyordu (öldürüldü);
  typecheck artımlı (247 → 29 sn); ajanlar artık commit etmiyor, hazırlıyor; ana oturum birleştirip commit ediyor.
- 2026-10-05: 3. dalga birleşti: P13a (4b3deb4), P5fix (3354708, 0011), P7fix (dfd211f, 0012), P10a (0b0e3ad),
  P15b (5c8beaf). P13b başladı (taban 4b3deb4). 4. dalga başladı: P15a1, P15a2, P16a + hata avı Faz 9, Faz 10/12.
  CI: birim testler yeşil; e2e'de 3 kırmızı (telefon projesinde testler arası paylaşılan veri, admin.spec) → P16c.
- 2026-10-05: Konteyner iki kez yeniden başladı; worktree'ler diskte kaldı, ajanlar bağlamlarıyla sürdürüldü (iş
  kaybı yok). Birleşenler: P13b (95e531d, 0013_change_log), P9fix (69bae9b), P10fix (c14d395, 0014_report_fixes),
  P15a1 (33b453e). Yük 25+ iken kancanın zaman aşımı → ajanlara 25 dk "ağır komut yok" penceresi verilerek commit.
- 2026-10-05: Başlayanlar: P16b paketleme; hata avı Faz 4 (kurulum/giriş/roller/ayarlar) ve Faz 11+14 (döviz/hava/
  yedek/aktarma); `security-reviewer` Faz 13 (HTTP yüzeyi + kutu şifrelemesi). Sürenler: P15a2, P16a, P16c-ci.
- 2026-10-05: Birleşenler: P15a2 (bfe5512), P16c-ci (04c0c64; yerelde e2e 98/98). Güvenlik incelemesi: kutu
  şifrelemesi onaylandı, HTTP yüzeyi koşullu (anahtar HTTP'den okunup değiştirilebiliyor, gövde sınırı yok, yerel
  ağda şifresiz HTTP) → K-45, P13sec. Faz 11/14 avı 21 bulgu → P14fix (+ 3'ü P13sec'e).
- 2026-10-05: P16b birleşti (5c88b1a). Faz 4 avı 16 bulgu (2'si P13sec'e) → P4fix. P16c başladı. Sürenler: P16a,
  P13sec, P14fix, P4fix, P16c. Sonra: son kontrol sürüsü (akış testi, karar denetimi, veritabanı, arayüz, metin,
  gereksinim izleme) ve sahip onay paketi.
- 2026-10-05: P16a birleşti (4e97ef4). Son kontrolün okuma ayağı (gereksinim izleme, karar denetimi, metin) bitti:
  ZORUNLU 96'nın 80'i tam, 16'sı kısmi (çoğu çalışan paketlerde ya da gerçek cihazda); yeni eksikler takvim aralığı
  (G-31), misafir etiketleri (G-50), oda/tarih araması (G-190), raporda kur kaynağı, tedarik kartı; metinde 3 yüksek
  (yanlış menü yolu, "Yönetici giderleri", uzaktan erişim adımları). K-46 kaydedildi. QA-1 turu başladı: QA1a takvim
  aralığı + arama, QA1b misafir etiketleri + ay sonu işaretleri, QA1c raporlar + küçük düzeltmeler, QA1d plan
  belgeleri. Metin/kılavuz düzeltmeleri P4fix/P14fix/P13sec birleşince (aynı dosyalar).
- 2026-10-05: QA1d (plan belgeleri) ve P14fix birleşti (0015_import_batches: içe aktarma parmak izi ve aktarım
  iptali, maaş şablonu, ayrı iş parçacığında yedek denetimi, geri yükleme/anahtar uyarıları). Tanıtıcı not dışa
  aktarmadan çıkarıldı (K-46 (4)); yerel yedek şifrelenmez (K-46 (10)). P13sec de aynı commit'te birleşti
  (0016_remote_security): güvenlik incelemesinin bütün bulguları kapandı (yerel ağ isteğe bağlı + ana bilgisayar
  kimliği, gövde sınırı, anahtar/geri yükleme/Drive klasörü yalnız masaüstü, uzaktan ayrı kilit, merkezi yazma kapısı,
  geri yükleme yeni dönem açar). Yeniden güvenlik incelemesi son kontrol sürüsünde.
- 2026-10-05: Güvenlik 2. tur: HTTP yüzeyi koşullu (N-1 oturumsuz bellek tüketme, N-2 ağdan şifre deneme) → P13sec2
  ve P4fix; yerel ağdaki aktarma saldırısı kalan risk olarak belgelenir (Bismuth↔Bismuth TLS yok, varsayılan).
  Veritabanı incelemesi: migrasyonlar temiz; kişisel notlar sahibin kopyasına/kutuya gidiyordu (yüksek) → P13sec2.
  P16c birleşti: tam gün senaryosu (yedek/geri yükleme, KBS veri koruması), üç dil e2e, 6 rol × yordam ve menü ⇔
  servis matrisi, domain kapsamı %99 satır / %93 dal. Akış testleri A (para/personel) ve B (operasyon/Bugün) sürüyor.
- 2026-10-05: QA1b birleşti (0017_guest_tags): misafir etiketleri (liste, kart, süzgeç, panel, dışa aktarma),
  ay sonu "baktım" işaretleri kişi tercihinde, Türkiye'ye özgü görev önerileri yalnız TR otelinde.
- 2026-10-05: P16c + QA1b commit'i (07bf766) ancak makine boşta iken geçti: kanca `npm test`'i yük ~3,5'in altında
  bitirebiliyor (takım 1.965+ test). Yöntem: ajanlara 15 dk "hiç test/derleme yok" penceresi, yük düşünce tek commit.
  QA2x (dışa aktarmada eksik tablolar) başladı.
- 2026-10-05: CI Faz 4'ten beri ilk kez tamamen yeşil (`1e24845`, koşu 89): birim + e2e + Linux duman testi +
  Windows ve macOS paketleri ve duman testleri. `07bf766` koşusu sürüyor.
- 2026-10-05: QA1c birleşti: raporlarda ve ay sonunda kur kaynakları kartı (+ Excel sayfası), tedarik giderleri kartı,
  turizm karşılaştırmasında K-29 sayımı, MET User-Agent'a e-posta hazırlığı, örnek veri temizliği, `money.ts`
  `roundToUnit`. Otel e-posta ayarı (K-13) sonraki küçük pakette.
- 2026-10-05: Akış testleri A (≈230 etkileşim) ve B (≈550 deneme + 111 yetki çağrısı) bitti. Yüksek: para alanına
  geçersiz yazı yazılınca eski (dolu) tutar kaydediliyordu (ödeme, maaş ödemesi); defterde "İptal et" menüsü düzenle
  penceresini de açıyordu. Orta: uzun boşluksuz metin sayfayı taşırıyor, telefonda kopyalama hatası, kasa teslim
  penceresinde brüt tutar, sınır/hata metinleri. Yetki denetimleri iki testte de temiz. → QA2a, QA2b.
- 2026-10-05: Dört paket tek commit'te birleşti: QA1a (takvim aralığı veriden + `calendar.startYear`; misafir oda/tarih
  süzgeci, takvimde oda no araması), P13sec2 (oturumsuz istek/gövde sınırları, ana bilgisayar adı ve özel ağ denetimi,
  mDNS yalnız yerel ağ açıkken, parmak izi doğrulamalı kimlik kabulü, ayar servisinde yazma kapısı, ağdan klasör yolu
  yok, API anahtarları ve sunucu sırrı `safeStorage` ile; kişisel notlar kopyaya/kutuya gitmez; büyük anlık görüntü
  sayfalı; devralda yabancı anahtar denetimi), P4fix (kapasite geçmişi ve planlı değişiklik iptali 0018, kilit/PIN/
  kurtarma ve zorunlu şifre değişikliği, ağdan yeniden doğrulama sayımı N-2/N-11, kapalı çamaşır türü, ülkeye göre bayram,
  ayar çapraz kuralları, rol seçimi, denetim maskeleme, tek "kaydetmeden çık" sorusu), QA2x (dışa aktarma 20 → 37 küme).
- 2026-10-05: 06d4b50 birleşti (P4fix, P13sec2, QA1a, QA2x). Kanca `npm test`'i boş makinede bile 531 sn'de bitiriyordu
  (sınır 570 sn, typecheck + lint dahil): şifre özeti testleri Vitest altında küçük scrypt iş yüküyle koşuyor (program
  aynı: N=16384, r=8, p=5, testli); en yavaş üç dosya 111 → 18 sn. Faz 15/16 hata avı: 1 yüksek (pencere ikinci
  çöküşte ölü kalıyor), 4 orta (uzaktan değişen kişisel tema/dil otel penceresine uygulanıyor, sürükle-bırak tarih
  taşıma toplamı değiştiriyor, N kısayolu dünün tarihi, kurtarma penceresi yanlış yedek tarihi) → QA2c. Akış testleri
  C ve D, metin/kılavuz paketi başladı.
- 2026-10-10: Haftalık sınırdan sonra token ekonomisi (sahip isteği): kodlayan ajanlar sonnet/medium, küçük işler ve
  metin/iz/araştırma haiku/medium, karar/akış/DB/arayüz denetçileri opus/medium, hata/güvenlik avı sonnet/high;
  `token-economy` ve `code-graph` (graphify, yerel AST grafiği) becerileri. Yarım paketler yamayla yeni ajanlara
  devredildi. 5ceb589 (QA2a + QA2c) ve c70e5d9 (QA2-copy) birleşti. QA2b ile akış testleri C1, C2, D sürüyor.
- 2026-10-11: 98544ac (QA2b), 2913a5e (QA3d uzaktan erişim: istemci kimlik bilgisi göndermeden önce ana bilgisayar
  kimliğini yeniden doğrular), 7511ca3 (QA3c2), d9dff39 (QA3c1: "1250.5" 10 kat kaydediliyordu), 518cab8 (miktar
  ayrıştırma), 35b7e78 (QA4: tek otel saat dilimi "bugün", arayüz incelemesi) birleşti. Varsayılanlar K-47. Akış
  testleri C1/C2/D ve son arayüz incelemesi bitti (raporlar scratchpad'de). GitHub Actions 10 Eki'den beri iş
  başlatmıyor (2 sn'de başarısız, günlük yok — dakika/harcama sınırı olası; sahip onay paketinde); yerine tam e2e yerelde.
- 2026-11-12: **Analiz turu (Fable).** Faz 17–21 planı, K-48…K-56 taslakları, S-100…S-118, G-193…G-196, Ö-20…Ö-24;
  ajan sistemi v2 (6 yeni ajan, `/orkestra`, `workflow-guard`, `camera-data-guard`, belge-yalnız commit kapısı);
  baz: typecheck ✓, lint ✓, 2427 birim test ✓, kanca 89/89. Faz 5–16'nın 🔄 satırları "Son" dalgasına taşındı.
  Opus devir notu `docs/analiz/OPUS-BASLANGIC.md`. Sonraki adım: `/orkestra` dalga 1.
- 2026-11-12 (kapanış): analiz turu commit'leri `claude/fable-analiz` dalında (8346aec → 07a3fad + bu). `npm run check` ✓
  (2427 test), kanca testleri 89/89. Fable harcaması ≈ $45. Opus: `OPUS-BASLANGIC.md` → `/orkestra 1`.
- 2026-11-13: **Analiz turu 2. oturum (Fable).** Sahip cevapları S-100…S-118 işlendi (K-48…K-55 kesin, K-57…K-62); plan 13 dalga
  + Faz 22 (14–16); "doğrulanmadı" maddeleri kapatıldı; 33 route'un tamamı gerçek Electron'da akış testinden geçti
  (H-19…H-47, Kritik/Yüksek yok); Windows paketi Linux'ta üretildi (wine64+wine32); Ponytail becerisi (K-61), 21st.dev MCP
  (K-60, `12-…md`), Rust/Tauri raporu ve ölçüm (`11-…md`, K-62 taslak). Fable harcaması 2. oturum ≈ $40+.
- 2026-11-13: **Opus oturumu.** Sahip cevapları S-119…S-123 işlendi (06-kararlar 8. tur); başlatıcı maliyet sayacı düzeltildi
  (tur başına en büyük kümülatif değer). Dalga 1 başladı: P17a (calendar-specialist) + P19c (feature-builder-lite), taban e5281e6.
- 2026-11-13: P19c ✅ — `prototypes/`, `faz0-*.yml`, `resources/icon.png` kaldırıldı (arşiv etiketi `archive/faz0`), kanca istisnaları
  ve testleri (87/87), yerel/şifreli örnek yollar temizlendi, `fable-talimati.md` → `tools/ajan/talimatlar/`. P17a ajanı oturum
  kapanınca yarım kaldı; worktree'den devam ediliyor.
- 2026-11-13: `archive/faz0` etiketi yerelde atıldı; uzak depoya push kanca tarafından engellendi (yalnız `claude/…`) — sahip
  isterse `git push origin archive/faz0` (sahip onay paketine). P18a (dalga 2) P17a'ya bağımlı olmadığı için öne alındı.
- 2026-11-13: P17a ✅ — `booking.undoCheckIn` (yalnız giriş günü, yeni `booking.undoCheckIn` yetkisi, audit, KBS uyarısı),
  iptalde iade/park/"tahsilat kalsın", kapalı rezervasyonda menü, raporlarda iptal/gelmedi/iade ayrı satır, resepsiyon iade
  yetkisi varsayılan E (S-100). `npm run check` 2459 test ✓; e2e giveup masaüstü + telefon ✓. Ajan oturum kapanışında iki kez
  yarım kaldı; ana oturumda birleştirildi. Not → P17d: mevcut kurulumlarda resepsiyon `payments.refund` satırı tohumla
  güncellenmez (onConflictDoNothing) → 0019'da veri güncellemesi.
- 2026-11-13: P18a ✅ — `ui-shot` `--size/--scale/--langs/--metrics` (7 boyut × 2 tema × 3 dil = 144 görüntü, ölçüm JSON:
  taşma 0, kesilme 0, telefonda 44 px altı 54 hedef → P18b), Electron e2e Codespace'te tam yeşil (85 geçti, 7 atlandı, 13,5 dk).
  Dalga 1 kontrolleri: decision-auditor (Kritik/Yüksek yok), db-reviewer (Yüksek: S-100 mevcut kurulumda etkisiz → P17d 0019
  kabulüne eklendi), turkish-ui-copy (4 metin düzeltildi). Orta bulgular P17afix'te.
- 2026-11-13: P17afix ✅ — vazgeçme + iptal/iade/park tek transaction (`booking.undoCheckIn` `then`), iadesi olan tahsilatın
  void/azaltılması reddedilir, iade yetkisi sorgudan önce, rapor iade sayısı/tutar tutarlı, audit önceki/sonraki durum,
  istemci iade tavanı para birimine göre (2476 test). **Dalga 1 bitti.** Sadeleştirme (Ponytail) dalga 2 ile birlikte yapılacak.
- 2026-11-13: **Dalga 2 bitti.** P17d ✅ — migrasyon 0019 (room_nights saat aralığı + kısmi benzersiz indeksler,
  `room_types.hourly_price_minor`, mevcut kurulumda resepsiyon iade yetkisi none→edit + audit), `booking.createHourlyStay`/
  `hourlyCheck`, hata C (ikinci tur çıkışında gece serbest), H-06, takvimde saatli çubuklar, saat ücreti (Odalar ve tipler
  sekmesi; ayrı "Fiyatlar" sekmesi yok), sihirbaz adımı, rapor tür süzgeci + aylık saatlik sayı/gelir. P17dfix: doluluk aynı
  oda-günü bir kez sayar, ADR yalnız gecelik; aynı gün rezervasyon saat ister (S-103), ölü `reports.dayUseInOccupancy` ve
  anahtarları kaldırıldı, telefon düğme taşması, sihirbaz "Atla" 44 px. Kontroller: db-reviewer, decision-auditor,
  turkish-ui-copy, ui-reviewer — Kritik/Yüksek yok. Sahip onay paketine: G-196 metni eski (fiyat modu/doluluk ayarı) →
  `/requirement-change` sahipte.
- 2026-11-13: Sadeleştirme (dalga 1–2) atlandı: kapsamda yalnız −6 satır bulundu, değmez. P18c ✅ — F11 / Ctrl+Shift+F tam
  ekran (ana süreçte), pencere durumu (boyut/konum/maximize/tam ekran) 500 ms debounce ile, kaldığı ekranda açılış (ekran
  yoksa birincil), `minWidth` çalışma alanıyla sınırlı, `ui.zoom` %80–150 kişisel ve kalıcı; e2e `window.spec.ts` ✓.
  Açık: açık Ayarlar ekranındaki zoom seçimi menüyle değişince yenilenmiyor (Düşük → P18b); `large-data` süre testi yük
  altında sınırda (903/900 ms) — tek başına geçiyor.
- 2026-11-13: P17b ✅ — migrasyon 0020 (`reservation_groups`, `reservations.group_id`, ayar `booking.groupFolioMode`), grup
  oluşturma (oda başına misafir adı), `checkInMany`/`checkOutMany` tek transaction, grup paneli + takvimde grup halkası ve
  lejant, Ayarlar → Takvim'de grup hesabı seçimi; e2e masaüstü + telefon ✓ (2613 test). Tasarım: her oda kendi folyosunu
  tutar, "tek hesap" kipinde grup paneli birleşik bakiye gösterir. Açık → P17c: grup tek ödemesinin odalara dağıtılması,
  mevcut rezervasyonu gruba bağlama. P18c güvenlik incelemesi: 2 Düşük bulgu düzeltildi.
- 2026-11-13: **Dalga 3 bitti** (kontroller: Kritik/Yüksek yok; Orta bulgular P17c'ye eklendi; 3 metin düzeltildi).
- 2026-11-13: P17c ✅ — sağ tık menüsü (çubukta 10, boş hücrede 4; Shift+F10), hızlı rezervasyon çubuğu, Ctrl/Shift çoklu
  seçim + toplu not/giriş/çıkış/ödeme/gruba bağlama, bugün şeridi, "Son iptaller" (7 gün), panel başlığında üç düğme,
  telefonda uzun basma; grup tek ödemesi `booking.payGroup` (S-106), `booking.attachToGroup`, `reservations.recentEnded`.
  Açık: telefonda seçim çubuğu yok (Düşük). `stay-filter` testi yük altında yarışıyordu → `waitFor`.
- 2026-11-13: P17e ✅ — H-05 telefon (`src/shared/phone.ts` tek ayrıştırma), H-07/H-19/H-25/H-44 metin üst sınırları
  sözlesmede (`contract/text.ts`) + alan sayacı (`char-counter.tsx`), H-08/H-24 fiyat/tutar doğrulaması, H-09 yetkisiz
  ayar sekmesi gizli, H-21 firma telefonu + tekrar uyarısı. Ajan iki kez oturum kapanışında yarım kaldı; ana oturumda
  tamamlandı (sayaç ile alan hatasının çift mesajı düzeltildi). **Dalga 4 bitti.**
- 2026-11-13: Dalga 5 başladı (P18b + P18d, taban c2cd43d). P18d ✅ — H-34 (telefonda tedarik boş durum metni), H-36
  (Ayarlar → Yedek sessiz kaydet: tarayıcı doğrulaması kapatıldı, alan hataları), H-04 yeniden üretilemedi (takvim
  açılır penceresi genişliği sınırlandı, e2e koruma); H-26, H-30, H-37, H-39…H-42, H-46 → P21e. Dalga 4 denetimi:
  Kritik/Yüksek yok; Orta 4 (hızlı çubuk ad sınırı ve 0 fiyat onayı, `payGroup` servis tarafında folyo kipi denetimi,
  `+86` gibi bilinmeyen ülke kodu) + Rusça çoğullar → P17fix.
- 2026-11-13: P17fix ✅ — hızlı çubuk ad sınırı sözleşmeden (80) ve 0 fiyat onayı, `payGroup` `per_room` grupta servis
  tarafında ret, bilinmeyen ülke kodlu telefon E.164 olarak korunur, "Son iptaller" gelmedi zamanı audit'ten, toplu ödemede
  kapalı gün gerekçesi, mantıksal CSS, Rusça çoğullar ve gömülü sayılar `{{max}}` (2690 test). Faz 17 kabul maddeleri tamam.
- 2026-11-13: P18b ✅ — telefonda radyo/anahtar 44 px görünmez alan, takvim düğme etiketleri sarar, üst çubuk tarihi 1024 px
  altında kısa, açık Ayarlar → Görünüm zoom seçimi güncellenir; `ui-shot` ölçümü düzeltildi (::after alanı, etiket içi
  denetim). Ölçüm (853/1280/1366/1920 + telefon, tr/ru): taşma 0, kesilme 2→0, telefonda küçük hedef 64→0. Masaüstü cila
  #1, #2 (Orta: takvimde üç kaydırma çubuğu, panel genişliği), #3, #5, #6 → P21e. **Dalga 5 bitti.**
- 2026-11-13: Dalga 6 başladı (P19a packager; P19b + P19d feature-builder; taban aa4a01d). Önceki oturumda P19a worktree'si
  yarım kalmıştı (ci.yml/release.yml taslağı); aynı worktree'de devam ettirildi.
- 2026-11-13: Ajan worktree'leri `main`'den (b62361f) açılıyor; görev metnine "önce `git reset --hard <taban>`" adımı eklendi
  (ilk iki deneme bu yüzden boş döndü). P19a ✅ — `release.yml` tek paketleme yeri (dispatch + etiket; verify → windows (wine) +
  macos → publish), `ci.yml` yalnız Linux doğrulaması (`workflow_call`), etiket adı `env` ile; `package:win` Codespace'te 3 dk 38 sn.
  P19b ✅ — kurulum belgeleri, kılavuz "Kurulum" bölümü (3 dil), sihirbazda tek "Kâğıda yazın" adımı + yazdır, Ayarlar → Yedek
  "Drive klasörünü bul" (`backup.findDriveFolder`). P19d ✅ — kanca bakımı; ek: `deps-guard` bayrak/tırnak/`@npm:` takma ad
  atlatmaları ve `update-electron-app`/`electron-devtools-installer` engeli (97 kanca senaryosu). Kontroller: security-reviewer
  (Kritik/Yüksek yok; Orta #1 ve Düşük #2 düzeltildi), turkish-ui-copy (5 düzeltme). 2703 test yeşil.
  Otonom varsayılanlar: `kurulum.md`'de SHA256 denetimi sondaki "isteğe bağlı, teknik" bölümünde kalır (otonom varsayılan);
  "Drive klasörünü bul" bulduğu Drive içinde `Bismuth/yedekler` klasörünü oluşturup ayara yazar (otonom varsayılan).
  P21e'ye not: `drive.ts` Windows'ta eşlenmiş ağ sürücüsünü de tarayabilir, senkron `statSync` çevrimdışı sürücüde bekletebilir
  (Orta-Düşük); `stop-gate`/`protect-files` kapsam genişletme (Düşük); ru "Два блока" ifadesi ve tırnak tutarlılığı (Düşük).
  **Dalga 6 bitti.**
- 2026-11-13: Dalga 6 sadeleştirme (Ponytail) atlandı: değişiklik çoğunlukla YAML/belge, kaynak kodda küçük. Dalga 7 başladı (P20a camera-integrator; taban 4626d85).
- 2026-11-13: P20a ✅ — `src/main/camera/` (sidecar yaşam döngüsü: rastgele belirteç, yalnız 127.0.0.1, stdin kapanınca çıkış,
  10 dk'da 3 çökme → bildirim, 5 → vazgeç; bridge; `safeStorage` sırlar; redact), `camera`/`camera.enroll` yetkileri, 16 `camera.*`
  ayarı, `camera.status/restart/setSecrets/testTelegram`; `src/main/network/telegram/` (5 sn, sessiz, `network.enabled`);
  Python: Telegram kaldırıldı, kod bulguları P20a maddeleri, `requirements.txt` sabit, 57 pytest + ruff; migrasyon yok.
  P20afix (security-reviewer + privacy-auditor Yüksek): şifrede `/`/`@` olsa da maske (TS + Python), sağlık hatası maskeli
  (`camera.status`'a sır sızmaz), `no-network-guard` `127.0.0.1.evil.com`/`localhost@evil.com` açığı kapandı, ESLint muafiyeti
  yalnız global `fetch` (+ `node:net` tek satır), sırlar audit commit'inden sonra yazılır, belirteç Python'da ortamdan silinir.
  Privacy "Telegram fotoğraf varsayılanı açık" bulgusu **sahip kararı K-50** (varsayılan açık) olduğu için değiştirilmedi.
  P20c'ye: Python tarafındaki yüz vektörü/kırpma düz SQLite/JPEG (K-51 gereği DB'ye şifreli taşınacak), silme audit'i, log'da ad/oda
  yok testi; P20b/P20f'ye: eski `static/index.html` + `Baslat_*`/`Otel_*` betikleri; Düşük: Telegram sohbet sayısı üst sınırı,
  sidecar'a izinli env listesi, `pickFreePort` yarışı. 2737 test yeşil. **Dalga 7 bitti.**
- 2026-11-13: Dalga 7 sadeleştirme dalga 8 ile birlikte yapılacak. Dalga 8 başladı (P20b + P20d, camera-integrator ×2; taban 82775c2).
- 2026-11-13: P20b ✅ — Kamera ekranı `/camera` (durum kartı, canlı MJPEG yalnız ana bilgisayar penceresinde, renderer'da SVG yüz kutuları
  ve Kiril/Türkçe etiketler, alarm listesi yeni → görüldü → halledildi), Ayarlar → Kamera (sırlar yalnız yazılır, Telegram'ı dene),
  yordamlar `camera.streamUrl/live/alerts/markAlert/setAlarmsPaused`, CSP `img-src 127.0.0.1:*` + `policy.ts` tam port süzgeci,
  129 anahtar, e2e masaüstü + telefon. P20d ✅ — modeller yalnız yerelden (`model_loader.py`, YOLO_OFFLINE/HF_HUB_OFFLINE + sync kapalı,
  ağ yamalı test), `resources/camera/models/README.md` (dosyalar depoda yok), THIRD_PARTY_NOTICES kamera bölümü (K-57 lisans uyarısı),
  `bytetrack_lite.py`, tek eşik + "emin değil" bandı (`camera.uncertainMargin` 0,06 otonom varsayılan), OpenCV çizimi kalktı →
  `/api/overlay`, yayın yalnız izleyici varken küçültülmüş; 95 pytest. Birleştirmede kutu sözleşmesi eşitlendi (yan süreç 0..1 köşe →
  servis piksel kutusu; "emin değil" yüzde ad gösterilmez). P20bfix: `camera.markAlert` işleyicisi `await` (security Yüksek) + test.
  Kontroller: ui-reviewer (Kritik/Yüksek yok), privacy-auditor (Kritik/Yüksek yok), turkish-ui-copy (7 metin düzeltmesi).
  P20c'ye: Python'un `/alerts` + `/guest_photos` diske yazması (K-53), zorunlu `SHA256SUMS` (P20f), `camera.alerts` telefonda açık
  (yalnız id/zaman; S-108 gereği bilinçli). P21e'ye: telefonda durum kartında boş sarmalayıcı, filtre sekmeleri 2×2 kenarlık, "Gördüm/
  Hallettim" düğme dili, `numberInvalid` ondalık biçimi, ru `crashedBody` çoğul anahtarları, P20d'nin 3 yeni ayarı için ayar alanı,
  canlı etiket yazı boyutu. 2805 test yeşil. **Dalga 8 bitti.**
- 2026-11-13: Sadeleştirme (dalga 7–8, Ponytail lite): yalnız `camera-service.ts` `setSecrets` kısaltıldı (net −12 satır, 2805 test aynı); diğer dosyalarda değer bulunmadı.
- 2026-11-13: Dalga 9 başladı (P20c: db-migration-builder → camera-integrator; taban 4a582db).
- 2026-11-13: Dalga 9 sadeleştirme dalga 10 ile birlikte. Dalga 10 başladı (P20e + P20g, camera-integrator ×2; taban c44ba3c).
- 2026-11-13: P20e ✅ — aydınlatma metni şablonu (`features/camera/privacy-notice.tsx`, tr/en/ru, m.10 unsurları, otel bilgisi ve saklama
  süreleri ayardan, Telegram açıksa yurt dışı aktarım notu, tek A4 yazdırma; Kamera ekranı + sihirbazın Kamera adımı), ayar
  `camera.privacyContact`, imha raporu (`camera.retentionReport`, audit'ten sayılar), personel dışlama listesi: migrasyon **0022**
  `staff_faces` (yalnız şifreli vektör, kırpma yok, kişi başı en çok 3; yan sürece ad/oda olmadan "personel, alarm yok"; listeden çıkınca /
  işten ayrılınca / pasif yapılınca fiziksel silme + audit; yedek/kopya dışı) (otonom varsayılan: alarm üretmemesi için vektör şart),
  konaklayan misafirin süreli yüzü silinmez. P20g ✅ — sihirbazın isteğe bağlı Kamera adımı + Ayarlar "Yeniden tara": donanım →
  `camera.profile`/`camera.profiles`, ONVIF + SADP keşfi `src/main/camera/discovery.ts` (`node:dgram`, yalnız özel IPv4, 5 sn, elle
  başlar; ESLint/kanca istisnası yalnız bu dosya), Hikvision RTSP kalıbı, `probe_camera.py` ile tek kare testi (önizleme `data:`),
  şifre `safeStorage`; kurulum bitmeden yan süreç başlamaz; 122 pytest. Birleştirme: 8 dosyada iki tarafın eklemesi birleştirildi.
  Düzeltmeler (privacy/security): pasif personelin yüzü de silinir; otel ağı dışı RTSP adresi kaydedilmez (K-49); keşif dosyasında
  ESLint yalnız `dgram`'a izin verir. Geçersiz bulgular: "rıza sütunu yok" (K-58 sahip kararı), "koyu temada yazdırma" (`usePrint`
  yazdırırken `.dark`'ı kaldırıyor). **Sahip onay paketine (avukat):** aydınlatma metnindeki hukuki sebep (m.5/2-f; biyometri için m.6/3
  şartı) ve personel yüz kaydı tasarımı (Kurul notu `06` §6.1). P21e'ye: probe'da ffmpeg yönlendirmesi/URL yeniden kurma, Python özel IP
  listesi eşitleme, RTSP kullanıcı adında CR/LF reddi, keşifte paket/sonuç sınırı ve tek tarama kilidi, önizleme `image` `.max()`,
  `camera.staff` `desktopOnly`, `BISMUTH_CAMERA_PYTHON` paketli sürümde kapalı, telefonda personel satırı düğmeleri, ru yazdırma tek
  A4 doğrulaması, aydınlatma metninde toplama yöntemi/alıcı grupları. 2958 test yeşil. **Dalga 10 bitti.**
- 2026-11-13: Dalga 10 sadeleştirme dalga 11 ile birlikte. Dalga 11 başladı (P20f packager + P21b feature-builder; taban 96684ee).
- 2026-11-14: Dalga 11 sadeleştirme dalga 12 ile birlikte. Dalga 12 başladı (P21c + P21d, feature-builder ×2; taban 2f3369f).
- 2026-11-14: P21c ✅ — Portföy ekranı `/portfolio` (owner: `remote.settings` + `reports.finance` görüntüleme, servis katmanında): kayıtlı
  her otel için bu gece doluluk, kasa, dönem gelir/gider/kâr (otelin kendi para biriminde; aynı para birimi ≥2 otelde "Toplam", kur çevirisi
  yok), kaynak rozeti (canlı / "Yedek kopya, son eşitleme"); otel seçici + salt-okunur takvim (`CalendarGrid`; telefonda gün listesi);
  istemcide etkin otel canlı, diğerleri `replica/<kod>` kopyasından; ana bilgisayarda yalnız kendi oteli + "kendi cihazınızdan bağlanın".
  Rakamlar mevcut servislerden (yeni hesap yok). P21d ✅ — geç çıkış ücreti (öneri ayardan, çıkış diyaloğu + Para sekmesi), gelmeme bedeli
  (`penalty`), hasar depozitosu (migrasyon **0023** `damage_deposits`; alınınca gelir değil, iade gelir dışı, gelire çevirme o gün), tek A4
  gece raporu; kurallar Ayarlar → Otel → Ücretler (varsayılan "yok"). Oturum kesildiği için birleştirme WIP commit'i (2ba01b2) olarak
  kaydedilmişti; bu turda doğrulandı. Düzeltmeler: gece raporunda gelmeyenler listesi boş kalıyordu (Yüksek, db-reviewer) + test; gelire
  çevirme `extras` edit de ister; gelire çevrilmiş depozitonun hasar kalemi tek başına iptal edilemez; depozito alma/iade kapalı gün kilidine
  uyar; gece raporu sorgusu `checkOut >= gün` ile sınırlandı; portföy kılavuz eşlemesi. turkish-ui-copy 7 metin düzeltmesi.
  P21e'ye: portföyde telefonda alt boşluk, ücret kartı `SelectTrigger` tam genişlik, `fees-panel` hata durumunda "Tekrar dene", gece raporu
  dolu görüntü + yazdırma görüntüsü, `damage_deposits.method_id` dizini, gece raporu N+1 bakiye sorgusu, `connect-page` onay metni kalıbı.
  **Dalga 12 bitti.**
- 2026-11-14: Dalga 12 sadeleştirme dalga 13 ile birlikte. Dalga 13 başladı: P21e iki pakete bölündü (A arayüz feature-builder,
  B servis/güvenlik camera-integrator; liste `faz-21` "P21e iş listesi"). **P21a atlandı (otonom varsayılan):** sahip her otelin
  ayrı bilgisayarı olduğunu söyledi (S-115, K-54); faz belgesi "bütçe yetmezse atlanır, öncelik düşük" diyor; tek makinede çoklu
  profil ileride gerekirse ayrı faz.
- 2026-11-14: P21e ✅ — A (arayüz): H-13, H-20 (alan etiketleri; ad/oda gösterimi servis tarafı kaldı), H-22, H-23, H-26, H-27 (Ay
  sonunda "ayın tamamı" etiketi, otonom varsayılan), H-30 (tek kayıt + boş not ipucu; "kendi devrin okunmamış" kaldı), H-31 (gelecek güne
  ödemede yalnız uyarı, otonom varsayılan), H-32/H-47, H-37…H-43, H-45, H-46; H-29 zaten çözülmüş; mükerrer misafir kartı önerisi;
  Ayarlar "Sık kullanılan"; 05 cila #2, #3, #5, #6 (#1 kısmen: takvim sayfasında lejant/Park için kaydırma sürüyor); kamera arayüz
  maddeleri (ru çoğul için ana süreç `tFor` çoğul desteği), `fees-panel` "Tekrar dene", bağlan ekranı onay metni. B (servis/güvenlik):
  Drive taramasında eşlenmiş ağ sürücüleri atlanır, `saveAlertAsGuest` tek transaction, probe adresi parçalardan yeniden kurulur +
  ffmpeg `protocol_whitelist`, Python özel IP listesi TS ile aynı, RTSP kullanıcı adında denetim karakteri reddi, keşifte 400 paket/200
  sonuç + tek tarama, önizleme 1 MB sınırı, `camera.staff` yalnız ana pencere (arayüz de yalnız orada listeler), Telegram 5 sohbet / 12 sn,
  gece raporu tek seferde 3 sorgu, `stop-gate` kapsamı. Telefon e2e bu turda koşulamadı (Playwright chromium yolu yok) → Son dalgada.
  **Dalga 13 bitti. Faz 21 kodu tamam (P21a atlandı).**
- 2026-11-14: Dalga 14 başladı (P22a + P22b, feature-builder ×2; taban 5b0af10). Sadeleştirme (dalga 9–13) dalga 14 sonrasına.
- 2026-11-14: P22a ✅ — `scripts/perf-measure.mjs` (açılış, süreç başına RSS/PSS/CPU boşta + yoğun, `--light`, `--attach` Tauri için),
  programda `--perf-out` bayrağı (paketli sürüm; talimat `docs/kurulum.md` sonu), **hafif mod** (`app.lightMode`, varsayılan kapalı,
  otonom varsayılan: yalnız ana bilgisayar kipinde; pencere kapanınca tepside kalır, arayüz mevcut `127.0.0.1` sunucusundan tarayıcıda;
  e2e). Ölçüm (Codespace): boşta toplam RSS 871 → 589 MB (−%32), PSS 566 → 379 MB (−%33) hafif modla; GPU bayrakları fayda vermedi,
  reddedildi; tembel import `date-holidays` senkron kullanıldığı için yapılmadı. Tablo `11-rust-gecisi.md` §7. P22b ✅ —
  `src/renderer/lib/shell/` (`electron.ts` köprüye dokunan tek dosya, `browser.ts`), 6 çağrı taşındı, ESLint `no-restricted-properties`
  ile köprü erişimi yalnız `lib/shell/electron.ts` + `lib/transport/**`. Telefon e2e bu ortamda koşulamadı → Son dalgası.
  **Dalga 14 bitti.**
- 2026-11-14: Dalga 15 başladı (P22c rust-shell-builder; taban 8637baf). Codespace'te Rust yoktu; pip önbelleği ve `release/` silinerek 8,7 GB yer açıldı.
- 2026-11-14: P22c ✅ — `shell-tauri/` Tauri 2.12.5 prototipi (WebView'da `out/renderer`, Hono + servisler Node yan süreçte `127.0.0.1`,
  HTTP taşıma; menü, pencere durumu; `capabilities` boş), `perf-measure.mjs --tauri`. Aynı ölçüm (Codespace/Xvfb, 3 koşu medyanı):
  boşta PSS Electron 567 MB → Tauri 800 MB (**+%41**), RSS 864 → 1.010 MB, uygulama hazır 2,57 sn ≈ 2,57 sn, yoğun CPU 2,8 kat.
  **K-62 kuralı (≥ %30 kazanç yoksa Electron kalır) → Electron kalır.** Windows (WebView2) ve Mac (WKWebView) ölçülmedi; servisler Node'da
  kaldıkça kabuk değişiminin tavanı tahminen −%9…−%14. Karar sayfası `docs/analiz/13-tauri-karar.md`. **Durma noktası (otonom):** sahibe
  soru sorulmadı; K-62'nin kendi kuralı uygulandı, P22d/P22e açılmadı (sahip isterse Windows PC'sinde deneme adımları `shell-tauri/README.md`).
  Ek: `kbs-data-guard` harf/rakam bitişik dizileri (hex özetler, `Cargo.lock`) kimlik numarası saymaz (+ kanca testi, 117 senaryo).
  **Dalga 15 bitti; dalga 16 açılmadı. Sıradaki: Son dalgası.**
- 2026-11-14: **Son dalgası başladı** (taban 904f184; sahibin Mac'i: aynı anda en çok 1 ajan, testler/e2e parça parça). Sıra:
  S1 okuma sürüsü — modül grupları G1 rezervasyon/takvim/misafir, G2 para/rapor/turizm/portföy/ücret, G3 operasyon/Bugün/personel,
  G4 sistem (giriş, kurulum, ayarlar, odalar, yedek, aktarma, uzaktan, kılavuz), G5 kamera; grup başına `bug-hunter`, akış testi C/D +
  QA2b doğrulaması `flow-tester`, sonra `security-reviewer`, `db-reviewer`, `privacy-auditor`, `decision-auditor`,
  `requirements-tracer`, `turkish-ui-copy`, `ui-reviewer`, `screen-auditor` (raporlar `.tmp/son/<ad>.md`) → S2 düzeltme paketleri
  (grup başına, Yüksek ve üstü + ucuz Orta) → S3 Ponytail `full` grup başına → S4 `/owner-review`. Her paketten sonra commit + push.
  Ön iş: `yaml` doğrudan devDependency (npm 11 Vite'ın isteğe bağlı eşini kurmuyordu, typecheck kırmızıydı); `npm run dev` Mac'te
  pencereyi açıyor (önceki erken bitiş yeniden üretilemedi; uygulama hata yazmadan temiz kapanmıştı — çağıran süreç kapatmış olmalı).

- 2026-11-14: Son/G1 ✅ — `bug-hunter` G1 (rezervasyon/takvim/misafir): 9 bulgu (1 Yüksek, 3 Orta, 5 Düşük), fuzz 60×220 adım değişmez
  ihlali yok. Düzeltme 5b9a312: grup ödemesi panel ve `payGroup` tek kural (`groupPayableMinor`; çıkış yapmış odanın borcu sayılır,
  iptal/gelmedi dışarıda), saatlik satış misafir geçmişinde gece sayılmıyor, saatlik kayıtlı odada otomatik arıza bloğu açılıyor,
  gelmeme bedeli kapalı gün kilidine uyuyor, misafir birleştirmede grup lideri taşınıyor, iptalde tutulan para `totalSpent`'te,
  iptal/gelmedi rezervasyona borçtan fazla tahsilat reddediliyor, geç çıkış saati yerel saat. **Açık (sahip onay paketine):** toplu
  çıkışta KBS boşluğu olan odalar ayrılmıyor (servis tek çıkışta da reddetmiyor; sözleşmeye alan gerekir). Not: `isolation: worktree`
  ajanları bu Mac'te eski tabandan açıldı → düzeltmeler izolasyonsuz ajanla ana checkout'ta.
- 2026-11-14: Son/G2 ✅ — `bug-hunter` G2 (para/rapor/turizm/portföy/ücret): 10 bulgu; defter ↔ rapor ↔ ay sonu ↔ portföy rakamları
  rastgele senaryoda tutarlı. Düzeltme 424da09: gece raporunda maaş sızıntısı (Yüksek, K-42) kapandı; ücret/depozito işlemleri kapalı
  gün gerekçesi alıyor; "gelire çevir" geri alınabiliyor (bağlı ödeme yöntem+tutar+tarihle bulunuyor; açık bağ sütunu migrasyon
  isterdi); defterde iptal rezervasyon aranabiliyor; gelecek gün kapatılamıyor; gider tarihi ≤ 1 yıl ileri; konaklama türü süzgeci
  ALOS/dışa aktarmada. Dokunulmadı (ürün kararı): elle kurda akla yatkınlık uyarısı.
- 2026-11-14: Son/G3 ✅ — `bug-hunter` G3 (operasyon/Bugün/personel + QA2b): 12 bulgu (4 Orta). QA2b: 44 px, uzun metin, kopyalama
  temiz; alan sınırları eksikti. Düzeltme 6ee7de7: "her N konaklamada" şablonunda N değişimi sayacı sıfırlamıyor, dolu odaya konan
  bakım/arıza çıkıştan sonra blok açıyor, kamera alarmı/kopma bildirimi Bugün kartında (`camera.todayNotice`, K-50), personel tarih
  doğrulamaları + ay içinde ayrılan panelde, yasal turizm görevi tek giriş (tik = bildirildi), alan sınırları, ad tekrarı reddi,
  kapanmış çamaşır ayı kilidi. Bırakılan (ürün kararı): avansın maaşı aşma eşiği, kapanmış çamaşır ayını yeniden açma.
- 2026-11-14: Son/G4 ✅ — `bug-hunter` G4 (sistem): 12 bulgu (1 Yüksek, 2 Orta). Düzeltme 6f64c06: defter içe aktarmada dolu ama
  okunamayan tarih satır hatası (önceki güne yazılmıyordu); bozuk `connection.json` istemciyi yerel moda düşürmüyor (yasak 13);
  istemci modunda `forgetHost`/`leaveClient`/`acceptHostIdentity` yetki + kilit denetimi; dışa aktarmaya 7 veri kümesi (depozito,
  maaş dönemi/kuralları `staff.salary` ile, listeler; G-122); CSV koruması telefonlara `'` eklemiyor; kurulum geri almada saat
  dilimi, oda no harf duyarsız tekil, denetim kaydında para satırları `payments` yetkisine bağlı, ödeme tarihi ≤ 1 yıl ileri.
  Bırakılan: pasif oda tipine oda ekleme, ağ zaman aşımının toplam 5 sn olması (gerekçeler `.tmp/son/fix-g4.md`).
