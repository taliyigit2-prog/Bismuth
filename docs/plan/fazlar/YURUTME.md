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
Makine: **2 çekirdek, 8 GB** (Codespace) → aynı anda en çok **2 kodlayan ajan**; kontrol ajanları kodlayanlar bitince.
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
| 1 | P17a Vazgeçme ve iade akışı (undoCheckIn, iptal/çıkışta ödeme + iade, kapalı rezervasyonda menü, raporda iptal/gelmedi/iade satırları) | 17 | booking, calendar, reports | calendar-specialist | $12–18 | | ⬜ |
| 1 | P19c Depo temizliği (prototypes arşiv, faz0 iş akışları, icon, yerel yollar, kanca istisnaları) | 19 | — | feature-builder-lite | $2–4 | | ⬜ |
| 2 | P17d Gündüz kullanımı 2.0 + ikinci tur hatası + H-06 (migrasyon **0019**) | 17 | booking, reservations, settings | db-migration-builder → calendar-specialist | $15–22 | | ⬜ |
| 2 | P18a ui-shot çoklu boyut/ölçek/dil + ölçüm JSON; Electron e2e Codespace'te yeşil | 18 | scripts, tests/e2e | feature-builder-lite | $2–4 | | ⬜ |
| 3 | P17b Grup rezervasyonu + toplu giriş (migrasyon **0020**) | 17 | booking, reservations | db-migration-builder → calendar-specialist | $15–22 | | ⬜ |
| 3 | P18c Pencere: F11, tam ekran/zoom hatırlama, çoklu monitör | 18 | main/windows, main/app | feature-builder | $6–10 | | ⬜ |
| 4 | P17c Hızlı takvim: sağ tık, hızlı çubuk, çoklu seçim (+ toplu ödeme), bugün şeridi, son iptaller listesi, park nedeni etiketi | 17 | calendar | feature-builder | $8–12 | | ⬜ |
| 4 | P17e Yüksek/Orta hata düzeltmeleri (02 raporu; H-05, H-07, H-08, H-09, H-19, H-21, H-24, H-25, H-44) | 17 | bulguya göre | feature-builder / calendar-specialist | $10–14 | | ⬜ |
| 5 | P18b Düzen düzeltmeleri (05 raporu) | 18 | features/*, layouts | feature-builder | $8–12 | | ⬜ |
| 5 | P18d Çalışmayan öğeler (akış testi) | 18 | bulguya göre | feature-builder | $6–10 | | ⬜ |
| 6 | P19a Sürüm iş akışı tekleştirme (tetikleme sahipte) | 19 | .github, electron-builder | packager | $5–8 | | ⬜ |
| 6 | P19b Kurulum belgeleri + kılavuz + sihirbaz tek kâğıt adımı + belge çelişkileri (Ç-01/02/04/05); P19d ajan bakımı | 19 | docs, guide, setup, .claude | feature-builder-lite (+ feature-builder sihirbaz) | $4–8 | | ⬜ |
| 7 | P20a Kamera yan süreç iskeleti + Python hijyeni + Telegram'ın Bismuth'a taşınması (K-50; kod bulguları `ekler/kamera-kod-bulgulari.md` §0) | 20 | main/camera, main/network/telegram, otel-kamera | camera-integrator | $12–20 | | ⬜ |
| 8 | P20b Kamera sekmesi (canlı yayın yalnız ana bilgisayar; telefon alarm listesi) | 20 | features/camera | camera-integrator | $8–12 | | ⬜ |
| 8 | P20d Model sabitleme ve çevrimdışı (K-57: mevcut modeller kalır, telemetri kapalı, lisans notu) | 20 | otel-kamera, resources/camera | camera-integrator | $4–6 | | ⬜ |
| 9 | P20c Veri entegrasyonu (migrasyon 0021, şifreleme, alarm → bildirim; rıza alanı yok K-58) | 20 | camera, today | db-migration-builder → camera-integrator | $15–22 | | ⬜ |
| 10 | P20e KVKK paketi (aydınlatma şablonu, saklama/imha, personel dışlama) | 20 | camera settings | camera-integrator | $8–12 | | ⬜ |
| 10 | P20g Kamera kurulum sihirbazı (K-59: donanım otomatik, Hikvision keşif + RTSP kalıbı + test) | 20 | features/setup, main/camera/discovery, otel-kamera/discovery | camera-integrator | $10–15 | | ⬜ |
| 11 | P20f Kamera paketleme (torch dahil; gerekirse ayrı kamera eki kurulumu) | 20 | electron-builder, resources | packager | $12–18 | | ⬜ |
| 11 | P21b İstemci çoklu ana bilgisayar (K-54: kayıtlı otel listesi) | 21 | remote | feature-builder | $8–12 | | ⬜ |
| 12 | P21c Portföy özeti (iki otelin takvimi, gelir-gider, doluluk, kasa) | 21 | portfolio | feature-builder | $8–12 | | ⬜ |
| 12 | P21d Geç çıkış, no-show bedeli, hasar depozitosu kalemi, gece raporu | 21 | booking, reports | feature-builder | $6–9 | | ⬜ |
| 13 | P21e Orta/Düşük bulgular (02 + 04 listesi, faz-21) | 21 | bulguya göre | feature-builder-lite / feature-builder | $4–6 | | ⬜ |
| 13 | P21a Profil altyapısı (isteğe bağlı; tek makinede iki otel) | 21 | main/app/paths, auth, settings | feature-builder | $10–15 | | ⬜ |
| 14 | P22a Ölç ve hafiflet (perf betiği, Electron denemeleri, hafif mod) | 22 | scripts, main/windows, main/app | feature-builder | $15–30 | | ⬜ |
| 14 | P22b Kabuk soyutlaması `lib/shell` (Electron + tarayıcı) | 22 | renderer/lib/shell, preload | feature-builder | $20–40 | | ⬜ |
| 15 | P22c Tauri 2 prototipi + aynı ölçümle karşılaştırma + sahip karar sayfası (**durma noktası**) | 22 | shell-tauri/ (ürün dışı) | rust-shell-builder | $60–120 | | ⬜ |
| 16 | P22d Tauri ürünleştirme (yalnız sahip "devam" derse); P22e Rust servis pilotu (yalnız darboğazda) | 22 | shell-tauri, .github, docs | rust-shell-builder + packager | $80–160 (+$100–200) | | ⬜ |
| Son | Tam kontrol sürüsü (bug-hunter + flow-tester modül başına, decision, security, db, ui, screen, privacy, copy, tracer) → **modül başına Ponytail `full` sadeleştirme turu (K-61; testler aynı)** → düzeltme turu → `/owner-review` | — | — | hepsi | $50–75 | | ⬜ |

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
