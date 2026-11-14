# shell-tauri — Tauri 2 kabuk prototipi (Faz 22, P22c)

**Prototiptir; ürün paketine girmez** (`package.json` ve `electron-builder.yml` değişmedi). Amaç: Electron yerine
Tauri 2 kabuğunun gerçek kazancını **aynı ölçüm betiğiyle** görmek (`docs/analiz/13-tauri-karar.md`).

## Nasıl çalışır

```
Tauri 2 (Rust, 7,5 MB)  ──başlatır──►  Node yan süreç (sidecar/server.ts → dist/server.mjs)
   │  tek pencere (sistem WebView'ı)        Hono + servisler + SQLite, yalnız 127.0.0.1:47931
   └──── http://127.0.0.1:47931/ ◄──────────┘  aynı `out/renderer`, aynı HTTP kontratı (istemci/tarayıcı gibi)
```

- Arayüz Tauri komutu çağırmaz: `capabilities/default.json` boş, `withGlobalTauri` kapalı. Menü, pencere durumu
  (`tauri-plugin-window-state`) ve yan süreç yaşam döngüsü Rust tarafındadır.
- Ağ: yalnız `127.0.0.1:<kapı>` (G-01/G-02). CSP, sunucu modundaki başlıkla aynı dize (`src/main/server/static.ts`).
- Yan süreç, kabuk ölünce stdin kapandığı için kendiliğinden durur (sahipsiz süreç veritabanını tutmaz).
- `sidecar/server.ts` **servisleri yeniden yazmaz**: `createServices`, `createApiApp`, `createHostApp` aynen kullanılır;
  yalnız Electron'a bağlı parçalar yok (safeStorage mührü, Drive kutusu, kopya akışı, kamera, tepsi, keşif).
- **Bilinen eksik:** ilk kurulum sihirbazı (`setup.*`) HTTP'de reddedilir (yalnız IPC). Prototip, kurulmuş bir otel
  klasörüyle çalışır. P22d'de: ya Tauri'ye özel güvenilir kanal ya da yan sürece 127.0.0.1'e özel tek seferlik kurulum izni.

## Kurulum (Codespace; `postCreate`'e eklenmez)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev build-essential
```

## Derleme ve çalıştırma (Linux)

```bash
npm run build                                  # out/renderer
node shell-tauri/sidecar/build.mjs             # shell-tauri/sidecar/dist/server.mjs (esbuild, tek dosya)
cd shell-tauri/src-tauri && cargo build --release
# çalıştır (kurulmuş bir otel klasörüyle; tohum: .tmp/perf/seed)
BISMUTH_ROOT=$PWD/../.. BISMUTH_DATA=/yol/otel-klasoru xvfb-run -a target/release/bismuth-shell
```

Ortam değişkenleri: `BISMUTH_ROOT` (depo), `BISMUTH_DATA` (içinde `bismuth.db`), `BISMUTH_PORT` (varsayılan 47931),
`BISMUTH_NODE` (varsayılan `node`), `BISMUTH_PERF=1` (yalnız ölçüm: sayfa hazır işaretleri, `perf-driver.js`).

## Ölçüm (aynı betik)

```bash
xvfb-run -a node scripts/perf-measure.mjs --runs 3 --label electron-p22c
xvfb-run -a node scripts/perf-measure.mjs --tauri shell-tauri/src-tauri/target/release/bismuth-shell --runs 3 --label tauri-p22c
node scripts/perf-measure.mjs --report .tmp/perf/electron-p22c.json .tmp/perf/tauri-p22c.json
```

Yük 2,5'in altındayken, tek şey çalışırken. Windows'ta: `--tauri <exe>` aynı betikle (WebView2 çocuk süreçleri `webview2` diye
ayrılır; PowerShell yolu betikte hazır; PSS Windows'ta yok, çalışma kümesi/RSS kullanılır).

## Kontroller

```bash
cd shell-tauri/src-tauri && cargo fmt --check && cargo clippy --release -- -D warnings && cargo test
```

## Windows ve macOS paketi (yapılandırma yazıldı; Codespace'te üretilemez, tetikleme yok)

- `src-tauri/tauri.windows.conf.json`: `webviewInstallMode: offlineInstaller` (WebView2 kurulum paketi içinde, ~+127 MB;
  S-121 internetsiz kurulum), NSIS, kullanıcıya özel kurulum (yönetici şifresi yok), TR/EN/RU.
- `src-tauri/tauri.macos.conf.json`: macOS 11+, ad-hoc imza (`-`), DMG.
- `src-tauri/tauri.bundle.conf.json`: paketleme katmanı (`externalBin: binaries/node` + yan süreç, `out/renderer`, `drizzle`
  kaynak olarak). Önce `binaries/node-<hedef-üçlü>` (ör. `node-x86_64-pc-windows-msvc.exe`) konur; `better-sqlite3` ikilisi
  **Node ABI'siyle** yan sürecin yanına konmalıdır (Electron ABI'si ile aynı değildir). Sonra:
  `cargo tauri build --config src-tauri/tauri.bundle.conf.json` (sahip kendi PC'sinde / Windows runner'da dener).
  Simge `build/icon.png` (depoda tek kopya; görüntü dosyası kancası yüzünden `shell-tauri/` altında kopya tutulmaz). Paketleme için `icon.ico` ve `icon.icns` üretilmeli (`cargo tauri icon ../build/icon.png`).
- Doğrulanmadı: paketli yerleşim (`layout()` içindeki kaynak yolları), `externalBin` adlandırması, NSIS/DMG çıktısı.
