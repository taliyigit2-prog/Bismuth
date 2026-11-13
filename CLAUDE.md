# Bismuth — Claude çalışma kuralları

Küçük/orta oteller için masaüstü otel yönetim programı. Electron + React 19 + TypeScript + Tailwind v4 + shadcn/ui
(Radix) + SQLite (better-sqlite3 + Drizzle) + gömülü Hono sunucusu (sunucu modu). Arayüz Türkçe/İngilizce/Rusça
(Arapça ertelendi). Windows `Bismuth-Setup.exe` ve macOS `Bismuth.dmg` GitHub Actions'ta paketlenir. Ürün "bitmiş" olacak: v1.0
sonrası bakım yok. İlk müşteri: 19 odalı (38 yataklı) bir İstanbul oteli; otele özgü her kural **ayar**dır. Günlük akış: `docs/plan/akislar.md`.

Plan: `docs/plan/README.md` · Gereksinimler: `docs/plan/01-gereksinimler.md` (G-xx) · Mimari ve veri modeli:
`docs/plan/03-mimari.md` · Kararlar: `docs/plan/06-kararlar.md` (K-xx) · Sorular: `docs/plan/05-sorular.md` (S-xx) ·
Faz durumu: `docs/plan/fazlar/DURUM.md` · Yürütme (dalgalar): `docs/plan/fazlar/YURUTME.md` · Araştırmalar: `docs/plan/04-arastirma/` ·
**Analiz raporları ve geliştirme planı (2026-11-12): `docs/analiz/`** (özet `00-ozet.md`, plan `08-gelistirme-plani.md`).

## Çalışma şekli

- Bir faza başlamadan önce `docs/plan/fazlar/faz-NN-*.md` dosyasını ve atıf yapılan G-xx/K-xx satırlarını oku. Fazın "Sorular" satırındaki soruları sahibe **basit Türkçe ile, numaralı, tek seferde** sor; cevapları `06-kararlar.md` → "Sahip cevapları" bölümüne yaz. Cevapsız soru = varsayılan uygulanır ve "(varsayılan)" diye işaretlenir.
- Faz kapsamı dışına çıkma. Yeni özellik fikri → `01-gereksinimler.md` §P'ye öneri satırı (`/requirement-change` ile) + `05-sorular.md`'ye soru; kod yazma.
- Her teslimat maddesi: kod + test; sonra `npm run typecheck`, `npm run lint`, ilgili testler. Üçü geçmeden madde "bitti" sayılmaz.
- Faz sonunda kabul ölçütlerini işaretle, faz dosyasına "Sonuç" bölümü ekle, `DURUM.md` güncelle, commit + push.
- Belgeler ve sahibe yazılan her şey Türkçe; kod, tanımlayıcılar ve commit mesajları İngilizce.
- Sahibin gerçek gelir/gider rakamları ilgi alanı değil; yalnızca yapı. Örnek veriler uydurma isim ve rakam içerir. KBS/kimlik verisi asla depoya girmez (kanca: tablo dosyası ya da T.C. kimlik numarası olan değişiklik `git add`/`commit` edilemez).

## Yasaklar (gerekçe G-xx; çoğu kancayla zorlanır)

1. **Çevrimdışı veri girişi bozulamaz** (G-01/G-02). Ağ kodu yalnızca beş yerde: `src/main/network/` (isteğe bağlı dış veri: piyasa kuru, bayram doğrulama, hava durumu; kamera alarmı Telegram bildirimi K-50), `src/main/server/` (sunucu modu), `src/main/discovery/` (sunucu modunda yerel ağ duyurusu, mDNS), `src/renderer/lib/transport/` (istemci modu), `src/main/camera/` (yalnız `127.0.0.1` yan süreç, `rtsp://` ve yerel ağ kamera keşfi; K-49). Başka yerde `fetch`/`axios`/`WebSocket`/CDN bağlantısı yok. Dış veri 5 sn zaman aşımı, sessiz başarısızlık, `network.enabled=false` ile tamamen kapanır. Fontlar ve her kaynak paket içinde.
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
14. **Kamera/biyometrik veri depoya girmez** (K-51): yüz görüntüsü, yüz vektörü, alarm karesi, model ağırlığı, `.env`, RTSP şifresi ve Telegram token'ı commit edilemez (kanca: `camera-data-guard`). Python yan süreç dış servise bağlanmaz; **tek istisna** K-50: Bismuth, `camera.telegram.enabled` açıksa alarmı `src/main/network/telegram/` üzerinden Telegram'a da gönderir (5 sn zaman aşımı, sessiz başarısızlık, `network.enabled=false` ile kapanır). Modeller sahibin kararıyla mevcut (InsightFace + YOLO11n, K-57); kurallar `.claude/rules/camera.md`.
15. **GitHub Actions ajanlar tarafından tetiklenmez** (dakika kotası): `gh workflow run`, `gh run rerun`, `gh release create`, `git tag v*` yasak (kanca: `workflow-guard`); tüm kontroller Codespace içinde koşar; sürüm etiketini sahip atar.

## Kod kuralları

- Katmanlar: `src/renderer` (React) → `lib/transport` (IPC **veya** HTTP, tek kontrat) → `src/main/ipc` / `src/main/server` (zod doğrulama) → `src/main/services` (yetki + transaction + audit) → `src/main/db` (Drizzle). `src/shared` (tipler, zod kontratı, saf iş kuralları `domain/`) iki tarafta da kullanılır ve Electron/React'e bağımlı olamaz.
- Tarihler `YYYY-MM-DD` yerel gün string'i; konaklama `[giriş, çıkış)`; çıkış günü gece değildir (turizm istatistiği modülü hariç: aynı gün = 1 gece, `03-mimari.md` §6.11).
- SQLite erişimi yalnızca `src/main/db/client.ts`; parametreli sorgu; WAL; yazmalar transaction içinde.
- Yeni ekran = route + sayfa + mobil düzen kararı (`layouts/mobile` gerekiyorsa) + üç dil anahtarları + boş/yükleniyor/hata durumları + vitest + (akışsa) Playwright e2e (masaüstü + telefon emülasyonu). Yalnızca shadcn bileşenleri ve `components/ui`; inline style yok — **tek istisna**: sanallaştırılmış ızgara/listelerde hesaplanan konum ve boyut (`left`, `top`, `width`, `height`, `transform`); renkler her zaman CSS değişkeni (`--status-*` dahil).
- Türkçe sıralama `Intl.Collator('tr')`; para biçimi `Intl.NumberFormat(locale, { style: 'currency', numberingSystem: 'latn' })`; tutar görünümü `ui.showMinor` ayarına uyar.
- Dosya ekleri yalnızca `userData/attachments/`; DB'de yol + sha256 (K-25).
- İsimler: tablolar `snake_case`, TS `camelCase`, bileşenler `PascalCase`, dosyalar `kebab-case.ts(x)`.
- Test adları davranışı anlatır; iş kuralı testleri Excel'den doğrulanmış örnekleri kullanır (`03-mimari.md` §6).
- Yol bazlı ek kurallar: `.claude/rules/db.md`, `ui.md`, `ipc.md`, `testing.md`, `camera.md`.

## Komutlar

`npm run dev` · `npm run check` (typecheck + lint + biçim + test; kancalar bunu bekler) · `npm run typecheck` · `npm run lint` · `npm test` · `npm run build` · `npm run e2e` · `npm run e2e:mobile` (önce `build`; Linux'ta `xvfb-run -a`) · `npm run ui:shot` · `npm run package:win` / `package:mac` / `package:dir` · `npm run db:generate -- --name <ad>` · `npm run i18n:check` · `npm run i18n:add -- <spec.json>` · `npm run notices` (bağımlılık değişince) · `npm run icon` · `npm run seed:demo` (Faz 2)

## Ajanlar ve beceriler

- **Otonom yürütme:** `/orkestra` — `YURUTME.md`'den sıradaki dalgayı alır, paketleri ajanlara dağıtır, birleştirir,
  kontrolleri ve kontrol ajanlarını koşturur, durma koşullarında (`/orkestra` §5) sahibe `❓ SORULARIM` ile sorar.
  Tek faz için `/phase-runner NN`; dağıtım ayrıntısı `/parallel-build`; kontroller `/qa`; token kuralları `/token-economy`;
  arama `/code-graph`. Diğerleri: `/owner-review`, `/add-migration`, `/ui-screen`, `/release`, `/requirement-change`;
  başvuru: `/electron-security` (Electron/HTTP güvenlik listesi), `/tr-copy-guide` (arayüz metni sözlüğü ve tonu);
  sadeleştirme: `/ponytail` (dietrichgebert/ponytail 5.3.3 sabit kopya; proje kuralları önce gelir; `/orkestra` §3 adım 5a).
- **Yapan ajanlar** (model/çaba ajan dosyasında sabit; `docs/analiz/09-ajan-sistemi.md` §2): `feature-builder` (sonnet),
  `calendar-specialist` (sonnet/high; takvim, rezervasyon, iptal/iade, gündüz kullanımı), `db-migration-builder`
  (sonnet/high; şema + migrasyon), `camera-integrator` (sonnet/high; Python yan süreç + Kamera sekmesi), `packager`
  (sonnet; electron-builder, iş akışı dosyaları, kurulum belgeleri), `feature-builder-lite` (haiku; küçük/mekanik),
  `researcher` (haiku; hukuk/lisans için sonnet).
- **Kontrol ajanları:** `bug-hunter`, `flow-tester`, `security-reviewer`, `db-reviewer` (sonnet/high); `ui-reviewer`,
  `screen-auditor` (çözünürlük/ölçek/tam ekran), `privacy-auditor` (KVKK) (sonnet/medium); `decision-auditor`
  (opus/medium); `turkish-ui-copy`, `requirements-tracer` (haiku). Her ajan raporunu `.tmp/<ad>/REPORT.md`'ye yazar,
  ana oturuma ≤15 satır döner. UI değişen her maddeden sonra metin + arayüz; birden fazlası gerekiyorsa tek mesajda paralel.
- Makine 2 çekirdek: aynı anda en çok 2 kodlayan ajan; kontrol ajanları kodlayanlar bittikten sonra.
- Sözleşme ve işleyiciler modül dosyalarında: `src/shared/contract/procedures/<modül>.ts`, `src/main/api/handlers/<modül>.ts`.
- i18n anahtarları paralel çalışmada `npm run i18n:add -- <spec.json>` ile eklenir; üç json dosyası elle düzenlenmez.

## Opus için "nereden başlarım"

1. `docs/analiz/OPUS-BASLANGIC.md` (devir notu) → `docs/analiz/00-ozet.md` → `docs/plan/fazlar/YURUTME.md` (dalgalar).
2. Sahip sorularının cevapları `docs/plan/06-kararlar.md` "Sahip cevapları"nda; yoksa `05-sorular.md` varsayılanı.
3. `/orkestra` ile sıradaki dalgayı başlat. Bağlam sıkıştırmasından sonra önce `YURUTME.md` okunur (kanca özetler).
4. Kamera modülü: `.claude/rules/camera.md` ve `docs/analiz/06-kamera-entegrasyonu.md`; başlatıcı
   `node tools/ajan/ajan.mjs --model claude-opus-5-5 --butce <tutar>` (AskUserQuestion yok; sorular mesaj sonunda).

## Git

- Dal: oturumun atandığı `claude/...` dalı (kanca: başka dala ve `--force` ile push edilemez). Küçük, konu odaklı commit'ler; mesaj İngilizce, `type(scope): summary` biçimi. Commit öncesi typecheck + lint + test (kanca zorlar). Pull request yalnızca sahip isterse.
