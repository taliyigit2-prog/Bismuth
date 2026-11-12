// "Boş oda bul" (faz-05 madde 6): a stay's dates and, if wanted, a room type → the rooms free for the whole stay
// are highlighted on the grid (row mark + the date range framed), and the grid scrolls to the arrival day.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, type LocalDate } from '@shared/date'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DateInput } from '@/components/date-input'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useTransport } from '@/lib/api/api-context'
import type { ApiError } from '@/lib/transport'

export interface FreeRoomsResult {
  roomIds: string[]
  checkIn: LocalDate
  checkOut: LocalDate
  roomTypeId: string | null
}

const ALL = '__all__'

export function FreeRoomsDialog({
  open,
  onOpenChange,
  start,
  types,
  onFound
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Arrival day offered first. */
  start: LocalDate
  /** Room types on the grid (id + name in the interface language). */
  types: { id: string; name: string }[]
  onFound: (result: FreeRoomsResult) => void
}) {
  const { t } = useTranslation()
  const transport = useTransport()
  const [checkIn, setCheckIn] = useState<LocalDate>(start)
  const [checkOut, setCheckOut] = useState<LocalDate>(addDays(start, 1))
  const [type, setType] = useState(ALL)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const invalid = checkOut < checkIn

  const find = async () => {
    if (invalid) return
    setBusy(true)
    setMessage(null)
    try {
      const roomTypeId = type === ALL ? null : type
      const { roomIds } = await transport.call('reservations.freeRooms', { checkIn, checkOut, roomTypeId })
      if (roomIds.length === 0) setMessage(t('calendar.freeRooms.none'))
      else {
        onFound({ roomIds, checkIn, checkOut, roomTypeId })
        onOpenChange(false)
      }
    } catch (error) {
      const key = (error as ApiError).messageKey ?? 'errors.loadFailed'
      setMessage(t(key as 'errors.loadFailed', { defaultValue: t('errors.loadFailed') }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('calendar.freeRooms.title')}
      description={t('calendar.freeRooms.description')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="free-rooms-form" disabled={busy || invalid}>
            {t('calendar.freeRooms.find')}
          </Button>
        </>
      }
    >
      <form
        id="free-rooms-form"
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void find()
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <DateInput label={t('calendar.freeRooms.checkIn')} value={checkIn} onChange={setCheckIn} />
          <DateInput
            label={t('calendar.freeRooms.checkOut')}
            value={checkOut}
            onChange={setCheckOut}
            min={checkIn}
          />
        </div>
        {invalid ? (
          <p className="text-destructive text-sm" role="alert">
            {t('calendar.freeRooms.badDates')}
          </p>
        ) : checkIn === checkOut ? (
          <p className="text-muted-foreground text-sm">{t('calendar.freeRooms.dayUse')}</p>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="free-room-type">{t('calendar.freeRooms.type')}</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger id="free-room-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('calendar.freeRooms.anyType')}</SelectItem>
              {types.map((rt) => (
                <SelectItem key={rt.id} value={rt.id}>
                  {rt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {message ? (
          <p className="text-sm" role="status" data-testid="free-rooms-message">
            {message}
          </p>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}
