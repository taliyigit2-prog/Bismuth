# Bismuth — Kurulum Rehberi (Basit)

> Tek sayfa. Teknik bilgi gerekmez. **Taslak (2026-11-12):** sihirbaz adım adları ve uyarı metinleri gerçek Windows ve Mac
> makinede henüz doğrulanmadı (S-80); doğrulanınca bu not silinir. Ayrıntılı anlatım: `docs/kurulum.md`. Kamera bileşeni (isteğe bağlı) için §5.

## 1. İndir

1. Tarayıcıda proje sayfasına gidin → **Releases** → en üstteki sürüm.
2. Windows için **`Bismuth-Setup.exe`**, Mac için **`Bismuth.dmg`** (Apple M1/M2/M3) ya da **`Bismuth-Intel.dmg`** (eski Intel Mac) dosyasını indirin.

## 2. Kur (çift tıkla)

**Windows**
1. İndirilen `Bismuth-Setup.exe` dosyasına çift tıklayın.
2. Mavi "Windows bilgisayarınızı korudu" penceresi çıkarsa: **Ek bilgi** → **Yine de çalıştır**. Bu uyarı programın
   imzasız olmasından kaynaklanır; bir kez çıkar.
3. **İleri → Kur → Bitir.** Masaüstüne "Bismuth" simgesi gelir.

**Mac**
1. `Bismuth.dmg` dosyasını açın, **Bismuth** simgesini **Uygulamalar** klasörüne sürükleyin.
2. İlk açılışta "açılamadı" uyarısında **Bitti**'ye basın (Çöp'e taşımayın).
3. **Sistem Ayarları → Gizlilik ve Güvenlik** → en altta "Bismuth engellendi" satırında **Yine de Aç** → **Aç**.

## 3. İlk açılış (kurulum sihirbazı, 5 dakika)

1. Dil seçin (Türkçe / English / Русский).
2. **Çalışma modu:** otel bilgisayarında **"Bu bilgisayar ana bilgisayar"**; evdeki Mac'te **"Başka bilgisayara bağlan"**.
3. Otel adı, şehir, para birimi, giriş/çıkış saati.
4. Odaları yazın (numara, tip, yatak sayısı). Sonradan değiştirilebilir.
5. Sahip hesabı: kullanıcı adı + şifre. **Kurtarma kodlarını** ekrana geldiğinde kâğıda yazın ve kasada saklayın.
6. Yedek: **Bismuth anahtarı** ekrana gelir; onu da aynı kâğıda yazın. Bu anahtar olmadan şifreli yedek açılamaz.
7. Bitti → Takvim açılır.

## 4. Yedek (kendiliğinden çalışır)

- Program her gece yedeğini kendi klasörüne alır; **Ayarlar → Yedek** ekranında "Son yedek: bugün" yazısını görün.
- Google Drive masaüstü uygulaması kuruluysa yedeğin şifreli kopyası `Drive'ım/Bismuth/yedekler` klasörüne de yazılır.
  Ayarlar → Yedek → "Drive klasörü" alanından seçin.
- Yeni sürüm kurmadan önce **Ayarlar → Yedek → Şimdi yedekle** düğmesine basın.

## 5. Kamera bileşeni (isteğe bağlı; henüz ürünün parçası değil)

Bugün kamera sistemi ayrı bir Python programıdır (`otel-kamera/`), teknik kurulum ister (Python 3.12, internet, `.bat`
dosyaları) ve lisans/KVKK nedenleriyle satışa uygun değildir. Bismuth'un içine sekme olarak alınması planlanmıştır
(`docs/analiz/06-kamera-entegrasyonu.md`). O sürüm çıkana kadar kamera kurulumu için geliştiriciyle görüşün.

## 6. Sorun giderme (en sık üç durum)

| Belirti | Ne yapmalı |
|---|---|
| Windows'ta "Yine de çalıştır" düğmesi görünmüyor | Önce **Ek bilgi** yazısına tıklayın; düğme altında çıkar |
| Mac'te "Yine de Aç" görünmüyor | Uygulamayı bir kez daha açmayı deneyin, sonra Sistem Ayarları → Gizlilik ve Güvenlik'e bakın (satır bir saat kadar görünür) |
| Program açılmıyor / "veritabanı" hatası | Bilgisayarı yeniden başlatın. Olmazsa Ayarlar → Yedek → **Geri yükle** ile dünkü yedeği seçin. Yine olmazsa geliştiriciye yazın; **dosya silmeyin** |

Verileriniz: Windows `C:\Users\<ad>\AppData\Roaming\Bismuth`, Mac `~/Library/Application Support/Bismuth`. Bu klasörü
elle değiştirmeyin; yedek ve geri yükleme programın içinden yapılır.
