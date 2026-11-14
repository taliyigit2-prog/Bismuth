// Night-by-night prices (G-36, G-48): every night of a stay with its own price; a weekend or special-day night says
// why its suggested price differs. In the panel each night also shows the colour the tape chart paints it (§6.14:
// automatic status + custom tag), with its name — the colour never speaks alone.
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CoinsIcon } from 'lucide-react'
import type { StatusKey } from '@shared/contract'
import type { LocalDate } from '@shared/date'
import type { PriceReason } from '@shared/domain/booking'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { MAX_AMOUNT_MINOR } from '@shared/money'
import { moneyToText, readMoneyText, useMoneySubmitGuard, type MoneyProblem } from '@/components/money-input'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { tagLabel } from '@/features/settings/use-status-tags'
import { STATUS_BORDER, STATUS_FILL, tagBorder, tagFill } from '@/lib/status-style'
import { cn } from '@/lib/utils'

type Paint = { kind: 'auto'; code: string } | { kind: 'custom'; tagId: string } | null

export interface PriceRow {
  date: LocalDate
  priceMinor: number | null
  reason?: PriceReason
  /** The tape chart's paint of the night (panel only). */
  style?: { fill: Paint; border: Paint; depositIcon: boolean }
}

const fillClass = (p: Paint): string =>
  !p
    ? 'bg-status-empty text-status-empty-fg'
    : p.kind === 'auto'
      ? (STATUS_FILL[p.code as StatusKey] ?? '')
      : tagFill(p.tagId)
const borderClass = (p: Paint): string =>
  !p
    ? 'border-foreground/15'
    : p.kind === 'auto'
      ? (STATUS_BORDER[p.code as StatusKey] ?? '')
      : tagBorder(p.tagId)

/** One price cell: typed like the hotel writes amounts, kept in minor units (no float ever holds money). */
function PriceCell({
  value,
  currency,
  onChange,
  label
}: {
  value: number | null
  currency: string
  onChange: (minor: number | null) => void
  label: string
}) {
  const f = useFormat()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<string | null>(null)
  // H-08: the cell says what is wrong under itself ("Tutar sayı olmalı", "…sıfırdan küçük olamaz", "…çok büyük").
  const [problem, setProblem] = useState<MoneyProblem | null>(null)
  const { t } = useTranslation()
  const text = draft ?? moneyToText(value, currency, f.locale)
  // QA2a: a text that is not a price leaves no older price behind (the night counts as not written) and stops
  // the form around it from being sent.
  const refuse = (_text: string, why: MoneyProblem): void => {
    setProblem(why)
    if (value !== null) onChange(null)
  }
  useMoneySubmitGuard(inputRef, currency, false, refuse)
  const commit = (): void => {
    if (draft === null) return
    const read = readMoneyText(draft, currency, f.locale)
    if (read.problem) return refuse(draft, read.problem)
    setProblem(null)
    setDraft(null)
    onChange(read.minor)
  }
  return (
    <div className="grid justify-items-end gap-1">
      <Input
        ref={inputRef}
        dir="ltr"
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        aria-invalid={problem ? true : undefined}
        value={text}
        onChange={(e) => {
          setDraft(e.target.value)
          setProblem(null)
        }}
        onBlur={commit}
        className="h-8 w-28 text-end tabular-nums max-md:h-11"
      />
      {problem ? (
        <p className="text-destructive max-w-56 text-end text-xs" role="alert" data-testid="price-cell-error">
          {t(`money.${problem}`, { max: f.money(MAX_AMOUNT_MINOR, currency) })}
        </p>
      ) : null}
    </div>
  )
}

export function NightPriceTable({
  rows,
  currency,
  onChange,
  label,
  testId
}: {
  rows: readonly PriceRow[]
  currency: string
  /** Editable when given. */
  onChange?: (date: LocalDate, minor: number | null) => void
  label: string
  testId?: string
}) {
  const { t } = useTranslation()
  const f = useFormat()
  // The hotel's own name of an automatic status (Settings → Durum etiketleri), as the legend says it.
  const painted = rows.some((r) => r.style)
  const tags = useApiQuery('statusTags.list', {}, { staleTime: 60_000, enabled: painted })
  const statusName = (code: string): string => {
    const tag = tags.data?.find((x) => x.kind === 'auto' && x.code === code)
    return tag ? tagLabel(tag, t) : t(`status.${code as StatusKey}`)
  }
  return (
    <ul className="grid gap-1.5" aria-label={label} data-testid={testId}>
      {rows.map((n) => {
        const fill = n.style?.fill ?? null
        const autoCode = n.style
          ? n.style.fill?.kind === 'auto'
            ? n.style.fill.code
            : n.style.border?.kind === 'auto'
              ? n.style.border.code
              : null
          : null
        return (
          <li
            key={n.date}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-1.5 text-sm"
            data-testid={`night-${n.date}`}
            data-status={autoCode ?? undefined}
          >
            {n.style ? (
              <span
                className={cn(
                  'inline-block size-5 shrink-0 rounded-sm border-2',
                  fillClass(fill),
                  borderClass(n.style.border)
                )}
                aria-hidden
                data-testid={`paint-${n.date}`}
                data-paint={fill ? (fill.kind === 'auto' ? fill.code : `tag:${fill.tagId}`) : 'none'}
              />
            ) : null}
            <span className="w-24 shrink-0 font-medium">{f.dayMonth(n.date)}</span>
            <span className="text-muted-foreground w-10 shrink-0">{f.weekday(n.date)}</span>
            {n.reason && n.reason !== 'base' ? (
              <Badge variant="outline">{t(`booking.price.reason.${n.reason}`)}</Badge>
            ) : null}
            {autoCode ? (
              <span className="text-muted-foreground text-xs">
                {statusName(autoCode)}
                {n.style?.depositIcon ? (
                  <CoinsIcon className="ms-1 inline size-3.5" aria-label={t('booking.price.deposit')} />
                ) : null}
              </span>
            ) : null}
            <span className="ms-auto">
              {onChange ? (
                <PriceCell
                  value={n.priceMinor}
                  currency={currency}
                  onChange={(minor) => onChange(n.date, minor)}
                  label={t('booking.price.nightLabel', { date: f.date(n.date, 'medium') })}
                />
              ) : (
                <span className="font-medium tabular-nums">
                  {n.priceMinor !== null ? <bdi>{f.money(n.priceMinor, currency)}</bdi> : '—'}
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
