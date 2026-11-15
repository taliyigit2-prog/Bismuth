# Bismuth — Kurulum Rehberi (Basit)

> Tek sayfa. Teknik bilgi gerekmez, terminal komutu yazmazsınız. Windows ve Mac uyarı pencerelerinin yazıları sürümden
> sürüme biraz değişir; sıra aynıdır. Ayrıntılı anlatım: [`kurulum.md`](kurulum.md). Programın içinde: **Ayarlar → Kılavuz →
> Kurulum ve yeni sürüm**.

## 1. İndir

Bilgisayarınıza uyan bağlantıya tıklayın; dosya hemen iner (GitHub hesabı gerekmez). Bağlantılar hep **en yeni sürümü** indirir.

| Bilgisayar | Tıklayın |
|---|---|
| **Windows 10 / 11** (otel bilgisayarı) | [Bismuth-Setup.exe](https://github.com/taliyigit2-prog/Bismuth/releases/latest/download/Bismuth-Setup.exe) |
| Mac, Apple çipli (M1, M2, M3, M4) | [Bismuth.dmg](https://github.com/taliyigit2-prog/Bismuth/releases/latest/download/Bismuth.dmg) |
| Mac, Intel işlemcili | [Bismuth-Intel.dmg](https://github.com/taliyigit2-prog/Bismuth/releases/latest/download/Bismuth-Intel.dmg) |
| Windows, ARM işlemcili (az rastlanır) | [Bismuth-Setup-arm64.exe](https://github.com/taliyigit2-prog/Bismuth/releases/latest/download/Bismuth-Setup-arm64.exe) |

Hangisi olduğunu bilmiyorsanız: Windows'ta ilk satır neredeyse her zaman doğrudur. Mac'te sol üstteki Apple simgesi →
**Bu Mac Hakkında**: "Çip: Apple M…" yazıyorsa ikinci, "İşlemci: Intel" yazıyorsa üçüncü satır.
İndirilen dosya **İndirilenler** (Downloads) klasöründedir.

## 2. Kur (çift tıkla)

**Windows**
1. İndirilen `Bismuth-Setup.exe` dosyasına çift tıklayın.
2. Mavi "Windows bilgisayarınızı korudu" penceresi çıkarsa: **Ek bilgi** → **Yine de çalıştır**. Bu uyarı programın
   imzasız olmasından kaynaklanır; bir kez çıkar.
3. **İleri → Kur → Bitir.** Masaüstüne "Bismuth" simgesi gelir.

> **Kuran kullanıcıyla açın.** Otelin ortak bilgisayarında hangi Windows kullanıcısıyla kurduysanız Bismuth'u her gün **o
> kullanıcıyla** açın; başka bir kullanıcıyla açılırsa program boş görünür. Kayıtlar kuran kullanıcının klasöründedir.

**Mac**
1. `.dmg` dosyasını açın, **Bismuth** simgesini **Uygulamalar** klasörüne sürükleyin.
2. İlk açılışta "açılamadı" uyarısında **Bitti**'ye basın (Çöp'e taşımayın).
3. **Sistem Ayarları → Gizlilik ve Güvenlik** → en altta "Bismuth engellendi" satırında **Yine de aç** → **Aç**.

## 3. İlk açılış (kurulum sihirbazı, 10–15 dakika)

1. Dil seçin (Türkçe / English / Русский).
2. **Çalışma şekli:** otel bilgisayarında **Tek bilgisayar** ya da **Otelin ana bilgisayarı**; Mac'te ya da başka bir
   cihazda **Başka bir Bismuth'a bağlan**.
3. Otel adı, şehir, para birimi, giriş/çıkış saati.
4. Oda tipleri ve odalar (numara, tip, yatak sayısı). Sonradan değiştirilebilir.
5. Sahip hesabı: kullanıcı adı + şifre.
6. **Kurulumu bitir**'e basın. Çıkan **Kâğıda yazın** ekranında **kurtarma kodları** ve **Bismuth anahtarı** birlikte
   görünür. **Yazdır**'a basıp kâğıdı kasada saklayın (ya da elle yazın), sonra **Kâğıda yazdım**'ı işaretleyin. Bu bilgiler
   bir daha otomatik gösterilmez; anahtar olmadan Drive'daki şifreli yedek açılamaz.
7. **Programa geç** → Takvim açılır.

## 4. Yedek (kendiliğinden çalışır)

- Program her gece yedeğini kendi klasörüne alır; **Ayarlar → Yedek** ekranında "Son yedek: bugün" yazısını görün.
- Google Drive masaüstü uygulaması kuruluysa yedeğin şifreli kopyası Drive'a da yazılır: **Ayarlar → Yedek → Drive
  klasörünü bul** düğmesine basın; bulamazsa **Klasör seç**.
- Yeni sürüm kurmadan önce **Ayarlar → Yedek → Şimdi yedek al** düğmesine basın.
- Telefondan ya da Mac'ten bağlanmak için: [`uzaktan-erisim.md`](uzaktan-erisim.md).

## 5. Kamera eki (isteğe bağlı; ayrı dosya)

Kamera, ana programa dahil değildir; büyük bir dosyadır (yaklaşık 0,7 GB, diskte 2 GB kadar yer tutar) ve herkese açık
sayfada durmaz. Yalnız kamera kullanacaksanız: **Bismuth-Kamera-Windows.zip** (Windows) ya da **Bismuth-Kamera-Mac.zip**
(Apple çipli Mac) dosyasını sahibin gizli **kamera** taslağından alıp (GitHub → Releases) bu bilgisayara getirin. Sihirbazın
Kamera adımında ya da Ayarlar → Kamera'da **Kamera ekini kur…** düğmesine basıp zip'i seçin; Bismuth eki kurar ve yeniden
başlar. Sonra kamerayı bağlamak için Ayarlar → Kamera → Yeniden tara'ya basın (ağdaki kameralar aranır).
Kurmazsanız Kamera ekranı, Ayarlar → Kamera ve sihirbazın Kamera adımı "Kamera eki kurulu değil" der; program başka her şeyde aynı çalışır. Intel Mac ve Windows ARM
için kamera eki yoktur. Ayrıntı: [`kurulum.md`](kurulum.md#kamera-eki). <!-- doğrula -->

## 6. Sorun giderme (en sık üç durum)

| Belirti | Ne yapmalı |
|---|---|
| Windows'ta "Yine de çalıştır" düğmesi görünmüyor | Önce **Ek bilgi** yazısına tıklayın; düğme altında çıkar |
| Mac'te "Yine de aç" görünmüyor | Uygulamayı **Uygulamalar** klasöründen bir kez daha açın, sonra Sistem Ayarları → Gizlilik ve Güvenlik'e bakın (satır bir saat kadar görünür). Olmazsa kuran kişiye ya da geliştiriciye haber verin |
| Program açılmıyor / "veri" hatası | Bilgisayarı yeniden başlatın. Olmazsa Ayarlar → Yedek → **Geri yükle** ile dünkü yedeği seçin. Yine olmazsa geliştiriciye yazın; **dosya silmeyin** |

Verileriniz: Windows `C:\Users\<ad>\AppData\Roaming\Bismuth`, Mac `~/Library/Application Support/Bismuth`. Bu klasörü
elle değiştirmeyin; yedek ve geri yükleme programın içinden yapılır.
