# Faz 5 · Rezervasyon Takvimi (Tape Chart)

**Amaç:** Programın kalbi. Sahibin Excel'deki "Rezervasyon" tablosunu, 10 yıllık, akıcı, renkleri ayarlanabilir,
tek girişli bir takvim ekranına dönüştürmek.

**Gereksinimler:** G-30 … G-48, G-33 (renk ayarı), G-51 (otomatik tamamlama), G-45 (kara liste uyarısı), **G-53, G-54 (odadaki kişiler + KBS işaretleri)**.
**Ön koşul:** Faz 2 (veri modeli), Faz 3 (UI tasarım sistemi + bu ekranın onaylı taslağı), Faz 4 (giriş/roller).
**Sorular:** yok — S-10, S-11, S-20, S-22, S-23, S-24, S-25 cevaplandı (`06-kararlar.md` dördüncü tur).

## Teslimatlar

1. **Izgara bileşeni** (`features/calendar/`):
   - Satırlar: odalar (kat gruplu, sıralı). Sol iki sütun sabit (oda no, tip). Üst satır sabit (tarih + gün adı + özel gün işareti).
   - Sütunlar: günler; **sanallaştırma** ile yalnızca görünen aralık çizilir (hedef: 20 oda × 3650 gün'de 60 fps kaydırma, ilk çizim < 300 ms).
   - Hücre: konaklamanın o geceye düşen parçası; **isim + fiyat** (S-23); durum rengi (kısmen/kapora ayrı renk, S-10); simgeler: not, VIP, sürekli istek, **KBS'ye bildirilmemiş kişi**; "aynı gün iki misafir" için bölünmüş hücre.
   - Çok geceli konaklama tek **blok** olarak çizilir (hücreler birleşik, ilk hücrede isim), ama her gecenin rengi ayrı olabilir (gece gece ödeme).
   - Oda bloğu (satılmaz/bakım) siyah blok; geçmiş boş günler otomatik gri; bugün sütunu vurgulu.
2. **Rezervasyon oluşturma/düzenleme paneli** (sağdan açılan Sheet):
   - Boş hücreye tık → giriş tarihi dolu gelir; çıkış tarihi; oda(lar) çoklu seçim; misafir (otomatik tamamlama + "yeni misafir"); **odadaki kişiler** (G-54: ad, isteğe bağlı tanıtıcı not, "KBS'ye bildirildi" işareti; konaklama sırasında kişi ekleme; kişi sayısı buradan türetilir); kanal; gecelik fiyat + para birimi (**öneri fiyat**: oda tipi + hafta sonu/özel gün farkı, G-48; misafirin son ödediği fiyat yanında); gece gece fiyat düzenleme tablosu; not; durum.
   - Çıkış işlemi: "KBS çıkışı yapıldı" işareti; işaretsiz kişi varsa uyarı (G-53); oda otomatik kirli (G-90).
   - Çakışma kontrolü (aynı oda aynı gece iki kesin rezervasyon olamaz; day-use + gece aynı gün olabilir; "sonra" senaryosu: çıkış günü = diğerinin giriş günü serbest).
   - Kara liste eşleşmesinde kırmızı uyarı (G-45), devam için onay.
3. **Ödeme hızlı girişi** aynı panelde: tutar, para birimi, yöntem, kanal, tür (ödeme/kapora/iade). Kaydedilince takvim rengi anında değişir. (Defter ekranı Faz 7'de; ödeme kaydı aynı tabloya yazılır → tek giriş.)
4. **Park etme**: rezervasyonu "park et" (sebep: gelmedi / iade bekliyor / ertelendi / diğer) → takvimden kalkar, alttaki **Park Edilenler** panelinde listelenir; geri alınabilir; iade ödemesi girilebilir.
5. **Özel günler**: üst satırda bayram/özel gün rozeti; tıklayınca gün notu; haftanın vurgulu günleri (S-24); toplu ekleme diyaloğu (her X günü / tarih aralığı / yapıştırılan tarih listesi) — takvim notları Faz 9'da genişler, burada en az okuma + tek not ekleme çalışır.
6. **Gezinme**: bugün, tarih seç, ay/yıl atla, ileri/geri; misafir ara (sonuca atla); boş oda bul (tarih aralığı + tip → uygun odalar vurgulanır).
7. **Durum etiketleri** (Faz 3'teki ekranın gerçek veriyle çalışması): otomatik durumların adı/rengi/açıklığı, **özel etiketler** (ad + renk + anlam; rezervasyon panelinde çoklu seçim), öncelik; takvimde **lejant** paneli; hücre hem otomatik durumu hem özel etiketi gösterir (dolgu + kenarlık/şerit).
7b. **Misafir geçmişi ve sürekli istek** rezervasyon panelinde: misafir seçilince özet kartı (son konaklama, son gecelik fiyat, toplam gece/harcama) + "tüm geçmiş" bağlantısı (G-46/G-190); `standing_note` varsa sarı/kırmızı uyarı kutusu, hücre ipucunda da görünür (G-192). Odada açık arıza varsa uyarı (G-180).
8. Klavye (G-19, S-51 onaylandı): ok tuşlarıyla hücre gezme, Enter ile aç, N yeni rezervasyon.
9. **Açılış ekranı**: uygulama takvimle açılır (G-47).

## Kabul ölçütleri

- [x] (kısmen: ölçüm ekrana gelişte 350–400 ms (hedef 300 ms), kaydırmada 39 fps ortalama, GPU'suz ortam; performans e2e'si `BISMUTH_PERF=1` kapısında olduğundan CI'da koşmaz; gerçek cihazda 60 fps doğrulaması sahip onay paketinde; son kontrol) 19 odalı örnek veriyle 2026–2036 aralığında kaydırma takılmaz; profil ölçümü dokümante edilir. — e2e
  `calendar-perf.spec.ts` "19 oda × 2026–2036: ilk çizim, yıl atlama ve kaydırma ölçümü" (ölçümler P5a Sonuç'unda).
- [x] Excel senaryolarının tamamı girilebilir: çok oda (G-35), gece gece fiyat (G-36), aynı gün iki misafir ve day-use (G-37), satılmaz blok (G-38), park (G-39), kapora (G-43), not (G-34). — e2e
  `calendar-flow.spec.ts` "Excel senaryoları: çok oda, gece gece fiyat, not, kapora, aynı gün iki misafir, satılmaz blok,
  park ve açık arıza ızgarada"; servis `permissions-reservations.test.ts` (oda kapatma), `booking-panel.test.ts` (park).
- [x] Ödeme girilince renk değişir; aynı ödeme defterde (Faz 7) ikinci kez girilmez. — e2e `calendar-flow.spec.ts`
  "rezervasyon oluştur → ödeme gir → ızgara hücresinin rengi "ödendi" olur", `booking.spec.ts`; ödeme panelden aynı
  `payments` satırına yazılır (`booking.addPayment` → `payments-service.create`).
- [x] Renk/ad değişikliği anında uygulanır ve yeniden açılışta korunur; "VIP" özel etiketi oluşturulup bir rezervasyona atanır ve lejantta görünür. — e2e
  `calendar-flow.spec.ts` "durum rengi ve adı anında değişir, yeniden açılışta korunur; "VIP" etiketi lejantta ve
  hücrede" (program kapatılıp yeniden açılır); `status-style.test.ts` (ızgara ve panel etiket renklerini birlikte yazar).
- [x] Sürekli isteği olan misafir seçilince uyarı çıkar; geçmiş kartı son ödediği fiyatı gösterir. — vitest
  `new-reservation-dialog.test.tsx` "kayıtlı misafir seçilince geçmiş kartı son ödediği fiyatı, önemli sürekli isteği ve
  onay kutusunu gösterir".
- [x] Mobil görünümde takvim yerine gün/oda listesi açılır (Faz 13'te tamamlanır, burada yönlendirme var). — e2e
  `mobile/calendar.spec.ts`, vitest `calendar-page.test.tsx` "telefonda ızgara yerine gün listesi açılır…".
- [x] Kara listedeki ad yazılınca uyarı çıkar. — e2e `booking.spec.ts` "kara listedeki ad yazılınca kırmızı uyarı çıkar ve
  onaysız kaydedilmez".
- [x] Konaklamaya ikinci kişi eklenip KBS işareti verilmeyince hücrede uyarı simgesi çıkar; işaretlenince kalkar; çıkışta "KBS çıkışı" işareti istenir (G-53, G-54). — e2e
  `calendar-flow.spec.ts` "ikinci kişi KBS işaretsizse ızgaradaki çubukta uyarı simgesi çıkar, işaretlenince kalkar;
  çıkışta KBS çıkışı istenir"; servis `booking-panel.test.ts` "ikinci kişi KBS işaretsizse uyarı çıkar…".
- [x] Program takvimle açılır; öneri fiyat hafta sonu gecelerinde farklı gelir ve elle değiştirilebilir (G-47, G-48). — e2e
  `calendar-flow.spec.ts` "program takvimle açılır; öneri fiyat hafta sonu gecelerinde farklı gelir ve elle
  değiştirilebilir"; `booking-panel.test.ts` "öneri fiyat hafta sonu ve özel günde farklı gelir…".
- [x] Çakışma denemesi engellenir ve nedeni Türkçe açıklanır. — `booking-panel.test.ts` "aynı oda aynı gece iki kesin
  rezervasyon olmaz; hata oda numarasını, geceleri ve engel rezervasyonu söyler".
- [x] Rol: Resepsiyon oluşturur/düzenler; Muhasebeci yalnızca görür (yetki matrisine göre); yetkisiz işlem servis katmanında reddedilir. — `permissions-booking.test.ts`,
  `permissions-reservations.test.ts` (oda kapatma: muhasebe ve temizlik 403).
- [x] Birim testleri: çakışma kuralı, ödeme → gece dağılımı, gri/beyaz türetme. E2E: rezervasyon oluştur → ödeme gir → renk doğrula. —
  `domain/stays.test.ts` "dolu geceye ve satılmaz bloğa yazılamaz…", `domain/payment-allocation.test.ts` "6.000 borçlu 3
  geceye 2.000 ödeme → 1. gece ödendi, 2–3 ödenmedi", `domain/night-status.test.ts` "boş hücre: bugünden önce gri…";
  e2e `calendar-flow.spec.ts` "rezervasyon oluştur → ödeme gir → ızgara hücresinin rengi "ödendi" olur".

## Teknik notlar

- Izgara verisi: `room_nights` (oda × gece) sorgusu görünen tarih aralığı için; önbellek + değişiklikte yeniden sorgu.
- Durum türetme tek fonksiyonda (`deriveNightStatus(night, payments, today)`), hem takvim hem raporlar bunu kullanır.
- Renkler: `--status-paid`, `--status-unpaid`, `--status-partial`, `--status-dayuse`, `--status-past-empty`, `--status-empty`, `--status-blocked` CSS değişkenleri.
- Erişilebilirlik: renk tek bilgi taşıyıcı olmasın; hücrede küçük simge/kenarlık da olsun (renk körlüğü). Satılmaz blok koyu temada siyah değil (`--status-blocked` koyu: gri, Faz 1) — ayrıca çapraz desen/kilit simgesi taşır.

## Bu fazda yapılmayacaklar

- Defter ekranı (Faz 7), raporlar (Faz 10), oda durumu panosu (Faz 9), sürükle‑bırak ile taşıma (Faz 15'te değerlendirilir).

## Sonuç (2026-10-05)

### P5a — takvim ızgarası (madde 1, 5, 6, 7, 8, 9; telefon gün listesi; performans)

- **Izgara** (`features/calendar/calendar-grid.tsx`, saf model `grid-model.ts`): geçen yılın 1 Ocak'ından on yıl sonrasının
  31 Aralık'ına kadar (2025–2036, 4.383 sütun) tek kaydırmalı ızgara; yalnızca görünen günler + iki haftalık pay çizilir
  (pencere haftalık adımlarla değişir, kaydırmanın her pikselinde yeniden çizim yok). Oda sütunu ve gün başlığı sabit; ay
  adları başlıkta ay bandı olarak kayar. Konaklama tek çubuk, gece gece ödeme rengi; isim + gecelik fiyat (S-23); simgeler:
  uyarı, KBS eksik, VIP, sürekli istek, not, çocuk, kapora. Aynı gün iki misafir: gündüz kullanımı hücrenin ilk yarısı, o gün
  girişli gece ikinci yarısı. Satılmaz/kullanım dışı blok çapraz desen + kilit/anahtar simgesi (koyu temada gri). Geçmiş boş
  gün gri, bugün sütunu ve çizgisi vurgulu, vurgulu hafta günleri tonlu. Ön kayıt kesikli çerçeve. Renk tek bilgi taşıyıcı
  değil: çubuğun erişilebilir adı durum adlarını, KBS ve misafir notunu söyler.
- **Veri**: yeni okuma yordamları `reservations.grid` (aralık; `room_nights` tarih dizini üzerinden rezervasyonlar, folyo
  başına toplu ödeme dağılımı, bloklar, tatil/özel gün/notlar), `reservations.findStays`, `reservations.freeRooms`; yazma
  `calendar.addNote`. Takvim ay ay okunur (her ay ayrı önbellek; `reservations.grid` geçersiz kılınınca açık aylar yeniden
  okunur). Durum türetme tek yerde: `shared/domain/night-status.ts` (`deriveNightStatus` hücre durumu, `deriveFolioNights`
  folyonun bütün geceleri — §6.3 dağılımı + §6.14); hücre/kenarlık boyası `cellStyle`.
- **Özel günler (madde 5)**: başlıkta bayram/yarım gün/özel gün/etkinlik/not simgesi; gün başlığına tıklayınca günün
  kayıtları ve tek not ekleme; "Toplu not ekle" diyaloğu (hafta günleri / tarih aralığı / yapıştırılan liste, gün sayısı
  önizlemeli). Düzenleme ve iptal Faz 9'da.
- **Gezinme (madde 6)**: Bugün, ±1 hafta, ay ve yıl seçimi, "Tarihe git" (ay takvimi), misafir ara (ad, telefon, rezervasyon
  kodu; bugüne en yakın konaklama önce) → ızgara o hücreye gider ve çubuk kısa süre yanıp söner; "Boş oda bul" (giriş/çıkış +
  oda tipi; aynı gün giriş‑çıkış gündüz dilimine bakar) → uygun odalar satırda işaretlenir ve tarih aralığı çerçevelenir.
- **Durum etiketleri ve lejant (madde 7)**: renk/ad/açıklık `statusTags.list`'ten; kapalı otomatik durum §6.14 geri düşüşüyle;
  özel etiket kenarlık ya da (öncelikliyse) dolgu; lejant açık durumlar + açık özel etiketler.
- **Klavye (madde 8)**: ızgara odaklanınca imleç; oklar hücre, PageUp/PageDown hafta, Home bugün; Enter konaklamayı açar ya da
  boş hücrede yeni rezervasyon; N yeni rezervasyon. Hücre içeriği ekran okuyucuya söylenir.
- **Açılış (madde 9)**: `ui.startScreen` varsayılanı takvim (Faz 4'ten); e2e ile doğrulandı.
- **Telefon**: takvim yerine gün listesi (gelenler, gidenler, kalanlar, boş odalar) aynı `reservations.grid` servisinden.
- **Performans profili** (`tests/e2e/electron/calendar-perf.spec.ts`, `BISMUTH_PERF=1`; veri `seed-calendar.ts --dense`:
  19 oda, 2026–2036, 19.019 rezervasyon, ~123 MB veritabanı). Ölçüm ortamı: GPU'suz kapsayıcı, xvfb, yazılımla çizim.
  - Bir ay okuma (servis): 24–35 ms (ilk okuma 97–113 ms, tatil yılı üretimi dahil); ay başına ~140 konaklama, ~85 KB.
  - Ekrana geliş (başka ekrandan takvime, ilk çubuk görünene kadar): ~350–400 ms (hedef 300 ms; IPC + 3–4 ay okuma dahil).
  - Yıl atlama (2036 seçimi → çubuklar ekranda): ~0,9–1 sn (Playwright seçim etkileşimi dahil).
  - Sürekli kaydırma 30 px/kare (≈1.800 px/sn): ortalama 39 fps, p95 67 ms; 1 px/kare: 60 fps. Çubuksuz ızgara aynı
    ortamda 45 fps — kalan fark ortamın yazılımla çizmesinden. Ölçüm sırasında yapışkan isim etiketi ve `clip-path`
    kaldırıldı (24 → 39 fps). GPU'lu otel bilgisayarında 60 fps doğrulaması **sahip onay paketine**.
- Bağlantı noktaları: rezervasyon paneli, yeni rezervasyon diyaloğu ve park alanı (P5b) aynı ekranda gerçek servisle açılır
  (birleştirmede bağlandı; P5c uçtan uca doğruladı).

### P5b — rezervasyon paneli (madde 2, 3, 4, 7b)

- **Servis**: `reservations-service` — kara liste eşleşmesinde onaysız yazma reddi (`errors.blacklistMatch`; onay denetim
  kaydının gerekçesinde), yalnız özel etiket, panel alanları (`update`), ek oda (`addRoom`), çıkışta KBS çıkışı işaretleri
  (aynı işlemde, `in_house` yetkisiyle), çakışma hatasında oda no + geceler + engel rezervasyonun kodu. Okuma tarafı
  `reservation-view.ts`: panel görünümü (gece boyası §6.14, kişiler + `kbsMissing`, ödemeler yetkiye göre, odadaki açık
  arızalar), form listeleri, dolu odalar, park listesi, kara liste eşleşmesi. Öneri fiyat `shared/domain/booking.ts`.
- **Sözleşme**: `booking.*` (`procedures/booking.ts`, `handlers/booking.ts`); yazmalar panel görünümünü döner, arayüz
  ardından `reservations.*` ve `booking.*` okumalarını yeniler.
- **Arayüz**: yeni rezervasyon (sunucu aramalı misafir + yeni misafir hızlı formu, çoklu oda, gece gece fiyat, son ödediği
  fiyat, kanal, durum, etiketler, not, kara liste ve önemli sürekli istek onayı), panel (özet · geceler · para · kişiler;
  giriş, çıkış + KBS çıkışı uyarısı, ödeme/kapora/iade, park et, iptal, oda ekle/taşı, tarih değiştir), park alanı
  (takvime al, iade).
- **Testler**: `booking-panel.test.ts`, `domain/booking.test.ts`, `tests/unit/permissions-booking.test.ts`, panel ve form
  vitest; e2e `tests/e2e/electron/booking.spec.ts`, `tests/e2e/mobile/booking.spec.ts`.
- **(varsayılan)** Öneri fiyatta "özel gün" = takvimdeki bayram, yarım gün (arife) ve otelin özel günü; etkinlik ve not
  sayılmaz.
- **(varsayılan)** Kara listede "engelle" düzeyi (arayüzde "konaklatılmamalı") yazmayı Resepsiyon için engeller (`errors.blacklistBlocked`); yalnız `blacklist.remove` yetkilisi (Sahip, Müdür) onayla yazabilir. Diğer düzeylerde kırmızı uyarı + onay yeterlidir (G-45). Faz 5'teki ilk varsayılan ("yazmayı engellemez") Faz 6'da değişti (`reservations-service.ts:774-776`; faz-06 Sonuç; son kontrol).
- Izgara hücresinin rengi ve KBS simgesi ızgarada (P5a); panel aynı kuralları (`cellStyle`, `kbsMissing`) kullanır.

### P5c — bütünleştirme ve kalan kabul ölçütleri

- **Uçtan uca doğrulama** (ızgara + panel birlikte, gerçek uygulama): yeni e2e `tests/e2e/electron/calendar-flow.spec.ts`
  — Excel senaryoları tek akışta (çok oda, gece gece fiyat, not, kapora, aynı gün gündüz + gece, satılmaz blok, park, açık
  arıza), durum rengi/adı + "VIP" etiketi (yeniden açılışta korunur), KBS simgesinin ızgarada çıkıp kalkması ve çıkışta KBS
  çıkışı, hafta sonu öneri fiyatı ve elle değişikliği, ödeme → ızgara hücresinin rengi, kaydırmada isim etiketi.
- **Satılmaz blok takvimden** (G-38): Excel senaryosunun takvimde giriş yolu yoktu. Araç çubuğunda "Oda kapat" (yetki
  `rooms.block`): oda, ilk ve son gün, tür (satılmaz / kullanım dışı), neden, not. Bloğa tıklayınca (ya da klavyede Enter)
  bilgisi açılır; elle açılmış blok "Satışa aç" ile kalkar (süren blok bugün biter, başlamamış blok iptal edilir; silme yok,
  denetim kaydı var). Oda durumundan, arızadan ya da görevden açılan blok takvimden kaldırılmaz (`errors.blockHasCause`;
  nedeni kapanınca kalkar). Yeni yordamlar `reservations.createBlock` / `reservations.cancelBlock`
  (`procedures|handlers/reservations.ts`; servis `rooms-service.createBlock/cancelBlock`); ızgaradaki blok `manual` ve
  `note` alanlarını taşır. Satılmış gecelerin üstüne blok yazılmaz (`errors.blockOverReservation`).
- **Oda durumu bağlantısı** (S-14, G-90): çıkış, oda taşıma (tam ya da tarihten itibaren) ve taşınma günündeki eski oda artık
  `rooms-service.markRoomDirtyAfterCheckout` ile kirli olur: oda bakımda/kullanım dışıysa durumu korunur, odanın kendi
  denetim kaydı `reason: 'check_out'` ile yazılır.
- **Kur dondurma** (S-32, K-15): ödeme yazılırken (panel `booking.addPayment` → `payments-service`) o dakikanın kuru
  `freezeNow` ile donar; tutar/para birimi değişince yeniden. Panelde ödeme satırında, internet yokken son bilinen (6 saatten
  eski piyasa) kurla yazılmışsa küçük **"Eski kur"** rozeti ve ipucunda kurun tarihi/saati (`rateStale`, `rateObservedAt`;
  otel kuru ve elle yazılan kur eskimez).
- **Açık arıza** (G-180): ızgaranın oda sütununda açık/planlı arızası olan odada anahtar simgesi (acil = kırmızı), ipucunda
  arıza başlıkları (`housekeeping.openIssuesByRoom`).
- **İsim etiketi** (P5a notu): başı ekran dışında kalan konaklamanın adı artık ilk görünen sütunda durur; kaydırmada her
  sütun değişiminde yalnız bir CSS değişkeni (`--first-col`) güncellenir, ızgara yeniden çizilmez (çizim penceresi haftalık
  adımlarla kalır). Blok etiketleri de aynı kuralla.
- **Etiket renkleri**: `useTagStyles` artık her kullanıcının (ızgara, panel, ayar önizlemesi) etiketlerini birlikte yazar; panel
  açılınca ızgaranın kapalı/açık etiket kuralları silinmez, aynı etiketin en son rengi geçerli. Panelin gece listesi otomatik
  durumun otelin verdiği adını gösterir (lejantla aynı).
- **Örnek veri**: takvim ekranı ve paneli `src/renderer/mocks` kullanmaz; yalnız `calendar-page.test.tsx` test verisi olarak
  örnek oteli okur (`test/grid-fixture.ts`).
- **Testler**: vitest `calendar-page.test.tsx` (+3: arıza simgesi, oda kapatma, blok kaldırma), `reservation-panel.test.tsx`
  (+1: eski kur rozeti), `status-style.test.ts` (yeni), servis `reservation-flow.test.ts` (+3: kirli oda + denetim nedeni,
  bakımdaki oda, eski kur), `tests/unit/permissions-reservations.test.ts` (yeni, 7); e2e `calendar-flow.spec.ts` (6 + yalnız
  `FLOW_SHOTS` ile ekran görüntüsü). `calendar.spec.ts` ve `calendar-page.test.tsx`'te blok artık düğme (`img` → `button`).
- Sahip onay paketine: GPU'lu otel bilgisayarında kaydırma akıcılığı (P5a'dan) ve isim etiketinin sütun sütun izlemesinin göze
  hoş gelip gelmediği.

### Hata avı düzeltmeleri (P5fix)

Erken hata avının Faz 5 bulguları (her biri önce başarısız testle üretildi, sonra düzeltildi; servis testleri
`booking-fixes.test.ts`, ekran testleri `features/calendar/booking-fixes.test.tsx`). Karar K-44 (aynı gün ayrılış,
hafta sonu fiyat geceleri) uygulandı. #12, #13, #24 P7fix'te.

- **#1 gündüz kullanımı süren konaklamanın içine yazılmaz (G-37):** `findConflicts` gündüz dilimi için "d günü
  `checkIn < d < checkOut` olan konaklama yok" kuralını uygular (tersi de: gündüz kullanımını kapsayan geceler);
  servis kaydı, "Boş oda bul" (`freeRooms` artık aynı fonksiyonu kullanır) ve dolu oda listesi (`roomsTaken`) tek
  kural. Testler: `stays.test.ts` "süren konaklamanın ortasındaki güne aynı gün giriş-çıkış yazılamaz (G-37)",
  "gündüz kullanımını kapsayan gece konaklaması yazılamaz; yalnız giriş ya da çıkış günüyse yazılır"; servis "01–04
  konaklamasının 02 gününe gündüz kullanımı yazılmaz…", "gündüz kullanımı olan günü kapsayan gece konaklaması
  yazılmaz; uzatma da o güne geçemez". Yanlışı doğru kabul eden senaryolar düzeltildi: `booking-panel.test.ts`
  (gündüz kullanımı artık giriş gününe), `reservation-flow.test.ts` (çıkış gününe), `stays.test.ts`,
  `calendar/grid.test.ts` (Boş oda bul).
- **#2 aynı gün ayrılış (K-44 1):** `checkoutPlan` (domain) — giriş günü çıkış yapılırsa ilk gece o günün gündüz
  kullanımına döner (ücret kalır; çıkış penceresinde "Gündüz kullanımı ücreti" ile değişir), sonraki geceler ve
  masrafları iptal, oda o gece satılabilir; pencere "N gece boşalacak" der. Testler: `booking.test.ts` "giriş günü ayrılan
  misafirin ilk gecesi…", servis "giriş günü çıkış yapan misafirin konaklaması o günün gündüz kullanımına döner…",
  "çıkış penceresinde yazılan gündüz kullanımı ücreti…", ekran "giriş günü ayrılan misafir için ilk gecenin…".
- **#5 #6 park → takvime al:** park edilen konaklamalara `released_at` yazılır (migrasyon `0011_reservation_release`:
  `reservation_rooms.released_at`, `reservations.parked_from_status`); geri alma penceresi yalnız son parkın odalarını
  (tekilleştirilmiş) önerir; takvime alınca ayrılmamış bütün kişiler (tanıtıcı notlarıyla) taşınır, ön kayıt ön kayıt
  kalır, her taşıma denetimde. Testler: servis "ikinci kez park edilen rezervasyonun geri alma önerisi yalnız son odaları
  gösterir…", "takvime alınca odadaki bütün kişiler…".
- **#7 park alanından iptal / gelmedi:** yeni yordam `booking.noShow`; park alanında her kaydın menüsünde "Gelmedi olarak
  işaretle" ve "Rezervasyonu iptal et", panelde de (park edilmiş kayıt dahil). Testler: servis "park edilen rezervasyon
  iptal edilir ya da gelmedi olur…", ekran "park edilen rezervasyon park alanından "gelmedi" olarak kapatılır",
  `permissions-booking.test.ts` "Muhasebe ve Temizlik "gelmedi" ve tek oda iptali yapamaz (403); Resepsiyon yapar".
- **#8 tek oda iptali:** yeni yordam `booking.cancelStay`; `endReservation` yalnız gelecek (`planned`) konaklamaları bırakır,
  kalınmış gecelerin masrafı kalır, kimse kalmadıysa iptal, kalındıysa "çıkış yaptı" olur; park ve gelmedi kalınmış
  rezervasyonda reddedilir (`errors.reservationStarted`). Menü koşulu "otelde kimse yok". Testler: servis "bir odası
  çıkış yapmış rezervasyonun ileri tarihli odası tek başına iptal edilir…", "bütün rezervasyon iptal edilirse yalnız gelecek
  geceler boşalır…", ekran "#8 bir odası çıkış yapmış rezervasyonun ileri tarihli odası tek başına iptal edilir".
- **#9 giriş yapılmış konaklamada çıkış:** serviste ve tarih alanında alt sınır `max(bugün, giriş + 1)`
  (`errors.checkoutTooEarly`). Test: servis "01–05 giriş yapılmış, bugün 03: çıkış 02 ya da 01 olmaz; 03 olur".
- **#10 kara liste onayı kişiye bağlı:** onay, aday kişi ve eşleşen kayıt kimliklerine bağlanır; misafir değişince düşer.
  Test: ekran "#10 kara liste onayı o kişiye aittir…".
- **#11 odaya eklenen kişi kara listede denetlenir:** `occupants.add` (panel ve Otelde kalanlar) aynı eşleşme + onay;
  "engelle" düzeyini yalnız Sahip/Müdür geçer. Testler: servis "odaya eklenen kişi kara listeye karşı denetlenir…", ekran
  "kara listedeki kişi kırmızı uyarı verir; kutu işaretlenmeden eklenmez…".
- **#15 KBS çıkışı ızgarada:** ızgara son 30 günde çıkmış konaklamaların kişilerini de `kbsMissing`'e verir. Test: servis
  "çıkış yapılmış ama KBS çıkışı yapılmamış konaklama takvim çubuğunda uyarı taşır".
- **#16 ödeme yetkisi:** ödemeleri göremeyen rolde panelin tahsilat ve bakiyesi `null`, arayüz gizler. Testler: servis
  "ödeme görme yetkisi olmayan rol panelde tahsilat ve bakiye görmez", ekran "#16 … #23 …".
- **#18 yalnız görme yetkili rol:** "Yeni rezervasyon" düğmesi gizli; boş hücre, Enter, N formu açmaz. Test:
  `calendar-page.test.tsx` "yalnız görme yetkili rol "Yeni rezervasyon" düğmesini görmez…".
- **#20 denetim:** rezervasyon içinde açılan misafir, ana kişi satırı, giriş/çıkıştaki kişi zamanları, oda taşıma ve takvime
  almadaki kişi taşıma kayıtlı; eylem adları `park`, `no_show` (`shared/audit.ts`, ekranda "Park etti", "Gelmedi olarak
  işaretledi"). Testler: servis "rezervasyonda açılan misafir, ana kişi satırı, giriş ve çıkıştaki kişi zamanları
  kaydedilir", "park edilen rezervasyon iptal edilir ya da gelmedi olur; park ve gelmedi kendi eylem adıyla yazılır".
- **#21 hafta sonu fiyat geceleri (K-44 2):** yeni ayar `pricing.weekendNights` (varsayılan cuma ve cumartesi geceleri),
  Ayarlar → Takvim'de "Hafta sonu fiyatı geceleri"; öneri fiyat (servis ve form) bu ayardan. Testler: servis "varsayılan
  cuma ve cumartesi geceleri hafta sonu fiyatı alır…", ekran "#21 cuma gecesi hafta sonu fiyatı alır"; beklentisi değişen
  testler: `booking-panel.test.ts` (öneri fiyat), `new-reservation-dialog.test.tsx` (yeni misafir), e2e
  `calendar-flow.spec.ts` (öneri fiyat: cuma ve cumartesi hafta sonu, pazar taban).
- **#22 "yine de yaz":** `rooms.block` yetkilisi yeni rezervasyonda satışa kapalı odayı seçip gerekçe yazar; panelde tarih,
  oda değiştirme, oda ekleme ve takvime almada ret gelince gerekçe penceresi açılır (`override-dialog.tsx`);
  `booking.addRoom` gerekçeyi servise geçirir. Testler: ekran "#22 blok yetkilisi satışa kapalı odayı seçer…",
  `permissions-booking.test.ts` "oda eklerken blok gerekçesi işleyiciden servise gider…"; e2e `calendar-flow.spec.ts`
  "Excel senaryoları…" artık bloklu odayı Sahip olarak işaretleyip gerekçe alanını bekler (önce işaretlenemez sayılıyordu).
- **#23 misafir kartına bağlantı:** panelin geçmiş kartında "Misafir kartını aç" → Misafirler ekranı kartla açılır. Test:
  ekran "#16 … #23 …".
- **#25 satışa kapalı oda (`rooms.sellable=false`):** serviste blok gibi gerekçe + `rooms.block` ister
  (`errors.roomNotForSale`, denetimde); seçicide "Satılmayan oda" etiketi; "Boş oda bul" ve telefon gün listesi boş saymaz;
  `booking.availability` `notForSale` döner. Testler: servis "satışa kapalı odaya rezervasyon gerekçesiz yazılmaz…",
  ekran "#25 satılmayan oda seçicide etiketiyle görünür…", `grid-model.test.ts` "gün listesinde satışa kapalı oda boş
  sayılmaz".
- **Varsayılan yorumlar:** aynı gün ayrılışta o günün gündüz dilimi başka rezervasyondaysa gece gece olarak kalır, oda o
  gece satılmaz (nadir; denetimde görünür) (varsayılan). Bütün rezervasyon iptalinde kalınmış oda varsa durum "çıkış
  yaptı" olur (varsayılan).

## Son kontrol düzeltmesi (QA-1, QA1a)

- **G-31 takvim aralığı (K-46 (1)):** ızgaranın yılları artık ana bilgisayardan gelir (`calendar.bounds`, kural
  `shared/domain/calendar-range.ts`): başlangıç = `calendar.startYear` ayarı ile en eski konaklamanın yılından erken olanı
  (ikisi de yoksa geçen yıl), bitiş = bugünden 10 yıl sonrası ile en ileri gece/blok yılının bir sonrasından geç olanı.
  Yeni ayar **Ayarlar → Takvim → Takvim başlangıç yılı** (2000 … bu yıl, boş olabilir; `settings` yetkisi). "Tarihe
  git", Ay/Yıl ve misafir araması bu aralıkta kıstırmasız atlar; aralık dışında kalan bir sonuç yılları yeniden okutur.
  Testler: `calendar-range.test.ts`, `grid-range.test.ts` "ayar ve en eski kayıttan hangisi erkense oradan başlar…",
  `permissions-calendar.test.ts` (ayar yetkisi, geçersiz yıl 400, `calendar.bounds` yetkisi), `calendar-page.test.tsx`
  "G-31: üç yıl önceki konaklamaya arama ile kıstırmasız atlanır…", `calendar-section.test.tsx`.
- **G-190 takvim araması oda no (K-46 (3)):** `findStays` sorgusu bir oda numarasına tam eşitse önce o odanın bugüne en
  yakın konaklamaları, sonra ad/telefon/kod eşleşmeleri gelir. Test: `grid-range.test.ts` "\"302\" önce 302 numaralı
  odanın konaklamalarını getirir…", `calendar-page.test.tsx` "G-190: takvim aramasında oda numarası…".
- **Ölçüm (20 oda, yoğun veri 2026–2037; yük ortalaması ~20 olan 4 çekirdekte, gürültülü):** aralık 2026–2038 (13 yıl,
  ızgara 266.040 px) ile 2011–2038 (`calendar.startYear` 2011; 28 yıl, 572.864 px) karşılaştırıldı. Takvimin ilk çizimi
  (Bugün → Takvim, 5 ölçümün ortancası) 583 / 342 ms ↔ 671 / 573 ms; bugünden 40 ok tuşu 71 / 50 ↔ 70 / 73 ms/basış,
  basış başına en çok bir satır yeniden çizilir (`tape-row` 40 ↔ 20). Faz 15 (ilk çizim ~1.005 ms, ok 56 ms) ile aynı
  bantta; sanallaştırma yalnız görünen haftaları çizdiği için yıl sayısı çizim süresini değiştirmiyor. `perf.spec.ts`
  de iki aralıkta geçti (ilk çizim 657–865 ↔ 819–889 ms).
