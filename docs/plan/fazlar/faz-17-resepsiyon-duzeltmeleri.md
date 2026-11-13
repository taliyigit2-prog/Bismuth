# Faz 17 — Resepsiyon düzeltmeleri (vazgeçme ve iade, grup, hızlı takvim, gündüz kullanımı 2.0)

> Kaynak: resepsiyonun gerçek kullanımdan dört maddesi (`docs/analiz/03-resepsiyon-geri-bildirimi.md`), paket kartları
> `docs/analiz/08-gelistirme-plani.md` §1. Yürütme `/orkestra`, dalgalar 1–4 (`YURUTME.md`; P17c dalga 4, P17b'den sonra).

## Amaç

Resepsiyonun "çalışmıyor" dediği dört durumu kapatmak: girişten sonra vazgeçen misafirin iadesi, iptal edilen kaydın
takvimden ve paradan doğru biçimde çıkması, grup/toplu giriş ve sade takvim, aynı odanın aynı gün tekrar satılması.

## Gereksinimler
G-193 (vazgeçme ve iade, ZORUNLU), G-194 (grup ve toplu giriş, ZORUNLU), G-195 (hızlı takvim, ÖNEMLİ), G-196 (gündüz
kullanımı 2.0, ZORUNLU); G-37, G-39, G-42, G-43, G-46, G-60. Kararlar: K-44, K-48 (kesin), K-55 (kesin).

## Ön koşul
Faz 5–16 kodu (`main` ile aynı taban), `npm run check` yeşil, migrasyon sırası **0019 (P17d, dalga 2)** ve **0020 (P17b, dalga 3)**.

## Sorular
**Cevaplandı (2026-11-13, `06-kararlar.md` 7. tur):** S-100 resepsiyon iade girebilir; S-101 = (a) grup; S-102 saatlik,
tutarı resepsiyon girer, kurulumda varsayılan saat ücreti; S-103 sınırsız; S-104 KBS'ye bildirilir; S-105 raporlara dahil +
konaklama türü filtresi + aylık saatlik sayısı; S-106 tek hesap (varsayılan). Soru kalmadı.

## Teslimatlar
1. **P17a Vazgeçme ve iade** — `booking.undoCheckIn`; `in_house` menüsünde "Vazgeçme ve iade" (aynı gün çıkış + iade /
   girişi geri al + iptal / erken çıkış); iptal ve çıkış pencerelerinde tahsilat özeti ve iade satırı ya da "İade
   bekliyor" parkı; `checked_out` panelde üç nokta menüsü (İade gir, Geçmiş, Not); iade satırı defter + kasa teslimi;
   raporlarda iptal / gelmedi / iade ayrı satırlar (bugün yalnız net toplam); `undoCheckIn`'de odada KBS işaretli kişi
   varsa uyarı; **resepsiyon iade girebilir** (`payments.refund` resepsiyon rolünde varsayılan E, rol ayarından
   kapatılabilir; K-55); kılavuz §3–4 güncel.
2. **P17b Grup rezervasyonu** — migrasyon 0020 (`reservation_groups`, `reservations.group_id`); oda başına misafir adı;
   grup paneli; `booking.checkInMany/checkOutMany` (atomik); takvimde grup deseni + lejant; folyo kipi ayarı (S-106).
3. **P17c Hızlı takvim** — sağ tık / uzun basma menüsü; hızlı rezervasyon çubuğu; Ctrl/Shift çoklu seçim + toplu
   işlemler (not/giriş/çıkış/ödeme); bugün şeridi; panel başlığında Giriş yap · Ödeme al · Çıkış yap düğmeleri; takvim
   üst çubuğunda "Son iptaller" (7 gün) listesi + lejant notu; park alanında park nedeni etiketi (S-101 = a: zincir
   simgesi yapılmaz).
4. **P17d Saatlik konaklama (gündüz kullanımı 2.0, K-48)** — migrasyon 0019 (`room_nights.start_time/end_time`, indeks
   `(room_id, date, slot, start_time)`, `room_types.hourly_price_minor` isteğe bağlı); `dayUse.turnoverMinutes` ayarı
   (uyarı); aynı odada aynı gün **sınırsız** saatlik satış, yalnız saat çakışması engel; tutarı resepsiyon satış anında
   girer (varsayılan: oda tipi saat ücreti × saat, yoksa boş); kurulum sihirbazında ve Ayarlar → Fiyatlar'da isteğe bağlı
   saat ücreti; ikinci tur çıkışında gece yuvası boşalır (hata C); takvimde saatli çubuk; KBS listesine girer; raporlara
   **dahil** + "konaklama türü: gecelik / saatlik" filtresi + aylık saatlik satış sayısı; H-06 (çıkış penceresinde
   "aynı gün ücreti" varsayılanı saat ücretinden, 0 için onay, yuva doluysa alan gizli).
5. **P17e Yüksek/Orta hata düzeltmeleri** (Kritik H-01 P17a'da) — `docs/analiz/02-hata-raporu.md` §2'de "P17e" işaretli bulgular:
   H-05 telefon numarası maskesi (+90/0 ayıklama, yapıştırma), H-07 misafir adı uzunluk sınırı + istemci 400'leri,
   H-08 gecelik fiyat doğrulama (negatif/üst sınır/`abc`/0 onayı), H-09 yetkisiz ayar sekmesi adı sızıntısı; 2. oturum:
   H-19 serbest metin üst sınırları (zod `max` + sayaç), H-21 firma formu (telefon maskesi, benzersizlik, alan altı hata),
   H-24 tutar üst sınırı hata metni, H-25 rehber telefon/ad sınırı, H-44 `maxLength` sessiz kesme → ortak sayaç; her biri
   için yeniden üretim testi.

## Kabul ölçütleri
- [x] `in_house` rezervasyonda "Vazgeçme ve iade" menüsü üç seçeneği sunar; `checked_out` rezervasyonda üç nokta menüsü
      görünür (vitest `reservation-panel` durum × menü matrisi, 7 durum).
- [x] `undoCheckIn`: yalnız giriş günü, yetki, audit; yetkisiz rol reddi (servis testi).
- [x] İptal penceresi tahsilat varsa tutar + üç seçenek; iade satırı `ledger.day`'de ve kasa tesliminde (servis + e2e).
- [x] "Girdi, vazgeçti, iade" e2e masaüstü + telefon yeşil.
- [x] 3 odalı grup: oda başına ad, toplu giriş atomik, takvimde desen (migrasyon + servis + grid + e2e). Testler: `reservation-groups.test.ts` (3 odalı grup, atomik giriş), `group.spec.ts` (masaüstü + telefon).
- [x] Sağ tık menüsü ve hızlı çubuk klavyeyle erişilebilir; telefonda uzun basma (e2e `quick-actions.spec.ts` masaüstü: "menü tuşu ve boşluk", telefon: "gün listesinde uzun basma…"; vitest `quick-actions.test.tsx`).
- [x] Betik C senaryosu: ikinci tur çıkışından sonra oda o gece satılabilir (servis testi `hourly-stays.test.ts` "A girip öğleden sonra çıkar, B geceyi alıp…", kırmızıdan yeşile).
- [x] Aynı gün üç saatlik satış saat çakışmazsa olur, çakışırsa saatli `roomOccupied`; temizlik arası dolmadan uyarı ama
      engel yok (domain testi 8 senaryo `stays.test.ts` + servis `hourly-stays.test.ts` + e2e `hourly.spec.ts`).
- [x] Saatlik tutar resepsiyonun girdiği değerdir; saat ücreti ayarlıysa önerilir; raporlarda saatlik satışlar dahil ve
      türe göre süzülebilir, aylık sayı görünür; saatlik misafir KBS listesinde; turizm istatistiği kuralı değişmedi
      (`hourly-stays.test.ts`, `reports-service.test.ts` "konaklama türü süzgeci", `hourly-stay.test.tsx`; turizm testleri yeşil).
- [x] H-06: çıkış penceresinde aynı gün ücreti saat ücretinden önerilir, 0 onay ister (servis `dayUseFreeNeedsConfirm` + panel
      testi), gündüz yuvasında boş aralık yoksa alan gizli.
- [ ] P17e listesindeki her bulgu için test kırmızıdan yeşile.
- [ ] `npm run check`, hedefli e2e, `ui-reviewer` + `turkish-ui-copy` + `db-reviewer` + `decision-auditor` bulgularında Kritik/Yüksek yok.

## Teknik notlar
- Durum makinesi değişmezleri `endReservation`/`settleStatus` korunur; yeni geçişler tabloya eklenir (03 §1.1).
- Saatlik konaklama = `room_nights.slot='day'` + `start_time/end_time`; gece yuvasını kilitlemez; `dayUse.maxPerRoomPerDay`,
  `dayUse.priceMode`, `dayUse.countsInOccupancy`, `dayUse.kbsReport` ayarları **yok** (sahip cevabıyla sabit kural).
- `room_nights` benzersizliği 0019'da `(room_id, date, slot, start_time)`; eski satırlarda `start_time` null = tüm gün.
- Para `amount_minor`; iade `payments.kind='refund'`, `assertRefundCovered` korunur; silme yok.
- Takvim ızgarası sanallaştırılmış; `dir="ltr"` adası; inline style yalnız konum/boyut.
- i18n: `booking.*`, `calendar.*`, `errors.*`, `settings.dayUse.*`; `tr-copy-guide` sözlüğü.

## Yapılmayacaklar
"Sil" düğmesi; OTA/kanal bağlantısı; fatura; gündüz kullanımı için saatlik ücretin otomatik hesabı dışında dinamik
fiyatlama; kamera (Faz 20).

## Sonuç
(Opus doldurur: yapılanlar, karşılanan G-xx, varsayılanlar, ölçümler, kalanlar.)

### P17d adım 2 — saatlik konaklama servis + ekran (calendar-specialist)
- Servis: `room_nights` yazan her yer saat alanlarını taşır (ekleme, düzenleme, taşıma, oda değişimi, ikinci tur çıkış);
  `findConflicts` saat aralığı denetler, tüm gün = null; `booking.createHourlyStay`, `booking.hourlyCheck`; çıkışta
  gündüz yuvası gerçekten kullanılan saatlerle yazılır (hata C); `reports.dayUseInOccupancy` artık okunmaz (S-105: her zaman dahil).
- Ekran: saatlik satış penceresi (takvim başlığı), saatli çubuk (şeritli), panel/gün listesinde saatler, Ayarlar → Odalar ve tipler'de
  saat ücreti + temizlik süresi, kurulum sihirbazında isteğe bağlı 7. adım (adım sayısı 13), raporlarda konaklama türü süzgeci.
- Varsayılanlar: saatlik tutar pozitif olmalı (0 yazılamaz); saat ücreti dakika oranıyla hesaplanır; "Ayarlar → Fiyatlar" = Odalar ve tipler sekmesi.

### P17b adım 2 — grup rezervasyonu servis + ekran (calendar-specialist)
- Servis (`reservations-service.ts`): `createGroup` (oda başına bir rezervasyon + misafir adı; adsız oda lideri alır; `folio_mode`
  oluştururken `booking.groupFolioMode` ayarından kopyalanır), `checkInMany` / `checkOutMany` (tek transaction, biri başarısızsa
  hiçbiri), `addGroupNote` (her odanın rezervasyonuna), `cancelGroup` (gelecek odalar iptal, hepsi kapanınca `voided_at`), `group`
  (görünüm). `create`/`checkIn`/`checkOut` gövdeleri `createIn`/`checkInIn`/`checkOutIn` olarak ayrıldı (davranış aynı).
  Sözleşme `contract/groups.ts`; yordamlar `booking.group/createGroup/checkInMany/checkOutMany/addGroupNote/cancelGroup`.
- Ekran: `group-panel.tsx` (oda listesi, toplu giriş/çıkış/not/iptal, grup toplamı), yeni rezervasyonda "Grup rezervasyonu" seçeneği
  (oda başına ad; oda rozetleri = 21st A5 kalıbı, bağımlılık yok), takvimde grup halkası (`--group-1…6`) + simge + lejant satırı,
  telefon gün listesinde grup simgesi, rezervasyon panelinde "Grup: ad" düğmesi, Ayarlar → Takvim'de grup hesabı seçimi.
- Varsayılanlar: grup için en az 2 oda; tek hesap kipinde her oda yine kendi folyosunu tutar (raporlar/KBS değişmez), grup paneli
  birleşik bakiyeyi gösterir. Açık: grup tek ödemesi ve çoklu seçimden gruba bağlama P17c (toplu ödeme) ile; grup iptali iade satırı
  yazmaz (iade odanın kendi panelinden).

### P17c — hızlı takvim işlemleri (feature-builder)
- Yapılanlar: sağ tık menüsü (çubukta 10 işlem, boş hücrede 4; `context-menu.tsx`, `stay-actions.ts`; işlemler rezervasyon panelinin kendi
  diyaloglarını `requestPanel(id, intent)` ile açar, "Giriş yap" doğrudan servis), Shift+F10 / Menü tuşu ve Boşluk (seçim) kısayolları
  `registry.ts`'te, telefonda gün/hafta listesinde uzun basma (shadcn `context-menu`, yeni bağımlılık yok); hızlı rezervasyon çubuğu
  (`quick-book-bar.tsx`: ad, kişi, gece, gecelik fiyat = oda tipi önerisi, kanal; Enter kaydeder, "Ayrıntı" tam formu açar; N ve Enter da çubuğu açar);
  Ctrl/Shift çoklu seçim + `selection-bar.tsx` (toplu giriş/çıkış/not/ödeme, gruba bağla; aynı grubun odaları grubun atomik çağrısıyla);
  bugün şeridi (`today.summary`); "Son iptaller" (7 gün, yeni okuma `reservations.recentEnded`) + lejant notu; panel başlığında üç büyük düğme
  (uygun olmayan Giriş/Çıkış pasif görünür). Park nedeni etiketi park alanında zaten vardı (`calendar.park.reason.*`), değişmedi.
- EK (a): `booking.payGroup` (S-106 tek hesap: tutar odaların açık bakiyelerine rezervasyon sırasıyla dağıtılır, tek transaction, `payments.createIn`
  kancası; aşan tutar ve farklı para birimi reddedilir) + grup panelinde "Grup ödemesi al"; `booking.attachToGroup` (mevcut rezervasyonları yeni/mevcut
  gruba bağlar, audit önce/sonra); oda başına kipte satırda bakiye + "Ödeme al". (b): `cancelGroup` audit `before`; `onCheckout` kancası commit sonrası try/catch.
  (c): grup panelinde başlık/satır metni ayrıldı (`.charges`), 44 px düğmeler, gömülü " – " ve ":" i18n'e; `.description` ve `booking.group.open` kullanıldı.
- Karşılanan: G-195, G-194 (grup tek ödeme + bağlama), S-106. Varsayılanlar: zincir simgesi yok (S-101 a); toplu ödeme her rezervasyonun kendi bakiyesini kapatır
  (tutar seçimi yok); karma seçimde toplu giriş/çıkış konaklama konaklama çağrılır, kısmi başarısızlık sayılıp bildirilir (varsayılan).
- Servis ekleri (kart "servis değişikliği yok" demişti): `booking.payGroup`, `booking.attachToGroup`, `reservations.recentEnded`; migrasyon yok.
- Test: `group-pay.test.ts`, `permissions-groups.test.ts`, `quick-actions.test.tsx`, `stay-actions.test.ts`, `selection.test.ts`, `group-panel.test.tsx`,
  e2e `electron/quick-actions.spec.ts` (5 senaryo), `mobile/quick-actions.spec.ts` (2). Güncellenen: `calendar-page.test.tsx` (N artık çubuğu açar),
  `reservation-panel.test.tsx` (pasif "Çıkış yap" düğmesi nedeniyle tarih düğmesi seçicisi), e2e `calendar.spec.ts` (N → çubuk → Ayrıntı).

