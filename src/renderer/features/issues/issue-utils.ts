// Issue list helpers: order, days, the reported-at text ("Bugün 07:50", "Dün 20:00", "1 Eki 11:00"), the place
// text ("Oda 303" or the area name), the error text of a failed call and the queries an issue write refreshes.
import { useTranslation } from 'react-i18next'
import type { ProcedureName } from '@shared/contract'
import type { RoomIssueView } from '@shared/contract/procedures/housekeeping'
import { addDays, localDateOf, type LocalDate } from '@shared/date'
import { ISSUE_SEVERITY_RANK } from '@shared/domain/housekeeping'
import { useFormat } from '@/hooks/use-format'
import { ApiError } from '@/lib/transport'

export const SEVERITIES = ['urgent', 'medium', 'low'] as const
export const STATUSES = ['open', 'planned', 'resolved'] as const
export type IssueStatus = (typeof STATUSES)[number]
export type Issue = RoomIssueView

/** Every screen that shows issues: refreshed after an issue or one of its photos changes. */
export const ISSUE_QUERIES: readonly ProcedureName[] = [
  'housekeeping.issues',
  'housekeeping.issue',
  'housekeeping.openIssuesByRoom',
  'housekeeping.board',
  'attachments.list'
]

/** Most urgent first, then the newest report. */
export const bySeverity = (a: Issue, b: Issue): number =>
  ISSUE_SEVERITY_RANK[a.severity] - ISSUE_SEVERITY_RANK[b.severity] ||
  b.reportedAt.localeCompare(a.reportedAt)

export const dayOf = (iso: string): LocalDate => localDateOf(new Date(iso))

/** The day photos of a resolved issue are deleted (K-25): resolution day + the hotel's retention days. */
export const photoDeleteDay = (resolvedAt: string, days: number): LocalDate =>
  addDays(dayOf(resolvedAt), days)

export function useWhen(today: LocalDate): (iso: string) => string {
  const { t } = useTranslation()
  const f = useFormat()
  return (iso) => {
    const day = dayOf(iso)
    const time = f.time(iso)
    if (day === today) return t('issues.when.today', { time })
    if (day === addDays(today, -1)) return t('issues.when.yesterday', { time })
    return t('issues.when.other', { date: f.dayMonth(day), time })
  }
}

/** "Oda 303" or the area name ("Lobi"). */
export function usePlace(): (issue: Pick<Issue, 'roomNumber' | 'area'>) => string {
  const { t } = useTranslation()
  return (issue) =>
    issue.roomNumber
      ? t('issues.roomNo', { room: issue.roomNumber })
      : (issue.area ?? t('issues.generalArea'))
}

/** The translated message of a failed call ("Bu arıza zaten çözüldü."). */
export function useErrorText(): (error: unknown) => string {
  const { t } = useTranslation()
  return (error) => {
    const key = (error instanceof ApiError ? error.messageKey : 'errors.internal') as 'errors.internal'
    const details =
      error instanceof ApiError && error.details && typeof error.details === 'object' ? error.details : {}
    return t(key, { ...details, defaultValue: t('errors.internal') })
  }
}
