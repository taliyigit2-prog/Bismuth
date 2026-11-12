// Several rooms for one reservation (G-35): grouped by floor, with type and beds. A room taken in the chosen dates
// cannot be ticked ("dolu"; the service decides, this spares a round trip). A blocked room ("Satışa kapalı") and a
// room the hotel does not sell ("Satılmayan oda") carry their label and can be ticked only by whoever may close
// rooms (`allowOverride`: the form then asks for a reason, §6.1). A room with an open issue carries a warning sign
// and the issue's title (G-180).
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangleIcon, BedDoubleIcon, ChevronsUpDownIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useFormat } from '@/hooks/use-format'
import { cn } from '@/lib/utils'
import { localName, type BookingRoom } from './booking-api'

export function RoomMultiPicker({
  rooms,
  value,
  onChange,
  occupied,
  blocked,
  label,
  allowOverride = false
}: {
  rooms: readonly BookingRoom[]
  value: readonly string[]
  onChange: (roomIds: string[]) => void
  occupied: ReadonlySet<string>
  blocked: ReadonlySet<string>
  label: string
  /** Blocked and not-for-sale rooms can be ticked (the user may write "yine de" with a reason). */
  allowOverride?: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const id = useId()
  const [open, setOpen] = useState(false)
  const floors = [...new Set(rooms.map((r) => r.floor ?? ''))].sort((a, b) => f.compare(a, b))
  const chosen = rooms.filter((r) => value.includes(r.id))
  const toggle = (roomId: string, on: boolean): void =>
    onChange(on ? [...value, roomId] : value.filter((x) => x !== roomId))
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            data-testid="room-multi-picker"
            className={cn(
              'border-input w-full justify-between font-normal',
              !chosen.length && 'text-muted-foreground'
            )}
          >
            <span className="truncate">
              {chosen.length ? chosen.map((r) => r.number).join(', ') : t('roomPicker.placeholder')}
            </span>
            <ChevronsUpDownIcon className="opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
          {/* The height limit goes on the scrolling viewport: on the ScrollArea root it only let the list run past
              the popover and off a phone's screen once a hotel had more than about six rooms. A fixed limit (not the
              room left on the screen) lets the popover open upwards when there is no room below. */}
          <ScrollArea
            className="[&>[data-slot=scroll-area-viewport]]:max-h-80"
            data-testid="room-multi-picker-list"
          >
            <div className="grid gap-1 p-2" role="group" aria-label={label}>
              {floors.map((floor) => (
                <div key={floor} className="grid gap-0.5">
                  <p className="text-muted-foreground px-2 pt-1 text-xs font-medium">
                    {floor ? t('roomPicker.floor', { floor }) : t('booking.rooms.noFloor')}
                  </p>
                  {rooms
                    .filter((r) => (r.floor ?? '') === floor)
                    .map((r) => {
                      const on = value.includes(r.id)
                      const isTaken = occupied.has(r.id)
                      const closed = blocked.has(r.id) || !r.sellable
                      const busy = isTaken || (closed && !allowOverride)
                      const note = isTaken
                        ? t('roomPicker.taken')
                        : blocked.has(r.id)
                          ? t('booking.rooms.blocked')
                          : !r.sellable
                            ? t('booking.rooms.notForSale')
                            : null
                      const rowId = `${id}-${r.id}`
                      return (
                        <label
                          key={r.id}
                          htmlFor={rowId}
                          data-testid={`room-option-${r.number}`}
                          className={cn(
                            'hover:bg-accent flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm max-md:min-h-11',
                            busy && !on && 'cursor-not-allowed opacity-60'
                          )}
                        >
                          <Checkbox
                            id={rowId}
                            checked={on}
                            disabled={busy && !on}
                            onCheckedChange={(c) => toggle(r.id, c === true)}
                          />
                          <span className="font-semibold tabular-nums">{r.number}</span>
                          <span className="text-muted-foreground min-w-0 truncate">
                            {localName(f, { name: r.typeName, nameI18n: r.typeNameI18n })}
                          </span>
                          {r.openIssues.length ? (
                            <AlertTriangleIcon
                              className="text-warning size-3.5 shrink-0"
                              aria-label={t('booking.rooms.openIssue', { title: r.openIssues[0]!.title })}
                            />
                          ) : null}
                          <span className="text-muted-foreground ms-auto inline-flex shrink-0 items-center gap-1 text-xs">
                            <BedDoubleIcon className="size-3.5" aria-hidden />
                            {r.beds}
                          </span>
                          {note ? (
                            <span
                              className={cn(
                                'shrink-0 text-xs',
                                busy ? 'text-destructive' : 'text-muted-foreground'
                              )}
                            >
                              {note}
                            </span>
                          ) : null}
                        </label>
                      )
                    })}
                </div>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  )
}
