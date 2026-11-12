# Bismuth kurulum kılavuzu

Bu kılavuz otel sahibi ve otel çalışanı içindir. Bismuth'u Windows ya da Mac bilgisayara nasıl kuracağınızı, ilk
açılışta ne göreceğinizi ve bir sorun olursa ne yapacağınızı adım adım anlatır. Teknik bilgi gerekmez.

> **Bu kılavuz hakkında.** Ekran görüntüsü yerine her adımda ekranda ne göreceğiniz yazıyla anlatıldı. Windows ve macOS'un
> uyarı pencereleri sürümden sürüme biraz değişir; yazılı adlar birebir aynı çıkmayabilir, ama sıra aynıdır.
> <!-- sahip onay paketine: gerçek makinede (otel bilgisayarı Windows 10, sahibin Mac'i macOS 26) bu kılavuzdaki adımların
> tek tek doğrulanması ve ekran görüntülerinin eklenmesi (Faz 16 madde 4 ve 5) -->

## Önce bilmeniz gerekenler

- Bismuth **internet olmadan** çalışır. Kurduktan sonra internet gerekmez; kayıtlarınız bu bilgisayarda durur.
- Bismuth **kendiliğinden güncellenmez** ve bir yere veri göndermez. Yeni sürüm çıkarsa elle kurarsınız (bkz.
  "Yeni sürümü kurmak").
- Programın kurulum dosyası **imzasızdır**. İmza, yayıncının Microsoft'a ya da Apple'a her yıl ödediği bir ücrettir;
  Bismuth ücretsiz yolu seçtiği için imzasızdır. Bu yüzden Windows ve Mac ilk açılışta bir uyarı gösterir. Uyarı programın
  zararlı olduğu anlamına gelmez; aşağıda hangi düğmeye basacağınız yazıyor. Uyarı **yalnızca bir kez** çıkar.
- Kurulum için yönetici şifresi gerekmez (Windows'ta yalnızca kendi kullanıcınıza kurulur).

## Hangi dosyayı indireceğim?

Dosyalar GitHub'daki **Releases** (sürümler) sayfasında, en yeni sürümün altındaki **Assets** (dosyalar) listesindedir.
Dosya adları her sürümde aynıdır; sürüm numarası (örneğin `v1.0.0`) sayfanın başlığında ve kurduktan sonra programın
**Hakkında** ekranında yazar.

| Bilgisayar | İndirilecek dosya | Nasıl anlarım? |
|---|---|---|
| Windows 10 ya da 11 (çoğu bilgisayar, otel bilgisayarı) | `Bismuth-Setup.exe` | Başlat → Ayarlar → Sistem → Hakkında → **Sistem türü**: "64 bit işletim sistemi, x64 tabanlı işlemci" |
| Windows, ARM işlemcili (az rastlanır) | `Bismuth-Setup-arm64.exe` | Aynı yerde "ARM tabanlı işlemci" yazar |
| Mac, Apple çipli (M1, M2, M3, M4) | `Bismuth.dmg` | Sol üstte Apple simgesi → **Bu Mac Hakkında** → **Çip: Apple M…** |
| Mac, Intel işlemcili | `Bismuth-Intel.dmg` | Aynı yerde **İşlemci: Intel …** yazar |

Emin değilseniz Windows için `Bismuth-Setup.exe`'yi, Mac için yukarıdaki tabloya göre seçin. Yanlış dosya açılmaz ama zarar
vermez; doğrusunu indirip yeniden deneyin.

Aynı sayfada `SHA256SUMS.txt` adlı küçük bir dosya da vardır; bir sonraki bölümde ne işe yaradığı anlatılıyor.

### İsteğe bağlı: dosyanın bozulmadan indiğini denetlemek

Bu adım zorunlu değil. İndirme yarım kaldıysa ya da dosya yolda değiştiyse fark etmenizi sağlar.

1. `SHA256SUMS.txt` dosyasını açın. İçinde her kurulum dosyasının adı ve yanında uzun bir harf-rakam dizisi yazar.
2. Bilgisayarınızda indirdiğiniz dosya için aynı diziyi hesaplatın:
   - **Windows:** Başlat'a "PowerShell" yazıp açın, şunu yazın (dosya adını kendinize göre değiştirin):
     `Get-FileHash $HOME\Downloads\Bismuth-Setup.exe`
   - **Mac:** Launchpad → Diğer → **Terminal**'i açın, şunu yazın:
     `shasum -a 256 ~/Downloads/Bismuth.dmg`
3. Çıkan dizi `SHA256SUMS.txt`'dekiyle **aynıysa** dosya sağlamdır. Farklıysa dosyayı silip yeniden indirin.

## Windows 10 / 11 kurulumu

1. İndirdiğiniz `Bismuth-Setup.exe` dosyasına çift tıklayın. (Tarayıcı indirirken "Bu dosya yaygın olarak
   indirilmiyor" ya da "tehlikeli olabilir" derse: dosyanın yanındaki **⋯** ya da **Sakla** düğmesine basıp
   **Yine de sakla**'yı seçin.)
2. **"Windows bilgisayarınızı korudu"** başlıklı mavi bir pencere açılır: "Microsoft Defender SmartScreen tanınmayan bir
   uygulamanın başlatılmasını engelledi." Bu, programın imzasız olmasından gelir.
   - **Ek bilgi** yazısına basın.
   - Altta çıkan **Yine de çalıştır** düğmesine basın.
3. Kurulum penceresi açılır. Dil sistem dilinize göre seçilir (Türkçe, İngilizce ya da Rusça).
4. Bir sayfada kurulumun **kimin için** yapılacağı sorulabilir. **Yalnızca benim için** seçeneğini işaretleyin; böylece yönetici
   şifresi istenmez. <!-- doğrula: gerçek makinede sayfanın adı ve seçeneklerin metni -->
5. Kurulacak klasörü sorarsa olduğu gibi bırakın (**İleri**). Gerekirse başka bir klasör seçebilirsiniz.
6. **Kur**'a basın. Birkaç saniye sürer. Bitince **Bitir**'e basın.
7. Masaüstünüzde **Bismuth** kısayolu ve Başlat menüsünde **Bismuth** oluşur. Programı bunlardan açarsınız.

Program kullanıcınızın klasörüne kurulur (`C:\Users\<adınız>\AppData\Local\Programs\Bismuth`). Kayıtlarınız ayrı bir
yerde durur; bkz. "Verileriniz nerede?".

**Önemli:** Bismuth'u otelin ortak bilgisayarında hangi Windows kullanıcısıyla kurduysanız, her gün **o kullanıcıyla**
açın. Başka bir Windows kullanıcısı açarsa kendi (boş) verisini görür; otel kayıtları kurulumu yapan kullanıcının
klasöründedir.

### Windows'ta ilk açılışta başka bir uyarı çıkarsa

- **Güvenlik duvarı** ("Windows Güvenlik Duvarı bu uygulamanın bazı özelliklerini engelledi") yalnızca bu bilgisayarı **otelin ana
  bilgisayarı** yapıp diğer cihazları bağlamak isterseniz çıkabilir. Kurulum, Bismuth için yalnız **özel ağlarda** (ev, iş)
  geçerli bir izin eklemeyi dener; Windows buna izin vermediyse soru ana bilgisayar ilk kez başlarken bir kez çıkar. Bu
  bilgisayar tek başına çalışacaksa **İptal**'e basın; hiçbir şey bozulmaz. Ana bilgisayar olacaksa **Özel ağlar**'ı
  işaretleyip **Erişime izin ver**'e basın.
  <!-- doğrula: gerçek makinede güvenlik duvarı sorusunun metni ve kuralın kurulumda eklenip eklenmediği; sahip onay paketine -->

## Mac kurulumu (macOS 15 ve sonrası, macOS 26 dahil)

Bu adımlar hem Apple çipli hem Intel Mac içindir; yalnızca indirdiğiniz dosya farklıdır (yukarıdaki tabloya bakın).

1. İndirdiğiniz `.dmg` dosyasına çift tıklayın (genellikle **İndirilenler** klasöründedir). Bir pencere açılır:
   solda **Bismuth** simgesi, sağda **Uygulamalar** klasörü.
2. **Bismuth** simgesini **Uygulamalar** klasörüne **sürükleyip bırakın**. Kopyalama bitince pencereyi kapatın.
   Sol kenar çubuğunda **Bismuth** disk simgesinin yanındaki çıkarma düğmesine basarak diski çıkarabilirsiniz.
3. **Uygulamalar** klasöründen **Bismuth**'a çift tıklayın.
4. Mac bir uyarı gösterir: **"Bismuth" açılmadı** — "Apple, "Bismuth" uygulamasında Mac'inize zarar verebilecek kötü amaçlı
   yazılım bulunmadığını doğrulayamadı." Düğmeler **Bitti** ve **Çöp Kutusu'na Taşı**'dır.
   **Çöp Kutusu'na Taşı'ya basmayın.** **Bitti**'ye basın.
5. Apple menüsü → **Sistem Ayarları** → soldan **Gizlilik ve Güvenlik**'e girin.
6. Sayfayı en alta doğru kaydırın. **Güvenlik** başlığı altında **"Bismuth" engellendi** gibi bir satır ve yanında
   **Yine de aç** düğmesi görünür. Düğmeye basın.
7. Mac şifrenizi (ya da Touch ID'yi) isteyebilir; verin. Son bir pencerede **Aç**'a basın.
8. Bismuth açılır. Bundan sonra uyarı çıkmaz; Bismuth'u Launchpad'den ya da Dock'tan normal açarsınız.
   (İpucu: Dock'ta Bismuth simgesine sağ tıklayıp **Seçenekler → Dock'ta Tut** derseniz hep orada durur.)

Satır görünmüyorsa: 4. adımdaki uyarıyı gördükten sonra **Gizlilik ve Güvenlik** sayfasını açtığınızdan emin olun; satır
uyarıyı gördükten kısa süre sonra belirir ve bir saat kadar kalır. Yoksa Bismuth'u yeniden açmayı deneyin.
<!-- doğrula: macOS 26'da "Yine de aç" satırının ve düğme adının gerçek metni; sahip onay paketine: Mac M2'de deneme -->

### Mac'te anahtar zinciri sorusu

Bismuth, "Bismuth anahtarı"nı (aşağıda anlatılıyor) Mac'in **Anahtar Zinciri**'nde saklar. İlk açılışta ya da yeni bir
sürümü kurduktan sonra Mac "**Bismuth**, anahtar zincirinizdeki gizli bilgileri kullanmak istiyor" diye sorabilir.
Mac şifrenizi yazıp **Her Zaman İzin Ver**'e basın. **Reddet**'e basarsanız Bismuth anahtarı okuyamaz ve Google Drive'a
şifreli yedek yazamaz; bu olursa Bismuth'u kapatıp açın ve soruya yeniden cevap verin.
<!-- doğrula: imzasız (ad-hoc) pakette bu sorunun hangi durumlarda çıktığı; sahip onay paketine -->

## İlk açılış ve kurulum sihirbazı

Bismuth ilk açıldığında otel henüz tanıtılmamıştır, bu yüzden **Bismuth'a hoş geldiniz** sihirbazı açılır. Sol tarafta
adımların listesi, üstte **Adım 1 / 12** gibi bir sayaç, altta **Geri** ve **İleri** düğmeleri vardır. Birkaç adımda otelinizi
tanıtırsınız; çoğunu sonra **Ayarlar**'dan değiştirebilirsiniz. Girdiğiniz bilgiler adım adım saklanır; program kapanırsa
kaldığınız yerden devam edersiniz (güvenlik için **şifreler saklanmaz**, yeniden yazarsınız).

Adımlar sırasıyla şunlardır. **Zorunlu** olanlar atlanamaz; diğerlerini **Atla** ile geçip sonra Ayarlar'dan yapabilirsiniz.

| Adım | Ne yaparsınız | Zorunlu mu? |
|---|---|---|
| 1. **Dil ve tema** | Programın dilini (Türkçe, İngilizce, Rusça) ve görünümünü (Açık, Koyu, Bilgisayarla aynı) seçersiniz. Seçtiğiniz anda değişir. | Evet |
| 2. **Çalışma şekli** | Bu bilgisayar nasıl çalışacak? **Tek bilgisayar** (otelde yalnız bu bilgisayar kullanılır) · **Otelin ana bilgisayarı** (asıl veriler burada durur; diğer bilgisayarlar ve telefonlar buna bağlanır) · **Başka bir Bismuth'a bağlan** (otelin ana bilgisayarı zaten kurulu; örneğin sahibin dizüstü bilgisayarı). Otel PC için **Tek bilgisayar** ya da **Otelin ana bilgisayarı** seçin. "Başka bir Bismuth'a bağlan"ı seçerseniz bu bilgisayarda otel kurulmaz; **Bağlantı ekranına geç** düğmesiyle ana bilgisayarın adresini girersiniz. | Evet |
| 3. **Otel** | Otelin adı, ülke, şehir, saat dilimi, giriş ve çıkış saati. Şehir hava durumu içindir; internet yoksa hava kutusu görünmez, program yine çalışır. | Evet (otel adı) |
| 4. **Para birimleri** | **Ana para birimi** (toplamlar ve raporlar bununla hesaplanır; kayıt girildikten sonra **değiştirilemez**) ve kabul ettiğiniz dövizler. | Evet |
| 5. **Oda tipleri** | Otelinizdeki tipleri hazır listeden seçersiniz ya da kendi tipinizi eklersiniz; önerilen gecelik fiyatı yazarsınız (boş da kalabilir). | Evet (en az bir tip) |
| 6. **Odalar** | Kat sayısı, kat başına oda ve oda başına yatak yazıp **Odaları oluştur**'a basın; numaralar 101, 102… diye verilir. Sonra her odanın numarasını, tipini ve yatak sayısını tek tek düzeltirsiniz. Doluluk oranı bu oda ve yatak sayısıyla hesaplanır. | Evet (en az bir oda) |
| 7. **Ödeme ve satış** | Ödeme yöntemleri, rezervasyonların geldiği satış kanalları ve sattığınız ek hizmetler. Kanallar yalnızca etikettir; Bismuth hiçbir siteye bağlanmaz. | Hayır |
| 8. **Personel ve vardiyalar** | İzin ve ücret kuralları, vardiya düzeni ve görev önerileri. | Hayır |
| 9. **Çalışanlar** | İsterseniz çalışanları ve onlar için kullanıcı hesaplarını şimdi eklersiniz; sonra **Personel** ekranından da eklenir. | Hayır |
| 10. **Takvim** | Takvimde vurgulanacak günler, bayramlar ve **Gün kapatma**. | Hayır |
| 11. **Sahip hesabı** | Adınız, kullanıcı adınız, şifreniz (en az 8 karakter) ve isteğe bağlı PIN (4–8 rakam; kilitli ekranı hızlı açmak içindir). Bu, her şeyi gören ilk hesaptır; diğer kullanıcıları bununla yönetirsiniz. | Evet |
| 12. **Özet** | Bilgileri kontrol edersiniz; her satırın yanındaki **Düzenle** ile o adıma dönersiniz. Sonra **Kurulumu bitir**'e basın. | — |

Bu adımların görünüşü için sahip onay paketindeki ekran görüntülerine bakın.

### Kurtarma kodları (şifre için)

**Kurulumu bitir**'e basınca **Oteliniz hazır.** yazan bir ekran ve **Kurtarma kodlarınız** listesi çıkar. Şifrenizi
unutursanız bu kodlardan biriyle yeni şifre belirlersiniz; her kod bir kez kullanılır.

- Bu kodlar **bir daha gösterilmez.** Kâğıda yazın ya da **Kodları kopyala** ile kopyalayıp güvenli bir yerde saklayın.
- Kaydettikten sonra **Kodları sakladım** işaretleyip **Programa geç**'e basın.

Bu kodlar aşağıda anlatılan **Bismuth anahtarı** ile karıştırılmasın: kurtarma kodları şifre içindir, Bismuth anahtarı
yedekler içindir. İkisi de ayrı ayrı saklanır.

## Bismuth anahtarını kâğıda yazın

Bismuth her gün yedek alır ve bir kopyasını otelin Google Drive klasörüne **şifreli** olarak yazar. O şifrenin anahtarına
**Bismuth anahtarı** denir. Bilgisayar bozulursa ya da çalınırsa yedeği yeni bilgisayarda açmak için bu anahtar gerekir.
**Anahtar yalnız sizde olmalıdır; kaybolursa Drive'daki yedekleri kimse açamaz.**

1. Sahip hesabıyla oturum açın. **Ayarlar → Yedek** bölümüne gidin (soldaki menüde **Ayarlar**, içinde **Yedek** sekmesi).
2. **Bismuth anahtarı** kutusunda **Anahtarı göster**'e basın. (Bu kutu yalnız sahip hesabında görünür.)
3. Açılan pencerede **11 gruplu** bir metin çıkar; her grupta 5 harf ya da rakam vardır (örneğin `7KQ2M-…`). Hepsini
   **kâğıda**, olduğu gibi yazın. Karışabilecek harfler (O ile 0, I ile 1) anahtarda hiç kullanılmaz. Yanlış harf yazarsanız
   Bismuth anahtarı girerken fark eder.
4. Kâğıdı bilgisayardan ayrı, güvenli bir yerde (kasa, ev) saklayın. Fotoğrafını çekip telefonda tutmayın.

Anahtarın gösterilmesi denetim kaydına yazılır. Anahtar bilgisayarın kendi anahtar deposunda (Windows'ta kullanıcı
hesabınıza bağlı; Mac'te Anahtar Zinciri) saklanır, dosyada açık yazı olarak durmaz. Bu yüzden Windows kullanıcı hesabı
silinir ya da bilgisayar sıfırlanırsa anahtar da gider: kâğıttaki kopya bunun içindir.

<!-- doğrula: P13b — K-41: anahtarın yanında aynı anahtarın QR kodu ve yazdırma düğmesi gelecek; Bismuth anahtarı kurulum
sihirbazının sonunda da gösterilecekse bu bölüm buna göre güncellenir. Bugünkü sürümde yalnız yazı biçimi var. -->

## Google Drive masaüstü uygulaması ve yedek klasörü

Yedeklerin bir kopyası otelin Google Drive'ına gider. Bismuth Google'a bağlanmaz; yalnızca bilgisayardaki Drive klasörüne
dosya yazar, internete **Google Drive masaüstü uygulaması** gönderir. Bu yüzden o uygulamanın kurulu ve açık olması gerekir.

1. Otelin Google hesabıyla (Gmail) **Google Drive for desktop** uygulamasını bilgisayara kurun (Google'ın sayfasından
   indirilir) ve otel hesabıyla oturum açın.
2. Uygulama bilgisayarda **Drive'ım** adlı bir klasör (Windows'ta çoğunlukla `G:` sürücüsü, Mac'te Finder'ın kenar çubuğunda
   **Google Drive**) oluşturur.
3. Başka bir şey yapmanız gerekmez. Bismuth bu klasörü kendisi bulur ve yedekleri `Drive'ım\Bismuth\yedekler` içine yazar
   (klasörü kendisi oluşturur).
4. Kontrol: **Ayarlar → Yedek** ekranında **Google Drive kopyası** satırında **Çalışıyor** yazmalı. **Drive klasörü yok**
   yazıyorsa Drive uygulaması kurulu değildir, kapalıdır ya da klasör başka bir yerdedir; **Yedek ayarları → Google Drive
   klasörü** alanına klasörün tam yolunu yazın (klasör önceden var olmalıdır).
5. Bilgisayar zayıfsa Drive uygulamasının ayarlarında dosyaları **akış** modunda tutmak ve yükleme hızını sınırlamak
   bilgisayarı rahatlatır.

Yedeğin nasıl alındığı, geri yüklendiği ve yeni bilgisayara taşındığı: [`yedek-ve-tasima.md`](yedek-ve-tasima.md).

## Yeni sürümü kurmak

Bismuth kendiliğinden güncellenmez. Yeni sürüm çıktığında:

1. **Önce yedek alın:** **Ayarlar → Yedek → Şimdi yedek al**. (Program ayrıca açılışta, veriler yeni sürüme geçmeden önce
   kendi kopyasını da alır; yine de elle almak iyidir.)
2. Bismuth'u kapatın.
3. Yeni sürümün kurulum dosyasını yukarıdaki gibi indirin.
   - **Windows:** `.exe`'yi çalıştırın (SmartScreen uyarısı yine çıkabilir; aynı adımlar). Eski sürümün **üzerine** kurulur;
     kayıtlarınıza dokunmaz.
   - **Mac:** `.dmg`'yi açın, **Bismuth**'u **Uygulamalar**'a sürükleyin, "Değiştir"i seçin. Gerekirse yukarıdaki **Yine de
     aç** adımları yeniden gerekebilir.
4. Bismuth'u açın. Kayıtlarınızın hepsi yerindedir. Program gerekirse veri düzenini yeni sürüme kendiliğinden uyarlar;
   uyarlamadan önce aldığı kopya **Ayarlar → Yedek** listesinde **Güncelleme öncesi** adıyla durur.
5. Daha **eski** bir sürümü, yeni sürümün kayıtları üzerine kurmayın: eski sürüm yeni verileri açamayabilir.

Bilgisayarlar arası sürüm uyumu: ana bilgisayardaki ve Mac'teki Bismuth'un **aynı sürüm** olması gerekir. Önce otel
bilgisayarını, sonra Mac'i güncelleyin.

## Verileriniz nerede? (kaldırma ve silme öncesi okuyun)

Bismuth'un kayıtları **program klasöründe değil**, ayrı bir **veri klasöründe** durur:

| Sistem | Veri klasörü |
|---|---|
| Windows | `C:\Users\<adınız>\AppData\Roaming\Bismuth` (kısaca `%APPDATA%\Bismuth`) |
| Mac | `~/Library/Application Support/Bismuth` (Finder'da **Git → Klasöre Git…** ile yazın) |

İçinde: `bismuth.db` (tüm kayıtlar), `attachments` (fotoğraf ve ekler), `backups` (bu bilgisayardaki yedekler), `logs`
(program günlüğü). **Ayarlar → Yedek → Veri klasörü** bölümündeki **Klasörü aç** düğmesi aynı klasörü açar.

**Bu klasörü elle silmeyin, taşımayın, dosyalarını değiştirmeyin.** Program açıkken içindeki dosyaları kopyalamak da
sağlam bir yedek vermez; yedek için **Şimdi yedek al** düğmesini kullanın.

## Bismuth'u kaldırmak

Kaldırmak **kayıtlarınızı silmez**. Veri klasörü yerinde kalır; Bismuth'u sonradan yeniden kurarsanız her şey karşınıza gelir.

- **Windows:** Başlat → Ayarlar → Uygulamalar → **Yüklü uygulamalar** → **Bismuth** → **Kaldır**.
  Eski bilgisayarlarda: Denetim Masası → Program Ekle veya Kaldır. Kaldırıcının ilk sayfası da kayıtlarınızın
  silinmeyeceğini ve hangi klasörde kaldığını yazar; **İleri** ile devam edin. Kurulumun eklediği güvenlik duvarı izni de
  kaldırılır.
- **Mac:** Finder'da **Uygulamalar** klasörüne gidin, **Bismuth**'u Çöp Kutusu'na sürükleyin.

Kayıtlarınızı **de** silmek istiyorsanız (örneğin bilgisayarı satıyorsanız): önce **Şimdi yedek al** ile yedek alıp güvenli
bir yere kopyalayın, sonra yukarıdaki veri klasörünü silin. Bu işlem geri alınamaz.

## Sorun giderme

**Bismuth açılmıyor, hiçbir şey olmuyor.**
Bismuth aynı anda yalnızca bir kez açılır. Zaten açıksa, görev çubuğunda (Windows) ya da Dock'ta (Mac) küçük hâliyle
duruyor olabilir; ikinci açış onu öne getirir. Bilgisayarı yeniden başlatıp deneyin.

**"Veriler açılamadı" ya da "Veri denetiminde sorun bulundu" kutusu çıktı.**
Verileriniz silinmedi. Programı kapatıp yeniden açın. Sorun sürerse otel sahibine haber verin ve **veri klasörünü silmeyin**;
kutuda klasörün yolu yazar. Sahip, **Ayarlar → Yedek** listesinden bir yedeği geri yükleyebilir (bkz.
[`yedek-ve-tasima.md`](yedek-ve-tasima.md)); program hiç açılmıyorsa veri klasöründeki `backups` içinde güncelleme öncesi
kopyalar bulunur.

**Windows "Windows bilgisayarınızı korudu" diyor ve "Yine de çalıştır" düğmesi yok.**
**Ek bilgi** yazısına basmadan düğme görünmez. Önce **Ek bilgi**'ye basın. Yine yoksa: dosyaya sağ tıklayıp **Özellikler**'i
açın, altta **Güvenlik: Engellemeyi kaldır** kutusunu işaretleyip **Tamam** deyin; sonra dosyayı yeniden çalıştırın.
Bilgisayar bir şirket ya da okul ilkesiyle yönetiliyorsa yönetici bu uygulamayı engellemiş olabilir.

**Mac "Bismuth hasarlı, açılamıyor" ya da "Yine de aç" satırı hiç çıkmıyor.**
Önce uygulamayı **Uygulamalar** klasöründen açmayı (indirilenler klasöründeki dosyadan değil) ve yukarıdaki 4–7. adımları
yeniden denediğinizden emin olun. Olmadıysa son çare: Terminal'i açıp şunu yazın ve Enter'a basın:
`xattr -dr com.apple.quarantine /Applications/Bismuth.app` — sonra Bismuth'u yeniden açın. (Bu komut Mac'in "internetten
indirildi" işaretini kaldırır.) <!-- doğrula: macOS 26 -->

**Mac "Bu uygulama bu Mac'te çalışmıyor" ya da hemen kapanıyor.**
Yanlış dosyayı indirmiş olabilirsiniz (Apple çipli Mac'e `Bismuth-Intel.dmg`, Intel Mac'e `Bismuth.dmg`). Yukarıdaki
tabloya bakıp doğru `.dmg`'yi indirin.

**Drive kopyası "Drive klasörü yok" ya da "Yazılamadı" diyor.**
Google Drive masaüstü uygulaması açık mı, otel hesabıyla oturum açık mı ve bilgisayarda yer var mı bakın. Ayrıntı:
yukarıdaki "Google Drive masaüstü uygulaması ve yedek klasörü".

**Yedek alınamadı.**
Bilgisayarın diskinde yer olup olmadığına bakın (**Ayarlar → Yedek → Veri klasörü** boyutları gösterir), sonra **Şimdi yedek
al**'ı yeniden deneyin.

**Yardım istemek istiyorum.**
Veri klasöründeki `logs\main.log` dosyası programın olaylarını tutar (en çok 2 MB). Bir sorunu anlatırken bu dosyayı da
gönderebilirsiniz. Veri klasörünün tamamını (kayıtlarınız içindedir) başkasına göndermeyin.

## Sürüm numarasına bakmak

Soldaki menüde **Hakkında** (ya da **Ayarlar → Hakkında**) sürüm numarasını, **Derleme tarihi** ve **Derleme kimliği**
satırlarını (hangi paketin kurulu olduğunu tam olarak söyler), veri klasörünün yolunu ve **Veritabanı denetimi: Sağlam**
satırını gösterir. Bir sorun bildirirken sürümü ve derleme kimliğini söylemeniz işi kolaylaştırır. Aynı ekrandaki **Lisans
metinlerini göster** düğmesi, Bismuth'un kullandığı açık kaynak yazılımların lisanslarını açar.
