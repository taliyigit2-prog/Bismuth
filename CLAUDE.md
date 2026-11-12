# Bismuth — Claude çalışma kuralları

Küçük/orta oteller için masaüstü otel yönetim programı. Electron + React 19 + TypeScript + Tailwind v4 + shadcn/ui
(Radix) + SQLite (better-sqlite3 + Drizzle) + gömülü Hono sunucusu (sunucu modu). Arayüz Türkçe/İngilizce/Rusça
(Arapça ertelendi). Windows `Bismuth-Setup.exe` ve macOS `Bismuth.dmg` GitHub Actions'ta paketlenir. Ürün "bitmiş" olacak: v1.0
sonrası bakım yok. İlk müşteri: 19 odalı (38 yataklı) bir İstanbul oteli; otele özgü her kural **ayar**dır. Günlük akış: `docs/plan/akislar.md`.

Plan: `docs/plan/README.md` · Gereksinimler: `docs/plan/01-gereksinimler.md` (G-xx) · Mimari ve veri modeli:
`docs/plan/03-mimari.md` · Kararlar: `docs/plan/06-kararlar.md` (K-xx) · Sorular: `docs/plan/05-sorular.md` (S-xx) ·
Faz durumu: `docs/plan/fazlar/DURUM.md` · Araştırmalar: `docs/plan/04-arastirma/`.

## Çalışma şekli

- Bir faza başlamadan önce `docs/plan/fazlar/faz-NN-*.md` dosyasını ve atıf yapılan G-xx/K-xx satırlarını oku. Fazın "Sorular" satırındaki soruları sahibe **basit Türkçe ile, numaralı, tek seferde** sor; cevapları `06-kararlar.md` → "Sahip cevapları" bölümüne yaz. Cevapsız soru = varsayılan uygulanır ve "(varsayılan)" diye işaretlenir.
- Faz kapsamı dışına çıkma. Yeni özellik fikri → `01-gereksinimler.md` §P'ye öneri satırı (`/requirement-change` ile) + `05-sorular.md`'ye soru; kod yazma.
- Her teslimat maddesi: kod + test; sonra `npm run typecheck`, `npm run lint`, ilgili testler. Üçü geçmeden madde "bitti" sayılmaz.
- Faz sonunda kabul ölçütlerini işaretle, faz dosyasına "Sonuç" bölümü ekle, `DURUM.md` güncelle, commit + push.
- Belgeler ve sahibe yazılan her şey Türkçe; kod, tanımlayıcılar ve commit mesajları İngilizce.
- Sahibin gerçek gelir/gider rakamları ilgi alanı değil; yalnızca yapı. Örnek veriler uydurma isim ve rakam içerir. KBS/kimlik verisi asla depoya girmez (kanca: tablo dosyası ya da T.C. kimlik numarası olan değişiklik `git add`/`commit` edilemez).

## Yasaklar (gerekçe G-xx; çoğu kancayla zorlanır)

1. **Çevrimdışı veri girişi bozulamaz** (G-01/G-02). Ağ kodu yalnızca dört yerde: `src/main/network/` (isteğe bağlı dış veri: piyasa kuru, bayram doğrulama, hava durumu), `src/main/server/` (sunucu modu), `src/main/discovery/` (sunucu modunda yerel ağ duyurusu, mDNS), `src/renderer/lib/transport/` (istemci modu). Başka yerde `fetch`/`axios`/`WebSocket`/CDN bağlantısı yok. Dış veri 5 sn zaman aşımı, sessiz başarısızlık, `network.enabled=false` ile tamamen kapanır. Fontlar ve her kaynak paket içinde.
2. **OTA / kanal yöneticisi entegrasyonu yok** (G-05). Airbnb, Booking vb. yalnızca satış kanalı etiketidir.
3. **Fatura kesme yok** (G-06): e-Fatura, e-Arşiv, yazarkasa, muhasebe entegrasyonu yazılmaz. Fatura **bilgisi** saklanır ve kopyalanır (G-191).
4. **Bizim sunucumuz, telemetri, otomatik güncelleme, lisans sunucusu yok** (G-07). `electron-updater`, `@sentry/*`, `posthog`, `mixpanel`, `firebase`, `segment` ve benzerleri eklenmez. Bağımlılıklar `save-exact` ile sabitlenir ve `docs/plan/bagimliliklar.md`'ye yazılır. Uzaktan erişim sahibin kendi kuracağı özel ağ uygulamasıyla (K-19, K-31: NetBird Free); Bismuth bir bulut hesabına bağlanmaz — Drive'daki şifreli yedek/kutu için yalnızca eşitleme uygulamasının yerel klasörüne dosya yazar (K-32).
5. **Tek giriş** (G-60): aynı bilgi iki ekranda iki kez girilmez; türetilebilen her şey hesaplanır.
6. **Para kayan sayı olamaz** (G-131): `amount_minor` tam sayı (kuruş) + `currency` kodu. Parasal çarpma/bölme yalnızca `src/shared/money.ts` içinde.
7. **Yetki servis katmanında** (G-23): her servis çağrısı `ctx` alır; IPC ve HTTP aynı kontrolden geçer; UI'da gizlemek yeterli değildir.
8. **Metin koda gömülmez** (G-08): kullanıcıya görünen her metin `src/renderer/i18n/<dil>.json` anahtarıdır (`t('...')`); `tr.json` kaynak, `en/ru` aynı anahtar kümesi. Düzen için mantıksal CSS (`ms-`, `me-`, `text-start`) — ileride RTL dil eklenebilsin; `left/right` yalnızca takvim ızgarası ve sayısal tablolarda.
9. **Commit edilmiş migrasyon değiştirilmez** (G-133): yeni numaralı migrasyon eklenir.
10. **Otele özel kural = ayar** (G-09): "4 izin/ay", "cumartesi özel", "Bounce", çamaşır türleri gibi değerler koda yazılmaz; ayar/tohum tablolarından okunur.
11. **Veri silinmez**: ödeme/gider/rezervasyon `voided_at` veya durum değişikliği ile iptal edilir; `audit_log` her yazmayı kaydeder (G-24).
12. `docs/plan/01-gereksinimler.md` yalnızca sahibin açık isteğiyle (`/requirement-change`) değişir.
13. **Tek yazıcı**: yazma işlemleri yalnızca sunucu/tek‑bilgisayar makinesindeki servis katmanında; istemci modu yerel veritabanı açmaz (G-140/141).

## Kod kuralları

- Katmanlar: `src/renderer` (React) → `lib/transport` (IPC **veya** HTTP, tek kontrat) → `src/main/ipc` / `src/main/server` (zod doğrulama) → `src/main/services` (yetki + transaction + audit) → `src/main/db` (Drizzle). `src/shared` (tipler, zod kontratı, saf iş kuralları `domain/`) iki tarafta da kullanılır ve Electron/React'e bağımlı olamaz.
- Tarihler `YYYY-MM-DD` yerel gün string'i; konaklama `[giriş, çıkış)`; çıkış günü gece değildir (turizm istatistiği modülü hariç: aynı gün = 1 gece, `03-mimari.md` §6.11).
- SQLite erişimi yalnızca `src/main/db/client.ts`; parametreli sorgu; WAL; yazmalar transaction içinde.
- Yeni ekran = route + sayfa + mobil düzen kararı (`layouts/mobile` gerekiyorsa) + üç dil anahtarları + boş/yükleniyor/hata durumları + vitest + (akışsa) Playwright e2e (masaüstü + telefon emülasyonu). Yalnızca shadcn bileşenleri ve `components/ui`; inline style yok — **tek istisna**: sanallaştırılmış ızgara/listelerde hesaplanan konum ve boyut (`left`, `top`, `width`, `height`, `transform`); renkler her zaman CSS değişkeni (`--status-*` dahil).
- Türkçe sıralama `Intl.Collator('tr')`; para biçimi `Intl.NumberFormat(locale, { style: 'currency', numberingSystem: 'latn' })`; tutar görünümü `ui.showMinor` ayarına uyar.
- Dosya ekleri yalnızca `userData/attachments/`; DB'de yol + sha256 (K-25).
- İsimler: tablolar `snake_case`, TS `camelCase`, bileşenler `PascalCase`, dosyalar `kebab-case.ts(x)`.
- Test adları davranışı anlatır; iş kuralı testleri Excel'den doğrulanmış örnekleri kullanır (`03-mimari.md` §6).
- Yol bazlı ek kurallar: `.claude/rules/db.md`, `ui.md`, `ipc.md`, `testing.md`.

## Komutlar

`npm run dev` · `npm run check` (typecheck + lint + biçim + test; kancalar bunu bekler) · `npm run typecheck` · `npm run lint` · `npm test` · `npm run build` · `npm run e2e` · `npm run e2e:mobile` (önce `build`; Linux'ta `xvfb-run -a`) · `npm run ui:shot` · `npm run package:win` / `package:mac` / `package:dir` · `npm run db:generate -- --name <ad>` · `npm run i18n:check` · `npm run i18n:add -- <spec.json>` · `npm run notices` (bağımlılık değişince) · `npm run icon` · `npm run seed:demo` (Faz 2)

## Ajanlar ve beceriler

- `/phase-runner NN` fazı ritüelle uygular. `/parallel-build` işi bağımsız paketlere bölüp worktree ajanlarına aynı anda dağıtır ve birleştirir. `/owner-review` sahibin ekran onay sayfasını hazırlar ve kararları okur. `/qa` tüm kontrolleri ayrı bağlamda koşar. `/add-migration` yeni migrasyon açar. `/ui-screen` yeni ekran iskeleti. `/release` sürüm. `/requirement-change` gereksinim değişikliği.
- Yapan ajanlar: `feature-builder` (sonnet, medium; kendi worktree'sinde kod + test + i18n spec + görüntü, commit/push ana oturumda), `feature-builder-lite` (haiku, medium; küçük/mekanik işler), `researcher` (haiku, medium; kaynaklı alan araştırması).
- Kontrol ajanları: `bug-hunter` (sonnet, high; modül başına hata/mantık/çelişki avı), `flow-tester` (opus, medium; her düğme/form gerçek uygulamada), `decision-auditor` (opus, medium; kod ↔ karar/gereksinim), `db-reviewer`, `ui-reviewer` (opus, medium), `security-reviewer` (sonnet, high), `turkish-ui-copy`, `requirements-tracer` (haiku, medium). UI değişen her maddeden sonra metin + arayüz; birden fazlası gerekiyorsa tek mesajda paralel.
- Token ekonomisi: ajan dağıtmadan önce `/token-economy`; kodda arama/etki analizi için önce `/code-graph` (graphify, `graphify-out/` depoya girmez).
- Kesintisiz yürütme (K-39): `docs/plan/fazlar/YURUTME.md` — dalgalar, paketler, durum; bağlam sıkıştırmasından sonra önce o okunur.
- Sözleşme ve işleyiciler modül dosyalarında: `src/shared/contract/procedures/<modül>.ts`, `src/main/api/handlers/<modül>.ts`.
- i18n anahtarları paralel çalışmada `npm run i18n:add -- <spec.json>` ile eklenir; üç json dosyası elle düzenlenmez.

## Git

- Dal: oturumun atandığı `claude/...` dalı (kanca: başka dala ve `--force` ile push edilemez). Küçük, konu odaklı commit'ler; mesaj İngilizce, `type(scope): summary` biçimi. Commit öncesi typecheck + lint + test (kanca zorlar). Pull request yalnızca sahip isterse.
