# Faz 7 · Defter: Ödemeler, Kasa, Giderler

**Amaç:** Sahibin aylık "Defter" sayfalarını ve sağ üstteki kasa panelini, tek girişli ve teslim‑alma akışlı bir
ekrana dönüştürmek.

**Gereksinimler:** G-60 … G-72 (G-65 kaldırıldı), G-13, G-14, G-15, G-67, G-68, G-69. (Tedarik: gider kaydına **ürün satırları** (`expense_items`) burada eklenebilir; tedarik ekranı Faz 12'de aynı kaydı kullanır. Çamaşırhane `laundry_settlement_id` bağlantısı hazırlanır; personel giderleri `kind=staff` kilitli.)
**Ön koşul:** Faz 5 (ödemeler zaten rezervasyondan girilebiliyor), Faz 4 (roller).
**Sorular:** yok — S-12 (gün kapatma ayar), S-30 (x: Sahip + Müdür), S-31 (banka kontrolü aynı x), S-32 (kaydın dakikası kuru), S-33 (kategori listesi yok) cevaplandı.

## Teslimatlar

1. **Günlük defter ekranı** (`features/ledger/`):
   - Üstte gün seçici (takvim + ◀ ▶ + bugün), gün notu alanı (serbest metin, örn. "Nermin izin kullandı").
   - Sol: gelirler (ödemeler + ek hizmet satışları) — sütunlar: teslim (✓), tutar, para birimi, misafir/rezervasyon, oda(lar), yöntem, kanal, not. Satıra tıkla → düzenle. "Yeni gelir" → rezervasyon seç (arama) **veya** ek hizmet satışı (oda yok).
   - Sağ: giderler — teslim/kasadan (✓), tutar, para birimi, **açıklama** (serbest; önceki açıklamalardan otomatik tamamlama; hazır kategori yok — S-33), **bölüm** (Genel / Yönetici giderleri), isteğe bağlı **ürün satırları** (ürün, adet, birim fiyat → tedarik fiyat geçmişi; G-71), çalışan bağlantısı (maaş/avans/izin parası otomatik buradan gelir; elle yazılmaz). Düzen Excel defterine benzer, daha temiz (S-74).
   - **Sırala** düğmesi: yöntem sırası (nakit → havale → kart → diğer) — Excel onay kutusunun karşılığı; sıralama tercihi hatırlanır.
   - Gün toplamları: gelir, gider, net; para birimi bazında.
2. **Kasa paneli** (sağ üst, her zaman görünür — yetkili rollerde):
   - Matris: para birimi × ödeme yöntemi, **teslim alınmamış** toplamlar; kanal toplamları (ay bazında).
   - "Teslim al" akışı: seçili satırlar / bu güne kadar hepsi / yalnızca nakit… → onay → `collected_at`, `collected_by` yazılır; **teslim kaydı** (kim, ne zaman, ne kadar, hangi satırlar) oluşur; geri alınabilir (yetki).
   - Kart/IBAN satırları da banka/ekstre kontrolünden sonra **aynı x** ile işaretlenir (S-31); teslim alma yetkisi varsayılan **Sahip + Müdür** (S-30).
3. **Aylık defter görünümü**: ay seç → gün gün açılır/kapanır bloklar (Excel'deki bantlar); hızlı gün menüsü (1…31); ay toplamları; filtre (yöntem, kanal, para birimi, çalışan).
4. **Gider bölümleri** (Genel / Yönetici giderleri; yeniden adlandırılabilir; G-67) ve **açıklama sözlüğü** (otomatik tamamlamadaki yazım farklarını birleştir/yeniden adlandır — "en çok harcama" doğru gruplansın).
5. **Ek hizmet satışı** formu (hizmet, adet, tutar, para birimi, yöntem, kanal, misafir isteğe bağlı, not) — bavul emaneti senaryosu.
6. **Gün kapatma** (G-72; ayar, varsayılan kapalı): günü kilitle; kilitli günde değişiklik için yetki + audit.
7. **Döviz çevirimi**: her satırın TL karşılığı **kaydın yazıldığı dakikadaki kurla** (S-32; tutar/birim değişince o anın kuru); kur yoksa son bilinen kur + rozet ya da elle kur.

## Kabul ölçütleri

- [x] Rezervasyondan girilen ödeme defterde görünür; defterden girilen ödeme takvim rengini değiştirir; hiçbir ekran aynı ödemeyi iki kez istemez. — `ledger-drawer.test.ts` › "rezervasyondan girilen ödeme deftere, defterden girilen ödeme rezervasyonun bakiyesine düşer"; e2e `electron/ledger.spec.ts` › "gün girişi … defterden ödeme gecelerin rengini değiştirir", "rezervasyon panelinden girilen ödeme defterde ve kasa düğmesinde görünür"
- [x] Teslim alınmamış nakit paneli, Excel'deki "elime aldığımda kaç para olmalı" sorusunu verir; teslim sonrası sıfırlanır; teslim geçmişi listelenir. — `ledger-drawer.test.ts` › "gün girişi → panel … teslim al → sıfır; geçmişte görünür; geri alınca geri gelir"; `ledger-page.test.tsx` › "kasa paneli kasadaki nakdi verir …"
- [x] Yönetici gideri Resepsiyon rolünde **ne listede ne toplamlarda** görünmez (servis katmanı filtreler; toplamlar rolün görebildiği satırlardan hesaplanır ve bu durum ekranda "kısmi görünüm" rozetiyle belirtilir). — `ledger-drawer.test.ts` › "Resepsiyon yönetici giderini ne günde, ne ayda, ne panelde, ne teslim geçmişinin kasa tutarında görür"; `permissions-ledger.test.ts` › "Resepsiyon yönetici giderini API üzerinden de göremez …"; `ledger-page.test.tsx` › "Resepsiyon … kısmi görünüm rozeti çıkar"
- [x] Maaş/avans/izin parası ödemeleri (Faz 8) defterde otomatik gider olarak görünür ve defterden elle maaş yazılamaz (`kind=staff` kilitli). — `ledger-drawer.test.ts` › "maaş ve avans defterde türüyle görünür ve defterden değiştirilemez (kind=staff kilitli)"; `ledger-page.test.tsx` › "maaş ödemesi türüyle ve kilitli görünür …"
- [x] Döviz satırları kaydın yazıldığı dakikanın kuruyla TL'ye çevrilir; yalnız tutar/birim değişince kur yenilenir; kur yoksa elle girilebilir. — `ledger-drawer.test.ts` › "kur yazıldığı dakikada donar; kur yoksa elle kur girilebilir …", "ödemenin TL karşılığı kayıt dakikasının kuruyla …"
- [x] Gider açıklaması yazarken önceki açıklamalar önerilir; "su" ve "Su " aynı gruba düşer. — `ledger-drawer.test.ts` › ""su", "Su " ve "SU" tek gruba düşer; yeniden adlandırma ve birleştirme bütün satırları değiştirir"; `ledger-page.test.tsx` › ""Gider ekle": önceki açıklamalar önerilir …"
- [x] Birim testleri: teslim alma, toplamlar, görünürlük filtresi, kur çevirimi. E2E: gün girişi → teslim al → panel sıfır. — `src/main/services/ledger-drawer.test.ts`, `tests/unit/permissions-ledger.test.ts`, `src/renderer/features/ledger/ledger-page.test.tsx`; e2e `tests/e2e/electron/ledger.spec.ts`, `tests/e2e/mobile/ledger.spec.ts`

## Sonuç (2026-10-05)

**Yapılanlar (P7, fazın tamamı):**
- Sözleşme `procedures/ledger.ts` (24 yordam) ve işleyiciler `handlers/ledger.ts`. Okuma: `ledger.options`, `ledger.day`,
  `ledger.month`, `ledger.cashPanel`, `ledger.drawerSummary` (Bugün ekranındaki kasa kartı için, P9c),
  `ledger.handovers`, `ledger.searchReservations`, `ledger.expense`, `ledger.suggestDescriptions`,
  `ledger.descriptionGroups`. Yazma: `ledger.addPayment` / `updatePayment` / `voidPayment` (rezervasyon paneliyle aynı
  `payments` satırı, aynı servis), `ledger.sellExtra`, `ledger.addExpense` / `updateExpense` / `voidExpense` (P12 ve
  P14'ün kullandığı `expenses-service`), `ledger.handover` / `revertHandover`, `ledger.setDayNote`, `ledger.closeDay` /
  `reopenDay`, `ledger.setSort`, `ledger.renameDescription`.
- `ledger-service`: satırlarda kaydeden ve teslim alan adı, kur kaynağı ve gözlem anı, satış başlığı, personel türü
  (maaş/avans/izin parası…), çalışan adı, çamaşırhane bağı, ürün satırları; gün toplamları para birimi bazında; ay
  görünümü (gün notları, kapalı günler, çalışan süzgeci için çalışanlar); kasa paneli (ayın kanal toplamları, bekleyen
  satır sayısı, en eski gün, son teslim); teslim geçmişi (kısmi görünümde kasa tutarı yalnız görülebilen satırlardan
  yeniden hesaplanır, gizli gider sızmaz — K-38); bakiyeli rezervasyon arama; kişisel sıralama tercihi
  (`user_preferences` anahtarı `ledger.sort`; `ui.*` ayarı değil).
- `expenses-service`: elle kur (`manualRateMicro`, yalnız kur bilinmiyorsa; kaynak `manual`), açıklama sözlüğü
  (gruplar ve yazımlar), yeniden adlandırma/birleştirme (her satıra denetim kaydı; tutar değişmez).
- Ekran `features/ledger/**` gerçek servise bağlandı (örnek veri kaynağı bu ekrandan kaldırıldı; `derive.ts` ay sonu
  ve raporlar taslakları kullandığı için yerinde): gün çubuğu (takvim, ◀ ▶, Bugün, hatırlanan sıralama, günü kapat /
  aç), kasa paneli, gün özeti (para birimi bazında ve ana para biriminde, "kısmi görünüm" rozeti, kuru olmayan satır
  uyarısı), gelirler (yöntem grupları, "x", seçip teslim alma, satıra tıklayınca düzenleme, iptal; kur rozetleri),
  giderler (kilitli personel/çamaşırhane satırları türüyle, ürün satırları, düzenleme, iptal), gün notu, aylık görünüm
  (açılıp kapanan gün bantları, "Güne git" 1…31, ay toplamları, yöntem/kanal/para birimi/çalışan süzgeci), gelir formu
  (rezervasyon arama ya da ek hizmet satışı — bavul emaneti), gider formu (öneriler, bölüm, kasadan, ürün satırları,
  elle kur), açıklama sözlüğü, kapalı günde gerekçe alanı. Boş / yükleniyor / hata / yetkisiz durumları ve telefon
  düzeni (önce kasa, sonra kartlar; formlar alttan).
- Kasa paneli `components/cash-drawer/**`: üst çubukta her ekranda düğme (kasada olması gereken tutar; yalnız `cash`
  görme yetkisinde), panel (para birimi × yöntem matrisi, kasada olmalı, ayın platform toplamları), "Teslim al"
  (bugüne kadar hepsi / yalnız nakit / defterde seçilenler; kart ve IBAN aynı "x"), teslim geçmişi ve gerekçeyle geri
  alma. Kabuğa tek bağlantı: `components/top-bar.tsx` içinde `<CashDrawerButton />`.

**Karşılanan gereksinimler:** G-13, G-14, G-15 (defterde seçim listeleri olarak), G-60, G-61, G-62, G-63, G-64, G-66,
G-67, G-68, G-69, G-70, G-71, G-72; S-12, S-30, S-31, S-32, S-33, S-74; K-35, K-38.

**Varsayılanlar (K-39):** fazın açık sorusu yoktu. Yorum gerektiren üç nokta varsayılanla çözüldü: aylık süzgeçteki
"çalışan" = satırın bağlı olduğu çalışan (maaş/avans gideri) ya da satırı giren hesabın çalışan kartı (varsayılan);
gider bölümlerinin yeniden adlandırılması Ayarlar → Listeler'de kalır (var olan `lists.update`; varsayılan); açıklama
yeniden adlandırma kapalı günlerdeki satırları değiştirmez (ilk varsayılan "değiştirir" idi; P7fix B16 ile kapalı gün korunur; son kontrol).

**Ölçümler:** servis testleri 15, yetki matrisi 24 yordam × 6 rol (+1 API görünürlük testi), ekran testleri 15; e2e
masaüstü 2 (+1 yalnız görüntü), telefon 1.

**Kalanlar / sahip onay paketine:** ekran görüntülerinin (gün, ay, kasa paneli, formlar; tr açık, ru koyu, telefon)
sahip onayı sahip onay paketine.


### Hata avı düzeltmeleri (P7fix, 2026-10-05)

Erken hata avı (Faz 7 bulguları) ve ana oturum kararları K-42, K-43; takvim avından ödeme servisine düşen #12, #13,
#24. Servis testleri `src/main/services/ledger-fixes.test.ts`, ekran testleri
`src/renderer/features/ledger/ledger-fixes.test.tsx` ve `src/renderer/features/calendar/payment-dialog.test.tsx`.

- **B1 / takvim #13** çapraz kur ana para birimi üzerinden (`currency-service.convertViaBase`, K-43) — "EUR folyoya USD
  ödeme, kurlar biliniyorsa ana para birimi üzerinden çevrilir; elle kur yok sayılır (B1)"; paneldeki pencere
  "internetsiz EUR folyoya TL ödeme: "1 EUR kaç TRY" sorulur ve folyo kuru olarak gider (K-43, #13)".
- **B4** elle kur yalnız kur yoksa; folyo = defter — "piyasa kuru varken yazılan elle kur folyoya da deftere de
  geçmez; ikisi aynı TL tutarı (B4)".
- **B12** internetsiz tamamlanır (ödeme birimi ve gerekirse folyo birimi için "1 X = ? ana para birimi";
  `manualFolioRateMicro`) — "internetsiz EUR folyoya EUR ödeme…", "internetsiz EUR folyoya TL ödeme…", "internetsiz
  EUR folyoya USD ödeme iki elle kurla… tamamlanır"; alan yalnız gerektiğinde (`ledger.knownRates`) — "kurun bilinip
  bilinmediği para birimi bazında okunur…", "kur biliniyorsa elle kur alanı yok; kur bilinmeyen para biriminde
  "1 EUR kaç TRY" sorulur (K-43)".
- **B24** ek hizmet satışına `manualRateMicro` — "döviz ek hizmet satışında elle kur ödemenin TL değerine yazılır".
- **B11** "kur yok" satırına aynı tutarla elle kur — "…ödeme ve gider (B11)".
- **B14** satışın folyo ve ödeme denetim satırları — "satışın folyosu ve ödemesi de denetim kaydına yazılır".
- **B10** seçili satır teslimi kasadan giderleri de kapatır — "…kasadan giderleri de kapatır (B10)".
- **B17** "Bugüne kadar hepsi" gösterimi bugüne kadar (`pendingToday`) — "…gösterilen = alınan (B17)".
- **B21** son teslim geri alınmamış olan — "kasa panelindeki "son teslim" geri alınmış teslimi göstermez…".
- **B23** boş teslim reddedilir (`errors.nothingToCollect`) — "teslim alınacak satır yoksa boş teslim kaydı yazılmaz".
- **K-42 (1) / N1** yönetici bölümü kasadan ödenemez (`errors.ownerSectionNotFromDrawer`; formda seçenek yok;
  Excel aktarımında işaret düşer) — "servis reddeder; var olan kasadan gider yönetici bölümüne taşınamaz…",
  "personel giderleri yönetici bölümüne yazılıyorsa kasadan avans reddedilir", "yönetici bölümü seçilince "kasadan
  ödendi" seçeneği görünmez…".
- **K-42 (2) / B2, B20** maaş yetkisi olmayan rol kasadan olmayan personel ödemesini görmez, görünüm kısmi; kasadan
  olan görünür; dışa aktarma ve satır sayısı rolün göreceğini sayar — "gün, ay, çalışan süzgeci, ay özeti ve tek
  satır okuması maaşı göstermez; görünüm kısmi", "kasadan verilen avans kasa hareketidir…", "dışa aktarma ve satır
  sayısı maaşı ve gizli bölümü saymaz (B2, B20)". Öneriler ve sözlük zaten yalnız elle giderleri okur.
- **K-42 (3) / B5** vardiya devrindeki kasa okuyana göre yeniden hesaplanır (anlık görüntü satırları saklar) —
  "Sahip devrindeki kasa Resepsiyona yalnız görebildiği satırlardan hesaplanır ve kısmi işaretlenir".
- **B16** sözlük kapalı günün satırını yetki + gerekçe olmadan değiştirmez, sayısını bildirir — "yeniden adlandırma
  kapalı günün satırlarını yetki ve gerekçe olmadan değiştirmez", "sözlükte kapalı günde kalan satırlar bildirilir".
- **B19** ay görünümü "Nakit" süzgeci kasadan giderleri de alır — "…kasadan ödenen gideri de gösterir (B19)".
- **B25** "Doğrudan" seçimi doğrudan kanalla yazılır — "Booking rezervasyonuna "Doğrudan" seçilen ödeme…".
- **B26 / takvim #24** kapalı günde gerekçe alanı yalnız `ledger.locked` yetkisinde; diğerlerine kilit açıklaması
  (defter ödeme/gider formları, gün notu, paneldeki ödeme penceresi) — "kapalı günde kapalı güne yazma yetkisi
  olmayan rol…", "Sahip kapalı güne gerekçeyle yazar (B26)", "kapalı günde Sahip gerekçe yazar ve ödeme kaydedilir
  (#24)", "kapalı güne yazma yetkisi olmayan rol kilit açıklamasını görür (#24, B26)".
- **Takvim #12** iade folyoda alınan net tutarı geçemez (`errors.refundExceedsPaid`) — "1.000 ödenmiş folyoya 5.000
  iade reddedilir…".

Değişen beklentiler: `ledger-drawer.test.ts` gizli bölüm testi kasadan yönetici giderini artık eski veri olarak
(doğrudan DB) kurar (K-42 (1)); sözlük sonucu `skippedClosed` alanını taşır.

### Son kontrol düzeltmesi (QA2a, akış testi A)

- **Para alanı** (`components/money-input.tsx`): harf, eksi ya da üst sınırı (1.000.000.000,00; `MAX_AMOUNT_MINOR`,
  `src/shared/money.ts`) aşan yazı formda eski tutarı bırakmaz: alan forma `null` verir, hatayı altında söyler ve
  formun gönderilmesini durdurur (Kaydet ve Enter). Programdaki bütün para alanları bu bileşen; gider ürün satırının
  birim fiyatı aynı okumayla (`readMoneyText`) doğrulanır. Sözleşmede tek sınır `amountSchema` (`contract/rooms.ts`),
  bütün para girişlerinde; servisler aynı şemayla reddeder — `ledger-qa2a.test.tsx` "bakiyeyle dolu tutara "abc"…",
  "eksi ve sınırı aşan tutar…", "gider düzenlerken "abc"…", `money-limit.test.ts`, `components.test.tsx` "para alanı
  harf, eksi ve sınırın üstünü…".
- **Satır menüsü**: "⋯ → İptal et" artık düzenle penceresini açmıyor (`lib/row-click.ts`, satır yalnız kendi
  üstündeki tıklamaya cevap verir; başka ekranlarda satır tıklaması + portal menü kalıbı yok) — "satır menüsünden
  "İptal et" yalnız iptal penceresini açar…", e2e `ledger.spec.ts` "para alanı ve satır menüsü (QA2a)".
- **Bakiyeyi aşan ödeme** (defter ve rezervasyon paneli) onay sorar (varsayılan, K-46) — "bakiyeyi aşan ödeme önce
  sorulur…", `payment-dialog.test.tsx` "₺5.000 bakiyeye ₺99.999,99 ödeme önce sorulur…".
- **Teslim al** penceresi teslim geçmişinin tutacağı neti gösterir (nakit − kasadan giderler − kasadan avans/maaş) ve
  dökümü yazar; panel `cashToday` + `drawerOut` verir — `ledger-qa2a.test.tsx` ""Yalnız nakit" kasadan giderleri ve
  avansları düşer…", `ledger-drawer.test.ts` "panel bugüne kadarki nakdi ve kasadan çıkanları…".
- Boş gönderimde "Tutarı yazın" tutar alanının altında; kur bilinmeyen döviz giderinde kaydetmeden önce "kur yok"
  uyarısı (K-43); yalnız iptal edilmiş satırı olan yöntem başlığı "İptal edildi"; telefonda Gün/Ay sekmeleri ve
  anahtarlar 44 px (e2e telefon `ledger.spec.ts`). `ui.showMinor` kapalıyken yalnız ",00" gizlenir (varsayılan,
  K-46; `format.test.ts`).
- Değişen beklentiler: `ledger-page.test.tsx` ve `ledger-fixes.test.tsx` (B17) teslim penceresinde brüt yerine neti
  bekler; "Tutarı yazın" alanın altında.

