---
trigger: model_decision
description: Apply when editing React renderer components, styles, routes, or i18n copy (src/renderer/**/*.{ts,tsx,css}).
---

# Arayüz Kuralları (03-mimari.md §2, faz-03, faz-13)

- Yalnızca `components/ui` (shadcn new-york-v4 kopyaları, Radix tabanlı; elle alındı, `components.json` yok — `components/ui/README.md`) ve projede tanımlı özel bileşenler; inline style yok (istisna: sanallaştırmanın hesapladığı konum/boyut değerleri); renkler CSS değişkeni (`--status-paid` vb. dahil) — sabit hex yok. React Compiler kapalı (TanStack Table v9 hataları); zod `import * as z`. `vaul` eklenmez (bakımsız); mobil alt sayfa = `Sheet side="bottom"`.
- Kullanıcıya görünen her metin `t('...')`; anahtarlar `src/renderer/i18n/tr.json` (nokta ayrımlı: `reservations.form.checkIn`); `en/ru.json` aynı anahtarlar (`npm run i18n:add -- <spec.json>`); çoğul anahtarları CLDR eklerine göre (`_one/_few/_many/_other`).
- Yön: mantıksal sınıflar (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`); `ml-/mr-/pl-/pr-/left-/right-` yalnızca `dir="ltr"` adası olan takvim ızgarası ve sayısal tablolarda. İstisna: `components/ui` yukarı akış kodu fiziksel sınıflar içerir (ESLint orada kapalı); bir RTL dil eklendiğinde bu klasör shadcn'in RTL sürümüyle yenilenir. Sayı/telefon girişleri `dir="ltr"`; para `<bdi>` içinde ve Latin rakam (`nu-latn`).
- Mobil (< 768 px, `useIsMobile`; CSS'te `max-md:`): alt gezinme, 44 px dokunma hedefi (`components/ui` düğme/giriş/seçim bunu kendisi sağlar; satır içi radyo/anahtar için tüm satır `Label` ya da görünmez `::after` alanı), 16 px giriş yazısı, bildirimler üstte, `dvh`, güvenli alan; `ResponsiveDialog` masaüstünde Dialog, telefonda alt Sheet.
- Her ekran: boş durum, yükleniyor, hata; klavye ile tamamen kullanılabilir; odak halkası görünür; `Esc` kapatır, `Enter` kaydeder.
- Diyalog içinde açılır menü: Radix `modal={false}` tuzağına dikkat; Select-in-Dialog kaydırma sorunu için `ScrollArea`.
- Tarih/para biçimleri `src/shared/format.ts` üzerinden (`tr-TR`); Türkçe sıralama `Intl.Collator('tr')`.
- Veri erişimi yalnızca `lib/api` (TanStack Query sarmalayıcı); bileşen `window.bismuth`'u doğrudan çağırmaz (`lib/shell` ve `lib/transport` dışında yasak).
- Rol-duyarlılık: menü/düğme yetkiye göre gizlenir **ama** asıl kontrol servistedir; yetkisiz yanıt gelince "yetkiniz yok" durumu gösterilir.
- 1366×768'de yatay kaydırma yok (takvim hariç). Yoğun tablolar `density="compact"` destekler.
- Grafikler: shadcn charts (Recharts); renkler `var(--chart-n)` / `var(--status-*)`; her grafiğin tablo görünümü vardır.
