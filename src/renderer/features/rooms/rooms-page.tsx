// Oda durumu (G-90, S-96, G-180, G-38): the floor plan — rooms floor by floor with their housekeeping state, who
// is in them, today's movement and open issues — or a list; filter by state with the count of each; a room opens
// its sheet (change state, note, issues, block). Check-out makes a room dirty by itself (S-14). Roles that do not
// work with reservations (housekeeping, S-97) get the plain view: the dirty rooms with one "cleaned" button each,
// then every room. Phone (S-66): tiles with a one-tap "cleaned".
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  BanIcon,
  CheckIcon,
  InfoIcon,
  LayoutGridIcon,
  ListIcon,
  PlusIcon,
  SparklesIcon,
  WrenchIcon
} from 'lucide-react'
import type { BoardView } from '@shared/contract/procedures/housekeeping'
import type { LocalDate } from '@shared/date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { FloorPlan, HK_TILE } from '@/components/floor-plan'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { EmptyState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { IssueDialog } from '@/features/issues/issue-dialog'
import { useWhen } from '@/features/issues/issue-utils'
import { floorOf, HK_STATES, planRoom, typeLabelOf, type HkState, type RoomInfo } from './room-model'
import { HkDot, RoomSheet } from './room-sheet'
import { useSetStatus } from './use-set-status'

const VIEWS = ['plan', 'list'] as const
type View = (typeof VIEWS)[number]
const VIEW_ICON = { plan: LayoutGridIcon, list: ListIcon } as const
type Filter = 'all' | HkState
const FILTERS: readonly Filter[] = ['all', ...HK_STATES]

function TodayMarks({ info }: { info: RoomInfo }) {
  const { t } = useTranslation()
  if (!info.arriving && !info.departing) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex flex-wrap gap-1.5">
      {info.departing ? (
        <Badge variant="outline" className="border-warning gap-1">
          <ArrowUpFromLineIcon aria-hidden />
          {t('rooms.departing')}
        </Badge>
      ) : null}
      {info.arriving ? (
        <Badge variant="outline" className="border-success gap-1">
          <ArrowDownToLineIcon aria-hidden />
          {t('rooms.arriving')}
        </Badge>
      ) : null}
    </span>
  )
}

function BlockBadge({ info }: { info: RoomInfo }) {
  const { t } = useTranslation()
  const f = useFormat()
  if (!info.block) return null
  return (
    <Badge variant={info.block.active ? 'destructive' : 'outline'} className="gap-1">
      <BanIcon aria-hidden />
      {info.block.active
        ? t(`rooms.blockKind.${info.block.kind}`)
        : t('rooms.blockFrom', { date: f.dayMonth(info.block.dateFrom) })}
    </Badge>
  )
}

function RoomList({
  infos,
  today,
  showGuests,
  onOpen
}: {
  infos: RoomInfo[]
  today: LocalDate
  showGuests: boolean
  onOpen: (id: string) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const when = useWhen(today)
  return (
    <Card className="min-w-0 gap-0 overflow-hidden py-0" data-testid="room-list">
      <Table density="compact">
        <TableHeader>
          <TableRow>
            <TableHead className="ps-4 text-start">{t('common.room')}</TableHead>
            <TableHead className="text-start">{t('rooms.col.hk')}</TableHead>
            {showGuests ? <TableHead className="text-start">{t('rooms.col.guest')}</TableHead> : null}
            <TableHead className="text-start">{t('rooms.col.today')}</TableHead>
            <TableHead className="text-start">{t('rooms.col.notes')}</TableHead>
            <TableHead className="pe-4 text-start">{t('rooms.col.changed')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {infos.map((info) => (
            <TableRow key={info.id} data-testid={`room-row-${info.number}`}>
              <TableCell className="ps-4">
                <Button
                  variant="link"
                  className="h-auto p-0 text-base font-semibold tabular-nums"
                  onClick={() => onOpen(info.id)}
                  aria-label={t('rooms.open', { room: info.number })}
                >
                  {info.number}
                </Button>
                <span className="text-muted-foreground block text-xs">{typeLabelOf(info, f)}</span>
              </TableCell>
              <TableCell className="max-w-56 whitespace-normal">
                <span className="inline-flex items-center gap-2">
                  <HkDot state={info.hk} />
                  {t(`hk.${info.hk}`)}
                </span>
                {info.hkNote ? (
                  <span className="text-muted-foreground block text-xs break-words">{info.hkNote}</span>
                ) : null}
              </TableCell>
              {showGuests ? (
                <TableCell className="max-w-48 break-words whitespace-normal">
                  {info.guest ?? <span className="text-muted-foreground">{t('rooms.vacant')}</span>}
                </TableCell>
              ) : null}
              <TableCell>
                <TodayMarks info={info} />
              </TableCell>
              <TableCell>
                <span className="flex flex-wrap gap-1.5">
                  {info.openIssues ? (
                    <Badge variant="secondary" className="gap-1">
                      <WrenchIcon className="text-hk-maintenance" aria-hidden />
                      {t('rooms.issues', { count: info.openIssues })}
                    </Badge>
                  ) : null}
                  <BlockBadge info={info} />
                  {!info.openIssues && !info.block ? <span className="text-muted-foreground">—</span> : null}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground pe-4 text-xs whitespace-normal">
                {info.hkAt ? (
                  <>
                    <span className="block">{info.hkByName ?? t('rooms.sheet.system')}</span>
                    <span className="block">{when(info.hkAt)}</span>
                  </>
                ) : (
                  '—'
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

/** Tiles (phone, and the plain view's room grid): floors as headings; a dirty room is made clean with one tap. */
function RoomTiles({
  infos,
  onOpen,
  canEdit,
  occupied
}: {
  infos: RoomInfo[]
  onOpen: (id: string) => void
  canEdit: boolean
  occupied: string
}) {
  const { t } = useTranslation()
  const setStatus = useSetStatus()
  const floors = [...new Set(infos.map(floorOf))].sort((a, b) => b - a)
  return (
    <div className="grid gap-4" data-testid="room-tiles">
      {floors.map((floor) => (
        <section key={floor} aria-labelledby={`floor-${floor}`} className="grid gap-2">
          <h2
            id={`floor-${floor}`}
            className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
          >
            {t('rooms.floor', { floor })}
          </h2>
          {/* Each tile is as tall as it needs: a clean room is not stretched to its dirty neighbour's button. */}
          <ul className="grid grid-cols-2 items-start gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {infos
              .filter((i) => floorOf(i) === floor)
              .map((info) => (
                <li
                  key={info.id}
                  className={cn(
                    'bg-card grid content-start gap-1 rounded-xl border-2 p-1.5',
                    HK_TILE[info.hk]
                  )}
                  data-testid={`room-tile-${info.number}`}
                >
                  <button
                    type="button"
                    onClick={() => onOpen(info.id)}
                    className="focus-visible:ring-ring grid min-h-14 content-start gap-0.5 rounded-lg px-1.5 py-1 text-start outline-none focus-visible:ring-[3px]"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-lg font-semibold tabular-nums">{info.number}</span>
                      <HkDot state={info.hk} />
                      <span className="ms-auto flex items-center gap-1">
                        {info.openIssues ? (
                          <WrenchIcon
                            className="text-hk-maintenance size-4"
                            aria-label={t('rooms.issues', { count: info.openIssues })}
                          />
                        ) : null}
                        {info.block?.active ? (
                          <BanIcon className="text-destructive size-4" aria-label={t('floorPlan.blocked')} />
                        ) : null}
                      </span>
                    </span>
                    <span className="text-xs font-medium">{t(`hk.${info.hk}`)}</span>
                    <span className="text-muted-foreground line-clamp-2 text-xs break-words">
                      {info.hkNote ?? info.guest ?? (info.occupied ? occupied : t('rooms.vacant'))}
                    </span>
                  </button>
                  {canEdit && info.hk === 'dirty' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      disabled={setStatus.isPending}
                      onClick={() =>
                        setStatus.mutate({ roomId: info.id, number: info.number, status: 'clean' })
                      }
                      aria-label={t('rooms.markCleanOne', { room: info.number })}
                    >
                      <CheckIcon aria-hidden />
                      {t('rooms.markClean')}
                    </Button>
                  ) : null}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Housekeeping (S-97): the dirty rooms first — one "cleaned" button each — then every room. */
function PlainView({
  infos,
  onOpen,
  canEdit
}: {
  infos: RoomInfo[]
  onOpen: (id: string) => void
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const setStatus = useSetStatus()
  const dirty = infos.filter((i) => i.hk === 'dirty')
  return (
    <div className="grid gap-6" data-testid="plain-view">
      <section aria-labelledby="dirty-rooms" className="grid gap-2">
        <h2 id="dirty-rooms" className="flex items-center gap-2 text-sm font-semibold">
          <SparklesIcon className="text-muted-foreground size-4" aria-hidden />
          {t('rooms.plain.dirtyTitle')}
          <Badge variant={dirty.length ? 'destructive' : 'secondary'} className="tabular-nums">
            {dirty.length}
          </Badge>
        </h2>
        {dirty.length ? (
          <ul className="grid gap-2 md:grid-cols-2" data-testid="dirty-list">
            {dirty.map((info) => (
              <li
                key={info.id}
                className="bg-card border-hk-dirty flex items-center gap-3 rounded-xl border-2 p-3"
                data-testid={`dirty-${info.number}`}
              >
                <button
                  type="button"
                  onClick={() => onOpen(info.id)}
                  className="focus-visible:ring-ring grid min-h-11 min-w-0 flex-1 content-center gap-0.5 rounded-lg text-start outline-none focus-visible:ring-[3px]"
                >
                  <span className="text-lg font-semibold tabular-nums">
                    {t('rooms.sheet.title', { room: info.number })}
                  </span>
                  <span className="text-muted-foreground text-xs break-words">
                    {[
                      info.departing ? t('rooms.departing') : null,
                      info.arriving ? t('rooms.arriving') : null,
                      info.hkNote
                    ]
                      .filter(Boolean)
                      .join(' · ') || t(`hk.${info.hk}`)}
                  </span>
                </button>
                {canEdit ? (
                  <Button
                    size="lg"
                    disabled={setStatus.isPending}
                    onClick={() =>
                      setStatus.mutate({ roomId: info.id, number: info.number, status: 'clean' })
                    }
                    aria-label={t('rooms.markCleanOne', { room: info.number })}
                    data-testid={`clean-${info.number}`}
                  >
                    <CheckIcon aria-hidden />
                    {t('rooms.markClean')}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-3 text-sm">
            {t('rooms.plain.noDirty')}
          </p>
        )}
      </section>
      <section aria-labelledby="all-rooms" className="grid gap-2">
        <h2 id="all-rooms" className="text-sm font-semibold">
          {t('rooms.plain.allTitle')}
        </h2>
        <RoomTiles infos={infos} onOpen={onOpen} canEdit={false} occupied={t('rooms.occupied')} />
      </section>
    </div>
  )
}

function RoomsView({ board, onReport }: { board: BoardView; onReport: (roomId: string) => void }) {
  const { t } = useTranslation()
  const f = useFormat()
  const isMobile = useIsMobile()
  const can = useCan()
  const [view, setView] = useState<View>('plan')
  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const infos = board.rooms
  const plain = !can('calendar', 'view')
  const canEdit = can('rooms.status', 'edit')
  const count = (k: Filter): number => (k === 'all' ? infos.length : infos.filter((i) => i.hk === k).length)
  const shown = infos.filter((i) => filter === 'all' || i.hk === filter)
  const open = infos.find((i) => i.id === openId) ?? null
  const plan = useMemo(
    () => shown.map((i) => planRoom(i, typeLabelOf(i, f), t('rooms.occupied'))),
    [shown, f, t]
  )

  const sheet = (
    <RoomSheet
      info={open}
      today={board.today}
      showIssues={board.showIssues}
      onReport={(roomId) => {
        setOpenId(null)
        onReport(roomId)
      }}
      onOpenChange={(o) => (o ? null : setOpenId(null))}
    />
  )

  if (plain)
    return (
      <>
        <PlainView infos={infos} onOpen={setOpenId} canEdit={canEdit} />
        {sheet}
      </>
    )

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Phone: one row that scrolls sideways (six pills took three rows). It runs to the screen edges so a cut
            pill reads as "more this way"; the padding keeps the focus ring inside the scroll box. */}
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={1}
          value={filter}
          onValueChange={(v) => v && setFilter(v as Filter)}
          aria-label={t('rooms.filterLabel')}
          className="flex-wrap max-md:-mx-4 max-md:-my-1 max-md:w-[calc(100%+2rem)] max-md:[scrollbar-width:none] max-md:flex-nowrap max-md:overflow-x-auto max-md:px-4 max-md:py-1"
          data-testid="hk-filter"
        >
          {FILTERS.map((k) => (
            <ToggleGroupItem key={k} value={k} className="gap-1.5 px-2.5">
              {k !== 'all' ? <HkDot state={k} /> : null}
              {k === 'all' ? t('rooms.all') : t(`hk.${k}`)}
              <span className="text-muted-foreground tabular-nums">{count(k)}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {!isMobile ? (
          <ToggleGroup
            type="single"
            variant="outline"
            value={view}
            onValueChange={(v) => v && setView(v as View)}
            aria-label={t('rooms.viewLabel')}
          >
            {VIEWS.map((v) => {
              const Icon = VIEW_ICON[v]
              return (
                <ToggleGroupItem key={v} value={v} className="gap-1.5">
                  <Icon aria-hidden />
                  {t(`rooms.view.${v}`)}
                </ToggleGroupItem>
              )
            })}
          </ToggleGroup>
        ) : null}
      </div>

      <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
        <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden />
        {t('rooms.autoDirty')}
      </p>

      {!shown.length ? (
        <EmptyState
          compact
          icon={LayoutGridIcon}
          title={t('rooms.noMatch')}
          body={t('rooms.noMatchBody')}
          action={
            <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
              {t('common.clearFilter')}
            </Button>
          }
        />
      ) : isMobile ? (
        <RoomTiles infos={shown} onOpen={setOpenId} canEdit={canEdit} occupied={t('rooms.occupied')} />
      ) : view === 'plan' ? (
        <FloorPlan rooms={plan} onSelect={setOpenId} />
      ) : (
        <RoomList infos={shown} today={board.today} showGuests={board.showGuests} onOpen={setOpenId} />
      )}

      {sheet}
    </div>
  )
}

function RoomsSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-4">
      <span className="sr-only">{t('common.loading')}</span>
      <Skeleton className="h-9 w-full max-w-2xl" aria-hidden />
      <div className="grid gap-3" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="grid grid-cols-[3.5rem_1fr] gap-3">
            <Skeleton className="h-24" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {Array.from({ length: 4 }, (_, j) => (
                <Skeleton key={j} className="h-24" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function RoomsPage() {
  const { t } = useTranslation()
  const can = useCan()
  // Refreshed every minute: another computer (or a phone) may have cleaned a room meanwhile.
  const query = useApiQuery('housekeeping.board', {}, { refetchInterval: 60_000 })
  const [report, setReport] = useState<{ roomId: string | null } | null>(null)
  const action = can('room_issues', 'edit') ? (
    <Button variant="outline" onClick={() => setReport({ roomId: null })} data-testid="rooms-report">
      <PlusIcon aria-hidden />
      {t('issues.report')}
    </Button>
  ) : undefined
  return (
    <Page title={t('nav.rooms')} description={t('rooms.description')} actions={action}>
      <QueryView
        query={query}
        loading={<RoomsSkeleton />}
        isEmpty={(b) => b.rooms.length === 0}
        empty={{ icon: LayoutGridIcon, title: t('rooms.emptyTitle'), body: t('rooms.emptyBody') }}
      >
        {(board) => <RoomsView board={board} onReport={(roomId) => setReport({ roomId })} />}
      </QueryView>
      <IssueDialog
        key={report?.roomId ?? 'none'}
        open={!!report}
        roomId={report?.roomId ?? null}
        onOpenChange={(o) => (o ? null : setReport(null))}
      />
    </Page>
  )
}
