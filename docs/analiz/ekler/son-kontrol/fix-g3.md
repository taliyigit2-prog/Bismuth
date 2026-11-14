# G3 düzeltmeleri

| # | Bulgu -> düzeltme | Test (src/main/services/g3-fixes.test.ts) |
|---|---|---|
| 1 | "Her N konaklamada": yalnız N değişince `cancelUpcoming` çağrılmaz (`updateTemplate`); `onCheckout` ve `stayCounters` döngüleri `template_changed` ile iptal edileni "kapanmış" saymaz | N 2->3: açık görev ve sayaç (2) kalır |
| 2 | `markRoomDirtyAfterCheckout` -> `openDeferredBlocks`: çıkışta kapatıcı durum (bakım/arıza) ya da açık `blocksRoom` arızası için blok yoksa `openAutoBlock` (G1'in `slot='night'` süzgeci korundu) | dolu oda bakım+arıza: çıkıştan sonra blok var, yeniden satış reddedilir |
| 3 | `camera.todayNotice` (yetki `camera:view`, serviste) + `today.summary.camera {newAlerts, problem}` (yetkisizde null) + Bugün uyarı kartı (`CameraAlert`, Kamera sekmesine bağlantı; 3 dil, çoğul). Yeni tablo yok: `camera_events.state='new'` + son 24 sa okunmamış `camera_problem` bildirimi | owner görür; temizlik rolü null |
| 4 | `endDate>=startDate` (zod + `updateEmployee` birleşik değerle); `addLeave`/`recordWork` istihdam dışı gün reddi (`errors.notEmployedOn`); personel paneli bu ay işten çıkanı gösterir (maaş tablosu zaten gösteriyordu) | 4 test |
| 5a | Görev tiki (`markDone`) ilgili ayın turizm tablosunu "bildirildi" yapar, `undoDone` geri alır (`syncTourismMark`); Bugün hatırlatması tamamlanmış görevi de "bildirildi" sayar (tablo yoksa da tek uyarı) | tik -> hatırlatma kalkar, geri al -> işaret kalkar |
| 5b | `maxLength` (sözleşme sabitlerinden `limitsOf/maxLengthOf`): kayıp eşya (tüm alanlar, iade, neden), görev iptal nedeni, çamaşır ve tedarik iptal nedeni. Görev başlığı, alım açıklaması, yeni kategori zaten sınırlıydı | mevcut UI testleri geçti |
| 6 | İzin devri: panel `leaveLeft` devri katar. Ad tekrarı reddi (`assertNameFree`): kategori, ürün, çamaşır türü, etiket, vardiya. Avans dönemi istihdam dışıysa ret (`errors.notEmployedInPeriod`). Kapanmış çamaşır ayına gelen fiş ekleme/iptal reddi (`errors.laundryMonthSettled`) | ilgili 4 test |

Anahtarlar: `i18n-spec/fix-g3.json` (7 anahtar, i18n:check temiz).
Değişen: tasks-service, rooms-service, camera-service, staff-service, laundry/supply/status-tags/shift-service, api/handlers/today.ts, contract today.ts + staff.ts, today-page.tsx, lost-item-dialogs, cancel-task-dialog, laundry-dialogs, purchases-list, i18n json, yeni g3-fixes.test.ts; supply-laundry.test.ts ('Kahvaltı' ve 'Masa örtüsü' tohumla çakıştığı için adlar değişti).
Not: prettier yanlışlıkla guests-service.test.ts ve reservation-groups.test.ts'i biçimlendirdi (yalnız format, geri alma izni verilmedi).
Koşulan: typecheck, lint, i18n:check temiz; vitest: g3-fixes (11), tasks*, staff*, shift, housekeeping, supply-laundry*, contacts-lost-items, permissions-today, renderer today/lost-items/tasks/laundry/supply geçti.

## Bırakılan
- Avans tutarı maaşı aşıyor uyarısı: eşik ürün kararı (ayar gerekir).
- Kategori+ürün tek işlemde (ürün formu ayrı çağrı): arayüz/sözleşme değişikliği gerekir.
- #10 küçük doğrulamalar (teslim tarihi >= bulunma, fiş tarihi üst sınır, negatif stok, çözülmüş arıza update, vardiya başlangıç=bitiş): düşük değer, ürün kararı içeriyor.
- #12 gece vardiyası iş günü: tasarım gereği takvim günü.
- Çamaşır: kapanmış ayda fiş artık reddediliyor; düzeltmek için yeniden mutabakat yolu yok (ürün kararı: ayı yeniden açma).
- Telefon düzeni ve Kamera kartı tarayıcıda görülmedi.
