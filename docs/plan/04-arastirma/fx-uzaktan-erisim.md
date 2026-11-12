# Araştırma: Piyasa kuru, tatiller, uzaktan erişim (Bismuth)

Tarih: 2026-10-01. Hazırlayan: araştırma ajanı (planlama belgesi için ham malzeme; sahibe sunulacak metin Türkçe'ye uyarlanmalı).

**Doğrulama notu.** Oturumun çıkış vekili (egress proxy) canlı API uç noktalarının çoğunu engelledi
(truncgil, genelpara, open.er-api, jsdelivr, nager, calendar.google.com, tailscale.com, turso.tech, calendarific.com …).
GitHub README'leri ve npm kayıt defteri erişilebilirdi. Canlı doğrulanamayan her şey **"(doc, verify in Faz 0)"** ile işaretlidir;
Faz 0'da `scripts/probe-feeds.ts` benzeri tek seferlik bir betikle gerçek JSON örnekleri alınıp `docs/plan/` içine yapıştırılmalıdır.

npm'den doğrulanan sürümler (2026-10-01): `date-holidays 3.37.0` (2026-09-20), `hono 4.13.12`, `@hono/node-server 2.1.3`,
`bonjour-service 1.4.4`, `@libsql/client 0.18.0`, `@powersync/node 1.1.1`, `@vlcn.io/crsqlite 0.16.3` (son yayın **2024-01-17**),
`ws 8.22.0`, `fastify 5.12.5`.

---

## BÖLÜM A — TRY için PİYASA kuru (TCMB değil)

### A.0 Kavramlar (sahibe anlatmak için)

| Kavram | Ne | Kim kullanır |
|---|---|---|
| **TCMB gösterge kuru** | Her iş günü 10:00–15:00 arası saat başı bankalararası USD/TRY kotasyonlarının ortalaması → "orta değer"; alış/satış iskonto/prim ile türetilir; **15:30'da** ilan, ertesi gün Resmî Gazete. İşlem fiyatı değil, *gösterge*. Hafta sonu/tatil yok. | Vergi, muhasebe, sözleşme. |
| **Bankalararası / orta kur (mid-market)** | Alış ile satışın ortası; Google Finance / Bloomberg / XE'nin gösterdiği rakam. Gün içi saniye saniye değişir. | Google Sheets `GOOGLEFINANCE` (20 dk gecikmeli). |
| **Serbest piyasa (döviz bürosu / Kapalıçarşı) alış–satış** | Orta kurun etrafına büronun kâr marjı eklenmiş iki fiyat; müşterinin eline geçen gerçek fiyat. | Otelde nakit döviz alan resepsiyon. |

Neden TCMB "hep düşük"? (1) 15:30'da sabitlenir, piyasa akşam/hafta sonu hareket eder; (2) gösterge niteliğindedir, bürolar marj ekler;
(3) talep baskısı dönemlerinde (2021–23 gibi) bankadan bulunamayan döviz serbest piyasada daha pahalı olur → "ikili kur" (Mahfi Eğilmez'in Kapalıçarşı yazısı, KPMG ikili kur notu).
Sonuç: Google ≈ bankalararası orta kur; döviz bürosu satış = orta kur + marj; TCMB = dünkü/öğleden önceki ortalama.
Kaynaklar: TCMB "Gösterge Niteliğindeki Kurlar" sayfası, vergidosyasi.com (2021), fiyatdefteri.com rehberi, mahfiegilmez.com (2023-04).

### A.1 Türk serbest piyasa (alış/satış) kaynakları

| Kaynak | Uç nokta | Anahtar | Limit | Güncelleme | Alış/Satış | RUB | Gram altın | Kullanım şartı | Not |
|---|---|---|---|---|---|---|---|---|---|
| **Truncgil Finans v4** | `https://finans.truncgil.com/v4/today.json` (v3: `/v3/today.json`) | Yok | "Developer plan 100K istek/ay, kimlik doğrulama yok, standart HTTP cache" (arama özeti; **verify**) | Dakikalar içinde (`Meta_Data.Minutes_Ago`) | Evet | Evet (v1 listesinde "RUS RUBLESİ"; v3/v4'te `RUB` — verify) | Evet (`GRA`) | Sayfada "ücretsiz, geliştirici dostu"; ticari kullanım/atıf şartı bulunamadı → **Faz 0'da e-posta ile sorulmalı** | 2018'den beri yayında (truncgil.com.tr duyurusu); GNOME eklentisi, Excel dashboard, TSQ-Bot (2026-09-28 canlı doğrulanmış) gibi 3. taraf kullanımlar var. |
| **GenelPara** | `https://api.genelpara.com/embed/doviz.json` (ayrıca `https://api.genelpara.com/json/?list=doviz&sembol=USD,EUR,GBP,RUB`) | Yok | **1.000 istek/gün/IP**, 00:00'da sıfırlanır; >10.000/gün IP banı (Cloudflare) | Gün içi (dakika ölçeği; verify) | Evet (`alis`, `satis`, `degisim`) | Muhtemelen (verify) | Ayrı `altin.json` | "Ücretsiz" — ticari ayrım belirtilmemiş; **verify** | CORS yok → yalnızca main process'ten çağrılır (zaten kural). |
| **MehmetAkgul/currency-api-tr** (topluluk, jsDelivr) | `https://cdn.jsdelivr.net/gh/MehmetAkgul/currency-api-tr@main/v1/currencies/try-full.json` (bid/ask), `try.json` (tek kur) | Yok | jsDelivr (limitsiz CDN) | GitHub Actions ile **5 dk**; CDN tazeliği 0–15 dk | Evet (`bid`/`ask`) | Evet (22 TCMB para birimi) | Evet (`xau_gram`, çeyrek/yarım/tam/cumhuriyet, gümüş) | MIT | Kaynakları TCMB + truncgil + BigPara (+ fawazahmed0 son çare); `is_stale` bayrağı var. Tek kişilik proje → **uzun vadeli güvenilirlik düşük**; yalnızca yedek. |
| **BigPara (Hürriyet)** | `https://api.bigpara.hurriyet.com.tr/doviz/headerlist/anasayfa` (gayri resmî) | Yok | Bilinmiyor | Gün içi | Evet | ? | Ayrı uç | **Belgelenmemiş**; kırılabilir | Yalnızca topluluk kullanımı (prosman/bigpara-api). Kullanma. |
| **doviz.com** | Resmî JSON yok; sayfa içi JS/HTML | — | — | — | — | — | — | Kazıma (scraping) ToS'a aykırı olabilir | Kullanma. |
| **Altınkaynak** | HTML + kurumsal SOAP servisi (`data.altinkaynak.com/DataService.asmx`, kullanıcı/şifre ile) (hafızadan; verify) | Sözleşme | — | — | Evet | — | Evet | Kurumsal | Son kullanıcı ürünü için uygun değil. |
| **Kapalıçarşı / Harem Altın** | Resmî API yok; topluluk kazıyıcıları (`onur2677/kapalicarsi-api` – 1 commit; `kapali-carsi-altin-api.vercel.app`) | — | — | — | — | — | — | Kazıma | Kullanma. |
| **canlidoviz.com** | `…/doviz-kurlari.jsonld`, `api.canlidoviz.com/web/items` | — | — | — | — | — | — | **API 2025'te kapatıldı** | Ölü. |
| **paratic** | Geliştirici API'si bulunamadı | — | — | — | — | — | — | — | Yok sayılır. |
| **NosyAPI / CollectAPI / Apiwizz** | Ücretli Türk API pazar yerleri | Anahtar | Paket | — | Evet | Evet | Evet | Ücretli | "Kendi anahtarın" seçeneği olarak bile gerek yok. |
| **Bankalar** (İş, Garanti, Ziraat…) | Ziraat `developers.ziraatbank.com.tr` (kur API'leri, kayıt gerekli), Garanti BBVA API Store, Ziraat Katılım `/GetExchangeRates`; `ahmeti/bank-exchange-rates` paketi 9 bankayı toplar (son örnek veri Ocak 2023) | Portal kaydı | — | Gün içi | Evet | Çoğunda | Bazıları | Kurumsal sözleşme | Bakımsız ürün için uygun değil; banka kuru bürodan da farklıdır. |

**Truncgil v4 beklenen JSON** (hafızadan; **verify in Faz 0**):
```json
{
  "Meta_Data": { "Minutes_Ago": 0, "Current_Date": "2026-10-01T12:01:00", "Update_Date": "2026-10-01T12:00:36" },
  "USD": { "Change": 0.12, "Name": "Amerikan Doları", "Buying": 48.95, "Type": "Currency", "Selling": 49.02 },
  "EUR": { "Change": -0.05, "Name": "Euro", "Buying": 57.40, "Type": "Currency", "Selling": 57.52 },
  "GBP": { "...": "..." }, "RUB": { "...": "..." },
  "GRA": { "Change": 0.4, "Name": "Gram Altın", "Buying": 6580.1, "Type": "Gold", "Selling": 6584.9 }
}
```
v3 ise Türkçe anahtarlı ve **string** değerli (`"USD": {"Alış":"48,95","Satış":"49,02","Değişim":"%0,12","Tür":"Döviz"}`, `"Update_Date":"01.10.2026 12:00:36"`) — v4 tercih edilmeli; ayrıştırıcı iki şemayı da tolere etmeli.

**GenelPara beklenen JSON** (topluluk kodundan; verify): `{"USD":{"alis":"48.95","satis":"49.02","degisim":"0.12"},"EUR":{...}}` — değerler string olabilir.

### A.2 Küresel orta kur (mid-market) kaynakları

| Kaynak | Uç nokta | Anahtar | Ücretsiz limit | Güncelleme | Baz para | RUB | XAU | Not |
|---|---|---|---|---|---|---|---|---|
| **ExchangeRate-API Open Access** | `https://open.er-api.com/v6/latest/TRY` | Yok | IP bazlı; aşımda 429, 20 dk sonra açılır | **Günde 1** (~00:00 UTC) | Her biri (TRY dahil) | Evet (161 para) | Hayır | **Atıf zorunlu** ("Rates By Exchange Rate API" bağlantısı). JSON: `result, provider, documentation, terms_of_use, time_last_update_utc, time_next_update_utc, base_code, rates{…}`. Eski `https://api.exchangerate-api.com/v4/latest/TRY` hâlâ yanıt veriyor (verify) ama belgelenmiş olan v6. |
| **fawazahmed0/currency-api** | `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/try.json`; yedek `https://latest.currency-api.pages.dev/v1/currencies/try.json`; tarihli `@2026-10-01` | Yok | **Limitsiz** (CDN) | **Günde 1** | Her biri | Evet | Evet (`xau`, 200+ para + kripto + değerli metal; verify) | **CC0-1.0**. README "yedek mekanizma ekleyin" der. JSON: `{"date":"2026-10-01","try":{"usd":0.0204,"eur":0.0174,…}}`. |
| **Frankfurter (ECB)** | `https://api.frankfurter.dev/v1/latest?base=TRY` | Yok | Limitsiz | ECB günlük (16:00 CET) | ECB listesi | **Hayır** (ECB 1 Mart 2022'de EUR/RUB yayınını askıya aldı) | Hayır | RUB yok → bu projede yalnızca EUR/GBP yedeği. |
| **currencylayer (apilayer)** | `http(s)://api.currencylayer.com/live?access_key=…&currencies=TRY,EUR,GBP,RUB` | Evet | **100 istek/ay**, günlük güncelleme, **baz = USD** (HTTPS ücretsizde var — currencyfreaks karşılaştırması; verify) | Günlük | USD | Evet | Evet (XAU) | Çapraz kur hesaplanır: EUR/TRY = USDTRY ÷ USDEUR. 100/ay → günde 3. Ücretli 13,99 $/ay. |
| **exchangerate.host (apilayer)** | `https://api.exchangerate.host/live?access_key=…` | Evet | **100/ay**, günlük | Günlük | USD (ücretsiz) | Evet | Evet | 2023'te anahtarsızdan anahtarlıya döndü — "bakımsız ürün" için kötü sinyal. |
| **Open Exchange Rates** | `https://openexchangerates.org/api/latest.json?app_id=…` | Evet | **1.000/ay**, saatlik, **baz USD** | Saatlik | USD | Evet | Evet | 1.000/ay ≈ 45 dk'da bir. Ücretli 12 $/ay. |
| **currencyapi.com** | `https://api.currencyapi.com/v3/latest?apikey=…&base_currency=TRY&currencies=USD,EUR,GBP,RUB` | Evet | **300/ay**, 10/dk, günlük, "private use" | Günlük | Her biri (verify) | Evet | Evet | 300/ay ≈ 10/gün. |
| **fixer.io** | `…/latest?access_key=…` | Evet | 100/ay, **baz EUR**, **ticari kullanım yasak** | Saatlik | EUR | Evet | Evet | Otel = ticari → ücretsiz plan uygun değil. |
| **Alpha Vantage** | `CURRENCY_EXCHANGE_RATE` | Evet | **25 istek/gün**, 5/dk | Gerçek zamana yakın | Çift bazlı | Evet | Evet | 4 para × 2 (alış/satış yok, tek kur) = 4 istek/çevrim → günde 6 çevrim. Zayıf. |
| **Yahoo Finance (gayri resmî)** | `https://query1.finance.yahoo.com/v8/finance/chart/TRY=X` | Yok | Resmî değil; v7 `quote` artık crumb/çerez istiyor, v8 `chart` şimdilik crumb'sız | Gerçek zamana yakın | — | `RUBTRY=X` | `GC=F` | **Risk**: 2017'de kapatıldı, 2023–24'te crumb zorunluluğu; bakımsız üründe kırılır. Kullanma. |
| **Google Finance** | API yok; `GOOGLEFINANCE` yalnızca Sheets'te (20 dk gecikme). HTML kazıma ToS'a aykırı | — | — | — | — | — | — | Kullanma. Sahibin alıştığı rakam "orta kur"dur; bunu yerelden üretiyoruz (A.4). |
| **Bloomberg** | Ücretsiz API yok (Terminal/B-PIPE kurumsal) | — | — | — | — | — | — | Yok. |
| **Wise** | Resmî `GET https://api.wise.com/v1/rates?source=USD&target=TRY` **Bearer token** ister (kişisel token Settings > API tokens); `wise.com/rates/live` web uç noktası gayri resmî | Evet | Belirtilmemiş; kişisel hesap | Gerçek zamana yakın orta kur | Çift | Evet | Hayır | "Kendi anahtarın" için ilginç ama Wise hesabı şart; opsiyonel bile değil. |
| **Revolut** | Halka açık kur API'si yok (Business API hesap gerektirir) | — | — | — | — | — | — | Yok. |

### A.3 Sahibe açıklama (önerilen Türkçe metin)

> "Merkez Bankası kuru her iş günü 15:30'da, öğleden önceki bankalararası ortalamadan hesaplanan bir *gösterge*dir; hafta sonu ve akşamları güncellenmez ve büroların kâr payını içermez. Google'ın gösterdiği rakam ise o anki bankalararası *orta kur*dur. Döviz bürosu bu orta kurun biraz altından alır, biraz üstünden satar. Bismuth'ta üç seçenek vardır: **Piyasa alış/satış** (döviz bürosu gibi), **Piyasa orta kur** (Google gibi) ve **Otel kuru** (sizin elle yazdığınız). Kurlar internet varken her 30 dakikada bir yenilenir, yoksa son bilinen kur 'eski' işaretiyle gösterilir."

### A.4 Öneri

**Kaynak zinciri (anahtarsız, varsayılan):**

Mod 1 — **"Piyasa alış/satış (Türkiye)"** — amaç: resepsiyonun nakit döviz alırken kullandığı fiyat.
1. Truncgil v4 (`Buying`/`Selling`; USD, EUR, GBP, RUB, GRA) — 5 sn zaman aşımı.
2. GenelPara `embed/doviz.json` (`alis`/`satis`) — 30 dk aralık = 48 istek/gün < 1.000.
3. currency-api-tr `try-full.json` (`bid`/`ask`) — jsDelivr, sonra `is_stale` kontrolü.
4. Hiçbiri yoksa: Mod 2'nin orta kuru ± ayarlanabilir "varsayılan marj" (örn. %0,3; `settings.fx_default_spread_bp`) ile türetilir ve **"tahminî"** rozetiyle gösterilir.

Mod 2 — **"Piyasa orta kur (Google benzeri)"**
1. Gün içi: Mod 1'den gelen (alış+satış)/2 — bu, Google'ın 20 dk gecikmeli orta kuruna en yakın anahtarsız değerdir (büro marjı simetrik varsayılır).
2. Günlük yedek: fawazahmed0 `try.json` (jsDelivr → pages.dev yedeği).
3. Günlük yedek 2: `open.er-api.com/v6/latest/TRY` (atıf bağlantısı Ayarlar › Kur kaynakları'nda gösterilir).
4. EUR/GBP için son çare: Frankfurter (RUB yok).

Mod 3 — **"Kendi API anahtarım"** (isteğe bağlı, Ayarlar'da anahtar alanı; anahtar `settings`'te şifreli saklanır): Open Exchange Rates (1.000/ay, saatlik, USD bazlı → çapraz hesap), currencyapi.com (300/ay), currencylayer (100/ay). Hepsi aynı adaptör arayüzünü uygular: `fetchRates(): Promise<RateQuote[]>`.

Mod 4 — **"Otel kuru"**: para birimi başına elle girilen kur (+ "geçerlilik başlangıcı"); her zaman otomatik kaynağın önüne geçer; `source='manual'`.

**Veri modeli (öneri):** `fx_rates(id, as_of_date TEXT 'YYYY-MM-DD', fetched_at TEXT ISO, currency TEXT, buy_micro INTEGER NULL, sell_micro INTEGER NULL, mid_micro INTEGER, source TEXT, mode TEXT)` — kur **para değildir** ama G-131 ruhuyla kayan sayı yerine `×1_000_000` tam sayı (`micro`) saklanır; dönüşüm `shared/money.ts` içinde (`convertMinor(amountMinor, rateMicro)` → kuruşa yuvarlama kuralı tek yerde). Ödeme/gider satırı o anki kuru **dondurur** (`rate_micro`, `rate_source`) → raporlar yeniden hesaplanmaz.

**Yenileme politikası:** uygulama açılışında + her 30 dk (`settings.fx_refresh_minutes`, min 10); yalnızca `src/main/network/fx/` içinde; 5 sn zaman aşımı; sessiz başarısızlık; başarısızlıkta zincirde sonraki kaynak; başarılı sonuç SQLite'a yazılır; UI son kuru her zaman gösterir ve `fetched_at` > 6 saat ise **"eski"** (sarı), > 48 saat ise **"çok eski"** (kırmızı) rozeti; "Şimdi yenile" düğmesi; hafta sonu için "cuma kapanışı" notu. Kaynak yanıtı şema doğrulamasından (zod) geçmezse (alan adı değişti) o kaynak 24 saat devre dışı bırakılır → bakımsız üründe sessiz bozulma engellenir. Kaynak sırası `settings.fx_source_order` ile değiştirilebilir (ileride bir kaynak ölürse kod değişmeden kapatılır).

**Gram altın** isteğe bağlı: yalnızca Truncgil `GRA` / currency-api-tr `xau_gram`; yoksa fawazahmed0 `xau` (ons) ÷ 31,1035 × USDTRY (verify).

---

## BÖLÜM B — Sabit 10 yıllık tablonun ötesinde tatiller

### B.1 Çevrimdışı kural tabanlı üretim: `date-holidays`

- `date-holidays@3.37.0` (2026-09-20), lisans ISC + veri CC-BY-3.0 (uygulama içi "Hakkında"da atıf). 207 ülke. **Hicrî takvim 1970–2080** arası tablo ile desteklenir ("islamic dates might not be correct as they are subject to the sighting of the moon").
- TR verisi (`data/countries/TR.yaml`, doğrulandı): `01-01`, `04-23`, `05-01`, `05-19`, `07-15` (Demokrasi ve Millî Birlik Günü), `08-30`, `10-29`, `1 Shawwal PT90H` (Ramazan Bayramı: arife 13:00'ten başlayıp 3,75 gün = yarım arife + 3 gün), `10 Dhu al-Hijjah PT114H` (Kurban: 4,75 gün). `dayoff: saturday`. Hepsi `public`. 28 Ekim 13:00 yarım günü **yok** (biz ekleriz).
- Boyut: tam paket ~1,5 MB; yalnızca TR ile özel derleme (`date-holidays-parser` + TR yaml) ≈ birkaç yüz KB. Ürün çevrimdışı olduğundan paket içinde gelir (yasak 1 ile uyumlu).
- Riskler: (1) Diyanet'in ilan ettiği gün astronomik hesaptan **±1 gün** sapabilir (nadir; Diyanet yıllar öncesinden ilan eder, Nager.Date de "Umm al-Qura ≠ Diyanet" uyarısı yapar); (2) kütüphane bakımsız kalırsa yaml'ı kendi deposuna kopyalamak yeterli (veri CC-BY-SA/CC-BY). 2080 sonrası: uygulama "tatil üretilemedi, elle girin" der (ürün ömrü için yeterli).
- Alternatif: kendi Hicrî dönüştürücü (Umm al-Qura tablosu) — gereksiz risk; `date-holidays` yeter.

### B.2 Çevrimiçi doğrulama/düzeltme seçenekleri

| Servis | Anahtar | Ücretsiz limit | TR kapsamı | Dinî bayram | Şekil | Değerlendirme |
|---|---|---|---|---|---|---|
| **Calendarific** `https://calendarific.com/api/v2/holidays?api_key=…&country=TR&year=2027` | Evet | **500 çağrı/ay**, atıf zorunlu, tek dil, veri **üç ayda bir** güncellenir; Business 500 $/yıl | 230+ ülke, TR var | Evet (`type: ["National holiday"]`, `primary_type`, ayrıca `Observance`, `Muslim` tipleri) | `{"meta":{"code":200},"response":{"holidays":[{"name":"Ramazan Bayramı","date":{"iso":"2027-03-09"},"type":["National holiday"],"primary_type":"National holiday","locations":"All","states":"All"}]}}` (hafızadan; verify) | Yılda 1–2 çağrı yeter. **"Kendi anahtarın" seçeneği** olarak uygun; varsayılan olamaz (anahtar). |
| **Nager.Date** | Yok | Limitsiz (adil kullanım) | TR var | **Hayır** — proje politikası: "Islamic holidays are not included … depend on local moon sightings" → TR için yalnızca millî günler | v3: `GET /api/v3/PublicHolidays/2026/TR`; v4: `GET /api/v4/Holidays/TR/2026` (`holidayTypes: Public/Bank/School/Authorities/Optional/Observance`) | **Alan adı Temmuz 2026'da `date.nager.at` → `nagerholidays.com`** oldu (issue #1123); eski adın ne kadar yaşayacağı belirsiz. Dinî bayram yok → bu proje için **yetersiz**. |
| **Abstract API Holidays** | Evet | 1.000 istek (toplam/ay; verify), 1 istek/sn, **ticari kullanım yasak** | Var | Muhtemelen | `?api_key&country=TR&year&month&day` (gün bazlı) | Ticari yasağı nedeniyle hayır. |
| **Google Takvim ICS** `https://calendar.google.com/calendar/ical/tr.turkish%23holiday%40group.v.calendar.google.com/public/basic.ics` (İngilizce: `en.turkish.official%23holiday%40group.v.calendar.google.com`) | Yok | Yok (makul) | Var | Google'ın TR takvimi millî + dinî bayramları ve arifeleri içerir (deneyim; **verify**: feed'de "Ramazan Bayramı", "Kurban Bayramı", "… Arifesi" SUMMARY'leri ve kaç yıl ileriye gittiği) | iCalendar; `ical.js` ile ayrıştırma; "Public holidays" vs "Other observances" kategorileri 2023'ten beri karışık gelebilir | **Anahtarsız en iyi çevrimiçi doğrulayıcı**; Google'ın ICS'yi kapatma riski düşük ama sıfır değil → yalnızca "isteğe bağlı kontrol". |
| **OpenHolidays API** `https://openholidaysapi.org/PublicHolidays?countryIsoCode=TR…` | Yok | Limitsiz | **TR listede görünmüyor** (~35–40 Avrupa/Amerika/Afrika ülkesi; verify `GET /Countries`) | — | — | Hayır. |

### B.3 Önerilen tasarım

- Tablo `holidays(id, date TEXT, end_date TEXT NULL, name TEXT, kind TEXT CHECK(national|religious|half_day|custom), is_half_day INTEGER, source TEXT CHECK(generated|manual|online), generator_version TEXT, user_edited_at TEXT NULL, deleted_at TEXT NULL, created_at, updated_at)`; benzersiz `(date, name)`.
- **Üretim:** herhangi bir yıl ilk kez gerektiğinde (takvim o yıla kaydırıldığında/raporda) `date-holidays`'den TR listesi üretilir, `PT90H/PT114H` süreleri **gün satırlarına** açılır: arife = `half_day` (13:00), bayram günleri `religious`; `10-28` yarım gün elle eklenir; `source='generated'`, `generator_version='date-holidays@3.37.0'`.
- **Kullanıcı düzenlemeleri korunur:** `source='manual'` veya `user_edited_at` dolu satırlara üretici dokunmaz. Silme = `deleted_at` (yasak 11); üretici silinmiş bir `generated` satırı yeniden yaratmaz (aynı `(date,name)` anahtarı).
- **Yıllık çevrimiçi kontrol (isteğe bağlı, ayar kapalı gelir):** yılda bir (Ocak) veya kullanıcı "Tatilleri doğrula" dediğinde `src/main/network/holidays/` Google ICS'yi (anahtarsız) ya da Calendarific'i (kullanıcı anahtarı) çeker, 5 sn zaman aşımı, sessiz başarısızlık. Fark listesi üretilir: **yalnızca `source='generated'` satırları otomatik düzeltilir** (kaynak `online` olarak işaretlenir); `manual` satırlar için "fark var" bildirimi gösterilir, kullanıcı onaylar.
- Ayarlar: `holidays.online_check_enabled`, `holidays.online_source (google_ics|calendarific)`, `holidays.calendarific_key`, `holidays.last_checked_at`. Yarım gün etkisi (fiyatlandırma/mesai) iş kuralı tablosundan okunur (yasak 10).

---

## BÖLÜM C — Çoklu cihaz / uzaktan erişim (bulut servisi yazmadan)

Senaryo: Resepsiyon PC'si (Windows 10, otelde) ana veri sahibi, çevrimdışı çalışmalı. Sahip MacBook M2 (evde/otelde) görüntüleme + sınırlı düzenleme; telefonda görüntüleme.

### C.1 "Host modu" + özel katman ağı (overlay)

Host modu: otel PC'sindeki Bismuth, gömülü HTTP(S) sunucusu ile aynı React arayüzünü ve API'yi sunar; uzak cihazlar özel ağ üzerinden ulaşır.

| Çözüm | Ücretsiz plan (2026) | Teknik olmayan kurulum | Güvenlik | Çevrimdışı davranış | Uzun vade |
|---|---|---|---|---|---|
| **Tailscale** | Personal: **6 kullanıcı, sınırsız kullanıcı cihazı**, 50 etiketli kaynak (Nisan 2026 "pricing v4"); MagicDNS, HTTPS sertifikası (`tailscale cert`, Let's Encrypt, `makine.tailnet-adı.ts.net`), Serve (tailnet içi HTTPS), Funnel (internete açma; 443/8443/10000; yayınlanmamış bant genişliği sınırı), Taildrop. Ücretli: Standard 8 $/koltuk, Premium 18 $/koltuk. | **Kolay**: Windows/macOS/iOS/Android GUI uygulamaları; "Sign in with Google" (Gmail → Personal plan); aynı Google hesabıyla her cihaz otomatik aynı ağda. Windows'ta **"Run unattended"** (tepsi menüsü › Preferences) → oturum kapalıyken de çalışır. Terminal gerekmez. | WireGuard uçtan uca şifreleme; cihaz kimliği; ACL varsayılanı "herkes herkese" (tek hesap için sorun değil). CT günlüğü: `tailscale cert` kullanılırsa makine adı herkese açık CT günlüğüne düşer → nötr ad ("bismuth-host"). | LAN'da Tailscale olmadan da çalışır (mDNS/LAN IP); koordinasyon sunucusu çevrimdışıysa mevcut bağlantılar sürer (DERP relay gerekebilir). Internet yoksa uzak erişim zaten yok. | Şirket 2019'dan beri; ücretsiz plan tarihsel olarak genişledi (3→6 kullanıcı). Risk: ücretsiz planın daralması → ZeroTier/NetBird'e geçiş aynı mimariyle mümkün (uygulama yalnızca bir IP/host adı bilir). |
| **ZeroTier** | **10 cihaz, 1 ağ** (25→10'a düşürüldü); Essential 18 $/ay | Orta: GUI var ama ağ kimliği (16 hex) girme + web panelinde cihaz onaylama adımı teknik olmayan kullanıcıyı zorlar; MagicDNS/HTTPS eşdeğeri yok. | Katman-2 şifreli; cihaz onayı manuel. | Benzer. | Ücretsiz plan küçülme eğiliminde. |
| **Cloudflare Tunnel + Zero Trust Access** | Tünel sınırsız/ücretsiz; Access **50 kullanıcıya kadar ücretsiz**; `cloudflared` 2026.9.1+ | **Zor**: alan adı satın alma (~10 $/yıl) + Cloudflare'e NS taşıma + tünel ve Access politikası kurma; istemci tarafında kurulum yok (tarayıcı + e-posta OTP). | Uygulama internete *Cloudflare arkasında* açılır; Access ile e-posta OTP/Google girişi. Cloudflare TLS'i sonlandırır (trafiği görür). | Host çevrimdışı → tünel kapalı. | Ücretsiz tünel kalıcı görünüyor; ama alan adı yenileme + Cloudflare hesabı = bakım. |
| **ngrok** | **1 GB/ay, 20.000 istek/ay, 3 uç nokta**, ücretsiz sabit "dev domain" (rastgele alt alan) | Kolay ama "her zaman açık" için uygun değil | TLS, ngrok trafiği görür | — | Geliştirici aracı; üretim için hayır. |
| **NetBird** | **5 kullanıcı, 100 makine**; Google SSO | Tailscale'e yakın (GUI, SSO) ama daha genç | WireGuard | Benzer | Açık kaynak (self-host mümkün); 2. seçenek. |
| **Twingate Starter** | **5 kullanıcı, 50 kaynak, 10 ağ** | Orta-zor: otel tarafında "Connector" (Docker/Windows servisi) kurulmalı | ZTNA, TLS | — | Kurumsal odak; aşırı. |

**Tailscale'i uygulamaya gömmek:** `tsnet` yalnızca Go. `libtailscale` C kütüphanesi (Python/Ruby/Swift bağları; **Node/Electron bağı yok**, kararlılık beyanı yok). `tailscale-js` **yalnızca Bun** FFI. → **Üretime uygun bir Node/Electron gömme yolu yok**; Bismuth yüklü Tailscale uygulamasını varsayar, kendisi yalnızca (a) `100.x.y.z`/`*.ts.net` adresini algılar, (b) isteğe bağlı olarak `tailscale.exe serve --bg 8443` komutunu çalıştırır (CLI yoksa atlar).

### C.2 Doğrudan açma (port yönlendirme + dinamik DNS) — neden hayır

Modem yönetimi (CGNAT'lı Türk ISS'lerinde çoğu zaman imkânsız), DDNS hesabı, ev/otel IP değişimleri, internete açık port = sürekli bot taraması, TLS sertifikası ve güncelleme yükü, misafir verisi (KVKK) riski. Bakımsız üründe kabul edilemez.

### C.3 Yerel-öncelikli senkron / çoğaltılmış SQLite

| Seçenek | Durum (2026) | Ücretsiz/yıllık maliyet | Uygunluk |
|---|---|---|---|
| **Turso / libSQL embedded replica** | Embedded replicas üretimde; **Offline Sync public beta** (TS, Rust): çift yönlü push/pull, çakışma *tespiti* var, *çözümü* yok; Turso "yeni projeler için Turso Sync" diyor (ürün yön değişimi). Ücretsiz: 5 GB, 500 M okuma/ay, 10 M yazma/ay, 100 DB. `@libsql/client 0.18.0`; Drizzle destekler. | 0 $ ama bulut hesabı + politika değişikliği riski; `better-sqlite3` yerine libSQL (WAL/eklenti farkları). | **Hayır** (varsayılan): bulut bağımlılığı + beta çakışma modeli. Belki ileride "isteğe bağlı eklenti". |
| **PowerSync** | Cloud free: 2 GB senkron/ay, 500 MB, 50 eşzamanlı; **1 hafta hareketsizlikte proje kapatılır**; backend Postgres/MongoDB/MySQL gerekir; Open Edition self-host (FSL). `@powersync/node 1.1.1`. | Sunucu şart. | Hayır. |
| **ElectricSQL** | Electric Cloud (Nisan 2026 fiyatlandırma: okuma ücretsiz, 2 $/M yazma); Postgres 14+ şart; self-host Docker. | Sunucu şart. | Hayır. |
| **cr-sqlite / vlcn** | Son commit **Ekim 2024**, npm `0.16.3` **Ocak 2024**; Fly.io çatalı yalnızca Corrosion için. | — | **Bakımsız → hayır.** |
| **Litestream** | v0.5 (Ekim 2025) aktif; S3 uyumlu depoya sürekli replikasyon; **salt-okunur VFS** read-replica; Go ikili sidecar. LiteFS: Consul/Fly odaklı. | S3/B2/R2 hesabı (~0–1 $/ay) | Çok cihaz çözümü değil; **felaket yedeği** için isteğe bağlı (Faz dışı). |
| **Dropbox/Drive'da canlı DB** | sqlite.org: ağ/senkron dosya sistemleri "desteklenmez"; WAL paylaşımlı bellek ister; senkron istemcisi sayfaları altından yeniden yazar → bozulma. | 0 $ | **Asla canlı DB.** Güvenli desen: tek yazar (host) + `db.backup()` ile **atomik anlık görüntü** (temp dosyaya yaz → `rename`) senkron klasöre, N dakikada bir; tüketici `?mode=ro&immutable=1` ile açar. |
| **CouchDB/PouchDB** | Sunucu gerekir. | — | Hayır. |
| **Supabase** | Free: 500 MB; **7 gün DB hareketsizliğinde proje duraklatılır**, elle sürdürülür. | 0 $/25 $ | Bitmiş ürün için hayır. |
| **Firebase** | Sahip reddetti (telemetri/bulut kilidi). | — | Hayır. |

### C.4 Telefon erişimi: PWA vs yerel uygulama

PWA (host modundaki aynı React arayüzü, responsive + `manifest.webmanifest` + minimal service worker): mağaza, imzalama, yıllık geliştirici ücreti (Apple 99 $/yıl) yok; bakımsız ürün için tek makul yol. Erişim: telefonda Tailscale uygulaması (ücretsiz, iOS 15+/Android) → Safari/Chrome'da `http://bismuth-host:8443`. iOS "Ana Ekrana Ekle" **HTTP üzerinden çalışır**; Android Chrome "Yükle" için **HTTPS** ister → `tailscale serve` (Let's Encrypt, tailnet içi) veya "Chrome'da sayfaya yer imi" ile yetinme. Tailscale zaten WireGuard ile şifreler; HTTP burada "düz metin" değildir.

### C.5 Önerilen mimari

1. **Host modu (otel PC'si).** Ayarlar › "Bu bilgisayar ana sunucu". Açınca: Hono sunucusu `0.0.0.0:8443`'te (LAN + Tailscale arayüzü); Windows Güvenlik Duvarı kuralı yükleyici (NSIS) tarafından eklenir; `app.setLoginItemSettings({openAtLogin:true})`; `powerSaveBlocker.start('prevent-app-suspension')` + kurulum sihirbazında "Uyku: Hiçbir zaman" yönlendirmesi; Tailscale "Run unattended" kontrol listesi. mDNS ilanı `_bismuth._tcp` (`bonjour-service`). Sunucu çalışmasa da yerel kullanım IPC ile aynen sürer (çevrimdışı garanti).
2. **İstemci modu (sahibin Mac'i).** Aynı Electron paketi; ilk açılışta "Ana sunucuya bağlan": LAN'da mDNS ile otomatik bulma, dışarıda Tailscale adı (`bismuth-host.tailXXXX.ts.net`) — her ikisi kaydedilir; ulaşılabilen ilk adres kullanılır, 2 sn'de bir yeniden dener. Mac'te veri **tutulmaz** (ince istemci); tüm yazmalar host'a HTTP ile gider. Giriş: kullanıcı adı + parola → oturum belirteci (`Set-Cookie: HttpOnly; SameSite=Strict`, Electron istemcide bearer). Giriş denemesi sınırlama (5/dk/IP), parola `argon2id`.
3. **Telefon.** Tailscale uygulaması + tarayıcı (PWA). Rol "görüntüleme" varsayılan.
4. **Sıfır bağımlılık yedeği.** Host her N dk (`settings.snapshot_minutes`, varsayılan 15) ve her kapanışta `db.backup()` ile `bismuth-snapshot.sqlite`'ı seçilen klasöre (Google Drive/Dropbox/OneDrive masaüstü istemcisi senkronlar) atomik yazar. Mac'teki Bismuth "Anlık görüntüyü aç (salt okunur)" ile host kapalıyken de raporları gösterir; başlıkta "Anlık görüntü · 12:45" rozeti. (Drive "stream" modunda dosya tam inmeden açılmaz → `immutable=1` + boyut kontrolü.)
5. **Çakışma.** Tek doğruluk kaynağı = host. Her satırda `version`; istemci `If-Match: version` gönderir, uyuşmazsa 409 → UI "kayıt değişti, yenile". İstemci çevrimdışı kuyruk **yok** (ince istemci kuralı → bakımsız üründe en az risk).
6. **Yetki (G-23).** HTTP ve IPC aynı servis katmanına girer; `ctx` oturumdan türetilir; audit_log'a `transport` ve `remote_addr` yazılır.
7. **HTTPS.** Tailnet/LAN üzerinde HTTP yeterli (WireGuard). İsteğe bağlı: `tailscale serve --bg 8443` (uygulama çalıştırır, çıktıyı gösterir) → `https://bismuth-host.tailXXXX.ts.net`. Self-signed sertifika üretmeyi **önermiyorum** (uyarı diyalogları, telefonda güven yükleme = destek yükü).
8. **Host kapalıyken.** İstemci: "Otel bilgisayarına ulaşılamıyor" + "Son anlık görüntüyü aç" düğmesi + son başarılı bağlantı saati. Funnel (internete açma) **kullanılmaz**.

Kurulum rehberi (sahip için, terminal yok): (1) Her cihaza Tailscale'i yükle, aynı Google hesabıyla gir; otel PC'sinde "Run unattended" işaretle. (2) Otel PC'sinde Bismuth › Ayarlar › Ana sunucu: Aç. (3) Mac/telefonda Bismuth/tarayıcı: ekranda görünen adresi aç, giriş yap. (4) Google Drive klasörünü seç (isteğe bağlı).

### C.6 Electron'da gömülü sunucu — teknik liste

- Paketler: `hono@4.13.12`, `@hono/node-server@2.1.3` (Node ≥ 20; Electron 3x'in Node'u uygun), `hono/cookie`, `bonjour-service@1.4.4`, `argon2` (native; electron-rebuild) veya `@node-rs/argon2`. WebSocket gerekiyorsa (canlı takvim güncellemesi) `ws@8.22.0` ya da basit SSE (`hono/streaming`) — SSE tercih (daha az bağımlılık).
- Sunucu main process'te: `serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })`; HTTPS gerekirse `createServer` from `node:https` + `serverOptions{key,cert}`.
- Statik: `serveStatic({ root: path.join(app.getAppPath(), 'out/renderer') })` + SPA fallback `index.html`. Renderer paketi `base: './'` ile derlenir; Electron içinde `file://` yerine özel protokol/`loadURL('http://127.0.0.1:port')` kullanmak CSP/origin tutarlılığı sağlar (antelm-dev/electron-renderer-protocol yaklaşımı).
- Başlıklar: `Content-Security-Policy: default-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. CORS **açılmaz** (aynı origin); `Origin`/`Sec-Fetch-Site` kontrolü ile CSRF savunması + `SameSite=Strict`.
- Tek tipli sözleşme: `src/shared/api-contract.ts` → `const contract = { 'reservations.create': { input: zReservationCreate, output: zReservation }, … }`. Üç taşıyıcı aynı tipi uygular: (a) **IPC** (`ipcMain.handle(channel)`; preload `window.api.call(channel, input)`), (b) **HTTP** (`POST /api/:channel`, gövde zod ile doğrulanır, aynı servis fonksiyonu), (c) **İstemci modu**: main process `HttpTransport` ile host'a iletir, renderer yine `window.api` görür. Tarayıcı (telefon) için renderer `window.api` yoksa `FetchTransport`'u seçer. Böylece yetki, doğrulama ve audit tek yerde (ipc.md kuralı) kalır.
- Yerel yazmalar host'ta aynı `better-sqlite3` bağlantısı ve transaction'lar üzerinden; HTTP işleyicileri eşzamanlı istekleri Node'un tek iş parçacığında sıraya sokar (SQLite `busy_timeout` 5 s).
- Ağ istekleri (kur, tatil) `src/main/network/` dışına çıkmaz; sunucu "dış ağ isteği" değildir (gelen bağlantı) ama yalnızca host modu ayarı açıkken dinler.

---

## Kaynaklar (erişilebilen/aramada bulunan)

FX: exchangerate-api.com/docs/free (arama özeti) · github.com/fawazahmed0/exchange-api · github.com/MehmetAkgul/currency-api-tr · gist dogukancagatay (Truncgil Sheets) · github.com/Torokal/TSQ-Bot/pull/24 · github.com/berkocan/genelpara-api-cache · currencyfreaks.com (currencylayer/OXR/fixer karşılaştırmaları) · frankfurter.dev/currencies/rub · ECB EUR/RUB askı notu · docs.wise.com/api-reference/rate · macroption.com (Alpha Vantage limitleri) · TCMB Gösterge Niteliğindeki Kurlar · vergidosyasi.com (2021-05) · fiyatdefteri.com rehberi · mahfiegilmez.com (2023-04) · kpmgvergi.com "ikili kur" · support.google.com GOOGLEFINANCE.
Tatil: github.com/commenthol/date-holidays (+ data/countries/TR.yaml) · calendarific.com/pricing (arama) · github.com/nager/Nager.Date (+ issue #1123) · github.com/focus-shift/jollyday/issues/1514 · abstractapi holidays docs (arama) · openholidaysapi.org (arama) · libraries.io Easy.Tools.GoogleCalendarEvents.Holidays.Turkiye.
Uzaktan erişim: tailscale.com/blog/pricing-v4 (arama) · tailscale docs: funnel, serve, set-up-https-certificates, run-unattended, install/ios, install/android, integrations/identity · zerotier.com/pricing.md · Cloudflare Tunnel/Zero Trust (arama) · ngrok (arama) · docs.netbird.io plans · twingate.com/pricing · github.com/tailscale/libtailscale · github.com/mastermakrela/tailscale-js · turso.tech/blog/turso-offline-sync-public-beta · docs.turso.tech embedded replicas (arama) · powersync.com/pricing (arama) · electric-sql.com/blog/2026/04/02 · github.com/vlcn-io/cr-sqlite · litestream.io (v0.5, VFS) · sqlite.org/howtocorrupt.html, useovernet.html, wal.html · supabase.com free-project-pausing · github.com/honojs/node-server · github.com/antelm-dev/electron-renderer-protocol.
