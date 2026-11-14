# Bismuth kurulum kılavuzu

Bu kılavuz otel sahibi ve otel çalışanı içindir. Bismuth'u Windows ya da Mac bilgisayara nasıl kuracağınızı, ilk
açılışta ne göreceğinizi ve bir sorun olursa ne yapacağınızı adım adım anlatır. Teknik bilgi gerekmez.

> **Bu kılavuz hakkında.** Ekran görüntüsü yerine her adımda ekranda ne göreceğiniz yazıyla anlatıldı. Windows ve macOS'un
> uyarı pencereleri sürümden sürüme biraz değişir; yazılı adlar birebir aynı çıkmayabilir, ama sıra aynıdır.
> <!-- sahip onay paketine: gerçek makinede (otel bilgisayarı Windows 10, sahibin Mac'i macOS 26) bu kılavuzdaki adımların
> tek tek doğrulanması ve ekran görüntülerinin eklenmesi (S-80; Faz 16 madde 4 ve 5) -->

## Önce bilmeniz gerekenler

- Bismuth **internet olmadan** çalışır. Kurduktan sonra internet gerekmez; kayıtlarınız bu bilgisayarda durur.
- Bismuth **kendiliğinden güncellenmez** ve bir yere veri göndermez. Yeni sürüm çıkarsa elle kurarsınız (bkz.
  "Yeni sürümü kurmak").
- Programın kurulum dosyası **imzasızdır**. İmza, yayıncının Microsoft'a ya da Apple'a her yıl ödediği bir ücrettir;
  Bismuth ücretsiz yolu seçtiği için imzasızdır. Bu yüzden Windows ve Mac ilk açılışta bir uyarı gösterir. Uyarı programın
  zararlı olduğu anlamına gelmez; aşağıda hangi düğmeye basacağınız yazıyor. Uyarı **yalnızca bir kez** çıkar.
- Kurulum için yönetici şifresi gerekmez (Windows'ta yalnızca kendi kullanıcınıza kurulur).

> **Kurulumu yapan kullanıcıyla açın.** Windows'ta Bismuth yalnızca kurduğunuz kullanıcıya kurulur ve kayıtlar o kullanıcının klasöründe durur. Otelin ortak bilgisayarında hangi Windows kullanıcısıyla kurduysanız her gün **o kullanıcıyla** açın; başka bir kullanıcı açarsa boş bir program görür. Tüm kullanıcılar için kurulum şimdilik yoktur (S-113).

## Hangi dosyayı indireceğim?

Tablodaki dosya adına tıklamak en yeni sürümü doğrudan indirir (GitHub hesabı gerekmez). Bütün sürümler ve notları GitHub'daki
[**Releases**](https://github.com/taliyigit2-prog/Bismuth/releases) (sürümler) sayfasında, her sürümün **Assets** (dosyalar) listesindedir.
Dosya adları her sürümde aynıdır; sürüm numarası (örneğin `v1.0.0`) sayfanın başlığında ve kurduktan sonra programın
**Hakkında** ekranında yazar.

| Bilgisayar | İndirilecek dosya | Nasıl anlarım? |
|---|---|---|
| Windows 10 ya da 11 (çoğu bilgisayar, otel bilgisayarı) | [`Bismuth-Setup.exe`](https://github.com/taliyigit2-prog/Bismuth/releases/latest/download/Bismuth-Setup.exe) | Başlat → Ayarlar → Sistem → Hakkında → **Sistem türü**: "64 bit işletim sistemi, x64 tabanlı işlemci" |
| Windows, ARM işlemcili (az rastlanır) | [`Bismuth-Setup-arm64.exe`](https://github.com/taliyigit2-prog/Bismuth/releases/latest/download/Bismuth-Setup-arm64.exe) | Aynı yerde "ARM tabanlı işlemci" yazar |
| Mac, Apple çipli (M1, M2, M3, M4) | [`Bismuth.dmg`](https://github.com/taliyigit2-prog/Bismuth/releases/latest/download/Bismuth.dmg) | Sol üstte Apple simgesi → **Bu Mac Hakkında** → **Çip: Apple M…** |
| Mac, Intel işlemcili | [`Bismuth-Intel.dmg`](https://github.com/taliyigit2-prog/Bismuth/releases/latest/download/Bismuth-Intel.dmg) | Aynı yerde **İşlemci: Intel …** yazar |

Emin değilseniz Windows için `Bismuth-Setup.exe`'yi, Mac için yukarıdaki tabloya göre seçin. Yanlış dosya açılmaz ama zarar
vermez; doğrusunu indirip yeniden deneyin.

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
   şifresi istenmez. <!-- doğrula (S-80): gerçek makinede sayfanın adı ve seçeneklerin metni -->
5. Kurulacak klasörü sorarsa olduğu gibi bırakın (**İleri**). Gerekirse başka bir klasör seçebilirsiniz.
6. **Kur**'a basın. Birkaç saniye sürer. Bitince **Bitir**'e basın.
7. Masaüstünüzde **Bismuth** kısayolu ve Başlat menüsünde **Bismuth** oluşur. Programı bunlardan açarsınız.

Program kullanıcınızın klasörüne kurulur (`C:\Users\<adınız>\AppData\Local\Programs\Bismuth`). Kayıtlarınız ayrı bir
yerde durur; bkz. "Verileriniz nerede?".

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
<!-- doğrula (S-80): macOS 26'da "Yine de aç" satırının ve düğme adının gerçek metni; Mac'te deneme -->

### Mac'te anahtar zinciri sorusu

Bismuth, "Bismuth anahtarı"nı (aşağıda anlatılıyor) Mac'in **Anahtar Zinciri**'nde saklar. İlk açılışta ya da yeni bir
sürümü kurduktan sonra Mac "**Bismuth**, anahtar zincirinizdeki gizli bilgileri kullanmak istiyor" diye sorabilir.
Mac şifrenizi yazıp **Her Zaman İzin Ver**'e basın. **Reddet**'e basarsanız Bismuth anahtarı okuyamaz ve Google Drive'a
şifreli yedek yazamaz; bu olursa Bismuth'u kapatıp açın ve soruya yeniden cevap verin.
<!-- doğrula (S-80): imzasız (ad-hoc) pakette bu sorunun hangi durumlarda çıktığı -->

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

### Kâğıda yazın (kurtarma kodları ve Bismuth anahtarı)

**Kurulumu bitir**'e basınca **Oteliniz hazır.** yazan ve **Kâğıda yazın** başlıklı tek bir ekran çıkar. İki bilgi birlikte, bir kez gösterilir:

- **Kurtarma kodları:** şifrenizi unutursanız bu kodlardan biriyle yeni şifre belirlersiniz; her kod bir kez kullanılır.
- **Bismuth anahtarı:** Drive'a giden şifreli yedekleri yeni bir bilgisayarda açmak içindir; 11 gruplu bir metindir (her grupta 5 harf ya da rakam). Kaybolursa Drive'daki yedekleri kimse açamaz.

**Yazdır**'a basarsanız ikisi (anahtarın QR koduyla) tek bir A4 sayfaya basılır; elle de yazabilir ya da **Kopyala** ile kopyalayabilirsiniz. Sonra **Kâğıda yazdım**'ı işaretleyip **Programa geç**'e basın. Kâğıdı kasada ya da bilgisayardan ayrı güvenli bir yerde saklayın; fotoğrafını çekip telefonda tutmayın. Anahtar o an gösterilemezse ekran bunu yazar; anahtarı sonra **Ayarlar → Yedek → Anahtarı göster** ile alabilirsiniz (yalnız sahip hesabı, yalnız ana bilgisayarın kendi penceresinde; gösterilmesi denetim kaydına yazılır).

Anahtar bilgisayarın kendi anahtar deposunda (Windows'ta kullanıcı hesabınıza bağlı; Mac'te Anahtar Zinciri) saklanır. Bu yüzden Windows kullanıcı hesabı silinir ya da bilgisayar sıfırlanırsa anahtar da gider: kâğıttaki kopya bunun içindir.

## Google Drive masaüstü uygulaması ve yedek klasörü

Yedeklerin şifreli bir kopyası otelin Google Drive'ına gider. Bismuth Google'a bağlanmaz; yalnızca bilgisayardaki Drive klasörüne dosya yazar, internete **Google Drive masaüstü uygulaması** gönderir. Bu yüzden o uygulamanın kurulu ve açık olması gerekir.

1. Otelin Google hesabıyla **Google Drive for desktop** uygulamasını kurun (Google'ın sayfasından indirilir) ve otel hesabıyla oturum açın.
2. **Ayarlar → Yedek** ekranında **Yedek ayarları** altında **Drive klasörünü bul**'a basın. Bismuth bu bilgisayardaki bilinen Drive klasörlerine bakar (yalnız bu bilgisayarın klasörleri; internete bağlanmaz), **Bismuth\yedekler** klasörünü hazırlar ve kaydeder. Yedekleri o klasöre yazar.
3. Klasör bulunamazsa program söyler: Drive uygulamasının kurulu ve açık olduğunu kontrol edin ya da **Klasör seç** ile Drive içindeki klasörü kendiniz seçin.
4. Kontrol: **Ayarlar → Yedek** ekranında **Google Drive kopyası** satırında **Çalışıyor** yazmalı.

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
  silinmeyeceğini ve hangi klasörde kaldığını yazar; **İleri** ile devam edin. Güvenlik duvarı izni için bkz. [`uzaktan-erisim.md`](uzaktan-erisim.md).
- **Mac:** Finder'da **Uygulamalar** klasörüne gidin, **Bismuth**'u Çöp Kutusu'na sürükleyin.

Kayıtlarınızı **de** silmek istiyorsanız (örneğin bilgisayarı satıyorsanız): önce **Şimdi yedek al** ile yedek alıp güvenli
bir yere kopyalayın, sonra yukarıdaki veri klasörünü silin. Bu işlem geri alınamaz.

## Kamera eki

Kamera tanıma (Python, yapay zekâ kitaplıkları ve model dosyaları) ana programın içinde **değildir**: ana kurulum 100 MB
kadardır, kamera eki bunun yedi katıdır. Ayrı dosya olmasının nedenleri: (1) kamerası olmayan bilgisayar bu yükü indirmez;
(2) ana programın yeni sürümü her seferinde 0,7 GB indirtmez; (3) model dosyaları depoda tutulmaz, ayrı üretilir.
Kamera eki olmadan Bismuth tüm işlevleriyle çalışır; kamera başlamaz ve şu yerlerde açık bir uyarı görünür: **Kamera** ekranı
(**Kamera eki kurulu değil**), **Ayarlar → Kamera** ve ilk kurulum sihirbazının Kamera adımı ile **Yeniden tara** penceresi (orada
"Bağlantıyı dene" de aynı nedenle çalışmaz). Uyarı, eki nereden indireceğinizi ve nereye açacağınızı tek cümleyle söyler; aşağıdaki
kurulum adımlarıyla aynıdır. Ek yalnız Bismuth açılırken aranır: ekledikten sonra Bismuth'u kapatıp yeniden açın.

| Dosya | Hangi bilgisayar | Boyut (tahmin) |
|---|---|---|
| `Bismuth-Kamera-Windows.zip` | Windows 10/11, 64 bit (Intel/AMD) | indirme ≈ 0,6–0,8 GB, açılınca ≈ 1,6–2 GB <!-- doğrula: ilk gerçek paketlemede ölçülecek --> |
| `Bismuth-Kamera-Mac.zip` | Apple çipli Mac (M1 ve sonrası), macOS 14 (Sonoma) ya da üstü | aynı büyüklükte <!-- doğrula --> |

Intel Mac ve Windows ARM için kamera eki üretilmez (PyTorch'un bu sistemler için hazır paketi yok). Kamera eki yalnız
**ana bilgisayarda** (kameranın bağlı olduğu, Bismuth'un sunucu/tek bilgisayar modundaki makine) gerekir; telefon ve diğer
bilgisayarlar için gerekmez.

**Kurulum (terminal gerekmez):**

1. Bismuth'u kapatın.
2. `Bismuth-Kamera-…zip` dosyasını indirin (internet yalnız bu indirme için gerekir; kamera eki çalışırken hiçbir şey indirmez).
3. Zip'i açın (Windows: sağ tık → **Tümünü ayıkla**; Mac: çift tık). Çıkan klasörün adı **camera-addon** olmalıdır.
4. Bu klasörü Bismuth'un veri klasörüne taşıyın: Windows `C:\Users\<ad>\AppData\Roaming\Bismuth` (Dosya Gezgini'nin
   adres çubuğuna `%APPDATA%\Bismuth` yazıp Enter'a basın), Mac `Kullanıcı/Kütüphane/Application Support/Bismuth`
   (Finder'da **Git → Klasöre Git**, `~/Library/Application Support/Bismuth` yazın). Sonuç: `…\Bismuth\camera-addon\addon.json`.
5. Bismuth'u açın; uyarı kalkar. Kamerayı bağlamak için **Ayarlar → Kamera → Yeniden tara** düğmesine basın: kamera kurulum
   sihirbazı orada açılır (ilk kurulumdaysanız sihirbazın Kamera adımı aynı işi yapar). **Kamera** ekranının kendisi sihirbazı
   göstermez; kamera adresi girilene kadar "Kamera adresi yok" der.

Mac'te ilk kamera başlatmada macOS "geliştiricisi doğrulanamadı" derse: **Sistem Ayarları → Gizlilik ve Güvenlik**
bölümünde çıkan satırdaki **Yine de Aç** düğmesine basın. <!-- doğrula -->

**Güncelleme ve kaldırma:** Ana programı güncellemek kamera ekine dokunmaz. Bismuth'un yeni sürümü yeni bir kamera eki
isterse sürüm notunda yazılır; eski `camera-addon` klasörünü silip yenisini aynı yere koyun. Kamera ekini kaldırmak için
Bismuth kapalıyken `camera-addon` klasörünü silin; kamera verileri (yüz kayıtları) Bismuth'un veritabanındadır, klasörde değildir.

**Güvenlik notları:** Kamera eki yalnız bu klasörden çalışır (sistemdeki başka bir Python'a bakılmaz). Model dosyalarının
parmak izi (`models/SHA256SUMS`) her açılışta denetlenir; listede olmayan ya da değiştirilmiş model dosyası yüklenmez.
Kamera eki hiçbir şey indirmez ve internete bağlanmaz.

**Lisans:** kamera ekindeki InsightFace modelleri "ticari olmayan araştırma", Ultralytics ise AGPL-3.0 lisanslıdır
(`THIRD_PARTY_NOTICES.md`, `docs/analiz/06-kamera-entegrasyonu.md` §6.3). Bu kamera eki yalnız sahibin kendi otelinde
kullanılır; başkasına verilemez ya da satılamaz.

**Paketleyen için (sahip ya da geliştirici):** model dosyaları depoda yoktur; `resources/camera/models/README.md`'deki
yerleşimle bir klasörde tutulur. Üretim: `npm run camera:bundle -- --target win-x64 --models <klasör>` (Linux/Mac/Windows'ta
Python 3.12 ve bir C++ derleyicisi gerekir). Ek, **hedef sistemin kendisinde** üretilir: Windows eki Windows'ta, Mac eki
`--target mac-arm64` ile Apple çipli Mac'te (insightface derlenir; başka sistemde derlenen çalışmaz). Ya da `release` iş akışını
elle çalıştırıp `camera_addon` kutusunu işaretleyin; sürüm etiketinde iş akışı eki yalnız depo değişkeni `CAMERA_ADDON` `true`
iken üretir ve iki zip dosyası sürümün `SHA256SUMS.txt` listesine girer (model arşivi `CAMERA_MODELS_URL` /
`CAMERA_MODELS_SHA256` sırlarından alınır). Kütüphaneler hash'li kilit dosyalarından kurulur (`otel-kamera/requirements-*.lock`,
yenilemek için `node scripts/camera-lock.mjs`; `pip install uv` gerekir); Python arşivi betikteki sabit özetle doğrulanır. Çıktı: `camera-addon-out/Bismuth-Kamera-*.zip` (git dışı). Python bağlantı adresleri ve ilk
paketlemede doğrulanacak noktalar `scripts/camera-bundle.mjs` başındadır.

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
Önce uygulamayı **Uygulamalar** klasöründen açmayı (indirilenler klasöründeki dosyadan değil) ve yukarıdaki 4–7. adımları yeniden denediğinizden emin olun. Olmadıysa programı sizin için kuran kişiye ya da geliştiriciye haber verin; terminal komutu yazmanız gerekmez. <!-- doğrula (S-80): macOS 26 -->

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

## İsteğe bağlı, teknik: indirilen dosyanın bozulmadığını denetlemek

Bu bölüm zorunlu değildir; yalnız indirme yarım kaldıysa ya da dosya yolda değiştiyse fark etmek isteyenler içindir ve bilgisayarda komut yazmayı gerektirir. Sürümler sayfasında `SHA256SUMS.txt` adlı küçük bir dosya vardır; her kurulum dosyasının adı ve yanında uzun bir harf-rakam dizisi yazar.

- **Windows:** Başlat'a "PowerShell" yazıp açın ve `Get-FileHash $HOME\Downloads\Bismuth-Setup.exe` yazın (dosya adını kendinize göre değiştirin).
- **Mac:** Launchpad → Diğer → **Terminal**'i açın ve `shasum -a 256 ~/Downloads/Bismuth.dmg` yazın.

Çıkan dizi `SHA256SUMS.txt`'dekiyle **aynıysa** dosya sağlamdır. Farklıysa dosyayı silip yeniden indirin.

## Teknik: bilgisayarı ne kadar yorduğunu ölçmek (isteğe bağlı)

Bismuth'un otel bilgisayarında ne kadar bellek ve işlemci kullandığını görmek isterseniz program kendini ölçüp bir dosyaya
yazabilir. Bu ölçüm yalnızca bu bilgisayarda kalır; hiçbir yere gönderilmez ve kayıtlarınıza dokunmaz.

1. Bismuth açıksa kapatın (tek örnek çalışır; açıkken ikinci başlatma ölçmez).
2. Başlat'a "PowerShell" yazıp açın ve şunu yapıştırın (`Bismuth.exe` başka bir yerdeyse yolu değiştirin; Başlat'taki
   Bismuth kısayoluna sağ tıklayıp **Dosya konumunu aç** yolu gösterir):

   `& "$env:LOCALAPPDATA\Programs\Bismuth\Bismuth.exe" --perf-out="$HOME\Desktop\bismuth-olcum.json" --perf-idle=60`

3. Program açılır. Oturum açıp **Takvim** ekranına geçin ve 60 saniye bekleyin (süreyi `--perf-idle=` ile 5–600 saniye
   arasında değiştirebilirsiniz; varsayılan 30). Süre dolunca program kendiliğinden kapanır ve masaüstüne
   `bismuth-olcum.json` yazılır.
4. Dosyayı bana gönderin ya da bir geliştirici bilgisayarında `node scripts/perf-measure.mjs --report bismuth-olcum.json`
   komutuyla tabloya çevirin. Tablodaki "RSS" sütunu Görev Yöneticisi'ndeki "Bellek"e en yakın sayıdır (çalışma kümesi).

Ölçümü karşılaştırmak için ikinci kez, bu kez **Ayarlar → Uzaktan erişim** ekranında **Pencere kapanınca tepside çalışsın**
seçiliyken (ana bilgisayar kipinde) pencereyi kapatıp Görev Yöneticisi'nde "Bismuth" satırlarına bakabilirsiniz: pencere,
grafik ve sayfa süreçleri kalmaz.

### Hafif mod

Ana bilgisayarda **Ayarlar → Uzaktan erişim** ekranındaki **Pencere kapanınca tepside çalışsın** seçeneği açıkken pencereyi
kapatınca program kapanmaz; saatin yanındaki tepsi simgesinde bekler (sunucu çalışmaya devam eder). Simgeye sağ tıklayınca
**Bismuth'u aç**, **Tarayıcıda aç** (bu bilgisayarın tarayıcısında `http://127.0.0.1:<kapı>` adresi) ve **Çık** vardır; tam
kapatmak için **Çık**'ı kullanın. Tarayıcıda her zamanki kullanıcı adı ve parolanızla oturum açarsınız. Seçenek varsayılan
olarak kapalıdır ve yalnızca ana bilgisayar kipinde etki eder.
