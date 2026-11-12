// Closing a room on the calendar (G-38, faz-05 Excel senaryosu "satılmaz blok"): a room, its first and last
// day, not for sale or out of order, and why. A block on the grid opens the same dialog to show it and, when it
// was closed by hand, to lift it (a running block ends today, a future one is cancelled; nothing is deleted).
// Blocks opened by the room status board, an issue or a task end with their cause.
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { LockIcon, WrenchIcon } from 'lucide-react'
import { addDays, type LocalDate } from '@shared/date'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DateInput } from '@/components/date-input'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useCan } from '@/lib/view-as'
import { useBookingMutation } from './booking-api'
import type { GridBlockView, GridRoomView } from './grid-model'

export type BlockDialogState =
  { mode: 'new'; roomId: string | null; date: LocalDate } | { mode: 'view'; block: GridBlockView }

const KINDS = ['oos', 'ooo'] as const
type Kind = (typeof KINDS)[number]

export function BlockDialog({
  state,
  rooms,
  today,
  onOpenChange
}: {
  state: BlockDialogState | null
  rooms: readonly GridRoomView[]
  today: LocalDate
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const isNew = state?.mode === 'new'
  return (
    <ResponsiveDialog
      open={!!state}
      onOpenChange={onOpenChange}
      title={isNew ? t('calendar.block.newTitle') : t('calendar.block.viewTitle')}
      description={isNew ? t('calendar.block.newDescription') : undefined}
      footer={
        isNew ? (
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="block-form" data-testid="block-save">
              {t('calendar.block.save')}
            </Button>
          </>
        ) : undefined
      }
    >
      {state?.mode === 'new' ? (
        <NewBlockForm
          rooms={rooms}
          roomId={state.roomId}
          date={state.date}
          onDone={() => onOpenChange(false)}
        />
      ) : state?.mode === 'view' ? (
        <BlockView block={state.block} rooms={rooms} today={today} onDone={() => onOpenChange(false)} />
      ) : null}
    </ResponsiveDialog>
  )
}

function NewBlockForm({
  rooms,
  roomId: givenRoom,
  date,
  onDone
}: {
  rooms: readonly GridRoomView[]
  roomId: string | null
  date: LocalDate
  onDone: () => void
}) {
  const { t } = useTranslation()
  const [roomId, setRoomId] = useState(givenRoom ?? '')
  const [from, setFrom] = useState<LocalDate>(date)
  // The last closed day (the service takes the first open day: last + 1).
  const [last, setLast] = useState<LocalDate>(date)
  const [kind, setKind] = useState<Kind>('oos')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useBookingMutation('reservations.createBlock', {
    success: t('calendar.block.saved'),
    onSuccess: onDone
  })
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (!roomId) return setError(t('calendar.block.needRoom'))
    if (last < from) return setError(t('calendar.block.badDates'))
    if (!reason.trim()) return setError(t('calendar.block.needReason'))
    setError(null)
    save.mutate({
      roomId,
      dateFrom: from,
      dateTo: addDays(last, 1),
      kind,
      reason: reason.trim(),
      note: note.trim() || null
    })
  }
  return (
    <form id="block-form" className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="block-room">{t('calendar.block.room')}</Label>
        <Select value={roomId} onValueChange={setRoomId}>
          <SelectTrigger id="block-room" className="w-full" data-testid="block-room">
            <SelectValue placeholder={t('calendar.block.pickRoom')} />
          </SelectTrigger>
          <SelectContent>
            {rooms.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {t('calendar.block.roomOption', { room: r.number })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DateInput label={t('calendar.block.from')} value={from} onChange={setFrom} />
      <DateInput label={t('calendar.block.last')} value={last} onChange={setLast} min={from} />
      <div className="grid gap-1.5 sm:col-span-2">
        <span className="text-sm font-medium">{t('calendar.block.kind')}</span>
        <ToggleGroup
          type="single"
          variant="outline"
          value={kind}
          onValueChange={(v) => v && setKind(v as Kind)}
          aria-label={t('calendar.block.kind')}
          className="w-full"
        >
          {KINDS.map((k) => (
            <ToggleGroupItem key={k} value={k} className="flex-1" data-testid={`block-kind-${k}`}>
              {k === 'oos' ? <LockIcon aria-hidden /> : <WrenchIcon aria-hidden />}
              {t(`calendar.block.kinds.${k}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="block-reason">{t('calendar.block.reason')}</Label>
        <Input
          id="block-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('calendar.block.reasonPlaceholder')}
          maxLength={200}
          autoComplete="off"
          data-testid="block-reason"
        />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="block-note">{t('calendar.block.note')}</Label>
        <Textarea
          id="block-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={2}
        />
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2" data-testid="block-error">
          {error}
        </p>
      ) : null}
    </form>
  )
}

function BlockView({
  block,
  rooms,
  today,
  onDone
}: {
  block: GridBlockView
  rooms: readonly GridRoomView[]
  today: LocalDate
  onDone: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const room = rooms.find((r) => r.id === block.roomId)
  const over = block.dateTo <= today
  const running = block.dateFrom < today && !over
  const lift = useBookingMutation('reservations.cancelBlock', {
    success: t('calendar.block.lifted'),
    onSuccess: onDone
  })
  const Icon = block.kind === 'ooo' ? WrenchIcon : LockIcon
  return (
    <div className="grid gap-4" data-testid="block-view">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground text-xs">{t('calendar.block.room')}</dt>
          <dd className="font-medium">{t('calendar.block.roomOption', { room: room?.number ?? '' })}</dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-muted-foreground text-xs">{t('calendar.block.kind')}</dt>
          <dd className="flex items-center gap-1.5 font-medium">
            <Icon className="size-4" aria-hidden />
            {t(`calendar.block.kinds.${block.kind}`)}
          </dd>
        </div>
        <div className="grid gap-0.5 sm:col-span-2">
          <dt className="text-muted-foreground text-xs">{t('calendar.block.days')}</dt>
          <dd className="font-medium">
            {t('calendar.block.range', {
              from: f.date(block.dateFrom as LocalDate),
              to: f.date(addDays(block.dateTo as LocalDate, -1))
            })}
          </dd>
        </div>
        <div className="grid gap-0.5 sm:col-span-2">
          <dt className="text-muted-foreground text-xs">{t('calendar.block.reason')}</dt>
          <dd className="font-medium break-words">{block.closed ? t('tape.roomClosed') : block.reason}</dd>
        </div>
        {block.note ? (
          <div className="grid gap-0.5 sm:col-span-2">
            <dt className="text-muted-foreground text-xs">{t('calendar.block.note')}</dt>
            <dd className="break-words whitespace-pre-wrap">{block.note}</dd>
          </div>
        ) : null}
      </dl>
      {block.closed ? (
        <p className="text-muted-foreground text-sm">{t('calendar.block.roomClosedHint')}</p>
      ) : !block.manual ? (
        <p className="text-muted-foreground text-sm">{t('calendar.block.hasCause')}</p>
      ) : over ? (
        <p className="text-muted-foreground text-sm">{t('calendar.block.over')}</p>
      ) : can('rooms.block', 'edit') ? (
        <div className="grid gap-2">
          <p className="text-muted-foreground text-sm">
            {running ? t('calendar.block.liftRunning') : t('calendar.block.liftFuture')}
          </p>
          <Button
            variant="outline"
            className="justify-self-start"
            disabled={lift.isPending}
            onClick={() => lift.mutate({ id: block.id })}
            data-testid="block-lift"
          >
            {t('calendar.block.lift')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
