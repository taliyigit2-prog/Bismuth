# Ay sonu kontrolü ve raporlar

Ay bitince otel sahibi bir kontrol yapar: kart ve IBAN toplamları, maaşlar, ciro ve kâr, en çok neye harcandığı ve bakanlık bildirimi. **Ay sonu kontrolü** ekranı bunların hepsini tek yerde toplar; **Raporlar** ekranı ise dönem dönem grafikler ve karşılaştırmalar verir. Rakamların hepsi girdiğiniz rezervasyon, ödeme ve giderlerden kendiliğinden hesaplanır; hiçbir şey ikinci kez yazılmaz.

## Ay sonu kontrolü {#month-end-check}

Sol menüde **Para → Ay sonu kontrolü**'nü açın. Ayı üstteki kutudan seçin ya da oklarla önceki veya sonraki aya geçin. Sağ üstte **Excel'e aktar** ve **Yazdır / PDF** düğmeleri vardır.

En üstte **Ciro**, **Gider**, **Kâr** ve **Doluluk** kutuları önceki aya göre değişimle görünür.

**Kontrol listesi** beş adımdan oluşur:

1. **Kredi kartı ve IBAN toplamları**: bankada kontrol bekleyen tutar. Kart ve IBAN satırlarını banka ekstresiyle karşılaştırıp defterde teslim alındı (x) yapın. Bkz. [Parayı teslim almak](guide:payments#handover).
2. **Maaşlar**: ödenecek kalan tutar. Bkz. [Personel ve maaş](guide:staff#salary-table).
3. **Ciro, gider ve kâr**: ayın kârı.
4. **En çok ne harcandı**: en büyük gider kalemi.
5. **Turizm Bakanlığı bildirimi**: son gün ve kalan gün sayısı; **Aç** ile Turizm istatistiği ekranına gidersiniz. Bkz. [Bakanlık istatistiği](guide:tourism).

1, 2 ve 5. adımlar kayıtlardan kendiliğinden işaretlenir (yeşil). 3. ve 4. adımı baktıktan sonra siz işaretlersiniz; bu işaretler hesabınıza kaydedilir ve her bilgisayarda aynı görünür. Başka bir kullanıcı sizin işaretlerinizi görmez.

Altındaki kutular:

- **Ödeme yöntemleri**: her yöntemin **Toplam**, **Teslim alındı (x)** ve **Bekleyen** tutarı; altında IBAN'a gelenler kanala göre (banka ekstresiyle karşılaştırmak için). Nakit yalnız bilgi için gösterilir.
- **Turizm istatistiği**: ayın bildirim tarihleri; **Tabloyu hazırla** ile bakanlık tablosuna geçersiniz.
- **En çok harcama**: personel, ürün grupları ve gider açıklamalarına göre en büyük kalemler. Aynı gider farklı yazılmışsa defterdeki **Açıklama sözlüğü** ile birleştirin.
- **Maaşlar**: her çalışan için maaş, avans, izin, izin parası, net ödenecek, ödenen ve kalan.
- **Kur kaynakları**: dövizli kayıtların ana para birimi karşılığının hangi kurla sabitlendiği (aşağıya bakın).

Her tablonun köşesindeki indirme düğmesi yalnız o tabloyu dosya olarak kaydeder.

## Raporlar {#reports}

Sol menüde **Raporlar → Raporlar**'ı açın.

- **Dönem**: **Bu ay**, **Geçen ay**, **Bu yıl** ya da **Tarih aralığı**. **Karşılaştır**: **Önceki dönem**, **Geçen yıl aynı dönem** ya da **Karşılaştırma yok**. Seçilen tarihler kutuların altında yazar.
- Sekmeler: **Özet**, **Yıllık özet**, **Doluluk ve göstergeler**, **Kasa ve ödemeler**, **Giderler**, **Personel**.
- **Özet**: **Ciro**, **Kâr**, **Gider** ve **Doluluk** kutuları; **Günlük ciro** grafiği (bir güne basınca o günün dökümü açılır), **Gelir detayları**, **Satış kanalları**, **Gider bölümleri**, **En çok harcama**, **Tedarik giderleri** ve **Kur kaynakları**.
- **Doluluk ve göstergeler**: aylara, haftanın günlerine, oda tipine ve odaya göre doluluk; **Ortalama gecelik fiyat** (oda geliri ÷ satılan gece), **Oda başına gelir** (oda geliri ÷ satılabilir gece), **Ortalama konaklama süresi** ve **Tekrar gelen misafir**.
- **Kasa ve ödemeler**: ödeme yöntemine göre tutarlar, teslim alınmamış para, kontrol bekleyen nakit dışı satırlar ve teslim alma geçmişi.
- **Giderler** ve **Personel**: aylara göre gider, gider dağılımı ve personel maliyeti.
- Grafiklerin **Grafik** ve **Tablo** görünümü vardır; tabloda rakamları satır satır okursunuz.
- **Excel'e aktar** bütün raporu tek bir Excel dosyası olarak kaydeder; her tablonun indirme düğmesi yalnız o tabloyu Excel ya da CSV olarak verir. **Yazdır / PDF** raporu kâğıda ya da PDF'e basar.
- **Tedarik giderleri** kutusu dönemin ürünlü alımlarını ürün kategorisine göre gösterir; alımlar **Tedarik** ekranından girilir.
- **Kur kaynakları** kutusu dövizli kayıtların karşılığının hangi kurla sabitlendiğini söyler: **Piyasa orta kuru** (kaynağın adıyla), **TCMB kuru**, **Otel kuru**, **Elle girilen kur** ya da **Kur yok (toplamlara katılmadı)**. Kuru olmayan kayıtlar toplamlara katılmaz; o günün kurunu **Döviz** ekranından girince eklenir.

Doluluk hesaplanırken satışa kapalı günler satılabilir gecelerden düşülür.

Para raporlarını (ciro, kâr, gider) yalnız yetkisi olan görür. Resepsiyon rolü doluluk ve oda‑gece bilgilerini görür, para rakamlarını görmez. **Sahip giderleri** bölümünü yalnız o bölümü görme yetkisi olan görür.
