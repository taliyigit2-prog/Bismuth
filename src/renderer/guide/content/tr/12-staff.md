# Personel ve maaş

**Personel** ekranında çalışan kartları, aylık maaş tablosu, avans, izin, mesai ve 14 günlük çizelge durur. Maaş ve avans ödemeleri deftere kendiliğinden gider olarak yazılır. Bu ekranı sahip ve muhasebe görür; müdür izin ve ek mesaiyi yönetir.

Sol menüde **Personel → Personel**'i açın. Dört sekme vardır: **Çalışanlar**, **Maaş tablosu**, **İzin ve çizelge**, **Mesai**.

![Personel ekranı](staff)

Üstteki kutular: çalışan sayısı ve bugün işte olanlar, **Bugün izinli**, bu ayın **Avans** toplamı, **Kalan maaş**, **Bu ay kullanılan izin**.

## Yeni çalışan {#new-employee}

1. **Yeni çalışan**'a basın.
2. **Ad**, **Soyad**, **Görev** (örneğin resepsiyon), **Telefon**, **İşe giriş** tarihi ve **Aylık maaş**'ı yazın.
3. Çalışanın programa girecek bir hesabı varsa **Kullanıcı hesabı** kutusundan bağlayın. Hesaplar **Ayarlar → Kullanıcılar ve roller** bölümünden açılır.
4. Kaydedin.

Bir çalışana tıklayınca kartı açılır: bu ayın özeti, hareketleri, maaş geçmişi ve düğmeler.

## Maaşı değiştirmek {#salary-change}

Kartta **Maaşı değiştir**'e basın; yeni tutarı ve **Geçerli olduğu tarih**'i yazın. O tarihten sonraki aylar yeni maaşla hesaplanır; önceki aylar değişmez. Eski maaşlar **Maaş geçmişi**'nde kalır.

## Avans vermek {#advance}

1. Kartta ya da maaş tablosunda **Avans ver**'e basın.
2. **Avans tutarı**'nı yazın; bu ay kalan maaş üstte görünür.
3. Para resepsiyon kasasından verildiyse **Kasadan verildi**'yi işaretleyin; kasadaki nakitten düşer.
4. Kaydedin.

Avans deftere gider olarak yazılır ve bu ayın maaşından düşer. Kasadan avans verilip verilemeyeceği bir ayardır (**Ayarlar → Personel kuralları**).

## Maaş tablosu ve maaş ödemek {#salary-table}

**Maaş tablosu** sekmesi seçilen ay için her çalışanın satırını gösterir: **Maaş**, **Avans**, **İzin parası**, **Ek mesai**, **Prim**, **Kesinti**, **Net ödenecek**, **Ödenen**, **Kalan**. Oklarla önceki ya da sonraki aya geçin.

Maaş ödemek için:

1. Satırdaki **Maaş öde**'ye basın.
2. **Ödenen tutar**'ı ve **Ödeme yöntemi**ni seçin. Maaş parça parça da ödenebilir.
3. **Ödemeyi kaydet**'e basın.

Ödeme deftere maaş gideri olarak yazılır. Prim ya da kesinti (örneğin "kırılan bardak") için **Prim ya da kesinti**'yi kullanın; bu, deftere gider yazmadan net tutarı değiştirir.

Ay tamamen ödenince **Ayı kilitle** ile o ayı kilitleyin. Kilitli ayda maaş, avans ve izin kayıtları değiştirilemez; gerekirse yetkili kişi **Kilidi aç** ile nedenini yazarak açar.

> [!tip]
> Yanlış bir avans ya da ödeme, kartın **Bu ayın hareketleri** listesinden iptal edilir; defterdeki gideriyle birlikte iptal olur. Kayıt silinmez.

## İzin {#leave}

1. **İzin ve çizelge** sekmesinde **İzin kaydet**'e basın.
2. Çalışanı, **Tür**'ü seçin: **İzin günü** (aylık izin hakkından düşer), **Yıllık izin**, **Hastalık**, **Ücretsiz** ya da **Bayramda çalıştı**.
3. **Başlangıç** gününü ve **Gün** sayısını yazın; bu ay kaç gün kullanıldığı ve kaç gün kalacağı altında yazar.
4. Kaydedin.

**14 günlük çizelge** herkesin önümüzdeki iki haftasını renklerle gösterir: Gündüz, Gece, İzin günü, Yıllık izin, Hastalık. Aylık izin günü, kullanılmayan iznin ödenip ödenmeyeceği ve devredip devretmeyeceği **Ayarlar → Personel kuralları**'ndadır.

## Mesai ve ek mesai {#overtime}

Çalışanlar geliş ve çıkış saatlerini kendileri girer (Bugün ekranındaki **Çalışma saatlerim** kutusundan). **Mesai** sekmesinde müdür ya da sahip:

- Her çalışanın gün gün **Geliş–çıkış** saatlerini ve **Çalışılan** süreyi görür, gerekirse düzeltir.
- Günlük çalışma saatini aşan süre **Önerilen ek mesai** olarak çıkar; **onayla** ile onaylanır.
- Bir günü **Bayram** olarak işaretler.

Ek mesai ücreti otelin kuralına göre hesaplanır (ödenmez, sabit saat ücreti ya da saat ücretinin katı).

## Ücret kuralları {#pay-rules}

Otelin genel kuralları **Ayarlar → Personel kuralları** bölümündedir: aylık izin günü, kullanılmayan iznin ödenmesi ve katsayısı, günlük ücret hesabı (ayın gün sayısına ya da sabit bir sayıya bölünür), günlük çalışma saati, ek mesai ücreti, bayram çalışması katsayısı, prim ve kasadan avans.

Tek bir çalışana özel kural gerekiyorsa çalışanın kartında **Ödeme kuralları**'nı açın; açtığınız kural yalnız o çalışana uygulanır.

## İşten ayrılan çalışan {#leaving}

Kartta **İşten ayrıldı olarak işaretle**'yi seçin, **Son çalıştığı gün**'ü girin ve pencerede yine **İşten ayrıldı olarak işaretle**'ye basın. Kart silinmez; geçmiş maaş ve izin kayıtları korunur. Son ayın maaşı çalıştığı günlere göre hesaplanır. Ayrılanları listede görmek için **Ayrılanları göster**.
