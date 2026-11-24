# Geliştirici notları

Yıllar sonra bu depoya dönen biri için: nasıl derlenir, paketlenir, nerede ne var, yeni bir şey nasıl eklenir, hangi
tuzaklar bilinir. Kurallar `ANTIGRAVITY.md` ve `.agent/rules/*.md`'de; plan, gereksinimler ve kararlar `docs/plan/` altında.
Kullanıcıya dönük belgeler: [`kurulum.md`](../otel/kurulum.md), [`yedek-ve-tasima.md`](../otel/yedek-ve-tasima.md).

## 0. Önce bunları okuyun

1. `ANTIGRAVITY.md` — ürün sınırları (çevrimdışı, OTA yok, fatura yok, telemetri/güncelleme yok) ve 15 yasak. Yasaklar kancalarla
   ve ESLint ile zorlanır; kod bu sınırları aşarsa derleme/commit düşer.
2. `docs/plan/README.md` — planın haritası. Gereksinimler `docs/plan/01-gereksinimler.md` (G-xx), mimari ve veri modeli
   `docs/plan/03-mimari.md`, kararlar `docs/plan/06-kararlar.md` (K-xx), sahibin soruları `docs/plan/05-sorular.md` (S-xx),
   günlük akış `docs/plan/akislar.md`, faz durumu `docs/plan/fazlar/DURUM.md`, her fazın ne yaptığı
   `docs/plan/fazlar/faz-NN-*.md` içindeki "Sonuç" bölümü. Bir şeyin **neden** öyle olduğunu önce buralarda arayın.
3. `docs/gelistirici/tasarim.md` — arayüz dili ve bileşen kuralları.
4. `docs/plan/bagimliliklar.md` — her bağımlılığın gerekçesi ve sabit sürümü.

## 1. Gerekenler

- Node **22.12+** (CI: Node 22). `npm ci` — sürümler `package-lock.json`'da sabit.
- Linux'ta e2e için `xvfb-run`; Playwright tarayıcısı `npx playwright install chromium` (yerel tarayıcı farklıysa
  `PW_CHROMIUM_PATH=/yol/chrome`).
- Windows NSIS ve macOS DMG yalnızca kendi işletim sisteminde üretilir (CI'da); Linux'ta `package:dir` ve paketlenmiş
  uygulamanın smoke testi çalışır.

## 2. Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | electron-vite geliştirme sunucusu + Electron (HMR). Geliştirmede CSP `'unsafe-inline'` ve localhost ws açılır; pakette açılmaz (`electron.vite.config.ts`). |
| `npm run check` | `typecheck` → `lint` → `format:check` → `test` (CI'daki `verify` ile aynı adımlar); başarılıysa `.cache/.checks-passed` yazar (`stop-gate.mjs` okur). Commit öncesi kanca bunu zorlar. |
| `npm run typecheck` | Üç tsconfig: `tsconfig.node.json` (main, preload, shared, birim testleri), `tsconfig.web.json` (renderer), `tsconfig.e2e.json` (Playwright). |
| `npm run lint` / `npm run format` / `npm run format:check` | ESLint (gömülü metin, fiziksel yön sınıfı, ağ global'i yasakları dahil; `eslint.config.mjs`) / Prettier. Prettier `docs/`, `drizzle/`, `components/ui` ve `.agent/skills/owner-review/template.html` dosyalarına dokunmaz (`.prettierignore`). |
| `npm test` | Vitest: `node` projesi (shared, main, `tests/unit`) + `dom` projesi (jsdom, renderer). |
| `npm run test:coverage` | Yalnız node testleri + kapsam (`src/shared/domain`, `src/main/services`); eşik %85 (dal %75). |
| `npm run build` | `out/` altına main, preload, renderer. e2e ve paketleme bundan önce gelir. |
| `npm run e2e` / `npm run e2e:mobile` | Playwright: gerçek Electron uygulaması / telefon görünümü (aşağıda §6). Önce `npm run build`. |
| `npm run ui:shot -- [--routes calendar,settings] [--lang ru] [--out dir]` | Önce derler; sonra masaüstü (1366×768) ve telefon ekran görüntüleri, açık + koyu tema. Ayrıntı: `scripts/ui-shot.mjs` başlığı. |
| `npm run ui:shot -- --size WxH,… --scale k,… --langs tr,en,ru --metrics <dosya.json>` | Çoklu boyut, ölçek ve dil (aşağıda §5.2a). Ölçüm JSON'u: yatay taşma, kesilen metin, ekran dışı etkileşimli öğe, yatay kaydırıcı kapsayıcılar, telefonda 44 px altı hedefler. |
| `npm run package:dir` / `package:win` / `package:mac` | Paketleme (electron-builder). §3. |
| `npm run db:generate -- --name <ad>` | Şema değişikliğinden **yeni numaralı** migrasyon (`drizzle/`). Commit edilmiş migrasyon değişmez (§5.3). |
| `npm run i18n:check` | Kodda kullanılan her sabit `t('…')` anahtarı `tr.json`'da var mı; en/ru anahtar kümesi tr ile aynı mı. Dinamik anahtarları `typecheck` denetler. |
| `npm run i18n:add -- <spec.json>` | Üç dil json'ına anahtar ekler (§5.4). |
| `npm run notices` | `THIRD_PARTY_NOTICES.md` + Hakkında ekranı listesi (`src/renderer/features/about/third-party.json`). CI güncel olup olmadığını denetler. |
| `npm run icon` | `build/icon.svg` → `build/icon.png` (1024). |
| `npm run seed:demo -- [--out .demo/bismuth.db] [--days 365] [--seed N] [--force]` | Örnek otel: 19 oda / 38 yatak, bir yıllık uydurma veri — hepsi servisler üzerinden (yetki + audit). Var olan dosyanın üzerine yalnız `--force` ile yazar. Açmak için: `BISMUTH_USER_DATA=.demo npm run dev`. Demo hesapları: `sahip`, `mudur`, `resepsiyon`, `muhasebe`, `temizlik` (şifre `demo-sifre-1`). |

## 3. Derleme ve paketleme

**Derleme.** `npm run build` electron-vite ile üç parça üretir: `out/main`, `out/preload`, `out/renderer`
(`electron.vite.config.ts`). Renderer küçültülür; main ve preload hata izi okunsun diye küçültülmez.

**Paket ayarları** `electron-builder.yml` içindedir (`package.json`'da `build` alanı yok):

- `publish: null` ve hiçbir güncelleme paketi yok: `electron-updater` eklenmez, `latest.yml` üretilmez (G-07). Paketleme
  komutları her yerde `--publish never` ile çağrılır.
- Windows: NSIS sihirbazı (`oneClick: false`), kullanıcı başına kurulum (`perMachine: false`), masaüstü + Başlat menüsü
  kısayolu, kurulum klasörü değiştirilebilir, `deleteAppDataOnUninstall: false` (kaldırınca veri kalır; kaldırıcının ilk
  sayfası bunu üç dilde söyler — `build/installer.nsh` `customUnWelcomePage`), kurucu dilleri Türkçe/İngilizce/Rusça,
  sunucu modu için yalnız özel ağlarda güvenlik duvarı kuralı (`customInstall`/`customUnInstall`). `arch: [x64, arm64]`,
  `buildUniversalInstaller: false` (iki mimariyi birlikte taşıyan, iki kat büyük üçüncü bir kurucu üretilmez);
  electron-builder'ın yazdığı ad `Bismuth-Setup-<mimari>.exe`.
- macOS: DMG, `arm64` ve `x64`; `identity: '-'` (ad-hoc imza), `notarize: false`, `hardenedRuntime: false`. Noter onayı ve
  Apple geliştirici imzası yok (S-04: ücretsiz yol); kullanıcı ilk açılışta Gatekeeper uyarısını elle geçer
  ([`kurulum.md`](../otel/kurulum.md)). İki DMG (evrensel tek paket değil, K-07): her biri yarı boyutta ve yerel modül
  birleştirme gerektirmez. electron-builder'ın yazdığı ad `Bismuth-<mimari>.dmg`.
- **Dosya adları (G-03):** `scripts/release-names.mjs` CI'da paketlerden sonra çalışır ve sahibin indirdiği sabit adları
  verir: `Bismuth-Setup.exe` (Windows x64), `Bismuth-Setup-arm64.exe`, `Bismuth.dmg` (Apple çipli), `Bismuth-Intel.dmg`;
  yanına `SHA256SUMS.txt` yazar. Sürüm numarası adda yoktur (Release başlığında ve Hakkında'dadır), bu yüzden
  `…/releases/latest/download/Bismuth-Setup.exe` bağlantısı her sürümde çalışır. Beklenmeyen bir kurulum dosyası çıkarsa
  betik durur.
- **Derleme damgası:** `electron.vite.config.ts` ana sürece `__BISMUTH_BUILD__` yazar: commit'in kısa kimliği ve commit'in
  günü (UTC; `SOURCE_DATE_EPOCH` varsa o). Derleme saatini kullanmaz: aynı commit aynı paketi verir. Hakkında ekranı
  "Derleme tarihi" ve "Derleme kimliği" satırlarında gösterir (`src/main/build-stamp.ts`); kaynaktan çalışırken (testler)
  ikisi de boştur.
- Electron sigortaları (`electronFuses`): `runAsNode` kapalı, asar bütünlüğü, `onlyLoadAppFromAsar`, çerez şifreleme.
- `better-sqlite3` yerel modülüdür: `asarUnpack` ile asar dışında durur, `npmRebuild: false` (hazır `prebuilds` kullanılır;
  her işletim sistemi yalnız kendi ikilisini taşır — `files` süzgeçleri).
- `extraResources`: `drizzle/` (migrasyonlar) ve `THIRD_PARTY_NOTICES.md` paketin `resources/` klasörüne girer;
  `src/main/app/paths.ts` `migrationsFolder()` bunu buradan okur.
- Linux yalnızca CI'da paketlenmiş uygulamanın smoke testi içindir (`target: dir`); dağıtılmaz.

**CI** (`.github/workflows/`):

- `ci.yml` (elle `workflow_dispatch` ya da `release.yml` içinden çağrılır; dakika kotası nedeniyle push'ta otomatik çalışmaz): Linux'ta typecheck, lint, biçim, birim testleri, koruma testleri
  (`node scripts/guards/test-guards.mjs`), lisans listesi güncelliği, build, e2e (Electron + telefon), paketlenmiş uygulama
  smoke testi.
- `release.yml` (sahibin elle başlattığı `workflow_dispatch` ya da `v*` etiketi): `verify` (`ci.yml`) ardından Windows (x64 + arm64)
  ve macOS (arm64 + x64) paketleri, smoke testi, GitHub Release'e sabit adlı dosyalar + `SHA256SUMS.txt`; sürüm notu
  `docs/surum-notlari/<etiket>.md` dosyasından (yoksa kısa bir satır). Güncelleme beslemesi üretilmez. Sürüm adımları `.agent/skills/release/SKILL.md` ("release" becerisi).
- **Smoke modu:** `Bismuth --smoke --smoke-out=sonuc.json` pencereyi göstermeden açar; renderer hazır sinyali gelince sürüm,
  açılış süresi, DB durumu ve **engellenen ağ istekleri** JSON'a yazılır ve uygulama kapanır. CI paketlenmiş uygulamada
  bunu çalıştırır (`ok` olmalı, `db.integrity === 'ok'`, `blockedRequests` boş).
- Sürüm numarası `package.json`'dan gelir (`npm version X.Y.Z --no-git-tag-version`); Hakkında ekranı onu okur.

## 4. Klasör haritası

```
src/main/                 Electron ana süreç + tüm iş mantığı (Electron'dan bağımsız kısımlar test edilir)
  index.ts                Açılış sırası (aşağıda), zamanlayıcılar, pencere, IPC kaydı
  app/                    paths.ts (userData yolları), i18n.ts (menü/hata kutusu), menu.ts, window-state.ts
  api/                    app.ts (tek Hono yönlendirici), handlers.ts (çekirdek işleyiciler), handlers/<modül>.ts, session.ts
  ipc/                    handle.ts (zarf doğrulama), register.ts (tek kanal, gönderen denetimi)
  server/                 Sunucu modu: gömülü HTTP sunucusu (index.ts, static.ts) — ağ kodu burada serbest
  discovery/              Yerel ağda ana bilgisayarı duyurma/bulma
  network/                İsteğe bağlı dış veri: fx/, holidays/, weather/, http.ts (5 sn zaman aşımı, izinli alan adları) — ağ kodu burada serbest
  backup/                 archive.ts (.bmy biçimi, AES-256-GCM), stepped-backup.ts (parça parça çevrimiçi kopya),
                          scheduler.ts (günlük + kapanış), drive.ts (Drive klasörünü bulma), pre-migration.ts
  security/               policy.ts (CSP, izinler, gezinme, tek örnek), app-url.ts, bismuth-key.ts (Bismuth anahtarı)
  services/               Yetki + transaction + audit: <alan>-service.ts; index.ts hepsini bağlar (createServices);
                          kit.ts (requirePermission, inTransaction…), context.ts (Ctx), errors.ts (AppError),
                          calendar/, tourism/, data-transfer/ alt klasörleri
  db/                     client.ts (SQLite'a tek erişim kapısı), schema/*.ts (Drizzle), seed/ (taban veri ve demo)
  session/                desktop-sessions.ts (pencere başına oturum bağı)
  notifications/          Görev hatırlatma zamanlayıcısı ve işletim sistemi bildirimi
  attachments/, printing/, windows/   Ek dosyalar (userData/attachments), yazdırma, ana pencere
src/preload/              Köprü: yalnızca window.bismuth = { api, ready, platform }
src/shared/               Her iki tarafın kullandığı, Electron/React'siz kod
  contract/               Tek kontrat: index.ts (çekirdek yordamlar), procedures/<modül>.ts (modül başına), proc.ts,
                          <alan>.ts (zod şemaları: rooms, settings, users, booking, backup…), transport.ts, errors.ts
  domain/                 Saf iş kuralları (booking, cash, salary, stays, housekeeping, reports, today…) + yanlarında testleri
  permissions.ts          Yetki anahtarları kataloğu ve rollerin varsayılan düzeyleri
  money.ts, format.ts, date.ts, ids.ts, color.ts, audit.ts
src/renderer/             React arayüzü
  features/<ekran>/       Bir ekranın sayfası, bileşenleri, testleri (calendar, ledger, guests, staff, settings, setup, …)
  components/             Ortak bileşenler; components/ui = shadcn kopyaları (elle alınmış, README.md'sine bakın)
  layouts/                desktop/, mobile/ kabuğu; auth-gate.tsx, route-guard.tsx
  lib/api/                useApiQuery / useApiMutation (TanStack Query sarmalayıcısı)
  lib/transport/          IPC ya da HTTP taşıması (ağ kodu burada serbest); lib/session/ oturum durumu
  i18n/                   tr.json (kaynak), en.json, ru.json, index.ts
  router.tsx, navigation.ts   Rotalar ve menü
  mocks/                  Faz 3'ten kalan taslak veri (hâlâ kullanan ekran varsa orada kalır; yeni ekran kullanmaz)
drizzle/                  Migrasyonlar (NNNN_ad.sql) ve meta/ (drizzle-kit yazar, elle düzenlenmez)
tests/                    unit/ (servis ve izin testleri), e2e/{electron,mobile}/, factories/ (test kurulumları)
scripts/                  check, i18n-add, i18n-check, notices, make-icon, seed-demo, ui-shot, guards/
build/, resources/        Simge kaynakları
.agent/                   Antigravity kuralları, becerileri ve hooks.json (§8)
.githooks/                Git kancaları (pre-commit, pre-push)
```

**Çağrı yolu:** `renderer` → `lib/transport` (IPC **ya da** HTTP, aynı kontrat) → `main/ipc` ya da `main/server` →
`main/api/app.ts` (zod doğrulama) → `main/api/handlers*` → `main/services` (yetki + transaction + audit) → `main/db`.
Ayrıntı `docs/plan/03-mimari.md` §9.

**Çalışma anı veri klasörü** (Electron `userData`; Windows `%APPDATA%\Bismuth`, macOS
`~/Library/Application Support/Bismuth`): `bismuth.db` (+ `-wal`), `backups/` (yedekler, güncelleme öncesi kopyalar,
`.restore/` geçici klasörü), `attachments/`, `logs/main.log` (en çok 2 MB), `window-state.json`, `bismuth-key.json`
(Bismuth anahtarı, `safeStorage` ile şifreli), `restore-pending.json` (bekleyen geri yükleme). Test ve deneme için
`BISMUTH_USER_DATA=/geçici/klasör`.

**Açılış sırası** (`src/main/index.ts`): veri klasörü → tek örnek kilidi → güvenlik politikası → bekleyen geri yükleme
(`applyPendingRestore`, DB açılmadan önce) → DB (bütünlük denetimi, bekleyen migrasyon varsa önce yedek) → servisler → IPC →
pencere. DB açılamazsa yerelleştirilmiş hata kutusu ve yedek yolu.

**Hata ve kurtarma** (Faz 16, P16a): `logs/main.log` kişisel veri içermez — her satır `app/log-redact.ts` süzgecinden
geçer (ad, telefon, e-posta, kimlik/pasaport, not alanları `[gizli]`; serbest metinde 7+ haneli sayılar, e-posta, IBAN,
belge numarası maskelenir; tarih/saat, kimlik (ULID), kod, tutar kalır). Günlüğe kaydın metni değil kimliği yazılır.
Yakalanmamış hata (`uncaughtException`) günlüğe gider ve "Yeniden başlat / Devam et" sorulur (en çok dakikada bir);
`unhandledRejection` yalnız günlüğe; çöken pencere "Pencereyi yeniden aç" ile açılır (`app/crash.ts`, `app/crash-wiring.ts`).
Arayüzde bozulan ekran `components/crash-screen.tsx` gösterir ve `system.reportError` ile ana sürecin günlüğüne bildirir
(dakikada en çok 20; ağdan yalnız oturum açmış kullanıcı). Veri dosyası diskte bozuksa (açılmıyor ya da
`integrity_check` ≠ ok) açılış en yeni sağlam yerel yedeği önerir (`backup/startup-recovery.ts`): seçilirse geri yükleme
işareti yazılır, program yeniden başlar ve `applyPendingRestore` bozuk dosyayı `bismuth-safety_…` klasörüne kopyalayıp
yedeği yerine koyar.

## 5. Tarifler

### 5.1 Yeni bir API çağrısı (servis + sözleşme + işleyici)

1. **Sözleşme:** `src/shared/contract/procedures/<modül>.ts` içindeki modül nesnesine `'modül.işlem': proc(girişŞeması,
   çıkışŞeması)` ekleyin (`proc`, `byId`, `empty`: `src/shared/contract/proc.ts`). Şemalar zod'dur (`import * as z from 'zod'`),
   büyük şemalar `src/shared/contract/<alan>.ts` içinde durur. Yeni bir modül dosyası açıyorsanız
   `procedures/index.ts` içindeki `MODULE_PROCEDURES`'e ekleyin. Çekirdek (oturum, ayarlar, kurulum) yordamları
   `src/shared/contract/index.ts` içindedir. Aynı ad iki yerde tanımlanırsa `typecheck` düşer.
2. **Servis:** `src/main/services/<alan>-service.ts` — `ctx` alır, `requirePermission(ctx, 'anahtar', 'view'|'edit')`
   ile denetler, yazmayı `inTransaction` içinde yapar ve her yazmayı `audit` ile kaydeder (`kit.ts`). Saf iş kuralı varsa
   `src/shared/domain/` içinde, yanına testiyle. Yeni servisi `src/main/services/index.ts` içindeki `createServices`
   içinde oluşturup dönüş nesnesine ekleyin.
3. **Yetki anahtarı** gerekiyorsa `src/shared/permissions.ts` kataloğuna ekleyin (anahtar + alan + altı sistem rolünün
   varsayılan düzeyi). Yeni anahtar, rol düzenleme ekranında görünür ve `tests/unit/permission-matrix.test.ts` tarafından
   denenir.
4. **İşleyici:** `src/main/api/handlers/<modül>.ts` içinde `'modül.işlem': (ctx, input) => services.alan.işlem(ctx, input)`
   (`HandlersFor<keyof typeof moduleProcedures>`). Yeni modül dosyasını `src/main/api/handlers/index.ts` içindeki
   `moduleHandlers`'a ekleyin. İşleyicisiz yordam `typecheck`'i düşürür.
5. **Renderer:** okuma `useApiQuery('modül.işlem', girdi)`; yazma `useApiMutation('modül.işlem', { invalidates: [...] })`
   (`src/renderer/lib/api/hooks.ts`). Aynı kod IPC'de (masaüstü) ve HTTP'de (telefon/istemci) çalışır; bileşen
   `window.bismuth`'a doğrudan dokunmaz.
6. **Testler:** servis (`tests/factories/db.ts` içindeki `memoryDatabase()` / `seededDatabase()` ile), yetkisiz rol →
   `PERMISSION_DENIED` testi (`tests/unit/permissions-<modül>.test.ts`), yönlendirici testi (`tests/unit/api.test.ts`
   tarzı: 400/401/403). Yetki kuralı: `.agent/rules/db.md`, `.agent/rules/ipc.md`.

### 5.2 Yeni ekran

`ui-screen` becerisi adımları verir (`.agent/skills/ui-screen/SKILL.md`). Kontrol listesi:

1. `src/renderer/features/<ad>/<ad>-page.tsx` (+ bileşenler, testler).
2. `src/renderer/router.tsx` içine rota; `src/renderer/navigation.ts` içine menü satırı (hangi izin gösterir, telefonda
   görünür mü). Rota adını `NavPath` ve `NavLabelKey` türlerine de ekleyin.
3. Üç dilde anahtarlar (§5.4); boş / yükleniyor / hata / yetkisiz durumları (`src/renderer/components/states.tsx`,
   `query-view.tsx`).
4. Mobil düzen kararı (`layouts/mobile/`, 44 px hedef, 16 px giriş yazısı) ve `ResponsiveDialog`.
5. vitest (`*.test.tsx`, `dom` projesi) ve akışsa Playwright e2e (masaüstü + telefon). Ekranı `tests/e2e/routes.ts`
   içindeki `SCREEN_ROUTES` listesine ekleyin (1366×768 ve 390×844 taşma denetimi).
6. `npm run ui:shot -- --routes <ad>` ile görüntüye bakın (açık/koyu, tr/ru).

Kurallar: `.agent/rules/ui.md`. Yalnızca `components/ui` ve proje bileşenleri; inline stil yok (sanallaştırılmış ızgarada
hesaplanan konum/boyut hariç); renkler CSS değişkeni; yön sınıfları mantıksal (`ms-`, `pe-`, `start-`).

### 5.2a Çoklu boyut ekran görüntüsü ve ölçüm

`npm run ui:shot` bayraklarla çoklu boyut, ölçek ve dilde çalışır (betik başlığı ayrıntılı):

- `--size 1280x720,1366x768,1440x900,1536x864,1920x1080,2560x1440,3840x2160`: masaüstü pencere içerik boyutları
  (varsayılan 1366×768). Telefon bu bayraktan etkilenmez; genişliği `--width` (390).
- `--scale 1,1.25,1.5`: Electron cihaz ölçeği (Windows %125 = 1.25). Her değer için Electron ayrı açılır.
- `--langs tr,en,ru`: her dil için; `--lang` tek dil olarak kalır.
- `--metrics .tmp/ui-shot/metrics.json`: her görüntü için ölçümler (`records`) ve özet (`summary`). Görüntü adı bu
  bayraklardan biri verildiğinde boyut, ölçek ve dili içerir.

Tek komut, 7 boyut × 2 tema × 3 dil (ana ekranlar):

```bash
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium xvfb-run -a npm run ui:shot -- --routes calendar,today,settings \
  --size 1280x720,1366x768,1440x900,1536x864,1920x1080,2560x1440,3840x2160 --langs tr,en,ru \
  --metrics .tmp/ui-shot/metrics.json
```

Ölçüm alanları: `horizontalOverflowPx` (belge yatay taşması), `offViewport` (ekran dışına taşan etkileşimli öğe),
`clipped` (`overflow` ya da üç nokta ile kesilen metin), `horizontalScrollers` (yatay kaydıran kapsayıcılar; takvim
şeridi gibi bilinçli olanlar burada listelenir, sayılmaz), `smallTargets` (yalnız telefon; 44×44 px altı). Her liste
`{count, sample}` biçimindedir. `screen-auditor` bu dosyayı kullanır.

### 5.3 Yeni migrasyon

`add-migration` becerisi (`.agent/skills/add-migration/SKILL.md`) adımları yürütür. Özet:

1. Drizzle şemasını değiştirin: `src/main/db/schema/<alan>.ts` (+ `schema/index.ts` dışa aktarımı). Tablo: `id` (ULID),
   `created_at`, `updated_at`; para `amount_minor` + `currency`; tarih `YYYY-MM-DD` metin; silme yerine `voided_at`/durum;
   var olan tabloya eklenen `NOT NULL` sütun mutlaka `DEFAULT` alır.
2. `npm run db:generate -- --name <slug>` → `drizzle/NNNN_<slug>.sql` + `drizzle/meta/*`. `meta/` dosyalarını elle düzenlemeyin.
3. **Commit edilmiş migrasyon değişmez** (G-133; kanca `db-migration-guard` engeller). Hata düzeltmesi = yeni migrasyon.
   Yalnızca eklemeli: `DROP`/`RENAME`/`DELETE FROM` yok (`tests/unit/migrations-additive.test.ts` denetler).
4. Testler: `tests/unit/migrations-upgrade.test.ts` (eski veritabanından yükseltme), servis testleri; `SCHEMA_VERSION`
   `drizzle/meta/_journal.json`'dan okunur (`tests/factories/db.ts`). Yedek geri yükleme sürüm kapısı da bu sayıyı kullanır:
   yeni migrasyon eklemek, eski programın yeni yedeği açamamasına yol açar (beklenen davranış).
5. Birleştirmede numara çakışırsa (paralel dallar) sonradan eklenen yeniden üretilir.

### 5.4 Yeni i18n anahtarı

Kullanıcıya görünen her metin `t('...')` anahtarıdır (G-08); `tr.json` kaynak, `en.json` ve `ru.json` aynı anahtar kümesi.
**Üç json dosyası elle düzenlenmez** (paralel dallar çakışır). Bir spec dosyası yazın (`i18n-spec/` git'e girmez):

```json
{
  "ns.key": ["Türkçe metin", "English text", "Русский текст"],
  "ns.count": {
    "tr": { "one": "{{count}} gece", "other": "{{count}} gece" },
    "en": { "one": "{{count}} night", "other": "{{count}} nights" },
    "ru": { "one": "{{count}} ночь", "few": "{{count}} ночи", "many": "{{count}} ночей", "other": "{{count}} ночи" }
  }
}
```

Sonra `npm run i18n:add -- i18n-spec/<ad>.json` ve `npm run i18n:check`. `null` = o dilin mevcut metni kalsın. Anahtar
silinmez; kullanılmaz kalanları `i18n:check` listeler. Ton ve sözlük için `.agent/skills/tr-copy-guide/SKILL.md`; paritenin
testi `tests/unit/i18n-parity.test.ts`. Rusçada dört çoğul biçimi zorunludur. Tarih/para biçimi her zaman
`src/shared/format.ts` üzerinden.

### 5.5 Yeni ayar (otele özgü değer)

Otele özgü her kural koda değil ayara/tohum tablosuna yazılır (G-09). Ayar şemaları `src/shared/contract/settings.ts`
(`backup.autoTime` gibi nokta ayrımlı anahtarlar, varsayılan değerler), okuma/yazma `src/main/services/settings-service.ts`
(`readSetting`), ekranı `src/renderer/features/settings/` altında bir bölümdür (`tabs.ts` bölüm listesini tutar). Liste
türü değerler (ödeme yöntemi, satış kanalı…) `src/main/db/seed/lists.ts` tohumundan gelir ve Ayarlar → Listeler'den düzenlenir.

## 6. Testler

- **Vitest** (`vitest.config.ts`): `node` projesi (`src/shared/**`, `src/main/**`, `tests/unit/**`; `TZ=Europe/Istanbul`,
  zaman aşımı 60 sn) ve `dom` projesi (`src/renderer/**`, jsdom, `tests/unit/setup-dom.ts`). Tek dosya: `npx vitest run <yol>`.
  Test adı davranışı anlatır; iş kuralı testleri Excel'den doğrulanmış sayıları kullanır (`.agent/rules/testing.md`).
  Servis testleri her test için `:memory:` veritabanı kurar (`tests/factories/db.ts`, `ctx.ts`); gerçek veritabanı okunmaz.
  Kapsam: `npm run test:coverage` (eşik %85, dal %75).
- **E2E masaüstü** (`tests/e2e/electron/*.spec.ts`): Playwright `_electron.launch`, her test geçici veri klasörüyle
  (`BISMUTH_USER_DATA`) gerçek uygulamayı açar; `fixtures.ts` oteli API ile kurup sahibi oturum açtırır
  (`tests/e2e/bridge.ts`, `setup-draft.mjs`). Linux'ta: `npm run build && xvfb-run -a npx playwright test --project=electron`.
- **E2E telefon** (`tests/e2e/mobile/*.spec.ts`): aynı renderer paketi `tests/e2e/mobile/server.ts` ile HTTP'den sunulur
  (bellek içi DB, yalnız 127.0.0.1), iPhone 13 emülasyonu 390×844. Port `E2E_PORT` (varsayılan 47373); aynı anda iki
  çalıştırma ya da başka bir ajan için farklı port verin: `E2E_PORT=47400 npm run e2e:mobile`.
  `PW_CHROMIUM_PATH` yerel Chromium yolunu belirler.
- **Ağ kapalı testi:** `network.enabled=false` iken istek sayacı 0; e2e'de dış veri kapalı bir porta bakar
  (`externalOrigin`). Ağ koduna dokunan her değişiklik `src/main/network/network.test.ts` ve smoke `blockedRequests` ile korunur.
- **Yetki:** her yeni servis metodu için en az bir "yetkisiz rol → PERMISSION_DENIED" testi; ortak matris
  `tests/unit/permission-matrix.test.ts`, modül başına `tests/unit/permissions-<modül>.test.ts`.
- **Koruma testleri:** `node scripts/guards/test-guards.mjs` (CI'da çalışır).

## 7. Bağımlılıkları dondurma

- `.npmrc` → `save-exact=true`: `npm install` sürüme `^` koymaz; `package-lock.json` commit'lidir ve CI `npm ci` kullanır.
  Aynı commit aynı paketi üretsin diye sürümler kayan değildir.
- Her yeni bağımlılık: `npm install --save-exact <paket>` + `docs/plan/bagimliliklar.md`'ye satır (ne için, sürüm, lisans,
  nerede) + `npm run notices` (Hakkında ekranı listesi ve `THIRD_PARTY_NOTICES.md`; aynı commit'te).
- `dependencies` içinde yalnız yerel modül (`better-sqlite3`) durur; kalan her şey `devDependencies` — Vite onları pakete
  gömer, kurulum küçük kalır ve çalışma anında ağdan ya da diskten ek modül aranmaz.
- **Yasak paketler** (G-07): `electron-updater`, `update-electron-app`, `@sentry/*`, `posthog*`, `mixpanel*`, `firebase*`,
  `@segment/*` ve benzeri telemetri/otomatik güncelleme/bulut paketleri (`scripts/guards/deps-guard.mjs` engeller;
  `.agent/skills/release/SKILL.md` G-07 denetimi yapar).
- **Tekrarlanabilir derleme** (Faz 16 madde 6): aynı commit + `npm ci` + aynı Node ana sürümü (CI: 22) → aynı `out/`.
  Doğrulandı (2026-10-05): `npm run build` art arda iki kez, `out/` altındaki 204 dosyanın sha256 özetleri birebir aynı.
  Karşılaştırma: `find out -type f | sort | xargs sha256sum | sha256sum`. Kurulum dosyalarının (`.exe`, `.dmg`) kendi
  baytları NSIS/DMG zaman damgası ve imza yüzünden derlemeden derlemeye değişebilir; içerik `out/` (paketteki `app.asar`)
  ile karşılaştırılır. `overrides` kullanılmıyor: alt bağımlılıkların sürümü `package-lock.json`'da sabittir (her paketin
  `resolved` + `integrity` alanı var); bir alt bağımlılığı zorla değiştirmek gerekirse `overrides` + yeni kilit dosyası
  aynı commit'te. Bekçi testleri: `tests/unit/dependencies.test.ts` (tam sürüm, kilit tam ve package.json ile aynı, ağaçta
  güncelleyici/telemetri yok, CI `npm ci`, `publish: null`, kodda `autoUpdater` yok) ve `tests/unit/network-boundary.test.ts`
  (ağ kodu yalnız izinli klasörlerde; ESLint `no-restricted-imports` + `no-restricted-globals`).
- Sürüm yükseltmek (özellikle Electron, better-sqlite3, electron-builder) bilinçli bir iştir: yükselttikten sonra
  `npm run check`, `npm run build`, `npm run e2e`, `npm run e2e:mobile` ve paketlenmiş uygulamanın smoke testi geçmelidir.
  `vite` bilerek 7'de: `electron-vite` 5, Vite 8'i desteklemez (`docs/plan/bagimliliklar.md`).

## 8. Antigravity kuralları, becerileri ve korumalar (`.agent/`, `scripts/guards/`, `.githooks/`)

Antigravity özelleştirmeleri `.agent/` altında, paylaşılan koruma betikleri `scripts/guards/` içinde, terminal/IDE git korumaları ise `.githooks/` klasöründedir:

| Koruma | Ne yapar |
|---|---|
| `db-migration-guard.mjs` | Commit edilmiş migrasyon dosyasına yazmayı engeller. |
| `protect-files.mjs` | `.env*`, kilit dosyaları ve `docs/plan/01-gereksinimler.md` dosyasına sessiz değişikliği engeller. |
| `kbs-data-guard.mjs` | Tablo dosyası (xlsx/csv…) ya da T.C. kimlik numarası içeren değişikliğin `git add`/`commit` edilmesini engeller. |
| `camera-data-guard.mjs` | Yüz görüntüsü/vektörü, ağırlık dosyası, `.env`, RTSP şifresi veya Telegram token'ının depoya girmesini engeller. |
| `push-guard.mjs` | Yalnız `antigravity/…` dalına ve `--force` olmadan push'a izin verir. |
| `workflow-guard.mjs` | `gh workflow run`, `gh release create`, `git tag v*` komutlarını engeller. |
| `pre-commit-gate.mjs` | Her kod commit'i öncesi typecheck + lint + test koşar; yalnız belge/koruma commit'inde hızlı geçer. |
| `deps-guard.mjs` | Yasak paketleri ve sabitlenmemiş sürümü engeller. |
| `no-network-guard.mjs` | Ağ kodu (`fetch`, `axios`, `WebSocket`…) beş izinli dizin dışına yazılırsa engeller. |
| `i18n-literal-warn.mjs` | JSX'e gömülü metni erken uyarır (asıl kapı ESLint). |
| `format-file.mjs` | Düzenlenen dosyayı Prettier ile biçimler. |
| `stop-gate.mjs` | `npm run check` geçmeden (`src/`, `tests/`, `drizzle/`, `scripts/`, `.github/` değişmişse) kapanışı uyarır. |

Araç kancası `.agent/hooks.json` → `.agent/hooks/pre-tool-use.mjs` aracılığıyla `run_command`, `edit_file` ve `write_file` öncesi bu korumaları çalıştırır.
Alan kuralları `.agent/rules/` (`bismuth.md`, `db.md`, `ui.md`, `ipc.md`, `testing.md`, `camera.md`), beceriler `.agent/skills/` (`ui-screen`, `add-migration`, `tr-copy-guide`, `electron-security`, `release`, `requirement-change`, `qa`, `owner-review`) altındadır.

## 9. Güvenlik özeti

`sandbox`, `contextIsolation`, Node entegrasyonu yok, `spellcheck: false`; sıkı CSP (`connect-src 'self'`); tüm izin
istekleri reddedilir (yalnız temizlenmiş panoya yazma); `will-navigate` ve `window.open` engelli; uygulama dışı her istek
`webRequest` ile engellenir ve günlüğe yazılır; preload yalnızca `window.bismuth = { api, ready, platform }` açar ve IPC
çağrısında gönderen çerçevenin adresi denetlenir; electron-builder sigortaları (§3). Ağ kodu yalnızca beş izinli klasörde
(`src/main/network/`, `src/main/server/`, `src/main/discovery/`, `src/main/camera/` ve `src/renderer/lib/transport/` — ESLint ve koruma zorlar). Yetki yalnız serviste: IPC ve HTTP aynı
kapıdan geçer. Ayrıntı: `.agent/skills/electron-security/SKILL.md`.

## 10. Bilinen tuzaklar

- **React Compiler kapalı.** TanStack Table v9 ile hatalar çıkardığı için açılmadı (`.agent/rules/ui.md`); `useMemo`/
  `useCallback` gereken yerde elle yazılır.
- **`vaul` yok.** Bakımsız olduğu için eklenmez; mobil alt sayfa `Sheet side="bottom"`, ortak sarmalayıcı
  `ResponsiveDialog` (masaüstünde Dialog, telefonda alt Sheet).
- **Radix diyalog içinde açılır menü.** `modal={false}` tuzağı: diyalog içinde açılan Select/Popover odağı ve kaydırmayı
  bozabilir; kaydırma sorununda `ScrollArea` kullanılır. Yeni bir diyalog yazarken içindeki seçimleri gerçekten açıp deneyin.
- **ICU farkı.** Node, Electron ve CI makinelerinin ICU verisi aynı değildir: saat dilimi adı "Türkiye Saati" ya da "Türkiye
  Standart Saati" çıkabilir (sihirbaz ülke/saat dilimi adları `Intl.DisplayNames`'ten gelir; testler iki yazımı da kabul
  eder), Rusçada binlik ayırıcı bölünmez boşluktur (U+00A0), `₺` simgesi yalnız `currencyDisplay: 'narrowSymbol'` ile
  çıkar. Bu yüzden para biçimi için küçük birim basamakları sabit tablodadır (`src/shared/money.ts`, `Intl`'e güvenilmez)
  ve kullanıcıya görünen biçimler yalnızca `src/shared/format.ts` üzerinden alınır; testte biçimli metin karşılaştırırken
  ICU'ya bağımlı olmayın.
- **Servis testleri ve `dataDir`.** Yedek servisi veri klasörü altında `backups/` oluşturur; testte salt-yazılır bir yol
  (`/data` gibi) vermeyin, geçici klasör kullanın (`tests/factories/ctx.ts`, `runtime.ts`).
- **Saat dilimi.** Servisler otelin duvar saatini kullanır; vitest `node` projesi `TZ=Europe/Istanbul` ile koşar. Tarihler
  `YYYY-MM-DD` yerel gün metnidir, konaklama `[giriş, çıkış)` — çıkış günü gece değildir.
- **Yedek ve anahtar.** Drive'a giden her dosya Bismuth anahtarıyla şifrelidir; anahtar `safeStorage`'a bağlıdır
  (Windows kullanıcı hesabı / macOS anahtar zinciri). İmzasız (ad-hoc) macOS paketinde her yeni sürümde anahtar zinciri
  sorusu çıkabilir ([`kurulum.md`](../otel/kurulum.md)); anahtar deposunu değiştiren kod buna dikkat etmeli.
- **Geri yükleme çalışan veritabanını değiştirmez.** Yedek açılıp denetlenir, işaret dosyası (`restore-pending.json`)
  yazılır, değişim sonraki açılışta DB açılmadan önce yapılır (`applyPendingRestore`). Bu sırayı bozmayın.
- **Paralel çalışma.** Birden fazla ajan/oturum aynı depoda çalışırken `contract/index.ts` ve `api/handlers.ts` yerine modül
  dosyalarına, `tr/en/ru.json` yerine `i18n:add` spec'lerine yazılır; aksi hâlde birleştirme çakışır.
- **Güncelleme yok.** Hiçbir yerde güncelleme denetimi eklemeyin; yeni sürüm elle kurulur ve veri düzeni açılışta yükseltilir
  (önce kopya alınır). Eski program yeni veri düzenini açamaz; bu bilinçli bir kapıdır.
