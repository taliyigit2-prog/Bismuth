# Faz 12 · Telefon Rehberi, Ürün/Tedarik Takibi, Çamaşırhane, Kayıp Eşya

**Amaç:** Otelin "yan defterlerini" programa almak: telefon rehberi (sucu, tesisatçı, çamaşırhane…), düzenli alınan
ürünlerin fiyat/adet geçmişi ("zam fark edilsin"), çamaşırhanenin bıraktığı kağıtların sayımı ve ay sonu fatura
karşılaştırması. Tamamı elle giriş; program düzen, geçmiş, grafik ve uyarı verir.

**Gereksinimler:** G-160, G-170, G-171, G-71, **G-55**.
**Ön koşul:** Faz 7 (giderler), Faz 9 (ekler altyapısı: fotoğraf).
**Sorular:** yok — S-73 (listeleri büyüt, temizlik dahil), S-74 (önce gider), S-63 (stok sayacı isteğe bağlı), S-67, S-95 (giden/gelen), S-17 (kayıp eşya) cevaplandı.
**Referans:** `02-excel-analizi.md` §2.4.3 (teslim fişi), `03-mimari.md` §4.7, §6.13.

## Teslimatlar

1. **Telefon rehberi** (`features/contacts/`): liste (arama, kategori filtresi, favoriler üstte), kart (ad, kategori, birden çok telefon etiketli, adres, e‑posta, not), hızlı arama kısayolu (`Ctrl/Cmd+K` içinden "rehber: sucu"), telefon numarasına tıkla → kopyala; kategori listesi düzenlenebilir; içe aktarma (CSV: ad; telefon; kategori). Bugün ekranında "acil numaralar" kartı (favoriler).
2. **Ürün/tedarik** (`features/supplies/`):
   - Ürün kartı: ad, kategori (geniş tohum liste: su ve içecek, market, kahvaltı, **temizlik malzemeleri**, banyo/misafir ürünleri, kâğıt ürünleri, çamaşır/tekstil, teknik/bakım, kırtasiye, diğer; S-73), birim, tedarikçi (rehberden), stok takibi (S-63, isteğe bağlı, varsayılan kapalı).
   - **Alım = gider kaydı** (S-74, K-35; sahibin defter düzeni): teslim fişi girişi tarih, tedarikçi, **ürün satırları** (ürün, adet, birim fiyat, tutar — otomatik, elle düzeltilebilir), toplam, fiş fotoğrafı (isteğe bağlı) → tek `expenses` kaydı + `expense_items`. Defterden girilen gidere ürün satırı eklemek aynı sonucu verir (tek giriş).
   - **Fiyat geçmişi**: ürün başına birim fiyat çizgisi (12 ay), son alımda artış varsa **zam rozeti** (% ve TL); liste görünümünde "son fiyat / önceki fiyat / değişim".
   - Aylık tüketim tablosu (adet, tutar) ve tedarikçi bazlı toplam; raporlara "tedarik giderleri" kartı (QA1c'de yapılıyor; `supply.monthSummary` hazırdı, Raporlar ekranında kart yoktu; son kontrol).
3. **Çamaşırhane** (`features/laundry/`):
   - Tür listesi (sahibin cevabı + örnek "Temiz Fişi" + "büyültebilirsin"): çarşaf, alez, nevresim/yorgan kılıfı, yastık kılıfı, büyük havlu, küçük havlu, ayak havlusu, bornoz, yastık, yorgan, pike, battaniye, fon perde, tül perde, masa örtüsü, peçete, yatak örtüsü, paspas, önlük; ekle/çıkar/sırala.
   - **Birim fiyat tablosu** (K-28): çamaşırhane × tür × **geçerlilik tarihi**; fişte fiyat yazmadığı için ilk anlaşmada girilir; zam olunca yeni satır (geçmiş korunur, "son zam: +%X, tarih" gösterilir).
   - **Teslimat kaydı** iki yönlü (S-95): **giden** (kirli teslim; Lale her gün 15–16) ve **gelen** (temiz fiş; 11–12) — fişin birebir karşılığı: tarih, çamaşırhane (rehberden), **fiş no** (örn. RC10746), tür bazında **miktar** ve **lekeli** adet (hızlı giriş: klavyeyle satır satır, fişteki sırayla), fişte fiyat varsa satır fiyatı, fotoğraf (isteğe bağlı).
   - **Bekleyen / eksik**: tür bazında giden − gelen (başlangıç devri girilebilir); uzun süre kapanmayan fark vurgulu; sonraki teslimata devreder.
   - **Aylık özet ve mutabakat**: ay seç → tür bazında toplam adet, toplam lekeli, o tarihte geçerli birim fiyatla hesaplanan tutar; "çamaşırhanenin fatura tutarı" gir → fark; fark ≠ 0 vurgulu; "ödendi" → defterde tek gider satırı (G-71). Program yalnızca toplar ve çarpar; fiyat tahmin etmez.
   - Aylık trend grafiği (adet ve tutar).
4. **Kayıp eşya** (`features/lost-items/`, G-55): kayıt (bulunduğu tarih, oda/yer, bulan, açıklama, saklandığı yer, isteğe bağlı fotoğraf), durum (saklanıyor / sahibine verildi — kime, ne zaman / elden çıkarıldı), arama; sade, az kullanılan sekme.
5. Rol: `contacts` (herkes görür, Resepsiyon düzenler), `supplies` ve `laundry` (Sahip/Müdür/Muhasebeci düzenler; S-09'a göre sahip ayarlar), `lost_items` (Resepsiyon düzenler).
6. Telefon arayüzünde (Faz 13) rehber ve arıza en üstte; tedarik/çamaşırhane salt‑okunur.

## Kabul ölçütleri

- [x] Örnek fiş (40 × Munzur 0,5 L × 60 = 2.400) girilir; ikinci alımda 65 TL girilince ürün kartında "+%8,3 zam" rozeti çıkar.
- [x] Alım defterde tek gider satırıdır; gider iptal (void) edilince ürün satırları fiyat geçmişinden düşer.
- [x] Çamaşırhane: örnek fiş (Çarşaf 17, Nevresim 11, Yastık kılıfı 27, Büyük havlu 36, Küçük havlu 5, Ayak havlu 18) 1 dakikadan kısa sürede girilir; 10 teslimat sonrası aylık tür toplamları, lekeli toplamı ve geçerlilik tarihli fiyatla tutar doğru (ay ortasında zam senaryosu dahil); fatura farkı hesaplanır (birim test + E2E).
- [x] Çamaşırhane giden/gelen: 3 gün giden, 2 gün gelen sonrası tür bazında bekleyen sayısı doğru; gelen fazla gelirse eksi bekleyen uyarısı.
- [x] Kayıp eşya: kayıt → "sahibine verildi" geçişi kim/ne zaman ile saklanır.
- [x] Rehberde "sucu" araması kategori ve ad üzerinden bulur; favori numaralar Bugün ekranında görünür (okuma: `contacts.favorites`; Bugün kartı P9c dalgasında bağlanır).
- [x] Hiçbir ekran internet gerektirmez; ekler yerel klasörde, yedek kapsar.

## Sonuç (2026-10-05)

**Durum:** ✅ teknik olarak tamam — ekranlar gerçek servise bağlı, sahip onayı toplu turda (K-39).

**Yapılanlar**

- **Rehber** (`features/contacts/`): liste gerçek veriden; arama ad, kategori (üç dilde ve otelin kendi etiketi),
  not ve numara üzerinden ("sucu" hem "Sucu Mehmet"i hem "Sucu" kategorisindekini bulur — servis de
  `customCategory` ve notu arar); favoriler önce; kişi başına etiketli birden çok numara; masaüstünde numaraya tıklayınca
  kopyalanır, telefonda dokununca aranır; kategoriler hazır liste + otelin kendi etiketi ("Kendi kategoriniz…"; yeni
  migrasyon gerekmedi); "Rehberden kaldır" / "Geri al" (silme yok); CSV/Excel içe aktarma (`ad; telefon; kategori`,
  önizleme, satır numaralı sorunlar, rehberde olan ad ikinci kez eklenmez, her satır ayrı denetim kaydı). Hızlı aramada
  (Ctrl/⌘ K) "rehber: sucu" kişileri listeler, seçilen Rehber'i süzülmüş açar (`?q=`). Bugün kartı için
  `contacts.favorites` okuması hazır (kart P9c'nin).
- **Tedarik** (`features/supply/`): ürün listesi `supply.overview` (son/önceki fiyat, zam rozeti % ve TL, son alım, bu ay
  miktar, stok, tedarikçi); ürün kartı (kategori — S-73 geniş liste ya da yeni kategori —, birim, rehberden tedarikçi,
  isteğe bağlı stok sayacı S-63, "Listeden kaldır"); fiyat geçmişi 12 ay (basamak grafik + tablo); **alım = tek gider**
  (`supply.recordPurchase` → `expenses-service.createExpense`, ürün satırları `expense_items`; satır tutarı otomatik,
  tutar yazılırsa birim fiyat ondan çıkar; gider toplamı satırlardan az olamaz, fazla olabilir: taşıma/depozito; gider
  bölümü, ödeme yöntemi, "kasadan ödendi", fiş fotoğrafı); son iki ayın alımları, gerekçeyle iptal (`voidExpense`,
  fiyat geçmişinden düşer); aylık özet (ürün bazında adet/tutar, tedarikçi bazında toplam; raporlar kartı için
  `supply.monthSummary`).
- **Çamaşırhane** (`features/laundry/`): çamaşırhane rehberden (birden çoksa seçilir); tür bazında bu ay giden / gelen /
  lekeli, bugün yıkamada / eksik (FIFO: son teslimattan önceki teslimatlardan gelmeyen) ve **fazla gelen** (eksi
  bekleyen) uyarısı; temiz fişi ve kirli teslim klavyeyle satır satır (Enter sonraki kutu, sonda kaydeder; fişte fiyat
  varsa satır fiyatı; fiş fotoğrafı); birim fiyat tablosu (çamaşırhane × tür × geçerlilik tarihi, "son zam: +%X, tarih");
  ay hesabı: fatura gir (önce yalnız karşılaştırma) → fark vurgulu → **"Ödendi"** defterde tek gider satırı
  (`laundry_settlement_id`); 12 aylık gidiş (adet / tutar, tablo görünümü); teslim defteri (gerekçeyle iptal, fotoğraf).
  Türler Ayarlar → Listeler'den (ekle / çıkar / sırala).
- **Kayıp eşya** (`features/lost-items/`): gerçek liste (oda numarası, kaydeden), yeni kayıt (oda ya da ortak alan, bulan,
  saklandığı yer, not, fotoğraf), "Sahibine ver" (kime, gün ve saat), "Elden çıkar" ve "Geri al" gerekçeyle; ayrıntı
  sayfası durumu değiştireni ve zamanı denetim kaydından gösterir (`lostItems.list` → `listView`).
- **Fotoğraflar** (K-25): `attachments-service`'e dokunulmadı; base64 ile gelen dosya `lostItems.addPhoto` /
  `supply.addPhoto` üzerinden `attachments.add`'e verilir (yerel klasör + sha256, yedek kapsar); büyük fotoğraf arayüzde
  1600 px JPEG'e küçültülür (IPC zarfı ≤ 8 MB).
- **Telefon** (faz-12 madde 6): "Daha fazla" Rehber ve Arızalar ile başlar; Tedarik ve Çamaşırhane telefonda salt okunur.
- **Servis eklemeleri:** `contacts.favorites`, `contacts.importMany`, aramaya kategori/not; `supply.overview`,
  `productHistory`, `monthSummary`, `purchases`, `recordPurchase`, `voidPurchase`; `laundry.trend`, `settle({ paid })`
  (ödenmemiş fatura gider yetkisi istemez), teslim listesine çamaşırhane süzgeci; `lostItems.listView`.

**Testler:** `contacts-csv.test.ts`, `contacts-lost-items.test.ts`, `supply-laundry-flows.test.ts` (Munzur 2.400 →
+%8,3; iptal; aylık özet; örnek fiş × 10 + ay ortası zam = 13.467,50, lekeli 30, fatura 13.500 → 32,50 fark; ödendi = tek
gider; 3 giden/2 gelen bekleyen, fazla gelen −15), `tests/unit/permissions-contacts.test.ts`,
`permissions-supply.test.ts` (her rol × her yordam, yönlendirici üzerinden; fotoğraf gidiş-dönüş), dört ekran testi,
E2E `tests/e2e/electron/supply-laundry.spec.ts` (fiş, zam, iptal; temiz fişi < 1 dk klavyeyle, fatura farkı, ödendi;
"rehber: sucu") ve `tests/e2e/mobile/faz12.spec.ts`.

**Varsayılanlar / sahip onay paketine:** rehber kategorileri ayrı tablo değil, hazır liste + serbest etiket
(varsayılan); stok sayacı alımla kendiliğinden artmaz, sayım elle yazılır (varsayılan, S-63); çamaşırhane faturası önce
kaydedilir, "Ödendi" ayrı adım (varsayılan); "başlangıç devri" ilk kirli teslim olarak girilir (servis yorumu,
varsayılan).

## Sonuç — Hata avı düzeltmeleri (P10fix; 2026-10-05)

Ayrıntı ve tablo `faz-10-raporlar.md` → "Hata avı düzeltmeleri (P10fix)". Faz 12'ye düşenler:

- **#8 Tedarik satır tutarı**: elle yazılan tutar aynen saklanır, birim fiyat bilgi olarak gösterilir —
  `supply-laundry-flows.test.ts` "elle yazılan satır tutarı aynen saklanır: 2,75 kg = 1.000 TL, fiş toplamı 1.000 TL",
  `supply-page.test.tsx` "elle yazılan satır tutarı aynen gider…".
- **#14 Rehber CSV**: tırnaklı hücredeki virgül bölmez; "Adı Soyadı;Telefon;Kategori", "Kişi;Tel", "Name;Phone",
  "Имя;Телефон" başlıkları atlanır — `contacts-csv.test.ts`.
- **#15 Excel miktarı**: "160" ve "7,5" — `writers.test.ts`.
- **#17 Rol** (varsayılan, ana oturum kararı): Muhasebeci tedarik ve çamaşırhaneyi düzenler (fiyat, teslim fişi, fatura,
  "Ödendi"); Resepsiyon düzenlemeye devam eder — `permissions-supply.test.ts` "Muhasebeci tedarik ve çamaşırhaneyi
  düzenler…". Madde 5'teki "S-09'a göre sahip ayarlar": roller ekranından.

## Son kontrol düzeltmesi (QA-1, QA1c; 2026-10-05)

- **Teslimat 2 "raporlara tedarik giderleri kartı"** tamamlandı: Raporlar → Özet'te **Tedarik giderleri** kartı
  (dönemin ürünlü alımları ürün kategorisine göre ana para biriminde; çubuk grafik `var(--chart-4)` + tablo görünümü:
  Kategori · Alım · Tutar · Pay, toplam satırı; kuru bilinmeyen alım uyarısı; boş durum). `supplies` yetkisi olmayan
  rol kartı almaz (servis `null` döner), K-42 gizli bölüm sayılmaz; satır payı "En çok harcama" ile aynı kuralla
  (alımın kendi kuru). Excel'de "Tedarik giderleri" sayfası. Testler: `reports-qa1.test.ts` ("dönemin ürünlü alımları
  kategoriye göre…", "K-42: yönetici gizli bölümdeki alımı görmez; tedarik yetkisi olmayan rol kartı almaz",
  "Excel: "Tedarik giderleri" sayfası…"), `report-cards.test.tsx` ("kategoriler grafikte ve tabloda…",
  "ürünlü alım yoksa…", "kuru bilinmeyen alım uyarısı").

## Son kontrol düzeltmesi (QA2b — akış testi B; 2026-10-05)

| Bulgu | Düzeltme | Test |
|---|---|---|
| Rehber, Tedarik, Çamaşırhane: uzun boşluksuz metin sayfayı ve alt sayfayı taşırıyor | Ortak çözüm (faz-09 QA2b notu); tedarikçi adı bağlantısı sarılır | e2e `mobile/wrap.spec.ts` (iki tur) |
| Rehber kopyalama: `navigator.clipboard` yokken (HTTP/telefon) yakalanmamış hata | Ortak `lib/copy-text.ts`: pano API → gizli kutu + `execCommand('copy')` → olmazsa "Kopyalanamadı. Metni elle seçip kopyalayın."; `CopyButton` (fatura bilgisi G-191, kurtarma kodları, turizm tablosu) ve rehber numarası bunu kullanır | `copy-text.test.ts`, `contacts-page.test.tsx` "pano yokken (HTTP) kopyalanamazsa…" |
| Rehber (ad/adres/not), Tedarik (ürün adı, miktar), Çamaşırhane (teslim notu) sınırsız; sunucu reddi genel uyarı | `maxLength`/`max` sözleşme şemasından (`shared/contract/limits.ts`); gönderilmeden şemayla denetlenir, hata alanın altında (`lib/form-errors.ts`, `FieldError`); VALIDATION yanıtı alana eşlenir | `limits.test.ts`, `contacts-page.test.tsx` "ad, adres ve not alanları…", "servisin kabul etmeyeceği ad gönderilmez…", `supply-page.test.tsx` "miktar servis sınırını (1.000.000) aşarsa…", `laundry-page.test.tsx` "adet 100001 ya da -5 ise tek, sınırı söyleyen metin…" |
| Çamaşırhane adet 100001 "Yalnızca tam sayı yazın", -5 iki hata | Tek metin "0 ile 100.000 arasında bir tam sayı yazın." | `laundry-page.test.tsx` (aynı test) |
| Telefonda Tedarik sekmeleri 41 px | `Tabs` telefonda 44 px (bütün sekmeler) | e2e `mobile/faz12.spec.ts` "tedarik ve çamaşırhane telefonda salt okunur" |
| Rehber içe aktarma hiç eklemediyse başarı toast'ı | Bilgi: "Yeni kişi yok; N ad zaten rehberde" | `contacts-page.test.tsx` "içe aktarmada hiç yeni kişi yoksa…" |
| Sunucu kipinde `/favicon.ico` 404 | `index.html` `<link rel="icon">`; statik sunucu `/favicon.ico` için paket simgesi | `static.test.ts` |
