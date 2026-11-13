// "Odalar ve tipler" (G-11, G-12, G-48, K-27): the room types the hotel uses with their suggested weekday and
// weekend prices, the long seeded list to pick more from, the hotel's own types; then the rooms — number, floor,
// type, beds, sellable, in use — one by one or floor by floor. Rooms and beds count from a validity date, so past
// months' occupancy and the ministry figures use the rooms of that day (capacity history).
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BedDoubleIcon, LayersIcon, ListPlusIcon, PencilIcon, PlusIcon } from 'lucide-react'
import type { RoomTypeView, RoomView, SettingsValues } from '@shared/contract'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery, useUpdateSettings } from '@/lib/api/hooks'
import { toast } from 'sonner'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import type { LocalDate } from '@shared/date'
import { BulkRoomsDialog, MoreTypesDialog, RoomDialog, RoomTypeDialog } from './room-dialogs'
import { useCapacitySummary } from './use-capacity-summary'
import { useAdminMutation, useLocalName } from './use-admin'

const numeric = new Intl.Collator(undefined, { numeric: true })
const byNumber = (a: RoomView, b: RoomView): number => a.sort - b.sort || numeric.compare(a.number, b.number)

type TypeDialog = { mode: 'add' } | { mode: 'edit'; type: RoomTypeView } | null
type RoomDialogState = { mode: 'add' } | { mode: 'edit'; room: RoomView } | null

function TypesCard({
  types,
  rooms,
  values,
  canEdit
}: {
  types: RoomTypeView[]
  rooms: RoomView[]
  values: SettingsValues
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const nameOf = useLocalName()
  const [dialog, setDialog] = useState<TypeDialog>(null)
  const [more, setMore] = useState(false)
  const setActive = useAdminMutation('rooms.updateType', { invalidate: ['rooms.listTypes'] })
  // A hotel's own type that was switched off stays in the table (faded) so it can be switched on again; seeded
  // types that are off wait in "Daha fazla tip".
  const used = types.filter((type) => type.active || type.isCustom)
  const roomsOf = (id: string): number => rooms.filter((r) => r.roomTypeId === id && r.active).length
  const price = (minor: number | null, type: RoomTypeView) =>
    minor === null ? (
      <span className="text-muted-foreground">{t('settings.rooms.noPrice')}</span>
    ) : (
      <bdi>{f.money(minor, type.baseCurrency ?? values['hotel.baseCurrency'])}</bdi>
    )

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 basis-64 gap-1.5">
          <CardTitle>{t('settings.rooms.typesTitle')}</CardTitle>
          <CardDescription>{t('settings.rooms.typesHelp')}</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2 max-md:w-full max-md:[&>button]:flex-1">
          <Button variant="outline" size="sm" disabled={!canEdit} onClick={() => setMore(true)}>
            <ListPlusIcon aria-hidden />
            {t('settings.rooms.moreTypes')}
          </Button>
          {/* Outline: "Oda ekle" below is the screen's one filled button. */}
          <Button
            variant="outline"
            size="sm"
            disabled={!canEdit}
            onClick={() => setDialog({ mode: 'add' })}
            data-testid="add-type"
          >
            <PlusIcon aria-hidden />
            {t('settings.rooms.addType')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="contain-inline-size">
        {used.length === 0 ? (
          <EmptyState
            compact
            icon={LayersIcon}
            title={t('settings.rooms.typesEmptyTitle')}
            body={t('settings.rooms.typesEmptyBody')}
          />
        ) : (
          <Table data-testid="type-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t('settings.rooms.col.name')}</TableHead>
                <TableHead className="text-end">{t('settings.rooms.col.price')}</TableHead>
                <TableHead className="text-end max-md:hidden">{t('settings.rooms.col.weekend')}</TableHead>
                <TableHead className="text-end max-md:hidden">{t('settings.hourly.col')}</TableHead>
                <TableHead className="text-end max-md:hidden">{t('settings.rooms.col.rooms')}</TableHead>
                <TableHead className="max-md:hidden">{t('settings.lists.col.active')}</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">{t('common.edit')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {used.map((type) => {
                const name = nameOf(type.nameI18n, type.name)
                const count = roomsOf(type.id)
                return (
                  <TableRow
                    key={type.id}
                    data-testid={`type-${type.code}`}
                    className={type.active ? undefined : 'text-muted-foreground opacity-60'}
                  >
                    <TableCell className="max-w-56 font-medium break-words whitespace-normal max-md:max-w-40">
                      {name}
                      {type.isCustom ? (
                        <Badge variant="outline" className="ms-2">
                          {t('settings.rooms.custom')}
                        </Badge>
                      ) : null}
                      {type.active ? null : (
                        <Badge variant="outline" className="ms-2">
                          {t('settings.rooms.typeOff')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {price(type.basePriceMinor, type)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums max-md:hidden">
                      {price(type.weekendPriceMinor, type)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums max-md:hidden">
                      {price(type.hourlyPriceMinor ?? null, type)}
                    </TableCell>
                    <TableCell className="text-end tabular-nums max-md:hidden">{count}</TableCell>
                    <TableCell className="max-md:hidden">
                      <Switch
                        checked={type.active}
                        // A type rooms still use stays on: change those rooms first.
                        disabled={!canEdit || count > 0}
                        title={count > 0 ? t('settings.rooms.typeHasRooms') : undefined}
                        aria-label={t('settings.lists.active', { name })}
                        onCheckedChange={(active) => setActive.mutate({ id: type.id, patch: { active } })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={!canEdit}
                        aria-label={t('settings.lists.edit', { name })}
                        onClick={() => setDialog({ mode: 'edit', type })}
                      >
                        <PencilIcon />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
        <TurnoverField minutes={values['dayUse.turnoverMinutes']} canEdit={canEdit} />
      </CardContent>
      {dialog ? (
        <RoomTypeDialog
          type={dialog.mode === 'edit' ? dialog.type : null}
          roomCount={dialog.mode === 'edit' ? roomsOf(dialog.type.id) : 0}
          values={values}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {more ? <MoreTypesDialog types={types} onClose={() => setMore(false)} /> : null}
    </Card>
  )
}

/** `dayUse.turnoverMinutes` (K-48, S-103): the cleaning time an hourly sale is warned about; saved when the field is left. */
function TurnoverField({ minutes, canEdit }: { minutes: number; canEdit: boolean }) {
  const { t } = useTranslation()
  const id = useId()
  const update = useUpdateSettings()
  const [text, setText] = useState(String(minutes))
  const [invalid, setInvalid] = useState(false)
  const save = (): void => {
    const n = Number(text.trim())
    if (!/^\d{1,3}$/.test(text.trim()) || n > 240) return setInvalid(true)
    setInvalid(false)
    if (n !== minutes)
      update.mutate(
        { 'dayUse.turnoverMinutes': n },
        { onSuccess: () => toast.success(t('settings.hourly.turnoverSaved')) }
      )
  }
  return (
    <div className="mt-4 grid max-w-sm gap-1.5" data-testid="turnover-field">
      <Label htmlFor={id}>{t('settings.hourly.turnover')}</Label>
      <Input
        id={id}
        inputMode="numeric"
        dir="ltr"
        value={text}
        disabled={!canEdit}
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          setText(e.target.value)
          setInvalid(false)
        }}
        onBlur={save}
      />
      {invalid ? (
        <p role="alert" className="text-destructive text-sm">
          {t('settings.hourly.turnoverInvalid')}
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">{t('settings.hourly.turnoverHelp')}</p>
      )}
    </div>
  )
}

function RoomsCard({
  types,
  rooms,
  canEdit
}: {
  types: RoomTypeView[]
  rooms: RoomView[]
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const nameOf = useLocalName()
  const summary = useCapacitySummary()
  const [dialog, setDialog] = useState<RoomDialogState>(null)
  const [bulk, setBulk] = useState(false)
  const typeName = (id: string): string => {
    const type = types.find((x) => x.id === id)
    return type ? nameOf(type.nameI18n, type.name) : ''
  }
  const sorted = useMemo(() => [...rooms].sort(byNumber), [rooms])
  const open = rooms.filter((r) => r.active)
  const beds = open.reduce((sum, r) => sum + r.beds, 0)
  const sellable = open.filter((r) => r.sellable).length
  const noTypes = !types.some((type) => type.active)

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 basis-64 gap-1.5">
          <CardTitle>{t('settings.rooms.roomsTitle')}</CardTitle>
          <CardDescription>{t('settings.rooms.roomsHelp')}</CardDescription>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm font-medium" data-testid="room-summary">
            <span>{t('settings.rooms.roomCount', { count: open.length })}</span>
            <span>{t('settings.rooms.bedCount', { count: beds })}</span>
            <span className="text-muted-foreground font-normal">
              {t('settings.rooms.sellableCount', { count: sellable })}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 max-md:w-full max-md:[&>button]:flex-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!canEdit || noTypes}
            onClick={() => setBulk(true)}
            data-testid="bulk-rooms"
          >
            <LayersIcon aria-hidden />
            {t('settings.rooms.bulkAdd')}
          </Button>
          <Button
            size="sm"
            disabled={!canEdit || noTypes}
            onClick={() => setDialog({ mode: 'add' })}
            data-testid="add-room"
          >
            <PlusIcon aria-hidden />
            {t('settings.rooms.addRoom')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="contain-inline-size">
        {sorted.length === 0 ? (
          <EmptyState
            compact
            icon={BedDoubleIcon}
            title={t('settings.rooms.emptyTitle')}
            body={t(noTypes ? 'settings.rooms.noTypes' : 'settings.rooms.emptyBody')}
          />
        ) : (
          <Table data-testid="room-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t('settings.rooms.col.number')}</TableHead>
                <TableHead className="text-end max-md:hidden">{t('settings.rooms.col.floor')}</TableHead>
                <TableHead>{t('settings.rooms.col.type')}</TableHead>
                <TableHead className="text-end">{t('settings.rooms.col.beds')}</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">{t('common.edit')}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((room) => (
                <TableRow
                  key={room.id}
                  className={cn(!room.active && 'text-muted-foreground')}
                  data-testid={`room-${room.number}`}
                >
                  <TableCell className="font-semibold whitespace-normal tabular-nums">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {room.number}
                      {room.opensOn ? (
                        <Badge variant="outline">
                          {t('settings.rooms.opensOn', { date: f.dayMonth(room.opensOn as LocalDate) })}
                        </Badge>
                      ) : !room.active ? (
                        <Badge variant="outline">{t('settings.rooms.inactive')}</Badge>
                      ) : !room.sellable ? (
                        <Badge variant="outline">{t('settings.lists.notSellable')}</Badge>
                      ) : null}
                      {room.nextChange && !room.opensOn ? (
                        <Badge variant="secondary" data-testid={`planned-${room.number}`}>
                          {t('settings.rooms.changesOn', {
                            date: f.dayMonth(room.nextChange.validFrom as LocalDate),
                            what: summary(room.nextChange)
                          })}
                        </Badge>
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-end tabular-nums max-md:hidden">{room.floor ?? '—'}</TableCell>
                  <TableCell className="max-w-56 break-words whitespace-normal max-md:max-w-32">
                    {typeName(room.roomTypeId)}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{room.beds}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={!canEdit}
                      aria-label={t('settings.rooms.editRoom', { number: room.number })}
                      onClick={() => setDialog({ mode: 'edit', room })}
                    >
                      <PencilIcon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {dialog ? (
        <RoomDialog
          room={dialog.mode === 'edit' ? dialog.room : null}
          types={types}
          rooms={rooms}
          canEdit={canEdit}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {bulk ? <BulkRoomsDialog types={types} rooms={rooms} onClose={() => setBulk(false)} /> : null}
    </Card>
  )
}

export function RoomsSection({ values }: { values: SettingsValues }) {
  const can = useCan()
  const canEdit = can('settings.rooms', 'edit')
  const types = useApiQuery('rooms.listTypes', { includeInactive: true })
  const rooms = useApiQuery('rooms.list', { includeInactive: true })
  if (types.isPending || rooms.isPending) return <LoadingState />
  if (types.isError || rooms.isError || !types.data || !rooms.data)
    return (
      <ErrorState
        error={types.error ?? rooms.error}
        onRetry={() => {
          void types.refetch()
          void rooms.refetch()
        }}
      />
    )
  return (
    <div className="grid gap-6">
      <TypesCard types={types.data} rooms={rooms.data} values={values} canEdit={canEdit} />
      <RoomsCard types={types.data} rooms={rooms.data} canEdit={canEdit} />
    </div>
  )
}
