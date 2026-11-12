// Add a person to a room in the house (G-54): name and an optional descriptor note so the night shift recognises
// them without asking; "KBS'ye bildirdim" marks them in the same step (who and when, G-53). Identity numbers are
// never asked for or kept here — they go into KBS only (KVKK). A person on the blacklist is a red warning that needs a
// tick before saving (G-45, §6.9; the service decides).
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ShieldCheckIcon } from 'lucide-react'
import type { InHouseRoomDto } from '@shared/contract/procedures/today'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useApiMutation } from '@/lib/api/hooks'
import type { BlacklistHit } from '@/features/calendar/booking-api'
import { BlacklistWarning } from '@/features/calendar/new-reservation-dialog'

export function AddPersonDialog({
  open,
  onOpenChange,
  rooms,
  stayId
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Rooms in the house now (a person is only added to a live stay). */
  rooms: InHouseRoomDto[]
  stayId: string | null
}) {
  const { t } = useTranslation()
  const formId = useId()
  const [stay, setStay] = useState<string | null>(stayId)
  const [name, setName] = useState('')
  const [descriptor, setDescriptor] = useState('')
  const [reported, setReported] = useState(false)
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Blacklist entries the service named for this name, and the user's tick (another name needs its own). */
  const [hits, setHits] = useState<{ name: string; hits: BlacklistHit[] } | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const shownHits = hits && hits.name === name.trim() ? hits.hits : null
  const add = useApiMutation('inHouse.addPerson', {
    invalidates: ['inHouse.list', 'today.summary', 'booking.get', 'reservations.grid'],
    onSuccess: () => {
      toast.success(t('inHouse.add.saved'))
      onOpenChange(false)
    },
    onError: (e) => {
      if (e.messageKey === 'errors.blacklistMatch') {
        const details = e.details as { hits?: BlacklistHit[] } | undefined
        setHits({ name: name.trim(), hits: details?.hits ?? [] })
        setConfirmed(false)
        return
      }
      setError(t(e.messageKey as 'errors.internal', { defaultValue: t('errors.internal') }))
    }
  })
  const nameMissing = name.trim().length === 0
  const save = (): void => {
    setTried(true)
    if (nameMissing || !stay || add.isPending) return
    if (shownHits && !confirmed) return setError(t('booking.blacklist.confirmFirst'))
    setError(null)
    add.mutate({
      stayId: stay,
      fullName: name.trim(),
      descriptorNote: descriptor.trim() || null,
      kbsReported: reported,
      ...(shownHits && confirmed ? { blacklistConfirmed: true } : {})
    })
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('inHouse.add.title')}
      description={t('inHouse.add.description')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={add.isPending}>
            {t('common.save')}
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
        onKeyDown={(e) => {
          // Enter in a text field saves (the Save button sits in the dialog footer, outside the form).
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type !== 'checkbox') {
            e.preventDefault()
            save()
          }
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-room`}>{t('common.room')}</Label>
          <Select value={stay ?? undefined} onValueChange={setStay}>
            <SelectTrigger
              id={`${formId}-room`}
              className="w-full"
              data-testid="add-person-room"
              aria-invalid={tried && !stay}
            >
              <SelectValue placeholder={t('roomPicker.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {rooms.map((r) => (
                <SelectItem key={r.stayId} value={r.stayId}>
                  {t('inHouse.add.roomOption', { room: r.roomNumber, name: r.guestName })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {tried && !stay ? (
            <p role="alert" className="text-destructive text-xs">
              {t('inHouse.add.roomRequired')}
            </p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-name`}>{t('inHouse.add.name')}</Label>
          <Input
            id={`${formId}-name`}
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            aria-invalid={tried && nameMissing}
            aria-describedby={tried && nameMissing ? `${formId}-name-error` : undefined}
          />
          {tried && nameMissing ? (
            <p id={`${formId}-name-error`} role="alert" className="text-destructive text-xs">
              {t('inHouse.add.nameRequired')}
            </p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-descriptor`}>{t('inHouse.add.descriptor')}</Label>
          <Input
            id={`${formId}-descriptor`}
            value={descriptor}
            maxLength={200}
            onChange={(e) => setDescriptor(e.target.value)}
            placeholder={t('inHouse.add.descriptorPlaceholder')}
            autoComplete="off"
            aria-describedby={`${formId}-descriptor-hint`}
          />
          <p id={`${formId}-descriptor-hint`} className="text-muted-foreground text-xs">
            {t('inHouse.add.descriptorHint')}
          </p>
        </div>
        <Label
          htmlFor={`${formId}-kbs`}
          className="hover:bg-accent/50 flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 font-normal"
        >
          <Checkbox
            id={`${formId}-kbs`}
            checked={reported}
            onCheckedChange={(v) => setReported(v === true)}
          />
          <span className="grid gap-0.5">
            <span className="font-medium">{t('occupants.markIn')}</span>
            <span className="text-muted-foreground text-xs leading-snug">{t('inHouse.add.kbsHint')}</span>
          </span>
        </Label>
        <p className="text-muted-foreground flex items-start gap-2 text-xs leading-snug">
          <ShieldCheckIcon className="mt-px size-4 shrink-0" aria-hidden />
          {t('inHouse.add.noId')}
        </p>
        {shownHits ? (
          <BlacklistWarning hits={shownHits} confirmed={confirmed} onConfirm={setConfirmed} />
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}
