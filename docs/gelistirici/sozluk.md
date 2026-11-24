# Bismuth terim sözlüğü (Türkçe · İngilizce · Rusça)

Bu belge arayüzdeki üç dilin **aynı kavram için aynı sözcüğü** kullanmasını sağlar. Yeni anahtar yazarken, çeviri
gözden geçirirken ve kılavuz (`docs/otel/kullanim-kilavuzu.md`) yazarken buna bakılır; sözlükte olmayan yeni bir kavram
çıkarsa önce buraya satır eklenir.

**Kaynaklar ve öncelik:** Türkçe sütun sahibin kelimeleridir (`docs/plan/akislar.md`, `02-excel-analizi.md`,
`06-kararlar.md` → "Sahip cevapları"); çakışırsa sahibin sözü kazanır. İngilizce ve Rusça sütun
`src/renderer/i18n/en.json` ve `ru.json` içindeki kullanımdan alınmıştır (5 Eki 2026 turunda tutarsızlıklar
düzeltildi; kalanlar en sonda). Üslup kuralları: `.agent/skills/tr-copy-guide`.

**Kısa kurallar:** Türkçe "siz" hitabı; cümle düzeni (yalnız ilk harf büyük); düğme ve etiketlerde nokta yok;
"giriş" otelde **check-in** demektir, bu yüzden oturum için "oturum aç" kullanılır, "giriş yap" kullanılmaz.
Rusça "номер" = otel odası ("комната" denmez). Ana bilgisayar için "sunucu", "host" denmez.

## 1. Rezervasyon ve konaklama

| Türkçe | English | Русский | Açıklama |
|---|---|---|---|
| Rezervasyon | Reservation | Бронирование | Rusça kısa biçim: «бронь» (düğme ve dar yerlerde) |
| Konaklama | Stay | Проживание | Bir rezervasyonun odadaki kalışı |
| Gece | Night | Ночь | Çıkış günü gece değildir |
| Giriş | Check-in | Заезд | Varış günü ve saati |
| Çıkış | Check-out | Выезд | Ayrılış günü ve saati |
| Giriş yap (düğme) | Check in | Заселить | Misafiri odaya yerleştirir |
| Çıkış yap (düğme) | Check out | Выселить | Odayı boşaltır; oda otomatik "Kirli" olur |
| Giriş yaptı | Checked in | Заезд выполнен | Rezervasyon durumu |
| Çıkış yaptı | Checked out | Выезд выполнен | Rezervasyon durumu |
| Ön kayıt | Tentative | Предварительное | Henüz kesinleşmemiş rezervasyon |
| Kesin | Confirmed | Подтверждённое | Kesinleşmiş rezervasyon |
| İptal edildi | Cancelled | Отменено | Kayıt silinmez, iptal olarak kalır |
| Gelmedi | No-show | Неявка | Misafir hiç gelmedi |
| Park edilmiş | Parked | Отложено | Odası yok, tablonun altında bekleyen rezervasyon |
| Park alanı | Parked | Отложенные | Takvimin altındaki park edilmiş rezervasyonlar bölümü |
| Aynı gün giriş‑çıkış | Day use | Дневное пребывание | "Day-use" yazılmaz |
| Gelenler | Arrivals | Заезд | Gün özetinde girişler |
| Gidenler | Departures | Выезд | Gün özetinde çıkışlar |
| Kalanlar | Staying | Проживают | Gün özetinde otelde kalan konaklamalar |
| Misafir | Guest | Гость | |
| Kişi | Guests (people) | Гости | Rezervasyondaki kişi sayısı; EN "Guests" |
| Yetişkin | Adult | Взрослые | |
| Çocuk | Child | Дети | |
| Rezervasyon sahibi | Booker | Основной гость | Rezervasyonu yaptıran kişi |
| Rezervasyon no | Reservation no. | Номер брони | Programın verdiği kod |
| Kanaldaki rezervasyon no | Booking no. in the channel | Номер брони в канале | Satış kanalının kendi numarası |
| Satış kanalı | Sales channel | Канал продаж | Booking, Airbnb… yalnızca etikettir; bağlantı yoktur |
| Doğrudan | Direct | Напрямую | Kanal türü |
| Satış sitesi | Online travel site | Сайт бронирования | Kanal türü |
| Acente | Agency | Агентство | Kanal türü: "Acente / toptancı" |
| Bavul emaneti | Luggage storage | Хранение багажа | Oda dışı ek hizmet (Bounce vb. kanal olarak ayardan gelir) |
| Misafir ara | Find guest | Найти гостя | Takvimde ad, telefon ya da rezervasyon koduyla arama |
| Boş oda bul | Find free rooms | Найти свободные номера | Tarih aralığında boş odaları işaretler |
| Takvime al | Restore to calendar | Вернуть в календарь | Park edilmiş rezervasyonu geri getirir |
| Önerilen fiyat | Suggested price | Рекомендуемая цена | Oda tipinden gelen öneri; değiştirilebilir |

## 2. Oda, takvim ve oda durumu

| Türkçe | English | Русский | Açıklama |
|---|---|---|---|
| Oda | Room | Номер | |
| Oda tipi | Room type | Тип номера | Ayar listesinden gelir |
| Oda numarası | Room number | Номер на двери | Kapıdaki numara; Rusçada "номер" odanın kendisi olduğu için "номер на двери" |
| Kat | Floor | Этаж | |
| Kat planı | Floor plan | План этажей | Odalar kat kat kutular |
| Yatak | Bed | Кровать | Odadaki yatak sayısı |
| Takvim | Calendar | Календарь | Açılış ekranı; oda × gün tablosu |
| Takvim notu | Calendar note | Заметка календаря | Güne bağlı not, etkinlik, özel gün |
| Gecelik fiyat | Nightly rate | Цена за ночь | EN'de "rate" (price değil) |
| Hafta içi fiyatı | Weekday rate | Цена в будни | |
| Hafta sonu fiyatı | Weekend rate | Цена в выходные | |
| Boş | Empty | Свободно | Takvim hücresi |
| Boş (oda) | Vacant | Свободен | Oda kartında |
| Dolu | Occupied | Занят | Oda kartında |
| Uygun | Available | Свободен | Takvimde uygun hücre |
| Vurgulu günler | Highlighted days | Выделенные дни | Takvimde farklı renkli sütunlar (ör. hafta sonu) |
| Satılmaz | Not for sale | Закрыт для продажи | Oda bloğu; oda takvimde kapalı |
| Satışa kapalı | Closed for sale | Закрыт для продажи | "Satılmaz" ile aynı durum |
| Blok | Block | Блок | Oda kapatma kaydı; ayrıntıda "Satış bloğu" (Sales block / Блокировка продаж) |
| Odayı kapat | Close room | Закрыть номер | Satışa kapatır |
| Satışa aç | Open for sale | Открыть для продажи | Kapatmayı kaldırır |
| Kullanım dışı | Out of order | Вне эксплуатации | Oda durumu / blok türü |
| Bakımda | Maintenance | На обслуживании | Oda durumu |
| Oda durumu | Room status | Статус номера | Temizlik ve kullanım durumu |
| Temiz | Clean | Убран | Oda durumu |
| Kirli | Dirty | Требует уборки | Çıkıştan sonra otomatik olur |
| Kontrol edildi | Inspected | Проверен | Oda durumu |
| Temizlendi | Cleaned | Убрано | "Kirli" odayı temiz yapan düğme |
| Derin temizlik | Deep clean | Генеральная уборка | Her N konaklamada bir (ayar) |
| Temizlenecek odalar | Rooms to clean | Номера к уборке | Kirli odalar listesi |
| Özel gün | Special day | Особый день | Takvim notu türü |
| Resmî tatil | Public holiday | Государственный праздник | Takvim notu türü |
| Yarım gün tatil | Half-day holiday | Сокращённый день | Takvim notu türü |
| Bayram | Holiday | Праздник | Dini bayramlar hesapla bulunur, bir gün kayabilir |
| Arife | Eve | Канун | Bayram arifesi |
| Etkinlik | Event | Мероприятие | Takvim notu türü |
| Lejant | Legend | Легенда | Takvimdeki renk açıklama kutusu |
| Durum etiketi | Status tag | Метка статуса | Rezervasyona takılan renkli etiket (grup, VIP…) |

## 3. Para, kasa ve defter

| Türkçe | English | Русский | Açıklama |
|---|---|---|---|
| Ödeme | Payment | Оплата | Rusçada defter ekranında "платёж" da geçer (bkz. §12) |
| Ödeme ekle | Add payment | Добавить оплату | |
| Ödeme yöntemi | Payment method | Способ оплаты | Ayar listesinden gelir |
| Kapora | Deposit | Предоплата | Giriş öncesi alınan ödeme |
| İade | Refund | Возврат | Misafire geri ödeme |
| Bakiye | Balance due | Остаток к оплате | Kalan borç |
| Konaklama hesabı | Stay account | Счёт проживания | Rezervasyonun ücret ve ödeme hesabı (kodda `folio`); "Folyo" yazılmaz |
| Ödendi | Paid | Оплачено | |
| Ödenmedi | Unpaid | Не оплачено | |
| Kısmen ödendi | Partly paid | Частично оплачено | Kapora dahil |
| Nakit | Cash | Наличные | Ödeme grubu |
| Kredi kartı | Card | Карта | Ödeme grubu |
| IBAN (havale) | Bank (IBAN) | Перевод (IBAN) | Ödeme grubu |
| Online ödeme | Online payment | Онлайн-оплата | Ödeme grubu |
| Cari hesap | On account | В счёт | Ödeme grubu: firma hesabına yazılan |
| Kasa | Cash drawer | Касса | Resepsiyon kasası; kısa menüde EN "Cash" |
| Kasa durumu | Cash drawer | Состояние кассы | Kasada olması gereken tutar |
| Teslim al | Receive | Получить | Sahip ya da Müdür parayı alır |
| Teslim alındı (x) | Received (x) | Получено (x) | Excel'deki "x" işareti; ciroyu etkilemez |
| Teslim (kasa) | Handover | Передача | Kasa teslimi: "Передача кассы" (Cash handover) |
| Teslim geçmişi | Handover history | История передач | Geçmiş kasa teslimleri |
| Defter | Ledger | Журнал | Günlük gelir ve gider defteri |
| Defter ve kasa | Ledger and cash | Журнал и касса | Menü adı |
| Gelir | Income | Доход | |
| Gider | Expense | Расход | |
| Ciro | Revenue | Выручка | Raporlarda |
| Kâr | Profit | Прибыль | |
| Net | Net | Итог | Gelir eksi gider |
| Gün notu | Day note | Заметка дня | Defterde günün notu |
| Gün kapatma | Day closing | Закрытие дня | İsteğe bağlı ayar |
| Kapalı gün | Closed day | День закрыт | Yazmak için yetki ve gerekçe ister |
| Gider bölümü | Expense section | Раздел расходов | Ayar listesi; "Sahip giderleri" gizli bölüm olabilir |
| Ek hizmet | Extra service | Доп. услуга | Ayar listesi; oda dışı satış |
| Ek satış | Extra sale | Доп. продажа | Ödeme ekranında oda dışı satış |
| Komisyon | Commission | Комиссия | Satış kanalının payı (personel "Prim" ile karıştırılmaz) |
| İptal et (ödeme, gider) | Void | Аннулировать | Kayıt silinmez; üstü çizili kalır |
| Elle kur | Typed rate | Курс вручную | Kayıt sırasında elle yazılan kur |
| Açıklama sözlüğü | Description list | Словарь описаний | Aynı giderin farklı yazımlarını birleştirir |
| Birim fiyat | Unit price | Цена за единицу | Ürün ve çamaşır satırlarında |

## 4. Döviz ve dış veri

| Türkçe | English | Русский | Açıklama |
|---|---|---|---|
| Döviz | Exchange rates | Курсы валют | Ekran adı |
| Döviz kuru (kur) | Exchange rate | Курс валют | Ödeme dakikasında sabitlenir |
| Piyasa orta kuru | Market mid rate | Средний рыночный курс | İnternetten gelen |
| Otel kuru | Hotel rate | Курс отеля | Otelin sabit kuru |
| Ana para birimi | Base currency | Основная валюта | Toplamlar ve raporlar bu birimle |
| Para birimi | Currency | Валюта | |
| Kabul edilen para birimleri | Accepted currencies | Принимаемые валюты | |
| Çevirici | Converter | Конвертер | Tutar çevirme aracı |
| Kuruşları göster | Show decimals | Показывать дробную часть | EN/RU'da "cents/копейки" denmez |
| Kur kaynakları | Rate sources | Источники курсов | Kur sırayla denenir |
| Hava durumu | Weather | Погода | İsteğe bağlı dış veri |
| İnternetten güncelle | Update online | Обновлять из интернета | `network.enabled` anahtarı |
| Bayram tarihleri denetimi | Holiday date check | Проверка дат праздников | İnternetten doğrulama |

## 5. Personel

| Türkçe | English | Русский | Açıklama |
|---|---|---|---|
| Personel | Staff | Персонал | Menü adı |
| Çalışan | Employee | Сотрудник | |
| Personel kartı | Staff card | Карточка сотрудника | |
| Maaş | Salary | Оклад | Rusçada aylık maaş "оклад"; genel anlamda "зарплата" |
| Avans | Advance | Аванс | Maaştan düşülür |
| Kasadan avans | Advance from the drawer | Аванс из кассы | Ayar |
| İzin günü | Day off | Выходной | Aylık izin hakkından düşer |
| Yıllık izin | Annual leave | Отпуск | Aylık hakkı etkilemez |
| Hastalık | Sick leave | Больничный | |
| Ücretsiz izin | Unpaid leave | За свой счёт | |
| Aylık izin günü | Days off per month | Выходных в месяц | Otel ayarı (ör. 4) |
| İzin parası | Unused day-off pay | За неисп. выходные | Kullanılmayan izin ödenirse |
| Ek mesai | Overtime | Сверхурочные | Ücreti ayara bağlı |
| Mesai | Work time | Рабочее время | Geliş ve çıkış saatleri |
| Bayram mesaisi | Holiday work | Работа в праздник | Bayram katsayısıyla |
| Prim | Bonus | Премия | Personele; kanal "komisyonu" ile karıştırılmaz |
| Kesinti | Deduction | Удержание | Net ödenecekten düşer |
| Net ödenecek | Net due | К выплате | Maaş − avans + izin parası vb. |
| Maaş tablosu | Salary table | Зарплаты | Ay bazında |
| Ayı kilitle | Lock the month | Заблокировать месяц | Maaş ayı değişmez olur |
| Çizelge | Schedule | График | 14 günlük çalışma çizelgesi |
| İşe giriş | Start date | Дата начала | |
| Görev (pozisyon) | Position | Должность | Çalışanın görevi; "Görev" = task ile karıştırılmaz |
| Personel kuralları | Staff rules | Правила для персонала | Otel geneli izin, mesai, prim kuralları (ayar) |

## 6. Vardiya ve günlük iş akışı

| Türkçe | English | Русский | Açıklama |
|---|---|---|---|
| Vardiya | Shift | Смена | Ad ve saatler ayardan gelir |
| Vardiya devri | Shift handover | Передача смены | Gece–gündüz arası not ve otomatik özet |
| Devir notu | Handover note | Заметка для смены | Elle yazılan not |
| Okudum | I've read it | Прочитано | Devri okundu işaretler |
| Okunmamış devir | Unread handover | Непрочитанная передача | Bugün ekranında rozet |
| Kendime not | Notes to self | Заметки для себя | Yalnız yazan görür |
| Pano | Board | Доска | Herkese açık not tahtası; Bugün'de "Notice board" |
| Bugün | Today | Сегодня | Günün özeti ekranı |
| Otelde kalanlar | In-house guests | Проживающие | Gece vardiyası listesi |
| Odadaki kişiler | Room occupants | Гости в номере | Her kişi ayrı satır |
| Gece listesi | Night list | Ночной список | Yazdırılan otelde kalanlar listesi |
| Tanıtıcı not | Identifying note | Примета | "Kızıl saçlı" gibi; gece vardiyası isim sormadan tanısın diye |
| Sürekli not | Standing note | Постоянная заметка | Sahibin sözü "sürekli istek notu"; iki seviye: Bilgi / Önemli |
| Misafir notu | Guest note | Заметка о госте | Takvim hücresi ve panelde sürekli notun görünümü |
| KBS | KBS | KBS | Kimlik Bildirim Sistemi; kısaltma çevrilmez |
| KBS'ye bildirildi | Reported to KBS | Сообщено в KBS | Kişinin KBS girişi işaretlendi |
| KBS çıkışı | KBS check-out | Выезд в KBS | Çıkışın KBS'de yapıldığı işareti |
| KBS eksiği | KBS gap | Не сообщено в KBS | İşaretsiz kişi |
| Görev | Task | Задача | |
| Görev önerisi | Task suggestion | Предлагаемая задача | Ayarlardan açılıp kapanan hazır görev |
| Yasal hatırlatıcı | Legal reminder | Обязательное напоминание | Turizm istatistiği, KBS, periyodik kontrol |
| Geciken | Late | Просрочено | Süresi geçmiş görev |
| Yaklaşan | Upcoming | Предстоящие | |
| Yapıldı | Done | Выполнено | Görev ve bakım için |
| Hatırlatıcı | Reminder | Напоминание | Bakım ekranında tekrarlanan bakım işi; zamanı gelince Görevler'e düşer |
| Şablon | Template | Шаблон | İçe aktarma şablonu |
| Kayıp eşya | Lost and found | Забытые вещи | Menü adı; tek kayıt "Забытая вещь" |
| Saklanıyor | Kept | Хранится | Kayıp eşya durumu |
| Sahibine ver | Return | Вернуть | Kayıp eşyayı teslim eder |
| Elden çıkar | Dispose of | Утилизировать | Kayıp eşya durumu |

## 7. Misafir, firma ve kara liste

| Türkçe | English | Русский | Açıklama |
|---|---|---|---|
| Misafir kartı | Guest card | Карточка гостя | |
| VIP misafir | VIP guest | VIP-гость | Elle işaretlenir |
| Uyruk | Nationality | Гражданство | |
| Kimlik / pasaport no | ID / passport number | Номер удостоверения / паспорта | Saklanır ama KBS verisi depoya girmez |
| Olası çift kayıt | Possible duplicate | Возможный дубль | |
| Birleştir | Merge | Объединить | Eski kart silinmez, "birleştirildi" olur |
| Kara liste | Blacklist | Чёрный список | İstenmeyen misafirler |
| Uyar | Warn | Предупредить | Kara liste ciddiyeti: onay ister |
| Engelle | Block | Запретить | Kara liste ciddiyeti: yalnız Sahip ya da Müdür kaydeder |
| Firma | Company | Компания | Fatura bilgisi tutulan kurum |
| Fatura bilgileri | Billing details | Реквизиты | Bismuth fatura kesmez; bilgi saklanır ve kopyalanır |
| Unvan | Company name | Название | |
| Vergi dairesi | Tax office | Налоговая инспекция | |
| Vergi no | Tax number | Налоговый номер | |
| Yetkili kişi | Contact person | Контактное лицо | |
| Favori | Favourite | Избранное | Firma ve rehber için |

## 8. Arıza, çamaşırhane, tedarik ve rehber

| Türkçe | English | Русский | Açıklama |
|---|---|---|---|
| Arıza | Issue | Неисправность | "Bug" ya da "hata" değil |
| Arıza bildir | Report an issue | Сообщить о неисправности | |
| Önem (arıza) | Severity | Важность | Düşük / Orta / Acil |
| Genel alan | Common area | Общая зона | Odası olmayan yer |
| Çözüldü | Fixed | Устранена | Arıza durumu (bkz. §12) |
| Planlandı | Planned | Запланирована | Arıza durumu |
| Çamaşırhane | Laundry | Прачечная | |
| Temiz fişi | Clean slip | Приём чистого белья | Çamaşırhanenin getirdiği temiz çamaşır kaydı |
| Kirli teslim | Dirty hand-over | Сдача грязного белья | Çamaşırhaneye verilen kirli çamaşır |
| Lekeli | Stained | С пятнами | |
| Eksik | Missing | Не хватает | Giden − gelen farkı |
| Fiş | Slip | Накладная | Teslim fişi |
| Çamaşır türü | Laundry item | Вид белья | Ayar listesi |
| Tedarik | Supplies | Закупки | Menü adı |
| Ürün | Product | Товар | |
| Alım | Purchase | Закупка | Teslim fişi, deftere tek gider satırı |
| Tedarikçi | Supplier | Поставщик | |
| Stok | Stock | Остаток | |
| Zam | Price rise | Подорожание | Son fiyat öncekinden yüksek |
| Rehber | Contacts (phone book) | Контакты (справочник) | Tedarikçi, usta, taksi, acil numaralar (bkz. §12) |
| Kategori | Category | Категория | |

## 9. Rapor, ay sonu ve turizm istatistiği

| Türkçe | English | Русский | Açıklama |
|---|---|---|---|
| Raporlar | Reports | Отчёты | |
| Doluluk | Occupancy | Загрузка | Dolu oda-gece ÷ satılabilir oda-gece |
| Oda-gece | Room-night | Номеро-ночь | Doluluk hesabı birimi |
| Ortalama gecelik fiyat | Average nightly rate | Средняя цена за ночь | Oda geliri ÷ satılan gece |
| Oda başına gelir | Revenue per room | Доход на номер | Oda geliri ÷ satılabilir gece |
| Kâr oranı | Margin | Рентабельность | |
| Ay sonu kontrolü | Month-end check | Проверка конца месяца | Sahibin ay sonu kontrol listesi |
| En çok harcama | Top spending | Больше всего потрачено | Ürün grubu ve açıklamaya göre |
| Turizm istatistiği | Tourism statistics | Туристическая статистика | Bakanlığa aylık bildirim tablosu |
| Toplam giriş | Total arrivals | Всего заездов | Bakanlık panelindeki sütun başlığı |
| Toplam geceleme | Total nights | Всего ночёвок | Aynı gün giriş‑çıkış = 1 geceleme (yalnız bu modülde) |
| EGM Konaklayan Listesi | EGM Konaklayan Listesi | EGM Konaklayan Listesi | KBS'den indirilen Excel; adı çevrilmez |
| Bildirildi | Reported | Подано | Bakanlık panelinde girildi işareti |
| Dışa aktar | Export | Выгрузить | Excel (XLSX) ya da CSV |
| İçe aktar | Import | Загрузить | Eski e‑tabloları programa alır |

## 10. Kullanıcı, rol ve güvenlik

| Türkçe | English | Русский | Açıklama |
|---|---|---|---|
| Kullanıcı | User | Пользователь | |
| Kullanıcı adı | Username | Имя пользователя | EN tek sözcük "Username" |
| Hesap | Account | Учётная запись | Kullanıcı hesabı |
| Şifre | Password | Пароль | |
| PIN | PIN | PIN | 4–8 rakam; hızlı oturum ve kilit açma |
| Kurtarma kodu | Recovery code | Код восстановления | Unutulan şifre için, bir kez kullanılır |
| Oturum aç | Sign in | Войти | "Giriş yap" denmez |
| Oturumu kapat | Sign out | Выйти | |
| Oturum | Session | Сеанс | Açık oturum |
| Kilitle | Lock | Заблокировать | Ekranı kilitler |
| Ekran kilidi | Screen lock | Блокировка экрана | Boşta kalınca otomatik |
| Rol | Role | Роль | Rol listesi ayardır |
| Yetki | Permission | Права (доступа) | Yok / Görür / Düzenler |
| Sahip | Owner | Владелец | Her şeyi görür, değiştirilemez |
| Müdür | Manager | Управляющий | |
| Resepsiyon | Reception | Ресепшн | |
| Muhasebe | Accountant | Бухгалтер | |
| Temizlik | Housekeeping | Уборка | |
| Denetim kaydı | Audit log | Журнал действий | Kim, ne zaman, neyi ekledi/değiştirdi/iptal etti; kayıtlar silinmez |
| Cihaz | Device | Устройство | Uzaktan bağlanan cihaz |
| Bu rolün gözüyle bak | See as this role | Посмотреть глазами роли | Rol önizlemesi |

## 11. Yedek, kurulum ve çok cihazlı çalışma

| Türkçe | English | Русский | Açıklama |
|---|---|---|---|
| Yedek | Backup | Резервная копия | Yedek dosyası |
| Şimdi yedek al | Back up now | Создать копию сейчас | |
| Geri yükle | Restore | Восстановить | Önce bugünkü veri yedeklenir |
| Bismuth anahtarı | Bismuth key | Ключ Bismuth | Drive'a giden yedeklerin şifre anahtarı; kâğıda yazılır |
| Veri klasörü | Data folder | Папка данных | Veritabanı ve ekler burada |
| Ana bilgisayar | Main computer | Основной компьютер | "Sunucu" ya da "host" denmez |
| Tek bilgisayar | Single computer | Один компьютер | Çalışma şekli |
| Başka bir Bismuth'a bağlan | Connect to another Bismuth | Подключиться к другому Bismuth | İstemci modu |
| Uzaktan erişim | Remote access | Удалённый доступ | Ana bilgisayara dışarıdan bağlanma (özel ağ) |
| Kurulum sihirbazı | Setup wizard | Мастер настройки | İlk açılış |
| Yedek kopya | Read-only copy | Копия только для чтения | Mac'teki canlı salt‑okunur kopya; "yedek" ile karıştırılmaz (Faz 13b, arayüze henüz girmedi; EN/RU karşılık öneridir) |
| Kutu | Box (encrypted package) | Шифрованный пакет | Drive'daki şifreli değişiklik paketi (Faz 13b, arayüze henüz girmedi; EN/RU karşılık öneridir, metin yazılırken bu satır güncellenir) |
| Devral | Take over | Принять управление | Ana bilgisayar bozulunca Mac ya da yeni PC ana bilgisayar olur (Faz 13b, arayüze henüz girmedi; EN/RU karşılık öneridir) |

## 12. Tutarsızlık notları (kalanlar)

5 Eki 2026 turunda düzeltilenler: sürekli not (Türkçede "istek/not" karışıklığı), gecelik **rate** (İngilizcede "price/rate"),
personel primi **Bonus** (Commission yalnız satış kanalı için), tanıtıcı not = **Identifying note**, denetim kaydı =
**Журнал действий**, kullanıcı adı = **Имя пользователя / Username**, döviz ekranı adı = **Exchange rates / Курсы валют**,
genel temizlik = **Генеральная уборка** (kısaltmasız), maaş kilidi = **заблокирован**.

Karar bekleyenler (anlamı ya da ürün adını değiştirdiği için dokunulmadı):

- **Rehber**: EN menüde "Contacts", metinlerde "phone book"; RU menüde «Контакты», metinlerde «справочник».
  Öneri: menü adı "Contacts / Контакты" kalsın, metinlerde de aynı sözcük kullanılsın (yaklaşık 30 anahtar).
- **Ödeme (RU)**: takvim ve rezervasyonda «оплата», defterde «платёж». İkisi de doğru; tek sözcüğe indirmek
  çekim ekleri yüzünden elle düzeltme ister (21 anahtar).
- **İptal (EN/RU)**: ödeme ve gider "Void / Аннулировать" (muhasebe terimi, `voided_at`), diğer her yerde
  "Cancel / Отменить". Türkçede hepsi "iptal".
- **Çözüldü (EN)**: arıza durumunda "Fixed", dışa aktarımda ve geçmiş satırında "Resolved".
- **Misafir notu / Sürekli not**: takvim hücresinde "Misafir notu" (Guest note), kartta "Sürekli not" (Standing note).
- **Oturum (EN)**: komut menüsü grup başlığı "Account", denetim kaydında "Sign-in", sözlükte "Session".
- **Tırnak işaretleri**: Türkçe ve İngilizce metinlerde düz (`"`) ve kıvrık (`“ ”`) tırnak karışık (62/70 anahtar).
- **Rusça «Забыли пароль?»**: bağlantı metninde soru işareti var; Türkçe ve İngilizce karşılığında yok.
