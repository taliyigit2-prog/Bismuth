# Bağımlılıklar

> Her paket: ne için, sürüm (tam sabit, `.npmrc` → `save-exact=true`), lisans, nerede kullanıldığı.
> Taslak ve gerekçeler: `04-arastirma/depo-secimi.md`. Yeni paket = bu dosyaya satır + `save-exact` (deps-guard kancası
> hatırlatır) + `npm run notices` (Hakkında ekranı ve `THIRD_PARTY_NOTICES.md` yenilenir).
> Yasak paketler (G-07): `electron-updater`, `@sentry/*`, `posthog*`, `mixpanel*`, `firebase*`, `@segment/*` ve benzeri
> telemetri/otomatik güncelleme/bulut paketleri.

## Paketleme kuralı

- `dependencies` içinde **yalnızca yerel (native) modül** durur: `better-sqlite3`. Kurulum paketine `node_modules` olarak
  yalnızca o girer.
- Geri kalan her şey `devDependencies`: Vite onları `out/main`, `out/preload`, `out/renderer` içine **paketler** (bundle).
  Böylece kurulum küçük kalır ve çalışma anında ağdan/diskten ek modül aranmaz.
- Sürüm değişikliği = bu tablo + `package-lock.json` + `THIRD_PARTY_NOTICES.md` aynı commit'te.

## Çalışma anı (kullanıcının bilgisayarında çalışan kod)

| Paket | Sürüm | Lisans | Ne için | Nerede |
|---|---|---|---|---|
| better-sqlite3 | 13.0.3 | MIT | SQLite sürücüsü (WAL, eşzamanlı, transaction) | main · `src/main/db/client.ts` |
| drizzle-orm | 0.45.3 | Apache-2.0 | Tip güvenli sorgu + migrasyon uygulayıcı | main · `src/main/db/` |
| hono | 4.13.12 | MIT | Tek API yönlendiricisi: IPC ve HTTP aynı `app.fetch` | main · `src/main/api/`, `src/main/server/` |
| @hono/node-server | 2.1.3 | MIT | Sunucu modunda Hono'yu Node HTTP'ye bağlar (Faz 13'te açılır) | main · `src/main/server/index.ts` |
| zod | 4.6.5 | MIT | Kontrat doğrulama (giriş/çıkış), form şemaları | shared · main · renderer |
| electron-log | 5.4.4 | MIT | Yerel günlük dosyası (`userData/logs/main.log`); ağa göndermez | main · `src/main/index.ts` |
| react | 19.3.0 | MIT | Arayüz | renderer |
| react-dom | 19.3.0 | MIT | Arayüz | renderer |
| @tanstack/react-router | 1.170.41 | MIT | Sayfa yönlendirme (hash geçmişi: `file://` ve HTTP'de aynı paket) | renderer · `router.tsx` |
| @tanstack/react-query | 5.104.0 | MIT | Sunucu durumu önbelleği (API çağrıları) | renderer · `lib/api/` |
| react-hook-form | 7.89.0 | MIT | Formlar | renderer · `features/*` |
| @hookform/resolvers | 5.9.1 | MIT | react-hook-form ↔ zod | renderer |
| i18next | 26.4.2 | MIT | Çeviri altyapısı (tr/en/ru) | renderer · main (menü, hata kutusu) |
| react-i18next | 17.0.15 | MIT | React için `t()` | renderer |
| radix-ui | 1.6.7 | MIT | shadcn/ui bileşenlerinin erişilebilir temeli (tek paket) | renderer · `components/ui/` |
| cmdk | 1.1.1 | MIT | Komut paleti (Ctrl/Cmd+K) | renderer · `components/ui/command.tsx` |
| sonner | 2.0.8 | MIT | Bildirim balonları (toast) | renderer · `components/ui/sonner.tsx` |
| lucide-react | 1.49.0 | ISC | Simgeler (pakete gömülü SVG) | renderer |
| class-variance-authority | 0.7.1 | Apache-2.0 | Bileşen varyantları (shadcn) | renderer · `components/ui/` |
| clsx | 2.1.1 | MIT | Sınıf birleştirme | renderer · `lib/utils.ts` |
| tailwind-merge | 3.7.0 | MIT | Çakışan Tailwind sınıflarını ayıklama | renderer · `lib/utils.ts` |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 | Inter yazı tipi **paket içinde** (CDN yok; Latin, Latin‑ext, Kiril) | renderer · `styles/globals.css` |
| tw-animate-css | 1.4.0 | MIT | shadcn animasyon sınıfları (yalnız CSS) | renderer · `styles/globals.css` |
| recharts | 3.10.1 | MIT | Grafikler (shadcn `chart.tsx` sarmalayıcısıyla; renkler `--chart-n` / `--status-*`) — Faz 3 | renderer · `components/ui/chart.tsx`, `features/reports` |
| Yr hava simgeleri (paket değil, `assets/weather/*.svg`) | metno/weathericons `main` (2026-10-04) | MIT | Hava kartı simgeleri, pakete gömülü SVG (14 simge) | renderer · `components/weather-icon.tsx` |
| exceljs | 4.4.0 | MIT | KBS Excel'ini okuma (sütunlar başlık adıyla; kimlik sütunları okunmaz, K-24); Faz 14: tabloları XLSX'e yazma, içe aktarmada XLSX okuma (hücre renkleriyle) | main · `services/tourism/kbs-reader.ts`, `services/data-transfer/{writers,table-reader}.ts` |
| i18n-iso-countries | 7.14.0 | MIT | Uyruk eşleme: İngilizce + Türkçe ülke adları (K-36); yalnız çekirdek giriş + en/tr dilleri | main · `services/tourism/country-map.ts` |
| bonjour-service | 1.4.4 | MIT | Sunucu modunda yerel ağ duyurusu ve arama (`_bismuth._tcp`, mDNS; yalnız yerel ağ, internete gitmez). Bağımlılıkları: multicast-dns, dns-packet, fast-deep-equal (MIT) — Faz 13 | main · `src/main/discovery/index.ts` |
| uqr | 0.1.3 | MIT | Adreslerin QR kodu (telefon kamerayla okutur); bağımlılığı yok, pakete gömülü | renderer · `components/qr-code.tsx` |
| date-holidays | 3.37.0 | ISC + CC-BY-3.0 (veri) | Sınırsız yıl, çevrimdışı bayram üretimi (K-04); 2076 sonrası `Intl` islamic-umalqura yedeği | main · `services/calendar/holidays.ts` |

## Derleme, paketleme, stil

| Paket | Sürüm | Lisans | Ne için |
|---|---|---|---|
| electron | 37.10.3 | MIT | Masaüstü çalışma ortamı (K-12) |
| electron-vite | 5.0.0 | MIT | main/preload/renderer derlemesi ve geliştirme sunucusu |
| vite | 7.3.6 | MIT | Paketleyici (electron-vite 5, Vite 8'i desteklemiyor) |
| @vitejs/plugin-react | 5.2.0 | MIT | React JSX + Fast Refresh |
| electron-builder | 26.15.3 | MIT | Windows NSIS (`Bismuth-Setup`), macOS DMG, sigortalar (fuses); `publish: null` |
| tailwindcss | 4.3.3 | MIT | Stil |
| @tailwindcss/vite | 4.3.3 | MIT | Tailwind'in Vite eklentisi |
| typescript | 6.0.3 | Apache-2.0 | Tip denetimi (TS 7'yi typescript-eslint henüz desteklemiyor) |
| drizzle-kit | 0.31.11 | MIT | Şemadan migrasyon SQL'i üretir (`npm run db:generate`) |
| tsx | 4.23.15 | MIT | TS betiklerini doğrudan çalıştırma (mobil e2e sunucusu) |
| @types/node | 22.20.5 | MIT | Node tipleri |
| @types/react | 19.3.0 | MIT | React tipleri |
| @types/react-dom | 19.3.0 | MIT | React DOM tipleri |
| @types/better-sqlite3 | 9.6.0 | MIT | better-sqlite3 tipleri |

Not (güvenlik yeniden incelemesi N-12, bilinçli istisna): `electron-builder.yml` içindeki `linux: target: dir` yalnız
CI'daki paketli uygulama duman testi (`npm run package:dir` + e2e) içindir; Linux kurulum dosyası üretilmez ve
dağıtılmaz. Dağıtılan hedefler yalnız Windows NSIS (`Bismuth-Setup.exe`) ve macOS DMG'dir; "Linux hedefi yok"
kontrol maddesi bu dağıtım hedeflerini kapsar.

## Kalite (lint, biçim, test)

| Paket | Sürüm | Lisans | Ne için |
|---|---|---|---|
| eslint | 9.39.5 | MIT | Lint (eslint-plugin-react ESLint 10'u desteklemiyor) |
| @eslint/js | 9.39.5 | MIT | Temel kurallar |
| typescript-eslint | 8.71.0 | MIT | TS kuralları, `consistent-type-imports` |
| eslint-plugin-react | 7.37.5 | MIT | React kuralları |
| eslint-plugin-react-hooks | 7.1.1 | MIT | Hook kuralları |
| eslint-plugin-react-refresh | 0.5.7 | MIT | Fast Refresh uyumu |
| eslint-plugin-i18next | 6.1.5 | ISC | Koda gömülü metin yasağı (G-08) |
| eslint-config-prettier | 10.1.8 | MIT | ESLint ↔ Prettier çakışmalarını kapatır |
| globals | 17.13.0 | MIT | Ortam global tanımları |
| prettier | 3.9.9 | MIT | Biçimlendirme |
| prettier-plugin-tailwindcss | 0.8.1 | MIT | Tailwind sınıf sıralaması |
| vitest | 5.0.3 | MIT | Birim testleri (node + jsdom projeleri) |
| jsdom | 30.1.1 | MIT | DOM testi ortamı |
| @testing-library/react | 16.3.3 | MIT | Bileşen testleri |
| @testing-library/dom | 10.4.2 | MIT | Bileşen testleri |
| @testing-library/jest-dom | 7.0.1 | MIT | DOM eşleştiricileri |
| @testing-library/user-event | 14.6.7 | MIT | Kullanıcı etkileşimi benzetimi |
| @playwright/test | 1.63.0 | Apache-2.0 | Uçtan uca testler: Electron + telefon emülasyonu |
| @axe-core/playwright | 4.13.0 | MPL-2.0 | Erişilebilirlik taraması e2e'de (Faz 15 madde 5): `tests/e2e/electron/a11y.spec.ts`, `tests/e2e/mobile/a11y.spec.ts`; kurulum paketine girmez. Bağımlılığı `axe-core` 4.13.0 (MPL-2.0) |
| @vitest/coverage-v8 | 5.0.3 | MIT | Test kapsamı ölçümü (`domain/` + `services/` ≥ %85, faz-02) |

## Kamera yan süreci (Python; Faz 20, `otel-kamera/`)

npm bağımlılığı eklenmedi: Telegram istemcisi (`src/main/network/telegram/`) ve köprü (`src/main/camera/`) Node'un
yerleşik `fetch`, `child_process`, `crypto` ve `net` modüllerini kullanır. Python tarafı `otel-kamera/requirements.txt`'te
**`==` ile sabittir** (Python 3.12); geliştirme araçları `requirements-dev.txt`'tedir ve pakete girmez. Kamera eki ayrı
kurulur ve yalnız `camera.enabled` açıksa çalışır (P20f paketleme). Lisans bildirimi: `THIRD_PARTY_NOTICES.md` "Camera module"
bölümü (P20d; `npm run notices` `requirements.txt`'ten üretir). Model dosyaları paket değil, `resources/camera/models/` içinde
lisans notlarıyla (README); depoya girmez. P20d yeni bağımlılık eklemedi (ByteTrack benzeri izleyici numpy ile yazıldı).

| Paket | Sürüm | Lisans | Ne için | Not |
|---|---|---|---|---|
| fastapi | 0.115.6 | MIT | Yan sürecin HTTP yüzü | `127.0.0.1`, belirteç zorunlu |
| uvicorn | 0.34.0 | BSD-3 | ASGI sunucusu | yalnız loopback |
| python-multipart | 0.0.33 | Apache-2.0 | Fotoğraf yükleme formu (P20c'de kalkabilir) | |
| pydantic | 2.14.3 | MIT | İstek doğrulama | |
| numpy | 2.5.4 | BSD-3 | Görüntü ve vektör işlemleri | |
| opencv-python-headless | 5.0.0.93 | Apache-2.0 (FFmpeg LGPL-2.1 dinamik) | RTSP okuma, JPEG, CLAHE | `opencv-python` yerine headless (arayüz yok, daha küçük) |
| supervision | 0.31.7 | MIT | `Detections`, `PolygonZone` | |
| ultralytics | 8.4.212 | **AGPL-3.0** | YOLO11n kişi tespiti | K-57 sahip kararı; telemetri kapatma ve lisans notu P20d. Codespace'te kurulmadı |
| insightface | 0.7.3 | MIT (kod) · **ağırlıklar yalnız ticari olmayan araştırma** | `buffalo_s` yüz tanıma | K-57 sahip kararı; `06` §6.3–6.4 (izin e-postası). Kaynaktan derlenir. Codespace'te kurulmadı |
| onnxruntime | 1.32.0 | MIT | InsightFace çıkarımı | Codespace'te kurulmadı |
| pytest 9.2.0 · httpx 0.28.1 · ruff 0.17.5 | — | MIT / BSD-3 / MIT | Python testleri ve lint | yalnız geliştirme |

**Kamera eki kilit dosyaları (P20ffix):** `requirements.txt` sürümleri seçer; ek üretilirken kurulan her dosya
`otel-kamera/requirements-bundle.lock` (Windows + macOS, hash'li, tek dizin PyPI; geçişli bağımlılıklar dahil) ile
`pip --require-hashes` altında doğrulanır; `node scripts/camera-lock.mjs` üretir. `insightface` import zinciri için
`onnx`, `albumentations`, `scikit-image`, `matplotlib`, `scipy`, `requests`, `tqdm`, `Pillow` ekte bulunur (insightface'in
`app/mask_renderer.py`'si hepsini içe aktarır; `requests` Python tarafında ağ çağrısı için **kullanılmaz**, yalnız bu zincirde
yüklenir). `ultralytics-platform` ve `httpx` ekte yok. Derleme araçları `requirements-build.lock`, insightface kaynak arşivi
`requirements-insightface.lock`.

Kaldırılanlar: `requests` (Python tarafında ağ çağrısı yok, K-50), `python-dotenv` (ayarlar Bismuth'tan JSON gelir).
Python bağımlılıkları Codespace'te `otel-kamera/venv` içine kurulur (gitignore'da); `ultralytics` + `insightface`
sürümleri sahibin makinesinde/P20d'de gerçek modellerle doğrulanır.

## Pakete kopyalanmış kaynaklar (npm paketi değil)

Dosya başında kaynak satırı var; lisans metinleri `THIRD_PARTY_NOTICES.md`'de (`npm run notices`).

| Kaynak | Lisans | Ne alındı |
|---|---|---|
| shadcn/ui (new-york-v4) | MIT | `src/renderer/components/ui/*` |
| electron-vite şablonu (`@quick-start/electron`) | MIT | Başlangıç yapılandırması |
| electron-db | MIT | DB açılışı, migrasyon öncesi yedek (`db/client.ts`, `backup/pre-migration.ts`) |
| guasam/electron-react-app | MIT | Güvenli pencere ayarları |
| cawa-93/vite-electron-builder | MIT | Güvenlik modülleri, paketli uygulama smoke fikri |
| actualbudget/actual | MIT | `security/policy.ts` fikirleri, yol geçişi koruması, additive‑only migrasyon testi |

## Geliştirme aracı (uygulamaya girmez)

`tools/ajan/` kendi `package.json`'ı olan ayrı bir klasördür; uygulama paketine ve kök bağımlılıklara girmez.

| Paket | Sürüm | Lisans | Ne için | Nerede |
|---|---|---|---|---|
| @anthropic-ai/claude-agent-sdk | 0.3.322 | Anthropic ticari şartları | Geliştirme ajanını Anthropic API anahtarıyla çalıştıran başlatıcı (`node tools/ajan/ajan.mjs`) | yalnızca geliştirme · `tools/ajan/` |

## Rust prototipi (uygulamaya girmez; Faz 22 P22c)

`shell-tauri/` kendi `Cargo.lock` dosyası olan ayrı bir klasördür; Electron paketine ve `package.json`'a girmez. Sürümler
`Cargo.lock` ile sabit (413 kayıt, çoğu geçişli); doğrudan bağımlılıklar:

| Crate | Sürüm (kilitli) | Lisans | Ne için | Nerede |
|---|---|---|---|---|
| tauri | 2.12.5 | MIT / Apache-2.0 | Pencere + sistem WebView'ı (WebView2 / WKWebView / WebKitGTK); yalnızca `wry`, `compression` | `shell-tauri/src-tauri` |
| tauri-build | 2.7.4 | MIT / Apache-2.0 | Derleme zamanı yardımcısı | aynı |
| tauri-plugin-window-state | 2.5.0 | MIT / Apache-2.0 | Pencere boyutu/konumunu hatırlar | aynı |

Ürünleştirilirse (P22d) `THIRD_PARTY_NOTICES` Rust crate lisanslarını da kapsamalı (`cargo about`/`cargo license`); `ort` gibi rc crate eklenmez.

## Plan listesinde olup bu fazda **eklenmeyenler** (gerektiği fazda eklenecek)

| Paket | Neden ertelendi | Hangi faz |
|---|---|---|
| react-day-picker 9.14.0, date-fns (tr/en/ru) | Henüz tarih seçici yok | Faz 3 |
| zustand | Henüz istemci tarafı genel durum yok (ayarlar TanStack Query'de) | Gerekirse Faz 3 |
| i18next-cli | Dinamik anahtarlarda güvenilmez; yerine `scripts/i18n-check.mjs` (anahtar eşitliği + kullanılmayan anahtar) | — |
| @electron-toolkit/* | `@electron-toolkit/preload` her kanala ham `ipcRenderer` açıyordu (şablon düzeltmesi); diğerleri gereksiz | — |
| shadcn CLI | Kayıt sunucusu bu ortamda erişilemez; bileşenler GitHub'daki MIT kaynaktan elle alındı (`components/ui/README.md`) | — |
