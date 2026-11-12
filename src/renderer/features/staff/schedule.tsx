// The 14-day schedule (at work / rest day / annual / sick / unpaid / worked on a holiday) from the leave records,
// with its legend, and the "Personel durumu" panel of the month (leave entitled / used / left and the month's
// advances; the policy is a setting, G-82). Colours are theme tokens and every cell also has an icon, so the grid
// reads without colour. A logical-class grid: days run in reading order in every language.
import { useTranslation } from 'react-i18next'
import { CalendarPlusIcon } from 'lucide-react'
import { weekday, type LocalDate } from '@shared/date'
import type { ProcedureOutput } from '@shared/contract'
import type { EmployeeViewDto, StaffPanelRowDto } from '@shared/contract/procedures/staff'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSettings } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { DAY_KINDS, kindOn, windowDays, type DayKind, type LeaveIndex } from './derive'
import { KIND_ICON, KIND_ICON_TONE, KIND_STYLE } from './kinds'
import { usePolicyLine } from './use-staff-format'

type Policy = ProcedureOutput<'staff.getPolicy'>['values']
const DEFAULT_HIGHLIGHT: readonly number[] = [6, 0]

export function DayChip({ kind, className }: { kind: DayKind; className?: string }) {
  const { t } = useTranslation()
  const Icon = KIND_ICON[kind]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        KIND_STYLE[kind],
        className
      )}
    >
      <Icon className={cn('size-3', KIND_ICON_TONE[kind])} aria-hidden />
      {t(`staff.day.${kind}`)}
    </span>
  )
}

export function ScheduleLegend() {
  const { t } = useTranslation()
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label={t('staff.schedule.legend')}>
      {DAY_KINDS.map((kind) => {
        const Icon = KIND_ICON[kind]
        return (
          <li key={kind} className="flex items-center gap-1.5 text-xs">
            <span
              className={cn('grid size-5 place-items-center rounded border', KIND_STYLE[kind])}
              aria-hidden
            >
              <Icon className={cn('size-3', KIND_ICON_TONE[kind])} />
            </span>
            {t(`staff.day.${kind}`)}
          </li>
        )
      })}
    </ul>
  )
}

function Cell({
  employee,
  day,
  kind,
  onPick,
  size = 'md'
}: {
  employee: EmployeeViewDto
  day: LocalDate
  kind: DayKind
  onPick?: (employeeId: string, day: LocalDate) => void
  size?: 'md' | 'sm'
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const Icon = KIND_ICON[kind]
  const label = t('staff.schedule.cell', {
    name: employee.fullName,
    date: f.date(day, 'medium'),
    kind: t(`staff.day.${kind}`)
  })
  const className = cn(
    'grid w-full place-items-center rounded-md border outline-none',
    size === 'md' ? 'h-9' : 'h-11 gap-0 py-0.5',
    KIND_STYLE[kind],
    onPick && 'focus-visible:ring-ring cursor-pointer hover:brightness-95 focus-visible:ring-[3px]'
  )
  // QA2a: after the day someone left the hotel the grid has nothing to say (no work day, no leave to record).
  if (employee.endDate && day > employee.endDate)
    return (
      <span
        className={cn(
          'grid w-full place-items-center rounded-md border border-dashed',
          size === 'md' ? 'h-9' : 'h-11'
        )}
        role="img"
        aria-label={t('staff.schedule.gone', { name: employee.fullName, date: f.date(day, 'medium') })}
        title={t('staff.schedule.gone', { name: employee.fullName, date: f.date(day, 'medium') })}
        data-testid="schedule-gone"
      >
        {size === 'sm' ? (
          <span className="text-muted-foreground text-[0.625rem] leading-none tabular-nums">
            {Number(day.slice(8))}
          </span>
        ) : null}
      </span>
    )
  const body = (
    <>
      {size === 'sm' ? (
        <span className="text-[0.625rem] leading-none tabular-nums">{Number(day.slice(8))}</span>
      ) : null}
      <Icon className={cn('size-4', KIND_ICON_TONE[kind])} aria-hidden />
    </>
  )
  return onPick ? (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={label}
      onClick={() => onPick(employee.id, day)}
    >
      {body}
    </button>
  ) : (
    <span className={className} role="img" aria-label={label} title={label}>
      {body}
    </span>
  )
}

/** 14 days from today: desktop a table (one row per employee), phone one card per employee (2 × 7 cells). */
export function ScheduleGrid({
  employees,
  leave,
  today,
  onPick,
  onRecord
}: {
  employees: readonly EmployeeViewDto[]
  leave: LeaveIndex
  today: LocalDate
  onPick?: (employeeId: string, day: LocalDate) => void
  onRecord?: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const isMobile = useIsMobile()
  const settings = useSettings()
  const highlight = settings.data?.['calendar.highlightWeekdays'] ?? DEFAULT_HIGHLIGHT
  const days = windowDays(today)
  return (
    <Card className="gap-3 py-4" data-testid="schedule-grid">
      <CardHeader className="flex flex-wrap items-center gap-2 px-4">
        <CardTitle className="flex-1 text-sm">{t('staff.schedule.title')}</CardTitle>
        {onRecord ? (
          <Button size="sm" variant="outline" onClick={onRecord}>
            <CalendarPlusIcon aria-hidden />
            {t('staff.leave.record')}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3 px-4 max-md:px-2">
        <ScheduleLegend />
        {isMobile ? (
          <ul className="grid gap-2">
            {employees.map((e) => (
              <li
                key={e.id}
                className="grid gap-2 rounded-xl border p-2"
                data-testid={`schedule-row-${e.id}`}
              >
                <p className="flex min-w-0 items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium break-words">{e.fullName}</span>
                  <span className="text-muted-foreground text-xs">{e.position}</span>
                </p>
                {/* 44 px cells (QA2a): seven to a row where they fit, fewer on a narrow phone. */}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-0.5">
                  {days.map((d) => (
                    <Cell
                      key={d}
                      employee={e}
                      day={d}
                      kind={kindOn(leave, e.id, d)}
                      onPick={onPick}
                      size="sm"
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <table className="w-full table-fixed border-separate border-spacing-1 text-sm">
            <caption className="sr-only">{t('staff.schedule.title')}</caption>
            <thead>
              <tr>
                <th scope="col" className="w-40 text-start text-xs font-medium">
                  <span className="sr-only">{t('staff.col.employee')}</span>
                </th>
                {days.map((d) => (
                  <th
                    key={d}
                    scope="col"
                    className={cn(
                      'rounded-md py-1 text-center text-xs font-medium',
                      d === today && 'bg-primary text-primary-foreground',
                      d !== today && highlight.includes(weekday(d)) && 'bg-accent text-accent-foreground'
                    )}
                    aria-current={d === today ? 'date' : undefined}
                  >
                    <span className="block leading-tight">{f.weekday(d)}</span>
                    <span className="block font-semibold tabular-nums">{Number(d.slice(8))}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} data-testid={`schedule-row-${e.id}`}>
                  <th scope="row" className="pe-2 text-start font-normal">
                    <span className="block truncate font-medium" title={e.fullName}>
                      {e.fullName}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">{e.position}</span>
                  </th>
                  {days.map((d) => (
                    <td key={d}>
                      <Cell employee={e} day={d} kind={kindOn(leave, e.id, d)} onPick={onPick} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * "Personel durumu" (the Excel panel next to the ledger): this month's advances (only for salary viewers) and leave
 * entitled / used / left per employee (G-82, G-83, G-87).
 */
export function StaffPanel({
  rows,
  policy,
  monthLabel
}: {
  rows: readonly StaffPanelRowDto[]
  policy: Policy | undefined
  monthLabel: string
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const policyLine = usePolicyLine()
  const rule = policyLine(policy)
  return (
    <Card className="gap-3 py-4" data-testid="staff-panel">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{t('staff.panel.title', { month: monthLabel })}</CardTitle>
        {rule ? (
          <p className="text-muted-foreground text-xs">
            {rule}
            {can('staff.policy', 'edit') ? ` — ${t('staff.leave.policyWhere')}` : null}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="px-4">
        <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <li key={r.employeeId} className="grid min-w-0 gap-1.5" data-testid={`panel-${r.employeeId}`}>
              <p className="flex min-w-0 items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium" title={r.fullName}>
                  {r.fullName}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap tabular-nums">
                  {t('staff.leave.usedOf', { used: r.leaveUsed, entitled: r.leaveEntitled })}
                </span>
              </p>
              <Progress
                value={r.leaveEntitled ? Math.min(100, Math.round((r.leaveUsed / r.leaveEntitled) * 100)) : 0}
                aria-label={t('staff.leave.usedOf', { used: r.leaveUsed, entitled: r.leaveEntitled })}
              />
              <p className="text-muted-foreground flex flex-wrap justify-between gap-x-2 text-xs">
                <span>{t('staff.leave.left', { count: r.leaveLeft })}</span>
                {r.advancesMinor !== null ? (
                  <span>
                    {t('staff.panel.advance')}{' '}
                    <bdi className="text-foreground tabular-nums">
                      {f.money(r.advancesMinor, r.currency ?? undefined)}
                    </bdi>
                  </span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
