// Çamaşırhane (G-171, K-28, S-95; akislar.md 11:00 clean slip in, 15:00 dirty out). The laundry from the phone
// book; per item type this month's out / in / stained and today's balance (giden − gelen, FIFO: the latest batch
// in the wash, pieces of earlier deliveries missing — loud; more back than sent — a warning); the agreed prices
// with their date; the month's computed amount against the laundry's invoice and "Ödendi" (one expense); the
// 12-month trend; the delivery log. Item types are the hotel's list (Ayarlar → Listeler). On the phone the screen is
// read-only (faz-12 madde 6).
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangleIcon,
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  DropletIcon,
  ListIcon,
  PhoneIcon,
  ShirtIcon,
  WalletIcon
} from 'lucide-react'
import { today as todayOf, type LocalDate } from '@shared/date'
import { yearMonthOf } from '@shared/domain/local-datetime'
import type { ContactView } from '@shared/contract/procedures/contacts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { CopyButton } from '@/components/copy-button'
import { KpiCard } from '@/components/kpi-card'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { SectionCard } from '@/components/section-card'
import { EmptyState, ErrorState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery, useSettings } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { useLocalName } from '../settings/use-admin'
import { telOf } from '../contacts/categories'
import {
  monthStart,
  receivable,
  shiftMonth,
  typeRows,
  type ItemType,
  type TypeRow,
  type YearMonth
} from './derive'
import { DeliveryLog, PricesCard, SettlementCard, TrendCard } from './laundry-cards'
import { DeliveryDialog } from './laundry-dialogs'

const NUM_COLS = ['out', 'in', 'stained', 'inTransit', 'missing'] as const
const CARD_COLS = ['out', 'in', 'stained', 'inTransit'] as const

function ContactCard({ contact }: { contact: ContactView }) {
  const { t } = useTranslation()
  return (
    <Card className="py-4" data-testid="laundry-contact">
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4">
        <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
          <span className="bg-accent text-accent-foreground grid size-10 shrink-0 place-items-center rounded-lg">
            <ShirtIcon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-semibold break-words">{contact.name}</p>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {contact.phones.map((p, i) => (
                <span key={`${p.number}-${i}`} className="inline-flex items-center gap-1">
                  <a
                    href={telOf(p.number)}
                    dir="ltr"
                    className="text-foreground inline-flex min-h-8 items-center gap-1 tabular-nums underline-offset-4 hover:underline max-md:min-h-11"
                  >
                    <PhoneIcon className="size-3.5" aria-hidden />
                    {p.number}
                  </a>
                  <CopyButton text={p.number} size="icon-sm" variant="ghost" label={t('laundry.copyPhone')} />
                </span>
              ))}
              {contact.note ? <span>{contact.note}</span> : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TypeTable({ rows }: { rows: TypeRow[] }) {
  const { t } = useTranslation()
  const total = (k: (typeof NUM_COLS)[number]): number => rows.reduce((s, r) => s + r[k], 0)
  return (
    <Table density="compact">
      <TableHeader>
        <TableRow>
          <TableHead>{t('laundry.col.item')}</TableHead>
          {NUM_COLS.map((k) => (
            <TableHead key={k} className="text-end whitespace-normal">
              {t(`laundry.col.${k}`)}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow
            key={r.item.id}
            className={cn((r.missing > 0 || r.extra > 0) && 'bg-destructive/5')}
            data-testid={`type-${r.item.id}`}
          >
            <TableCell className="font-medium whitespace-normal">
              {r.item.name}
              {r.extra ? (
                <span className="text-destructive block text-xs font-normal">
                  {t('laundry.extraN', { count: r.extra })}
                </span>
              ) : null}
            </TableCell>
            <TableCell className="text-end tabular-nums">{r.out}</TableCell>
            <TableCell className="text-end tabular-nums">{r.in}</TableCell>
            <TableCell className={cn('text-end tabular-nums', !r.stained && 'text-muted-foreground')}>
              {r.stained}
            </TableCell>
            <TableCell className="text-muted-foreground text-end tabular-nums">{r.inTransit}</TableCell>
            <TableCell className="text-end">
              {r.missing ? (
                <Badge variant="destructive" className="tabular-nums">
                  {r.missing}
                </Badge>
              ) : (
                <span className="text-muted-foreground tabular-nums">0</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>{t('common.total')}</TableCell>
          {NUM_COLS.map((k) => (
            <TableCell
              key={k}
              className={cn('text-end tabular-nums', k === 'missing' && total(k) > 0 && 'text-destructive')}
            >
              {total(k)}
            </TableCell>
          ))}
        </TableRow>
      </TableFooter>
    </Table>
  )
}

function TypeCards({ rows }: { rows: TypeRow[] }) {
  const { t } = useTranslation()
  return (
    <ul className="grid gap-2">
      {rows.map((r) => (
        <li
          key={r.item.id}
          data-testid={`type-${r.item.id}`}
          className={cn(
            'grid gap-2 rounded-lg border p-3',
            (r.missing > 0 || r.extra > 0) && 'border-destructive/60 bg-destructive/5'
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">{r.item.name}</span>
            {r.missing ? (
              <Badge variant="destructive">{t('laundry.missingN', { count: r.missing })}</Badge>
            ) : null}
            {r.extra ? <Badge variant="destructive">{t('laundry.extraN', { count: r.extra })}</Badge> : null}
          </div>
          <dl className="grid grid-cols-4 gap-1 text-center text-xs">
            {CARD_COLS.map((k) => (
              <div key={k} className="bg-muted/50 rounded-md px-1 py-1.5">
                <dt className="text-muted-foreground">{t(`laundry.col.${k}`)}</dt>
                <dd className="text-sm font-semibold tabular-nums">{r[k]}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  )
}

function LaundrySkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-4">
      <span className="sr-only">{t('common.loading')}</span>
      <Skeleton className="h-20" aria-hidden />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-80" aria-hidden />
    </div>
  )
}

function LaundryView({
  laundry,
  today,
  entry,
  onEntry
}: {
  laundry: ContactView
  today: LocalDate
  entry: 'in' | 'out' | null
  onEntry: (direction: 'in' | 'out' | null) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const isMobile = useIsMobile()
  const can = useCan()
  const nameOf = useLocalName()
  const settings = useSettings()
  const base = settings.data?.['hotel.baseCurrency'] ?? 'TRY'
  const current: YearMonth = yearMonthOf(today)
  const lastMonth = shiftMonth(current, -1)
  const contactId = laundry.id
  // Closed types too: pieces of a type taken off the list still come back and are still owed (K-28).
  const typesQuery = useApiQuery('lists.list', { kind: 'laundryItemTypes', includeInactive: true })
  const prices = useApiQuery('laundry.prices', { contactId })
  const outstanding = useApiQuery('laundry.outstanding', { contactId, until: today })
  const deliveries = useApiQuery('laundry.deliveries', { contactId, from: monthStart(lastMonth), to: today })
  const trend = useApiQuery('laundry.trend', { contactId, until: today, months: 12 })
  const allTypes: ItemType[] = useMemo(
    () =>
      (typesQuery.data ?? []).map((ty) => {
        const name = nameOf(ty.nameI18n, ty.name)
        return { id: ty.id, name: ty.active ? name : t('laundry.closedType', { name }), active: ty.active }
      }),
    [typesQuery.data, nameOf, t]
  )
  const types = useMemo(() => allTypes.filter((ty) => ty.active !== false), [allTypes])
  const all = [typesQuery, prices, outstanding, deliveries]
  const failed = all.find((q) => q.isError)
  if (failed) return <ErrorState error={failed.error} onRetry={() => all.forEach((q) => void q.refetch())} />
  if (!typesQuery.data || !prices.data || !outstanding.data || !deliveries.data) return <LaundrySkeleton />

  const rows = typeRows(allTypes, deliveries.data, outstanding.data, prices.data, current)
  const missing = rows.reduce((s, r) => s + r.missing, 0)
  const extra = rows.reduce((s, r) => s + r.extra, 0)
  const atLaundry = rows.reduce((s, r) => s + r.inTransit + r.missing, 0)
  const stained = rows.reduce((s, r) => s + r.stained, 0)
  const thisTrend = trend.data?.at(-1)
  const money = can('expenses')
  const edit = can('laundry', 'edit') && !isMobile

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <ContactCard contact={laundry} />

      {missing ? (
        <Alert variant="destructive" data-testid="laundry-missing">
          <AlertTriangleIcon />
          <AlertTitle>{t('laundry.missingTitle', { count: missing })}</AlertTitle>
          <AlertDescription>
            {rows
              .filter((r) => r.missing)
              .map((r) =>
                t('laundry.missingSince', {
                  name: r.item.name,
                  count: r.missing,
                  date: r.openSince ? f.dayMonth(r.openSince) : '—'
                })
              )
              .join(', ')}
          </AlertDescription>
        </Alert>
      ) : null}
      {extra ? (
        <Alert variant="destructive" data-testid="laundry-extra">
          <AlertTriangleIcon />
          <AlertTitle>{t('laundry.extraTitle', { count: extra })}</AlertTitle>
          <AlertDescription>
            {rows
              .filter((r) => r.extra)
              .map((r) => t('laundry.missingItem', { name: r.item.name, count: r.extra }))
              .join(', ')}
            {' — '}
            {t('laundry.extraHint')}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={t('laundry.kpi.atLaundry')}
          value={f.number(atLaundry)}
          hint={t('laundry.kpi.atLaundryHint')}
          icon={<ShirtIcon className="size-3.5" aria-hidden />}
        />
        <KpiCard
          label={t('laundry.kpi.missing')}
          value={f.number(missing)}
          hint={t('laundry.kpi.missingHint')}
          icon={<AlertTriangleIcon className="size-3.5" aria-hidden />}
          className={cn(missing > 0 && 'border-destructive/50')}
        />
        <KpiCard
          label={t('laundry.kpi.stained')}
          value={f.number(stained)}
          hint={t('laundry.kpi.stainedHint')}
          icon={<DropletIcon className="size-3.5" aria-hidden />}
        />
        {money ? (
          <KpiCard
            label={t('laundry.kpi.amount')}
            value={thisTrend?.amountMinor == null ? '—' : f.money(thisTrend.amountMinor, base)}
            hint={t('laundry.kpi.amountHint')}
            icon={<WalletIcon className="size-3.5" aria-hidden />}
          />
        ) : (
          <KpiCard
            label={t('laundry.kpi.deliveries')}
            value={f.number(deliveries.data.filter((d) => d.date === today && !d.voidedAt).length)}
            hint={t('laundry.kpi.deliveriesHint')}
            icon={<ListIcon className="size-3.5" aria-hidden />}
          />
        )}
      </div>

      <SectionCard
        title={t('laundry.byType', { month: f.monthYear(monthStart(current)) })}
        icon={ShirtIcon}
        testId="laundry-types"
        action={
          can('settings.lists', 'edit') && !isMobile ? (
            <Button asChild variant="link" size="sm" className="h-auto px-0">
              <Link to="/settings" search={{ tab: 'lists' }}>
                {t('laundry.editTypes')}
              </Link>
            </Button>
          ) : null
        }
      >
        <div className="grid gap-3">
          {isMobile ? <TypeCards rows={rows} /> : <TypeTable rows={rows} />}
          <p className="text-muted-foreground text-xs">{t('laundry.balanceNote')}</p>
        </div>
      </SectionCard>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {money ? (
          <SettlementCard
            contactId={contactId}
            months={[lastMonth, current]}
            types={allTypes}
            prices={prices.data}
            today={today}
            base={base}
            canInvoice={edit}
            canPay={edit && can('expenses', 'edit')}
          />
        ) : null}
        {money ? (
          <PricesCard
            contactId={contactId}
            types={types}
            prices={prices.data}
            today={today}
            base={base}
            canEdit={edit}
          />
        ) : null}
        {trend.data ? <TrendCard points={trend.data} base={base} showMoney={money} /> : null}
        <DeliveryLog deliveries={deliveries.data} canEdit={edit} />
      </div>

      {entry ? (
        <DeliveryDialog
          direction={entry}
          contactId={contactId}
          types={entry === 'in' ? receivable(allTypes, rows) : types}
          rows={rows}
          today={today}
          base={base}
          onClose={() => onEntry(null)}
        />
      ) : null}
    </div>
  )
}

export function LaundryPage({ today = todayOf() }: { today?: LocalDate }) {
  const { t } = useTranslation()
  const can = useCan()
  const isMobile = useIsMobile()
  const query = useApiQuery('contacts.list', { category: 'laundry' })
  const [picked, setPicked] = useState<string | null>(null)
  const [entry, setEntry] = useState<'in' | 'out' | null>(null)
  const laundries = query.data ?? []
  const laundry = laundries.find((c) => c.id === picked) ?? laundries[0] ?? null
  // The screen's two main actions (clean slip in, dirty out) are worded buttons in the header.
  const actions =
    can('laundry', 'edit') && !isMobile && laundry ? (
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setEntry('in')} data-testid="laundry-in">
          <ArrowDownToLineIcon aria-hidden />
          {t('laundry.in.button')}
        </Button>
        <Button variant="outline" onClick={() => setEntry('out')} data-testid="laundry-out">
          <ArrowUpFromLineIcon aria-hidden />
          {t('laundry.out.button')}
        </Button>
      </div>
    ) : undefined
  return (
    <Page title={t('nav.laundry')} description={t('laundry.description')} actions={actions}>
      <QueryView query={query} loading={<LaundrySkeleton />}>
        {(list) =>
          !list.length || !laundry ? (
            <EmptyState
              icon={ShirtIcon}
              title={t('laundry.emptyTitle')}
              body={t('laundry.emptyBody')}
              action={
                can('contacts', 'edit') ? (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/contacts">{t('laundry.toContacts')}</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4">
              {list.length > 1 ? (
                <Select value={laundry.id} onValueChange={setPicked}>
                  <SelectTrigger className="w-72 max-md:w-full" aria-label={t('laundry.pick')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {list.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <LaundryView
                key={laundry.id}
                laundry={laundry}
                today={today}
                entry={entry}
                onEntry={setEntry}
              />
            </div>
          )
        }
      </QueryView>
    </Page>
  )
}
