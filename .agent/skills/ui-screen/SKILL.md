---
name: ui-screen
description: >-
  Yeni bir ekranın iskeletini kurallara uygun kurar — TanStack Router route dosyası,
  features/<ad> sayfası, tr/en/ru anahtarları, boş/yükleniyor/hata/yetkisiz durumları,
  mobil düzen kararı, vitest ve Playwright e2e taslağı. Yeni ekran veya sayfa eklerken kullanın.
---

# Yeni Ekran Rehberi (`ui-screen`)

## Kurallar

- `.agent/rules/ui.md` tüm çalışma boyunca geçerlidir; önce onu ve varsa `docs/gelistirici/tasarim.md`'yi oku.
  Yeni ekran = route + sayfa + mobil düzen kararı + üç dil anahtarı + boş/yükleniyor/hata/yetkisiz durumları + vitest + (akışsa) e2e.
- Mevcut ekran örnekleri için `src/renderer/routes/` ve `src/renderer/features/` dizinlerine bak.
- Adlar: klasör ve dosyalar `kebab-case`, bileşenler `PascalCase`, i18n anahtarları `<name>.*` (nokta ayrımlı, camelCase yaprak).
- Kullanıcıya görünen hiçbir metin koda yazılmaz (`ANTIGRAVITY.md` Yasak 8); ESLint `i18next/no-literal-string` commit'i durdurur.
- Yalnızca `components/ui` (shadcn) ve projedeki özel bileşenler; inline `style` yok; renkler CSS değişkeni; mantıksal sınıflar (`ms-`, `me-`, `ps-`, `pe-`, `text-start`).
- Veri yalnızca `lib/api` üzerinden (TanStack Query); bileşen `window.bismuth`'u doğrudan çağırmaz.

## Adımlar

1. **Route**: `src/renderer/routes/` altında TanStack Router dosya tabanlı route (`createFileRoute('/<path>')`), hash geçmişi zaten kurulu. `routeTree.gen.ts` üretilmiş dosyadır, elle düzenleme — geliştirme sunucusu / derleme yeniden üretir. Menü öğesi (`src/renderer/navigation.ts`): masaüstü kenar çubuğu + (telefon kapsamındaysa) alt gezinme; görünürlük yetkiye göre (`view` seviyesi), ama asıl denetim servistedir (G-23).
2. **Sayfa**: `src/renderer/features/<name>/` → `<name>-page.tsx` (sayfa), alt bileşenler, `use-<name>.ts` (sorgu/mutasyon kancaları). Formlar `react-hook-form` + zod (`import * as z`), diyalog `ResponsiveDialog`; `Esc` kapatır, `Enter` kaydeder.
3. **Durumlar** (dördü de zorunlu): yükleniyor → `Skeleton`; boş → başlık + kısa açıklama + birincil eylem; hata → ne olduğu + "Tekrar dene" (`refetch`); yetkisiz (`PermissionDenied`) → "yetkiniz yok" durumu.
4. **Mobil karar**: (a) aynı bileşen duyarlı, (b) `layouts/mobile/` için ayrı görünüm (ör. ızgara yerine liste), ya da (c) telefonda yok (G-143 kapsam listesinde değilse). Telefonda 44 px dokunma hedefi, 16 px giriş yazısı, `dvh`, güvenli alan.
5. **Metinler** (üç json elle düzenlenmez: anahtarlar `i18n-spec/<ad>.json` dosyasına yazılır ve `npm run i18n:add -- i18n-spec/<ad>.json` ile uygulanır): `src/renderer/i18n/tr.json` kaynak; aynı anahtarlar `en.json` ve `ru.json`'a **çevrilerek** eklenir. Rusça çoğullar `_one/_few/_many/_other`. Terimler ve ton için `tr-copy-guide` becerisine bak. `npm run i18n:check` ile anahtar eşitliğini doğrula.
6. **Testler**:
   - Vitest (jsdom): `<name>-page.test.tsx` — taşıma katmanı sahte; yükleniyor, boş, hata ve dolu durumları; test adı davranışı anlatır (`it('kayıt yoksa boş durum ve "Yeni ..." düğmesi görünür')`).
   - Akış varsa Playwright e2e (`tests/e2e/electron/` ve `tests/e2e/mobile/`): `tests/e2e/routes.ts` içine ekranı ekle (1366×768 ve 390×844 taşma denetimi).
7. **Doğrula**: `npm run typecheck`, `npm run lint`, `npx vitest run src/renderer/features/<name>`, ardından `npm run ui:shot -- --routes <name>` ile masaüstü/telefon ve açık/koyu tema görüntülerini kontrol et.
