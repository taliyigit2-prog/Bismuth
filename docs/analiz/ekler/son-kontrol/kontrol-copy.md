# Son dalga metin incelemesi (5b9a312..HEAD, src/renderer ve tr/en/ru)

Kapsam: kbs eksik/onay, elle kur uyarısı, ay/gün yeniden açma, oda tipi kapalı, kamera uyarıları, depozito geri alma, oda tipi hataları, giriş gerekli metinleri.
Değişiklik yapılmadı (yalnız okuma). Git diff komutu bu oturumda çalıştırılamadığı için kapsam anahtar adlarıyla tarandı; commit bazlı tam fark doğrulanmadı.

## Bulgular

| Önem | anahtar / dosya:satır | sorun | önerilen metin |
|---|---|---|---|
| Orta | pay.futureDay · tr.json:4291 | "gelmedi" tek başına no-show demek (sözlük; recurring-copy-errors). Burada "henüz gelmedi" tarih için yazılmış. | "Bu gün henüz başlamadı. Ödeme yine de bu güne yazılır." |
| Orta | close.reopenBody · tr.json:4331 | Alan adı "Neden" (gerekçe kalıbıyla çelişiyor: closed.reason, month.reopen.reason "Gerekçe"). | "Gün yeniden değiştirilebilir olur. Gerekçe denetim kaydına yazılır." |
| Orta | close.reopen · tr.json:4329 | "Günü aç" biçimi; aynı işlem ay için "Ayı yeniden aç" (tr.json:4012). | "Günü yeniden aç" |
| Orta | occupants.markIn / markOut · tr.json:2024-2025 | Birinci tekil geçmiş düğme ("KBS'ye bildirdim", "KBS çıkışını yaptım") — "Gördüm/Hallettim" ile aynı kusur. Düğme olduğu doğrulanmadı; işaret ise yine de düz kalıp. | "KBS'ye bildirildi olarak işaretle" / "KBS çıkışı yapıldı olarak işaretle" (en: "Mark as reported to KBS" / "Mark KBS check-out done"; ru: "Отметить: сообщено в KBS" / "Отметить: выезд сообщён в KBS") |
| Düşük-orta | kbsGaps.title · tr.json:422 | Başlık "KBS bilgisi eksik", gövde "KBS bildirimi eksik" — terim kayması. | Başlık: "Bazı odalarda KBS bildirimi eksik" |
| Düşük | kbsUnnamed · tr.json:482 | "Kimse kayıtlı değil" ile tr.json:5459 / 6160 "odada kimse yazılı değil" çakışıyor. | "Kimse yazılı değil" (ru "Никто не записан" uyumlu) |
| Düşük | kbs.badge · tr.json:6158 vs gapBadge · tr.json:5164 | Aynı kavram rozet: "KBS eksik: {{count}}" ile "{{count}} KBS eksik" biçimleri farklı. | İkisi de "{{count}} KBS eksik" (_one/_other kalır) |
| Düşük | deposit.undoBody · tr.json:7694 | "depozito yeniden elde tutulur" doğal değil. | "...; depozito yeniden tutulur." |
| Düşük | deposit.convertReason · tr.json:7687 | Alan etiketi soru biçiminde: "Hasar nedir? (zorunlu)". | "Hasar açıklaması (zorunlu)" |
| Düşük | month.reopen.saved · tr.json:4017 | Toast sonunda nokta; diğer toast'lar noktasız ("Ödeme kaydedildi"). | "{{month}} yeniden açıldı" (en/ru aynı kural) |
| Düşük | undo (kayıt geri alma düğmesi) · tr.json:6218 | Düğme 5 sözcük ("Girişi geri al ve iptal et"); kural en fazla 3 sözcük. Açıklama zaten hint'te. | "Girişi geri al" (hint: "Konaklama hiç olmamış sayılır; ...") |
| Düşük | en.json:1776 undoCheckInKbs; ru.json:1886 | "{{names}} is reported" / "{{names}} сообщён": birden çok isimde fiil uyuşmuyor. | "{{names}} reported to KBS. Confirm to take it back." / "{{names}} — сообщено в KBS..." (çoğul için tek anahtar yerine metin nötr tutulsun) |
| Düşük | en.json:4388 undoBody | "become not received again" doğal değil. | "The rows of the {{when}} handover are no longer received. Nothing is deleted; it stays in the history as undone." |

## Kabul edilenler

- roomTypeInactive (tr 1811 / en 1811 / ru 1921): "Bu oda tipi kapalı. Önce oda tipini etkinleştirin..." — uygun, sözlükle uyumlu.
- kbsGaps.body (tr 423), undoCheckInKbs (tr 1776), kbs.checkin / checkout (tr 6161-6162), kbs.unnamed (tr 6160): "yazın/bildirin" kalıbı ve "siz" hitabı tutarlı.
- nameRequired (tr 669, 1202, 5184) ve priceMissing (tr 1633): "Bir ad yazın (en çok N karakter)." kalıbı tutarlı; oda tipi fiyat hatası "Gecelik fiyatı yazın." uygun.
- manualRate (tr 4280 "Elle kur", 6085 "Kur ... (internet yoksa)") ve badRate "Kur 35,20 gibi bir sayı olmalı." — biçim doğru; iki ekran farklı etiket taşıyor, kabul.
- noRateWarning (tr 4316), ownerNotFromDrawer (tr 4315), undoNoRight (tr 6220), kbs.noId (tr 5189, KVKK dili) — uygun.
- Kamera uyarıları (tr 1788-1796): ne oldu + ne yapmalı kalıbına uygun; "Telegram bilgisi geçersiz" teknik sözcük kabul.
- Depozito başlıkları (tr 7682-7683, 7685-7686) ve "Depozito gelire çevrildi": "depozito" (hasar güvencesi) ile "kapora" (ön ödeme) ayrı kavram; kabul.

## Kod tarafı (G-08)

- Türkçe karakter içeren JSX metni, placeholder, title ve aria-label taraması (src/renderer, *.tsx, test hariç): gömülü metin bulunmadı. Yalnız yorumlar ve test metinleri çıktı. Sınır: ASCII-only Türkçe etiketler (ör. "Oda", "Kaydet") bu taramayla yakalanmaz; toast/diyalog için ayrı kontrol önerilir.

## Anahtar eşitliği

- Yeni anahtarların üç dilde varlığı (markIn/markOut, kbsGaps, roomTypeInactive, manualRate, futureDay, reopenBody, undoBody, undoneToast, undoCheckInKbs, nameRequired, priceMissing, kbsUnnamed) doğrulandı.
- Çoğul ailesi (gapBadge, onlyInProgramTitle, notYet): tr'de _one/_other var. ru'da _one/_few/_many/_other dört biçim tam olarak doğrulanmadı; bu bir sonraki turda ayrıca bakılmalı.
- {{değişken}} adları bu taramada üç dilde eşleşti (names, when, amount, month, from, to, date).

## Açık karar

- ru "Почасовое" / "Почасовая" cins farkı ve "Жилец" / "проживающий" gibi eski tutarsızlıklar bu dalgada değişmedi; sahip kararı.
