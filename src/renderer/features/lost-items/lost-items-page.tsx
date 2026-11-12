// Kayıp eşya defteri (G-55, S-17): what was found, when and where, who found it, where it is kept and what became
// of it (kept / handed to its owner — to whom, when, by whom / disposed of). Filter by status, search; a row opens
// the record with its photos and status history. Records are never deleted. Desktop table, phone cards.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PackageSearchIcon, PlusIcon, SearchIcon, SearchXIcon } from 'lucide-react'
import { diffDays, localDateOf, today as todayOf, type LocalDate } from '@shared/date'
import { normalizeName } from '@shared/domain/normalize'
import type { LostItemView } from '@shared/contract/procedures/contacts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { PhotoGallery } from '@/components/record-photos'
import type { PickerRoom } from '@/components/room-picker'
import { EmptyState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { useLocalName } from '../settings/use-admin'
import { NewLostItemDialog, ReturnDialog, StatusReasonDialog } from './lost-item-dialogs'

const FILTERS = ['all', 'stored', 'returned', 'disposed'] as const
type Filter = (typeof FILTERS)[number]

const STATUS_BADGE: Record<LostItemView['status'], string> = {
  stored: 'border-info text-foreground',
  returned: 'border-success text-foreground',
  disposed: 'text-muted-foreground'
}

const dayOf = (minute: string): LocalDate => minute.slice(0, 10) as LocalDate

function StatusBadge({ item }: { item: LostItemView }) {
  const { t } = useTranslation()
  return (
    <Badge variant="outline" className={cn('max-w-full', STATUS_BADGE[item.status])}>
      <span className="truncate">{t(`lostItems.status.${item.status}`)}</span>
    </Badge>
  )
}

/** "Verildi: Kemal Y. · 4 Eki 15:30" — who it went to and when. */
function useClosedLine() {
  const { t } = useTranslation()
  const f = useFormat()
  return (item: LostItemView): string | null => {
    if (item.status === 'returned' && item.returnedTo)
      return t('lostItems.returnedLine', {
        name: item.returnedTo,
        when: item.returnedAt ? `${f.dayMonth(dayOf(item.returnedAt))} ${item.returnedAt.slice(11, 16)}` : '—'
      })
    if (item.status === 'disposed' && item.statusChange)
      return t('lostItems.disposedLine', { when: f.dayMonth(dayOf(item.statusChange.at)) })
    return null
  }
}

function Actions({
  item,
  onReturn,
  onDispose,
  onRestore,
  wide
}: {
  item: LostItemView
  onReturn: () => void
  onDispose: () => void
  onRestore: () => void
  wide?: boolean
}) {
  const { t } = useTranslation()
  if (item.status !== 'stored')
    return (
      <div className={cn('flex', wide ? 'justify-start' : 'justify-end')}>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRestore}
          aria-label={t('lostItems.restoreOne', { item: item.description })}
        >
          {t('lostItems.restore.button')}
        </Button>
      </div>
    )
  return (
    // In the table the two buttons may stack, so a long Russian label does not push the table wider than the page.
    <div className={cn('flex gap-1.5', wide ? 'grid grid-cols-2' : 'flex-wrap justify-end')}>
      <Button
        size="sm"
        variant="outline"
        onClick={onReturn}
        aria-label={t('lostItems.returnOne', { item: item.description })}
        data-testid={`return-${item.id}`}
      >
        {t('lostItems.markReturned')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onDispose}
        aria-label={t('lostItems.disposeOne', { item: item.description })}
      >
        {t('lostItems.markDisposed')}
      </Button>
    </div>
  )
}

function DetailSheet({
  item,
  today,
  canEdit,
  onOpenChange
}: {
  item: LostItemView | null
  today: LocalDate
  canEdit: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const isMobile = useIsMobile()
  const at = (iso: string): string => f.date(localDateOf(new Date(iso)))
  return (
    <Sheet open={!!item} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'gap-0 overflow-y-auto',
          isMobile ? 'max-h-[92dvh] rounded-t-xl' : 'w-full sm:max-w-md'
        )}
        data-testid="lost-detail"
      >
        {item ? (
          <>
            <SheetHeader className="gap-2 border-b text-start">
              <SheetTitle className="pe-8 text-lg break-words">{item.description}</SheetTitle>
              <SheetDescription>
                {item.roomNumber
                  ? t('lostItems.roomNo', { room: item.roomNumber })
                  : (item.locationText ?? '—')}
              </SheetDescription>
              <div>
                <StatusBadge item={item} />
              </div>
            </SheetHeader>
            <div className="grid gap-4 p-4">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">{t('lostItems.col.found')}</dt>
                <dd>
                  {f.date(dayOf(item.foundAt))}
                  {item.foundAt.slice(11, 16) !== '00:00' ? ` ${item.foundAt.slice(11, 16)}` : ''}
                  {item.status === 'stored' ? (
                    <span className="text-muted-foreground block text-xs">
                      {t('lostItems.keptFor', { count: Math.max(0, diffDays(dayOf(item.foundAt), today)) })}
                    </span>
                  ) : null}
                </dd>
                <dt className="text-muted-foreground">{t('lostItems.col.foundBy')}</dt>
                <dd>{item.foundBy ?? '—'}</dd>
                <dt className="text-muted-foreground">{t('lostItems.col.storage')}</dt>
                <dd className="break-words">{item.storageLocation ?? '—'}</dd>
                {item.note ? (
                  <>
                    <dt className="text-muted-foreground">{t('common.note')}</dt>
                    <dd className="break-words">{item.note}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">{t('lostItems.loggedBy')}</dt>
                <dd>{[item.createdByName, at(item.createdAt)].filter(Boolean).join(' · ')}</dd>
                {item.status === 'returned' ? (
                  <>
                    <dt className="text-muted-foreground">{t('lostItems.return.to')}</dt>
                    <dd className="break-words" data-testid="lost-returned-to">
                      {item.returnedTo}
                      {item.returnedAt ? (
                        <span className="text-muted-foreground block text-xs">
                          {`${f.date(dayOf(item.returnedAt))} ${item.returnedAt.slice(11, 16)}`}
                        </span>
                      ) : null}
                    </dd>
                  </>
                ) : null}
                {item.statusChange ? (
                  <>
                    <dt className="text-muted-foreground">{t('lostItems.changedBy')}</dt>
                    <dd data-testid="lost-changed-by">
                      {[
                        item.statusChange.byName ?? t('lostItems.unknownUser'),
                        `${at(item.statusChange.at)} ${f.time(item.statusChange.at)}`
                      ].join(' · ')}
                      {item.statusChange.reason ? (
                        <span className="text-muted-foreground block text-xs">
                          {item.statusChange.reason}
                        </span>
                      ) : null}
                    </dd>
                  </>
                ) : null}
              </dl>
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold">{t('photos.title')}</h3>
                <PhotoGallery target={{ kind: 'lostItem', id: item.id }} canAdd={canEdit} />
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function LostItemsView({ items, today }: { items: LostItemView[]; today: LocalDate }) {
  const { t } = useTranslation()
  const f = useFormat()
  const isMobile = useIsMobile()
  const can = useCan()
  const closedLine = useClosedLine()
  const editable = can('lost_items', 'edit')
  const [filter, setFilter] = useState<Filter>('stored')
  const [search, setSearch] = useState('')
  const [returning, setReturning] = useState<LostItemView | null>(null)
  const [reasoning, setReasoning] = useState<{ item: LostItemView; mode: 'dispose' | 'restore' } | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const needle = normalizeName(search)
  const count = (k: Filter): number =>
    k === 'all' ? items.length : items.filter((i) => i.status === k).length
  const placeOf = (i: LostItemView): string =>
    i.roomNumber ? t('lostItems.roomNo', { room: i.roomNumber }) : (i.locationText ?? '—')
  const shown = items.filter(
    (i) =>
      (filter === 'all' || i.status === filter) &&
      (!needle ||
        [
          i.description,
          placeOf(i),
          i.foundBy ?? '',
          i.storageLocation ?? '',
          i.returnedTo ?? '',
          i.note ?? ''
        ].some((s) => normalizeName(s).includes(needle)))
  )
  const age = (i: LostItemView) =>
    i.status === 'stored'
      ? t('lostItems.keptFor', { count: Math.max(0, diffDays(dayOf(i.foundAt), today)) })
      : null
  const actions = (i: LostItemView, wide?: boolean) =>
    editable ? (
      <Actions
        item={i}
        wide={wide}
        onReturn={() => setReturning(i)}
        onDispose={() => setReasoning({ item: i, mode: 'dispose' })}
        onRestore={() => setReasoning({ item: i, mode: 'restore' })}
      />
    ) : null
  const opened = items.find((i) => i.id === openId) ?? null
  const clear = (): void => {
    setFilter('all')
    setSearch('')
  }

  // One column that may not grow past the page: the table scrolls inside its card instead of widening it.
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={1}
          value={filter}
          onValueChange={(v) => v && setFilter(v as Filter)}
          aria-label={t('lostItems.filterLabel')}
          className="grid w-full grid-cols-2 sm:flex sm:w-fit"
        >
          {FILTERS.map((k) => (
            <ToggleGroupItem key={k} value={k} className="gap-1.5 px-3">
              {t(`lostItems.filter.${k}`)}
              <span className="text-muted-foreground tabular-nums">{count(k)}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="relative min-w-0 flex-1 basis-56">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('lostItems.searchPlaceholder')}
            aria-label={t('lostItems.searchLabel')}
            className="ps-9"
          />
        </div>
      </div>

      {!shown.length ? (
        <EmptyState
          compact
          icon={SearchXIcon}
          title={t('common.noMatchTitle')}
          body={t('common.noMatchBody')}
          action={
            <Button variant="outline" size="sm" onClick={clear}>
              {t('common.clearFilter')}
            </Button>
          }
        />
      ) : isMobile ? (
        <ul className="grid gap-3" aria-label={t('nav.lostItems')}>
          {shown.map((i) => (
            <li key={i.id} className="min-w-0" data-testid={`lost-${i.id}`}>
              <Card className="gap-2 p-3">
                <button
                  type="button"
                  onClick={() => setOpenId(i.id)}
                  className="focus-visible:ring-ring flex min-h-11 items-start justify-between gap-3 rounded-md text-start outline-none focus-visible:ring-[3px]"
                >
                  <span className="min-w-0 font-medium break-words">{i.description}</span>
                  <StatusBadge item={i} />
                </button>
                {closedLine(i) ? <span className="text-success text-xs">{closedLine(i)}</span> : null}
                <dl className="text-muted-foreground grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                  <dt>{t('lostItems.col.found')}</dt>
                  <dd className="text-foreground">
                    {f.dayMonth(dayOf(i.foundAt))} · {placeOf(i)}
                    {age(i) ? <span className="text-muted-foreground"> · {age(i)}</span> : null}
                  </dd>
                  <dt>{t('lostItems.col.foundBy')}</dt>
                  <dd className="text-foreground">{i.foundBy ?? '—'}</dd>
                  <dt>{t('lostItems.col.storage')}</dt>
                  <dd className="text-foreground break-words">{i.storageLocation ?? '—'}</dd>
                </dl>
                {actions(i, true)}
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <Card className="min-w-0 gap-0 overflow-hidden py-0" data-testid="lost-table">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="ps-4 text-start">{t('lostItems.col.found')}</TableHead>
                <TableHead className="text-start">{t('lostItems.col.place')}</TableHead>
                <TableHead className="text-start">{t('lostItems.col.item')}</TableHead>
                <TableHead className="text-start">{t('lostItems.col.foundBy')}</TableHead>
                <TableHead className="text-start">{t('lostItems.col.storage')}</TableHead>
                <TableHead className="text-start">{t('common.status')}</TableHead>
                {editable ? (
                  <TableHead className="pe-4 text-end">
                    <span className="sr-only">{t('lostItems.col.actions')}</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((i) => (
                <TableRow
                  key={i.id}
                  data-testid={`lost-${i.id}`}
                  className={cn(i.status === 'disposed' && 'text-muted-foreground')}
                >
                  <TableCell className="ps-4 align-top tabular-nums">
                    {f.dayMonth(dayOf(i.foundAt))}
                    {age(i) ? <span className="text-muted-foreground block text-xs">{age(i)}</span> : null}
                  </TableCell>
                  <TableCell className="align-top">{placeOf(i)}</TableCell>
                  <TableCell className="min-w-48 align-top whitespace-normal">
                    <button
                      type="button"
                      onClick={() => setOpenId(i.id)}
                      className="focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-sm text-start font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
                    >
                      {i.description}
                    </button>
                    {closedLine(i) ? (
                      <span
                        className={cn(
                          'block text-xs',
                          i.status === 'returned' ? 'text-success' : 'text-muted-foreground'
                        )}
                      >
                        {closedLine(i)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">{i.foundBy ?? '—'}</TableCell>
                  <TableCell className="align-top whitespace-normal">{i.storageLocation ?? '—'}</TableCell>
                  <TableCell className="align-top">
                    <StatusBadge item={i} />
                  </TableCell>
                  {editable ? <TableCell className="pe-4 align-top">{actions(i)}</TableCell> : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {returning ? <ReturnDialog item={returning} today={today} onClose={() => setReturning(null)} /> : null}
      {reasoning ? (
        <StatusReasonDialog item={reasoning.item} mode={reasoning.mode} onClose={() => setReasoning(null)} />
      ) : null}
      <DetailSheet
        item={opened}
        today={today}
        canEdit={editable}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
    </div>
  )
}

function LostItemsSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-4">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="flex flex-wrap gap-3" aria-hidden>
        <Skeleton className="h-9 w-96 max-w-full" />
        <Skeleton className="h-9 min-w-40 flex-1" />
      </div>
      <div className="grid gap-2 rounded-xl border p-4" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    </div>
  )
}

export function LostItemsPage({ today = todayOf() }: { today?: LocalDate }) {
  const { t } = useTranslation()
  const can = useCan()
  const nameOf = useLocalName()
  const query = useApiQuery('lostItems.list', {})
  const roomsQuery = useApiQuery('rooms.list', {})
  const types = useApiQuery('rooms.listTypes', {})
  const [adding, setAdding] = useState(false)
  const rooms: PickerRoom[] = useMemo(
    () =>
      (roomsQuery.data ?? []).map((r) => {
        const type = types.data?.find((x) => x.id === r.roomTypeId)
        return {
          id: r.id,
          number: r.number,
          floor: Number(r.floor ?? 0) || 0,
          typeLabel: type ? nameOf(type.nameI18n, type.name) : '',
          beds: r.beds
        }
      }),
    [roomsQuery.data, types.data, nameOf]
  )
  return (
    <Page
      title={t('nav.lostItems')}
      description={t('lostItems.description')}
      actions={
        can('lost_items', 'edit') ? (
          <Button onClick={() => setAdding(true)} data-testid="lost-add">
            <PlusIcon aria-hidden />
            {t('lostItems.add')}
          </Button>
        ) : null
      }
    >
      <QueryView
        query={query}
        loading={<LostItemsSkeleton />}
        isEmpty={(list) => list.length === 0}
        empty={{ icon: PackageSearchIcon, title: t('lostItems.emptyTitle'), body: t('lostItems.emptyBody') }}
      >
        {(list) => <LostItemsView items={list} today={today} />}
      </QueryView>
      {adding ? <NewLostItemDialog rooms={rooms} today={today} onClose={() => setAdding(false)} /> : null}
    </Page>
  )
}
