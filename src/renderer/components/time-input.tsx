// Clock field (faz-15 madde 11): our own 24-hour "HH:MM" box instead of <input type="time">, whose look follows the
// computer's locale (an English (US) Windows showed "02:00 PM"). Typed with the keyboard: "1430" becomes 14:30 at
// once, "930" becomes 09:30 and "9" 09:00 when the field is left or Enter is pressed; ↑/↓ step the hour (caret on
// the hours) or the minute, PageUp/PageDown an hour. Always left to right with Latin digits; 44 px on the phone
// (the shared Input). The value the caller keeps is the text: a complete time is always "HH:MM", anything else is
// what was typed, so the caller's own check (`clockTime`) reports it.
import {
  useRef,
  type ClipboardEvent,
  type ComponentProps,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent
} from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/

/** True for a complete 24-hour time "HH:MM". */
export const isClock = (text: string): boolean => CLOCK.test(text)

const pad = (n: number): string => String(n).padStart(2, '0')

/**
 * What the person meant, as "HH:MM", or null when it is not a time: "9" → 09:00, "14" → 14:00, "930" → 09:30,
 * "1430" → 14:30, "9:5" → 09:05, "14.30" → 14:30. Hours 0–23, minutes 0–59.
 */
export function normalizeClock(text: string): string | null {
  const s = text.trim().replace(/[.,\s-]/g, ':')
  let h: number
  let m: number
  const parts = /^(\d{1,2}):(\d{1,2})$/.exec(s)
  if (parts) {
    h = Number(parts[1])
    m = Number(parts[2])
  } else if (/^\d{1,4}$/.test(s)) {
    if (s.length <= 2) {
      h = Number(s)
      m = 0
    } else {
      h = Number(s.slice(0, s.length - 2))
      m = Number(s.slice(-2))
    }
  } else return null
  if (h > 23 || m > 59) return null
  return `${pad(h)}:${pad(m)}`
}

/** The time `by` minutes later (negative: earlier), around midnight. */
export function stepClock(text: string, by: number): string {
  const base = normalizeClock(text) ?? '00:00'
  const total = Number(base.slice(0, 2)) * 60 + Number(base.slice(3)) + by
  const wrapped = ((total % 1440) + 1440) % 1440
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`
}

/**
 * While typing: only digits and one separator, five characters; four digits in a row become "HH:MM". The length is
 * kept here, not with `maxLength`: Chromium's length check could swallow text that replaces a selected time.
 */
export function typedClock(text: string): string {
  const cleaned = text.replace(/[.,\s-]/g, ':').replace(/[^\d:]/g, '')
  const [first = '', ...rest] = cleaned.split(':')
  const value = (rest.length ? `${first}:${rest.join('')}` : first).slice(0, 5)
  if (/^\d{4}$/.test(value)) return normalizeClock(value) ?? value
  return value
}

/**
 * What a pasted text becomes (the whole field after the paste): a time with seconds ("14:30:00") is taken without
 * them, spaces around are dropped (" 9:00"); text with letters ("2:30 PM", "14h30") is kept as it is — not a time,
 * so the form says so — rather than quietly losing the letters and becoming another time (02:30).
 */
export function pastedClock(text: string): string {
  const trimmed = text.trim()
  const seconds = /^(\d{1,2}[:.]\d{1,2})[:.]\d{1,2}$/.exec(trimmed)
  if (seconds) return typedClock(seconds[1] ?? '')
  if (/[^\d:.,\s-]/.test(trimmed)) return trimmed.slice(0, 16)
  return typedClock(trimmed)
}

type Props = Omit<ComponentProps<'input'>, 'type' | 'value' | 'onChange' | 'defaultValue'> & {
  value: string
  onChange: (value: string) => void
}

export function TimeInput({
  value,
  onChange,
  className,
  onBlur,
  onFocus,
  onMouseUp,
  onKeyDown,
  onPaste,
  placeholder,
  ...props
}: Props) {
  const { t } = useTranslation()
  // A click into the field selects the whole time, so typing replaces it (the box holds five characters).
  const justFocused = useRef(false)

  const settle = (): string => {
    const clock = normalizeClock(value)
    if (clock && clock !== value) onChange(clock)
    return clock ?? value
  }

  const keyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    const input = e.currentTarget
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      const up = e.key === 'ArrowUp' || e.key === 'PageUp'
      // The caret on the hours (or Page keys) moves an hour, on the minutes a minute.
      const hours = e.key === 'PageUp' || e.key === 'PageDown' || (input.selectionStart ?? 0) < 3
      const next = stepClock(value, (up ? 1 : -1) * (hours ? 60 : 1))
      onChange(next)
      const caret = hours ? 2 : 5
      requestAnimationFrame(() => input.setSelectionRange(caret, caret))
    } else if (e.key === 'Enter') {
      // "930" + Enter: the form sends "09:30" — the value settles first, then the form is sent again.
      const clock = normalizeClock(value)
      if (clock && clock !== value && input.form) {
        e.preventDefault()
        // The form's own Enter handlers would send the old text: they wait for the settled value.
        e.stopPropagation()
        onChange(clock)
        const form = input.form
        setTimeout(() => {
          // The same rule as every form's Enter (submitOnEnter): a save button that is off sends nothing.
          const button = [...form.elements].find(
            (c): c is HTMLButtonElement | HTMLInputElement =>
              (c instanceof HTMLButtonElement || c instanceof HTMLInputElement) && c.type === 'submit'
          )
          if (!button) form.requestSubmit()
          else if (!button.disabled) form.requestSubmit(button)
        })
      }
    }
  }

  const paste = (e: ClipboardEvent<HTMLInputElement>): void => {
    onPaste?.(e)
    if (e.defaultPrevented) return
    const input = e.currentTarget
    const start = input.selectionStart ?? 0
    const end = input.selectionEnd ?? input.value.length
    const whole = input.value.slice(0, start) + e.clipboardData.getData('text') + input.value.slice(end)
    e.preventDefault()
    onChange(pastedClock(whole))
  }

  const focus = (e: FocusEvent<HTMLInputElement>): void => {
    onFocus?.(e)
    e.currentTarget.select()
    justFocused.current = true
  }

  const mouseUp = (e: MouseEvent<HTMLInputElement>): void => {
    onMouseUp?.(e)
    // The mouse button going up would put the caret back where it was pressed.
    if (justFocused.current) e.preventDefault()
    justFocused.current = false
  }

  const blur = (e: FocusEvent<HTMLInputElement>): void => {
    settle()
    onBlur?.(e)
  }

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      dir="ltr"
      placeholder={placeholder ?? t('timeInput.placeholder')}
      value={value}
      onChange={(e) => {
        // A sixth character is not taken (a full field keeps its time; select it to type a new one).
        if (e.target.value.replace(/[^\d:.,\s-]/g, '').length > 5) return
        // A space before the hour is not a separator (" 9:00").
        onChange(typedClock(e.target.value.trimStart()))
      }}
      onKeyDown={keyDown}
      onPaste={paste}
      onFocus={focus}
      onMouseUp={mouseUp}
      onBlur={blur}
      data-time-input=""
      className={cn('tabular-nums', className)}
    />
  )
}
