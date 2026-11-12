// A day from the grid header (faz-05 madde 5): its holidays, special days and notes, and one new note for the day.
// Notes for many days at once are the bulk dialog; editing and cancelling notes come with Faz 9.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { LocalDate } from '@shared/date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { dayTitle, type GridDayView } from './grid-model'

export function DayDialog({
  date,
  entries,
  onOpenChange,
  onBulk
}: {
  date: LocalDate | null
  entries: readonly GridDayView[]
  onOpenChange: (open: boolean) => void
  /** Opens the bulk dialog starting on this day. */
  onBulk: (date: LocalDate) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const canEdit = can('calendar.notes', 'edit')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const add = useApiMutation('calendar.addNote', {
    invalidates: ['reservations.grid', 'calendar.days'],
    onSuccess: () => {
      toast.success(t('calendar.dayNotes.saved'))
      setTitle('')
      setNote('')
    },
    onError: (e) => setError(t((e.messageKey ?? 'errors.internal') as 'errors.internal'))
  })
  const close = () => {
    setTitle('')
    setNote('')
    setError(null)
    onOpenChange(false)
  }
  const save = () => {
    if (!date || !title.trim()) return
    setError(null)
    add.mutate({ title: title.trim(), note: note.trim() || null, target: { mode: 'single', date } })
  }

  return (
    <ResponsiveDialog
      open={date !== null}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      title={date ? f.date(date, 'full') : ''}
      description={t('calendar.dayNotes.description')}
      footer={
        <>
          {canEdit && date ? (
            <Button variant="outline" className="sm:me-auto" onClick={() => onBulk(date)}>
              {t('calendar.bulk.open')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={close}>
            {t('common.close')}
          </Button>
          {canEdit ? (
            <Button type="submit" form="day-note-form" disabled={!title.trim() || add.isPending}>
              {t('calendar.dayNotes.add')}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="grid gap-4">
        {entries.length ? (
          <ul className="divide-y rounded-lg border" data-testid="day-entries">
            {entries.map((e) => (
              <li key={`${e.id}-${e.date}`} className="grid gap-1 px-3 py-2 text-sm">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium break-words">{dayTitle(e, f.locale)}</span>
                  <Badge variant="outline">{t(`calendar.dayNotes.kind.${e.kind}`)}</Badge>
                  {e.estimated ? <Badge variant="secondary">{t('settings.calendar.estimated')}</Badge> : null}
                </span>
                {e.note ? <span className="text-muted-foreground break-words">{e.note}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{t('calendar.dayNotes.empty')}</p>
        )}
        {canEdit ? (
          <form
            id="day-note-form"
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="day-note-title">{t('calendar.dayNotes.title')}</Label>
              <Input
                id="day-note-title"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('calendar.dayNotes.titlePlaceholder')}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="day-note-text">{t('calendar.dayNotes.note')}</Label>
              <Textarea
                id="day-note-text"
                value={note}
                maxLength={2000}
                rows={2}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
          </form>
        ) : null}
      </div>
    </ResponsiveDialog>
  )
}
