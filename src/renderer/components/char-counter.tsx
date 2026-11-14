// The count under a text field that has a length limit (H-19, H-25, H-44): the browser stops typing and cuts a paste
// at `maxLength` without a word, so the field says it instead — "118 / 120" from 80 % of the limit, and a red line
// when the limit is reached ("En çok 120 karakter yazabilirsiniz."). `Input` and `Textarea` show it themselves for
// any controlled field with a `maxLength`.
import { useTranslation } from 'react-i18next'
import { useFormat } from '@/hooks/use-format'

/** Share of the limit from which the count is shown. */
const SHOW_FROM = 0.8
/** Codes, PINs and room numbers (a few characters) are filled on purpose: no count for them. */
const MIN_LIMIT = 20

export function CharCounter({ length, max, id }: { length: number; max: number; id?: string }) {
  const { t } = useTranslation()
  const f = useFormat()
  if (max < MIN_LIMIT || length < Math.ceil(max * SHOW_FROM)) return null
  const full = length === max
  // Over the limit only when something bypassed `maxLength`; the form's own field error says why, the count stays red.
  const over = length > max
  return (
    <p
      id={id}
      data-slot="char-counter"
      data-full={full || over || undefined}
      className={
        full || over
          ? 'text-destructive text-xs tabular-nums'
          : 'text-muted-foreground text-end text-xs tabular-nums'
      }
      role={full ? 'alert' : undefined}
    >
      {full ? t('form.limitReached', { max: f.number(max) }) : `${f.number(length)} / ${f.number(max)}`}
    </p>
  )
}
