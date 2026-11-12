// The weekday buttons of the repeating-task forms (the hotel's own task, the new-task dialog): Monday first, each
// one a 44 px target on the phone. Seven 44 px buttons need 308 px, more than the wizard's card (212 px at a 320 px
// phone) or a bottom sheet at 320 px gives, so below `md` they wrap into two rows (four and three); from `md` they
// are one row of seven.
import { addDays, localDate } from '@shared/date'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useFormat } from '@/hooks/use-format'
import { WEEK_ORDER } from './own-task'

/** A Sunday: weekday names come from the dates of that week (0 = Sunday … 6 = Saturday). */
const SUNDAY = localDate('2026-10-04')

export function WeekdayPicker({
  value,
  onChange,
  itemTestId,
  ...aria
}: {
  /** The chosen days (0 = Sunday … 6 = Saturday). */
  value: readonly number[]
  onChange: (days: number[]) => void
  itemTestId?: (day: number) => string
  id?: string
  'aria-labelledby'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  'data-testid'?: string
}) {
  const f = useFormat()
  return (
    <ToggleGroup
      type="multiple"
      variant="outline"
      spacing={1}
      value={value.map(String)}
      onValueChange={(days) => onChange(days.map(Number))}
      className="grid w-full grid-cols-7 max-md:grid-cols-4"
      {...aria}
    >
      {WEEK_ORDER.map((d) => (
        <ToggleGroupItem
          key={d}
          value={String(d)}
          aria-label={f.weekday(addDays(SUNDAY, d), 'long')}
          className="min-w-0 px-0"
          data-testid={itemTestId?.(d)}
        >
          {f.weekday(addDays(SUNDAY, d))}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
