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
   tabanı), gerçek PC talimatı (`docs/kurulum.md` ek), Electron denemeleri (`backgroundThrottling`, tek pencere, GPU
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
- [ ] P22a: ölçüm tablosu (Codespace + gerçek PC) raporda; en az bir hafifletme ile boşta toplam RSS −%20 ya da "mümkün
      değil" gerekçesi; hafif mod ile pencere/GPU süreci yokken program tarayıcıdan tam çalışır (e2e).
- [ ] P22b: Electron'a özgü çağrı yalnız `lib/shell/electron.ts`'te (`grep window.bismuth`/`electron` dışarıda 0); tarayıcı
      uygulamasında tüm akışlar çalışır (mobil e2e yeşil).
- [ ] P22c: Tauri prototipi aynı arayüzle açılır, sunucu modu yan süreç olarak çalışır; ölçüm karşılaştırması; sahip karar
      sayfası (`❓ SORULARIM`: devam mı Electron mu).
- [ ] P22d/P22e yalnız sahip "devam" derse; kabulleri paket kartında.

## Teknik notlar
Tauri 2.12 (crates.io 2026-10); Windows WebView2 (Chromium, kendini günceller), macOS WKWebView (Safari motoru; tarih
seçici, yazdırma, sürükle-bırak farkları test edilir); `tauri-driver` yalnız Windows/Linux; `ort` crate rc → kamera Python
yan süreç olarak kalır (K-57). Tam Rust yeniden yazım yapılmaz (K-62).

## Yapılmayacaklar
Tam Rust yeniden yazımı; kamera modülünün Rust'a taşınması; Faz 17–21'den önce başlamak.

## Sonuç
(Opus doldurur.)
