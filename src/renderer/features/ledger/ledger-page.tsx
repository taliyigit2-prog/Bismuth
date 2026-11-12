// Defter ve kasa (faz-07; G-60…G-72): the owner's Excel day ledger, tidier — a day picker instead of a 760-row sheet,
// income in the cash → IBAN → card order with the "x", the day's expenses (staff and laundry rows locked), totals per
// currency, the day note, closing the day; the month as day bands; the drawer panel. Every row is the real record:
// a payment entered here is the reservation's payment (the tape chart repaints), an expense with product lines is
// the supply purchase. Phone (G-143 "kasa paneli"): the drawer first, then the day as cards.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearch } from '@tanstack/react-router'
import { CalendarRangeIcon, PlusIcon, ReceiptIcon, WalletIcon } from 'lucide-react'
import { isLocalDate, type LocalDate } from '@shared/date'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CashDrawerPanel } from '@/components/cash-drawer/cash-drawer-panel'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { SectionCard } from '@/components/section-card'
import { NoAccessState } from '@/components/states'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiMutation } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { useShortcutAction } from '@/lib/shortcuts/actions'
import { DayBar, DayNote, DaySummaryCard } from './day-parts'
import { usePrint } from '@/features/reports/use-report-export'
import { DictionaryDialog } from './dictionary-dialog'
import { ExpenseDialog } from './expense-dialog'
import { ExpensesSection } from './expenses-section'
import { IncomeSection, type DayOrder } from './income-section'
import { LedgerDayPrint } from './ledger-print'
import {
  useLedgerDay,
  useLedgerOptions,
  type ExpenseRow,
  type IncomeRow,
  type LedgerOptions
} from './ledger-api'
import { MonthView } from './month-view'
import { PaymentDialog } from './payment-dialog'

type Dialog =
  { kind: 'payment'; row?: IncomeRow } | { kind: 'expense'; row?: ExpenseRow } | { kind: 'dictionary' } | null
type View = 'day' | 'month'

function DaySkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-4">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="grid gap-4 lg:grid-cols-3" aria-hidden>
        <Skeleton className="h-56 lg:col-span-2" />
        <Skeleton className="h-56" />
      </div>
      <Skeleton className="h-80" aria-hidden />
    </div>
  )
}

function DayView({
  options,
  day,
  onDay,
  dialog,
  onDialog
}: {
  options: LedgerOptions
  day: LocalDate
  onDay: (d: LocalDate) => void
  dialog: Dialog
  onDialog: (d: Dialog) => void
}) {
  const { t } = useTranslation()
  const can = useCan()
  const mobile = useIsMobile()
  const query = useLedgerDay(day)
  const [order, setOrder] = useState<DayOrder>(options.sort)
  const remember = useApiMutation('ledger.setSort', { invalidates: ['ledger.options'] })
  const changeOrder = (o: DayOrder): void => {
    setOrder(o)
    remember.mutate({ sort: o })
  }
  const data = query.data
  const closed = !!data && data.status === 'closed' && data.closingEnabled
  const print = usePrint()
  const bar = (
    <DayBar
      day={day}
      today={options.today}
      onDay={onDay}
      order={order}
      onOrder={changeOrder}
      status={data ?? null}
      onPrint={print.start}
    />
  )
  const panel = can('cash') ? (
    <SectionCard
      title={t('ledger.panel.title')}
      icon={WalletIcon}
      className={mobile ? undefined : 'lg:col-span-2'}
      testId="cash-panel"
    >
      <CashDrawerPanel compact={mobile} />
    </SectionCard>
  ) : null
  return (
    <div className="grid grid-cols-1 gap-4">
      {bar}
      <QueryView query={query} loading={<DaySkeleton />}>
        {(d) => {
          const summary = <DaySummaryCard day={d} />
          const income = (
            <IncomeSection
              key={`${d.date}-${order}`}
              rows={d.income}
              options={options}
              order={order}
              mobile={mobile}
              onEdit={(row) => onDialog({ kind: 'payment', row })}
            />
          )
          const expenses = (
            <ExpensesSection
              key={d.date}
              rows={d.expenses}
              options={options}
              mobile={mobile}
              partial={d.partial}
              onEdit={(row) => onDialog({ kind: 'expense', row })}
              onDictionary={can('expenses') ? () => onDialog({ kind: 'dictionary' }) : undefined}
            />
          )
          const note = <DayNote key={`${d.date}-${d.note ?? ''}`} day={d} />
          return mobile ? (
            <div className="grid grid-cols-1 gap-4">
              {panel}
              {summary}
              {income}
              {expenses}
              {note}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              <div className="grid items-start gap-4 lg:grid-cols-3">
                {panel}
                <div className={panel ? undefined : 'lg:col-span-3'}>{summary}</div>
              </div>
              {income}
              <div className="grid items-start gap-4 lg:grid-cols-3">
                <div className="min-w-0 lg:col-span-2">{expenses}</div>
                {note}
              </div>
            </div>
          )
        }}
      </QueryView>
      <PaymentDialog
        open={dialog?.kind === 'payment'}
        onOpenChange={(o) => !o && onDialog(null)}
        day={day}
        closed={closed}
        options={options}
        editing={dialog?.kind === 'payment' ? (dialog.row ?? null) : null}
      />
      <ExpenseDialog
        open={dialog?.kind === 'expense'}
        onOpenChange={(o) => !o && onDialog(null)}
        day={day}
        closed={closed}
        options={options}
        editing={dialog?.kind === 'expense' ? (dialog.row ?? null) : null}
      />
      <DictionaryDialog open={dialog?.kind === 'dictionary'} onOpenChange={(o) => !o && onDialog(null)} />
      {print.printing && data ? <LedgerDayPrint day={data} options={options} /> : null}
    </div>
  )
}

export function LedgerPage() {
  const { t } = useTranslation()
  const can = useCan()
  const allowed = can('ledger')
  const options = useLedgerOptions(allowed)
  return (
    <Page title={t('nav.ledger')} description={t('ledger.description')}>
      {!allowed ? (
        <NoAccessState />
      ) : (
        <QueryView query={options} loading={<DaySkeleton />}>
          {(o) => <LedgerScreen options={o} />}
        </QueryView>
      )}
    </Page>
  )
}

/** The day / month switch, the two main actions (they write to the day on screen) and the view. */
function LedgerScreen({ options }: { options: LedgerOptions }) {
  const { t } = useTranslation()
  const can = useCan()
  const [view, setView] = useState<View>('day')
  // `?day=2026-10-02`: opened from a report's day (faz-10 madde 2b).
  const search: { day?: unknown } = useSearch({ strict: false })
  const [day, setDay] = useState<LocalDate>(isLocalDate(search.day) ? search.day : options.today)
  const [dialog, setDialog] = useState<Dialog>(null)
  const canPay = can('payments', 'edit') || can('extras', 'edit')
  const canSpend = can('expenses', 'edit') && options.sections.some((s) => s.canEdit)
  // P (lib/shortcuts): a payment on the day on screen, from any screen.
  useShortcutAction(
    'addPayment',
    () => {
      setView('day')
      setDialog({ kind: 'payment' })
    },
    { enabled: canPay }
  )
  return (
    <Tabs value={view} onValueChange={(v) => setView(v as View)} className="gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* Phone: 44 px tabs (the list's own 48 px height leaves 41 px for a tab). */}
        <TabsList aria-label={t('ledger.view.label')} className="max-md:h-auto max-md:w-full">
          <TabsTrigger value="day" data-testid="view-day" className="max-md:min-h-11">
            {t('ledger.view.day')}
          </TabsTrigger>
          <TabsTrigger value="month" data-testid="view-month" className="max-md:min-h-11">
            <CalendarRangeIcon aria-hidden />
            {t('ledger.view.month')}
          </TabsTrigger>
        </TabsList>
        {view === 'day' && (canPay || canSpend) ? (
          <div className="flex gap-2 max-md:grid max-md:w-full max-md:auto-cols-fr max-md:grid-flow-col md:ms-auto">
            {canSpend ? (
              <Button
                variant="outline"
                onClick={() => setDialog({ kind: 'expense' })}
                data-testid="add-expense"
              >
                <ReceiptIcon aria-hidden />
                {t('ledger.addExpense.title')}
              </Button>
            ) : null}
            {canPay ? (
              <Button onClick={() => setDialog({ kind: 'payment' })} data-testid="add-payment">
                <PlusIcon aria-hidden />
                {t('ledger.addPayment.title')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <TabsContent value="day">
        <DayView options={options} day={day} onDay={setDay} dialog={dialog} onDialog={setDialog} />
      </TabsContent>
      <TabsContent value="month">
        <MonthView
          options={options}
          initial={day}
          onOpenDay={(d) => {
            setDay(d)
            setView('day')
          }}
        />
      </TabsContent>
    </Tabs>
  )
}
