# S2-G4 düzeltmeleri

| Bulgu | Düzeltme | Test |
|---|---|---|
| 1 defter geçersiz tarih | `data-import-service.ts`: dolu ama okunamayan tarih -> `badDate`, `current=null` (sonraki boş tarihli satırlar da hata); boş tarih önceki güne devam | data-import-fixes.test.ts |
| 2 connection.json | `connection-config.ts`: `display` alanları `.catch(undefined)`; dosya var ama okunamıyorsa ve `"mode":"client"` içeriyorsa `{mode:'client',hostUrl:null}` (yerel DB açılmaz, bağlantı ekranı) + `.bak` kopya; dosya yoksa/client değilse yerel | link-config.test.ts |
| 3 uzak yordamlar | `client-app.ts`: forgetHost, leaveClient, acceptHostIdentity `mayChangeHotels` kapısından geçer | tests/unit/hotel-list.test.ts |
| 4 dışa aktarma | 7 yeni veri kümesi: damageDeposits (payments), salaryPeriods + payPolicies (staff.salary, snapshot dışarıda), paymentMethods/salesChannels/extraServices (settings.lists), statusTags (settings.colors); 17 i18n anahtarı; CSV `'` öneki telefon/sayı biçimine eklenmez | data-transfer-tables.test.ts, writers.test.ts |
| 5a saat dilimi | `setup-service.ts` finish catch'inde dilim DB'deki değere döner | tests/unit/final-g4-fixes.test.ts |
| 5b withoutSecrets | `repeat`/`confirm` süzülür | aynı dosya |
| 5c updateRoom | olmayan roomTypeId -> notFound; oda no `lower()` ile tekil (create/update, kendi no hariç) | rooms-service.test.ts |
| 5d denetim | payment/charge/folio/damage_deposit -> `payments`, cash_handover -> `ledger` görünür yetkisi yoksa gizli (salary zaten süzülüyordu) | users-audit-backup.test.ts |
| 5e ödeme tarihi | `assertExpenseDateNear` export edildi; payments create/update tarih <= bugün+366 | fees-ledger-fixes.test.ts |

Koşulan: typecheck, eslint + prettier (değişen dosyalar), vitest 9 dosya/76 test + client-mode, permissions-data-import, i18n:check. Commit yok.
Bırakılan: bulgu 8c (pasif tipe oda ekleme), 10 (yalnız yorum/belge), 11a (0,999 yorumu), 12 (ağ zaman aşımı toplamı), 2'de "bozuk dosya" için ayrı hata kutusu yok (bağlantı ekranı kurtarma yolu; `.bak` saklanır). Dışa aktarma ekranında yeni veri kümeleri için ayrı UI değişikliği gerekmedi (typecheck temiz).
