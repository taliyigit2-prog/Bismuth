// Colour of a calendar day (G-40 "tür/renk"). The hotel picks a note's colour itself (#rrggbb in the row), so it
// cannot be a fixed class: one small <style> block maps each colour in view to a class that sets --note-color
// (the way user-theme.ts carries the hotel's status colours; no inline style attribute). A day without its own
// colour takes its kind's token colour.
import type { CalendarEntryDto } from '@shared/contract/procedures/today'
import { cn } from '@/lib/utils'

const HEX = /^#[0-9a-f]{6}$/i

type Kind = CalendarEntryDto['kind']

const KIND_DOT: Record<Kind, string> = {
  holiday: 'bg-destructive',
  half_holiday: 'bg-warning',
  special: 'bg-primary',
  event: 'bg-info',
  note: 'bg-muted-foreground'
}

const colorClass = (hex: string): string => `note-color-${hex.slice(1).toLowerCase()}`

/** The CSS of every distinct valid colour in `colors` (nothing when there is none). */
function noteColorCss(colors: readonly (string | null)[]): string {
  const distinct = [
    ...new Set(colors.filter((c): c is string => !!c && HEX.test(c)).map((c) => c.toLowerCase()))
  ]
  return distinct.map((c) => `.${colorClass(c)}{--note-color:${c}}`).join('')
}

export function NoteColorStyles({ colors }: { colors: readonly (string | null)[] }) {
  const css = noteColorCss(colors)
  return css ? <style data-testid="note-colors">{css}</style> : null
}

/** A round marker in the day's colour (its own, or its kind's). */
export function NoteDot({
  kind,
  color,
  className
}: {
  kind: Kind
  color: string | null
  className?: string
}) {
  const own = color && HEX.test(color)
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-2.5 shrink-0 rounded-full',
        own ? cn(colorClass(color), 'bg-(--note-color)') : KIND_DOT[kind],
        className
      )}
    />
  )
}
