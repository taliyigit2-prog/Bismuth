// Guests, companies and the blacklist (03-mimari.md §4.3, §6.9, §6.12, §6.14; G-50…G-52, G-190…G-192).
// Identity numbers need `guests.identity` to write and are masked for users without `guests.identity` view.
// Nothing is deleted: a merged guest keeps its row (merged_into_id), a blacklist entry is "removed".
import { and, asc, eq, inArray, isNotNull, isNull, like, or, sql, type SQL } from 'drizzle-orm'
import type * as z from 'zod'
import {
  blacklistInputSchema,
  blacklistListSchema,
  blacklistRemoveReasonSchema,
  companyInputSchema,
  companyListSchema,
  companyUpdateSchema,
  guestCandidateSchema,
  guestInputSchema,
  guestMergeSchema,
  guestSearchSchema,
  guestListSchema,
  guestTagsInputSchema,
  guestUpdateSchema,
  standingNoteInputSchema,
  GUEST_FILTERS,
  type GuestFilter,
  type GuestListInput,
  type GuestSort,
  type BlacklistInput,
  type BlacklistListInput,
  type CompanyInput,
  type CompanyUpdate,
  type GuestCandidate,
  type GuestInput,
  type GuestTagsInput,
  type GuestUpdate,
  type StandingNoteInput
} from '@shared/contract/guests'
import { idSchema } from '@shared/contract/rooms'
import { SETTINGS_DEFAULTS, settingsShape } from '@shared/contract/settings'
import { localDate, localDateOf, type LocalDate } from '@shared/date'
import { matchBlacklist, type MatchReason } from '@shared/domain/blacklist'
import { matchName, sameNameLikely } from '@shared/domain/guest-match'
import { standingNoteAlert } from '@shared/domain/cell-status'
import { companyCopyFields, type CopyField } from '@shared/domain/company-copy'
import {
  maskDocNumber,
  normalizeDocNumber,
  normalizeName,
  normalizePhone,
  phoneNeedles
} from '@shared/domain/normalize'
import { creditedTotal, folioTotals } from '@shared/domain/payment-allocation'
import { guestHistorySummary, type GuestHistorySummary, type HistoryStay } from '@shared/domain/reports'
import {
  blacklist,
  charges,
  companies,
  folios,
  guests,
  guestTagLinks,
  guestTags,
  paymentMethods,
  payments,
  reservationRooms,
  reservations,
  roomNights,
  rooms,
  salesChannels,
  settings,
  stayOccupants,
  users
} from '../db/schema'
import type { Ctx } from './context'
import { blacklistMatches, type BlacklistHitBrief } from './reservation-view'
import type { AuditEntry } from './audit'
import { permissionDenied } from './errors'
import {
  conflict,
  inChunks,
  inTransaction,
  invalid,
  newId,
  notFound,
  parseInput,
  requirePermission,
  stamps,
  type ServiceDeps
} from './kit'

export type GuestRow = typeof guests.$inferSelect
export type CompanyRow = typeof companies.$inferSelect
export type BlacklistRow = typeof blacklist.$inferSelect

/** A guest as a user sees it: `idDocNumber` masked unless the user may view identity fields. */
export type GuestView = GuestRow & { identityMasked: boolean }
export type BlacklistView = BlacklistRow & { identityMasked: boolean }

/** Duplicates match by what is written on the card (a blacklist entry may also match by the card itself). */
export type DuplicateReason = Exclude<MatchReason, 'guest'>
export interface GuestDuplicate {
  guest: GuestView
  reasons: DuplicateReason[]
}

export interface GuestMergeResult {
  guest: GuestView
  moved: { reservations: number; occupants: number; blacklist: number; mergedGuests: number; tags: number }
}

export type GuestHistory = Omit<GuestHistorySummary, 'stays'> & {
  guestId: string
  stays: GuestStay[]
  standingNote: ReturnType<typeof standingNoteAlert>
  /** Paid amounts and balances left out: the user may not read payments. */
  moneyHidden: boolean
}

export interface GuestListRow {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
  nationality: string | null
  vip: boolean
  standingNote: string | null
  standingNoteLevel: 'info' | 'warn'
  companyId: string | null
  companyTitle: string | null
  /** Reservations that are not cancelled (the guest card's count). */
  stays: number
  lastStayDate: LocalDate | null
  nextStayDate: LocalDate | null
  totalSpent: Record<string, number>
  blacklisted: boolean
  duplicateOf: { id: string; name: string; reasons: DuplicateReason[] } | null
  /** Guest tags (G-50), in the tag list's order. */
  tagIds: string[]
  /** With the room or date filter (G-190): the stays that matched, latest first. */
  matchedStays?: {
    reservationId: string
    code: string
    roomNumber: string
    checkIn: string
    checkOut: string
    status: (typeof reservations.$inferSelect)['status']
  }[]
}

export interface GuestList {
  rows: GuestListRow[]
  total: number
  counts: Record<GuestFilter, number>
  baseCurrency: string
  moneyHidden: boolean
}

export interface GuestCard {
  guest: GuestView
  /** The merged card that was asked for (it now shows the card it was merged into). */
  mergedFrom: string | null
  company: CompanyRow | null
  duplicates: GuestDuplicate[]
  blacklist: BlacklistHitBrief[]
  /** Guest tags (G-50), switched-off ones included. */
  tagIds: string[]
}

const collator = new Intl.Collator('tr')
const fullName = (g: { firstName: string; lastName: string }): string => `${g.firstName} ${g.lastName}`.trim()

const canSeeIdentity = (ctx: Ctx): boolean => ctx.can('guests.identity', 'view')

function guestView(ctx: Ctx, row: GuestRow): GuestView {
  if (!row.idDocNumber || canSeeIdentity(ctx)) return { ...row, identityMasked: false }
  return { ...row, idDocNumber: maskDocNumber(row.idDocNumber), identityMasked: true }
}

function blacklistView(ctx: Ctx, row: BlacklistRow): BlacklistView {
  if (!row.idDocNumber || canSeeIdentity(ctx)) return { ...row, identityMasked: false }
  return { ...row, idDocNumber: maskDocNumber(row.idDocNumber), identityMasked: true }
}

/** Digit strings a user typed to find a phone (as typed, and without leading zeros: "0532 12" finds "90532 12…"). */
const phoneNeedle = (q: string): string[] => phoneNeedles(q)

const nullIfEmpty = (v: string): string | null => (v === '' ? null : v)

function getGuestTx(tx: Pick<ServiceDeps['db'], 'select'>, id: string): GuestRow {
  const row = tx.select().from(guests).where(eq(guests.id, id)).get()
  if (!row) throw notFound('guest', id)
  return row
}

function assertCompany(tx: Pick<ServiceDeps['db'], 'select'>, companyId: string | null | undefined): void {
  if (!companyId) return
  if (!tx.select({ id: companies.id }).from(companies).where(eq(companies.id, companyId)).get())
    throw notFound('company', companyId)
}

function baseCurrency(db: ServiceDeps['db']): string {
  const row = db.select().from(settings).where(eq(settings.key, 'hotel.baseCurrency')).get()
  if (!row) return SETTINGS_DEFAULTS['hotel.baseCurrency']
  const parsed = settingsShape['hotel.baseCurrency'].safeParse(JSON.parse(row.valueJson))
  return parsed.success ? parsed.data : SETTINGS_DEFAULTS['hotel.baseCurrency']
}

// --- Guests ----------------------------------------------------------------------------------------------

export function createGuestsService(deps: ServiceDeps) {
  const { db } = deps

  /** Identity fields may only be written with `guests.identity` edit (G-23: checked here, not in the UI). */
  const guardIdentity = (ctx: Ctx, data: { idDocType?: unknown; idDocNumber?: unknown }): void => {
    if (
      (data.idDocType !== undefined || data.idDocNumber !== undefined) &&
      !ctx.can('guests.identity', 'edit')
    )
      throw permissionDenied()
  }

  const update = (ctx: Ctx, id: string, data: z.output<typeof guestUpdateSchema>): GuestView =>
    inTransaction(deps, ctx, (tx, audit, now) => {
      const before = getGuestTx(tx, id)
      if (before.mergedIntoId) throw conflict('errors.guestMerged', { mergedIntoId: before.mergedIntoId })
      assertCompany(tx, data.companyId)
      const next = { ...before, ...data }
      if (next.idDocNumber && !next.idDocType)
        throw invalid('errors.validation', { fields: { idDocType: ['document type required'] } })
      const patch: Partial<GuestRow> = { ...data, updatedAt: now.toISOString() }
      if (data.firstName !== undefined || data.lastName !== undefined)
        patch.nameNormalized = normalizeName(fullName(next))
      if (data.phone !== undefined)
        patch.phoneNormalized = data.phone ? nullIfEmpty(normalizePhone(data.phone)) : null
      if (data.idDocNumber !== undefined)
        patch.idDocNumber = data.idDocNumber ? nullIfEmpty(normalizeDocNumber(data.idDocNumber)) : null
      tx.update(guests).set(patch).where(eq(guests.id, id)).run()
      const after = getGuestTx(tx, id)
      audit({ entity: 'guest', entityId: id, action: 'update', before, after })
      if (fullName(after) !== fullName(before)) renameOccupants(tx, audit, after, now)
      return guestView(ctx, after)
    })

  /** "Bu kişi zaten kayıtlı olabilir" (G-51): same normalised name, phone or document number. */
  const findDuplicates = (ctx: Ctx, candidate: GuestCandidate): GuestDuplicate[] => {
    requirePermission(ctx, 'guests', 'view')
    const data = parseInput(guestCandidateSchema, candidate)
    const name = normalizeName(data.name)
    const phone = data.phone ? normalizePhone(data.phone) : ''
    const doc = data.idDocNumber && canSeeIdentity(ctx) ? normalizeDocNumber(data.idDocNumber) : ''
    const conds: SQL[] = []
    if (name) conds.push(eq(guests.nameNormalized, name))
    if (phone) conds.push(eq(guests.phoneNormalized, phone))
    if (doc) conds.push(eq(guests.idDocNumber, doc))
    if (!conds.length) return []
    const found = db
      .select()
      .from(guests)
      .where(and(isNull(guests.mergedIntoId), or(...conds)))
      .all()
    // Spelling slips of the same name ("Gadir Garibov" / "GADİR GADİROV"): a near name is a possible duplicate.
    const known = new Set(found.map((g) => g.id))
    const near = name
      ? db
          .select({ id: guests.id, nameNormalized: guests.nameNormalized })
          .from(guests)
          .where(isNull(guests.mergedIntoId))
          .all()
          .filter((g) => !known.has(g.id) && sameNameLikely(name, g.nameNormalized))
          .slice(0, 20)
          .map((g) => getGuestTx(db, g.id))
      : []
    return [...found, ...near]
      .filter((g) => g.id !== data.excludeId)
      .map((g) => {
        const reasons: DuplicateReason[] = []
        if (name && (g.nameNormalized === name || sameNameLikely(name, g.nameNormalized)))
          reasons.push('name')
        if (doc && g.idDocNumber === doc) reasons.push('id')
        if (phone && g.phoneNormalized === phone) reasons.push('phone')
        return { guest: guestView(ctx, g), reasons }
      })
      .sort(
        (a, b) =>
          b.reasons.length - a.reasons.length || collator.compare(fullName(a.guest), fullName(b.guest))
      )
  }

  return {
    get(ctx: Ctx, id: string): GuestView {
      requirePermission(ctx, 'guests', 'view')
      return guestView(ctx, getGuestTx(db, parseInput(idSchema, id)))
    },

    create(ctx: Ctx, input: GuestInput): GuestView {
      requirePermission(ctx, 'guests', 'edit')
      const data = parseInput(guestInputSchema, input)
      guardIdentity(ctx, {
        idDocType: data.idDocType ?? undefined,
        idDocNumber: data.idDocNumber ?? undefined
      })
      return inTransaction(deps, ctx, (tx, audit, now) => {
        assertCompany(tx, data.companyId)
        const id = newId(now)
        const row = {
          id,
          firstName: data.firstName,
          lastName: data.lastName,
          nameNormalized: normalizeName(fullName(data)),
          phone: data.phone ?? null,
          phoneNormalized: data.phone ? nullIfEmpty(normalizePhone(data.phone)) : null,
          email: data.email ?? null,
          nationality: data.nationality ?? null,
          idDocType: data.idDocType ?? null,
          idDocNumber: data.idDocNumber ? nullIfEmpty(normalizeDocNumber(data.idDocNumber)) : null,
          language: data.language ?? null,
          vip: data.vip,
          standingNote: data.standingNote ?? null,
          standingNoteLevel: data.standingNoteLevel,
          notes: data.notes ?? null,
          companyId: data.companyId ?? null,
          mergedIntoId: null,
          createdBy: ctx.userId,
          ...stamps(now)
        }
        tx.insert(guests).values(row).run()
        audit({ entity: 'guest', entityId: id, action: 'create', after: row })
        return guestView(ctx, getGuestTx(tx, id))
      })
    },

    update(ctx: Ctx, id: string, input: GuestUpdate): GuestView {
      requirePermission(ctx, 'guests', 'edit')
      const data = parseInput(guestUpdateSchema, input)
      guardIdentity(ctx, data)
      return update(ctx, parseInput(idSchema, id), data)
    },

    /** "Her gelişinde" note and its level (G-192). */
    setStandingNote(ctx: Ctx, id: string, input: StandingNoteInput): GuestView {
      requirePermission(ctx, 'guests', 'edit')
      const data = parseInput(standingNoteInputSchema, input)
      return update(ctx, parseInput(idSchema, id), {
        standingNote: data.standingNote ?? null,
        standingNoteLevel: data.standingNoteLevel
      })
    },

    /** VIP mark, set by hand (S-18). */
    setVip(ctx: Ctx, id: string, vip: boolean): GuestView {
      requirePermission(ctx, 'guests', 'edit')
      return update(ctx, parseInput(idSchema, id), { vip: parseInput(guestUpdateSchema.shape.vip, vip) })
    },

    /** Alert shown when a reservation for this guest is written (§6.14). */
    standingNoteAlert(ctx: Ctx, id: string): ReturnType<typeof standingNoteAlert> {
      requirePermission(ctx, 'guests', 'view')
      return standingNoteAlert(getGuestTx(db, parseInput(idSchema, id)))
    },

    /**
     * Autocomplete (G-51): every word of `q` in the normalised name (Turkish-insensitive), or the digits in
     * the phone, or — only for users who may view identity fields — the document number. Merged rows are hidden.
     */
    search(ctx: Ctx, q: string, limit = 20): GuestView[] {
      requirePermission(ctx, 'guests', 'view')
      const data = parseInput(guestSearchSchema, { q, limit })
      const conds: SQL[] = []
      const tokens = normalizeName(data.q).split(' ').filter(Boolean)
      const nameCond = and(...tokens.map((t) => like(guests.nameNormalized, `%${t}%`)))
      if (tokens.length && nameCond) conds.push(nameCond)
      // The company's title too (faz-06 madde 1: "firma"), for a user who may read companies.
      const companyCond = and(...tokens.map((t) => like(companies.nameNormalized, `%${t}%`)))
      if (tokens.length && companyCond && ctx.can('companies', 'view')) {
        const companyIds = db
          .select({ id: companies.id })
          .from(companies)
          .where(companyCond)
          .limit(200)
          .all()
          .map((c) => c.id)
        if (companyIds.length) conds.push(inArray(guests.companyId, companyIds))
      }
      const digits = phoneNeedle(data.q)
      for (const d of digits) conds.push(like(guests.phoneNormalized, `%${d}%`))
      const doc = normalizeDocNumber(data.q)
      if (canSeeIdentity(ctx) && doc.length >= 3) conds.push(like(guests.idDocNumber, `%${doc}%`))
      if (!conds.length) return []
      const exact = db
        .select()
        .from(guests)
        .where(and(isNull(guests.mergedIntoId), or(...conds)))
        .limit(500)
        .all()
        .sort((a, b) => collator.compare(fullName(a), fullName(b)))
      // A name a slip away ("gadir garibov" → "GADİR GADİROV") comes after the exact ones.
      const known = new Set(exact.map((g) => g.id))
      const near =
        tokens.length && exact.length < data.limit
          ? db
              .select({ id: guests.id, nameNormalized: guests.nameNormalized })
              .from(guests)
              .where(isNull(guests.mergedIntoId))
              .all()
              .filter((g) => !known.has(g.id) && matchName(data.q, g.nameNormalized) === 'near')
              .slice(0, data.limit - exact.length)
              .map((g) => getGuestTx(db, g.id))
              .sort((a, b) => collator.compare(fullName(a), fullName(b)))
          : []
      return [...exact, ...near].slice(0, data.limit).map((g) => guestView(ctx, g))
    },

    findDuplicates,

    /**
     * Two records of the same person → one (G-51, faz-06): reservations, room occupants, blacklist entries
     * and earlier merges move to `keepId`; empty fields of the kept card are filled from the merged one; the
     * merged row stays with merged_into_id (never deleted).
     */
    merge(ctx: Ctx, keepId: string, mergeId: string): GuestMergeResult {
      requirePermission(ctx, 'guests.merge', 'edit')
      const ids = parseInput(guestMergeSchema, { keepId, mergeId })
      if (ids.keepId === ids.mergeId) throw invalid('errors.mergeSameGuest')
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const keep = getGuestTx(tx, ids.keepId)
        const merged = getGuestTx(tx, ids.mergeId)
        if (keep.mergedIntoId || merged.mergedIntoId)
          throw conflict('errors.guestMerged', { mergedIntoId: keep.mergedIntoId ?? merged.mergedIntoId })
        const iso = now.toISOString()
        const movedRows = {
          reservations: tx
            .update(reservations)
            .set({ primaryGuestId: keep.id, updatedAt: iso })
            .where(eq(reservations.primaryGuestId, merged.id))
            .run().changes,
          occupants: tx
            .update(stayOccupants)
            .set({ guestId: keep.id, updatedAt: iso })
            .where(eq(stayOccupants.guestId, merged.id))
            .run().changes,
          blacklist: tx
            .update(blacklist)
            .set({ guestId: keep.id, updatedAt: iso })
            .where(eq(blacklist.guestId, merged.id))
            .run().changes,
          mergedGuests: tx
            .update(guests)
            .set({ mergedIntoId: keep.id, updatedAt: iso })
            .where(eq(guests.mergedIntoId, merged.id))
            .run().changes
        }
        // Tags (G-50) follow the person: the kept card gets the merged card's tags it does not have yet.
        const keepTagsBefore = tagIdsByGuest(tx, [keep.id]).get(keep.id) ?? []
        const mergedTags = tagIdsByGuest(tx, [merged.id]).get(merged.id) ?? []
        const newTags = mergedTags.filter((tagId) => !keepTagsBefore.includes(tagId))
        if (mergedTags.length) tx.delete(guestTagLinks).where(eq(guestTagLinks.guestId, merged.id)).run()
        if (newTags.length)
          tx.insert(guestTagLinks)
            .values(
              newTags.map((tagId) => ({ guestId: keep.id, tagId, createdBy: ctx.userId, createdAt: iso }))
            )
            .run()
        const moved = { ...movedRows, tags: newTags.length }
        const fill: Partial<GuestRow> = {}
        if (!keep.phone && merged.phone) {
          fill.phone = merged.phone
          fill.phoneNormalized = merged.phoneNormalized
        }
        if (!keep.email && merged.email) fill.email = merged.email
        if (!keep.nationality && merged.nationality) fill.nationality = merged.nationality
        if (!keep.idDocNumber && merged.idDocNumber) {
          fill.idDocNumber = merged.idDocNumber
          fill.idDocType = merged.idDocType
        }
        if (!keep.language && merged.language) fill.language = merged.language
        if (!keep.standingNote && merged.standingNote) {
          fill.standingNote = merged.standingNote
          fill.standingNoteLevel = merged.standingNoteLevel
        }
        if (merged.notes && merged.notes !== keep.notes)
          fill.notes = keep.notes ? `${keep.notes}\n${merged.notes}` : merged.notes
        if (!keep.companyId && merged.companyId) fill.companyId = merged.companyId
        if (merged.vip && !keep.vip) fill.vip = true
        tx.update(guests)
          .set({ ...fill, updatedAt: iso })
          .where(eq(guests.id, keep.id))
          .run()
        tx.update(guests).set({ mergedIntoId: keep.id, updatedAt: iso }).where(eq(guests.id, merged.id)).run()
        const keepAfter = getGuestTx(tx, keep.id)
        const mergedAfter = getGuestTx(tx, merged.id)
        renameOccupants(tx, audit, keepAfter, now)
        audit({
          entity: 'guest',
          entityId: keep.id,
          action: 'merge',
          before: { ...keep, tagIds: keepTagsBefore },
          after: { ...keepAfter, moved, tagIds: tagIdsByGuest(tx, [keep.id]).get(keep.id) ?? [] }
        })
        audit({
          entity: 'guest',
          entityId: merged.id,
          action: 'merge',
          before: { ...merged, tagIds: mergedTags },
          after: { ...mergedAfter, tagIds: [] }
        })
        return { guest: guestView(ctx, keepAfter), moved }
      })
    },

    /**
     * Stay, price and payment history (§6.12, G-190 "son ödediği fiyat"): reservations where the guest is the
     * primary guest or a room occupant, one entry per reservation (rooms joined), nightly prices from
     * room_nights, paid = Σ folio credits (refunds subtracted, voided rows excluded).
     */
    guestHistory(ctx: Ctx, guestId: string, opts: { excludeReservationId?: string } = {}): GuestHistory {
      requirePermission(ctx, 'guests', 'view')
      const guest = followMerge(db, getGuestTx(db, parseInput(idSchema, guestId)))
      const stays = historyStays(
        db,
        reservationIdsOf(db, [guest.id]).filter((id) => id !== opts.excludeReservationId)
      )
      const history: GuestHistory = {
        guestId: guest.id,
        ...summaryOf(stays, localDateOf(deps.clock())),
        standingNote: standingNoteAlert(guest),
        moneyHidden: false
      }
      return canSeeMoney(ctx) ? history : hideMoney(history)
    },

    /**
     * Guest list (faz-06 madde 1): search by name, phone, company and — for users who may view identity fields —
     * document number; filters (returning, VIP, standing request, company, blacklist, possible duplicate), sort and
     * a page. Every row's numbers come from the same history rule as the guest card (§6.12).
     */
    list(ctx: Ctx, input: GuestListInput = {}): GuestList {
      requirePermission(ctx, 'guests', 'view')
      const data = parseInput(guestListSchema, input)
      const today = localDateOf(deps.clock())
      const all = db.select().from(guests).where(isNull(guests.mergedIntoId)).all()
      const companyOf = new Map(
        db
          .select()
          .from(companies)
          .all()
          .map((c) => [c.id, c])
      )

      const tokens = normalizeName(data.q ?? '')
        .split(' ')
        .filter(Boolean)
      const digits = phoneNeedle(data.q ?? '')
      const doc = canSeeIdentity(ctx) ? normalizeDocNumber(data.q ?? '') : ''
      // The company's title is found and shown only for users who may read companies (as in search()).
      const seeCompanies = ctx.can('companies', 'view')
      const hasAll = (text: string | null | undefined): boolean =>
        !!text && tokens.every((t) => text.includes(t))
      /** 0 = exact (name, company, phone, document), 1 = a name a slip away ("gadir garibov"), null = no. */
      const rankOf = (g: GuestRow): 0 | 1 | null => {
        if (!data.q) return 0
        const company = g.companyId && seeCompanies ? companyOf.get(g.companyId) : undefined
        if (
          (tokens.length > 0 && (hasAll(g.nameNormalized) || hasAll(company?.nameNormalized))) ||
          digits.some((d) => !!g.phoneNormalized?.includes(d)) ||
          (doc.length >= 3 && !!g.idDocNumber?.includes(doc))
        )
          return 0
        return tokens.length > 0 && matchName(data.q, g.nameNormalized) === 'near' ? 1 : null
      }
      const rank = new Map<string, 0 | 1>()
      for (const g of all) {
        const r = rankOf(g)
        if (r !== null) rank.set(g.id, r)
      }
      const tagsOf = tagIdsByGuest(db)
      // Room and date filter (G-190 "302'de Mart'ta kim kaldı"): only guests with such a stay, and those stays.
      const stayMatches = staysInRoomOrDates(db, data)
      const matched = all.filter(
        (g) =>
          rank.has(g.id) &&
          (!data.tagId || (tagsOf.get(g.id) ?? []).includes(data.tagId)) &&
          (!stayMatches || stayMatches.has(g.id))
      )
      const narrowed = !!data.q || !!stayMatches

      // Stays of the matched guests (primary guest or a person in a room), the card's own rule.
      const wanted = matched.map((g) => g.id)
      const links = guestReservationLinks(db, narrowed ? wanted : undefined)
      // The list needs only what the summary counts (no nights, rooms or methods): one aggregate row per stay, so
      // an empty search over ten years stays quick (Faz 16 büyük veri testi).
      const stayById = new Map(
        listStays(db, narrowed ? [...new Set([...links.values()].flatMap((set) => [...set]))] : null).map(
          (s) => [s.reservationId, s]
        )
      )
      const staysOf = (guestId: string): HistoryStay[] =>
        [...(links.get(guestId) ?? [])].map((id) => stayById.get(id)).filter((s): s is HistoryStay => !!s)

      const active = db.select().from(blacklist).where(eq(blacklist.status, 'active')).all()
      // The cards merged into each guest bring their earlier spellings (§6.9: one rule with the card).
      const mergedInto = new Map<string, GuestRow[]>()
      if (active.length)
        for (const m of db.select().from(guests).where(isNotNull(guests.mergedIntoId)).all())
          mergedInto.set(m.mergedIntoId ?? '', [...(mergedInto.get(m.mergedIntoId ?? '') ?? []), m])
      const isBlacklisted = (g: GuestRow): boolean =>
        active.length > 0 &&
        matchBlacklist(
          [g, ...(mergedInto.get(g.id) ?? [])].map((x) => ({
            name: fullName(x),
            phone: x.phone,
            idDocNumber: x.idDocNumber,
            guestId: x.id
          })),
          active
        ).length > 0
      const duplicates = duplicateIndex(all)
      const nameOf = new Map(all.map((g) => [g.id, fullName(g)]))
      const money = canSeeMoney(ctx)

      const rows = matched.map((g): GuestListRow => {
        const stays = staysOf(g.id)
        const summary = guestHistorySummary(stays, today)
        const coming = stays
          .filter((s) => s.checkIn > today && (s.status === 'confirmed' || s.status === 'tentative'))
          .map((s) => s.checkIn)
          .sort()
        const dup = duplicates.get(g.id)
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
          companyTitle: g.companyId && seeCompanies ? (companyOf.get(g.companyId)?.title ?? null) : null,
          stays: summary.stayCount,
          lastStayDate: summary.lastStayDate,
          nextStayDate: coming[0] ?? null,
          totalSpent: money ? summary.totalSpent : {},
          blacklisted: isBlacklisted(g),
          duplicateOf: dup
            ? { id: dup.otherId, name: nameOf.get(dup.otherId) ?? '', reasons: dup.reasons }
            : null,
          tagIds: tagsOf.get(g.id) ?? [],
          ...(stayMatches ? { matchedStays: stayMatches.get(g.id) ?? [] } : {})
        }
      })

      const passes: Record<GuestFilter, (r: GuestListRow) => boolean> = {
        all: () => true,
        returning: (r) => r.stays >= 2,
        vip: (r) => r.vip,
        note: (r) => !!r.standingNote,
        company: (r) => !!r.companyId,
        blacklist: (r) => r.blacklisted,
        duplicate: (r) => !!r.duplicateOf
      }
      const counts = Object.fromEntries(
        GUEST_FILTERS.map((f) => [f, rows.filter(passes[f]).length])
      ) as Record<GuestFilter, number>
      const base = baseCurrency(db)
      const byName = (a: GuestListRow, b: GuestListRow): number =>
        collator.compare(nameOf.get(a.id) ?? '', nameOf.get(b.id) ?? '')
      const order: Record<GuestSort, (a: GuestListRow, b: GuestListRow) => number> = {
        // Latest stay first; guests who have not stayed yet follow, the soonest arrival first.
        recent: (a, b) =>
          (b.lastStayDate ?? '').localeCompare(a.lastStayDate ?? '') ||
          (a.nextStayDate ?? '9').localeCompare(b.nextStayDate ?? '9') ||
          byName(a, b),
        name: byName,
        stays: (a, b) => b.stays - a.stays || byName(a, b),
        paid: (a, b) => (b.totalSpent[base] ?? 0) - (a.totalSpent[base] ?? 0) || byName(a, b)
      }
      const shown = rows
        .filter(passes[data.filter])
        .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0) || order[data.sort](a, b))
      return {
        rows: shown.slice(data.offset, data.offset + data.limit),
        total: shown.length,
        counts,
        baseCurrency: base,
        moneyHidden: !money
      }
    },

    /**
     * The guest card (faz-06 madde 2): the guest (identity masked by right), the company card when the user may
     * read billing details, possible duplicates (G-51) and active blacklist matches (G-45). A merged card opens
     * the card it was merged into.
     */
    card(ctx: Ctx, id: string): GuestCard {
      requirePermission(ctx, 'guests', 'view')
      const asked = getGuestTx(db, parseInput(idSchema, id))
      const guest = followMerge(db, asked)
      const company =
        guest.companyId && ctx.can('companies', 'view')
          ? (db.select().from(companies).where(eq(companies.id, guest.companyId)).get() ?? null)
          : null
      return {
        guest: guestView(ctx, guest),
        mergedFrom: asked.id === guest.id ? null : asked.id,
        company,
        duplicates: findDuplicates(ctx, {
          name: fullName(guest),
          phone: guest.phone,
          idDocNumber: guest.idDocNumber,
          excludeId: guest.id
        }),
        blacklist: blacklistMatches(
          db,
          { name: fullName(guest), phone: guest.phone, idDocNumber: guest.idDocNumber, guestId: guest.id },
          ctx.can('blacklist', 'view')
        ),
        tagIds: tagIdsByGuest(db, [guest.id]).get(guest.id) ?? []
      }
    },

    /** The tags of a guest (G-50; a merged card answers with the card it went into), in the list's order. */
    tagIdsOf(ctx: Ctx, guestId: string): string[] {
      requirePermission(ctx, 'guests', 'view')
      const guest = followMerge(db, getGuestTx(db, parseInput(idSchema, guestId)))
      return tagIdsByGuest(db, [guest.id]).get(guest.id) ?? []
    },

    /**
     * Puts the guest's tags as chosen on the card (G-50, K-46 (2)): tags left out are taken off, new ones added;
     * one audit row keeps the set before and after. A switched-off tag the guest already has may stay (or be taken
     * off) but cannot be added again — it is no longer offered.
     */
    setTags(ctx: Ctx, input: GuestTagsInput): { tagIds: string[] } {
      requirePermission(ctx, 'guests', 'edit')
      const data = parseInput(guestTagsInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const guest = getGuestTx(tx, data.id)
        if (guest.mergedIntoId) throw conflict('errors.guestMerged', { mergedIntoId: guest.mergedIntoId })
        const wanted = [...new Set(data.tagIds)]
        const tags = wanted.length
          ? tx.select().from(guestTags).where(inArray(guestTags.id, wanted)).all()
          : []
        if (tags.length !== wanted.length) throw notFound('guest_tag')
        const before = tagIdsByGuest(tx, [guest.id]).get(guest.id) ?? []
        const added = wanted.filter((tagId) => !before.includes(tagId))
        const removed = before.filter((tagId) => !wanted.includes(tagId))
        if (!added.length && !removed.length) return { tagIds: before }
        if (tags.some((tag) => added.includes(tag.id) && !tag.active)) throw conflict('errors.guestTagClosed')
        const iso = now.toISOString()
        if (removed.length)
          tx.delete(guestTagLinks)
            .where(and(eq(guestTagLinks.guestId, guest.id), inArray(guestTagLinks.tagId, removed)))
            .run()
        if (added.length)
          tx.insert(guestTagLinks)
            .values(
              added.map((tagId) => ({ guestId: guest.id, tagId, createdBy: ctx.userId, createdAt: iso }))
            )
            .run()
        const after = tagIdsByGuest(tx, [guest.id]).get(guest.id) ?? []
        audit({
          entity: 'guest',
          entityId: guest.id,
          action: 'update',
          before: { tagIds: before },
          after: { tagIds: after }
        })
        return { tagIds: after }
      })
    }
  }
}

/** Tag ids per guest (G-50), in the tag list's order (null = every guest; the table is small). */
function tagIdsByGuest(
  db: Pick<ServiceDeps['db'], 'select'>,
  only?: readonly string[]
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const chunks: (string[] | null)[] = only ? inChunks([...only], 400) : [null]
  for (const chunk of chunks)
    for (const r of db
      .select({ guestId: guestTagLinks.guestId, tagId: guestTagLinks.tagId })
      .from(guestTagLinks)
      .innerJoin(guestTags, eq(guestTags.id, guestTagLinks.tagId))
      .where(chunk ? inArray(guestTagLinks.guestId, chunk) : undefined)
      .orderBy(asc(guestTags.sort), asc(guestTags.createdAt))
      .all())
      out.set(r.guestId, [...(out.get(r.guestId) ?? []), r.tagId])
  return out
}

/**
 * The people in rooms tied to a guest card carry the card's name (G-60: the same person reads the same on every
 * screen, "Otelde kalanlar" too): after a name fix or a merge they are renamed, one audit row each.
 */
function renameOccupants(
  tx: Pick<ServiceDeps['db'], 'select' | 'update'>,
  audit: (entry: AuditEntry) => void,
  guest: GuestRow,
  now: Date
): void {
  const name = fullName(guest)
  const rows = tx
    .select({ id: stayOccupants.id, fullName: stayOccupants.fullName })
    .from(stayOccupants)
    .where(eq(stayOccupants.guestId, guest.id))
    .all()
  for (const o of rows) {
    if (o.fullName === name) continue
    tx.update(stayOccupants)
      .set({ fullName: name, updatedAt: now.toISOString() })
      .where(eq(stayOccupants.id, o.id))
      .run()
    audit({
      entity: 'stay_occupant',
      entityId: o.id,
      action: 'update',
      before: { fullName: o.fullName },
      after: { fullName: name },
      reason: 'guest_renamed'
    })
  }
}

/** Follows merged_into_id to the card that stays (a few hops at most). */
function followMerge(db: ServiceDeps['db'], start: GuestRow): GuestRow {
  let guest = start
  for (let hops = 0; guest.mergedIntoId && hops < 10; hops++) guest = getGuestTx(db, guest.mergedIntoId)
  return guest
}

/** Reservation ids per guest: as the primary guest or as a person in one of its rooms (null = every guest). */
function guestReservationLinks(db: ServiceDeps['db'], only?: readonly string[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const add = (guestId: string | null, reservationId: string): void => {
    if (!guestId) return
    const set = out.get(guestId)
    if (set) set.add(reservationId)
    else out.set(guestId, new Set([reservationId]))
  }
  const chunks: (string[] | null)[] = only ? inChunks([...only], 400) : [null]
  for (const chunk of chunks) {
    for (const r of db
      .select({ id: reservations.id, guestId: reservations.primaryGuestId })
      .from(reservations)
      .where(chunk ? inArray(reservations.primaryGuestId, chunk) : undefined)
      .all())
      add(r.guestId, r.id)
    for (const r of db
      .select({ id: reservationRooms.reservationId, guestId: stayOccupants.guestId })
      .from(stayOccupants)
      .innerJoin(reservationRooms, eq(stayOccupants.reservationRoomId, reservationRooms.id))
      .where(chunk ? inArray(stayOccupants.guestId, chunk) : isNotNull(stayOccupants.guestId))
      .all())
      add(r.guestId, r.id)
  }
  return out
}

type MatchedStay = NonNullable<GuestListRow['matchedStays']>[number]

/**
 * The guest list's room and date filter (G-190): stays in the room (its number, whole, any case) whose days touch
 * [stayFrom, stayTo] — nights [check-in, check-out), a day-use its own day — by guest (the reservation's primary
 * guest and the people in that room), latest first. A cancelled or no-show reservation counts with its state (the
 * list marks it); a room taken out of a live reservation and a parked one (no room) do not. null = no filter.
 */
function staysInRoomOrDates(
  db: ServiceDeps['db'],
  filter: { room?: string | undefined; stayFrom?: string | undefined; stayTo?: string | undefined }
): Map<string, MatchedStay[]> | null {
  const room = filter.room?.trim().toLocaleUpperCase('tr') ?? ''
  if (!room && !filter.stayFrom && !filter.stayTo) return null
  const out = new Map<string, MatchedStay[]>()
  const roomRows = db.select({ id: rooms.id, number: rooms.number }).from(rooms).all()
  const roomIds = room
    ? roomRows.filter((r) => r.number.trim().toLocaleUpperCase('tr') === room).map((r) => r.id)
    : null
  if (roomIds && !roomIds.length) return out
  const conditions: SQL[] = [
    sql`${reservations.status} <> 'parked'`,
    or(
      sql`${reservationRooms.status} <> 'cancelled'`,
      inArray(reservations.status, ['cancelled', 'no_show'])
    )!
  ]
  if (roomIds) conditions.push(inArray(reservationRooms.roomId, roomIds))
  if (filter.stayTo) conditions.push(sql`${reservationRooms.checkIn} <= ${filter.stayTo}`)
  if (filter.stayFrom)
    conditions.push(
      sql`(${reservationRooms.checkOut} > ${filter.stayFrom} or (${reservationRooms.checkOut} = ${reservationRooms.checkIn} and ${reservationRooms.checkIn} >= ${filter.stayFrom}))`
    )
  const stays = db
    .select({
      stayId: reservationRooms.id,
      roomId: reservationRooms.roomId,
      checkIn: reservationRooms.checkIn,
      checkOut: reservationRooms.checkOut,
      reservationId: reservations.id,
      code: reservations.code,
      status: reservations.status,
      primaryGuestId: reservations.primaryGuestId
    })
    .from(reservationRooms)
    .innerJoin(reservations, eq(reservationRooms.reservationId, reservations.id))
    .where(and(...conditions))
    .all()
  if (!stays.length) return out
  const numberOf = new Map(roomRows.map((r) => [r.id, r.number]))
  const people = new Map<string, Set<string>>()
  for (const chunk of inChunks(
    stays.map((s) => s.stayId),
    400
  ))
    for (const o of db
      .select({ stayId: stayOccupants.reservationRoomId, guestId: stayOccupants.guestId })
      .from(stayOccupants)
      .where(and(inArray(stayOccupants.reservationRoomId, chunk), isNotNull(stayOccupants.guestId)))
      .all())
      people.set(o.stayId, (people.get(o.stayId) ?? new Set()).add(o.guestId!))
  for (const s of stays) {
    const view: MatchedStay = {
      reservationId: s.reservationId,
      code: s.code,
      roomNumber: numberOf.get(s.roomId) ?? '',
      checkIn: s.checkIn,
      checkOut: s.checkOut,
      status: s.status
    }
    for (const guestId of new Set([s.primaryGuestId, ...(people.get(s.stayId) ?? [])])) {
      if (!guestId) continue
      out.set(guestId, [...(out.get(guestId) ?? []), view])
    }
  }
  for (const list of out.values()) list.sort((a, b) => b.checkIn.localeCompare(a.checkIn))
  return out
}

function reservationIdsOf(db: ServiceDeps['db'], guestIds: readonly string[]): string[] {
  const ids = new Set<string>()
  for (const set of guestReservationLinks(db, guestIds).values()) for (const id of set) ids.add(id)
  return [...ids]
}

/** The shared summary (§6.12) over the card's own stay shape. */
function summaryOf(
  stays: readonly GuestStay[],
  today: LocalDate
): Omit<GuestHistorySummary, 'stays'> & { stays: GuestStay[] } {
  const summary = guestHistorySummary(stays, today)
  return { ...summary, stays: summary.stays as GuestStay[] }
}

const canSeeMoney = (ctx: Ctx): boolean => ctx.can('payments', 'view')

/** Paid amounts, methods and balances only for users who may read payments (G-23); night prices stay. */
function hideMoney<
  T extends { totalSpent: Record<string, number>; stays: GuestStay[]; moneyHidden: boolean }
>(h: T): T {
  return {
    ...h,
    totalSpent: {},
    moneyHidden: true,
    stays: h.stays.map((s) => ({ ...s, paidMinor: 0, balanceMinor: 0, methods: [], methodIds: [] }))
  }
}

/** Cards that are probably the same person: same normalised name, phone (7+ digits) or document number. */
function duplicateIndex(
  rows: readonly GuestRow[]
): Map<string, { otherId: string; reasons: DuplicateReason[] }> {
  const keys = new Map<string, string[]>()
  const add = (key: string, id: string): void => {
    const list = keys.get(key)
    if (list) list.push(id)
    else keys.set(key, [id])
  }
  for (const g of rows) {
    if (g.nameNormalized) add(`name:${g.nameNormalized}`, g.id)
    if (g.phoneNormalized && g.phoneNormalized.length >= 7) add(`phone:${g.phoneNormalized}`, g.id)
    if (g.idDocNumber) add(`id:${g.idDocNumber}`, g.id)
  }
  const out = new Map<string, { otherId: string; reasons: DuplicateReason[] }>()
  for (const [key, ids] of keys) {
    if (ids.length < 2) continue
    const reason = key.slice(0, key.indexOf(':')) as DuplicateReason
    for (const id of ids) {
      const hint = out.get(id) ?? { otherId: ids.find((x) => x !== id) ?? id, reasons: [] }
      if (!hint.reasons.includes(reason)) hint.reasons.push(reason)
      out.set(id, hint)
    }
  }
  return out
}

/**
 * The guest list's view of stays (§6.12 summary only: status, first night, currency, money taken), aggregated in SQL
 * one row per reservation. The same rules as `historyStays`: the live rooms decide the dates (all rooms when every
 * room is cancelled), the folio's currency (else the first night's, else the base currency), voided payments left
 * out and refunds taken off. Nights, rooms and methods stay empty: the list does not show them.
 */
function listStays(db: ServiceDeps['db'], ids: readonly string[] | null): HistoryStay[] {
  if (ids && !ids.length) return []
  if (ids && ids.length > 400) return inChunks(ids, 400).flatMap((chunk) => listStays(db, chunk))
  const only = ids ? [...ids] : null
  const resRows = db
    .select({ id: reservations.id, status: reservations.status })
    .from(reservations)
    .where(only ? inArray(reservations.id, only) : undefined)
    .all()
  const dateRows = db
    .select({
      reservationId: reservationRooms.reservationId,
      liveIn: sql<
        string | null
      >`min(case when ${reservationRooms.status} <> 'cancelled' then ${reservationRooms.checkIn} end)`,
      anyIn: sql<string>`min(${reservationRooms.checkIn})`
    })
    .from(reservationRooms)
    .where(only ? inArray(reservationRooms.reservationId, only) : undefined)
    .groupBy(reservationRooms.reservationId)
    .all()
  const folioRows = db
    .select({ id: folios.id, reservationId: folios.reservationId, currency: folios.currency })
    .from(folios)
    .where(only ? inArray(folios.reservationId, only) : isNotNull(folios.reservationId))
    .all()
  const paidRows = db
    .select({
      folioId: payments.folioId,
      paid: sql<number>`coalesce(sum(case when ${payments.voidedAt} is null then (case when ${payments.kind} = 'refund' then -${payments.amountFolioMinor} else ${payments.amountFolioMinor} end) else 0 end), 0)`
    })
    .from(payments)
    .innerJoin(folios, eq(payments.folioId, folios.id))
    .where(only ? inArray(folios.reservationId, only) : isNotNull(folios.reservationId))
    .groupBy(payments.folioId)
    .all()
  const datesOf = new Map(dateRows.map((d) => [d.reservationId, d]))
  const folioOf = new Map(folioRows.map((f) => [f.reservationId, f]))
  const paidOf = new Map(paidRows.map((p) => [p.folioId, Number(p.paid)]))
  // A reservation without a folio takes its first night's currency (rare: older or unusual rows).
  const withoutFolio = resRows.filter((r) => !folioOf.has(r.id)).map((r) => r.id)
  const nightCurrency = new Map<string, string>()
  for (const chunk of inChunks(withoutFolio, 400))
    for (const n of db
      .select({ reservationId: reservationRooms.reservationId, currency: roomNights.currency })
      .from(roomNights)
      .innerJoin(reservationRooms, eq(roomNights.reservationRoomId, reservationRooms.id))
      .where(inArray(reservationRooms.reservationId, chunk))
      .orderBy(asc(roomNights.date), asc(reservationRooms.sort))
      .all())
      if (!nightCurrency.has(n.reservationId)) nightCurrency.set(n.reservationId, n.currency)
  const fallbackCurrency = baseCurrency(db)
  return resRows.flatMap((r): HistoryStay[] => {
    const dates = datesOf.get(r.id)
    if (!dates) return []
    const checkIn = localDate(dates.liveIn ?? dates.anyIn)
    const folio = folioOf.get(r.id)
    return [
      {
        reservationId: r.id,
        roomNumber: '',
        checkIn,
        checkOut: checkIn,
        status: r.status,
        nights: [],
        paidMinor: folio ? (paidOf.get(folio.id) ?? 0) : 0,
        currency: folio?.currency ?? nightCurrency.get(r.id) ?? fallbackCurrency,
        methods: []
      }
    ]
  })
}

/** One stay of the history: the shared shape (§6.12) plus what the guest card shows next to it. */
export type GuestStay = Omit<HistoryStay, 'status' | 'nights' | 'methods' | 'channel'> & {
  channel: string | null
  status: (typeof reservations.$inferSelect)['status']
  nights: HistoryStay['nights'][number][]
  methods: string[]
  code: string
  primaryGuestId: string
  channelId: string | null
  methodIds: string[]
  /** Σ charges − credited in the folio currency (positive = still owed). */
  balanceMinor: number
}

/**
 * Stays of the given reservations (null = every reservation), one entry per reservation with its live rooms
 * joined; nightly prices from room_nights, paid = Σ folio credits (refunds subtracted, voided rows excluded).
 */
function historyStays(db: ServiceDeps['db'], ids: readonly string[] | null): GuestStay[] {
  if (ids && !ids.length) return []
  if (ids && ids.length > 400) return inChunks(ids, 400).flatMap((chunk) => historyStays(db, chunk))
  const only = ids ? [...ids] : null
  const byReservation = (col: typeof reservationRooms.reservationId | typeof folios.reservationId) =>
    only ? inArray(col, only) : undefined
  const resRows = db
    .select({
      id: reservations.id,
      code: reservations.code,
      primaryGuestId: reservations.primaryGuestId,
      status: reservations.status,
      channel: salesChannels.code,
      channelId: reservations.channelId
    })
    .from(reservations)
    .leftJoin(salesChannels, eq(reservations.channelId, salesChannels.id))
    .where(only ? inArray(reservations.id, only) : undefined)
    .all()
  const roomRows = db
    .select({
      reservationId: reservationRooms.reservationId,
      number: rooms.number,
      checkIn: reservationRooms.checkIn,
      checkOut: reservationRooms.checkOut,
      status: reservationRooms.status,
      sort: reservationRooms.sort
    })
    .from(reservationRooms)
    .innerJoin(rooms, eq(reservationRooms.roomId, rooms.id))
    .where(byReservation(reservationRooms.reservationId))
    .orderBy(asc(reservationRooms.sort), asc(rooms.number))
    .all()
  const nightRows = db
    .select({
      reservationId: reservationRooms.reservationId,
      date: roomNights.date,
      priceMinor: roomNights.priceMinor,
      currency: roomNights.currency
    })
    .from(roomNights)
    .innerJoin(reservationRooms, eq(roomNights.reservationRoomId, reservationRooms.id))
    .where(byReservation(reservationRooms.reservationId))
    .orderBy(asc(roomNights.date), asc(reservationRooms.sort))
    .all()
  const folioRows = db
    .select({ id: folios.id, reservationId: folios.reservationId, currency: folios.currency })
    .from(folios)
    .where(only ? inArray(folios.reservationId, only) : isNotNull(folios.reservationId))
    .all()
  const folioFilter = only ? inArray(folios.reservationId, only) : isNotNull(folios.reservationId)
  const paymentRows = db
    .select({
      folioId: payments.folioId,
      kind: payments.kind,
      amountFolioMinor: payments.amountFolioMinor,
      voidedAt: payments.voidedAt,
      method: paymentMethods.code,
      methodId: payments.methodId
    })
    .from(payments)
    .innerJoin(folios, eq(payments.folioId, folios.id))
    .innerJoin(paymentMethods, eq(payments.methodId, paymentMethods.id))
    .where(folioFilter)
    .orderBy(asc(payments.date), asc(payments.createdAt))
    .all()
  const chargeRows = db
    .select({ folioId: charges.folioId, amountMinor: charges.amountMinor, voidedAt: charges.voidedAt })
    .from(charges)
    .innerJoin(folios, eq(charges.folioId, folios.id))
    .where(folioFilter)
    .all()
  const fallbackCurrency = baseCurrency(db)

  const group = <T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> => {
    const out = new Map<K, T[]>()
    for (const row of rows) {
      const k = key(row)
      const list = out.get(k)
      if (list) list.push(row)
      else out.set(k, [row])
    }
    return out
  }
  const roomsOf = group(roomRows, (x) => x.reservationId)
  const nightsOf = group(nightRows, (x) => x.reservationId)
  const folioOf = new Map(folioRows.map((f) => [f.reservationId, f]))
  const paymentsOf = group(paymentRows, (x) => x.folioId)
  const chargesOf = group(chargeRows, (x) => x.folioId)

  return resRows.flatMap((r): GuestStay[] => {
    const allRooms = roomsOf.get(r.id) ?? []
    const liveRooms = allRooms.filter((x) => x.status !== 'cancelled')
    const shown = liveRooms.length ? liveRooms : allRooms
    if (!shown.length) return []
    const folio = folioOf.get(r.id)
    const credits = folio ? (paymentsOf.get(folio.id) ?? []) : []
    const nights = (nightsOf.get(r.id) ?? []).map((n) => ({
      date: localDate(n.date),
      priceMinor: n.priceMinor,
      currency: n.currency
    }))
    const live = credits.filter((p) => !p.voidedAt)
    const creditLike = credits.map((p) => ({
      kind: p.kind,
      amountFolioMinor: p.amountFolioMinor,
      voided: !!p.voidedAt
    }))
    const totals = folioTotals(
      (folio ? (chargesOf.get(folio.id) ?? []) : []).map((c) => ({
        amountMinor: c.amountMinor,
        voided: !!c.voidedAt
      })),
      creditLike
    )
    return [
      {
        reservationId: r.id,
        code: r.code,
        primaryGuestId: r.primaryGuestId,
        roomNumber: [...new Set(shown.map((x) => x.number))].join(', '),
        checkIn: localDate(shown.map((x) => x.checkIn).sort()[0] ?? ''),
        checkOut: localDate(
          shown
            .map((x) => x.checkOut)
            .sort()
            .at(-1) ?? ''
        ),
        status: r.status,
        nights,
        paidMinor: creditedTotal(creditLike),
        currency: folio?.currency ?? nights[0]?.currency ?? fallbackCurrency,
        methods: [...new Set(live.map((p) => p.method))],
        methodIds: [...new Set(live.map((p) => p.methodId))],
        channel: r.channel ?? null,
        channelId: r.channelId,
        balanceMinor: totals.balanceMinor
      }
    ]
  })
}

export type GuestsService = ReturnType<typeof createGuestsService>

// --- Companies (G-191) -----------------------------------------------------------------------------------

export function createCompaniesService(deps: ServiceDeps) {
  const { db } = deps

  const getTx = (tx: Pick<ServiceDeps['db'], 'select'>, id: string): CompanyRow => {
    const row = tx.select().from(companies).where(eq(companies.id, id)).get()
    if (!row) throw notFound('company', id)
    return row
  }

  const write = (ctx: Ctx, id: string, patch: Partial<CompanyRow>): CompanyRow =>
    inTransaction(deps, ctx, (tx, audit, now) => {
      const before = getTx(tx, id)
      const next: Partial<CompanyRow> = { ...patch, updatedAt: now.toISOString() }
      if (patch.title !== undefined) next.nameNormalized = normalizeName(patch.title)
      tx.update(companies).set(next).where(eq(companies.id, id)).run()
      const after = getTx(tx, id)
      audit({ entity: 'company', entityId: id, action: 'update', before, after })
      return after
    })

  return {
    /**
     * Favourites first, then most recently used, then by title (Turkish order). `q` finds every word in the
     * title or the digits in the tax number.
     */
    list(ctx: Ctx, opts: { q?: string } = {}): CompanyRow[] {
      requirePermission(ctx, 'companies', 'view')
      const data = parseInput(companyListSchema, opts)
      const tokens = normalizeName(data.q ?? '')
        .split(' ')
        .filter(Boolean)
      const digits = (data.q ?? '').replace(/\D/g, '')
      return db
        .select()
        .from(companies)
        .all()
        .filter(
          (c) =>
            !data.q ||
            (tokens.length > 0 && tokens.every((t) => c.nameNormalized.includes(t))) ||
            (digits.length >= 3 && (c.taxNumber ?? '').includes(digits))
        )
        .sort(
          (a, b) =>
            Number(b.favorite) - Number(a.favorite) ||
            (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') ||
            collator.compare(a.title, b.title)
        )
    },

    /** The list with the number of guests linked to each company (merged cards not counted). */
    listView(ctx: Ctx, opts: { q?: string } = {}): (CompanyRow & { guestCount: number })[] {
      const rows = this.list(ctx, opts)
      const counts = new Map<string, number>()
      for (const g of db
        .select({ companyId: guests.companyId })
        .from(guests)
        .where(and(isNull(guests.mergedIntoId), isNotNull(guests.companyId)))
        .all())
        if (g.companyId) counts.set(g.companyId, (counts.get(g.companyId) ?? 0) + 1)
      return rows.map((c) => ({ ...c, guestCount: counts.get(c.id) ?? 0 }))
    },

    /**
     * A company with its guests and their stays and payments (faz-06 madde 3, "kurumsal geçmiş"): the same
     * history rule as the guest card (§6.12) over every reservation of a linked guest.
     */
    detail(ctx: Ctx, id: string): CompanyDetail {
      requirePermission(ctx, 'companies', 'view')
      const company = getTx(db, parseInput(idSchema, id))
      const linked = ctx.can('guests', 'view')
        ? db
            .select()
            .from(guests)
            .where(and(eq(guests.companyId, company.id), isNull(guests.mergedIntoId)))
            .all()
            .sort((a, b) => collator.compare(fullName(a), fullName(b)))
        : []
      const nameOf = new Map(linked.map((g) => [g.id, fullName(g)]))
      const links = linked.length ? guestReservationLinks(db, [...nameOf.keys()]) : new Map()
      const reservationGuest = new Map<string, string>()
      for (const [guestId, ids] of links as Map<string, Set<string>>)
        for (const rid of ids) if (!reservationGuest.has(rid)) reservationGuest.set(rid, guestId)
      const stays = historyStays(db, [...reservationGuest.keys()]).map((s) => {
        const guestId = nameOf.has(s.primaryGuestId)
          ? s.primaryGuestId
          : (reservationGuest.get(s.reservationId) ?? '')
        return { ...s, guestId, guestName: nameOf.get(guestId) ?? '' }
      })
      const summary = summaryOf(stays, localDateOf(deps.clock()))
      const history = {
        ...summary,
        stays: summary.stays as (GuestStay & { guestId: string; guestName: string })[],
        moneyHidden: false
      }
      const shown = canSeeMoney(ctx) ? history : hideMoney(history)
      return {
        company,
        guests: linked.map((g) => ({
          id: g.id,
          firstName: g.firstName,
          lastName: g.lastName,
          phone: g.phone,
          vip: g.vip
        })),
        stays: shown.stays as (GuestStay & { guestId: string; guestName: string })[],
        stayCount: shown.stays.filter((s) => s.status !== 'cancelled').length,
        totalNights: shown.totalNights,
        totalSpent: shown.totalSpent,
        moneyHidden: shown.moneyHidden
      }
    },

    get(ctx: Ctx, id: string): CompanyRow {
      requirePermission(ctx, 'companies', 'view')
      return getTx(db, parseInput(idSchema, id))
    },

    create(ctx: Ctx, input: CompanyInput): CompanyRow {
      requirePermission(ctx, 'companies', 'edit')
      const data = parseInput(companyInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const id = newId(now)
        const row = {
          id,
          title: data.title,
          nameNormalized: normalizeName(data.title),
          address: data.address ?? null,
          city: data.city ?? null,
          taxOffice: data.taxOffice ?? null,
          taxNumber: data.taxNumber ?? null,
          phone: data.phone ?? null,
          email: data.email ?? null,
          iban: data.iban ?? null,
          contactPerson: data.contactPerson ?? null,
          note: data.note ?? null,
          favorite: data.favorite,
          lastUsedAt: null,
          createdBy: ctx.userId,
          ...stamps(now)
        }
        tx.insert(companies).values(row).run()
        audit({ entity: 'company', entityId: id, action: 'create', after: row })
        return getTx(tx, id)
      })
    },

    update(ctx: Ctx, id: string, input: CompanyUpdate): CompanyRow {
      requirePermission(ctx, 'companies', 'edit')
      return write(ctx, parseInput(idSchema, id), parseInput(companyUpdateSchema, input))
    },

    setFavorite(ctx: Ctx, id: string, favorite: boolean): CompanyRow {
      requirePermission(ctx, 'companies', 'edit')
      return write(ctx, parseInput(idSchema, id), {
        favorite: parseInput(companyUpdateSchema.shape.favorite, favorite)
      })
    },

    /** Stamps last_used_at (company chosen for a stay or copied) so it rises in the list. */
    markUsed(ctx: Ctx, id: string): CompanyRow {
      requirePermission(ctx, 'companies', 'edit')
      return write(ctx, parseInput(idSchema, id), { lastUsedAt: deps.clock().toISOString() })
    },

    /**
     * Billing details for the clipboard (G-191), in print order; the screen adds the label words in the
     * language of the invoice program (`formatCopyText`). Bismuth never issues the invoice (G-06).
     */
    copyFields(ctx: Ctx, id: string): CopyField[] {
      requirePermission(ctx, 'companies', 'view')
      return companyCopyFields(getTx(db, parseInput(idSchema, id)))
    }
  }
}

export type CompaniesService = ReturnType<typeof createCompaniesService>

export interface CompanyDetail {
  company: CompanyRow
  guests: { id: string; firstName: string; lastName: string; phone: string | null; vip: boolean }[]
  /** Stays of the linked guests, newest first, each with the guest it belongs to. */
  stays: (GuestStay & { guestId: string; guestName: string })[]
  stayCount: number
  totalNights: number
  totalSpent: Record<string, number>
  moneyHidden: boolean
}

// --- Blacklist (G-52, §6.9) ------------------------------------------------------------------------------

export type BlacklistListView = BlacklistView & {
  addedByName: string | null
  approvedByName: string | null
  removedByName: string | null
}

export interface BlacklistHitView {
  entry: BlacklistView
  reasons: MatchReason[]
}

export function createBlacklistService(deps: ServiceDeps) {
  const { db } = deps

  const getTx = (tx: Pick<ServiceDeps['db'], 'select'>, id: string): BlacklistRow => {
    const row = tx.select().from(blacklist).where(eq(blacklist.id, id)).get()
    if (!row) throw notFound('blacklist', id)
    return row
  }

  return {
    list(ctx: Ctx, opts: BlacklistListInput = {}): BlacklistView[] {
      requirePermission(ctx, 'blacklist', 'view')
      const { status } = parseInput(blacklistListSchema, opts)
      return db
        .select()
        .from(blacklist)
        .where(status === 'all' ? undefined : eq(blacklist.status, status))
        .all()
        .sort((a, b) => collator.compare(a.name, b.name))
        .map((row) => blacklistView(ctx, row))
    },

    /** The list screen: "block" first, then the newest; who added, approved and removed by name. */
    listView(ctx: Ctx, opts: BlacklistListInput = {}): BlacklistListView[] {
      const rows = this.list(ctx, opts)
      const names = new Map(
        db
          .select({ id: users.id, name: users.displayName })
          .from(users)
          .all()
          .map((u) => [u.id, u.name])
      )
      const nameOf = (id: string | null): string | null => (id ? (names.get(id) ?? null) : null)
      return rows
        .sort(
          (a, b) =>
            Number(a.severity !== 'block') - Number(b.severity !== 'block') ||
            b.createdAt.localeCompare(a.createdAt)
        )
        .map((row) => ({
          ...row,
          addedByName: nameOf(row.addedBy),
          approvedByName: nameOf(row.approvedBy),
          removedByName: nameOf(row.removedBy)
        }))
    },

    /**
     * Adds an entry (blacklist edit). From a guest card the guest's name, document and phone are copied; a
     * document number typed by hand needs `guests.identity` edit. A user who may also remove entries
     * (manager/owner) is recorded as the approver.
     */
    add(ctx: Ctx, input: BlacklistInput): BlacklistView {
      requirePermission(ctx, 'blacklist', 'edit')
      const data = parseInput(blacklistInputSchema, input)
      if (data.idDocNumber && !ctx.can('guests.identity', 'edit')) throw permissionDenied()
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const guest = data.guestId ? getGuestTx(tx, data.guestId) : null
        const name = data.name || (guest ? fullName(guest) : '')
        const nameNormalized = normalizeName(name)
        if (!nameNormalized) throw invalid('errors.validation', { fields: { name: ['required'] } })
        const doc = data.idDocNumber ? normalizeDocNumber(data.idDocNumber) : (guest?.idDocNumber ?? '')
        const phone = data.phone ? normalizePhone(data.phone) : (guest?.phoneNormalized ?? '')
        const id = newId(now)
        const row = {
          id,
          guestId: guest?.id ?? null,
          name,
          nameNormalized,
          idDocNumber: nullIfEmpty(doc),
          phoneNormalized: nullIfEmpty(phone),
          severity: data.severity,
          reasonCode: data.reasonCode,
          reasonText: data.reasonText,
          incidentDate: data.incidentDate ?? null,
          addedBy: ctx.userId,
          approvedBy: ctx.can('blacklist.remove', 'edit') ? ctx.userId : null,
          status: 'active' as const,
          ...stamps(now)
        }
        tx.insert(blacklist).values(row).run()
        audit({ entity: 'blacklist', entityId: id, action: 'create', after: row })
        return blacklistView(ctx, getTx(tx, id))
      })
    },

    /** Removal is a status change with a reason (blacklist.remove edit); the row stays. */
    remove(ctx: Ctx, id: string, reason: string): BlacklistView {
      requirePermission(ctx, 'blacklist.remove', 'edit')
      const why = parseInput(blacklistRemoveReasonSchema, reason)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = getTx(tx, parseInput(idSchema, id))
        if (before.status === 'removed') throw conflict('errors.blacklistAlreadyRemoved')
        tx.update(blacklist)
          .set({
            status: 'removed',
            removedAt: now.toISOString(),
            removedBy: ctx.userId,
            removedReason: why,
            updatedAt: now.toISOString()
          })
          .where(eq(blacklist.id, before.id))
          .run()
        const after = getTx(tx, before.id)
        audit({ entity: 'blacklist', entityId: before.id, action: 'cancel', before, after, reason: why })
        return blacklistView(ctx, after)
      })
    },

    /**
     * The warning while a guest card is typed (G-45, faz-06 "kara listedeki telefonla yeni misafir"): whoever
     * writes guests is warned; the reason text only for users who may read the blacklist.
     */
    warn(ctx: Ctx, candidate: GuestCandidate): BlacklistHitBrief[] {
      if (!ctx.can('guests', 'view') && !ctx.can('blacklist', 'view')) throw permissionDenied()
      const data = parseInput(guestCandidateSchema, candidate)
      return blacklistMatches(
        db,
        {
          name: data.name,
          phone: data.phone ?? null,
          idDocNumber: data.idDocNumber ?? null,
          guestId: data.excludeId ?? null
        },
        ctx.can('blacklist', 'view')
      )
    },

    /** Active entries matching the person by name, document number or phone ("block" first; §6.9). */
    check(ctx: Ctx, candidate: GuestCandidate): BlacklistHitView[] {
      requirePermission(ctx, 'blacklist', 'view')
      const data = parseInput(guestCandidateSchema, candidate)
      const name = normalizeName(data.name)
      const doc = data.idDocNumber ? normalizeDocNumber(data.idDocNumber) : ''
      const phone = data.phone ? normalizePhone(data.phone) : ''
      const conds: SQL[] = []
      if (name) conds.push(eq(blacklist.nameNormalized, name))
      if (doc) conds.push(eq(blacklist.idDocNumber, doc))
      if (phone) conds.push(eq(blacklist.phoneNormalized, phone))
      if (!conds.length) return []
      const entries = db
        .select()
        .from(blacklist)
        .where(and(eq(blacklist.status, 'active'), or(...conds)))
        .all()
      return matchBlacklist({ name: data.name, idDocNumber: doc, phone: data.phone }, entries).map((hit) => ({
        entry: blacklistView(ctx, hit.entry),
        reasons: hit.reasons
      }))
    }
  }
}

export type BlacklistService = ReturnType<typeof createBlacklistService>
