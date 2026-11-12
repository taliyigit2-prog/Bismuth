// "Takvim" (G-16, G-72, S-24, K-44): the weekdays the calendar highlights (default Saturday and Sunday; the hotel
// picks any), the nights that take the weekend price (default Friday and Saturday nights; apart from the highlight),
// day closing on or off, and this year's public holidays as the program generates them (read only: notes and
// special days are added on the Takvim screen).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDaysIcon } from 'lucide-react'
import type { SettingsPatch, SettingsValues } from '@shared/contract'
import { addDays, localDate, today as todayOf } from '@shared/date'
import { CALENDAR_MIN_START_YEAR } from '@shared/domain/calendar-range'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { QueryView } from '@/components/query-view'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { SwitchRow } from './room-dialogs'
import { useLocalName } from './use-admin'

/** A Monday: the week is drawn Monday first (tr/en-GB/ru), stored as 0 = Sunday … 6 = Saturday. */
const MONDAY = localDate('2026-10-05')
const WEEK = Array.from({ length: 7 }, (_, i) => addDays(MONDAY, i))
const weekdayOf = (i: number): number => (i + 1) % 7

function Holidays({ year }: { year: string }) {
  const { t } = useTranslation()
  const f = useFormat()
  const nameOf = useLocalName()
  const query = useApiQuery('calendar.days', { from: `${year}-01-01`, to: `${year}-12-31` })
  return (
    <QueryView
      query={query}
      isEmpty={(days) => !days.some((d) => d.kind === 'holiday' || d.kind === 'half_holiday')}
      empty={{
        icon: CalendarDaysIcon,
        title: t('settings.calendar.holidaysEmpty'),
        body: t('settings.calendar.holidaysHelp')
      }}
    >
      {(days) => {
        const holidays = days
          .filter((d) => d.kind === 'holiday' || d.kind === 'half_holiday')
          .sort((a, b) => a.date.localeCompare(b.date))
        return (
          <ul className="divide-y rounded-lg border" data-testid="holiday-list">
            {holidays.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="w-36 shrink-0 tabular-nums max-md:w-full">
                  {t('settings.calendar.dateLine', {
                    date: f.date(localDate(d.date), 'medium'),
                    weekday: f.weekday(localDate(d.date))
                  })}
                </span>
                <span className="min-w-0 flex-1 font-medium break-words max-md:basis-full">
                  {nameOf(d.titleI18n, d.title)}
                </span>
                {d.kind === 'half_holiday' ? (
                  <Badge variant="outline">{t('settings.calendar.halfDay')}</Badge>
                ) : null}
                {d.estimated ? <Badge variant="secondary">{t('settings.calendar.estimated')}</Badge> : null}
              </li>
            ))}
          </ul>
        )
      }}
    </QueryView>
  )
}

/** Seven weekday buttons, Monday first; the value is 0 = Sunday … 6 = Saturday, sorted. */
function WeekToggle({
  value,
  onChange,
  disabled,
  label,
  testId
}: {
  value: readonly number[]
  onChange: (days: number[]) => void
  disabled: boolean
  label: string
  testId: string
}) {
  const f = useFormat()
  return (
    <ToggleGroup
      type="multiple"
      variant="outline"
      disabled={disabled}
      value={value.map(String)}
      onValueChange={(v) => onChange(v.map(Number).sort((a, b) => a - b))}
      aria-label={label}
      // Phone: the seven days share the row (no day drops to a second line).
      className="flex-wrap max-md:grid max-md:w-full max-md:grid-cols-7"
      data-testid={testId}
    >
      {WEEK.map((d, i) => (
        <ToggleGroupItem
          key={d}
          value={String(weekdayOf(i))}
          aria-label={f.weekday(d, 'long')}
          className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground min-w-12 data-[state=on]:font-semibold max-md:min-h-11 max-md:min-w-0 max-md:px-0"
        >
          {f.weekday(d)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/**
 * "Takvim başlangıç yılı" (G-31, K-46): how far back the calendar goes. Empty = from the oldest stay's year; an
 * oldest stay before the chosen year still shows (the earlier one wins).
 */
function StartYear({
  value,
  disabled,
  onSave
}: {
  value: number | null
  disabled: boolean
  onSave: (year: number | null) => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState(value === null ? '' : String(value))
  const thisYear = Number(todayOf().slice(0, 4))
  const trimmed = text.trim()
  const year = trimmed === '' ? null : Number(trimmed)
  const valid =
    year === null || (/^\d{4}$/.test(trimmed) && year >= CALENDAR_MIN_START_YEAR && year <= thisYear)
  const changed = year !== value
  return (
    <form
      className="flex flex-wrap items-start gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid && changed) onSave(year)
      }}
    >
      <div className="grid gap-1.5 max-md:w-full">
        <Input
          id="calendar-start-year"
          inputMode="numeric"
          dir="ltr"
          autoComplete="off"
          maxLength={4}
          value={text}
          disabled={disabled}
          placeholder={t('settings.calendar.startYearEmpty')}
          aria-invalid={!valid}
          aria-describedby={valid ? undefined : 'calendar-start-year-error'}
          onChange={(e) => setText(e.target.value)}
          className="w-40 tabular-nums max-md:w-full max-md:text-base"
          data-testid="calendar-start-year"
        />
        {valid ? null : (
          <p id="calendar-start-year-error" className="text-destructive text-xs" role="alert">
            {t('settings.calendar.startYearInvalid', { min: CALENDAR_MIN_START_YEAR, max: thisYear })}
          </p>
        )}
      </div>
      {disabled ? null : (
        <Button type="submit" variant="outline" disabled={!valid || !changed} className="max-md:w-full">
          {t('common.save')}
        </Button>
      )}
    </form>
  )
}

export function CalendarSection({
  values,
  onSave
}: {
  values: SettingsValues
  onSave: (patch: SettingsPatch, announce?: boolean) => void
}) {
  const { t } = useTranslation()
  const can = useCan()
  const canEdit = can('settings', 'edit')
  const canSeeDays = can('calendar') || can('calendar.notes') || can('today')
  const year = todayOf().slice(0, 4)
  const highlight = values['calendar.highlightWeekdays']
  const weekendNights = values['pricing.weekendNights']

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.calendar.highlight')}</CardTitle>
          <CardDescription>{t('settings.calendar.highlightHelp')}</CardDescription>
        </CardHeader>
        <CardContent>
          <WeekToggle
            value={highlight}
            disabled={!canEdit}
            label={t('settings.calendar.highlight')}
            onChange={(v) => onSave({ 'calendar.highlightWeekdays': v })}
            testId="highlight-weekdays"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.calendar.weekendNights')}</CardTitle>
          <CardDescription>{t('settings.calendar.weekendNightsHelp')}</CardDescription>
        </CardHeader>
        <CardContent>
          <WeekToggle
            value={weekendNights}
            disabled={!canEdit}
            label={t('settings.calendar.weekendNights')}
            onChange={(v) => onSave({ 'pricing.weekendNights': v })}
            testId="weekend-nights"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <label htmlFor="calendar-start-year">{t('settings.calendar.startYear')}</label>
          </CardTitle>
          <CardDescription>{t('settings.calendar.startYearHelp')}</CardDescription>
        </CardHeader>
        <CardContent>
          <StartYear
            key={values['calendar.startYear'] ?? 'none'}
            value={values['calendar.startYear']}
            disabled={!canEdit}
            onSave={(year) => onSave({ 'calendar.startYear': year }, true)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.calendar.closingTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <SwitchRow
            id="day-closing"
            label={t('settings.calendar.closing')}
            help={t('settings.calendar.closingHelp')}
            checked={values['businessDay.closingEnabled']}
            disabled={!canEdit}
            onChange={(v) => onSave({ 'businessDay.closingEnabled': v }, true)}
          />
        </CardContent>
      </Card>

      {canSeeDays ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.calendar.holidaysTitle', { year })}</CardTitle>
            <CardDescription>{t('settings.calendar.holidaysHelp')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Holidays year={year} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
