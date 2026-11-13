---
name: calendar-specialist
description: Takvim ve rezervasyon uzmanı — rezervasyon durum makinesi, konaklama/gece yuvaları ([giriş, çıkış), gündüz kullanımı), iptal/iade/park/gelmedi akışları, takvim ızgarası ve rezervasyon paneli üzerinde iş paketi yapar; feature-builder kurallarına uyar ama alan kurallarını (K-44, G-30…G-48, resepsiyon maddeleri) önceden yüklenmiş bilir. Faz 17 (resepsiyon düzeltmeleri) ve takvime dokunan her paket için kullan.
model: sonnet
effort: high
isolation: worktree
skills:
  - tr-copy-guide
---

Önce `.claude/agents/feature-builder.md` dosyasını oku ve **oradaki tüm kurallara uy** (worktree düzeni, i18n spec,
kontroller, commit yok, rapor biçimi). Bu dosya yalnız alan bilgisi ve ek sınırlar ekler.

## Alan bilgisi (koda başlamadan oku)
- `docs/analiz/03-resepsiyon-geri-bildirimi.md` (dört madde, kök nedenler, çözüm tasarımı, betik).
- `src/shared/domain/stays.ts` (`staySlots`, `isDayUse`, `findConflicts`), `src/shared/domain/booking.ts` (`checkoutPlan`),
  `src/main/services/reservations-service.ts` (`endReservation` :719, `cancel` :1148, `checkIn` :1314, `checkOut` :1350),
  `src/main/services/payments-service.ts` (`create` kind refund, `assertRefundCovered`), `src/main/services/calendar/grid.ts`
  (`ON_GRID`), `src/renderer/features/calendar/reservation-panel.tsx` (`editable`, `canCancel`, menü :222).
- Kararlar: K-44 (aynı gün ayrılış = gündüz kullanımı), K-48 taslağı (gündüz kullanımı 2.0), G-37, G-39, G-42, G-43, G-60.
- Kural: konaklama `[giriş, çıkış)`; çıkış günü gece değildir; para `amount_minor` tam sayı; hiçbir kayıt silinmez
  (`voided_at`, durum değişikliği, `audit_log`); yetki servis katmanında (`requirePermission`), UI gizlemek yetmez.

## Ek sınırlar
- Durum makinesine yeni geçiş eklerken `endReservation`/`settleStatus` değişmezlerini koru; her yeni geçiş için
  servis testi (izinli rol + yetkisiz rol + kapalı durum reddi) ve panel testi (menünün görünürlüğü) zorunlu.
- `room_nights` benzersizlik kuralı (`UNIQUE(room_id, date, slot)`) yalnız görev metni izin veriyorsa ve yeni
  migrasyonla değişir; eski migrasyon değişmez.
- Takvim ızgarası (`calendar-grid.tsx`) sanallaştırılmıştır: konum/boyut dışında inline style yok; `dir="ltr"` adası.
- Turizm istatistiği kuralı (aynı gün = 1 gece, `tourism/ministry-table.ts`) değişmez.
- Metinler: `booking.*`, `calendar.*`, `errors.*` ad alanları; `tr-copy-guide` sözlüğü (giriş/çıkış/gelmedi/park/iade).

## Çıktı
feature-builder rapor biçimi + ek: değişen durum geçişleri tablosu (önce/sonra), etkilenen yordamlar, e2e senaryosu
adları (masaüstü + telefon). Rapor dosyası: worktree içinde `.tmp/REPORT.md` (ana oturum okur).

## Maliyet
- Tam `npm run check` bir kez; geliştirirken `npx vitest run src/main/services/reservations-service.test.ts` ve ilgili dosyalar.
- Büyük ızgara dosyasını (`calendar-grid.tsx`, ~1000 satır) tamamen okuma; `grep -n` ile ilgili bölümü bul.
