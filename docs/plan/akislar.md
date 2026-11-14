# Günlük Akış — Bismuth (sahibin anlatımı, 2026-10-02)

> Sahip Faz 0 sonunda otelin bir gününü ve ay sonunu anlattı. Bu belge her adımı **programdaki karşılığıyla** eşler;
> ekran tasarımı (Faz 3), Bugün ekranı ve vardiya devri (Faz 9), görevler (Faz 9) ve kılavuz (Faz 15) buna dayanır.
> Kişisel veri yoktur: WhatsApp görüntüsündeki adlar ve telefon numaraları bilerek yazılmadı.
> **Pandora'ya özgü** olanlar (saatler, 2 resepsiyon × 12 saat, çamaşırhane saatleri) **ayardır** (G-09); başka otel farklı kurar.

## 1. Bir gün (Pandora örneği)

| Saat | Ne oluyor (sahibin anlatımı) | Bismuth'ta karşılığı |
|---|---|---|
| 09:00 | Gündüz resepsiyonu mesaiye başlar; **geceden kalan notları alır**, gece ne olup bittiğini öğrenir. | **Vardiya devri** ekranı: gece çalışanının notu + otomatik özet (gece girişleri, ödemeler, arızalar, KBS eksikleri); "okudum" (G-95). Bugün ekranında okunmamış devir rozeti (G-92). |
| 09:00–12:00 | Öğlene kadar hazırlık. | Bugün: bugün çıkacaklar, bugün gelecekler, açık görevler (G-92, G-94). |
| 10:00 | Kat görevlisi gelir; her katın deposunu kontrol eder; **erken çıkan oda** varsa resepsiyondan öğrenir ve o odaya gider. | Çıkış yapılınca oda **otomatik kirli** (G-90); **kat planı** görünümünde kirli odalar (S-96); depo eksikleri görev/not olarak (G-94). Kat görevlisi WhatsApp'la devam eder (S-97). |
| 11:00–12:00 | Çamaşırhane **temiz** çamaşırları bırakır (Temiz Fişi). | Çamaşırhane → **gelen** kaydı: tür, adet, lekeli (G-171). |
| 12:00 | Resepsiyon **hâlâ çıkış yapmamış** odaların telefonlarını aramaya başlar. | Bugün: "çıkışı geçmiş, çıkmamış" listesi vurgulu; tekrarlı görev önerisi "12:00 çıkış yapmayan odaları ara" (G-94). |
| 12:00–13:00 | İlk odalar hazır olur. Kat görevlisi WhatsApp grubuna **"302+"** yazar ya da "kirli" mesajını beğenir. | Oda durumu **temiz** (resepsiyon WhatsApp'taki "+" mesajını görünce tek tıkla; S-97). |
| 13:00–21:00 | Girişler yapılır, yeni rezervasyon alınır. Rezervasyon Excel'e yazılır. Girişte misafir kimlikleri **KBS'ye** girilir. Para alınınca hücre **kırmızı**, aynı gün çıkarsa **mavi**. Fiyatlar duruma göre azaltılır/artırılır. | Rezervasyon **takvimde** (açılış ekranı, G-47); ödeme → otomatik "ödendi" rengi (G-32; Excel'deki kırmızı); day‑use türü (mavi, G-37); **odadaki her kişi + KBS işareti** (G-53, G-54); öneri fiyat (oda tipi + hafta sonu farkı, G-48) ve misafirin son ödediği fiyat (G-190). |
| Gün içinde | Odada ciddi bir sorun varsa kat görevlisi **fotoğrafla** resepsiyona bildirir (ör. yatak). | **Arıza** kaydı + fotoğraf (G-180); takvim/oda kartında rozet; çözülünce fotoğraf silinebilir. |
| 15:00–16:00 | Çamaşırhane **kirlileri** alır. | Çamaşırhane → **giden** kaydı; giden − gelen = bekleyen/eksik (G-171). |
| 21:00 | Gece çalışanı gelir. Sabahçı **gelecek misafirleri**, **notları** ve **gece yapılacak işleri** bildirir. | **Vardiya devri**: otomatik özet (henüz gelmemiş girişler, bu gece kalanlar ve KBS eksikleri, ödenmemiş bakiyeler, açık görevler/arızalar, kasa) + elle not (G-95). |
| Gece | Odaya giren her kişinin KBS'de kayıtlı olması gerekir; gececi her seferinde isim sormadan tanıyabilmeli ("kızıl saçlı"). | **Otelde kalanlar** ekranı: oda · kişiler · tanıtıcı not · KBS durumu; işaretsiz kişi kırmızı (G-54). |

**Kanallar:** resepsiyon ↔ kat görevlisi şu an WhatsApp. Bismuth WhatsApp'a bağlanmaz (bizim sunucumuz yok, G-07); oda durumu ve
arıza Bismuth'ta tutulur; resepsiyon WhatsApp'tan gelen bilgiyi işler (S-97: sahip WhatsApp grubundan memnun).

## 2. Ay sonu (sahip)

| Sahip ne kontrol eder | Bismuth'ta karşılığı |
|---|---|
| Kredi kartlarını, IBAN'ları | **Ay sonu kontrol** sayfası: kart ve IBAN toplamları, x'lenmiş / bekleyen (G-64, G-100) |
| Maaşları | Maaş tablosu: net, ödenen, kalan (G-81) |
| Ciroyu, kârı | Aylık özet KPI'ları (G-100, G-102) |
| **En çok ne harcamışım** (sahip bunu yapmayı seviyor) | "En çok harcama" listesi: personel, ürün kategorileri, gider açıklamaları (G-66, `03-mimari.md` §6.10) |
| Ayın 1–10'u bakanlık bildirimi | Turizm istatistiği: KBS Excel'i → ülke/giriş/geceleme tablosu + kopyala (G-150); hatırlatıcı (G-93) |

## 3. Genelleme (ayar olanlar)

- **Vardiya düzeni**: Pandora 2 resepsiyon × 12 saat (09:00–21:00, 21:00–09:00); başka otel 3 × 8 saat ya da tek kişi (`shift_definitions`).
- **Çıkış saati** (12:00), **çamaşırhane saatleri**, **örnek görevler**: ilk kurulumda öneri, otel değiştirir/siler.
- **Gün kapatma**: Pandora'da az kullanılır, başka otellerde gece kapanışı yaygın → ayar (G-72).
- **Kasadan avans**, **ek mesai ücreti**: Pandora'da avans var, ek mesai ücreti yok → ayar (G-69, G-84).

## 4. Rezervasyonun yaşamı: giriş, çıkış, iptal, iade (programdaki karşılığı)

Sahibin anlatımında "giriş yapılır", "aynı gün çıkarsa mavi" geçer; iptal ve iade ise günlük akışta ayrı satır değildi. Programdaki
karşılıkları (kılavuz: Rezervasyon nasıl yazılır; Faz 17):

| Olay | Bismuth'ta karşılığı |
|---|---|
| Misafir gelir, **giriş yapılır** | Takvimde rezervasyon → **Giriş yap**: odaya yerleştirme, odadaki kişiler (G-54) ve KBS işareti; durum "Giriş yaptı". Bugün ekranında "bugün gelecekler" satırı "Giriş yaptı" olur. |
| Misafir **çıkış yapar** | Rezervasyon → **Çıkış yap**: bakiye ve ödeme kontrolü, oda **otomatik kirli** (G-90), kat planında görünür. Çıkışı geçmiş ama çıkmamış odalar Bugün'de vurgulanır. |
| Erken çıkış / aynı gün ayrılış | Çıkış penceresi "N gece boşalacak" der; o geceler ve masraflar iptal edilir, oda yeniden satılabilir. Giriş günü ayrılırsa **aynı gün giriş‑çıkış** (gündüz kullanımı, mavi; K-44) ve ücreti çıkışta değiştirilebilir. |
| Misafir **gelmedi** | **Gelmedi olarak işaretle**: geceler boşalır, ödemeler kayıtta kalır; para iade edilecekse ya da tarih ertelenecekse önce **Park et** (park alanı, G-39). |
| **İptal** | **Rezervasyonu iptal et**: neden yazılır; tahsilat için **İade gir** / **İade bekliyor olarak park et** / **Tahsilat kalsın** seçilir. Rezervasyon silinmez, "İptal edildi" olarak kalır (G-24). |
| **İade** | Ödeme penceresinde tür **İade** ya da park alanında **İade gir**; iade defterin o gününe ve kasaya yazılır, tahsilatı geçemez (G-131). Misafir girdikten sonra vazgeçerse **Vazgeçme ve iade** (aynı gün çıkış, girişi geri al ya da erken çıkış). |
