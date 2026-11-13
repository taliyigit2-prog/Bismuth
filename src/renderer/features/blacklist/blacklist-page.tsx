// Kara liste (G-52, G-45; faz-06 madde 5): a quick "check a name or phone" box (the service's matching rule:
// normalised name OR document OR phone, §6.9), the list with severity, adding and removing = deactivating with a
// reason (never deleted, audit). Reception adds; only Sahip/Müdür remove (`blacklist.remove`).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2Icon, HistoryIcon, SearchCheckIcon, ShieldBanIcon, UserXIcon } from 'lucide-react'
import { localDateOf } from '@shared/date'
import type { BlacklistEntryDto } from '@shared/contract/procedures/guests'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Page } from '@/components/page'
import { EmptyState, ErrorState, NoAccessState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { useDebounced } from '@/features/calendar/booking-api'
import { displayPhone } from '@/features/guests/guests-api'
import { AddDialog, RemoveDialog } from './blacklist-dialogs'
import { SeverityBadge } from './severity-badge'

const VIEWS = ['active', 'removed'] as const
type View = (typeof VIEWS)[number]
const SEVERITIES = ['warn', 'block'] as const

const dayOf = (iso: string) => localDateOf(new Date(iso))

function CheckCard() {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const typed = name.trim().length >= 3 || phone.replace(/\D/g, '').length >= 7
  const candidate = useDebounced({
    name: name.trim().slice(0, 160),
    phone: phone.trim().slice(0, 40) || null
  })
  const check = useApiQuery('blacklist.check', candidate, { enabled: typed })
  const hits = check.data ?? []
  return (
    <Card className="gap-4 py-4" data-testid="blacklist-check">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <SearchCheckIcon className="text-muted-foreground size-4" aria-hidden />
          {t('blacklist.check.title')}
        </CardTitle>
        <CardDescription>{t('blacklist.check.hint')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 px-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="bl-check-name">{t('blacklist.check.name')}</Label>
            <Input
              id="bl-check-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bl-check-phone">{t('blacklist.check.phone')}</Label>
            <Input
              id="bl-check-phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('blacklist.check.phonePlaceholder')}
              className="tabular-nums"
              autoComplete="off"
            />
          </div>
        </div>
        <div aria-live="polite" data-testid="blacklist-result">
          {!typed ? (
            <p className="text-muted-foreground text-sm">{t('blacklist.check.idle')}</p>
          ) : check.isPending || check.isFetching ? (
            <p className="text-muted-foreground text-sm">{t('blacklist.check.checking')}</p>
          ) : check.isError ? (
            <ErrorState error={check.error} onRetry={() => void check.refetch()} />
          ) : hits.length ? (
            <ul className="grid gap-2">
              {hits.map((hit) => (
                <li
                  key={hit.entryId}
                  className={cn(
                    'grid gap-1 rounded-lg border p-3 text-sm',
                    hit.severity === 'block'
                      ? 'border-destructive/50 bg-destructive/10'
                      : 'border-warning/60 bg-warning/15'
                  )}
                >
                  <p className="flex flex-wrap items-center gap-2">
                    <ShieldBanIcon
                      className={cn(
                        'size-4 shrink-0',
                        hit.severity === 'block' ? 'text-destructive' : 'text-warning'
                      )}
                      aria-hidden
                    />
                    <span className="font-semibold">{hit.name}</span>
                    <SeverityBadge severity={hit.severity} />
                  </p>
                  {hit.reasonText ? <p>{hit.reasonText}</p> : null}
                  <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                    <span>{t('blacklist.check.matchedBy')}</span>
                    {hit.reasons.map((r) => (
                      <Badge key={r} variant="secondary">
                        {t(`blacklist.check.reason.${r}`)}
                      </Badge>
                    ))}
                  </p>
                  <p className="text-xs">{t(`blacklist.severityHint.${hit.severity}`)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-success flex items-center gap-2 text-sm font-medium">
              <CheckCircle2Icon className="size-4" aria-hidden />
              {t('blacklist.check.none')}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function BlacklistView() {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const isMobile = useIsMobile()
  const query = useApiQuery('blacklist.list', { status: 'all' })
  const [view, setView] = useState<View>('active')
  const [removing, setRemoving] = useState<BlacklistEntryDto | null>(null)
  if (query.isPending)
    return (
      <div role="status" aria-busy className="grid gap-4">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-40" aria-hidden />
        <Skeleton className="h-64" aria-hidden />
      </div>
    )
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const rows = query.data
  const counts = {
    active: rows.filter((r) => r.status === 'active').length,
    removed: rows.filter((r) => r.status === 'removed').length
  }
  const shown = rows.filter((r) => r.status === view)
  const canRemove = can('blacklist.remove', 'edit') && view === 'active'
  const addedLine = (r: BlacklistEntryDto): string =>
    [f.date(dayOf(r.createdAt), 'medium'), r.addedByName].filter(Boolean).join(' · ')
  const removedLine = (r: BlacklistEntryDto) =>
    r.removedAt
      ? t('blacklist.removedOn', { date: f.date(dayOf(r.removedAt), 'medium'), by: r.removedByName ?? '—' })
      : null
  const phoneOf = (r: BlacklistEntryDto) => displayPhone(r.phoneNormalized)
  return (
    <div className="grid gap-4">
      <CheckCard />
      <Card className="gap-3 py-4" data-testid="blacklist-list">
        <CardHeader className="flex flex-wrap items-center gap-2 px-4">
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={1}
            value={view}
            onValueChange={(v) => v && setView(v as View)}
            aria-label={t('blacklist.viewLabel')}
            data-testid="blacklist-view"
          >
            {VIEWS.map((key) => (
              <ToggleGroupItem key={key} value={key} className="gap-1.5">
                {t(`blacklist.tabs.${key}`)}
                <span className="text-muted-foreground tabular-nums">{counts[key]}</span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardHeader>
        <CardContent className="px-4">
          {!rows.length ? (
            <EmptyState
              compact
              icon={ShieldBanIcon}
              title={t('blacklist.emptyTitle')}
              body={t('blacklist.emptyBody')}
            />
          ) : !shown.length ? (
            <EmptyState
              compact
              icon={view === 'active' ? ShieldBanIcon : HistoryIcon}
              title={t(view === 'active' ? 'blacklist.noneActive' : 'blacklist.noneRemoved')}
              body={t(view === 'active' ? 'blacklist.noneActiveHint' : 'blacklist.noneRemovedHint')}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setView(view === 'active' ? 'removed' : 'active')}
                >
                  {t(view === 'active' ? 'blacklist.showRemoved' : 'blacklist.showActive')}
                </Button>
              }
            />
          ) : isMobile ? (
            <ul className="grid gap-2" data-testid="blacklist-cards">
              {shown.map((r) => (
                <li key={r.id} className="grid gap-1.5 rounded-xl border p-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.name}</span>
                    <SeverityBadge severity={r.severity} />
                  </p>
                  {phoneOf(r) ? (
                    <p dir="ltr" className="text-muted-foreground text-start tabular-nums">
                      {phoneOf(r)}
                    </p>
                  ) : null}
                  <p>
                    <span className="text-muted-foreground">
                      {t(`blacklist.reasonCode.${r.reasonCode}`, { defaultValue: r.reasonCode })}:{' '}
                    </span>
                    {r.reasonText}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t('blacklist.addedOn', { date: addedLine(r) })}
                  </p>
                  {r.status === 'removed' ? (
                    <p className="text-muted-foreground border-t pt-1.5 text-xs">
                      {removedLine(r)} · {r.removedReason}
                    </p>
                  ) : null}
                  {canRemove ? (
                    <Button variant="outline" className="mt-1" onClick={() => setRemoving(r)}>
                      {t('blacklist.remove')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Table data-testid="blacklist-table">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-start">{t('blacklist.col.person')}</TableHead>
                  <TableHead className="text-start">{t('blacklist.col.reason')}</TableHead>
                  <TableHead className="text-start">{t('blacklist.col.severity')}</TableHead>
                  <TableHead className="text-start">
                    {view === 'active' ? t('blacklist.col.added') : t('blacklist.col.removed')}
                  </TableHead>
                  {canRemove ? <TableHead className="w-0" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((r) => (
                  <TableRow key={r.id} data-testid={`blacklist-row-${r.id}`}>
                    <TableCell className="min-w-40 align-top whitespace-normal">
                      <span className="block font-medium">{r.name}</span>
                      {phoneOf(r) ? (
                        <span dir="ltr" className="text-muted-foreground block text-xs tabular-nums">
                          {phoneOf(r)}
                        </span>
                      ) : null}
                      {r.idDocNumber ? (
                        <span dir="ltr" className="text-muted-foreground block text-xs tabular-nums">
                          {r.idDocNumber}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="min-w-64 align-top whitespace-normal">
                      <span className="text-muted-foreground block text-xs">
                        {t(`blacklist.reasonCode.${r.reasonCode}`, { defaultValue: r.reasonCode })}
                      </span>
                      {r.reasonText}
                      {r.removedReason ? (
                        <span className="text-muted-foreground block text-xs">{r.removedReason}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <SeverityBadge severity={r.severity} />
                    </TableCell>
                    <TableCell className="text-muted-foreground align-top whitespace-normal">
                      {r.status === 'removed' ? removedLine(r) : addedLine(r)}
                    </TableCell>
                    {canRemove ? (
                      <TableCell className="text-end align-top">
                        <Button variant="outline" size="sm" onClick={() => setRemoving(r)}>
                          {t('blacklist.remove')}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {rows.length ? (
            <dl className="text-muted-foreground mt-3 grid gap-1 border-t pt-3 text-xs sm:grid-cols-2">
              {SEVERITIES.map((key) => (
                <div key={key} className="flex items-start gap-2">
                  <dt className="shrink-0">
                    <SeverityBadge severity={key} />
                  </dt>
                  <dd>{t(`blacklist.severityHint.${key}`)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </CardContent>
      </Card>
      <RemoveDialog
        key={removing?.id ?? 'none'}
        entry={removing}
        onOpenChange={(o) => !o && setRemoving(null)}
      />
    </div>
  )
}

export function BlacklistPage() {
  const { t } = useTranslation()
  const can = useCan()
  const [adding, setAdding] = useState(false)
  // The main action is a worded button in the header; on the phone it sits under the title, full width.
  const add =
    can('blacklist') && can('blacklist', 'edit') ? (
      <Button onClick={() => setAdding(true)} data-testid="blacklist-add">
        <UserXIcon aria-hidden />
        {t('blacklist.add')}
      </Button>
    ) : undefined
  return (
    <Page title={t('nav.blacklist')} description={t('blacklist.description')} actions={add}>
      {can('blacklist') ? <BlacklistView /> : <NoAccessState />}
      {adding ? <AddDialog open onOpenChange={setAdding} /> : null}
    </Page>
  )
}
