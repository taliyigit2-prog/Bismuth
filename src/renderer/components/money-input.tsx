// Amount field (G-131): typed as the hotel writes it ("2.800" or "2.800,50"), kept as integer minor units;
// the currency sits next to it. Parsing is the shared parseMoney, so no float ever holds money.
// QA2a: a text that is not an amount (letters, a minus sign, more than MAX_AMOUNT_MINOR) never leaves an older
// amount in the form: the field hands the form `null`, says what is wrong under itself and stops its form from
// being sent until the text is fixed. Every money field of the program is this component, so all of them behave so.
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_AMOUNT_MINOR, money, parseMoney, toDecimalString } from '@shared/money'
import { formatNumber } from '@shared/format'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useFormat } from '@/hooks/use-format'

export interface MoneyValue {
  amountMinor: number | null
  currency: string
}

/** Minor units → "2.800,50" (the field shows decimals only when there are some). */
export function moneyToText(
  amountMinor: number | null,
  currency: string,
  locale: 'tr' | 'en' | 'ru'
): string {
  if (amountMinor === null) return ''
  // Exact decimal text from the money module (yasak 6: no money arithmetic outside src/shared/money.ts).
  const [whole = '0', fraction = ''] = toDecimalString(money(amountMinor, currency)).split('.')
  const grouped = `${whole.startsWith('-') ? '-' : ''}${formatNumber(Number(whole.replace('-', '')), locale)}`
  const sep = locale === 'en' ? '.' : ','
  return /[1-9]/.test(fraction) ? `${grouped}${sep}${fraction}` : grouped
}

/** "2.800,50" / "2800.50" → minor units; null when empty, NaN when not a number, Infinity when beyond any amount. */
export function textToMoney(text: string, currency: string, locale: 'tr' | 'en' | 'ru'): number | null {
  const trimmed = text.trim().replace(/\s/g, '')
  if (!trimmed) return null
  const decimal = locale === 'en' ? '.' : ','
  try {
    // parseMoney reads the other mark itself: "1.250" thousands, "1250.5" decimal, "1,250.50" in tr an error.
    return parseMoney(trimmed, currency, decimal).amountMinor
  } catch (error) {
    // H-24: a well-formed amount too big for a safe integer is "too large", not "not a number".
    return error instanceof RangeError && error.message === 'money: overflow'
      ? Number.POSITIVE_INFINITY
      : Number.NaN
  }
}

export type MoneyProblem = 'invalid' | 'negative' | 'tooLarge'

/** What a typed text means: minor units (null = empty) or why it is not an amount the form may take. */
export function readMoneyText(
  text: string,
  currency: string,
  locale: 'tr' | 'en' | 'ru',
  allowNegative = false
): { minor: number | null; problem: MoneyProblem | null } {
  const minor = textToMoney(text, currency, locale)
  if (minor === null) return { minor: null, problem: null }
  if (Number.isNaN(minor)) return { minor: null, problem: 'invalid' }
  if (minor < 0 && !allowNegative) return { minor: null, problem: 'negative' }
  if (Math.abs(minor) > MAX_AMOUNT_MINOR) return { minor: null, problem: 'tooLarge' }
  return { minor, problem: null }
}

/** A money value the form may send: written, a number, not below zero, within the limit. */
export const isAmount = (value: MoneyValue): value is { amountMinor: number; currency: string } =>
  value.amountMinor !== null &&
  Number.isSafeInteger(value.amountMinor) &&
  value.amountMinor >= 0 &&
  value.amountMinor <= MAX_AMOUNT_MINOR

/**
 * The form around an amount field is not sent while the field's text is not an amount (a click on Kaydet blurs the
 * field first, Enter does not): this listens on the form element itself, before React's submit handler higher up,
 * and hands the refused text to `refuse` (QA2a). Also used by bare amount cells (a night's price).
 */
export function useMoneySubmitGuard(
  inputRef: RefObject<HTMLInputElement | null>,
  currency: string,
  allowNegative: boolean,
  refuse: (text: string, why: MoneyProblem) => void
): void {
  const f = useFormat()
  const latest = useRef(refuse)
  useEffect(() => {
    latest.current = refuse
  })
  useEffect(() => {
    const input = inputRef.current
    const form = input?.form
    if (!input || !form) return
    const guard = (e: Event): void => {
      const read = readMoneyText(input.value, currency, f.locale, allowNegative)
      if (!read.problem) return
      e.preventDefault()
      e.stopImmediatePropagation()
      latest.current(input.value, read.problem)
      input.focus()
    }
    form.addEventListener('submit', guard)
    return () => form.removeEventListener('submit', guard)
  }, [inputRef, currency, f.locale, allowNegative])
}

export function MoneyInput({
  value,
  onChange,
  currencies,
  label,
  id: givenId,
  error,
  allowNegative = false
}: {
  value: MoneyValue
  onChange: (value: MoneyValue) => void
  currencies: readonly string[]
  label: string
  id?: string
  /** The form's own message about this amount ("Tutarı yazın"): shown under the field, which turns red. */
  error?: string | null
  allowNegative?: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const autoId = useId()
  const id = givenId ?? autoId
  const inputRef = useRef<HTMLInputElement>(null)
  // While typing (and while the text is wrong) the field holds the draft; otherwise it shows what the form holds.
  // The draft remembers which amount it stood for, so a form that puts another amount in (another employee, a
  // reset) shows that amount instead of an old draft.
  // `alt`: a refused text also stands for the amount the form keeps when it ignores the null (a night price that
  // falls back to its suggestion): the field must keep the typed text and its message then, not show that amount.
  const [draft, setDraft] = useState<{ text: string; of: number | null; alt?: number | null } | null>(null)
  const [problem, setProblem] = useState<MoneyProblem | null>(null)
  const own = draft !== null && (draft.of === value.amountMinor || draft.alt === value.amountMinor)
  const text = own ? draft.text : moneyToText(value.amountMinor, value.currency, f.locale)
  const shownProblem = own ? problem : null
  const message = shownProblem
    ? t(`money.${shownProblem}`, { max: f.money(MAX_AMOUNT_MINOR, value.currency) })
    : (error ?? null)

  const refuse = (typed: string, why: MoneyProblem): void => {
    setProblem(why)
    setDraft({ text: typed, of: null, alt: value.amountMinor })
    if (value.amountMinor !== null) onChange({ ...value, amountMinor: null })
  }
  const commit = (): void => {
    if (!own || !draft) return
    const read = readMoneyText(draft.text, value.currency, f.locale, allowNegative)
    if (read.problem) return refuse(draft.text, read.problem)
    setProblem(null)
    setDraft(null)
    onChange({ ...value, amountMinor: read.minor })
  }

  useMoneySubmitGuard(inputRef, value.currency, allowNegative, refuse)

  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex gap-2" dir="ltr">
        <Input
          ref={inputRef}
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={text}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? `${id}-error` : undefined}
          onChange={(e) => {
            setDraft({ text: e.target.value, of: value.amountMinor })
            setProblem(null)
          }}
          onBlur={commit}
          className="text-end tabular-nums"
        />
        <Select value={value.currency} onValueChange={(c) => onChange({ ...value, currency: c })}>
          <SelectTrigger className="w-24 shrink-0" aria-label={t('money.currency')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {currencies.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {message ? (
        <p id={`${id}-error`} className="text-destructive text-xs" role="alert" data-testid="money-error">
          {message}
        </p>
      ) : null}
    </div>
  )
}
