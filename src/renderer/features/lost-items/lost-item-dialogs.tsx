// Lost-and-found forms (G-55): log a found item (day, room or place, what, who found it, where it is kept, a note,
// optional photos), hand it to its owner (to whom, when), dispose of it (with the reason) or put it back to kept
// (a mistake, with the reason). Nothing is deleted: the record stays with its new status and the audit trail keeps
// who changed it and when.
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { localDateTimeOf } from '@shared/domain/local-datetime'
import type { LocalDate } from '@shared/date'
import type { LostItemView } from '@shared/contract/procedures/contacts'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DateInput } from '@/components/date-input'
import { PhotoPicker, useUploadPhotos } from '@/components/record-photos'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { RoomPicker, type PickerRoom } from '@/components/room-picker'
import { TimeInput } from '@/components/time-input'
import { limitsOf, maxLengthOf } from '@shared/contract/limits'
import { lostItemInputSchema, lostItemReturnSchema } from '@shared/contract/operations'
import { reasonSchema } from '@shared/contract/expenses'
import { useAdminMutation } from '../settings/use-admin'

const LOST = limitsOf(lostItemInputSchema)
const RETURN = limitsOf(lostItemReturnSchema)
const REASON_MAX = maxLengthOf(reasonSchema)

const PLACE_KINDS = ['room', 'area'] as const
type PlaceKind = (typeof PLACE_KINDS)[number]
const INVALIDATE = ['lostItems.list'] as const

function Problem({ show, children, id }: { show: boolean; children: string; id?: string }) {
  return show ? (
    <p id={id} role="alert" className="text-destructive text-xs">
      {children}
    </p>
  ) : null
}

export function NewLostItemDialog({
  rooms,
  today,
  onClose
}: {
  rooms: PickerRoom[]
  today: LocalDate
  onClose: () => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [day, setDay] = useState<LocalDate>(today)
  const [kind, setKind] = useState<PlaceKind>(rooms.length ? 'room' : 'area')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [place, setPlace] = useState('')
  const [what, setWhat] = useState('')
  const [foundBy, setFoundBy] = useState('')
  const [storage, setStorage] = useState('')
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [tried, setTried] = useState(false)
  const upload = useUploadPhotos()
  const create = useAdminMutation('lostItems.create', {
    invalidate: INVALIDATE,
    success: t('lostItems.saved')
  })
  const problems = {
    what: what.trim().length === 0,
    place: kind === 'room' ? !roomId : place.trim().length === 0,
    storage: storage.trim().length === 0
  }
  const submit = (e: FormEvent): void => {
    e.preventDefault()
    setTried(true)
    if (Object.values(problems).some(Boolean)) return
    create.mutate(
      {
        // Today: the minute it is logged; an earlier day: that day.
        foundAt: day === today ? localDateTimeOf(new Date()) : day,
        roomId: kind === 'room' ? roomId : null,
        locationText: kind === 'area' ? place.trim() : null,
        foundBy: foundBy.trim() || null,
        description: what.trim(),
        storageLocation: storage.trim(),
        note: note.trim() || null
      },
      {
        onSuccess: async ({ id: itemId }) => {
          await upload({ kind: 'lostItem', id: itemId }, files)
          onClose()
        }
      }
    )
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t('lostItems.form.title')}
      description={t('lostItems.form.description')}
      className="sm:max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={id} disabled={create.isPending} data-testid="lost-save">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id={id} noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-what`}>{t('lostItems.form.what')}</Label>
          <Input
            id={`${id}-what`}
            value={what}
            maxLength={LOST.description.maxLength}
            onChange={(e) => setWhat(e.target.value)}
            placeholder={t('lostItems.form.whatPlaceholder')}
            aria-invalid={tried && problems.what}
            autoComplete="off"
            data-testid="lost-what"
          />
          <Problem show={tried && problems.what}>{t('lostItems.form.whatRequired')}</Problem>
        </div>
        <DateInput label={t('lostItems.form.foundAt')} value={day} onChange={setDay} max={today} />
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-by`}>{t('lostItems.form.foundBy')}</Label>
          <Input
            id={`${id}-by`}
            value={foundBy}
            maxLength={LOST.foundBy.maxLength}
            onChange={(e) => setFoundBy(e.target.value)}
            placeholder={t('lostItems.form.foundByPlaceholder')}
            autoComplete="off"
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label id={`${id}-kind`}>{t('lostItems.form.where')}</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            value={kind}
            onValueChange={(v) => v && setKind(v as PlaceKind)}
            aria-labelledby={`${id}-kind`}
            className="w-full"
          >
            {PLACE_KINDS.map((k) => (
              <ToggleGroupItem key={k} value={k} className="flex-1" disabled={k === 'room' && !rooms.length}>
                {t(`lostItems.form.placeKind.${k}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          {kind === 'room' ? (
            <RoomPicker
              id={`${id}-room`}
              label={t('common.room')}
              rooms={rooms}
              value={roomId}
              onChange={setRoomId}
            />
          ) : (
            <>
              <Label htmlFor={`${id}-place`}>{t('lostItems.form.place')}</Label>
              <Input
                id={`${id}-place`}
                value={place}
                maxLength={LOST.locationText.maxLength}
                onChange={(e) => setPlace(e.target.value)}
                placeholder={t('lostItems.form.placePlaceholder')}
                aria-invalid={tried && problems.place}
                data-testid="lost-place"
              />
            </>
          )}
          <Problem show={tried && problems.place}>
            {t(kind === 'room' ? 'lostItems.form.roomRequired' : 'lostItems.form.placeRequired')}
          </Problem>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-storage`}>{t('lostItems.form.storage')}</Label>
          <Input
            id={`${id}-storage`}
            value={storage}
            maxLength={LOST.storageLocation.maxLength}
            onChange={(e) => setStorage(e.target.value)}
            placeholder={t('lostItems.form.storagePlaceholder')}
            aria-invalid={tried && problems.storage}
            data-testid="lost-storage"
          />
          <Problem show={tried && problems.storage}>{t('lostItems.form.storageRequired')}</Problem>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${id}-note`}>{t('lostItems.form.note')}</Label>
          <Textarea
            id={`${id}-note`}
            rows={2}
            value={note}
            maxLength={LOST.note.maxLength}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('lostItems.form.notePlaceholder')}
          />
        </div>
        <div className="sm:col-span-2">
          <PhotoPicker label={t('lostItems.form.photo')} files={files} onChange={setFiles} />
        </div>
      </form>
    </ResponsiveDialog>
  )
}

/** "HH:MM" of now. */
const nowTime = (): string => localDateTimeOf(new Date()).slice(11, 16)

export function ReturnDialog({
  item,
  today,
  onClose
}: {
  item: LostItemView
  today: LocalDate
  onClose: () => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [to, setTo] = useState('')
  const [day, setDay] = useState<LocalDate>(today)
  const [time, setTime] = useState(nowTime)
  const [note, setNote] = useState(item.note ?? '')
  const [tried, setTried] = useState(false)
  const save = useAdminMutation('lostItems.markReturned', {
    invalidate: INVALIDATE,
    success: t('lostItems.return.saved')
  })
  const missing = to.trim().length === 0
  const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  const submit = (e: FormEvent): void => {
    e.preventDefault()
    setTried(true)
    if (missing || !timeOk) return
    save.mutate(
      {
        id: item.id,
        input: { returnedTo: to.trim(), returnedAt: `${day}T${time}`, note: note.trim() || null }
      },
      { onSuccess: onClose }
    )
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t('lostItems.return.title')}
      description={item.description}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={id} disabled={save.isPending} data-testid="return-save">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id={id} noValidate className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-to`}>{t('lostItems.return.to')}</Label>
          <Input
            id={`${id}-to`}
            value={to}
            maxLength={RETURN.returnedTo.maxLength}
            onChange={(e) => setTo(e.target.value)}
            aria-invalid={tried && missing}
            autoComplete="off"
            data-testid="return-to"
          />
          <Problem show={tried && missing}>{t('lostItems.return.toRequired')}</Problem>
        </div>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <DateInput label={t('lostItems.return.date')} value={day} onChange={setDay} max={today} />
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-time`}>{t('lostItems.return.time')}</Label>
            <TimeInput
              id={`${id}-time`}
              value={time}
              onChange={(v) => setTime(v)}
              aria-invalid={tried && !timeOk}
              aria-describedby={tried && !timeOk ? `${id}-time-msg` : undefined}
              className="tabular-nums"
            />
            <Problem show={tried && !timeOk} id={`${id}-time-msg`}>
              {t('timeInput.invalid')}
            </Problem>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-note`}>{t('lostItems.return.note')}</Label>
          <Textarea
            id={`${id}-note`}
            rows={2}
            value={note}
            maxLength={RETURN.note.maxLength}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('lostItems.return.notePlaceholder')}
          />
        </div>
      </form>
    </ResponsiveDialog>
  )
}

/** Dispose of an item, or put a returned/disposed one back to kept: both need the reason (audit). */
export function StatusReasonDialog({
  item,
  mode,
  onClose
}: {
  item: LostItemView
  mode: 'dispose' | 'restore'
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const dispose = useAdminMutation('lostItems.markDisposed', {
    invalidate: INVALIDATE,
    success: t('lostItems.dispose.saved')
  })
  const restore = useAdminMutation('lostItems.restore', {
    invalidate: INVALIDATE,
    success: t('lostItems.restore.saved')
  })
  const pending = dispose.isPending || restore.isPending
  return (
    <AlertDialog open onOpenChange={(o) => (o ? null : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(`lostItems.${mode}.title`)}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(`lostItems.${mode}.body`, { item: item.description })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="lost-reason">{t('lostItems.reason')}</Label>
          <Textarea
            id="lost-reason"
            rows={2}
            value={reason}
            maxLength={REASON_MAX}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t(`lostItems.${mode}.reasonPlaceholder`)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!reason.trim() || pending}
            data-testid={`lost-${mode}-confirm`}
            onClick={(e) => {
              e.preventDefault()
              const input = { id: item.id, reason: reason.trim() }
              if (mode === 'dispose') dispose.mutate(input, { onSuccess: onClose })
              else restore.mutate(input, { onSuccess: onClose })
            }}
          >
            {t(`lostItems.${mode}.confirm`)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
