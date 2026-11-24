# 15 — Rust (`rust-anything`) ve TypeScript Performans Karşılaştırma Raporu

> **Tarih:** 2026-11-24  
> **Karar Özeti:** **Electron + TypeScript + SQLite** yığınıyla devam edilmelidir. Mevcut ekran gecikmelerinin nedeni dilin TypeScript olması değil, dil değiştirmeden düzeltilebilen döngü ve sorgu tasarımlarıdır. Kısmi `rust-anything` köprüleri küçük işleri yavaşlatmakta, tam Rust geçişi ise getirisinden çok daha ağır derleme ve bakım maliyeti çıkarmaktadır.

---

## 1. Otel Sahibi İçin Sade Özet

1. **"Program Rust ile yeniden yazılmalı mı?" sorusunun ölçüme dayalı yanıtı: Hayır.**  
   Bilgisayarınızda hem mevcut **TypeScript** kodunu, hem aynı işin **Rust** ile derlenmiş en hızlı sürümünü (`rustc 1.99.0 --release`), hem de 396 MB büyüklüğünde **10 yıllık yoğun test veritabanıyla (20.162 rezervasyon)** doğrudan **Electron** programını çalıştırıp ölçtük.
2. **Şaşırtıcı bulgu — sorun dil değil algoritma:**
   - 10 yıllık oda kapasitesi hesabında mevcut TypeScript kodu **50,86 ms** sürüyordu; yalnızca TypeScript içindeki döngü düzenlendiğinde süre **0,32 ms**'ye (**158,9 kat** hızlanma) düştü. Rust'a geçmeye gerek kalmadan saniyenin binde birinin altına indi.
   - 19.000 rezervasyonun ödeme dağıtımı TypeScript içinde zaten **4,66 ms** sürerken, işi satır satır Rust köprüsünden geçirmek süreyi **206,76 ms**'ye çıkararak programı **44,4 kat yavaşlattı**.
3. **Veritabanı zaten C hızında çalışıyor:**
   - Programın kullandığı `better-sqlite3` altyapısı zaten C dilinde çalışır. 10 yıllık tüm ödemeleri okuma işi SQLite'ta **2,24 ms** sürmektedir. Raporların `303–335 ms`, misafir listesinin `202 ms` sürmesinin nedeni üstündeki TypeScript veri toplama/döngü kodudur; bu katman düzeltildiğinde ek bir dil olmadan hız doğrudan ortaya çıkar.
4. **Electron Hafif Mod bu Mac'te doğrulandı:**
   - 396 MB veritabanıyla normal modda boşta **828 MB** bellek ve **3.094 ms** pencere açılışı ölçüldü.
   - `--light` (Hafif Mod) açıldığında boşta bellek **546 MB**'a (**%34,1 azalma**; Faz 22 referansıyla tutarlı: `-%32 RSS / -%33 PSS`), pencere açılışı **1.314 ms**'ye indi.

---

## 2. Test Ortamı ve Yöntem

- **Donanım / Sistem:** Bu geliştirme Mac'i üzerinde `rustc 1.99.0` / `cargo 1.99.0` (`opt-level = 3`, `lto = true`), Node `v22+` / V8 ve Electron `37.10.3`.
- **Yoğun Test Veritabanı (`seed-calendar.ts --dense` + `seed-perf.ts`):**  
  `396 MB` boyutunda `bismuth.db` (`20` oda, `20.162` misafir, `20.162` rezervasyon, `60.413` oda-gece, `13.363` ödeme, `600` gider, `2026-01-01` – `2037-01-05` tarih aralığı).
- **Doğruluk Şartı (`%100 Parity`):** Tüm karşılaştırmalarda mevcut TypeScript, optimize TypeScript ve Rust çıktılarının sayısal ve mantıksal olarak birebir eşit olduğu doğrulandıktan (`OK_100_PERCENT`) sonra süreler kaydedildi.

---

## 3. Ölçüm A — Saf Hesaplama ve `rust-anything` Köprü Maliyeti

Bu testte Bismuth'un en çok CPU tüketen 3 saf iş mantığı işlevi karşılaştırıldı:
1. **`forEachSellableDay`** (`reports-period.ts`): 20 oda × 10 yıl = `73.060` oda-gün (`69.869` satılabilir gün sonucu).
2. **`allocatePayments`** (`payment-allocation.ts`): `19.000` rezervasyon, toplam `66.500` gece.
3. **`editDistance` / Uyruk Yakınlık Taraması** (`country-map.ts`): `1.000` hatalı yazılmış metin × `240` sözlük kaydı = `240.000` karşılaştırma (`max = 2`).

| İş Yükü | Mevcut Bismuth TS | Optimize TS (Aynı Dil) | Rust `--release` (İç Süre) | Node ↔ Rust Köprü Süresi | Yorum |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Satılabilir Gün (`73.060` oda-gün)** | `50,861 ms` | **`0,320 ms`** (`158,9×` hız) | `0,0158 ms` | — | Algoritmayı TS'de düzeltmek tek başına 159× kazanç sağladı. |
| **Ödeme Dağıtımı (`19.000` rez.)** | **`4,655 ms`** | — | `1,7674 ms` (`2,6×` iç) | `301,550 ms` (toplu süreç)<br>`206,756 ms` (`--worker` tekil 19k çağrı) | V8 JIT 4,66 ms'de bitiriyor; tekil IPC köprüsü **44,4× daha yavaş**. |
| **Yakınlık Mesafesi (`240.000` çift)** | `67,270 ms` | **`15,605 ms`** (`4,3×` hız) | `10,7689 ms` (`1,45×` fark) | — | Gerçek `mapNationality` (`1.000` kayıt): `104,537 ms` (`435` eşleşme). |

**`github.com/erkamyaman/rust-anything` Değerlendirmesi:**
- `rust-anything`, mevcut JS/TS/Python işlevlerini `napi-rs` veya `wasm-bindgen` (ya da sunucu bütününde `app lift`) ile Rust'a taşıyıp kayıt/tekrar/eşdeğerlik doğrulaması (`record/replay/diff/bench`) yapan bir dönüşüm aracıdır.
- Projenin kendi SSS belgeleri de dâhil olmak üzere, küçük ve orta ölçekli tekil çağrılarda JS ↔ Rust sınırından veri geçirmenin (`serde`/serileştirme/FFI maliyeti) V8 JIT'ten **yavaş kaldığını**, yalnız uzun toplu döngülerde (`--batch`) ya da bütün arka uç taşındığında avantaj doğduğunu belirtmektedir.
- Yukarıdaki `206,756 ms` (köprü) vs `4,655 ms` (V8 TS) ölçümü bu kuralı Bismuth verisi üzerinde doğrudan doğrulamıştır.

---

## 4. Ölçüm B — 396 MB Yoğun SQLite Üzerinde Gerçek Servis Hızları

Bu testte arka uç servislerinin gerçek `bismuth.db` (`396 MB`) üzerindeki çalışma süreleri ham `better-sqlite3` SQL sorgularıyla kıyaslanmıştır (`BISMUTH_DRIVE_HOME` geçici klasöre yalıtılı, 3 koşum ortancası).  
*(Veritabanı açılışı `openDatabase`: `660,38 ms` — ağırlıklı olarak açılış `PRAGMA integrity_check` taraması.)*

| Ekran / Servis Çağrısı | Kapsam / Satır Sayısı | Bismuth TS Servis (Ortanca) | Ham SQLite SQL (Ortanca) | Gerçek Darboğaz |
| :--- | :--- | :---: | :---: | :--- |
| **`ledger.getDay`** | 1 yoğun gün (`28` gelir, `22` gider) | **`1,43 ms`** | — | Anlık, sorun yok |
| **`ledger.month`** | 1 yoğun ay (`775` gelir, `600` gider) | **`10,69 ms`** | — | Anlık, sorun yok |
| **`ledger.monthSummary`** | 1 yoğun ay özeti | **`9,88 ms`** | — | Anlık, sorun yok |
| **`calendar.bounds`** | Tüm veri tarih sınırları | **`2,72 ms`** | — | Anlık, sorun yok |
| **`calendar.grid` (35 gün)** | Normal ekran (`167` konaklama) | **`9,33 ms`** | `0,30 ms` | Hızlı (~9 ms) |
| **`calendar.grid` (365 gün)** | Tam yıl takvimi (`1.836` konaklama) | **`89,42 ms`** | `2,60 ms` | Ham SQL `2,60 ms`; kalan ~`86,8 ms` ek sorgular + $O(N^2)$ JS yayılımı (`grid.ts`) |
| **`reports.monthly` (1 ay)** | Aylık finans raporu | **`4,04 ms`** | — | Anlık |
| **`reports.yearly` (2 yıl)** | `[2025, 2026]` kıyaslama | **`4,53 ms`** | — | Anlık |
| **`reports.summary` (1 ay)** | KPI kartları (1 ay) | **`31,35 ms`** | — | `forEachSellableDay` maliyeti |
| **`reports.summary` (1 yıl)** | KPI kartları (1 yıl) | **`54,23 ms`** | — | `forEachSellableDay` + sorgular |
| **`reports.occupancy` (1 yıl)** | Oda/tip doluluk raporu | **`87,88 ms`** | — | `forEachSellableDay` |
| **`reports.summary` (10 yıl)** | `2027-01-01`..`2037-01-01` | **`303,78 ms`** | `2,24 ms` *(11.502 ödeme SQL)* | Ödeme toplamı SQL'i `2,24 ms`; kalan süre diğer rapor sorguları + TS gruplama ve gün taraması |
| **`reports.occupancy` (10 yıl)** | 10 yıllık doluluk raporu | **`335,78 ms`** | — | Doğrusal oda×gün taraması |
| **`guests.list` (tümü)** | `20.162` misafir | **`202,28 ms`** | `5,32 ms` *(ham satır)* | Tüm konaklamaların JS belleğinde birleştirilmesi |
| **`guests.list({ q: 'an' })`** | `5.687` eşleşen misafir | **`176,05 ms`** | `5,32 ms` | JS içi filtreleme yerine SQL sayfalama/FTS eksikliği |

**Çıkarım:** En yavaş görünen `reports.summary (10 yıl)` (`303,78 ms`) ve `guests.list` (`202,28 ms`) işlemlerinde dahi temel SQLite sorguları (`2,24 ms` ve `5,32 ms`) tek haneli milisaniyede tamamlanmaktadır. Geriye kalan süre Electron'dan ya da TypeScript dilinin sınırından değil, `O(N^2)` döngülerden ve SQL tarafında sayfalanmamış JS bellek birleştirmelerinden kaynaklanmaktadır.

---

## 5. Ölçüm C — Bu Mac Üzerinde Electron Çalışma Ölçümleri

`npm run build` ardından `scripts/perf-measure.mjs --runs 1 --idle 10 --no-busy` komutuyla, aynı `396 MB` yoğun 10 yıllık veritabanı kullanılarak ölçülmüştür:

| Ölçüt | Electron Normal (`electron-mac`) | Electron Hafif Mod (`electron-mac-light`) | Fark |
| :--- | :---: | :---: | :---: |
| **Pencere açıldı (ms)** | `3.094 ms` | **`1.314 ms`** | **%57,5 daha hızlı (`2,35×`)** |
| **Uygulama hazır (ms)** | `3.339 ms` | **`1.583 ms`** | **%52,6 daha hızlı** |
| **Takvim çubukları (ms)** | `457 ms` | `456 ms` | Aynı |
| **Boşta süreç sayısı** | `4` | **`3`** *(pencere kapalıyken renderer yok)* | `-1` süreç |
| **Boşta toplam RSS (MB)** | `828 MB` | **`546 MB`** | **`-282 MB` (`-%34,1`)** |
| **Boşta CPU (% tek çekirdek)** | `%0,4` | **`%0,1`** | `4×` daha düşük |
| **Süreç dökümü (RSS / CPU)** | main `397 MB / %0,2` · renderer `280 MB / %0` · gpu `100 MB / %0,1` · utility `51 MB / %0,1` | main `399 MB / %0,1` · gpu `96 MB / %0` · utility `51 MB / %0` | Renderer belleği sıfırlanır |

*(Not: macOS ortamında Linux `smaps` tabanlı PSS değeri üretilmediği için toplam PSS sütunu `–` olarak raporlanır; normalden Hafif Mod'a geçildiğinde ölçülen **-%34,1 RSS** düşüşü, Faz 22 referans ölçümü olan `-%32 RSS / -%33 PSS` ile uyumludur.)*

---

## 6. Üç Mimari Seçeneğin Karşılaştırması

| Kriter | Seçenek 1: Electron + TS + SQLite İyileştirmesi (**Önerilen**) | Seçenek 2: `rust-anything` ile Kısmi Rust Köprüleri (`napi-rs`) | Seçenek 3: Tam Rust Sunucu (`app lift`) veya Tauri Geçişi |
| :--- | :--- | :--- | :--- |
| **Gerçek Performans Kazancı** | En büyük darboğazlarda **100×+** (`50,86 ms -> 0,32 ms`); SQL/algoritma düzeltildikten sonra köprü eklemeden yüksek hız artışı. | Küçük çağrılarda **yavaşlama** (`4,66 ms -> 206,76 ms`); yalnız dev toplu hesapta kâğıt üstü ms altı fark. | Ekran ve veritabanı hâlihazırda ms düzeyinde; günlük kullanımda hissedilir fark yaratmaz. |
| **Bellek (RAM)** | Normal `828 MB`, Hafif Mod `546 MB` (düşük RAM'li Mac için uygun). | Node + Rust bellek ayak izi aynı veya biraz yüksek. | Sunucu biraz küçülse bile webview / arayüz maliyeti sürer. |
| **Para/Kuruş & İş Kuralları Güvenliği** | Tek doğruluk kaynağı (`src/shared/money.ts`), 342 birim test dosyası aynen geçerli. | Aynı iş ve kuruş kuralları iki dilde senkron tutulmak zorunda kalır (hata riski artar). | Tüm Drizzle/servis/test altyapısının yeniden yazılması ve tek tek yeniden doğrulanması gerekir. |
| **Çapraz Platform Paketleme (Mac + Windows)** | Mevcut `electron-builder` akışı hazır (`npm run build` ~10 sn), çevrimdışı çalışır. | Windows x64 + macOS arm64/x64 için yerel `.node` derleme ve imzalama zinciri gerekir. | `K-62` kararına aykırı; tüm kurulum, otomatik başlatma, yazdırma ve E2E testleri sıfırdan kurulur. |

---

## 7. Sonuç ve Önerilen Eylem Planı

1. **Karar (`K-62` teyidi):** Bismuth'un masaüstü kabuğu **Electron**, ana uygulama dili **TypeScript** ve veritabanı motoru **`better-sqlite3` (SQLite)** olarak kalmalıdır. `rust-anything` dönüşümü şu aşamada uygulanmayacaktır.
2. **Hemen yapılabilecek yüksek getirili hız iyileştirmeleri (Dalga 3 içinde):**
   - `src/shared/domain/reports-period.ts` (`forEachSellableDay`) → aralık süpürmesine dönüştürme (`50,86 ms -> 0,32 ms`, sıfır köprü).
   - `src/main/services/guests-service.ts` (`guests.list`) → tüm misafir/konaklama geçmişini JS'e çekmek yerine SQL sayfalama ve arama dizini (`202,28 ms` yerine ham SQL düzeyine yaklaşma).
   - `src/main/services/calendar/grid.ts` (365 günlük aralık) → $O(N^2)$ yerine tarih indeksli yerleştirme (`89,42 ms` yerine ham SQL düzeyine yaklaşma).
   - `tourism-stats-service.ts` (`capacityOf`) ve `currency-service.ts` (`ratesFor`) → N+1 SQL döngülerinin tek toplu sorguya indirilmesi.
