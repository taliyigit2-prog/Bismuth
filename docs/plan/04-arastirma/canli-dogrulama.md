# Faz 0 · Canlı API Doğrulaması (A0.5) — Kur, Hava Durumu, Bayram Kaynakları

> Çalıştırma: GitHub Actions `faz0-live-checks` (arşiv etiketi `archive/faz0`), run 36936636290, ubuntu‑24.04 (Azure eastus), 2026‑10‑01 22:42–22:57 UTC
> (= 2 Ekim 01:42–01:57 TR saati; piyasalar gece, kurlar yatay). Betik: `prototypes/live-checks/check.mjs` (arşiv etiketi `archive/faz0`).
> Kur için 4 örnek (5 dk arayla), hava ve bayram için 1 örnek. Bu konteyner dış adreslere erişemediği için
> doğrulama çalıştırıcıda yapıldı.

## 1. Kur (TRY karşılığı, orta kur)

**Piyasa referansı:** Google Finance sayfası çalıştırıcıdan okunamadı (çerez onay sayfası, `data-last-price` yok). Canlı
piyasa referansı olarak Yahoo Finance (gayriresmî uç nokta, **yalnızca kıyas için**, ürün kaynağı değil) kullanıldı.

| Kaynak | Anahtar | Tazelik | 4 örnekte başarı | USD | EUR | GBP | RUB | USD Δ% | EUR Δ% | GBP Δ% |
|---|---|---|---|---|---|---|---|---|---|---|
| **Yahoo (referans, canlı)** | – | canlı | 4/4 | 49,096 (ort.) | 55,266 | 64,786 | – | 0 | 0 | 0 |
| **Truncgil v4** (TR piyasa alış/satış → orta) | yok | **canlı (~5 dk)** | 3/4 (1 "fetch failed") | 49,126 | 55,277 | 64,868 | 0,5882 | **+0,06** | **+0,02** | **+0,13** |
| fawazahmed0 currency-api (jsDelivr + pages.dev) | yok | günlük | 4/4 + 4/4 | 49,028 | 55,484 | 64,946 | 0,5879 | −0,14 | +0,39 | +0,25 |
| open.er-api.com (ExchangeRate‑API açık) | yok (atıf gerekli) | günlük (00:02 UTC) | 4/4 | 49,049 | 55,590 | 65,092 | 0,5874 | −0,10 | +0,59 | +0,47 |
| exchangerate-api.com v4 | yok | günlük | 4/4 | 49,020 | 55,556 | 64,935 | 0,5882 | −0,16 | +0,52 | +0,23 |
| Frankfurter (ECB) | yok | günlük (iş günü) | 4/4 | 49,044 | 55,402 | 64,893 | **yok** | −0,11 | +0,25 | +0,16 |
| TCMB `today.xml` (resmi, yalnız kıyas) | yok | iş günü 15:30 | 4/4 | 48,991 | 55,347 | 64,813 | 0,5880 | **−0,21** | +0,15 | +0,04 |
| GenelPara `embed/doviz.json` | yok | – | **0/4** (HTML döndü) | – | – | – | – | – | – | – |
| Google Finance sayfası | – | – | 0/4 (onay sayfası) | – | – | – | – | – | – | – |

**Bulgular**
1. **Google benzeri canlı orta kura en yakın anahtarsız kaynak Truncgil** (USD/EUR farkı %0,1'in altında, RUB ve gram altın var). Ama 4 örnekten 1'inde bağlantı hatası verdi ve ticari kullanım şartı yazılı değil (Faz 1'de e‑posta ile sorulacak) → **tek başına güvenilmez; zincirin ilk halkası.**
2. Günlük kaynaklar (fawazahmed0, open.er-api, exchangerate-api) **istikrarlı** (4/4) ama gün içinde %0,1–0,6 sapıyor (bu ölçümde EUR/USD gün içinde oynadığı için EUR sapması büyük). Resepsiyonda "kaç dolar?" sorusu için yeterli; raporlarda ödeme anı kuru dondurulduğu için kabul edilebilir.
3. **TCMB bu ölçümde USD'de piyasanın %0,21 altında** (sahibin gözlemiyle uyumlu); EUR/GBP'de günün saatine göre üstünde de olabiliyor. Ürün TCMB'yi yalnızca karşılaştırma satırı olarak gösterecek (K-06).
4. GenelPara uç noktası artık JSON vermiyor → **elendi**. Google sayfası kazıma → **elendi** (yasal ve teknik risk). Yahoo → **elendi** (gayriresmî, kimlik/çerez değişiyor).
5. `currency-api-tr` (diğer araştırma) aslında TCMB verisini yeniden yayınlıyor → **elendi** (piyasa kuru değil).

**Kesin kaynak zinciri (K-06):**
`Truncgil v4 (canlı)` → `fawazahmed0 currency-api (jsDelivr, sonra pages.dev)` → `open.er-api.com` → `exchangerate-api.com v4` → `Frankfurter (USD/EUR/GBP)` → SQLite önbelleği (son kur + "X dk/saat önce") → otel kuru / elle. İsteğe bağlı: kullanıcının kendi anahtarıyla Open Exchange Rates (saatlik) / currencyapi. Her kaynak zod ile doğrulanır; şema bozulursa 24 saat devre dışı. Gösterilen kur yanında **kaynak adı ve saati** yazar (sahip hangi kurun gösterildiğini bilsin).

## 2. Hava durumu (Kadıköy 40,99 / 29,03)

| Kaynak | Anahtar | Yanıt | Sonuç | Lisans (diğer rapordan) |
|---|---|---|---|---|
| **MET Norway Locationforecast 2.0 `compact`** | yok (User‑Agent zorunlu) | 704 ms | ✅ 15,1 °C, nem %78,6, rüzgâr 4,1 m/s, simge `lightrainshowers_night`, **89 saatlik** seri | CC BY 4.0 / NLOD — **ticari kullanım serbest** |
| Open‑Meteo | yok | 69 ms | ✅ 15,8 °C, WMO kodu 2, 7 günlük, **yağış olasılığı %60** | Ücretsiz katman **ticari olmayan** kullanım için ("ticari ürüne entegre etmek" ticari sayılıyor) |
| wttr.in | yok | 459 ms | ✅ 16 °C "Patchy rain nearby" | gayriresmî hizmet |
| 7Timer | yok | 517 ms | ✅ 7 gün en yüksek/en düşük | bakım belirsiz |

**Karar K-13:** birincil **MET Norway** (ticari serbest, 9 gün saatlik; günlük en yüksek/en düşük saatlik veriden hesaplanır); MET `compact` **yağış olasılığı vermiyor** (yağış miktarı mm + simge veriyor) → G-113'teki "yağış olasılığı" için sahip sorusu **S-90**. Open‑Meteo yalnızca sahip açarsa (kendi sorumluluğu) yedek; varsayılan kapalı. Kullanıcı anahtarlı seçenek (Visual Crossing / OpenWeatherMap) ayarlarda. Simgeler: lucide (zaten var) + isteğe bağlı Meteocons (MIT).

**Simge seti kararı (2026-10-02, S-90: "görselleştir, yağmurlu bulut simgesi"):**

| Set | Lisans (depodan okundu) | MET `symbol_code` eşleşmesi | Karar |
|---|---|---|---|
| **Yr hava simgeleri** (`YR/weather-symbols`, NRK) | **CC BY 4.0** ("Yr weather symbols © 2015 by Yr/NRK") — `metno/weathericons` aynası hâlâ "MIT" yazıyor ama asıl depo CC BY 4.0'a geçmiş; ticari kullanım serbest, atıf şart | **Birebir** (MET kodları bu set için tasarlandı; gündüz/gece/kutup varyantları) | **Seçildi**: paket içi SVG; Hakkında + hava kartı altında "Veri: MET Norway · Simgeler: Yr/NRK (CC BY 4.0)" |
| Meteocons (`basmilius/weather-icons`, `@bybas/weather-icons@2.0.0`) | MIT | Elle eşleme tablosu gerekir | Yedek (tasarım fazında daha uyumlu görünürse) |
| lucide (zaten var) | ISC | Kaba (cloud-rain, sun…) | Yalnız küçük rozetlerde |

Gösterim: Bugün kartı (şimdiki simge + sıcaklık + bugün en düşük/en yüksek + "yağmur bekleniyor · 2 mm") ve **haftalık şerit** (7 gün × simge, en yüksek/en düşük, mm).

## 3. Bayram kaynakları (yıllık çevrimiçi doğrulama için)

| Kaynak | Anahtar | Sonuç |
|---|---|---|
| **Google Takvim "Türkiye'deki Tatiller" ICS** (`tr.turkish#holiday@group.v.calendar.google.com`) | yok | ✅ 230 olay, **2021–2031**; Ramazan/Kurban **arife (yarım gün)** dahil, gelecek yıllarda **"(kesin değil)"** notu; ayrıca anma günleri (10 Kasım), "1 Ramazan", "Yılbaşı gecesi" ve bir idari izin/köprü günü ("Sacrifice Feast Holiday" 25 Mayıs 2026) var |
| Nager.Date (`date.nager.at` ve yeni `nagerholidays.com`) | yok | ✅ 2026 TR 14 gün — **artık Ramazan/Kurban Bayramı'nı da içeriyor** (önceki raporun aksine), arife yok |

**Kıyas (date-holidays prototipi ile):**
- 2026: Ramazan 20–22 Mart (arife 19), Kurban 27–30 Mayıs (arife 26) → **üç kaynak aynı** ✅
- 2027 Kurban: 16–19 Mayıs (arife 15) → **aynı** ✅
- **2027 Ramazan: Google 10–12 Mart (arife 9 Mart, "kesin değil"); date-holidays 9 Mart başlangıç → 1 gün fark.** Dini bayramların neden "tahmini" işaretlenip doğrulanması gerektiğinin canlı kanıtı.

**Karar K-04 tamamlandı:** yıllık doğrulama kaynağı **Google TR tatil ICS** (anahtarsız, arife ve "kesin değil" bilgisi var, ~5 yıl ileri); yedek Nager.Date. Doğrulama yalnızca `source=generated` satırları günceller; "kesin değil" notu olan yılda satırlar "tahmini" kalır; anma günleri ve köprü günleri isteğe bağlı "özel gün" olarak önerilir (otomatik tatil yapılmaz).

## 4. Sonraki adımlar

- Faz 11: adaptörler ve zod şemaları bu tablodaki gerçek yanıt biçimlerine göre yazılır; `check.mjs` bir "sözleşme testi" olarak CI'da haftalık çalıştırılmaz (bitmiş ürün kuralı) ama `npm run verify:sources` ile elle çalıştırılabilir kalır.
- Truncgil ve MET Norway'e kullanım/iletişim e‑postası (User‑Agent'ta otel e‑postası).
