# Kurulum ve yeni sürüm

Bu bölüm Bismuth'u Windows ya da Mac bilgisayara kurmayı, ilk açılışta çıkan uyarıları, kurulum bilgilerini kâğıda yazmayı ve yeni sürümü kurmayı anlatır. Teknik bilgi gerekmez; çift tıklamak yeter. Kurulumdan sonra kurulum sihirbazı için [İlk kurulum](guide:getting-started#setup) bölümüne bakın.

## Önce bilmeniz gerekenler {#install-basics}

- Bismuth **internet olmadan** çalışır. Kurduktan sonra internet gerekmez; kayıtlarınız bu bilgisayarda durur.
- Bismuth **kendiliğinden güncellenmez** ve bir yere veri göndermez. Yeni sürüm çıkarsa elle kurarsınız.
- Kurulum dosyası **imzasızdır**: imza, yayıncının her yıl Microsoft'a ya da Apple'a ödediği bir ücrettir. Bu yüzden Windows ve Mac ilk açılışta bir uyarı gösterir. Uyarı programın zararlı olduğu anlamına gelmez; hangi düğmeye basacağınız aşağıda yazıyor. Uyarı **yalnızca bir kez** çıkar.
- Kurulum için yönetici şifresi gerekmez; program yalnız kurduğunuz kullanıcıya kurulur.

Dosyalar proje sayfasındaki **Releases** (sürümler) bölümünde, en yeni sürümün **Assets** (dosyalar) listesindedir:

- Windows 10 ya da 11 (çoğu bilgisayar): **Bismuth-Setup.exe**
- Windows, ARM işlemcili (az rastlanır): **Bismuth-Setup-arm64.exe**
- Mac, Apple çipli (M1, M2, M3, M4): **Bismuth.dmg**
- Mac, Intel işlemcili: **Bismuth-Intel.dmg**

Emin değilseniz Windows için **Bismuth-Setup.exe**'yi seçin. Mac'te Apple simgesi → **Bu Mac Hakkında** altında **Çip: Apple M…** yazıyorsa **Bismuth.dmg**, **İşlemci: Intel** yazıyorsa **Bismuth-Intel.dmg** indirin. Yanlış dosya zarar vermez; doğrusunu indirip yeniden deneyin.

## Windows'a kurmak {#install-windows}

1. İndirdiğiniz **Bismuth-Setup.exe** dosyasına çift tıklayın. Tarayıcı "bu dosya yaygın olarak indirilmiyor" derse dosyanın yanındaki **⋯** düğmesine basıp **Yine de sakla**'yı seçin.
2. Mavi **"Windows bilgisayarınızı korudu"** penceresi çıkarsa **Ek bilgi**'ye, sonra **Yine de çalıştır**'a basın.
3. Kurulum penceresinde **İleri**'ye, sonra **Kur**'a basın; bitince **Bitir**'e basın.
4. Masaüstünde ve Başlat menüsünde **Bismuth** kısayolu oluşur.

> [!warning]
> Bismuth'u otelin ortak bilgisayarında hangi Windows kullanıcısıyla kurduysanız her gün **o kullanıcıyla** açın. Başka bir Windows kullanıcısı açarsa kendi boş verisini görür; otel kayıtları kurulumu yapan kullanıcının klasöründedir.

Bu bilgisayar otelin **ana bilgisayarı** olacaksa Windows ilk açılışta güvenlik duvarı sorusu sorabilir; **Özel ağlar**'ı işaretleyip **Erişime izin ver**'e basın. Bilgisayar tek başına çalışacaksa **İptal**'e basın, hiçbir şey bozulmaz.

## Mac'e kurmak {#install-mac}

1. **.dmg** dosyasına çift tıklayın; açılan pencerede **Bismuth** simgesini **Uygulamalar** klasörüne sürükleyip bırakın.
2. **Uygulamalar**'dan **Bismuth**'a çift tıklayın. Mac "açılmadı" uyarısı verir: **Bitti**'ye basın (**Çöp Kutusu'na Taşı**'ya basmayın).
3. Apple menüsü → **Sistem Ayarları** → **Gizlilik ve Güvenlik**'i açın; en alta kaydırın. **"Bismuth" engellendi** satırında **Yine de aç**'a basın, istenirse Mac şifrenizi yazın ve son pencerede **Aç**'a basın.
4. Bundan sonra uyarı çıkmaz; Bismuth'u Launchpad'den ya da Dock'tan açarsınız.

Satır görünmüyorsa 2. adımdaki uyarıyı gördükten sonra **Gizlilik ve Güvenlik**'e bakın; satır kısa süre sonra belirir ve bir saat kadar kalır. Yine yoksa Bismuth'u yeniden açın.

Mac, ilk açılışta ya da yeni sürümden sonra "Bismuth, anahtar zincirinizdeki gizli bilgileri kullanmak istiyor" diye sorabilir. Mac şifrenizi yazıp **Her Zaman İzin Ver**'e basın; **Reddet**'e basarsanız Bismuth anahtarı okuyamaz.

## Kurulum bilgilerini kâğıda yazın {#install-paper}

Kurulum sihirbazının sonunda **Kâğıda yazın** adımı çıkar. İki bilgi bir kez gösterilir:

- **Kurtarma kodları**: şifrenizi unutursanız yeni şifre belirlemek içindir.
- **Bismuth anahtarı**: Drive'a giden şifreli yedekleri yeni bir bilgisayarda açmak içindir. Kaybolursa o yedekler açılamaz.

**Yazdır**'a basarsanız ikisi tek bir A4 sayfaya basılır (anahtarın QR koduyla birlikte); kâğıda elle de yazabilirsiniz. Sonra **Kâğıda yazdım**'ı işaretleyip **Programa geç**'e basın. Kâğıdı kasada ya da bilgisayardan ayrı güvenli bir yerde saklayın; fotoğrafını çekip paylaşmayın. Anahtar o an gösterilemezse program bunu yazar; anahtarı sonra **Ayarlar → Yedek → Anahtarı göster** ile alırsınız. Ayrıntı: [Bismuth anahtarı](guide:backup#backup-key).

## Google Drive klasörü {#install-drive}

Yedeğin şifreli bir kopyası otelin Google Drive'ına gider. Bunun için ana bilgisayara **Google Drive masaüstü** uygulamasını kurup otelin hesabıyla açın. Sonra **Ayarlar → Yedek**'te **Drive klasörünü bul**'a basın: Bismuth bu bilgisayardaki bilinen Drive klasörlerine bakar, bulduğunu kaydeder. Bulamazsa bunu söyler; o zaman Drive uygulamasının açık olduğunu kontrol edin ya da **Klasör seç** ile klasörü kendiniz seçin. Bismuth hiçbir zaman Google'a bağlanmaz; yalnız bu bilgisayardaki klasöre dosya yazar. Ayrıntı: [Google Drive kopyası](guide:backup#drive-copy).

## Yeni sürümü kurmak {#install-update}

1. **Ayarlar → Yedek → Şimdi yedek al**'a basın.
2. Bismuth'u kapatın.
3. Yeni sürümün kurulum dosyasını indirip yukarıdaki gibi açın. Windows'ta eski sürümün **üzerine** kurulur; Mac'te **Bismuth**'u **Uygulamalar**'a sürükleyip **Değiştir**'i seçin. Uyarı yine çıkarsa aynı adımları izleyin.
4. Bismuth'u açın; kayıtlarınızın hepsi yerindedir. Program veri düzenini gerekirse kendisi uyarlar ve önce **Güncelleme öncesi** adıyla bir kopya alır.

> [!warning]
> Daha eski bir sürümü yeni sürümün kayıtları üzerine kurmayın; eski sürüm yeni verileri açamayabilir. Ana bilgisayarla Mac'teki Bismuth aynı sürümde olmalıdır: önce otel bilgisayarını, sonra Mac'i güncelleyin.

## Bismuth'u kaldırmak {#install-uninstall}

Kaldırmak kayıtlarınızı **silmez**; veri klasörü yerinde kalır, sonradan yeniden kurarsanız her şey karşınıza gelir.

- **Windows:** Başlat → Ayarlar → Uygulamalar → **Bismuth** → **Kaldır**.
- **Mac:** **Uygulamalar** klasöründen **Bismuth**'u Çöp Kutusu'na sürükleyin.

Kayıtlarınızı da silecekseniz (örneğin bilgisayarı satıyorsanız) önce **Şimdi yedek al** ile yedek alıp güvenli bir yere kopyalayın. Veri klasörünün yeri **Ayarlar → Yedek → Veri klasörü** bölümünde yazar; **Klasörü aç** düğmesi onu açar.

## Kurulum sorunları {#install-problems}

**Windows'ta "Yine de çalıştır" düğmesi yok.** Önce **Ek bilgi**'ye basın; düğme altında çıkar. Bilgisayar bir şirket ya da okul ilkesiyle yönetiliyorsa yönetici uygulamayı engellemiş olabilir.

**Mac'te "Yine de aç" satırı çıkmıyor ya da "hasarlı" diyor.** Bismuth'u indirilenler klasöründen değil **Uygulamalar** klasöründen açtığınızdan emin olup yukarıdaki adımları yeniden deneyin. Olmazsa programı sizin için kuran kişiye ya da geliştiriciye haber verin.

**Mac "Bu uygulama bu Mac'te çalışmıyor" diyor.** Yanlış dosyayı indirmişsiniz (Apple çipli Mac'e **Bismuth.dmg**, Intel Mac'e **Bismuth-Intel.dmg** gerekir). Doğru dosyayı indirin.

**Program açılmıyor, hiçbir şey olmuyor.** Bismuth aynı anda bir kez açılır; küçültülmüş olabilir (görev çubuğu ya da Dock). Yine de açılmazsa bilgisayarı yeniden başlatın. Verileriniz silinmedi; veri klasörünü silmeyin ve otel sahibine haber verin.
