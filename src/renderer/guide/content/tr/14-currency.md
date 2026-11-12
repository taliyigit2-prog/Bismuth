# Döviz, hava, özel günler

**Döviz** ekranında güncel kurlar, otelin kendi kuru, çevirici, hava durumu ve bayram tarihleri durur. **Takvim notları** ekranında ise bayramlar, özel günler ve kendi notlarınız yıl yıl listelenir.

## Kurlar {#rates}

Sol menüde **Para → Döviz**'i açın. Üç sekme vardır: **Döviz**, **Hava durumu**, **Bayramlar**.

![Döviz ekranı](currency)

- Her döviz için bir kart: güncel kur, düne göre değişim, son 7 günün en düşük ve en yüksek değeri. Kaynağı **Piyasa orta kuru** ya da **Otel kuru** olarak yazar.
- İnternet varken kurlar belli aralıklarla kendiliğinden yenilenir. Hemen yenilemek için **Şimdi güncelle**.
- **İnternetten güncelle** anahtarı kapatılırsa program internete hiç çıkmaz; son bilinen kurlar kullanılır. Ödeme ve gider girişi aynen sürer.
- **TCMB** satırı yalnız karşılaştırma içindir; **TCMB satırını gizle** ile kaldırılabilir.

Her ödeme ve gider, yazıldığı dakikadaki kurla saklanır; kur sonradan değişse de tutarı değişmez.

## Otel kuru {#hotel-rate}

Otel misafire kendi sabit kurunu söylüyorsa (örneğin "1 € = ₺50"):

1. Dövizin kartında **Otel kuru gir**'e basın.
2. **1 EUR kaç TRY** alanına kuru yazın (örneğin 50).
3. Kaydedin.

**Misafire bu kurdan söyle** açıkken çevirici, misafir ekranı ve yeni ödeme ve gider kayıtları otel kurunu kullanır. Piyasa kuruna dönmek için **Piyasa kuruna dön**. Yeni kur yalnız bundan sonraki kayıtlara uygulanır.

## Çevirici {#converter}

**Çevirici** kutusunda tutarı ve para birimini yazın; **Hangi birime** seçin. Karşılığı ve diğer birimlerdeki tutarlar hemen çıkar. **Misafire göster** sonucu misafire gösterebileceğiniz biçimde açar. **Yuvarlama**: **Kuruşuna kadar**, **Tam sayıya** ya da **10'un katına**.

## Kur kaynakları {#rate-sources}

**Kur kaynakları** penceresinde programın kuru hangi kaynaklardan hangi sırayla aldığı ve her birinin durumu yazar (**Çalışıyor**, **Bu sefer ulaşılamadı**, **24 saat dinleniyor**). Bazı kaynaklar kendi ücretsiz API anahtarınızla çalışır; anahtarı buraya girersiniz. Çoğu otel için varsayılan ayar yeterlidir.

## Hava durumu {#weather}

**Hava durumu** sekmesi otelin şehri için saatlik ve haftalık tahmini gösterir; Bugün ekranında da küçük bir kutusu vardır. Konum yanlışsa **Konumu değiştir**'e basıp listeden şehir ya da ilçe seçin. Hava durumunu istemiyorsanız sekmedeki anahtarla kapatın.

## Özel günler ve takvim notları {#special-days}

Sol menüde **Günlük işler → Takvim notları**'nı açın. Resmî tatiller ve bayramlar her yıl için **kendiliğinden** eklenir; siz fuar, kongre, düğün gibi özel günleri ve notları eklersiniz. Bu günler takvimin başlığında ve Bugün ekranında görünür; özel günlerde rezervasyonda oda tipinin hafta sonu fiyatı önerilir. Hafta sonu fiyatının hangi gecelere uygulanacağı ayrıca **Ayarlar → Takvim → Hafta sonu fiyatı uygulanan geceler**'de seçilir (varsayılan cuma ve cumartesi geceleri); takvimdeki vurgulu günlerden bağımsızdır.

![Takvim notları](calendar-notes)

Not eklemek için:

1. **Not ekle**'ye basın.
2. **Başlık** (örneğin "Fuar") ve **Tür**: **Resmî tatil**, **Yarım gün tatil**, **Özel gün**, **Etkinlik** ya da **Not**.
3. **Hangi günler**: **Tek gün**, **Tarih aralığı**, **Haftanın günleri** ya da **Tarih listesi**.
4. Her yıl tekrarlanacaksa **Her yıl tekrarla**'yı işaretleyin; isterseniz renk seçin.
5. Kaydedin.

Bir günü düzeltmek ya da iptal etmek için satırdaki düğmeleri kullanın; kayıt silinmez. Yıl değiştirmek için oklar, türe göre süzmek için üstteki düğmeler (**Bayramlar**, **Özel günler**, **Notlar**) vardır. Takvimde vurgulanan günler (örneğin cumartesi ve pazar) burada **Değiştir** ile ayarlanır.

> [!tip]
> Dini bayramların tarihi hesapla bulunur ve açıklanan tarihten bir gün farklı olabilir ("Tahmini" yazar). **Bayram tarihlerini internetten denetle**'ye ya da Döviz ekranının **Bayramlar** sekmesinde **Şimdi denetle**'ye basın; program açıklanan tarihleri okuyup kendi eklediği günleri düzeltir, sizin değiştirdiğiniz günlere dokunmaz.
