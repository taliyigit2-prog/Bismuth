# Optional-internet APIs for an offline-first hotel app (Istanbul) — research report

Date: 2026-10-01. Scope: public-apis/public-apis README (fetched 2026-10-01, 2 465 lines) plus
TCMB, ECB, MET Norway, date-holidays and a few offline npm libraries.

## 0. How this was verified (read first)

| What | How verified |
|---|---|
| public-apis README (all sections) | Fetched raw from GitHub, read section by section. Its Auth/HTTPS/CORS columns are community-maintained and often stale; treat them as hints. |
| `date-holidays` TR behaviour | Installed v3.37.0 from npm in this session, ran it for 2026/2027/2030/2033/2036 (output below). |
| Ramazan/Kurban Bayramı dates 2026–2036 | Computed with `hijridate` (Umm al-Qura) in this session, cross-checked against `date-holidays` output and a tabular-Hijri algorithm. |
| `@fawazahmed0/currency-api` liveness | npm registry metadata: 944 versions, a version published every day, latest `2026.10.1` published 2026-10-01 05:18 UTC. |
| Nager.Date Islamic-holiday policy | Its README (fetched): "such holidays are not included in this project". |
| Open-Meteo licence | Its README (fetched): free for non-commercial use, CC BY 4.0 data, "for commercial use contact us". |
| exchangerate.host | Web search: now an APILayer product, `access_key` required, free tier 100 req/month. |
| TCMB / ECB / open.er-api / Frankfurter / jsDelivr / MET Norway / TheSportsDB **live responses** | **Not reachable from this sandbox** (egress policy denied every host except GitHub raw and the npm/PyPI registries). Formats below come from the providers' documentation and from the author's prior knowledge of these endpoints; they are marked "(doc)" and should be smoke-tested once from a dev machine before the Döviz tab is wired. |

Design rule that applies to every API below: **the app never needs the network**. Each feature has a
SQLite-cached last-good value, a "veri tarihi / kaynak" staleness badge, and a manual-entry form. Network
calls run from the Electron main process (or Tauri Rust side) with a 5–8 s timeout, never from the renderer
(this also sidesteps CORS entirely, so the CORS column below only matters if you ever call from a webview).

---

## 1. CURRENCY (TRY/USD/EUR/GBP/RUB)

### 1.1 The "Currency Exchange" section of the README, evaluated

| API | Auth | Free limit | TRY base? | RUB? | GBP? | Freshness | Maintenance / fit for an unmaintained product |
|---|---|---|---|---|---|---|---|
| **Frankfurter** (api.frankfurter.app, also api.frankfurter.dev/v1) | none | unlimited (fair use) | yes (any ECB currency as base) | **no** (ECB suspended RUB on 1 Mar 2022) | yes | ECB reference rates, once per TARGET business day ~16:00 CET | Open-source (lipis/frankfurter), running since 2018, self-hostable, CORS yes. Solid tertiary. |
| **ExchangeRate-API open endpoint** (open.er-api.com/v6/latest/TRY) | none | "once/day refresh, cached by IP"; attribution link required | yes | yes | yes | daily (00:00 UTC) | Commercial company's free open endpoint; has existed since 2018; response carries `time_eol_unix` so the app can detect sunset. CORS yes. Good secondary. |
| **Currency-api (fawazahmed0/exchange-api)** via jsDelivr + Cloudflare Pages mirror | none | **no rate limits** | yes (`/currencies/try.json`) | yes (`rub`) | yes | daily; file dated | Single maintainer, but published daily to npm/jsDelivr without a gap since 2020 (verified today). Two independent CDNs. CORS yes. Good secondary/tertiary. |
| Exchangerate.host | **apiKey** (APILayer) | 100 req/month | paid plans only for base change | yes | yes | daily on free | Became keyed in 2023. **Reject.** |
| Exchangeratesapi.io / Fixer / Currencylayer | apiKey | 100 req/month, EUR/USD base only | no | yes | yes | hourly-daily | Keyed APILayer products. **Reject.** |
| CurrencyBeacon / CurrencyFreaks / CurrencyScoop / Rate-API / Amdoren / 1Forge | apiKey | 1k–5k/month | varies | varies | yes | varies | Keyed startups. **Reject** (a key can be revoked; product unmaintained). |
| Exchangerate.dev | none | 10k/month | yes | ? | yes | ? | New (2025) commercial site "Frankfurter-compatible". Unproven. Do not depend on it. |
| Fulusly, FXpeek, api-mint, Economia.Awesome (BRL), Daleelak (EGP), paralelo.bo (BOB), FreeForexAPI | none | — | partly | — | — | — | Hobby or regional projects. **Reject.** |
| Bank of Russia (cbr.ru/scripts/XML_daily.asp) | none | unlimited | no (RUB base; has TRY, USD, EUR, GBP rows) | yes | yes | daily, business days | Central bank, stable, windows-1251 XML, no CORS. Optional RUB cross-check only; may be unreachable from some networks. |
| Czech National Bank / National Bank of Poland | none | unlimited | no (CZK/PLN base) | CNB no, NBP no (both dropped RUB) | yes | daily | Stable but not useful here. |
| VATComply /rates | none | unlimited | yes | no (ECB) | yes | daily | Same data as Frankfurter (ECB). Redundant. |

### 1.2 Outside the README: TCMB (Türkiye Cumhuriyet Merkez Bankası) — recommended PRIMARY

* URL today: `https://www.tcmb.gov.tr/kurlar/today.xml`
* URL archive: `https://www.tcmb.gov.tr/kurlar/YYYYMM/DDMMYYYY.xml` e.g. `https://www.tcmb.gov.tr/kurlar/202609/30092026.xml`
  (archive files exist only for business days; weekends/holidays → HTTP 404 HTML page. `today.xml` always
  contains the latest bulletin, so on Saturday it still serves Friday's.)
* Auth: none. HTTPS: yes. CORS: no `Access-Control-Allow-Origin` → fetch from main process.
* Update time: "gösterge niteliğindeki kurlar" are announced each business day at **15:30 Türkiye time**
  and `today.xml` is replaced then. On half-day arife (bayram eves) the bulletin is still published.
* Freshness: daily (business days). Encoding UTF-8. Numbers use `.` decimal. `Unit` can be 100 (JPY, IRR).
* Coverage: USD, AUD, DKK, EUR, GBP, CHF, SEK, CAD, KWD, NOK, SAR, JPY, BGN, RON, **RUB**, IRR, CNY, PKR,
  QAR, KRW, AZN, AED, XDR. RUB has been kept in the bulletin after 2022 (Russian tourism), which is exactly the
  gap ECB-based APIs have. For a few minor currencies the `Banknote*` elements are empty — parse defensively.
* Reliability: Turkish central bank, format unchanged since 2004 (post-YTL). The safest thing to depend on for
  a product that will not be maintained. Also the *legally relevant* rate in Türkiye (invoices, KDV, tax).
* Also exists: TCMB **EVDS** REST API — requires registration + key. Not needed; skip.

Sample `today.xml` (doc; structure verbatim, numbers illustrative):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="isokur.xsl"?>
<Tarih_Date Tarih="01.10.2026" Date="10/01/2026" Bulten_No="2026/185">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit>
    <Isim>ABD DOLARI</Isim>
    <CurrencyName>US DOLLAR</CurrencyName>
    <ForexBuying>41.6598</ForexBuying>
    <ForexSelling>41.7349</ForexSelling>
    <BanknoteBuying>41.6307</BanknoteBuying>
    <BanknoteSelling>41.7975</BanknoteSelling>
    <CrossRateUSD/>
    <CrossRateOther/>
  </Currency>
  <Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR">
    <Unit>1</Unit><Isim>EURO</Isim><CurrencyName>EURO</CurrencyName>
    <ForexBuying>48.8900</ForexBuying><ForexSelling>48.9781</ForexSelling>
    <BanknoteBuying>48.8558</BanknoteBuying><BanknoteSelling>49.0516</BanknoteSelling>
    <CrossRateUSD/><CrossRateOther>1.1735</CrossRateOther>
  </Currency>
  <Currency CrossOrder="10" Kod="GBP" CurrencyCode="GBP"> ... </Currency>
  <Currency CrossOrder="15" Kod="RUB" CurrencyCode="RUB">
    <Unit>1</Unit><Isim>RUS RUBLESİ</Isim><CurrencyName>RUSSIAN ROUBLE</CurrencyName>
    <ForexBuying>0.5012</ForexBuying><ForexSelling>0.5078</ForexSelling>
    <BanknoteBuying>0.4975</BanknoteBuying><BanknoteSelling>0.5116</BanknoteSelling>
    <CrossRateUSD>83.14</CrossRateUSD><CrossRateOther/>
  </Currency>
  <Currency CrossOrder="11" Kod="JPY" CurrencyCode="JPY"><Unit>100</Unit> ... </Currency>
</Tarih_Date>
```

Field meaning: `ForexBuying/ForexSelling` = döviz alış/satış (bank-transfer rate); `BanknoteBuying/BanknoteSelling`
= efektif alış/satış (cash). All are **TRY per `Unit` of the foreign currency**.
Conversion of 2 500 TL: `2500 / (ForexSelling / Unit)`; for display use the mid `(ForexBuying+ForexSelling)/2`
and let the owner pick "Döviz alış / satış / efektif / orta" in settings.
Cross rates between two foreign currencies: `USD→EUR = midTRY(USD) / midTRY(EUR)`.

### 1.3 ECB (European Central Bank) — informational

* `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml` (also `-hist-90d.xml`, `-hist.xml`).
* No key, HTTPS, no CORS. ~16:00 CET on TARGET days. 30 currencies incl. TRY, USD, GBP, JPY, CNY; **no RUB**.
* Shape (doc): `<gesmes:Envelope><Cube><Cube time="2026-10-01"><Cube currency="USD" rate="1.1735"/>...<Cube currency="TRY" rate="48.95"/></Cube></Cube></gesmes:Envelope>`
* Frankfurter is just this data with a JSON API, so use Frankfurter instead of parsing ECB XML yourself; keep ECB only as the explanation of why RUB is missing there.

### 1.4 Recommended chain for the Döviz tab

```
1. TCMB today.xml                 official TRY rates, RUB included, business days 15:30 TR
2. open.er-api.com/v6/latest/TRY  no key, daily, RUB included; stop using if time_eol_unix != 0
3. cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/try.json
   → on failure latest.currency-api.pages.dev/v1/currencies/try.json   no key, daily, RUB included
4. api.frankfurter.app/latest?from=TRY&to=USD,EUR,GBP   no key, ECB, NO RUB (keep RUB from cache)
5. SQLite cache (last good values, with source + bulletin date)   ← always displayed first
6. Manual entry / override by the owner (per currency, with "elle girildi" flag)
```

Refresh policy: on app start and then hourly while online; for TCMB only re-fetch after 15:35 TR on a
business day (compare `Bulten_No`/`Tarih` with the cached one). Show "Kaynak: TCMB · Bülten 2026/185 ·
01.10.2026 15:30 · 2 gün önce" under the table. Never block UI; stale is fine, hidden is not.
Keep 5-year history by storing every bulletin row (tiny: 23 rows/day) so "geçmiş kur" lookups for old
invoices work offline (TCMB archive URL can backfill gaps when online).

RUB availability summary: TCMB yes · open.er-api yes · currency-api yes · CBR yes · Frankfurter/ECB/VATComply **no**
· CNB/NBP **no**. GBP: all of them.

---

## 2. WEATHER (Istanbul, no key)

| API | Auth | Limits | Istanbul forecast | Licence / fit |
|---|---|---|---|---|
| **MET Norway Locationforecast 2.0** (api.met.no) | none, but a descriptive `User-Agent` header is **mandatory** (`HotelCRM/1.0 contact@example.com`) — requests without it get 403 | ≤20 req/s, must honour `Expires`/`If-Modified-Since` | yes, hourly up to ~9 days, global ECMWF-based | Government institute (Norwegian Met Institute), CC BY 4.0, **explicitly free for commercial use** with attribution. Best primary for a business. Not in the README table (listed as "Meteorologisk Institutt", auth `User-Agent`). |
| **Open-Meteo** (api.open-meteo.com) | none | <10 000 req/day | yes, current + 16-day daily, WMO codes, `timezone=Europe/Istanbul` | Open-source, excellent, CORS yes. BUT README states "free for **non-commercial** use… for commercial use contact us" (paid API ~€29/mo). A hotel back-office is commercial; usage would be a licence grey zone. Use as fallback or get the owner's OK. |
| wttr.in | none | — | yes | One-person hobby server, frequent outages. Reject. |
| 7Timer!, ODWeather, weather-api (robertoduessmann) | none | — | partial | No HTTPS / hobby. Reject. |
| Meltema, Pirate Weather | none / key | — | yes | New or key-gated (Pirate Weather needs a key). Reject. |
| OpenWeatherMap, WeatherAPI, Weatherbit, Visual Crossing, Tomorrow, AccuWeather | apiKey | 1 000/day class | yes | Keyed → reject for unmaintained product. |
| MGM (Türkiye Meteoroloji) `servis.mgm.gov.tr` | none (needs `Origin: https://www.mgm.gov.tr` header) | undocumented | yes (Istanbul merkez IDs) | Official Turkish source but **undocumented internal API** that can change silently. Do not depend; optional "bonus" only. |

Open-Meteo request (doc):

```
GET https://api.open-meteo.com/v1/forecast?latitude=41.0082&longitude=28.9784
    &current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m
    &daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max
    &timezone=Europe/Istanbul&forecast_days=7
```
```json
{"latitude":41.0,"longitude":29.0,"utc_offset_seconds":10800,"timezone":"Europe/Istanbul",
 "current":{"time":"2026-10-01T22:30","temperature_2m":18.4,"weather_code":3,"wind_speed_10m":12.1,"relative_humidity_2m":71},
 "daily":{"time":["2026-10-02","2026-10-03"],"weather_code":[61,3],
          "temperature_2m_max":[21.3,22.0],"temperature_2m_min":[15.1,14.8],"precipitation_probability_max":[70,10]}}
```
WMO code → icon/text mapping is static (0 açık, 1–3 bulutlu, 45/48 sis, 51–67 yağmur, 71–77 kar, 80–82 sağanak, 95–99 fırtına).

MET Norway request (doc):

```
GET https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=41.0082&lon=28.9784
Headers: User-Agent: HotelCRM/1.0 (contact: owner@example.com)
```
```json
{"type":"Feature","properties":{"meta":{"updated_at":"2026-10-01T19:31:12Z","units":{"air_temperature":"celsius"}},
 "timeseries":[{"time":"2026-10-01T20:00:00Z","data":{
   "instant":{"details":{"air_temperature":18.2,"wind_speed":3.1,"relative_humidity":70.5}},
   "next_1_hours":{"summary":{"symbol_code":"partlycloudy_night"},"details":{"precipitation_amount":0.0}},
   "next_6_hours":{"summary":{"symbol_code":"rain"},"details":{"air_temperature_max":19.0,"air_temperature_min":16.2,"precipitation_amount":2.1}}}}]}}
```
Symbol codes (`clearsky_day`, `rain`, …) map to the MIT-licensed `metno/weathericons` SVG set, bundled offline.

Degradation: cache last forecast JSON; show it with "son güncelleme" time; if older than 24 h, hide the
daily cards and keep only the "veri yok" note. Weather is cosmetic — never put it on the critical path.

---

## 3. HOLIDAYS / CALENDAR

### 3.1 Online APIs in the README

| API | Auth | TR coverage | Islamic holidays (Bayram)? | Fit |
|---|---|---|---|---|
| Nager.Date (date.nager.at/api/v3/PublicHolidays/2026/TR) | none | fixed-date national holidays | **No — README: "such holidays are not included"** | Stable open-source (.NET) project, but useless for Türkiye's most important holidays. |
| caldays, The Calendar, Non-Working Days (icsdb) | none | partial | unknown/none | Small/new; icsdb is a static ICS repo (could be vendored). |
| Calendarific | apiKey | yes incl. religious | yes | 500 req/month free; keyed → reject. |
| Abstract Public Holidays, Festivo, Holidays (holidayapi.com), Checkiday | apiKey | yes | yes | Keyed → reject. |

Conclusion: **do not use a holiday API at all.** Generate offline.

### 3.2 Offline: `date-holidays` (npm) — verified in this session

* v3.37.0, published 2026-09-20, actively maintained (commenthol), ISC code / CC BY-SA 3.0 data (needs an
  attribution line in "Hakkında").
* TR rules (data/countries/TR.yaml, fetched): 01-01, 04-23, 05-01, 05-19, 07-15, 08-30, 10-29,
  `1 Shawwal PT90H` (Ramazan Bayramı), `10 Dhu al-Hijjah PT114H` (Kurban Bayramı). Languages tr/en.
* Islamic calendar: parser ships a **precomputed Hijri table 1970–2080** (`date-holidays-parser/lib/internal/hijri-calendar`, Umm al-Qura-like); README caveat: "islamic dates might not be correct as they are subject to the sighting of the moon".
* Actual output for 2026 (this session):

```
2026-01-01 Yılbaşı
2026-03-20 Ramazan Bayramı   start 2026-03-19 18:00 Istanbul → end 2026-03-23 12:00   (rule 1 Shawwal PT90H)
2026-04-23 Ulusal Egemenlik ve Çocuk Bayramı
2026-05-01 Emek ve Dayanışma Günü
2026-05-19 Atatürk'ü Anma Gençlik ve Spor Bayramı
2026-05-27 Kurban Bayramı    start 2026-05-26 18:00 → end 2026-05-31 12:00            (rule 10 Dhu al-Hijjah PT114H)
2026-07-15 Demokrasi ve Millî Birlik Günü
2026-08-30 Zafer Bayramı
2026-10-29 Cumhuriyet Bayramı
```
Gaps to fix in app code: (a) its Bayram span is "sunset of arife + 90/114 h", not the official
"arife 13:00 + 3/4 full days"; (b) **28 Ekim 13:00 half day** is missing; (c) no "idari izin" bridge days
(government declares them ad hoc, e.g. 9-day bayram) — these need manual entry; (d) Türkiye has no
"in-lieu" Monday rule, so nothing to add there.

### 3.3 Recommended strategy: pre-generated 10-year table + override

1. At build time run a script (`scripts/gen-holidays.ts`) that uses `date-holidays` for the fixed dates and
   the Hijri conversions, then **normalises** each Bayram into rows: `arife (yarım gün, 13:00)`, `1. gün`,
   `2. gün`, `3. gün` (+ `4. gün` for Kurban); adds `28 Ekim (yarım gün)`; emits `holidays-tr-2026-2036.json`
   bundled with the app.
2. The owner can edit any row in the app (Ayarlar → Tatiller): add idari izin days, shift a Bayram by one day if
   Diyanet announces differently, add school-holiday and local-event rows.
3. Each January, if online, optionally re-check nothing — there is no reliable free TR API; manual is the
   source of truth. (Diyanet publishes "Dini Günler" lists years ahead at diyanet.gov.tr; verify once before release.)

Bayram dates 2026–2036 computed here (Umm al-Qura via `hijridate`; identical to `date-holidays` for all
sampled years; tabular-civil algorithms differ by +1 day in 2027, 2028, 2029, 2030, 2031, 2033, 2035, 2036 —
so do NOT use a naive tabular converter). **Verify against Diyanet before shipping; ±1 day possible.**

| Year | Ramazan Bayramı (arife → days) | Kurban Bayramı (arife → days) |
|---|---|---|
| 2026 | arife 19 Mar · 20–22 Mar (Cum–Paz) | arife 26 May · 27–30 May (Çar–Cmt) |
| 2027 | arife 8 Mar · 9–11 Mar | arife 15 May · 16–19 May |
| 2028 | arife 25 Şub · 26–28 Şub | arife 4 May · 5–8 May |
| 2029 | arife 13 Şub · 14–16 Şub | arife 23 Nis · 24–27 Nis |
| 2030 | arife 3 Şub · 4–6 Şub | arife 12 Nis · 13–16 Nis |
| 2031 | arife 23 Oca · 24–26 Oca | arife 1 Nis · 2–5 Nis |
| 2032 | arife 13 Oca · 14–16 Oca | arife 21 Mar · 22–25 Mar |
| 2033 | arife 1 Oca · 2–4 Oca **and** arife 22 Ara · 23–25 Ara (two in one year) | arife 10 Mar · 11–14 Mar |
| 2034 | arife 11 Ara · 12–14 Ara | arife 28 Şub · 1–4 Mar |
| 2035 | arife 30 Kas · 1–3 Ara | arife 17 Şub · 18–21 Şub |
| 2036 | arife 18 Kas · 19–21 Kas | arife 6 Şub · 7–10 Şub |

Fixed resmi tatiller every year: 1 Ocak, 23 Nisan, 1 Mayıs, 19 Mayıs, 15 Temmuz, 30 Ağustos, 28 Ekim (13:00'dan itibaren), 29 Ekim.

### 3.4 Notable (non-holiday) dates a hotel cares about — bundle as a static list

* 14 Şubat Sevgililer Günü · 8 Mart Dünya Kadınlar Günü · Anneler Günü (Mayıs 2. Pazar) · Babalar Günü (Haziran 3. Pazar) · 24 Kasım Öğretmenler Günü · 10 Kasım (09:05, anma; not a holiday) · 31 Aralık Yılbaşı gecesi (gala dinner) · 21 Mart Nevruz · 6 Mayıs Hıdırellez · 27 Eylül Dünya Turizm Günü.
* Ramazan ayı başlangıcı (iftar/sahur service), Kadir Gecesi (27 Ramazan), kandiller (Mevlid, Regaip, Miraç, Berat) — all derivable from the same Hijri table (`date-holidays` cannot, but `hijridate`-style conversion of 12 Rabi I, 1st Thu of Rajab, 27 Rajab, 15 Shaban, 27 Ramadan can be precomputed in the same generator).
* Foreign-guest calendars: Orthodox Christmas 7 Jan and Russian New Year holidays 1–8 Jan (Russian guests), Western Christmas 24–26 Dec, Catholic & Orthodox Easter (both computed by `date-holidays` for e.g. `DE`/`RU`/`GR`), Chinese New Year, Eid for Gulf guests (same table), 9 May (RU).
* MEB school holidays (yarıyıl ~late Jan 2 weeks; ara tatiller Nov/Apr; summer mid-Jun–Sep) and Istanbul Marathon (Nov Sunday, bridge closed) — announced yearly → manual entry rows.
* Time-zone note: Türkiye stays at UTC+3 all year; EU/UK/RU offsets shift in Mar/Oct — useful for guest communication, computable offline with `Intl`.

---

## 4. OTHER OPTIONAL APIs — critical review (only what adds value for a small hotel)

Most "needs" here are better met by an **offline npm library** than by any API. Verified versions from npm today:

| Need | Recommended | Why / notes |
|---|---|---|
| Phone number validation & formatting (guest records, +90 and foreign) | `libphonenumber-js` 1.13.14 (2026-09-24), offline | Google's metadata; no API. README's Numverify/Veriphone/Abstract are all keyed → reject. |
| IBAN validation (deposits, refunds) | `ibantools` 4.5.4 (2026-04-10), offline | Mod-97 + per-country length (TR = 26). openiban.com is defunct/unreliable; "IBAN Analyzer" is new; Temsor/EuroValidate keyed. |
| TC Kimlik No check | 20-line checksum algorithm, offline | Public algorithm (digits 1–9 weighted; digit 11 = sum mod 10). No API needed (Temsor is keyed). |
| QR codes (Wi-Fi `WIFI:T:WPA;S:..;P:..;;`, vCard, Google review link, payment IBAN) | `qrcode` 1.5.4, offline (SVG/PNG) | goqr.me / qrtag / QR Code Crafter are no-key but pointless when a 40 KB library does it offline. |
| Country list, nationality dropdown, flags | Bundle at build time: `i18n-iso-countries` or `countries-list` + emoji flags (or `flagcdn.com/w40/tr.png` when online) | REST Countries v3.1 is no-key/CORS but had multi-day outages (2023) and now requires `?fields=` on `/all`; data changes ~never, so vendoring is strictly better. |
| VAT / KDV | Static table (konaklama %10 since 7/2023, genel %20, %1) | No API. e-Fatura/GİB integration is a separate keyed, regulated topic — out of scope. |
| Translation of guest messages | **Not** an API: LibreTranslate's public instance (libretranslate.com) now requires a paid API key; self-hosting is a 2 GB docker. Bundle a static TR/EN/RU/DE/AR phrasebook instead. | Hirak/Kiprio/Langbly keyed. |
| Prayer times for Muslim guests (namaz vakitleri, kıble) | `adhan` npm (MIT), offline, with Diyanet parameters (fajr 18°, isha 17°) | Aladhan API (not in README; no key, `method=13` = Diyanet) is a reasonable online cross-check but unnecessary. |
| Sunrise/sunset (housekeeping, terrace) | `suncalc`, offline | README's sunrise-sunset.org is no-key but has no CORS and no SLA. |
| Geocoding / map | Nominatim (no key, 1 req/s, `User-Agent` required, OSM policy) | Only if you ever add "mesafe" to airport/attractions; otherwise skip entirely. |
| Earthquake notice (Istanbul) | USGS FDSN (`earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=41&longitude=29&maxradiuskm=150&minmagnitude=4`) no key; AFAD `deprem.afad.gov.tr/apiv2/event/filter` no key (TR gov, undocumented) | Low priority; a dashboard "son 24 saat" line. Purely optional. |
| PDF (confirmations, invoices) | `pdfmake` / `@react-pdf/renderer`, offline | Every PDF API in README is keyed. |
| OCR passport/ID (MRZ) for check-in & KBS reporting | `tesseract.js` + `mrz` npm, offline (large but local) | README OCR APIs keyed. KBS (Jandarma Kimlik Bildirim) has no public API — manual export only. |
| Dictionary / text analysis / email / cloud storage / productivity SaaS | none | No value for a 20-room hotel back-office; all keyed or SaaS. |

### 4.1 Sports: Süper Lig / Fenerbahçe match days

| API | Auth | Süper Lig? | Verdict |
|---|---|---|---|
| football-data.org | key (free registration) | **No** — free TIER_ONE covers 12 competitions (PL, ELC, BL1, SA, PD, FL1, DED, PPL, CL, EC, WC, BSA) | Reject. |
| API-FOOTBALL (api-sports) | key | yes (league id 203) | Free 100 req/day, but keyed → reject for an unmaintained product. |
| **TheSportsDB** v1 | free test key `3` in the URL (not a personal key) | yes — league id **4339** "Turkish Super Lig" (doc, not live-verified) | Crowd-sourced; free key rate-limited (~30 req/min) and some endpoints are Patreon-only; fixture completeness varies. OK as a *best-effort* optional source. |
| SportScore, Football Standings (azharimm, scrapes ESPN), QiuXiaoCe | none | maybe | Hobby/scrapers. Reject. |

TheSportsDB (doc):
```
GET https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=4339        # next 15 league fixtures
GET https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=Fenerbahce         # → idTeam
GET https://www.thesportsdb.com/api/v1/json/3/eventsnext.php?id=<idTeam>           # next 5 team fixtures
```
```json
{"events":[{"idEvent":"2141234","strEvent":"Fenerbahce vs Galatasaray","strHomeTeam":"Fenerbahce","strAwayTeam":"Galatasaray",
  "dateEvent":"2026-10-04","strTime":"16:00:00","strTimestamp":"2026-10-04T16:00:00","strVenue":"Ülker Stadyumu","strLeague":"Turkish Super Lig","idLeague":"4339"}]}
```
(`strTime` is UTC.) **Recommendation:** implement a generic **ICS import** ("Etkinlik takvimi" → paste an .ics URL or
file; fan-maintained Süper Lig/Fenerbahçe calendars exist, as do concert/marathon feeds), plus manual events.
Use TheSportsDB only as an optional pre-fill behind a feature flag; if it fails, nothing breaks.

---

## 5. Minimal fetch examples (TypeScript, main process)

### 5.1 TCMB
```ts
import { XMLParser } from 'fast-xml-parser';
export async function fetchTcmb(signal: AbortSignal) {
  const res = await fetch('https://www.tcmb.gov.tr/kurlar/today.xml', { signal, headers: { 'User-Agent': 'HotelCRM/1.0' } });
  if (!res.ok) throw new Error(`TCMB ${res.status}`);
  const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(await res.text());
  const root = xml.Tarih_Date;                       // { Tarih:'01.10.2026', Date:'10/01/2026', Bulten_No:'2026/185', Currency:[...] }
  return {
    source: 'TCMB', bulletin: root.Bulten_No, date: root.Tarih,
    rates: (root.Currency as any[]).map(c => ({
      code: c.CurrencyCode, unit: Number(c.Unit),
      forexBuying: num(c.ForexBuying), forexSelling: num(c.ForexSelling),
      banknoteBuying: num(c.BanknoteBuying), banknoteSelling: num(c.BanknoteSelling),
    })),
  };
}
const num = (v: unknown) => (v === '' || v == null ? null : Number(v));
// 2500 TL → USD:  2500 / (forexSelling / unit)
```

### 5.2 open.er-api.com
```ts
const r = await (await fetch('https://open.er-api.com/v6/latest/TRY')).json();
// {"result":"success","provider":"https://www.exchangerate-api.com","documentation":"https://www.exchangerate-api.com/docs/free",
//  "terms_of_use":"https://www.exchangerate-api.com/terms","time_last_update_unix":1759276801,
//  "time_last_update_utc":"Wed, 01 Oct 2026 00:00:01 +0000","time_next_update_unix":1759363201,
//  "time_next_update_utc":"Thu, 02 Oct 2026 00:00:01 +0000","time_eol_unix":0,"base_code":"TRY",
//  "rates":{"TRY":1,"USD":0.02397,"EUR":0.02043,"GBP":0.01782,"RUB":1.97,...}}   // 160+ codes, rates = foreign per 1 TRY
if (r.result !== 'success') throw new Error(r['error-type']);
if (r.time_eol_unix) markSourceDeprecated('er-api');      // endpoint announced end-of-life
// Attribution required: show "Rates by Exchange Rate API" link when this source is displayed.
```

### 5.3 fawazahmed0 currency-api (jsDelivr → pages.dev)
```ts
const urls = ['https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/try.min.json',
              'https://latest.currency-api.pages.dev/v1/currencies/try.min.json'];
for (const u of urls) { try { const j = await (await fetch(u)).json(); /* {"date":"2026-10-01","try":{"usd":0.02397,"eur":0.02043,"gbp":0.01782,"rub":1.97,"xau":0.0000062,...}} */ return j; } catch {} }
// lowercase ISO codes; rates = foreign per 1 TRY; also has xau/xag (gram altın = 1/xau/31.1035 TRY) and crypto.
// Dated snapshot: .../currency-api@2026-09-30/v1/currencies/try.json
```

### 5.4 Frankfurter (ECB) — no RUB
```ts
const j = await (await fetch('https://api.frankfurter.app/latest?from=TRY&to=USD,EUR,GBP')).json();
// {"amount":1.0,"base":"TRY","date":"2026-10-01","rates":{"EUR":0.02043,"GBP":0.01782,"USD":0.02397}}
// Unknown currency (RUB) → HTTP 404 {"message":"not found"}; business days only ("date" tells you which).
```

### 5.5 Weather — see section 2 for both request/response shapes.

### 5.6 Holidays (build-time generator)
```ts
import Holidays from 'date-holidays';
const hd = new Holidays('TR', { languages: ['tr'] });
for (let y = 2026; y <= 2036; y++) for (const h of hd.getHolidays(y)) { /* h.date 'YYYY-MM-DD 00:00:00', h.name, h.rule */ }
// Normalise rules '1 Shawwal PT90H' / '10 Dhu al-Hijjah PT114H' into arife(13:00)+3/4 days; add 10-28 half day.
```

---

## 6. Feature ideas (optional, internet-enhanced, all with offline fallback)

1. **Döviz tab** — TCMB table (alış/satış/efektif), 2 500 TL → USD/EUR/GBP/RUB converter, gram altın via currency-api `xau`, 30-day sparkline from stored bulletins, "elle gir" override. Source + bulletin + staleness badge.
2. **Hava durumu card** on the dashboard (MET Norway primary, Open-Meteo fallback): 7-day Istanbul forecast for housekeeping/terrace planning and for printing on the welcome card.
3. **Takvim / doluluk heat-map** with the bundled 2026–2036 holiday + notable-date layer (Bayram, Sevgililer, Orthodox Christmas, school breaks) and owner-editable rows; drives a "bayram fiyat dönemi" hint in rate planning.
4. **Etkinlik takvimi via ICS import** (Fenerbahçe/Süper Lig, concerts, marathon, fairs) + manual entries; optional TheSportsDB pre-fill. Shows "bu hafta sonu derbi — talep yüksek" on the dashboard.
5. **Guest-facing printables generated offline**: Wi-Fi QR, Google-review QR, vCard QR, namaz vakitleri & kıble card (`adhan`), today's exchange rates sheet — one click, no network.
6. (Lower priority) Istanbul earthquake "son 24 saat" line (USGS/AFAD), and a "yurt dışı saat farkı" widget (pure `Intl`).

Not worth it: translation APIs, geocoding, dictionary, email/SMS gateways, any keyed startup API.
