# Başlarken

Bu bölüm programı ilk kez açan herkes içindir: oturum açmak, ekranı kilitlemek, dili değiştirmek, menüde yolunuzu bulmak ve takıldığınızda yardım almak.

## Bismuth nedir? {#what-is-bismuth}

Bismuth otelin bütün günlük işini tek yerde tutar: rezervasyonlar, ödemeler, kasa, giderler, misafirler, oda temizliği, arızalar, görevler, vardiya devri ve personel. Excel'de ayrı ayrı sayfalarda tuttuğunuz bilgiler burada birbirine bağlıdır: bir ödeme yazdığınızda takvimdeki renk, deftere düşen satır ve kasadaki para birlikte değişir.

- Program **internet olmadan da** çalışır. İnternet yalnız döviz kuru, hava durumu ve bayram tarihleri gibi isteğe bağlı bilgiler için kullanılır.
- Verileriniz otelin kendi bilgisayarında durur; hiçbir yere gönderilmez.
- Hiçbir kayıt silinmez. Yanlış bir kayıt **iptal edilir**; kimin, ne zaman ve neden iptal ettiği saklanır.

## İlk kurulum {#setup}

Program ilk kez açıldığında **kurulum sihirbazı** gelir. Otel sahibi bunu bir kez yapar; yaklaşık 10–15 dakika sürer. Adımlar sırasıyla şunlardır:

1. **Dil ve tema**: programın dili ve açık ya da koyu görünüm.
2. **Çalışma şekli**: bu bilgisayar tek başına mı çalışacak, otelin ana bilgisayarı mı olacak, yoksa başka bir Bismuth'a mı bağlanacak?
3. **Otel**: otelin adı, ülkesi, şehri, saat dilimi, giriş ve çıkış saatleri.
4. **Para birimleri**: toplamların hesaplandığı ana para birimi (çoğu zaman TRY, Türk lirası) ve kabul ettiğiniz dövizler.
5. **Oda tipleri**: otelinizdeki tipler ve önerilen gecelik fiyatları.
6. **Odalar**: kat sayısı ve kat başına oda sayısıyla odaları hızla oluşturursunuz; sonra numara, tip ve yatak sayısını tek tek düzeltirsiniz.
7. **Ödeme ve satış**: ödeme yöntemleri (nakit, kart, IBAN…), satış kanalları (doğrudan, Booking, Airbnb…) ve ek hizmetler.
8. **Personel ve vardiyalar**: izin ve ücret kuralları, vardiya saatleri, görev önerileri.
9. **Çalışanlar**: isterseniz çalışanları ekleyip kullanıcı hesabı açarsınız.
10. **Takvim**: vurgulanacak günler (örneğin hafta sonu), bayramlar ve gün kapatma.
11. **Sahip hesabı**: her şeyi gören ilk hesap; adınız, kullanıcı adınız, şifreniz ve isterseniz PIN.
12. **Özet**: bilgileri kontrol edip **Kurulumu bitir**'e basarsınız.

![Kurulum sihirbazı](setup)

> [!warning]
> Kurulum bitince ekranda **kurtarma kodları** ile **Bismuth anahtarı** bir kez görünür. Bunları kâğıda yazın ya da kopyalayıp güvenli bir yerde saklayın. Şifrenizi unutursanız yeni şifreyi bu kodlardan biriyle belirlersiniz. **Kâğıda yazdım** kutusunu işaretlemeden programa geçilmez.

Programı bilgisayara kurmak için [Kurulum ve yeni sürüm](guide:installation) bölümüne bakın. Kurulumda verdiğiniz bilgilerin hemen hepsini sonra **Ayarlar**'dan değiştirebilirsiniz. Yalnız ana para birimi, rezervasyon ya da ödeme yazıldıktan sonra değiştirilemez.

## Oturum açmak {#sign-in}

Herkes programa **kendi adıyla** girer. Böylece kim neyi yazdı, kim parayı teslim aldı, kim devri okudu, hep bellidir.

1. Oturum açma ekranında listeden **adınıza** tıklayın.
2. **PIN** ya da **Şifre** seçin. PIN'iniz varsa program önce PIN'i sorar.
3. PIN'inizi ya da şifrenizi yazıp <kbd>Enter</kbd>'a basın ya da **Oturum aç** düğmesine tıklayın.

![Oturum açma ekranı](login)

- Adınız listede yoksa **Kullanıcı adıyla oturum aç**'a basın; kullanıcı adınızı ve şifrenizi yazın.
- Size yeni bir hesap açıldıysa ilk oturum açışta **Yeni şifre belirleyin** ekranı gelir: size verilen geçici şifreyi ve iki kez yeni şifrenizi yazın, **Şifreyi kaydet**'e basın.
- Beş kez yanlış şifre girilirse hesap 15 dakika kilitlenir. Bu bir güvenlik önlemidir; bekleyin ya da şifrenizi yenileyin.

## Şifremi unuttum {#forgot-password}

1. Oturum açma ekranında **Şifremi unuttum**'a basın.
2. Kullanıcı adınızı ve kurtarma kodlarınızdan birini yazın.
3. Yeni şifrenizi iki kez yazıp **Şifreyi yenile**'ye basın.

Her kurtarma kodu bir kez kullanılır. Kodunuz yoksa otel sahibi şifrenizi **Ayarlar → Kullanıcılar ve roller** bölümünden sıfırlayabilir; size yeni bir geçici şifre verir.

## Hesap menüsü {#account-menu}

Ekranın sağ üst köşesinde adınızın yazdığı düğme **hesap menüsünü** açar. Buradan:

- **Şifremi değiştir**: eski şifrenizi ve iki kez yenisini yazarsınız.
- **PIN ayarla** ya da **PIN'i değiştir**: 4–8 rakamlık PIN, listeden adınızı seçip hızlı oturum açmanız ve kilidi açmanız içindir. 1111, 1234 gibi kolay PIN'ler kabul edilmez.
- **Kurtarma kodlarını yenile**: yeni kodlar alırsınız; kullanılmamış eski kodlar geçersiz olur.
- **Kilitle** ve **Oturumu kapat**.

## Ekranı kilitlemek {#lock}

Masadan kalkarken ekranı kilitleyin; başkası sizin adınıza kayıt yazamasın.

- Hesap menüsünden **Kilitle**'yi seçin ya da <kbd>Ctrl</kbd> + <kbd>L</kbd> (Mac'te <kbd>⌘</kbd> + <kbd>L</kbd>) tuşlarına basın.
- Kilidi açmak için PIN'inizi ya da şifrenizi yazıp **Kilidi aç**'a basın. Kaldığınız ekrana dönersiniz.
- Başka biri çalışacaksa kilit ekranında **Başka kullanıcıyla oturum aç**'ı seçer.
- Bir süre fare ve klavye kullanılmazsa pencere kendiliğinden kilitlenir. Bu süreyi otel sahibi **Ayarlar → Genel → Ekran kilidi** bölümünden seçer.

> [!tip]
> Vardiya bitince **Oturumu kapat**'ı kullanın. Kilit, kısa süre ayrılmak içindir; oturumu kapatmak ise bilgisayarı sonraki kişiye bırakmak içindir.

## Dil, tema ve görünüm {#language}

Program Türkçe, İngilizce ve Rusça çalışır. Her kullanıcı kendi dilini seçer; birinin seçimi diğerini etkilemez.

1. Sol menüden **Ayarlar**'ı açın; **Genel** bölümü açılır.
2. **Dil** kutusundan dilinizi seçin. Menüler ve düğmeler hemen değişir.
3. Aynı bölümde **Tema** (Açık, Koyu, Bilgisayarla aynı), **Yoğunluk** (Rahat, Sıkışık), **Kuruşları göster** ve **Açılış ekranı** (Takvim ya da Bugün) seçimleri de vardır.

![Ayarlar, Genel bölümü](settings-general)

## Menü ve ekranlar {#menu}

Bilgisayarda soldaki **kenar menü** bütün ekranları gruplar hâlinde gösterir: Günlük işler, Misafirler, Para, İşletme, Personel, Raporlar ve Sistem. Menüyü sol üstteki düğmeyle daraltıp genişletebilirsiniz. Menüde yalnız rolünüzün görebildiği ekranlar çıkar.

Üst çubukta soldan sağa: otelin adı ve bugünün tarihi, **Ara ya da git** kutusu, **?** (kılavuz) düğmesi, kasa durumu ve hesap menünüz.

- **Hızlı arama**: <kbd>Ctrl</kbd> + <kbd>K</kbd> (Mac'te <kbd>⌘</kbd> + <kbd>K</kbd>) ya da üstteki **Ara ya da git** kutusu. Bir ekranın adını yazıp <kbd>Enter</kbd>'a basın; dil ve tema da buradan değişir. Rehberdeki bir numarayı aramak için önce "rehber" yazın.
- Pencerelerde <kbd>Enter</kbd> kaydeder, <kbd>Esc</kbd> kapatır.

## Klavye kısayolları {#keyboard}

Sık yapılan işler için fareye uzanmanız gerekmez. Bir yazı alanının içinde değilken şu tuşlara basın:

- <kbd>N</kbd>: **Yeni rezervasyon** penceresi açılır; hangi ekranda olursanız olun takvim açılır. Takvimde bir hücre seçiliyse rezervasyon o oda ve o gün için başlar.
- <kbd>P</kbd>: ödeme ekleme penceresi açılır. Bir rezervasyonun paneli açıksa ödeme o rezervasyona yazılır; değilse **Defter ve kasa** ekranında o günün ödemesi olarak açılır.
- <kbd>T</kbd>: takvim bugüne döner ve bugünün hücresi seçilir; oradan ok tuşlarıyla devam edebilirsiniz.
- <kbd>Ctrl</kbd> + <kbd>K</kbd> ya da <kbd>/</kbd>: hızlı arama.
- <kbd>?</kbd> ya da <kbd>F1</kbd>: bütün kısayolların listesi. Listeyi hızlı aramada "kısayol" yazarak da açabilirsiniz.

Bütün kısayollar:

[[shortcuts]]

> [!tip]
> Mac'te <kbd>Ctrl</kbd> yerine <kbd>⌘</kbd> tuşunu kullanın. Rusça ya da başka bir klavye düzenindeyken de aynı tuşlar çalışır: program harfin yerine tuşun yerine bakar.

## Telefonda {#on-the-phone}

Telefonda menü ekranın altındadır: **Bugün · Takvim · Misafir · Kasa · Daha fazla**. Diğer ekranlar **Daha fazla**'nın altındadır. Formlar alttan açılır; düğmeler parmakla rahat basılacak büyüklüktedir. Telefondan bağlanmak için [Uzaktan erişim](guide:remote) bölümüne bakın.

## Bu kılavuz {#guide}

- Her ekranın üst çubuğundaki **?** düğmesi o ekranı anlatan bölümü açar.
- Kılavuzun tamamı **Ayarlar → Kılavuz** bölümündedir; sol menüde **Sistem** grubunda da **Kılavuz** vardır.
- **Kimin için** kutusuyla yalnız işinize yarayan bölümleri görebilirsiniz: Resepsiyon, Temizlik, Muhasebe, Sahip ve müdür.
- Arama kutusuna bir sözcük yazın (örneğin "kapora"); geçtiği yerler listelenir.
- **Bölümü yazdır** açık bölümü kâğıda basar.
- İlk oturum açışta görünen kısa **tanıtım turunu** **Tanıtım turunu başlat** düğmesiyle yeniden izleyebilirsiniz.

![Kılavuz ekranı](guide)
