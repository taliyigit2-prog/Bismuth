// Test helper (imported by tests only, never by the app): an in-memory stand-in for the reservation panel's
// procedures (booking.*), over the shared settings/status-tag fake (src/renderer/test/render.tsx). It follows the
// shared rules the services use — payments fill the nights first-night-first (§6.3), the cell style (§6.14), the
// blacklist match (§6.9) — and records every call. Names and amounts are invented.
import {
  SETTINGS_DEFAULTS,
  STATUS_KEYS,
  type ProcedureInput,
  type ProcedureName,
  type ProcedureOutput
} from '@shared/contract'
import { addDays, localDate, type LocalDate } from '@shared/date'
import { matchBlacklist } from '@shared/domain/blacklist'
import { cellStyle } from '@shared/domain/cell-status'
import { normalizeName } from '@shared/domain/normalize'
import { allocatePayments, folioTotals } from '@shared/domain/payment-allocation'
import { hourlyAmountMinor, staySlots } from '@shared/domain/stays'
import { fakeTransport, type FakeTransport, type FakeTransportOptions } from '@/test/render'
import { ApiError } from '@/lib/transport/types'

type View = ProcedureOutput<'booking.get'>
type Options = ProcedureOutput<'booking.options'>
type Summary = ProcedureOutput<'booking.guestSummary'>
type Parked = ProcedureOutput<'booking.listParked'>[number]
type Day = ProcedureOutput<'calendar.days'>[number]

export interface FakeGuest {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  vip?: boolean
  stays?: number
  summary?: Partial<Summary>
}

export interface BookingState {
  options: Options
  guests: FakeGuest[]
  blacklist: {
    id: string
    name: string
    phone?: string | null
    severity: 'warn' | 'block'
    reasonText: string
  }[]
  views: Record<string, View>
  parked: Parked[]
  days: Day[]
  taken: { occupied: string[]; blocked: string[]; notForSale?: string[] }
  /** What `booking.hourlyCheck` answers besides the suggested price (a clash, a cleaning-gap warning). */
  hourly?: Partial<ProcedureOutput<'booking.hourlyCheck'>>
  /** Room numbers `booking.kbsGaps` reports as lacking KBS information (S-124). */
  kbsGapRooms?: string[]
  payments: Record<string, { kind: 'payment' | 'deposit' | 'refund'; amountMinor: number }[]>
  /** Groups booked in this session (P17b): id → name, leader and folio mode; the rooms are the views with that group. */
  groups?: Record<
    string,
    { name: string; leader: string; folioMode: 'single' | 'per_room'; voided: boolean; notes: string[] }
  >
}

const TODAY = localDate('2026-10-04')
const i18n = (tr: string, en = tr, ru = tr) => ({ tr, en, ru })

export function defaultBookingState(): BookingState {
  const room = (
    id: string,
    number: string,
    floor: string,
    base: number,
    weekend: number | null,
    hourly: number | null = null
  ) => ({
    id,
    number,
    floor,
    roomTypeId: `type-${number}`,
    typeName: 'Standart',
    typeNameI18n: i18n('Standart', 'Standard', 'Стандарт'),
    beds: 2,
    sellable: true,
    hkStatus: 'clean',
    basePriceMinor: base,
    weekendPriceMinor: weekend,
    hourlyPriceMinor: hourly,
    priceCurrency: 'TRY',
    openIssues: [] as Options['rooms'][number]['openIssues']
  })
  return {
    options: {
      today: TODAY,
      baseCurrency: 'TRY',
      currencies: ['TRY', 'EUR', 'USD'],
      highlightWeekdays: [6, 0],
      weekendNights: [5, 6],
      rooms: [
        room('room-101', '101', '1', 280_000, 320_000, 30_000),
        room('room-102', '102', '1', 270_000, null)
      ],
      channels: [
        { id: 'ch-direct', code: 'direct', name: 'Direkt', nameI18n: i18n('Direkt', 'Direct', 'Напрямую') },
        { id: 'ch-booking', code: 'booking', name: 'Booking.com', nameI18n: null }
      ],
      methods: [
        {
          id: 'm-cash',
          code: 'cash',
          name: 'Nakit',
          nameI18n: i18n('Nakit', 'Cash', 'Наличные'),
          isCash: true
        },
        {
          id: 'm-card',
          code: 'card',
          name: 'Kart',
          nameI18n: i18n('Kredi kartı', 'Card', 'Карта'),
          isCash: false
        }
      ]
    },
    guests: [],
    blacklist: [],
    views: {},
    parked: [],
    days: [],
    taken: { occupied: [], blocked: [] },
    payments: {}
  }
}

const enabled = new Set(STATUS_KEYS)

/** Rebuilds nights' payment status and colour from the recorded payments (§6.3, §6.14). */
function repaint(view: View, payments: BookingState['payments'][string]): View {
  const nights = view.stays.flatMap((s, roomSort) =>
    s.nights.map((n) => ({ id: n.id, date: n.date, roomSort, priceMinor: n.priceMinor }))
  )
  const credits = payments.map((p) => ({ kind: p.kind, amountFolioMinor: p.amountMinor }))
  const byNight = new Map(allocatePayments(nights, credits).map((a) => [a.night.id, a]))
  const totals = folioTotals(
    nights.map((n) => ({ amountMinor: n.priceMinor })),
    credits
  )
  return {
    ...view,
    folio: { ...view.folio, ...totals },
    stays: view.stays.map((s) => ({
      ...s,
      nights: s.nights.map((n) => {
        const a = byNight.get(n.id)
        const pay = a?.status ?? 'unpaid'
        return {
          ...n,
          payStatus: pay,
          allocatedMinor: a?.allocatedMinor ?? 0,
          style: cellStyle({ pay, dayUse: s.dayUse, blocked: false, past: n.date < TODAY }, enabled)
        }
      })
    }))
  }
}

export type BookingTransport = FakeTransport & {
  booking: BookingState
  callsTo: (name: ProcedureName) => unknown[]
}

/** A transport answering booking.* (and calendar.days) from `state`; everything else goes to the shared fake. */
export function bookingTransport(
  opts: { state?: Partial<BookingState>; fake?: FakeTransportOptions } = {}
): BookingTransport {
  const base = fakeTransport(SETTINGS_DEFAULTS, opts.fake)
  const state: BookingState = { ...defaultBookingState(), ...opts.state }
  const calls: { name: ProcedureName; input: unknown }[] = []
  let next = 1

  const create = (input: ProcedureInput<'booking.create'>): View => {
    const hits = matchBlacklist(
      'id' in input.guest
        ? { name: guestName(input.guest.id) }
        : { name: `${input.guest.firstName} ${input.guest.lastName ?? ''}`, phone: input.guest.phone },
      state.blacklist.map((b) => ({ ...b, nameNormalized: normalizeName(b.name), status: 'active' as const }))
    )
    if (hits.length && !input.blacklistConfirmed)
      throw new ApiError('CONFLICT', 409, 'errors.blacklistMatch', {
        hits: hits.map((h) => ({
          entryId: h.entry.id,
          name: h.entry.name,
          severity: h.entry.severity,
          reasons: h.reasons,
          reasonText: null
        }))
      })
    const id = `res-${next++}`
    const guest =
      'id' in input.guest
        ? state.guests.find((g) => g.id === (input.guest as { id: string }).id)!
        : {
            id: `guest-${next++}`,
            firstName: input.guest.firstName,
            lastName: input.guest.lastName ?? '',
            phone: null
          }
    const view: View = {
      reservation: {
        id,
        code: `R-2026-00000${next}`,
        status: input.status ?? 'confirmed',
        kind: input.stays.every((s) => s.checkIn === s.checkOut) ? 'day_use' : 'overnight',
        channelId: input.channelId,
        channelRef: input.channelRef ?? null,
        adults: null,
        children: null,
        notes: input.notes ?? null,
        parkedReason: null,
        parkedNote: null,
        cancelReason: null,
        group: null,
        createdAt: '2026-10-04T09:00:00.000Z'
      },
      guest: {
        id: guest.id,
        firstName: guest.firstName,
        lastName: guest.lastName,
        phone: guest.phone,
        email: null,
        nationality: null,
        vip: false
      },
      standingNote: null,
      stays: input.stays.map((s, i) => {
        const room = state.options.rooms.find((r) => r.id === s.roomId)!
        const price = new Map((s.prices ?? []).map((p) => [p.date, p.priceMinor]))
        return {
          id: `${id}-stay-${i}`,
          roomId: s.roomId,
          roomNumber: room.number,
          roomTypeName: room.typeName,
          roomTypeNameI18n: room.typeNameI18n,
          checkIn: s.checkIn as LocalDate,
          checkOut: s.checkOut as LocalDate,
          status: 'planned' as const,
          checkedInAt: null,
          checkedOutAt: null,
          dayUse: s.checkIn === s.checkOut,
          startTime: s.startTime ?? null,
          endTime: s.endTime ?? null,
          nights: staySlots(
            localDate(s.checkIn),
            localDate(s.checkOut),
            s.startTime && s.endTime ? { start: s.startTime, end: s.endTime } : undefined
          ).map((slot) => ({
            id: `${id}-${i}-${slot.date}`,
            date: slot.date,
            slot: slot.slot,
            startTime: slot.startTime ?? null,
            endTime: slot.endTime ?? null,
            priceMinor: price.get(slot.date) ?? s.nightlyPriceMinor ?? 0,
            currency: input.currency ?? 'TRY',
            payStatus: 'unpaid' as const,
            allocatedMinor: 0,
            style: { auto: 'unpaid', fill: null, border: null, depositIcon: false }
          })),
          occupants: [],
          kbsIssues: [],
          openIssues: room.openIssues
        }
      }),
      folio: {
        id: `folio-${id}`,
        currency: input.currency ?? 'TRY',
        chargesMinor: 0,
        creditedMinor: 0,
        balanceMinor: 0
      },
      payments: [],
      occupantsVisible: true,
      tagIds: input.tagIds ?? [],
      notes: []
    }
    state.payments[id] = []
    state.views[id] = repaint(view, [])
    return state.views[id]
  }

  const guestName = (id: string): string => {
    const g = state.guests.find((x) => x.id === id)
    return g ? `${g.firstName} ${g.lastName}` : ''
  }

  /** A payment, deposit or refund on a reservation: the nights repaint and the folio totals follow. */
  function addPayment(
    id: string,
    kind: 'payment' | 'deposit' | 'refund',
    amountMinor: number,
    methodId: string
  ) {
    const list = (state.payments[id] ??= [])
    list.push({ kind, amountMinor })
    const view = repaint(state.views[id]!, list)
    state.views[id] = {
      ...view,
      payments: list.map((p, n) => ({
        id: `pay-${n}`,
        date: TODAY,
        kind: p.kind,
        methodId,
        channelId: null,
        amountMinor: p.amountMinor,
        currency: 'TRY',
        amountFolioMinor: p.amountMinor,
        rateStale: false,
        rateObservedAt: null,
        voided: false,
        collected: false,
        reference: null,
        note: null,
        createdAt: '2026-10-04T10:00:00.000Z'
      }))
    }
    return state.views[id]
  }

  /** The group panel's view, built from the reservations the fake holds for the group. */
  const groupView = (groupId: string): ProcedureOutput<'booking.group'> => {
    const group = state.groups?.[groupId]
    if (!group) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
    const rooms = Object.values(state.views).filter((v) => v.reservation.group?.id === groupId)
    return {
      id: groupId,
      name: group.name,
      folioMode: group.folioMode,
      voided: group.voided,
      leader: { id: 'leader', name: group.leader },
      rooms: rooms.map((v) => ({
        reservationId: v.reservation.id,
        code: v.reservation.code,
        status: v.reservation.status,
        guestId: v.guest.id,
        guestName: `${v.guest.firstName} ${v.guest.lastName}`.trim(),
        stays: v.stays.map((s) => ({
          stayId: s.id,
          roomId: s.roomId,
          roomNumber: s.roomNumber,
          checkIn: s.checkIn,
          checkOut: s.checkOut,
          status: s.status
        })),
        currency: v.folio.currency,
        chargesMinor: v.folio.chargesMinor,
        balanceMinor: v.folio.balanceMinor
      })),
      totals: {
        currency: 'TRY',
        chargesMinor: rooms.reduce((sum, v) => sum + v.folio.chargesMinor, 0),
        balanceMinor: rooms.reduce((sum, v) => sum + (v.folio.balanceMinor ?? 0), 0),
        payableMinor: rooms.reduce((sum, v) => sum + Math.max(0, v.folio.balanceMinor ?? 0), 0)
      },
      notes: group.notes.map((text, n) => ({
        id: `note-${n}`,
        reservationId: rooms[0]?.reservation.id ?? '',
        text,
        createdAt: '2026-10-04T09:00:00.000Z'
      }))
    }
  }

  const handle = (name: ProcedureName, input: unknown): unknown => {
    const i = input as Record<string, unknown>
    switch (name) {
      case 'booking.options':
        return state.options
      case 'booking.availability':
        return { notForSale: [], ...state.taken }
      case 'calendar.days':
        return state.days
      case 'booking.searchGuests': {
        const q = normalizeName(String(i['q']))
        return state.guests
          .filter((g) => normalizeName(`${g.firstName} ${g.lastName}`).includes(q))
          .map((g) => ({
            id: g.id,
            firstName: g.firstName,
            lastName: g.lastName,
            phone: g.phone,
            nationality: null,
            vip: g.vip ?? false,
            stays: g.stays ?? 0
          }))
      }
      case 'booking.guestSummary': {
        const g = state.guests.find((x) => x.id === i['guestId'])
        if (!g) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
        return {
          guestId: g.id,
          firstName: g.firstName,
          lastName: g.lastName,
          vip: g.vip ?? false,
          standingNote: null,
          lastStayDate: null,
          lastNightly: null,
          averageNightly: {},
          totalSpent: {},
          totalNights: 0,
          stayCount: g.stays ?? 0,
          tagIds: [],
          recent: [],
          ...g.summary
        } satisfies Summary
      }
      case 'booking.checkBlacklist': {
        const candidate = i['guestId']
          ? { name: guestName(String(i['guestId'])) }
          : { name: String(i['name']) }
        return matchBlacklist(
          candidate,
          state.blacklist.map((b) => ({
            ...b,
            nameNormalized: normalizeName(b.name),
            status: 'active' as const
          }))
        ).map((h) => ({
          entryId: h.entry.id,
          name: h.entry.name,
          severity: h.entry.severity,
          reasons: h.reasons,
          reasonText: h.entry.reasonText
        }))
      }
      case 'booking.create':
        return create(input as ProcedureInput<'booking.create'>)
      case 'booking.createHourlyStay': {
        const h = input as ProcedureInput<'booking.createHourlyStay'>
        return create({
          guest: h.guest,
          channelId: h.channelId,
          status: h.status,
          currency: h.currency,
          blacklistConfirmed: h.blacklistConfirmed,
          stays: [
            {
              roomId: h.roomId,
              checkIn: h.date,
              checkOut: h.date,
              startTime: h.startTime,
              endTime: h.endTime,
              nightlyPriceMinor: h.priceMinor
            }
          ]
        })
      }
      case 'booking.hourlyCheck': {
        const c = input as ProcedureInput<'booking.hourlyCheck'>
        const hourly = state.options.rooms.find((r) => r.id === c.roomId)?.hourlyPriceMinor ?? null
        return {
          taken: false,
          hours: [],
          blocked: false,
          warnings: [],
          turnoverMinutes: 60,
          suggestedMinor: hourly === null ? null : hourlyAmountMinor(hourly, 'TRY', c.startTime, c.endTime),
          currency: 'TRY',
          ...state.hourly
        }
      }
      case 'booking.get': {
        const view = state.views[String(i['id'])]
        if (!view) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
        // A copy, like a real answer: tests change the state in place between calls.
        return structuredClone(view)
      }
      case 'booking.createGroup': {
        const g = input as ProcedureInput<'booking.createGroup'>
        const groupId = `group-${next++}`
        const leaderName =
          'id' in g.leader
            ? guestName(g.leader.id)
            : `${g.leader.firstName} ${g.leader.lastName ?? ''}`.trim()
        const groups = (state.groups ??= {})
        groups[groupId] = { name: g.name, leader: leaderName, folioMode: 'single', voided: false, notes: [] }
        for (const room of g.rooms) {
          const view = create({
            guest: room.guest ?? g.leader,
            channelId: g.channelId,
            status: g.status,
            currency: g.currency,
            stays: [room.stay]
          })
          view.reservation.group = { id: groupId, name: g.name }
        }
        return groupView(groupId)
      }
      case 'booking.group':
        return groupView(String(i['id']))
      case 'booking.checkInMany':
      case 'booking.checkOutMany': {
        const ids = i['stayIds'] as string[]
        const entering = name === 'booking.checkInMany'
        const views = Object.values(state.views)
        // One transaction in the service: a stay that cannot take the step stops the whole request.
        for (const id of ids) {
          const stay = views.flatMap((v) => v.stays).find((s) => s.id === id)
          if (!stay) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
          if (stay.status !== (entering ? 'planned' : 'in_house'))
            throw new ApiError('VALIDATION', 400, 'errors.invalidStayState', { status: stay.status })
        }
        for (const view of views)
          for (const stay of view.stays)
            if (ids.includes(stay.id)) {
              stay.status = entering ? 'in_house' : 'done'
              view.reservation.status = entering ? 'checked_in' : 'checked_out'
            }
        return groupView(String(i['groupId']))
      }
      case 'booking.kbsGaps': {
        const ids = i['stayIds'] as string[]
        return Object.values(state.views)
          .flatMap((v) => v.stays)
          .filter((s) => ids.includes(s.id) && (state.kbsGapRooms ?? []).includes(s.roomNumber))
          .map((s) => ({ stayId: s.id, roomNumber: s.roomNumber }))
      }
      case 'booking.addGroupNote': {
        const group = state.groups?.[String(i['groupId'])]
        if (!group) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
        group.notes.push(String(i['text']))
        return groupView(String(i['groupId']))
      }
      case 'booking.cancelGroup': {
        const group = state.groups?.[String(i['groupId'])]
        if (!group) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
        for (const view of Object.values(state.views))
          if (view.reservation.group?.id === i['groupId']) {
            view.reservation.status = 'cancelled'
            for (const s of view.stays) if (s.status === 'planned') s.status = 'cancelled'
          }
        group.voided = true
        return groupView(String(i['groupId']))
      }
      case 'booking.listParked':
        return state.parked
      case 'booking.noShow':
      case 'booking.cancel': {
        const id = String(i['id'])
        state.parked = state.parked.filter((p) => p.id !== id)
        const view = state.views[id]
        if (!view) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
        const refund = i['refund'] as { mode: string; methodId?: string; amountMinor?: number } | undefined
        if (refund?.mode === 'refund')
          addPayment(id, 'refund', Number(refund.amountMinor), String(refund.methodId))
        const current = state.views[id]!
        current.reservation.status = name === 'booking.noShow' ? 'no_show' : 'cancelled'
        for (const s of current.stays) if (s.status === 'planned') s.status = 'cancelled'
        return structuredClone(current)
      }
      case 'booking.undoCheckIn': {
        const view = Object.values(state.views).find((v) => v.stays.some((s) => s.id === i['stayId']))
        if (!view) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
        for (const s of view.stays)
          if (s.id === i['stayId']) {
            s.status = 'planned'
            s.checkedInAt = null
          }
        view.reservation.status = view.stays.some((s) => s.status === 'in_house' || s.status === 'done')
          ? 'checked_in'
          : 'confirmed'
        // The give-up that goes with the take-back is one request (one transaction in the service).
        const then = i['then'] as
          | { do: 'cancel'; refund?: unknown }
          | { do: 'park'; park: { reason: string; note?: string | null } }
          | { do: 'cancelStay' }
          | undefined
        if (then?.do === 'cancel')
          return handle('booking.cancel', {
            id: view.reservation.id,
            reason: i['reason'],
            refund: then.refund
          })
        if (then?.do === 'cancelStay')
          return handle('booking.cancelStay', { stayId: i['stayId'], reason: i['reason'] })
        if (then?.do === 'park') {
          view.reservation.status = 'parked'
          view.reservation.parkedReason = then.park.reason as typeof view.reservation.parkedReason
          for (const s of view.stays) if (s.status === 'planned') s.status = 'cancelled'
        }
        return structuredClone(view)
      }
      case 'booking.cancelStay': {
        const view = Object.values(state.views).find((v) => v.stays.some((s) => s.id === i['stayId']))
        if (!view) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
        for (const s of view.stays) if (s.id === i['stayId']) s.status = 'cancelled'
        return structuredClone(view)
      }
      case 'booking.suggestPrices': {
        const room = state.options.rooms.find((r) => r.id === i['roomId'])
        if (!room || room.basePriceMinor === null) return null
        const nights: { date: LocalDate; priceMinor: number; reason: 'base' }[] = []
        for (let d = localDate(String(i['checkIn'])); d < String(i['checkOut']); d = addDays(d, 1))
          nights.push({ date: d, priceMinor: room.basePriceMinor, reason: 'base' })
        return { currency: room.priceCurrency ?? 'TRY', nights }
      }
      case 'booking.checkIn': {
        const view = Object.values(state.views).find((v) => v.stays.some((s) => s.id === i['stayId']))
        if (!view) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
        for (const s of view.stays) if (s.id === i['stayId']) s.status = 'in_house'
        view.reservation.status = 'checked_in'
        return structuredClone(view)
      }
      case 'booking.addNote': {
        const view = state.views[String(i['reservationId'])]
        if (!view) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
        return structuredClone(view)
      }
      case 'booking.payGroup': {
        const group = state.groups?.[String(i['groupId'])]
        if (!group) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
        let left = Number(i['amountMinor'])
        for (const view of Object.values(state.views)) {
          if (view.reservation.group?.id !== i['groupId'] || left <= 0) continue
          const part = Math.min(left, Math.max(0, view.folio.balanceMinor ?? 0))
          if (part > 0) addPayment(view.reservation.id, 'payment', part, String(i['methodId']))
          left -= part
        }
        return groupView(String(i['groupId']))
      }
      case 'booking.checkOut': {
        const view = Object.values(state.views).find((v) => v.stays.some((s) => s.id === i['stayId']))
        if (!view) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
        for (const s of view.stays) if (s.id === i['stayId']) s.status = 'done'
        return structuredClone(view)
      }
      case 'booking.addOccupant': {
        const occupant = i['occupant'] as { fullName: string; descriptorNote?: string | null }
        const hits = matchBlacklist(
          { name: occupant.fullName },
          state.blacklist.map((b) => ({
            ...b,
            nameNormalized: normalizeName(b.name),
            status: 'active' as const
          }))
        )
        if (hits.length && !i['blacklistConfirmed'])
          throw new ApiError('CONFLICT', 409, 'errors.blacklistMatch', {
            hits: hits.map((h) => ({
              entryId: h.entry.id,
              name: h.entry.name,
              severity: h.entry.severity,
              reasons: h.reasons,
              reasonText: h.entry.reasonText
            }))
          })
        for (const view of Object.values(state.views))
          for (const stay of view.stays)
            if (stay.id === i['stayId'])
              stay.occupants.push({
                id: `occ-${next++}`,
                guestId: null,
                fullName: occupant.fullName,
                isPrimary: false,
                descriptorNote: occupant.descriptorNote ?? null,
                arrivedAt: null,
                leftAt: null,
                kbsReportedAt: null,
                kbsCheckoutAt: null
              })
        return { ok: true }
      }
      case 'booking.markKbs': {
        const at = '2026-10-04T12:00:00.000Z'
        for (const view of Object.values(state.views))
          for (const stay of view.stays) {
            stay.kbsIssues = stay.kbsIssues.filter((k) => k.occupantId !== i['occupantId'])
            for (const o of stay.occupants)
              if (o.id === i['occupantId'] && i['mark'] === 'reported') o.kbsReportedAt = at
          }
        return { ok: true }
      }
      case 'booking.addPayment':
        return addPayment(
          String(i['reservationId']),
          i['kind'] as 'payment',
          Number(i['amountMinor']),
          String(i['methodId'])
        )
      default:
        return undefined
    }
  }

  return {
    ...base,
    get settings() {
      return base.settings
    },
    get tags() {
      return base.tags
    },
    booking: state,
    calls,
    callsTo: (name: ProcedureName) => calls.filter((c) => c.name === name).map((c) => c.input),
    async call(name: ProcedureName, input: unknown) {
      calls.push({ name, input })
      const answer = handle(name, input)
      if (answer !== undefined) return answer as never
      return base.call(name, input as never)
    }
  } as BookingTransport
}
