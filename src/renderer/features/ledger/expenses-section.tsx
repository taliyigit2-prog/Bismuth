// The day's expenses (G-66, G-67, G-69, G-71): free description, amount, paid from the drawer (the Excel expense
// "x", turned into the owner's "x" once settled in a handover), the section, product lines. Salary, advance and leave
// payouts come from the staff screen and the laundry's "ödendi" from the laundry screen: shown with their kind and a
// lock, never changed here (tek giriş). A manual row clicked opens it for changes.
import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BanIcon,
  BookTextIcon,
  ChevronDownIcon,
  LockIcon,
  MoreHorizontalIcon,
  PencilIcon,
  ReceiptIcon
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SectionCard } from '@/components/section-card'
import { useFormat } from '@/hooks/use-format'
import { useCan } from '@/lib/view-as'
import { rowClick } from '@/lib/row-click'
import { cn } from '@/lib/utils'
import { CollectedMark, RateBadge } from './income-section'
import { localName, qtyText, useLedgerMutation, type ExpenseRow, type LedgerOptions } from './ledger-api'
import { VoidDialog } from './void-dialog'

/** What a locked row is: "Maaş ödemesi", "Avans", "Çamaşırhane". */
export function ExpenseKind({ e }: { e: ExpenseRow }) {
  const { t } = useTranslation()
  if (e.kind === 'manual') return null
  const text =
    e.kind === 'staff' && e.staffKind ? t(`staff.txn.${e.staffKind}`) : t(`ledger.exp.kind.${e.kind}`)
  return (
    <Badge
      variant="secondary"
      className="gap-1"
      title={t('ledger.exp.lockedHint')}
      data-testid="expense-locked"
    >
      <LockIcon aria-hidden />
      {text}
    </Badge>
  )
}

function Items({ e }: { e: ExpenseRow }) {
  const f = useFormat()
  return (
    <ul className="text-muted-foreground grid gap-0.5 text-xs" data-testid="expense-items">
      {e.items.map((it) => (
        <li key={it.id} className="flex justify-between gap-3">
          <span className="min-w-0">
            {it.productName ?? '—'} · {qtyText(it.qtyMilli, f)} ×{' '}
            <bdi className="tabular-nums">{f.money(it.unitPriceMinor, e.currency)}</bdi>
          </span>
          <bdi className="tabular-nums">{f.money(it.amountMinor, e.currency)}</bdi>
        </li>
      ))}
    </ul>
  )
}

export function ExpensesSection({
  rows,
  options,
  mobile,
  partial,
  onEdit,
  onDictionary,
  className
}: {
  rows: ExpenseRow[]
  options: LedgerOptions
  mobile: boolean
  partial: boolean
  onEdit: (row: ExpenseRow) => void
  onDictionary?: () => void
  className?: string
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const canEdit = can('expenses', 'edit')
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [voiding, setVoiding] = useState<ExpenseRow | null>(null)
  const voidExpense = useLedgerMutation('ledger.voidExpense', {
    success: t('ledger.exp.voided'),
    onSuccess: () => setVoiding(null)
  })
  const toggle = (id: string): void => {
    const next = new Set(open)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setOpen(next)
  }
  const editable = (e: ExpenseRow): boolean =>
    canEdit &&
    e.kind === 'manual' &&
    !e.voided &&
    !e.settled &&
    !!options.sections.find((s) => s.id === e.sectionId)?.canEdit
  const sectionName = (e: ExpenseRow): string => {
    const s = options.sections.find((x) => x.id === e.sectionId)
    return s ? localName(f, s) : e.sectionCode
  }
  const methodLabel = (e: ExpenseRow): string => {
    if (e.paidFromDrawer) return t('ledger.expenses.drawer')
    const m = options.methods.find((x) => x.id === e.methodId)
    return m ? localName(f, m) : '—'
  }
  const totals = rows
    .filter((e) => !e.voided)
    .reduce<Record<string, number>>(
      (acc, e) => ({ ...acc, [e.currency]: (acc[e.currency] ?? 0) + e.amountMinor }),
      {}
    )
  const foreign = rows.some((e) => e.currency !== options.baseCurrency)
  const mark = (e: ExpenseRow) =>
    e.settled ? (
      <CollectedMark collected />
    ) : e.paidFromDrawer ? (
      <span className="text-muted-foreground text-xs" title={t('ledger.expenses.fromDrawer')}>
        {t('ledger.expenses.drawerShort')}
      </span>
    ) : null
  const menu = (e: ExpenseRow) =>
    editable(e) ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="max-md:size-11"
            aria-label={t('ledger.expenses.rowActions', { description: e.description })}
            onClick={(ev) => ev.stopPropagation()}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onEdit(e)}>
            <PencilIcon aria-hidden />
            {t('common.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setVoiding(e)}>
            <BanIcon aria-hidden />
            {t('ledger.payments.void')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null
  const itemsToggle = (e: ExpenseRow) =>
    e.items.length ? (
      <Button
        variant="ghost"
        size="xs"
        className="text-muted-foreground -ms-1.5 max-md:min-h-11"
        aria-expanded={open.has(e.id)}
        onClick={(ev) => {
          ev.stopPropagation()
          toggle(e.id)
        }}
      >
        {t('ledger.expenses.items', { count: e.items.length })}
        <ChevronDownIcon className={cn('transition-transform', open.has(e.id) && 'rotate-180')} aria-hidden />
      </Button>
    ) : null
  const description = (e: ExpenseRow) => (
    <span className={cn('flex flex-wrap items-center gap-1.5', e.voided && 'line-through')}>
      <span className="break-words">{e.description}</span>
      <ExpenseKind e={e} />
      {e.voided ? (
        <Badge variant="outline" className="text-muted-foreground" title={e.voidReason ?? undefined}>
          {t('ledger.payments.voided')}
        </Badge>
      ) : null}
    </span>
  )

  return (
    <SectionCard
      title={t('ledger.expenses.title')}
      icon={ReceiptIcon}
      count={rows.filter((e) => !e.voided).length}
      action={
        <span className="flex items-center gap-2">
          {Object.entries(totals).map(([c, v]) => (
            <bdi key={c} className="text-sm font-semibold tabular-nums">
              {f.money(v, c)}
            </bdi>
          ))}
          {onDictionary ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="max-md:size-11"
              aria-label={t('ledger.dict.open')}
              title={t('ledger.dict.open')}
              onClick={onDictionary}
              data-testid="open-dictionary"
            >
              <BookTextIcon />
            </Button>
          ) : null}
        </span>
      }
      className={className}
      testId="day-expenses"
    >
      {partial ? (
        <p className="text-muted-foreground mb-2 text-xs" data-testid="expenses-partial">
          {t('ledger.partial.expenses')}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('ledger.expenses.empty')}</p>
      ) : mobile ? (
        <ul className="grid grid-cols-1 gap-2" aria-label={t('ledger.expenses.title')}>
          {rows.map((e) => (
            <li
              key={e.id}
              className={cn(
                'bg-card grid min-w-0 grid-cols-1 gap-1.5 rounded-xl border px-3 py-2',
                e.voided && 'opacity-70'
              )}
              data-voided={e.voided || undefined}
              data-testid="expense-row"
            >
              <div className="flex min-h-10 items-center gap-3">
                <button
                  type="button"
                  className="min-h-11 min-w-0 flex-1 text-start"
                  disabled={!editable(e)}
                  onClick={() => onEdit(e)}
                >
                  <span className="block text-sm font-medium">{description(e)}</span>
                  <span className="text-muted-foreground block text-xs">
                    {[f.time(e.at), methodLabel(e), sectionName(e)].join(' · ')}
                  </span>
                </button>
                <span className="grid justify-items-end gap-1">
                  <bdi className={cn('text-sm font-semibold tabular-nums', e.voided && 'line-through')}>
                    {f.money(e.amountMinor, e.currency)}
                  </bdi>
                  {mark(e)}
                </span>
                {menu(e)}
              </div>
              {itemsToggle(e)}
              {open.has(e.id) ? <Items e={e} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <Table className="text-sm" density="compact">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <span className="sr-only">{t('ledger.expenses.fromDrawer')}</span>
              </TableHead>
              <TableHead className="w-14">{t('ledger.col.time')}</TableHead>
              <TableHead>{t('ledger.col.description')}</TableHead>
              <TableHead>{t('ledger.col.section')}</TableHead>
              <TableHead>{t('ledger.col.method')}</TableHead>
              <TableHead className="text-end">{t('ledger.col.amount')}</TableHead>
              {foreign ? (
                <TableHead className="text-end">
                  {t('ledger.col.base', { currency: options.baseCurrency })}
                </TableHead>
              ) : null}
              <TableHead className="w-10">
                <span className="sr-only">{t('ledger.col.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <Fragment key={e.id}>
                <TableRow
                  data-voided={e.voided || undefined}
                  data-testid="expense-row"
                  className={cn(e.voided && 'text-muted-foreground', editable(e) && 'cursor-pointer')}
                  onClick={rowClick(() => editable(e) && onEdit(e))}
                >
                  <TableCell>{mark(e)}</TableCell>
                  <TableCell className="tabular-nums">{f.time(e.at)}</TableCell>
                  <TableCell className="max-w-72 whitespace-normal">
                    {description(e)}
                    {e.employeeName && e.kind === 'manual' ? (
                      <span className="text-muted-foreground block text-xs">{e.employeeName}</span>
                    ) : null}
                    {itemsToggle(e)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.sectionCode === 'general' ? 'secondary' : 'outline'}>
                      {sectionName(e)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{methodLabel(e)}</TableCell>
                  <TableCell className={cn('text-end font-medium', e.voided && 'line-through')}>
                    <bdi className="tabular-nums">{f.money(e.amountMinor, e.currency)}</bdi>
                  </TableCell>
                  {foreign ? (
                    <TableCell className="text-muted-foreground text-end">
                      {e.currency !== options.baseCurrency ? (
                        <span className="inline-flex items-center gap-1.5">
                          <RateBadge row={e} />
                          {e.amountBaseMinor != null ? (
                            <bdi className="tabular-nums">
                              {f.money(e.amountBaseMinor, options.baseCurrency)}
                            </bdi>
                          ) : null}
                        </span>
                      ) : null}
                    </TableCell>
                  ) : null}
                  <TableCell className="py-0">{menu(e)}</TableCell>
                </TableRow>
                {open.has(e.id) ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={2} />
                    <TableCell colSpan={4} className="pt-0">
                      <Items e={e} />
                    </TableCell>
                    <TableCell colSpan={foreign ? 2 : 1} />
                  </TableRow>
                ) : null}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      )}
      <VoidDialog
        subject={
          voiding ? `${f.money(voiding.amountMinor, voiding.currency)} · ${voiding.description}` : null
        }
        onOpenChange={(o) => !o && setVoiding(null)}
        pending={voidExpense.isPending}
        onConfirm={(reason) => voiding && voidExpense.mutate({ id: voiding.id, reason })}
      />
    </SectionCard>
  )
}
