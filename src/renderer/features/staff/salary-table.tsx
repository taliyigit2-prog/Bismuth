// Monthly salary table (G-81, G-84…G-88): the owner's Excel columns — maaş, avans, izin (kullanılan/hak, kalan),
// izin parası, ek mesai, bayram mesaisi, prim, kesinti, net ödenecek, ödenen, kalan borç — as the staff service
// computes them (shared/domain/salary.ts). Columns that are zero for everybody this month stay hidden (Lale pays
// no overtime). A locked row is read-only; locking and opening a month is for roles with `staff.salary` edit.
// Desktop: one dense table with totals; phone: one card per employee.
import { useTranslation } from 'react-i18next'
import {
  BanknoteIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  HandCoinsIcon,
  LockIcon,
  LockOpenIcon,
  TriangleAlertIcon
} from 'lucide-react'
import { localDateOf } from '@shared/date'
import type { SalaryPeriodDto } from '@shared/contract/procedures/staff'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { isPartial, totalsByCurrency } from './derive'
import type { YearMonth } from './use-staff'
import { useHours, useMonthLabel } from './use-staff-format'

/** Columns shown only when someone has a figure in them this month. */
const OPTIONAL = ['overtime', 'holiday', 'commission', 'deductions'] as const
type Optional = (typeof OPTIONAL)[number]
const CARD_KEYS = ['monthly', 'advances', 'leavePayout', 'net', 'paid'] as const

const has = (rows: readonly SalaryPeriodDto[], col: Optional): boolean =>
  rows.some((r) =>
    col === 'overtime'
      ? r.overtimeMinutes > 0 || r.overtimePay !== 0
      : col === 'holiday'
        ? r.holidayPay !== 0 || r.holidayMinutes > 0
        : col === 'commission'
          ? r.commission !== 0 || r.bonus !== 0
          : r.deductions !== 0 || (r.unpaidDeduction ?? 0) !== 0
  )

function RowActions({
  row,
  onAdvance,
  onPay
}: {
  row: SalaryPeriodDto
  onAdvance: (id: string) => void
  onPay: (id: string) => void
}) {
  const { t } = useTranslation()
  const actions = [
    {
      key: 'advance',
      label: t('staff.actions.advanceFor', { name: row.fullName }),
      Icon: HandCoinsIcon,
      run: onAdvance
    },
    {
      key: 'pay',
      label: t('staff.actions.payFor', { name: row.fullName }),
      Icon: BanknoteIcon,
      run: onPay
    }
  ] as const
  return (
    <span className="inline-flex gap-0.5">
      {actions.map(({ key, label, Icon, run }) => (
        <Tooltip key={key}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              disabled={key === 'pay' && row.remaining <= 0}
              onClick={() => run(row.employeeId)}
            >
              <Icon aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </span>
  )
}

export function SalaryTable({
  month,
  canPrev,
  canNext,
  onMonth,
  rows,
  missing,
  onOpen,
  onAdvance,
  onPay,
  onLock,
  onUnlock
}: {
  month: YearMonth
  canPrev: boolean
  canNext: boolean
  onMonth: (delta: number) => void
  rows: readonly SalaryPeriodDto[]
  /** Names of the month's employees without a salary (the card needs one). */
  missing: readonly string[]
  onOpen: (employeeId: string) => void
  onAdvance: (employeeId: string | null) => void
  onPay: (employeeId: string | null) => void
  onLock: () => void
  onUnlock: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const isMobile = useIsMobile()
  const monthLabel = useMonthLabel()
  const hours = useHours()
  const canEdit = can('staff.salary', 'edit')
  const open = rows.filter((r) => !r.locked)
  const locked = rows.filter((r) => r.locked)
  const allLocked = rows.length > 0 && open.length === 0
  const editable = canEdit && open.length > 0
  const sums = totalsByCurrency(rows)
  const show = Object.fromEntries(OPTIONAL.map((c) => [c, has(rows, c)])) as Record<Optional, boolean>
  const lockedAt = locked
    .map((r) => r.lockedAt)
    .filter((d): d is string => Boolean(d))
    .sort()[0]
  // Every amount in its own row's currency (B18).
  const money = (minor: number, currency: string, strong?: boolean) => (
    <bdi className={cn(strong && 'font-semibold', minor === 0 && 'text-muted-foreground')}>
      {f.money(minor, currency)}
    </bdi>
  )
  const due = (r: SalaryPeriodDto): number => r.salaryDue ?? r.monthly

  return (
    <div className="grid gap-3" data-testid="salary-table">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('staff.salary.prevMonth')}
            disabled={!canPrev}
            onClick={() => onMonth(-1)}
          >
            <ChevronLeftIcon className="rtl:rotate-180" />
          </Button>
          <p
            className="min-w-36 text-center text-base font-semibold"
            aria-live="polite"
            data-testid="salary-month"
          >
            {monthLabel(month)}
          </p>
          <Button
            variant="outline"
            size="icon"
            aria-label={t('staff.salary.nextMonth')}
            disabled={!canNext}
            onClick={() => onMonth(1)}
          >
            <ChevronRightIcon className="rtl:rotate-180" />
          </Button>
        </div>
        {rows.length ? (
          allLocked ? (
            <Badge variant="secondary" className="gap-1">
              <LockIcon aria-hidden />
              {t('staff.salary.locked')}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <LockOpenIcon aria-hidden />
              {t('staff.salary.open')}
            </Badge>
          )
        ) : null}
        {canEdit && rows.length ? (
          <div className="flex flex-wrap gap-2 max-sm:grid max-sm:w-full sm:ms-auto">
            {editable ? (
              <>
                <Button variant="outline" onClick={() => onAdvance(null)}>
                  <HandCoinsIcon aria-hidden />
                  {t('staff.actions.advance')}
                </Button>
                <Button variant="outline" onClick={() => onPay(null)}>
                  <BanknoteIcon aria-hidden />
                  {t('staff.actions.pay')}
                </Button>
                <Button variant="secondary" onClick={onLock}>
                  <LockIcon aria-hidden />
                  {t('staff.lock.action')}
                </Button>
              </>
            ) : null}
            {locked.length ? (
              <Button variant="ghost" onClick={onUnlock}>
                <LockOpenIcon aria-hidden />
                {t('staff.unlock.action')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {allLocked ? (
        <Alert data-testid="month-locked">
          <LockIcon />
          <AlertTitle>{t('staff.salary.lockedTitle')}</AlertTitle>
          <AlertDescription>
            {t('staff.salary.lockedOn', {
              date: lockedAt ? f.date(localDateOf(new Date(lockedAt)), 'medium') : '—'
            })}
          </AlertDescription>
        </Alert>
      ) : null}

      {missing.length ? (
        <Alert data-testid="salary-missing">
          <TriangleAlertIcon />
          <AlertTitle>{t('staff.salary.missingTitle')}</AlertTitle>
          <AlertDescription>{t('staff.salary.missingBody', { names: missing.join(', ') })}</AlertDescription>
        </Alert>
      ) : null}

      {isMobile ? (
        <ul className="grid gap-2" data-testid="salary-cards">
          {rows.map((r) => (
            <li
              key={r.employeeId}
              className="bg-card grid gap-2 rounded-xl border p-3 text-sm"
              data-testid={`salary-row-${r.employeeId}`}
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  className="focus-visible:ring-ring min-h-11 min-w-0 rounded-sm text-start outline-none focus-visible:ring-[3px]"
                  onClick={() => onOpen(r.employeeId)}
                >
                  <span className="block font-medium break-words">{r.fullName}</span>
                  <span className="text-muted-foreground block text-xs">{r.position}</span>
                </button>
                <p className="text-end">
                  <span className="text-muted-foreground block text-xs">{t('staff.col.remaining')}</span>
                  <span className={cn('font-semibold tabular-nums', r.remaining > 0 && 'text-destructive')}>
                    <bdi>{f.money(r.remaining, r.currency)}</bdi>
                  </span>
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-xs">
                {CARD_KEYS.map((key) => [key, key === 'monthly' ? due(r) : r[key]] as const).map(
                  ([key, value]) => (
                    <div key={key}>
                      <dt className="text-muted-foreground">{t(`staff.col.${key}`)}</dt>
                      <dd className="tabular-nums">
                        <bdi>{f.money(value, r.currency)}</bdi>
                      </dd>
                    </div>
                  )
                )}
                <div>
                  <dt className="text-muted-foreground">{t('staff.col.leave')}</dt>
                  <dd className="whitespace-nowrap tabular-nums">
                    {r.leaveUsed}/{r.leaveEntitled}
                  </dd>
                </div>
              </dl>
              {canEdit && !r.locked ? (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal"
                    onClick={() => onAdvance(r.employeeId)}
                  >
                    <HandCoinsIcon aria-hidden />
                    {t('staff.actions.advance')}
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal"
                    disabled={r.remaining <= 0}
                    onClick={() => onPay(r.employeeId)}
                  >
                    <BanknoteIcon aria-hidden />
                    {t('staff.actions.pay')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table className="text-sm" density="compact">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="ps-4 text-start">{t('staff.col.employee')}</TableHead>
                  <TableHead className="text-end">{t('staff.col.monthly')}</TableHead>
                  <TableHead className="text-end">{t('staff.col.advances')}</TableHead>
                  <TableHead className="text-end">{t('staff.col.leave')}</TableHead>
                  <TableHead className="text-end">{t('staff.col.leavePayout')}</TableHead>
                  {show.overtime ? (
                    <TableHead className="text-end">{t('staff.col.overtime')}</TableHead>
                  ) : null}
                  {show.holiday ? <TableHead className="text-end">{t('staff.col.holiday')}</TableHead> : null}
                  {show.commission ? (
                    <TableHead className="text-end">{t('staff.col.commission')}</TableHead>
                  ) : null}
                  {show.deductions ? (
                    <TableHead className="text-end">{t('staff.col.deductions')}</TableHead>
                  ) : null}
                  <TableHead className="text-end">{t('staff.col.net')}</TableHead>
                  <TableHead className="text-end">{t('staff.col.paid')}</TableHead>
                  <TableHead className={cn('text-end', !editable && 'pe-4')}>{t('staff.col.debt')}</TableHead>
                  {editable ? (
                    <TableHead className="pe-4">
                      <span className="sr-only">{t('staff.col.actions')}</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.employeeId} data-testid={`salary-row-${r.employeeId}`}>
                    <TableCell className="max-w-44 ps-4">
                      <button
                        type="button"
                        className="focus-visible:ring-ring block max-w-full truncate rounded-sm text-start font-medium outline-none hover:underline focus-visible:ring-[3px]"
                        title={r.fullName}
                        onClick={() => onOpen(r.employeeId)}
                      >
                        {r.fullName}
                      </button>
                      <span className="text-muted-foreground block truncate text-xs">
                        {r.locked ? (
                          <span className="inline-flex items-center gap-1">
                            <LockIcon className="size-3" aria-hidden />
                            {t('staff.salary.locked')}
                          </span>
                        ) : (
                          r.position
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {money(due(r), r.currency)}
                      {isPartial(r) ? (
                        <span className="text-muted-foreground block text-xs whitespace-nowrap">
                          {t('staff.salary.partial', { days: r.employedDays, total: r.monthDays })}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{money(r.advances, r.currency)}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      <span className="block whitespace-nowrap">
                        {r.leaveUsed}/{r.leaveEntitled}
                      </span>
                      <span className="text-muted-foreground block text-xs whitespace-nowrap">
                        {t('staff.leave.left', { count: r.leaveLeft })}
                      </span>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {money(r.leavePayout, r.currency)}
                    </TableCell>
                    {show.overtime ? (
                      <TableCell className="text-end tabular-nums">
                        <span className="block whitespace-nowrap">{hours(r.overtimeMinutes)}</span>
                        {r.overtimePay ? (
                          <span className="text-muted-foreground block text-xs">
                            {money(r.overtimePay, r.currency)}
                          </span>
                        ) : null}
                      </TableCell>
                    ) : null}
                    {show.holiday ? (
                      <TableCell className="text-end tabular-nums">
                        <span className="block">{money(r.holidayPay, r.currency)}</span>
                        {r.holidayMinutes ? (
                          <span className="text-muted-foreground block text-xs whitespace-nowrap">
                            {hours(r.holidayMinutes)}
                          </span>
                        ) : null}
                      </TableCell>
                    ) : null}
                    {show.commission ? (
                      <TableCell className="text-end tabular-nums">
                        {money(r.commission + r.bonus, r.currency)}
                      </TableCell>
                    ) : null}
                    {show.deductions ? (
                      <TableCell className="text-end tabular-nums">
                        {money(r.deductions + (r.unpaidDeduction ?? 0), r.currency)}
                        {r.unpaidDays ? (
                          <span className="text-muted-foreground block text-xs whitespace-nowrap">
                            {t('staff.salary.unpaidDays', { count: r.unpaidDays })}
                          </span>
                        ) : null}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-end tabular-nums">{money(r.net, r.currency, true)}</TableCell>
                    <TableCell className="text-end tabular-nums">{money(r.paid, r.currency)}</TableCell>
                    <TableCell
                      className={cn(
                        'text-end font-semibold tabular-nums',
                        !editable && 'pe-4',
                        r.remaining > 0 && 'text-destructive'
                      )}
                      data-testid={`salary-debt-${r.employeeId}`}
                    >
                      {r.remaining > 0 ? (
                        <bdi>{f.money(r.remaining, r.currency)}</bdi>
                      ) : (
                        money(r.remaining, r.currency)
                      )}
                    </TableCell>
                    {editable ? (
                      <TableCell className="pe-3 text-end">
                        {r.locked ? null : <RowActions row={r} onAdvance={onAdvance} onPay={onPay} />}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                {sums.map(({ currency, sum }) => (
                  <TableRow
                    key={currency}
                    className="hover:bg-transparent"
                    data-testid={`salary-total-${currency}`}
                  >
                    <TableCell className="ps-4 font-semibold">
                      {sums.length > 1 ? t('staff.salary.totalIn', { currency }) : t('common.total')}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{money(sum.salaryDue, currency)}</TableCell>
                    <TableCell className="text-end tabular-nums">{money(sum.advances, currency)}</TableCell>
                    <TableCell />
                    <TableCell className="text-end tabular-nums">
                      {money(sum.leavePayout, currency)}
                    </TableCell>
                    {show.overtime ? (
                      <TableCell className="text-end tabular-nums">
                        {money(sum.overtimePay, currency)}
                      </TableCell>
                    ) : null}
                    {show.holiday ? (
                      <TableCell className="text-end tabular-nums">
                        {money(sum.holidayPay, currency)}
                      </TableCell>
                    ) : null}
                    {show.commission ? (
                      <TableCell className="text-end tabular-nums">
                        {money(sum.commission + sum.bonus, currency)}
                      </TableCell>
                    ) : null}
                    {show.deductions ? (
                      <TableCell className="text-end tabular-nums">
                        {money(sum.deductions + sum.unpaidDeduction, currency)}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-end tabular-nums">{money(sum.net, currency, true)}</TableCell>
                    <TableCell className="text-end tabular-nums">{money(sum.paid, currency)}</TableCell>
                    <TableCell className={cn('text-end font-semibold tabular-nums', !editable && 'pe-4')}>
                      {money(sum.remaining, currency, true)}
                    </TableCell>
                    {editable ? <TableCell /> : null}
                  </TableRow>
                ))}
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
