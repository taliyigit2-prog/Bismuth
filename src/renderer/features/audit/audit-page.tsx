// Denetim kaydı (faz-04 madde 6, G-24): the program's black box — who, from which device, when, added, changed or
// cancelled what, with the values before and after. Newest first; filtered by dates, person, record type and action;
// "Daha fazla" loads older rows (cursor). A row opens the before/after side by side, field by field. Read only:
// nothing here is ever deleted. Owner only by default (audit_log); the service refuses others (G-23).
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ChevronDownIcon, FilterIcon, ScrollTextIcon, XIcon } from 'lucide-react'
import type { AuditEntry, ProcedureInput, ProcedureOutput } from '@shared/contract'
import { auditReasonKey } from '@shared/audit'
import { addDays, localDateOf, type LocalDate } from '@shared/date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DateInput } from '@/components/date-input'
import { Page } from '@/components/page'
import { EmptyState, ErrorState, LoadingState, NoAccessState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useTransport } from '@/lib/api/api-context'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { AuditDiff } from './audit-diff'
import {
  actionLabel,
  actionTone,
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  entityLabel,
  recordName,
  recordRef,
  whoName
} from './audit-labels'

/** Rows per page ("Daha fazla" loads the next one). */
const AUDIT_PAGE_SIZE = 50
const ALL = 'all'

interface Filters {
  from: LocalDate | null
  to: LocalDate | null
  userId: string
  entity: string
  action: string
}
const NO_FILTERS: Filters = { from: null, to: null, userId: ALL, entity: ALL, action: ALL }

/** Days are the hotel's local days: [from 00:00, the day after `to` 00:00) as UTC instants. */
function filterInput(f: Filters): ProcedureInput<'audit.list'> {
  return {
    limit: AUDIT_PAGE_SIZE,
    ...(f.from ? { from: new Date(`${f.from}T00:00:00`).toISOString() } : {}),
    ...(f.to ? { to: new Date(`${addDays(f.to, 1)}T00:00:00`).toISOString() } : {}),
    ...(f.userId !== ALL ? { userId: f.userId } : {}),
    ...(f.entity !== ALL ? { entity: f.entity } : {}),
    ...(f.action !== ALL ? { action: f.action } : {})
  }
}

const activeCount = (f: Filters): number =>
  [f.from, f.to, f.userId !== ALL || null, f.entity !== ALL || null, f.action !== ALL || null].filter(Boolean)
    .length

function useWhen(): (iso: string) => string {
  const f = useFormat()
  return (iso) => `${f.date(localDateOf(new Date(iso)), 'medium')} ${f.time(iso)}`
}

function FilterBar({
  filters,
  onChange,
  people
}: {
  filters: Filters
  onChange: (f: Filters) => void
  people: { id: string; name: string }[]
}) {
  const { t, i18n } = useTranslation()
  const collator = useMemo(() => new Intl.Collator(i18n.language), [i18n.language])
  const entities = useMemo(
    () =>
      AUDIT_ENTITIES.map((e) => ({ value: e, label: entityLabel(t, e) })).sort((a, b) =>
        collator.compare(a.label, b.label)
      ),
    [t, collator]
  )
  const set = <K extends keyof Filters>(key: K, value: Filters[K]): void =>
    onChange({ ...filters, [key]: value })
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))]"
      data-testid="audit-filters"
    >
      <DateInput
        label={t('audit.filter.from')}
        value={filters.from}
        max={filters.to ?? undefined}
        onChange={(d) => set('from', d)}
      />
      <DateInput
        label={t('audit.filter.to')}
        value={filters.to}
        min={filters.from ?? undefined}
        onChange={(d) => set('to', d)}
      />
      <div className="grid min-w-0 gap-1.5">
        <label htmlFor="audit-user" className="text-sm font-medium">
          {t('audit.filter.user')}
        </label>
        <Select value={filters.userId} onValueChange={(v) => set('userId', v)}>
          <SelectTrigger id="audit-user" className="w-full" data-testid="audit-user">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('audit.filter.userAll')}</SelectItem>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid min-w-0 gap-1.5">
        <label htmlFor="audit-entity" className="text-sm font-medium">
          {t('audit.filter.entity')}
        </label>
        <Select value={filters.entity} onValueChange={(v) => set('entity', v)}>
          <SelectTrigger id="audit-entity" className="w-full" data-testid="audit-entity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('audit.filter.entityAll')}</SelectItem>
            {entities.map((e) => (
              <SelectItem key={e.value} value={e.value}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid min-w-0 gap-1.5">
        <label htmlFor="audit-action" className="text-sm font-medium">
          {t('audit.filter.action')}
        </label>
        <Select value={filters.action} onValueChange={(v) => set('action', v)}>
          <SelectTrigger id="audit-action" className="w-full" data-testid="audit-action">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('audit.filter.actionAll')}</SelectItem>
            {AUDIT_ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {actionLabel(t, a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function Who({ entry }: { entry: AuditEntry }) {
  const { t } = useTranslation()
  return (
    <span className="grid min-w-0 gap-0.5">
      <span className="font-medium break-words">{whoName(t, entry)}</span>
      {entry.deviceName ? (
        <span className="text-muted-foreground text-xs break-words">{entry.deviceName}</span>
      ) : null}
    </span>
  )
}

function What({ entry }: { entry: AuditEntry }) {
  const { t } = useTranslation()
  const name = recordName(entry)
  const ref = name ? '' : recordRef(t, entry)
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
      <span className="font-medium break-words">{entityLabel(t, entry.entity)}</span>
      {name ? (
        <bdi className="min-w-0 break-words" title={entry.entityId}>
          {name}
        </bdi>
      ) : ref ? (
        <bdi className="text-muted-foreground text-xs" title={entry.entityId}>
          {ref}
        </bdi>
      ) : null}
    </span>
  )
}

function ActionBadge({ action }: { action: string }) {
  const { t } = useTranslation()
  return <Badge variant={actionTone(action)}>{actionLabel(t, action)}</Badge>
}

function DetailSheet({ entry, onClose }: { entry: AuditEntry | null; onClose: () => void }) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const when = useWhen()
  // A reason the program wrote (an import) is a code; a person's own reason is shown as written.
  const reasonText = (reason: string) => {
    const key = auditReasonKey(reason)
    return key ? t(key) : reason
  }
  return (
    <Sheet open={entry !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'gap-0 overflow-y-auto',
          isMobile ? 'max-h-[92dvh] rounded-t-xl' : 'w-full sm:max-w-2xl'
        )}
        data-testid="audit-sheet"
      >
        {entry ? (
          <>
            <SheetHeader className="gap-2 border-b text-start">
              <div className="flex flex-wrap items-center gap-2 pe-8">
                <SheetTitle className="text-lg break-words">
                  {recordName(entry)
                    ? t('audit.recordTitle', { what: entityLabel(t, entry.entity), name: recordName(entry) })
                    : entityLabel(t, entry.entity)}
                </SheetTitle>
                <ActionBadge action={entry.action} />
              </div>
              <SheetDescription>{when(entry.ts)}</SheetDescription>
            </SheetHeader>
            <div className="grid gap-5 p-4">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">{t('audit.col.who')}</dt>
                <dd className="font-medium">{whoName(t, entry)}</dd>
                <dt className="text-muted-foreground">{t('audit.device')}</dt>
                <dd>{entry.deviceName ?? entry.deviceId ?? '—'}</dd>
                <dt className="text-muted-foreground">{t('audit.recordId')}</dt>
                <dd>
                  <bdi className="font-mono text-xs break-all">{entry.entityId}</bdi>
                </dd>
                {entry.reason ? (
                  <>
                    <dt className="text-muted-foreground">{t('audit.reason')}</dt>
                    <dd className="break-words">{reasonText(entry.reason)}</dd>
                  </>
                ) : null}
              </dl>
              <section className="grid gap-2" aria-labelledby="audit-values">
                <h3 id="audit-values" className="text-sm font-semibold">
                  {t('audit.values')}
                </h3>
                <AuditDiff key={entry.id} before={entry.before} after={entry.after} />
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function Rows({ entries, onOpen }: { entries: AuditEntry[]; onOpen: (e: AuditEntry) => void }) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const when = useWhen()
  if (isMobile)
    return (
      <ul className="grid gap-2" data-testid="audit-list">
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className="hover:bg-accent focus-visible:ring-ring grid w-full gap-1.5 rounded-xl border p-3 text-start text-sm outline-none focus-visible:ring-[3px]"
              onClick={() => onOpen(entry)}
              data-testid={`audit-row-${entry.id}`}
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <What entry={entry} />
                <ActionBadge action={entry.action} />
              </span>
              <span className="text-muted-foreground flex flex-wrap justify-between gap-x-3 text-xs">
                <span>{whoName(t, entry)}</span>
                <span className="tabular-nums">{when(entry.ts)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  return (
    <Table density="compact" data-testid="audit-list">
      <TableHeader>
        <TableRow>
          <TableHead className="w-44">{t('audit.col.time')}</TableHead>
          {/* A name and a device name under it: the column does not shrink to a word per line. */}
          <TableHead className="min-w-40">{t('audit.col.who')}</TableHead>
          <TableHead>{t('audit.col.what')}</TableHead>
          <TableHead>{t('audit.col.action')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow
            key={entry.id}
            className="cursor-pointer"
            onClick={() => onOpen(entry)}
            data-testid={`audit-row-${entry.id}`}
          >
            <TableCell className="align-top tabular-nums">{when(entry.ts)}</TableCell>
            <TableCell className="align-top whitespace-normal">
              <Who entry={entry} />
            </TableCell>
            <TableCell className="align-top whitespace-normal">
              {/* The keyboard way in: the row itself is only a mouse convenience. */}
              <button
                type="button"
                className="focus-visible:ring-ring rounded-sm text-start outline-none hover:underline focus-visible:ring-[3px]"
                aria-label={t('audit.open', { what: entityLabel(t, entry.entity) })}
                onClick={(e) => {
                  e.stopPropagation()
                  onOpen(entry)
                }}
              >
                <What entry={entry} />
              </button>
            </TableCell>
            <TableCell className="align-top">
              <ActionBadge action={entry.action} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function AuditPage() {
  const { t } = useTranslation()
  const can = useCan()
  const isMobile = useIsMobile()
  const transport = useTransport()
  const allowed = can('audit_log')
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [open, setOpen] = useState<AuditEntry | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const input = filterInput(filters)
  const query = useInfiniteQuery({
    queryKey: ['audit.list', input],
    queryFn: ({ pageParam }): Promise<ProcedureOutput<'audit.list'>> =>
      transport.call('audit.list', pageParam ? { ...input, cursor: pageParam } : input),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: allowed
  })
  // People: every account when the reader may list them, else the names the loaded rows carry.
  const users = useApiQuery(
    'users.list',
    { includeInactive: true },
    { enabled: allowed && can('settings.users') }
  )
  const entries = useMemo(() => query.data?.pages.flatMap((p) => p.entries) ?? [], [query.data])
  const people = useMemo(() => {
    if (users.data) return users.data.map((u) => ({ id: u.id, name: u.displayName }))
    const seen = new Map<string, string>()
    for (const e of entries) if (e.userId && e.userName) seen.set(e.userId, e.userName)
    return [...seen].map(([id, name]) => ({ id, name }))
  }, [users.data, entries])
  const count = activeCount(filters)

  if (!allowed)
    return (
      <Page title={t('audit.title')}>
        <NoAccessState />
      </Page>
    )

  const filterBar = <FilterBar filters={filters} onChange={setFilters} people={people} />
  const clear = count ? (
    <Button variant="ghost" size="sm" onClick={() => setFilters(NO_FILTERS)} data-testid="audit-clear">
      <XIcon aria-hidden />
      {t('common.clearFilter')}
    </Button>
  ) : null

  return (
    <Page title={t('audit.title')} description={t('audit.description')}>
      <Card className="py-4">
        <CardContent className="grid gap-3 px-4">
          {isMobile ? (
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="grid gap-3">
              <div className="flex items-center gap-2">
                <CollapsibleTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex-1 justify-between"
                    data-testid="audit-filter-toggle"
                  >
                    <span className="flex items-center gap-2">
                      <FilterIcon aria-hidden />
                      {count ? t('audit.filtersActive', { count }) : t('audit.filters')}
                    </span>
                    <ChevronDownIcon
                      className={cn('transition-transform', filtersOpen && 'rotate-180')}
                      aria-hidden
                    />
                  </Button>
                </CollapsibleTrigger>
                {clear}
              </div>
              <CollapsibleContent>{filterBar}</CollapsibleContent>
            </Collapsible>
          ) : (
            <>
              {filterBar}
              {clear ? <div className="flex justify-end">{clear}</div> : null}
            </>
          )}
        </CardContent>
      </Card>

      {query.isPending ? (
        <LoadingState cards={1} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : entries.length === 0 ? (
        count ? (
          // "Filtreyi temizle" is right above, in the filter card.
          <EmptyState
            compact
            icon={ScrollTextIcon}
            title={t('common.noMatchTitle')}
            body={t('common.noMatchBody')}
          />
        ) : (
          <EmptyState icon={ScrollTextIcon} title={t('audit.emptyTitle')} body={t('audit.emptyBody')} />
        )
      ) : (
        <Card className="py-2 md:py-4">
          <CardContent className="grid gap-3 px-2 md:px-4">
            <Rows entries={entries} onOpen={setOpen} />
            <div className="flex flex-wrap items-center justify-between gap-2 px-2">
              <p className="text-muted-foreground text-xs" role="status">
                {t('audit.shown', { count: entries.length })}
              </p>
              {query.hasNextPage ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                  className="max-md:w-full"
                  data-testid="audit-more"
                >
                  {t('common.more')}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}
      <DetailSheet entry={open} onClose={() => setOpen(null)} />
    </Page>
  )
}
