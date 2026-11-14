# 13 — Tauri kararı (sahibe tek sayfa)

> Hazırlayan: `rust-shell-builder` (P22c, 2026-11-14). Ayrıntı: `11-rust-gecisi.md` §8; prototip: `shell-tauri/`.
> Karar sizindir (K-62). Bu sayfa kararı vermez, rakamı ve riski gösterir.

## 1. Ne denedik

Programın penceresini Electron yerine **Tauri 2** (Rust, bilgisayarın kendi tarayıcı bileşenini kullanır) ile açtık.
Arayüz ve hesaplar (Node ile çalışan servisler) **aynı kaldı**; yalnızca "pencere kabuğu" değişti. Aynı veri (19 oda, yaklaşık
19.000 rezervasyon), aynı ölçüm betiği, üç koşunun ortası. Ölçüm bu Codespace'te (Linux, sanal ekran) yapıldı.

## 2. Rakamlar (Electron → Tauri)

| Ölçüt | Electron | Tauri | Sonuç |
|---|---:|---:|---|
| Boşta bellek (dürüst sayım) | 567 MB | 800 MB | **%41 daha çok** |
| Program açılıp kullanıma hazır | 2,57 sn | 2,57 sn | **fark yok** |
| Pencerenin görünmesi | 2,0 sn | 1,7 sn | %12 erken, ama içerik aynı anda hazır |
| Yoğun kullanımda işlemci (1 çekirdeğin %'si) | %27 | %78 | 2,8 kat |
| Boşta işlemci | %0,5 | %8,6 | daha çok |

## 3. K-62 kuralına göre öneri

Kural: **boşta bellekte ve açılışta en az %30 kazanç yoksa Electron kalır.** Bellekte kazanç yok (artış var), açılışta kazanç yok.
**Önerim: Electron'da kalın.** P22d (Tauri ürünleştirme) başlamasın.

Dürüst sınır: Otelin bilgisayarı Windows'ta başka bir tarayıcı bileşeni (WebView2) kullanır; onu burada ölçemedik. Linux'taki
bileşen (WebKit) bu arayüz için Chromium'dan iki kat ağır çıktı, bu yüzden Windows'ta sonuç daha iyi olabilir. Ama hesap şunu
söylüyor (tahmin, ölçüm değil): belleğin büyük kısmı bizim servislerden (yaklaşık 214 MB) ve arayüzden (yaklaşık 210 MB) geliyor;
ikisi de kabuk değişince küçülmüyor. Kabuğun kendi payı yalnızca yaklaşık 50–80 MB; en iyi ihtimalle **%9–14** kazanç, %30'a
ulaşmaz. Hafif mod (pencereyi kapatıp tarayıcıdan kullanmak) zaten **%32** kazandırıyor ve hazır (P22a).

## 4. Riskler (Tauri'ye geçilirse)

- **Windows 10'da internetsiz kurulum (S-121):** WebView2'nin çevrimdışı kurulumu pakete girer, kurulum dosyası yaklaşık
  102 MB'tan **~170–180 MB'a** çıkar (tahmin: Node ~40 MB sıkışık + WebView2 ~127 MB). Yapılandırma hazır (`offlineInstaller`),
  üretilmedi; sizin PC'nizde denenmeli.
- **Mac'te yazdırma ve tarih seçici (S-122, "kusursuz olmalı"):** Mac'te Tauri Safari motorunu (WKWebView) kullanır; Electron'daki
  Chromium'dan farklı davranabilir (yazdırma/PDF, tarih seçici, dosya indirme, sürükle-bırak). **Hiç denenmedi**; Mac "ikinci
  sınıf" olamayacağı için bu tek başına büyük bir risk. Linux'taki WebKit ölçümü Mac'i temsil etmez.
- **Bugünkü eksikler (prototipte yok):** ilk kurulum sihirbazı, güvenli anahtar saklama (safeStorage), Drive kutusu, PDF özeti,
  tepsi/hafif mod, bildirim, tek örnek kilidi, dosya diyalogları, kamera yan süreci. Bunların 14 dosyası Electron'a bağlı.
- **Test düzeni değişir:** Playwright `_electron` yerine `tauri-driver` + WebdriverIO; macOS'ta Tauri sürücüsü yok (yalnız tarayıcı e2e).
- **Ağ kuralı korunur:** kabuk yalnız `127.0.0.1` ile konuşur, arayüze hiçbir Tauri komutu açılmaz (prototipte böyle).

## 5. İş ve maliyet (P22d, yalnız "devam" derseniz)

Kart tahmini $80–160. Prototipin bulduğu eksiklerle gerçekçi aralık **$120–220** (yukarıdaki 14 Electron bağlı dosyanın karşılığı,
paketleme NSIS+DMG, yeni e2e düzeni, kurulum belgeleri, bildirimler). Servislerin Rust'a taşınması (P22e, belleği asıl düşüren iş)
ayrıca $100–200 ve yalnızca ölçülmüş darboğazda; K-62 tam yeniden yazımı reddediyor. P22d sonunda belleğin düşeceği garanti değil.

## 6. Sizden istenen (`❓ SORULARIM`)

1. **Electron'da kalalım mı** (önerim, P22d açılmaz), yoksa Windows'ta kendi PC'nizde bir deneme mi istiyorsunuz?
2. Deneme isterseniz (yarım saat): `shell-tauri/README.md` → Windows adımları; otel bilgisayarında `--perf-out` ölçümü
   (`docs/kurulum.md` "Teknik: bilgisayarı ne kadar yorduğunu ölçmek") ve hafif modun gerçek Windows tepsisinde denenmesi (P22a'dan
   bekleyen iş) daha ucuz ve daha kesin bilgi verir; onları **önce** yapmanızı öneririm.
3. Mac'te yazdırma/tarih seçici kusursuz olmalı kararı (S-122) Tauri'yi fiilen eler; cevabınız değişmediyse (kusursuz) Tauri için
   Mac denemesi şart.
