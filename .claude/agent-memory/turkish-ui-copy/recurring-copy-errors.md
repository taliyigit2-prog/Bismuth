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
