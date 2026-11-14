# 11 — Rust'a geçiş araştırması ve karar önerisi (sahip yönergesi B.1)

> Hazırlayan: Fable (2026-11-13). Sahip: "Birçok program Rust diline geçiriliyor; sebebi güvenlik ve hız. Bu programı da
> Rust'a geçirmek istiyorum. Oteldeki bilgisayar güçlü değil; hızlı çalışması ve yük olmaması gerekiyor." Bu tur kod
> dönüştürmez; **ölçer, karşılaştırır, karar önerir ve plana paket koyar.** Kaynaklar: `researcher` ajanı (resmî Tauri/
> Electron/crates.io belgeleri + ikincil bloglar), bu Codespace'te `xvfb` ile yapılan ölçüm (`.tmp/perf/`, §2), daha önceki
> yığın araştırması `docs/plan/04-arastirma/masaustu-yigin.md` (K-01: Electron seçimi, 2026-10-01).

## 1. Kısa cevap (sahibe)

- Ölçüm (§2): boşta 693 MB'ın 421 MB'ı Electron tabanı (Xvfb; gerçek Windows'ta daha az), 271 MB'ı program; programın
  payının **149 MB'ı ana süreçte** (Node servisler + SQLite), 103 MB'ı arayüzde. CPU boşta %0, yoğunda ortalama %19. Kabuğu Rust/Tauri ile değiştirmek bu payı **kısmen** azaltır (Windows'ta
  Tauri de Chromium tabanlı WebView2 kullanır), **arayüzü hızlandırmaz**.
- Tam Rust'a geçiş = ~180 bin satır TypeScript'in (servisler 64 bin, arayüz 100 bin, ortak 16 bin), 224 test dosyasının
  (2.427 test) ve 19 migrasyonun yeniden yazılması. Bu, programı bir yıl geriye alır ve bugünkü resepsiyon sorunlarını
  çözmez. **Önermiyorum.**
- Sahip "geçmek istiyorum" dediği için en düşük riskli yol: **(1)** önce Electron'u ölçüp hafifletmek (bu belgede),
  **(2)** arayüzü kabuktan tamamen bağımsız tutan mevcut mimariyi (HTTP taşıma, sunucu modu) kullanarak **Tauri 2 kabuk +
  Node yan süreç** prototipi yapıp **aynı makinede ölçmek**, **(3)** ölçüm gerçek kazanç gösterirse geçişi, göstermezse
  Electron'u sürdürmeyi sahibe rakamla sunmak. Rust'a "kademeli servis taşıma" yalnız (2) olumluysa ve yalnız
  darboğaz olan modüllerde.

## 2. Ölçüm: bugünkü Electron (Codespace, Xvfb yazılım çizimi, 4 çekirdek; gerçek otel PC'de tekrar edilmeli)

(Ölçüm betiği ve ham çıktı `.tmp/perf/`; depoya girmez. Aşağıdaki tablo ajan raporundan doldurulur.)

Ortam: Electron 37.10.3 (Chromium 138, Node 22.21), `xvfb-run -a`, yük 1,5–1,9. Veri: yoğun tohum (19 oda + 1, **19.061
rezervasyon**, 1.300 defter satırı; 384 MB veri klasörü — gerçek otelin yıllık verisinin ~5 katı). 3 koşu, medyan.

| Senaryo | Ölçüt | Değer |
|---|---|---|
| Açılış | süreç ayağa kalkıyor → ilk pencere → `domcontentloaded` → uygulama hazır | 843 → 2.110 → 2.575 → **2.655 ms** |
| Açılış | takvim ızgarası (girişten sonra yeniden yükleme → ilk çubuk) | **1.288 ms** (toplam launch'tan 4.455 ms, betik girişi dahil) |
| Boşta (takvimde 30 s) | toplam çalışma kümesi (working set) | **693 MB** — ana süreç **346**, renderer 193, GPU 76, yardımcı 77 |
| Boşta | `ps` süreç ağacı RSS | 798 MB |
| Boşta | CPU | %0 (tüm süreçler) |
| Yoğun (20 s: 10 hafta kaydırma, 5 panel aç/kapat, raporlar, defter) | çalışma kümesi en çok / ortalama | 797 / 782 MB |
| Yoğun | CPU toplam en çok / ortalama (100 = bir çekirdek) | **%33 / %19** |
| **Taban: boş Electron penceresi (about:blank)** | çalışma kümesi | **421 MB** — ana 197, renderer 91, GPU 65, yardımcı 69 |
| Fark (Bismuth − taban) | | **+271 MB**: ana süreç +149 (Node servisler + SQLite sayfa önbelleği + ızgara verisi), renderer +103 (React + takvim), GPU +12, yardımcı +8 |
| Disk | `out/` derleme / `win-unpacked` / kurulum x64 / arm64 | 19 MB / 379 MB / 102 MB / 97 MB |
| Disk | `node_modules` (geliştirme) / `better-sqlite3` ikilisi | 934 MB / 2 MB |

Ham veri: `.tmp/perf/REPORT.md`, `app.json` (depoya girmez; betik P22a'da `scripts/perf-measure.mjs` olur).

**Okuma:**
1. Boşta yükün **yarısından fazlası (421 MB) Electron tabanıdır**; ancak bu Xvfb yazılım çiziminde ölçüldü, gerçek
   Windows'ta taban tipik 100–200 MB'tır (GPU süreci ve paylaşılan kütüphaneler farklı sayılır). Gerçek PC ölçümü şart (P22a).
2. Uygulamanın kendi payı **271 MB**; bunun **149 MB'ı ana süreçte** (Node + SQLite). Tauri'ye geçişte bu süreç ya Node yan
   süreç olarak aynen kalır (b1) ya da Rust'a yazılır (b2/c). Yani kabuk değişimi tek başına **ana süreci küçültmez.**
3. Renderer payı 103 MB React/takvim; Tauri'de de aynı (aynı arayüz, Windows'ta aynı Chromium).
4. CPU boşta %0, yoğunda ortalama %19: "yük olmasın" şikâyeti için bugünkü program zaten sessiz; gerçek PC'de donma varsa
   nedeni büyük ihtimalle disk/antivirüs ya da yoğun sorgu (S-120 ile soruldu).
5. En ucuz kazançlar ana süreçte: SQLite `cache_size`/`mmap` ayarı, ızgara verisini renderer'da tutmak, gereksiz modül
   yükü; "hafif mod" (pencere kapalı) GPU + renderer + yardımcı süreçleri (~350 MB Xvfb; gerçek PC'de ~150 MB) kaldırır.



## 3. Seçenekler

| | (a) Electron'u optimize et | (b1) Tauri 2 kabuk + **Node yan süreç** (servisler aynen) | (b2) Tauri 2 + servisler **kademeli Rust** | (c) Tamamen Rust (Tauri + Rust arka uç) |
|---|---|---|---|---|
| Ne değişir | Kod aynı; pencere/süreç ayarları, paketleme, renderer yükü | Kabuk: Rust/Tauri; arayüz aynen (WebView); `src/main` Node yan süreç olur, arayüz HTTP ile konuşur (bugünkü **sunucu modu** zaten bu) | b1 + darboğaz servisler `axum` + `rusqlite` ile Rust'a | Her şey yeniden: Rust servisler, migrasyon koşucusu, sunucu modu, yedek, kamera köprüsü |
| Beklenen RAM kazancı | Ana süreçte SQLite önbellek/ızgara verisi (149 MB'ın bir kısmı), GPU/arka plan kısıtı; ölçülü hedef −%15–25; "hafif mod" ile pencere süreçleri tamamen kalkar | Kabuk farkı: ikincil ölçümler boşta 40–150 MB (Levminer: Tauri ~80 vs Electron ~120 MB; gethopp 6 pencere 172 vs 409 MB; johalputt 42 vs 187 MB) **ama** Node yan süreç (+50–80 MB) kalır → Windows'ta net kazanç belirsiz, macOS'ta daha fazla (WKWebView) | b1 + Node süreci kalkar (−50–80 MB) | En düşük bellek; arayüz payı değişmez |
| Beklenen CPU/hız | Aynı | Açılış biraz daha hızlı (ikincil); arayüz hızı aynı (aynı React) | Servis sorguları zaten SQLite'ta ms düzeyinde; fark hissedilmez | Aynı |
| Kurulum boyutu | 102 MB (ölçüldü) | Tauri ikilisi küçük (~5–10 MB) **+** Node yan süreç (~40–60 MB) **+** Windows 10'da WebView2 yoksa `offlineInstaller` +127 MB (çevrimdışı kurulum şartı G-03) → benzer | Node kalkınca ~15–30 MB (+ WebView2 gerekirse) | ~10–20 MB (+ WebView2) |
| İş büyüklüğü (ajan günü) | 2–4 | 10–20 (kabuk, pencere durumu, menü, yedek dosya diyalogları, paketleme ×2, e2e yeniden) | 30–60 ek | 120–200 (180 bin satır) |
| API maliyeti (sonnet ağırlıklı, orkestra dahil) | $15–30 | $80–160 | +$250–500 | $1.200–2.500 |
| Risk: SQLite | yok | yok (better-sqlite3 Node'da kalır) | `rusqlite` (0.42, `bundled`) olgun; Drizzle şeması elle çevrilir | aynı + tüm sorgular |
| Risk: migrasyonlar (19 `.sql`) | yok | yok | SQL dosyaları aynen kullanılabilir; koşucu (`__drizzle_migrations` tablosu) Rust'ta yeniden; **mevcut veritabanları açılmalı** (kabul testi) | aynı |
| Risk: sunucu modu (Hono, telefon) | yok | yok (aynı sunucu) | `axum` 0.8'e taşıma; oturum/çerez/kopya protokolü yeniden | aynı |
| Risk: yedek/Drive kutusu, ekler, `safeStorage` | yok | Tauri eşdeğerleri (`tauri-plugin-fs`, keyring); Electron `safeStorage` → OS anahtarlık | aynı | aynı |
| Risk: testler | yok | 2.427 vitest **kalır** (servisler Node'da); Playwright Electron e2e → `tauri-driver` + WebdriverIO (Playwright resmî değil; **macOS'ta sürücü yok**, telefon emülasyonu tarayıcıda kalır) | + Rust birim testleri; vitest servis testleri Rust'a taşındıkça kaybolur | hepsi yeniden |
| Risk: WebView farkları | yok (sabit Chromium) | Windows: WebView2 (Chromium, kendini günceller, sürüm sabitlenemez); macOS: **WKWebView = Safari** (tarih seçici, yazdırma/PDF, kaydırma, sürükle-bırak farkları; macOS sürümüne bağlı) | aynı | aynı |
| Kamera (Python yan süreç, ONNX) | aynı | aynı (Tauri sidecar olarak başlatılır) | aynı; Rust'ta `ort` (ONNX Runtime) **yalnız 2.0.0-rc** (kararlı yok), OpenCV crate sistem kütüphanesi ister → kamera Rust'a taşınmaz | aynı |
| "Bitmiş ürün, bakım yok" hedefi | uyumlu | Tauri 2.12 kararlı; WebView2 kendini günceller (bakım dışı kırılma riski) | `ort` rc, ekosistem genç | aynı |

**Diğer seçenek:** (d) **Electron + Node'da "hafif mod"**: sunucu modunda ana bilgisayar arayüzü tarayıcıda açılır,
Electron penceresi kapatılır (yalnız tepsi simgesi) → otel PC'de pencere/GPU süreci yok, yalnız Node + SQLite (~80–120 MB).
Bugünkü kodla, 1–2 günde. Sahibin "yük olmasın" isteğine en ucuz cevap; §2 ölçümüyle doğrulanır.

## 4. Karar önerisi (K-62 taslağı)

1. **Şimdi (Faz 17–21 ile paralel değil, sonra):** Faz 17 (resepsiyon) ve Faz 18 (ekran) öncelik; Rust işi bunları beklemez
   ama **onlardan önce başlamaz** (sahip yönergesi: "öncelik sırasını bozmasın").
2. **R0 — Ölç ve hafiflet (Electron):** gerçek otel PC'de aynı ölçüm; `backgroundThrottling`, tek pencere, GPU kısıtı
   denemesi, "hafif mod" (d) prototipi; hedef: boşta toplam RSS −%20, açılış −%20. Rakamlar sahibe.
3. **R1 — Kabuktan bağımsızlaştırma (zaten büyük ölçüde var):** `src/renderer/lib/transport` tek kontrat; Electron'a özgü
   çağrılar (`safeStorage`, dosya diyalogları, yazdırma, pencere durumu, menü) tek bir `shell` arayüzü arkasına alınır
   (`src/renderer/lib/shell/`), HTTP/tarayıcı için eşdeğerleri yazılır. Bu adım (d) ve (b1) için ortak ve tek başına da faydalı.
4. **R2 — Tauri 2 prototipi (ayrı dizin `shell-tauri/`, ürün dalına girmez):** Node yan süreç olarak mevcut Hono sunucusu,
   WebView'da aynı `out/renderer`; pencere durumu, menü, yedek diyalogu; Windows kurulum (`offlineInstaller`) ve macOS
   DMG; **aynı ölçüm betiği** ile karşılaştırma. Kabul: ölçüm tablosu + "Electron'a göre ne kazandık" tek sayfa.
5. **Karar noktası (sahip):** R2 boşta RAM'de ≥ %30 ve açılışta ≥ %30 kazanç göstermiyorsa Electron kalır (K-01 doğrulanır);
   gösteriyorsa (b1) ürünleştirilir (R3), Rust servis taşıma (b2) yalnız ölçülmüş darboğazda.
6. **(c) tam Rust** yapılmaz (gerekçe §1). Kamera Python yan süreç olarak kalır (K-57).

## 5. Plan paketleri (Faz 22 — "Performans ve kabuk"; dalga 14–16, Faz 21'den sonra)

| Paket | İçerik | Ajan | Büyüklük | Tahmin |
|---|---|---|---|---|
| P22a | R0: ölçüm betiği `scripts/perf-measure.mjs` (bu turdaki `.tmp/perf` temel), gerçek PC talimatı, Electron hafifletme denemeleri, "hafif mod" prototipi (tepsi + tarayıcı) | `feature-builder` (sonnet) | M | $15–30 |
| P22b | R1: `lib/shell` arayüzü; Electron ve tarayıcı uygulamaları; testler | `feature-builder` | M | $20–40 |
| P22c | R2: `shell-tauri/` prototip (Rust toolchain Codespace'te; Windows paketi sahibin PC'sinde ya da Windows runner — sahip tetikler), ölçüm karşılaştırması, tek sayfa karar belgesi | yeni ajan `rust-shell-builder` (sonnet/high; Tauri 2 + Rust) | L | $60–120 |
| P22d | (karar olumluysa) R3: Tauri ürünleştirme — paketleme, e2e `tauri-driver`, kurulum belgeleri | `rust-shell-builder` + `packager` | L | $80–160 |
| P22e | (yalnız ölçülmüş darboğazda) Rust servis taşıma: tek modül pilotu (`axum` + `rusqlite`, aynı `.sql` migrasyonlar) | `rust-shell-builder` | L | $100–200 |

Toplam R0–R2: **$95–190**; R3 +$80–160; R3+R4 ile tam (b2) yolu $300–550. Tam Rust (c) tahmini $1.200–2.500 (yapılmaz).

## 6. Kaynaklar

- Tauri: sürüm 2.12.5 (crates.io, 2026-10-21); WebView sürümleri https://v2.tauri.app/reference/webview-versions/ ;
  Windows kurulum/`webviewInstallMode` https://v2.tauri.app/distribute/windows-installer/ ; sidecar
  https://v2.tauri.app/develop/sidecar/ ; WebDriver testleri https://v2.tauri.app/develop/tests/webdriver/ .
- Electron performans belgesi https://www.electronjs.org/docs/latest/tutorial/performance ; mevcut sürüm 37.10.3 (K-01,
  macOS 11 desteği için; `masaustu-yigin.md` §1).
- Rust crate'leri: `rusqlite` 0.42.0, `axum` 0.8.9, `ort` 2.0.0-rc.15 (crates.io, 2026-11-13); `mdns-sd`.
- İkincil ölçümler (blog; dikkatli): levminer.com/blog/tauri-vs-electron ; dev.to/gethopp/… ; dev.to/johalputt/… ;
  dev.to/gerus_team/… ; dev.to/demonazgh/… . "Tauri %90 daha az RAM" türü iddialar kaynaksızdır, kullanılmadı.

## 7. P22a ölçümü: Electron önce/sonra (Codespace, Xvfb, 2026-11-14)

Betik: `scripts/perf-measure.mjs` (süreç ağacı ölçümü programdan bağımsızdır; `--attach <pid|ad>` ile Tauri'ye de uygulanır).
Ortam: Electron 37.10.3, `xvfb-run -a`, 4 çekirdek, aynı yoğun tohum (19 oda + 1, ~19.000 rezervasyon, 1.300 defter satırı).
Taban satır 3 koşu medyanı, deneyler 2 koşu. **RSS** süreçlerin ortak sayfalarını birkaç kez sayar (zygote'tan çatallanan
süreçler); **PSS** ortak sayfaları bölüştürür, toplam için dürüst olan odur (yalnız Linux'ta okunur).

| Ölçüt | Taban (pencere açık) | **Hafif mod** (pencere kapalı) | `--in-process-gpu` | `--disable-gpu-compositing` | `--disable-gpu` |
|---|---:|---:|---:|---:|---:|
| Boşta süreç sayısı | 6 | **5** | 5 | 6 | 6 |
| Boşta toplam RSS (MB) | 871 | **589 (−%32)** | 832 (−%4,5) | 867 | 879 |
| Boşta toplam PSS (MB) | 566 | **379 (−%33)** | 572 (+%1) | 569 | 578 |
| Boşta CPU (% tek çekirdek) | 0,6 | 0,1 | 0,5 | 0,2 | 0,2 |
| Ana süreç RSS (MB) | 348 | 351 | 389 | 352 | 363 |
| Renderer RSS (MB) | 264 | yok | 263 | 261 | 263 |
| GPU süreci RSS (MB) | 76 | 57 | yok (ana süreçte) | 75 | 75 |
| Yoğun (20 sn gezinti): RSS / PSS (MB), CPU | 999 / 686, %38,9 | – | – | – | – |

Açılış süreleri (pencere 2,1–4,4 sn, hazır 2,6–5,4 sn, takvim 1,4–3,3 sn) koşular arası yük farkından (0,5 ile 7 arası)
dalgalandığı için **karşılaştırmada kullanılmaz**; temiz yükte (≤1) pencere ≈ 2,1 sn, uygulama hazır ≈ 2,6 sn, takvim ≈ 1,4 sn.

**Denemeler ve karar**
- **Hafif mod (kabul):** boşta −%32 RSS / −%33 PSS. Renderer ve çizim yükü gider; kalan ana süreç + yardımcı süreçler.
  Hedef (−%20) bu yolla aşıldı. Yalnız ana bilgisayar kipinde ve ayar açıkken; varsayılan kapalı.
- **`--in-process-gpu` (red):** RSS −39 MB görünür ama PSS değişmez (GPU kodu ana sürece taşınır, yük yer değiştirir);
  GPU sürecinin çökmesi artık ana süreci (veritabanı) düşürür. Yan etki > kazanç.
- **`--disable-gpu-compositing` / `--disable-gpu` (red):** bellekte fark yok (≤ ölçüm gürültüsü); gerçek ekran kartlı PC'de
  kaydırma akıcılığını bozma riski var. Ölçülmüş fayda olmadan eklenmedi.
- **`backgroundThrottling` (değişmedi):** Electron'un varsayılanı zaten açık; yalnız gizli/simge durumundaki pencerede
  işler, boşta CPU zaten %0,1–0,6. Ek ayar kazandırmaz.
- **Gizli pencere:** yok; tek geçici gizli pencere saatlik PDF özetinde (`summary-pdf.ts`) açılıp `finally` içinde yok
  ediliyor. Kalıcı gizli pencere yok.
- **Ana süreçte tembel `import` (yapılmadı, "mümkün değil" gerekçeli):** `exceljs` zaten ayrı parça (tembel). Kalan en
  büyük yük `date-holidays` (~23 MB, bu betikle ölçüldü) senkron servislerden (`setup-service`, `calendar-service`)
  çağrılıyor; tembel yapmak onları asenkron yapmayı gerektirir (kapsam dışı, kazanç ≈ ana sürecin %6'sı). `bonjour-service`
  örneği zaten tembel kuruluyor. SQLite önbelleği varsayılan (2 MB), büyütülecek bir şey yok.
- **Sonuç:** Electron taban ağırlığı (~420 MB RSS, boş pencere) ayardan küçülmez; küçültmenin gerçek yolu pencere olmadan
  çalışmaktır (hafif mod) ya da kabuk değişimi (P22c'de aynı betikle ölçülecek).

**Gerçek otel bilgisayarı:** ölçüm tablosu bu bilgisayarda henüz yok; sahibin PC'sinde `--perf-out` ile alınacak
(`docs/kurulum.md` → "Teknik: bilgisayarı ne kadar yorduğunu ölçmek"). Sahip onay paketine yazıldı.

## 8. P22c sonuç: Tauri 2 prototipi ve Electron karşılaştırması (Codespace, Xvfb, 2026-11-14)

**Ne yapıldı.** `shell-tauri/` (ürün paketine girmez): Tauri 2.12.5 penceresi, sistem WebView'ında (Linux: WebKitGTK 2.54) mevcut
`out/renderer`; yan süreç olarak **Node** (`shell-tauri/sidecar/server.ts`: aynı `createServices` + `createApiApp` + `createHostApp`,
yalnız `127.0.0.1:47931`); arayüz HTTP taşımasıyla (tarayıcı/istemci gibi, IPC yok) bağlanır. Pencere durumu
(`tauri-plugin-window-state`: 1100×700 @120,90 kapatıp açınca geri geldi), Dosya/Düzen/Görünüm menüsü, kabuk kapanınca yan süreç
kapanır (doğrulandı), `capabilities` boş, `withGlobalTauri` kapalı, CSP sunucu modundakiyle aynı dize. Kontroller: `cargo fmt`,
`cargo clippy --release -D warnings`, `cargo test` (3 test) yeşil; `Cargo.lock` depoda (413 kayıt).

**Aynı betik, aynı veri** (`scripts/perf-measure.mjs`; Electron `--runs 3`, Tauri `--tauri <ikili> --runs 3`; aynı tohum: 19 oda + 1,
~19.000 rezervasyon; sırayla koşuldu; koşu başı yük Electron 2,39 / Tauri 0,76; medyan). Süreç ağacı: Electron 6 süreç; Tauri
kabuk + Node yan süreç + WebKitWebProcess + WebKitNetworkProcess = 4 süreç.

| Ölçüt | Electron 37 | Tauri 2 (+ Node yan süreç) | Fark |
|---|---:|---:|---:|
| Pencere açıldı (ms) | 1.991 | 1.745 | −%12 |
| Uygulama hazır (ms) | 2.571 | 2.565 | **%0** |
| Takvim çubukları, yeniden yüklemeden (ms) | 1.281 | 1.375 | +%7 |
| Boşta toplam RSS (MB) | 864 | 1.010 | **+%17** |
| Boşta toplam PSS (MB) (dürüst olan) | 567 | 800 | **+%41** |
| Boşta CPU (% tek çekirdek) | 0,5 | 8,6 | +8,1 puan |
| Yoğun toplam RSS / PSS (MB) | 939 / 636 | 1.111 / 900 | +%18 / +%42 |
| Yoğun CPU (% tek çekirdek) | 27,4 | 77,7 | 2,8 kat |

Boşta PSS'nin süreçlere dağılımı (MB, 3 koşu medyanı):

| Electron | | Tauri | |
|---|---:|---|---:|
| ana süreç (Electron + Node servisler + SQLite) | 265 | Node yan süreç (servisler + SQLite) | 214 |
| renderer | 210 | WebKitWebProcess (arayüz) | 445 |
| GPU süreci / yardımcı / zygote | 36 / 30 / 28 | WebKitNetworkProcess | 38 |
| | | Tauri kabuğu (Rust + GTK) | 102 |

**Okuma ve K-62 sınaması.** K-62: boşta RAM **ve** açılışta ≥ %30 kazanç yoksa Electron kalır. Bu ölçümde ikisi de yok: RAM
**artmış** (+%41 PSS), açılışta fark yok (hazır: 2.571 → 2.565 ms; yalnız pencere 250 ms erken açılıyor ama içerik Node yan
sürecin hazır olmasını bekliyor: kabuk 68 ms, yan süreç dinliyor 1.630 ms, sayfa 2.870 ms). Açıklama: kazancın kaynağı
(Electron'un kendi Chromium'u) Linux'ta WebKitGTK ile değişiyor, WebKit bu arayüz için Chromium'dan **ağır** (445 MB'a karşı 210 MB,
yazılım çizimi altında); Node yan süreç servislerin payını (≈214 MB) aynen taşıyor. Yani **kazanç Linux'ta ölçüldü: yok**.

**Linux ölçümü Windows'u temsil etmez (sınır).** Otel Windows'ta WebView2 (Chromium) kullanacak; onu burada ölçemedik. Ama
parça parça akıl yürütülebilir (tahmin, ölçüm değil): Electron'da ana süreç 265 MB'ın ≈214 MB'ı servisler, yani Electron'un kendi
tarayıcı süreci yükü ≈50 MB; renderer (≈210 MB) ve GPU (≈36 MB) WebView2'de de var, ağ yardımcısı (≈30 MB) de. Servisleri Node
yan süreçte tuttuğumuz sürece, kabuk değişiminin tavanı ≈50–80 MB'dır (≈ −%9…−%14 boşta PSS); −%30'a **ulaşamaz**. Bunun için
servislerin kendisi Rust'a taşınmalı (P22e: `axum` + `rusqlite`; Node yan süreç 214 → belki 40–60 MB), ama bu "yalnız ölçülmüş
darboğazda" ve K-62 tam yeniden yazımı reddediyor.

**Sahibin PC'sinde tekrar:** `shell-tauri/README.md` → "Ölçüm"; Windows'ta `--tauri <exe>` aynı betikle (PSS Windows'ta yok,
çalışma kümesi kullanılır; WebView2 süreçleri `webview2` diye ayrılır; ölçmeden önce `docs/kurulum.md` "Teknik: bilgisayarı ne kadar
yorduğunu ölçmek"). Karar belgesi: `docs/analiz/13-tauri-karar.md`.

**Prototipin sınırları (yapılmadı / doğrulanmadı):** ilk kurulum sihirbazı HTTP'de reddedilir (yalnız IPC; kurulmuş otel klasörüyle
çalışır); `safeStorage` mührü, Drive kutusu, PDF özeti (gizli `BrowserWindow`), tepsi/hafif mod, kamera yan süreci, yazdırma, dosya
diyaloğu, tek örnek kilidi yok; paketli yerleşim (`externalBin`) ve Windows NSIS/macOS DMG yazıldı ama **üretilmedi**; WKWebView
(macOS) hiç denenmedi. Menü metinleri koda gömülü (prototip; üründe i18n).
