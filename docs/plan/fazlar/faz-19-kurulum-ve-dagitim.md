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
2. **P19b Belgeler ve kılavuz** — `docs/kurulum.md` sadeleştirme (xattr yok), `kurulum-rehberi-basit.md` son hali,
   program içi kılavuz "Kurulum" bölümü (3 dil), sihirbazda tek "kâğıda yazın" adımı + yazdır (K-41).
3. **P19c Depo temizliği** — `archive/faz0` etiketi; `prototypes/`, `faz0-*.yml`, `resources/icon.png` silinir;
   kanca istisnaları ve testleri güncellenir; `otel-kamera` belgelerindeki yerel yollar temizlenir; kök README analiz işaretçisi.
4. **P19d Ajan sistemi bakımı** — `protect-files` kaçış değişkeni kaldırılır; `stop-gate` kapsamı `drizzle/`, `scripts/`,
   `package.json`; `deps-guard` yarn; `owner-review` kalıcı yol.

## Kabul ölçütleri
- [ ] İş akışı dosyaları YAML geçerli (`actionlint` ya da `node -e yaml`), paketleme tek yerde; `npm run package:win`
      Codespace'te denendi (2026-11-12: `wine64` + `wine32:i386` + temiz `~/.wine` ile x64 102 MB / arm64 97 MB, 3,5 dk;
      07 §2); `.devcontainer` postCreate'e wine paketleri ve `release.yml` Linux işine aynı apt adımı eklenir.
- [ ] `docs/kurulum.md` terminal komutu içermez; `<!-- doğrula -->` işaretleri yalnız S-80'e bağlı satırlarda.
- [ ] Sihirbazda kurtarma kodları + Bismuth anahtarı tek adımda, yazdır düğmesi (e2e setup).
- [ ] `prototypes/` ve `faz0-*.yml` yok; `node .claude/hooks/test-hooks.mjs` ve `npm run check` yeşil.
- [ ] Plan belgelerinde prototip yolları "arşiv etiketi `archive/faz0`" notuyla.
- [ ] `security-reviewer` iş akışı/paketleme değişikliklerini onaylar (fuses, imza ayarları değişmedi).

## Teknik notlar
`electron-builder` 26.15.3; NSIS Linux'ta `wine64` + `wine32:i386` gerektirir (doğrulandı: ikon/sürüm gömme ve uninstaller
üretimi 32-bit wine ile; `wine32` sonradan kurulduysa `~/.wine` silinip `wineboot -u`); DMG yalnız macOS. Sürüm etiketi `v*`
`release.yml`'i tetikler → `workflow-guard` `git tag v*`'ı engeller; etiketi sahip atar.

## Yapılmayacaklar
Kod imzalama sertifikası satın alma (sahip kararı); otomatik güncelleme; mağaza dağıtımı.

## Sonuç
