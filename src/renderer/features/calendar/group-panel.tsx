// Group panel (P17b, G-194, S-101, S-106): the rooms of a group booking with the guest of each room, the money
// (one folio or a folio per room, as the group was opened) and the bulk actions — check in, check out, a note on
// every room, cancel the group. A bulk check-in or check-out is one transaction in the service: every chosen room
// or none. Opens from the new-reservation form after "Grup rezervasyonu" and from a reservation's group button.
// Desktop: right-hand sheet; phone: bottom sheet, the rooms as a list.
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LogInIcon, LogOutIcon, MessageSquarePlusIcon, UsersIcon, XCircleIcon } from 'lucide-react'
import { localDateOf } from '@shared/date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { ErrorState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import {
  requestGroupPanel,
  requestPanel,
  useBookingMutation,
  useGroup,
  useGroupPanelRequest,
  type GroupView
} from './booking-api'
import { NOTE_LOG_MAX } from './booking-limits'

type GroupRoom = GroupView['rooms'][number]

export function GroupPanel({
  onOpenReservation
}: {
  /** The calendar screen's own way to show a reservation; without it the panel asks through `requestPanel`. */
  onOpenReservation?: (reservationId: string) => void
}) {
  const isMobile = useIsMobile()
  const id = useGroupPanelRequest()
  return (
    <Sheet open={!!id} onOpenChange={(open) => !open && requestGroupPanel(null)}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'gap-0 overflow-y-auto',
          isMobile ? 'max-h-[92dvh] rounded-t-xl' : 'w-full sm:max-w-xl'
        )}
        data-testid="group-panel"
      >
        {id ? <GroupBody id={id} onOpenReservation={onOpenReservation} /> : null}
      </SheetContent>
    </Sheet>
  )
}

function GroupBody({
  id,
  onOpenReservation
}: {
  id: string
  onOpenReservation: ((reservationId: string) => void) | undefined
}) {
  const { t } = useTranslation()
  const query = useGroup(id)
  if (query.isPending)
    return (
      <>
        <SheetHeader className="border-b">
          <SheetTitle>{t('common.loading')}</SheetTitle>
          <SheetDescription className="sr-only">{t('booking.group.panel.loading')}</SheetDescription>
        </SheetHeader>
        <div role="status" aria-busy className="grid gap-3 p-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </>
    )
  if (query.isError)
    return (
      <>
        <SheetHeader className="border-b">
          <SheetTitle>{t('booking.group.panel.title')}</SheetTitle>
          <SheetDescription className="sr-only">{t('errors.loadFailed')}</SheetDescription>
        </SheetHeader>
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    )
  return <Group view={query.data} onOpenReservation={onOpenReservation} />
}

function Group({
  view,
  onOpenReservation
}: {
  view: GroupView
  onOpenReservation: ((reservationId: string) => void) | undefined
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const today = localDateOf(new Date())
  const mayEdit = can('calendar', 'edit') && !view.voided
  const [picked, setPicked] = useState<ReadonlySet<string> | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const stays = view.rooms.flatMap((r) => r.stays.filter((s) => s.status !== 'cancelled'))
  const dueIn = new Set(
    stays.filter((s) => s.status === 'planned' && s.checkIn <= today).map((s) => s.stayId)
  )
  const inHouse = new Set(stays.filter((s) => s.status === 'in_house').map((s) => s.stayId))
  const selectable = new Set([...dueIn, ...inHouse])
  // Until somebody ticks a room, every room that can be acted on counts as chosen.
  const chosen = picked ?? selectable
  const toCheckIn = [...dueIn].filter((s) => chosen.has(s))
  const toCheckOut = [...inHouse].filter((s) => chosen.has(s))
  const reset = (): void => setPicked(null)
  const checkIn = useBookingMutation('booking.checkInMany', {
    success: t('booking.group.toast.checkedIn'),
    onSuccess: reset
  })
  const checkOut = useBookingMutation('booking.checkOutMany', {
    success: t('booking.group.toast.checkedOut'),
    onSuccess: reset
  })
  const toggle = (stayId: string, on: boolean): void => {
    const next = new Set(chosen)
    if (on) next.add(stayId)
    else next.delete(stayId)
    setPicked(next)
  }
  const allChosen = selectable.size > 0 && [...selectable].every((s) => chosen.has(s))
  const busy = checkIn.isPending || checkOut.isPending
  const total = view.totals
  return (
    <>
      <SheetHeader className="gap-2 border-b text-start">
        <div className="flex flex-wrap items-center gap-2 pe-8">
          <UsersIcon className="size-5 shrink-0" aria-hidden />
          <SheetTitle className="text-lg break-words" data-testid="group-name">
            {view.name}
          </SheetTitle>
          {view.voided ? <Badge variant="outline">{t('booking.group.panel.voided')}</Badge> : null}
        </div>
        <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{t('booking.group.panel.rooms', { count: view.rooms.length })}</span>
          {view.leader ? <span>{t('booking.group.panel.leader', { name: view.leader.name })}</span> : null}
          <span data-testid="group-folio-mode">{t(`booking.group.panel.folio.${view.folioMode}`)}</span>
        </SheetDescription>
        {mayEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!toCheckIn.length || busy}
              onClick={() => checkIn.mutate({ groupId: view.id, stayIds: toCheckIn })}
              data-testid="group-check-in"
            >
              <LogInIcon aria-hidden />
              {t('booking.group.panel.checkIn')} ({toCheckIn.length})
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!toCheckOut.length || busy}
              onClick={() => checkOut.mutate({ groupId: view.id, stayIds: toCheckOut })}
              data-testid="group-check-out"
            >
              <LogOutIcon aria-hidden />
              {t('booking.group.panel.checkOut')} ({toCheckOut.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setNoteOpen(true)}
              data-testid="group-note-open"
            >
              <MessageSquarePlusIcon aria-hidden />
              {t('booking.group.panel.note')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => setCancelOpen(true)}
              data-testid="group-cancel-open"
            >
              <XCircleIcon aria-hidden />
              {t('booking.group.panel.cancel')}
            </Button>
          </div>
        ) : null}
        {mayEdit ? <p className="text-muted-foreground text-xs">{t('booking.group.panel.atomic')}</p> : null}
      </SheetHeader>

      <div className="grid gap-4 p-4">
        <section aria-label={t('booking.group.panel.roomsHeading')} className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t('booking.group.panel.roomsHeading')}</h3>
            {mayEdit && selectable.size > 1 ? (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setPicked(allChosen ? new Set() : new Set(selectable))}
                data-testid="group-select-all"
              >
                {t('booking.group.panel.selectAll')}
              </Button>
            ) : null}
          </div>
          <ul className="grid gap-2" data-testid="group-rooms">
            {view.rooms.map((room) => (
              <RoomRow
                key={room.reservationId}
                room={room}
                today={today}
                canPick={mayEdit}
                chosen={chosen}
                selectable={selectable}
                onToggle={toggle}
                showBalance={view.folioMode === 'per_room'}
                onOpenReservation={onOpenReservation}
              />
            ))}
          </ul>
        </section>

        {total ? (
          <section className="grid gap-1 rounded-lg border p-3 text-sm" data-testid="group-total">
            <h3 className="font-semibold">{t('booking.group.panel.total')}</h3>
            <p className="flex justify-between gap-2">
              <span>{t('booking.group.panel.total')}</span>
              <bdi className="tabular-nums">{f.money(total.chargesMinor, total.currency)}</bdi>
            </p>
            {total.balanceMinor !== null ? (
              <p className="flex justify-between gap-2 font-semibold">
                <span>{t('booking.group.panel.balance')}</span>
                <bdi className="tabular-nums" data-testid="group-balance">
                  {f.money(total.balanceMinor, total.currency)}
                </bdi>
              </p>
            ) : null}
          </section>
        ) : (
          <p className="text-muted-foreground text-xs">{t('booking.group.panel.mixedCurrency')}</p>
        )}

        <section className="grid gap-2" aria-label={t('booking.group.panel.notes')}>
          <h3 className="text-sm font-semibold">{t('booking.group.panel.notes')}</h3>
          {view.notes.length ? (
            <ul className="grid gap-1 text-sm">
              {view.notes.map((n) => (
                <li key={n.id} className="rounded-md border px-2 py-1 break-words">
                  {n.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">{t('booking.group.panel.noNotes')}</p>
          )}
        </section>
      </div>

      <GroupNoteDialog groupId={view.id} open={noteOpen} onOpenChange={setNoteOpen} />
      <GroupCancelDialog groupId={view.id} open={cancelOpen} onOpenChange={setCancelOpen} />
    </>
  )
}

function RoomRow({
  room,
  today,
  canPick,
  chosen,
  selectable,
  onToggle,
  showBalance,
  onOpenReservation
}: {
  room: GroupRoom
  today: string
  canPick: boolean
  chosen: ReadonlySet<string>
  selectable: ReadonlySet<string>
  onToggle: (stayId: string, on: boolean) => void
  showBalance: boolean
  onOpenReservation: ((reservationId: string) => void) | undefined
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const id = useId()
  const live = room.stays.filter((s) => s.status !== 'cancelled')
  return (
    <li className="rounded-lg border p-3" data-testid={`group-room-${room.reservationId}`}>
      {live.length ? (
        live.map((s) => {
          const pickable = canPick && selectable.has(s.stayId)
          const future = s.status === 'planned' && s.checkIn > today
          const rowId = `${id}-${s.stayId}`
          return (
            <div key={s.stayId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Checkbox
                id={rowId}
                checked={pickable && chosen.has(s.stayId)}
                disabled={!pickable}
                onCheckedChange={(c) => onToggle(s.stayId, c === true)}
                aria-label={t('booking.group.panel.selectRoom', { room: s.roomNumber })}
                data-testid={`group-pick-${s.roomNumber}`}
              />
              <Label htmlFor={rowId} className="min-w-0 flex-1 gap-2 font-normal">
                <span className="font-semibold tabular-nums">{s.roomNumber}</span>
                <span className="truncate font-medium" data-testid={`group-guest-${s.roomNumber}`}>
                  {room.guestName}
                </span>
              </Label>
              <Badge variant="outline">{t(`calendar.resStatus.${room.status}`)}</Badge>
              <span className="text-muted-foreground basis-full ps-7 text-xs tabular-nums">
                {f.dayMonth(s.checkIn)} – {f.dayMonth(s.checkOut)}
                {future ? ` · ${t('booking.group.panel.notDue')}` : ''}
              </span>
            </div>
          )
        })
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{room.guestName}</span>
          <Badge variant="outline">{t(`calendar.resStatus.${room.status}`)}</Badge>
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 ps-7">
        {showBalance && room.balanceMinor !== null ? (
          <bdi className="text-sm tabular-nums">
            {t('booking.group.panel.balance')}: {f.money(room.balanceMinor, room.currency)}
          </bdi>
        ) : (
          <span />
        )}
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            requestGroupPanel(null)
            if (onOpenReservation) onOpenReservation(room.reservationId)
            else requestPanel(room.reservationId)
          }}
          data-testid={`group-open-${room.reservationId}`}
        >
          {t('booking.group.panel.openReservation')}
        </Button>
      </div>
    </li>
  )
}

function GroupNoteDialog({
  groupId,
  open,
  onOpenChange
}: {
  groupId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [text, setText] = useState('')
  const add = useBookingMutation('booking.addGroupNote', {
    success: t('booking.group.toast.noteAdded'),
    onSuccess: () => {
      setText('')
      onOpenChange(false)
    }
  })
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('booking.group.noteDialog.title')}
      description={t('booking.group.noteDialog.description')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="group-note-form"
            disabled={!text.trim() || add.isPending}
            data-testid="group-note-save"
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        id="group-note-form"
        className="grid gap-1.5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) add.mutate({ groupId, text: text.trim() })
        }}
      >
        <Label htmlFor={id}>{t('booking.group.noteDialog.label')}</Label>
        <Textarea
          id={id}
          rows={3}
          value={text}
          maxLength={NOTE_LOG_MAX}
          onChange={(e) => setText(e.target.value)}
          data-testid="group-note-text"
        />
      </form>
    </ResponsiveDialog>
  )
}

function GroupCancelDialog({
  groupId,
  open,
  onOpenChange
}: {
  groupId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const cancel = useBookingMutation('booking.cancelGroup', {
    success: t('booking.group.toast.cancelled'),
    onSuccess: () => onOpenChange(false)
  })
  const bad = tried && reason.trim().length < 3
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('booking.group.cancelDialog.title')}
      description={t('booking.group.cancelDialog.body')}
      focusFirstOnPhone={false}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="group-cancel-form"
            variant="destructive"
            disabled={cancel.isPending}
            data-testid="group-cancel-confirm"
          >
            {t('booking.group.panel.cancel')}
          </Button>
        </>
      }
    >
      <form
        id="group-cancel-form"
        className="grid gap-1.5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          setTried(true)
          if (reason.trim().length >= 3) cancel.mutate({ groupId, reason: reason.trim() })
        }}
      >
        <Label htmlFor={id}>{t('booking.group.cancelDialog.reason')}</Label>
        <Textarea
          id={id}
          rows={2}
          value={reason}
          maxLength={200}
          aria-invalid={bad}
          onChange={(e) => setReason(e.target.value)}
          data-testid="group-cancel-reason"
        />
        {bad ? (
          <p role="alert" className="text-destructive text-xs">
            {t('errors.reasonRequired')}
          </p>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}
