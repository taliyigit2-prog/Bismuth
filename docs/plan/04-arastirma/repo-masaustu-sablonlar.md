# Masaüstü başlangıç depoları — derin araştırma (Bismuth, Faz 1 tabanı)

> Tarih: 2026-10-01. Kapsam: Electron + React + TypeScript başlangıç şablonları, örnek uygulamalar ve SQLite kullanan gerçek
> açık kaynak masaüstü uygulamaları. Amaç: Faz 1'e hangi depodan başlanacağı ve hangi dosyaların nereden alınacağı.
>
> **Yöntem.** Her aday depo 2026-10-01 tarihinde `git clone --depth 1` ile indirildi (büyükler `--filter=blob:none` + sparse);
> `package.json`, main/preload/IPC, `electron-builder`/`forge` yapılandırması, CI iş akışları ve testler **dosyadan okundu**.
> Yıldız/lisans/son push: GitHub arama API'si. "12 ay" etkinliği: `git log --since=2025-10-01` (bot commit'leri ayrı sayıldı).
> Paket sürümleri: npm registry (`/latest`, `dist-tags`, tarball içeriği). Önceki yığın araştırması
> (`docs/plan/04-arastirma/masaustu-yigin.md`) ile çelişki yok; bu rapor onu **depo seçimi** açısından tamamlar.

---

## 0. Kısa karar (TL;DR)

**Temel:** Hazır bir "her şey dahil" şablonu çatallamak yerine **electron-vite'ın resmi `react-ts` şablonundan**
(`npm create @quick-start/electron@1.0.30 bismuth -- --template react-ts --skip`) başla — 32 dosya / ~450 satır, silinecek
neredeyse hiçbir şey yok, araç zinciri kararlarımızla (electron-vite 5 + Vite 7 + electron-builder 26 + NSIS/DMG) birebir aynı.
Üstüne **dosya düzeyinde** şu MIT depolardan parça taşı:

| Ne | Nereden (MIT) |
|---|---|
| DB açılışı, Drizzle migrasyonu, migrasyon öncesi yedek, geri yükleme, `MigrationError` diyaloğu, `drizzle/`→`extraResources`, Playwright `_electron` fikstürleri (geçici `userData`), 3‑OS e2e CI | `arjunemirchandani/electron-db` |
| `sandbox: true` pencere + güvenli `setWindowOpenHandler`, CI "verify + `--dir` build" matrisi, shadcn/Tailwind 4 CSS kurulumu | `guasam/electron-react-app` |
| TanStack Router dosya tabanlı kurulum (ama **hash history**), i18next önyükleme, tema senkronu, Vitest + Testing Library kurulumu, Playwright e2e + xvfb işi, Fuses ayarları | `LuanRoger/electron-shadcn` |
| Navigasyon/izin/dış bağlantı güvenlik kuralları (her `webContents`'e uygulanan), paketlenmiş uygulamaya karşı e2e | `cawa-93/vite-electron-builder` |
| `security.ts` (webview engeli, navigasyon engeli, izin reddi), `protocol.handle` yol‑geçişi koruması, additive‑only migrasyon kuralı + testi, AES‑256‑GCM yedek şifreleme deseni | `actualbudget/actual` |

**Frappe Books (AGPL-3.0)** ve **Beekeeper Studio (GPL-3.0)** kodu **kopyalanamaz** — yalnızca fikir. Altı küçük şablonun
(**lisans dosyası yok**) kodu da hukuken kopyalanamaz.

**IPC:** `electron-trpc` (12 ayda 0 commit) ve `electron-conveyor` (tek yazar, 0.4) **reddedildi**. Öneri: zod kontratı +
**Hono'yu tek yönlendirici** olarak kullanmak — Electron içinde `ipcMain.handle('api', req => app.fetch(req, { ctx }))`
(port açılmaz), sunucu modunda aynı `app` `@hono/node-server` ile; istemci her iki taşımada `hc<AppType>()` + özel `fetch`.
Alternatif: oRPC 1.15 (MIT; `message-port` + `fetch` adaptörleri; `electron-shadcn` kullanıyor). Ayrıntı §4.4.

---

## 1. Aday listesi (29 depo doğrulandı)

### 1.1 Başlangıç şablonları ve araçlar

| # | Depo | ★ | Son commit | Lisans | 12 ay (insan) / ana yazar | Yığın özeti (dosyadan doğrulandı) |
|---|---|---|---|---|---|---|
| 1 | [alex8088/electron-vite](https://github.com/alex8088/electron-vite) (araç) | 5 619 | 2026-10-01 | MIT | 83 / alex8088 (78) | npm `latest` **5.0.0** (2025-12-07, peer `vite ^5‖^6‖^7`); `beta` 6.0.0-beta.5 (Vite 8, 2026-09-29) |
| 2 | [alex8088/quick-start](https://github.com/alex8088/quick-start) → `@quick-start/create-electron` 1.0.30 `react-ts` | 366 | 2026-01-06 | MIT | 7 / alex8088 | electron ^39, electron-vite ^5, vite ^7, builder ^26, React 19, TS 5.9, ESLint 9 + Prettier; test/Tailwind/router/i18n **yok** |
| 3 | [guasam/electron-react-app](https://github.com/guasam/electron-react-app) (ERA v13) | 791 | 2026-09-24 | MIT | 66 / guasam (65) | electron ^43, electron-vite ^5, vite ^7, builder ^26, React 19, TS 6, Tailwind 4, shadcn (`radix-ui`), TanStack Query, zod 4, zustand, `electron-conveyor` IPC; test **yok** |
| 4 | [LuanRoger/electron-shadcn](https://github.com/LuanRoger/electron-shadcn) | 794 | 2026-10-01 | MIT | 439 (çoğu dependabot) / ROG (294) | **Electron Forge 7** + Vite 8, electron ^44, React 19 + React Compiler, TS 6, Tailwind 4, shadcn, TanStack Router + Query, i18next, oRPC, Vitest 5, Playwright; Biome/ultracite |
| 5 | [daltonmenezes/electron-app](https://github.com/daltonmenezes/electron-app) | 809 | 2025-12-06 | MIT | 6 / Dalton Menezes | electron-vite **4**, vite 7, electron ^39, builder 26, React 19, Tailwind 4, shadcn, react-router 7 + `electron-router-dom`, Biome; test yok |
| 6 | [cawa-93/vite-electron-builder](https://github.com/cawa-93/vite-electron-builder) | 2 991 | 2026-06-09 | MIT | 9 insan (81 toplam) / Alex Kozack | npm workspaces, düz Vite (electron-vite değil), electron 41, builder 26, Playwright (paketlenmiş uygulamaya karşı); renderer `create-vite` ile sonradan eklenir |
| 7 | [arjunemirchandani/electron-db](https://github.com/arjunemirchandani/electron-db) | 3 | 2026-09-03 | MIT | 157 / Arjune M. (149) | electron-vite 5, vite 7, electron ^44, builder 26, **better-sqlite3 ^13.0.3 + drizzle 0.45**, Tailwind 4, Playwright `_electron` (19 spec), 3‑OS CI; 2026-07'de açıldı |
| 8 | [electron-react-boilerplate/electron-react-boilerplate](https://github.com/electron-react-boilerplate/electron-react-boilerplate) | 24 251 | 2026-09-15 | MIT | 6 / Amila Welihinda (4) | **2026-09-15'te webpack → electron-vite 5'e geçti**; electron ^44, TS 7, Jest, Sass, react-router 7, `electron-updater`, iki‑package.json (`release/app`) |
| 9 | [electron-vite/electron-vite-react](https://github.com/electron-vite/electron-vite-react) | 2 433 | 2026-06-03 | MIT | 9 / subframe7536 (3) | `vite-plugin-electron` (farklı araç), vite 8, electron ^42, Tailwind 4, Vitest, Playwright, `electron-updater` |
| 10 | [electron/forge](https://github.com/electron/forge) `vite-typescript` şablonu | 7 150 | 2026-09-29 | MIT | resmi ekip | Forge 8.0.1, Vite 8, TS 6, oxlint; Windows: Squirrel/WiX/MSIX (NSIS yok) |
| 11 | [flaviodelgrosso/reactronite](https://github.com/flaviodelgrosso/reactronite) | 61 | 2025-10-18 | MIT | 14 / Flavio (2 insan) | Forge 7, electron 38, React 19, Tailwind 4, react-router 7 |
| 12 | [shadcn/shadcn-electron-app](https://github.com/shadcn/shadcn-electron-app) | 160 | 2024-11-12 | **yok** | 0 (tek "init" commit) | electron-vite 2, React 18, Tailwind 3, `electron-updater` |
| 13 | [p32929/electron-shadcn-typescript](https://github.com/p32929/electron-shadcn-typescript) | 89 | 2026-09-25 | **yok** | 8 (README) | electron-vite 2, electron 28, React 18, Tailwind 3 |
| 14 | [GeorgiMY/Vite-Electron-Template](https://github.com/GeorgiMY/Vite-Electron-Template) | 37 | 2026-04-05 | **yok** | 20 | Elle kurulmuş (tsc + vite), electron 39, React 19, Tailwind 4, shadcn, "typesafe IPC" |
| 15 | [CarlosZiegler/electron-tanstack](https://github.com/CarlosZiegler/electron-tanstack) | 16 | 2025-03-29 | **yok** | 0 | electron-vite 3, TanStack Router (**`createHashHistory`**), Query, shadcn, Tailwind 4 |
| 16 | [rikurainio/Juu](https://github.com/rikurainio/Juu) | 17 | 2024-09-16 | **yok** | 0 | electron-vite 2, electron 28, **electron-trpc + drizzle + better-sqlite3 9** + TanStack Router; React 18 |
| 17 | [LuanRoger/electric-drizzle](https://github.com/LuanRoger/electric-drizzle) | 9 | 2026-04-17 | MIT | 1 | electron-shadcn + Drizzle, ama **`@libsql/client`** (better-sqlite3 değil) |
| 18 | [jsonnull/electron-trpc](https://github.com/jsonnull/electron-trpc) (IPC kütüphanesi) | 402 | 2024-12-07 | MIT | **0** | 0.7.1; tRPC IPC bağlantısı |
| 19 | [guasam/electron-conveyor](https://github.com/guasam/electron-conveyor) (IPC kütüphanesi) | 4 | 2026-09-30 | MIT | tek yazar | npm 0.4.1, 2025-09'da açıldı |
| 20 | [alex8088/electron-vite-boilerplate](https://github.com/alex8088/electron-vite-boilerplate) | 209 | 2024-03-23 | **yok** | 0 | Vue 3 |
| 21 | [caoxiemeihao/electron-vite-samples](https://github.com/caoxiemeihao/electron-vite-samples) | 267 | 2024-11-16 | MIT | 0 | better-sqlite3 11 örnekleri (`vite-plugin-electron`) |

Ek olarak aranıp **bulunmayan / alakasız** çıkanlar: `Kitenite/...` (kullanıcının hiçbir Electron şablonu yok; ilgili kişi
Superset'in kurucusu — aşağıda), "electron-shadcn-template" adlı ayrı bakımlı bir depo yok (yalnızca 0–26 ★ çatallar).

### 1.2 Gerçek uygulamalar (referans)

| Depo | ★ | Son commit | Lisans | Yığın (dosyadan) | Bizim için değeri |
|---|---|---|---|---|---|
| [frappe/books](https://github.com/frappe/books) | 4 997 | 2026-09-20 | **AGPL-3.0** | Vue 3, **Electron 22.3.27 sabit**, better-sqlite3 9 + knex, `pesa`, electron-updater | Alan çok yakın (çevrimdışı muhasebe) → **yalnızca fikir** |
| [actualbudget/actual](https://github.com/actualbudget/actual) | 29 249 | 2026-10-01 | **MIT** | React, Electron 43.4.0, better-sqlite3 ^13.0.3, builder 26.8.1, isteğe bağlı sync-server, CRDT, E2E şifreleme | Kod kopyalanabilir (atıfla); mimari dersi en zengin |
| [beekeeper-studio/beekeeper-studio](https://github.com/beekeeper-studio/beekeeper-studio) | 23 695 | 2026-10-01 | **GPL-3.0** (+ ticari dizin) | Vue 2.7, **Electron 44.3.0 + better-sqlite3 ^13.0.3**, builder 26.15, utility process | Electron 44 + bs3 13 üretimde çalışıyor kanıtı; fikir |
| [usebruno/bruno](https://github.com/usebruno/bruno) | 47 311 | 2026-10-01 | MIT | React + Redux, **Electron ~37.6.1**, builder 24, büyük Playwright paketi | Electron 37'nin üretimde kullanıldığı kanıtı; güvenlik örneği değil (`nodeIntegration: true`) |
| [mockoon/mockoon](https://github.com/mockoon/mockoon) | 8 431 | 2026-09-29 | MIT | Angular | Düşük ilgi |
| [Kong/insomnia](https://github.com/Kong/insomnia) | 40 037 | 2026-10-01 | Apache-2.0 | React Router; bulut hesabı, telemetri | Düşük ilgi (G-07'ye aykırı tasarım) |
| [laurent22/joplin](https://github.com/laurent22/joplin) | 56 553 | 2026-10-01 | **AGPL-3.0-or-later** (alt dizin istisnaları) | Electron + RN, SQLite | Fikir |
| [logseq/logseq](https://github.com/logseq/logseq) | 45 108 | 2026-10-01 | **AGPL-3.0** | ClojureScript | Alakasız yığın |
| [superset-sh/superset](https://github.com/superset-sh/superset) | 14 806 | 2026-10-01 | **Elastic License 2.0** (açık kaynak değil) | electron-vite + TanStack + Drizzle | Kopyalanamaz |

---

## 2. Puan tablosu

Ölçek 1–5 (5 = en iyi). **Uygunluk** = yığınımıza (electron-vite + electron-builder NSIS/DMG + React 19 + TS strict +
Tailwind 4 + shadcn + TanStack Router/Query + i18next + better-sqlite3/Drizzle + Vitest/Playwright `_electron`) yakınlık.
**Bakım** = son 12 ay insan etkinliği + otobüs faktörü. **Lisans** = kopyalama serbestliği. **Kalite** = güvenlik varsayılanları,
tip katılığı, test, CI. **Uyarlama** = 5 ise en az iş (silme + ekleme). **Engel** = kararlarımızla (K-07 vb.) doğrudan çelişki.

| Depo | Uygunluk | Bakım | Lisans | Kalite | Uyarlama | Toplam | Engel |
|---|---:|---:|---:|---:|---:|---:|---|
| **create-electron `react-ts`** (electron-vite resmi) | 4 | 4 | 5 | 4 | **5** | **22** | — |
| guasam/electron-react-app | 4 | 3 | 5 | 4 | 3 | 19 | — (conveyor kaldırılmalı) |
| arjunemirchandani/electron-db | 4 | 2 | 5 | 4 | 3 | 18 | — (çok yeni, 3 ★) |
| electron/forge vite-typescript | 2 | 5 | 5 | 4 | 2 | 18 | **K-07** (NSIS yok) |
| LuanRoger/electron-shadcn | 3 | 4 | 5 | 3 | 2 | 17 | **K-07** (Forge/Squirrel), G-07 (`update-electron-app`) |
| cawa-93/vite-electron-builder | 2 | 3 | 5 | 4 | 2 | 16 | — (renderer yok, electron-vite yok) |
| electron-react-boilerplate | 2 | 3 | 5 | 3 | 2 | 15 | G-07 (`electron-updater`), Jest |
| electron-vite/electron-vite-react | 2 | 3 | 5 | 2 | 3 | 15 | G-07; güvensiz alt pencere |
| daltonmenezes/electron-app | 2 | 2 | 5 | 2 | 2 | 13 | CSP `*`; NSIS yok |
| flaviodelgrosso/reactronite | 2 | 2 | 5 | 3 | 2 | 14 | K-07 (Forge) |
| CarlosZiegler/electron-tanstack | 3 | 1 | 1 | 2 | 3 | 10 | lisans yok |
| GeorgiMY/Vite-Electron-Template | 2 | 2 | 1 | 2 | 2 | 9 | lisans yok |
| rikurainio/Juu | 3 | 1 | 1 | 2 | 1 | 8 | lisans yok, 2024 yığını |
| shadcn/shadcn-electron-app | 2 | 1 | 1 | 2 | 2 | 8 | lisans yok, React 18/TW 3 |
| p32929/electron-shadcn-typescript | 1 | 2 | 1 | 2 | 2 | 8 | lisans yok, eski |
| LuanRoger/electric-drizzle | 2 | 1 | 5 | 2 | 2 | 12 | libsql, Forge |
| caoxiemeihao/electron-vite-samples | 1 | 1 | 5 | 2 | 1 | 10 | eski, farklı araç |
| electron-trpc (kütüphane) | — | 1 | 5 | 3 | — | — | bakımsız |
| electron-conveyor (kütüphane) | — | 2 | 5 | 3 | — | — | tek yazar, 0.x |

---

## 3. İlk 6 aday — derin inceleme

### 3.1 `@quick-start/create-electron` `react-ts` (electron-vite resmi şablonu) — **ÖNERİLEN TEMEL**

- **URL:** https://github.com/alex8088/quick-start/tree/master/packages/create-electron (şablon: `template/base` + `template/react-ts`;
  üretilmiş hali: `playground/react-ts`). Araç: https://github.com/alex8088/electron-vite.
- **Bakım:** electron-vite 12 ayda 83 commit (78'i alex8088) → **otobüs faktörü 1**, ama araç olgun (5.0.0 kararlı) ve şablon
  çıktısı bizim depomuza kopyalanır; şablonun gelecekteki bakımına bağımlı değiliz. Bağımlı olduğumuz şey yalnızca
  `electron-vite@5.0.0` (pinlenir). Yedek plan: `electron-vite` biterse aynı `src/{main,preload,renderer}` düzeni
  `vite-plugin-electron` veya düz Vite ile kurulabilir (cawa‑93 bunun örneği).
- **İçerik (doğrulandı):** `electron.vite.config.ts` (main/preload/renderer tek dosyada, `@renderer` alias), `electron-builder.yml`
  (NSIS `${name}-${version}-setup.exe`, `createDesktopShortcut: always`, DMG, `npmRebuild: false`, `notarize: false`),
  `build/entitlements.mac.plist`, `build/icon.{ico,icns,png}`, `tsconfig.{json,node.json,web.json}` (proje referansları),
  `eslint.config.mjs` (`@electron-toolkit/eslint-config-ts` + react, react-hooks, react-refresh), Prettier, `.vscode/launch.json`
  (main süreç hata ayıklama), `index.html` içinde **CSP**: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`.
- **Yok:** Tailwind, shadcn, router, i18n, Vitest, Playwright, CI iş akışı, DB.
- **Güvenlik varsayılanları ve düzeltilecekler:**
  - `webPreferences.sandbox: false` → **`sandbox: true`** yap (preload'ı yalnızca `contextBridge` + `ipcRenderer` kullanacak şekilde yaz).
  - `@electron-toolkit/preload`'ın `electronAPI`'si **ham `ipcRenderer.send/invoke/on`'u her kanal için** açıyor (paket kaynağından
    doğrulandı) → **kaldır**; yalnızca dar `window.api` köprüsü.
  - `setWindowOpenHandler` her URL'yi `shell.openExternal`'a veriyor → yalnızca `https:`/`http:` (guasam deseni) ve tercihen izin listesi.
  - `@electron-toolkit/tsconfig` `strict: true` ama **`noImplicitAny: false`** (paket tarball'ından doğrulandı; ERA ve electron-db de
    bunu miras alıyor) → kendi `tsconfig`'inde `noImplicitAny: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes` (isteğe bağlı) ekle.
  - `electron-builder.yml`: `publish: generic https://example.com/auto-updates` → **sil** (G-07); `linux` hedefleri ve
    `NSCamera/Microphone/...UsageDescription` satırları → sil; `appId`/`productName: Bismuth`; `mac.identity: "-"` (ad‑hoc),
    `electronFuses` ekle (electron-builder 26 destekliyor: `runAsNode:false`, `enableCookieEncryption:true`,
    `enableNodeOptionsEnvironmentVariable:false`, `enableNodeCliInspectArguments:false`, `enableEmbeddedAsarIntegrityValidation:true`,
    `onlyLoadAppFromAsar:true`, `resetAdHocDarwinSignature:true` — sonuncusu ad‑hoc imzalı arm64 Mac için önemli).
  - `package.json` `postinstall: electron-builder install-app-deps` → **sil**: better-sqlite3 13 Node‑API ön‑derlemeli (tarball'da
    `prebuilds/{win32,darwin,linux}-{x64,arm64}.node`, `gypfile: false`, `NAPI_VERSION=10`); `install-app-deps` gereksiz yere
    node-gyp derlemesi tetikleyebilir. Aynı ikili Vitest (Node 22/24) ve Electron 37 (Node 22.16) / 44 (Node 24.x) için çalışır →
    klasik "NODE_MODULE_VERSION uyuşmazlığı" sorunu (Vitest'i `ELECTRON_RUN_AS_NODE` ile koşturma geçici çözümü) **bize gerekmiyor**.
  - `electronApp.setAppUserModelId('com.electron')` → `com.bismuth.hotel`.
- **Boyut/silme:** 32 dosya, ~450 satır. Silinecek: `components/Versions.tsx`, demo CSS/SVG'ler, `ipcMain.on('ping')`. Hepsi bu.
- **Riskler:** electron-vite 5 Vite 8'i desteklemez → Vite **7.3.6** + `@vitejs/plugin-react` **5.2.0** (6.x Vite 8 ister) pinlenir;
  `@tailwindcss/vite` 4.3.3 ve `@tanstack/router-plugin` Vite 7'yi destekliyor (peer aralıkları doğrulandı). electron-vite 5,
  bilmediği Electron sürümünde (44) en yüksek bilinen hedefe (node22.20/chrome142) düşer — zararsız.

### 3.2 guasam/electron-react-app (ERA v13)

- **URL:** https://github.com/guasam/electron-react-app · MIT · 791 ★ · son commit 2026-09-24 · 12 ayda 66 commit, **tek yazar**.
- **İçerik:** electron-vite 5 + Vite 7 + Electron ^43 + builder ^26; React 19, TS 6, Tailwind 4 (`@tailwindcss/vite`), shadcn
  (`components.json`, `radix-ui` tek paket), lucide, fontsource (Geist, JetBrains Mono — paket içi font ✔), TanStack Query, zustand,
  zod 4. `BrowserWindow` **`sandbox: true`**; `setWindowOpenHandler` yalnızca http/https; `res://` özel protokolü (`protocol.handle` +
  `net.fetch`); çerçevesiz pencere + özel başlık çubuğu/menü; hash ile pencere içi derin bağlantı; `CLAUDE.md`.
- **CI:** `.github/workflows/ci.yml` — `verify` (typecheck, lint, format) + `build` matrisi (ubuntu/macos/windows) `electron-builder --dir`,
  `CSC_IDENTITY_AUTO_DISCOVERY: false`, `shell: bash`, `concurrency` iptali. Kurulum paketi üretmiyor (bizim release ayrı).
- **Yok:** router (yalnızca hash), i18n, **hiç test yok** (Vitest/Playwright), DB.
- **IPC:** `electron-conveyor` (yazarın kendi kütüphanesi, npm 0.4.1, 4 ★, 2025-09'da açıldı) — tipli sorgu/komut/olay + TanStack Query
  kancaları. Güzel ama **otobüs faktörü 1 olan 0.x bağımlılık** → "bitmiş ürün" için riskli. Sunucu modu (HTTP) desteği yok.
- **Silinecek:** `conveyor/` tamamı, `app/shell/*` (özel başlık çubuğu — Windows'ta yerel çerçeve daha az hata çıkarır, sahip için
  daha tanıdık), `app/components/welcome/*`, `res://` protokolü (ihtiyaç yoksa), Linux hedefleri, `publish: generic`.
  ≈ 2 350 satırın yarısından fazlası silinir.
- **Neden temel değil:** Silme işi ekleme işinden fazla ve en değerli parçası (IPC) bizim için uygun değil. **Parça kaynağı olarak iyi.**

### 3.3 LuanRoger/electron-shadcn

- **URL:** https://github.com/LuanRoger/electron-shadcn · MIT · 794 ★ · 2026-10-01 · 12 ayda 439 commit (çoğu dependabot; insan: ROG).
- **İçerik (en zengin şablon):** Electron ^44, Vite 8, React 19 + React Compiler (`babel-plugin-react-compiler`), TS 6 (`strict`,
  `noImplicitAny: true`), Tailwind 4, shadcn (`radix-ui`), **TanStack Router (dosya tabanlı, `routeTree.gen.ts`) + Query**,
  **i18next + react-i18next** (en/pt-BR), tema (nativeTheme senkronu), **oRPC** (MessagePort üzerinden, zod girişli),
  **Vitest 5 + Testing Library + jsdom**, **Playwright `_electron`** (`electron-playwright-helpers`, `findLatestBuild`), CI'da
  `xvfb-run` ile e2e, Fuses eklentisi (RunAsNode kapalı, ASAR bütünlüğü açık).
- **Engeller:**
  - **Electron Forge** (Squirrel.Windows + ZIP/deb/rpm; DMG maker yok). K-07 = electron-builder NSIS + DMG → paketleme katmanı tamamen değişir.
  - `nodeIntegration: true` ana pencerede (sandbox devre dışı kalır) — güvenlik açığı.
  - `update-electron-app` (otomatik güncelleme, G-07 ihlali) ve çalışma anında `electron-devtools-installer` (ağdan indirir).
  - Router `createMemoryHistory` — bizim kararımız **hash** (aynı paket `file://` ve Hono altında).
  - Biome/ultracite → bizim `eslint-plugin-i18next/no-literal-string` kuralımız ESLint ister.
- **Parça kaynağı olarak çok değerli** (router/i18n/test kurulumu), temel olarak değil.

### 3.4 arjunemirchandani/electron-db

- **URL:** https://github.com/arjunemirchandani/electron-db · MIT (2026) · 3 ★ · 2026-07'de açıldı, son sürüm v1.16.0 (2026-09-03) ·
  157 commit'in 149'u tek yazar. Yıldız az, ama **yığını bizimkiyle neredeyse aynı** ve kod kalitesi yüksek.
- **İçerik:** electron-vite 5 / Vite 7 / Electron ^44 / builder 26 / **better-sqlite3 ^13.0.3 + drizzle-orm 0.45 + drizzle-kit** /
  Tailwind 4 / cmdk / Playwright `_electron`.
  - `src/main/db/index.ts`: `initDatabase()` → WAL + `foreign_keys=ON` → bekleyen migrasyon sayısı (`__drizzle_migrations` vs
    `_journal.json`) → **varsa SQLite backup API ile yedek** (`conn.backup()`, WAL'de tutarlı) → `migrate()` → hata olursa
    `MigrationError(backupPath)`. `restoreBackup()` önce canlı DB'nin yedeğini alır, `-wal/-shm` dosyalarını siler, yeniden açar ve
    eski şemalı yedeği normal yoldan migrate eder. Yedek adı regex ile doğrulanır (yol geçişi yok). Saklama sayısı ayardan.
  - `src/main/index.ts`: `ELECTRONDB_USER_DATA` test kancası (`app.setPath('userData')`), `handleMigrationFailure()` diyaloğu
    ("Yedeği geri yükle ve çık / Çık").
  - `electron-builder.yml`: `extraResources: drizzle → drizzle`; `mac.identity: null`; `npmRebuild: false`.
  - `e2e/fixtures.ts`: test başına geçici `userData`, `launch()` (tekrar açılabilir), `runToExit()` (spawnSync ile çıkış kodunu
    yakalar), `stageMigration(sql)` (geçici migrasyon klasörüne ek migrasyon); `e2e/migrations.spec.ts` (temiz kurulum, bekleyen
    migrasyon yedekler, başarısız migrasyon + çık, başarısız + geri yükle).
  - CI: lint + e2e matrisi (macos/windows/ubuntu, Linux'ta `xvfb-run -a`); release: önce taslak release, 3 OS paralel yükleme, sonra yayınla.
- **Zayıf yanlar:** `sandbox: false` + `@electron-toolkit/preload` (ham ipcRenderer açık), `electron-updater` (`src/main/updater.ts`),
  `postinstall: install-app-deps`, Vitest yok (yalnızca e2e), IPC elle yazılmış kanal listesi (zod yok), `integrity_check` yok,
  not uygulaması alan kodu (~5 000 satır) silinir.
- **Kullanım:** Temel değil, **DB/yedek/e2e katmanı için birincil kaynak**.

### 3.5 cawa-93/vite-electron-builder

- **URL:** https://github.com/cawa-93/vite-electron-builder · MIT · 2 991 ★ · son commit 2026-06-09 · 12 ayda 81 commit, insan 9.
- **İçerik:** npm workspaces (`packages/main`, `packages/preload`, renderer `npm run init` ile `create-vite`'tan), düz Vite,
  Node ≥23, Electron 41, builder 26. Ana süreç **modül çalıştırıcı** deseni: `createModuleRunner().init(...)` ile
  `SingleInstanceApp`, `ApplicationTerminatorOnLastWindowClose`, `HardwareAccelerationModule`, `AutoUpdater`,
  **`BlockNotAllowedOrigins`** (izinli origin dışı `will-navigate` engeli), **`ExternalUrls`** (izin listesi),
  `AbstractSecurityModule` (kuralı her `web-contents-created`'a uygular). `contextIsolation: true`, `webviewTag: false`, `sandbox: false`.
- **Test/CI:** `tests/e2e.spec.ts` paketlenmiş **çalıştırılabilir dosyayı** başlatır (`dist/*/root`), `electronApp.browserWindow(page)` ile
  pencere durumu (görünür, devtools kapalı, çökmedi) doğrular; `compile-and-test.yml` win/mac/linux matrisinde paketleyip e2e koşar,
  `actions/attest-build-provenance`. CodeQL.
- **Neden temel değil:** renderer yok, electron-vite yok, workspace karmaşası, AutoUpdater; bakım çoğunlukla dependabot.
  **Güvenlik modülleri ve "paketlenmiş uygulamaya e2e" fikri alınır.**

### 3.6 daltonmenezes/electron-app

- **URL:** https://github.com/daltonmenezes/electron-app · MIT · 809 ★ · son commit **2025-12-06** · tek yazar.
- **İçerik:** electron-vite **4** (eski), Vite 7, Electron ^39, builder 26 (`electron-builder.ts` tipli yapılandırma), React 19,
  Tailwind 4, shadcn, react-router 7 + `electron-router-dom` (yazarın çoklu pencere yönlendirme kütüphanesi), Biome, `code-inspector-plugin`,
  release iş akışı (`daltonmenezes/action-electron-builder`, 3 OS).
- **Sorunlar:** `index.html` CSP'si `default-src 'self' *; script-src 'self' *` (joker — CSP'yi etkisizleştirir), Windows hedefi
  `zip` + `portable` (NSIS yok), React DevTools eklentisinin **kopyası `src/lib/.../react-developer-tools/` içinde** (~70 dosya),
  `alwaysOnTop: true` + `resizable: false` örnek pencere, test yok, i18n yok, 10 aydır commit yok.
- **Karar:** reddedildi; alınacak bir şey yok (electron-builder'ı TS dosyasıyla yapılandırma fikri hariç).

### (Ek) electron-react-boilerplate — neden ilk 6'da değil

24 k ★ ve MIT, 2026-09-15'te **webpack'ten electron-vite 5'e** geçti (önemli haber). Ama: Jest (Vitest değil), Sass, `electron-updater` +
`electron-log` + `electron-debug`, `release/app/package.json` iki‑paket düzeni (yerel modüller için; better-sqlite3 13 N‑API
olduğundan **gereksiz**), Tailwind/shadcn/router/i18n yok, 12 ayda 6 insan commit'i. Temel olarak toplamda daha fazla silme gerektirir.

---

## 4. Önerilen temel ve dosya düzeyinde alım planı

### 4.1 Başlangıç komutu (Faz 1, madde 1–2)

```bash
npm create @quick-start/electron@1.0.30 bismuth -- --template react-ts --skip   # --skip: updater sorusu dahil tüm istemleri atlar (updater eklenmez)
# sonra: .npmrc → save-exact=true; sürümleri masaustu-yigin.md tablosuna göre pinle:
# electron (K-12: 37.10.3 ya da 44.x), electron-vite 5.0.0, vite 7.3.6, @vitejs/plugin-react 5.2.0, electron-builder 26.15.3,
# @tailwindcss/vite 4.3.3, vitest 5.0.3, @playwright/test 1.63.0, better-sqlite3 13.0.3, drizzle-orm 0.45.3, drizzle-kit 0.31.11,
# hono 4.13.12, @hono/node-server 2.1.3, @tanstack/react-router 1.170.x, @tanstack/react-query 5.104.0, i18next 26.4.2, react-i18next 17.0.15, zod 4.6.5
```

> **Dikkat:** `--skip` ile `shouldOverwrite = true` olur (create-electron `index.js` doğrulandı) — hedef klasör varsa içeriği
> silinir. Mevcut `Hotel-CRM` deposunun içine doğrudan **üretme**; geçici bir klasöre üret, dosyaları depoya kopyala
> (`docs/`, `.claude/`, `CLAUDE.md`, `prototypes/` (arşiv etiketi `archive/faz0`) korunur).

Şablonun `src/renderer/index.html` + `src/renderer/src/*` düzeni bizim `src/renderer/{features,components/ui,lib,i18n,layouts}`
düzenine şöyle uyarlanır: `index.html` içindeki `<script src="/src/main.tsx">` → `/main.tsx`, kod `src/renderer/` köküne taşınır;
`electron.vite.config.ts` → `renderer.resolve.alias` `@renderer` ve `@shared` (`src/shared`). `src/shared` hem `tsconfig.node.json`
hem `tsconfig.web.json` `include`'una eklenir (electron-db'deki gibi).

### 4.2 Dosya düzeyinde "ne, nereden, nereye"

> Kopyalanan her MIT dosyasının başına kaynak + lisans satırı eklenir ve `THIRD_PARTY_NOTICES.md`'ye (Hakkında ekranı) yazılır.

**A. electron-db (MIT, Copyright 2026 Arjune Mirchandani)**

| Kaynak dosya | Hedef | Değişiklik |
|---|---|---|
| `src/main/db/index.ts` (`initDatabase`, `migrationsFolder`, `countPendingMigrations`, `backupDatabase`, `pruneOldBackups`, `restoreBackup`, `restoreFromBackup`, `closeDatabase`, `MigrationError`) | `src/main/db/client.ts` + `src/main/backup/` | DB adı `bismuth.db`; yedekler `userData/backups/`; açılışta `PRAGMA integrity_check` ekle; `busy_timeout`, `synchronous=NORMAL`; yedek adı `bismuth_<appVersion>_<YYYYMMDD-HHmmss>.db` (Frappe fikri); saklama `settings`'ten (G-09) |
| `src/main/index.ts` → `handleMigrationFailure()` + `ELECTRONDB_USER_DATA` kancası | `src/main/index.ts` | metinler i18n anahtarı (ana süreç için küçük `t()`), env adı `BISMUTH_USER_DATA` |
| `electron-builder.yml` → `extraResources: [{from: drizzle, to: drizzle}]` | `electron-builder.yml` | aynen |
| `drizzle.config.ts` | aynı | şema yolu `src/main/db/schema/*.ts` |
| `e2e/fixtures.ts` (`userDataDir`, `launch`, `runToExit`, `stageMigration`, `backups`) | `tests/e2e/fixtures.ts` | seçici `[data-testid=app-ready]` |
| `e2e/migrations.spec.ts`, `e2e/backups.spec.ts` | `tests/e2e/` | Faz 1'de migrasyon testleri, Faz 14'te yedek testleri |
| `.github/workflows/ci.yml` (e2e matrisi, Linux xvfb paketleri, başarısızlıkta rapor yükleme) | `.github/workflows/ci.yml` | matrisi `windows-latest` + `macos-latest` (+ ubuntu xvfb) |
| `.github/workflows/release.yml` (taslak release → paralel yükleme → yayınla) | `.github/workflows/release.yml` | `--publish always` yerine `--publish never` + `gh release upload` (electron-builder'ın `publish` bloğu hiç olmasın → güncelleme dosyası `latest.yml` üretilmez) |

**B. guasam/electron-react-app (MIT)**

| Kaynak | Hedef | Not |
|---|---|---|
| `lib/main/app.ts` → `createAppWindow()` (`sandbox: true`, `show:false`+`ready-to-show`, `setWindowOpenHandler` yalnızca http/https, `loadFile(..., { hash })`) | `src/main/windows/main-window.ts` | `frame:false`/`titleBarStyle` **alma** (yerel çerçeve); `spellcheck: false` ekle (Faz 1 maddesi 3) |
| `.github/workflows/ci.yml` (`verify` işi + `--dir` build matrisi, `concurrency`, `CSC_IDENTITY_AUTO_DISCOVERY:false`, `shell: bash`) | `.github/workflows/ci.yml` ile birleştir | |
| `components.json`, `app/styles/globals.css` (Tailwind 4 `@import`, shadcn tokenları), `lib/utils.ts` (`cn`) | `src/renderer/...` | shadcn CLI zaten üretir; ERA sürümü Vite 7 + TW 4.3 ile çalıştığı doğrulanmış referans |
| `package.json` `pnpm.onlyBuiltDependencies` / script adları | — | yalnızca referans |

**C. LuanRoger/electron-shadcn (MIT)**

| Kaynak | Hedef | Not |
|---|---|---|
| `vite.renderer.config.mts` içindeki `tanstackRouter({ target: 'react', autoCodeSplitting })` eklentisi, `src/routes/__root.tsx`, `src/utils/routes.ts` | `electron.vite.config.ts` renderer eklentileri, `src/renderer/routes/`, `src/renderer/lib/router.ts` | **`createMemoryHistory` → `createHashHistory`** (CarlosZiegler/electron-tanstack bu şekilde kullanıyor; lisanssız olduğu için yalnızca fikir) |
| `src/localization/{i18n,langs,language}.ts`, `src/actions/language.ts` | `src/renderer/i18n/` | kaynaklar `tr.json/en.json/ru.json` dosyalarından; `fallbackLng: 'tr'` |
| `src/actions/theme.ts` + `src/ipc/theme/*` (nativeTheme `light/dark/system`) | `src/renderer/lib/theme.ts` + `src/main/services/theme.ts` | kullanıcı renkleri `<style id="user-theme">` (Faz 1 madde 7) |
| `vitest.config.ts`, `src/tests/unit/setup.ts` (jsdom + `@testing-library/jest-dom`) | kök `vitest.config.ts`, `tests/unit/setup.ts` | iki proje: `node` (main/shared/DB, `:memory:`) + `jsdom` (renderer) |
| `src/tests/e2e/example.test.ts`, `.github/workflows/testing.yaml` e2e işi | `tests/e2e/smoke.spec.ts` | `electron-playwright-helpers` yerine electron-db fikstürü (bağımlılık eksiltir) |
| `forge.config.ts` → `FusesPlugin` değerleri | `electron-builder.yml` → `electronFuses` | §3.1'deki liste |
| `src/ipc/*` (oRPC router + zod şemaları) | — | yalnızca desen referansı (§4.4) |

**D. cawa-93/vite-electron-builder (MIT)**

| Kaynak | Hedef |
|---|---|
| `packages/main/src/modules/AbstractSecurityModule.ts`, `BlockNotAllowdOrigins.ts`, `ExternalUrls.ts`, `SingleInstanceApp.ts`, `ApplicationTerminatorOnLastWindowClose.ts` | `src/main/security/*.ts`, `src/main/app/single-instance.ts` |
| `tests/e2e.spec.ts` → `electronApp.browserWindow(page).evaluate(...)` pencere durumu testi; paketlenmiş exe glob'u | `tests/e2e/packaged.spec.ts` (release iş akışında paketten sonra koşar) |

**E. actualbudget/actual (MIT, Copyright James Long)**

| Kaynak | Hedef | Not |
|---|---|---|
| `packages/desktop-electron/security.ts` (`will-attach-webview` engeli, `will-navigate` engeli, `setPermissionRequestHandler`) | `src/main/security/session.ts` | İzinleri `file://`'a bile açma: hepsini reddet (kamera/konum gerekmiyor) |
| `index.ts` → `protocol.handle('app', ...)` yol‑geçişi koruması (`resolvedPath.startsWith(root)`) | `src/main/server/static.ts` (Hono statik dosya sunumunda aynı koruma) | |
| `packages/loot-core/migrations/README.md` "additive‑only" kuralları + `src/server/migrate/additive-migrations.test.ts` fikri | `.claude/rules/db.md` + `tests/unit/migrations-additive.test.ts` | G-133 ile örtüşür: kolon/tablo silme‑yeniden adlandırma yasak, testle zorlanır |
| `packages/desktop-electron/e2e/fixtures.ts` (`blockDocumentDir` → başlangıç hatası ekranı testi) | `tests/e2e/startup-errors.spec.ts` | veri klasörü yazılamazsa anlaşılır hata ekranı |
| `loot-core/src/server/encryption/encryption-internals.electron.ts` (AES‑256‑GCM, rastgele 12 bayt IV, authTag, keyId meta) | `src/main/backup/encrypt.ts` (Faz 14, şifreli yedek) | anahtar türetmeyi **PBKDF2‑SHA512 10 000** yerine `scrypt` (masaustu-yigin.md §parola) ile yap — 10k yineleme günümüz için düşük |

### 4.3 Şablonun kendisinde yapılacak düzeltmeler (özet)

`sandbox: true` · `@electron-toolkit/preload` kaldır · `noImplicitAny: true` · `publish` sil · `postinstall` sil ·
Linux hedefleri ve kamera/mikrofon açıklamaları sil · CSP'ye `connect-src 'self'` ve `object-src 'none'`, `base-uri 'none'`,
`frame-ancestors 'none'` ekle (Hono altında da aynı CSP başlıkla gönderilir) · `electronFuses` · `app.requestSingleInstanceLock()` ·
`session.setPermissionRequestHandler` reddet · `will-navigate` engeli · `spellcheck: false`.

### 4.4 IPC / kontrat kararı (Faz 1 madde 5 için)

İncelenen seçenekler:

| Seçenek | Durum | Değerlendirme |
|---|---|---|
| `electron-trpc` 0.7.1 | son commit 2024-12-07, 12 ayda **0** | **Ret** — bakımsız; HTTP tarafı ayrıca tRPC sunucusu ister |
| `electron-conveyor` 0.4.1 (ERA) | tek yazar, 4 ★ | **Ret** — 0.x, otobüs faktörü 1, HTTP yok |
| oRPC 1.15.4 (`@orpc/server` `./message-port` + `./fetch`) | MIT, 5 659 ★, 2026-09-23 sürümü | **Uygun alternatif**: tek router hem MessagePort (Electron) hem fetch (Hono) üzerinden; zod girişi; TanStack Query entegrasyonu. Maliyet: ek bir çerçeve |
| Elle kontrat (`src/shared/contract` zod + `ipcMain.handle` dağıtıcı + Hono rotası) | — | 03-mimari'deki plan; sıfır ek bağımlılık ama iki dağıtıcı yazılır |
| **Hono tek yönlendirici** (önerilen deneme) | hono 4.13.12, `@hono/zod-validator` 0.9.1 | Aşağıda |

**Önerilen desen (Faz 1'de küçük bir spike ile doğrulanmalı):**

```ts
// src/main/server/app.ts — TEK yönlendirici; yetki + zod + servis çağrısı burada
export const app = new Hono<{ Bindings: { ctx: Ctx } }>()
  .post('/api/settings.set', zValidator('json', settingsSetInput), (c) =>
    c.json(settingsService.set(c.env.ctx, c.req.valid('json'))));
export type AppType = typeof app;

// src/main/ipc/register.ts — Electron penceresi: port açmadan aynı app
ipcMain.handle('api', async (e, r: SerializedRequest) =>
  serialize(await app.fetch(deserialize(r), { ctx: ctxFromWebContents(e.sender) })));

// src/main/server/index.ts — sunucu modu: aynı app, @hono/node-server ile, ctx oturum belirtecinden
// src/renderer/lib/transport/{ipc,http}.ts — hc<AppType>(base, { fetch: ipcFetch | globalThis.fetch })
```

Doğrulananlar: `hc()` istemcisi `fetch` seçeneği alıyor (`hono/dist/types/client/types.d.ts`), `app.fetch(request, env)` imzası
var (`hono-base.d.ts`). Kazanç: tek kontrat, tek doğrulama, tek hata eşlemesi; renderer'da gerçek `fetch` yok (Electron'da `ipcFetch`
preload köprüsünden geçer → CLAUDE.md yasak 1 korunur). Bedeli: istek/yanıt serileştirme (yerel, ihmal edilir); ek/dosya
gövdeleri için `ArrayBuffer` aktarımı.

---

## 5. Gerçek uygulamalardan mimari dersler

### 5.1 Frappe Books (frappe/books) — **AGPL-3.0: kod kopyalanmaz, yalnızca fikir**

AGPL kodu (ya da ondan türetilmiş kod) bizim kapalı/izinli lisanslı projemize alınırsa tüm Bismuth AGPL olur ve kaynak
yayımlama yükümlülüğü doğar. Aşağıdakiler **tasarım gözlemleridir**; satır kopyalanmamalı.

- **Süreç ve DB erişimi:** `backend/database/manager.ts` (`DatabaseManager`) ana süreçte better-sqlite3 + **knex** tutar; renderer'daki
  `fyo` çatısı tüm iş mantığını (modeller, doğrulama, defter kayıtları) **renderer'da** çalıştırır ve DB'ye genel bir köprüyle
  ulaşır: `ipc.db.call(method, ...args)` → `this.db[method](...args)` (yalnızca `databaseMethodSet` ile sınırlı) ve
  `callBespoke(name, ...)`. **Ders:** bu desen bizim G-23'e (yetki servis katmanında) aykırı — renderer ele geçirilirse her şey yazılabilir.
  Bizde iş mantığı + yetki ana süreçte servislerde kalmalı; renderer yalnızca kontrat çağırır.
- **Migrasyon:** iki katman — (1) JSON şemalardan (`schemas/`) **otomatik şema farkı** (`core.ts` `migrate()` → `#createTable`/`#alterTable`,
  tip değişince `prestigeTheTable` = geçici tabloya kopyala‑yeniden oluştur); (2) sürüm etiketli **veri yamaları** (`backend/patches/*`,
  `PatchRun` tablosunda izlenir, `beforeMigrate` ile şema farkından önce/sonra). **Yamalar veya migrasyon varsa önce yedek**:
  `backups/<dosyaAdı>_<sürüm>_<tarih>.books.db`. **Ders:** "şema migrasyonu" (Drizzle SQL) ile "veri yaması" (`data_patches` tablosu,
  idempotent TS fonksiyonları) ayrımı bizim için de yararlı; yedek adına uygulama sürümünü koymak geri dönüşü kolaylaştırır.
  Otomatik şema farkı ise bizim G-133 ("commit edilmiş migrasyon değiştirilmez") yaklaşımımızdan daha az denetlenebilir — almıyoruz.
- **Para:** `pesa` kütüphanesi (MIT, son sürüm 1.1.13 **2022-12-13** — 4 yıldır yayımsız), BigInt tabanlı, iç hassasiyet ayarlanabilir
  (`internalPrecision`, varsayılan 11). Para kolonları **TEXT** olarak saklanır (`backend/helpers.ts`: `Currency: 'text'`; `toRawCurrency`
  → `pesa(...).store`). **Ders:** TEXT saklama SQL'de `SUM`/`ORDER BY` yapılamaz demek; Frappe raporları bu yüzden JS'de toplar. Bizim
  `amount_minor` INTEGER + `currency` kararımız (G-131) SQL toplamaya izin verir ve Actual ile aynı yoldur. Kur dönüşümlerindeki
  ara hassasiyet için `shared/money.ts` içinde BigInt/oran sayısal tip yeterli; `pesa` bağımlılığı alınmaz.
- **Raporlar:** `reports/Report.ts` soyut sınıf: `getFilters()`, `getColumns()`, `setReportData()`, `getActions()`, `setDefaultFilters()`;
  her rapor (GeneralLedger, ProfitAndLoss, BalanceSheet, TrialBalance, StockLedger) bunu uygular; `commonExporter.ts` CSV/JSON dışa aktarım.
  **Ders:** Faz 10'da rapor tanımını "filtre şeması + kolon şeması + veri fonksiyonu + dışa aktarım" olarak tek arayüzde tutmak
  (bizde ana süreçte, SQL ile).
- **Yazdırma:** HTML şablonları (`templates/*.template.html`) → geçici dosya → gizli `BrowserWindow` → `printToPDF` (`main/saveHtmlAsPdf.ts`,
  cm→inç dönüşümü). Bizim Faz planındaki `printing/` ile aynı yaklaşım.
- **i18n:** dil başına CSV (`translations/tr.csv` 1 057 satır, birçoğu boş = kısmi çeviri), `${0}` konumsal yer tutucular, şema
  etiketleri de çevrilir (`schemaTranslateables`). **Ders:** kısmi çeviri kullanıcıya İngilizce sızdırır → bizim `i18next-cli` +
  "eksik anahtar = CI hatası" kuralımız doğru.
- **Telemetri:** `main/contactMothership.ts`, `fyo/telemetry/` (hata günlüğü + telemetri URL'leri `log_creds.txt`'den) — **bizde yasak (G-07)**.
- **Sürdürülebilirlik dersleri:** (1) **Electron 22.3.27'ye sabit** (Windows 7/8 desteği olan son Electron) → güvenlik güncellemesi alamıyor;
  (2) README'ye 2026-09-20'de eklenen not: **"Frappe Books, kod imzalama sertifikaları yenilenmediği için yeni sürüm yayımlayamıyor."**
  Bizim K-07 (imzasız Windows + ad‑hoc macOS, otomatik güncelleme yok) bu bağımlılığı baştan ortadan kaldırıyor; karşılığında
  SmartScreen/Gatekeeper uyarıları için resimli kılavuz şart (K-07'de var).

### 5.2 Actual Budget (actualbudget/actual) — **MIT: atıfla kopyalanabilir**

- **Süreç modeli:** Electron ana süreci ince; iş mantığı (`@actual-app/core` = loot-core) bir **`utilityProcess`** içinde çalışır
  (`packages/desktop-electron/index.ts` `utilityProcess.fork(...)`), çökmesi/başlamaması ayrı hata yükü (`AppInitFailurePayload`)
  ile renderer'a bildirilir. **İsteğe bağlı sync-server da masaüstünde ikinci bir `utilityProcess`** olarak başlatılabilir
  (`startSyncServer()`: varsayılan **`127.0.0.1:5007`**, `ACTUAL_WEB_ROOT` ile aynı web paketini sunar, 20 sn başlangıç zaman aşımı).
  Renderer `app://actual/` özel protokolünden yüklenir (`protocol.registerSchemesAsPrivileged` + `protocol.handle`, yalnızca GET,
  `/static` altında yol‑geçişi koruması). Pencere: `nodeIntegration:false`, `contextIsolation:true`, alt çerçeve/worker Node kapalı.
  **Ders (bizim "sunucu modu" için):** Hono sunucusunu ana süreç yerine bir `utilityProcess`'te koşturmak (electron-vite `?modulePath`
  importu bunu destekliyor) ana pencereyi ağ yükünden ve olası çökmelerden yalıtır; ancak bu durumda DB tek yazıcı ilkesi için
  DB'nin de o süreçte olması gerekir. Faz 13'e kadar: Hono ana süreçte, varsayılan **yalnızca 127.0.0.1**, LAN/özel ağ arabirimi
  **açık onayla**. Actual'ın varsayılanı da yerel döngü.
- **DB ve para:** better-sqlite3 ^13.0.3 (Electron 43.4.0). Tutarlar **tam sayı kuruş** (`amountToInteger`, `integerToAmount`,
  para birimine göre ondalık basamak: `amountToCurrencyInteger(amount, code)` → `getDecimalPlaces(code)`). Bizim G-131 ile aynı.
- **Migrasyonlar:** `packages/loot-core/migrations/` — zaman damgası adlı **SQL ve JS** dosyaları (61 adet), sırayla. Çapraz sürüm
  senkronu yüzünden belirli bir kesimden sonra **yalnızca eklemeli** kural: tablo/kolon silme‑yeniden adlandırma yasak, `NOT NULL`
  ancak `DEFAULT` ile, `UNIQUE` eklenmez; **CI testi (`additive-migrations.test.ts`) gerçek migrasyon zincirine karşı zorlar**.
  **Ders:** G-133'ü "kural + otomatik test" haline getirmek (Faz 2). Uzaktan erişimde eski istemci sürümleri yeni sunucuya bağlanabilir
  (telefon tarayıcısı her zaman sunucunun paketini alır ama masaüstü istemci modu eski kalabilir) → kontrat da yalnızca eklemeli evrilmeli.
- **Senkron (isteğe bağlı sunucu) tasarımı:** her cihazda tam yerel SQLite; değişiklikler **CRDT mesajı** (tablo, satır, kolon, değer,
  **HLC zaman damgası**) olarak üretilir; `@actual-app/crdt` (≈1 080 satır: `timestamp.ts` HLC, `merkle.ts` Merkle trie) ile hangi
  aralığın eksik olduğu bulunur. Sunucu (Express + better-sqlite3) **aptal röle**: dosya grubu başına `messages_binary(timestamp, is_encrypted, content)`
  tablosuna `INSERT OR IGNORE`, Merkle özetini günceller (`sync-simple.js`); içeriği anlamaz.
- **Uçtan uca şifreleme:** istemci tarafında **AES‑256‑GCM**, her mesaj için rastgele 12 bayt IV + authTag; anahtar kullanıcı parolasından
  **PBKDF2‑SHA512, 10 000 yineleme, 32 bayt** (`encryption-internals.electron.ts`). Sunucu yalnızca `encryptKeyId`, `encryptSalt` ve
  parola doğrulamak için şifreli bir `encryptTest` saklar (`/user-create-key`, `/user-get-key`). **Ders:** sunucuya güvenmeyen tasarım
  doğru; ama 10k PBKDF2 yinelemesi bugünkü OWASP önerisinin (SHA‑512 için ~210k) çok altında → kendi şifreli yedeğimizde `scrypt`.
- **Uzaktan web erişimi:** Actual uzak tarayıcıda **HTTPS zorunlu** (tarayıcıda SQLite/wasm için `SharedArrayBuffer` → güvenli bağlam
  + COOP/COEP başlıkları). **Bizim için:** sunucu modunda DB sunucuda olduğundan SAB gerekmiyor; ama `http://100.x.y.z` güvenli bağlam
  **değildir** → `crypto.subtle`, `navigator.clipboard.writeText`, service worker/PWA kurulumu, kamera çalışmaz. Renderer'da bu API'lere
  dayanmamak ya da özel ağın HTTPS sertifikasını (ör. Tailscale `*.ts.net`) kullanmak gerekir (K-19 açık sorusuyla birlikte değerlendirilmeli).
- **"Ücretsiz sunucu ile evden/telefondan erişim" için çıkarım:** Actual modeli (her cihazda kopya + CRDT + şifreli röle) çok yazıcılı
  çakışma çözümü getirir; para ve rezervasyon çakışmalarında "son yazan kazanır" alan bazında bile tehlikelidir ve tüm tablolarda
  CRDT disiplini ister. Bismuth'un "tek yazıcı (otel PC) + uzaktan ince istemci" modeli (K-19 seçenek 1) daha basit ve doğru.
  Röle sunucu fikri ancak **şifreli yedek aktarımı** (tek yönlü, E2E) için düşünülebilir — yeni özellik olacağından gereksinim
  önerisi + soru olarak ele alınmalı (CLAUDE.md kuralı), Faz 1 kapsamı değil.
- **Paketleme:** `beforePackHook.ts` her mimari için `@electron/rebuild` (`onlyModules: ['better-sqlite3','bcrypt','argon2']`,
  `npm_config_force_build=1`) — bcrypt/argon2 yüzünden gerekli; better-sqlite3 13 için değil. Paketten better-sqlite3'ün `src`, `deps`,
  `prebuilds` vb. klasörleri dışlanıyor (`files` deseni) → **bizim için de: diğer platformların prebuild'lerini paketten dışla**
  (her `.node` ≈2 MB). Windows: `appx` + `nsis` (ia32/x64/arm64), macOS: `dmg` (x64/arm64), `hardenedRuntime`.
- **Test:** Playwright `_electron` fikstürleri test başına `ACTUAL_DATA_DIR`, başlangıç hatası senaryosu (`blockDocumentDir`), ekran
  görüntüsü eşikleri (`maxDiffPixels: 5, threshold: 0.05`), CI'da JUnit raporu.

### 5.3 Beekeeper Studio ve Bruno (kısa)

- **Beekeeper Studio (GPL-3.0; `src-commercial` ayrı ticari lisans):** Electron **44.3.0** + better-sqlite3 **^13.0.3** + builder 26.15 +
  Vite 8 + Vitest — Electron 44 + bs3 13 birleşiminin büyük bir üretim uygulamasında çalıştığını gösterir. DB bağlantıları
  `lib/utility/UtilityConnection.ts` ile utility process'te. Kod alınmaz (GPL).
- **Bruno (MIT):** Electron **~37.6.1** (K-12'deki 37 seçeneğinin büyük bir uygulamada yaşadığını gösterir), builder 24, büyük
  Playwright paketi (projeler: default/auth/ssl/mock-server). Ana pencerede `nodeIntegration: true` → güvenlik örneği değil.

---

## 6. Reddedilen depolar ve nedenleri

| Depo | Neden |
|---|---|
| LuanRoger/electron-shadcn (temel olarak) | Electron Forge/Squirrel (K-07 NSIS+DMG ile çelişir), `nodeIntegration: true`, `update-electron-app` (G-07), çalışma anında devtools indirme, memory history, Biome. Parçaları alınır (§4.2-C). |
| electron/forge vite-typescript | Forge'da NSIS maker yok; paketleme kararımız electron-builder. |
| flaviodelgrosso/reactronite | Forge 7, Electron 38, 12 ayda 2 insan commit'i, router/i18n/test yok. |
| daltonmenezes/electron-app | electron-vite 4, CSP joker `*`, NSIS yok, gömülü DevTools kopyası, test yok, 10 aydır durgun. |
| electron-react-boilerplate | Jest, Sass, `electron-updater`/`electron-log`/`electron-debug`, iki‑package.json (N‑API ile gereksiz); Tailwind/shadcn/i18n yok. |
| electron-vite/electron-vite-react | `vite-plugin-electron` (bizim araç değil), `electron-updater` + güncelleme UI'ı, alt pencerede `nodeIntegration:true, contextIsolation:false`. |
| cawa-93/vite-electron-builder (temel olarak) | Renderer yok, electron-vite yok, workspace karmaşası, AutoUpdater. Güvenlik modülleri alınır. |
| guasam/electron-react-app (temel olarak) | IPC tek yazarlı 0.x kütüphaneye bağlı, test yok, özel başlık çubuğu. Parçaları alınır. |
| shadcn/shadcn-electron-app | **Lisans yok** (hukuken kopyalanamaz), tek commit (2024-11), React 18 / Tailwind 3 / electron-vite 2. |
| p32929/electron-shadcn-typescript | **Lisans yok**, Electron 28 / React 18 / Tailwind 3. |
| GeorgiMY/Vite-Electron-Template | **Lisans yok**, electron-vite yok (tsc + vite elle), 14 açık issue. |
| CarlosZiegler/electron-tanstack | **Lisans yok**, 2025-03'ten beri durgun (hash history fikri not edildi). |
| rikurainio/Juu | **Lisans yok**, 2024 yığını (Electron 28, React 18, bs3 9, electron-trpc). |
| alex8088/electron-vite-boilerplate | **Lisans yok**, Vue. |
| LuanRoger/electric-drizzle | `@libsql/client` (better-sqlite3 değil), Forge, 12 ayda 1 commit. |
| caoxiemeihao/electron-vite-samples | 2024'ten beri durgun, `vite-plugin-electron`, bs3 11 (eski rebuild yöntemleri). |
| jsonnull/electron-trpc | 12 ayda 0 commit, son sürüm 2024-12; HTTP için ayrı tRPC sunucusu gerekir. |
| guasam/electron-conveyor | Tek yazar, 0.4.x, 4 ★, HTTP taşıması yok. |
| arjunemirchandani/electron-db (temel olarak) | 3 ★, tek yazar, 2026-07 doğumlu, not uygulaması alan kodu; ama DB/e2e parçaları **alınır**. |
| frappe/books | **AGPL-3.0** (kod alınamaz), Vue, Electron 22 sabit, telemetri; fikirler §5.1. |
| beekeeper-studio | **GPL-3.0** + ticari, Vue 2.7. |
| logseq, joplin | **AGPL**; farklı alan/yığın. |
| superset-sh/superset | **Elastic License 2.0** (açık kaynak değil). |
| Kong/insomnia | Bulut hesabı/telemetri odaklı; React Router; ilgisiz. |
| mockoon | Angular. |

---

## 7. Riskler ve Faz 1 spike listesi

1. **better-sqlite3 13 + Electron 37 ve 44 duman testi** (her ikisi, Win x64 + macOS arm64/x64 runner'larında): aç, WAL, `backup()`,
   BLOB gidiş‑dönüş (Electron V8 bellek kafesi), Playwright `_electron` ile. Kanıtlar: Bruno 37.6, Actual 43.4, Beekeeper 44.3 + bs3 13
   üretimde; bs3 13 Node‑API v10 (Node ≥22.14 gerekir; Electron 37 = Node 22.16 ✔). `npmRebuild: false`, `postinstall` yok.
2. **Paket boyutu:** bs3 13 tarball'ı 8 platform prebuild'i içerir (her biri ≈2 MB) → `files`/`asarUnpack` ile yalnızca hedef platformu
   paketle (Actual'ın `files` dışlama deseni).
3. **electron-vite 5 ↔ Vite 7 kilidi:** Vite 8'e geçiş electron-vite 6 kararlı olana kadar yapılmaz; `@vitejs/plugin-react` 5.2.0'da kal.
   electron-vite tek bakımcılı → `bagimliliklar.md`'ye "çıkış planı: vite-plugin-electron" notu.
4. **TS katılığı:** toolkit tsconfig'i `noImplicitAny:false` getirir — CI'da `tsc --showConfig` ile doğrula.
5. **Hono‑tek‑yönlendirici spike'ı** (§4.4): `ipcFetch` serileştirme, hata eşleme, `ctx` aktarımı, dosya gövdesi; olmazsa elle kontrat (03-mimari planı).
6. **Kopyalanan MIT kodu için atıf:** `THIRD_PARTY_NOTICES.md` + Hakkında ekranı (Faz 1 madde 8 zaten "üçüncü taraf bildirimleri" içeriyor).
7. **Güvenli bağlam:** sunucu modunda HTTP → güvenli bağlam‑gerektiren tarayıcı API'lerinden kaçın (renderer'a lint kuralı düşünülebilir).

## 8. Lisans özeti

| Kaynak | Lisans | Kopyalama |
|---|---|---|
| electron-vite, create-electron, guasam ERA, electron-shadcn, cawa-93, electron-db, ERB, electron-vite-react, Forge, Actual, Bruno, oRPC, Hono | MIT | ✔ (telif satırı + lisans metni korunur) |
| Insomnia | Apache-2.0 | ✔ (NOTICE dosyası) — ama alınacak bir şey yok |
| Frappe Books, Logseq, Joplin | AGPL-3.0 | ✘ yalnızca fikir |
| Beekeeper Studio | GPL-3.0 (+ ticari) | ✘ yalnızca fikir |
| Superset | Elastic License 2.0 | ✘ |
| shadcn-electron-app, p32929, GeorgiMY, CarlosZiegler, Juu, electron-vite-boilerplate | **lisans dosyası yok** = tüm haklar saklı | ✘ yalnızca fikir |

## Kaynaklar

- Depolar (2026-10-01 HEAD, yerel klonlardan okundu): yukarıdaki tablolardaki GitHub bağlantıları.
- npm registry: `electron-vite` (dist-tags latest 5.0.0 / beta 6.0.0-beta.5), `better-sqlite3@13.0.3` tarball (prebuilds, `binding.gyp` `NAPI_VERSION=10`),
  `@electron-toolkit/tsconfig@2.0.0` ve `@electron-toolkit/preload@3.0.2` tarball'ları, `app-builder-lib@26.15.3` (`electronFuses`,
  `resetAdHocDarwinSignature`), `hono@4.13.12` tipleri, `@orpc/server@1.15.4` exports.
- [Electron 37.0.0 duyurusu](https://www.electronjs.org/blog/electron-37-0) — Chromium 138, Node 22.16.0.
- [Vitest tartışması #2142 (Electron + yerel modül)](https://github.com/vitest-dev/vitest/discussions/2142), [Vitest issue #6286](https://github.com/vitest-dev/vitest/issues/6286) — `ELECTRON_RUN_AS_NODE` geçici çözümü (bs3 13 ile gereksiz).
- [Actual — SharedArrayBuffer / HTTPS gereksinimi](https://actualbudget.org/docs/troubleshooting/shared-array-buffer/), [Actual — reverse proxy](https://actualbudget.org/docs/config/reverse-proxies/).
- Frappe Books README notu (commit 8f09465, 2026-09-20): kod imzalama sertifikası yenilenmediği için sürüm yayımlanamıyor.
- [Node-API belgeleri](https://nodejs.org/api/n-api.html) — Node-API 10: Node v22.14.0+, v23.6.0+ (better-sqlite3 13 `NAPI_VERSION=10` ile derleniyor → Electron ≥ Node 22.14 gömen sürüm gerekir; 37 = 22.16 ✔).
- OWASP Password Storage Cheat Sheet (PBKDF2-HMAC-SHA512 için ~210 000 yineleme önerisi) — bu oturumda yeniden doğrulanmadı; `masaustu-yigin.md` scrypt parametreleri esas alınmalı.
