// Otelde kalanlar (G-53, G-54, akislar.md "Gece"): every room in the house with its people, the descriptor note
// that lets the night shift recognise them without asking names, and the KBS marks with who set them and when — a
// person without a mark is loud. Searchable ("kızıl"), filterable to KBS gaps, people can be added and marked
// here, and the A4 night list prints. Room cards on the phone too (G-143). Reads `inHouse.list`.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  BedDoubleIcon,
  LogOutIcon,
  MessageSquareTextIcon,
  PrinterIcon,
  SearchIcon,
  SearchXIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  UserPlusIcon,
  UsersIcon
} from 'lucide-react'
import type { InHouseRoomDto, InHouseViewDto } from '@shared/contract/procedures/today'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { KpiCard } from '@/components/kpi-card'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { SectionCard } from '@/components/section-card'
import { EmptyState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { AddPersonDialog } from './add-person-dialog'
import { filterView, totalGaps } from './in-house-model'
import { InHousePeople } from './in-house-people'
import { useWhen } from './use-when'
import { NightList } from './night-list'

const INVALIDATES = ['inHouse.list', 'today.summary', 'reservations.grid', 'booking.get'] as const

/** The add-person icon of a room card: on the card's header on the phone, at the row's end on the desktop. */
function AddToRoom({ room, onAdd, quiet = false }: { room: string; onAdd: () => void; quiet?: boolean }) {
  const { t } = useTranslation()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={quiet ? 'ghost' : 'outline'}
          size="icon-sm"
          className={cn(quiet && 'text-muted-foreground')}
          onClick={onAdd}
          aria-label={t('inHouse.addPersonTo', { room })}
        >
          <UserPlusIcon />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t('inHouse.addPerson')}</TooltipContent>
    </Tooltip>
  )
}

function RoomStayCard({
  room,
  today,
  checks,
  canEdit,
  busy,
  onAdd,
  onMark
}: {
  room: InHouseRoomDto
  today: string
  checks: boolean
  canEdit: boolean
  busy: boolean
  onAdd: () => void
  onMark: (occupantId: string, mark: 'reported' | 'clearReported') => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const isMobile = useIsMobile()
  const leaving = room.checkOut <= today
  const showMoney = room.balanceMinor !== null
  const balance = room.balanceMinor ?? 0
  return (
    <li
      className="min-w-0"
      data-testid={`in-house-room-${room.roomNumber}`}
      aria-label={t('inHouse.roomTitle', { room: room.roomNumber })}
    >
      <Card
        className={cn(
          'grid gap-2 p-3 md:grid-cols-[6.5rem_minmax(0,1fr)_auto] md:items-start md:gap-4 md:px-4',
          room.kbsGaps > 0 && 'border-destructive/60 ring-destructive/20 ring-1'
        )}
      >
        {/* min-w-0 and a wrapping badge keep the narrow desktop column from spilling over the people list. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 md:flex-col md:items-start md:gap-1 md:pt-1">
          <span className="text-2xl leading-none font-semibold tabular-nums">{room.roomNumber}</span>
          <span className="text-muted-foreground text-xs break-words">
            {room.roomTypeNameI18n
              ? f.name({
                  tr: room.roomTypeNameI18n.tr ?? room.roomTypeName,
                  en: room.roomTypeNameI18n.en ?? room.roomTypeName,
                  ru: room.roomTypeNameI18n.ru ?? room.roomTypeName
                })
              : room.roomTypeName}
          </span>
          {room.kbsGaps > 0 || (isMobile && canEdit) ? (
            <span className="flex max-w-full items-center gap-1 max-md:ms-auto">
              {room.kbsGaps > 0 ? (
                <Badge variant="destructive" className="h-auto max-w-full gap-1 whitespace-normal">
                  <ShieldAlertIcon aria-hidden />
                  {t('inHouse.gapBadge', { count: room.kbsGaps })}
                </Badge>
              ) : null}
              {isMobile && canEdit ? <AddToRoom room={room.roomNumber} onAdd={onAdd} quiet /> : null}
            </span>
          ) : null}
        </div>

        {/* The descriptor note wraps instead of being cut: it is what the night shift reads. */}
        <div className="grid min-w-0 content-start gap-2">
          {room.occupants.length ? (
            <InHousePeople
              occupants={room.occupants}
              checks={checks}
              canEdit={canEdit}
              busy={busy}
              onMark={onMark}
            />
          ) : (
            <p className="border-destructive/50 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-sm font-medium">
              {t('inHouse.noOccupants')}
            </p>
          )}
          {room.note ? (
            <p className="text-info flex items-start gap-1.5 text-xs">
              <MessageSquareTextIcon className="mt-px size-3.5 shrink-0" aria-label={t('inHouse.request')} />
              <span className="min-w-0 break-words">{room.note}</span>
            </p>
          ) : null}
        </div>

        {/* Phone: one short line (people · check-out · balance) under a rule; desktop: labelled columns. */}
        <div className="flex items-start gap-x-5 max-md:border-t max-md:pt-2 md:pt-1">
          <dl className="flex flex-1 flex-wrap items-baseline gap-x-4 gap-y-1 text-sm md:flex-none md:flex-nowrap md:items-start md:gap-5">
            <div className="flex items-baseline gap-1.5 md:grid md:w-16 md:content-start md:gap-0.5">
              <dt className="text-muted-foreground text-xs max-md:sr-only">{t('inHouse.people')}</dt>
              <dd className="font-medium tabular-nums">{t('inHouse.pax', { count: room.people })}</dd>
            </div>
            <div className="flex items-baseline gap-1.5 md:grid md:w-28 md:content-start md:gap-0.5">
              <dt className="text-muted-foreground text-xs">{t('inHouse.checkOut')}</dt>
              <dd className="font-medium">
                {leaving ? (
                  <Badge variant="outline" className="border-warning text-foreground">
                    {t('inHouse.leavesToday')}
                  </Badge>
                ) : (
                  <span className="whitespace-nowrap">
                    {f.dayMonth(room.checkOut)}{' '}
                    <span className="text-muted-foreground font-normal">{f.weekday(room.checkOut)}</span>
                  </span>
                )}
              </dd>
            </div>
            {showMoney ? (
              <div className="flex items-baseline gap-1.5 md:grid md:w-24 md:content-start md:gap-0.5 md:text-end">
                <dt className="text-muted-foreground text-xs">{t('inHouse.balance')}</dt>
                <dd
                  className={cn(
                    'font-semibold tabular-nums',
                    balance > 0 ? 'text-destructive' : 'text-success'
                  )}
                >
                  {balance > 0 ? (
                    <bdi>{f.money(balance, room.currency ?? undefined)}</bdi>
                  ) : (
                    t('inHouse.settled')
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
          {!isMobile && canEdit ? <AddToRoom room={room.roomNumber} onAdd={onAdd} /> : null}
        </div>
      </Card>
    </li>
  )
}

/** People who left without the KBS check-out mark (the legal check-out notice is still to do). */
function CheckoutPending({
  pending,
  canEdit,
  busy,
  onMark
}: {
  pending: InHouseViewDto['checkoutPending']
  canEdit: boolean
  busy: boolean
  onMark: (occupantId: string) => void
}) {
  const { t } = useTranslation()
  const when = useWhen()
  return (
    <SectionCard
      title={t('inHouse.pending.title')}
      icon={LogOutIcon}
      count={pending.length}
      tone="warn"
      testId="in-house-checkout-pending"
    >
      <p className="text-muted-foreground mb-2 text-sm">{t('inHouse.pending.body')}</p>
      <ul className="grid gap-2">
        {pending.map((p) => (
          <li
            key={p.occupantId}
            className="border-destructive/50 bg-destructive/5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2"
          >
            <span className="bg-muted grid h-7 min-w-10 place-items-center rounded-md px-1.5 text-xs font-semibold tabular-nums">
              {p.roomNumber}
            </span>
            <span className="min-w-28 flex-1 text-sm">
              <span className="font-medium break-words">{p.fullName}</span>
              {p.leftAt ? (
                <span className="text-muted-foreground block text-xs">
                  {t('inHouse.pending.leftAt', { when: when(p.leftAt) })}
                </span>
              ) : null}
              {/* The entry was never ticked here either: the one button marks both (KBS has no exit without it). */}
              {p.kbsReported ? null : (
                <span className="text-muted-foreground block text-xs" data-testid="pending-no-entry">
                  {t('inHouse.pending.noEntry')}
                </span>
              )}
            </span>
            <Badge variant="destructive" className="gap-1">
              <ShieldAlertIcon aria-hidden />
              {t('occupants.kbsMissingOut')}
            </Badge>
            {canEdit ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onMark(p.occupantId)}>
                {t('occupants.markOut')}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}

function InHouseView({ view, onAdd }: { view: InHouseViewDto; onAdd: (stayId: string | null) => void }) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const canEdit = can('in_house', 'edit')
  const [search, setSearch] = useState('')
  const [onlyGaps, setOnlyGaps] = useState(false)
  const shown = useMemo(() => filterView(view, search, onlyGaps), [view, search, onlyGaps])
  const gaps = totalGaps(view)
  const mark = useApiMutation('inHouse.markKbs', {
    invalidates: INVALIDATES,
    onSuccess: (_, input) =>
      void toast.success(
        t(
          input.mark === 'clearReported'
            ? 'inHouse.kbs.cleared'
            : input.mark === 'checkout'
              ? 'inHouse.kbs.checkoutSaved'
              : 'inHouse.kbs.saved'
        )
      ),
    onError: (e) =>
      void toast.error(t(e.messageKey as 'errors.internal', { defaultValue: t('errors.internal') }))
  })
  const clear = (): void => {
    setSearch('')
    setOnlyGaps(false)
  }
  const clearButton = (
    <Button variant="outline" size="sm" onClick={clear}>
      {t('common.clearFilter')}
    </Button>
  )

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="in-house-summary">
        <KpiCard
          label={t('inHouse.summary.rooms')}
          value={f.number(view.rooms.length)}
          icon={<BedDoubleIcon className="size-3.5" aria-hidden />}
        />
        <KpiCard
          label={t('inHouse.summary.people')}
          value={f.number(view.rooms.reduce((n, r) => n + r.people, 0))}
          icon={<UsersIcon className="size-3.5" aria-hidden />}
        />
        <KpiCard
          label={t('inHouse.summary.leaving')}
          value={f.number(view.rooms.filter((r) => r.checkOut <= view.today).length)}
          icon={<LogOutIcon className="size-3.5" aria-hidden />}
        />
        <KpiCard
          label={t('inHouse.summary.kbsGaps')}
          value={f.number(gaps)}
          className={cn(gaps > 0 && 'border-destructive/50 bg-destructive/5')}
          icon={
            gaps > 0 ? (
              <ShieldAlertIcon className="text-destructive size-3.5" aria-hidden />
            ) : (
              <ShieldCheckIcon className="text-success size-3.5" aria-hidden />
            )
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="relative min-w-0 flex-1 basis-64">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('inHouse.searchPlaceholder')}
            aria-label={t('inHouse.searchLabel')}
            className="ps-9"
          />
        </div>
        <Label className="min-h-11 cursor-pointer font-normal md:min-h-9">
          <Switch checked={onlyGaps} onCheckedChange={setOnlyGaps} />
          {t('inHouse.onlyGaps')}
        </Label>
      </div>

      {shown.pending.length ? (
        <CheckoutPending
          pending={shown.pending}
          canEdit={canEdit}
          busy={mark.isPending}
          onMark={(occupantId) => mark.mutate({ occupantId, mark: 'checkout' })}
        />
      ) : null}

      {shown.rooms.length ? (
        <ul className="grid gap-3" aria-label={t('nav.inHouse')}>
          {shown.rooms.map((room) => (
            <RoomStayCard
              key={room.stayId}
              room={room}
              today={view.today}
              checks={view.kbsChecks}
              canEdit={canEdit}
              busy={mark.isPending}
              onAdd={() => onAdd(room.stayId)}
              onMark={(occupantId, m) => mark.mutate({ occupantId, mark: m })}
            />
          ))}
        </ul>
      ) : view.rooms.length === 0 ? (
        <EmptyState
          compact
          icon={BedDoubleIcon}
          title={t('inHouse.emptyTitle')}
          body={t('inHouse.emptyBody')}
        />
      ) : onlyGaps && !shown.needle ? (
        <EmptyState
          compact
          icon={ShieldCheckIcon}
          title={t('inHouse.noGapsTitle')}
          body={t('inHouse.noGaps')}
          action={clearButton}
        />
      ) : (
        <EmptyState
          compact
          icon={SearchXIcon}
          title={t('inHouse.noMatch')}
          body={t('common.noMatchBody')}
          action={clearButton}
        />
      )}
    </div>
  )
}

function InHouseSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-4">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-9 w-full" aria-hidden />
      <div className="grid gap-3" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    </div>
  )
}

export function InHousePage() {
  const { t } = useTranslation()
  const can = useCan()
  const query = useApiQuery('inHouse.list', {}, { refetchInterval: 60_000 })
  const [adding, setAdding] = useState<{ stayId: string | null; n: number } | null>(null)
  const rooms = query.data?.rooms ?? []
  const open = (stayId: string | null): void => setAdding({ stayId, n: (adding?.n ?? 0) + 1 })
  const hasRooms = rooms.length > 0
  return (
    <Page
      title={t('nav.inHouse')}
      description={t('inHouse.description')}
      actions={
        <>
          {hasRooms ? (
            <Button
              variant="outline"
              onClick={() => window.print()}
              className="max-md:hidden"
              data-testid="in-house-print"
            >
              <PrinterIcon aria-hidden />
              {t('inHouse.print')}
            </Button>
          ) : null}
          {/* The main action, a worded button (on the phone too); a person joins a live stay, so none without one. */}
          {hasRooms && can('in_house', 'edit') ? (
            <Button onClick={() => open(null)} data-testid="in-house-add">
              <UserPlusIcon aria-hidden />
              {t('inHouse.addPerson')}
            </Button>
          ) : null}
        </>
      }
    >
      <QueryView
        query={query}
        loading={<InHouseSkeleton />}
        isEmpty={(v) => v.rooms.length === 0 && v.checkoutPending.length === 0}
        empty={{ icon: BedDoubleIcon, title: t('inHouse.emptyTitle'), body: t('inHouse.emptyBody') }}
      >
        {(view) => (
          <>
            <InHouseView view={view} onAdd={open} />
            <NightList view={view} />
          </>
        )}
      </QueryView>
      {adding ? (
        <AddPersonDialog
          key={adding.n}
          open
          onOpenChange={(o) => (o ? null : setAdding(null))}
          rooms={rooms}
          stayId={adding.stayId}
        />
      ) : null}
    </Page>
  )
}
