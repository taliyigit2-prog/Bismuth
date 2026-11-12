// Add or change a calendar day (G-40, S-24): one day, a range, chosen weekdays of a range ("her cumartesi") or a
// pasted list of dates, in one go; a kind (note, special day, event, holiday), an optional colour and a yearly
// repeat for a single day. Editing a generated holiday makes it the hotel's own row, kept when holidays are
// generated again (K-04).
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { TAG_PALETTE } from '@shared/color'
import { CALENDAR_BULK_MAX, parsePastedDates } from '@shared/contract/operations'
import type { CalendarEntryDto } from '@shared/contract/procedures/today'
import { addDays, localDate, weekday, type LocalDate } from '@shared/date'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DateInput } from '@/components/date-input'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation } from '@/lib/api/hooks'
import { cn } from '@/lib/utils'
import { NoteColorStyles, NoteDot } from './note-color'
import { NOTE_KINDS, NOTE_MODES, countDays, type NoteKind, type NoteMode } from './notes-model'

/** A Monday: weekdays are listed Monday first and stored as 0 = Sunday … 6 = Saturday. */
const MONDAY = localDate('2026-10-05')
const WEEK = Array.from({ length: 7 }, (_, i) => addDays(MONDAY, i))

const INVALIDATES = ['calendarNotes.list', 'calendar.days', 'reservations.grid', 'today.summary'] as const

export type NoteDialogState = { mode: 'add'; start: LocalDate } | { mode: 'edit'; day: CalendarEntryDto }

export function NoteDialog({ state, onClose }: { state: NoteDialogState; onClose: () => void }) {
  const { t } = useTranslation()
  const f = useFormat()
  const formId = useId()
  const editing = state.mode === 'edit' ? state.day : null
  const start = state.mode === 'add' ? state.start : (editing?.date as LocalDate)
  const [title, setTitle] = useState(editing ? (editing.titleI18n?.[f.locale] ?? editing.title ?? '') : '')
  const [kind, setKind] = useState<NoteKind>(editing?.kind ?? 'note')
  const [note, setNote] = useState(editing?.note ?? '')
  /** null = the kind's own colour; otherwise #rrggbb (a swatch of the palette or any colour picked). */
  const [color, setColor] = useState<string | null>(editing?.color ?? null)
  const [yearly, setYearly] = useState(editing?.recurringYearly ?? false)
  const [mode, setMode] = useState<NoteMode>('single')
  const [from, setFrom] = useState<LocalDate>(start)
  const [to, setTo] = useState<LocalDate>(addDays(start, 27))
  const [weekdays, setWeekdays] = useState<number[]>([weekday(start)])
  const [text, setText] = useState('')
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pasted = useMemo(() => parsePastedDates(text), [text])
  const count = editing ? 1 : countDays(mode, from, to, weekdays, pasted.dates)
  const tooMany = count > CALENDAR_BULK_MAX
  const failed = (e: { messageKey?: string }) =>
    setError(t((e.messageKey ?? 'errors.internal') as 'errors.internal', { max: CALENDAR_BULK_MAX }))
  const add = useApiMutation('calendarNotes.add', {
    invalidates: INVALIDATES,
    onSuccess: ({ count: written }) => {
      toast.success(t('calendarNotes.saved', { count: written }))
      onClose()
    },
    onError: failed
  })
  const edit = useApiMutation('calendarNotes.edit', {
    invalidates: INVALIDATES,
    onSuccess: () => {
      toast.success(t('calendarNotes.updated'))
      onClose()
    },
    onError: failed
  })
  const pending = add.isPending || edit.isPending
  const titleMissing = !title.trim()
  const ready =
    !titleMissing && count > 0 && !tooMany && (mode !== 'range' && mode !== 'weekdays' ? true : to >= from)

  const save = () => {
    setTried(true)
    if (!ready || pending) return
    setError(null)
    const common = {
      kind,
      title: title.trim(),
      note: note.trim() || null,
      color
    }
    if (editing) {
      const titleChanged = title.trim() !== (editing.titleI18n?.[f.locale] ?? editing.title ?? '')
      // Only what changed: a generated holiday saved as it is stays generated (the yearly check keeps it right).
      const patch = {
        ...(kind !== editing.kind ? { kind } : {}),
        ...(titleChanged ? { title: title.trim() } : {}),
        ...(common.note !== (editing.note ?? null) ? { note: common.note } : {}),
        ...(common.color !== editing.color ? { color: common.color } : {}),
        ...(yearly !== editing.recurringYearly ? { recurringYearly: yearly } : {}),
        ...(from !== editing.date ? { date: from } : {})
      }
      if (Object.keys(patch).length === 0) {
        toast.success(t('calendarNotes.updated'))
        onClose()
        return
      }
      edit.mutate({ id: editing.id, patch })
      return
    }
    const target =
      mode === 'single'
        ? { mode, date: from }
        : mode === 'list'
          ? { mode, dates: pasted.dates }
          : mode === 'range'
            ? { mode, from, to }
            : { mode, from, to, weekdays }
    add.mutate({ ...common, recurringYearly: mode === 'single' && yearly, target })
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => (o ? null : onClose())}
      title={editing ? t('calendarNotes.editTitle') : t('calendarNotes.addTitle')}
      description={editing ? t('calendarNotes.editDescription') : t('calendarNotes.addDescription')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={pending} data-testid="note-save">
            {editing || mode === 'single' ? t('common.save') : t('calendarNotes.saveDays', { count })}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-title`}>{t('calendarNotes.titleLabel')}</Label>
          <Input
            id={`${formId}-title`}
            value={title}
            maxLength={120}
            autoComplete="off"
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('calendarNotes.titlePlaceholder')}
            aria-invalid={tried && titleMissing}
          />
          {tried && titleMissing ? (
            <p role="alert" className="text-destructive text-xs">
              {t('calendarNotes.titleRequired')}
            </p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-kind`}>{t('calendarNotes.kindLabel')}</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as NoteKind)}>
            <SelectTrigger id={`${formId}-kind`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTE_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`calendarNotes.kind.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {editing ? null : (
          <div className="grid gap-1.5">
            <Label>{t('calendarNotes.which')}</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={mode}
              onValueChange={(v) => v && setMode(v as NoteMode)}
              className="w-full flex-wrap"
              data-testid="note-mode"
            >
              {NOTE_MODES.map((m) => (
                <ToggleGroupItem key={m} value={m} className="h-auto min-h-9 flex-1 py-1.5 whitespace-normal">
                  {t(`calendarNotes.mode.${m}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}

        {editing || mode === 'single' ? (
          <DateInput label={t('calendarNotes.day')} value={from} onChange={setFrom} />
        ) : mode === 'list' ? (
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-dates`}>{t('calendarNotes.dates')}</Label>
            <Textarea
              id={`${formId}-dates`}
              value={text}
              rows={3}
              dir="ltr"
              onChange={(e) => setText(e.target.value)}
              placeholder={t('calendarNotes.datesPlaceholder')}
            />
            {pasted.invalid.length ? (
              <p className="text-destructive text-sm" role="alert">
                {t('calendarNotes.notDates', { items: pasted.invalid.slice(0, 5).join(', ') })}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <DateInput label={t('calendarNotes.from')} value={from} onChange={setFrom} />
            <DateInput label={t('calendarNotes.to')} value={to} onChange={setTo} min={from} />
          </div>
        )}

        {!editing && mode === 'weekdays' ? (
          <div className="grid gap-1.5">
            <Label>{t('calendarNotes.weekdays')}</Label>
            <ToggleGroup
              type="multiple"
              variant="outline"
              value={weekdays.map(String)}
              onValueChange={(v) => setWeekdays(v.map(Number))}
              className="w-full flex-wrap"
              data-testid="note-weekdays"
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

        {editing || mode === 'single' ? (
          <Label className="hover:bg-accent/50 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 font-normal">
            <Switch checked={yearly} onCheckedChange={setYearly} data-testid="note-yearly" />
            <span className="grid gap-0.5">
              <span className="font-medium">{t('calendarNotes.yearly')}</span>
              <span className="text-muted-foreground text-xs">{t('calendarNotes.yearlyHint')}</span>
            </span>
          </Label>
        ) : null}

        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-note`}>{t('calendarNotes.noteLabel')}</Label>
          <Textarea
            id={`${formId}-note`}
            value={note}
            rows={2}
            maxLength={2000}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="grid gap-1.5">
          <Label id={`${formId}-color`}>{t('calendarNotes.color')}</Label>
          <NoteColorStyles colors={[...TAG_PALETTE, color]} />
          <div
            className="flex flex-wrap items-center gap-2"
            role="radiogroup"
            aria-labelledby={`${formId}-color`}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              role="radio"
              aria-checked={color === null}
              className={cn(color === null && 'ring-ring ring-2')}
              onClick={() => setColor(null)}
            >
              <NoteDot kind={kind} color={null} />
              {t('calendarNotes.kindColor')}
            </Button>
            {TAG_PALETTE.map((c) => (
              <Button
                key={c}
                type="button"
                variant="outline"
                size="icon-sm"
                role="radio"
                aria-checked={color === c}
                aria-label={t('calendarNotes.swatch', { n: TAG_PALETTE.indexOf(c) + 1 })}
                className={cn(color === c && 'ring-ring ring-2')}
                onClick={() => setColor(c)}
              >
                <NoteDot kind={kind} color={c} className="size-4" />
              </Button>
            ))}
            <Input
              type="color"
              value={color ?? TAG_PALETTE[0]}
              onChange={(e) => setColor(e.target.value)}
              aria-label={t('calendarNotes.otherColor')}
              className="h-9 w-14 cursor-pointer p-1 max-md:h-11"
            />
          </div>
        </div>

        {editing ? null : (
          <p className="text-muted-foreground text-sm" aria-live="polite" data-testid="note-count">
            {tooMany
              ? t('errors.calendarTooManyDates', { max: CALENDAR_BULK_MAX })
              : t('calendarNotes.count', { count })}
          </p>
        )}
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}
