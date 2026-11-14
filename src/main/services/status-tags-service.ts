// Status tags (G-32, G-33, K-21, §6.14): the automatic statuses (seeded, colours per theme in settings or
// `--status-*`) and the hotel's own custom tags put on reservations. The cell style itself is the pure
// `cellStyle` rule; this service feeds it from the rows so the calendar, Today and reports agree.
import { and, asc, eq, inArray } from 'drizzle-orm'
import {
  customStatusTagInputSchema,
  reservationTagsInputSchema,
  statusTagUpdateSchema,
  type CustomStatusTagInput,
  type ReservationTagsInput,
  type StatusTagUpdate
} from '@shared/contract/operations'
import { STATUS_KEYS, type StatusKey } from '@shared/contract/settings'
import { localDateOf, type LocalDate } from '@shared/date'
import { cellStyle, type CellStyle } from '@shared/domain/cell-status'
import { reservations, reservationTags, statusTags } from '../db/schema'
import { STATUS_TAG_SEED } from '../db/seed/lists'
import type { I18nText } from '../db/schema/columns'
import type { Ctx } from './context'
import { permissionDenied } from './errors'
import {
  conflict,
  inTransaction,
  invalid,
  newId,
  notFound,
  parseInput,
  requirePermission,
  stamps,
  type ServiceDeps,
  type Tx,
  assertNameFree
} from './kit'
import { createReservationsService } from './reservations-service'

export type StatusTagRow = typeof statusTags.$inferSelect

export interface StatusTagView extends StatusTagRow {
  /** Translated name of a seeded tag while the hotel keeps its seeded name. */
  displayName: I18nText | null
}

export interface NightStyle {
  date: LocalDate
  roomId: string
  style: CellStyle
}

const tagView = (t: StatusTagRow): StatusTagView => ({
  ...t,
  displayName: t.name === null ? t.nameI18n : null
})

export function createStatusTagsService(deps: ServiceDeps) {
  const { db } = deps
  const reservationsSvc = createReservationsService(deps)

  const tagOf = (tx: Pick<Tx, 'select'>, id: string): StatusTagRow => {
    const row = tx.select().from(statusTags).where(eq(statusTags.id, id)).get()
    if (!row) throw notFound('status_tag', id)
    return row
  }

  /** The calendar paints with tags, the colour screen edits them: either view is enough to read. */
  const requireRead = (ctx: Ctx): void => {
    if (!ctx.can('calendar', 'view') && !ctx.can('settings.colors', 'view')) throw permissionDenied()
  }

  const enabledAuto = (tx: Pick<Tx, 'select'>): Set<StatusKey> =>
    new Set(
      tx
        .select()
        .from(statusTags)
        .where(and(eq(statusTags.kind, 'auto'), eq(statusTags.enabled, true)))
        .all()
        .map((t) => t.code)
        .filter((c): c is StatusKey => (STATUS_KEYS as readonly string[]).includes(c))
    )

  const tagsOfReservation = (tx: Pick<Tx, 'select'>, reservationId: string): StatusTagRow[] =>
    tx
      .select({ t: statusTags })
      .from(reservationTags)
      .innerJoin(statusTags, eq(statusTags.id, reservationTags.tagId))
      .where(eq(reservationTags.reservationId, reservationId))
      .orderBy(asc(statusTags.sort), asc(statusTags.createdAt))
      .all()
      .map((r) => r.t)

  return {
    /** Automatic tags first (seeded order), then custom tags. */
    list(ctx: Ctx): StatusTagView[] {
      requireRead(ctx)
      return db
        .select()
        .from(statusTags)
        .orderBy(asc(statusTags.kind), asc(statusTags.sort), asc(statusTags.createdAt))
        .all()
        .map(tagView)
    },

    /** Colour, name, on/off and order (G-33). Renaming a seeded tag drops its translations. */
    update(ctx: Ctx, id: string, patch: StatusTagUpdate): StatusTagView {
      requirePermission(ctx, 'settings.colors', 'edit')
      const data = parseInput(statusTagUpdateSchema, patch)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = tagOf(tx, id)
        if (before.kind === 'auto' && data.priorityOverAuto !== undefined)
          throw invalid('errors.validation', { fields: { priorityOverAuto: ['custom tags only'] } })
        if (before.kind === 'custom' && data.name === null)
          throw invalid('errors.validation', { fields: { name: ['custom tags keep a name'] } })
        const { name, ...rest } = data
        // A hotel's own name replaces the translations; `null` brings the seeded translations back.
        const naming =
          name === undefined
            ? {}
            : name === null
              ? { name: null, nameI18n: STATUS_TAG_SEED.find((s) => s.code === before.code)?.name ?? null }
              : { name, nameI18n: null }
        tx.update(statusTags)
          .set({
            ...rest,
            ...naming,
            updatedAt: now.toISOString()
          })
          .where(eq(statusTags.id, id))
          .run()
        const after = tagOf(tx, id)
        audit({ entity: 'status_tag', entityId: id, action: 'update', before, after })
        return tagView(after)
      })
    },

    createCustom(ctx: Ctx, input: CustomStatusTagInput): StatusTagView {
      requirePermission(ctx, 'settings.colors', 'edit')
      const data = parseInput(customStatusTagInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        assertNameFree(tx.select().from(statusTags).all(), data.name)
        const id = newId(now)
        const last = tx
          .select({ sort: statusTags.sort })
          .from(statusTags)
          .orderBy(asc(statusTags.sort))
          .all()
          .at(-1)
        const row: StatusTagRow = {
          id,
          code: `custom_${id.toLowerCase()}`,
          kind: 'custom',
          name: data.name,
          nameI18n: null,
          color: data.color,
          description: data.description ?? null,
          enabled: true,
          sort: (last?.sort ?? 0) + 1,
          priorityOverAuto: data.priorityOverAuto,
          ...stamps(now)
        }
        tx.insert(statusTags).values(row).run()
        audit({ entity: 'status_tag', entityId: id, action: 'create', after: row })
        return tagView(row)
      })
    },

    /**
     * Removes a custom tag nobody has used yet (a typo, a test). A tag on any reservation stays: the owner turns
     * it off instead, so old reservations keep their label (no deletion of history, G-24).
     */
    removeCustom(ctx: Ctx, id: string): { ok: true } {
      requirePermission(ctx, 'settings.colors', 'edit')
      return inTransaction(deps, ctx, (tx, audit) => {
        const before = tagOf(tx, id)
        if (before.kind !== 'custom')
          throw invalid('errors.validation', { fields: { id: ['custom tags only'] } })
        const used = tx
          .select({ id: reservationTags.reservationId })
          .from(reservationTags)
          .where(eq(reservationTags.tagId, id))
          .get()
        if (used) throw conflict('errors.tagInUse')
        tx.delete(statusTags).where(eq(statusTags.id, id)).run()
        audit({ entity: 'status_tag', entityId: id, action: 'delete', before })
        return { ok: true as const }
      })
    },

    /** Replaces the custom tags of a reservation ("VIP", "geç gelecek"); automatic tags are never stored. */
    setReservationTags(ctx: Ctx, input: ReservationTagsInput): StatusTagView[] {
      requirePermission(ctx, 'calendar', 'edit')
      const data = parseInput(reservationTagsInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit) => {
        if (
          !tx
            .select({ id: reservations.id })
            .from(reservations)
            .where(eq(reservations.id, data.reservationId))
            .get()
        )
          throw notFound('reservation', data.reservationId)
        const wanted = data.tagIds.length
          ? tx.select().from(statusTags).where(inArray(statusTags.id, data.tagIds)).all()
          : []
        if (wanted.length !== data.tagIds.length) throw notFound('status_tag')
        if (wanted.some((t) => t.kind !== 'custom'))
          throw invalid('errors.validation', { fields: { tagIds: ['custom tags only'] } })
        const before = tagsOfReservation(tx, data.reservationId).map((t) => t.id)
        // A tag assignment is a label on the reservation (like a field): the audit row keeps the old set.
        tx.delete(reservationTags).where(eq(reservationTags.reservationId, data.reservationId)).run()
        if (data.tagIds.length)
          tx.insert(reservationTags)
            .values(data.tagIds.map((tagId) => ({ reservationId: data.reservationId, tagId })))
            .run()
        audit({
          entity: 'reservation',
          entityId: data.reservationId,
          action: 'update',
          before: { tagIds: before },
          after: { tagIds: data.tagIds }
        })
        return tagsOfReservation(tx, data.reservationId).map(tagView)
      })
    },

    reservationTags(ctx: Ctx, reservationId: string): StatusTagView[] {
      requireRead(ctx)
      return tagsOfReservation(db, reservationId).map(tagView)
    },

    /** §6.14 for every night of a reservation: automatic status + custom tags → fill, border, deposit icon. */
    nightStyles(ctx: Ctx, reservationId: string): NightStyle[] {
      const detail = reservationsSvc.get(ctx, reservationId)
      const today = localDateOf(deps.clock())
      const enabled = enabledAuto(db)
      const custom = tagsOfReservation(db, reservationId).map((t) => ({
        id: t.id,
        enabled: t.enabled,
        priorityOverAuto: t.priorityOverAuto
      }))
      return detail.stays.flatMap((stay) =>
        stay.nights.map((n) => ({
          date: n.date,
          roomId: stay.roomId,
          style: cellStyle(
            {
              pay: n.payStatus,
              dayUse: stay.checkIn === stay.checkOut,
              blocked: false,
              past: n.date < today
            },
            enabled,
            custom
          )
        }))
      )
    }
  }
}

export type StatusTagsService = ReturnType<typeof createStatusTagsService>
