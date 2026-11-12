// Yearly online check of the generated feast days (G-16, K-04; canli-dogrulama.md §3). The online list (Google's
// Turkish holidays feed, Nager.Date as backup) is compared with the calendar's Ramazan and Kurban Bayramı groups:
// a group the program made (`generated`, or `verified` by an earlier check) is moved as a whole to the announced
// days and becomes `verified`; a group a person edited (`user`) is never touched — the difference is only shown.
// Fixed-date holidays are law, not estimates: they are not compared.
import { and, eq, like, or } from 'drizzle-orm'
import type { HolidayCheckResult } from '@shared/contract/external'
import { addDays, diffDays, localDate } from '@shared/date'
import { calendarDays, calendarGeneration } from '../../db/schema'
import type { Ctx } from '../context'
import { inTransaction, requirePermission, type ServiceDeps } from '../kit'

export interface OnlineFeast {
  feast: 'ramazan' | 'kurban'
  /** First full holiday day. */
  start: string
  tentative: boolean
}

const SLUG: Record<OnlineFeast['feast'], string> = { ramazan: 'ramazan-bayrami', kurban: 'kurban-bayrami' }

type Row = typeof calendarDays.$inferSelect

/** The calendar's feast group's first full holiday day (the day after its arife). */
function groupStart(rows: readonly Row[]): string | null {
  const days = rows
    .filter((r) => r.kind === 'holiday')
    .map((r) => r.date)
    .sort()
  return days[0] ?? null
}

/**
 * Applies the online feast dates to `year`'s generated groups and returns what was compared. The year must have
 * been generated already (the calendar service does that whenever a year is shown); a missing one is skipped.
 */
export function applyHolidayCheck(
  deps: ServiceDeps,
  ctx: Ctx,
  year: number,
  feasts: readonly OnlineFeast[],
  source: 'google' | 'nager'
): HolidayCheckResult {
  requirePermission(ctx, 'calendar.notes', 'edit')
  return inTransaction(deps, ctx, (tx, audit, now) => {
    const iso = now.toISOString()
    const rows = tx
      .select()
      .from(calendarDays)
      .where(
        and(
          eq(calendarDays.generatedYear, year),
          or(
            like(calendarDays.groupKey, `${SLUG.ramazan}:%`),
            like(calendarDays.groupKey, `${SLUG.kurban}:%`)
          )
        )
      )
      .all()
    // Cancelled rows count too: a day a person cancelled (source `user`) makes the group theirs (P14fix #9), else
    // the group would move onto the day they took out. Only the live rows are compared and moved.
    const groups = new Map<string, Row[]>()
    const userGroups = new Set<string>()
    for (const r of rows) {
      if (!r.groupKey) continue
      if (r.source === 'user') userGroups.add(r.groupKey)
      if (r.cancelledAt) continue
      const list = groups.get(r.groupKey) ?? []
      list.push(r)
      groups.set(r.groupKey, list)
    }
    const diffs: HolidayCheckResult['diffs'] = []
    for (const [groupKey, list] of groups) {
      const feast = groupKey.startsWith(SLUG.ramazan) ? 'ramazan' : 'kurban'
      const start = groupStart(list)
      if (!start) continue
      // The announced feast nearest to ours (a feast moves by a day or two, never more).
      const online = feasts
        .filter((f) => f.feast === feast && Math.abs(diffDays(localDate(f.start), localDate(start))) <= 3)
        .sort(
          (a, b) =>
            Math.abs(diffDays(localDate(a.start), localDate(start))) -
            Math.abs(diffDays(localDate(b.start), localDate(start)))
        )[0]
      if (!online) continue
      const shift = diffDays(localDate(start), localDate(online.start))
      const before = list.map((r) => r.date).sort()
      const after = before.map((d) => addDays(localDate(d), shift) as string)
      const t = list.find((r) => r.kind === 'holiday')?.titleI18n ?? {}
      const tr = t.tr ?? groupKey
      const title = { tr, en: t.en ?? tr, ru: t.ru ?? tr }
      if (userGroups.has(groupKey)) {
        diffs.push({
          groupKey,
          title,
          before,
          after,
          outcome: shift === 0 ? 'confirmed' : 'userKept',
          tentative: online.tentative
        })
        continue
      }
      for (const r of list) {
        const next = {
          date: addDays(localDate(r.date), shift) as string,
          source: 'verified' as const,
          estimated: online.tentative,
          updatedAt: iso
        }
        if (r.date === next.date && r.source === 'verified' && r.estimated === next.estimated) continue
        tx.update(calendarDays).set(next).where(eq(calendarDays.id, r.id)).run()
        audit({
          entity: 'calendar_day',
          entityId: r.id,
          action: 'update',
          before: { date: r.date, source: r.source, estimated: r.estimated },
          after: { date: next.date, source: next.source, estimated: next.estimated },
          reason: `holiday check (${source})`
        })
      }
      diffs.push({
        groupKey,
        title,
        before,
        after,
        outcome: shift === 0 ? 'confirmed' : 'moved',
        tentative: online.tentative
      })
    }
    tx.update(calendarGeneration).set({ verifiedAt: iso }).where(eq(calendarGeneration.year, year)).run()
    diffs.sort((a, b) => ((a.before[0] ?? '') < (b.before[0] ?? '') ? -1 : 1))
    return { year, source, skipped: false, checkedAt: iso, diffs }
  })
}
