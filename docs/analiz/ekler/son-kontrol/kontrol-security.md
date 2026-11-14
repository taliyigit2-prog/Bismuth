# Son dalgası — güvenlik incelemesi (security-reviewer)
Kritik/Yüksek yok; 2 Orta, 8 Düşük.
- Orta: xlsx içe aktarma zip bombası / sınırsız rowCount×columnCount (`data-transfer/table-reader.ts:117-138`). Öneri: açılmış boyut ≤50 MB, satır ≤5000, sütun ≤100.
- Orta: `client-app.ts:251-258` `mayChangeHotels` hata durumunda açık (fail-open). Öneri: oturum varken 200/203 dışını reddet.
- Düşük: `BISMUTH_DRIVE_HOME` paketli sürümde de geçerli (`backup/drive.ts:60`) → paketlide yok say.
- Düşük: `BISMUTH_USER_DATA` paketli sürümde geçerli (`app/paths.ts:7`).
- Düşük: `camera/redact.ts` çıplak Telegram belirteci ve tek başına parola maskelenmiyor → bilinen gizli değerleri birebir maskele.
- Düşük: safeStorage yoksa cihaz çerezi düz metin (`connection-config.ts`).
- Düşük: `remote.openInBrowser` adres sınırı yok.
- Düşük: `replica/store.ts:145` `removeCopy` kodu yeniden doğrulamıyor → şema + yol öneki denetimi.
- Düşük: `laundry-service.ts:562` gider yoksa gün kilidi denetlenmiyor.
- Düşük: `camera.probe` yerel ağda port taraması yapılabilir (kabul edilebilir).
