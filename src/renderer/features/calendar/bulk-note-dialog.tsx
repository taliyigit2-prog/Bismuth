// Bulk calendar notes (faz-05 madde 5): one note on chosen weekdays of a range ("her cumartesi"), on every day of a
// range, or on a pasted list of dates — written in one go by the calendar service (`calendar.addNote`).
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CALENDAR_BULK_MAX, parsePastedDates } from '@shared/contract/operations'
import { addDays, localDate, weekday, type LocalDate } from '@shared/date'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DateInput } from '@/components/date-input'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation } from '@/lib/api/hooks'
import { countDays, type NoteMode } from './grid-model'

type Mode = NoteMode
const MODES: Mode[] = ['weekdays', 'range', 'list']
const KINDS = ['note', 'special', 'event'] as const
type Kind = (typeof KINDS)[number]

/** A Monday: weekdays are listed Monday first and stored as 0 = Sunday … 6 = Saturday. */
const MONDAY = localDate('2026-10-05')
const WEEK = Array.from({ length: 7 }, (_, i) => addDays(MONDAY, i))

export function BulkNoteDialog({
  start,
  onOpenChange
}: {
  /** First day offered; null = closed. */
  start: LocalDate | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const day = start ?? MONDAY
  const [mode, setMode] = useState<Mode>('weekdays')
  const [kind, setKind] = useState<Kind>('note')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [from, setFrom] = useState<LocalDate>(day)
  const [to, setTo] = useState<LocalDate>(addDays(day, 27))
  const [weekdays, setWeekdays] = useState<number[]>([weekday(day)])
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const pasted = useMemo(() => parsePastedDates(text), [text])
  const count = countDays(mode, from, to, weekdays, pasted.dates)
  const add = useApiMutation('calendar.addNote', {
    invalidates: ['reservations.grid', 'calendar.days'],
    onSuccess: ({ count: written }) => {
      toast.success(t('calendar.bulk.saved', { count: written }))
      onOpenChange(false)
    },
    onError: (e) =>
      setError(t((e.messageKey ?? 'errors.internal') as 'errors.internal', { max: CALENDAR_BULK_MAX }))
  })
  const tooMany = count > CALENDAR_BULK_MAX
  const ready = !!title.trim() && count > 0 && !tooMany && (mode === 'list' || to >= from)

  const save = () => {
    if (!ready) return
    setError(null)
    const target =
      mode === 'list'
        ? { mode, dates: pasted.dates }
        : mode === 'range'
          ? { mode, from, to }
          : { mode, from, to, weekdays }
    add.mutate({ kind, title: title.trim(), note: note.trim() || null, target })
  }

  return (
    <ResponsiveDialog
      open={start !== null}
      onOpenChange={onOpenChange}
      title={t('calendar.bulk.title')}
      description={t('calendar.bulk.description')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="bulk-note-form" disabled={!ready || add.isPending}>
            {t('calendar.bulk.save', { count })}
          </Button>
        </>
      }
    >
      <form
        id="bulk-note-form"
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="bulk-title">{t('calendar.dayNotes.title')}</Label>
          <Input
            id="bulk-title"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('calendar.bulk.titlePlaceholder')}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bulk-kind">{t('calendar.bulk.kind')}</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <SelectTrigger id="bulk-kind" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`calendar.dayNotes.kind.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>{t('calendar.bulk.which')}</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={mode}
            onValueChange={(v) => v && setMode(v as Mode)}
            className="w-full flex-wrap"
          >
            {MODES.map((m) => (
              <ToggleGroupItem key={m} value={m} className="h-auto min-h-9 flex-1 py-1.5 whitespace-normal">
                {t(`calendar.bulk.mode.${m}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        {mode === 'list' ? (
          <div className="grid gap-1.5">
            <Label htmlFor="bulk-dates">{t('calendar.bulk.dates')}</Label>
            <Textarea
              id="bulk-dates"
              value={text}
              rows={3}
              dir="ltr"
              onChange={(e) => setText(e.target.value)}
              placeholder={t('calendar.bulk.datesPlaceholder')}
            />
            {pasted.invalid.length ? (
              <p className="text-destructive text-sm" role="alert">
                {t('calendar.bulk.notDates', { items: pasted.invalid.slice(0, 5).join(', ') })}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <DateInput label={t('calendar.bulk.from')} value={from} onChange={setFrom} />
            <DateInput label={t('calendar.bulk.to')} value={to} onChange={setTo} min={from} />
          </div>
        )}
        {mode === 'weekdays' ? (
          <div className="grid gap-1.5">
            <Label>{t('calendar.bulk.weekdays')}</Label>
            <ToggleGroup
              type="multiple"
              variant="outline"
              value={weekdays.map(String)}
              onValueChange={(v) => setWeekdays(v.map(Number))}
              className="w-full flex-wrap"
            >
              {WEEK.map((d) => (
                <ToggleGroupItem
                  key={d}
                  value={String(weekday(d))}
                  aria-label={f.weekday(d, 'long')}
                  className="min-w-11 flex-1"
                >
                  {f.weekday(d)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="bulk-note">{t('calendar.dayNotes.note')}</Label>
          <Textarea
            id="bulk-note"
            value={note}
            rows={2}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <p className="text-muted-foreground text-sm" aria-live="polite" data-testid="bulk-count">
          {tooMany
            ? t('errors.calendarTooManyDates', { max: CALENDAR_BULK_MAX })
            : t('calendar.bulk.count', { count })}
        </p>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}
