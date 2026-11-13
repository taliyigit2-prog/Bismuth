// The wizard's answers (G-10, faz-04 madde 1): what each step edits, the defaults a fresh hotel starts from, the
// copy kept after each step (never a password or PIN), the checks behind "İleri" and the `setup.finish` payload.
// Pure functions: the steps render this state, the tests drive it without a screen.
import * as z from 'zod'
import {
  APP_MODES,
  type AppMode,
  type ProcedureOutput,
  type SettingsValues,
  type SetupDraft
} from '@shared/contract'
import { OWN_TASKS_MAX, ownTaskSchema } from '@shared/contract/operations'
import { isWeakPin, normalizeUsername, usernameSchema } from '@shared/contract/users'
import { isLocalDate } from '@shared/date'
import type { RecurrenceRuleInput } from '@shared/domain/task-recurrence'
import { DEFAULT_PAY_POLICY } from '@shared/domain/salary'
import { APP_LOCALES, type AppLocale } from '@shared/format'
import { STEPS, type Step } from './steps'

export type SetupOptions = ProcedureOutput<'setup.options'>
export type Theme = 'light' | 'dark' | 'system'
export type RoomTypeRef = { id: string } | { tempKey: string }
export type OvertimeMode = 'none' | 'hourly_fixed' | 'multiplier'
export type CommissionMode = 'none' | 'pct' | 'fixed'
export type I18nText = Partial<Record<AppLocale, string>> | null

export interface PickedType {
  id: string
  basePriceMinor: number | null
  weekendPriceMinor: number | null
  /** Optional price of one hour of an hourly stay (K-48); the desk may leave it empty. */
  hourlyPriceMinor: number | null
}
export interface CustomType {
  tempKey: string
  name: string
  basePriceMinor: number | null
  weekendPriceMinor: number | null
  hourlyPriceMinor: number | null
}
export interface DraftRoom {
  key: string
  number: string
  floor: string
  beds: string
  sellable: boolean
  roomType: RoomTypeRef | null
}
export interface DraftShift {
  key: string
  /** A seeded shift keeps its id (the server updates it); a new one has none. */
  id: string | null
  /** null = the seeded name, shown in the UI language. */
  name: string | null
  startTime: string
  endTime: string
}
/** A repeating task the hotel typed in (step 8); checked when added (tasks/own-task.ts). */
export interface DraftOwnTask {
  key: string
  title: string
  recurrence: RecurrenceRuleInput
}
export interface DraftEmployee {
  key: string
  firstName: string
  lastName: string
  position: string
  startDate: string
  hasAccount: boolean
  username: string
  password: string
  roleId: string
}

/** Numbers the person types stay text until "İleri" checks them (an empty field is not 0). */
export interface WizardDraft {
  language: AppLocale
  theme: Theme
  mode: AppMode
  hotel: {
    name: string
    country: string
    city: string
    timezone: string
    checkinTime: string
    checkoutTime: string
  }
  money: { baseCurrency: string; currencies: string[] }
  roomTypes: { selected: PickedType[]; custom: CustomType[] }
  generator: { floors: string; perFloor: string; beds: string; roomType: RoomTypeRef | null }
  rooms: DraftRoom[]
  lists: {
    paymentMethods: string[]
    salesChannels: string[]
    extraServices: string[]
    customPaymentMethods: string[]
    customSalesChannels: string[]
    customExtraServices: string[]
  }
  staff: {
    leaveDaysPerMonth: string
    unusedLeavePaid: boolean
    dailyDivisor: string
    divideByMonthDays: boolean
    standardHoursPerDay: string
    overtimeMode: OvertimeMode
    overtimeHourlyMinor: number | null
    overtimeMultiplier: string
    holidayMultiplier: string
    /** Bonus ("prim", S-38): none, a percentage of room revenue or a fixed amount a month. */
    commissionMode: CommissionMode
    commissionPct: string
    commissionFixedMinor: number | null
    advanceFromDrawer: boolean
  }
  shifts: DraftShift[]
  tasks: { suggestions: string[]; legalReminders: boolean; custom: DraftOwnTask[] }
  employees: DraftEmployee[]
  calendar: { highlightWeekdays: number[]; dayClosing: boolean }
  owner: { displayName: string; username: string; password: string; repeat: string; pin: string }
}

// ── Small helpers ────────────────────────────────────────────────────────────────────────────────────────────

let seq = 0
/** A key for a row the wizard adds (rooms, shifts, employees, own room types); unique across restarts. */
export const newKey = (): string => `k${Date.now().toString(36)}${(seq++).toString(36)}`

/** Seeded rows carry their name in every language; the hotel's own rows have a plain name. */
export function localName(lang: AppLocale, name: string | null, i18n: I18nText): string {
  return i18n?.[lang] ?? name ?? i18n?.tr ?? ''
}

export const refKey = (ref: RoomTypeRef): string => ('id' in ref ? `id:${ref.id}` : `tmp:${ref.tempKey}`)
export const refFromKey = (key: string): RoomTypeRef | null =>
  key.startsWith('id:') ? { id: key.slice(3) } : key.startsWith('tmp:') ? { tempKey: key.slice(4) } : null

/** The room types this hotel uses (step 5), in the order picked, with their names in the UI language. */
export function chosenTypes(
  draft: WizardDraft,
  options: SetupOptions,
  lang: AppLocale
): { key: string; ref: RoomTypeRef; label: string }[] {
  const byId = new Map(options.roomTypes.map((t) => [t.id, t]))
  return [
    ...draft.roomTypes.selected.flatMap((p) => {
      const type = byId.get(p.id)
      return type
        ? [{ key: refKey(p), ref: { id: p.id }, label: localName(lang, type.name, type.nameI18n) }]
        : []
    }),
    ...draft.roomTypes.custom.map((c) => ({
      key: refKey(c),
      ref: { tempKey: c.tempKey },
      label: c.name.trim()
    }))
  ]
}

const toInt = (text: string): number | null => (/^\d{1,4}$/.test(text.trim()) ? Number(text.trim()) : null)
const inRange = (text: string, min: number, max: number): boolean => {
  const n = toInt(text)
  return n !== null && n >= min && n <= max
}
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
const DECIMAL = /^\d{1,6}(?:[.,]\d{1,6})?$/
const sameName = (a: string): string => a.trim().toLocaleLowerCase('tr-TR')

/** The most guessable PINs: the same rule the server refuses them by. */
export { isWeakPin }

// ── Defaults ─────────────────────────────────────────────────────────────────────────────────────────────────

/** "1.5" → "1,5" where the comma is the decimal sign (the field accepts both). */
const localDecimal = (value: string, lang: AppLocale): string =>
  lang === 'en' ? value : value.replace('.', ',')

export function defaultDraft(options: SetupOptions, settings: SettingsValues, mode: AppMode): WizardDraft {
  const lang = settings['ui.language']
  // The hotel's stored rules first (setup.options), then the program's defaults (domain/salary.ts).
  const pay = options.payPolicy
  const base = DEFAULT_PAY_POLICY
  const divisor = pay.dailyDivisor ?? base.dailyDivisor
  const fixedDivisor = [pay.dailyDivisor, base.dailyDivisor].find((v) => typeof v === 'number')
  // A first suggestion so the rooms step works straight away; the owner changes it in step 5.
  const firstType =
    options.roomTypes.find((t) => t.code === 'double') ??
    options.roomTypes.find((t) => t.group === 'occupancy') ??
    options.roomTypes[0]
  const activeIds = (rows: { id: string; active: boolean }[]): string[] =>
    rows.filter((r) => r.active).map((r) => r.id)
  const legal = options.taskTemplates.filter((t) => t.kind === 'legal')
  return {
    language: lang,
    theme: settings['ui.theme'],
    mode,
    hotel: {
      name: '',
      country: settings['hotel.country'],
      city: settings['hotel.city'],
      timezone: settings['hotel.timezone'],
      checkinTime: settings['hotel.checkinTime'],
      checkoutTime: settings['hotel.checkoutTime']
    },
    money: {
      baseCurrency: settings['hotel.baseCurrency'],
      currencies: [...settings['hotel.currencies']]
    },
    roomTypes: {
      selected: firstType
        ? [{ id: firstType.id, basePriceMinor: null, weekendPriceMinor: null, hourlyPriceMinor: null }]
        : [],
      custom: []
    },
    // One room to start from; the hotel types its own floors and rooms per floor (no hotel's shape built in).
    generator: { floors: '1', perFloor: '1', beds: '2', roomType: firstType ? { id: firstType.id } : null },
    rooms: [],
    lists: {
      paymentMethods: activeIds(options.paymentMethods),
      salesChannels: activeIds(options.salesChannels),
      extraServices: activeIds(options.extraServices),
      customPaymentMethods: [],
      customSalesChannels: [],
      customExtraServices: []
    },
    staff: {
      leaveDaysPerMonth: String(pay.leaveDaysPerMonth ?? base.leaveDaysPerMonth),
      unusedLeavePaid: pay.unusedLeavePaid ?? base.unusedLeavePaid,
      dailyDivisor: fixedDivisor === undefined ? '' : String(fixedDivisor),
      divideByMonthDays: divisor === 'days_in_month',
      standardHoursPerDay: String(pay.standardHoursPerDay ?? base.standardHoursPerDay),
      overtimeMode: pay.overtimeMode ?? base.overtimeMode,
      overtimeHourlyMinor: pay.overtimeHourlyMinor ?? base.overtimeHourlyMinor ?? null,
      overtimeMultiplier: localDecimal(pay.overtimeMultiplier ?? base.overtimeMultiplier, lang),
      holidayMultiplier: localDecimal(pay.holidayMultiplier ?? base.holidayMultiplier, lang),
      commissionMode: pay.commissionMode ?? base.commissionMode,
      commissionPct: localDecimal(pay.commissionPct ?? base.commissionPct ?? '', lang),
      commissionFixedMinor: pay.commissionFixedMinor ?? base.commissionFixedMinor ?? null,
      advanceFromDrawer: settings['staff.advanceFromDrawer']
    },
    shifts: options.shifts
      .filter((s) => s.active)
      .map((s) => ({ key: s.id, id: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime })),
    tasks: {
      suggestions: options.taskTemplates.filter((t) => t.suggested && t.active).map((t) => t.id),
      legalReminders: legal.length === 0 || legal.some((t) => t.active),
      custom: []
    },
    employees: [],
    calendar: {
      highlightWeekdays: [...settings['calendar.highlightWeekdays']],
      dayClosing: settings['businessDay.closingEnabled']
    },
    owner: { displayName: '', username: '', password: '', repeat: '', pin: '' }
  }
}

export const newEmployee = (today: string, roleId: string): DraftEmployee => ({
  key: newKey(),
  firstName: '',
  lastName: '',
  position: '',
  startDate: today,
  hasAccount: false,
  username: '',
  password: '',
  roleId
})

// ── Rooms ────────────────────────────────────────────────────────────────────────────────────────────────────

export const MAX_ROOMS = 500

/** Floors × rooms per floor, numbered floor + two digits: 101, 102 … 201 (G-12). */
export function generateRooms(draft: WizardDraft): DraftRoom[] {
  const floors = toInt(draft.generator.floors) ?? 0
  const perFloor = toInt(draft.generator.perFloor) ?? 0
  return Array.from({ length: floors }, (_, f) =>
    Array.from({ length: perFloor }, (_, n) => ({
      key: newKey(),
      number: `${f + 1}${String(n + 1).padStart(2, '0')}`,
      floor: String(f + 1),
      beds: draft.generator.beds,
      sellable: true,
      roomType: draft.generator.roomType
    }))
  ).flat()
}

/** How many rooms the generator would make (0 when a field is empty or out of range). */
export function generatorCount(draft: WizardDraft): number {
  const floors = toInt(draft.generator.floors) ?? 0
  const perFloor = toInt(draft.generator.perFloor) ?? 0
  return floors * perFloor
}

/** One more room after the last: next number on the same floor. */
export function nextRoom(draft: WizardDraft, fallbackType: RoomTypeRef | null): DraftRoom {
  const last = draft.rooms.at(-1)
  const numbers = new Set(draft.rooms.map((r) => sameName(r.number)))
  let number = last && /^\d+$/.test(last.number.trim()) ? Number(last.number.trim()) + 1 : 101
  while (numbers.has(String(number))) number++
  return {
    key: newKey(),
    number: String(number),
    floor: last?.floor ?? '1',
    beds: last?.beds ?? draft.generator.beds,
    sellable: true,
    roomType: last?.roomType ?? fallbackType
  }
}

export function roomTotals(rooms: readonly DraftRoom[]): { rooms: number; beds: number } {
  return { rooms: rooms.length, beds: rooms.reduce((sum, r) => sum + (toInt(r.beds) ?? 0), 0) }
}

// ── Field ids and checks ─────────────────────────────────────────────────────────────────────────────────────

/** Element ids: a failed check focuses its field and shows the message under it. */
export const ids = {
  hotelName: 'setup-hotel-name',
  hotelCity: 'setup-hotel-city',
  checkIn: 'setup-checkin',
  checkOut: 'setup-checkout',
  baseCurrency: 'setup-base-currency',
  cashMethod: 'setup-cash-method',
  roomTypes: 'setup-room-type-search',
  price: (key: string, which: 'base' | 'weekend' | 'hourly') => `setup-price-${key}-${which}`,
  customType: (tempKey: string) => `setup-custom-type-${tempKey}`,
  generate: 'setup-generate',
  room: (key: string, field: 'number' | 'floor' | 'beds' | 'type') => `setup-room-${key}-${field}`,
  leaveDays: 'setup-leave-days',
  dailyDivisor: 'setup-daily-divisor',
  standardHours: 'setup-standard-hours',
  overtimeHourly: 'setup-overtime-hourly',
  overtimeMultiplier: 'setup-overtime-multiplier',
  holidayMultiplier: 'setup-holiday-multiplier',
  commissionPct: 'setup-commission-pct',
  commissionFixed: 'setup-commission-fixed',
  shift: (key: string, field: 'name' | 'start' | 'end') => `setup-shift-${key}-${field}`,
  employee: (
    key: string,
    field: 'first' | 'last' | 'position' | 'start' | 'username' | 'password' | 'role'
  ) => `setup-employee-${key}-${field}`,
  ownerName: 'setup-owner-name',
  ownerUsername: 'setup-owner-username',
  ownerPassword: 'setup-owner-password',
  ownerRepeat: 'setup-owner-repeat',
  ownerPin: 'setup-owner-pin'
} as const

export type SetupErrorKey =
  | 'setup.errors.required'
  | 'setup.errors.tooLong'
  | 'setup.errors.time'
  | 'setup.errors.wholeNumber'
  | 'setup.errors.decimal'
  | 'setup.errors.price'
  | 'setup.errors.noTypes'
  | 'setup.errors.noRooms'
  | 'setup.errors.tooManyRooms'
  | 'setup.errors.duplicateRoom'
  | 'setup.errors.roomType'
  | 'setup.errors.duplicateName'
  | 'setup.errors.username'
  | 'setup.errors.usernameDuplicate'
  | 'setup.errors.password'
  | 'setup.errors.passwordMismatch'
  | 'setup.errors.pin'
  | 'setup.errors.weakPin'
  | 'setup.errors.date'
  | 'setup.errors.role'

/** Refusals of `setup.finish` that belong to one field (the cash rule is also checked here first). */
export type ServerErrorKey = 'errors.roomNumberTaken' | 'errors.usernameTaken' | 'errors.cashMethodRequired'

export interface FieldError {
  /** The wizard's own checks, or a refusal of `setup.finish` shown under its field. */
  key: SetupErrorKey | ServerErrorKey
  values?: Record<string, number>
}
/** Field id → message, in screen order (the first one gets the focus). */
export type FieldErrors = Record<string, FieldError>

const required = (text: string, max: number): FieldError | null =>
  !text.trim()
    ? { key: 'setup.errors.required' }
    : text.trim().length > max
      ? { key: 'setup.errors.tooLong', values: { max } }
      : null

function checkHotel(d: WizardDraft, out: FieldErrors): void {
  const name = required(d.hotel.name, 80)
  if (name) out[ids.hotelName] = name
  if (d.hotel.city.trim().length > 80)
    out[ids.hotelCity] = { key: 'setup.errors.tooLong', values: { max: 80 } }
  if (!CLOCK.test(d.hotel.checkinTime)) out[ids.checkIn] = { key: 'setup.errors.time' }
  if (!CLOCK.test(d.hotel.checkoutTime)) out[ids.checkOut] = { key: 'setup.errors.time' }
}

function checkPrices(
  key: string,
  base: number | null,
  weekend: number | null,
  hourly: number | null,
  out: FieldErrors
): void {
  if (base !== null && base < 0) out[ids.price(key, 'base')] = { key: 'setup.errors.price' }
  if (weekend !== null && weekend < 0) out[ids.price(key, 'weekend')] = { key: 'setup.errors.price' }
  if (hourly !== null && hourly < 0) out[ids.price(key, 'hourly')] = { key: 'setup.errors.price' }
}

function checkRoomTypes(d: WizardDraft, out: FieldErrors): void {
  if (d.roomTypes.selected.length + d.roomTypes.custom.length === 0)
    out[ids.roomTypes] = { key: 'setup.errors.noTypes' }
  for (const p of d.roomTypes.selected)
    checkPrices(p.id, p.basePriceMinor, p.weekendPriceMinor, p.hourlyPriceMinor, out)
  const seen = new Set<string>()
  for (const c of d.roomTypes.custom) {
    const problem = required(c.name, 80)
    if (problem) out[ids.customType(c.tempKey)] = problem
    else if (seen.has(sameName(c.name)))
      out[ids.customType(c.tempKey)] = { key: 'setup.errors.duplicateName' }
    seen.add(sameName(c.name))
    checkPrices(c.tempKey, c.basePriceMinor, c.weekendPriceMinor, c.hourlyPriceMinor, out)
  }
}

function checkRooms(d: WizardDraft, out: FieldErrors): void {
  if (d.rooms.length === 0) out[ids.generate] = { key: 'setup.errors.noRooms' }
  if (d.rooms.length > MAX_ROOMS)
    out[ids.generate] = { key: 'setup.errors.tooManyRooms', values: { max: MAX_ROOMS } }
  const types = new Set([
    ...d.roomTypes.selected.map((p) => refKey(p)),
    ...d.roomTypes.custom.map((c) => refKey(c))
  ])
  const seen = new Set<string>()
  for (const r of d.rooms) {
    const number = required(r.number, 20)
    if (number) out[ids.room(r.key, 'number')] = number
    else if (seen.has(sameName(r.number)))
      out[ids.room(r.key, 'number')] = { key: 'setup.errors.duplicateRoom' }
    seen.add(sameName(r.number))
    if (r.floor.trim().length > 20)
      out[ids.room(r.key, 'floor')] = { key: 'setup.errors.tooLong', values: { max: 20 } }
    if (!r.roomType || !types.has(refKey(r.roomType)))
      out[ids.room(r.key, 'type')] = { key: 'setup.errors.roomType' }
    if (!inRange(r.beds, 1, 50))
      out[ids.room(r.key, 'beds')] = { key: 'setup.errors.wholeNumber', values: { min: 1, max: 50 } }
  }
}

function checkStaff(d: WizardDraft, out: FieldErrors): void {
  const s = d.staff
  if (!inRange(s.leaveDaysPerMonth, 0, 31))
    out[ids.leaveDays] = { key: 'setup.errors.wholeNumber', values: { min: 0, max: 31 } }
  if (!s.divideByMonthDays && !inRange(s.dailyDivisor, 1, 31))
    out[ids.dailyDivisor] = { key: 'setup.errors.wholeNumber', values: { min: 1, max: 31 } }
  if (!inRange(s.standardHoursPerDay, 1, 24))
    out[ids.standardHours] = { key: 'setup.errors.wholeNumber', values: { min: 1, max: 24 } }
  if (s.overtimeMode === 'hourly_fixed') {
    if (s.overtimeHourlyMinor === null) out[ids.overtimeHourly] = { key: 'setup.errors.required' }
    else if (s.overtimeHourlyMinor < 0) out[ids.overtimeHourly] = { key: 'setup.errors.price' }
  }
  if (s.overtimeMode === 'multiplier' && !DECIMAL.test(s.overtimeMultiplier.trim()))
    out[ids.overtimeMultiplier] = { key: 'setup.errors.decimal' }
  if (!DECIMAL.test(s.holidayMultiplier.trim())) out[ids.holidayMultiplier] = { key: 'setup.errors.decimal' }
  if (s.commissionMode === 'pct' && !DECIMAL.test(s.commissionPct.trim()))
    out[ids.commissionPct] = { key: 'setup.errors.decimal' }
  if (s.commissionMode === 'fixed') {
    if (s.commissionFixedMinor === null) out[ids.commissionFixed] = { key: 'setup.errors.required' }
    else if (s.commissionFixedMinor < 0) out[ids.commissionFixed] = { key: 'setup.errors.price' }
  }
  for (const shift of d.shifts) {
    if (shift.name !== null) {
      const name = required(shift.name, 60)
      if (name) out[ids.shift(shift.key, 'name')] = name
    }
    if (!CLOCK.test(shift.startTime)) out[ids.shift(shift.key, 'start')] = { key: 'setup.errors.time' }
    if (!CLOCK.test(shift.endTime)) out[ids.shift(shift.key, 'end')] = { key: 'setup.errors.time' }
  }
}

const usernameOk = (name: string): boolean => usernameSchema.safeParse(name).success
const userKey = (name: string): string => normalizeUsername(name)

/** The drawer needs a cash payment method: one seeded cash method stays ticked. */
function checkLists(d: WizardDraft, options: SetupOptions, out: FieldErrors): void {
  const cash = options.paymentMethods.filter((m) => m.isCash)
  if (cash.length > 0 && !cash.some((m) => d.lists.paymentMethods.includes(m.id)))
    out[ids.cashMethod] = { key: 'errors.cashMethodRequired' }
}

/** Roles an employee account may get: every role but the owner's (the server refuses it). */
export const employeeRoles = (options: SetupOptions): SetupOptions['roles'] =>
  options.roles.filter((r) => r.code !== 'owner')

/** The role a new employee account starts with: Resepsiyon when the hotel still has it. */
export const defaultEmployeeRole = (options: SetupOptions): string => {
  const roles = employeeRoles(options)
  return (roles.find((r) => r.code === 'reception') ?? roles[0])?.id ?? ''
}

function checkEmployees(d: WizardDraft, options: SetupOptions, out: FieldErrors): void {
  const roles = new Set(employeeRoles(options).map((r) => r.id))
  const taken = new Set<string>()
  for (const e of d.employees) {
    const first = required(e.firstName, 60)
    if (first) out[ids.employee(e.key, 'first')] = first
    const last = required(e.lastName, 60)
    if (last) out[ids.employee(e.key, 'last')] = last
    if (e.position.trim().length > 60)
      out[ids.employee(e.key, 'position')] = { key: 'setup.errors.tooLong', values: { max: 60 } }
    if (!isLocalDate(e.startDate)) out[ids.employee(e.key, 'start')] = { key: 'setup.errors.date' }
    if (!e.hasAccount) continue
    if (!usernameOk(e.username)) out[ids.employee(e.key, 'username')] = { key: 'setup.errors.username' }
    else if (
      taken.has(userKey(e.username)) ||
      (d.owner.username && userKey(e.username) === userKey(d.owner.username))
    )
      out[ids.employee(e.key, 'username')] = { key: 'setup.errors.usernameDuplicate' }
    if (usernameOk(e.username)) taken.add(userKey(e.username))
    if (e.password.length < 8 || e.password.length > 256)
      out[ids.employee(e.key, 'password')] = { key: 'setup.errors.password' }
    if (!roles.has(e.roleId)) out[ids.employee(e.key, 'role')] = { key: 'setup.errors.role' }
  }
}

function checkOwner(d: WizardDraft, out: FieldErrors): void {
  const o = d.owner
  const name = required(o.displayName, 80)
  if (name) out[ids.ownerName] = name
  if (!usernameOk(o.username)) out[ids.ownerUsername] = { key: 'setup.errors.username' }
  else if (
    d.employees.some(
      (e) => e.hasAccount && usernameOk(e.username) && userKey(e.username) === userKey(o.username)
    )
  )
    out[ids.ownerUsername] = { key: 'setup.errors.usernameDuplicate' }
  if (o.password.length < 8 || o.password.length > 256)
    out[ids.ownerPassword] = { key: 'setup.errors.password' }
  else if (o.repeat !== o.password) out[ids.ownerRepeat] = { key: 'setup.errors.passwordMismatch' }
  if (o.pin && !/^\d{4,8}$/.test(o.pin)) out[ids.ownerPin] = { key: 'setup.errors.pin' }
  else if (o.pin && isWeakPin(o.pin)) out[ids.ownerPin] = { key: 'setup.errors.weakPin' }
}

/** What "İleri" checks on one step; {} = the step is fine. */
export function validateStep(step: Step, draft: WizardDraft, options: SetupOptions): FieldErrors {
  const out: FieldErrors = {}
  if (step === 'hotel') checkHotel(draft, out)
  else if (step === 'currencies') {
    if (!/^[A-Z]{3}$/.test(draft.money.baseCurrency)) out[ids.baseCurrency] = { key: 'setup.errors.required' }
  } else if (step === 'roomTypes') checkRoomTypes(draft, out)
  else if (step === 'rooms') checkRooms(draft, out)
  else if (step === 'staff') checkStaff(draft, out)
  else if (step === 'money') checkLists(draft, options, out)
  else if (step === 'employees') checkEmployees(draft, options, out)
  else if (step === 'owner') checkOwner(draft, out)
  return out
}

/** "Kurulumu bitir": the first step that still has a problem, or null when everything can be sent. */
export function firstInvalidStep(
  draft: WizardDraft,
  options: SetupOptions
): { step: Step; errors: FieldErrors } | null {
  for (const step of STEPS) {
    const errors = validateStep(step, draft, options)
    if (Object.keys(errors).length > 0) return { step, errors }
  }
  return null
}

// ── Payload ──────────────────────────────────────────────────────────────────────────────────────────────────

const decimal = (text: string): string => text.trim().replace(',', '.')

/** The `setup.finish` input (setupDraftSchema), built from a draft that passed every step's check. */
export function toSetupDraft(d: WizardDraft, options: SetupOptions): SetupDraft {
  const shiftNames = new Map(options.shifts.map((s) => [s.id, localName(d.language, s.name, s.displayName)]))
  const s = d.staff
  return {
    language: d.language,
    theme: d.theme,
    hotel: {
      name: d.hotel.name.trim(),
      country: d.hotel.country,
      city: d.hotel.city.trim(),
      timezone: d.hotel.timezone,
      checkinTime: d.hotel.checkinTime,
      checkoutTime: d.hotel.checkoutTime
    },
    money: {
      baseCurrency: d.money.baseCurrency,
      currencies: [...new Set([d.money.baseCurrency, ...d.money.currencies])]
    },
    roomTypes: {
      selected: d.roomTypes.selected.map((p) => ({
        id: p.id,
        basePriceMinor: p.basePriceMinor,
        weekendPriceMinor: p.weekendPriceMinor,
        hourlyPriceMinor: p.hourlyPriceMinor
      })),
      custom: d.roomTypes.custom.map((c) => ({
        tempKey: c.tempKey,
        name: c.name.trim(),
        basePriceMinor: c.basePriceMinor,
        weekendPriceMinor: c.weekendPriceMinor,
        hourlyPriceMinor: c.hourlyPriceMinor
      }))
    },
    rooms: d.rooms.map((r) => ({
      number: r.number.trim(),
      floor: r.floor.trim() || null,
      beds: Number(r.beds.trim()),
      sellable: r.sellable,
      // Checked by validateStep('rooms'): every room has one of the chosen types.
      roomType: r.roomType ?? { tempKey: '' }
    })),
    lists: { ...d.lists },
    staff: {
      policy: {
        leaveDaysPerMonth: Number(s.leaveDaysPerMonth.trim()),
        unusedLeavePaid: s.unusedLeavePaid,
        dailyDivisor: s.divideByMonthDays ? 'days_in_month' : Number(s.dailyDivisor.trim()),
        standardHoursPerDay: Number(s.standardHoursPerDay.trim()),
        overtimeMode: s.overtimeMode,
        ...(s.overtimeMode === 'hourly_fixed' && s.overtimeHourlyMinor !== null
          ? { overtimeHourlyMinor: s.overtimeHourlyMinor }
          : {}),
        ...(s.overtimeMode === 'multiplier' ? { overtimeMultiplier: decimal(s.overtimeMultiplier) } : {}),
        holidayMultiplier: decimal(s.holidayMultiplier),
        commissionMode: s.commissionMode,
        ...(s.commissionMode === 'pct' ? { commissionPct: decimal(s.commissionPct) } : {}),
        ...(s.commissionMode === 'fixed' && s.commissionFixedMinor !== null
          ? { commissionFixedMinor: s.commissionFixedMinor }
          : {})
      },
      advanceFromDrawer: s.advanceFromDrawer
    },
    shifts: d.shifts.map((shift) => ({
      ...(shift.id ? { id: shift.id } : {}),
      name: (shift.name ?? (shift.id ? shiftNames.get(shift.id) : undefined) ?? '').trim(),
      startTime: shift.startTime,
      endTime: shift.endTime
    })),
    tasks: {
      suggestions: [...d.tasks.suggestions],
      legalReminders: d.tasks.legalReminders,
      custom: d.tasks.custom.map((task) => ({ title: task.title.trim(), recurrence: task.recurrence }))
    },
    employees: d.employees.map((e) => ({
      firstName: e.firstName.trim(),
      lastName: e.lastName.trim(),
      position: e.position.trim() || null,
      startDate: e.startDate,
      account: e.hasAccount ? { username: e.username.trim(), password: e.password, roleId: e.roleId } : null
    })),
    calendar: { highlightWeekdays: [...d.calendar.highlightWeekdays], dayClosing: d.calendar.dayClosing },
    owner: {
      username: d.owner.username.trim(),
      displayName: d.owner.displayName.trim(),
      password: d.owner.password,
      pin: d.owner.pin || null
    }
  }
}

// ── Saved progress ───────────────────────────────────────────────────────────────────────────────────────────

/** What `setup.saveProgress` keeps: everything but the passwords, the repeat and the PIN (typed again later). */
export function savedDraft(d: WizardDraft): Record<string, unknown> {
  const { displayName, username } = d.owner
  return {
    ...d,
    owner: { displayName, username },
    employees: d.employees.map(({ password: _password, ...rest }) => rest)
  }
}

const text = z.string().max(2000)
const minor = z.number().int().safe().nullable()
const refSchema = z.union([z.object({ id: text }), z.object({ tempKey: text })])
const ids_ = z.array(text).max(500)
/** Each part of a saved draft is taken only when it still has the right shape; otherwise the default stays. */
const part = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined)
const savedSchema = z.object({
  language: part(z.enum(APP_LOCALES)),
  theme: part(z.enum(['light', 'dark', 'system'])),
  mode: part(z.enum(APP_MODES)),
  hotel: part(
    z.object({
      name: text,
      country: text,
      city: text,
      timezone: text,
      checkinTime: text,
      checkoutTime: text
    })
  ),
  money: part(z.object({ baseCurrency: text, currencies: ids_ })),
  roomTypes: part(
    z.object({
      selected: z
        .array(
          z.object({
            id: text,
            basePriceMinor: minor,
            weekendPriceMinor: minor,
            // A draft saved before the hourly step has no such field: empty.
            hourlyPriceMinor: minor.optional().transform((v) => v ?? null)
          })
        )
        .max(200),
      custom: z
        .array(
          z.object({
            tempKey: text,
            name: text,
            basePriceMinor: minor,
            weekendPriceMinor: minor,
            hourlyPriceMinor: minor.optional().transform((v) => v ?? null)
          })
        )
        .max(100)
    })
  ),
  generator: part(z.object({ floors: text, perFloor: text, beds: text, roomType: refSchema.nullable() })),
  rooms: part(
    z
      .array(
        z.object({
          key: text,
          number: text,
          floor: text,
          beds: text,
          sellable: z.boolean(),
          roomType: refSchema.nullable()
        })
      )
      .max(1000)
  ),
  lists: part(
    z.object({
      paymentMethods: ids_,
      salesChannels: ids_,
      extraServices: ids_,
      customPaymentMethods: ids_,
      customSalesChannels: ids_,
      customExtraServices: ids_
    })
  ),
  staff: part(
    z.object({
      leaveDaysPerMonth: text,
      unusedLeavePaid: z.boolean(),
      dailyDivisor: text,
      divideByMonthDays: z.boolean(),
      standardHoursPerDay: text,
      overtimeMode: z.enum(['none', 'hourly_fixed', 'multiplier']),
      overtimeHourlyMinor: minor,
      overtimeMultiplier: text,
      holidayMultiplier: text,
      // Added after the first saved drafts: an older copy without them keeps its other answers.
      commissionMode: z.enum(['none', 'pct', 'fixed']).optional(),
      commissionPct: text.optional(),
      commissionFixedMinor: minor.optional(),
      advanceFromDrawer: z.boolean()
    })
  ),
  shifts: part(
    z
      .array(
        z.object({ key: text, id: text.nullable(), name: text.nullable(), startTime: text, endTime: text })
      )
      .max(20)
  ),
  tasks: part(
    z.object({
      suggestions: ids_,
      legalReminders: z.boolean(),
      // Added after the first saved drafts; a damaged list is dropped, the picked suggestions stay.
      custom: z
        .array(ownTaskSchema.extend({ key: text }))
        .max(OWN_TASKS_MAX)
        .optional()
        .catch(undefined)
    })
  ),
  employees: part(
    z
      .array(
        z.object({
          key: text,
          firstName: text,
          lastName: text,
          position: text,
          startDate: text,
          hasAccount: z.boolean(),
          username: text,
          roleId: text
        })
      )
      .max(200)
  ),
  calendar: part(
    z.object({ highlightWeekdays: z.array(z.number().int().min(0).max(6)).max(7), dayClosing: z.boolean() })
  ),
  owner: part(z.object({ displayName: text, username: text }))
})

/** The keys of `value` that are set (an optional field missing from an older saved draft keeps the default). */
function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>
}

/** A saved draft back into the wizard: unknown or damaged parts fall back to the defaults; secrets start empty. */
export function restoreDraft(saved: unknown, defaults: WizardDraft): WizardDraft {
  const parsed = savedSchema.safeParse(saved)
  if (!parsed.success) return defaults
  const p = parsed.data
  return {
    language: p.language ?? defaults.language,
    theme: p.theme ?? defaults.theme,
    mode: p.mode ?? defaults.mode,
    hotel: p.hotel ?? defaults.hotel,
    money: p.money ?? defaults.money,
    roomTypes: p.roomTypes ?? defaults.roomTypes,
    generator: p.generator ?? defaults.generator,
    rooms: p.rooms ?? defaults.rooms,
    lists: p.lists ?? defaults.lists,
    staff: p.staff ? { ...defaults.staff, ...definedOnly(p.staff) } : defaults.staff,
    shifts: p.shifts ?? defaults.shifts,
    tasks: p.tasks ? { ...defaults.tasks, ...definedOnly(p.tasks) } : defaults.tasks,
    employees: p.employees?.map((e) => ({ ...e, password: '' })) ?? defaults.employees,
    calendar: p.calendar ?? defaults.calendar,
    owner: { ...defaults.owner, ...p.owner, password: '', repeat: '', pin: '' }
  }
}

/** Drops ids the database no longer offers (a saved draft from an older seed): they would be refused. */
export function pruneDraft(d: WizardDraft, options: SetupOptions): WizardDraft {
  const has = (rows: { id: string }[]) => {
    const set = new Set(rows.map((r) => r.id))
    return (id: string) => set.has(id)
  }
  const type = has(options.roomTypes)
  const shift = has(options.shifts)
  const task = has(options.taskTemplates)
  const role = has(employeeRoles(options))
  const selected = d.roomTypes.selected.filter((p) => type(p.id))
  const chosen: RoomTypeRef[] = [
    ...selected.map((p) => ({ id: p.id })),
    ...d.roomTypes.custom.map((c) => ({ tempKey: c.tempKey }))
  ]
  const current = d.generator.roomType
  const roomType =
    current && chosen.some((r) => refKey(r) === refKey(current)) ? current : (chosen[0] ?? null)
  return {
    ...d,
    roomTypes: { ...d.roomTypes, selected },
    generator: { ...d.generator, roomType },
    lists: {
      ...d.lists,
      paymentMethods: d.lists.paymentMethods.filter(has(options.paymentMethods)),
      salesChannels: d.lists.salesChannels.filter(has(options.salesChannels)),
      extraServices: d.lists.extraServices.filter(has(options.extraServices))
    },
    shifts: d.shifts.map((s) => (s.id && !shift(s.id) ? { ...s, id: null, name: s.name ?? '' } : s)),
    tasks: { ...d.tasks, suggestions: d.tasks.suggestions.filter(task) },
    employees: d.employees.map((e) => (role(e.roleId) ? e : { ...e, roleId: defaultEmployeeRole(options) }))
  }
}

// ── Server answers ───────────────────────────────────────────────────────────────────────────────────────────

/** Top-level keys of setupDraftSchema → the step that edits them. */
const SECTION_STEP: Record<string, Step> = {
  language: 'language',
  theme: 'language',
  hotel: 'hotel',
  money: 'currencies',
  roomTypes: 'roomTypes',
  rooms: 'rooms',
  lists: 'money',
  staff: 'staff',
  shifts: 'staff',
  tasks: 'staff',
  employees: 'employees',
  calendar: 'calendar',
  owner: 'owner'
}

/**
 * Where a refused `setup.finish` belongs: a taken room number on the rooms step (its field), a taken username on
 * the owner or employees step, a validation error on the step of its first section; anything else stays put.
 */
export function locateServerError(
  error: { messageKey: string; details: unknown },
  draft: WizardDraft
): { step: Step; field: string | null } | null {
  const details = (error.details ?? {}) as Record<string, unknown>
  if (error.messageKey === 'errors.roomNumberTaken') {
    const number = typeof details['number'] === 'string' ? sameName(details['number']) : null
    const room = draft.rooms.find((r) => sameName(r.number) === number)
    return { step: 'rooms', field: room ? ids.room(room.key, 'number') : null }
  }
  if (error.messageKey === 'errors.usernameTaken') {
    const name = typeof details['username'] === 'string' ? userKey(details['username']) : null
    const employee = draft.employees.find(
      (e) => e.hasAccount && usernameOk(e.username) && userKey(e.username) === name
    )
    return employee
      ? { step: 'employees', field: ids.employee(employee.key, 'username') }
      : { step: 'owner', field: ids.ownerUsername }
  }
  if (error.messageKey === 'errors.setupClientMode') return { step: 'mode', field: null }
  if (error.messageKey === 'errors.cashMethodRequired') return { step: 'money', field: ids.cashMethod }
  if (error.messageKey === 'errors.validation') {
    const fieldErrors = (details['fieldErrors'] ?? {}) as Record<string, unknown>
    const steps = Object.keys(fieldErrors).flatMap((k) => (SECTION_STEP[k] ? [SECTION_STEP[k]] : []))
    const first = STEPS.find((s) => steps.includes(s))
    return first ? { step: first, field: null } : null
  }
  return null
}
