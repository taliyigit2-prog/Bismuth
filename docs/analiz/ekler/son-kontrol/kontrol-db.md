# Son dalgası — veritabanı incelemesi (db-reviewer)
Kritik/Yüksek yok; migrasyon değişmedi; para/tarih/silme/audit/transaction/dizin ✓.
- Orta: `fees-service.ts:319-334` undoConvert ödemeyi sezgiyle buluyor; bulunamazsa sessiz. Öneri: bulunamazsa hata; kesin bağ için ileride eklemeli sütun.
- Düşük: `camera-faces.ts:282-286` purgeExpired guest_id=NULL güncellemesi audit yazmıyor.
- Düşük: `rooms-service.ts:76-85` lower(number) dizin kullanamaz (19 oda, sorun yok).
- Düşük: `reservations-service.ts:2241` groupPay sabit 'confirmed' durum veriyor (kırılgan).
- Düşük: `payments-service.ts` assertExpenseDateNear adı yanıltıcı.
- Düşük: `laundry-service.ts:548` business_day.close gerekçesi yorumsuz.
