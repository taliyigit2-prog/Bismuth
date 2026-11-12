# Rehber, tedarik, çamaşırhane, kayıp eşya

Bu bölüm otelin işletme ekranlarını anlatır: sık aranan numaralar (**Rehber**), ürün alımları ve fiyatlar (**Tedarik**), çamaşırhane teslimleri (**Çamaşırhane**) ve bulunan eşyalar (**Kayıp eşya**).

## Rehber {#contacts}

Sol menüde **İşletme → Rehber**'i açın. Tedarikçi, çamaşırhane, tesisatçı, elektrikçi, taksi ve acil numaralar burada durur.

![Rehber](contacts)

- Bir numaraya **tıklayınca kopyalanır**; telefonda dokununca aranır.
- Üstteki kategori düğmeleriyle (Tedarikçi, Çamaşırhane, Tesisatçı…) listeyi daraltın; arama kutusuna ad, not ya da numara yazın.
- Yıldızla **favori** yaptığınız kişiler listenin başında ve Bugün ekranındaki **Sık aranan numaralar** kutusunda durur.

Kişi eklemek için **Kişi ekle**'ye basın: **Kişi / firma adı**, **Kategori** (listede yoksa **Kendi kategoriniz…**), **Görüşülen kişi**, **Telefon numaraları** (birden çok numara ve etiket: cep, iş…), **E-posta**, **Adres**, **Not** (örneğin "Salı ve cuma teslim").

Excel'deki rehberinizi topluca almak için **İçe aktar**'a basın; satırları yapıştırın ya da CSV dosyası açın. Her satırda: ad; telefon; kategori.

Hızlı aramada (<kbd>Ctrl</kbd> + <kbd>K</kbd>) "rehber" yazıp bir ad yazarsanız numara doğrudan çıkar.

## Tedarik {#supply}

**İşletme → Tedarik** ekranı aldığınız ürünleri, son alış fiyatlarını ve zamları izler. Üç sekme vardır: **Ürünler**, **Alımlar**, **Aylık özet**.

![Tedarik](supply)

Önce ürünleri ekleyin: **Ürün ekle** → **Ürün adı** (örneğin "Munzur 0,5 L"), **Birim** (adet, kg, lt, paket, çuval), **Kategori**, tedarikçi (rehberden). Fiyat burada yazılmaz; alımlardan gelir.

Bir teslim fişi geldiğinde:

1. **Alım gir**'e basın.
2. Tedarikçiyi, **Ödeme yöntemi**ni ve **Gider bölümü**nü seçin.
3. **Ürünler** altında her satıra ürünü, miktarı ve birim fiyatı yazın; **Ürün ekle** ile satır ekleyin. Listede olmayan ürünü **Listede olmayan ürün ekle** ile ekleyin.
4. Fişin toplamı farklıysa (taşıma, depozito) **Gider toplamı**'nı düzeltin.
5. Para kasadan çıktıysa **Kasadan ödendi**'yi işaretleyin; isterseniz fiş fotoğrafı ekleyin.
6. Kaydedin.

Alım deftere **tek gider satırı** olarak bir kez yazılır; ürünlerin fiyat geçmişi güncellenir. Son fiyat öncekinden yüksekse ürün **zam** olarak işaretlenir (örneğin "+%12 zam"). Bir ürüne tıklayınca fiyat geçmişi grafikte ve tabloda görünür.

## Çamaşırhane {#laundry}

**İşletme → Çamaşırhane** ekranı kirli giden ve temiz gelen çamaşırı tür tür sayar; eksik ve lekeli parçaları gösterir; ay sonunda faturayı fişlerle karşılaştırır.

![Çamaşırhane](laundry)

Önce çamaşırhaneyi **Rehber**'e **Çamaşırhane** kategorisiyle ekleyin; ekranda çamaşırhaneyi seçin. Çamaşır türleri (çarşaf, nevresim, havlu…) **Ayarlar → Listeler → Çamaşır türleri**'ndedir.

- Kirli çamaşır giderken **Kirli teslim**'e basın; her türün adedini yazıp kaydedin.
- Temiz çamaşır gelince **Temiz fişi gir**'e basın; fişteki sırayla her türün adedini ve **Lekeli** adedini yazın. <kbd>Enter</kbd> sonraki kutuya geçer, sonuncuda kaydeder. İsterseniz **Fiş no** ve fiş fotoğrafı ekleyin.

Tür bazında tablo **Giden**, **Gelen**, **Yıkamada** ve **Eksik** parçaları gösterir. Önceki teslimattan gelmeyen parça **eksik** sayılır; gönderilenden fazla gelen parça ayrıca uyarılır.

Ay sonu:

1. **Birim fiyatlar** kartında anlaştığınız fiyatları **Fiyat gir** ile girin (zam olunca yeni fiyatı geçerli tarihiyle girin; eski fişler eski fiyatla kalır).
2. **Ay hesabı** fişlerden hesaplanan tutarı gösterir. Çamaşırhanenin faturası gelince **Fatura gir** ile tutarı yazın; fark varsa program söyler.
3. Faturayı ödeyince **Ödendi**'ye basın; fatura ayın son gününe defterde tek gider satırı olur.

Yanlış teslim kaydı **Teslim defteri**'nden **İptal et** ile iptal edilir.

## Kayıp eşya {#lost-items}

Misafirin unuttuğu eşyalar **Misafirler → Kayıp eşya** ekranında tutulur.

![Kayıp eşya](lost-items)

1. **Eşya kaydet**'e basın.
2. **Eşya** (örneğin "siyah şarj aleti"), **Bulunduğu gün**, **Bulan** kişi.
3. **Nerede bulundu**: **Odada** (odayı seçin) ya da **Ortak alanda** (yeri yazın).
4. **Saklandığı yer** (örneğin "resepsiyon, çekmece 2").
5. İsterseniz **Olası sahibi**, fotoğraf ve not; kaydedin.

Eşya sahibine verilince **Sahibine ver**'e basın; **Kime verildi**'yi ve günü yazın. Uzun süre sahibi çıkmazsa **Elden çıkar** ile nedenini yazarak kapatın. Kayıt silinmez; yanlışlıkla değiştirdiyseniz **Geri al** ile yeniden "Saklanıyor" yapın. Üstteki süzgeç **Saklanıyor**, **Verildi**, **Elden çıkarıldı** eşyaları ayırır.
