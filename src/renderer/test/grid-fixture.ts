// Test helper (not part of the app bundle): the calendar's procedures answered from the demo hotel, so screen tests
// see the shapes the real service returns (`reservations.grid` …) with the demo's ids — the reservation panel,
// still on the demo hotel until P5b, then opens the same reservation the grid shows.
import type { ProcedureName, ProcedureOutput } from '@shared/contract'
import { addDays, type LocalDate } from '@shared/date'
import { normalizeName } from '@shared/domain/normalize'
import type { DemoHotel } from '@/mocks/types'
import type { Transport } from '@/lib/transport'
import { fakeTransport, type FakeTransport } from './render'

type Grid = ProcedureOutput<'reservations.grid'>
type Tag = ProcedureOutput<'statusTags.list'>[number]

const ON_GRID = ['tentative', 'confirmed', 'checked_in', 'checked_out'] as const
type OnGrid = (typeof ON_GRID)[number]
const onGrid = (s: string): s is OnGrid => (ON_GRID as readonly string[]).includes(s)

/** `reservations.grid` for [from, to) built from the demo hotel. */
export function gridFromDemo(hotel: DemoHotel, from: LocalDate, to: LocalDate): Grid {
  const inRange = (d: LocalDate) => d >= from && d < to
  const stays: Grid['stays'] = []
  for (const r of hotel.reservations) {
    if (!onGrid(r.status)) continue
    const guest = hotel.guests.find((g) => g.id === r.guestId)
    for (const s of r.stays) {
      if (s.status === 'cancelled') continue
      if (!(s.dayUse ? inRange(s.checkIn) : s.nights.some((n) => inRange(n.date)))) continue
      stays.push({
        id: s.id,
        reservationId: r.id,
        code: r.code,
        roomId: s.roomId,
        checkIn: s.checkIn,
        checkOut: s.checkOut,
        dayUse: s.dayUse,
        reservationStatus: r.status,
        stayStatus: s.status,
        guestName: guest ? `${guest.firstName} ${guest.lastName}` : '',
        currency: 'TRY',
        nights: s.nights.map((n) => ({ date: n.date, pay: n.pay, priceMinor: n.priceMinor })),
        tagIds: r.tagIds,
        vip: guest?.vip ?? false,
        kbsMissing:
          s.status === 'in_house' &&
          s.occupants.some((o) => !o.kbsReportedAt || (o.leftAt && !o.kbsCheckoutAt)),
        standingNote: guest?.standingNote
          ? { text: guest.standingNote, level: guest.standingNoteLevel }
          : null,
        hasNotes: r.notes.length > 0,
        children: r.children
      })
    }
  }
  return {
    today: hotel.today,
    from,
    to,
    rooms: hotel.rooms.map((room) => ({
      id: room.id,
      number: room.number,
      floor: String(room.floor),
      typeId: room.typeCode,
      typeName: room.typeName.tr,
      typeNameI18n: room.typeName,
      beds: room.beds,
      sellable: room.sellable,
      hk: room.hk
    })),
    stays,
    blocks: hotel.blocks
      .filter((b) => b.dateFrom < to && b.dateTo > from)
      .map((b) => ({ ...b, note: null, manual: true })),
    days: hotel.specialDays
      .filter((d) => inRange(d.date))
      .map((d) => ({
        id: `day-${d.date}`,
        date: d.date,
        kind: d.kind,
        title: d.name.tr,
        titleI18n: d.name,
        note: null,
        estimated: false
      }))
  }
}

/** The demo's own tags as `statusTags.list` returns custom tags. */
function customTags(hotel: DemoHotel): Tag[] {
  return hotel.customTags.map((tag, i) => ({
    id: tag.id,
    code: `custom_${i}`,
    kind: 'custom',
    name: tag.name,
    nameI18n: null,
    color: tag.color,
    description: tag.description,
    enabled: tag.enabled,
    sort: 100 + i,
    priorityOverAuto: tag.priorityOverAuto,
    displayName: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z'
  }))
}

export interface CalendarTransportOptions {
  /** Answer of `reservations.grid`; default: from the demo hotel. */
  grid?: (input: { from: LocalDate; to: LocalDate }) => Promise<Grid>
  /** The transport the calendar's answers sit on (default: the shared fake); e.g. `bookingTransport()` for the panel. */
  base?: FakeTransport
  /** Answer of `housekeeping.openIssuesByRoom` (default: none). */
  openIssues?: ProcedureOutput<'housekeeping.openIssuesByRoom'>
  /** Answer of `calendar.bounds` (default: last year … ten years on from the demo's today). */
  bounds?: () => Promise<ProcedureOutput<'calendar.bounds'>>
  /** Answer of `reservations.findStays` (default: guest name or exact room number over the demo hotel). */
  findStays?: (query: string) => ProcedureOutput<'reservations.findStays'>
  /** Answer of `reservations.recentEnded` (default: none). */
  recentEnded?: ProcedureOutput<'reservations.recentEnded'>
}

/**
 * The fake main process (settings, tags, sign-in) plus the calendar's procedures over the demo hotel. Notes added
 * with `calendar.addNote` show up in later grid reads.
 */
export function calendarTransport(hotel: DemoHotel, opts: CalendarTransportOptions = {}): FakeTransport {
  const base = opts.base ?? fakeTransport()
  const original = base.call.bind(base)
  const notes: Grid['days'] = []
  // Blocks closed and lifted on the calendar (reservations.createBlock / cancelBlock) show in later grid reads.
  const added: Grid['blocks'] = []
  const lifted = new Set<string>()
  const call = (async (name: ProcedureName, input: unknown): Promise<unknown> => {
    const n = name as ProcedureName
    if (n === 'statusTags.list') {
      await original(n, input as never)
      return [...base.tags, ...customTags(hotel)] as never
    }
    if (n === 'reservations.grid') {
      base.calls.push({ name: n, input })
      const range = input as { from: LocalDate; to: LocalDate }
      const grid = opts.grid ? await opts.grid(range) : gridFromDemo(hotel, range.from, range.to)
      return {
        ...grid,
        blocks: [
          ...grid.blocks,
          ...added.filter((b) => b.dateFrom < range.to && b.dateTo > range.from)
        ].filter((b) => !lifted.has(b.id)),
        days: [...grid.days, ...notes.filter((d) => d.date >= range.from && d.date < range.to)]
      } as never
    }
    if (n === 'housekeeping.openIssuesByRoom') {
      base.calls.push({ name: n, input })
      return (opts.openIssues ?? []) as never
    }
    if (n === 'reservations.createBlock') {
      base.calls.push({ name: n, input })
      const data = input as Omit<Grid['blocks'][number], 'id' | 'manual' | 'note'> & { note?: string | null }
      const block = { ...data, id: `cal-block-${added.length + 1}`, note: data.note ?? null, manual: true }
      added.push(block)
      return block as never
    }
    if (n === 'reservations.cancelBlock') {
      base.calls.push({ name: n, input })
      const { id } = input as { id: string }
      lifted.add(id)
      const block = [...added, ...hotel.blocks].find((b) => b.id === id)
      return { ...block, note: null, manual: true } as never
    }
    if (n === 'reservations.recentEnded') {
      base.calls.push({ name: n, input })
      return (opts.recentEnded ?? []) as never
    }
    if (n === 'today.summary') {
      // The strip above the grid (P17c): today's arrivals and departures read off the demo hotel.
      base.calls.push({ name: n, input })
      const grid = gridFromDemo(hotel, addDays(hotel.today, -400), addDays(hotel.today, 400))
      const row = (s: Grid['stays'][number]) => ({
        stayId: s.id,
        reservationId: s.reservationId,
        reservationCode: s.code,
        roomNumber: hotel.rooms.find((r) => r.id === s.roomId)?.number ?? '',
        guestName: s.guestName,
        checkIn: s.checkIn,
        checkOut: s.checkOut,
        nights: s.nights.length,
        checkedInAt: s.stayStatus === 'planned' ? null : '2026-10-04T08:00:00.000Z',
        checkedOutAt: s.stayStatus === 'done' ? '2026-10-04T08:00:00.000Z' : null,
        overdue: false,
        note: null,
        balanceMinor: null,
        currency: null
      })
      const inHouse = grid.stays.filter((s) => s.stayStatus === 'in_house')
      return {
        at: '2026-10-04T09:00:00.000Z',
        today: hotel.today,
        nowTime: '09:00',
        checkoutTime: '12:00',
        sellableRooms: hotel.rooms.length,
        soldTonight: inHouse.length,
        arrivals: grid.stays.filter((s) => s.checkIn === hotel.today).map(row),
        departures: grid.stays.filter((s) => s.checkOut === hotel.today).map(row),
        inHouse: { rooms: inHouse.length, people: inHouse.length },
        kbsMissing: null,
        dirtyRooms: null,
        tasks: null,
        handovers: null,
        drawer: null,
        specialDays: [],
        reminders: []
      } as never
    }
    if (n === 'calendar.bounds') {
      base.calls.push({ name: n, input })
      if (opts.bounds) return (await opts.bounds()) as never
      const year = Number(hotel.today.slice(0, 4))
      return { firstYear: year - 1, lastYear: year + 10 } as never
    }
    if (n === 'reservations.findStays') {
      base.calls.push({ name: n, input })
      const query = (input as { query: string }).query
      if (opts.findStays) return opts.findStays(query) as never
      const q = normalizeName(query)
      const room = hotel.rooms.find((r) => r.number === query.trim())
      const grid = gridFromDemo(hotel, addDays(hotel.today, -400), addDays(hotel.today, 400))
      return grid.stays
        .filter((s) => (room ? s.roomId === room.id : normalizeName(s.guestName).includes(q)))
        .slice(0, 20)
        .map((s) => ({
          stayId: s.id,
          reservationId: s.reservationId,
          code: s.code,
          guestName: s.guestName,
          roomId: s.roomId,
          roomNumber: hotel.rooms.find((r) => r.id === s.roomId)?.number ?? '',
          checkIn: s.checkIn,
          checkOut: s.checkOut,
          reservationStatus: s.reservationStatus
        })) as never
    }
    if (n === 'reservations.freeRooms') {
      base.calls.push({ name: n, input })
      const { checkIn, checkOut } = input as { checkIn: LocalDate; checkOut: LocalDate }
      const end = checkOut === checkIn ? addDays(checkIn, 1) : checkOut
      const grid = gridFromDemo(hotel, checkIn, end)
      const busy = new Set([
        ...grid.stays
          .filter((s) => s.checkIn < end && (s.dayUse || s.checkOut > checkIn))
          .map((s) => s.roomId),
        ...grid.blocks.map((b) => b.roomId)
      ])
      return { roomIds: hotel.rooms.filter((r) => !busy.has(r.id)).map((r) => r.id) } as never
    }
    if (n === 'calendar.addNote') {
      base.calls.push({ name: n, input })
      const data = input as {
        title: string
        note?: string | null
        target: { mode: string; date?: LocalDate }
      }
      const date = data.target.date as LocalDate
      notes.push({
        id: `note-${notes.length}`,
        date,
        kind: 'note',
        title: data.title,
        titleI18n: null,
        note: data.note ?? null,
        estimated: false
      })
      return { count: 1 } as never
    }
    return original(n, input as never)
  }) as Transport['call']
  return Object.assign(base, { call }) as FakeTransport
}
