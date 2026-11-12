// Step 10 — calendar (G-16, G-72, S-24): highlighted weekdays (Saturday + Sunday unless changed), day closing on or
// off, and the public holidays the calendar will mark. Türkiye's are generated offline when setup finishes: the
// step shows them (this year and next, `setup.options`); another country's are added later in Ayarlar → Takvim.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarHeartIcon, CheckIcon, ChevronDownIcon } from 'lucide-react'
import { addDays, localDate } from '@shared/date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useFormat } from '@/hooks/use-format'
import { localName, type SetupOptions } from './draft'
import { SwitchRow } from './fields'
import { countryName } from './regions'
import type { StepProps } from './step-props'

/** Monday first (tr, en-GB, ru); values are JS weekdays (0 = Sunday), as `calendar.highlightWeekdays` keeps them. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const
/** A Monday, for weekday names. */
const MONDAY = localDate('2026-10-05')
/** The country whose holidays the program generates (G-16). */
const HOLIDAY_COUNTRY = 'TR'

export function CalendarStep({ draft, update, options }: StepProps) {
  const { t } = useTranslation()
  const f = useFormat()
  const country = countryName(draft.hotel.country, f.locale)
  return (
    <div className="grid gap-6">
      <fieldset className="grid gap-2" aria-describedby="setup-highlight-hint">
        <legend className="mb-2 text-sm font-medium">{t('setup.calendar.highlight')}</legend>
        {/* Phone: seven equal columns (a day never wraps to a second line); the tick sits above the name. */}
        <ToggleGroup
          type="multiple"
          variant="outline"
          value={draft.calendar.highlightWeekdays.map(String)}
          onValueChange={(values) =>
            update((d) => ({
              ...d,
              calendar: {
                ...d.calendar,
                highlightWeekdays: WEEKDAYS.filter((day) => values.includes(String(day)))
              }
            }))
          }
          className="flex-wrap max-md:grid max-md:w-full max-md:grid-cols-7"
          data-testid="setup-weekdays"
        >
          {WEEKDAYS.map((day, i) => (
            <ToggleGroupItem
              key={day}
              value={String(day)}
              className="group min-w-18 gap-1.5 max-md:h-14 max-md:w-full max-md:min-w-0 max-md:flex-col max-md:gap-0.5 max-md:px-0"
              aria-label={f.weekday(addDays(MONDAY, i), 'long')}
              data-testid={`setup-weekday-${day}`}
            >
              <CheckIcon
                className="hidden size-3.5 group-data-[state=on]:block max-md:invisible max-md:block max-md:group-data-[state=on]:visible"
                aria-hidden
              />
              {f.weekday(addDays(MONDAY, i))}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p id="setup-highlight-hint" className="text-muted-foreground text-xs">
          {t('setup.calendar.highlightHint')}
        </p>
      </fieldset>
      <SwitchRow
        id="setup-day-closing"
        checked={draft.calendar.dayClosing}
        onChange={(dayClosing) => update((d) => ({ ...d, calendar: { ...d.calendar, dayClosing } }))}
        label={t('setup.calendar.dayClosing')}
        hint={t('setup.calendar.dayClosingHint')}
      />
      <section className="grid gap-3 rounded-lg border p-3" aria-labelledby="setup-holidays-title">
        <div className="flex items-start gap-3">
          <CalendarHeartIcon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="grid gap-1">
            <h3 id="setup-holidays-title" className="text-sm font-medium">
              {t('setup.calendar.holidaysTitle')}
            </h3>
            <p className="text-muted-foreground text-xs leading-relaxed" data-testid="setup-holidays-note">
              {draft.hotel.country === HOLIDAY_COUNTRY
                ? t('setup.calendar.holidays', { country })
                : t('setup.calendar.holidaysOther', { country })}
            </p>
          </div>
        </div>
        {draft.hotel.country === HOLIDAY_COUNTRY && options.holidays.length > 0 ? (
          <HolidayPreview holidays={options.holidays} />
        ) : null}
      </section>
    </div>
  )
}

type Holiday = SetupOptions['holidays'][number]

/** The generated holidays by year: the first year open, the next one folded (about 17 days a year). */
function HolidayPreview({ holidays }: { holidays: readonly Holiday[] }) {
  const { t } = useTranslation()
  const years = [...new Set(holidays.map((h) => h.date.slice(0, 4)))].sort()
  const estimated = holidays.some((h) => h.estimated)
  return (
    <div className="grid gap-2" data-testid="setup-holidays">
      {years.map((year, i) => (
        <HolidayYear
          key={year}
          year={year}
          days={holidays.filter((h) => h.date.startsWith(year)).sort((a, b) => a.date.localeCompare(b.date))}
          initiallyOpen={i === 0}
        />
      ))}
      {estimated ? (
        <p className="text-muted-foreground text-xs">{t('setup.calendar.estimatedHint')}</p>
      ) : null}
    </div>
  )
}

function HolidayYear({
  year,
  days,
  initiallyOpen
}: {
  year: string
  days: readonly Holiday[]
  initiallyOpen: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const [open, setOpen] = useState(initiallyOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="group -ms-2 justify-start"
          data-testid={`setup-holidays-${year}`}
        >
          <ChevronDownIcon
            className="transition-transform group-data-[state=closed]:-rotate-90 rtl:group-data-[state=closed]:rotate-90"
            aria-hidden
          />
          {t('setup.calendar.yearDays', { year, count: days.length })}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="divide-y rounded-md border">
          {days.map((day) => (
            <li
              key={day.date}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
              data-testid="setup-holiday"
            >
              <span className="text-muted-foreground w-36 shrink-0 tabular-nums max-md:w-full">
                {t('setup.calendar.dateLine', {
                  date: f.date(localDate(day.date), 'medium'),
                  weekday: f.weekday(localDate(day.date))
                })}
              </span>
              <span className="min-w-0 flex-1 break-words max-md:basis-full">
                {localName(f.locale, null, day.titleI18n)}
              </span>
              {day.kind === 'half_holiday' ? (
                <Badge variant="outline">{t('setup.calendar.halfDay')}</Badge>
              ) : null}
              {day.estimated ? <Badge variant="secondary">{t('setup.calendar.estimated')}</Badge> : null}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
