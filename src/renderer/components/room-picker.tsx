// Room choice for a stay (G-34): grouped by floor, with type and beds; rooms taken in the chosen dates are
// marked and cannot be picked (the service decides; this only spares a round trip).
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { BedDoubleIcon } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

export interface PickerRoom {
  id: string
  number: string
  floor: number
  typeLabel: string
  beds: number
}

export function RoomPicker({
  rooms,
  value,
  onChange,
  taken = new Set<string>(),
  label,
  id
}: {
  rooms: PickerRoom[]
  value: string | null
  onChange: (roomId: string) => void
  taken?: ReadonlySet<string>
  label: string
  id?: string
}) {
  const { t } = useTranslation()
  // The label always names the field (faz-15 madde 5: an unlabelled trigger was an axe "critical").
  const ownId = useId()
  const fieldId = id ?? ownId
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b)
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-medium">
        {label}
      </label>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger id={fieldId} className="w-full" data-testid="room-picker">
          <SelectValue placeholder={t('roomPicker.placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {floors.map((floor) => (
            <SelectGroup key={floor}>
              <SelectLabel>{t('roomPicker.floor', { floor })}</SelectLabel>
              {rooms
                .filter((r) => r.floor === floor)
                .map((r) => (
                  <SelectItem key={r.id} value={r.id} disabled={taken.has(r.id)}>
                    <span className="font-semibold tabular-nums">{r.number}</span>
                    <span className="text-muted-foreground truncate">{r.typeLabel}</span>
                    <span className="text-muted-foreground ms-auto inline-flex items-center gap-1 text-xs">
                      <BedDoubleIcon className="size-3.5" aria-hidden />
                      {r.beds}
                    </span>
                    {taken.has(r.id) ? (
                      <span className="text-destructive text-xs">{t('roomPicker.taken')}</span>
                    ) : null}
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
