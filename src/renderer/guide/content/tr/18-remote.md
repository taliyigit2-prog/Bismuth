# Uzaktan erişim (Mac ve telefon)

Otel sahibi evdeki Mac'inden ya da telefonundan otelin kayıtlarını görebilir ve yetkisi olan işleri yapabilir. Bunun için bizim bir sunucumuz ya da ücretli bir hizmet yoktur: oteldeki bilgisayar **ana bilgisayar** olur, diğer cihazlar ona ücretsiz bir **özel ağ** uygulaması (NetBird) üzerinden bağlanır. Kayıtlar her zaman ana bilgisayarda kalır.

## Çalışma şekilleri {#modes}

**Ayarlar → Uzaktan erişim** bölümündeki **Bu bilgisayar** kutusunda üç seçenek vardır:

- **Tek bilgisayar**: kimse uzaktan bağlanmaz. Küçük oteller için yeterlidir.
- **Otelin ana bilgisayarı**: asıl veriler bu bilgisayarda; diğer bilgisayarlar ve telefonlar buna bağlanır.
- **Başka bir Bismuth'a bağlan**: örneğin sahibin Mac'i; ana bilgisayardaki verilerle çalışır.

Bu ayarlar yalnız ana bilgisayarın kendi penceresinde değişir; telefondan ya da Mac'ten değiştirilemez.

Bilgisayarı **Otelin ana bilgisayarı** yapınca **Ana bilgisayar çalışıyor** yazar ve bağlanılacak adres görünür: **Dışarıdan (NetBird)**. Adresin yanındaki QR kodu telefonun kamerasıyla okutabilirsiniz. NetBird bu bilgisayarda açık değilse "Özel ağ adresi bulunamadı" yazar; aşağıdaki kurulumu yapın.

Aynı kutuda şunlar da vardır:

- **Otelin ağından bağlantı**: varsayılan olarak **kapalıdır**; telefonlar ve diğer bilgisayarlar yalnız özel ağdan (NetBird) bağlanır, çünkü özel ağ bağlantıyı şifreler. Açarsanız otelin Wi‑Fi ya da kablolu ağındaki cihazlar da bağlanabilir ve **Otel içinden (Wi‑Fi)** adresi görünür. Açarken bir uyarı çıkar: otelin ağında bağlantı şifresizdir, misafirlerin bağlandığı Wi‑Fi otelin kendi ağından ayrı olmalıdır (modemdeki "misafir ağı"). Emin değilseniz kapalı bırakın; NetBird otel içinde de çalışır.
- **Bu bilgisayarın kimliği**: "4514-284E-…" gibi bir sayı. Mac ilk bağlandığında bu kimliği aklında tutar; Mac'in **Ayarlar → Uzaktan erişim** ekranında aynı kimliği görmelisiniz.
- **Bağlantı noktası (port)**: genellikle değiştirmeyin (7373).

## Dışarıdan erişimi kurmak (bir kez) {#netbird}

Bu işi otel sahibi bir kez yapar; yaklaşık yarım saat sürer. Ekrandaki **Dışarıdan erişim kurulumu** kutusunda dört adım vardır:

1. **Ana bilgisayara NetBird'ü kurun**: NetBird'ün sitesinde otelin Gmail hesabıyla ücretsiz ağı açın, ana bilgisayarı kurulum anahtarıyla bağlayın ve NetBird panelinde bu cihaz için oturum süresinin dolmasını kapatın.
2. **Sahibi davet edin**: NetBird panelinde **Users → Invite** ile sahibin kendi e‑posta adresine davet gönderin.
3. **Mac'e ve telefona NetBird kurun**: sahip daveti kendi hesabıyla kabul eder ve NetBird'ü Mac'e ve telefona kurar (App Store ya da Google Play).
4. **Bağlanın**: Mac'te Bismuth'u açıp **Başka bir Bismuth'a bağlan**'ı seçin; telefonda "Dışarıdan" adresinin QR kodunu okutun.

Yanındaki **Hep açık** kutusu ana bilgisayarın hep ulaşılır kalması için yapılacakları sıralar. **Bilgisayar açılınca Bismuth'u başlat**'ı açın.

> [!tip]
> Ana bilgisayar kapanmamalı ve uyku moduna geçmemelidir; yoksa dışarıdan erişim kesilir. Windows'ta Ayarlar → Sistem → Güç → Uyku: "Hiçbir zaman" seçin.

## Mac'ten bağlanmak {#connect-mac}

1. Mac'e Bismuth'u kurun ve açın.
2. Kurulumun **Çalışma şekli** adımında **Başka bir Bismuth'a bağlan**'ı seçin ve **Bağlantı ekranına geç**'e basın.
3. **Ana bilgisayarın adresi** alanına "Dışarıdan" adresini yazın ve **Bağlan**'a basın. Otel içindeyseniz ve otelin ağından bağlantı açıksa **Yerel ağda bulunanlar** listesinden de seçebilirsiniz.
4. Kullanıcı adınız ve şifrenizle oturum açın.

Bağlıyken üst çubukta **Ana bilgisayara bağlı** rozeti görünür. Mac'te yazdığınız her şey doğrudan ana bilgisayara yazılır.

Mac'in **Ayarlar → Uzaktan erişim** ekranında ana bilgisayarın adresi, durumu ve **Bilinen kimlik** yazar. Bu adreste başka bir bilgisayar cevap verirse **Ana bilgisayarın kimliği değişti** uyarısı çıkar ve hiçbir bilgi gönderilmez. Yalnız ana bilgisayar gerçekten değiştiyse (devralındı ya da yeniden kuruldu) kimliği ana bilgisayarın ekranındakiyle karşılaştırıp **Yeni kimliği kabul et**'e basın.

Mac, ana bilgisayardaki bütün kayıtların salt okunur bir **yedek kopyasını** tutar. Ana bilgisayar kapalıyken ya da internet yokken ekranlar bu kopyadan açılır; üstte kopyanın saati yazar ve kayıt değiştirilemez. Bağlantı gelince kendiliğinden canlıya döner. NetBird kapalıyken kopya, otelin Drive'ındaki şifreli kutudan güncellenir; bunun için Mac'te **Yedek kopya** kutusunda Drive klasörünü seçip kâğıttaki **Bismuth anahtarını** bir kez girin.

## Telefondan bağlanmak {#phone}

1. Telefonda NetBird uygulamasının açık olduğundan emin olun.
2. Tarayıcıda ana bilgisayarın adresini açın ya da ana bilgisayarın ekranındaki QR kodunu telefonun kamerasıyla okutun.
3. Kullanıcı adınız ve şifrenizle oturum açın. PIN telefonda ve Mac'te kullanılmaz; PIN yalnız ana bilgisayarın kendi penceresinde geçerlidir.
4. Tarayıcının menüsünden **Ana ekrana ekle**'yi seçin; Bismuth uygulama gibi açılır.

![Telefonda Bugün ekranı](phone-today)

Telefonda alt menüde **Bugün · Takvim · Misafir · Kasa · Daha fazla** vardır. Telefondan ödeme girebilir, arıza açabilir, oda durumunu değiştirebilir, görevi yapıldı olarak işaretleyebilir, vardiya notlarını ve otelde kalanları görebilirsiniz.

![Telefonda Daha fazla menüsü](phone-more)

## Güvenlik {#remote-security}

- Telefon ve diğer bilgisayarlardaki oturum belli bir süre sonunda kapanır; yeniden oturum açılır. Bu süre **Oturum güvenliği** kutusundaki **Uzaktan oturum süresi** ile seçilir.
- Ağdan 5 yanlış şifreden sonra uzaktan giriş 15 dakika kilitlenir; ana bilgisayardaki pencere bundan etkilenmez.
- **Bağlı cihazlar** listesinde hangi cihazın ne zaman bağlandığı yazar. Tanımadığınız ya da kaybolan bir cihaz için **Oturumu kapat** ya da **Cihazı çıkar**'a basın.
- Bir rolün nereden oturum açacağını **Ayarlar → Kullanıcılar ve roller**'de o rolün **Uzaktan oturum açma** seçeneğiyle belirlersiniz: **Her yerden**, **Yalnız otelin ağından** ya da **Kapalı (yalnız ana bilgisayarda)**.
- Ana bilgisayarın Bismuth anahtarını gösterme, girme ve değiştirme ile Drive klasörünü seçme yalnız ana bilgisayarın kendi penceresinde yapılır. (Mac, kendi yedek kopyası için anahtarı kendi penceresinde girer.)
- Dizüstü bilgisayarlarda disk şifrelemesini (Mac'te FileVault, Windows'ta BitLocker) açmanızı öneririz.

## Ana bilgisayar bozulursa {#takeover}

Drive'daki şifreli yedekler ve Mac'teki yedek kopya sayesinde kayıtlar kaybolmaz. Ana bilgisayar tamamen bozulursa Mac'te **Ayarlar → Uzaktan erişim** ekranındaki **Ana bilgisayar bozuldu mu?** kutusunda **Bu bilgisayarı ana bilgisayar yap**'a basın:

1. Pencerede ne olacağı yazar: yedek kopyadaki son bilgiler bu bilgisayarın kayıtları olur ve Drive kutusuna yeni dönem notu yazılır.
2. Kâğıttaki **Bismuth anahtarını** yazın (bu bilgisayara girilen anahtarla aynı olmalı).
3. Kendi **yeni şifrenizi** iki kez yazın. Diğer kullanıcıların şifrelerini sonra **Ayarlar → Kullanıcılar ve roller**'den yenileyin.
4. **Ana bilgisayar yap**'a basın. Bismuth yeniden başlar ve ana bilgisayar olarak açılır.

Eski bilgisayar geri gelirse yeni dönem notunu görür ve değişiklik kabul etmez; ekranında, yeni ana bilgisayarın bilmediği değişikliklerin listesi çıkar. Bkz. [Bismuth anahtarı](guide:backup#backup-key).

## Sorun giderme {#remote-trouble}

- **Bağlanamıyorum**: ana bilgisayar açık mı, uyku modunda mı? NetBird iki cihazda da açık mı? Adres doğru mu?
- **Telefon açılmıyor**: NetBird'ün açık olduğunu kontrol edin ve "Dışarıdan" adresini kullanın. "Otel içinden" adresi yalnız otelin ağından bağlantı açıksa çalışır.
- **"Ana bilgisayarın kimliği değişti"**: ana bilgisayarı siz değiştirmediyseniz kabul etmeyin ve otel sahibine haber verin.
- **Mac salt okunur**: ana bilgisayara ulaşılamıyordur; bağlantı gelince kendiliğinden düzelir.
- **"Bismuth sürümleri farklı"**: iki bilgisayardaki Bismuth'u aynı sürüme getirin.
