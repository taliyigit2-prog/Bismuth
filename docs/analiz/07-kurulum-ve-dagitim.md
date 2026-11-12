# 07 — Kurulum ve dağıtım ("kolayca indir ve kur")

> Hazırlayan: Fable (2026-11-12). Kaynak: `electron-builder.yml`, `.github/workflows/*.yml`, `docs/kurulum.md`,
> `docs/gelistirici.md`, `package.json`, `scripts/`, `prototypes/`, `.devcontainer/`. Dakika tahminleri kendi bilgimdir
> (GitHub: Windows runner 2×, macOS runner 10× Linux dakikası); doğrulanmadı. Sahip için tek sayfalık rehber:
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
   lint, test, e2e) → Windows NSIS **Linux'ta** üretilir (electron-builder bunu destekler; ikon/sürüm kaynağı gömme için
   `wine` gerekebilir — Codespace'te `npm run package:win` ile **önce yerelde denenmeli**, doğrulanmadı) → yalnız macOS
   DMG için macOS runner (tek iş, iki mimari) → `gh release create`. Tahmini ≈ 20 (Linux) + 100 (Mac) = **120** yerine
   bugünkü 180 + ayrıca ci 130–200.
2. **`ci.yml` package işi kaldırılır**; ci = yalnız Linux verify (15–25 dk). Paket yalnız sürümde.
3. **Playwright önbelleği** (`~/.cache/ms-playwright`, `actions/cache`) ve `npm ci` önbelleği → verify 3–5 dk kısalır.
4. **`faz0-*.yml` silinir** (git etiketi `archive/faz0` ile prototipler arşivlenir).
5. **Codespace'te paket üretimi** (dakika harcamadan): `npm run package:win` ve `package:dir` Linux'ta çalışır; çıktılar
   `release/` (gitignore). DMG için Mac şart (sahibin Mac'i: `npm run package:mac`).
6. Tag öncesi şart: `release.yml` ilk adımda `npm run check` + e2e (Linux) koşsun; kırmızıysa paket üretmesin.
7. **Hiçbir iş akışı ajanlar tarafından tetiklenmez** (`gh workflow run` kanca ile engellenir; §6). Sürüm tetiklemesi sahip kararı.

## 3. Depo düzeni: taşıma ve silme kararları

| Öğe | Öneri | Risk | Uygulandı mı |
|---|---|---|---|
| `prototypes/shell`, `prototypes/live-checks` + `faz0-shell.yml`, `faz0-live-checks.yml` | Etiketle (`archive/faz0`) ve sil; `no-network-guard.mjs:20`, `format-file.mjs:36`, `test-hooks.mjs:70,123,194`, `eslint.config.mjs:34`, `.gitignore` satırları sadeleşir | düşük | ❌ plana (P19c); kanca testleri değişeceği için ajan sistemi paketine bağlı |
| `prototypes/holidays`, `tape-chart`, `kbs-stats` | Etiketle ve sil; plan belgelerindeki yollar "arşiv etiketi" olarak güncellenir | düşük-orta (araştırma kanıtı izi) | ❌ plana (P19c) |
| `resources/icon.png` | Sil; `scripts/make-icon.mjs:39` satırı kaldır (hiçbir girdi okumuyor) | düşük | ❌ plana (P19c) |
| `otel-kamera/` | **Depoda kalır** (sahip iki sistemin birleşmesini istiyor); kök README'ye "ürünün parçası değil, entegrasyon planı 06" notu; `.gitignore` tamamlandı, `.env.example` eklendi; belgelerdeki yerel yol (`/Users/.../`) temizlenir | yüksek (sahip kararı: ayrı depo mu?) | ✅ `.gitignore` + `.env.example` (bu dal); yol temizliği P19c |
| `docs/fable-talimati.md` | `tools/ajan/` altına taşınabilir; şimdilik yerinde (başlatıcı okuyor) | düşük | ❌ |
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
