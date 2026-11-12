# Uzaktan erişim kılavuzu

> Bismuth'u evdeki Mac'inizden ve telefonunuzdan kullanmak için. Yaklaşık 25 dakika. Hepsi **ücretsiz**: Bismuth'un
> bir sunucusu yoktur, verileriniz otelin bilgisayarında kalır (K-19, K-31, K-32). Programda: **Ayarlar → Uzaktan
> erişim** (adresler, QR kodu, "Hep açık" ve kurulum adımlarının kısa hâli).

## Kısaca nasıl çalışır?

- **Otel bilgisayarı = ana bilgisayar.** Bütün kayıtlar burada tutulur. Mac ve telefon ona bağlanır.
- **Otelin içinde** (aynı Wi‑Fi ya da kablo) bağlanmak için başka bir şey gerekmez.
- **Otelin dışından** bağlanmak için ücretsiz **NetBird** uygulaması kullanılır. NetBird, otel bilgisayarıyla sizin
  cihazlarınız arasında şifreli, özel bir ağ kurar. İnternetteki başka kimse otel bilgisayarına ulaşamaz.
- Bismuth yalnız otelin ağına ve bu özel ağa açılır; internete açık adreslere hiç açılmaz.
- **Mac'te yedek kopya.** Mac, otel bilgisayarındaki bütün kayıtların **salt okunur** bir kopyasını tutar. Otel
  bilgisayarı kapalıyken ya da bağlantı yokken bütün ekranlar bu kopyadan açılır; üst çubukta "Yedek kopya · 14:32"
  yazar ve değişiklik yapılamaz. Bağlantı gelince kendiliğinden canlıya döner.
- **Şifreli kutu (Drive).** Otel bilgisayarı her dakika değişiklikleri **Bismuth anahtarıyla şifreleyip** otelin
  Drive'ındaki `Bismuth/kutu` klasörüne yazar. NetBird çalışmasa bile Mac'teki kopya oradan güncellenir. Google bu
  dosyaları okuyamaz; anahtar yalnız sizdedir.
- **PDF özet.** Otel bilgisayarı her saat `Bismuth/ozet.pdf` dosyasını yeniler: bugünün ve bu ayın sayıları, kişisel
  veri olmadan. Telefonda Drive uygulamasıyla açılır.
- **Devral.** Otel bilgisayarı tamamen bozulursa Mac (ya da yeni bir bilgisayar) "Bu bilgisayarı ana bilgisayar yap"
  ile son kopyadan devam eder.

## Gerekenler

- Otel bilgisayarı (Windows 10 ya da 11) ve üzerinde Bismuth.
- Otelin Gmail hesabı (NetBird ağının sahibi olacak) ve sizin kendi e‑posta hesabınız.
- Mac'iniz ve telefonunuz (iPhone ya da Android).

## 1. Otel bilgisayarını hazırlayın

1. **Google Drive masaüstü uygulamasını** kurun ve **otelin Gmail hesabıyla** oturum açın. Drive'ım içinde
   `Bismuth` adlı bir klasör oluşturun. (Şifreli yedekler buraya gider: Ayarlar → Yedek.) Bilgisayar zayıfsa
   Drive ayarlarında yükleme hızını sınırlayın.
2. Tarayıcıda **netbird.io**'ya gidin, **otelin Gmail hesabıyla** giriş yapın. Ağınız kendiliğinden oluşur.
3. NetBird panelinde **Setup Keys → Create Setup Key** ile bir kurulum anahtarı oluşturun.
4. Otel bilgisayarına **NetBird** uygulamasını kurun ve bu kurulum anahtarıyla bağlayın. NetBird bir Windows hizmeti
   olarak çalışır: kimse oturum açmasa da bağlanır.
5. NetBird panelinde bu bilgisayarı bulun:
   - adını `bismuth-host` yapın (otelin adını koymayın),
   - **oturum süresinin dolmasını kapatın** (Login expiration: off). Yoksa birkaç günde bir bağlantı kopar.

## 2. Sahibi davet edin

1. NetBird panelinde **Users → Invite** ile **kendi** e‑posta adresinizi davet edin.
2. Kendi Google hesabınızı otelin bilgisayarlarında kullanmayın; otelin hesabı otelde, sizinki sizde kalır.

## 3. Mac'e ve telefona NetBird kurun

1. Mac'e NetBird'ü kurun ve **kendi hesabınızla** davete katılın.
2. Telefona App Store ya da Google Play'den **NetBird** uygulamasını kurun, aynı şekilde kendi hesabınızla katılın.
3. Mac'te başka bir özel ağ uygulaması (örn. Tailscale) da varsa ikisi aynı adres aralığını kullanır; bağlanamazsanız
   aşağıdaki "Sorun giderme" bölümüne bakın.

## 4. Bismuth'ta uzaktan erişimi açın (otel bilgisayarında)

1. **Ayarlar → Uzaktan erişim → Bu bilgisayar → Otelin ana bilgisayarı**'nı seçin.
2. "Ana bilgisayar çalışıyor" yazar ve adresler görünür:
   - **Dışarıdan (NetBird):** örn. `http://100.92.10.4:7373`
   - **Otel içinden (Wi‑Fi):** örn. `http://192.168.1.20:7373` — yalnız **"Otelin ağından bağlantı"** açıksa
     (varsayılan kapalı; aşağıdaki "Güvenlik" bölümüne bakın).
   Altında **"Bu bilgisayarın kimliği"** yazar (örn. `AB12-CD34-EF56-7890`). Mac'ten ilk bağlandığınızda Mac'te de
   aynı kimliği görmelisiniz.
3. **Hep açık** kartında "Bilgisayar açılınca Bismuth'u başlat"ı açın ve oradaki öğütleri uygulayın: uyku kapalı,
   küçük bir kesintisiz güç kaynağı (UPS), Windows güncellemeleri için "Etkin saatler".
4. Windows ilk seferde "Bismuth'un özel ağlarda erişmesine izin verilsin mi?" diye sorabilir: **İzin ver**'i seçin.
   (Kurulum programı bu izni kendisi eklemeye çalışır; Windows izin vermezse bu soru bir kez gelir. Ortak ağlara,
   örn. kafe Wi‑Fi'ına, izin vermeyin.)
5. **Ayarlar → Yedek**'de Drive klasörü kendiliğinden bulunur; bulunmazsa **Klasör seç** ile Drive'daki
   `Bismuth/yedekler` klasörünü gösterin. (Klasör yalnız bu pencereden, sistemin klasör penceresiyle seçilir; ağ
   paylaşımı seçilemez.)
6. **Bismuth anahtarını yazdırın:** Ayarlar → Yedek → **Anahtarı göster**. Anahtar 11 grup × 5 harf-rakam
   (`7KQ2M-…`) ve yanında aynı anahtarın **QR kodu** olarak görünür. **Yazdır**'a basın; çıkan sayfayı kasada saklayın.
   Fotoğrafını çekip mesajla göndermeyin. Anahtar kaybolursa Drive'daki şifreli yedekler ve kutu açılamaz.
7. **Ayarlar → Uzaktan erişim → Şifreli kutu ve PDF özet** kartında klasörün (`…/Bismuth/kutu`) göründüğünü ve "Son
   paket" saatinin ilerlediğini görün. "Kimlik numaraları kutuya konmasın" açık kalsın (varsayılan). "Saatlik PDF özet"
   istemiyorsanız kapatabilirsiniz. **Şimdi yaz** ile hemen bir tam kopya ve özet yazılır.

## 5. Mac'ten bağlanın

1. Mac'te Bismuth'u açın. İlk açılışta **"Başka bir Bismuth'a bağlan"**ı seçin (zaten kuruluysa: Ayarlar → Uzaktan
   erişim → "Başka bir Bismuth'a bağlan").
2. Bağlantı ekranında **Dışarıdan (NetBird)** adresini yazıp **Bağlan**'a basın. (Otelin ağından bağlantı açıksa ve
   otelin içindeyseniz ana bilgisayar **listede** de görünür; dokunun.)
3. Bismuth ana bilgisayarın **kimliğini** bu ilk bağlantıda saklar (Ayarlar → Uzaktan erişim → Bu bilgisayar kartında
   "Bilinen kimlik"). Otel bilgisayarındakiyle aynı olduğuna bakın. Sonra aynı adreste başka bir bilgisayar cevap
   verirse Bismuth **bağlanmaz**, hiçbir bilgi göndermez ve "Ana bilgisayarın kimliği değişti" der.
4. Kullanıcı adınızla ve şifrenizle oturum açın. Artık kayıtları otel bilgisayarındakiyle aynı görürsünüz; yazdığınız
   her şey otel bilgisayarına yazılır.
5. İlk açılışta macOS "yerel ağdaki cihazları bulmak" için izin ister: **İzin ver**'i seçin.
6. **Yedek kopya kendiliğinden başlar** (uzaktan erişim ayarlarını görebilen biri, örn. otel sahibi, oturum açınca).
   Ayarlar → Uzaktan erişim → **Yedek kopya** kartında "Güncel · saat (ana bilgisayara bağlı)" yazar.
7. **Drive klasörünü ekleyin:** otelin hesabıyla Drive'da `Bismuth` klasörünü kendi e‑postanıza paylaşın; Mac'te
   Drive uygulamasında (kendi hesabınızla) bu klasöre sağ tıklayıp **"Drive'ım'a kısayol ekle"**yi seçin. Bismuth
   klasörü kendisi bulur; bulamazsa Yedek kopya kartında **Klasör seç** ile `Bismuth` klasörünü gösterin.
8. **Anahtarı bir kez girin:** Yedek kopya kartında **Anahtarı gir**'e basın ve kasadaki kâğıttaki anahtarı yazın.
   İsterseniz kâğıttaki QR kodu telefonunuzun kamerasıyla okutup çıkan metni Mac'e yapıştırabilirsiniz. Bu Mac daha
   önce kendi anahtarını oluşturmuşsa Bismuth "Bu bilgisayarın anahtarı değiştirilsin mi?" diye sorar: **Anahtarı
   değiştir**'i seçin.

## 6. Telefondan bağlanın

1. Telefonda NetBird açıkken, otel bilgisayarında Ayarlar → Uzaktan erişim'de **Dışarıdan (NetBird)** adresinin
   yanındaki **QR** düğmesine basın ve kodu telefonun kamerasıyla okutun. ("Otelin ağından bağlantı" açıksa "Otel
   içinden" adresinin QR kodu da olur.)
2. Kullanıcı adınızla ve şifrenizle oturum açın. Telefonda ve diğer bilgisayarlarda **PIN kullanılmaz**: PIN yalnız
   otel bilgisayarının kendi penceresinde hızlı kullanıcı değiştirme içindir; telefonun kilidi de şifreyle açılır.
3. **Ana ekrana ekleyin:** iPhone'da Safari → Paylaş → "Ana Ekrana Ekle"; Android'de tarayıcı menüsü (⋮) → "Ana
   ekrana ekle". Bismuth uygulama gibi açılır.

## 7. Deneyin

1. Otel bilgisayarını yeniden başlatın; birkaç dakika içinde Mac'ten ve telefondan yeniden bağlanabildiğinizi görün.
   Otel bilgisayarı kapalıyken Mac'te ekranların "Yedek kopya · saat" rozetiyle açıldığını görün.
2. Telefonda Wi‑Fi'ı kapatıp mobil veriyle (NetBird açık) Bugün ekranını açın.

3. Mac'te NetBird'ü kapatın: birkaç dakika içinde Yedek kopya kartında "Güncel · saat (Drive kutusundan)" yazar.
4. Telefonda Drive uygulamasında `Bismuth/ozet.pdf` dosyasını açın.

## Otel bilgisayarı bozulursa: devral

Yalnız otel bilgisayarı gerçekten kullanılamaz olduğunda (çalınma, disk arızası) yapın.

1. Mac'te (ya da yeni bilgisayarda: Bismuth'u kurun, "Başka bir Bismuth'a bağlan" deyin, bir kez oturum açmış ve yedek
   kopyası, Drive klasörü ve anahtarı hazır olmalı) **Ayarlar → Uzaktan erişim → Yedek kopya → Otel bilgisayarı
   bozuldu mu? → Bu bilgisayarı ana bilgisayar yap**.
2. Pencere ne olacağını anlatır. **Kendi yeni şifrenizi** iki kez yazın (şifreler eski bilgisayarda kalır, buraya hiç
   gelmez) ve kasadaki kâğıttan **Bismuth anahtarını** yeniden yazın: anahtarı bilmeyen biri bu bilgisayarı ana
   bilgisayar yapamaz. Eski bilgisayar hâlâ çalışıyorsa Bismuth uyarır; gerçekten gerekiyorsa "Yine de devral"ı
   işaretleyin.
3. **Ana bilgisayar yap**'a basın. Bismuth yeniden başlar ve bu bilgisayar ana bilgisayar olur (yeni "dönem"). Drive
   kutusuna bir dönem notu yazılır.
4. Yeni şifrenizle oturum açın. **Diğer kullanıcıların şifrelerini** Ayarlar → Kullanıcılar ve roller bölümünden yenileyin.
5. Bu bilgisayarda Ayarlar → Uzaktan erişim'den sunucu modunu açın ve telefonlar için yeni adresi/QR'ı kullanın;
   NetBird'de bu bilgisayarın adını `bismuth-host` yapın.
6. **Eski otel bilgisayarı yeniden açılırsa:** bir dakika içinde kutudaki dönem notunu görür, **hiçbir değişiklik kabul
   etmez** ve üstte "Bu bilgisayar artık ana bilgisayar değil" yazar. Ayarlar → Uzaktan erişim'de, devraldıktan sonra
   orada yazılmış kayıtlar **çakışan kayıtlar** olarak listelenir: **Listeyi kaydet** ile dosyaya alın ve yeni ana
   bilgisayara elle girin (Bismuth kendiliğinden birleştirmez). Sonra **Yeni ana bilgisayara bağlan** ile eski
   bilgisayar yeni ana bilgisayarı kullanır; eski kayıtlar silinmez.

## Güvenlik

- **Misafir Wi‑Fi'ı ayrı olmalı.** Otelin ağında (Wi‑Fi, kablo) bağlantı şifrelenmez: aynı ağdaki biri gidip gelen
  bilgileri görebilir. Bu yüzden Bismuth varsayılan olarak yalnız **bu bilgisayardan** ve **özel ağdan (NetBird)**
  bağlantı kabul eder; NetBird bağlantıyı kendisi şifreler. Resepsiyon telefonları otelin Wi‑Fi'ından bağlanacaksa
  önce modemde misafirler için **ayrı bir "misafir ağı"** açın (misafirlerin şifresi otelin kendi ağının şifresinden
  farklı olsun), sonra **Ayarlar → Uzaktan erişim → "Otelin ağından bağlantı"**yı açın. Bismuth açarken bunu bir kez
  daha sorar. Emin değilseniz kapalı bırakın; telefonlar NetBird ile otelin içinden de bağlanır.
- **Otelin ağında bağlantı şifresiz; kimlik denetimi araya girmeyi durdurmaz.** Aşağıdaki kimlik denetimi, otelin
  ağında kendini ana bilgisayar gibi gösteren *başka* bir bilgisayarı durdurur. Ama ağdaki biri gerçek ana bilgisayarla
  sizin aranıza girip konuşmayı olduğu gibi aktarırsa (ortadaki adam), kimlik doğru görünür ve şifre, oturum ve kopya
  izni açık metin gider. Bismuth'tan Bismuth'a bağlantıya ayrıca şifreleme (TLS) eklenmedi (varsayılan): özel ağ
  (NetBird/WireGuard) zaten şifreler ve otelin ağı isteğe bağlıdır. **Mümkünse özel ağ (NetBird) adresini kullanın**;
  Mac'i ve telefonları otelin ağından bağlamak gerekmiyorsa "Otelin ağından bağlantı"yı kapalı bırakın.
- **Ana bilgisayarın kimliği (ilk bağlantıda güven):** Mac ilk bağlandığı ana bilgisayarın kimliğini sorgusuz
  saklar — bu ilk bağlantıyı mümkünse özel ağdan yapın ve gösterilen kimliği otel bilgisayarının Ayarlar → Uzaktan
  erişim ekranındakiyle karşılaştırın. Kimlik özelliğinden önce kurulmuş Mac'ler de bir sonraki bağlantıda o anki
  kimliği aynı biçimde saklar. Sonra aynı adreste başka bir bilgisayar (örn. otelin ağına bağlanmış birinin
  bilgisayarı) cevap verirse Mac bağlanmaz, şifre göndermez ve uyarır. Yalnız devraldıysanız ya da otel bilgisayarını
  yeniden kurduysanız **Yeni kimliği kabul et**'e basın; önce yeni kimliği otel bilgisayarının ekranındakiyle
  karşılaştırın. Bismuth yalnız ekranda gösterdiği kimliği kabul eder: o arada başka bir kimlik cevap verirse kabul
  edilmez ve yeni kimlik gösterilir.
- Otelin ağından bağlantı kapalıyken Bismuth otelin Wi‑Fi'ına kendini duyurmaz (listede görünmez); açıkken duyuruda
  program sürümü yer almaz.
- 100.x ile başlayan bir adres NetBird ya da Tailscale'e ait değilse (bazı internet sağlayıcıları müşterilerine aynı
  aralıktan adres verir) Bismuth o adresi dinlemez ve Ayarlar'da uyarır.
- Oturum çerezleri tarayıcıdaki kodlar tarafından okunamaz; başka bir site Bismuth adına istek gönderemez.
- Ağdan (telefon, Mac) yalnız **kullanıcı adı ve şifreyle** oturum açılır; PIN yalnız otel bilgisayarının penceresinde
  çalışır. Çok sayıda yanlış deneme yapılırsa giriş birkaç dakika durur; ağdan 5 yanlış şifreden sonra **uzaktan giriş**
  15 dakika kilitlenir. Bu kilit otel bilgisayarındaki pencereyi etkilemez: ağdaki biri resepsiyonu kilitleyemez.
- **Bismuth anahtarını gösterme, girme ve değiştirme**, anahtarla **geri yükleme** ve **Drive klasörünü seçme** yalnız
  otel bilgisayarındaki program penceresinden yapılır; telefondan ya da Mac'ten yapılamaz.
- Geri yükleme yeni bir dönem açar: Mac'teki yedek kopya ve Drive kutusu geri yüklenen kayıtların tam kopyasıyla
  yeniden başlar (eski kopya yeni kayıtlarla karışmaz).
- Kaybolan bir telefonu **Ayarlar → Uzaktan erişim → Bağlı cihazlar → Cihazı çıkar** ile hemen kapatın.
- **Roller:** her rol için "Uzaktan oturum açma" seçilir: *Her yerden*, *Yalnız otelin ağından* (örn. Temizlik:
  yalnız otelin Wi‑Fi'ından) ya da *Kapalı*. Telefon ve diğer bilgisayarlardaki oturum süresi Ayarlar → Uzaktan
  erişim → "Uzaktan oturum süresi"nden seçilir.
- Bilgisayarların disklerini şifreleyin: otel bilgisayarında **BitLocker** (ya da "Cihaz şifreleme"), Mac'te
  **FileVault**. Mac'teki yedek kopya kayıtların tamamını içerir; Mac'inizin kendi oturum şifresi olsun. Yedek kopya
  açıkken (otel bilgisayarına ulaşılamadığında) Bismuth şifre sormadan, kopyayı başlatan kişinin yetkileriyle ve yalnız
  okunur olarak açılır.
- Drive'a giden her dosya (yedek, kutu) Bismuth anahtarıyla şifrelidir (AES‑256‑GCM). Kutuya kimlik numaraları
  konmaz (varsayılan). PDF özette misafir adı, not, kimlik numarası yoktur.
- Mac'teki kopyayı durdurmak için: otel bilgisayarında Ayarlar → Uzaktan erişim → Bağlı cihazlar → Mac'i **Cihazı
  çıkar**. Kimlik numaralarını kopyaya yalnız kimlik görme yetkisi olan rol alır; şifre özetleri hiçbir zaman gitmez.

## Sorun giderme

| Ne görüyorsunuz | Ne yapın |
|---|---|
| "Ana bilgisayara ulaşılamıyor" | Otel bilgisayarı açık mı, uykuda mı? Dışarıdaysanız NetBird iki tarafta da açık mı? Ekran birkaç saniyede bir kendisi yeniden dener. |
| Bağlantı ekranında listede ana bilgisayar yok | Aynı Wi‑Fi'da olduğunuzdan emin olun ya da adresi elle yazın (Ayarlar → Uzaktan erişim'de yazar). |
| "Bismuth sürümleri farklı" | İki bilgisayardaki Bismuth'u aynı sürüme getirin. O zamana kadar "Tarayıcıda aç" ile ana bilgisayarı tarayıcıda kullanabilirsiniz. |
| "Port kullanımda" | Ayarlar → Uzaktan erişim → Bağlantı noktası'nda başka bir numara (örn. 7374) seçip kaydedin; diğer cihazlarda yeni adresi kullanın. |
| Telefon otel Wi‑Fi'ında açılıyor ama dışarıda açılmıyor | Telefonda NetBird açık mı? "Dışarıdan (NetBird)" adresini kullandığınızdan emin olun. |
| "Bu hesap yalnız otelin ağından kullanılabilir" | Rolün uzaktan oturum açma seçeneği "Yalnız otelin ağından". Gerekirse otel sahibi Ayarlar → Roller'den değiştirir. |
| "Ana bilgisayar otelin Wi‑Fi'ından gelen bağlantıları kabul etmiyor" | "Otelin ağından bağlantı" kapalı (varsayılan). NetBird ile bağlanın ya da misafir ağını ayırdıktan sonra otel bilgisayarında açın (bkz. Güvenlik). |
| "Ana bilgisayarın kimliği değişti" | Aynı adreste başka bir bilgisayar cevap veriyor. Devraldıysanız ya da otel bilgisayarını yeniden kurduysanız kimlikleri karşılaştırıp kabul edin; yoksa kabul etmeyin ve otelin ağını kontrol edin. |
| "PIN yalnız otel bilgisayarında kullanılır" | Telefonda ve Mac'te kullanıcı adınız ve şifrenizle oturum açın. |
| Windows güvenlik duvarı uyarısı | "Özel ağlar" için izin verin; "Ortak ağlar"ı işaretlemeyin. |
| Mac'te hem NetBird hem Tailscale var, bağlanmıyor | İkisi aynı adres aralığını kullanır. Bismuth'u kullanırken diğerini kapatın ya da NetBird panelinden ağ aralığını değiştirin. |
| iPhone'da NetBird açılınca başka bir VPN kapanıyor | iPhone aynı anda tek VPN çalıştırır; Bismuth için NetBird'ü açın. |
| Mac'te "Henüz yedek kopya yok" | Otel sahibi (ya da uzaktan erişim ayarlarını görebilen biri) bu Mac'te bir kez oturum açmalı. |
| "Drive'da Bismuth klasörü bulunamadı" (Mac) | Paylaşılan `Bismuth` klasörünü Drive'ım'a kısayol olarak ekleyin ya da **Klasör seç** ile gösterin. |
| "Kutudaki dosyalar bu anahtarla açılmıyor" | Kâğıttaki anahtarı yeniden girin; otel bilgisayarında başka bir anahtar oluşturulmuş olabilir. |
| "Bazı dosyalar henüz tam eşitlenmedi" | Drive eşitlemesi sürüyor; Bismuth yarım dosyayı kullanmaz, birkaç dakika sonra kendisi dener. |
| "Bismuth'u güncelleyin" (yedek kopya) | Mac'teki ve otel bilgisayarındaki Bismuth'u aynı sürüme getirin; o zamana kadar kopya eski hâliyle gösterilir. |
| Otel bilgisayarında "Bismuth anahtarı yok" (kutu kartı) | Ayarlar → Yedek → **Anahtarı göster** ile oluşturup yazdırın. |
| Eski otel bilgisayarında "artık ana bilgisayar değil" | Başka bir bilgisayar devraldı. Çakışan kayıtları kaydedip **Yeni ana bilgisayara bağlan**'ı seçin. |

## Notlar (geliştirici için)

- Sunucu modu: `src/main/server/` (Hono; yalnız bu bilgisayar + özel ağ (NetBird/Tailscale arayüzleri), yerel ağ
  yalnız `host.listenLan` açıkken; 8 MB istek sınırı, hız sınırı, Origin/JSON denetimi, HttpOnly + SameSite=Strict
  çerez; ana bilgisayar kimliği `host-identity.ts`: sunucu sırrından Ed25519, `remote.hello` nonce imzası, istemcide
  TOFU), duyuru `src/main/discovery/` (`_bismuth._tcp`), istemci modu dosyası
  `userData/connection.json` (istemci otel veritabanını açmaz).
- Değişiklik günlüğü (`change_log`, tetikleyiciler şemadan açılışta üretilir: `src/main/replica/triggers.ts`), yedek
  kopya `userData/replica/replica.db` (ayrı dosya; `src/main/replica/store.ts`), canlı akış `GET /api/replica/changes`
  (SSE) ve `/api/replica/snapshot` (kopya izni ya da `remote.settings` oturumu), kutu `.bmr` biçimi
  `src/main/relay/format.ts` (gzip + AES‑256‑GCM, HKDF ile dosya anahtarı, başlık AAD), devral
  `src/main/replica/takeover.ts` + `src/main/relay/epoch.ts`, PDF özet `src/main/relay/summary.ts`.
- Kurulum programı güvenlik duvarı kuralını `build/installer.nsh` ile eklemeye çalışır; macOS izin metni
  `electron-builder.yml` → `mac.extendInfo`.
- Resimler (ekran görüntüleri) sahibin gerçek denemesinde çekilip eklenecek (Faz 13 kabul ölçütü: teknik olmayan biri
  kılavuzu izleyerek kurar, süre kaydedilir).
