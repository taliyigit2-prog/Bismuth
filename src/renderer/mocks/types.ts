// Shapes of the Faz 3 demo data ("sahte servis", faz-03 madde 5). They mirror the views the real services return
// (src/main/services/*) closely enough that later phases swap the data source, not the screens. Names, numbers and
// notes are invented (CLAUDE.md: no real guest, staff or money data).
import type { LocalDate } from '@shared/date'
import type { MethodGroup } from '@shared/domain/cash'
import type { NightPayStatus } from '@shared/domain/payment-allocation'

/** A seeded name in the three UI languages (the real lists carry `name_i18n_json`). */
export interface I18nText {
  tr: string
  en: string
  ru: string
}

export type HkStatus = 'clean' | 'dirty' | 'inspected' | 'maintenance' | 'out_of_order'

export interface DemoRoom {
  id: string
  number: string
  floor: number
  typeCode: string
  typeName: I18nText
  beds: number
  sellable: boolean
  hk: HkStatus
  /** Room type prices (G-48 suggestion): weekdays and the hotel's highlighted days. */
  basePriceMinor: number
  weekendPriceMinor: number
  /** Position on the floor plan (grid cells), Faz 9 lets the owner draw it. */
  plan: { x: number; y: number; w: number; h: number }
}

export interface DemoChannel {
  code: string
  name: I18nText
  kind: 'direct' | 'ota' | 'agency' | 'platform_service'
}

export interface DemoMethod {
  code: string
  group: MethodGroup
  isCash: boolean
  name: I18nText
}

export interface DemoCompany {
  id: string
  title: string
  address: string
  city: string
  taxOffice: string
  taxNumber: string
  phone: string
  email: string
  iban: string | null
  contactPerson: string | null
  favorite: boolean
}

export interface DemoGuest {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
  /** ISO 3166-1 alpha-2. */
  nationality: string | null
  language: 'tr' | 'en' | 'ru' | 'de' | 'ar' | null
  vip: boolean
  standingNote: string | null
  standingNoteLevel: 'info' | 'warn'
  notes: string | null
  companyId: string | null
}

export interface DemoOccupant {
  id: string
  fullName: string
  isPrimary: boolean
  descriptorNote: string | null
  arrivedAt: string | null
  leftAt: string | null
  kbsReportedAt: string | null
  kbsCheckoutAt: string | null
}

export interface DemoNight {
  date: LocalDate
  priceMinor: number
  /** From the shared allocation rule (§6.3): first night first. */
  pay: NightPayStatus
  allocatedMinor: number
}

export type StayStatus = 'planned' | 'in_house' | 'done' | 'cancelled'

export interface DemoStay {
  id: string
  reservationId: string
  roomId: string
  checkIn: LocalDate
  checkOut: LocalDate
  status: StayStatus
  dayUse: boolean
  nights: DemoNight[]
  occupants: DemoOccupant[]
  checkedInAt: string | null
  checkedOutAt: string | null
}

export interface DemoPayment {
  id: string
  reservationId: string | null
  /** Room number or a sale title, for the day ledger. */
  label: string
  date: LocalDate
  at: string
  kind: 'payment' | 'deposit' | 'refund'
  methodCode: string
  channelCode: string | null
  amountMinor: number
  currency: string
  /** Credited to the TRY folio, frozen at write time. */
  amountFolioMinor: number
  amountBaseMinor: number
  collected: boolean
  voided: boolean
  takenBy: string
}

export type ReservationStatus =
  'tentative' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show' | 'parked'

export interface DemoReservation {
  id: string
  code: string
  guestId: string
  channelCode: string
  channelRef: string | null
  status: ReservationStatus
  parkedReason: 'no_show_paid' | 'refund_pending' | 'postponed' | 'other' | null
  adults: number
  children: number
  tagIds: string[]
  notes: { at: string; by: string; text: string }[]
  request: string | null
  createdAt: string
  stays: DemoStay[]
  payments: DemoPayment[]
  extras: { id: string; date: LocalDate; name: I18nText; amountMinor: number }[]
  chargesMinor: number
  creditedMinor: number
  balanceMinor: number
}

export interface DemoBlock {
  id: string
  roomId: string
  dateFrom: LocalDate
  dateTo: LocalDate
  kind: 'oos' | 'ooo'
  reason: string
}

export interface DemoSpecialDay {
  date: LocalDate
  kind: 'holiday' | 'half_holiday' | 'special' | 'event'
  name: I18nText
}

export interface DemoTag {
  id: string
  name: string
  color: string
  description: string
  priorityOverAuto: boolean
  enabled: boolean
}

export interface DemoExpense {
  id: string
  date: LocalDate
  at: string
  section: 'general' | 'owner'
  description: string
  amountMinor: number
  currency: string
  amountBaseMinor: number
  kind: 'manual' | 'staff' | 'laundry'
  paidFromDrawer: boolean
  settled: boolean
  methodCode: string | null
  items: { product: string; qty: string; unitMinor: number }[]
}

export interface DemoTask {
  id: string
  title: string
  kind: 'general' | 'maintenance' | 'legal'
  status: 'open' | 'done' | 'cancelled'
  dueAt: string | null
  roomNumber: string | null
  assignee: { kind: 'user' | 'role' | 'shift'; name: string } | null
  recurrence: 'daily' | 'weekly' | 'monthly' | 'interval' | 'every_n_stays' | null
  doneBy: string | null
  doneAt: string | null
  createdBy: string
}

export interface DemoHandover {
  id: string
  shift: 'day' | 'night'
  at: string
  by: string
  to: string
  note: string
  readAt: string | null
  summary: { arrivals: number; departures: number; kbsGaps: number; drawerTry: number; openTasks: number }
}

export interface DemoNote {
  id: string
  kind: 'board' | 'personal'
  text: string
  by: string
  at: string
  pinned: boolean
}

export interface DemoLostItem {
  id: string
  foundAt: LocalDate
  place: string
  roomNumber: string | null
  description: string
  foundBy: string
  status: 'stored' | 'returned' | 'disposed'
  guestName: string | null
  storage: string
}

export interface DemoIssue {
  id: string
  roomNumber: string | null
  area: string | null
  title: string
  detail: string
  severity: 'low' | 'medium' | 'urgent'
  status: 'open' | 'planned' | 'resolved'
  reportedBy: string
  reportedAt: string
  plannedFor: LocalDate | null
  resolvedAt: string | null
  photos: number
  blocksRoom: boolean
}

export interface DemoMaintenance {
  id: string
  title: string
  everyMonths: number
  lastDone: LocalDate | null
  nextDue: LocalDate
  contact: string | null
}

export interface DemoEmployee {
  id: string
  name: string
  position: string
  startDate: LocalDate
  monthlyMinor: number
  roleCode: string
  phone: string
  leaveEntitled: number
  leaveUsed: number
  advancesMinor: number
  paidMinor: number
  netMinor: number
  overtimeMinutes: number
  locked: boolean
  /** Next 14 days: 'work' | 'rest' | 'annual' | 'sick' | 'night'. */
  schedule: ('work' | 'night' | 'rest' | 'annual' | 'sick')[]
}

export type ContactCategory =
  'supplier' | 'laundry' | 'plumber' | 'electrician' | 'taxi' | 'emergency' | 'other'

export interface DemoContact {
  id: string
  category: ContactCategory
  name: string
  person: string | null
  phone: string
  note: string | null
  favorite: boolean
}

export interface DemoProduct {
  id: string
  name: string
  category: I18nText
  unit: 'piece' | 'kg' | 'lt' | 'pack' | 'bag'
  lastUnitMinor: number
  previousUnitMinor: number | null
  lastBought: LocalDate
  monthQty: number
  stock: number | null
}

export interface DemoLaundryLine {
  itemCode: string
  name: I18nText
  out: number
  in: number
  stained: number
  unitMinor: number
}

export interface DemoLaundryDelivery {
  id: string
  date: LocalDate
  direction: 'out' | 'in'
  pieces: number
  by: string
}

export interface DemoFxRate {
  currency: string
  /** TRY for one unit × 1 000 000. */
  rateMicro: number
  source: 'hotel' | 'manual' | 'market_mid'
  at: string
  /** Last 14 days, oldest first (micro). */
  history: number[]
}

export interface DemoWeatherDay {
  date: LocalDate
  symbol: string
  maxC: number
  minC: number
  rainMm: number
}

export interface DemoTourismRow {
  country: I18nText
  iso: string
  arrivals: number
  nights: number
  programArrivals: number
}

export interface DemoTourismReview {
  raw: string
  suggestion: I18nText | null
  rows: number
  kind: 'typo' | 'ambiguous' | 'historic'
}

export interface DemoMonthlyReport {
  /** YYYY-MM */
  month: string
  revenueMinor: number
  roomRevenueMinor: number
  expensesMinor: number
  staffMinor: number
  soldNights: number
  sellableNights: number
}

export interface DemoUser {
  id: string
  name: string
  roleCode: string
  active: boolean
  lastSeen: string | null
  device: string | null
}

export interface DemoDevice {
  id: string
  name: string
  kind: 'desktop' | 'browser' | 'mobile'
  user: string
  lastSeen: string
  ip: string | null
  trusted: boolean
}

export interface DemoHotel {
  today: LocalDate
  now: string
  currency: 'TRY'
  hotelName: string
  rooms: DemoRoom[]
  channels: DemoChannel[]
  methods: DemoMethod[]
  companies: DemoCompany[]
  guests: DemoGuest[]
  blacklist: {
    id: string
    name: string
    phone: string | null
    reason: string
    addedAt: LocalDate
    severity: 'warn' | 'block'
  }[]
  reservations: DemoReservation[]
  blocks: DemoBlock[]
  specialDays: DemoSpecialDay[]
  customTags: DemoTag[]
  saleFolios: DemoPayment[]
  expenses: DemoExpense[]
  tasks: DemoTask[]
  handovers: DemoHandover[]
  notes: DemoNote[]
  lostItems: DemoLostItem[]
  issues: DemoIssue[]
  maintenance: DemoMaintenance[]
  employees: DemoEmployee[]
  contacts: DemoContact[]
  products: DemoProduct[]
  laundry: {
    contact: string
    lines: DemoLaundryLine[]
    deliveries: DemoLaundryDelivery[]
    invoiceMinor: number
  }
  fx: DemoFxRate[]
  weather: DemoWeatherDay[]
  tourism: {
    month: string
    rows: DemoTourismRow[]
    review: DemoTourismReview[]
    sameDay: number
    beds: number
  }
  monthly: DemoMonthlyReport[]
  users: DemoUser[]
  devices: DemoDevice[]
}
