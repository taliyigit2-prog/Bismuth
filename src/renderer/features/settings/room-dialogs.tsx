// Dialogs of "Odalar ve tipler": a room type (the hotel's own or a seeded one renamed, with suggested prices),
// the seeded types to switch on, one room, and rooms floor by floor. Rooms and capacity changes carry the day they
// count from (K-27); the one-line reason sits under the date.
import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { RoomTypeView, RoomView, SettingsValues } from '@shared/contract'
import { today as todayOf, type LocalDate } from '@shared/date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { DateInput } from '@/components/date-input'
import { MoneyInput, type MoneyValue } from '@/components/money-input'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useAdminMutation, deferForPendingAmount, useLocalName } from './use-admin'
import { CapacityHistory } from './room-capacity-history'
import { useCapacitySummary } from './use-capacity-summary'
import { useFormat } from '@/hooks/use-format'
import type { ApiError } from '@/lib/transport/types'

const GROUPS = ['occupancy', 'tier', 'suite', 'view', 'building', 'feature', 'custom'] as const
const numeric = new Intl.Collator(undefined, { numeric: true })

/** A labelled field with its help or error line under it (the error replaces the help). */
export function Field({
  id,
  label,
  help,
  error,
  children
}: {
  id: string
  label: string
  help?: string
  error?: string | null
  children: ReactNode
}) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      {/* leading-snug: a label that wraps to two lines keeps its lines apart. */}
      <Label htmlFor={id} className="leading-snug">
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-msg`} className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-msg`} className="text-muted-foreground text-xs">
          {help}
        </p>
      ) : null}
    </div>
  )
}

/** A switch with its words beside it; the whole row is the 44 px touch target on the phone. */
export function SwitchRow({
  id,
  label,
  help,
  checked,
  disabled,
  onChange
}: {
  id: string
  label: string
  help?: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid gap-0.5">
        <Label htmlFor={id} className="leading-snug max-md:min-h-11">
          {label}
        </Label>
        {help ? <p className="text-muted-foreground text-xs">{help}</p> : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="mt-0.5 max-md:mt-0 max-md:box-border max-md:h-11! max-md:w-12! max-md:border-x-8 max-md:border-y-[13px] max-md:bg-clip-padding max-md:shadow-none"
      />
    </div>
  )
}

/** The dialog's buttons: "Vazgeç" closes, the main one submits the form (Enter does the same). */
export function DialogActions({
  form,
  pending,
  label,
  onCancel,
  testId = 'dialog-save'
}: {
  form: string
  pending: boolean
  label?: string
  onCancel: () => void
  testId?: string
}) {
  const { t } = useTranslation()
  return (
    <>
      <Button type="button" variant="outline" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
      <Button type="submit" form={form} disabled={pending} data-testid={testId}>
        {label ?? t('common.save')}
      </Button>
    </>
  )
}

const int = (text: string): number | null => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null)

// ── Room type ────────────────────────────────────────────────────────────────────────────────────────────

export function RoomTypeDialog({
  type,
  roomCount,
  values,
  onClose
}: {
  type: RoomTypeView | null
  roomCount: number
  values: SettingsValues
  onClose: () => void
}) {
  const { t } = useTranslation()
  const nameOf = useLocalName()
  const formId = useId()
  const initialName = type ? nameOf(type.nameI18n, type.name) : ''
  const currency = type?.baseCurrency ?? values['hotel.baseCurrency']
  const [name, setName] = useState(initialName)
  const [base, setBase] = useState<MoneyValue>({ amountMinor: type?.basePriceMinor ?? null, currency })
  const [weekend, setWeekend] = useState<MoneyValue>({
    amountMinor: type?.weekendPriceMinor ?? null,
    currency
  })
  const [hourly, setHourly] = useState<MoneyValue>({
    amountMinor: type?.hourlyPriceMinor ?? null,
    currency
  })
  const [active, setActive] = useState(type?.active ?? true)
  const [error, setError] = useState(false)
  const [priceBad, setPriceBad] = useState(false)
  // The service refuses a name another type already has; the answer sits under the field, not in a toast.
  const [taken, setTaken] = useState(false)
  const done = { onSuccess: onClose }
  const nameTaken = (e: { messageKey: string }): boolean => {
    if (e.messageKey !== 'errors.nameTaken') return false
    setTaken(true)
    document.getElementById(`${formId}-name`)?.focus()
    return true
  }
  const create = useAdminMutation('rooms.createType', {
    invalidate: ['rooms.listTypes'],
    success: t('settings.rooms.typeAdded'),
    handled: nameTaken
  })
  const update = useAdminMutation('rooms.updateType', {
    invalidate: ['rooms.listTypes'],
    success: t('settings.rooms.typeSaved'),
    handled: nameTaken
  })
  // One currency per type: the prices move together.
  const pickBase = (v: MoneyValue): void => {
    setPriceBad(false)
    setBase(v)
    setWeekend((w) => ({ ...w, currency: v.currency }))
    setHourly((h) => ({ ...h, currency: v.currency }))
  }
  const pickWeekend = (v: MoneyValue): void => {
    setPriceBad(false)
    setWeekend(v)
    setBase((b) => ({ ...b, currency: v.currency }))
    setHourly((h) => ({ ...h, currency: v.currency }))
  }
  const pickHourly = (v: MoneyValue): void => {
    setPriceBad(false)
    setHourly(v)
    setBase((b) => ({ ...b, currency: v.currency }))
    setWeekend((w) => ({ ...w, currency: v.currency }))
  }

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (deferForPendingAmount(e.currentTarget)) return
    const trimmed = name.trim()
    const negative = [base.amountMinor, weekend.amountMinor, hourly.amountMinor].some(
      (m) => m !== null && m < 0
    )
    const nameBad = !trimmed || trimmed.length > 80
    if (nameBad || negative) {
      setError(nameBad)
      setPriceBad(negative)
      if (nameBad) document.getElementById(`${formId}-name`)?.focus()
      return
    }
    if (!type) {
      create.mutate(
        {
          name: trimmed,
          group: 'custom',
          basePriceMinor: base.amountMinor,
          weekendPriceMinor: weekend.amountMinor,
          hourlyPriceMinor: hourly.amountMinor,
          baseCurrency: base.currency
        },
        done
      )
      return
    }
    const patch = {
      ...(trimmed !== initialName ? { name: trimmed } : {}),
      ...(base.amountMinor !== type.basePriceMinor ? { basePriceMinor: base.amountMinor } : {}),
      ...(weekend.amountMinor !== type.weekendPriceMinor ? { weekendPriceMinor: weekend.amountMinor } : {}),
      ...(hourly.amountMinor !== type.hourlyPriceMinor ? { hourlyPriceMinor: hourly.amountMinor } : {}),
      ...(base.currency !== currency ? { baseCurrency: base.currency } : {}),
      ...(active !== type.active ? { active } : {})
    }
    if (Object.keys(patch).length === 0) onClose()
    else update.mutate({ id: type.id, patch }, done)
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t(type ? 'settings.rooms.typeDialogEdit' : 'settings.rooms.typeDialogAdd')}
      description={t('settings.rooms.typeDialogHelp')}
      footer={
        <DialogActions form={formId} pending={create.isPending || update.isPending} onCancel={onClose} />
      }
    >
      <form id={formId} className="grid gap-4" onSubmit={submit} noValidate>
        <Field
          id={`${formId}-name`}
          label={t('settings.rooms.typeName')}
          help={type && !type.isCustom ? t('settings.seededRename') : undefined}
          error={error ? t('settings.rooms.typeNameOnly') : taken ? t('errors.nameTaken') : null}
        >
          <Input
            id={`${formId}-name`}
            value={name}
            maxLength={80}
            autoComplete="off"
            placeholder={t('settings.rooms.typeNamePlaceholder')}
            aria-invalid={error || taken || undefined}
            aria-describedby={`${formId}-name-msg`}
            onChange={(e) => {
              setName(e.target.value)
              setError(false)
              setTaken(false)
            }}
            data-testid="type-name"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyInput
            label={t('settings.rooms.price')}
            value={base}
            onChange={pickBase}
            currencies={values['hotel.currencies']}
            error={priceBad && (base.amountMinor ?? 0) < 0 ? t('settings.rooms.typePriceNegative') : null}
          />
          <MoneyInput
            label={t('settings.rooms.weekendPrice')}
            value={weekend}
            onChange={pickWeekend}
            currencies={values['hotel.currencies']}
            error={priceBad && (weekend.amountMinor ?? 0) < 0 ? t('settings.rooms.typePriceNegative') : null}
          />
          <div className="grid content-start gap-1">
            <MoneyInput
              label={t('settings.hourly.price')}
              value={hourly}
              onChange={pickHourly}
              currencies={values['hotel.currencies']}
              error={priceBad && (hourly.amountMinor ?? 0) < 0 ? t('settings.rooms.typePriceNegative') : null}
            />
            <p className="text-muted-foreground text-xs">{t('settings.hourly.priceHelp')}</p>
          </div>
        </div>
        {type ? (
          <SwitchRow
            id={`${formId}-active`}
            label={t('settings.rooms.typeActive')}
            help={roomCount > 0 ? t('settings.rooms.typeHasRooms') : undefined}
            checked={active}
            disabled={roomCount > 0}
            onChange={setActive}
          />
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}

// ── Seeded types to switch on ────────────────────────────────────────────────────────────────────────────

export function MoreTypesDialog({ types, onClose }: { types: RoomTypeView[]; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const nameOf = useLocalName()
  const [query, setQuery] = useState('')
  const enable = useAdminMutation('rooms.updateType', {
    invalidate: ['rooms.listTypes'],
    success: t('settings.rooms.typeEnabled')
  })
  const needle = query.trim().toLocaleLowerCase(i18n.language)
  const off = types
    .filter((type) => !type.active)
    .map((type) => ({ type, name: nameOf(type.nameI18n, type.name) }))
    .filter((x) => !needle || x.name.toLocaleLowerCase(i18n.language).includes(needle))

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t('settings.rooms.moreTitle')}
      description={t('settings.rooms.moreHelp')}
    >
      <div className="grid gap-4">
        <div className="relative">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            className="ps-8"
            value={query}
            aria-label={t('common.search')}
            placeholder={t('common.search')}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {off.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{t('settings.rooms.moreEmpty')}</p>
        ) : (
          GROUPS.map((group) => {
            const rows = off.filter((x) => x.type.group === group)
            if (rows.length === 0) return null
            return (
              <section key={group} className="grid gap-1" aria-labelledby={`group-${group}`}>
                <h3 id={`group-${group}`} className="text-muted-foreground text-xs font-semibold">
                  {t(`settings.rooms.group.${group}`)}
                </h3>
                <ul className="divide-y rounded-lg border">
                  {rows.map(({ type, name }) => (
                    <li key={type.id} className="flex min-h-11 items-center gap-3 px-3 py-1">
                      <span className="min-w-0 flex-1 text-sm">{name}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={enable.isPending}
                        aria-label={t('settings.rooms.useTypeFor', { name })}
                        onClick={() => enable.mutate({ id: type.id, patch: { active: true } })}
                      >
                        {t('settings.rooms.useType')}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })
        )}
      </div>
    </ResponsiveDialog>
  )
}

// ── One room ─────────────────────────────────────────────────────────────────────────────────────────────

function ValidFrom({
  id,
  value,
  onChange
}: {
  id: string
  value: LocalDate
  onChange: (d: LocalDate) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-1.5 rounded-lg border p-3" data-testid={id}>
      <DateInput label={t('settings.rooms.validFrom')} value={value} onChange={onChange} />
      <p className="text-muted-foreground text-xs">{t('settings.rooms.validFromWhy')}</p>
    </div>
  )
}

function TypeSelect({
  id,
  types,
  value,
  onChange,
  invalid
}: {
  id: string
  types: RoomTypeView[]
  value: string
  onChange: (id: string) => void
  invalid?: boolean
}) {
  const nameOf = useLocalName()
  const options = types.filter((type) => type.active || type.id === value)
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((type) => (
          <SelectItem key={type.id} value={type.id}>
            {nameOf(type.nameI18n, type.name)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * The second line under a refused room change: the stays on the days the room would be closed (K-27), so they can
 * be moved or cancelled first.
 */
function useStaysDetail(): (error: ApiError) => string | undefined {
  const f = useFormat()
  return (error) => {
    if (error.messageKey !== 'errors.roomHasStays') return undefined
    const stays = (
      error.details as { stays?: { code: string; guestName: string; checkIn: string; checkOut: string }[] }
    )?.stays
    return stays
      ?.map(
        (s) =>
          `${s.code} · ${s.guestName} · ${f.dayMonth(s.checkIn as LocalDate)}–${f.dayMonth(s.checkOut as LocalDate)}`
      )
      .join('; ')
  }
}

export function RoomDialog({
  room,
  types,
  rooms,
  canEdit = true,
  onClose
}: {
  room: RoomView | null
  types: RoomTypeView[]
  rooms: RoomView[]
  canEdit?: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const summary = useCapacitySummary()
  const staysDetail = useStaysDetail()
  const formId = useId()
  const firstType = types.find((type) => type.active)?.id ?? ''
  const [number, setNumber] = useState(room?.number ?? '')
  const [floor, setFloor] = useState(room?.floor ?? '')
  const [typeId, setTypeId] = useState(room?.roomTypeId ?? firstType)
  const [beds, setBeds] = useState(String(room?.beds ?? 2))
  const [sellable, setSellable] = useState(room?.sellable ?? true)
  const [active, setActive] = useState(room?.active ?? true)
  const [validFrom, setValidFrom] = useState<LocalDate>(todayOf())
  const [errors, setErrors] = useState<{ number?: string; beds?: string; type?: string }>({})
  const create = useAdminMutation('rooms.create', {
    invalidate: ['rooms.list'],
    success: t('settings.rooms.roomAdded')
  })
  const update = useAdminMutation('rooms.update', {
    invalidate: ['rooms.list', 'rooms.capacityHistory'],
    success: t('settings.rooms.roomSaved'),
    errorDetail: staysDetail
  })
  const bedCount = int(beds)
  // Capacity (K-27): what the occupancy and ministry figures count. A change needs the day it applies from.
  const capacityChanged =
    room === null || bedCount !== room.beds || sellable !== room.sellable || active !== room.active
  // A change replaces the planned ones from its day on (the service withdraws them): say which.
  const replaces =
    room?.nextChange && capacityChanged && room.nextChange.validFrom >= validFrom ? room.nextChange : null

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const n = number.trim()
    const next: typeof errors = {}
    if (!n || n.length > 20) next.number = t('settings.rooms.numberRequired')
    else if (rooms.some((r) => r.number === n && r.id !== room?.id)) next.number = t('errors.roomNumberTaken')
    if (bedCount === null || bedCount < 1 || bedCount > 50) next.beds = t('settings.rooms.bedsInvalid')
    if (!typeId) next.type = t('settings.rooms.typeRequired')
    setErrors(next)
    const first = next.number ? 'number' : next.type ? 'type' : next.beds ? 'beds' : null
    if (first) {
      document.getElementById(`${formId}-${first}`)?.focus()
      return
    }
    const f = floor.trim() || null
    const beds = bedCount ?? 1
    if (!room) {
      create.mutate(
        { number: n, floor: f, roomTypeId: typeId, beds, sellable, validFrom },
        { onSuccess: onClose }
      )
      return
    }
    const patch = {
      ...(n !== room.number ? { number: n } : {}),
      ...(f !== room.floor ? { floor: f } : {}),
      ...(typeId !== room.roomTypeId ? { roomTypeId: typeId } : {}),
      ...(beds !== room.beds ? { beds } : {}),
      ...(sellable !== room.sellable ? { sellable } : {}),
      ...(active !== room.active ? { active } : {})
    }
    if (Object.keys(patch).length === 0) onClose()
    else update.mutate({ id: room.id, patch: { ...patch, validFrom } }, { onSuccess: onClose })
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={
        room ? t('settings.rooms.roomDialogEdit', { number: room.number }) : t('settings.rooms.roomDialogAdd')
      }
      footer={
        <DialogActions form={formId} pending={create.isPending || update.isPending} onCancel={onClose} />
      }
    >
      <form id={formId} className="grid gap-4" onSubmit={submit} noValidate>
        <div className="grid grid-cols-2 gap-4">
          <Field id={`${formId}-number`} label={t('settings.rooms.number')} error={errors.number}>
            <Input
              id={`${formId}-number`}
              value={number}
              maxLength={20}
              dir="ltr"
              autoComplete="off"
              aria-invalid={Boolean(errors.number) || undefined}
              aria-describedby={`${formId}-number-msg`}
              onChange={(e) => setNumber(e.target.value)}
              data-testid="room-number"
            />
          </Field>
          <Field id={`${formId}-floor`} label={t('settings.rooms.floor')}>
            <Input
              id={`${formId}-floor`}
              value={floor}
              maxLength={20}
              dir="ltr"
              autoComplete="off"
              onChange={(e) => setFloor(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-4">
          <Field id={`${formId}-type`} label={t('settings.rooms.type')} error={errors.type}>
            <TypeSelect
              id={`${formId}-type`}
              types={types}
              value={typeId}
              onChange={setTypeId}
              invalid={Boolean(errors.type)}
            />
          </Field>
          <Field id={`${formId}-beds`} label={t('settings.rooms.beds')} error={errors.beds}>
            <Input
              id={`${formId}-beds`}
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              dir="ltr"
              value={beds}
              aria-invalid={Boolean(errors.beds) || undefined}
              aria-describedby={`${formId}-beds-msg`}
              onChange={(e) => setBeds(e.target.value)}
              data-testid="room-beds"
            />
          </Field>
        </div>
        <SwitchRow
          id={`${formId}-sellable`}
          label={t('settings.rooms.sellable')}
          help={t('settings.rooms.sellableHelp')}
          checked={sellable}
          onChange={setSellable}
        />
        {room ? (
          <SwitchRow
            id={`${formId}-active`}
            label={t('settings.rooms.active')}
            help={t('settings.rooms.activeHelp')}
            checked={active}
            onChange={setActive}
          />
        ) : null}
        {capacityChanged ? (
          <ValidFrom id="room-valid-from" value={validFrom} onChange={setValidFrom} />
        ) : null}
        {replaces ? (
          <p className="text-muted-foreground text-sm" role="note" data-testid="replaces-plan">
            {t('settings.rooms.replacesPlan', {
              date: f.date(replaces.validFrom as LocalDate),
              what: summary(replaces)
            })}
          </p>
        ) : null}
        {room ? <CapacityHistory room={room} canEdit={canEdit} /> : null}
      </form>
    </ResponsiveDialog>
  )
}

// ── Rooms floor by floor ─────────────────────────────────────────────────────────────────────────────────

/** "1. kat, 4 oda" → 101…104; floor 0 → 1…4. */
function bulkNumbers(
  firstFloor: number,
  lastFloor: number,
  perFloor: number
): { number: string; floor: string }[] {
  const out: { number: string; floor: string }[] = []
  for (let floor = firstFloor; floor <= lastFloor; floor++)
    for (let i = 1; i <= perFloor; i++) out.push({ number: String(floor * 100 + i), floor: String(floor) })
  return out
}

/** Rooms one "floor by floor" save may add (rooms.createMany takes at most 500). */
export const BULK_MAX = 500

/** The floor above the highest numeric floor in use (1 for a hotel without rooms), at most 99. */
const nextFloor = (rooms: RoomView[]): number => {
  const floors = rooms.map((r) => Number(r.floor)).filter((f) => Number.isInteger(f) && f >= 0)
  return floors.length ? Math.min(99, Math.max(...floors) + 1) : 1
}

export function BulkRoomsDialog({
  types,
  rooms,
  onClose
}: {
  types: RoomTypeView[]
  rooms: RoomView[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const formId = useId()
  // Starts on the floor above the highest one in use: a hotel adding a floor need not change anything else.
  const [first, setFirst] = useState(() => String(nextFloor(rooms)))
  const [last, setLast] = useState(() => String(nextFloor(rooms)))
  const [perFloor, setPerFloor] = useState('4')
  const [typeId, setTypeId] = useState(types.find((type) => type.active)?.id ?? '')
  const [beds, setBeds] = useState('2')
  const [sellable, setSellable] = useState(true)
  const [validFrom, setValidFrom] = useState<LocalDate>(todayOf())
  const createMany = useAdminMutation('rooms.createMany', { invalidate: ['rooms.list'] })
  const a = int(first)
  const b = int(last)
  const n = int(perFloor)
  const bedCount = int(beds)
  const floorsOk = a !== null && b !== null && a <= 99 && b <= 99 && b >= a
  const perOk = n !== null && n >= 1 && n <= 99
  const bedsOk = bedCount !== null && bedCount >= 1 && bedCount <= 50
  const taken = useMemo(() => new Set(rooms.map((r) => r.number)), [rooms])
  const planned = floorsOk && perOk ? bulkNumbers(a, b, n) : []
  const fresh = planned.filter((p) => !taken.has(p.number))
  const skipped = planned.filter((p) => taken.has(p.number)).map((p) => p.number)
  const tooMany = fresh.length > BULK_MAX
  // The preview lists at most what one save may add; the rest is counted.
  const preview = [...fresh].sort((x, y) => numeric.compare(x.number, y.number)).slice(0, BULK_MAX)

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (!floorsOk || !perOk || !bedsOk || !typeId || fresh.length === 0 || tooMany) {
      const bad = !floorsOk ? 'first' : !perOk ? 'per' : !bedsOk ? 'beds' : null
      if (bad) document.getElementById(`${formId}-${bad}`)?.focus()
      return
    }
    createMany.mutate(
      {
        rooms: fresh.map((p, i) => ({
          number: p.number,
          floor: p.floor,
          roomTypeId: typeId,
          beds: bedCount,
          sellable,
          sort: i,
          validFrom
        }))
      },
      {
        onSuccess: (created) => {
          toast.success(t('settings.rooms.bulkAdded', { count: created.length }))
          onClose()
        }
      }
    )
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t('settings.rooms.bulkTitle')}
      description={t('settings.rooms.bulkHelp')}
      footer={
        <DialogActions
          form={formId}
          pending={createMany.isPending || fresh.length === 0 || tooMany}
          label={t('settings.rooms.bulkSubmit', { count: fresh.length })}
          onCancel={onClose}
        />
      }
    >
      <form id={formId} className="grid gap-4" onSubmit={submit} noValidate>
        <div className="grid grid-cols-3 items-end gap-3">
          <Field id={`${formId}-first`} label={t('settings.rooms.firstFloor')}>
            <Input
              id={`${formId}-first`}
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              dir="ltr"
              value={first}
              aria-invalid={!floorsOk || undefined}
              aria-describedby={`${formId}-floors-msg`}
              onChange={(e) => setFirst(e.target.value)}
              data-testid="bulk-first"
            />
          </Field>
          <Field id={`${formId}-last`} label={t('settings.rooms.lastFloor')}>
            <Input
              id={`${formId}-last`}
              type="number"
              inputMode="numeric"
              min={0}
              max={99}
              dir="ltr"
              value={last}
              aria-invalid={!floorsOk || undefined}
              aria-describedby={`${formId}-floors-msg`}
              onChange={(e) => setLast(e.target.value)}
              data-testid="bulk-last"
            />
          </Field>
          <Field id={`${formId}-per`} label={t('settings.rooms.perFloor')}>
            <Input
              id={`${formId}-per`}
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              dir="ltr"
              value={perFloor}
              aria-invalid={!perOk || undefined}
              aria-describedby={`${formId}-floors-msg`}
              onChange={(e) => setPerFloor(e.target.value)}
              data-testid="bulk-per"
            />
          </Field>
        </div>
        {/* Said as soon as the numbers are wrong: with nothing to add, the save button cannot be pressed. */}
        {!floorsOk || !perOk ? (
          <p
            id={`${formId}-floors-msg`}
            className="text-destructive -mt-2 text-xs"
            role="alert"
            data-testid="bulk-error"
          >
            {t(!floorsOk ? 'settings.rooms.floorInvalid' : 'settings.rooms.perFloorInvalid')}
          </p>
        ) : null}
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-4">
          <Field id={`${formId}-type`} label={t('settings.rooms.type')}>
            <TypeSelect id={`${formId}-type`} types={types} value={typeId} onChange={setTypeId} />
          </Field>
          <Field
            id={`${formId}-beds`}
            label={t('settings.rooms.beds')}
            error={!bedsOk ? t('settings.rooms.bedsInvalid') : null}
          >
            <Input
              id={`${formId}-beds`}
              type="number"
              inputMode="numeric"
              min={1}
              max={50}
              dir="ltr"
              value={beds}
              aria-invalid={!bedsOk || undefined}
              aria-describedby={`${formId}-beds-msg`}
              onChange={(e) => setBeds(e.target.value)}
            />
          </Field>
        </div>
        <SwitchRow
          id={`${formId}-sellable`}
          label={t('settings.rooms.sellable')}
          checked={sellable}
          onChange={setSellable}
        />
        <div className="grid gap-2" aria-live="polite">
          <p className="text-sm font-medium">{t('settings.rooms.bulkPreview')}</p>
          {tooMany ? (
            <p className="text-destructive text-sm" role="alert" data-testid="bulk-too-many">
              {t('settings.rooms.bulkTooMany', { count: fresh.length, max: BULK_MAX })}
            </p>
          ) : null}
          {fresh.length ? (
            <ul className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto" data-testid="bulk-preview">
              {preview.map((p) => (
                <li key={p.number}>
                  <Badge variant="secondary" className="tabular-nums">
                    {p.number}
                  </Badge>
                </li>
              ))}
              {tooMany ? (
                <li className="text-muted-foreground self-center text-xs">
                  {t('settings.rooms.bulkMore', { count: fresh.length - BULK_MAX })}
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">{t('settings.rooms.bulkNone')}</p>
          )}
          {skipped.length ? (
            <p className="text-muted-foreground text-xs">
              {t('settings.rooms.bulkSkipped', { numbers: skipped.join(', ') })}
            </p>
          ) : null}
        </div>
        <ValidFrom id="bulk-valid-from" value={validFrom} onChange={setValidFrom} />
      </form>
    </ResponsiveDialog>
  )
}
