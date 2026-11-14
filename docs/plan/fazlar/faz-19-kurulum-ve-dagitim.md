# Faz 19 — Kurulum ve dağıtım ("kolayca indir ve kur"), depo temizliği, ajan bakımı

> Kaynak: `docs/analiz/07-kurulum-ve-dagitim.md`, `09-ajan-sistemi.md` §6; paket kartları `08-gelistirme-plani.md` §3.
> Dalga 1 (P19c) ve 6 (P19a, P19b, P19d).

## Amaç
Sahip programı teknik bilgi gerektirmeden kurar; sürüm paketleri en az Actions dakikasıyla üretilir; depo sade.

## Gereksinimler
G-03 (çift tıkla kurulum, terminal yok), G-07 (otomatik güncelleme yok), G-01 (her kaynak paket içinde), K-41 (QR/yazdırma),
S-80 (otel bilgisayarında deneme, sahip), S-113 (makine geneli kurulum, öneri Ö-24).

## Sorular
S-113. Cevapsız = kullanıcı başına kurulum kalır.

## Teslimatlar
1. **P19a Sürüm iş akışı** — `release.yml` tek kaynak (dispatch + tag): Linux verify (check + e2e) → Windows NSIS
   (Linux'ta deneme; olmazsa Windows runner) → macOS DMG tek iş → Releases; `ci.yml` yalnız Linux verify; Playwright ve
   npm önbelleği; `faz0-*.yml` kaldırılır; belgede dakika tablosu. **Hiçbir iş akışı tetiklenmez** (kanca).
2. **P19b Belgeler ve kılavuz** — `docs/otel/kurulum.md` sadeleştirme (xattr yok), `kurulum-rehberi-basit.md` son hali,
   program içi kılavuz "Kurulum" bölümü (3 dil), sihirbazda tek "kâğıda yazın" adımı + yazdır (K-41).
3. **P19c Depo temizliği** — `archive/faz0` etiketi; `prototypes/`, `faz0-*.yml`, `resources/icon.png` silinir;
   kanca istisnaları ve testleri güncellenir; `otel-kamera` belgelerindeki yerel yollar temizlenir; kök README analiz işaretçisi.
4. **P19d Ajan sistemi bakımı** — `protect-files` kaçış değişkeni kaldırılır; `stop-gate` kapsamı `drizzle/`, `scripts/`,
   `package.json`; `deps-guard` yarn; `owner-review` kalıcı yol.

## Kabul ölçütleri
- [x] İş akışı dosyaları YAML geçerli (`actionlint` ya da `node -e yaml`), paketleme tek yerde; `npm run package:win`
      Codespace'te denendi (2026-11-12: `wine64` + `wine32:i386` + temiz `~/.wine` ile x64 102 MB / arm64 97 MB, 3,5 dk;
      07 §2); `.devcontainer` postCreate'e wine paketleri ve `release.yml` Linux işine aynı apt adımı eklenir.
- [x] (kısmen: ana akışta terminal komutu yok; isteğe bağlı SHA256 denetimi en sondaki "isteğe bağlı, teknik" bölümünde, 07 §4 #2) `docs/otel/kurulum.md` terminal komutu içermez; `<!-- doğrula -->` işaretleri yalnız S-80'e bağlı satırlarda. — belge
- [x] Sihirbazda kurtarma kodları + Bismuth anahtarı tek adımda, yazdır düğmesi (e2e setup). — `recovery-codes.test.tsx`, `tests/e2e/electron/setup.spec.ts`
- [x] `prototypes/` ve `faz0-*.yml` yok; `node .claude/hooks/test-hooks.mjs` ve `npm run check` yeşil.
- [x] Plan belgelerinde prototip yolları "arşiv etiketi `archive/faz0`" notuyla.
- [x] `security-reviewer` iş akışı/paketleme değişikliklerini onaylar (fuses, imza ayarları değişmedi). — Kritik/Yüksek yok; Orta #1 (ci.yml'de kalan paket işi) ve Düşük #2 (etiket adı `env` ile) düzeltildi.

## Teknik notlar
`electron-builder` 26.15.3; NSIS Linux'ta `wine64` + `wine32:i386` gerektirir (doğrulandı: ikon/sürüm gömme ve uninstaller
üretimi 32-bit wine ile; `wine32` sonradan kurulduysa `~/.wine` silinip `wineboot -u`); DMG yalnız macOS. Sürüm etiketi `v*`
`release.yml`'i tetikler → `workflow-guard` `git tag v*`'ı engeller; etiketi sahip atar.

## Yapılmayacaklar
Kod imzalama sertifikası satın alma (sahip kararı); otomatik güncelleme; mağaza dağıtımı.

## Sonuç (2026-11-13) — P19a
Paketleme tek yerde: `release.yml` (elle tetikleme → doğrulama + Windows x64 + iki DMG, 14 gün yapıt, yayın yok; `v*` etiketi →
ek olarak Windows arm64 ve GitHub Release). Sıra: `version` → `verify` (`ci.yml`, `workflow_call`) → `windows` (Linux + wine, NSIS) ve
`macos` (tek iş, iki DMG + duman testi) → `publish` (yalnız etiket). `ci.yml` yalnız Linux doğrulaması; paket işi ve ölü etiket koşulu
kalktı; Playwright önbelleği. Etiket adı betiğe `env` ile girer. `npm run package:win` Codespace'te 3 dk 38 sn (x64 96 MB, arm64 90 MB);
dakika tablosu 07 §2. `.devcontainer` postCreate'e `wine64 wine32:i386`. **Tetikleme sahipte** (önce elle, sonra etiket).

## Sonuç (2026-11-13) — P19b ve P19d
**P19b:** `docs/otel/kurulum.md` sadeleştirildi (xattr yok, SHA256 sona "isteğe bağlı, teknik", `doğrula` işaretleri yalnız S-80, "kuran
kullanıcıyla açın" kutusu (S-113), uzaktan erişim yalnız `uzaktan-erisim.md` bağlantısı); `kurulum-rehberi-basit.md` son hali;
program içi kılavuza "Kurulum ve yeni sürüm" bölümü (`21-installation.md`, tr/en/ru; sonda, dosya numarası yeniden dağıtılmadı);
sihirbazın bitiş ekranı tek "Kâğıda yazın" adımı: kurtarma kodları + Bismuth anahtarı (`backup.recoveryText`'ten türetilir) + tek A4
yazdır (K-41); Ayarlar → Yedek'te "Drive klasörünü bul" (`backup.findDriveFolder`, yerel tarama, ağ yok, `settings.backup` düzenleme
yetkisi + yalnız ana pencere). Çelişkiler: Ç-01 (K-44 notu), Ç-02, Ç-04 (S-06 notu), Ç-05 (`akislar.md` §4). `01-gereksinimler.md` değişmedi.
Karşılanan: G-03, G-07, G-01, K-41, S-113 (varsayılan: kullanıcı başına kurulum), S-119 (bilinçli).
**P19d:** `protect-files` kaçış değişkeni kalktı; `stop-gate` kapsamı `drizzle/`, `scripts/`, `package.json`; `deps-guard` yarn (`yarn add`,
`yarn global add`); `owner-review` çalışma yolu `.tmp/owner-review`. Kanca testleri 94 senaryo yeşil. `prototypes/` istisnaları P19c'de.
**Sahip onay paketine:** gerçek Windows/Mac'te belge adımlarının doğrulanması ve ekran görüntüleri (S-80).
