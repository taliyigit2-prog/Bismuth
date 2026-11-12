// Step 6 — rooms (G-12, K-27): a quick generator (floors × rooms per floor → 101, 102 … with a type and bed
// count), then every room can be renumbered, retyped, given its bed count, closed for sale, removed or added.
// The totals ("19 oda · 38 yatak") are what occupancy and the ministry statistics count. At least one room.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BedDoubleIcon, LayersIcon, PlusIcon, XIcon } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { EmptyState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { cn } from '@/lib/utils'
import { describe } from './aria'
import {
  MAX_ROOMS,
  chosenTypes,
  generateRooms,
  generatorCount,
  ids,
  nextRoom,
  refFromKey,
  refKey,
  roomTotals,
  type DraftRoom
} from './draft'
import { DigitsInput, Field, FieldMessage } from './fields'
import type { StepProps } from './step-props'

/** Desktop: one line per room. Phone: number + type, then floor, beds, for sale and remove. */
const ROW = 'md:grid-cols-[5.5rem_4.5rem_minmax(0,1fr)_4.5rem_6.5rem_2.25rem]'

export function RoomsStep({ draft, update, options, errors, goTo }: StepProps) {
  const { t } = useTranslation()
  const f = useFormat()
  const [confirm, setConfirm] = useState(false)
  const types = chosenTypes(draft, options, f.locale)
  const count = generatorCount(draft)
  const totals = roomTotals(draft.rooms)
  const gen = draft.generator
  const setGen = (patch: Partial<typeof gen>): void =>
    update((d) => ({ ...d, generator: { ...d.generator, ...patch } }))
  const setRoom = (key: string, patch: Partial<DraftRoom>): void =>
    update((d) => ({ ...d, rooms: d.rooms.map((r) => (r.key === key ? { ...r, ...patch } : r)) }))
  const generate = (): void => update((d) => ({ ...d, rooms: generateRooms(d) }))
  const tooMany = count > MAX_ROOMS
  const genError = tooMany
    ? { key: 'setup.errors.tooManyRooms' as const, values: { max: MAX_ROOMS } }
    : errors[ids.generate]

  if (types.length === 0)
    return (
      <EmptyState
        compact
        icon={LayersIcon}
        title={t('setup.rooms.noTypesTitle')}
        body={t('setup.rooms.noTypesBody')}
        action={
          <Button type="button" variant="outline" onClick={() => goTo('roomTypes')}>
            {t('setup.rooms.toTypes')}
          </Button>
        }
      />
    )

  return (
    <div className="grid gap-6">
      <section className="grid gap-4">
        <div className="grid grid-cols-3 items-end gap-x-3 gap-y-4 md:grid-cols-[repeat(3,minmax(0,8rem))_minmax(0,1fr)]">
          <Field id="setup-floors" label={t('setup.rooms.floors')} errors={errors}>
            <DigitsInput
              id="setup-floors"
              maxLength={2}
              value={gen.floors}
              onChange={(floors) => setGen({ floors })}
              aria={describe('setup-floors', errors)}
            />
          </Field>
          <Field id="setup-per-floor" label={t('setup.rooms.perFloor')} errors={errors}>
            <DigitsInput
              id="setup-per-floor"
              maxLength={2}
              value={gen.perFloor}
              onChange={(perFloor) => setGen({ perFloor })}
              aria={describe('setup-per-floor', errors)}
            />
          </Field>
          <Field id="setup-beds" label={t('setup.rooms.beds')} errors={errors}>
            <DigitsInput
              id="setup-beds"
              maxLength={2}
              value={gen.beds}
              onChange={(beds) => setGen({ beds })}
              aria={describe('setup-beds', errors)}
            />
          </Field>
          <Field
            id="setup-gen-type"
            label={t('setup.rooms.type')}
            errors={errors}
            className="max-md:col-span-3"
          >
            <Select
              value={gen.roomType ? refKey(gen.roomType) : ''}
              onValueChange={(key) => setGen({ roomType: refFromKey(key) })}
            >
              <SelectTrigger id="setup-gen-type" className="w-full" data-testid="setup-gen-type">
                <SelectValue placeholder={t('setup.rooms.type')} />
              </SelectTrigger>
              <SelectContent>
                {types.map((type) => (
                  <SelectItem key={type.key} value={type.key}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            id={ids.generate}
            variant={draft.rooms.length > 0 ? 'outline' : 'default'}
            disabled={count === 0 || tooMany}
            onClick={() => (draft.rooms.length > 0 ? setConfirm(true) : generate())}
            aria-invalid={genError ? true : undefined}
            aria-describedby={genError ? `${ids.generate}-error` : `${ids.generate}-hint`}
            data-testid="setup-generate"
          >
            <LayersIcon aria-hidden />
            {draft.rooms.length > 0 ? t('setup.rooms.regenerate') : t('setup.rooms.generate')}
          </Button>
          <span className="text-sm font-medium" data-testid="setup-generate-count">
            {t('setup.rooms.preview', { count })}
          </span>
        </div>
        <FieldMessage id={ids.generate} error={genError} hint={t('setup.rooms.previewHint')} />
      </section>

      <section className="grid gap-3" aria-labelledby="setup-room-totals">
        <div className="grid gap-0.5">
          <p
            id="setup-room-totals"
            className="flex items-center gap-2 text-base font-semibold"
            data-testid="setup-room-totals"
          >
            <BedDoubleIcon className="text-muted-foreground size-4" aria-hidden />
            {t('setup.rooms.totals', {
              rooms: t('setup.rooms.roomCount', { count: totals.rooms }),
              beds: t('setup.rooms.bedCount', { count: totals.beds })
            })}
          </p>
          <p className="text-muted-foreground text-xs">{t('setup.rooms.totalsHint')}</p>
        </div>
        {draft.rooms.length === 0 ? (
          <EmptyState
            compact
            icon={BedDoubleIcon}
            title={t('setup.rooms.emptyTitle')}
            body={t('setup.rooms.emptyBody')}
          />
        ) : (
          <div className="grid gap-2">
            <div
              aria-hidden
              className={cn('text-muted-foreground grid gap-2 text-xs font-medium max-md:hidden', ROW)}
            >
              <span>{t('setup.rooms.number')}</span>
              <span>{t('setup.rooms.floor')}</span>
              <span>{t('setup.rooms.type')}</span>
              <span>{t('setup.rooms.bedsShort')}</span>
              <span>{t('setup.rooms.sellable')}</span>
            </div>
            <ul className="grid gap-2" data-testid="setup-room-list">
              {draft.rooms.map((room) => (
                <RoomRow
                  key={room.key}
                  room={room}
                  types={types}
                  errors={errors}
                  onChange={(patch) => setRoom(room.key, patch)}
                  onRemove={() => update((d) => ({ ...d, rooms: d.rooms.filter((r) => r.key !== room.key) }))}
                />
              ))}
            </ul>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          onClick={() => update((d) => ({ ...d, rooms: [...d.rooms, nextRoom(d, types[0]?.ref ?? null)] }))}
          disabled={draft.rooms.length >= MAX_ROOMS}
          data-testid="setup-add-room"
        >
          <PlusIcon aria-hidden />
          {t('setup.rooms.add')}
        </Button>
      </section>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent
          // Opened from state (no trigger): give the focus back to the generate button, not to the page.
          onCloseAutoFocus={(e) => {
            e.preventDefault()
            document.getElementById(ids.generate)?.focus()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t('setup.rooms.regenerateTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('setup.rooms.regenerateBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={generate} data-testid="setup-regenerate-confirm">
              {t('setup.rooms.regenerate')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function RoomRow({
  room,
  types,
  errors,
  onChange,
  onRemove
}: {
  room: DraftRoom
  types: ReturnType<typeof chosenTypes>
  errors: StepProps['errors']
  onChange: (patch: Partial<DraftRoom>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const fieldIds = {
    number: ids.room(room.key, 'number'),
    floor: ids.room(room.key, 'floor'),
    beds: ids.room(room.key, 'beds'),
    type: ids.room(room.key, 'type')
  }
  const typeKey = room.roomType ? refKey(room.roomType) : ''
  const typeLabel = types.find((type) => type.key === typeKey)?.label
  const known = typeLabel !== undefined
  const rowErrors = (['number', 'floor', 'type', 'beds'] as const).flatMap((field) => {
    const error = errors[fieldIds[field]]
    return error ? [{ field, error }] : []
  })
  // Phone: two lines (number, type, remove / floor, beds, for sale) with small labels; desktop: one line under
  // the column headers (the line wrappers turn into `contents` and `md:order-*` restores the column order).
  return (
    <li
      className={cn(
        'grid gap-2 rounded-lg border p-2 md:items-center md:rounded-none md:border-0 md:p-0',
        ROW
      )}
      data-testid={`setup-room-${room.number}`}
    >
      <div className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-2 md:contents">
        <Input
          id={fieldIds.number}
          value={room.number}
          maxLength={20}
          dir="ltr"
          autoComplete="off"
          onChange={(e) => onChange({ number: e.target.value })}
          aria-label={t('setup.rooms.number')}
          className="font-medium tabular-nums md:order-1"
          data-testid={fieldIds.number}
          {...describe(fieldIds.number, errors)}
        />
        <Select value={known ? typeKey : ''} onValueChange={(key) => onChange({ roomType: refFromKey(key) })}>
          {/* A long type name is cut on the phone: the tooltip has all of it. */}
          <SelectTrigger
            id={fieldIds.type}
            className="w-full min-w-0 md:order-3"
            title={typeLabel}
            aria-label={t('setup.rooms.type')}
            data-testid={fieldIds.type}
            {...describe(fieldIds.type, errors)}
          >
            <SelectValue placeholder={t('setup.rooms.type')} />
          </SelectTrigger>
          <SelectContent>
            {types.map((type) => (
              <SelectItem key={type.key} value={type.key}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="md:order-6"
          aria-label={t('setup.rooms.remove', { number: room.number })}
          onClick={onRemove}
          data-testid={`setup-remove-room-${room.number}`}
        >
          <XIcon aria-hidden />
        </Button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2 md:contents">
        <Cell
          id={fieldIds.floor}
          label={t('setup.rooms.floor')}
          numeric={false}
          value={room.floor}
          onChange={(floor) => onChange({ floor })}
          className="md:order-2"
          aria={describe(fieldIds.floor, errors)}
        />
        <Cell
          id={fieldIds.beds}
          label={t('setup.rooms.bedsShort')}
          numeric
          value={room.beds}
          onChange={(beds) => onChange({ beds })}
          className="md:order-4"
          aria={describe(fieldIds.beds, errors)}
        />
        <Label className="min-h-9 cursor-pointer gap-2 font-normal max-md:min-h-11 md:order-5">
          <Switch
            checked={room.sellable}
            onCheckedChange={(sellable) => onChange({ sellable })}
            data-testid={`setup-room-${room.key}-sellable`}
          />
          <span className="text-xs md:sr-only">{t('setup.rooms.sellable')}</span>
        </Label>
      </div>
      {rowErrors.map(({ field, error }) => (
        <div key={field} className="col-span-full md:order-7">
          <FieldMessage id={fieldIds[field]} error={error} />
        </div>
      ))}
    </li>
  )
}

/** Floor and beds: a small label above the field on the phone; the desktop has the column headers. */
function Cell({
  id,
  label,
  numeric,
  value,
  onChange,
  className,
  aria
}: {
  id: string
  label: string
  numeric: boolean
  value: string
  onChange: (value: string) => void
  className?: string
  aria: ReturnType<typeof describe>
}) {
  return (
    <div className={cn('grid min-w-0 gap-1', className)}>
      <Label htmlFor={id} className="text-muted-foreground text-xs font-normal md:sr-only">
        {label}
      </Label>
      {numeric ? (
        <DigitsInput id={id} maxLength={2} value={value} onChange={onChange} aria={aria} />
      ) : (
        <Input
          id={id}
          maxLength={20}
          dir="ltr"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="tabular-nums"
          data-testid={id}
          {...aria}
        />
      )}
    </div>
  )
}
