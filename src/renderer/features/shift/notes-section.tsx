// Notes (G-95 b, c): "kendime not" only its writer ever sees (not even the owner; the service answers "not found"
// to anyone else, §4.9-12), with an optional reminder time that brings it to the top here once it comes; the board
// is for everyone with shift notes, pinned notes first. Notes are closed or taken off the board, never deleted.
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  ArchiveIcon,
  BellIcon,
  BellRingIcon,
  CheckIcon,
  LockIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  StickyNoteIcon
} from 'lucide-react'
import type { ProcedureOutput } from '@shared/contract'
import { localDateOf, today as todayOf, type LocalDate } from '@shared/date'
import { datePart, localDateTimeOf, timePart, type LocalDateTime } from '@shared/domain/local-datetime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DateInput } from '@/components/date-input'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { SectionCard } from '@/components/section-card'
import { normalizeClock, TimeInput } from '@/components/time-input'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation } from '@/lib/api/hooks'
import { cn } from '@/lib/utils'
import { useErrorText } from '../tasks/task-data'

export type NoteView = ProcedureOutput<'notes.list'>[number]

const dayOf = (iso: string): LocalDate => localDateOf(new Date(iso))
const NOTE_QUERIES = ['notes.list', 'notes.dueReminders'] as const

function NoteDialog({
  kind,
  onOpenChange
}: {
  kind: NoteView['kind']
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const errorText = useErrorText()
  const today = todayOf()
  const [text, setText] = useState('')
  const [flag, setFlag] = useState(false)
  const [day, setDay] = useState<LocalDate>(today)
  const [time, setTime] = useState('09:00')
  const [tried, setTried] = useState(false)
  const add = useApiMutation('notes.add', { invalidates: NOTE_QUERIES })
  const missing = text.trim().length === 0
  const reminds = kind === 'personal' && flag
  const clock = normalizeClock(time)
  const badTime = reminds && clock === null
  const save = (): void => {
    setTried(true)
    if (missing || badTime || add.isPending) return
    add.mutate(
      {
        kind,
        text: text.trim(),
        remindAt: reminds && clock ? `${day}T${clock}` : null,
        pinned: kind === 'board' && flag
      },
      {
        onSuccess: () => {
          toast.success(t('shift.noteSaved'))
          onOpenChange(false)
        },
        onError: (error) => void toast.error(errorText(error))
      }
    )
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={onOpenChange}
      title={t(kind === 'personal' ? 'shift.personal.add' : 'shift.board.add')}
      description={t(kind === 'personal' ? 'shift.personal.private' : 'shift.board.hint')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={id} disabled={add.isPending} data-testid="note-save">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        id={id}
        noValidate
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        onKeyDown={(e) => {
          // Ctrl/Cmd+Enter saves from the text area; Enter in a one-line field saves.
          const multiline = e.target instanceof HTMLTextAreaElement
          if (
            e.key === 'Enter' &&
            (e.ctrlKey || e.metaKey || (!multiline && e.target instanceof HTMLInputElement))
          ) {
            e.preventDefault()
            save()
          }
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-text`}>{t('common.note')}</Label>
          <Textarea
            id={`${id}-text`}
            rows={3}
            maxLength={5000}
            value={text}
            autoFocus
            onChange={(e) => setText(e.target.value)}
            aria-invalid={tried && missing}
          />
          {tried && missing ? (
            <p role="alert" className="text-destructive text-xs">
              {t('shift.noteRequired')}
            </p>
          ) : null}
        </div>
        <Label className="flex min-h-11 cursor-pointer items-center gap-3 font-normal">
          <Switch checked={flag} onCheckedChange={setFlag} />
          {t(kind === 'personal' ? 'shift.personal.remind' : 'shift.board.pinNew')}
        </Label>
        {kind === 'personal' && flag ? (
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <DateInput label={t('common.date')} value={day} onChange={setDay} min={today} />
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-time`}>{t('shift.personal.time')}</Label>
              <TimeInput
                id={`${id}-time`}
                value={time}
                onChange={(v) => setTime(v)}
                aria-invalid={(tried && badTime) || undefined}
                aria-describedby={tried && badTime ? `${id}-time-msg` : undefined}
              />
              {tried && badTime ? (
                <p id={`${id}-time-msg`} role="alert" className="text-destructive text-xs">
                  {t('timeInput.invalid')}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}

function NoteMeta({ note }: { note: NoteView }) {
  const f = useFormat()
  return (
    <p className="text-muted-foreground mt-1 text-xs">
      {note.createdByName ? `${note.createdByName} · ` : ''}
      {f.dayMonth(dayOf(note.createdAt))} {f.time(note.createdAt)}
    </p>
  )
}

function useNoteState() {
  const { t } = useTranslation()
  const errorText = useErrorText()
  const mutation = useApiMutation('notes.setState', { invalidates: NOTE_QUERIES })
  const run = (
    input: { id: string; done?: boolean; pinned?: boolean; archived?: boolean },
    toastKey?: string
  ) =>
    mutation.mutate(input, {
      onSuccess: () => (toastKey ? void toast.success(t(toastKey as 'shift.noteSaved')) : undefined),
      onError: (error) => void toast.error(errorText(error))
    })
  return { run, pending: mutation.isPending }
}

export function PersonalNotes({ notes }: { notes: NoteView[] }) {
  const { t } = useTranslation()
  const f = useFormat()
  const [adding, setAdding] = useState(false)
  const state = useNoteState()
  const now = localDateTimeOf(new Date())
  const isDue = (n: NoteView): boolean => n.remindAt !== null && n.remindAt <= now
  // Notes whose reminder time has come first, then the newest.
  const mine = notes
    .filter((n) => n.kind === 'personal')
    .sort((a, b) => Number(isDue(b)) - Number(isDue(a)) || b.createdAt.localeCompare(a.createdAt))
  return (
    <SectionCard
      title={t('shift.personal.title')}
      icon={StickyNoteIcon}
      count={mine.length}
      testId="notes-personal"
      action={
        <Button
          size="sm"
          variant="ghost"
          className="max-md:min-h-11"
          aria-label={t('shift.personal.add')}
          onClick={() => setAdding(true)}
        >
          <PlusIcon aria-hidden />
          {t('common.add')}
        </Button>
      }
    >
      <p className="text-muted-foreground mb-3 flex items-center gap-1.5 text-xs">
        <LockIcon className="size-3.5 shrink-0" aria-hidden />
        {t('shift.personal.private')}
      </p>
      {mine.length ? (
        <ul className="grid gap-2">
          {mine.map((n) => (
            <li
              key={n.id}
              className={cn(
                'flex items-start gap-2 rounded-lg border p-3 text-sm',
                isDue(n) && 'border-warning bg-warning/10'
              )}
              data-testid={`note-${n.id}`}
            >
              <div className="min-w-0 flex-1">
                {isDue(n) ? (
                  <Badge variant="outline" className="border-warning text-foreground mb-1 gap-1">
                    <BellRingIcon aria-hidden />
                    {t('shift.personal.due')}
                  </Badge>
                ) : null}
                <p className="break-words whitespace-pre-line">{n.text}</p>
                {n.remindAt ? (
                  <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
                    <BellIcon className="size-3.5 shrink-0" aria-hidden />
                    {t('shift.personal.remindAt', {
                      date: f.dayMonth(datePart(n.remindAt as LocalDateTime)),
                      time: timePart(n.remindAt as LocalDateTime)
                    })}
                  </p>
                ) : (
                  <NoteMeta note={n} />
                )}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="max-md:size-11"
                    disabled={state.pending}
                    aria-label={t('shift.personal.closeOne', { text: n.text.slice(0, 40) })}
                    onClick={() => state.run({ id: n.id, done: true }, 'shift.personal.closed')}
                  >
                    <CheckIcon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('shift.personal.close')}</TooltipContent>
              </Tooltip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('shift.personal.empty')}</p>
      )}
      <p className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
        <BellIcon className="size-3.5 shrink-0" aria-hidden />
        {t('shift.personal.remindHint')}
      </p>
      {adding ? <NoteDialog kind="personal" onOpenChange={setAdding} /> : null}
    </SectionCard>
  )
}

export function BoardNotes({ notes, canEdit }: { notes: NoteView[]; canEdit: boolean }) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const state = useNoteState()
  const board = notes
    .filter((n) => n.kind === 'board')
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt))
  return (
    <SectionCard
      title={t('shift.board.title')}
      icon={PinIcon}
      count={board.length}
      testId="notes-board"
      action={
        canEdit ? (
          <Button
            size="sm"
            variant="ghost"
            className="max-md:min-h-11"
            aria-label={t('shift.board.add')}
            onClick={() => setAdding(true)}
          >
            <PlusIcon aria-hidden />
            {t('common.add')}
          </Button>
        ) : undefined
      }
    >
      {board.length ? (
        <ul className="grid gap-2" aria-label={t('shift.board.title')}>
          {board.map((n) => (
            <li
              key={n.id}
              className={cn('flex items-start gap-2 rounded-lg border p-3 text-sm', n.pinned && 'bg-accent')}
              data-testid={`note-${n.id}`}
            >
              <div className="min-w-0 flex-1">
                {n.pinned ? (
                  <Badge variant="outline" className="mb-1 gap-1">
                    <PinIcon aria-hidden />
                    {t('shift.board.pinned')}
                  </Badge>
                ) : null}
                <p className="break-words whitespace-pre-line">{n.text}</p>
                <NoteMeta note={n} />
              </div>
              {canEdit ? (
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="max-md:size-11"
                    disabled={state.pending}
                    aria-pressed={n.pinned}
                    aria-label={t(n.pinned ? 'shift.board.unpin' : 'shift.board.pin')}
                    onClick={() => state.run({ id: n.id, pinned: !n.pinned })}
                  >
                    {n.pinned ? <PinOffIcon /> : <PinIcon />}
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="max-md:size-11"
                        disabled={state.pending}
                        aria-label={t('shift.board.removeOne', { text: n.text.slice(0, 40) })}
                        onClick={() => state.run({ id: n.id, archived: true }, 'shift.board.removed')}
                      >
                        <ArchiveIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('shift.board.remove')}</TooltipContent>
                  </Tooltip>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('shift.board.empty')}</p>
      )}
      {adding ? <NoteDialog kind="board" onOpenChange={setAdding} /> : null}
    </SectionCard>
  )
}
