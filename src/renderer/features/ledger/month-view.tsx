// The month (faz-07 madde 3): the Excel month sheet as day bands that open and close, a quick day menu (1…31), the
// month's totals per currency and in the base currency, filters by method, channel, currency and employee. Totals
// come from the rows the role may see and the filters keep (a hidden section never reaches the screen).
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FilterXIcon,
  LockIcon,
  NotebookPenIcon,
  WalletIcon
} from 'lucide-react'
import { expensesBase, revenueBase } from '@shared/domain/cash'
import { addDays, diffDays, localDate, type LocalDate } from '@shared/date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { QueryView } from '@/components/query-view'
import { SectionCard } from '@/components/section-card'
import { EmptyState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { countRender } from '@/lib/render-count'
import { cn } from '@/lib/utils'
import { useMonthName } from '../reports/labels'
import { ExpenseKind } from './expenses-section'
import {
  localName,
  signedAmount,
  useLedgerMonth,
  type ExpenseRow,
  type IncomeRow,
  type LedgerMonth,
  type LedgerOptions
} from './ledger-api'

const ALL = 'all'
const FILTER_KEYS = {
  method: 'method',
  channel: 'channel',
  currency: 'currency',
  employee: 'employee'
} as const
interface Filters {
  method: string
  channel: string
  currency: string
  employee: string
}
const NO_FILTER: Filters = { method: ALL, channel: ALL, currency: ALL, employee: ALL }

function firstOfMonth(d: LocalDate): LocalDate {
  return localDate(`${d.slice(0, 7)}-01`)
}
function shiftMonth(first: LocalDate, by: number): LocalDate {
  // The 15th of the month moved by whole months stays in the right month whatever the length.
  const y = Number(first.slice(0, 4))
  const m = Number(first.slice(5, 7)) - 1 + by
  const year = y + Math.floor(m / 12)
  const month = ((m % 12) + 12) % 12
  return localDate(`${year}-${String(month + 1).padStart(2, '0')}-01`)
}

function perCurrency(income: readonly IncomeRow[], expenses: readonly ExpenseRow[]) {
  const out = new Map<string, { income: number; expenses: number }>()
  const of = (c: string) => {
    const v = out.get(c) ?? { income: 0, expenses: 0 }
    out.set(c, v)
    return v
  }
  for (const r of income) if (!r.voided) of(r.currency).income += signedAmount(r)
  for (const e of expenses) if (!e.voided) of(e.currency).expenses += e.amountMinor
  return [...out.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
}

function MonthSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-3">
      <span className="sr-only">{t('common.loading')}</span>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" aria-hidden />
      ))}
    </div>
  )
}

export function MonthView({
  options,
  initial,
  onOpenDay
}: {
  options: LedgerOptions
  initial: LocalDate
  onOpenDay: (d: LocalDate) => void
}) {
  const { t } = useTranslation()
  const monthName = useMonthName()
  const [first, setFirst] = useState<LocalDate>(firstOfMonth(initial))
  const query = useLedgerMonth(Number(first.slice(0, 4)), Number(first.slice(5, 7)))
  return (
    <div className="grid gap-4" data-testid="month-view">
      <div className="flex flex-wrap items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label={t('ledger.month.previous')}
          onClick={() => setFirst(shiftMonth(first, -1))}
        >
          <ChevronLeftIcon className="rtl:rotate-180" />
        </Button>
        <h2
          className="min-w-40 px-2 text-center text-base font-semibold"
          aria-live="polite"
          data-testid="month-label"
        >
          {monthName(first.slice(0, 7))}
        </h2>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('ledger.month.next')}
          onClick={() => setFirst(shiftMonth(first, 1))}
        >
          <ChevronRightIcon className="rtl:rotate-180" />
        </Button>
      </div>
      <QueryView query={query} loading={<MonthSkeleton />}>
        {(month) => <MonthBody key={first} month={month} options={options} onOpenDay={onOpenDay} />}
      </QueryView>
    </div>
  )
}

function MonthBody({
  month,
  options,
  onOpenDay
}: {
  month: LedgerMonth
  options: LedgerOptions
  onOpenDay: (d: LocalDate) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const [filters, setFilters] = useState<Filters>(NO_FILTER)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const filtered = useMemo(() => {
    const byEmployee = (r: { recordedByEmployeeId: string | null; employeeId?: string | null }) =>
      filters.employee === ALL ||
      r.recordedByEmployeeId === filters.employee ||
      r.employeeId === filters.employee
    const income = month.income.filter(
      (r) =>
        (filters.method === ALL || r.methodId === filters.method) &&
        (filters.channel === ALL || r.channelId === filters.channel) &&
        (filters.currency === ALL || r.currency === filters.currency) &&
        byEmployee(r)
    )
    // B19: an expense paid from the drawer has no method of its own: it is cash.
    const cashMethod = options.methods.find((m) => m.id === filters.method)?.isCash ?? false
    const expenses = month.expenses.filter(
      (e) =>
        (filters.method === ALL ||
          e.methodId === filters.method ||
          (e.methodId === null && e.paidFromDrawer && cashMethod)) &&
        filters.channel === ALL &&
        (filters.currency === ALL || e.currency === filters.currency) &&
        byEmployee(e)
    )
    return { income, expenses }
  }, [month, filters, options.methods])
  const days = useMemo(() => {
    const count = diffDays(month.from as LocalDate, month.to as LocalDate)
    return Array.from({ length: count }, (_, i) => addDays(month.from as LocalDate, i))
  }, [month.from, month.to])
  // One pass over the month's rows (1,000+ in a busy month), kept while rows and filters stay (faz-15 madde 9).
  const bands = useMemo(() => {
    const notes = new Map(month.days.map((d) => [d.date, d]))
    const income = new Map<string, IncomeRow[]>()
    const expenses = new Map<string, ExpenseRow[]>()
    for (const r of filtered.income) income.set(r.date, [...(income.get(r.date) ?? []), r])
    for (const e of filtered.expenses) expenses.set(e.date, [...(expenses.get(e.date) ?? []), e])
    return days
      .map((d): Band => ({
        date: d,
        income: income.get(d) ?? [],
        expenses: expenses.get(d) ?? [],
        meta: notes.get(d)
      }))
      .filter((b) => b.income.length || b.expenses.length || b.meta)
  }, [days, filtered, month.days])
  const filtering = Object.values(filters).some((v) => v !== ALL)
  const currencies = [...new Set([...month.income, ...month.expenses].map((r) => r.currency))].sort()
  const methods = options.methods.filter(
    (m) =>
      [...month.income, ...month.expenses].some((r) => r.methodId === m.id) ||
      (m.isCash && month.expenses.some((e) => e.methodId === null && e.paidFromDrawer))
  )
  const channels = options.channels.filter((c) => month.income.some((r) => r.channelId === c.id))
  const revenue = revenueBase(filtered.income)
  const spent = expensesBase(filtered.expenses)
  const base = month.baseCurrency
  const jump = (d: LocalDate): void => {
    setOpen((old) => new Set([...old, d]))
    requestAnimationFrame(() => document.getElementById(`band-${d}`)?.scrollIntoView({ block: 'start' }))
  }
  // Stable: opening one day draws only that day's band again (DayBand is memoised).
  const toggle = useCallback((d: string, on: boolean): void => {
    setOpen((old) => {
      const next = new Set(old)
      if (on) next.add(d)
      else next.delete(d)
      return next
    })
  }, [])
  const filter = (key: keyof Filters, label: string, items: { value: string; label: string }[]) => (
    <div className="grid min-w-0 gap-1">
      <Label htmlFor={`month-filter-${key}`} className="text-xs">
        {label}
      </Label>
      <Select value={filters[key]} onValueChange={(v) => setFilters({ ...filters, [key]: v })}>
        <SelectTrigger id={`month-filter-${key}`} className="w-full" data-testid={`filter-${key}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('common.all')}</SelectItem>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <div className="grid gap-4">
      <SectionCard
        title={t('ledger.month.totals')}
        icon={WalletIcon}
        testId="month-totals"
        action={
          month.partial ? (
            <Badge variant="outline" title={t('ledger.partial.hint')}>
              {t('ledger.partial.badge')}
            </Badge>
          ) : null
        }
      >
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs">
                <th scope="col" className="py-1 text-start font-medium">
                  <span className="sr-only">{t('money.currency')}</span>
                </th>
                <th scope="col" className="py-1 text-end font-medium">
                  {t('ledger.summary.revenue')}
                </th>
                <th scope="col" className="py-1 text-end font-medium">
                  {t('ledger.summary.expenses')}
                </th>
                <th scope="col" className="py-1 text-end font-medium">
                  {t('ledger.summary.netShort')}
                </th>
              </tr>
            </thead>
            <tbody>
              {perCurrency(filtered.income, filtered.expenses).map(([c, v]) => (
                <tr key={c} className="border-t">
                  <th scope="row" className="py-1.5 text-start font-medium">
                    {c}
                  </th>
                  <td className="py-1.5 text-end">
                    <bdi className="tabular-nums">{f.money(v.income, c)}</bdi>
                  </td>
                  <td className="py-1.5 text-end">
                    <bdi className="tabular-nums">{f.money(v.expenses ? -v.expenses : 0, c)}</bdi>
                  </td>
                  <td className="py-1.5 text-end font-semibold">
                    <bdi className={cn('tabular-nums', v.income - v.expenses < 0 && 'text-destructive')}>
                      {f.money(v.income - v.expenses, c)}
                    </bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="bg-accent/60 grid content-start gap-1 rounded-lg px-3 py-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('ledger.summary.revenue')}</dt>
              <dd>
                <bdi className="tabular-nums">{f.money(revenue.totalMinor, base)}</bdi>
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{t('ledger.summary.expenses')}</dt>
              <dd>
                <bdi className="tabular-nums">{f.money(spent.totalMinor ? -spent.totalMinor : 0, base)}</bdi>
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-t pt-1">
              <dt className="font-semibold">{t('ledger.month.net', { currency: base })}</dt>
              <dd>
                <bdi
                  className={cn(
                    'font-semibold tabular-nums',
                    revenue.totalMinor - spent.totalMinor < 0 && 'text-destructive'
                  )}
                  data-testid="month-net"
                >
                  {f.money(revenue.totalMinor - spent.totalMinor, base)}
                </bdi>
              </dd>
            </div>
            {revenue.missingRate + spent.missingRate ? (
              <p className="text-warning text-xs">
                {t('ledger.summary.missingRate', { count: revenue.missingRate + spent.missingRate })}
              </p>
            ) : null}
          </dl>
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))_auto_auto]">
        {filter(
          FILTER_KEYS.method,
          t('ledger.col.method'),
          methods.map((m) => ({ value: m.id, label: localName(f, m) }))
        )}
        {filter(
          FILTER_KEYS.channel,
          t('ledger.col.channel'),
          channels.map((c) => ({ value: c.id, label: localName(f, c) }))
        )}
        {filter(
          FILTER_KEYS.currency,
          t('money.currency'),
          currencies.map((c) => ({ value: c, label: c }))
        )}
        {filter(
          FILTER_KEYS.employee,
          t('ledger.month.employee'),
          month.employees.map((e) => ({ value: e.id, label: e.name }))
        )}
        <Button
          variant="ghost"
          onClick={() => setFilters(NO_FILTER)}
          disabled={!filtering}
          className="max-md:col-span-1"
        >
          <FilterXIcon aria-hidden />
          {t('common.clearFilter')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" data-testid="quick-day">
              {t('ledger.month.goToDay')}
              <ChevronDownIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="grid max-h-80 grid-cols-7 gap-1 p-2">
            {days.map((d) => (
              <DropdownMenuItem
                key={d}
                className="justify-center tabular-nums"
                disabled={!bands.some((b) => b.date === d)}
                onSelect={() => jump(d)}
                aria-label={f.date(d, 'long')}
              >
                {Number(d.slice(8, 10))}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!bands.length ? (
        <EmptyState
          compact
          icon={WalletIcon}
          title={filtering ? t('common.noMatchTitle') : t('ledger.month.emptyTitle')}
          body={filtering ? t('common.noMatchBody') : t('ledger.month.emptyBody')}
        />
      ) : (
        <ul className="grid gap-2" aria-label={t('ledger.month.days')} data-testid="month-bands">
          {bands.map((b) => (
            <DayBand
              key={b.date}
              band={b}
              isOpen={open.has(b.date)}
              onToggle={toggle}
              onOpenDay={onOpenDay}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface Band {
  date: LocalDate
  income: IncomeRow[]
  expenses: ExpenseRow[]
  meta: LedgerMonth['days'][number] | undefined
}

/** One day of the month (faz-15 madde 9): memoised, so opening or closing a day leaves the others alone. */
const DayBand = memo(function DayBand({
  band: b,
  isOpen,
  onToggle,
  onOpenDay
}: {
  band: Band
  isOpen: boolean
  onToggle: (date: string, open: boolean) => void
  onOpenDay: (d: LocalDate) => void
}) {
  countRender('ledger-band')
  const { t } = useTranslation()
  const f = useFormat()
  const sums = perCurrency(b.income, b.expenses)
  return (
    <li id={`band-${b.date}`} className="scroll-mt-20">
      <Collapsible open={isOpen} onOpenChange={(o) => onToggle(b.date, o)}>
        <div className="bg-card rounded-xl border">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="hover:bg-accent/50 focus-visible:ring-ring flex min-h-12 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-start outline-none focus-visible:ring-[3px]"
              data-testid="month-band"
            >
              <ChevronDownIcon
                className={cn('text-muted-foreground size-4 transition-transform', isOpen && 'rotate-180')}
                aria-hidden
              />
              <span className="font-medium">{f.date(b.date, 'full')}</span>
              {b.meta?.status === 'closed' ? (
                <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                  <LockIcon className="size-3.5" aria-hidden />
                  {t('ledger.close.closedBadge')}
                </span>
              ) : null}
              <span className="text-muted-foreground text-xs">
                {t('ledger.month.counts', {
                  income: b.income.filter((r) => !r.voided).length,
                  expenses: b.expenses.filter((e) => !e.voided).length
                })}
              </span>
              <span className="ms-auto flex flex-wrap justify-end gap-x-3 text-sm font-semibold">
                {sums.map(([c, v]) => (
                  <bdi
                    key={c}
                    className={cn('tabular-nums', v.income - v.expenses < 0 && 'text-destructive')}
                  >
                    {f.money(v.income - v.expenses, c)}
                  </bdi>
                ))}
              </span>
              {b.meta?.note ? (
                <span className="text-destructive flex w-full items-center gap-1 text-xs italic">
                  <NotebookPenIcon className="size-3.5" aria-hidden />
                  {b.meta.note}
                </span>
              ) : null}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid gap-3 border-t px-3 py-2">
              <BandRows title={t('ledger.payments.title')}>
                {b.income.map((r) => (
                  <li
                    key={r.id}
                    className={cn(
                      'flex flex-wrap items-center gap-x-3',
                      r.voided && 'text-muted-foreground line-through'
                    )}
                  >
                    <span className="w-12 tabular-nums">{f.time(r.at)}</span>
                    <span className="min-w-0 flex-1 break-words">
                      {[r.roomNumbers.join(', '), r.saleTitle ?? r.guestName].filter(Boolean).join(' · ') ||
                        '—'}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {t(`ledger.group.${r.methodGroup}`)}
                    </span>
                    <bdi className="tabular-nums">{f.money(signedAmount(r), r.currency)}</bdi>
                  </li>
                ))}
              </BandRows>
              <BandRows title={t('ledger.expenses.title')}>
                {b.expenses.map((e) => (
                  <li
                    key={e.id}
                    className={cn(
                      'flex flex-wrap items-center gap-x-3',
                      e.voided && 'text-muted-foreground line-through'
                    )}
                  >
                    <span className="w-12 tabular-nums">{f.time(e.at)}</span>
                    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 break-words">
                      {e.description}
                      <ExpenseKind e={e} />
                    </span>
                    <bdi className="tabular-nums">{f.money(-e.amountMinor, e.currency)}</bdi>
                  </li>
                ))}
              </BandRows>
              <Button
                variant="outline"
                size="sm"
                className="justify-self-start"
                onClick={() => onOpenDay(b.date)}
              >
                {t('ledger.month.openDay')}
                <ArrowRightIcon className="rtl:rotate-180" aria-hidden />
              </Button>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </li>
  )
})

function BandRows({ title, children }: { title: string; children: ReactNode[] }) {
  if (!children.length) return null
  return (
    <div className="grid gap-1">
      <p className="text-muted-foreground text-xs font-medium">{title}</p>
      <ul className="grid gap-1 text-sm">{children}</ul>
    </div>
  )
}
