// E2E helper (QA2b): the longest unbroken text (no spaces) the service accepts, written through the API into every
// free-text field a screen shows back — notes, titles, names, descriptions — so the overflow tour can check that
// no screen sticks out sideways (the text wraps inside its box). Lengths come from the contract's own schemas
// (src/shared/contract/limits.ts), so a limit raised in the contract is tested at its new edge. Invented data.
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { maxLengthOf } from '../../src/shared/contract/limits'
import {
  calendarNoteInputSchema,
  lostItemInputSchema,
  noteInputSchema,
  taskInputSchema
} from '../../src/shared/contract/operations'
import { contactInputSchema } from '../../src/shared/contract/supply'
import {
  companyInputSchema,
  blacklistInputSchema,
  standingNoteInputSchema
} from '../../src/shared/contract/guests'
import {
  reservationCreateSchema,
  newGuestSchema,
  paymentCreateSchema
} from '../../src/shared/contract/reservations'
import { expenseCreateSchema } from '../../src/shared/contract/expenses'
import { employeeCreateSchema } from '../../src/shared/contract/staff'
import { dayNoteSchema } from '../../src/shared/contract/ledger'
import { api } from './bridge'
import { freeRoom, hotelToday, shiftDay } from './shared-hotel'

/** `n` wide letters without a space: the worst case for wrapping. */
export const unbroken = (n: number, c = 'W'): string => c.repeat(n)

const L = (schema: Parameters<typeof maxLengthOf>[0], c = 'W'): string => unbroken(maxLengthOf(schema), c)

async function must<T>(page: Page, name: string, body: unknown = {}): Promise<T> {
  const res = await api<T>(page, name, body)
  expect(res.status, `${name}: ${JSON.stringify(res.body).slice(0, 300)}`).toBe(200)
  return res.body
}

interface Named {
  id: string
  name: string
}

/** Writes the long records (once per hotel: a second call finds the marker task and does nothing). */
export async function seedLongText(page: Page): Promise<void> {
  const today = await hotelToday(page)
  const marker = unbroken(maxLengthOf(taskInputSchema.shape.title), 'Q')
  const tasks = await must<{ title: string }[]>(page, 'tasks.list', {})
  if (tasks.some((t) => t.title === marker)) return

  // Daily operations (akış B).
  await must(page, 'calendarNotes.add', {
    kind: 'special',
    title: L(calendarNoteInputSchema.shape.title),
    note: L(calendarNoteInputSchema.shape.note),
    target: { mode: 'single', date: today }
  })
  await must(page, 'tasks.create', {
    title: marker,
    description: L(taskInputSchema.shape.description),
    note: L(taskInputSchema.shape.note),
    dueAt: `${today}T20:00`
  })
  await must(page, 'shift.saveHandover', { text: unbroken(5000) })
  await must(page, 'notes.add', { kind: 'board', text: L(noteInputSchema.shape.text), pinned: true })
  await must(page, 'notes.add', { kind: 'personal', text: L(noteInputSchema.shape.text) })
  await must(page, 'lostItems.create', {
    description: L(lostItemInputSchema.shape.description),
    locationText: L(lostItemInputSchema.shape.locationText),
    storageLocation: L(lostItemInputSchema.shape.storageLocation),
    foundBy: L(lostItemInputSchema.shape.foundBy),
    note: L(lostItemInputSchema.shape.note)
  })
  await must(page, 'housekeeping.reportIssue', {
    area: unbroken(80),
    title: unbroken(120),
    description: unbroken(2000),
    severity: 'low'
  })
  await must(page, 'tasks.addTemplate', {
    title: unbroken(160),
    description: unbroken(2000),
    kind: 'maintenance',
    recurrence: { kind: 'interval', unit: 'months', every: 6, time: '10:00' },
    firstDueAt: shiftDay(today, 3)
  })
  const contact = await must<{ id: string }>(page, 'contacts.create', {
    name: L(contactInputSchema.shape.name),
    category: 'custom',
    customCategory: unbroken(60),
    phones: [{ label: unbroken(40), number: unbroken(40, '1') }],
    address: unbroken(500),
    note: unbroken(1000),
    favorite: true
  })
  const laundry = await must<{ id: string }>(page, 'contacts.create', {
    name: unbroken(120, 'L'),
    category: 'laundry',
    note: unbroken(1000)
  })
  const types = await must<Named[]>(page, 'lists.list', { kind: 'laundryItemTypes' })
  if (types[0])
    await must(page, 'laundry.recordDelivery', {
      date: today,
      direction: 'out',
      contactId: laundry.id,
      slipNo: unbroken(40, '9'),
      note: unbroken(500),
      items: [{ itemTypeId: types[0].id, qty: 3 }]
    })
  const categories = await must<Named[]>(page, 'supply.categories', {})
  await must(page, 'supply.createProduct', {
    name: unbroken(120),
    categoryId: categories[0]!.id,
    supplierContactId: contact.id,
    unit: 'kg',
    trackStock: false
  })

  // A guest in the house with every note filled (akış A: rezervasyon, misafir, firma, kara liste, defter, personel).
  const options = await must<{ channels: { id: string }[] }>(page, 'booking.options')
  const room = await freeRoom(page, shiftDay(today, -1), shiftDay(today, 2))
  const company = await must<{ id: string }>(page, 'companies.create', {
    title: L(companyInputSchema.shape.title),
    address: unbroken(500),
    city: unbroken(80),
    taxOffice: unbroken(120),
    contactPerson: unbroken(120),
    note: unbroken(1000)
  })
  const booked = await must<{ reservation: { id: string }; stays: { id: string }[] }>(
    page,
    'booking.create',
    {
      guest: {
        firstName: L(newGuestSchema.shape.firstName),
        lastName: L(newGuestSchema.shape.lastName),
        phone: unbroken(40, '5')
      },
      channelId: options.channels[0]!.id,
      channelRef: unbroken(80, '7'),
      notes: L(reservationCreateSchema.shape.notes),
      stays: [
        {
          roomId: room.id,
          checkIn: shiftDay(today, -1),
          checkOut: shiftDay(today, 2),
          nightlyPriceMinor: 100_000
        }
      ]
    }
  )
  await must(page, 'booking.addNote', { reservationId: booked.reservation.id, text: unbroken(2000) })
  const stayId = booked.stays[0]!.id
  await must(page, 'booking.checkIn', { stayId })
  await must(page, 'inHouse.addPerson', { stayId, fullName: unbroken(120), descriptorNote: unbroken(200) })
  await must(page, 'housekeeping.setNote', { roomId: room.id, note: unbroken(200) })
  const view = await must<{ guest: { id: string } }>(page, 'booking.get', { id: booked.reservation.id })
  await must(page, 'guests.update', {
    id: view.guest.id,
    patch: { notes: unbroken(2000), companyId: company.id }
  })
  await must(page, 'guests.setStandingNote', {
    id: view.guest.id,
    note: { standingNote: L(standingNoteInputSchema.shape.standingNote), standingNoteLevel: 'info' }
  })
  await must(page, 'blacklist.add', {
    name: unbroken(160),
    phone: unbroken(40, '4'),
    severity: 'warn',
    reasonCode: 'other',
    reasonText: L(blacklistInputSchema.shape.reasonText)
  })
  const ledger = await must<{
    methods: { id: string; isCash: boolean }[]
    sections: { id: string; canEdit: boolean }[]
    baseCurrency: string
  }>(page, 'ledger.options')
  await must(page, 'ledger.addPayment', {
    reservationId: booked.reservation.id,
    date: today,
    methodId: ledger.methods[0]!.id,
    amountMinor: 50_000,
    currency: ledger.baseCurrency,
    reference: unbroken(120, '8'),
    note: L(paymentCreateSchema.shape.note)
  })
  await must(page, 'ledger.addExpense', {
    date: today,
    sectionId: ledger.sections.find((s) => s.canEdit)!.id,
    amountMinor: 12_300,
    currency: ledger.baseCurrency,
    description: L(expenseCreateSchema.shape.description)
  })
  await must(page, 'ledger.setDayNote', { date: today, note: L(dayNoteSchema.shape.note) })
  await must(page, 'staff.createEmployee', {
    firstName: L(employeeCreateSchema.shape.firstName),
    lastName: L(employeeCreateSchema.shape.lastName),
    position: unbroken(60),
    phone: unbroken(40, '3'),
    startDate: shiftDay(today, -30),
    notes: L(employeeCreateSchema.shape.notes)
  })
}
