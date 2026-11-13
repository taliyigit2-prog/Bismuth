// Phone number with a country code (misafir, rehber): stored as "+90 532 000 00 00"; digits only in the field,
// always left-to-right (.claude/rules/ui.md). Turkish numbers are grouped 3-3-2-2 as people read them.
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

import { DIAL_CODES, splitPhoneInput } from '@shared/phone'

export { DIAL_CODES }

/** The code select's value for a number written with a country code the list does not have. */
const INTL = 'intl'

export interface PhoneValue {
  code: string
  number: string
}

/** "+90 532 000 00 00" → { code: '90', number: '5320000000' } (the one reading of a phone: `@shared/phone`). */
export function parsePhone(text: string | null | undefined): PhoneValue {
  return splitPhoneInput(text, '90')
}

/** Grouping for display: TR 3-3-2-2, others 3-3-4. */
export function formatPhone({ code, number }: PhoneValue): string {
  const n = number.replace(/\D/g, '')
  // A country code the list does not have: the digits as typed, "+" in front (E.164).
  if (!code) return n ? `+${n}` : ''
  const groups = code === '90' ? [3, 3, 2, 2] : [3, 3, 4]
  const parts: string[] = []
  let i = 0
  for (const g of groups) {
    if (i >= n.length) break
    parts.push(n.slice(i, i + g))
    i += g
  }
  if (i < n.length) parts.push(n.slice(i))
  return `+${code} ${parts.join(' ')}`.trim()
}

export function PhoneField({
  value,
  onChange,
  label,
  invalid
}: {
  value: PhoneValue
  onChange: (value: PhoneValue) => void
  label: string
  invalid?: boolean
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex gap-2" dir="ltr">
        <Select
          value={value.code || INTL}
          onValueChange={(code) => onChange({ ...value, code: code === INTL ? '' : code })}
        >
          <SelectTrigger className="w-24 shrink-0" aria-label={t('phone.countryCode')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {value.code === '' ? <SelectItem value={INTL}>+</SelectItem> : null}
            {DIAL_CODES.map((c) => (
              <SelectItem key={c} value={c}>
                +{c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          aria-invalid={invalid || undefined}
          placeholder={t('phone.placeholder')}
          value={
            value.code
              ? formatPhone(value).replace(`+${value.code} `, '').replace(`+${value.code}`, '')
              : formatPhone(value)
          }
          onChange={(e) => onChange(splitPhoneInput(e.target.value, value.code))}
          className="tabular-nums"
        />
      </div>
    </div>
  )
}
