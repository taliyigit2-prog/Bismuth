# Bismuth — Antigravity Geliştirme ve Çalışma Kuralları

> Bu dosya **Antigravity** ajanları için tek bağlayıcı kural ve mimari el kitabıdır (2026-11-24'te Claude Code'dan
> devredildi; eski `CLAUDE.md` ve `.claude/` yapısı tamamen kaldırılmıştır).
> Belgeler ve sahiple yazışma **Türkçe**; kod, tanımlayıcılar ve commit mesajları **İngilizce**.

## 1. Ürün ve Durum

Bismuth, küçük ve orta oteller için **çevrimdışı çalışan masaüstü otel yönetim programı**dır (Electron 37 + React 19 +
TypeScript + Tailwind v4 + shadcn/ui + SQLite `better-sqlite3` + Drizzle + Hono sunucu modu + Python kamera yan süreci `otel-kamera/`).
Arayüz Türkçe / İngilizce / Rusça (Arapça ertelendi). İlk müşteri 19 odalı (38 yataklı) bir İstanbul otelidir; otele özgü her kural koda değil **ayara** yazılır.

- **Mevcut durum:** Faz 0–22 kodları tamamlandı (`docs/plan/fazlar/DURUM.md`), `v1.0.1` sürümü GitHub Releases'ta yayında.
- **Masaüstü altyapısı:** K-62 ve sahip kararıyla **Electron** ile devam edilir; `shell-tauri/` yalnızca arşiv/ölçüm prototipidir.
- **Kamera eki:** `Bismuth-Kamera-Windows.zip` / `-Mac.zip` ve model ağırlıkları gizli `"kamera"` taslak sürümündedir; halka açık yere veya depoya konmaz.
- **Sahip profili:** Sahip yazılımcı değildir; kendisine sade Türkçe, kısa cümlelerle, numaralı adımlarla (teknik terimin yanında açıklamasıyla) yazılır.

## 2. Antigravity Özelleştirme ve Koruma Mimarisi

Bu depoda Claude Code'a özgü `.claude/` ve `tools/ajan/` kullanılmaz. Tüm kurallar, beceriler ve korumalar Antigravity yapısındadır:

| Bileşen                | Konum                                                 | Nasıl çalışır                                                                                                             |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Bağlayıcı ana rehber   | `ANTIGRAVITY.md`                                      | Tüm kurallar, yasaklar, komutlar, mimari özet                                                                             |
| Otomatik yüklenen özet | `AGENTS.md`, `GEMINI.md`, `.agent/rules/bismuth.md`   | Her oturumda otomatik okunur                                                                                              |
| Alan kuralları         | `.agent/rules/{db,ui,ipc,testing,camera}.md`          | İlgili alanda çalışırken yüklenir (`trigger: model_decision`)                                                             |
| Beceriler              | `.agent/skills/*/SKILL.md`                            | `ui-screen`, `add-migration`, `tr-copy-guide`, `electron-security`, `release`, `requirement-change`, `qa`, `owner-review` |
| Araç kancaları         | `.agent/hooks.json` → `.agent/hooks/pre-tool-use.mjs` | `run_command`, `edit_file`, `write_file` öncesi `scripts/guards/` korumalarını çalıştırır                                 |
| Koruma betikleri       | `scripts/guards/*.mjs` (`test-guards.mjs`)            | KBS/kimlik, kamera/sır, ağ sınırı, bağımlılık, migrasyon, korunan dosya, push, workflow, commit kapısı                    |
| Git kancaları          | `.githooks/{pre-commit,pre-push}`                     | Her terminal/IDE commit ve push'unda zorunlu kontrol (`git config core.hooksPath .githooks`)                              |

Kanca engellerse **atlatmayın** (`--no-verify` yasak); nedenini düzeltin ya da sahibe sorun.

## 3. Bağlayıcı 15 Yasak (gerekçe `docs/plan/01-gereksinimler.md` `G-xx` ve `06-kararlar.md` `K-xx`)

1. **Çevrimdışı veri girişi bozulamaz (G-01/G-02).** Ağ kodu **yalnız beş klasörde**:
   - `src/main/network/` (isteğe bağlı dış veri: piyasa kuru, bayram doğrulama, hava durumu; kamera alarmı Telegram K-50),
   - `src/main/server/` (sunucu modu Hono),
   - `src/main/discovery/` (sunucu modunda yerel ağ duyurusu mDNS),
   - `src/main/camera/` (yalnız `127.0.0.1` yan süreç, `rtsp://` ve özel IP yerel ağ kamera keşfi; K-49),
   - `src/renderer/lib/transport/` (istemci modu HTTP taşıması).
     Başka yerde `fetch`/`axios`/`WebSocket`/CDN bağlantısı yok. Dış veri 5 sn zaman aşımı, sessiz başarısızlık, `network.enabled=false` ile tamamen kapanır. Fontlar ve tüm kaynaklar paket içindedir.
2. **OTA / kanal yöneticisi entegrasyonu yok (G-05).** Airbnb, Booking vb. yalnızca satış kanalı etiketidir.
3. **Fatura kesme yok (G-06).** e-Fatura, e-Arşiv, yazarkasa, muhasebe entegrasyonu yazılmaz. Fatura bilgisi saklanır ve kopyalanır (G-191).
4. **Bizim sunucumuz, telemetri, otomatik güncelleme, lisans sunucusu yok (G-07).** `electron-updater`, `@sentry/*`, `posthog`, `mixpanel`, `firebase`, `@segment/*` vb. eklenmez. Bağımlılıklar `.npmrc` `save-exact=true` ile sabitlenir, gerekçesi `docs/plan/bagimliliklar.md`'ye eklenir ve `npm run notices` güncellenir. Uzaktan erişim sahibin kendi NetBird Free ağıyladır (K-19, K-31); Bismuth buluta bağlanmaz — Google Drive masaüstü uygulamasının yerel klasörüne şifreli dosya yazar (K-32).
5. **Tek giriş (G-60).** Aynı bilgi iki ekranda iki kez girilmez; türetilebilen her şey hesaplanır.
6. **Para kayan sayı olamaz (G-131).** `amount_minor` tam sayı (kuruş) + `currency` kodu; parasal çarpma/bölme yalnızca `src/shared/money.ts` içindedir.
7. **Yetki servis katmanında (G-23).** Her servis çağrısı `ctx` alır ve `requirePermission` denetler; IPC ve HTTP aynı kapıdan geçer. Arayüzde gizlemek yetmez.
8. **Metin koda gömülmez (G-08).** Kullanıcıya görünen her metin `src/renderer/i18n/{tr,en,ru}.json` anahtarıdır (`t('...')`); `tr.json` kaynak, `en/ru` aynı anahtar kümesi. Anahtar eklemek için üç JSON elle düzenlenmez, `npm run i18n:add -- <spec.json>` kullanılır. Düzen için mantıksal CSS (`ms-`, `me-`, `ps-`, `pe-`, `text-start`) — `left/right` yalnız takvim ızgarası ve sayısal tablolarda.
9. **Commit edilmiş migrasyon (`drizzle/*.sql`) değiştirilmez (G-133).** Düzeltme = yeni numaralı eklemeli migrasyon (`npm run db:generate -- --name <ad>`).
10. **Otele özel kural = ayar (G-09).** İzin sayısı, hafta sonu gecesi, çamaşır türleri gibi değerler koda sabit yazılmaz; ayar/tohum tablolarından okunur.
11. **İş verisi silinmez.** Ödeme/gider/rezervasyon `voided_at` veya durum değişikliği ile iptal edilir; her yazma `audit_log`'a gider (G-24). **Tanımlı istisnalar:** (a) Biyometrik veri (`guest_faces`, `camera_events` — K-52 gereği çıkışta/süre sonunda `audit_log` ile fiziksel silinir); (b) iş kaydı olmayan türetilmiş/yardımcı satırlar (`docs/plan/03-mimari.md` §4.8b: iptal edilen `room_nights`, yenilenen `expense_items`, kullanılmamış özel etiketler, süresi dolan çözülmüş arıza fotoğraf dosyaları, budanan 30 günlük otomatik yedekler ve `change_log`).
12. **`docs/plan/01-gereksinimler.md` yalnız sahibin açık isteğiyle değişir.** Değişiklik `.agent/skills/requirement-change/SKILL.md` adımlarıyla yapılır (`protect-files` korur). Yeni özellik fikri gelirse önce sahibe sorulur.
13. **Tek yazıcı (G-140/G-141).** Yazma işlemleri yalnız sunucu/tek-bilgisayar makinesindeki servis katmanında yapılır. İstemci modu uzak sunucu dışında yerel veritabanına **asla yazma yapmaz**; Mac'teki yerel SQLite kopyası yalnızca bağlantı kesildiğinde okuma için tutulan salt-okunur sıcak yedek kopyadır (K-19).
14. **Kamera/biyometrik veri ve sır depoya girmez (K-51).** KBS/kimlik listeleri (`.xlsx`, `.csv`), geçerli T.C. kimlik numarası (10000000146 hariç), yüz görüntüsü/vektörü, alarm karesi, model ağırlığı (`.pt`, `.onnx`…), `.env`, RTSP şifresi ve Telegram bot token'ı commit edilemez. Örnek veriler uydurma isim ve rakamdır. Python yan süreç dış servise bağlanmaz; tek istisna K-50 (`camera.telegram.enabled` açıksa `src/main/network/telegram/` üzerinden Bismuth gönderir).
15. **GitHub Actions ajanlar tarafından tetiklenmez.** `gh workflow run`, `gh run rerun`, `gh release create`, `git tag v*` yasaktır (`workflow-guard` engeller). Hem `ci.yml` hem `release.yml` elle/etiketle başlar; sürümü sahip başlatır.

## 4. Teknoloji ve Kod Kuralları

```
src/renderer (React)  →  src/renderer/lib/transport (IPC veya HTTP, tek sözleşme)
   →  src/main/ipc · src/main/server (Hono + zod doğrulama)
   →  src/main/services (yetki + transaction + audit_log)
   →  src/main/db (Drizzle; SQLite yalnız db/client.ts)
src/shared: tipler, zod sözleşmesi (contract/procedures/<modül>.ts), saf iş kuralları (domain/), para (money.ts)
```

- `src/shared` Electron veya React'e bağımlı olamaz. Tarihler `YYYY-MM-DD` yerel gün string'idir; konaklama `[giriş, çıkış)` (turizm istatistiği hariç: aynı gün = 1 gece).
- SQLite erişimi yalnız `src/main/db/client.ts`; parametreli sorgu; WAL + `synchronous=FULL`; yazmalar `inTransaction` içinde.
- Arayüzde yalnız `components/ui` (shadcn) ve proje bileşenleri; inline `style` yok (sanallaştırılmış ızgara/liste konum-boyutu hariç); renkler CSS değişkeni. React Compiler kapalıdır.
- Türkçe sıralama `Intl.Collator('tr')`; biçimler yalnız `src/shared/format.ts` üzerinden; dosya ekleri `userData/attachments/` altında (yol + sha256).
- İsimler: tablolar `snake_case`, TS `camelCase`, bileşenler `PascalCase`, dosyalar `kebab-case.ts(x)`.
- Ayrıntılı tarifler (yeni API, ekran, migrasyon, i18n, ayar) ve bilinen tuzaklar: `docs/gelistirici/README.md`. Alan kuralları: `.agent/rules/*.md`.

## 5. Komutlar ve Doğrulama

Node 22+ gerekir (`npm ci`).

| Komut                                                                       | Ne yapar                                                                                  |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run dev`                                                               | Programı geliştirme modunda açar                                                          |
| `npm run check`                                                             | `typecheck` → `lint` → `format:check` → `test`; başarılıysa `.cache/.checks-passed` yazar |
| `npm run typecheck` · `npm run lint` · `npm run format:check` · `npm test`  | Tekil kontroller; tek test: `npx vitest run <yol>`                                        |
| `node scripts/guards/test-guards.mjs`                                       | Koruma ve Antigravity kanca testleri (126 senaryo)                                        |
| `npm run build`                                                             | `out/` derlemesi (e2e ve paketleme öncesi)                                                |
| `npx playwright test --project=electron tests/e2e/electron/<dosya>.spec.ts` | Tek electron e2e dosyası (önce `build`)                                                   |
| `npm run i18n:check` · `npm run i18n:add -- <spec.json>`                    | Çeviri anahtarı denetimi / ekleme                                                         |
| `npm run db:generate -- --name <ad>`                                        | Yeni numaralı migrasyon üretimi                                                           |
| `npm run notices`                                                           | `THIRD_PARTY_NOTICES.md` ve Hakkında listesini günceller                                  |

"Bitti" demeden önce: kod + test, `npm run check` yeşil, ekran değiştiyse ilgili tek e2e dosyası yeşil.

## 6. Git, Makine ve İletişim Kuralları

- **Dal:** `main` sahibindir. Her iş için dal açın: `git switch -c antigravity/<kısa-konu>`. `main`'e push edilmez (`pre-push` engeller).
- **Commit:** Küçük, konu odaklı; mesaj İngilizce `type(scope): summary` (ör. `fix(ledger): keep the cash total after a void`). Hiçbir zaman `git add -A` kullanmayın (sahibin `Başlıksız.canvas` veya yerel dosyalarını karıştırmamak için açık dosya yolları ekleyin).
- **Pull request / Sürüm:** PR yalnız sahip isterse açılır. Sürüm için sahip `package.json` `version` + `docs/surum-notlari/vX.Y.Z.md` sonrası GitHub Actions UI'dan `release` başlatır.
- **Bellek kısıtlı Mac:** Ağır işleri (`npm run check`, `npm run build`, e2e, `cargo build`) aynı anda tek çalıştırın; e2e testlerini dosya dosya koşun.
- **Sınırlar:** Sahibin Google Drive'ında hiçbir dosyayı silmeyin, taşımayın, yazmayın. Kamera cihazlarına giriş yapmayın.
- **Sahiple iletişim:** Sade Türkçe, kısa cümle, numaralı adımlar; teknik terimin yanında ne işe yaradığı. Soru sorarken tek seferde, numaralı ve önerilen cevapla. Bitince: ne değişti, ne denendi, ne denenmedi.
