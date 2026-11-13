---
name: ui-screen
description: Yeni bir ekranın iskeletini kurallara uygun kurar — TanStack Router route dosyası, features/<ad> sayfası, tr/en/ru anahtarları, boş/yükleniyor/hata/yetkisiz durumları, mobil düzen kararı, vitest ve Playwright e2e taslağı; sonra turkish-ui-copy ve ui-reviewer. "Yeni ekran ekle", "X sayfasını oluştur", "/ui-screen guests misafirler" için.
argument-hint: "[feature-adı] [route-yolu]"
arguments: [name, path]
allowed-tools: Bash(npm run typecheck) Bash(npm run lint) Bash(npx vitest *) Bash(npm run i18n:*) Bash(npm run ui:shot*) Bash(git status *)
---

## Mevcut ekranlar (örnek al)

!`ls src/renderer/routes src/renderer/features 2>/dev/null | head -40`

## Kurallar

- `.claude/rules/ui.md` tüm çalışma boyunca geçerlidir; önce onu, ilgili faz maddesini ve varsa `docs/tasarim.md`'yi oku.
  Yeni ekran = route + sayfa + mobil düzen kararı + üç dil anahtarı + boş/yükleniyor/hata durumları + vitest + (akışsa) e2e.
- Adlar: klasör ve dosyalar `kebab-case` (`$name`), bileşenler `PascalCase`, i18n anahtarları `$name.*` (nokta ayrımlı, camelCase yaprak).
- Kullanıcıya görünen hiçbir metin koda yazılmaz (Yasak 8); `i18n-literal-warn` kancası uyarır, ESLint commit'i durdurur.
- Yalnızca `components/ui` (shadcn) ve projedeki özel bileşenler; inline `style` yok; renkler CSS değişkeni; mantıksal sınıflar
  (`ms-`, `me-`, `ps-`, `pe-`, `text-start`).
- Veri yalnızca `lib/api` üzerinden (TanStack Query); bileşen `window.api`'yi doğrudan çağırmaz.

## Adımlar

1. **Route**: `src/renderer/routes/` altında TanStack Router dosya tabanlı route (`createFileRoute('/$path')`), hash geçmişi
   zaten kurulu. `routeTree.gen.ts` üretilmiş dosyadır, elle düzenleme — geliştirme sunucusu / derleme yeniden üretir.
   Menü öğesi: masaüstü kenar çubuğu + (telefon kapsamındaysa) alt gezinme; görünürlük yetkiye göre (`view` seviyesi), ama asıl
   denetim serviste (G-23).
2. **Sayfa**: `src/renderer/features/$name/` → `$name-page.tsx` (sayfa), alt bileşenler, `use-$name.ts` (sorgu/mutasyon
   kancaları). Formlar react-hook-form + zod (`import * as z`), diyalog `ResponsiveDialog`; `Esc` kapatır, `Enter` kaydeder.
3. **Durumlar** (dördü de zorunlu): yükleniyor → `Skeleton`; boş → başlık + kısa açıklama + birincil eylem; hata → ne olduğu +
   "Tekrar dene" (`refetch`); yetkisiz (`PermissionDenied`) → "yetkiniz yok" durumu.
4. **Mobil karar** (açıkça yaz, faz dosyasının ilgili maddesine not düş): (a) aynı bileşen duyarlı, (b) `layouts/mobile` için
   ayrı görünüm (ör. ızgara yerine liste), ya da (c) telefonda yok (G-143 kapsam listesinde değilse). Telefonda 44 px dokunma
   hedefi, 16 px giriş yazısı, `dvh`, güvenli alan.
5. **Metinler**: `src/renderer/i18n/tr.json` kaynak; aynı anahtarlar `en.json` ve `ru.json`'a **çevrilerek** eklenir (Türkçe
   kopyalanmaz). Rusça çoğullar `_one/_few/_many/_other`. Terimler ve ton için `tr-copy-guide` becerisi. Varsa
   `npm run i18n:check` ile anahtar eşitliğini doğrula.
6. **Testler**:
   - Vitest (jsdom): `$name-page.test.tsx` — taşıma katmanı sahte; yükleniyor, boş, hata ve dolu durumları; test adı davranışı
     anlatır (`it('kayıt yoksa boş durum ve "Yeni ..." düğmesi görünür')`).
   - Akış varsa Playwright taslağı `tests/e2e/$name.spec.ts`: `#/$path` açılır, başlık görünür; henüz yapılmayan adımlar
     `test.fixme`. Hem `electron` hem `mobile` projesinde koşar (`npm run e2e`, `npm run e2e:mobile`).
7. **Doğrula**: `npm run typecheck`, `npm run lint`, `npx vitest run src/renderer/features/$name`.
8. **Gözden geçir**: `turkish-ui-copy` ajanını (metin + üç dil anahtar eşitliği), ardından `ui-reviewer` ajanını
   (route: `$path`; masaüstü + telefon, açık + koyu) çalıştır; bulguları düzelt ve 7. adımı tekrarla.
