// Parts of the day page (faz-07 madde 1, 6): the day bar (picker, ◀ ▶, Bugün, the remembered order, close / reopen
// the day), the day's totals per currency and in the base currency (with the "kısmi görünüm" mark when a section is
// hidden from the role), and the day note.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LockIcon,
  LockOpenIcon,
  NotebookPenIcon,
  PrinterIcon,
  ReceiptTextIcon
} from 'lucide-react'
import { addDays, type LocalDate } from '@shared/date'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { MonthCalendar } from '@/components/date-input'
import { SectionCard } from '@/components/section-card'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { useLedgerMutation, type LedgerDay } from './ledger-api'
import { VoidDialog } from './void-dialog'
import type { DayOrder } from './income-section'

const ORDERS: readonly DayOrder[] = ['method', 'time']

/** Russian "2026 г." stays together when the label wraps. */
const keepUnit = (text: string): string => text.replace(/ (г\.)/g, ' $1')

export function DayBar({
  day,
  today,
  onDay,
  order,
  onOrder,
  status,
  onPrint
}: {
  day: LocalDate
  today: LocalDate
  onDay: (d: LocalDate) => void
  order: DayOrder
  onOrder: (o: DayOrder) => void
  status: Pick<LedgerDay, 'status' | 'closingEnabled' | 'closedAt' | 'closedByName'> | null
  /** "Yazdır / PDF" (faz-15 madde 8): the day on A4; not on the phone. */
  onPrint?: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const mobile = useIsMobile()
  const [picking, setPicking] = useState(false)
  const [closing, setClosing] = useState(false)
  const [reopening, setReopening] = useState(false)
  const mayClose = can('business_day.close', 'edit')
  const closeDay = useLedgerMutation('ledger.closeDay', {
    success: t('ledger.close.done'),
    onSuccess: () => setClosing(false)
  })
  const reopenDay = useLedgerMutation('ledger.reopenDay', {
    success: t('ledger.close.reopened'),
    onSuccess: () => setReopening(false)
  })
  const label = mobile ? keepUnit(`${f.weekday(day)}, ${f.date(day, 'long')}`) : f.date(day, 'full')
  const closed = status?.status === 'closed'
  const todayButton = (
    <Button
      variant="outline"
      size="sm"
      className="md:ms-1"
      onClick={() => onDay(today)}
      disabled={day === today}
    >
      {t('common.today')}
    </Button>
  )
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="day-bar">
      <div className="flex min-w-0 items-center gap-1 max-md:w-full">
        <Button
          variant="outline"
          size="icon"
          aria-label={t('ledger.day.previous')}
          onClick={() => onDay(addDays(day, -1))}
        >
          <ChevronLeftIcon className="rtl:rotate-180" />
        </Button>
        <Popover open={picking} onOpenChange={setPicking}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className="h-auto min-h-9 min-w-0 gap-2 px-3 text-base font-semibold max-md:flex-1 md:min-w-60"
              aria-label={t('ledger.day.pickCurrent', { date: f.date(day, 'full') })}
            >
              <CalendarDaysIcon className="text-muted-foreground" aria-hidden />
              <span
                className="min-w-0 text-start whitespace-normal"
                aria-live="polite"
                data-testid="day-label"
              >
                {label}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <MonthCalendar
              value={day}
              onPick={(d) => {
                onDay(d)
                setPicking(false)
              }}
            />
          </PopoverContent>
        </Popover>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('ledger.day.next')}
          onClick={() => onDay(addDays(day, 1))}
        >
          <ChevronRightIcon className="rtl:rotate-180" />
        </Button>
        {mobile ? null : todayButton}
        {closed ? (
          <Badge variant="outline" className="ms-1 gap-1" data-testid="day-closed">
            <LockIcon aria-hidden />
            {t('ledger.close.closedBadge')}
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 max-md:w-full md:ms-auto">
        {mobile ? todayButton : null}
        {mobile ? (
          <Select value={order} onValueChange={(v) => onOrder(v as DayOrder)}>
            <SelectTrigger className="min-w-0 flex-1" aria-label={t('ledger.day.order')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORDERS.map((o) => (
                <SelectItem key={o} value={o}>
                  {t(`ledger.day.orderBy.${o}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={1}
            value={order}
            onValueChange={(v) => v && onOrder(v as DayOrder)}
            aria-label={t('ledger.day.order')}
          >
            {ORDERS.map((o) => (
              <ToggleGroupItem key={o} value={o} data-testid={`order-${o}`}>
                {t(`ledger.day.orderBy.${o}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        {onPrint && status && !mobile ? (
          <Button variant="outline" size="sm" onClick={onPrint} data-testid="day-print">
            <PrinterIcon aria-hidden />
            {t('ledger.print.button')}
          </Button>
        ) : null}
        {mayClose && status ? (
          closed ? (
            <Button variant="outline" size="sm" onClick={() => setReopening(true)} data-testid="day-reopen">
              <LockOpenIcon aria-hidden />
              {t('ledger.close.reopen')}
            </Button>
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!status.closingEnabled}
                aria-describedby={status.closingEnabled ? undefined : 'day-close-hint'}
                onClick={() => setClosing(true)}
                data-testid="day-close"
              >
                <LockIcon aria-hidden />
                {t('ledger.day.close')}
              </Button>
              {!status.closingEnabled ? (
                <span id="day-close-hint" className="text-muted-foreground max-w-48 text-xs">
                  {t('ledger.day.closeOff')}
                </span>
              ) : null}
            </span>
          )
        ) : null}
      </div>
      <AlertDialog open={closing} onOpenChange={setClosing}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('ledger.close.title', { date: f.date(day, 'long') })}</AlertDialogTitle>
            <AlertDialogDescription>{t('ledger.close.body')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                closeDay.mutate({ date: day })
              }}
              data-testid="day-close-confirm"
            >
              {t('ledger.day.close')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Reopening asks for the reason the audit row keeps, like voiding. */}
      <ReopenDialog
        open={reopening}
        day={day}
        onOpenChange={setReopening}
        pending={reopenDay.isPending}
        onConfirm={(reason) => reopenDay.mutate({ date: day, reason })}
      />
    </div>
  )
}

function ReopenDialog({
  open,
  day,
  onOpenChange,
  onConfirm,
  pending
}: {
  open: boolean
  day: LocalDate
  onOpenChange: (o: boolean) => void
  onConfirm: (reason: string) => void
  pending: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  return (
    <VoidDialog
      subject={open ? f.date(day, 'long') : null}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      pending={pending}
      texts={{
        title: t('ledger.close.reopenTitle', { date: f.date(day, 'long') }),
        description: t('ledger.close.reopenBody'),
        confirm: t('ledger.close.reopen')
      }}
    />
  )
}

/** The day band's totals (Excel daily card): per currency, then in the base currency with the net. */
export function DaySummaryCard({ day, className }: { day: LedgerDay; className?: string }) {
  const { t } = useTranslation()
  const f = useFormat()
  const base = day.totals.baseCurrency
  const net = day.totals.netBaseMinor
  return (
    <SectionCard
      title={t('ledger.summary.title')}
      icon={ReceiptTextIcon}
      className={className}
      testId="day-summary"
      action={
        day.partial ? (
          <Badge variant="outline" title={t('ledger.partial.hint')} data-testid="partial-badge">
            {t('ledger.partial.badge')}
          </Badge>
        ) : null
      }
    >
      <table className="w-full text-sm" data-testid="currency-totals">
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
          {day.totals.byCurrency.length ? (
            day.totals.byCurrency.map((c) => (
              <tr key={c.currency} className="border-t">
                <th scope="row" className="py-1.5 text-start font-medium">
                  {c.currency}
                </th>
                <td className="py-1.5 text-end">
                  <bdi className="tabular-nums">{f.money(c.incomeMinor, c.currency)}</bdi>
                </td>
                <td className="py-1.5 text-end">
                  <bdi className="tabular-nums">
                    {f.money(c.expensesMinor ? -c.expensesMinor : 0, c.currency)}
                  </bdi>
                </td>
                <td className="py-1.5 text-end font-semibold">
                  <bdi
                    className={cn('tabular-nums', c.incomeMinor - c.expensesMinor < 0 && 'text-destructive')}
                  >
                    {f.money(c.incomeMinor - c.expensesMinor, c.currency)}
                  </bdi>
                </td>
              </tr>
            ))
          ) : (
            <tr className="border-t">
              <td colSpan={4} className="text-muted-foreground py-1.5">
                {t('ledger.summary.nothing')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <dl className="mt-3 grid gap-1 border-t pt-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-muted-foreground">{t('ledger.summary.inBase', { currency: base })}</dt>
          <dd className="flex flex-wrap justify-end gap-x-3 tabular-nums">
            <bdi>{f.money(day.totals.revenueBaseMinor, base)}</bdi>
            <bdi>{f.money(day.totals.expensesBaseMinor ? -day.totals.expensesBaseMinor : 0, base)}</bdi>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="font-semibold">{t('ledger.summary.net')}</dt>
          <dd className="text-base">
            <bdi
              className={cn('font-semibold tabular-nums', net < 0 && 'text-destructive')}
              data-testid="day-net"
            >
              {f.money(net, base)}
            </bdi>
          </dd>
        </div>
      </dl>
      {day.totals.missingRate ? (
        <p className="text-warning mt-2 text-xs">
          {t('ledger.summary.missingRate', { count: day.totals.missingRate })}
        </p>
      ) : null}
    </SectionCard>
  )
}

export function DayNote({ day, className }: { day: LedgerDay; className?: string }) {
  const { t } = useTranslation()
  const can = useCan()
  const initial = day.note ?? ''
  const [note, setNote] = useState(initial)
  const [reason, setReason] = useState('')
  const closed = day.status === 'closed' && day.closingEnabled
  // B26: a closed day takes a note only from someone who may write into it (with a reason).
  const lockedForMe = closed && can('ledger', 'edit') && !can('ledger.locked', 'edit')
  const editable = can('ledger', 'edit') && !lockedForMe
  const save = useLedgerMutation('ledger.setDayNote', { success: t('ledger.note.saved') })
  return (
    <SectionCard
      title={t('ledger.note.title')}
      icon={NotebookPenIcon}
      className={className}
      testId="day-note"
    >
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (note === initial || save.isPending) return
          save.mutate({
            date: day.date,
            note: note.trim() || null,
            ...(closed ? { reason: reason.trim() } : {})
          })
        }}
      >
        <Label htmlFor="day-note" className="sr-only">
          {t('ledger.note.title')}
        </Label>
        <Textarea
          id="day-note"
          value={note}
          readOnly={!editable}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('ledger.note.placeholder')}
          className="min-h-24"
          maxLength={1000}
        />
        {lockedForMe ? (
          <p className="text-muted-foreground text-xs" data-testid="day-note-locked">
            {t('ledger.closed.lockedHint')}
          </p>
        ) : null}
        {editable && closed ? (
          <Input
            aria-label={t('ledger.closed.reason')}
            placeholder={t('ledger.closed.reason')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
          />
        ) : null}
        {editable ? (
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="justify-self-end"
            disabled={note === initial || save.isPending || (closed && !reason.trim())}
            data-testid="day-note-save"
          >
            {t('common.save')}
          </Button>
        ) : null}
      </form>
    </SectionCard>
  )
}
