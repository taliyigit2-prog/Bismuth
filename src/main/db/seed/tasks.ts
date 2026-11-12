// Task templates seeded at first start (G-91, G-93, G-94, K-34; akislar.md). Suggestions stay inactive until
// the hotel picks them at setup; legal reminders and the every-10-stays deep clean start active and can be
// switched off. Due times are filled in by the task service when a template is activated. A code added later
// reaches an existing database at its next start (seed.ts inserts missing codes), off like every suggestion.
import type { RecurrenceRuleInput } from '@shared/domain/task-recurrence'
import type { I18nText } from '../schema/columns'

export interface TaskTemplateSeed {
  code: string
  kind: 'general' | 'maintenance' | 'legal'
  title: I18nText
  recurrence: RecurrenceRuleInput
  firstDueAt?: string
  remindMinutesBefore?: number
  /** System role the task goes to (roles.code); the seed resolves it to the role's id. */
  assigneeRoleCode?: string
  suggested: boolean
  active: boolean
}

const THREE_DAYS = 3 * 24 * 60

/**
 * G-93: the tourism statistics of a month is sent between the 1st and the 10th of the next month. The task is due
 * at the end of the 10th (late only after that) and reminds from the 1st at 09:00 (9 days 14 h 59 min before).
 */
export const TOURISM_RULE = { kind: 'monthly', day: 10, time: '23:59' } as const
export const TOURISM_REMIND_MINUTES = 9 * 24 * 60 + (23 * 60 + 59) - 9 * 60
/** The first release's tourism rule (due on the 1st at 09:00): upgraded at start while unchanged by the hotel. */
export const TOURISM_RULE_V1 = { kind: 'monthly', day: 1, time: '09:00' } as const

/** The deep clean goes to Temizlik, who does it (K-38: tasks_own_only sees only its own and its role's tasks). */
export const DEEP_CLEAN_CODE = 'deep_clean_every_n'
export const DEEP_CLEAN_ROLE = 'housekeeping'

const general = (
  code: string,
  recurrence: RecurrenceRuleInput,
  tr: string,
  en: string,
  ru: string
): TaskTemplateSeed => ({
  code,
  kind: 'general',
  title: { tr, en, ru },
  recurrence,
  suggested: true,
  active: false
})

/** Weekdays as date.ts counts them (0 = Sunday). */
const MONDAY = 1
const WEDNESDAY = 3
const THURSDAY = 4
const FRIDAY = 5

const maintenance = (
  code: string,
  unit: 'months' | 'years',
  every: number,
  tr: string,
  en: string,
  ru: string
): TaskTemplateSeed => ({
  code,
  kind: 'maintenance',
  title: { tr, en, ru },
  recurrence: { kind: 'interval', unit, every, time: '10:00' },
  remindMinutesBefore: THREE_DAYS,
  suggested: true,
  active: false
})

export const TASK_TEMPLATE_SEED: TaskTemplateSeed[] = [
  // Legal reminders (TR seed, closeable): Türkiye only — `TASK_COUNTRIES` (shared/domain/task-country.ts) keeps
  // them off and out of the wizard for a hotel elsewhere (K-46 (7)).
  {
    code: 'legal_tourism_stats',
    kind: 'legal',
    title: {
      tr: "Turizm Bakanlığı konaklama istatistiği (ayın 1–10'u)",
      en: 'Ministry of Tourism accommodation statistics (1st–10th of the month)',
      ru: 'Статистика размещения для Минтуризма (1–10 число месяца)'
    },
    recurrence: TOURISM_RULE,
    remindMinutesBefore: TOURISM_REMIND_MINUTES,
    suggested: false,
    active: true
  },
  {
    code: 'legal_kbs_checkout',
    kind: 'legal',
    title: {
      tr: 'KBS çıkış bildirimlerini kontrol et',
      en: 'Check KBS check-out reports',
      ru: 'Проверить отметки выезда в KBS'
    },
    recurrence: { kind: 'daily', time: '12:30' },
    suggested: false,
    active: true
  },
  // Every N stays (S-94: 10; the seed takes the setting tasks.everyNStays when it writes the row).
  {
    code: DEEP_CLEAN_CODE,
    kind: 'maintenance',
    title: { tr: 'Odayı derin temizle', en: 'Deep-clean the room', ru: 'Генеральная уборка номера' },
    recurrence: { kind: 'everyNStays', n: 10, countDayUse: true },
    assigneeRoleCode: DEEP_CLEAN_ROLE,
    suggested: false,
    active: true
  },
  // Daily-flow suggestions from the owner's day (akislar.md).
  {
    code: 'call_late_checkouts',
    kind: 'general',
    title: {
      tr: 'Çıkış yapmayan odaları ara',
      en: 'Call rooms that have not checked out',
      ru: 'Позвонить в номера, которые не выехали'
    },
    recurrence: { kind: 'daily', time: '12:00' },
    suggested: true,
    active: false
  },
  {
    code: 'laundry_out',
    kind: 'general',
    title: {
      tr: 'Kirli çamaşırları çamaşırhaneye teslim et',
      en: 'Hand dirty linen to the laundry',
      ru: 'Сдать грязное бельё в прачечную'
    },
    recurrence: { kind: 'daily', time: '15:00' },
    suggested: true,
    active: false
  },
  {
    code: 'laundry_in_slip',
    kind: 'general',
    title: {
      tr: 'Temiz çamaşır fişini gir',
      en: 'Enter the clean slip',
      ru: 'Внести накладную на чистое бельё'
    },
    recurrence: { kind: 'daily', time: '11:00' },
    suggested: true,
    active: false
  },
  general(
    'enter_channel_bookings',
    { kind: 'daily', time: '09:30' },
    'Satış sitelerinden gelen yeni rezervasyonları takvime işle',
    'Enter new reservations from the booking sites in the calendar',
    'Внести в календарь новые брони с сайтов бронирования'
  ),
  general(
    'floor_storerooms',
    { kind: 'daily', time: '10:00' },
    'Kat depolarını kontrol et (havlu, çarşaf, malzeme)',
    'Check the floor storerooms (towels, sheets, supplies)',
    'Проверить кладовые на этажах (полотенца, бельё, принадлежности)'
  ),
  general(
    'arrival_rooms_ready',
    { kind: 'daily', time: '13:30' },
    'Bugün gelecek misafirlerin odalarını kontrol et',
    "Check that the rooms for today's arrivals are ready",
    'Проверить, готовы ли номера для сегодняшних заездов'
  ),
  general(
    'tomorrow_arrivals',
    { kind: 'daily', time: '18:00' },
    'Yarın gelecek misafirleri kontrol et (oda, fiyat, kapora)',
    "Check tomorrow's arrivals (room, price, deposit)",
    'Проверить завтрашние заезды (номер, цена, предоплата)'
  ),
  // Weekly routines of a small city hotel.
  general(
    'guest_reviews',
    { kind: 'weekly', weekdays: [MONDAY], time: '10:00' },
    'Misafir yorumlarını oku ve yanıtla',
    'Read and answer guest reviews',
    'Прочитать отзывы гостей и ответить на них'
  ),
  general(
    'supplies_count',
    { kind: 'weekly', weekdays: [MONDAY], time: '11:00' },
    'Temizlik ve oda malzemelerini say',
    'Count cleaning and room supplies',
    'Пересчитать моющие средства и принадлежности для номеров'
  ),
  general(
    'minibar_check',
    { kind: 'weekly', weekdays: [THURSDAY], time: '11:00' },
    'Minibarları kontrol et (eksikler, son kullanma tarihi)',
    'Check the minibars (missing items, expiry dates)',
    'Проверить мини-бары (недостача, сроки годности)'
  ),
  general(
    'lost_items_review',
    { kind: 'weekly', weekdays: [FRIDAY], time: '12:00' },
    'Kayıp eşyaları gözden geçir',
    'Go through the lost and found items',
    'Просмотреть забытые вещи'
  ),
  {
    code: 'room_walkthrough',
    kind: 'maintenance',
    title: {
      tr: 'Odaları gez: ampul, kumanda pili, musluk, su kaçağı',
      en: 'Walk through the rooms: bulbs, remote batteries, taps, leaks',
      ru: 'Обойти номера: лампочки, батарейки пультов, краны, протечки'
    },
    recurrence: { kind: 'weekly', weekdays: [WEDNESDAY], time: '11:00' },
    suggested: true,
    active: false
  },
  // Maintenance examples (faz-09 madde 3).
  maintenance('elevator_service', 'months', 1, 'Asansör bakımı', 'Lift service', 'Обслуживание лифта'),
  maintenance(
    'periodic_inspection',
    'years',
    1,
    'Asansör periyodik kontrolü',
    'Lift periodic inspection',
    'Периодическая проверка лифта'
  ),
  maintenance('chimney', 'years', 1, 'Baca temizliği', 'Chimney cleaning', 'Чистка дымохода'),
  maintenance(
    'fire_extinguishers',
    'years',
    1,
    'Yangın tüplerinin kontrolü',
    'Fire extinguisher check',
    'Проверка огнетушителей'
  ),
  maintenance(
    'ac_filters',
    'months',
    3,
    'Klima filtrelerini temizle',
    'Clean air-conditioner filters',
    'Очистить фильтры кондиционеров'
  ),
  maintenance(
    'water_tank',
    'months',
    6,
    'Su deposu temizliği',
    'Water tank cleaning',
    'Чистка резервуара для воды'
  ),
  maintenance('insurance', 'years', 1, 'Sigorta yenileme', 'Insurance renewal', 'Продление страховки'),
  maintenance(
    'safety_training',
    'years',
    1,
    'İş sağlığı ve güvenliği eğitimi',
    'Occupational safety training',
    'Обучение по охране труда'
  ),
  // Monthly checks.
  maintenance('pest_control', 'months', 1, 'İlaçlama', 'Pest control', 'Обработка от вредителей'),
  maintenance(
    'smoke_detectors',
    'months',
    1,
    'Duman dedektörlerini test et',
    'Test the smoke detectors',
    'Проверить датчики дыма'
  ),
  maintenance(
    'emergency_lights',
    'months',
    1,
    'Acil durum ışıklarını ve acil çıkış levhalarını test et',
    'Test the emergency lights and exit signs',
    'Проверить аварийное освещение и указатели выхода'
  ),
  maintenance(
    'first_aid_kit',
    'months',
    1,
    'İlk yardım dolabını kontrol et (eksik, tarihi geçmiş)',
    'Check the first-aid kit (missing, expired)',
    'Проверить аптечку (недостача, просроченное)'
  ),
  maintenance(
    'generator_test',
    'months',
    1,
    'Jeneratörü çalıştırıp dene (varsa)',
    'Run the generator to test it (if you have one)',
    'Запустить генератор для проверки (если есть)'
  ),
  // Every few months.
  maintenance(
    'mattress_rotation',
    'months',
    3,
    'Yatakları çevir (baş-ayak, alt-üst)',
    'Rotate and flip the mattresses',
    'Перевернуть и развернуть матрасы'
  ),
  maintenance(
    'shower_descaling',
    'months',
    3,
    'Duş başlıklarının ve muslukların kirecini temizle',
    'Descale the shower heads and taps',
    'Очистить душевые лейки и краны от накипи'
  ),
  maintenance(
    'drain_cleaning',
    'months',
    3,
    'Lavabo ve duş giderlerini aç',
    'Clear the sink and shower drains',
    'Прочистить сливы раковин и душевых'
  ),
  maintenance(
    'window_cleaning',
    'months',
    3,
    'Dış camları sildir',
    'Have the outside windows cleaned',
    'Организовать мойку окон снаружи'
  ),
  maintenance(
    'safe_batteries',
    'months',
    3,
    'Odalardaki çelik kasaların pillerini kontrol et',
    'Check the batteries of the in-room safes',
    'Проверить батарейки сейфов в номерах'
  ),
  maintenance(
    'curtains_rugs',
    'months',
    6,
    'Perde ve halıları yıkat',
    'Have the curtains and rugs washed',
    'Отдать в стирку шторы и ковры'
  ),
  maintenance(
    'pillows_duvets',
    'months',
    6,
    'Yastık ve yorganları yıkat',
    'Have the pillows and duvets washed',
    'Отдать в стирку подушки и одеяла'
  ),
  maintenance(
    'boiler_service',
    'years',
    1,
    'Kombi ve sıcak su kazanı bakımı',
    'Boiler and water heater service',
    'Обслуживание котла и водонагревателя'
  )
]
