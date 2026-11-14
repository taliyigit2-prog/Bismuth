# 07 — Kurulum ve dağıtım ("kolayca indir ve kur")

> Hazırlayan: Fable (2026-11-12). Kaynak: `electron-builder.yml`, `.github/workflows/*.yml`, `docs/kurulum.md`,
> `docs/gelistirici.md`, `package.json`, `scripts/`, `prototypes/`, `.devcontainer/`. Dakika çarpanları GitHub belgesinden
> (doğrulandı 2026-11-12, docs.github.com "About billing for GitHub Actions": dakika başına Linux 2 çekirdek $0,006,
> Windows $0,010, macOS $0,062 → macOS ≈ 10×, Windows ≈ 2× Linux; dahil dakikalarda çarpan 1×/2×/10×). Sahip için tek sayfalık rehber:
> `docs/kurulum-rehberi-basit.md` (taslak; gerçek makinede doğrulanacak, S-80).

## 1. Mevcut durum

| Konu | Durum | Kanıt |
|---|---|---|
| Windows paketi | NSIS, x64 + arm64, kullanıcı başına, **imzasız** (`CSC_IDENTITY_AUTO_DISCOVERY=false`) | `electron-builder.yml` win/nsis |
| macOS paketi | DMG arm64 + x64 (ayrı), ad-hoc imza (`identity: '-'`), notarization yok, `gatekeeperAssess: false` | `electron-builder.yml` mac/dmg |
| Linux | yalnız `dir` (CI duman testi) | |
| Dosya adları | `scripts/release-names.mjs` → `Bismuth-Setup.exe`, `Bismuth-Setup-arm64.exe`, `Bismuth.dmg`, `Bismuth-Intel.dmg` + `SHA256SUMS.txt` (G-03) | |
| Otomatik güncelleme | **yok** (`publish: null`, `electron-updater` bağımlılığı yok) — G-07 ile uyumlu | `package.json` |
| Releases | `release.yml` tag `v*` → `gh release create`, notlar `docs/surum-notlari/<tag>.md`; tag ≠ `package.json` sürümü ise durur | |
| Fuse'lar | `electronFuses` (ad-hoc imza sıfırlama dahil) | `electron-builder.yml` |
| Belgeler | `docs/kurulum.md` (281 satır) SmartScreen ve Gatekeeper adımlarını anlatıyor; 7 adet `<!-- doğrula -->` işareti; `xattr` komutu veriyor | §4 |

### İş akışları ve maliyet

| Dosya | Tetikleyici | Runner | İş | Tahmini maliyet (Linux-dakikası eşdeğeri) |
|---|---|---|---|---|
| `ci.yml` | yalnız `workflow_dispatch` | ubuntu + windows + macos | verify (typecheck, lint, format, test, kanca testleri, notices, build, e2e, Linux duman) → package (Win x64, Mac arm64+x64) | verify 15–25 · Win 20–30 · **Mac 100–150** → toplam ≈ 130–200 |
| `release.yml` | tag `v*` | windows + macos + ubuntu | typecheck/lint/test/build + paket + duman → yayın | ≈ 180 (e2e **yok**; yeşil `ci` şartı **zorlanmıyor**) |
| `faz0-shell.yml` | dispatch | windows + macos × 2 Electron sürümü | Faz 0 kabuk prototipi | ≈ 200 (artık gereksiz) |
| `faz0-live-checks.yml` | dispatch | ubuntu | dış veri yoklaması | düşük; eski action sürümleri (v4) |

Paketleme **iki yerde** tekrarlanıyor (`ci.yml` package + `release.yml`); `ci.yml`'deki `startsWith(github.ref,'refs/tags/')`
koşulu ölü (ci tag'de tetiklenmez).

## 2. Ucuz dağıtım stratejisi (öneri)

1. **Tek elle tetiklenen sürüm iş akışı** (`release.yml`, `workflow_dispatch` + `inputs.tag`): Linux'ta verify (typecheck,
   lint, test, e2e) → Windows NSIS **Linux'ta** üretilir (**doğrulandı 2026-11-12, Codespace 4 çekirdek**: `wine` yokken
   `wine process failed ENOENT`; yalnız `wine64` ile ikon/sürüm gömme (`signtool.exe`) ve uninstaller üretimi 32-bit
   ister (`wine32 is missing`); `dpkg --add-architecture i386 && apt-get install wine64 wine32:i386` + **temiz**
   `~/.wine` önbelleği (`wineboot -u`) sonrası `npx electron-builder --win --publish never` 3 dk 29 s'de
   `Bismuth-Setup-x64.exe` **102 MB** ve `Bismuth-Setup-arm64.exe` **97 MB** üretti; `win-unpacked` 368 MB; kurulum
   dosyası gerçek Windows'ta S-80 ile denenecek. GitHub Linux runner'ında aynı apt adımı gerekir, ≈ +2 dk) → yalnız macOS
   DMG için macOS runner (tek iş, iki mimari) → `gh release create`. Tahmini ≈ 20 (Linux) + 100 (Mac) = **120** yerine
   bugünkü 180 + ayrıca ci 130–200.
2. **`ci.yml` package işi kaldırılır**; ci = yalnız Linux verify (15–25 dk). Paket yalnız sürümde.
3. **Playwright önbelleği** (`~/.cache/ms-playwright`, `actions/cache`) ve `npm ci` önbelleği → verify 3–5 dk kısalır.
4. **`faz0-*.yml` silinir** (git etiketi `archive/faz0` ile prototipler arşivlenir).
5. **Codespace'te paket üretimi** (dakika harcamadan): `npm run package:win` ve `package:dir` Linux'ta çalışır (wine64 +
   wine32 kurulu Codespace'te; `.devcontainer` postCreate'e eklenmesi P19a'da, +300 MB imaj); çıktılar `release/`
   (gitignore). DMG için Mac şart (sahibin Mac'i: `npm run package:mac`). Codespace notu: `git push` "git-lfs not
   found" derse `sudo apt-get install -y git-lfs` (devcontainer apt listesine eklendi; depo LFS kullanmıyor, kanca
   imajdan geliyor).
6. Tag öncesi şart: `release.yml` ilk adımda `npm run check` + e2e (Linux) koşsun; kırmızıysa paket üretmesin.
7. **Hiçbir iş akışı ajanlar tarafından tetiklenmez** (`gh workflow run` kanca ile engellenir; §6). Sürüm tetiklemesi sahip kararı.

### P19a uygulama notu (2026-11-13)

`release.yml` yeniden yazıldı (`workflow_dispatch` + tag `v*`): `version` (tag = package.json) → `verify` (`ci.yml`
`workflow_call`: check + e2e + Linux duman) → `windows` (Linux + wine, NSIS; x64 her zaman, arm64 yalnız tag'de) ve
`macos` (tek iş, iki DMG, duman) paralel → `publish` (yalnız tag; SHA256SUMS + GitHub Release). Elle tetiklemede
paketler 14 gün yapıt olarak kalır, yayın yapılmaz. `ci.yml`'den package işi ve ölü tag koşulu kaldırıldı; Playwright
tarayıcı önbelleği eklendi. Hiçbir iş akışı tetiklenmedi; ilk çalıştırmayı sahip yapar (dispatch ile deneme önerilir).

**`npm run package:win` Codespace'te denendi (4 çekirdek, wine 10.0 + wine32 zaten kurulu):** 3 dk 38 s, çıkış 0.
`Bismuth-Setup-x64.exe` 95,96 MB (sha256 `8154ec26...1b50`), `Bismuth-Setup-arm64.exe` 90,24 MB (sha256 `f4cf15dc...ff`).
`release-names.mjs` bunları `Bismuth-Setup.exe` / `Bismuth-Setup-arm64.exe` yaptı. Gerçek Windows'ta kurulum
denenmedi <!-- doğrula -->. Windows paketi için duman testi (wine altında) eklenmedi; yalnız Linux paketi denenir.

`extraResources` boyutları (`win-unpacked/resources`): `drizzle` 4,0 MB · `THIRD_PARTY_NOTICES.md` 72 KB ·
`app.asar` 44 MB · `app.asar.unpacked` (better-sqlite3) 3,9 MB.

**Tahmini Actions dakikası** (Linux ×1, Windows ×2, macOS ×10 çarpanıyla; tahmin, ölçülmedi <!-- doğrula -->):

| İş | Süre | Çarpan | Eşdeğer |
|---|---|---|---|
| verify (Linux) | ≈ 20 dk | ×1 | 20 |
| windows (Linux + wine + NSIS) | ≈ 10 dk (tag'de arm64 ile ≈ 12) | ×1 | 10–12 |
| macos (tek iş, 2 DMG + duman) | ≈ 10–12 dk | ×10 | 100–120 |
| version + publish | ≈ 2 dk | ×1 | 2 |
| **Dispatch (yayınsız)** | | | **≈ 130–150** |
| **Tag** | | | **≈ 135–155** |

### P20f: kamera eki (2026-11-13)

Karar (otonom varsayılan): kamera **ayrı indirme** (`Bismuth-Kamera-Windows.zip`, `Bismuth-Kamera-Mac.zip`), ana pakete
eklenmez. Gerekçe: ana kurulum ≈ 100 MB iken kamera ≈ 0,6 GB indirme / ≈ 2 GB açık; her ana sürümde yeniden indirilmez;
kamerasız bilgisayar yük taşımaz; ayrı NSIS kurulum dosyası yerine zip + `<userData>/camera-addon` (terminalsiz, yönetici şifresiz,
kaldırıcı veriyi silmez). Ana uygulama eki bulamazsa kamerayı başlatmaz (`src/main/camera/addon.ts`). PyPI meta verisinden
(Linux x64, Python 3.12) çözümlenen tekerlekler: toplam ≈ 600 MB sıkıştırılmış (torch CPU 210 MB, opencv ×2 135 MB, polars 54 MB,
scipy 35 MB, av 35 MB, onnxruntime 28 MB); Windows/Mac gerçek boyutu **ölçülmedi** <!-- doğrula -->.

`release.yml` işi `camera-addon` (elle `camera_addon` kutusu, ya da sürüm etiketinde depo değişkeni `CAMERA_ADDON=true` iken;
model arşivi sırdan): **Windows eki `windows-latest`'te (×2), Mac eki `macos-latest`'te (×10)** üretilir (P20ffix).

Neden Windows eki artık Linux'ta üretilmiyor: `insightface==0.7.3` için tekerlek yok (yalnız kaynak arşivi); Linux'ta derlenen
`mesh_core_cython` Linux `.so`'sudur, Windows'ta çalışmaz. `from insightface.app import FaceAnalysis` bu derlenmiş modülü
yükler (`app/mask_renderer.py` → `thirdparty/face3d/mesh/__init__.py` → `from .cython import mesh_core_cython`; sdist
kaynağında doğrulandı, derlenmiş modül olmadan `ImportError`), bu yüzden eski betiğin onu silmesi kamerayı açılamaz yapardı.
Çözüm en sade yol: ek, hedef sistemin kendisinde üretilir; insightface oradaki derleyiciyle (MSVC / Xcode) derlenir.

Tekerlek boyutları (kilit dosyasındaki dosyalar, hash'li indirmeyle **ölçüldü 2026-11-14**): Windows ≈ 364 MB, macOS ≈ 348 MB
(Python ve model dosyaları hariç). PyPI'nin Windows `torch` tekerleği CPU sürümüdür (126 MB, `download.pytorch.org/whl/cpu`
ile aynı boyut); bu yüzden ikinci paket dizini kullanılmaz.

| İş | Süre (tahmin) | Çarpan | Eşdeğer |
|---|---|---|---|
| camera-addon win-x64 (`windows-latest`) | ≈ 20–30 dk (insightface derlemesi dahil) | ×2 | 40–60 |
| camera-addon mac-arm64 | ≈ 20–30 dk | ×10 | 200–300 |
| **Yalnız ana sürüm (kutu işaretsiz, değişken yok)** | | | **değişmez (≈ 130–155)** |
| **Kamera eki de** | | | **+240–360 (Mac işi baskın)** |

Süreler ölçülmedi <!-- doğrula -->. Mac eki pahalıdır: sahibin Mac'inde yerel `npm run camera:bundle -- --target mac-arm64
--models <klasör>` 0 dakikadır; sürüm etiketinde CI'da üretmek için `CAMERA_ADDON=true` değişkenini yalnız gerektiğinde koyun.
Sürüm etiketinde ek yapılmışsa iki zip de `SHA256SUMS.txt`'ye girer ve GitHub Release'e eklenir; ek işi başarısız olursa
sürüm yayınlanmaz.

Önceki durum: release ≈ 180 + ci elle ≈ 130–200. Windows'u Linux'ta üretmek Windows runner'ının ×2 çarpanını da
kaldırır. wine adımı runner'da çalışmazsa yedek: `windows` işini `runs-on: windows-latest` yapıp wine adımını silmek
(yalnız tag'de çalıştırmak ≈ +40 dk eşdeğeri).

**Tedarik zinciri (P20ffix):** Python arşivi için betikte sabit sha256 (zorunlu, bayrakla değiştirilemez); kütüphaneler
`otel-kamera/requirements-bundle.lock` (hash'li, `scripts/camera-lock.mjs` üretir, `pip --require-hashes`, tek dizin: PyPI);
insightface derleme araçları `requirements-build.lock`, kaynak arşivi `requirements-insightface.lock`. Model arşivi
`CAMERA_MODELS_SHA256` ile doğrulanır; gizli değerler yalnız o adıma verilir. `ultralytics-platform` (ve onun `httpx`'i)
ekte yoktur: `ultralytics` onu yalnız `ultralytics.Platform` istenirse içe aktarır (8.4.212 kaynağında doğrulandı) ve Bismuth
istemez; ayrıca `YOLO_OFFLINE=1` her ağ yoklamasını kapatır.

## 3. Depo düzeni: taşıma ve silme kararları

| Öğe | Öneri | Risk | Uygulandı mı |
|---|---|---|---|
| `prototypes/shell`, `prototypes/live-checks` + `faz0-shell.yml`, `faz0-live-checks.yml` | Etiketle (`archive/faz0`) ve sil; `no-network-guard.mjs:20`, `format-file.mjs:36`, `test-hooks.mjs:70,123,194`, `eslint.config.mjs:34`, `.gitignore` satırları sadeleşir | düşük | ❌ plana (P19c); kanca testleri değişeceği için ajan sistemi paketine bağlı |
| `prototypes/holidays`, `tape-chart`, `kbs-stats` | Etiketle ve sil; plan belgelerindeki yollar "arşiv etiketi" olarak güncellenir | düşük-orta (araştırma kanıtı izi) | ❌ plana (P19c) |
| `resources/icon.png` | Sil; `scripts/make-icon.mjs:39` satırı kaldır (hiçbir girdi okumuyor) | düşük | ❌ plana (P19c) |
| `otel-kamera/` | **Depoda kalır** (sahip iki sistemin birleşmesini istiyor); kök README'ye "ürünün parçası değil, entegrasyon planı 06" notu; `.gitignore` tamamlandı, `.env.example` eklendi; belgelerdeki yerel yol (`/Users/.../`) temizlenir | yüksek (sahip kararı: ayrı depo mu?) | ✅ `.gitignore` + `.env.example` (bu dal); yol temizliği P19c |
| `docs/fable-talimati.md` | `tools/ajan/talimatlar/` altına taşındı (P19c) | düşük | ✅ |
| `THIRD_PARTY_NOTICES.md` (kök, 70 KB) | Yerinde (pakete giriyor, CI diff denetliyor) | — | — |
| `tools/ajan/` | Yerinde; `kayit/` gitignore'da | — | — |
| `.devcontainer` `python:1` özelliği | Kamera yan süreci için gerekli olacak; kalır | — | — |

**`otel-kamera/.env.example`:** diskte yoktu (belge var diyordu). `config.py`'den sır içermeyen örnek oluşturuldu;
kök `.gitignore`'a `!otel-kamera/.env.example` istisnası eklendi; `kbs-data-guard` kancası dosyada kimlik verisi aramadı
(yalnız anahtar adları ve varsayılanlar var).

## 4. `docs/kurulum.md` — sade olmayan ya da eksik adımlar

| # | Sorun | Öneri |
|---|---|---|
| 1 | `xattr -dr com.apple.quarantine` komutu (satır ~257) G-03 "terminal gerekmez" ile çelişir ve karantinayı kaldırmak güvenlik açısından kötü örnek | Kaldır; "geliştiriciye yazın" |
| 2 | SHA256 doğrulama (PowerShell / `shasum`) | "İsteğe bağlı, teknik" başlığı altında kalsın ama ana akıştan çıksın |
| 3 | 7 adet `<!-- doğrula -->` (macOS 26 metinleri, anahtar zinciri, QR) | S-80 ile gerçek makinede doğrulanıp işaretler kaldırılır |
| 4 | İki ayrı gizli bilgi (kurtarma kodları + Bismuth anahtarı) | Sihirbazda tek "Kâğıda yazın" adımı + **yazdır** düğmesi (K-41 QR/yazdırma bugün yok) |
| 5 | Drive sürücü harfi, "akış modu", tam yol yazma | Ayarlar → Yedek'te "Drive klasörünü bul" düğmesi (varsayılan yolları dener) |
| 6 | "Kurduğunuz Windows kullanıcısıyla açın" | Belgede açık uyarı kutusu; ileride makine geneli kurulum seçeneği (S-113) |
| 7 | Uzaktan erişim (güvenlik duvarı, özel ağ) kurulum belgesinde | `docs/uzaktan-erisim.md`'ye bağlantı; ana belgeden çıkar |
| 8 | Ekran görüntüsü yok | Sahip onay paketinde gerçek Windows/Mac görüntüleri |
| 9 | Kamera bileşeni kurulumu yok | 06 raporu K7 paketinden sonra bölüm eklenir |

## 5. Sahip için "Kurulum Rehberi (Basit)"

`docs/kurulum-rehberi-basit.md` yazıldı: indir → çift tıkla (SmartScreen/Gatekeeper tek adım) → ilk açılış sihirbazı →
yedek → kamera (henüz ürün dışı) → üç sorun giderme satırı. Program içi kılavuza (`src/renderer/guide/`) aynı
içeriğin üç dilde eklenmesi P19b paketinde.

## 6. Ajan kuralı (plan ve kancalar)

- `gh workflow run`, `gh run rerun`, `gh release create`, `git push --tags` ve `git tag v*` komutları `workflow-guard`
  kancasıyla engellenir (ajan sistemi §7.4); sürüm yalnız sahibin elle tetiklemesiyle.
- Tüm kontroller Codespace içinde: `npm run check`, `npm run build`, hedefli e2e (`xvfb-run -a`), `npm run package:dir`.

## 7. Bulgular (özet, hata raporuna da girer)

| Önem | Bulgu | Çözüm paketi |
|---|---|---|
| Yüksek | `release.yml` e2e koşmuyor, yeşil ci şartı yok | P19a |
| Yüksek | macOS paketi iki iş akışında, dispatch ci'de 10× dakika | P19a |
| Orta | `kurulum.md` karantina kaldırma komutu; `<!-- doğrula -->` işaretleri | P19b + S-80 |
| Orta | `faz0-*.yml` ve `prototypes/` artık gereksiz; kanca istisnaları bunlara bağlı | P19c |
| Düşük | `ci.yml` ölü tag koşulu; Windows arm64 yalnız release'te | P19a |
| Düşük | `resources/icon.png` kullanılmıyor | P19c |

## 8. Geliştirme ortamı bulguları (bu oturumda düzeltildi)

| Bulgu | Düzeltme |
|---|---|
| Codespace'te Electron açılmıyordu (`libgtk-3` eksik) ve `xvfb-run` `xauth` yokluğundan çalışmıyordu → e2e ve ekran görüntüsü komutları yeni Codespace'te kırmızı | `.devcontainer/devcontainer.json` apt listesine `xauth libgtk-3-0 libnss3 libasound2t64 libxss1` eklendi (yeniden oluşturulan Codespace'te doğrulanacak) |
| `npm run check` → `format:check` `otel-kamera/` dosyalarında (HTML, Markdown) takılıyordu (Python projesi prettier kapsamındaydı) | `.prettierignore`'a `otel-kamera` eklendi |
| Commit kancası 2 çekirdekte tam test paketini 570 sn'de bitiremiyor, belge commit'leri bile kilitleniyordu; zaman aşımında yetim `vitest` kalıyordu | `pre-commit-gate` belge/ayar-yalnız commit'lerde araç zincirini atlar (09 §1 madde 7) |
