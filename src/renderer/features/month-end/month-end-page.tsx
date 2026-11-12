// Ay sonu kontrolü (G-100, akislar.md §2): the owner's month-end routine on one screen — card and IBAN totals
// (received with the "x" or still pending), salaries (net, paid, remaining), revenue / expenses / profit against
// the month before, the "En çok harcama" list the owner likes, and the ministry statistics step. From the report
// service (reports.monthEnd); Excel and print like every report.
import { useState, type ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  BedDoubleIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  CreditCardIcon,
  FlameIcon,
  GlobeIcon,
  ReceiptIcon,
  TrendingUpIcon,
  UsersIcon,
  WalletIcon
} from 'lucide-react'
import type { MonthEnd } from '@shared/contract/procedures/reports'
import { diffDays, type LocalDate } from '@shared/date'
import { basisPoints } from '@shared/domain/reports'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { KpiCard } from '@/components/kpi-card'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { SectionCard } from '@/components/section-card'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { usePrintMode } from '../reports/print-mode'
import { DataNotes, KpiRow, Money, NoAccess, ReportQuery, ReportSkeleton } from '../reports/common'
import { useDeltas } from '../reports/deltas'
import { useMonthName, useReportLabels } from '../reports/labels'
import { monthsBetween } from '../reports/period'
import { PrintLayout } from '../reports/print-layout'
import { ReportActions, ReportScope } from '../reports/report-export'
import { usePrint } from '../reports/use-report-export'
import { FxSourcesCard } from '../reports/fx-sources-card'
import { ExportOnly, TopList } from '../reports/summary-tab'
import { totalsByCurrency } from '../staff/derive'
import { MANUAL_STEPS, autoDone, salaryLeftByCurrency, visibleSteps, ym, type Step } from './derive'
import { useMonthEndTicks } from './use-ticks'

function MonthBar({
  month,
  months,
  onMonth
}: {
  month: string
  months: readonly string[]
  onMonth: (m: string) => void
}) {
  const { t } = useTranslation()
  const monthName = useMonthName()
  // Newest first: "previous" goes down the list.
  const i = months.indexOf(month)
  return (
    <div className="flex items-center gap-1" data-testid="month-bar">
      <Button
        variant="outline"
        size="icon"
        aria-label={t('monthEnd.previousMonth')}
        disabled={i < 0 || i >= months.length - 1}
        onClick={() => onMonth(months[i + 1]!)}
      >
        <ChevronLeftIcon className="rtl:rotate-180" />
      </Button>
      <Select value={month} onValueChange={onMonth}>
        <SelectTrigger
          className="w-52 font-semibold max-sm:flex-1"
          aria-label={t('monthEnd.month')}
          data-testid="month-select"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {months.map((m) => (
            <SelectItem key={m} value={m}>
              {monthName(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        aria-label={t('monthEnd.nextMonth')}
        disabled={i <= 0}
        onClick={() => onMonth(months[i - 1]!)}
      >
        <ChevronRightIcon className="rtl:rotate-180" />
      </Button>
    </div>
  )
}

function ChecklistItem({
  step,
  done,
  auto,
  onDone,
  title,
  status,
  link
}: {
  step: Step
  done: boolean
  /** Ticked by the records: shown, not changed by hand. */
  auto: boolean
  onDone: (v: boolean) => void
  title: string
  status: ReactNode
  link?: ReactNode
}) {
  const print = usePrintMode()
  const { t } = useTranslation()
  return (
    <li className="flex items-start gap-3 py-2" data-testid={`check-${step}`} data-done={done}>
      {auto ? (
        <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden>
          {done ? (
            <CheckCircle2Icon className="text-success size-5" />
          ) : (
            <span className="border-muted-foreground size-4 rounded-full border-2" />
          )}
        </span>
      ) : (
        <Checkbox
          id={`check-${step}-box`}
          checked={done}
          onCheckedChange={(v) => onDone(v === true)}
          className="relative mt-0.5 size-5 max-md:after:absolute max-md:after:-inset-3"
          disabled={print}
        />
      )}
      <label
        htmlFor={auto ? undefined : `check-${step}-box`}
        className={cn('min-w-0 flex-1', !auto && 'cursor-pointer')}
      >
        <span className={cn('block text-sm font-medium', done && 'text-muted-foreground')}>
          {title}
          {auto ? (
            <span className="text-muted-foreground ms-2 text-xs font-normal">{t('monthEnd.check.auto')}</span>
          ) : null}
        </span>
        <span className="text-muted-foreground block text-xs">{status}</span>
      </label>
      {print ? null : link}
    </li>
  )
}

const GoTo = ({ to, label }: { to: '/ledger' | '/staff' | '/tourism'; label: string }) => (
  <Button asChild variant="ghost" size="sm" className="-my-1 shrink-0">
    <Link to={to}>
      {label}
      <ArrowRightIcon className="rtl:rotate-180" aria-hidden />
    </Link>
  </Button>
)

function MonthEndView({ data, monthKey }: { data: MonthEnd; monthKey: string }) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const mobile = useIsMobile()
  const print = usePrintMode()
  const deltas = useDeltas()
  const labels = useReportLabels(data.categories)
  const monthName = useMonthName()
  const { ticks, setTicks } = useMonthEndTicks(monthKey)
  const c = data.baseCurrency
  const steps = visibleSteps(data)
  const auto = autoDone(data)
  const isDone = (s: Step): boolean =>
    MANUAL_STEPS.includes(s) ? (ticks as readonly Step[]).includes(s) : !!auto[s]
  const doneCount = steps.filter(isDone).length
  const setTick = (s: Step) => (v: boolean) => {
    const kept = ticks.filter((x) => x !== s)
    setTicks(v && (s === 'results' || s === 'top') ? [...kept, s] : kept)
  }
  const pendingCards = data.methods.filter((m) => m.group !== 'cash').reduce((s, m) => s + m.pendingMinor, 0)
  const salaryLeft = salaryLeftByCurrency(data.salaries?.rows ?? [])
  const salarySums = totalsByCurrency(data.salaries?.rows ?? [])
  const top = data.topExpenses
  const occ = basisPoints(data.occupancy.soldNights, data.occupancy.sellableNights)
  const prevOcc = basisPoints(data.occupancy.previousSold, data.occupancy.previousSellable)
  const hasPrev = data.previous.revenueMinor !== 0 || data.previous.expensesMinor !== 0
  const due = data.tourism?.due as LocalDate | undefined
  const daysLeft = due ? diffDays(data.today, due) : 0

  const amountIn = (
    key: 'monthEnd.check.cardsPending' | 'monthEnd.check.salariesLeft' | 'monthEnd.check.results',
    amount: string
  ): ReactNode => (
    <Trans i18nKey={key} values={{ amount }} components={{ m: <bdi className="tabular-nums" /> }} />
  )
  const statusOf: Record<Step, ReactNode> = {
    cards: !auto.cards
      ? amountIn('monthEnd.check.cardsPending', f.money(pendingCards, c))
      : t('monthEnd.check.cardsDone'),
    salaries: !data.salaries?.rows.length
      ? t('monthEnd.salaries.empty')
      : salaryLeft.length
        ? amountIn(
            'monthEnd.check.salariesLeft',
            salaryLeft.map((x) => f.money(x.amountMinor, x.currency)).join(' + ')
          )
        : t('monthEnd.check.salariesDone'),
    results: amountIn('monthEnd.check.results', f.money(data.profitMinor, c)),
    top: top[0] ? t('monthEnd.check.top', { name: labels.expense(top[0]) }) : t('monthEnd.top.empty'),
    tourism: data.tourism?.reportedAt
      ? t('monthEnd.check.tourismReported', {
          date: f.date(data.tourism.reportedAt.slice(0, 10) as LocalDate, 'medium')
        })
      : due && daysLeft === 0
        ? t('monthEnd.check.tourismLastDay', { date: f.dayMonth(due) })
        : due && daysLeft > 0
          ? t('monthEnd.check.tourismDays', { count: daysLeft, date: f.dayMonth(due) })
          : due
            ? t('monthEnd.check.tourismLate', { date: f.dayMonth(due) })
            : ''
  }
  const linkOf: Partial<Record<Step, ReactNode>> = {
    cards: !auto.cards && can('ledger') ? <GoTo to="/ledger" label={t('monthEnd.check.ledger')} /> : null,
    salaries:
      salaryLeft.length > 0 && can('staff') ? <GoTo to="/staff" label={t('monthEnd.check.open')} /> : null,
    tourism: !data.tourism?.reportedAt ? <GoTo to="/tourism" label={t('monthEnd.check.open')} /> : null
  }

  const checklist = (
    <SectionCard
      title={t('monthEnd.check.title')}
      icon={ClipboardCheckIcon}
      testId="month-checklist"
      action={
        <span className="text-muted-foreground text-xs tabular-nums" data-testid="check-progress">
          {t('monthEnd.check.progress', { done: doneCount, total: steps.length })}
        </span>
      }
    >
      <Progress
        value={steps.length ? (doneCount / steps.length) * 100 : 0}
        className="[&>[data-slot=progress-indicator]]:bg-success mb-1 h-1.5"
        aria-label={t('monthEnd.check.progress', { done: doneCount, total: steps.length })}
      />
      <ul className="divide-y">
        {steps.map((s) => (
          <ChecklistItem
            key={s}
            step={s}
            done={isDone(s)}
            auto={!MANUAL_STEPS.includes(s)}
            onDone={setTick(s)}
            title={t(`monthEnd.check.step.${s}`)}
            status={statusOf[s]}
            link={linkOf[s]}
          />
        ))}
      </ul>
      <p className="text-muted-foreground mt-2 text-xs">{t('monthEnd.check.manualNote')}</p>
    </SectionCard>
  )

  const kpis = (
    <KpiRow testId="month-kpis">
      <KpiCard
        label={t('monthEnd.kpi.revenue')}
        value={f.money(data.revenueMinor, c)}
        delta={hasPrev ? deltas.percent(data.revenueMinor, data.previous.revenueMinor, true) : undefined}
        hint={hasPrev ? t('monthEnd.kpi.vsPrevious') : undefined}
        icon={<TrendingUpIcon className="size-3.5" aria-hidden />}
      />
      <KpiCard
        label={t('monthEnd.kpi.expenses')}
        value={f.money(data.expensesMinor, c)}
        delta={hasPrev ? deltas.percent(data.expensesMinor, data.previous.expensesMinor, false) : undefined}
        hint={hasPrev ? t('monthEnd.kpi.vsPrevious') : undefined}
        icon={<ReceiptIcon className="size-3.5" aria-hidden />}
      />
      <KpiCard
        label={t('monthEnd.kpi.profit')}
        value={f.money(data.profitMinor, c)}
        delta={hasPrev ? deltas.percent(data.profitMinor, data.previous.profitMinor, true) : undefined}
        hint={t('monthEnd.kpi.margin', {
          value: f.percent(basisPoints(Math.max(0, data.profitMinor), Math.max(1, data.revenueMinor)), 1)
        })}
        icon={<WalletIcon className="size-3.5" aria-hidden />}
      />
      <KpiCard
        label={t('monthEnd.kpi.occupancy')}
        value={f.percent(occ)}
        delta={data.occupancy.previousSellable ? deltas.points(occ, prevOcc) : undefined}
        hint={t('monthEnd.kpi.nights', {
          sold: data.occupancy.soldNights,
          sellable: data.occupancy.sellableNights
        })}
        icon={<BedDoubleIcon className="size-3.5" aria-hidden />}
      />
    </KpiRow>
  )

  const cards = (
    <SectionCard
      title={t('monthEnd.cards.title')}
      icon={CreditCardIcon}
      testId="month-cards"
      action={<ExportOnly id="methods" title={t('monthEnd.cards.title')} />}
    >
      {mobile && !print ? (
        <ul className="grid gap-3">
          {data.methods.map((m) => (
            <li
              key={m.group}
              className={cn('grid gap-1 text-sm', m.group === 'cash' && 'text-muted-foreground')}
            >
              <p className="flex justify-between gap-3 font-medium">
                <span>{t(`ledger.group.${m.group}`)}</span>
                <Money minor={m.totalMinor} currency={c} strong />
              </p>
              <p className="flex justify-between gap-3 text-xs">
                <span>{t('monthEnd.cards.received')}</span>
                <Money minor={m.receivedMinor} currency={c} />
              </p>
              <p className="flex justify-between gap-3 text-xs">
                <span>{t('monthEnd.cards.pending')}</span>
                <Money minor={m.pendingMinor} currency={c} tone="warn" />
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <Table className="text-sm" density="compact">
          <TableHeader>
            <TableRow>
              <TableHead>{t('reports.col.method')}</TableHead>
              <TableHead className="text-end">{t('monthEnd.cards.total')}</TableHead>
              <TableHead className="text-end">{t('monthEnd.cards.received')}</TableHead>
              <TableHead className="text-end">{t('monthEnd.cards.pending')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.methods.map((m) => (
              <TableRow key={m.group} className={cn(m.group === 'cash' && 'text-muted-foreground')}>
                <TableCell className="font-medium">
                  {t(`ledger.group.${m.group}`)}
                  {m.pendingRows ? (
                    <span className="text-muted-foreground ms-2 text-xs font-normal">
                      {t('monthEnd.cards.rows', { count: m.pendingRows })}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-end">
                  <Money minor={m.totalMinor} currency={c} strong />
                </TableCell>
                <TableCell className="text-end">
                  <Money minor={m.receivedMinor} currency={c} />
                </TableCell>
                <TableCell className="text-end">
                  <Money minor={m.pendingMinor} currency={c} tone="warn" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {data.bankByChannel.length ? (
        <div className="mt-4 grid gap-1.5" data-testid="month-bank-channels">
          <p className="text-muted-foreground text-xs font-medium">{t('monthEnd.cards.bankByChannel')}</p>
          <ul className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            {data.bankByChannel.map((b) => (
              <li key={b.code} className="flex items-center justify-between gap-3">
                <span className="min-w-0">{labels.channel(b)}</span>
                <Money minor={b.baseMinor} currency={c} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-muted-foreground mt-3 text-xs">{t('monthEnd.cards.note')}</p>
    </SectionCard>
  )

  const topList = (
    <SectionCard
      title={t('monthEnd.top.title')}
      icon={FlameIcon}
      testId="month-top"
      action={<ExportOnly id="top" title={t('monthEnd.top.title')} />}
    >
      <TopList
        groups={top}
        max={top[0]?.totalMinor ?? 0}
        total={data.expensesMinor}
        currency={c}
        categories={data.categories}
      />
    </SectionCard>
  )

  const salaries = data.salaries
  const salaryTable = salaries ? (
    <SectionCard
      title={t('monthEnd.salaries.title')}
      icon={UsersIcon}
      testId="month-salaries"
      action={<ExportOnly id="salaries" title={t('monthEnd.salaries.title')} />}
    >
      {salaries.rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('monthEnd.salaries.empty')}</p>
      ) : mobile && !print ? (
        <ul className="grid gap-3">
          {salaries.rows.map((r) => (
            <li key={r.employeeId} className="grid gap-0.5 rounded-lg border p-3 text-sm">
              <p className="font-medium">{r.fullName}</p>
              <p className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t('monthEnd.salaries.net')}</span>
                <Money minor={r.net} currency={r.currency} strong />
              </p>
              <p className="text-muted-foreground flex justify-between gap-3 text-xs">
                <span>{t('monthEnd.salaries.paid')}</span>
                <Money minor={r.paid} currency={r.currency} />
              </p>
              <p className="flex justify-between gap-3 text-xs">
                <span className="text-muted-foreground">{t('monthEnd.salaries.remaining')}</span>
                <Money minor={r.remaining} currency={r.currency} tone="warn" />
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <Table className="text-sm" density="compact">
          <TableHeader>
            <TableRow>
              <TableHead>{t('monthEnd.salaries.employee')}</TableHead>
              <TableHead className="text-end">{t('monthEnd.salaries.monthly')}</TableHead>
              <TableHead className="text-end">{t('monthEnd.salaries.advances')}</TableHead>
              <TableHead className="text-end">{t('monthEnd.salaries.leave')}</TableHead>
              <TableHead className="text-end">{t('monthEnd.salaries.leavePay')}</TableHead>
              <TableHead className="text-end">{t('monthEnd.salaries.net')}</TableHead>
              <TableHead className="text-end">{t('monthEnd.salaries.paid')}</TableHead>
              <TableHead className="text-end">{t('monthEnd.salaries.remaining')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {salaries.rows.map((r) => (
              <TableRow key={r.employeeId}>
                <TableCell>
                  <span className="block font-medium">{r.fullName}</span>
                  {r.position ? (
                    <span className="text-muted-foreground block text-xs">{r.position}</span>
                  ) : null}
                </TableCell>
                <TableCell className="text-end">
                  <Money minor={r.monthly} currency={r.currency} />
                </TableCell>
                <TableCell className="text-end">
                  {r.advances ? (
                    <Money minor={-r.advances} currency={r.currency} />
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-end tabular-nums">
                  {t('monthEnd.salaries.leaveDays', { used: r.leaveUsed, entitled: r.leaveEntitled })}
                </TableCell>
                <TableCell className="text-end">
                  {r.leavePayout ? (
                    <Money minor={r.leavePayout} currency={r.currency} />
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </TableCell>
                <TableCell className="text-end">
                  <Money minor={r.net} currency={r.currency} strong />
                </TableCell>
                <TableCell className="text-end">
                  <Money minor={r.paid} currency={r.currency} />
                </TableCell>
                <TableCell className="text-end">
                  <Money minor={r.remaining} currency={r.currency} tone="warn" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            {salarySums.map(({ currency, sum: x }) => (
              <TableRow key={currency} data-testid={`salary-total-${currency}`}>
                <TableCell className="font-semibold">
                  {salarySums.length > 1 ? t('monthEnd.salaries.totalIn', { currency }) : t('common.total')}
                </TableCell>
                <TableCell className="text-end">
                  <Money minor={x.monthly} currency={currency} />
                </TableCell>
                <TableCell className="text-end">
                  <Money minor={-x.advances} currency={currency} />
                </TableCell>
                <TableCell />
                <TableCell className="text-end">
                  <Money minor={x.leavePayout} currency={currency} />
                </TableCell>
                <TableCell className="text-end">
                  <Money minor={x.net} currency={currency} strong />
                </TableCell>
                <TableCell className="text-end">
                  <Money minor={x.paid} currency={currency} />
                </TableCell>
                <TableCell className="text-end">
                  <Money minor={x.remaining} currency={currency} tone="warn" />
                </TableCell>
              </TableRow>
            ))}
          </TableFooter>
        </Table>
      )}
      {salaries.withoutSalary ? (
        <p className="text-warning mt-3 text-xs">
          {t('monthEnd.salaries.withoutSalary', { count: salaries.withoutSalary })}
        </p>
      ) : null}
      <p className="text-muted-foreground mt-3 text-xs">{t('monthEnd.salaries.noteShort')}</p>
    </SectionCard>
  ) : null

  const tourismCard =
    data.tourism && due ? (
      <SectionCard title={t('monthEnd.tourism.title')} icon={GlobeIcon} testId="month-tourism">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {data.tourism.reportedAt
              ? t('monthEnd.tourism.reported', { month: monthName(monthKey, false) })
              : t('monthEnd.tourism.body', {
                  month: monthName(monthKey, false),
                  from: f.dayMonth(data.to),
                  to: f.dayMonth(due)
                })}
          </p>
          {print ? null : (
            <Button asChild variant="outline" size="sm">
              <Link to="/tourism">
                {t('monthEnd.tourism.open')}
                <ArrowRightIcon className="rtl:rotate-180" aria-hidden />
              </Link>
            </Button>
          )}
        </div>
      </SectionCard>
    ) : null

  return (
    <div className="grid grid-cols-1 gap-4">
      <DataNotes missing={data.missingRate} partial={data.partial} />
      {kpis}
      <div className="grid items-start gap-4 lg:grid-cols-5 print:grid-cols-1">
        <div className="lg:col-span-2">{checklist}</div>
        <div className="grid gap-4 lg:col-span-3">
          {cards}
          {tourismCard}
        </div>
      </div>
      {topList}
      {salaryTable}
      <FxSourcesCard rows={data.fxSources} currency={data.baseCurrency} />
    </div>
  )
}

function MonthEndScreen({ today, firstDay }: { today: LocalDate; firstDay: LocalDate | null }) {
  const { t } = useTranslation()
  const monthName = useMonthName()
  const months = monthsBetween(firstDay, today)
  const [month, setMonth] = useState(months[1] ?? months[0]!)
  const query = useApiQuery('reports.monthEnd', ym(month))
  const print = usePrint()
  return (
    <ReportScope value={{ report: 'monthEnd', ...ym(month) }}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MonthBar month={month} months={months} onMonth={setMonth} />
          <div className="flex flex-wrap gap-2 max-md:w-full max-md:[&>[data-slot=button]]:flex-1">
            <ReportActions onPrint={print.start} />
          </div>
        </div>
        <ReportQuery query={query}>
          {(d) => <MonthEndView key={month} data={d} monthKey={month} />}
        </ReportQuery>
      </div>
      {print.printing && query.data ? (
        <PrintLayout title={t('nav.monthEnd')} range={monthName(month)}>
          <MonthEndView data={query.data} monthKey={month} />
        </PrintLayout>
      ) : null}
    </ReportScope>
  )
}

export function MonthEndPage() {
  const { t } = useTranslation()
  const can = useCan()
  const allowed = can('reports.finance')
  const context = useApiQuery('reports.context', {}, { enabled: allowed })
  return (
    <Page title={t('nav.monthEnd')} description={t('monthEnd.description')}>
      {!allowed ? (
        <NoAccess />
      ) : (
        <QueryView query={context} loading={<ReportSkeleton />}>
          {(c) => <MonthEndScreen today={c.today} firstDay={c.firstDay} />}
        </QueryView>
      )}
    </Page>
  )
}
