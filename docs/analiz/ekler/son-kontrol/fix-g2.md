# S2-G2 düzeltme raporu (para + rapor)

| # | Bulgu | Düzeltme | Test |
|---|---|---|---|
| 1 | Gece raporu giderleri maaşı sızdırıyor | `nightReport` gider okumasına `staffMoneyFilter(ctx)` (fees-service.ts); mevcut "yalnız açık bölümler" kısıtı korundu | fees-ledger-fixes: gece raporu |
| 2 | Geç çıkış / voidFee / depozito al-çöz kapalı güne gerekçe iletmiyor | Şemalara `dayClosedReason` (voidFee'de `reason` kullanılır), `assertDayWritable`'a iletilir, audit reason'a yazılır; fees-panel'de dört diyalogda `ClosedDayReason` alanı (sunucu `errors.dayClosed` deyince açılır) | kapalı gün testi |
| 3 | "Gelire çevir" geri alınamıyor | `settleDeposit` yeni `undoConvert`: hasar kalemi + bağlı ödeme iptal (`payments.voidIn`), depozito `held`, audit; `payments.void`+`extras` yetkisi; panelde "Geri al" düğmesi | geri alma (2 test) |
| 4 | Defterde iptal rezervasyon seçilemiyor / oda no boş | `searchReservations` iptal süzgeci kalktı (durum zaten dönüyor); `roomNumbersOf` ve arama satırı iptal konaklamaları yalnız canlı yoksa alır | defter iptal testi |
| 5 | Düzenlemede kapalı gün gerekçe alanı yok | payment-dialog / expense-dialog: sunucu `errors.dayClosed` dönünce alan açılır (`closedHit`) | bileşen testleri yeşil; yeni test yok (sunucu yolu g2-b ile doğrulanmıştı) |
| 6 | Gelecek gün kapatılabiliyor | `closeDay` `errors.dayInFuture` | gün kapatma testi |
| 9 | Gider tarihi sınırsız | create/update: bugün+366 gün üstü `errors.dateTooFar` (2099 yazım hatası) | gider tarihi testi |
| 8 | Süzgeç ALOS/export'a uygulanmıyor | `stayLengths`/`repeatGuests` stayKind alır (hourly: ALOS boş); export şemasına `stayKind`; süzgeç durumu sayfaya taşındı, dışa aktarma aynı süzgeci gönderir | rapor testleri |
| 7 | Turizm anahtar çakışması | `plannedDepartures` aynı anahtarda en geç çıkışı tutar (gecelik kazanır). Davranış olarak yeniden üretemedim (test eski kodda da geçti); savunmacı düzeltme + regresyon testi | turizm testi |
| 10 | Elle kur akla yatkınlık | DOKUNMADIM: ürün kararı (bilinen son kur yokken/offline elle kur meşru; engelleme G-01'i bozar). İsterseniz yalnız uyarı sonra eklenebilir. | - |

Not: gece raporu "kısmi" etiketi eklenmedi (rapor zaten sahip bölümlerini sessizce dışlıyordu). Migrasyon yok.

i18n (spec `i18n-spec/fix-g2.json`, 7 anahtar): feesPanel.undo/undoTitle/undoBody/undoneToast, errors.depositNotConverted/dayInFuture/dateTooFar.

Değişen dosyalar: src/main/services/{fees,payments,ledger,expenses,tourism-stats}-service.ts, reports/{queries,reports-service}.ts; src/shared/contract/fees.ts, procedures/reports.ts; renderer: calendar/fees-panel.tsx, ledger/{payment,expense}-dialog.tsx, reports/{occupancy-tab,reports-page}.tsx; i18n tr/en/ru.json; yeni test src/main/services/fees-ledger-fixes.test.ts (10 test).

Koşulan: `npm run typecheck`, eslint (ilgili dizinler), `node scripts/i18n-check.mjs`, vitest 43 dosya / 468 test (fees, ledger*, expenses, payments, reports, tourism, permissions-fees/reports/ledger, renderer reports/ledger/calendar) hepsi geçti. Tam test/e2e koşulmadı; commit yok.
