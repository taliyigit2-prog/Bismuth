# Yedek ve yeni bilgisayara taşıma

Bu kılavuz otel sahibi içindir. Bilgisayar bozulursa, çalınırsa ya da yeni bir bilgisayara geçmek isterseniz
kayıtlarınızı nasıl geri alacağınızı adım adım anlatır. Kurulum için: [`kurulum.md`](kurulum.md).

## Bismuth yedeği nasıl alır?

- **Her gün kendiliğinden**: gece sessiz saatte (varsayılan 04:00; **Ayarlar → Yedek → Yedek ayarları**'ndan değişir) ve
  program kapanırken. Bilgisayar o saatte kapalıysa, açıldıktan birkaç dakika sonra alınır. Program kısa aralıklarla
  açılıp kapanıyorsa kapanış yedeği, son otomatik yedek 6 saatten eskiyse alınır (yedekler yığılmasın diye).
- **İki yere**:
  1. Bu bilgisayarda, programın veri klasöründe (`backups` klasörü). Hızlı geri yükleme içindir.
  2. Otelin **Google Drive** klasöründe: `Drive'ım/Bismuth/yedekler`. Bu kopya **şifrelidir**; yalnız
     **Bismuth anahtarı** ile açılır. Bismuth Google'a bağlanmaz; dosyayı bu klasöre yazar, Google Drive
     masaüstü uygulaması internete gönderir. Drive uygulaması kurulu değilse ya da klasör yoksa Drive kopyası sessizce
     atlanır; bu bilgisayardaki yedek yine alınır ve ekranda uyarı çıkar.
- **30 gün** saklanır (**Saklama süresi** ayarıyla 1–365 gün arası değişir). Yeni yedek gelince süresi dolan **otomatik**
  yedekler hem burada hem Drive'da silinir; en yeni otomatik yedek her zaman kalır. Sizin **Şimdi yedek al** ile
  aldıklarınız (adı `-elle` ile biter) ve geri yükleme öncesi alınanlar (`-guvenlik`) kendiliğinden silinmez; istemezseniz
  dosyayı klasöründen kendiniz silersiniz.
- Yedek dosyasının adı `bismuth-yedek-2026-10-04-0400.bmy` gibidir (tarih ve saat).
- Yedek kayıtları ve **ekleri** (arıza fotoğrafları vb.) birlikte içerir.
- Yedek alınırken program yavaşlamaz: yedek küçük parçalar hâlinde, aralarında bekleyerek alınır; siz programı
  kullanırken durur, boşta devam eder. Kopyanın sağlamlık denetimi de programın ekranlarını bekletmeden, arka planda yapılır.
- Bir yedek alınamazsa (ör. disk dolu) program her dakika yeniden denemez: 30 dakika, sonra 1, 2, 4 ve en çok 6 saat
  bekleyip yeniden dener; yedek alınınca bekleme sıfırlanır.
- **Bu bilgisayardaki yedekler şifrelenmez** (yalnız Drive'a gidenler şifrelidir). Bu bilgisayardaki yedek, programın
  kendi veri dosyasıyla aynı yerde durur; onu şifrelemek, bilgisayara erişebilen birine karşı bir şey katmaz, anahtar
  kaybolursa ise en hızlı geri dönüş yolunu kapatır. Bu yüzden ayrı bir "yerel yedeği de şifrele" ayarı yoktur.

Her şeyin yolunda olduğunu **Ayarlar → Yedek** ekranında görürsünüz: **Son yedek**, **Sonraki otomatik yedek** ve **Google
Drive kopyası** (Çalışıyor / Drive klasörü yok / Anahtar saklanamıyor / Yazılamadı). Bir sorun varsa (iki gündür yedek yok,
Drive'a kopya gitmiyor, son yedek alınamadı, geri yükleme yapılamadı, Bismuth anahtarı hiç gösterilmedi) bu ekranda ve
**Bugün** ekranında uyarı çıkar.

## Şimdi yapın: Bismuth anahtarını kâğıda yazın

Drive'daki yedekler şifrelidir. Bilgisayar tamamen kaybolursa, yeni bilgisayarda bu yedekleri açmak için
**Bismuth anahtarı** gerekir. Anahtar olmadan Drive'daki yedek kimse tarafından açılamaz — sizin tarafınızdan da.

1. **Ayarlar → Yedek → Bismuth anahtarı → Anahtarı göster**'e basın. (Bu kutu yalnız sahip hesabında görünür.)
2. Çıkan 11 gruplu metni (her grupta 5 harf/rakam, ör. `7KQ2M-…`) **kâğıda** yazın.
3. Kâğıdı bilgisayardan ayrı, güvenli bir yerde saklayın (kasa, ev). Fotoğrafını çekip telefonda tutmayın.

Anahtar penceresinde aynı anahtarın **QR kodu** ve **Yazdır** düğmesi de vardır (K-41): yazdırdığınız sayfayı kâğıt yerine
saklayabilirsiniz; Mac'te ya da yeni bilgisayarda anahtarı yazarak ya da QR kodunu telefon kamerasıyla okutup çıkan metni
yapıştırarak girersiniz.

Anahtarın gösterilmesi denetim kaydına yazılır. Anahtar henüz yoksa ilk gösterişte ya da ilk Drive yedeğinde
oluşturulur. İlk Drive yedeğinde kendiliğinden oluşan anahtar **siz bir kez görene kadar** Yedek ve Bugün ekranlarında
"Bismuth anahtarı hiç gösterilmedi" uyarısı çıkar; **Anahtarı göster**'e basınca (ya da yeni bilgisayarda kâğıttaki anahtarı
girince) kalkar. Bu bilgisayar anahtarı güvenle saklayamıyorsa (**Bu bilgisayar anahtarı güvenle saklayamıyor**) Drive kopyası
alınmaz; bu durumda yalnız bu bilgisayardaki yedeklere güvenebilirsiniz.

## Elle yedek ve geri yükleme (aynı bilgisayar)

- **Elle yedek**: **Ayarlar → Yedek → Şimdi yedek al**. Örneğin büyük bir değişiklikten ya da yeni bir sürümü kurmadan önce.
- **Yedeği denetlemek**: listede bir yedeğin yanındaki **Denetle**'ye basın; Bismuth dosyayı açıp sağlam olup olmadığına
  bakar (**Yedek sağlam** / **Yedek bozuk; geri yüklenemez**).
- **Geri yükleme**: listede istediğiniz yedeğin yanındaki **Geri yükle**'ye basın ve **Yedeği geri yükle** ile onaylayın.
  1. Bismuth önce seçtiğiniz yedeği açıp sağlam olduğunu denetler.
  2. Bugünkü verinin bir yedeğini alır (listede **Geri yükleme öncesi** adıyla kalır); yanlış yedeği seçtiyseniz oradan
     geri dönebilirsiniz.
  3. Ekranın üstünde **Geri yükleme bekliyor** uyarısı çıkar. **Şimdi yeniden başlat**'a basın (ya da programı kapatıp
     açın). Yedekteki veri açılışta yerine konur. Vazgeçerseniz **Geri yüklemeyi iptal et**'e basın.
  4. **Geri yükle** ile yeniden başlatma arasında girilen kayıtlar geri yüklenen veride olmaz; açılışta, veri yerine
     konmadan hemen önce ayrı bir güvenlik kopyasına alınır. Bu kopya da listede **Geri yükleme öncesi** adıyla görünür ve
     geri yüklenebilir (son 3 tanesi saklanır).
- Açılışta geri yükleme yapılamazsa (açılan kopya diskte değişmişse ya da dosyalar başka bir program tarafından
  kullanılıyorsa) program eski veriyle açılır; **Ayarlar → Yedek**'te ve **Bugün**'de **Geri yükleme yapılamadı** uyarısı
  nedeniyle birlikte çıkar. **Tamam**'a basınca kalkar; yedeği yeniden seçip deneyebilirsiniz.
- Yedek daha eski bir Bismuth sürümüyle alınmışsa açılışta kendiliğinden güncellenir. Daha **yeni** bir sürümle
  alınmışsa geri yüklenmez ("Bu yedek Bismuth'un daha yeni bir sürümüyle alınmış"); önce programı güncelleyin.
- **Şimdi yeniden başlat** ve **Klasörü aç** düğmeleri yalnız otel bilgisayarındaki Bismuth penceresinde çalışır; telefondan ya
  da tarayıcıdan açtıysanız görünmezler. Yeniden başlatmayı o zaman otel bilgisayarında programı kapatıp açarak yapın.
- Yedek listesinde **Güncelleme öncesi** adıyla görünenler, yeni bir sürüm veri düzenini değiştirmeden önce programın
  kendiliğinden aldığı kopyalardır (yalnız kayıtları içerir; ekler olduğu gibi kalır). Son 10 tanesi saklanır
  (**Güncelleme öncesi kopya sayısı** ayarı).

## Yeni bilgisayara taşıma

İki yol var. Eski bilgisayar çalışıyorsa 1. yol daha kolaydır.

### 1. Eski bilgisayar çalışıyor

1. Eski bilgisayarda **Ayarlar → Yedek → Şimdi yedek al**'a basın.
2. **Veri klasörü** bölümünde **Yedek klasörü** satırındaki **Klasörü aç**'a basın. En yeni `.bmy` dosyasını (adı `…-elle.bmy`)
   bir belleğe kopyalayın. Dosyanın **adını değiştirmeyin**. Drive klasöründeki dosyayı değil, **bu klasördeki** dosyayı
   alın: Drive'dakiler şifrelidir, buradakiler değildir.
3. Yeni bilgisayara Bismuth'u kurun ([`kurulum.md`](kurulum.md)) ve kurulum sihirbazını kısaca tamamlayın (aşağıda 3. adıma bakın).
4. Yeni bilgisayarda **Ayarlar → Yedek → Veri klasörü → Yedek klasörü → Klasörü aç**'a basın ve belleğindeki `.bmy` dosyasını
   o klasöre koyun. Listeyi yenileyin (başka bir ekrana geçip geri gelin ya da 30 saniye bekleyin); yedek **Bu bilgisayar**
   olarak görünür.
5. Yedeğin yanındaki **Geri yükle**'ye basın, onaylayın, **Şimdi yeniden başlat**'a basın.
6. Program açılınca **eski kullanıcı adınız ve şifrenizle** oturum açın. Kayıtlarınızı kontrol edin: takvim, defter, misafirler.

### 2. Felaket: bilgisayar bozuldu ya da kayboldu

İhtiyacınız olanlar: yeni bir bilgisayar, otelin Google hesabı (Gmail) şifresi, kâğıttaki Bismuth anahtarı.

1. Yeni bilgisayara **Google Drive masaüstü uygulamasını** kurun ve otelin Google hesabıyla oturum açın.
   `Drive'ım/Bismuth/yedekler` klasöründe yedeklerin göründüğünü bekleyin.
2. **Bismuth'u kurun** ([`kurulum.md`](kurulum.md): Windows'ta `Bismuth-Setup.exe`, Mac'te `Bismuth.dmg` ya da Intel Mac'te `Bismuth-Intel.dmg`).
3. Kurulum sihirbazını kısaca tamamlayın. Yalnız zorunlu adımlar yeter: **Dil ve tema**, **Çalışma şekli**, **Otel**, **Para
   birimleri**, **Oda tipleri**, **Odalar**, **Sahip hesabı**; diğerlerini **Atla** ile geçin. Bu bilgiler birazdan yedekteki
   bilgilerle değişecek. Sonunda çıkan kurtarma kodlarını önemsemeyin; geri yüklemeden sonra eski hesabınızın kodları geçerlidir.
4. **Ayarlar → Yedek**'e gidin. Yedek listesinde **Google Drive (şifreli)** yazan en yeni yedeği seçin ve **Geri yükle**'ye basın.
5. Açılan pencerede **Bismuth anahtarı** alanına kâğıttaki anahtarı yazın (tireli ya da tiresiz) ve **Yedeği geri yükle**'ye
   basın. Bu bilgisayar o ana kadar kendi anahtarını oluşturmuş olabilir; **yeni bilgisayarda anahtarı her zaman kâğıttan
   yazın.** Bismuth bu anahtarı bundan sonraki Drive yedekleri için de saklar.
6. **Şimdi yeniden başlat**'a basın. Program açılınca eski kullanıcı adınız ve şifrenizle oturum açın.
7. Kayıtlarınızı kontrol edin: takvim, defter, misafirler. Son yedekten sonra girilen kayıtlar (en çok bir
   günlük) yoktur; onları yeniden girin.

Şifreli yedekte anahtar yanlışsa Bismuth "Bismuth anahtarı bu yedeğe uymuyor. Kâğıttaki anahtarı kontrol edin." der;
harfleri kâğıttaki gibi yazın. Anahtar hatalı yazılmışsa "Anahtar hatalı yazılmış" der (son harfler sağlama içindir).

### Taşıdıktan sonra

- Otel bilgisayarı değiştiyse, o bilgisayara bağlanan telefon ve Mac'lerin yeni adresi bilmesi gerekir
  (**Ayarlar → Uzaktan erişim**; bkz. [`uzaktan-erisim.md`](uzaktan-erisim.md)).
- Eski bilgisayarı satmadan ya da vermeden önce Bismuth'un veri klasörünü silin
  ([`kurulum.md`](kurulum.md) → "Bismuth'u kaldırmak").

## Mac'te kopya (salt okunur yedek kopya) ve ana bilgisayarı devralmak

Sahibin Mac'inde Bismuth, otel bilgisayarına bağlanıp canlı çalışabilir; ayrıca Mac'te otelin verisinin **salt okunur bir
kopyası** tutulur. Otel bilgisayarı kapanır ya da bozulursa Mac'te her şey kopyadan görünür (ekranın başlığında **Yedek
kopya** ve son eşitleme saati yazar; yazma düğmeleri kapalıdır). Bu kopya **yedek değildir**: yedek yukarıda anlatılan
`.bmy` dosyalarıdır; kopya ise canlı çalışan ikinci bir görünümdür.

- **Nasıl çalışır:** Mac'te Bismuth'un **Başka bir Bismuth'a bağlan** (istemci) modunda açık olması ve otel bilgisayarının
  adresini bilmesi gerekir (bkz. [`uzaktan-erisim.md`](uzaktan-erisim.md)). Bağlantı varken kopya canlı güncellenir;
  yoksa otelin Google Drive klasöründeki şifreli **kutu** dosyalarından güncellenir (`Drive'ım/Bismuth/kutu`). Kutu dosyaları da
  Bismuth anahtarıyla şifrelidir; Mac'te anahtarın **bir kez** girilmesi gerekir (**Ayarlar → Yedek → Bismuth anahtarı →
  Anahtarı gir**).
- **Ana bilgisayarı devralmak:** otel bilgisayarı tamamen bozulduysa Mac (ya da yeni bir bilgisayar) **Bu bilgisayarı ana
  bilgisayar yap** sihirbazıyla son veriyle ana bilgisayar olur. Eski bilgisayar sonradan açılırsa yazmayı kapatır ve yeni
  ana bilgisayardan kopyalamayı önerir. İki yerde de internetsiz kayıt girildiyse çakışan kayıtlar listelenir; otomatik
  birleştirme yapılmaz.
- Mac'te kopya da yeterli değilse yukarıdaki "Felaket" adımlarını Mac'te uygulayın.

<!-- doğrula: P13b — bu bölüm Faz 13'ün (madde 3, 4, 5) yazılı planına göredir; P13b teslim edilince menü adları, düğme metinleri
(Yedek kopya rozeti, "Bu bilgisayarı ana bilgisayar yap"), kutu klasörü adı ve anahtarı girme yeri kodla karşılaştırılmalı -->

## Excel'e almak ve eski tabloları içeri aktarmak

Bunlar **Ayarlar → Yedek** ekranının altındaki **Dışa ve içe aktarma** kutusundadır. Yedek **değildir**: Excel'de açıp
bakmak ya da eski tabloları programa almak içindir.

- **Dışa aktar**: bütün tablolar tek Excel dosyasında (her tablo ayrı sayfa) ya da tek tablo CSV olarak. Tablolar:
  rezervasyon geceleri, rezervasyonlar, odadaki kişiler, defter gelirleri ve giderleri, gider ürün satırları, personel,
  maaşlar, maaş ve avans ödemeleri, izinler, çalışma saatleri, misafirler, firmalar, kara liste, rehber, tedarik ürünleri,
  çamaşırhane, görevler, arızalar, kayıp eşya. İsterseniz tarih aralığı seçersiniz (yalnız tarihli tablolara uygulanır).
  Kimlik numaraları ve tanıtıcı notlar yalnız bunları görme yetkisi olan rolde dosyaya yazılır. Her dışa aktarma denetim
  kaydına yazılır. Otel bilgisayarındaki pencerede "Farklı kaydet" penceresi açılır; telefondan ya da tarayıcıdan dosya
  indirilir.
- **İçe aktar**: 2026 e‑tablolarınız için üç hazır şablon var (dosya CSV ya da XLSX, en çok 5 MB; büyükse ayları ayrı
  dosyalara bölün). Her şablonun **Örnek dosyayı indir** düğmesi sütun adları hazır bir CSV verir:
  - **Rezervasyon (oda × gün)**: her satır bir oda, her sütun bir gün, hücrede `AD SOYAD (fiyat)`. Google
    E‑Tablo'dan **XLSX** olarak indirirseniz hücre renkleri de okunur (kırmızı = ödendi).
  - **Defter (günlük satırlar)**: kasa (x), ücret, birim, isim, ödeme yöntemi, oda, platform ve gider sütunları.
  - **Maaşlar (çalışan × ay)**: her satır bir çalışanın bir ayı — personel, ay (`2026-10` ya da `Ekim 2026`), maaş, ödenen
    ve ödeme yöntemi; isterseniz ödeme tarihi ve para birimi. Çalışanlar önce **Personel** ekranında eklenmiş olmalıdır
    (bilinmeyen ad sorunlu satır olarak listelenir). Maaş değiştiyse o aydan başlayan yeni maaş olarak yazılır (eski aylar
    değişmez); ödenen tutar o ayın maaş ödemesi olur. Defterdeki maaş giderlerini de içe alacaksanız **Ödenen** sütununu
    boş bırakın; yoksa maaş iki kez gider sayılır.

  Sihirbazın adımları: **Dosya → Sütunlar → Önizleme → Sonuç**. Son adıma kadar hiçbir şey kaydedilmez. Sihirbaz önce
  sütunları gösterir, sonra alınacak kayıtları ve **sorunlu satırları** listeler (bilinmeyen oda, okunamayan tarih ya da
  tutar…). Sağlam satırlar alınır; sorunluları dosyada düzeltip yalnız onları yeniden içe alabilirsiniz. Farklı yazılmış
  olabilecek misafir adları (ör. "Gadir Garibov" / "Gadir Gadirov") listede işaretlenir; Misafirler ekranında birleştirebilirsiniz.
  Rezervasyon şablonunda renkten ödeme yazmayı seçtiyseniz ve **Defter** şablonunu da içe alacaksanız ödeme yazmayı kapatın;
  yoksa gelir iki kez sayılır (sihirbaz bunu hatırlatır).

  **Aynı dosyayı iki kez almak:** daha önce alınmış bir satır yeniden alınmaz. Önizleme bunları **Alınmış** diye işaretler
  ve sayısını söyler ("… kayıt daha önce içe alınmış; yeniden alınmaz"); aynı dosya daha önce alındıysa ne zaman alındığını
  da yazar. Bu yüzden sorunlu satırları dosyada düzeltip **dosyanın tamamını** yeniden içe alabilirsiniz: yalnız yeni ya da
  düzeltilen satırlar girer.

  **Bir içe aktarmayı geri almak:** kutunun altındaki **İçe aktarmalar** listesinde her içe aktarma (dosya adı, tarih, kim
  aldı, ne yazdı) durur. Yanlış bir dosyayı aldıysanız yanındaki **Aktarımı iptal et**'e basın ve nedenini yazın. O
  aktarımın yazdığı rezervasyonlar, ödemeler, giderler ve maaş ödemeleri iptal edilir, teslimleri geri alınır; hiçbir şey
  silinmez ve her iptal denetim kaydına yazılır. Maaş tutarları ve oluşan misafir kartları olduğu gibi kalır. İptal bir
  yerde takılırsa (ör. kapatılmış bir güne yazma yetkiniz yoksa) hiçbir şey değişmez ve nedeni söylenir. İptal edilen
  aktarımın satırları yeniden içe alınabilir.

## Sık sorulanlar

- **Drive klasörü bulunamadı uyarısı çıkıyor.** Google Drive masaüstü uygulaması kurulu ve açık mı? Klasör farklı
  bir yerdeyse **Ayarlar → Yedek → Yedek ayarları → Google Drive klasörü** alanına tam yolunu yazın (klasör önceden var olmalı).
- **Yedek alınırken program yavaşlar mı?** Hayır. Yedek küçük parçalar hâlinde, aralarında bekleyerek alınır; siz programı
  kullanırken durur, boşta devam eder.
- **Anahtarı kaybettim.** Bu bilgisayar çalıştığı sürece sorun yok: **Anahtarı göster** ile yeniden yazın. Bilgisayar
  da kaybolduysa Drive'daki şifreli yedekler açılamaz.
- **Geri yüklemeden vazgeçtim.** Program yeniden başlamadan önce **Geri yüklemeyi iptal et**'e basın. Başladıysa, "Geri yükleme
  öncesi" yedeğini geri yükleyin.
- **Yedek listesinde "Bozuk" yazıyor.** O dosya açılamıyor; geri yüklemeyin. Bir önceki sağlam yedeği kullanın.
