# 03 — Resepsiyon geri bildirimi: dört madde, kök neden ve çözüm tasarımı

> Hazırlayan: Fable (2026-11-12). Kaynak: resepsiyon çalışanlarının gerçek kullanımdan bildirdiği dört madde
> (`docs/fable-talimati.md` §3). Kod izi kaynak dosya ve satır numaralarıyla verilmiştir; satır numaraları
> `claude/fable-analiz` dalının 2026-11-12 tarihli hâline aittir.
> Yeniden üretim betiği: `docs/analiz/ekler/resepsiyon-repro.test.ts.txt` (7 vitest senaryosu; geçici olarak
> `src/main/services/` altına kopyalanıp `npx vitest run --project node <dosya>` ile koşuldu, 7/7 geçti, sonra silindi).

## 0. Özet tablo

| # | Resepsiyonun sözü | Sınıf | Kök neden (kısa) | Önem | Büyüklük |
|---|---|---|---|---|---|
| 1 | Odaya girdi, beğenmedi, iade istedi; panelde üç nokta yok, iptal edilmiyor | Eksik akış + küçük UI hatası | Misafir odadayken iptal servis tarafından reddedilir; çıkış yapılmış rezervasyonda üç nokta menüsü hiç çizilmez; "girişten sonra vazgeçme + iade" akışı yok; resepsiyon rolünde iade yetkisi yok | **Kritik** | M |
| 2 | Takvim baştan sadeleşsin; toplu müşteri girişi; bir isme kayıtlı rezervasyonlar ortak görünüyor | Eksik özellik (+ belirsiz şikâyet) | Sağ tık ve çift tık yok; grup kimliği ve toplu giriş yok; çok odalı tek rezervasyon tek panelde yönetiliyor; misafir geçmişi aynı karta bağlı her konaklamayı listeliyor | **Yüksek** | L |
| 3 | İptal edilen / ödemesi olan rezervasyon takvimden tam çıkmıyor | Tasarım kararı + eksik akış | İptal ızgaradan tam çıkıyor (kanıtlandı). Takvimde kalanlar iptal edilemeyen `checked_in`/`checked_out` kayıtlar ve park alanındakiler; ödeme iptalde iade edilmiyor, defterde kalıyor | **Yüksek** | M |
| 4 | Sabah girip akşam çıkan müşteriden sonra oda aynı gün tekrar satılamıyor | Tasarım kararı (K-44) çalışıyor; üç sınır durumu eksik | Çıkış basılmadan satış engelli; bir odada günde tek gündüz yuvası; gün içinde ikinci tur sonrası gece yuvası kilitli kalıyor (K-44 metnine aykırı) | **Yüksek** | M (tam day-use modeli: L) |

## 1. Ortak zemin: durum makinesi ve panel menüsü

### 1.1 Durumlar

- Rezervasyon: `tentative`, `confirmed`, `checked_in`, `checked_out`, `cancelled`, `no_show`, `parked`
  (`src/main/db/schema/reservations.ts:75-83`).
- Oda konaklaması (`reservation_rooms.status`): `planned`, `in_house`, `done`, `cancelled` (`reservations.ts:121-123`).
- Panelde "açık" sayılanlar: `OPEN_STATUSES = tentative, confirmed, checked_in`
  (`src/renderer/features/calendar/reservation-panel.tsx:52`).

| Geçiş | Servis (`src/main/services/reservations-service.ts`) | Koşul / red |
|---|---|---|
| yeni → tentative/confirmed | `create` :786 | `calendar.edit`; kara liste; çakışma (`checkSlots` :238) |
| tentative ↔ confirmed | `setStatus` :1292 | yalnız bu ikisi |
| planned → in_house (rez. → checked_in) | `checkIn` :1314 | giriş günü gelmiş olmalı |
| in_house → done (açık oda kalmazsa rez. → checked_out) | `checkOut` :1350 | erken çıkışta kalan geceler boşalır (K-44) |
| açık → cancelled | `cancel` :1148 → `endReservation` :719 | kapalıysa `reservationClosed` (:730-736); **odada misafir varsa `guestInHouse` (:737)**; kalınmış oda varsa rezervasyon `checked_out` olur (:753) |
| açık → no_show | `noShow` :1158 → `endReservation` | + kalınmışsa `reservationStarted`; varıştan önce `noShowTooEarly` |
| açık → parked | `park` :1196 → `endReservation` | geceler boşalır, ödeme kalır; `parkedFromStatus` saklanır |
| parked → açık | `unpark` :1207 | yeni tarih/oda |
| tek oda iptali | `cancelStay` :1167 | yalnız `planned` oda |

**Geri dönüş yok:** `checked_in` → iptal, `checked_out` → iptal, "girişi geri al" servisi yok (`undoCheckIn` için grep boş).

### 1.2 Panel üç nokta menüsü (`reservation-panel.tsx`)

```
editable  = can('calendar','edit') && OPEN_STATUSES.has(status)        // :134
canCancel = editable && !inHouse.length                                 // :148
canPark   = canCancel && !stayed                                        // :149
parked    = status === 'parked' && can('calendar','edit')               // :150
menü çizilir  ⇔ editable || parked                                      // :222
```

| Durum | Üç nokta | İçerik |
|---|---|---|
| tentative / confirmed | var | Park et, Gelmedi, (çok odalıda "Oda N: iptal et"), Rezervasyonu iptal et |
| checked_in, en az bir oda `in_house` | var | **yalnız pasif satır** "Misafir otelde; önce çıkış yapın." (:267-269) |
| checked_in, kimse odada değil | var | Rezervasyonu iptal et (kalınan geceler korunur) |
| **checked_out / cancelled / no_show** | **yok** | — (`editable` false) |
| parked | var | Gelmedi, İptal |
| Rol `calendar.edit` yoksa | yok | — |

Yetkiler (`src/shared/permissions.ts:57-60`, sıra: owner, manager, reception, accountant, housekeeping, employee):
`payments: E E E E N N` · `payments.refund: E E N E N N` · `payments.void: E E N N N N`.
**Resepsiyon iade giremez.** Ödeme penceresi iade türünü bu yetkiye göre gizler (`payment-dialog.tsx:111`).

## 2. Madde 1 — "Odaya girdi, beğenmedi, iade istedi; üç nokta yok, iptal edilmiyor"

### Kök neden

1. **Misafir odadayken** (`in_house`): `canCancel` false → menüde iptal yerine pasif "Misafir otelde" satırı
   (`reservation-panel.tsx:148, 267-269`). Servis de reddeder: `errors.guestInHouse` (`reservations-service.ts:737`).
2. **Çıkış yapıldıktan sonra** (`checked_out`): `editable` false → **üç nokta hiç çizilmez** (`:134, :222`); servis
   `reservationClosed` (`:730-736`). Resepsiyonun "üç nokta çıkmıyor" tarifi en çok bu durumla örtüşüyor: iade için
   önce çıkış yapıp sonra iptal denemek doğal akıştır.
3. **Konaklamayı "hiç olmamış" yapan bir işlem yok.** `endReservation` kalınan odayı korur (`:738-753`). Bu bilinçli
   bir tasarım (veri silinmez, G-24; K-44 erken çıkış). Ama "girişten sonra vazgeçildi, para iade edildi"
   senaryosunun ekranda hiçbir karşılığı yok.
4. **İade yolu var ama resepsiyona kapalı:** `payments-service.create` `kind='refund'` (`payments-service.ts:139, :186`);
   iade tutarı net tahsilatı aşamaz (`assertRefundCovered` :167-180). Yetki `payments.refund` resepsiyonda **N**.
5. Çıkış penceresinde giriş günü çıkış = gündüz kullanımı ücreti; ücret `dayUsePriceMinor` ile değiştirilebilir
   (`reservations-service.ts:1408-1410`), 0 yazılabilir mi doğrulanmadı (sözleşme şemasına bakılmalı).

**Sınıf:** eksik akış (Kritik) + küçük UI hatası (menünün açılıp tek pasif satır göstermesi; kapalı durumda menünün
tamamen kaybolması). Hata değil, ama resepsiyon için "çalışmıyor" ile aynı etki.

### Yeniden üretim

Betikteki `1)` bölümü: `in_house` iken `cancel` → `guestInHouse`; `checkOut` sonrası `cancel` → `reservationClosed`;
`reception` ile `refund` → `PERMISSION_DENIED`, `manager` ile geçer. Mevcut testlerde `guestInHouse` iptal reddi için
doğrudan servis testi yok; `in_house`/`checked_out` panel menüsü için UI testi yok.

### Olması gereken akış: "Vazgeçme ve iade"

Üç ayrı gerçek durum vardır; program üçünü de tek bir menü başlığı altında sunmalı: **"Misafir vazgeçti…"**

| Durum | Ne olur | Para | Kayıt |
|---|---|---|---|
| A. Odaya girdi, kısa süre sonra çıktı (aynı gün) | Çıkış yap → ilk gece gündüz kullanımına döner (K-44); kalan geceler boşalır | Gündüz ücreti 0 ya da indirimli yazılabilir; fazlası **iade** satırı olur | `checked_out`; audit: `checkout.early` + `payment.refund` |
| B. Hiç kalmadı sayılacak (sahip kararı: "ücret alınmaz") | Yeni işlem **"Girişi geri al"**: `in_house` → `planned`, sonra iptal | Tüm tahsilat iade | `cancelled`; audit: `checkin.undo` + `reservation.cancel` + `payment.refund` |
| C. Bir gece kaldı, sonraki geceleri iptal etti | Çıkış yap (erken) | Kalan geceler iade, kalınan gece kalır | `checked_out` |

Tasarım kuralları:
- Hiçbir kayıt silinmez: iade `payments` tablosunda `kind='refund'` satırı; iptal `status` değişikliği; her adım
  `audit_log` (mevcut altyapı yeterli: `payments-service.ts:139-190`, `reservations-service.ts:719`).
- **Çıkış ve iptal penceresi ödemeleri göstermeli:** "Bu rezervasyonda 2.000 ₺ tahsilat var. İade: [tutar] [yöntem]"
  seçeneğiyle iade aynı pencerede girilir (tek giriş, G-60). İade yetkisi yoksa pencere "iade için müdür onayı
  gerekir" der ve rezervasyonu **"İade bekliyor"** nedeniyle park eder (mevcut `refund_pending`, `reservations-service.ts:189`).
- Kapalı rezervasyonda (`checked_out`) üç nokta menüsü **görünür kalmalı** ve "İade gir", "Geçmişi gör", "Not ekle"
  sunmalı. Menünün yok olması "program bozuk" algısı yaratıyor.
- Kasa/defter: iade satırı negatif tahsilat olarak günün defterine düşer, kasa teslimine (x) dahil edilir;
  `handover_id` mevcut mekanizmayla bağlanır. Rapor: iade ayrı sütun (bugün var mı doğrulanmadı; `reports/queries.ts`).
- "Girişi geri al" için yeni servis `reservations.undoCheckIn`: yalnız giriş gününde, odada KBS işaretli kişi varsa
  uyarı; `room_nights` yuvalarına dokunmaz; `audit`.

**Sahibe soru (S-100):** Resepsiyon kendi başına iade girebilsin mi (bir üst sınıra kadar), yoksa her iade müdür/sahip
onayı mı istesin? Varsayılan: resepsiyon iade giremez, "İade bekliyor" diye park eder; sahip telefon uygulamasından
onaylar (yetki `payments.refund` değişmez).

## 3. Madde 2 — "Takvim sadeleşsin; toplu müşteri girişi; bir isme kayıtlı rezervasyonlar ortak görünüyor"

### Bugünkü durum (kod)

- Tek tık işlemleri (`calendar-grid.tsx`): boş hücre → yeni rezervasyon (`:860` → `calendar-page.tsx:514-526`);
  çubuk → panel (`:950`); sürükle → tarih/oda taşı (`:728, :951`, `MoveStayDialog`); blok → blok paneli (`:887`);
  gün başlığı → gün görünümü (`:629`). **Sağ tık menüsü ve çift tık yok** (`onContextMenu`/`onDoubleClick` grep boş).
- Toplu: bir rezervasyona en çok 30 oda (`RoomMultiPicker`, `new-reservation-dialog.tsx:459`; sözleşme
  `reservations.ts:48`), toplu not (`bulk-note-dialog`). **Grup kimliği yok** (`groupId` grep boş), **toplu giriş yok**:
  "Giriş yap" oda başına (`reservation-panel.tsx:184-199`), servis tek konaklama alır (`checkIn` :1314).
- Çok odalı rezervasyonda tüm odalar aynı misafir ve tek folyo (`folios_reservation_unique`); oda başına kişi adı
  ancak Kişiler sekmesinden sonradan girilir.

### "Ortak görünüyor" cümlesinin iki olası anlamı

| Yorum | Kodda karşılığı | Resepsiyon ne yaşar |
|---|---|---|
| (a) **Bir isimle birden çok oda alındığında hepsi tek rezervasyon, tek panel, tek folyo.** | `detail()` tüm odaları tek panelde verir; "Rezervasyonu iptal et" hepsini iptal eder; oda başına iptal ayrı menü satırı (`:249-258`) | Aynı isimle gelen ama ayrı ödeyen iki müşteriyi ayrı yönetemez; birini çıkarmak için doğru satırı bulmak zor |
| (b) **Aynı misafir kartına bağlı tüm geçmiş konaklamalar panelin Özet sekmesinde listelenir.** | `guest-summary-card.tsx:86-190`, servis `guests.guestHistory`; ad yazılınca her seferinde yeni kart açılır (`resolveGuest` `reservations-service.ts:158-181`, ad eşleştirme yok) | Aynı adlı farklı kişiler birleşmiş gibi görünür ya da aynı kişinin geçmişi bölünür (G-51 birleştirme ile çözülüyor) |

İki yorum da kodla destekleniyor; hangisi olduğu ekran görüntüsü olmadan kararlaştırılamaz. **Sahibe soru (S-101).**

### Önerilen sadeleştirilmiş takvim (tasarım taslağı)

Amaç: en sık beş işlem tek tıkla, geri kalanı sağ tık menüsünde.

1. **Boş hücreye tık → hızlı rezervasyon çubuğu** (ad, kişi sayısı, gece, fiyat, kanal; Enter ile kaydet). Mevcut
   diyalog "ayrıntılı" düğmesinin arkasına.
2. **Çubuğa tık → panel** (mevcut). Panel başlığında büyük üç düğme: **Giriş yap · Ödeme al · Çıkış yap**; durum ne
   olursa olsun üç nokta menüsü görünür (içerik duruma göre).
3. **Sağ tık menüsü** (çubuk ve boş hücre için ayrı): Giriş yap, Çıkış yap, Ödeme al, Taşı, Uzat/kısalt, Not,
   Park et, Gelmedi, Vazgeçme ve iade, Misafir kartı. Telefonda uzun basma.
4. **Çoklu seçim** (Ctrl/Shift ile çubuk seçimi) → üst araç çubuğunda **Toplu giriş**, **Toplu çıkış**, **Toplu not**,
   **Toplu ödeme**. Seçim aynı rezervasyonun odaları ya da aynı grup kimliğine bağlı rezervasyonlar.
5. **Grup rezervasyonu**: `reservations.group_id` (yeni sütun, migrasyon 0019) + grup adı; takvimde aynı grup aynı
   kenarlık deseniyle; grup panelinde oda listesi ve oda başına misafir adı; **toplu giriş** = grup panelindeki tek düğme
   (`booking.checkInMany` yeni yordam, var olan `checkIn`'i döngüde çağırır, tek transaction).
6. **Bugün şeridi**: takvimin üstünde "Bugün gelecekler N · Gidecekler N · Otelde N" ve tıklayınca liste (mevcut
   `today.summary` yordamı kullanılabilir).
7. Oda satırında misafir adının yanına **aynı misafir başka odada da varsa** küçük zincir simgesi (yorum (a)/(b) için
   görünür açıklama).

Bu tasarım G-30…G-48'i bozmaz; yeni gereksinim satırları gerektirir (G-193 grup rezervasyonu ve toplu giriş,
G-194 sağ tık/hızlı işlemler). Faz 17 paketleri: P17b (grup + toplu giriş, L), P17c (sağ tık/hızlı rezervasyon, M).

## 4. Madde 3 — "Rezervasyon silinmiyor; ödemesi olan iptal edilince takvimden tam çıkmıyor"

### Kanıt: iptal ızgaradan tam çıkıyor

Takvim sorgusu yalnız `ON_GRID = tentative, confirmed, checked_in, checked_out` getirir
(`src/main/services/calendar/grid.ts:63-65, :124, :402-406`); iptalde `room_nights` satırları kaldırılır
(`removeNights` `reservations-service.ts:369-383`). Betik `3)`: kaporalı (2.000) rezervasyon iptali → `status=cancelled`,
oda `cancelled`, 0 gece, ızgarada 0 konaklama; folyo `chargesMinor 0 / creditedMinor 200000 / balanceMinor -200000`.

### Öyleyse takvimde kalan nedir?

1. **İptal edilemeyen kayıtlar:** `checked_in` / `checked_out` rezervasyonlar (Madde 1). `checked_out` ızgarada kalıcıdır
   (ON_GRID içinde). Resepsiyon "iptal ettim" sanıp aslında edemediği kayıt budur. **En olası neden.**
2. **Park alanı:** `parked` rezervasyon ızgaradan çıkar ama tablo altındaki Park alanında durur (`park-area.tsx`,
   `reservation-view.ts:525-575`); kapatmak için oradan Gelmedi/İptal gerekir (`park-area.tsx:117-127`).
3. **Ödeme kalıyor:** iptal ödemeyi ne void eder ne iade üretir ne de engeller (`endReservation` ödemelere dokunmaz;
   `reservation-flow.test.ts:270-273` bunu doğrular). Folyo alacaklı (-2.000) kalır; defter ve kasada tahsilat görünür;
   iptal penceresi iade sormaz (`stay-dialogs.tsx:258`). "Tam çıkmıyor" sözü defter/kasa kaydını da kapsıyor olabilir.
4. **Silme düğmesi yok:** bilinçli (CLAUDE.md yasak 11, G-24). Bir "Sil" asla eklenmemeli; ama "iptal edilen kayıtları
   göster/gizle" süzgeci ve geçmiş listesi gerekir.

Doğrulanmadı: gerçek uygulamada iptal sonrası ızgaranın tazelenmesi (`booking-api.ts:94-102` `isCalendarQuery` ile
geçersiz kılıyor; bayat veri kanıtı yok). Flow testi (bkz. `05-ekran-ve-tam-ekran-uyumu.md`) bunu doğrulamalı.

### Çözüm

- Madde 1'deki "Vazgeçme ve iade" akışı (iptal/çıkış penceresinde ödeme özeti + iade satırı + "İade bekliyor" parkı).
- İptal penceresi: "Bu rezervasyonda X ₺ tahsilat var" uyarısı ve üç seçenek: **İade gir** (yetki varsa) ·
  **İade bekliyor olarak park et** · **Tahsilat kalsın** (ör. iptal bedeli; neden zorunlu).
- Takvim lejantına "İptal/gelmedi kayıtları geçmişte görünür: Misafir kartı → Geçmiş" notu; takvim üst çubuğuna
  "Son iptaller" küçük listesi (7 gün), böylece "nereye gitti?" sorusu cevaplanır.
- Raporlarda iptal/gelmedi/iade ayrı satırlar (bugün var mı: `reports-service.ts` doğrulanmadı → hata raporu P17e).

## 5. Madde 4 — "Sabah girip akşam çıkan müşteriden sonra oda aynı gün tekrar satılamıyor"

### Mevcut model

- Konaklama `[giriş, çıkış)`; `checkIn === checkOut` gündüz kullanımı, tek `day` yuvası (`src/shared/domain/stays.ts:1-19`).
  Aynı tarihte `night` ve `day` yuvaları ayrı; çakışma `findConflicts` (`stays.ts:67-126`); DB `UNIQUE(room_id, date, slot)`
  (`reservations.ts` ~:158). Hata metni `errors.roomOccupied` (`tr.json:1379`).
- K-44 (`06-kararlar.md:51`): giriş günü çıkış = o günün gündüz kullanımı; ilk gece ücreti gündüz ücreti kalır; kalan
  geceler iptal; "oda bu gece yeniden satılabilir". Kod: `checkoutPlan` (`booking.ts` ~:74-84), `checkOut`
  (`reservations-service.ts:1350-1430`).
- Gündüz fiyatı ayrı değil (G-37, S-25): gecelik öneri fiyat kullanılır; çıkış penceresinde değiştirilebilir.
- Turizm istatistiği: aynı gün = 1 gece (`tourism/ministry-table.ts:3, :174-185`, 03-mimari §6.11). Satışı etkilemez.

### Betik sonuçları (`4)` bölümü, 4/4 geçti)

| Senaryo | Sonuç | Yorum |
|---|---|---|
| A. 1 gecelik, sabah giriş, çıkış **basılmadan** aynı gece ikinci satış | `roomOccupied` | Çıkış basılınca ilk gece `day` yuvasına döner ve gece satılır. Akış çalışıyor; **çıkış kaydı yapılmadan satış engelli**. Resepsiyon çıkışı basmadan satmayı deniyorsa "satılamıyor" yaşar |
| B. Aynı oda, aynı gün ikinci gündüz kullanımı | `roomOccupied` | Tek `day` yuvası: **günde bir gündüz + bir gece**. Sabah ve öğleden sonra iki ayrı gündüz müşterisi satılamaz |
| C. Gün içinde ikinci tur: A çıktı, oda geceye satıldı (b), b de aynı gün girip çıktı | `daySlotFree=false` → gece yuvası yerinde kalır, `checkOut = checkIn+1` (`:1393-1421`) | Stay `done` ama gece satırı duruyor; **oda o gece yeniden satılamaz, misafir gitmiş**. K-44 "oda bu gece yeniden satılabilir" ikinci turda karşılanmıyor → **hata sayılmalı** |
| D. Gündüz kullanımı + aynı gece satışı | geçer | Tasarım gereği |

Ek kısıt: süren konaklamanın ortasına gündüz kullanımı yazılamaz (G-37, `stays.ts:97-109`).

Mevcut test kapsamı: tek tur K-44 (`booking-fixes.test.ts:111-141`, 2 gecelik) ve tek gündüz yuvası
(`booking-panel.test.ts:98-100`). **Yok:** 1 gecelik aynı gün çıkış, ikinci tur (C), iki gündüz kullanımı mesajı.

### Butik otel pratiği (araştırma özeti; kaynaklar `04-otel-ihtiyaclari.md` §3)

Protel: ayrı "Day Use" fiyat kodu, oda başına günde bir day-use, geceleme ve müsaitlik sayılmaz, takvimde kırmızı +
saat simgesi, raporda ayrı satır. Mews: day-use ayrı "hizmet", aynı oda hem day-use hem gece; sabah/öğleden sonra iki
hizmet tanımlanabilir; saatlik hizmet ayrı. Opera: 0 gece + day-use fiyat kodu. HotelRunner: aynı gün giriş-çıkış +
çıkış saatini ileri alma. Ortak desen: **day-use geceleme değildir, gece satışını engellemez, oda başına günde bir ya
da saat aralığıyla birden fazla, sabit gündüz fiyatı, ayrı rapor satırı.** KBS/istatistikte day-use'un nasıl sayıldığı
için resmî kaynak bulunamadı (doğrulanmadı; sahibin muhasebecisine sorulmalı).

### Önerilen tasarım: "Gündüz kullanımı 2.0" (ayarlı, gereksinim değişikliği gerektirir)

1. **Saat aralıklı gündüz yuvası.** `room_nights.slot` `'night' | 'day'` yerine `'night' | 'day'` + yeni sütunlar
   `start_time`, `end_time` (HH:MM, yalnız `day` için). `UNIQUE(room_id, date, slot)` kaldırılıp yerine uygulama
   kuralı: aynı gün `day` yuvaları **saat aralığı çakışmazsa** birden fazla olabilir (`findConflicts` saat kontrolü).
   Migrasyon 0019 (yeni tablo/indeks; eski indeks `DROP INDEX`, veri korunur).
2. **Ayarlar (otele özel kural = ayar):** `dayUse.enabled`, `dayUse.maxPerRoomPerDay` (varsayılan 1; 0 = sınırsız),
   `dayUse.turnoverMinutes` (temizlik arası, varsayılan 60), `dayUse.defaultStart/End` (ör. 10:00–18:00),
   `dayUse.priceMode` (`nightly` = gecelik öneri, `fixed` = oda tipi başına sabit gündüz fiyatı, `hourly`),
   `dayUse.countsInOccupancy` (raporda doluluğa girsin mi; varsayılan hayır), `dayUse.kbsReport` (KBS'ye bildirilir;
   varsayılan evet — 1774 sayılı Kanun her konaklamayı kapsar; doğrulanmadı).
3. **Çıkışta ikinci tur düzeltmesi (hata C):** `checkOut` aynı gün çıkışta gündüz yuvası doluysa gece satırını
   `day` yuvasına **saat aralığıyla** çevirir (turnover sonrası), gece yuvası boşalır. `dayUse.enabled=false` ise en
   azından gece satırı `day` yuvası doluyken **ikinci bir `day` satırı** olarak saklanır ve gece boşalır (benzersizlik
   kuralı `(room_id, date, slot, start_time)` olur).
4. **Takvimde gösterim:** gündüz kullanımı yarım yükseklikte çubuk, saat simgesi, lejantta "Gündüz"; aynı gün ikinci
   gündüz kullanımı yan yana iki yarım çubuk; gece çubuğu altta tam. Telefonda gün listesinde "Gündüz 10:00–16:00".
5. **Oda durumu:** gündüz çıkışı odayı "kirli" yapar (mevcut); `turnoverMinutes` dolmadan yeni gündüz/gece satışında
   uyarı (engel değil).
6. **Raporlar:** gündüz geliri ayrı satır; doluluk ve ADR'ye katılım ayara bağlı; turizm istatistiğinde aynı gün = 1 gece
   kuralı değişmez (§6.11), ama `dayUse.kbsReport=false` ise istatistiğe girmez.
7. **Fiyat:** `priceMode=fixed` için `room_types.day_use_price_minor` (yeni sütun) ya da ayar tablosu; `hourly` için
   `hour_price_minor` × saat (yuvarlama `money.ts`).

Gereksinim etkisi: G-37 değişir ("ayrı fiyat yok" kalkar), yeni G-195 (saat aralıklı gündüz kullanımı ve aynı gün
çoklu satış, ayarlı), K-44'e ek (K-48 taslağı). Hata C düzeltmesi gereksinim değişikliği beklemeden yapılabilir (K-44
metni zaten "yeniden satılabilir" diyor).

**Sahibe sorular (S-102…S-105):** sabit gündüz fiyatı mı saatlik mi; günde kaç gündüz satışı; temizlik arası kaç dakika;
gündüz misafiri KBS'ye bildiriliyor mu ve istatistikte geceleme sayılsın mı. Varsayılanlar yukarıda.

## 6. Test ve kabul ölçütleri (plan paketlerine girecek)

- P17a (Madde 1+3): `in_house` iptal reddi testi; `checked_out` panelde menü var ve "İade gir" çalışır; iptal
  penceresinde ödeme uyarısı ve üç seçenek; `undoCheckIn` servisi (yetki, audit, aynı gün kuralı); iade satırı defter
  ve kasa teslimine düşer; e2e: "misafir girdi, vazgeçti, iade" senaryosu masaüstü + telefon.
- P17b (Madde 2 grup): `group_id`, grup paneli, `checkInMany`; e2e toplu giriş 3 oda.
- P17c (Madde 2 hızlı işlemler): sağ tık menüsü, hızlı rezervasyon çubuğu, çoklu seçim; e2e.
- P17d (Madde 4): hata C birim testi (betikteki `C` senaryosu beklenen davranışa çevrilir), saat aralıklı gündüz
  yuvası, ayarlar, takvim gösterimi, rapor satırı; e2e: sabah gündüz, akşam gece, ertesi sabah tekrar gündüz.

## 7. Bu rapordan çıkan sahip soruları

Numaralar `00-ozet.md`'deki tek listeyle aynıdır: S-100 (iade yetkisi), S-101 ("ortak görünüyor" hangi anlam),
S-102–S-105 (gündüz kullanımı kuralları), S-106 (grup rezervasyonu tek folyo mu oda başına folyo mu).
