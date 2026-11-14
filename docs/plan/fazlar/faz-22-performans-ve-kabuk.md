# Faz 22 — Performans ve kabuk (Electron'u hafifletme, Tauri 2 prototipi, Rust kararı)

> Kaynak: `docs/analiz/11-rust-gecisi.md` (ölçüm, seçenekler, K-62 önerisi); sahip yönergesi B.1 ("Rust'a geçirmek
> istiyorum; otel bilgisayarı güçlü değil"). Paket kartları `08-gelistirme-plani.md` §10. Dalgalar 14–16, **Faz 17–21'den
> sonra** (öncelik sırası bozulmaz). Ön koşul: K-62 kabulü (sahip).

## Amaç
Programın otel bilgisayarındaki yükünü ölçmek ve düşürmek; Rust/Tauri 2 kabuğuna geçişin gerçek kazancını aynı ölçümle
kanıtlayıp sahibe rakamla karar sunmak; kazanç varsa en düşük riskle geçmek (arayüz ve servisler yeniden yazılmadan).

## Gereksinimler
G-01/G-02 (çevrimdışı), G-03 (çift tık kurulum; Windows 10'da WebView2 çevrimdışı kurulum), G-140/141 (tek yazıcı),
K-01 (Electron; bu fazla yeniden değerlendirilir), K-62 (taslak).

## Sorular
S-120 (gerçek PC'de bugün yavaşlık/donma yaşanıyor mu; hangi ekranda?), S-121 (kurulum internetsiz mi yapılacak?),
S-122 (Mac'te yazdırma/PDF ve tarih seçici kusursuz olmalı mı?). Cevapsız = varsayılan (`05-sorular.md`).

## Teslimatlar
1. **P22a Ölç ve hafiflet** — `scripts/perf-measure.mjs` (açılış süresi, süreç başına RSS/CPU boşta ve yoğun, Electron
   tabanı), gerçek PC talimatı (`docs/otel/kurulum.md` ek), Electron denemeleri (`backgroundThrottling`, tek pencere, GPU
   kısıtı, modül yükü), **"hafif mod"** prototipi: sunucu modunda pencere kapalı + tepsi simgesi + tarayıcıda arayüz.
2. **P22b Kabuk soyutlama** — `src/renderer/lib/shell/` (dosya diyaloğu, yazdırma, `safeStorage`, pencere durumu, menü,
   sürüm) Electron ve tarayıcı/HTTP uygulamaları; mevcut `transport` ile birlikte kabuktan bağımsız arayüz.
3. **P22c Tauri 2 prototipi** — `shell-tauri/` (ürün dalına girmez; `cargo` Codespace'te), WebView'da `out/renderer`,
   Node yan süreç olarak mevcut Hono sunucusu (`externalBin`), pencere durumu, menü; Windows kurulum (`offlineInstaller`)
   sahibin PC'sinde ya da Windows runner'da (sahip tetikler); **aynı ölçüm betiği** ile Electron karşılaştırması; tek
   sayfa karar belgesi (`docs/analiz/11-rust-gecisi.md` §2'ye ek).
4. **P22d (karar olumluysa) Tauri ürünleştirme** — paketleme (NSIS/MSI + DMG), e2e `tauri-driver` + WebdriverIO (macOS:
   tarayıcı e2e), kurulum belgeleri, `THIRD_PARTY_NOTICES`.
5. **P22e (yalnız ölçülmüş darboğazda) Rust servis pilotu** — tek modül (`axum` + `rusqlite`, aynı `.sql` migrasyonlar,
   `__drizzle_migrations` uyumlu koşucu), vitest eşdeğeri Rust testleri.

## Kabul ölçütleri
- [x] P22a (gerçek PC ölçümü sahip onay paketinde; Codespace tablosu `docs/analiz/11-rust-gecisi.md` §7; hafif mod e2e: `tests/e2e/electron/light-mode.spec.ts` "hafif modda pencere kapanınca program çalışır…"): ölçüm tablosu (Codespace + gerçek PC) raporda; en az bir hafifletme ile boşta toplam RSS −%20 ya da "mümkün
      değil" gerekçesi; hafif mod ile pencere/GPU süreci yokken program tarayıcıdan tam çalışır (e2e).
- [x] P22b (src/renderer/lib/shell/shell.test.ts, eslint no-restricted-properties): Electron'a özgü çağrı yalnız `lib/shell/electron.ts`'te (`grep window.bismuth`/`electron` dışarıda 0); tarayıcı
      uygulamasında tüm akışlar çalışır (mobil e2e yeşil).
- [x] P22c (`shell-tauri/`, `docs/analiz/11-rust-gecisi.md` §8, `docs/analiz/13-tauri-karar.md`): Tauri prototipi aynı arayüzle açılır, sunucu modu Node yan süreç olarak çalışır; aynı betikle ölçüm karşılaştırması (Linux: boşta PSS +%41, açılış %0 → K-62 ölçütü karşılanmadı); sahip karar sayfası hazır, **karar sahipte** (`❓ SORULARIM`: devam mı Electron mu; Windows/Mac ölçümü sahip PC'sinde).
- [x] P22d/P22e yalnız sahip "devam" derse; kabulleri paket kartında. — açılmadı (K-62 ölçümü olumsuz).

## Teknik notlar
Tauri 2.12 (crates.io 2026-10); Windows WebView2 (Chromium, kendini günceller), macOS WKWebView (Safari motoru; tarih
seçici, yazdırma, sürükle-bırak farkları test edilir); `tauri-driver` yalnız Windows/Linux; `ort` crate rc → kamera Python
yan süreç olarak kalır (K-57). Tam Rust yeniden yazım yapılmaz (K-62).

## Yapılmayacaklar
Tam Rust yeniden yazımı; kamera modülünün Rust'a taşınması; Faz 17–21'den önce başlamak.

## Sonuç
**Karar (2026-11-14):** P22c ölçümünde Tauri 2 + Node yan süreç Electron'dan hafif çıkmadı (boşta PSS +%41, açılış aynı); K-62'nin
≥ %30 kazanç eşiği sağlanmadığı için **Electron kalır**, P22d/P22e açılmadı. Kazanım: hafif mod (−%32 boşta RSS, isteğe bağlı), ölçüm
betiği ve `--perf-out` (gerçek PC ölçümü sahip onay paketinde), kabuk soyutlaması `lib/shell`. Ayrıntı `docs/analiz/13-tauri-karar.md`.

### P22a — Ölç ve hafiflet (2026-11-14)
- `scripts/perf-measure.mjs`: açılış, süreç başına RSS/PSS/CPU (boşta + yoğun), `--light`, `--attach` (Tauri için), `--report`.
  Programın kendi `--perf-out=<dosya> [--perf-idle=sn]` bayrağı (Node'suz gerçek PC için; `runAsNode` kapalı); talimat `docs/otel/kurulum.md`.
- Hafif mod: `app.lightMode` (varsayılan kapalı, otonom varsayılan); ana bilgisayar kipinde pencere kapanınca tepside kalır
  (Aç / Tarayıcıda aç / Çık), sunucu çalışmıyorsa program yine kapanır; arayüz mevcut `127.0.0.1:<kapı>` sunucusundan. Yeni dinleyici yok.
  Ayar anahtarı Ayarlar → Uzaktan erişim'de (en küçük arayüz değişikliği: bir anahtar satırı).
- Ölçüm: hafif mod boşta −%32 RSS / −%33 PSS (hedef −%20 karşılandı); GPU bayrakları ve `backgroundThrottling` reddedildi (gerekçe `11-rust-gecisi.md` §7).
- Sahip onay paketine: otel PC'sinde `--perf-out` ölçümü ve hafif modun gerçek Windows tepsisinde denenmesi (tepsi simgesi Xvfb'de görülemedi).
### P22b Kabuk soyutlaması (2026-11-14)
- `src/renderer/lib/shell/` (`index.ts` `shell`/`useShell`, `electron.ts` köprüye dokunan tek dosya, `browser.ts`, `types.ts`); seçim çağrı anında, `transport` ile aynı ölçüt (köprü var mı). Taşınan çağrılar: `ready`, `platform`, `window.print` (2 yer), dosya indirme (`saveExport`, `saveBase64`).
- ESLint `no-restricted-properties`: `window/globalThis/self.bismuth` yalnız `lib/shell/electron.ts` ve `lib/transport/` içinde serbest.
- Kalan: dosya diyaloğu, pencere durumu, menü, safeStorage, sürüm için renderer tarafında çağrı yok (ana süreçte); arayüze eklenirse `Shell`e eklenir. Tauri (P22c) `createShell`e üçüncü uygulama ekler.
### P22c Tauri 2 prototipi (2026-11-14)
- `shell-tauri/`: Tauri 2.12.5 penceresi + Node yan süreç (mevcut Hono/servisler, `127.0.0.1`), HTTP taşıması; pencere durumu, menü, yan süreç yaşam döngüsü doğrulandı. `perf-measure.mjs --tauri <ikili>` aynı senaryoyu koşar.
- Ölçüm (Linux/Xvfb, 3 koşu medyanı): boşta PSS Electron 567 → Tauri 800 MB (+%41), açılışta hazır 2.571 → 2.565 ms (%0). K-62 kuralına göre Electron kalır; Windows WebView2 ölçümü sahip PC'sinde (tahmin tavanı −%9…−%14).
- P22d/P22e başlamadı (sahip "devam" demedi).
