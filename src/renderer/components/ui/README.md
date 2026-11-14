# components/ui

shadcn/ui (new-york-v4, Radix tabanı) bileşenlerinin proje içine alınmış kopyaları — MIT, © 2023 shadcn
(`THIRD_PARTY_NOTICES.md`). Kaynak: `shadcn-ui/ui` deposu `apps/v4/registry/new-york-v4/ui/*.tsx` (2026-10-02).
Değişiklikler: içe aktarma yolları (`@/lib/utils`, `@/components/ui`, `@/hooks`), `sonner` için `next-themes` yerine
Bismuth tema kancası; ekran okuyucu ve başlık metinleri (`Close`, `Toggle Sidebar`, `Command Palette`) `t()` anahtarlarına çevrildi (G-08). Bismuth ayarları: telefon (< 768 px) dokunma hedefleri 44 px (`max-md:min-h-11`, `max-md:h-11`; komut girişi 16 px), odak halkası tam opaklıkta (`ring-ring`, WCAG 1.4.11), `CardTitle` `leading-snug` (iki satıra kayan Rusça başlıklar). Bu klasördeki dosyalar yukarı akış kodudur; mantıksal sınıf kuralı burada uygulanmaz.
Faz 3'te eklenenler (2026-10-04, aynı kaynak): `table`, `tabs`, `popover`, `checkbox`, `textarea`, `toggle`, `toggle-group`,
`progress`, `alert`, `alert-dialog`, `avatar`, `collapsible`, `chart` (recharts 3). Aynı ayarlar: odak halkası tam opak; telefonda
`toggle` 44 px, sekme listesi 48 px, onay kutusu görünmez `::after` ile 44 px dokunma alanı. `calendar` alınmadı
(react-day-picker gerektirir); tarih seçici `components/date-input.tsx` içinde.
Faz 15 (P15a1): `Table` `density="compact"` alır (satır ve başlık yüksekliği küçülür); kişinin "Sıkışık" yoğunluk seçimi
(`<html data-density="compact">`) bütün tabloları aynı biçimde sıklaştırır.
Yeni bileşen: aynı kaynaktan kopyala, bu listeye ekle.
P17c (2026-11-13, aynı kaynak): `context-menu` (sağ tık / telefonda uzun basma menüsü; `Content`, `Item`, `Label`, `Separator`; öğeler `dropdown-menu` ile aynı 44 px telefon ayarı). Yeni bağımlılık yok (`radix-ui` paketinin parçası).
