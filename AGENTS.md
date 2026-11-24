# Bismuth — yapay zekâ ajanı için başlangıç (Antigravity / Gemini ve diğerleri)

> Bu dosya projeye yeni gelen her ajanın **ilk** okuyacağı yerdir. Proje 2026-10 … 2026-11 arasında Claude Code ile
> yazıldı; 2026-11-24'te Antigravity'ye devredildi. Kuralların tam ve bağlayıcı metni [`CLAUDE.md`](CLAUDE.md)'dedir
> (adı Claude olsa da kurallar her ajan için geçerlidir). Bu dosya onun özeti ve "nereden başlarım" rehberidir.
> Belgeler ve sahiple yazışma **Türkçe**; kod, tanımlayıcılar ve commit mesajları **İngilizce**.

## 1. Ürün tek paragrafta

Bismuth, küçük ve orta oteller için **çevrimdışı çalışan masaüstü otel yönetim programı**dır: rezervasyon takvimi,
misafir ve kara liste, defter ve kasa, personel ve maaş, oda durumu ve arızalar, raporlar, döviz, tedarik ve çamaşırhane,
yedek, uzaktan erişim (sunucu modu + telefon görünümü), KBS listesi ve **kamera modülü** (yüz tanıma ile alarm). Arayüz
Türkçe / İngilizce / Rusça. İlk müşteri 19 odalı bir İstanbul oteli; otele özgü her kural koda değil **ayara** yazılır.
Sahip yazılımcı değildir: ona sade Türkçe, numaralı adımlarla yazılır.

## 2. Şu anki durum (2026-11-24)

| Konu                   | Durum                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fazlar 0–22            | Hepsi kod olarak tamam (`docs/plan/fazlar/DURUM.md`). Yeni faz planı yok.                                                                                                                                                                              |
| Sürüm                  | **v1.0.1 yayında** (GitHub Releases, "Latest"): `Bismuth-Setup.exe` (Windows), `Bismuth.dmg` (Mac), SHA256SUMS.                                                                                                                                        |
| Sürüm iş akışı         | `.github/workflows/release.yml` yeşil (son koşu 2026-11-15). Sahip elle başlatır.                                                                                                                                                                      |
| Kamera eki             | `Bismuth-Kamera-Windows.zip` / `-Mac.zip` (~400 MB) ve model arşivi, sahibin **gizli "kamera" taslak sürümünde**. Program içinde "Kamera ekini kur…" düğmesiyle kurulur. Halka açık hiçbir yere konmaz.                                                |
| Testler                | 342 test dosyası / 3169 birim testi yeşil; Playwright e2e (Electron + telefon) CI'da yeşil.                                                                                                                                                            |
| Dal                    | `main` güncel. Çalışma dalı açın (bkz. §7).                                                                                                                                                                                                            |
| Sahipte bekleyen işler | Otel bilgisayarında (Windows) gerçek kurulum denemesi (S-80); gerçek Hikvision kamerayla deneme (cihaz yerel ağda 192.168.1.20, kullanıcı/şifreyi sahip sihirbaza girer); KVKK avukat görüşü; ekran onayı (`docs/plan/taslak-onay/2026-11-14-son.md`). |

Sahip Gemini ile yeni bir plan hazırladı; bu dosyadan sonra o planı verecek. **Plan bu dosyadaki kurallarla çelişirse
uygulamadan önce sahibe sorun.**

## 3. Okuma sırası (ilk oturumda, ~20 dk)

1. [`CLAUDE.md`](CLAUDE.md): 15 yasak, kod kuralları, komutlar. **Bağlayıcı.**
2. [`docs/README.md`](docs/README.md): belge haritası (kim neyi okur).
3. [`docs/gelistirici/README.md`](docs/gelistirici/README.md): derleme, test, paketleme, klasör haritası, tarifler
   (yeni API çağrısı, ekran, migrasyon, i18n anahtarı, ayar), **§10 bilinen tuzaklar**.
4. [`docs/plan/03-mimari.md`](docs/plan/03-mimari.md): mimari ve veri modeli; iş kuralları §6.
5. Değiştireceğiniz alanın kuralı: [`.claude/rules/`](.claude/rules/) (`db.md`, `ui.md`, `ipc.md`, `testing.md`, `camera.md`).
6. Gerekirse: gereksinimler `docs/plan/01-gereksinimler.md` (G-xx), kararlar `docs/plan/06-kararlar.md` (K-xx ve
   "Sahip cevapları"), sorular `docs/plan/05-sorular.md` (S-xx), günlük akış `docs/plan/akislar.md`.

## 4. Teknoloji ve katmanlar

Electron 37 + React 19 + TypeScript + Tailwind v4 + shadcn/ui (Radix) + SQLite (better-sqlite3 + Drizzle) + Hono
(sunucu modu) + TanStack Router/Query + Vitest + Playwright. Kamera yan süreci Python (FastAPI + onnxruntime) `otel-kamera/`.

```
src/renderer (React)  →  src/renderer/lib/transport (IPC veya HTTP, tek sözleşme)
   →  src/main/ipc · src/main/server (zod doğrulama)  →  src/main/services (yetki + transaction + audit_log)
   →  src/main/db (Drizzle; SQLite yalnız db/client.ts)
src/shared: tipler, zod sözleşmesi (contract/procedures/<modül>.ts), saf iş kuralları (domain/), para (money.ts)
```

Yeni API çağrısı: `src/shared/contract/procedures/<modül>.ts` + `src/main/api/handlers/<modül>.ts` + servis + test
(tarif: geliştirici README §5.1).

## 5. Kırmızı çizgiler (özet; tam metin CLAUDE.md "Yasaklar")

1. **İnternet şartı yok.** Ağ kodu yalnız `src/main/network/`, `src/main/server/`, `src/main/discovery/`,
   `src/renderer/lib/transport/`, `src/main/camera/`. Başka yerde `fetch`/`axios`/`WebSocket`/CDN yok. Font ve her kaynak paket içinde.
2. **Telemetri, otomatik güncelleme, lisans sunucusu, OTA/kanal yöneticisi, e-Fatura yok.**
3. **Para kayan sayı değil:** `amount_minor` tam sayı (kuruş) + `currency`; çarpma/bölme yalnız `src/shared/money.ts`.
4. **Yetki servis katmanında** (`ctx` + `requirePermission`); arayüzde gizlemek yetmez.
5. **Kullanıcıya görünen her metin i18n anahtarı** (`src/renderer/i18n/{tr,en,ru}.json`, `t('…')`); anahtar eklemek için
   `npm run i18n:add -- <spec.json>` (üç dosyayı aynı anda yazar). Mantıksal CSS (`ms-`, `me-`, `text-start`).
6. **Commit edilmiş migrasyon (`drizzle/*.sql`) değiştirilmez**; yeni numaralı migrasyon: `npm run db:generate -- --name <ad>`.
7. **Veri silinmez** (iptal = `voided_at` / durum); her yazma `audit_log`'a. Tek istisna: biyometrik veri (K-52).
8. **Otele özel kural = ayar** (G-09), koda sabit yazılmaz.
9. **Gizli veri depoya girmez:** KBS/kimlik listeleri, T.C. kimlik numarası, yüz görüntüsü/vektörü, model ağırlığı,
   `.env`, RTSP şifresi, Telegram token'ı. Örnek veriler uydurma isim ve rakamdır.
10. **GitHub Actions'ı ajan tetiklemez** (dakika kotası): `gh workflow run`, `gh run rerun`, `gh release create`,
    `git tag v*` yasak. Sürümü sahip başlatır.
11. `docs/plan/01-gereksinimler.md` yalnız sahibin açık isteğiyle değişir. Yeni özellik fikri → sahibe sorun.
12. Bağımlılık eklemek: `save-exact` (`.npmrc`), gerekçe `docs/plan/bagimliliklar.md`'ye, sonra `npm run notices`.

## 6. Kancalar: Claude'daki korumalar burada nasıl çalışır?

`.claude/` klasörü Claude Code'a özgüdür (ajan tanımları, beceriler, kancalar). Antigravity bu kancaları **çalıştırmaz**.
Bu yüzden en önemli dört koruma **git'in kendi kancalarına** taşındı: [`.githooks/`](.githooks/).

- `pre-commit`: KBS/kimlik verisi, kamera/biyometrik veri ve sır, commit edilmiş migrasyon değişikliği engellenir;
  kod commit'inde `typecheck + lint + test` geçmezse commit iptal olur (yalnız belge commit'inde atlanır).
- `pre-push`: `main`/`master`'a push, `v*` etiketi ve zorla push (geçmişi silen) engellenir.
- Bu makinede açık (`git config core.hooksPath .githooks`). Yeni bir kopyada bir kez çalıştırın. Kanca engellerse
  **atlatmayın** (`--no-verify` yasak); nedenini düzeltin ya da sahibe sorun.

`.claude/skills/*/SKILL.md` ve `.claude/agents/*.md` düz metin talimatlardır; işinize yarıyorsa okuyun (ör. `ui-screen`
yeni ekran adımları, `tr-copy-guide` arayüz metni sözlüğü, `electron-security` güvenlik listesi). `/orkestra`,
`tools/ajan/` gibi Claude'a bağlı araçlar Antigravity'de çalışmaz; yok sayın.

## 7. Git akışı

- `main` sahibindir. Her iş için dal açın: `git switch -c antigravity/<kısa-konu>`.
- Küçük, konu odaklı commit; mesaj İngilizce `type(scope): summary` (ör. `fix(ledger): keep the cash total after a void`).
- Push dalınıza. Pull request açıp birleştirmek **yalnız sahip isterse**.
- Sürüm: sahip GitHub → Actions → **release** → Run workflow (`Sürümü yayınla`, kamera eki gerekiyorsa `Kamera ekini de üret`).
  Sürüm numarası `package.json` `version` alanından gelir; yeni sürümde onu artırın ve `docs/surum-notlari/vX.Y.Z.md` yazın.

## 8. Komutlar ve doğrulama

Node 22 (CI) ile çalışır; Mac'te Node 24 de çalışıyor. İlk kurulum `npm ci`.

| Komut                                                                       | Ne yapar                                                                                     |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run dev`                                                               | Programı geliştirme modunda açar                                                             |
| `npm run check`                                                             | typecheck + lint + biçim + birim testleri (~5–10 dk). **Her iş bitmeden önce yeşil olmalı.** |
| `npm run typecheck` · `npm run lint` · `npm test`                           | Tek tek kontroller; tek dosya: `npx vitest run <yol>`                                        |
| `npm run build`                                                             | e2e ve paketleme için derleme (`out/`)                                                       |
| `npx playwright test --project=electron tests/e2e/electron/<dosya>.spec.ts` | Tek e2e dosyası (önce `build`)                                                               |
| `npm run i18n:check` · `npm run i18n:add -- <spec.json>`                    | Çeviri anahtarı denetimi / ekleme                                                            |
| `npm run db:generate -- --name <ad>`                                        | Yeni migrasyon                                                                               |
| `npm run package:mac` · `package:win`                                       | Yerel paket (normalde CI üretir)                                                             |

"Bitti" demeden önce: kod + test, `npm run check` yeşil, değişen ekran varsa ilgili e2e dosyası yeşil.

## 9. Makine ve ortam notları

- **Sahibin Mac'i bellek kısıtlı** (başka bir proje de çalışıyor): ağır işleri (tam e2e, paketleme) aynı anda tek
  çalıştırın; e2e'yi dosya dosya koşun, bütün takımı değil.
- E2E testler saat dilimini `Europe/Istanbul`'a sabitler (`playwright.config.ts`); otelin "bugün"ü budur.
- Programın verisi Mac'te `~/Library/Application Support/Bismuth`; testler geçici klasör kullanır (`BISMUTH_USER_DATA`).
- Sahibin Google Drive'ında **hiçbir dosyayı silmeyin, taşımayın, yazmayın**; gerekiyorsa listeleyip sahibe söyleyin.
- Kamera cihazlarına giriş yapmayın, şifre denemeyin.

## 10. Sahiple iletişim

Sade Türkçe, kısa cümle, numaralı adımlar; teknik terimin yanında ne işe yaradığı. Soru sorarken tek seferde,
numaralı ve her soruya önerilen cevapla. Bitince: ne değişti, ne denendi, ne denenmedi.
