// Guest list (faz-06 madde 1; G-50, G-143 "misafir arama"): search first — name, phone, company or (with the
// right) document number, Turkish letters folded by the service — then filters, a tag (K-46 (2)), room and dates
// (G-190), sort and pages. Desktop: dense table; phone: one card per guest.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { keepPreviousData } from '@tanstack/react-query'
import {
  AlertTriangleIcon,
  ChevronRightIcon,
  CrownIcon,
  SearchIcon,
  ShieldBanIcon,
  StickyNoteIcon,
  UsersIcon,
  UsersRoundIcon
} from 'lucide-react'
import { GUEST_FILTERS, type GuestFilter, type GuestSort } from '@shared/contract/guests'
import type { GuestListRowDto } from '@shared/contract/procedures/guests'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { EmptyState, ErrorState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { useDebounced } from '@/features/calendar/booking-api'
import { GuestTagBadges, GuestTagFilter } from './guest-tags'
import { MatchedStays, StayFilterFields, StayFilterToggle } from './stay-filter'
import { NO_STAY_FILTER, stayFilterActive, stayFilterInput, type StayFilterValue } from './stay-filter-value'
import { useDisplayNames } from './use-names'

const SORTS = ['recent', 'name', 'stays', 'paid'] as const satisfies readonly GuestSort[]
const PAGE = 25

const fullName = (r: { firstName: string; lastName: string }): string => `${r.firstName} ${r.lastName}`.trim()

/** VIP, standing request, blacklist and duplicate marks next to the name (each with a tooltip and a name). */
export function GuestMarks({ row }: { row: GuestListRowDto }) {
  const { t } = useTranslation()
  const marks = [
    row.blacklisted
      ? {
          key: 'blacklist',
          label: t('guests.icon.blacklist'),
          Icon: ShieldBanIcon,
          tone: 'text-destructive'
        }
      : null,
    row.vip ? { key: 'vip', label: t('guests.icon.vip'), Icon: CrownIcon, tone: 'text-warning' } : null,
    row.standingNote
      ? row.standingNoteLevel === 'warn'
        ? { key: 'note', label: t('guests.icon.noteWarn'), Icon: AlertTriangleIcon, tone: 'text-destructive' }
        : { key: 'note', label: t('guests.icon.noteInfo'), Icon: StickyNoteIcon, tone: 'text-warning' }
      : null,
    row.duplicateOf
      ? { key: 'dup', label: t('guests.icon.duplicate'), Icon: UsersRoundIcon, tone: 'text-info' }
      : null
  ].filter((m) => m !== null)
  if (!marks.length) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {marks.map(({ key, label, Icon, tone }) => (
        <Tooltip key={key}>
          <TooltipTrigger asChild>
            <span role="img" aria-label={label} data-testid={`mark-${key}`}>
              <Icon className={cn('size-3.5', tone)} aria-hidden />
            </span>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </span>
  )
}

function ListSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-px overflow-hidden rounded-xl border">
      <span className="sr-only">{t('common.loading')}</span>
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-12 rounded-none" aria-hidden />
      ))}
    </div>
  )
}

export function GuestList({ onOpen, onNew }: { onOpen: (guestId: string) => void; onNew?: () => void }) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const names = useDisplayNames()
  const isMobile = useIsMobile()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<GuestFilter>('all')
  const [sort, setSort] = useState<GuestSort>('recent')
  const [tagId, setTagId] = useState<string | undefined>(undefined)
  const [limit, setLimit] = useState(PAGE)
  // Room and dates (G-190): the fields open from the toggle; the room number waits for typing to pause.
  const [stayOpen, setStayOpen] = useState(false)
  const [stay, setStay] = useState<StayFilterValue>(NO_STAY_FILTER)
  const stayRoom = useDebounced(stay.room)
  const stayActive = stayFilterActive(stay)
  const q = useDebounced(query.trim())
  const list = useApiQuery(
    'guests.list',
    {
      q: q || undefined,
      filter,
      sort,
      offset: 0,
      limit,
      ...(tagId ? { tagId } : {}),
      ...stayFilterInput({ ...stay, room: stayRoom })
    },
    { placeholderData: keepPreviousData }
  )
  const data = list.data
  const showMoney = can('payments') && !data?.moneyHidden
  const filters = GUEST_FILTERS.filter(
    (key) =>
      (key !== 'duplicate' || (data?.counts.duplicate ?? 0) > 0 || filter === key) &&
      (key !== 'blacklist' || can('blacklist'))
  )
  const clear = (): void => {
    setQuery('')
    setFilter('all')
    setTagId(undefined)
    setStay(NO_STAY_FILTER)
    setLimit(PAGE)
  }
  const paid = (row: GuestListRowDto) => {
    const entries = Object.entries(row.totalSpent).filter(([, v]) => v !== 0)
    if (!entries.length) return '—'
    const base = entries.find(([c]) => c === data?.baseCurrency) ?? entries[0]!
    return f.money(base[1], base[0]) + (entries.length > 1 ? ' +' : '')
  }
  const lastStay = (row: GuestListRowDto) =>
    row.lastStayDate ? (
      f.date(row.lastStayDate, 'medium')
    ) : row.nextStayDate ? (
      <span className="text-muted-foreground">
        {t('guests.list.next', { date: f.dayMonth(row.nextStayDate) })}
      </span>
    ) : (
      <span className="text-muted-foreground">—</span>
    )

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-0 flex-1 basis-72 max-md:basis-full">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setLimit(PAGE)
            }}
            placeholder={t(
              can('guests.identity') ? 'guests.search.placeholderIdentity' : 'guests.search.placeholderFull'
            )}
            aria-label={t('guests.search.label')}
            className="ps-9"
            autoFocus={!isMobile}
            maxLength={100}
            data-testid="guest-search"
          />
        </div>
        {isMobile ? (
          <Select
            value={filter}
            onValueChange={(v) => {
              setFilter(v as GuestFilter)
              setLimit(PAGE)
            }}
          >
            <SelectTrigger className="min-w-0 flex-1" aria-label={t('guests.filter.label')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filters.map((key) => (
                <SelectItem key={key} value={key}>
                  {t(`guests.filter.${key}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <GuestTagFilter
          value={tagId}
          onChange={(next) => {
            setTagId(next)
            setLimit(PAGE)
          }}
          className="max-w-56 max-md:order-last max-md:max-w-none max-md:min-w-0 max-md:basis-full"
        />
        <Select value={sort} onValueChange={(v) => setSort(v as GuestSort)}>
          <SelectTrigger className="max-md:min-w-0 max-md:flex-1" aria-label={t('guests.sort.label')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.filter((key) => key !== 'paid' || showMoney).map((key) => (
              <SelectItem key={key} value={key}>
                {t(`guests.sort.${key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <StayFilterToggle open={stayOpen} active={stayActive} onToggle={() => setStayOpen(!stayOpen)} />
      </div>
      {stayOpen ? (
        <StayFilterFields
          value={stay}
          onChange={(v) => {
            setStay(v)
            setLimit(PAGE)
          }}
        />
      ) : null}

      {!isMobile ? (
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={1}
          value={filter}
          onValueChange={(v) => {
            if (!v) return
            setFilter(v as GuestFilter)
            setLimit(PAGE)
          }}
          aria-label={t('guests.filter.label')}
          className="flex-wrap"
          data-testid="guest-filter"
        >
          {filters.map((key) => (
            <ToggleGroupItem key={key} value={key} className="gap-1.5">
              {t(`guests.filter.${key}`)}
              <span className="text-muted-foreground tabular-nums">{data?.counts[key] ?? '…'}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : null}

      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError || !data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !data.total && !q && filter === 'all' && !tagId && !stayActive ? (
        <EmptyState
          icon={UsersIcon}
          title={t('guests.emptyTitle')}
          body={t('guests.emptyBodyReal')}
          action={
            onNew ? (
              <Button variant="outline" size="sm" onClick={onNew}>
                {t('guests.new')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="text-muted-foreground text-xs" aria-live="polite" data-testid="guest-count">
            {t('guests.list.count', { count: data.total })}
          </p>
          {!data.rows.length ? (
            <EmptyState
              compact
              icon={SearchIcon}
              title={t('guests.list.none')}
              body={t('guests.list.noneHint')}
              action={
                <Button variant="outline" size="sm" onClick={clear}>
                  {t('common.clearFilter')}
                </Button>
              }
            />
          ) : isMobile ? (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-2" data-testid="guest-cards">
              {data.rows.map((row) => (
                <li key={row.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpen(row.id)}
                    className="bg-card focus-visible:ring-ring flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start outline-none focus-visible:ring-[3px]"
                    data-testid={`guest-card-${row.id}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="line-clamp-2 min-w-0 text-sm font-medium wrap-anywhere"
                          title={fullName(row)}
                        >
                          {fullName(row)}
                        </span>
                        <GuestMarks row={row} />
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {row.phone ? (
                          <span dir="ltr" className="tabular-nums">
                            {row.phone}
                          </span>
                        ) : null}
                        {row.phone && (row.lastStayDate || row.nextStayDate) ? ' · ' : null}
                        {row.lastStayDate
                          ? f.date(row.lastStayDate, 'medium')
                          : row.nextStayDate
                            ? t('guests.list.next', { date: f.dayMonth(row.nextStayDate) })
                            : null}
                      </span>
                      <GuestTagBadges tagIds={row.tagIds} className="mt-1" />
                      <MatchedStays row={row} className="mt-0.5" />
                    </span>
                    <span className="grid shrink-0 justify-items-end text-xs">
                      {showMoney ? (
                        <span className="text-sm font-medium tabular-nums">
                          <bdi>{paid(row)}</bdi>
                        </span>
                      ) : null}
                      <span className="text-muted-foreground">
                        {t('guests.list.stays', { count: row.stays })}
                      </span>
                    </span>
                    <ChevronRightIcon
                      className="text-muted-foreground size-4 shrink-0 rtl:rotate-180"
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Card className="py-0" data-testid="guest-table">
              <Table density="compact">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="ps-4 text-start">{t('guests.col.guest')}</TableHead>
                    <TableHead className="text-start">{t('guests.col.phone')}</TableHead>
                    <TableHead className="text-start">{t('guests.col.nationality')}</TableHead>
                    <TableHead className="text-end">{t('guests.col.stays')}</TableHead>
                    {/* Wide gap: the two headers must not read as one phrase ("Konaklama Son konaklama"). */}
                    <TableHead className="ps-8 text-start">{t('guests.col.lastStay')}</TableHead>
                    {showMoney ? (
                      <TableHead className="pe-4 text-end">{t('guests.col.paid')}</TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => onOpen(row.id)}
                      data-testid={`guest-row-${row.id}`}
                    >
                      <TableCell className="max-w-72 ps-4">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <button
                            type="button"
                            title={fullName(row)}
                            className="focus-visible:ring-ring min-w-0 truncate rounded-sm text-start font-medium outline-none hover:underline focus-visible:ring-[3px]"
                            onClick={(e) => {
                              e.stopPropagation()
                              onOpen(row.id)
                            }}
                          >
                            {fullName(row)}
                          </button>
                          <GuestMarks row={row} />
                        </span>
                        {row.companyTitle ? (
                          <span
                            className="text-muted-foreground block truncate text-xs"
                            title={row.companyTitle}
                          >
                            {row.companyTitle}
                          </span>
                        ) : null}
                        <GuestTagBadges tagIds={row.tagIds} className="mt-0.5" />
                        <MatchedStays row={row} className="mt-0.5" />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.phone ? (
                          <span dir="ltr" className="tabular-nums">
                            {row.phone}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground max-w-40 truncate"
                        title={names.region(row.nationality) || undefined}
                      >
                        {names.region(row.nationality) || '—'}
                      </TableCell>
                      <TableCell className="text-end tabular-nums">{row.stays}</TableCell>
                      <TableCell className="ps-8">{lastStay(row)}</TableCell>
                      {showMoney ? (
                        <TableCell className="pe-4 text-end font-medium tabular-nums">
                          <bdi>{paid(row)}</bdi>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
          {data.total > data.rows.length ? (
            <Button
              variant="outline"
              className="justify-self-center"
              onClick={() => setLimit(limit + PAGE)}
              disabled={list.isFetching}
            >
              {t('guests.list.more', { count: data.total - data.rows.length })}
            </Button>
          ) : null}
        </>
      )}
    </div>
  )
}
