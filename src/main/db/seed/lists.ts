// Seed lists (faz-02 madde 4). They are starting suggestions: the hotel renames, recolours, deactivates or
// adds rows; codes stay stable so re-seeding never duplicates (G-09: hotel rules are data, not code).
import type { PayPolicyValues } from '@shared/contract/staff'
import type { SystemRoleCode } from '@shared/permissions'
import type { I18nText } from '../schema/columns'

type Named = { code: string; name: I18nText }

export const ROLE_SEED: (Named & { code: SystemRoleCode; description: I18nText; tasksOwnOnly?: boolean })[] =
  [
    {
      code: 'owner',
      name: { tr: 'Sahip', en: 'Owner', ru: 'Владелец' },
      description: {
        tr: 'Her şeyi görür ve düzenler; değiştirilemez.',
        en: 'Sees and edits everything; cannot be changed.',
        ru: 'Видит и изменяет всё; не редактируется.'
      }
    },
    {
      code: 'manager',
      name: { tr: 'Müdür', en: 'Manager', ru: 'Управляющий' },
      description: {
        tr: 'Otelin günlük yönetimi, teslim alma, ek mesai.',
        en: 'Day-to-day management, taking cash, overtime.',
        ru: 'Ежедневное управление, приём кассы, сверхурочные.'
      }
    },
    {
      code: 'reception',
      name: { tr: 'Resepsiyon', en: 'Reception', ru: 'Ресепшн' },
      description: {
        tr: 'Rezervasyon, misafir, ödeme, KBS işaretleri.',
        en: 'Reservations, guests, payments, KBS marks.',
        ru: 'Бронирования, гости, оплаты, отметки KBS.'
      }
    },
    {
      code: 'accountant',
      name: { tr: 'Muhasebe', en: 'Accountant', ru: 'Бухгалтер' },
      description: {
        tr: 'Defter, gider, maaş ve raporlar.',
        en: 'Ledger, expenses, salaries and reports.',
        ru: 'Журнал, расходы, зарплаты и отчёты.'
      }
    },
    {
      code: 'housekeeping',
      name: { tr: 'Temizlik', en: 'Housekeeping', ru: 'Уборка' },
      tasksOwnOnly: true,
      description: {
        tr: 'Oda durumu, arıza ve kendine atanan görevler.',
        en: 'Room status, issues and own tasks.',
        ru: 'Статус номеров, неисправности и свои задачи.'
      }
    },
    {
      code: 'employee',
      name: { tr: 'Çalışan', en: 'Employee', ru: 'Сотрудник' },
      tasksOwnOnly: true,
      description: {
        tr: 'Yalnız kendi mesai saatleri ve görevleri.',
        en: 'Only own working hours and tasks.',
        ru: 'Только свои рабочие часы и задачи.'
      }
    }
  ]

type RoomTypeGroup = 'occupancy' | 'tier' | 'suite' | 'view' | 'building' | 'feature'
const rt = (code: string, group: RoomTypeGroup, tr: string, en: string, ru: string, maxAdults?: number) => ({
  code,
  group,
  name: { tr, en, ru },
  maxAdults
})

/** G-11: long, grouped, multilingual room type list; hotels add their own names ("Junior Room"). */
export const ROOM_TYPE_SEED = [
  rt('single', 'occupancy', 'Tek kişilik', 'Single', 'Одноместный', 1),
  rt('double', 'occupancy', 'Çift kişilik (Double)', 'Double', 'Двухместный (Double)', 2),
  rt('twin', 'occupancy', 'İki yataklı (Twin)', 'Twin', 'Двухместный (Twin)', 2),
  rt('triple', 'occupancy', 'Üç kişilik', 'Triple', 'Трёхместный', 3),
  rt('quad', 'occupancy', 'Dört kişilik', 'Quadruple', 'Четырёхместный', 4),
  rt('family', 'occupancy', 'Aile odası', 'Family room', 'Семейный номер', 4),
  rt('economy', 'tier', 'Ekonomik', 'Economy', 'Эконом'),
  rt('standard', 'tier', 'Standart', 'Standard', 'Стандарт'),
  rt('comfort', 'tier', 'Konfor', 'Comfort', 'Комфорт'),
  rt('superior', 'tier', 'Superior', 'Superior', 'Улучшенный'),
  rt('deluxe', 'tier', 'Deluxe', 'Deluxe', 'Делюкс'),
  rt('premium', 'tier', 'Premium', 'Premium', 'Премиум'),
  rt('executive', 'tier', 'Executive', 'Executive', 'Представительский'),
  rt('luxury', 'tier', 'Lüks', 'Luxury', 'Люкс'),
  rt('junior_suite', 'suite', 'Junior süit', 'Junior suite', 'Полулюкс'),
  rt('suite', 'suite', 'Süit', 'Suite', 'Сьют'),
  rt('family_suite', 'suite', 'Aile süiti', 'Family suite', 'Семейный сьют'),
  rt('honeymoon_suite', 'suite', 'Balayı süiti', 'Honeymoon suite', 'Номер для молодожёнов'),
  rt('executive_suite', 'suite', 'Executive süit', 'Executive suite', 'Представительский сьют'),
  rt('presidential_suite', 'suite', 'Kral dairesi', 'Presidential suite', 'Президентский люкс'),
  rt('sea_view', 'view', 'Deniz manzaralı', 'Sea view', 'С видом на море'),
  rt('bosphorus_view', 'view', 'Boğaz manzaralı', 'Bosphorus view', 'С видом на Босфор'),
  rt('city_view', 'view', 'Şehir manzaralı', 'City view', 'С видом на город'),
  rt('garden_view', 'view', 'Bahçe manzaralı', 'Garden view', 'С видом на сад'),
  rt('pool_view', 'view', 'Havuz manzaralı', 'Pool view', 'С видом на бассейн'),
  rt('studio', 'building', 'Stüdyo', 'Studio', 'Студия'),
  rt('apartment', 'building', 'Daire', 'Apartment', 'Апартаменты'),
  rt('loft', 'building', 'Loft', 'Loft', 'Лофт'),
  rt('penthouse', 'building', 'Çatı katı (Penthouse)', 'Penthouse', 'Пентхаус'),
  rt('bungalow', 'building', 'Bungalov', 'Bungalow', 'Бунгало'),
  rt('villa', 'building', 'Villa', 'Villa', 'Вилла'),
  rt('annex', 'building', 'Ek bina odası', 'Annex room', 'Номер в пристройке'),
  rt('dormitory', 'building', 'Yatakhane', 'Dormitory', 'Общий номер'),
  rt('accessible', 'feature', 'Engelli dostu', 'Accessible room', 'Номер для гостей с инвалидностью'),
  rt('connecting', 'feature', 'Bağlantılı oda', 'Connecting room', 'Смежный номер'),
  rt('balcony', 'feature', 'Balkonlu', 'With balcony', 'С балконом'),
  rt('jacuzzi', 'feature', 'Jakuzili', 'With jacuzzi', 'С джакузи'),
  rt('kitchenette', 'feature', 'Mutfaklı', 'With kitchenette', 'С мини-кухней'),
  rt('attic', 'feature', 'Çatı odası', 'Attic room', 'Мансардный номер'),
  rt('basement', 'feature', 'Bahçe katı', 'Garden-level room', 'Номер на цокольном этаже')
]

/** G-13: default Nakit, Kredi Kartı, Havale/EFT (the Excel's "İban"). */
export const PAYMENT_METHOD_SEED = [
  { code: 'cash', group: 'cash' as const, isCash: true, name: { tr: 'Nakit', en: 'Cash', ru: 'Наличные' } },
  {
    code: 'card',
    group: 'card' as const,
    isCash: false,
    name: { tr: 'Kredi kartı', en: 'Card', ru: 'Карта' }
  },
  {
    code: 'bank',
    group: 'bank' as const,
    isCash: false,
    name: { tr: 'Havale / EFT (IBAN)', en: 'Bank transfer (IBAN)', ru: 'Банковский перевод (IBAN)' }
  }
]

type ChannelKind = 'direct' | 'ota' | 'agency' | 'platform_service'
type ChannelOptions = {
  /** Who usually collects the guest's money (the hotel can change it per channel later). */
  by?: 'hotel' | 'channel'
  /** Ticked in the setup wizard from the start; every other channel waits there, unticked, for the hotel to pick. */
  on?: boolean
}
const ch = (
  code: string,
  kind: ChannelKind,
  name: I18nText,
  { by = 'hotel', on = false }: ChannelOptions = {}
) => ({
  code,
  kind,
  name,
  collectedBy: by,
  defaultOn: on
})

/**
 * G-14: sales channels are labels only (G-05, no OTA connection). The Excel list (---, Airbnb, Booking, Expedia,
 * Ostrovok, Bounce) plus e-mail starts switched on; the other known booking sites, wholesalers and
 * luggage-storage marketplaces are seeded switched off so the hotel ticks what it really works with.
 * Brand names are not translated; a short note tells look-alikes apart. Order within a kind is the order shown.
 */
export const CHANNEL_SEED = [
  // Direct: the guest reaches the hotel without a middleman.
  ch('direct', 'direct', { tr: 'Doğrudan', en: 'Direct', ru: 'Напрямую' }, { on: true }),
  ch('phone', 'direct', { tr: 'Telefon', en: 'Phone', ru: 'Телефон' }, { on: true }),
  ch('walk_in', 'direct', { tr: 'Kapıdan', en: 'Walk-in', ru: 'Без брони' }, { on: true }),
  ch('email', 'direct', { tr: 'E-posta', en: 'Email', ru: 'Эл. почта' }, { on: true }),
  ch('whatsapp', 'direct', { tr: 'WhatsApp', en: 'WhatsApp', ru: 'WhatsApp' }),
  ch('website', 'direct', { tr: 'Otelin web sitesi', en: 'Hotel website', ru: 'Сайт отеля' }),
  ch('social_media', 'direct', { tr: 'Sosyal medya', en: 'Social media', ru: 'Социальные сети' }),
  ch('corporate', 'direct', { tr: 'Firma anlaşması', en: 'Corporate agreement', ru: 'Договор с компанией' }),

  // Online booking sites: global, Russian-speaking, Middle East, Turkish.
  ch('airbnb', 'ota', { tr: 'Airbnb', en: 'Airbnb', ru: 'Airbnb' }, { by: 'channel', on: true }),
  ch('booking', 'ota', { tr: 'Booking.com', en: 'Booking.com', ru: 'Booking.com' }, { on: true }),
  ch('expedia', 'ota', { tr: 'Expedia', en: 'Expedia', ru: 'Expedia' }, { by: 'channel', on: true }),
  // Expedia Group's own brand: not the Turkish Otelz.com below (one letter apart, different companies).
  ch(
    'hotels_com',
    'ota',
    { tr: 'Hotels.com (Expedia Group)', en: 'Hotels.com (Expedia Group)', ru: 'Hotels.com (Expedia Group)' },
    { by: 'channel' }
  ),
  ch('ostrovok', 'ota', { tr: 'Ostrovok', en: 'Ostrovok', ru: 'Островок' }, { on: true }),
  ch('agoda', 'ota', { tr: 'Agoda', en: 'Agoda', ru: 'Agoda' }, { by: 'channel' }),
  ch('trip', 'ota', { tr: 'Trip.com', en: 'Trip.com', ru: 'Trip.com' }, { by: 'channel' }),
  ch('hostelworld', 'ota', { tr: 'Hostelworld', en: 'Hostelworld', ru: 'Hostelworld' }),
  ch('yandex_travel', 'ota', { tr: 'Yandex Travel', en: 'Yandex Travel', ru: 'Яндекс Путешествия' }),
  ch('onetwotrip', 'ota', { tr: 'OneTwoTrip', en: 'OneTwoTrip', ru: 'OneTwoTrip' }, { by: 'channel' }),
  ch('almosafer', 'ota', { tr: 'Almosafer', en: 'Almosafer', ru: 'Almosafer' }, { by: 'channel' }),
  // A Turkish site that sells only hotels in Türkiye (guests often pay at the hotel).
  ch('otelz', 'ota', { tr: 'Otelz.com (Türkiye)', en: 'Otelz.com (Turkey)', ru: 'Otelz.com (Турция)' }),
  ch('etstur', 'ota', { tr: 'Etstur', en: 'Etstur', ru: 'Etstur' }, { by: 'channel' }),
  ch('odamax', 'ota', { tr: 'Odamax', en: 'Odamax', ru: 'Odamax' }, { by: 'channel' }),
  ch('tatilbudur', 'ota', { tr: 'Tatilbudur', en: 'Tatilbudur', ru: 'Tatilbudur' }, { by: 'channel' }),
  ch('jolly_tur', 'ota', { tr: 'Jolly Tur', en: 'Jolly Tur', ru: 'Jolly Tur' }, { by: 'channel' }),
  ch('tatilsepeti', 'ota', { tr: 'Tatilsepeti', en: 'Tatilsepeti', ru: 'Tatilsepeti' }, { by: 'channel' }),
  ch('enuygun', 'ota', { tr: 'Enuygun', en: 'Enuygun', ru: 'Enuygun' }, { by: 'channel' }),

  // Agencies and wholesalers (bed banks resell the hotel's rooms to many small agencies).
  ch('agency', 'agency', { tr: 'Acente', en: 'Travel agency', ru: 'Турагентство' }),
  ch('hotelbeds', 'agency', { tr: 'Hotelbeds', en: 'Hotelbeds', ru: 'Hotelbeds' }, { by: 'channel' }),
  ch('webbeds', 'agency', { tr: 'WebBeds', en: 'WebBeds', ru: 'WebBeds' }, { by: 'channel' }),
  ch('ratehawk', 'agency', { tr: 'RateHawk', en: 'RateHawk', ru: 'RateHawk' }, { by: 'channel' }),
  ch('paximum', 'agency', { tr: 'Paximum', en: 'Paximum', ru: 'Paximum' }, { by: 'channel' }),

  // Luggage-storage marketplaces: the guest books and pays the platform; the hotel only keeps the bags.
  ch(
    'bounce',
    'platform_service',
    { tr: 'Bounce (bavul emaneti)', en: 'Bounce (luggage)', ru: 'Bounce (багаж)' },
    { by: 'channel', on: true }
  ),
  ch(
    'radical_storage',
    'platform_service',
    { tr: 'Radical Storage (bavul emaneti)', en: 'Radical Storage (luggage)', ru: 'Radical Storage (багаж)' },
    { by: 'channel' }
  ),
  ch(
    'nannybag',
    'platform_service',
    { tr: 'Nannybag (bavul emaneti)', en: 'Nannybag (luggage)', ru: 'Nannybag (багаж)' },
    { by: 'channel' }
  ),
  ch(
    'luggagehero',
    'platform_service',
    { tr: 'LuggageHero (bavul emaneti)', en: 'LuggageHero (luggage)', ru: 'LuggageHero (багаж)' },
    { by: 'channel' }
  ),
  ch(
    'stasher',
    'platform_service',
    { tr: 'Stasher (bavul emaneti)', en: 'Stasher (luggage)', ru: 'Stasher (багаж)' },
    { by: 'channel' }
  ),
  ch(
    'qeepl',
    'platform_service',
    { tr: 'Qeepl (bavul emaneti)', en: 'Qeepl (luggage)', ru: 'Qeepl (багаж)' },
    { by: 'channel' }
  ),
  ch(
    'vertoe',
    'platform_service',
    { tr: 'Vertoe (bavul emaneti)', en: 'Vertoe (luggage)', ru: 'Vertoe (багаж)' },
    { by: 'channel' }
  )
]

type Unit = 'per_booking' | 'per_night' | 'per_person' | 'per_item' | 'per_bag_day'
const ex = (code: string, unit: Unit, tr: string, en: string, ru: string) => ({
  code,
  unit,
  name: { tr, en, ru }
})

/** G-15: extra services (no default prices: the hotel sets them). */
export const EXTRA_SERVICE_SEED = [
  ex('luggage', 'per_bag_day', 'Bavul emaneti', 'Luggage storage', 'Хранение багажа'),
  ex('breakfast', 'per_person', 'Kahvaltı', 'Breakfast', 'Завтрак'),
  ex('extra_bed', 'per_night', 'İlave yatak', 'Extra bed', 'Дополнительная кровать'),
  ex('early_checkin', 'per_booking', 'Erken giriş', 'Early check-in', 'Ранний заезд'),
  ex('late_checkout', 'per_booking', 'Geç çıkış', 'Late check-out', 'Поздний выезд'),
  ex('no_show_fee', 'per_booking', 'Gelmeme bedeli', 'No-show fee', 'Плата за неявку'),
  ex('damage_fee', 'per_booking', 'Hasar bedeli', 'Damage fee', 'Плата за ущерб'),
  ex('airport_transfer', 'per_booking', 'Havalimanı transferi', 'Airport transfer', 'Трансфер из аэропорта'),
  ex('laundry_service', 'per_item', 'Çamaşır yıkama', 'Laundry service', 'Стирка'),
  ex('parking', 'per_night', 'Otopark', 'Parking', 'Парковка'),
  ex('minibar', 'per_item', 'Minibar', 'Minibar', 'Мини-бар')
]

/** G-67, K-35: no expense categories, only visibility sections. */
export const EXPENSE_SECTION_SEED = [
  {
    code: 'general',
    visibilityPermission: 'expenses' as const,
    name: { tr: 'Genel giderler', en: 'General expenses', ru: 'Общие расходы' }
  },
  {
    code: 'owner',
    visibilityPermission: 'expenses.owner' as const,
    name: { tr: 'Sahip giderleri', en: "Owner's expenses", ru: 'Расходы владельца' }
  }
]

/** G-32: automatic statuses; colour null = theme default (Excel colours in globals.css). */
export const STATUS_TAG_SEED = [
  { code: 'paid', name: { tr: 'Ödendi', en: 'Paid', ru: 'Оплачено' } },
  { code: 'unpaid', name: { tr: 'Ödenmedi', en: 'Unpaid', ru: 'Не оплачено' } },
  {
    code: 'partial',
    name: { tr: 'Kısmen ödendi / kapora', en: 'Partly paid / deposit', ru: 'Частично оплачено / предоплата' }
  },
  { code: 'dayuse', name: { tr: 'Aynı gün giriş‑çıkış', en: 'Day use', ru: 'Дневное пребывание' } },
  {
    code: 'pastEmpty',
    name: { tr: 'Geçmiş tarih, boş', en: 'Past date, empty', ru: 'Прошедшая дата, свободно' }
  },
  { code: 'empty', name: { tr: 'Boş', en: 'Empty', ru: 'Свободно' } },
  { code: 'blocked', name: { tr: 'Satılmaz', en: 'Not for sale', ru: 'Закрыт для продажи' } }
]

/** G-95: Pandora example 2 × 12 h; other hotels change it. */
export const SHIFT_SEED = [
  { code: 'day', startTime: '09:00', endTime: '21:00', name: { tr: 'Gündüz', en: 'Day', ru: 'Дневная' } },
  { code: 'night', startTime: '21:00', endTime: '09:00', name: { tr: 'Gece', en: 'Night', ru: 'Ночная' } }
]

const li = (code: string, tr: string, en: string, ru: string) => ({ code, name: { tr, en, ru } })

/** G-171 (owner: "büyültebilirsin"). */
export const LAUNDRY_ITEM_SEED = [
  li('sheet', 'Çarşaf', 'Sheet', 'Простыня'),
  li('mattress_protector', 'Alez', 'Mattress protector', 'Наматрасник'),
  li('duvet_cover', 'Nevresim / yorgan kılıfı', 'Duvet cover', 'Пододеяльник'),
  li('pillowcase', 'Yastık kılıfı', 'Pillowcase', 'Наволочка'),
  li('bath_towel', 'Büyük havlu', 'Bath towel', 'Банное полотенце'),
  li('hand_towel', 'Küçük havlu', 'Hand towel', 'Полотенце для рук'),
  li('bath_mat', 'Ayak havlusu', 'Bath mat', 'Полотенце для ног'),
  li('bathrobe', 'Bornoz', 'Bathrobe', 'Халат'),
  li('pillow', 'Yastık', 'Pillow', 'Подушка'),
  li('duvet', 'Yorgan', 'Duvet', 'Одеяло'),
  li('coverlet', 'Pike', 'Coverlet', 'Покрывало-пике'),
  li('blanket', 'Battaniye', 'Blanket', 'Плед'),
  li('bedspread', 'Yatak örtüsü', 'Bedspread', 'Покрывало'),
  li('curtain', 'Fon perde', 'Curtain', 'Портьера'),
  li('sheer', 'Tül perde', 'Sheer curtain', 'Тюль'),
  li('tablecloth', 'Masa örtüsü', 'Tablecloth', 'Скатерть'),
  li('napkin', 'Peçete', 'Napkin', 'Салфетка'),
  li('doormat', 'Paspas', 'Doormat', 'Коврик'),
  li('apron', 'Önlük', 'Apron', 'Фартук'),
  li('uniform', 'Personel kıyafeti', 'Staff uniform', 'Униформа')
]

/** G-170, S-73: product categories including cleaning supplies. */
export const PRODUCT_CATEGORY_SEED = [
  li('drinks', 'Su ve içecek', 'Water and drinks', 'Вода и напитки'),
  li('market', 'Market', 'Groceries', 'Продукты'),
  li('breakfast', 'Kahvaltı', 'Breakfast', 'Завтрак'),
  li('cleaning', 'Temizlik malzemeleri', 'Cleaning supplies', 'Моющие средства'),
  li('guest_amenities', 'Banyo / misafir ürünleri', 'Bathroom / guest amenities', 'Косметика для гостей'),
  li('paper', 'Kâğıt ürünleri', 'Paper products', 'Бумажные изделия'),
  li('textile', 'Çamaşır / tekstil', 'Linen / textiles', 'Бельё / текстиль'),
  li('technical', 'Teknik / bakım', 'Technical / maintenance', 'Техника / обслуживание'),
  li('stationery', 'Kırtasiye', 'Stationery', 'Канцтовары'),
  li('other', 'Diğer', 'Other', 'Прочее')
]

/**
 * The hotel's pay rules (S-34…S-38, Pandora; P7fix B29): written as `pay_policies` hotel rows at the first start
 * (and by the setup wizard), so they are the hotel's settings, changed in Personel → Ödeme kuralları. The code's
 * DEFAULT_PAY_POLICY is only a safe fallback for a key without a row.
 */
export const PAY_POLICY_SEED: PayPolicyValues = {
  leaveDaysPerMonth: 4,
  unusedLeavePaid: true,
  unusedLeaveMultiplier: '1',
  dailyDivisor: 30,
  leaveCarryOver: false,
  standardHoursPerDay: 8,
  overtimeMode: 'none',
  overtimeMultiplier: '1.5',
  hourlyDivisor: 225,
  holidayMultiplier: '2',
  holidayPayMode: 'hourly',
  commissionMode: 'none',
  commissionBase: 'room_revenue_all'
}
