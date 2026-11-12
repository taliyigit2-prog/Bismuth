# Ödeme alınca ne yapılır

Misafirden para aldığınız her seferde ödemeyi **hemen** Bismuth'a yazın. Ödeme bir kez yazılır; takvimdeki renk, defter, kasa ve raporlar kendiliğinden güncellenir. Bu bölüm ödeme almayı, dövizle ödemeyi, kaporayı, iadeyi, kasayı ve parayı teslim almayı anlatır.

## Rezervasyondan ödeme almak {#take-payment}

En kolay yol, rezervasyonun kendi panelinden ödeme almaktır:

1. Takvimde rezervasyona tıklayın.
2. Panelin üstündeki **Ödeme ekle**'ye basın.
3. **Tür**: normal ödeme için **Ödeme**, önceden alınan para için **Kapora**.
4. **Tutar**'ı yazın ve yanındaki kutudan **para birimini** seçin (TRY, EUR, USD…).
5. **Ödeme yöntemi**ni seçin: Nakit, Kredi kartı, IBAN…
6. Gerekirse **Açıklama** yazın (örneğin "fiş no 1234").
7. **Kaydet**'e basın.

![Ödeme penceresi](payment-dialog)

Kaydedince "Ödeme kaydedildi" yazar; takvimdeki çubuğun rengi değişir. Ödeme gecelere sırayla dağılır: önce ilk gece ödenmiş sayılır. Örneğin gecesi ₺2.000 olan 3 gecelik rezervasyonda ₺2.000 ödeme alınırsa ilk gece **Ödendi**, diğer ikisi **Ödenmedi** görünür.

Panelin **Para** sekmesinde **Toplam tutar**, **Ödenen** ve **Bakiye** ile bütün ödemelerin listesi vardır.

## Dövizle ödeme ve kur {#currency-payment}

Misafir Euro, Dolar ya da başka bir dövizle öderse tutarı **o dövizle** yazın; çevirmeyin.

- Pencerede "Kur 14:32 itibarıyla sabitlenecek" gibi bir satır görürsünüz: ödemenin ana para birimi karşılığı, kaydettiğiniz dakikadaki kurla hesaplanır ve **bir daha değişmez**. Kur ertesi gün değişse de bu ödemenin değeri aynı kalır.
- İnternet yoksa program son bilinen kuru kullanır; satırda "Son bilinen kur" işareti çıkar.
- Kur biliniyorsa elle kur alanı çıkmaz; yazdığınız tutar o kurla çevrilir. Otelin kendi kurunu kullanmak için kuru Döviz ekranında **Otel kuru** olarak girin.
- Yalnız o para birimi için hiç kur bilinmiyorsa (internet hiç gelmemişse) pencerede **Kur: 1 EUR kaç TRY** alanı çıkar; kuru elle yazın (örneğin 49,25). Bu kur yalnız o kayıtta kullanılır.
- Rezervasyonun hesabı başka bir dövizdeyse (örneğin EUR hesaba USD ödeme) tutar ana para birimi üzerinden çevrilir; kur yoksa ikinci bir elle kur alanı çıkar.

Otel kuru ve kur kaynakları için: [Döviz](guide:currency).

## Kapora {#deposit}

Rezervasyon için önceden para alındıysa (havale, kart ya da nakit) ödemeyi **Kapora** türüyle yazın. Kapora alınmış ama tamamı ödenmemiş geceler takvimde **Kısmen ödendi / kapora** rengiyle görünür; çubukta kapora simgesi çıkar.

## İade {#refund}

Misafire para geri verildiyse ödeme penceresinde **Tür** olarak **İade**'yi seçin ve verilen tutarı yazın. Park edilmiş bir rezervasyonun parası iade edilecekse takvimin altındaki park alanında **İade gir**'i kullanın.

## Yanlış yazılan ödeme {#wrong-payment}

Ödeme silinmez; düzeltilir ya da iptal edilir:

1. **Defter ve kasa** ekranını açın, ödemenin yapıldığı günü seçin.
2. Satırın sonundaki **Satır işlemleri** düğmesine basın.
3. Tutar ya da yöntem yanlışsa **Düzenle**; ödeme hiç olmamışsa **İptal et**'i seçin ve nedenini yazın.

İptal edilen satır üstü çizili kalır ve hiçbir toplama girmez. Kimin ve neden iptal ettiği denetim kaydına yazılır.

> [!warning]
> Sahip ya da müdür parayı **teslim aldıysa** (satırda "x" varsa) ödeme değiştirilemez. Önce kasa durumundan o teslimi geri almak gerekir.

## Ek satış (oda dışı) {#extra-sale}

Oda dışında bir şey satıldıysa (bavul emaneti, transfer, çamaşır):

1. **Defter ve kasa** ekranında **Ödeme ekle**'ye basın.
2. **Ne için** kutusunda **Ek satış**'ı seçin.
3. **Hizmet**, **Adet** ve **Birim fiyat**'ı girin; isterseniz misafiri seçin.
4. **Ödeme yöntemi**ni seçip **Kaydet**'e basın.

Defterden rezervasyona ödeme de girebilirsiniz: **Ne için → Rezervasyon**'u seçip misafir adı, oda ya da rezervasyon koduyla arayın.

## Kasa {#cash-drawer}

Üst çubuktaki kasa düğmesi, kasada şu an kaç para **olması gerektiğini** gösterir. Tıklayınca **Kasa durumu** açılır:

- **Kasada olmalı**: para birimi başına nakit ödemeler; kasadan ödenen giderler ve avanslar bundan düşülür.
- **Teslim alınmamış tutarlar**: sahibin ya da müdürün henüz almadığı nakit, kart ve IBAN toplamları; kaç satırın beklediği ve en eskisinin tarihi.
- **Platformlar**: bu ay Booking, Airbnb gibi platformlardan gelen ödemeler.
- **Teslim geçmişi**: kim, ne zaman, ne kadar teslim aldı.

![Kasa durumu](cash-drawer)

> [!tip]
> Vardiya sonunda kasayı sayın ve "Kasada olmalı" ile karşılaştırın. Fark varsa defterin **Gün notu**'na yazın.

## Parayı teslim almak {#handover}

Resepsiyonda biriken parayı **sahip ya da müdür** teslim alır. Kart ve IBAN satırları da banka ekstresiyle karşılaştırıldıktan sonra teslim alınmış sayılır; satıra **x** konur (Excel'deki x gibi).

1. Üst çubukta kasa düğmesine basın.
2. **Teslim al**'a basın.
3. Neyi teslim aldığınızı seçin: **Bugüne kadar hepsi** (nakit, IBAN ve kart), **Yalnız nakit** ya da defterde işaretlediğiniz **Seçili satırlar**.
4. **Teslim alacağınız** tutarı kasadaki parayla karşılaştırın; isterseniz not yazın (örneğin "kasa sayımı tuttu").
5. **Teslim al** ile onaylayın.

Defterde tek tek satır seçmek için: **Defter ve kasa** ekranında satırların başındaki kutuları işaretleyin ve **Teslim aldım** düğmesine basın.

Yanlışlıkla teslim aldıysanız **Teslim geçmişi**nde o kaydın **Teslimi geri al** düğmesine basın ve nedenini yazın. Kayıt silinmez; "Geri alındı" olarak kalır.

Parayı teslim alma yetkisi yalnız sahip ve müdürdedir; diğer roller kasa durumunu görür ama teslim alamaz.
