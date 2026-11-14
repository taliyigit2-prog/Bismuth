# S2-G1 düzeltmeleri

| Bulgu | Düzeltme | Test |
|---|---|---|
| B1 | `payment-allocation.ts`: `isGroupPayableStatus`, `groupPayableMinor` (checked_out dahil). `payGroup` ve `groupView.totals` bunu kullanır; totals'a `payableMinor`; `balanceMinor` iptal/gelmedi hariç. `group-panel.tsx` düğme/varsayılan/tooMuch `payableMinor`. `booking-fake.ts` güncellendi. | final-g1-fixes (birim + çıkış yapmış oda + tek başına iptal oda); group-panel testleri mevcut akışla geçer |
| B2 | `guests-service` `nightRows` slot='night'; ayrıca `reports.ts` `lastNightly` son gece satırı olan konaklamadan (saatlik en yeni olunca null oluyordu) | final-g1-fixes |
| B3 | `room-blocks.ts` `nextSold` slot='night' | final-g1-fixes |
| B4 | `noShow` bedel yazımında `assertDayWritable` | final-g1-fixes (kilitli gün) |
| B5 | `merge`: `reservation_groups.leader_guest_id` taşınır (moved.groupLeaders); `resolveGuest` birleşmiş kartı kalan karta yönlendirir | final-g1-fixes; guests-service ve reservation-groups testleri güncellendi |
| B6 | `totalSpent`: iptalde net paidMinor > 0 sayılır | final-g1-fixes |
| B7 | DOKUNULMADI: grid satır görünümünde (GridStayView) KBS boşluğu bilgisi yok; istemcide tespit için yeni sözleşme alanı/sorgu gerekir, hizmet de KBS boşluğunu reddetmez. Ayrı karar/paket. | - |
| B8 | `payments-service.insertPayment`: cancelled/no_show rezervasyonda `payment` yalnız açık borç kadar, fazlası `errors.reservationClosed` | final-g1-fixes |
| B9 | `stay-dialogs.tsx`: `clockOf(new Date())` | (bileşen testi eklenmedi; mevcut calendar testleri geçti) |

Değişen: src/shared/domain/{payment-allocation,reports}.ts, src/shared/contract/groups.ts, src/main/services/{reservations,guests,payments}-service.ts, room-blocks.ts, src/renderer/features/calendar/{group-panel.tsx,stay-dialogs.tsx,booking-fake.ts}; testler: final-g1-fixes.test.ts (yeni), guests-service.test.ts, reservation-groups.test.ts. Migrasyon ve yeni i18n anahtarı yok.
Koşulan: typecheck temiz, lint temiz; vitest final-g1-fixes (9), src/shared/domain (tümü), src/renderer/features/calendar, group-pay, reservation-groups, guests-service, booking-fixes, hourly-stays, housekeeping: geçti. Tam suite koşulmadı. Commit yok.
