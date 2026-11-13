# Faz 1 · Proje İskeleti, Araç Zinciri, CI ve Claude Düzeni

**Amaç:** Boş ama **paketlenebilir** Bismuth: Electron + Vite + React + TypeScript + Tailwind v4 + shadcn/ui + SQLite +
Drizzle; **tek kontrat, iki taşıma** (IPC şimdi, HTTP için soyutlama); üç dil altyapısı (TR/EN/RU; RTL'ye hazır mantıksal CSS); tema (açık/koyu/sistem +
kullanıcı renkleri); test ve lint; GitHub Actions ile Windows/macOS paketleri; `CLAUDE.md`, kancalar, ajanlar, beceriler.

**Gereksinimler:** G-03, G-04, G-07, G-08, G-17, G-47 (açılış ekranı Takvim), G-130, G-133, G-134, G-135.
**Ön koşul:** Faz 0 kararları kesin (K-01, K-02, K-08, K-11, K-12, K-17, K-20, K-22).
**Sorular:** yok (S-05, S-06, S-07 cevaplandı).
**Referanslar:** **`04-arastirma/repo-masaustu-sablonlar.md` §4 (başlangıç komutu, dosya düzeyinde alım tablosu, şablon düzeltmeleri, IPC kararı)**, `04-arastirma/depo-secimi.md` (kesin paket listesi), `faz0-prototipler.md` (doğrulanmış sürümler), `masaustu-yigin.md` §10, `shadcn-ekosistemi.md`, `i18n-rtl-mobil.md`, `claude-eklentileri.md` §4–5.

## Başlangıç (Faz 0 kararı)

1. electron-vite resmi şablonunu **geçici klasöre** üret: `npm create @quick-start/electron@1.0.30 bismuth -- --template react-ts --skip` (`--skip` hedef klasörü siler; depo kökünde çalıştırma). Dosyaları depoya kopyala; `docs/`, `.claude/`, `CLAUDE.md`, `prototypes/` (arşiv etiketi `archive/faz0`) korunur.
2. Şablon düzeltmeleri (`repo-masaustu-sablonlar.md` §4.3): `sandbox: true` · **`@electron-toolkit/preload` kaldır** (her kanala ham `ipcRenderer` açıyor) · `noImplicitAny: true` · `publish` bloğu, `postinstall: install-app-deps`, Linux hedefleri, kamera/mikrofon açıklamaları sil · CSP (`connect-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`) · `electronFuses` (ad‑hoc mac için `resetAdHocDarwinSignature`) · tek örnek kilidi · izin isteklerini reddet · `will-navigate` engeli · `spellcheck: false`.
3. Dosya düzeyinde alımlar (MIT, her dosyaya kaynak satırı + `THIRD_PARTY_NOTICES.md`): electron-db (DB açılışı, migrasyon öncesi yedek, geri yükleme, e2e fikstürleri, 3‑OS CI), guasam/electron-react-app (güvenli pencere, CI matrisi), LuanRoger/electron-shadcn (TanStack Router → **hash history**, i18next önyükleme, tema senkronu, Vitest kurulumu), cawa-93/vite-electron-builder (güvenlik modülleri, paketli uygulama e2e), actualbudget/actual (`security.ts`, yol geçişi koruması, additive‑only migrasyon testi). Frappe Books (AGPL) ve Beekeeper (GPL) kodu **kopyalanmaz**.
4. Vite **7.3.6**'ya sabitle (electron-vite 5, Vite 8'i desteklemiyor).
5. IPC: **Hono tek yönlendirici** spike'ı (Electron'da `ipcMain.handle('api', req => app.fetch(req, { ctx }))` — port açmadan; sunucu modunda aynı `app` `@hono/node-server` ile; istemci `hc<AppType>` + özel `fetch`). Spike başarısızsa yedek: elle zod kontratı (03-mimari) veya oRPC 1.15.

## Teslimatlar

1. **Depo iskeleti** (`03-mimari.md` §9): `src/main` (db, services, ipc, server (boş iskelet), network (boş), discovery, backup, notifications, printing, attachments), `src/preload`, `src/renderer` (features, components/ui, lib/{api,transport}, i18n, layouts/{desktop,mobile}), `src/shared` (contract, domain, money, date, format), `resources`, `scripts`, `tests/e2e`, `.github/workflows`.
2. **Araç zinciri** (`.npmrc` → `save-exact=true`; sürümler Faz 0'da doğrulanmış listeden): electron (K-12), electron-vite, electron-builder, `@electron-toolkit/*`; react 19, tailwindcss 4, shadcn CLI (`init -b radix`, `eject`), lucide-react, `@fontsource-variable/inter` (Arapça ertelendi → Arapça font yok), `react-day-picker@9.14.0` sabit, date-fns (tr/en/ru), `@tanstack/react-router`, `@tanstack/react-query`, zustand, react-hook-form + zod 4, i18next + react-i18next + i18next-cli (i18next-parser kullanımdan kalktı), sonner, cmdk; better-sqlite3 13 + drizzle-orm + drizzle-kit; hono + @hono/node-server (iskelet), bonjour-service (iskelet); electron-log; TypeScript strict, ESLint (typescript-eslint, react-hooks, `eslint-plugin-i18next/no-literal-string`), Prettier; vitest; @playwright/test.
   - Betikler: `dev`, `typecheck`, `lint`, `format`, `test`, `e2e`, `e2e:mobile`, `build`, `package:win`, `package:mac`, `db:generate`, `db:migrate`, `seed:demo`, `i18n:extract`, `holidays:generate`.
3. **Electron kabuğu**: `BrowserWindow` (contextIsolation, sandbox, CSP, **`spellcheck: false`** — Windows'ta sözlükleri Google CDN'den indirir), tek örnek kilidi, `app.setAppUserModelId('com.bismuth.hotel')`, pencere durumu hatırlama, `userData` altında `bismuth.db`, `logs/`, `backups/`, `attachments/`; uygulama adı ve simgeleri **Bismuth**; **hash tabanlı yönlendirme** (aynı paket `file://` ve Hono altında çalışsın diye, `04-arastirma/i18n-rtl-mobil.md` B.3).
4. **Veritabanı altyapısı**: Drizzle şema (yalnızca `settings`, `schema_version`, `users`, `roles`, `role_permissions`, `sessions`, `devices`, `audit_log` — geri kalanı Faz 2), `drizzle/` migrasyonları `extraResources`, açılışta `migrate()` + `integrity_check`, WAL, `:memory:` test fabrikası.
5. **Tek kontrat, iki taşıma**: `src/shared/contract/*.ts` (zod giriş/çıkış); `src/main/ipc/register.ts` tüm kanalları `ipcMain.handle` ile bağlar; `src/renderer/lib/transport/{ipc,http}.ts` aynı `Transport` arayüzünü uygular (http iskelet, Faz 13'te dolar); `useApi()` + TanStack Query. Örnek kanallar: `app.getInfo`, `settings.get/set`, `auth.ping`.
6. **Dil altyapısı**: `i18n/{tr,en,ru}.json` (tr dolu, diğerleri aynı anahtarlarla başlangıç çevirisi), `t()`, ESLint kuralı aktif, `Intl` biçimleyiciler (`src/shared/format.ts`: para `latn`, tarih, sayı), Tailwind mantıksal sınıf kuralı (`pl-/pr-/ml-/mr-/left-/right-` uyarısı, takvim istisnası — ileride RTL için), dil değiştirme anında.
7. **Tema altyapısı**: shadcn CSS değişkenleri, `.dark`, `ThemeProvider` (light/dark/system), `--status-*` değişkenleri, `<style id="user-theme">` enjeksiyonu, yoğunluk sınıfı; tema önizleme sayfası (Faz 3'te büyür).
8. **Uygulama kabuğu**: Sidebar (shadcn `sidebar-07` benzeri, daraltılabilir, rol‑duyarlı), üst çubuk (otel adı, bugün, kullanıcı, kilit, bildirim, `Ctrl/Cmd+K`), boş **"Takvim" (açılış ekranı, G-47)** ve boş "Bugün", "Hakkında" (sürüm, lisanslar, üçüncü taraf bildirimleri), **mobil kabuk iskeleti** (`layouts/mobile`: alt gezinme; viewport < 768 px'te devreye girer).
9. **Test altyapısı**: vitest örnekleri (Money, kontrat doğrulama, format), Playwright `_electron` açılış testi + `mobile` projesi (telefon emülasyonu, Vite dev sunucusuna karşı), CI'da xvfb.
10. **CI/CD**: `ci.yml` (typecheck, lint, test, build, e2e), `release.yml` (tag `v*`: Windows NSIS x64/arm64 — `installerLanguages` tr/en/ru —, macOS DMG arm64/x64, smoke test, Release'e yükleme); `electron-builder.yml` (`04-arastirma/masaustu-yigin.md` §10.2 tabanlı, `productName: Bismuth`, `mac.identity: "-"`).
11. **Claude düzeni**: mevcut kancalara ek: `pre-commit-gate`, `format-file`, `i18n-literal-warn`, `stop-gate`; ajanlar `ui-reviewer` (masaüstü+mobil ekran görüntüleri), `db-reviewer`, `security-reviewer`; beceriler `qa`, `add-migration`, `ui-screen`, `release`, `tr-copy-guide`, `electron-security`; hepsi `test-hooks.mjs` ile doğrulanır.
12. **Belgeler**: `README.md`, `docs/gelistirici.md` iskeleti, `docs/plan/bagimliliklar.md`.

## Kabul ölçütleri

- [x] `npm ci && npm run typecheck && npm run lint && npm test && npm run build` temiz geçer (yerelde + CI `verify`).
- [~] `release.yml` → `Bismuth-Setup.exe` ve iki `Bismuth-*.dmg`; Windows 10/11 ve sahibin Mac'inde açılır; "Hakkında" sürümü gösterir. — Paketler her push'ta `ci.yml` ile üretilip CI'da (Windows Server, macOS arm64) smoke testinden geçer; **sahibin kendi bilgisayarlarında denemesi bekliyor (S-80)**.
- [x] Paket ağ isteği yapmaz (smoke + e2e: `blockedRequests` boş, uygulama dışı istek yok); fontlar paket içinden (Inter woff2; Latin, Latin‑ext, Kiril — misafir adları için Yunan ve Vietnam alt kümeleri de); Türkçe/Rusça karakterler doğru (e2e + ekran görüntüleri).
- [x] Dil değiştirince tüm kabuk metinleri değişir (TR/EN/RU) ve yeniden açılışta kalır; para biçimi her dilde doğru (`format.test.ts`, e2e).
- [x] Tema: açık/koyu/sistem geçişi ve `--status-paid` ayardan değişimi çalışır (e2e: koyu tema + ödendi rengi `#16a34a`).
- [x] `settings.set` zod ile doğrulanır; transport arayüzü üzerinden çağrılır (IPC); http transport **çalışır** (telefon e2e'si ayarı HTTP ile değiştirir).
- [x] Mobil kabuk: 390×844 görünümde alt gezinme çıkar, yatay kaydırma yok (Playwright mobile; Rusça dahil her rota).
- [x] Kancalar: tüm `test-hooks.mjs` senaryoları geçer (57); `git commit` öncesi typecheck/lint/test koşar (`pre-commit-gate`).
- [x] `docs/plan/bagimliliklar.md` tüm paketleri listeler; `package-lock.json` commit'li.

## Bu fazda yapılmayacaklar

- Alan tabloları (Faz 2), ekranlar (Faz 3+), sunucu modunun gerçek çalışması (Faz 13), imza/noter.

## Sonuç (2026-10-02)

**Durum:** ✅ tamam — tek dış bekleyen: sahibin paketi otel bilgisayarında ve Mac'inde denemesi (**S-80**).

**Yapılanlar**
- **İskelet ve araç zinciri**: electron-vite şablonundan başlanıp `03-mimari.md` §9 düzenine taşındı; tüm sürümler sabit
  (`.npmrc` `save-exact`; liste ve lisanslar `docs/plan/bagimliliklar.md`). Kurulum paketine `node_modules` olarak yalnızca
  `better-sqlite3` girer; gerisi Vite ile paketlenir (renderer 784 KB / gzip ≈ 247 KB, preload 364 bayt).
- **Güvenlik** (şablon düzeltmeleri dahil): sandbox, contextIsolation, `spellcheck: false`, sıkı CSP, izinler kapalı,
  `will-navigate`/`window.open` engeli, uygulama dışı istek engeli ve günlüğü, tek örnek kilidi, IPC'de gönderen çerçeve
  denetimi, electron-builder sigortaları (asar bütünlüğü, `onlyLoadAppFromAsar`, `runAsNode` kapalı); `@electron-toolkit/preload`
  kaldırıldı (preload yalnızca `window.bismuth = { api, ready, platform }`).
- **Veritabanı**: Drizzle şema (settings, users, roles, role_permissions, sessions, devices, audit_log) + `drizzle/0000_init.sql`;
  açılışta `integrity_check`, WAL, `synchronous=FULL`, `foreign_keys`; bekleyen migrasyon varsa **önce yedek** (son 10);
  migrasyon hatası yedek yolunu taşır ve yerelleştirilmiş hata kutusunda gösterilir; additive‑only migrasyon testi.
- **Tek kontrat, iki taşıma (spike başarılı)**: zod kontrat haritası (`src/shared/contract`) → **tek Hono uygulaması**
  (`src/main/api/app.ts`) → servisler (`ctx` + yetki + transaction + audit). IPC `app.fetch(..., { ctx })` ile port açmadan;
  HTTP aynı uygulamayı `@hono/node-server` ile sunar. Renderer `Transport` arayüzü (IPC/HTTP) + TanStack Query kancaları.
  Örnek çağrılar: `app.getInfo`, `auth.ping`, `settings.get/set`.
- **Dil**: tr/en/ru (139 anahtar, eşitlik testi + `npm run i18n:check`), ESLint gömülü metin yasağı, `Intl` biçimleyiciler
  (para `latn`, `narrowSymbol`; tarih; sayı), mantıksal CSS kuralı (fiziksel `ml-/pr-/left-` yasak), ana süreç menüsü ve
  hata kutusu da çevrili; dil anında değişir ve kalır.
- **Tema**: shadcn değişkenleri (mor ana renk), açık/koyu/sistem, `--status-*` renkleri ayardan (`<style id="user-theme">`,
  hex yeniden doğrulanır) — **her temanın kendi renk seti** (`ui.statusColors`, `ui.statusColorsDark`; koyu temada
  "Satılmaz" siyah değil gri, "Boş"tan ayırt edilir), yoğunluk; tema önizleme sayfası.
- **Kabuk**: daraltılabilir kenar çubuğu, üst çubuk (otel adı, bugünün tarihi, `Ctrl/Cmd+K` komut paleti: sayfalar, tema,
  dil), açılış ekranı **Takvim** (G-47, boş), **Bugün** (boş), **Ayarlar** (otel adı, tema, yoğunluk, kuruş gösterimi,
  durum renkleri), **Hakkında** (sürüm, Electron/Chromium/Node/SQLite sürümleri, şema sürümü, bütünlük, veri klasörü, üçüncü taraf
  lisansları);
  < 768 px'te telefon düzeni (alt gezinme; **her** düğme/giriş/seçim 44 px; hızlı arama alttan açılan sayfa, 16 px yazı;
  bildirimler üstte, alt gezinmeyi örtmez; çentik/güvenli alan payı).
- **Testler**: Vitest — para (BigInt oran, en büyük kalan dağıtımı), tarih (`[giriş, çıkış)`), biçim, kontrat, DB
  (açılış, WAL, migrasyon öncesi yedek, bozuk migrasyonda yedek yolu), additive‑only migrasyon, API yönlendiricisi
  (404/401/400/403, statik yol geçişi), ayar servisi (yetki + audit), i18n eşitliği,
  tema, renderer; Playwright — Electron (açılış, ağ isteği yok, dil kalıcılığı, tema/renk, Node global'i yok, gezinme engeli)
  ve telefon (alt gezinme, HTTP ile ayar, ayarlarda tüm dokunma hedefleri ≥ 44 px, bildirim alt gezinmeyi örtmez, hızlı
  arama alttan + 16 px, Rusça dahil taşma yok). Toplam: 55 birim testi, 9 uçtan uca test.
- **CI/CD**: `ci.yml` her push'ta Linux doğrulama (typecheck, lint, biçim, test, kanca testleri, lisans listesi güncelliği,
  build, e2e, paketlenmiş uygulama smoke) + Windows NSIS x64 ve macOS DMG arm64/x64 paketleri + smoke → 14 günlük
  yapıtlar `Bismuth-Windows` / `Bismuth-Mac`. `release.yml` (`v*`): Windows x64 + arm64, macOS arm64 + x64, SHA-256,
  GitHub Release; güncelleme beslemesi yok.
- **Claude düzeni**: kancalar `pre-commit-gate`, `format-file`, `i18n-literal-warn`, `stop-gate` (57 kanca senaryosu
  geçiyor); ajanlar `ui-reviewer`, `db-reviewer`, `security-reviewer`; beceriler `qa`, `add-migration`, `ui-screen`,
  `release`, `tr-copy-guide`, `electron-security`.
- **Belgeler**: `README.md`, `docs/gelistirici.md`, `docs/plan/bagimliliklar.md`, `THIRD_PARTY_NOTICES.md` (betikle
  üretilir; CI güncelliğini denetler), `03-mimari.md` §9 güncel.
- **Simge**: kademeli bizmut kristali (yanardöner), `build/icon.svg` → png.

**İnceleme turu (ajanlar):**
- `turkish-ui-copy`: 24 bulgu düzeltildi — "Veritabanı" yerine "Veriler", "Giriş yap" (check-in ile karışır) yerine
  "Oturum aç", olmayan "yönetici" rolü yerine "otel sahibi", hata metinlerine "ne yapmalı", EN/RU sözlük uyumu
  (Day use, Unpaid, Дневное пребывание, Закрыт для продажи…), "Komut menüsü" yerine "Hızlı arama", sonner'ın İngilizce
  erişilebilirlik etiketleri çevrildi, ölü anahtarlar silindi; sözlüğe 6 terim eklendi (`tr-copy-guide`).
- `ui-reviewer` (40 ekran görüntüsü, TR + RU, açık + koyu, masaüstü + telefon): telefon dokunma hedefleri, bildirim
  konumu, koyu temada Boş/Satılmaz ayrımı, renk seçicinin temaya uyması, işaretsiz anahtar/radyo karşıtlığı (`--input`
  3:1), tam opak odak halkası, alt gezinmede odak halkası, genel `tnum` kaldırıldı (tire genişliyordu), kaydırma çubuğu
  payı, kart başlığı satır aralığı, iskelet yükleniyor durumu, kesilen metinlere `title` — hepsi düzeltildi.
- `requirements-tracer`: Faz 1'i engelleyen açık ZORUNLU yok. Önerileri uygulandı: `.claude/rules/ipc.md` gerçek tasarıma
  göre yeniden yazıldı; açılışta veri denetimi (`integrity_check`) sorun bulursa kullanıcıya uyarı (program çalışmaya
  devam eder); uygulama adresi yalnız `out/renderer` içindeki dosyalara sabitlendi (test: boşluklu/Türkçe harfli yol);
  `release.yml` smoke denetimi `ci.yml` kadar sıkı.
- CI: ilk commit (`c48be9c`) doğrulama + Windows + macOS paket işleri yeşil; yapıtlar `Bismuth-Windows`, `Bismuth-Mac`.

**Ölçümler (yerel, Linux):** geliştirme açılışı ≈ 1,3 sn; paketlenmiş uygulama (sigortalar açık) açılış ≈ 0,6 sn,
`integrity_check` ok, engellenen istek 0.

**Plandan sapmalar (bilerek)**
1. Eklenmeyen paketler (gerektiği fazda gelecek): react-day-picker + date-fns (Faz 3), zustand (gerekirse), bonjour-service
   (Faz 13); i18next-cli yerine kendi `i18n:check` betiğimiz; `@electron-toolkit/*` hiç yok; shadcn CLI yerine bileşenler
   GitHub'daki MIT kaynaktan elle (kayıt sunucusu bu ortamdan erişilemedi).
2. TypeScript 6.0.3 (7 → typescript-eslint desteklemiyor), ESLint 9.39.5 (10 → eslint-plugin-react desteklemiyor).
3. Betikler: `db:migrate` yok (migrasyon uygulama açılışında, yedekle birlikte çalışır); `seed:demo` Faz 2,
   `holidays:generate` Faz 9; `i18n:extract` yerine `i18n:check`. Ek betikler: `check`, `format:check`, `ui:shot`,
   `package:dir`, `notices`, `icon`.
4. `schema_version` tablosu yerine şema sürümü = uygulanmış drizzle migrasyon sayısı (`__drizzle_migrations`); Hakkında ve
   smoke çıktısında görünür.
5. Hono `hc<AppType>` istemcisi yerine kendi tipli kontrat haritamız: giriş ve çıkış **iki tarafta** zod'dan geçer, preload'a
   zod girmez; aynı yönlendirici IPC ve HTTP'de.
6. Telefon e2e'si Vite geliştirme sunucusu yerine **gerçek HTTP yolu** üzerinden (aynı Hono uygulaması + bellek içi DB):
   Faz 13'ün HTTP taşımasını şimdiden sınar.
7. Üst çubukta kullanıcı / kilit / bildirim yok (hesaplar Faz 4, bildirimler Faz 9); kenar çubuğu rol süzgeci Faz 4.
8. CI'daki her‑push paketi Windows'ta yalnızca x64 (süre); arm64 yalnızca `release.yml`'de.
9. Paketler imzasız (Windows) / ad‑hoc imzalı (macOS) — K-12/K-13 gereği; ilk açılış uyarısı README'de anlatıldı.
10. electron-builder'da Linux `dir` hedefi kaldı: yalnızca CI'daki paketli smoke testi için (dağıtılmaz).
11. electron-db'den "geri yükleme" alınmadı (Faz 14, yedek/geri yükleme ekranıyla); migrasyon öncesi yedek sayısı şimdilik
    sabit 10 — Faz 14'te ayara taşınır (G-09). Uçtan uca testler yalnız Linux'ta; Windows/macOS'ta paketli smoke.
12. `useApi()` yerine `useApiQuery` (okuma) + `useTransport().call` (yazma) kancaları.
13. CSP'de `style-src 'unsafe-inline'` açık (kullanıcı renkleri ve Radix konumlandırması); betik için açık değil.

**Sonraya kalan (engel değil):** `release.yml` ilk gerçek `v*` etiketiyle koşacak (Windows arm64 + SHA-256 + Release; en
geç Faz 16); G-03'ün resimli ilk kurulum kılavuzu Faz 16; NSIS kurulum sihirbazının kendisi CI'da çalıştırılmıyor (smoke
`win-unpacked` üzerinde) — sahibin denemesi (S-80) bunu kapatır.
