// The day's income (G-61…G-64): payments on reservations and extra sales in the owner's order (cash → IBAN → card,
// G-63) or by time; the "x" once the owner has the money (rows can be picked and taken here, S-30/S-31); a foreign
// amount with its value in the base currency and a badge when the rate was old, typed or missing (G-70). A row
// clicked opens it for changes; a voided row stays, struck through (yasak 11).
import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BanIcon, CoinsIcon, HandCoinsIcon, MoreHorizontalIcon, PencilIcon } from 'lucide-react'
import { sortDayRows, type MethodGroup } from '@shared/domain/cash'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SectionCard } from '@/components/section-card'
import { HandoverDialog } from '@/components/cash-drawer/handover-dialog'
import { useCashPanel } from '@/components/cash-drawer/cash-drawer-panel'
import { useFormat } from '@/hooks/use-format'
import { useCan } from '@/lib/view-as'
import { rowClick } from '@/lib/row-click'
import { cn } from '@/lib/utils'
import {
  localName,
  rateBadge,
  signedAmount,
  useLedgerMutation,
  type IncomeRow,
  type LedgerOptions
} from './ledger-api'
import { VoidDialog } from './void-dialog'

export type DayOrder = 'method' | 'time'

/** Rows grouped by method group (sorted), with per-currency subtotals of live rows. */
function groupRows(rows: readonly IncomeRow[]) {
  const groups: { group: MethodGroup; rows: IncomeRow[]; totals: Record<string, number> }[] = []
  for (const p of sortDayRows(rows)) {
    let g = groups.at(-1)
    if (!g || g.group !== p.methodGroup) {
      g = { group: p.methodGroup, rows: [], totals: {} }
      groups.push(g)
    }
    g.rows.push(p)
    if (!p.voided) g.totals[p.currency] = (g.totals[p.currency] ?? 0) + signedAmount(p)
  }
  return groups
}

export function CollectedMark({ collected, by }: { collected: boolean; by?: string | null }) {
  const { t } = useTranslation()
  if (!collected) return null
  const label = by ? t('ledger.payments.collectedBy', { name: by }) : t('ledger.payments.collected')
  return (
    <span
      className="bg-success/15 border-success text-foreground inline-grid size-6 place-items-center rounded-md border text-sm font-bold"
      title={label}
      data-testid="collected-mark"
    >
      <span aria-hidden>{t('ledger.payments.mark')}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

export function RateBadge({ row }: { row: Parameters<typeof rateBadge>[0] }) {
  const { t } = useTranslation()
  const badge = rateBadge(row)
  if (!badge) return null
  return (
    <Badge
      variant="outline"
      className={cn(badge === 'none' && 'border-warning text-foreground')}
      title={t(`ledger.rate.${badge}Hint`)}
      data-testid={`rate-${badge}`}
    >
      {t(`ledger.rate.${badge}`)}
    </Badge>
  )
}

function Money({ p }: { p: IncomeRow }) {
  const f = useFormat()
  return (
    <bdi className={cn('tabular-nums', p.kind === 'refund' && !p.voided && 'text-destructive')}>
      {f.money(signedAmount(p), p.currency)}
    </bdi>
  )
}

function KindBadge({ p }: { p: IncomeRow }) {
  const { t } = useTranslation()
  if (p.voided)
    return (
      <Badge variant="outline" className="text-muted-foreground" title={p.voidReason ?? undefined}>
        {t('ledger.payments.voided')}
      </Badge>
    )
  if (p.saleTitle) return <Badge variant="outline">{t('ledger.addPayment.target.sale')}</Badge>
  return (
    <Badge variant={p.kind === 'payment' ? 'secondary' : 'outline'}>
      {t(`calendar.paymentKind.${p.kind}`)}
    </Badge>
  )
}

export function IncomeSection({
  rows,
  options,
  order,
  mobile,
  onEdit
}: {
  rows: IncomeRow[]
  options: LedgerOptions
  order: DayOrder
  mobile: boolean
  onEdit: (row: IncomeRow) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const canCollect = can('payments.handover', 'edit')
  const canEdit = can('payments', 'edit')
  const canVoid = can('payments.void', 'edit')
  const panel = useCashPanel(canCollect)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [voiding, setVoiding] = useState<IncomeRow | null>(null)
  const [collecting, setCollecting] = useState(false)
  const voidPayment = useLedgerMutation('ledger.voidPayment', {
    success: t('ledger.pay.voided'),
    onSuccess: () => setVoiding(null)
  })
  const channelName = (p: IncomeRow): string => {
    const ch = options.channels.find(
      (c) => c.id === p.channelId || (p.channelCode && c.code === p.channelCode)
    )
    if (!ch || ch.kind === 'direct') return t('ledger.payments.direct')
    return localName(f, ch)
  }
  const methodName = (p: IncomeRow): string => {
    const m = options.methods.find((x) => x.id === p.methodId)
    return m ? localName(f, m) : t(`ledger.group.${p.methodGroup}`)
  }
  const label = (p: IncomeRow): string => p.roomNumbers.join(', ') || '—'
  const who = (p: IncomeRow): string => p.saleTitle ?? p.guestName ?? '—'
  const editable = (p: IncomeRow): boolean => canEdit && !p.voided && !p.collected
  const foreign = rows.some((p) => p.currency !== options.baseCurrency)
  const selectable = rows.filter((p) => !p.collected && !p.voided)
  const chosen = rows.filter((p) => selected.has(p.id))
  const chosenTotals = chosen.reduce<Record<string, number>>(
    (acc, p) => ({ ...acc, [p.currency]: (acc[p.currency] ?? 0) + signedAmount(p) }),
    {}
  )
  const toggle = (id: string, on: boolean): void => {
    const next = new Set(selected)
    if (on) next.add(id)
    else next.delete(id)
    setSelected(next)
  }
  const allOn = selectable.length > 0 && selectable.every((p) => selected.has(p.id))
  const live = rows.filter((p) => !p.voided).length
  const groups =
    order === 'method'
      ? groupRows(rows)
      : [{ group: null, rows: [...rows].sort((a, b) => a.at.localeCompare(b.at)), totals: {} }]

  const action =
    canCollect && chosen.length && panel.data ? (
      <Button size="sm" onClick={() => setCollecting(true)} data-testid="collect-button">
        <HandCoinsIcon aria-hidden />
        {t('ledger.payments.collect', { count: chosen.length })}
      </Button>
    ) : null

  const rowMenu = (p: IncomeRow) =>
    (editable(p) || (canVoid && !p.voided && !p.collected)) && !p.voided ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="max-md:size-11"
            aria-label={t('ledger.payments.rowActions', { room: `${label(p)} · ${who(p)}` })}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {editable(p) ? (
            <DropdownMenuItem onSelect={() => onEdit(p)}>
              <PencilIcon aria-hidden />
              {t('common.edit')}
            </DropdownMenuItem>
          ) : null}
          {canVoid && !p.collected ? (
            <DropdownMenuItem onSelect={() => setVoiding(p)}>
              <BanIcon aria-hidden />
              {t('ledger.payments.void')}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null

  const pick = (p: IncomeRow) =>
    canCollect && !p.collected && !p.voided ? (
      <Checkbox
        checked={selected.has(p.id)}
        onCheckedChange={(v) => toggle(p.id, v === true)}
        onClick={(e) => e.stopPropagation()}
        aria-label={t('ledger.payments.select', { room: `${label(p)} · ${who(p)}` })}
        className={mobile ? 'size-5' : undefined}
      />
    ) : (
      <CollectedMark collected={p.collected} by={p.collectedByName} />
    )

  const selectionLine =
    canCollect && chosen.length ? (
      <p className="text-muted-foreground mb-3 text-sm" aria-live="polite">
        {t('ledger.payments.selected', { count: chosen.length })}{' '}
        {Object.entries(chosenTotals).map(([c, v]) => (
          <bdi key={c} className="text-foreground me-2 font-medium tabular-nums">
            {f.money(v, c)}
          </bdi>
        ))}
      </p>
    ) : null

  return (
    <SectionCard
      title={t('ledger.payments.title')}
      icon={CoinsIcon}
      count={live}
      action={action}
      testId="day-payments"
    >
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('ledger.payments.empty')}</p>
      ) : mobile ? (
        <>
          {selectionLine}
          <ul className="grid grid-cols-1 gap-2" aria-label={t('ledger.payments.title')}>
            {groups.map((g) => (
              <Fragment key={g.group ?? 'all'}>
                {g.group ? (
                  <li className="text-muted-foreground mt-1 text-xs font-semibold">
                    {t(`ledger.group.${g.group}`)}
                  </li>
                ) : null}
                {g.rows.map((p) => (
                  <li
                    key={p.id}
                    className={cn(
                      'bg-card grid min-w-0 grid-cols-1 gap-0.5 rounded-xl border px-3 py-1.5',
                      p.voided && 'opacity-70'
                    )}
                    data-voided={p.voided || undefined}
                    data-testid="income-row"
                  >
                    <div className="flex min-h-11 items-center gap-3">
                      <span className="grid w-5 place-items-center">{pick(p)}</span>
                      <span className="bg-muted grid h-9 min-w-11 shrink-0 place-items-center rounded-lg px-1.5 text-sm font-semibold tabular-nums">
                        {label(p)}
                      </span>
                      <button
                        type="button"
                        className={cn(
                          'line-clamp-2 min-h-11 min-w-0 flex-1 text-start text-sm font-medium break-words',
                          p.voided && 'line-through'
                        )}
                        disabled={!editable(p)}
                        onClick={() => onEdit(p)}
                      >
                        {who(p)}
                      </button>
                      <span className={cn('text-sm font-semibold', p.voided && 'line-through')}>
                        <Money p={p} />
                      </span>
                    </div>
                    <div className="flex min-h-8 flex-wrap items-center gap-2 ps-8">
                      <span className="text-muted-foreground min-w-0 flex-1 text-xs max-md:basis-full">
                        {[f.time(p.at), methodName(p), channelName(p)].join(' · ')}
                      </span>
                      <RateBadge row={p} />
                      <KindBadge p={p} />
                      {rowMenu(p)}
                    </div>
                  </li>
                ))}
              </Fragment>
            ))}
          </ul>
        </>
      ) : (
        <>
          {selectionLine}
          <Table className="text-sm" density="compact">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  {canCollect ? (
                    <Checkbox
                      checked={allOn}
                      disabled={!selectable.length}
                      onCheckedChange={(v) =>
                        setSelected(v === true ? new Set(selectable.map((p) => p.id)) : new Set())
                      }
                      aria-label={t('ledger.payments.selectAll')}
                    />
                  ) : (
                    <span className="sr-only">{t('ledger.payments.collected')}</span>
                  )}
                </TableHead>
                <TableHead className="w-14">{t('ledger.col.time')}</TableHead>
                <TableHead className="w-16">{t('ledger.col.room')}</TableHead>
                <TableHead>{t('ledger.col.guest')}</TableHead>
                <TableHead>{t('ledger.col.kind')}</TableHead>
                <TableHead>{t('ledger.col.method')}</TableHead>
                <TableHead>{t('ledger.col.channel')}</TableHead>
                <TableHead className="text-end">{t('ledger.col.amount')}</TableHead>
                {foreign ? (
                  <TableHead className="text-end">
                    {t('ledger.col.base', { currency: options.baseCurrency })}
                  </TableHead>
                ) : null}
                <TableHead>{t('ledger.col.recordedBy')}</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">{t('ledger.col.actions')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => (
                <Fragment key={g.group ?? 'all'}>
                  {g.group ? (
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableCell colSpan={7} className="py-1.5 text-xs font-semibold">
                        {t(`ledger.group.${g.group}`)}
                        <span className="text-muted-foreground ms-2 font-normal">
                          {/* QA2a: a group with only voided rows says so instead of "0 satır". */}
                          {g.rows.some((p) => !p.voided)
                            ? t('ledger.payments.rows', { count: g.rows.filter((p) => !p.voided).length })
                            : t('ledger.payments.voided')}
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5 text-end text-xs font-semibold">
                        <span className="grid justify-items-end">
                          {Object.entries(g.totals).map(([c, v]) => (
                            <bdi key={c} className="tabular-nums">
                              {f.money(v, c)}
                            </bdi>
                          ))}
                        </span>
                      </TableCell>
                      <TableCell colSpan={foreign ? 3 : 2} />
                    </TableRow>
                  ) : null}
                  {g.rows.map((p) => (
                    <TableRow
                      key={p.id}
                      data-voided={p.voided || undefined}
                      data-state={selected.has(p.id) ? 'selected' : undefined}
                      data-testid="income-row"
                      className={cn(p.voided && 'text-muted-foreground', editable(p) && 'cursor-pointer')}
                      onClick={rowClick(() => editable(p) && onEdit(p))}
                    >
                      <TableCell>{pick(p)}</TableCell>
                      <TableCell className="tabular-nums">{f.time(p.at)}</TableCell>
                      <TableCell className={cn('font-medium tabular-nums', p.voided && 'line-through')}>
                        {label(p)}
                      </TableCell>
                      <TableCell
                        className={cn('max-w-48 truncate', p.voided && 'line-through')}
                        title={[who(p), p.note].filter(Boolean).join(' · ')}
                      >
                        {who(p)}
                        {p.note ? (
                          <span className="text-muted-foreground block truncate text-xs">{p.note}</span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <KindBadge p={p} />
                      </TableCell>
                      <TableCell>{methodName(p)}</TableCell>
                      <TableCell className="text-muted-foreground">{channelName(p)}</TableCell>
                      <TableCell className={cn('text-end font-medium', p.voided && 'line-through')}>
                        <Money p={p} />
                      </TableCell>
                      {foreign ? (
                        <TableCell className="text-muted-foreground text-end">
                          {p.currency !== options.baseCurrency ? (
                            <span className="inline-flex items-center gap-1.5">
                              <RateBadge row={p} />
                              {p.amountBaseMinor != null ? (
                                <bdi className="tabular-nums">
                                  {f.money(
                                    p.kind === 'refund' ? -p.amountBaseMinor : p.amountBaseMinor,
                                    options.baseCurrency
                                  )}
                                </bdi>
                              ) : null}
                            </span>
                          ) : null}
                        </TableCell>
                      ) : null}
                      <TableCell
                        className="text-muted-foreground max-w-32 truncate"
                        title={p.createdByName ?? undefined}
                      >
                        {p.createdByName ?? '—'}
                      </TableCell>
                      <TableCell className="py-0">{rowMenu(p)}</TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      <VoidDialog
        subject={voiding ? `${f.money(voiding.amountMinor, voiding.currency)} · ${who(voiding)}` : null}
        onOpenChange={(open) => !open && setVoiding(null)}
        pending={voidPayment.isPending}
        onConfirm={(reason) => voiding && voidPayment.mutate({ id: voiding.id, reason })}
      />
      {panel.data ? (
        <HandoverDialog
          open={collecting}
          onOpenChange={setCollecting}
          panel={panel.data}
          selected={chosen.map((p) => ({
            id: p.id,
            amountMinor: signedAmount(p),
            currency: p.currency,
            date: p.date,
            isCash: p.isCash,
            methodGroup: p.methodGroup
          }))}
          onDone={() => setSelected(new Set())}
        />
      ) : null}
    </SectionCard>
  )
}
