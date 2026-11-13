// Test helper (imported by tests only, never by the app): an in-memory stand-in for the Faz 6 procedures —
// guests, history, companies, blacklist — over the shared settings fake (src/renderer/test/render.tsx). It keeps
// the rules the screens show by calling the same shared functions as the services (name matching, the history
// summary §6.12, the blacklist match §6.9); the service tests cover the rest. Names and amounts are invented.
import { SETTINGS_DEFAULTS, type ListItem, type ProcedureName } from '@shared/contract'
import type {
  BlacklistEntryDto,
  CompanyViewDto,
  GuestListRowDto,
  GuestViewDto,
  HistoryStayDto
} from '@shared/contract/procedures/guests'
import { matchBlacklist } from '@shared/domain/blacklist'
import { matchName, sameNameLikely } from '@shared/domain/guest-match'
import { normalizeName, normalizePhone } from '@shared/domain/normalize'
import { localDate } from '@shared/date'
import { guestHistorySummary, type HistoryStay } from '@shared/domain/reports'
import { ApiError, type Transport } from '@/lib/transport/types'
import { fakeTransport } from '@/test/render'

const STAMP = '2026-10-01T09:00:00.000Z'
const TODAY = '2026-10-04'

export interface GuestsState {
  guests: GuestViewDto[]
  /** Stays by guest id (the guest's history, any order). */
  stays: Record<string, HistoryStayDto[]>
  companies: CompanyViewDto[]
  blacklist: BlacklistEntryDto[]
  channels: ListItem[]
  methods: ListItem[]
  /** Guest tags (G-50): the list and who carries which. */
  tags: ListItem[]
  tagLinks: Record<string, string[]>
}

const listItem = (id: string, code: string, tr: string, sort: number): ListItem => ({
  id,
  code,
  name: null,
  nameI18n: { tr, en: tr, ru: tr },
  active: true,
  sort,
  seeded: true
})

export function guest(partial: Partial<GuestViewDto> & Pick<GuestViewDto, 'id' | 'firstName'>): GuestViewDto {
  return {
    lastName: '',
    phone: null,
    email: null,
    nationality: null,
    idDocType: null,
    idDocNumber: null,
    identityMasked: false,
    language: null,
    vip: false,
    standingNote: null,
    standingNoteLevel: 'info',
    notes: null,
    companyId: null,
    mergedIntoId: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...partial
  }
}

export function company(
  partial: Partial<CompanyViewDto> & Pick<CompanyViewDto, 'id' | 'title'>
): CompanyViewDto {
  return {
    address: null,
    city: null,
    taxOffice: null,
    taxNumber: null,
    phone: null,
    email: null,
    iban: null,
    contactPerson: null,
    note: null,
    favorite: false,
    lastUsedAt: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...partial
  }
}

/** A past stay: one price per night from `checkIn`, paid in cash unless `paid` says otherwise. */
export function stay(
  partial: Omit<Partial<HistoryStayDto>, 'checkIn' | 'checkOut'> & {
    reservationId: string
    checkIn: string
    checkOut: string
    prices: number[]
  }
): HistoryStayDto {
  const { prices, checkIn, checkOut, ...rest } = partial
  const nights = prices.map((priceMinor, i) => ({
    date: localDate(new Date(Date.parse(`${checkIn}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)),
    priceMinor,
    currency: 'TRY'
  }))
  const total = prices.reduce((s, p) => s + p, 0)
  return {
    code: partial.reservationId,
    primaryGuestId: '',
    roomNumber: '101',
    status: 'checked_out',
    nights,
    paidMinor: total,
    balanceMinor: 0,
    currency: 'TRY',
    methods: ['cash'],
    methodIds: ['m-cash'],
    channel: 'direct',
    channelId: 'ch-direct',
    ...rest,
    checkIn: localDate(checkIn),
    checkOut: localDate(checkOut)
  }
}

export function emptyGuests(): GuestsState {
  return {
    guests: [],
    stays: {},
    companies: [],
    blacklist: [],
    channels: [
      listItem('ch-direct', 'direct', 'Doğrudan', 1),
      listItem('ch-booking', 'booking', 'Booking.com', 2)
    ],
    methods: [listItem('m-cash', 'cash', 'Nakit', 1), listItem('m-card', 'card', 'Kredi kartı', 2)],
    tags: [],
    tagLinks: {}
  }
}

const fullName = (g: { firstName: string; lastName: string }): string => `${g.firstName} ${g.lastName}`.trim()
const notFound = (): ApiError => new ApiError('NOT_FOUND', 404, 'errors.notFound')
const denied = (): ApiError => new ApiError('PERMISSION_DENIED', 403, 'errors.permissionDenied')

/** `refuse`: procedures the service refuses (403) for the signed-in role. */
export function guestsTransport(
  state: GuestsState = emptyGuests(),
  opts: { refuse?: readonly ProcedureName[] } = {}
) {
  const base = fakeTransport(SETTINGS_DEFAULTS)
  let next = 1
  const id = (prefix: string): string => `${prefix}-${next++}`
  const calls: { name: ProcedureName; input: unknown }[] = []
  const guestOf = (gid: string): GuestViewDto => {
    const g = state.guests.find((x) => x.id === gid)
    if (!g) throw notFound()
    return g.mergedIntoId ? guestOf(g.mergedIntoId) : g
  }
  const companyOf = (cid: string): CompanyViewDto => {
    const c = state.companies.find((x) => x.id === cid)
    if (!c) throw notFound()
    return c
  }
  const history = (g: GuestViewDto) => {
    const stays = state.stays[g.id] ?? []
    const summary = guestHistorySummary(stays as unknown as HistoryStay[], localDate(TODAY))
    return {
      guestId: g.id,
      ...summary,
      stays: summary.stays as HistoryStayDto[],
      standingNote: g.standingNote
        ? {
            text: g.standingNote,
            level: g.standingNoteLevel,
            requiresConfirm: g.standingNoteLevel === 'warn'
          }
        : null,
      moneyHidden: false
    }
  }
  const entries = () =>
    state.blacklist.map((b) => ({ ...b, nameNormalized: normalizeName(b.name), status: b.status }))
  const hitsFor = (candidate: { name: string; phone?: string | null }) =>
    matchBlacklist({ name: candidate.name, phone: candidate.phone ?? null }, entries()).map((h) => ({
      entryId: h.entry.id,
      name: h.entry.name,
      severity: h.entry.severity,
      reasons: h.reasons,
      reasonText: h.entry.reasonText
    }))
  const duplicatesOf = (input: { name: string; phone?: string | null; excludeId?: string }) => {
    const name = normalizeName(input.name)
    const phone = input.phone ? normalizePhone(input.phone) : ''
    return state.guests
      .filter((g) => !g.mergedIntoId && g.id !== input.excludeId)
      .map((g) => {
        const reasons: ('name' | 'phone')[] = []
        if (name && sameNameLikely(name, fullName(g))) reasons.push('name')
        if (phone && g.phone && normalizePhone(g.phone) === phone) reasons.push('phone')
        return { guest: g, reasons }
      })
      .filter((d) => d.reasons.length)
  }
  const row = (g: GuestViewDto): GuestListRowDto => {
    const h = history(g)
    const live = h.stays.filter((s) => s.status !== 'cancelled')
    const dup = duplicatesOf({ name: fullName(g), phone: g.phone, excludeId: g.id })[0]
    return {
      id: g.id,
      firstName: g.firstName,
      lastName: g.lastName,
      phone: g.phone,
      email: g.email,
      nationality: g.nationality,
      vip: g.vip,
      standingNote: g.standingNote,
      standingNoteLevel: g.standingNoteLevel,
      companyId: g.companyId,
      companyTitle: g.companyId ? companyOf(g.companyId).title : null,
      stays: live.length,
      lastStayDate:
        live
          .map((s) => s.checkIn)
          .filter((d) => d <= TODAY)
          .sort()
          .at(-1) ?? null,
      nextStayDate:
        live
          .map((s) => s.checkIn)
          .filter((d) => d > TODAY)
          .sort()[0] ?? null,
      totalSpent: h.totalSpent,
      blacklisted: hitsFor({ name: fullName(g), phone: g.phone }).length > 0,
      duplicateOf: dup ? { id: dup.guest.id, name: fullName(dup.guest), reasons: dup.reasons } : null,
      tagIds: state.tagLinks[g.id] ?? []
    }
  }

  // Each branch reads the input of its own procedure as the contract defines it (the router has parsed it).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handle = (name: ProcedureName, input: any): unknown => {
    if (opts.refuse?.includes(name)) throw denied()
    switch (name) {
      case 'guests.list': {
        const q: string = input.q ?? ''
        const digits = q.replace(/\D/g, '')
        const rows = state.guests
          .filter((g) => !g.mergedIntoId)
          .filter(
            (g) =>
              !q ||
              matchName(q, normalizeName(fullName(g))) !== null ||
              (digits.length >= 3 && !!g.phone && normalizePhone(g.phone).includes(digits)) ||
              (!!g.companyId && matchName(q, normalizeName(companyOf(g.companyId).title)) === 'exact')
          )
          .map(row)
          .filter((r) => !input.tagId || r.tagIds.includes(input.tagId))
          .flatMap((r): GuestListRowDto[] => {
            // Room and dates (G-190), the service's rule over the history stays.
            if (!input.room && !input.stayFrom && !input.stayTo) return [r]
            const matched = (state.stays[r.id] ?? [])
              .filter((s) => s.status !== 'parked')
              .filter((s) => !input.room || s.roomNumber === input.room)
              .filter((s) => !input.stayTo || s.checkIn <= input.stayTo)
              .filter(
                (s) =>
                  !input.stayFrom ||
                  s.checkOut > input.stayFrom ||
                  (s.checkOut === s.checkIn && s.checkIn >= input.stayFrom)
              )
              .map((s) => ({
                reservationId: s.reservationId,
                code: s.code,
                roomNumber: s.roomNumber,
                checkIn: s.checkIn,
                checkOut: s.checkOut,
                status: s.status
              }))
              .sort((a, b) => b.checkIn.localeCompare(a.checkIn))
            return matched.length ? [{ ...r, matchedStays: matched }] : []
          })
        const passes: Record<string, (r: GuestListRowDto) => boolean> = {
          all: () => true,
          returning: (r) => r.stays >= 2,
          vip: (r) => r.vip,
          note: (r) => !!r.standingNote,
          company: (r) => !!r.companyId,
          blacklist: (r) => r.blacklisted,
          duplicate: (r) => !!r.duplicateOf
        }
        const counts = Object.fromEntries(Object.entries(passes).map(([k, f]) => [k, rows.filter(f).length]))
        const shown = rows
          .filter(passes[input.filter ?? 'all'] ?? (() => true))
          .sort((a, b) =>
            input.sort === 'name'
              ? fullName(a).localeCompare(fullName(b), 'tr')
              : (b.lastStayDate ?? '').localeCompare(a.lastStayDate ?? '') ||
                fullName(a).localeCompare(fullName(b), 'tr')
          )
        const offset = input.offset ?? 0
        return {
          rows: shown.slice(offset, offset + (input.limit ?? 50)),
          total: shown.length,
          counts,
          baseCurrency: 'TRY',
          moneyHidden: false
        }
      }
      case 'guests.card': {
        const g = guestOf(input.id)
        return {
          guest: g,
          mergedFrom: g.id === input.id ? null : input.id,
          company: g.companyId ? companyOf(g.companyId) : null,
          duplicates: duplicatesOf({ name: fullName(g), phone: g.phone, excludeId: g.id }),
          blacklist: hitsFor({ name: fullName(g), phone: g.phone }),
          tagIds: state.tagLinks[g.id] ?? []
        }
      }
      case 'guests.history':
        return history(guestOf(input.guestId))
      case 'guests.duplicates':
        return duplicatesOf(input)
      case 'guests.create': {
        const g = guest({ ...input, id: id('g'), lastName: input.lastName ?? '' })
        state.guests.push(g)
        return g
      }
      case 'guests.update': {
        const g = guestOf(input.id)
        Object.assign(g, input.patch, { updatedAt: new Date().toISOString() })
        return g
      }
      case 'guests.setStandingNote': {
        const g = guestOf(input.id)
        g.standingNote = input.note.standingNote || null
        g.standingNoteLevel = input.note.standingNoteLevel
        g.updatedAt = new Date().toISOString()
        return g
      }
      case 'guests.merge': {
        const keep = guestOf(input.keepId)
        const gone = guestOf(input.mergeId)
        const moved = state.stays[gone.id] ?? []
        state.stays[keep.id] = [...(state.stays[keep.id] ?? []), ...moved]
        delete state.stays[gone.id]
        gone.mergedIntoId = keep.id
        if (!keep.phone) keep.phone = gone.phone
        return {
          guest: keep,
          moved: { reservations: moved.length, occupants: 0, blacklist: 0, mergedGuests: 0, tags: 0 }
        }
      }
      case 'guests.setTags': {
        const before = state.tagLinks[input.id] ?? []
        const closed = (input.tagIds as string[]).some(
          (t) => !before.includes(t) && !state.tags.find((x) => x.id === t)?.active
        )
        if (closed) throw new ApiError('CONFLICT', 409, 'errors.guestTagClosed')
        state.tagLinks[input.id] = state.tags.map((x) => x.id).filter((t) => input.tagIds.includes(t))
        return { tagIds: state.tagLinks[input.id] }
      }

      case 'companies.list':
        return state.companies
          .filter(
            (c) =>
              !input.q ||
              matchName(input.q, normalizeName(c.title)) === 'exact' ||
              (input.q.replace(/\D/g, '').length >= 3 &&
                (c.taxNumber ?? '').includes(input.q.replace(/\D/g, '')))
          )
          .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.title.localeCompare(b.title, 'tr'))
          .map((c) => ({
            ...c,
            guestCount: state.guests.filter((g) => !g.mergedIntoId && g.companyId === c.id).length
          }))
      case 'companies.get': {
        const c = companyOf(input.id)
        const linked = state.guests.filter((g) => !g.mergedIntoId && g.companyId === c.id)
        const stays = linked.flatMap((g) =>
          (state.stays[g.id] ?? []).map((s) => ({ ...s, guestId: g.id, guestName: fullName(g) }))
        )
        const summary = guestHistorySummary(stays as unknown as HistoryStay[], localDate(TODAY))
        return {
          company: c,
          guests: linked.map((g) => ({
            id: g.id,
            firstName: g.firstName,
            lastName: g.lastName,
            phone: g.phone,
            vip: g.vip
          })),
          stays: summary.stays,
          stayCount: stays.filter((s) => s.status !== 'cancelled').length,
          totalNights: summary.totalNights,
          totalSpent: summary.totalSpent,
          moneyHidden: false
        }
      }
      case 'companies.create': {
        const c = company({ ...input, id: id('co'), favorite: !!input.favorite })
        state.companies.push(c)
        return c
      }
      case 'companies.update':
        return Object.assign(companyOf(input.id), input.patch)
      case 'companies.markUsed':
        return Object.assign(companyOf(input.id), { lastUsedAt: new Date().toISOString() })

      case 'blacklist.list':
        return state.blacklist.filter(
          (b) => input.status === 'all' || b.status === (input.status ?? 'active')
        )
      case 'blacklist.add': {
        const g = input.guestId ? guestOf(input.guestId) : null
        const entry: BlacklistEntryDto = {
          id: id('bl'),
          guestId: g?.id ?? null,
          name: input.name || (g ? fullName(g) : ''),
          idDocNumber: input.idDocNumber ?? null,
          identityMasked: false,
          phoneNormalized: input.phone
            ? normalizePhone(input.phone)
            : g?.phone
              ? normalizePhone(g.phone)
              : null,
          severity: input.severity,
          reasonCode: input.reasonCode,
          reasonText: input.reasonText,
          incidentDate: input.incidentDate ?? null,
          addedBy: 'u-owner',
          addedByName: 'Otel Sahibi',
          approvedByName: 'Otel Sahibi',
          status: 'active',
          removedAt: null,
          removedByName: null,
          removedReason: null,
          createdAt: STAMP
        }
        state.blacklist.push(entry)
        return entry
      }
      case 'blacklist.remove': {
        const e = state.blacklist.find((b) => b.id === input.id)
        if (!e) throw notFound()
        Object.assign(e, {
          status: 'removed',
          removedAt: STAMP,
          removedByName: 'Otel Sahibi',
          removedReason: input.reason
        })
        return e
      }
      case 'blacklist.check':
        return hitsFor(input)

      case 'lists.list':
        return input.kind === 'salesChannels'
          ? state.channels
          : input.kind === 'paymentMethods'
            ? state.methods
            : input.kind === 'guestTags'
              ? state.tags.filter((x) => input.includeInactive || x.active)
              : []
      default:
        return undefined
    }
  }

  const transport: Transport & {
    calls: typeof calls
    callsTo: (n: ProcedureName) => unknown[]
    state: GuestsState
  } = {
    kind: 'ipc',
    calls,
    state,
    callsTo: (n) => calls.filter((c) => c.name === n).map((c) => c.input),
    async call(name, input) {
      calls.push({ name, input })
      const answer = handle(name, input ?? {})
      if (answer !== undefined) return structuredClone(answer) as never
      return base.call(name, input)
    }
  }
  return transport
}

export type GuestsTransport = ReturnType<typeof guestsTransport>
