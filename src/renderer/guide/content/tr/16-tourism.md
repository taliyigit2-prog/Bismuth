# Bakanlık (turizm) istatistiği

Her ayın 1'i ile 10'u arasında, bir önceki ayın konaklama istatistiği Kültür ve Turizm Bakanlığı'nın paneline girilir: ülke ülke **Toplam Giriş** ve **Toplam Geceleme**. Bismuth bu tabloyu KBS'den indirdiğiniz Excel dosyasından saniyeler içinde hazırlar.

## Hazırlık: KBS listesini indirmek {#kbs-file}

1. Ay bittikten sonra KBS'ye girin.
2. Geçen ayın **"EGM Konaklayan Listesi"** Excel dosyasını indirin (adı "EGM_Konaklayan_Listesi_…xlsx" gibidir).
3. Dosyayı bilgisayarda bulabileceğiniz bir yere kaydedin.

Bismuth dosyadaki ad, kimlik numarası ve cinsiyeti okumaz ve saklamaz; yalnız uyruk ve giriş‑çıkış günlerini sayar.

## Tabloyu hazırlamak {#tourism-steps}

Sol menüde **Raporlar → Turizm istatistiği**'ni açın. Ayın 1–10'u arasında Bugün ekranındaki hatırlatmadan **Turizm ekranına git** ile de gelebilirsiniz.

![Turizm istatistiği](tourism)

**1. KBS listesini seçin.** Dosyayı ekrandaki alana sürükleyin ya da **Dosya seç**'e basıp seçin. Program dosyanın ayını, satır sayısını, aynı gün giriş‑çıkışları ve otelde kalanları gösterir.

**2. Uyruk yazımlarını onaylayın.** KBS'de bazı ülkeler farklı yazılmış olabilir ("TÜRKYİE" gibi). Program öneri sunar:

- Öneri doğruysa **Kabul et**'e basın.
- Kıbrıs gibi kendiliğinden eşlenmeyen ya da tanınmayan yazımlarda listeden doğru ülkeyi seçip **Onayla**'ya basın.

Onayladığınız eşleşme sonraki aylarda hatırlanır; her ay yeniden sorulmaz.

**Otelde kalanlar** kutusu: ay sonunda hâlâ otelde olan misafirlerin geceleri, Bismuth'taki planlı çıkışa kadar sayılır. Yanlışsa **Düzelt** ile çıkış gününü seçin.

**3. Bakanlık tablosu.** Tablo bakanlık panelinin sırasıyla gelir: **Ülke**, **Toplam giriş**, **Toplam geceleme**; altında toplamlar, yatak sayısı ve doluluk.

- **Tabloyu kopyala** ile tablonun tamamını, satırdaki kopyala düğmesiyle tek satırı kopyalayıp bakanlık paneline yapıştırın. Onay bekleyen yazım varsa kopyalama kapalıdır.
- Panelde ülkeyi farklı bir adla yazıyorsanız ülke adındaki düğmeyle adı değiştirin; yeni ad sonraki aylarda da kullanılır.
- **Excel indir** ya da **CSV indir** ile dosya olarak alabilirsiniz.

## Kurallar {#tourism-rules}

- Aynı gün giriş‑çıkış yapan kişi **1 geceleme** sayılır.
- Konaklamanın bütün geceleri **giriş ayına** yazılır; sonraki aya sarkan geceler de.
- Doluluk = geceleme ÷ (yatak sayısı × ayın gün sayısı). Yatak sayısı odalarınızdaki gerçek sayıdır.

## Bildirildi işareti {#tourism-reported}

Tabloyu bakanlık paneline girdikten sonra **Bildirildi olarak işaretle**'ye basın. Tarih ve adınız **Geçmiş bildirimler** listesinde görünür; Bugün ekranındaki hatırlatma kalkar. Yanlışlıkla işaretlediyseniz **İşareti kaldır**.

## Bismuth kayıtlarıyla karşılaştırma {#tourism-compare}

Ekranın altında KBS sayıları, aynı ay Bismuth'a girilen konaklamalarla karşılaştırılır:

- Ülke bazında farklar,
- **Uyruğu eksik** kişiler (misafir kartında uyruğu girin),
- **KBS'de olmayan** konaklamalar (KBS'ye bildirilmemiş olabilir; kontrol edin),
- **Bismuth'ta olmayan** girişler.

Bakanlığa her zaman KBS sayıları girilir; karşılaştırma yalnız kontrol içindir.
