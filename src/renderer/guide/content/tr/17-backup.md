# Yedek ve veri aktarma

Otelin bütün kayıtları ana bilgisayarda durur. Bilgisayar bozulursa ya da çalınırsa kayıtlar kaybolmasın diye Bismuth **her gün kendiliğinden yedek alır**: bir kopya bu bilgisayarda, şifreli bir kopya otelin Google Drive klasöründe. Bu bölüm yedekleri, geri yüklemeyi, Bismuth anahtarını ve Excel'e veri alıp vermeyi anlatır.

## Yedek durumu {#backup-status}

**Ayarlar → Yedek** bölümünü açın.

![Yedek ayarları](backup)

**Yedek durumu** kutusunda **Son yedek**, **Sonraki otomatik yedek** ve **Google Drive kopyası** durumu yazar. Otomatik yedek her gün otelin en sakin saatinde (varsayılan 04:00) ve program kapanırken alınır. O saatte program kapalıysa açıldıktan birkaç dakika sonra alınır.

Hemen yedek almak için **Şimdi yedek al**'a basın. Örneğin büyük bir değişiklikten önce ya da bilgisayarı taşımadan önce.

> [!warning]
> "İki gündür yedek alınmadı" ya da "Drive'a kopya gitmiyor" uyarısı görürseniz hemen bakın: Google Drive masaüstü uygulamasının açık olduğunu ve diskte yer olduğunu kontrol edin, sonra **Şimdi yedek al**'a basın. Uyarı Bugün ekranında da çıkar.

## Google Drive kopyası {#drive-copy}

Bismuth bir bulut hesabına bağlanmaz; yalnız bilgisayardaki Google Drive klasörüne dosya yazar, eşitlemeyi Google Drive uygulaması yapar. Bunun için ana bilgisayara **Google Drive masaüstü** uygulaması kurulu ve otelin hesabıyla açık olmalıdır.

Varsayılan klasör "Drive'ım/Bismuth/yedekler"dir; Klasörü görmek ya da değiştirmek için **Yedek ayarları** altında **Drive klasörünü bul**'a basın: Bismuth bu bilgisayardaki bilinen Drive klasörlerine (Windows'ta **G:** sürücüsü, Mac'te Finder'daki Google Drive) bakıp bulduğunu kaydeder; ağa bağlanmaz. Bulamazsa ya da başka bir klasör isterseniz **Klasör seç** ile seçin.

## Bismuth anahtarı {#backup-key}

Drive'a giden yedekler **Bismuth anahtarı** ile şifrelenir; Google bile içini okuyamaz. Bilgisayar bozulursa yeni bilgisayarda yedeği açmak için bu anahtar gerekir.

1. **Bismuth anahtarı** kutusunda **Anahtarı göster**'e basın.
2. Anahtarı **kâğıda yazın** ve güvenli bir yerde (örneğin kasada) saklayın.

Yeni bir bilgisayarda Drive'daki yedeği açarken **Anahtarı gir** ile kâğıttaki anahtarı yazarsınız. Ana bilgisayarın anahtarını gösterme, girme ve değiştirme yalnız ana bilgisayarın kendi penceresinde yapılır; telefondan ya da ona uzaktan bağlanan bir bilgisayardan yapılamaz.

> [!warning]
> Anahtarı kaybederseniz Drive'daki şifreli yedekler açılamaz. Anahtarı yalnız güvendiğiniz kişiyle paylaşın.

## Yedekler listesi ve geri yükleme {#restore}

**Yedekler** listesinde her yedeğin tarihi, türü (**Otomatik**, **Elle**, **Geri yükleme öncesi**, **Güncelleme öncesi**), yeri (**Bu bilgisayar** ya da **Google Drive (şifreli)**) ve boyutu yazar. Otomatik yedekler ayarda yazan gün kadar (varsayılan 30 gün) saklanır.

- **Denetle**: yedeğin sağlam olup olmadığını kontrol eder.
- **Geri yükle**: kayıtları o yedekteki hâline döndürür.

Geri yüklemek için:

1. Listede istediğiniz yedeğin **Geri yükle** düğmesine basın.
2. Uyarıyı okuyun: önce bugünkü veri ayrıca yedeklenir; geri yüklemeden sonra girilen kayıtlar o güvenlik yedeğinde kalır.
3. **Yedeği geri yükle** ile onaylayın.
4. **Şimdi yeniden başlat**'a basın. Program yeniden açılınca yedekteki veri gelir.

Vazgeçerseniz yeniden başlatmadan önce **Geri yüklemeyi iptal et**'e basın. Geri yükleme yalnız ana bilgisayardaki program penceresinden yapılabilir.

## Veri klasörü {#data-folder}

**Veri klasörü** kutusu kayıtların ve eklerin (fotoğraflar, fişler) bilgisayarda nerede durduğunu ve boyutunu gösterir. **Klasörü aç** ile klasörü açabilirsiniz. Bu klasördeki dosyaları elle silmeyin ya da değiştirmeyin.

## Excel'e aktarmak (dışa aktar) {#export}

Rezervasyonları, defteri, personeli ya da başka bir tabloyu Excel'de açmak için:

1. **Ayarlar → Yedek** bölümünde **Dışa ve içe aktarma** kutusunda **Dışa aktar**'a basın.
2. **Tablo**'yu seçin ya da **Tüm tablolar**'ı.
3. **Dosya türü**: **Excel (XLSX)** (tarihler ve tutarlar biçimli, her tablo ayrı sayfa) ya da **CSV**.
4. İsterseniz **Başlangıç** ve **Bitiş** tarihi seçin.
5. **Dışa aktar**'a basın ve dosyayı kaydedeceğiniz yeri seçin.

Listede programdaki bütün kayıtlar var: rezervasyonlar ve defterin yanında odalar ve oda tipleri, satılmaz odalar, kasa teslimleri, vardiya devirleri ve pano notları, özel günler, kur geçmişi, çamaşırhane fiyatları ve ay hesapları, içe aktarmalar da. Her rol yalnız ekranda görebildiği tabloları görür.

Kimlik numaraları yalnız kimlik yetkisi olan rolde dosyaya yazılır. Tanıtıcı notlar ve kişisel notlar (**Kendime not**) hiçbir dosyaya yazılmaz. Sahip bölümünü ya da maaşları göremeyen rolde kasa teslimi tutarları bu satırlar olmadan hesaplanır.

## Eski e‑tabloları almak (içe aktar) {#import}

Excel ya da Google E‑Tablo'da tuttuğunuz eski rezervasyon, defter ve maaş sayfalarını programa alabilirsiniz. Son adıma kadar hiçbir şey kaydedilmez.

1. **İçe aktar**'a basın.
2. **Şablon**'u seçin: **Rezervasyon (oda × gün)** (her satır bir oda, her sütun bir gün; hücrede "AD SOYAD (fiyat)"), **Defter (günlük satırlar)** ya da **Maaşlar (çalışan × ay)** (personel, ay, maaş, ödenen, ödeme yöntemi; çalışanlar önce Personel ekranında olmalı). **Örnek dosyayı indir** sütun adları hazır bir dosya verir.
3. **Dosya**: CSV ya da XLSX (en çok 5 MB). Google E‑Tablo'da Dosya → İndir menüsünden alabilirsiniz. **Devam**'a basın.
4. **Sütunlar**: programın bulduğu sütunları kontrol edin; gerekirse ayı, satış kanalını ve ödeme yöntemini seçin. **Önizle**'ye basın.
5. **Önizleme**: alınacak kayıtları ve sorunlu satırları görün. Aynı kişi farklı yazılmış olabilir; içe aldıktan sonra Misafirler ekranında birleştirebilirsiniz.
6. **… kaydı içe al**'a basın.

Sorunlu satırlar alınmaz. Dosyada düzeltip dosyanın tamamını yeniden içe alabilirsiniz: daha önce alınmış satırlar **Alınmış** diye işaretlenir ve ikinci kez yazılmaz.

Yanlış bir dosya aldıysanız aynı kutudaki **İçe aktarmalar** listesinde **Aktarımı iptal et**'e basıp nedenini yazın: o aktarımın yazdığı kayıtlar silinmez, iptal edilir.

> [!tip]
> XLSX dosyasında hücre renkleri ödeme durumu olarak okunur (kırmızı = ödendi). Hem rezervasyonu hem defteri alacaksanız, rezervasyon içe aktarırken ödeme yazmayı kapatın; yoksa aynı gelir iki kez sayılır.
