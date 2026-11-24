---
name: tr-copy-guide
description: >-
  Bismuth arayüz metni rehberi — otel terimleri sözlüğü (TR/EN/RU), ton ve "siz" hitabı,
  cümle düzeni, düğme fiilleri, hata/onay/boş durum kalıpları, tarih ve para biçimleri,
  değişkenli metinde Türkçe ekler, Rusça çoğul ekleri. Kullanıcıya görünen metin yazarken,
  i18n anahtarı eklerken ya da çeviri gözden geçirirken kullanın.
---

# Bismuth Metin Rehberi

Kullanıcı: 19 odalı bir İstanbul otelinde resepsiyon, müdür, temizlik ve sahip. Bilgisayarı iyi bilmeyen biri de ilk bakışta
anlamalı. Kaynak dil Türkçe (`src/renderer/i18n/tr.json`); `en.json` ve `ru.json` aynı anahtarlar, **çeviri** (kopya değil).
Tekrarlayan metin hataları ve alınan kararlar için [recurring-copy-errors.md](./references/recurring-copy-errors.md) dosyasına da bak.

## 1. Ton

- **Sade, kısa, etken.** Teknik terim yok: "veritabanı", "senkron", "sunucu hatası 500", "null", "ID", "IPC" yerine
  "kayıt", "bağlantı", "ana bilgisayar", "bir sorun oluştu".
- **"Siz" hitabı**: "Bu işlem için yetkiniz yok." (sen değil). Rusça "вы" (cümle içinde küçük harf), İngilizce nötr.
- Suçlama ve ünlem yok: "Yanlış girdiniz!" değil, "Tarih biçimi 15.03.2026 gibi olmalı."
- Bismuth'un yapmadığı işi ima etme: "Fatura kes / e-Fatura gönder" yok (G-06) — "Fatura bilgileri", "Bilgileri kopyala" var.
  Booking, Airbnb vb. yalnızca **satış kanalı** adıdır; "Booking'e gönder", "kanalı eşitle" gibi metin yok (G-05).

## 2. Yazım

- **Cümle düzeni** (sentence case): yalnızca ilk harf büyük — "Yeni rezervasyon", "Ödeme ekle" (EN "New reservation", RU
  "Новое бронирование"). Özel adlar ve kısaltmalar hariç (KBS, Booking, IBAN).
- Düğme, etiket, başlık, sekme, menü öğesinde **nokta yok**; tam cümle olan açıklama ve hata metninde nokta var.
- Türkçe büyük/küçük harf: İ/i ve I/ı ayrı harflerdir. Kodda `toLocaleUpperCase('tr')`; CSS `uppercase` yalnızca `lang="tr"`
  doğruysa — en iyisi büyük harfe çevirmemek.
- Sayıdan sonra Türkçe ad tekil kalır: "3 gece", "2 misafir" ("3 geceler" değil).

## 3. Düğmeler ve eylemler

- Emir kipinde fiil, gerekirse nesneyle: "Kaydet", "Ödeme ekle", "Rezervasyonu iptal et", "Odaya yerleştir", "Teslim al".
  En fazla 3 sözcük.
- **Vazgeç** = diyaloğu kapatır, hiçbir şey yapmaz. **İptal et** = kaydın kendisini iptal eder. İkisini karıştırma.
- "Tamam" yalnızca bilgi kutusunda. "Evet/Hayır" yerine eylemi adlandır: "Sil" değil "Rezervasyonu iptal et" + "Vazgeç".

## 4. Kalıplar

- **Hata = ne oldu + ne yapmalı**:
  - ✓ "Oda 302 bu tarihlerde dolu. Başka bir oda ya da tarih seçin."
  - ✓ "Ana bilgisayara ulaşılamadı. Bilgiler 14:32'deki kopyadan gösteriliyor; bağlantı gelince kendiliğinden yenilenir."
  - ✗ "Hata: SQLITE_CONSTRAINT", ✗ "Bir hata oluştu." (ne yapılacağı yok)
- **Onay diyaloğu**: başlık soru ("Rezervasyon iptal edilsin mi?"), gövde sonucu söyler ("Geceler boşalır, ödemeler kayıtta
  kalır."), düğmeler eylem + "Vazgeç".
- **Boş durum**: ne yok + nasıl başlanır ("Henüz gider yok. İlk gideri eklemek için "Gider ekle"ye basın.").
- **Bildirim (toast)**: geçmiş zaman, kısa: "Ödeme kaydedildi", "Oda temiz olarak işaretlendi".
- **Yetkisiz**: "Bu bölümü görme yetkiniz yok. Gerekirse otel sahibine başvurun."

## 5. Biçimler (her zaman `src/shared/format.ts`; elle birleştirme yok)

`Intl` çıktısı, `numberingSystem: 'latn'` ile (Node 22 ICU'da doğrulandı):

| Ne                                       | tr-TR          | en-GB           | ru-RU              |
| ---------------------------------------- | -------------- | --------------- | ------------------ |
| Para, kuruş gizli (`ui.showMinor=false`) | `₺2.500`       | `₺2,500`        | `2 500 ₺`          |
| Para, kuruş görünür                      | `₺2.500,50`    | `₺2,500.50`     | `2 500,50 ₺`       |
| Uzun tarih                               | `15 Mart 2026` | `15 March 2026` | `15 марта 2026 г.` |
| Kısa tarih                               | `15.03.2026`   | `15/03/2026`    | `15.03.2026`       |
| Saat (24 saat)                           | `14:30`        | `14:30`         | `14:30`            |
| Yüzde                                    | `%73,7`        | `73.7%`         | `73,7 %`           |

- ₺ simgesi en-GB ve ru-RU'da yalnızca `currencyDisplay: 'narrowSymbol'` ile çıkar (yoksa `TRY 2,500.50` / `2 500,50 TRY`).
- Rusçada binlik ayıracı bölünmez boşluktur (U+00A0); testte ` ` kullan.
- Sembolün yerini Intl belirler: metne `2.500,50 ₺` gibi elle para yazma; örnek metinlerde de `format.ts` çıktısıyla aynı biçim.
- Tutar `<bdi>` içinde; telefon, IBAN, oda no, tutar girişleri `dir="ltr"`.

## 6. Değişkenli metin ve Türkçe ekler

- Değişkene ek bağlama: `{{name}}'in rezervasyonu` ✗ (ünlü uyumu ada göre değişir: Ali'nin, Ayşe'nin, Oğuz'un).
  Yeniden kur: "Misafir: {{name}}", "{{name}} adına rezervasyon", "{{room}} numaralı oda", "Oda {{room}}".
- Cümleyi parçalardan birleştirme (`t('a') + name + t('b')`) yok; tüm cümle tek anahtar, değişkenler `{{...}}` — Rusçada sözcük
  sırası farklıdır.

## 7. Çoğul ekleri (i18next, `Intl.PluralRules`)

- Türkçe ve İngilizce: `_one`, `_other`. Türkçede ikisi çoğu zaman aynıdır: `nights_one: "{{count}} gece"`,
  `nights_other: "{{count}} gece"`.
- **Rusça dört biçim** — `_one`, `_few`, `_many`, `_other` (hepsi zorunlu):

| Anahtar  | Sayılar         | ночь     | гость     | номер      |
| -------- | --------------- | -------- | --------- | ---------- |
| `_one`   | 1, 21, 31…      | 1 ночь   | 1 гость   | 1 номер    |
| `_few`   | 2–4, 22–24…     | 2 ночи   | 2 гостя   | 2 номера   |
| `_many`  | 0, 5–20, 25–30… | 5 ночей  | 5 гостей  | 5 номеров  |
| `_other` | kesirli (1,5)   | 1,5 ночи | 1,5 гостя | 1,5 номера |

## 8. Sözlük

| Türkçe                                   | English                               | Русский                                    | Not                                                                         |
| ---------------------------------------- | ------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------- |
| Rezervasyon                              | Reservation                           | Бронирование                               | RU kısa: бронь                                                              |
| Konaklama                                | Stay                                  | Проживание                                 |                                                                             |
| Gece                                     | Night                                 | Ночь                                       | Çıkış günü gece değildir                                                    |
| Giriş / Çıkış                            | Check-in / Check-out                  | Заезд / Выезд                              |                                                                             |
| Ön kayıt / Kesin                         | Tentative / Confirmed                 | Предварительное / Подтверждённое           |                                                                             |
| Giriş yaptı / Çıkış yaptı                | Checked in / Checked out              | Заезд выполнен / Выезд выполнен            |                                                                             |
| Gelmedi                                  | No-show                               | Неявка                                     |                                                                             |
| İptal edildi                             | Cancelled                             | Отменено                                   |                                                                             |
| Park edilmiş                             | Parked                                | Отложено                                   | Odası atanmamış, tablo altında bekleyen rezervasyon (G-39)                  |
| Aynı gün giriş‑çıkış                     | Day use                               | Дневное пребывание                         | "day-use" yazma                                                             |
| Satılmaz                                 | Not for sale                          | Закрыт для продажи                         | Oda bloğu (G-38)                                                            |
| Kapora                                   | Deposit                               | Предоплата                                 |                                                                             |
| Bakiye                                   | Balance due                           | Остаток к оплате                           |                                                                             |
| Ödendi / Ödenmedi / Kısmen ödendi        | Paid / Unpaid / Partly paid           | Оплачено / Не оплачено / Частично оплачено |                                                                             |
| Teslim alındı (x)                        | Received (x)                          | Получено (x)                               | Sahip/Müdür parayı ya da kart/IBAN satırını kontrol edip teslim aldı (G-64) |
| Kasa                                     | Cash drawer                           | Касса                                      |                                                                             |
| Defter                                   | Ledger                                | Журнал                                     | Günlük gelir‑gider defteri                                                  |
| Gelir / Gider                            | Income / Expense                      | Доход / Расход                             |                                                                             |
| Avans / Maaş / Ek mesai / İzin           | Advance / Salary / Overtime / Day off | Аванс / Зарплата / Сверхурочные / Выходной |                                                                             |
| Misafir                                  | Guest                                 | Гость                                      |                                                                             |
| Odadaki kişiler                          | Room occupants                        | Гости в номере                             | Her kişi ayrı satır (G-54)                                                  |
| Otelde kalanlar                          | In-house guests                       | Проживающие                                | Gece vardiyası listesi                                                      |
| Kara liste                               | Blacklist                             | Чёрный список                              |                                                                             |
| KBS'ye bildirildi                        | Reported to KBS                       | Сообщено в KBS                             | "KBS" kısaltması çevrilmez; ipucu: "Kimlik Bildirim Sistemi"                |
| Oda durumu                               | Room status                           | Статус номера                              |                                                                             |
| Temiz / Kirli / Kontrol edildi           | Clean / Dirty / Inspected             | Убран / Требует уборки / Проверен          |                                                                             |
| Bakımda / Kullanım dışı                  | Maintenance / Out of order            | На обслуживании / Вне эксплуатации         |                                                                             |
| Arıza                                    | Issue                                 | Неисправность                              | "Bug" ya da "hata" değil                                                    |
| Görev                                    | Task                                  | Задача                                     |                                                                             |
| Vardiya devri                            | Shift handover                        | Передача смены                             |                                                                             |
| Vardiya notu / Kendime not               | Shift note / Note to self             | Заметка смены / Личная заметка             |                                                                             |
| Kayıp eşya                               | Lost and found                        | Забытые вещи                               |                                                                             |
| Satış kanalı                             | Sales channel                         | Канал продаж                               | Booking, Airbnb… yalnızca etiket                                            |
| Oda tipi / Gecelik fiyat                 | Room type / Nightly rate              | Тип номера / Цена за ночь                  | RU otel odası = номер (комната değil)                                       |
| Firma / Fatura bilgileri                 | Company / Billing details             | Компания / Реквизиты                       | Fatura kesilmez                                                             |
| Döviz kuru                               | Exchange rate                         | Курс валют                                 |                                                                             |
| Hava durumu                              | Weather                               | Погода                                     |                                                                             |
| Yedek                                    | Backup                                | Резервная копия                            | Yedek dosyası                                                               |
| Yedek kopya                              | Read-only copy                        | Копия только для чтения                    | Mac'teki canlı kopya — "yedek" ile karıştırma                               |
| Ana bilgisayar                           | Main computer                         | Основной компьютер                         | "Sunucu/host" deme                                                          |
| Rol / Yetki                              | Role / Permission                     | Роль / Права доступа                       |                                                                             |
| Kilitle                                  | Lock                                  | Заблокировать                              |                                                                             |
| Oturum aç / Oturumu kapat                | Sign in / Sign out                    | Войти / Выйти                              | "Giriş yap" deme — "giriş" otelde check-in demek                            |
| Boş (takvim hücresi) / Geçmiş tarih, boş | Empty / Past date, empty              | Свободно / Прошедшая дата, свободно        | RU nötr cins (hücre)                                                        |
| Otel sahibine haber verin / başvurun     | Tell / Ask the hotel owner            | Сообщите / Обратитесь к владельцу отеля    | Hata ve yetkisiz kalıbı; "yönetici" diye rol yok                            |
| Ekran                                    | Screen                                | Экран                                      | "Sayfa" deme (masaüstü programı)                                            |
| Hızlı arama                              | Quick search                          | Быстрый поиск                              | Ctrl/Cmd+K; "komut menüsü" deme                                             |
| Kuruşları göster                         | Show decimals                         | Показывать дробную часть                   | Çok para birimli; EN/RU'da "cents/копейки" deme                             |

## 9. Yap / Yapma

| Yapma                                        | Yap                                                      |
| -------------------------------------------- | -------------------------------------------------------- |
| "Kayıt Başarıyla Kaydedildi!"                | "Rezervasyon kaydedildi"                                 |
| "Sunucuya bağlanılamadı (ECONNREFUSED)"      | "Ana bilgisayara ulaşılamadı. Bağlantıyı kontrol edin."  |
| "Silmek istediğinize emin misiniz?" + "Evet" | "Gider iptal edilsin mi?" + "Gideri iptal et" / "Vazgeç" |
| "Day-use"                                    | "Aynı gün giriş‑çıkış"                                   |
| "{{name}}'in ödemesi"                        | "Ödeme · {{name}}"                                       |
| "Toplam: 2500 TL" (elle)                     | `t('folio.total', { amount: formatMoney(...) })`         |
| "Fatura oluştur"                             | "Fatura bilgilerini kopyala"                             |
| Düğmede "Kaydet."                            | "Kaydet"                                                 |
