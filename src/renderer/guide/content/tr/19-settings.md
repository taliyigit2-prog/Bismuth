# Ayarlar, kullanıcılar ve roller

Otele özgü her kural Bismuth'ta bir **ayardır**: saatler, odalar, fiyatlar, ödeme yöntemleri, vardiyalar, renkler, izin kuralları. Bu bölüm **Ayarlar** ekranını, kullanıcı hesaplarını ve rolleri anlatır. Çoğu ayarı yalnız otel sahibi değiştirebilir.

Sol menüde **Sistem → Ayarlar**'ı açın. Bilgisayarda bölümler solda listelenir; telefonda üstteki kutudan bölüm seçilir. Rolünüzün göremediği bölümler listede çıkmaz; yalnız görebildiğiniz bölümde "Yalnız görüntüleme" yazar.

## Genel {#general}

Her kullanıcının **kendi** seçimleri: **Dil**, **Açılış ekranı**, **Tema**, **Yoğunluk**, **Kuruşları göster**. Birinin seçimi diğerini etkilemez. **Ekran kilidi** kutusundaki **Kilitlenme süresi** ise otelin bütün bilgisayarları için geçerlidir ve otel sahibi seçer.

## Otel {#hotel}

**Otel bilgileri**: otel adı, ülke (resmî tatiller buna göre), şehir (hava durumu için), **Otelin e-posta adresi** (yalnız hava durumu servisine kimin sorduğunu söylemek için; boş bırakılabilir), saat dilimi, **Giriş saati**, **Çıkış saati** (bu saat geçince çıkmayan oda gecikmiş görünür), **Ana para birimi** ve **Kabul edilen para birimleri**. Değişiklikler **Kaydet**'e basınca uygulanır. Ana para birimi, kayıt girildikten sonra değiştirilemez.

## Odalar ve tipler {#rooms-and-types}

- **Oda tipleri**: kullandığınız tipler ve önerilen fiyatları (**Hafta içi fiyatı**, **Hafta sonu fiyatı**). **Hazır tiplerden seç** ya da **Tip ekle**.
- **Odalar**: numara, kat, tip ve yatak sayısı. **Oda ekle** ya da kat kat **Toplu ekle**.
- **Satılabilir** kapalı oda takvimde görünür ama satılmaz (örneğin personel odası). **Kullanımda** kapatılan oda takvimden çıkar; eski kayıtları kalır.
- Yatak sayısı değişince **Geçerlilik tarihi** girin; geçmiş ayların doluluk ve bakanlık istatistiği o tarihteki sayıyla hesaplanır.

Odalar silinmez; kullanılmayan oda kapatılır.

## Listeler {#lists}

**Ödeme yöntemleri**, **Satış kanalları**, **Ek hizmetler**, **Gider bölümleri**, **Çamaşır türleri** ve **Ürün kategorileri**. Hazır satırları yeniden adlandırabilir, sıralayabilir, kullanmadığınızı kapatabilirsiniz; satırlar silinmez.

- Ödeme yöntemi için **Nakit ödeme** açıksa bu yöntemle alınan para kasaya girer.
- Satış kanalı için **Komisyon (%)** ve **Parayı kim alır** (Otel ya da Kanal) yazılabilir. Kanallar yalnız etikettir; Bismuth Booking, Airbnb gibi sitelere bağlanmaz.
- Ek hizmet için **Önerilen fiyat** ve **Birim** (rezervasyon başına, gece başına, kişi başına…).

## Vardiyalar {#shifts}

Vardiya adları ve saatleri (örneğin Gündüz 09:00–21:00, Gece 21:00–09:00). Bitiş başlangıçtan önceyse vardiya ertesi gün biter. Vardiya devri ve görevler bu vardiyalara göre düzenlenir.

## Takvim {#calendar-settings}

**Vurgulu günler** (takvimde farklı renkte görünen günler, örneğin hafta sonu), **Hafta sonu fiyatı uygulanan geceler** (bu günlerde başlayan geceler oda tipinin hafta sonu fiyatını alır; varsayılan cuma ve cumartesi; vurgulu günlerden ayrıdır), **Gün kapatma** ve bu yılın bayramları. Bkz. [Gün kapatma](guide:ledger#day-closing).

**Takvim başlangıç yılı**: takvimin geriye ne kadar gideceği. Daha eski bir konaklama varsa takvim onun yılından başlar; boş bırakırsanız en eski konaklamanın yılından.

## Durum etiketleri ve renkler {#status-colors}

Takvimdeki renklerin anlamı burada ayarlanır.

- **Otomatik durumlar**: program ödemeden ve tarihten kendisi bulur: Ödendi, Ödenmedi, Kısmen ödendi / kapora, Aynı gün giriş‑çıkış, Geçmiş tarih, boş; Boş; Satılmaz. Adlarını, renklerini ve anlamlarını değiştirebilir, istemediğinizi kapatabilirsiniz.
- **Kendi etiketleriniz**: rezervasyona taktığınız etiketler (Grup, Sorunlu misafir, Uzun konaklama…). **Etiket ekle** ile ad, renk ve anlam verin. "Takvimde hücreyi bu renk doldursun" seçilirse etiket dolguyu alır, ödeme durumu kenara geçer.
- Açık ve koyu temanın renkleri ayrıdır. Okunması zor bir renk seçerseniz "Bu renkte yazı zor okunur" uyarısı çıkar.
- **Takvim önizlemesi** değişiklikleri hemen gösterir; **Varsayılan renklere dön** baştaki renklere döner.

Bütün renkleri ve bileşenleri açık ve koyu temada görmek için menüde **Tema önizleme** vardır.

## Kullanıcılar {#users}

Herkes kendi adıyla oturum açar; kim ne yaptı denetim kaydında görünür. **Kullanıcılar ve roller** bölümünde:

1. **Kullanıcı ekle**'ye basın.
2. **Kullanıcı adı** (sonradan değişmez), **Görünen ad**, **Rol** ve **Geçici şifre** (en az 8 karakter) yazın.
3. Çalışanın personel kartı varsa **Personel kartı**'ndan bağlayın; çalışan kendi mesai saatlerini girer.
4. Kaydedin ve geçici şifreyi çalışana iletin. İlk oturum açışta kendi şifresini belirler.

Bir kullanıcı şifresini unutursa **Şifre sıfırla** ile yeni geçici şifre verin. İşten ayrılan kişi için **Hesabı kapat**; kayıtları ve geçmişi kalır, hesap istenirse yeniden açılır. Son sahip hesabı kapatılamaz.

![Kullanıcılar ve roller](settings-users)

## Roller {#roles}

Rol, bir kullanıcının hangi ekranı görebileceğini ve neyi değiştirebileceğini belirler. Hazır roller: **Sahip**, **Müdür**, **Resepsiyon**, **Muhasebe**, **Temizlik**, **Çalışan**. Sahip rolü her şeyi görür ve değiştirilemez.

1. **Roller** kutusunda rolü seçin.
2. Her ekran için **Yok**, **Görür** ya da **Düzenler**'i seçin.
3. **Kaydet**'e basın.

- **Rol ekle** ile yeni rol açılır; yeni rol hiçbir şeyi görmeden başlar. Var olan bir rolden başlamak için o rolde **Kopyala**'yı kullanın.
- **Uzaktan oturum açabilir**: kapalıysa bu roldeki kullanıcılar yalnız otelin bilgisayarlarından girer.
- **Yalnız kendi görevleri**: açıksa bu roldeki kullanıcılar yalnız kendilerine verilen görevleri görür.
- **Bu rolün gözüyle bak**: menüyü ve ekranları o rolün gördüğü gibi gösterir; üstteki şeritten **Önizlemeyi kapat** ile çıkılır.

> [!tip]
> Bir ekranı menüden gizlemek tek başına koruma değildir; Bismuth her işlemde yetkiyi ayrıca denetler. Yetkisi olmayan biri adresle bir ekranı açarsa "Bu ekrana yetkiniz yok" yazar.

## Denetim kaydı {#audit}

**Sistem → Denetim kaydı** ekranı (varsayılan olarak yalnız sahip görür) kimin, ne zaman, hangi cihazdan neyi eklediğini, değiştirdiğini ya da iptal ettiğini listeler. **Filtre** ile tarih, kişi, kayıt türü ve işlem seçin; bir satıra tıklayınca önceki ve sonraki değerler görünür. Kayıtlar silinmez.

## Kılavuz ayarı {#guide-settings}

**Ayarlar → Kılavuz** bölümünde kılavuzu açar, tanıtım turunu yeniden başlatırsınız. **Yeni kullanıcılara tanıtım turunu göster** açıksa her kullanıcı ilk oturum açışında kısa turu bir kez görür.
