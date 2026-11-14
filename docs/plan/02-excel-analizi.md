# 02 · Mevcut Excel Sisteminin Analizi (Referans)

> Sahip yıllardır iki Google E-Tablo ile çalışıyor. Bu belge, 13 ekran görüntüsünün satır satır
> incelenmesinden çıkan **davranışları** kaydeder. Veri modeli ve ekran tasarımları buradaki
> davranışları birebir karşılamak zorundadır; sahibin alışkanlıkları ürünün kullanılabilirlik ölçütüdür.
> Rakamlar örnektir; sahibin gerçek gelir/gideri bizi ilgilendirmez, yalnızca **yapı** önemlidir.

## 1. Dosya 1: "Lale Defter 2026" (kasa ve muhasebe)

Sayfalar: `Ocak … Aralık` (aylık defter), `Eylül Özet` (kilitli), `Yıllık Özet` (kilitli), `Maaşlar` (kilitli).
Kilitli sayfalar = çalışanların görmemesi gereken sayfalar → programda **rol yetkisi** ile karşılanır.

### 1.1 Aylık defter sayfası

Her gün bir **mavi başlık bandı** ile başlar (`01.10.2026`). Bandın solunda bir **onay kutusu** var:
tıklanınca o günün satırlarını **nakit → havale → kredi kartı** sırasına dizer (sahibin açıklaması).
Bandın sağındaki boş hücreye **gün notu** yazılır (örn. kırmızı italik "Nermin izin kullandı").

**Gelir sütunları (turuncu başlık):**

| Sütun | Davranış |
|---|---|
| Kasa | `x` = sahip parayı **teslim aldı**. İşaretsiz satırlar sağdaki kasa panelinde birikir; sahip "elime aldığımda kaç para olmalı" sorusunu panelden okur. Kredi kartı/havale satırlarını da fiş/ekstre kontrolünden sonra `x`ler. |
| Ücret | Tutar (tam sayı) |
| Birim | Açılır liste: **TL, Euro, Dolar, Sterlin, Ruble** |
| İsim | Misafir adı; bazen iki kişi ("Ömer Başbuğ, Gizem Yüce"), bazen not ("Gökhan Çakır (kapora)", "Asım Türker (kapora 2 ocak)") |
| Ödeme Yöntemi | Açılır liste: **Nakit, Kredi Kartı, İban** |
| Oda | "501" · "101,103" · "203/204" · **"1 bag"** (oda değil, bavul emaneti) |
| Platform | Açılır liste: **---, Airbnb, Booking, Expedia, Ostrovok, Bounce** (Bounce = bavul emaneti aracısı) |

**Gider sütunları (lacivert başlık):** Kasa (`x` = kasadan ödendi/teslim edildi) · Gider · Birim · Gider Açıklaması.
Örnek açıklamalar: "iş güvenliği", "Lider İlkyardım Eğitim Sağlık", "kerem maaş", "kerem 4 izin parası",
"sevim 3 izin parası", "ekin maaş", "Ekin ocak ayı" → **maaşlar parça parça gider olarak yazılıyor.**

**Gözlemler (programın karşılaması gereken durumlar):**

- Peşin çok geceli ödeme: 10.000 TL nakit = 4 gece × 2.500. Ödeme bir günde, konaklama 4 güne yayılır.
- Bir ödeme birden fazla oda için: 4.400 = 101 + 103 (2 × 2.200).
- Kapora: 1.000 TL havale, odalar 203/204 → takvimde sarı kalır, not düşülür.
- Platform ödemesi "İban" olarak girilir (Airbnb ödemesi banka hesabına gelir).
- Bavul emaneti: 140 TL, "1 bag", platform Bounce → **oda dışı ek hizmet geliri**.
- Aynı gün aynı odada iki misafir (501: Sebahattin Seven → Serdar Işık).
- Eylül sayfası 760 satırı geçmiş → sağ üstte **1–31 hızlı gün menüsü** eklenmiş. Programda gün seçici ile karşılanır.
- Ocak sayfasında personel ve gün menüsü panelleri yok → tablo yıl içinde evrilmiş; program bu evrimi baştan içermeli.

**Sağ üst sabit paneller:**

1. **KASA DURUMU (Net)** — satırlar para birimi (TL, Euro, Dolar, Sterlin, Ruble), sütunlar Nakit / Kredi Kartı / İban; yanında Platform (Airbnb, Booking, Expedia, Ostrovok, Bounce) toplamları.
   Nakit sütunu ₺0 görünür çünkü nakitler `x`lenmiş (teslim alınmış). Kredi kartı yüksek çünkü henüz `x`lenmemiş.
   → Programda panel = **teslim alınmamış tutarlar** (para birimi × yöntem) + kanal toplamları.
2. **PERSONEL DURUMU** — Personel · Avans · İzin Hak · Kul. İzin · Kalan (ör. Kerem ₺12.500 avans, 4/1/3).
3. **HIZLI GÜN MENÜSÜ** — 1…31 bağlantıları.

**Doğrulanan hesap:** Ekim: KK 26.300 + İban 1.000 + x'li nakit 10.000 = 37.300 = Yıllık Özet'teki Ekim cirosu.
→ `x` ciroyu etkilemez, yalnızca "kasada mı, teslim mi" bilgisidir.

### 1.2 "Eylül Özet" sayfası

- **PİYASA KURLARI**: USD 49,03 · EUR 55,19 · GBP 64,83 · RUB 0,59 — Google Finance'ten çekilen **anlık** kur; sahip bunun doğruluğundan emin değil. Tüm dövizler bu tek kurla TL'ye çevriliyor.
- Üç kutu: Toplam Ciro / Toplam Gider / Net Kâr.
- **GELİR DETAYLARI**: satır = ödeme yöntemi (Nakit, Kredi Kartı, İban), sütun = para birimi + "TL KARŞILIĞI".
- **PLATFORMLAR**: Airbnb, Booking, Expedia, Ostrovok, Bounce — ayrı döküm, **ciroya ikinci kez eklenmez**
  (01.09: 6.000 + 24.500 + 7.190 = 37.690; Airbnb 4.051 bu toplamın içinde).
- **Resmi Giderler** satırı ve ayrı **YÖNETİCİ GİDERLERİ** tablosu (Tutar · Açıklama) → çalışanların görmemesi gereken giderler.
- **Günlük kartlar**: her gün için Nakit / KK / İban / Airbnb / Booking / Expedia / Ostrovok / Bounce × para birimi, Toplam Günlük Ciro, Gider, Günlük Net Kâr.

### 1.3 "Yıllık Özet" sayfası

Toplam Ciro / Gider / Net Kâr + her ay için Ciro · Gider · Kâr kutuları (negatif kâr kırmızı). "Sayfa gizlendi" uyarısı → gizli sayfalar var.
Küçük tutarsızlıklar var (Eylül cirosu iki sayfada 2,5 TL farklı; KK toplamı 1.633 TL farklı) → elle tutulan tablonun doğal hatası; **tek kaynaktan türetme** bunu bitirir.

### 1.4 "Maaşlar" sayfası

Her ay için tablo: **Personel · Maaş · Avans · İzin Hak · Kul. İzin · Kalan · + İzin Parası · NET ÖDENECEK**.

Doğrulanan formüller:
- `İzin Parası = Kalan İzin × (Maaş ÷ 30)` → 40.000 ÷ 30 × 4 = 5.333
- `Net Ödenecek = Maaş − Avans + İzin Parası` → 40.000 − 12.500 + 4.000 = 31.500
- Ay uzunluğu ne olursa olsun bölen **30**.
- Avans maaşı aşabilir (35.000 − 35.005 + 2.333 = 2.328).

Diğer: personel yıl içinde değişmiş (Sevim → Nermin, Eda); maaş yıl içinde artmış (Ocak'ta Kerem 30.000 → 40.000;
Ocak defterindeki "kerem 4 izin parası = 4.000" bunu doğrular); Kasım–Aralık tabloları önceden doldurulmuş.
"Ekin" ve "Erol" **iki ayrı çalışan**.

## 2. Dosya 2: "Lale Rezervasyon 2026" (oda doluluğu)

Sayfalar: `Ocak … Aralık`. Yapı: **satır = oda, sütun = gün**. İlk iki sütun (ODA NO, ODA ÖZELLİĞİ) **dondurulmuş**.

### 2.1 Odalar (19 oda, 5 kat)

| Kat | Odalar |
|---|---|
| 1 | 101 Junior · 102 Standard · 103 Double · 104 Regular |
| 2 | 201 Junior · 202 Standard · 203 Double · 204 Regular |
| 3 | 301 Junior · 302 Standard · 303 Twin · 304 Regular |
| 4 | 401 Junior · 402 Standard · 403 Twin · 404 Regular |
| 5 | 501 Luxury · 502 Deluxe · 503 Deluxe |

"Junior Room" ve "Regular Room" sektör standardı değil → **otele özel oda tipi adı** gerekliliğinin kanıtı.

### 2.2 Hücre yazımı ve renkler

Yazım: `İSİM SOYİSİM (gecelik fiyat)`; döviz olabilir ("35 euro", "43.01 EURO"); küsuratlı TL (3125, 2759, 1833, 2096, 1423) büyük olasılıkla platform ödemelerinin TL karşılığı.

| Renk | Anlam (sahibin tanımı) | Programdaki karşılığı |
|---|---|---|
| 🔴 Kırmızı | Parası ödenmiş | ödeme durumu = ödendi |
| 🟡 Sarı | Parası ödenmemiş (kapora verilmiş olsa da) | ödendi değil (kapora varsa not + isteğe bağlı ayrı renk Ö-01) |
| 🔵 Camgöbeği | Aynı gün giriş-çıkış ("…(1600 TL) sonra kirli") | tür = day-use; "sonra kirli" = çıkış sonrası oda temizlenmedi |
| ⚫ Gri | Geçmişte boş kalmış oda | otomatik: bugünden eski + rezervasyon yok |
| ⚪ Beyaz | Boş oda | rezervasyon yok |
| ⬛ Siyah "SATILMAZ" | Oda satışa kapalı (304, Ocak) | oda bloğu / kullanım dışı |

Sahip: **"renkleri kullanıcı ayarlardan değiştirebilmeli; ben sadece kendime göre yaptım."**

### 2.3 Davranışlar

- Çok geceli konaklamada isim **her gün sütununa** tekrar yazılıyor (programda tek rezervasyon, çok hücre).
- Aynı konaklamada farklı gece fiyatı (Fethi Erdem 2000/2000/2500/2500).
- Gece gece ödeme takibi: Salih Çelik 01.10 kırmızı, 02–03.10 sarı → ödeme **gecelere sırayla** dağıtılıyor.
- Aynı gün iki misafir tek hücrede: "SEBAHATTİN SEVEN (2500 TL) sonra Serdar Işık (2500 TL)", "ÖLER (1500 TL) sonra RASİM ŞEKER (1800 TL)".
- Tek kişi iki oda (Orsa Deniz 501+502; Gürcan Kemal İncici 102+401).
- **Hücre yorumu** (Google Sheets notu): "NAKİT ÖDEYECEK KARTLA ÖDERSE 2500 TL OLACAKTIR" → fiyat ödeme yöntemine göre değişebiliyor; not özelliği şart.
- **Tablo dışına atılan rezervasyon**: Ocak'ta 21. satırda "HAKAN DELİREİSOĞLU (1580 TL)" — para verdi gelmedi / iade bekliyor gibi durumlar tablo altına taşınıyor → "park edilmiş rezervasyon".
- Gün başlığında "(cts)" = cumartesi; sahibin en çok sattığı gün → **özel gün vurgusu kullanıcı tanımlı** olmalı.
- Eksik isim ("TÜRKMEN (2000 TL)"), yazım farkları ("Gadir Garibov / GADİR GADİROV") → misafir kartı + otomatik tamamlama.
- Aynı bilgi (isim, fiyat) **iki dosyaya iki kez** yazılıyor → tek giriş ilkesi (G-60).

## 2.4 İkinci tur görseller (14–16) ve KBS Excel dosyası

### 2.4.1 Turizm Bakanlığı "Konaklama Bildirimi" paneli (is.kultur.gov.tr)

- Başlık: "Konaklama Bildirimi - LALE SUIT OTEL - 2026 - EYLÜL". Menü: Konaklama Veri İşlemleri → Güncel Bilgi Formu, Eski Bilgi Formları, Kimsenin Gelmediği Aylar, Tesis Bilgileri ve Dönem Düzenleme; Hitit Kültür ve Turizm Sistemi → Tesis SGK Bilgileri.
- Form: **Ülke** (açılır liste, örn. "Özbekistan"), **Toplam Giriş**, **Toplam Geceleme** → Kaydet. Alt tablo: No · Ülke · Toplam Giriş · Toplam Geceleme · İşlemler (düzenle). Sağ üstte Toplam Giriş, Toplam Geceleme, **Doluluk Oranı** (% 0,24 — panel kendisi hesaplıyor). "Tesisimize Bu Ay Kimse Gelmedi" düğmesi.
- Yasal dayanak metni: 5429 sayılı kanun, resmi istatistik; isim istenmiyor.
- Sahibin notları: her ayın **1–10'u arasında** bildirilir; **aynı gün giriş‑çıkış = 1 geceleme**; **Türkler dahil**.

### 2.4.2 KBS "EGM Konaklayan Listesi" Excel'i (01.09.2026–30.09.2026)

Tek sayfa `EGM_Konaklayan_Listesi`, 607 satır (Eylül). Sütunlar (harf → başlık):

| A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|
| Tc Kimlik No | Geçerli Belge | Adı | Soyadı | Araç Plakası | Geliş Tarihi | Çıkış Tarihi | Verilen Oda | Cinsiyet | Uyruğu | Durum |

- Kimlik ve adlar KVKK gereği maskeli (`27******708`, `YA*****`). Yabancılarda A boş, B'de belge no maskeli. **Boş hücreler XML'de yok** → içe aktarma sütun harfine göre eşlemeli, sıraya göre değil.
- Tarihler Excel seri numarası + saat kesri (`46286.979…`) → gün + saat. Durum: `Pasif` (çıkmış) 602, `Aktif` (hâlâ konaklıyor) 5.
- Uyruk değerleri karışık dil/biçim: `TÜRKİYE`, `GERMANY (Deutschland)`, `UZBEKISTAN`, `KUZEY KIBRIS TURK CUMHURİYETİ`, `SWITZERLAND (Confederation of Helvetia)` → bakanlık listesine (Türkçe ülke adı) **eşleme tablosu** gerekir.
- Eylül'de **253 kayıt aynı gün giriş‑çıkış** (%41) → "aynı gün = 1 gece" kuralı sonucu ciddi etkiler.
- Hesaplanan örnek (programın üreteceği tablo; kişisel veri yok):

| Uyruk | Toplam Giriş | Toplam Geceleme |
|---|---|---|
| TÜRKİYE | 525 | 663 |
| GERMANY | 23 | 88 |
| UZBEKISTAN | 20 | 20 |
| KKTC | 10 | 24 |
| AZERBAIJAN | 5 | 5 |
| … (toplam 23 ülke) | | |
| **TOPLAM** | **607** | **838** |

  Kural: geceleme = çıkış günü − giriş günü (gün farkı); 0 ise 1. Ay sınırını aşan konaklama bu dosyada yok; kural sorusu S-60'ta.

### 2.4.3 Su teslim fişi (tedarik takibi örneği)

"TESLİM FİŞİ" — sucu firması (Altıyol‑Kadıköy), SAYIN: Lale Suit, TARİH. Satırlar: ADET · AÇIKLAMA · B. FİYATI · TUTARI. Örnek: **40 × Munzur 0,5 PET su × 60 = 2.400**; diğer ürün satırları (1,5 L, 5 L, 10 L, 19 L damacana, maden suyu, buz) boş. Toplam 2.400.
→ Tedarik kaydı alanları: tedarikçi, tarih, kalem (ürün, adet, birim fiyat, tutar), toplam, fiş fotoğrafı (isteğe bağlı). Sahibin derdi: **zam fark edilmiyor** → fiyat geçmişi ve uyarı.

### 2.4.4 Firma kaşesi (fatura bilgileri örneği)

Kaşe: unvan ("… PROJE MÜŞAVİRLİK MÜH. İNŞ. SAN. TİC. LTD. ŞTİ."), adres (mahalle, sokak, no, ilçe/il), telefon, **vergi dairesi + vergi numarası**. Sahip bu bilgileri WhatsApp fotoğraflarından arıyor → Firma kartı: unvan, adres, vergi dairesi, vergi no, telefon, e‑posta, not, favori, **kopyala**.

### 2.4.5 Çamaşırhane "Temiz Fişi" (üçüncü tur görseli)

Başlık: çamaşırhane adı ("… Çamaşırhane & Ütü Evi"), **Temiz Fişi**, **Fiş No: RC10746**, **Tarih: 21.09.2026**, "Sayın LALE SUİT". Tablo: **Ürün Adı · Miktar · Lekeli**.

| Ürün Adı | Miktar | Lekeli |
|---|---|---|
| ÇARŞAF | 17 | – |
| NEVRESİM | 11 | – |
| YASTIK KILIFI | 27 | – |
| BÜYÜK HAVLU | 36 | – |
| KÜÇÜK HAVLU | 5 | – |
| AYAK HAVLU | 18 | – |

- **Fiyat yok** (sahip: çamaşırhaneler rahat zam yapmak için yazmaz; birim fiyat ilk anlaşmada konuşulur; yazanlar da var).
- **Lekeli** sütunu ayrı adet → programda satır başına `stained_qty`.
- Sahibin tür listesi: çarşaf, alez, yorgan kılıfı, yastık kılıfı, büyük havlu, küçük havlu, yastık, yorgan, pike, fon perde, tül perde…
- Program yalnızca toplar: aylık tür toplamı, lekeli toplamı, geçerlilik tarihli birim fiyatla tutar, fatura farkı (K-28).

### 2.4.6 Bakanlık panelinden doluluk formülü çıkarımı

Panel: Toplam Giriş 1, Toplam Geceleme 2, Doluluk Oranı %0,24 (Eylül = 30 gün). 2 ÷ (19 oda × 30) = %0,35 ✗; 2 ÷ (28 × 30) = %0,238 ≈ **%0,24** ✓ → panel **yatak sayısı × gün** kullanıyor; Lale ≈ 28 yatak (S-78 ile teyit). Sahip de "bakanlık oda ve yatak sayısını biliyor" dedi.

## 3. Sahibin ek açıklamalarından çıkan kurallar

1. `x` = teslim alındı. Panel = teslim alınmamış birikim.
2. Onay kutusu = günü yönteme göre sırala.
3. Kapora → sarı + not. Programda not şart. Park etme özelliği şart.
4. "sonra kirli" = oda kirli kaldı → oda durumu modülü.
5. Fiyatlar otelin satış politikasına göre değişir; program dayatmaz.
6. 10 yıllık takvim; ilk 10 yılın bayramları hazır; kullanıcı tek tek ya da toplu not ekler.
7. Yönetici giderleri = rol gizliliği.
8. Kur: Google Finance anlık; doğruluğundan emin değil → program güvenilir kaynak + son güncelleme + elle düzeltme sunar.
9. Bounce = bavul emaneti; başka oteller başka firma → ek hizmetler genel tanımlanır.
10. Bakım hatırlatıcı: içerik + tarih (+ tekrar), tarihten birkaç gün önce uyarı.
11. Mesai: 8 saat sonrası ek ücret; satış primi; bayram/yılbaşı mesaisi; tutarları sahip/muhasebeci belirler, saatleri çalışan/sahip/muhasebeci girer, sistem hesaplar.
12. Fatura yok. OTA yok. Bitmiş ürün.
13. **İnternet kuralı düzeltildi (ikinci tur):** "İnternet olmadan da veri girilebilsin" demektir; kur gibi özellikler internet isteyebilir. İstenmeyen: OTA'dan otomatik veri çekme ve program içinden fatura kesme.
14. Kur **piyasa** kuru olmalı (Google/Bloomberg benzeri); resmi TCMB kuru Türkiye'de hep düşük kalıyor.
15. Renk **ve anlam** tamamen kullanıcıya ait.
16. Çoklu cihaz: resepsiyon otelde, sahip evde dizüstünden, ara sıra otelde; telefondan da görmek ister.
17. Program adı **Bismuth**; diller TR/EN/RU/AR; tam sayı varsayılan; tema açık/koyu/sistem; roller sahibin seçimiyle özelleştirilir.
18. Oda arızaları unutuluyor (501 tuvalet kapağı 1 hafta) → arıza sekmesi, görünür rozetler.
19. Misafir fiyat geçmişi sahibin en sevdiği özellik; firma fatura bilgileri ve sürekli istekler misafir kartına.
20. **Üçüncü tur:** Arapça şimdilik yok; orta kur yeterli; hazır roller düzenlenebilir; 2026 verisi taşınacak; KBS'de tüm geceler giriş ayına; çocuk ayrı giriş değil; oda + yatak sayısı ilk açılışta sorulur, tadilatla değişir; otel PC çökebilir ve aynı Google hesabı istenmiyor → ücretsiz sunucu araştırılsın; hava durumu görünür olsun; depo seçimi çok önemli.
