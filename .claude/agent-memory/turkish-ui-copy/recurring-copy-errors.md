---
name: recurring-copy-errors
description: Tekrarlayan Bismuth metin hataları (ASCII tire, eylem adı tutarsızlığı, yetkisiz mesajda yönlendirme, ru düğme uyumu, "gelmedi" = no-show çakışması, menü terim kayması, ölü anahtarlar); P17a, P17d, P17b incelemelerinden.
metadata:
  type: feedback
---

Bismuth arayüz metinlerinde tekrar eden hatalar:

- Aynı kavram için iki eylem adı: "Çıkış yap" (calendar.panel.checkOut) yerine "Çıkışa geç" yazılmış (booking.giveup.checkoutConfirm). Eylem adı, panel düğmesiyle aynı olmalı.
- Kısa tire yerine ASCII "-" kullanımı: "giriş-çıkış". Doğrusu "giriş‑çıkış" (U+2011), tüm dosyada böyle.
- Yetkisiz mesajı yalnız "X yetkiniz yok." diye bitiyor; "Otel sahibine ya da müdüre başvurun." eklenmeli.
- ru'da seçenek etiketi ile düğme etiketi farklı ifade ediliyor ("Отложить: ожидает возврата" / "Отложить до возврата").
- Alan etiketi "neden", hata metni "gerekçe" (errors.reasonRequired, ortak anahtar; kapsam geniş, sahip kararı). P17b'de grup iptal diyaloğunda da var: etiket "İptal nedeni", hata "Bir gerekçe yazın."
- en menü adı geçmiş zamanlı: "Gave up and refund"; kılavuzla birlikte değişmeli.

## P17d (commit 960cb09) incelemesinden

- "satın" fiili satıcı ağzında yanlış: "satmak" emri "sat"; doğrusu "satışa çıkarın" (booking.hourly.description).
- Saatlik ürün adı dağınık: satış = "Saatlik satış / Hourly sale / Почасовая продажа" (düğme, sihirbaz, takvim);
  ayarlar başlığı "Saatlik konaklama / Hourly stays / Почасовое проживание" kalmış (settings.hourly.title). Ürün adı "satış".
- Ölü anahtarlar: `reports.occupancy.dayUseIn_*`, `dayUseOut_*`, `dayUseSwitch` (tr/en/ru) hiçbir yerde çağrılmıyor;
  sözleşme yorumu "switch gone" diyor. Ayrıca `reports.dayUseInOccupancy` ayarı hâlâ `shared/contract/settings.ts`'te (136, 263).
- Sahip kararı bekleyen: ru "Почасовое" (rapor süzgeci) ile "Почасовая" (satış) cins farkı; tutarlılık için tek biçim.
- Anahtar silme spec ile yapılamaz (spec yalnız değer yazar); `i18n:add` ile silinemez, elle düzenleme yasak.

**Why:** P17d (commit 960cb09) incelemesi.
**How to apply:** Saatlik/gündüz metinlerinde "satış" ve "konaklama" ayrımını koru; ölü anahtarları rapora ekle.

## P17b (grup rezervasyonu) ve P18c (pencere/yakınlaştırma) incelemesinden

- "gelmedi" tek başına no-show demek (sözlük: Gelmedi = No-show). booking.group.panel.notDue "Giriş günü gelmedi" gelecek
  tarihli oda için yazılmış; düzeltme "Giriş günü henüz değil" (en/ru zaten doğru).
- Menü terimi kayması: menü "Büyüt/Küçült" (main.menu.zoomIn/zoomOut) ile ayar ve kısayol metinleri "Yakınlaştır(ma)" diyor.
  Düzeltme: "Yakınlaştır" / "Uzaklaştır". Sıfırlama: menü "Gerçek boyut", kısayol "Yakınlaştırmayı sıfırla" (en "Actual size" / "Reset zoom",
  ru "Фактический размер" / "Сбросить масштаб") — aynı işlem iki adla; sahip kararı.
- Ölü anahtarlar (kod aramasında çağrı yok): booking.group.panel.charges, booking.group.panel.description, booking.group.open (tr/en/ru).
- Kodda elle metin: group-panel.tsx "Bakiye: " ile iki nokta ve " · ", " – " ayraçları gömülü (G-08); anahtar ile birleştirilmeli.
- Dosya adı kaymaları: rapor isteğinde "new-group-dialog.tsx" ve "p17b-copy.json" geçti; gerçek grup formu
  new-reservation-dialog.tsx içinde. Spec yolu `.tmp/turkish-ui-copy/i18n-spec/` altında.
- Kabul edilen terimler: "Toplu giriş / Toplu çıkış / Toplu not", "Grubu iptal et" (düğme) + "Vazgeç" (diyalog),
  "Grup lideri", "Tek hesap" / "Oda başına hesap", "Grup: {{name}}" rozeti, rooms_one/few/many/other (ru) tam.

## Dalga 4 (P17c/P17e: sağ tık, hızlı çubuk, seçim çubuğu, grup ödeme, form sayacı) incelemesinden

- Ru çoğul hatası: sayılı isim taşıyan düz anahtarlar (`bulk.checkInDone`, `checkOutDone`, `noteDone`, `payDone`,
  `attachDone`, `today.inHouse`, `bulk.noteBody`, `attachBody*`) ru'da `_one/_few/_many/_other` olmadan yazılmış.
  "номеров" / "бронирований" sayıya göre değişmez. Kalıp: sayı + isim (`{{count}} номер заселён`) ile çoğul dört biçim.
- Hardcoded sayı metinde: `calendar.quick.errors.nights` ("1 ile 400") ve `…people` (50) — `{{max}}` ile değişken
  verilmeli (`MAX_STAY_NIGHTS`). Kod tarafı `t(key, {max})` ister.
- Eylem adı sapması: menü `noShow` "Gelmedi" (işlem değil durum). Düzeltme "Gelmedi olarak işaretle" / "Mark as no-show" /
  "Отметить неявку". ru menü öğeleri emir kipinde (Заселить, Выселить); "Неявка" bunu bozar.
- Aynı işlem iki adla: `calendar.quick.detail` "Ayrıntı" (düğme) vs menü `quick.menu.detail` "Ayrıntılı rezervasyon"
  (ru "Подробнее" / "Подробная бронь"). Düğme menü adına göre eşitlendi.
- Düğmede sayı birleştirme: selection-bar.tsx `{t('…checkIn')} ({n})` (G-08 + "parça birleştirme" yasağı). Anahtar `checkInCount` gerekir.
- Hata birleştirme: `t('bulk.partial') + ' ' + bookingErrorText(...)` üç yerde (selection-bar.tsx 92, 245, 350).
- Ayrıntı (kullanıcı kabul): "Vazgeçme ve iade" menü adı kabul (plan terimi) ama "Vazgeç" diyalog kapatma olduğu için
  başka anlamda kullanılmamalı; sahip kararı.
- `form.limitReached` ve `form.tooLong` tr/en/ru'da aynı metin (ru'da kelime farkı); tek anahtar kalmalı, kod tarafı sahip kararı.
- Kabul edilen: "Grup ödemesi al" (grup) / "Toplu ödeme" (seçim) ayrımı; "Gruba bağla" hem tetikleyici hem kayıt düğmesi;
  "Bugün gelecekler / Gidecekler" (tr departures için "Bugün" eklendi); "Giriş yap"/"Çıkış yap" eylem adları.

**Why:** P17c/P17e (dalga 4) incelemesi; spec `.tmp/turkish-ui-copy/i18n-spec/wave4-copy-fix.json`.
**How to apply:** ru'da her sayılı metin için dört biçim; eylem adı emir kipi; düğme ve menü aynı kelime.

**Why:** P17b ve P18c incelemesi.
**How to apply:** Grup ve pencere metinlerinde "gelmedi" yalnız no-show için; menü terimleri ayar ve kısayol ile aynı kelimeyi kullansın.

## Dalga 6 (kurtarma kodları, Drive klasörü, yedek kılavuzu) incelemesinden

- Kılavuz kutu etiketi kayması: kılavuz eski etiketi yazmış ("Kodları sakladım" / "I have saved the codes" / "Коды сохранены"),
  arayüz `setup.recovery.written` ile "Kâğıda yazdım" / "I have written it down" / "Записано на бумаге" diyor. Kılavuz düğme ya da
  kutu adı değiştiğinde üç dilde birlikte güncellenmeli. `docs/kullanim-kilavuzu.md:68` ve `docs/kurulum-rehberi-basit.md:37` aynı eski etiketi taşıyor (kapsam dışı, sahip kararı).
- Sözlük kayması kılavuzda: "satışa kapalı odalar" yerine "satılmaz odalar" (Satılmaz, G-38).
- ru "загрузки" (indirme anlamı) içe aktarma için kullanılmış; içe aktarma = "Импорт данных" / "записи импорта".
- Kılavuz içinde "Kılavuz" ve "Rehber" ayrı terimler: "Rehber" telefon rehberi ekranı, doğru; "Kılavuz" yardım bölümü.
- ru "блок" (kart/bölüm) iki bilgi için kullanılıyor (`setup.recovery.body`, 21-installation); "пункт" daha net. Sahip kararı.
- Tırnak tutarsızlığı: tr'de bazı anahtarlar düz `"` / `'`, bazıları `“”` / `’`. Yeni anahtarlarda `“”` ve `’` tercih edilir.

**Why:** Dalga 6 kılavuz+bileşen incelemesi; düğme adları kılavuz ve arayüz arasında kayarsa okuyucu kutuyu bulamıyor.
**How to apply:** Kılavuzda bir düğme ya da kutu adı geçtiğinde ilgili anahtarla (`t` değeri) karşılaştır; ru/en kılavuzları aynı adı taşısın.
Ajan notu: bu oturumda `.tmp/` altına rapor dosyası yazma isteği araç tarafından reddedildi; bulgular yanıt metninde döndü.

## Dalga 8 (P20b kamera ekranı, Ayarlar > Kamera, alarm listesi) incelemesinden

- Düz (plural'sız) sayılı anahtar: `camera.crashedBody` ("{{count}} раз") ru'da 2 için "2 раз" üretir. Düzeltme ru değerinde
  sayıyı isme bağlamadan yapıldı ("всего остановок: {{count}}"). Kalıcı çözüm `_one/_few/_many/_other` (anahtar değişikliği,
  yeni anahtar yasağı nedeniyle bekliyor).
- Düğme ilk tekil şahıs: `camera.alerts.markSeen` "Gördüm", `markHandled` "Hallettim" (tr); ru "Просмотрено"/"Решено"
  (durum sözcüğü, emir kipi değil). Emir kipi önerisi: "Görüldü olarak işaretle" / "Halledildi olarak işaretle" /
  "Отметить как просмотренную" / "Отметить как решённую". Test bağımlılığı: camera-page.test.tsx:90 bu metinleri bekliyor.
- Teknik sözcük: "kare" (video karesi) ayar etiketlerinde (`settings.camera.field.*`); tr'de "görüntü" ile değiştirildi.
  Diğer dillerde kare karşılığı ayrı kontrol edilmeli.
- Sayı biçimi: `numberInvalid` ({{min}}/{{max}}) ondalıkları "0.1" olarak gösteriyor; tr'de "0,1" olmalı → kod tarafında
  format.ts (`settings/camera-section.tsx:117`).
- Kabul edilen: "kayıtsız kişi" (unregistered), "tanıma eşiği", "canlı görüntü", "Yeniden başlat" (düğme) + "Ayarlar'da
  Kamera bölümü"; "Telegram'a gönder" ifadeleri; ru "Система камер" (koleksiyon, kabul).

## Dalga 12 (portföy, ücretler/gece raporu, bağlan ekranı) incelemesinden

- Oda durumu terimi: gece raporu "Hizmet dışı" (tr) / "Out of service" / "Не в продаже" (ru) oda durumu sözlüğüyle (Kullanım dışı /
  Out of order / Вне эксплуатации) çakışıyordu; ayrıca sayı hem bakımı hem kullanım dışını sayar. Düzeltildi:
  "Bakımda / kullanım dışı" (tr), "Maintenance / out of order" (en), "На обслуживании / вне эксплуатации" (ru).
- Ru sayı + isim kalıbı: düz `portfolio.kpi.tonightHint` ("{{count}}/{{rooms}} номеров") yanlış çekim üretir. Yeni anahtar
  yasağı varken çözüm isim içermeyen biçim: "Занято: {{count}} из {{rooms}}". tr "3/4 oda" test bağımlıdır, tr değişmedi.
- "Sayfa" yasağı: `feesPanel.error` "Sayfayı yenileyin" (tr) / "Обновите страницу" (ru) → "Ekranı" / "экран".
- Menü adı ile sayfa başlığı kayması: ru menü "Мои отели", başlık "Портфель отелей"; tr/en menü ve başlık aynı. Menü "Портфель".
- Yardım cümlesinde "yazar" (yazılı görünür anlamında) → "görünür" (`connect.addressHelp`).
- Türkçe kopya ru/en'e sızmış: en `reports.night.rooms.total` "Rooms" → "Total rooms" (tr "Toplam oda").
- Açık (test bağımlı, değiştirilmedi): tr `connect.hotels.removeTitle` "Listeden kaldırılsın mı: {{name}}?" → kamera ile aynı
  "{{name}} listeden kaldırılsın mı?" kalıbı. connect-page.test.tsx:303 bu metni bekliyor; öneri test ile birlikte.
- Kabul edilen: "Gelenler / Gidenler / Kalanlar / Gelmeyenler" (gece raporu liste başlıkları; `reports.night.*`); "Kâr";
  "Yedek kopya" = salt okunur kopya (sözlükle uyumlu); "Kullanımda" (aktif otel); "Gelmeme bedeli" (no-show ücreti).
- Açık sahip kararı: `feesPanel.voidReason` "İptal nedeni" vs `errors.reasonRequired` "Bir gerekçe yazın." (bilinen neden/gerekçe ayrımı).

**Why:** Dalga 12 json incelemesi ve düzeltmeleri; yeni anahtar eklenmedi.
**How to apply:** Oda durumu adları room-status sözlüğüyle aynı olmalı; ru'da sayıyla birlikte isim kullanılmıyorsa isimsiz biçim tercih et.

## Son dalga (kbs, elle kur, gün/ay yeniden açma, depozito geri alma) incelemesinden

- "Gelmedi" yine tarih için kullanıldı (`pay.futureDay`): "henüz gelmedi" yerine "henüz başlamadı".
- Alan etiketi "Neden" (`close.reopenBody`) ile "Gerekçe" karışıyor; gerekçe kalıbı tek.
- Birinci tekil geçmiş düğmeler ("KBS'ye bildirdim", `occupants.markIn`) yine var; işaret ya da emir kipi.
- KBS terim kayması: "bilgisi" / "bildirimi" / "bildirilmedi" aynı kavram için; önerilen "KBS bildirimi eksik".
- Rozet biçimi: "{{count}} KBS eksik" tek kalıp (`gapBadge`); `kbs.badge` ayrı.
- Toast noktası: "yeniden açıldı." noktalı; toast'lar noktasız.

**Why:** Son dalga metin incelemesi (kbs/elle kur/depozito); bulgular `.tmp/son/copy.md`.
**How to apply:** Yeni kbs/gün-ay yeniden açma metinlerinde yukarıdaki kalıpları ilk taramada kontrol et. Kabul: "Elle kur", "Kur ... (internet yoksa)", "Hasar nedir?" yerine "Hasar açıklaması".
