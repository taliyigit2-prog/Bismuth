// "Teslim al" (G-64, S-30, S-31): the owner or the manager takes the money — everything up to today, cash only, or
// the rows picked on the ledger screen — after counting the drawer and checking card and IBAN rows against the bank.
// One confirmation writes the "x" on every row and one handover record (who, when, how much, which rows); the
// history can undo it. The amount shown is the net the history will keep (QA2a): the cash taken less the drawer
// expenses and the staff money paid out of the drawer that the same handover settles, with the sum written out.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MethodGroup } from '@shared/domain/cash'
import { today } from '@shared/date'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useLedgerMutation, type CashPanelData } from '@/features/ledger/ledger-api'

const SCOPES = ['all', 'cash', 'selected'] as const
type Scope = (typeof SCOPES)[number]

export interface SelectedRow {
  id: string
  /** Signed (a refund is negative). */
  amountMinor: number
  currency: string
  date?: string
  isCash?: boolean
  methodGroup?: string
}

export interface ScopeCurrency {
  /** Cash payments taken. */
  cash: number
  /** Drawer expenses settled with them (positive). */
  expenses: number
  /** Advances and salary payments out of the drawer settled with them (positive). */
  staff: number
  /** What stays in the history: cash − expenses − staff. */
  net: number
  /** Card, IBAN… rows taken (not in the drawer). */
  others: Partial<Record<MethodGroup, number>>
}

/**
 * What a scope takes per currency, as the service settles it (payments-service `handover`): "up to today" takes the
 * cash rows dated today or earlier and every drawer expense up to today; picked rows take their cash and the drawer
 * expenses up to the newest picked cash day of that currency.
 */
export function scopeSummary(
  panel: Pick<CashPanelData, 'pendingToday' | 'cashToday' | 'drawerOut'>,
  scope: Scope,
  selected: readonly SelectedRow[],
  day: string
): Record<string, ScopeCurrency> {
  const out: Record<string, ScopeCurrency> = {}
  const at = (c: string): ScopeCurrency => (out[c] ??= { cash: 0, expenses: 0, staff: 0, net: 0, others: {} })
  const settle = (c: string, upTo: string): void => {
    for (const o of panel.drawerOut ?? [])
      if (o.currency === c && o.date <= upTo) {
        at(c).expenses += o.expensesMinor
        at(c).staff += o.staffMinor
      }
  }
  if (scope === 'selected') {
    const cuts = new Map<string, string>()
    for (const r of selected) {
      if (r.isCash ?? true) {
        at(r.currency).cash += r.amountMinor
        const was = cuts.get(r.currency)
        if (r.date && (!was || r.date > was)) cuts.set(r.currency, r.date)
      } else {
        const g = (r.methodGroup ?? 'other') as MethodGroup
        at(r.currency).others[g] = (at(r.currency).others[g] ?? 0) + r.amountMinor
      }
    }
    for (const [c, upTo] of cuts) settle(c, upTo)
  } else {
    for (const [c, v] of Object.entries(panel.cashToday ?? {})) if (v) at(c).cash += v
    for (const c of new Set((panel.drawerOut ?? []).map((o) => o.currency))) settle(c, day)
    if (scope === 'all')
      for (const [c, groups] of Object.entries(panel.pendingToday))
        for (const [g, v] of Object.entries(groups ?? {}))
          if (g !== 'cash' && v) at(c).others[g as MethodGroup] = (at(c).others[g as MethodGroup] ?? 0) + v
  }
  for (const v of Object.values(out)) v.net = v.cash - v.expenses - v.staff
  return out
}

export function HandoverDialog({
  open,
  onOpenChange,
  panel,
  selected,
  onDone
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  panel: CashPanelData
  selected: readonly SelectedRow[]
  onDone?: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  // null = the default of this opening: the picked rows when there are some, else everything up to today.
  const [chosen, setScope] = useState<Scope | null>(null)
  const scope: Scope = chosen ?? (selected.length ? 'selected' : 'all')
  const [note, setNote] = useState('')
  const close = (): void => {
    setScope(null)
    setNote('')
    onOpenChange(false)
  }
  const save = useLedgerMutation('ledger.handover', {
    onSuccess: () => {
      close()
      onDone?.()
    },
    success: t('ledger.drawer.collected')
  })
  const summary = scopeSummary(panel, scope, selected, today())
  const empty = !Object.values(summary).some(
    (v) => v.cash || v.expenses || v.staff || Object.values(v.others).some(Boolean)
  )
  const submit = (): void => {
    if (empty || save.isPending) return
    const day = today()
    save.mutate(
      scope === 'selected'
        ? { paymentIds: selected.map((s) => s.id), note: note.trim() || null }
        : { upToDate: day, onlyCash: scope === 'cash', note: note.trim() || null }
    )
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      title={t('ledger.drawer.confirmTitle')}
      description={t('ledger.drawer.confirmBody')}
      footer={
        <>
          <Button variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="handover-form"
            disabled={empty || save.isPending}
            data-testid="handover-confirm"
          >
            {t('ledger.drawer.collect')}
          </Button>
        </>
      }
    >
      <form
        id="handover-form"
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <RadioGroup value={scope} onValueChange={(v) => setScope(v as Scope)} className="grid gap-2">
          {SCOPES.filter((s) => s !== 'selected' || selected.length > 0).map((s) => (
            <Label
              key={s}
              className="flex min-h-9 items-start gap-2 rounded-lg border px-3 py-2 font-normal max-md:min-h-11"
            >
              <RadioGroupItem value={s} className="mt-0.5" data-testid={`handover-scope-${s}`} />
              <span className="grid gap-0.5">
                <span className="font-medium">
                  {s === 'selected'
                    ? t('ledger.drawer.scope.selected', { count: selected.length })
                    : t(`ledger.drawer.scope.${s}`)}
                </span>
                <span className="text-muted-foreground text-xs">{t(`ledger.drawer.scopeHint.${s}`)}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        <div
          className="bg-accent/60 grid gap-1 rounded-lg px-3 py-2"
          aria-live="polite"
          data-testid="handover-total"
        >
          <p className="text-muted-foreground text-xs">{t('ledger.drawer.youTake')}</p>
          {empty ? (
            <p className="text-sm">{t('ledger.drawer.nothingInScope')}</p>
          ) : (
            Object.entries(summary).map(([c, v], i) => (
              <div
                key={c}
                className={i ? 'mt-1 grid gap-0.5 border-t pt-1.5' : 'grid gap-0.5'}
                data-testid={`handover-total-${c}`}
              >
                {v.cash || v.expenses || v.staff ? (
                  <>
                    <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-sm">{t('ledger.drawer.netCash')}</span>
                      <bdi className="text-lg font-semibold tabular-nums" data-testid="handover-net">
                        {f.money(v.net, c)}
                      </bdi>
                    </p>
                    <dl className="text-muted-foreground grid gap-0.5 text-xs" data-testid="handover-parts">
                      <Part label={t('ledger.drawer.parts.cash')} amount={f.money(v.cash, c)} />
                      {v.expenses ? (
                        <Part label={t('ledger.drawer.parts.expenses')} amount={f.money(-v.expenses, c)} />
                      ) : null}
                      {v.staff ? (
                        <Part label={t('ledger.drawer.parts.staff')} amount={f.money(-v.staff, c)} />
                      ) : null}
                    </dl>
                  </>
                ) : null}
                {Object.entries(v.others)
                  .filter(([, amount]) => amount)
                  .map(([g, amount]) => (
                    <p key={g} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                      <span>{t(`ledger.group.${g as MethodGroup}`)}</span>
                      <bdi className="font-semibold tabular-nums">{f.money(amount ?? 0, c)}</bdi>
                    </p>
                  ))}
              </div>
            ))
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="handover-note">{t('common.note')}</Label>
          <Textarea
            id="handover-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('ledger.drawer.notePlaceholder')}
            maxLength={500}
          />
        </div>
      </form>
    </ResponsiveDialog>
  )
}

function Part({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3">
      <dt>{label}</dt>
      <dd>
        <bdi className="tabular-nums">{amount}</bdi>
      </dd>
    </div>
  )
}
