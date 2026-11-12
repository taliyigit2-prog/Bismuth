# Faz 11 · Döviz (Piyasa Orta Kur), Hava Durumu, Bayram Çevrimiçi Doğrulama

**Amaç:** Kapıdan giren misafire "2.500 TL kaç dolar/euro?" sorusunu **piyasa orta kuruyla** (Google'ın gösterdiği gibi)
anında cevaplamak; raporlar için günlük kur; **otelin şehri için hava durumu** (Bugün ekranında); bayram listesinin yıllık
çevrimiçi kontrolü. Hepsi internet varken kendini günceller, yokken son veriyle çalışır.

**Gereksinimler:** G-110 … G-113, G-16, G-02, G-70.
**Ön koşul:** Faz 7 (kur tablosu kullanılıyor), Faz 9 (takvim üretimi, Bugün ekranı).
**Sorular:** yok — S-41 (altın yok), S-90 (simgeli, mm), S-19 (haftalık) cevaplandı.
**Referans:** Faz 0 canlı doğrulama raporu (`04-arastirma/canli-dogrulama.md`), `04-arastirma/fx-uzaktan-erisim.md` A–B, `04-arastirma/repo-alan-tr-hava.md` (hava), K-04, K-06, K-13.

## Teslimatlar

1. **Kur kaynak adaptörleri** (`src/main/network/fx/`): her kaynak için `fetch → zod doğrula → normalize (orta kur, micro tam sayı) → fx_rates`. Sıra Faz 0 ölçümüne göre (Google'a en yakın + en kararlı önce); anahtarsız orta kur kaynakları + isteğe bağlı kullanıcı anahtarlı sağlayıcılar (Open Exchange Rates, currencyapi, currencylayer); TCMB yalnızca karşılaştırma satırı. Kaynak sırası ayardan; şema uyuşmazlığında kaynak 24 saat devre dışı; 5 sn zaman aşımı; eskime rozeti (6 saat / 48 saat).
2. **Yenileme**: açılışta ve her `fx.refreshMinutes` (30) dakikada; çok cihaz mimarisinde tek yerden yenilenir (K-19 kararına göre); "şimdi güncelle".
3. **Döviz sekmesi**: kur kartları (USD, EUR, GBP, RUB + ayarlanabilir; orta kur, günlük değişim oku, 30 günlük mini grafik, son güncelleme, kaynak adı); **çevirici**: tutar + birim → tüm birimler, yuvarlama ayarı, kopyala; "misafire göster" (büyük yazı); **altın yok** (S-41); TCMB karşılaştırma satırı (kapatılabilir). Alış/satış görünümü **yok** (sahip, v3).
4. **Otel kuru**: sahibin belirlediği sabit kur (örn. 1 € = 50 TL) ve "misafire bu kurdan söyle" anahtarı.
5. **Kayıt ve rapor entegrasyonu**: ödeme/gider kaydedilirken **o dakikanın kuru** dondurulur (`fx_rate_at`; tutar/birim değişince yeniden; S-32); otel kuru isteğe bağlı; kur yoksa son bilinen kur + işaret; raporda kur kaynağı etiketlenir.
6. **Hava durumu** (G-113, sahip açıkça istedi):
   - Adaptörler (`src/main/network/weather/`): **MET Norway Locationforecast** birincil (User‑Agent'ta otel e‑postası, `Expires`/`If-Modified-Since` uyumu; ticari kullanım serbest); Open‑Meteo yalnız sahip açarsa (varsayılan kapalı; ücretsiz katman ticari değil); isteğe bağlı kullanıcı anahtarlı sağlayıcı (K-13).
   - Konum: kurulum sihirbazındaki şehir → koordinat (paket içi şehir listesi; elle enlem/boylam).
   - Gösterim (S-19, S-90): **Bugün ekranında kart** (büyük durum simgesi — güneş, bulut, **yağmurlu bulut**, kar, fırtına…; şimdiki sıcaklık; bugün en düşük/en yüksek; "yağmur bekleniyor · 2 mm"; rüzgâr) + **haftalık şerit** (7 gün × simge, en yüksek/en düşük, mm) + Döviz yanındaki **Hava** sekmesinde saatlik ayrıntı; yağış yüzdesi yok; mobil görünümde Bugün'ün üstünde.
   - Önbellek: 60 dk; çevrimdışıyken son veri + "X saat önce" rozeti; hiç veri yoksa kart gizlenir.
   - Simgeler paket içi: **Yr hava simgeleri** (MET `symbol_code` ile birebir, gündüz/gece; CC BY 4.0) — atıf Hakkında + kart altında küçük yazı: "Veri: MET Norway · Simgeler: Yr/NRK" (`canli-dogrulama.md` §2).
7. **Bayram çevrimiçi doğrulama** (K-04): yılda bir (ya da düğmeyle) Faz 0'da seçilen kaynaktan o yılın listesini çek → yalnızca `source=generated` satırları güncelle; farkları göster; kullanıcı satırlarına dokunma.
8. **Ağ politikası**: tüm istekler `src/main/network/` üzerinden; izinli alan adı listesi; `network.enabled=false` → sıfır istek (test: istek sayacı).
9. **Hakkında → gizlilik metni** (`about.privacy`, üç dil): Faz 1'deki "internete veri göndermez" cümlesi, isteğe bağlı kur/hava/bayram isteklerini (veri göndermeyen, kapatılabilir okumalar) anlatacak biçimde yeniden yazılır; Faz 13'te istemci modu ve şifreli Drive kutusu için bir kez daha.

## Kabul ölçütleri

- [x] İnternet kapalıyken döviz sekmesi son kurla çevirir, rozet "son güncelleme: …"; hava kartı son veriyi saatiyle gösterir; hata penceresi yok.
- [x] Faz 0'da doğrulanan en az iki orta kur kaynağı çalışır; biri bozuk JSON dönünce zincir devam eder ve kaynak 24 saat devre dışı kalır (test: sahte sunucu).
- [x] 2.500 TL → USD/EUR/GBP/RUB çevrimi doğru (birim test, micro tam sayı); orta kur Faz 0 kıyas toleransı içinde Google'a yakın.
- [x] Hava: İstanbul için Bugün kartı ve **haftalık simgeli** tahmin; her MET `symbol_code` bir simgeye eşlenir (eksiksiz eşleme testi); birincil kaynak düşünce son veri + saat (yedek açıksa yedek); şehir değişince koordinat ve veri değişir.
- [x] Bayram doğrulama: sahte kaynakla farklı tarih dönünce yalnızca `generated` satır değişir, `user` satır korunur.
- [x] "Dış veri kullanma" açıkken uygulama hiçbir ağ isteği yapmaz.

## Sonuç (P11, 2026-10-05)

**Yapılan** (K-39: sahibe soru yok; cevapsız noktalar "(varsayılan)"):

- **Ağ kapısı** `src/main/network/http.ts`: yalnız GET + HTTPS, izinli alan adı listesi (kur, TCMB, anahtarlı kur sağlayıcıları, MET, Open‑Meteo, Google takvim, Nager.Date), 5 sn zaman aşımı, yönlendirme yalnız izinli alana, 2 MB sınırı, `network.enabled=false` → istek yok (istek sayacı testli). Geliştirme/e2e için yalnız paketlenmemiş sürümde `BISMUTH_EXTERNAL_ORIGIN` sahte sunucuya yönlendirir; e2e ve ui:shot varsayılanı kapalı bir yerel port (testler internete çıkmaz).
- **Kur zinciri** (`network/fx/`): Truncgil v4 → (anahtar varsa) Open Exchange Rates / currencyapi / currencylayer → fawazahmed0 (jsDelivr, pages.dev) → open.er-api → exchangerate-api v4 → Frankfurter; zod doğrulama, şema bozulunca 24 saat dinlenme, ulaşılamayan kaynak dinlenmez, eksik birim (Frankfurter'de RUB) sonraki kaynaktan. Micro tam sayı, çapraz kur ana birime. Kaynak sırası `fx.sources` ayarı. TCMB `today.xml` yalnız karşılaştırma satırı (TRY otelinde, 3 saatte bir). Anahtarlar ana süreçteki önbellek dosyasında, ekrana gitmez.
- **Yenileme** (`services/external-service.ts`): otel bilgisayarında (istemci modunda değil, K-19) açılışta + `fx.refreshMinutes` (30); hava 60 dk + 0–10 dk rastgele, `Expires`/`If-Modified-Since`; bayram denetimi yılda bir (bu yıl + gelecek yıl). Kurulum bitmeden hiç istek yok. Ayar değişince (ağ açıldı, şehir, birimler) hemen yenilenir.
- **"Şu anın kuru"**: `currency-service.ts` → `freezeNow(db, money, target, now)` (P5b ödemeler, P7 giderler çağıracak). `freezeAt` artık otel kurunu yalnız yürürlükteyken (`fx.hotelRates` + "misafire bu kurdan söyle") kullanır; değilse en yeni piyasa/düzeltme kuru (eski bir elle düzeltme yeni piyasa kurunu ezmez). Kur yoksa son bilinen kur + `stale` işareti.
- **Otel kuru**: `fx.setHotelRate` (döviz düzenleme yetkisi; geçmiş satırı + `fx.hotelRates` ayarı, audit), "Piyasa kuruna dön", "Misafire bu kurdan söyle" anahtarı.
- **Döviz ekranı** (`features/currency`): sekmeler Döviz · Hava durumu · Bayramlar (`?tab=`); kur kartları (USD, EUR, GBP, RUB + otelin kabul ettiği diğer birimler), kaynak adı + saat, düne göre değişim, 30 günlük mini grafik (tablo görünümü: son 7 gün), 6/48 saat eskime rozeti, TCMB satırı (gizlenebilir), çevirici (2.500 TL ile açılır, yuvarlama ayarı, kopyala, misafire göster), kur kaynakları penceresi (durum + anahtar), "İnternetten güncelle" anahtarı (`network.enabled`, hepsini kapatır). Telefonda çevirici üstte.
- **Hava**: MET Norway birincil, Open‑Meteo yalnız sahip açarsa (varsayılan kapalı); konum paket içi şehir listesinden (81 il + İstanbul ilçeleri + tatil beldeleri) ya da elle enlem/boylam; Bugün kartı (`features/today/weather-card.tsx`, kendi verisini okur, veri yoksa hiç görünmez, telefonda en üstte) + Hava sekmesinde saatlik ayrıntı. 83 MET `symbol_code` için Yr simgesi paket içinde (eksiksiz eşleme testi). Atıf kartın altında ve Hakkında'da.
- **Bayram doğrulama** (`services/calendar/holiday-check.ts`): Google TR ICS (yedek Nager.Date); yalnız program satırları (`generated`/`verified`) bütün grup olarak kayar ve `verified` olur, "kesin değil" → tahmini kalır; kullanıcı satırı olan grupta yalnız fark gösterilir. `calendar-service` yeniden üretimi doğrulanmış grubu bütünüyle korur (eski günler geri gelmez).
- **Hakkında**: `about.privacy` üç dilde yeniden yazıldı; atıf satırı eklendi.

**Varsayılanlar / sınırlar**
- Hava için kullanıcı anahtarlı sağlayıcı (Visual Crossing) yazılmadı; birincil MET + isteğe bağlı Open‑Meteo var. (varsayılan)
- MET User‑Agent'ta otel e‑postası yerine proje adresi: kurulumda otel e‑postası alanı yok. (varsayılan)
- Raporlarda kur kaynağı etiketi Faz 10'un (P10) işi; ödeme/gider ekranlarında "kur eski" işareti P5b/P7'nin (veri `freezeNow` dönüşünde `stale`).
- Bayram denetimi düğmesi şimdilik Döviz ekranının "Bayramlar" sekmesinde (takvim notları ekranı P9c'nin).
- Önbellek (kaynak sağlığı, hava, anahtarlar, son denetim) veri klasöründe `external-data.json`; yeni migrasyon gerekmedi.

**Sahip onay paketine**: Hava kartı ve Döviz ekranının görünümü; Open‑Meteo'yu açma kararı (ticari olmayan ücretsiz plan).

### Hata avı düzeltmeleri (P14fix, 2026-10-05)

Bulgu → test (kırmızı yazılıp düzeltildi):

- #9 iptal edilen bayram günü kullanıcı düzenlemesi sayılır; grup kaymaz → `holiday-check.test.ts` "kullanıcının iptal
  ettiği bayram günü de kullanıcı düzenlemesidir…".
- #11 `fx.hotelRates` genel ayar yazımıyla değiştirilemez (`errors.settingServiceOnly`); tek kaynak `fx.setHotelRate` →
  `settings-service.test.ts` "otel kuru genel ayar yazımıyla değişmez…".
- #13 yıllık bayram denetimi `calendar_generation.verified_at`'e (bu yıl + gelecek yıl) göre karar verir; önbellek dosyası
  değil → `external-service.test.ts` "eski bir yedek geri yüklenince … denetim bu yıl yeniden yapılır".
- #14 otelin günü (`hotel.timezone`): denetimin yılı → `external-service.test.ts` "yıl otelin saat diliminden alınır…";
  kur geçmişinde "Bugün" (`FxOverview.today`) → `currency-page.test.tsx` "kur geçmişinde "Bugün" otelin gününe göredir…"
  (içe/dışa aktarma kısmı Faz 14 notunda).
- #19 günlük kaynağın kuru kendi tarihiyle saklanır (fawaz/Frankfurter `date`, open-er-api, exchangerate-api,
  OXR/currencylayer `timestamp`, currencyapi `last_updated_at`; Truncgil canlı) → `network.test.ts` "günlük kaynağın kendi
  tarihi kurla birlikte gelir…", `external-service.test.ts` "günlük kaynağın kuru kendi tarihiyle saklanır…".
- #20 kur sağlayıcı anahtarları `external-data.json`'da Bismuth anahtarıyla (AES-256-GCM; anahtar işletim sisteminin
  deposunda) şifreli; eski düz dosya okunur ve ilk yazışta şifrelenir; anahtar saklanamayan bilgisayarda eskisi gibi →
  `network.test.ts` "kur sağlayıcı anahtarları dosyada şifreli durur…". (varsayılan) Ayrı `safeStorage` girişi yerine
  Bismuth anahtarı kullanıldı (ana süreç dosyasına dokunmadan); anahtar ilk API anahtarı kaydedilince oluşur.

## Son kontrol düzeltmesi (QA-1, QA1c; 2026-10-05)

- **Teslimat 5 "raporda kur kaynağı etiketlenir"** tamamlandı: Raporlar → Özet ve Giderler sekmeleri ile Ay sonu
  kontrolünde **Kur kaynakları** kartı (özet satırı: "Bu dönemde N dövizli kayıt var…" + kaynak başına kayıt sayısı;
  tablo: kayıt türü · para birimi · kur kaynağı (piyasa orta kuru + sağlayıcı adı / otel kuru / elle girilen kur / kur
  yok) · kayıt sayısı · tutar · ana para birimi karşılığı). Excel'de "Kur kaynakları" sayfası (aylık özet, gider, ay
  sonu; sağlayıcı ayrı sütun). Kaynak ödemenin/giderin `fx_source` sütunundan, sağlayıcı aynı anda gözlenen kur
  satırından okunur. K-42: kullanıcının göremediği gider bölümünün satırları sayılmaz. Testler:
  `reports-qa1.test.ts` ("dövizli satırlar kaynağa göre sayılır…", "K-42: yöneticiye gizli bölümdeki dövizli gider…",
  "Excel: "Kur kaynakları" sayfası…"), `report-cards.test.tsx` ("özet sekmesi dövizli kayıtların kaynağını özetler…",
  "gider sekmesi yalnız giderlerin…", "ay sonu kontrolü aynı kur kaynaklarını gösterir").
- **K-13 MET User-Agent**: `metUserAgent(sürüm, e-posta)` otelin e-postası verilince `Bismuth/<sürüm> <e-posta>`,
  yoksa ya da geçersizse proje adresi (`providers.test.ts`). Otelde e-posta ayarı henüz yok; ayar + Ayarlar → Otel
  alanı + `external-service.ts`'te tek satır aktarım ana oturum kararına bırakıldı (ağ modülü ayar okumaz).
- Para kuralı: Döviz çeviricisinin yuvarlaması `money.ts` → `roundToUnit` (davranış aynı; `money.test.ts`
  "tam birime yuvarlar…", `currency-page.test.tsx` yuvarlama testleri değişmeden geçer).
