// Firmalar (G-191; faz-06 madde 3): companies on their own screen, also without a guest — favourites first, then
// the last used; search by title or tax number; one-click copy for the invoice program; each company's guests and
// its stays and payments so far ("kurumsal geçmiş").
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { keepPreviousData } from '@tanstack/react-query'
import { Building2Icon, ChevronRightIcon, CrownIcon, PlusIcon, SearchIcon } from 'lucide-react'
import type { CompanyViewDto } from '@shared/contract/procedures/guests'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Page } from '@/components/page'
import { EmptyState, ErrorState, NoAccessState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { useDebounced } from '@/features/calendar/booking-api'
import { StayList } from '@/features/guests/guest-history'
import { CompanyCard } from './company-card'
import { CompanyDialog } from './company-dialog'

function CompanyDetail({ id }: { id: string }) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const query = useApiQuery('companies.get', { id })
  if (query.isPending)
    return (
      <div role="status" aria-busy className="grid gap-3 p-4">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const d = query.data
  const showMoney = can('payments') && !d.moneyHidden
  const spent = Object.entries(d.totalSpent)
  return (
    <>
      <SheetHeader className="gap-1 border-b text-start">
        <SheetTitle className="pe-8 text-lg break-words">{d.company.title}</SheetTitle>
        <SheetDescription>{t('companies.detail.description')}</SheetDescription>
      </SheetHeader>
      <div className="grid gap-5 p-4">
        <CompanyCard company={d.company} />
        <section className="grid gap-2" aria-labelledby="company-guests">
          <h3 id="company-guests" className="text-sm font-semibold">
            {t('guests.company.guests')}
          </h3>
          {d.guests.length ? (
            <ul className="grid gap-1.5" data-testid="company-guests">
              {d.guests.map((g) => (
                <li
                  key={g.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="font-medium">{`${g.firstName} ${g.lastName}`.trim()}</span>
                  {g.vip ? (
                    <span role="img" aria-label={t('guests.icon.vip')}>
                      <CrownIcon className="text-warning size-3.5" aria-hidden />
                    </span>
                  ) : null}
                  {g.phone ? (
                    <span dir="ltr" className="text-muted-foreground ms-auto text-xs tabular-nums">
                      {g.phone}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">{t('companies.detail.noGuests')}</p>
          )}
        </section>
        <section className="grid gap-3" aria-labelledby="company-history">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 id="company-history" className="text-sm font-semibold">
              {t('companies.detail.history')}
            </h3>
            <p className="text-muted-foreground text-xs" data-testid="company-totals">
              {t('guests.summary.stays', { count: d.stayCount })}
              {' · '}
              {t('calendar.nights', { count: d.totalNights })}
              {showMoney && spent.length ? (
                <>
                  {' · '}
                  {spent.map(([currency, minor], i) => (
                    <bdi key={currency} className="tabular-nums">
                      {i ? ', ' : ''}
                      {f.money(minor, currency)}
                    </bdi>
                  ))}
                </>
              ) : null}
            </p>
          </div>
          {d.stays.length ? (
            <StayList stays={d.stays} showMoney={showMoney} showGuest />
          ) : (
            <p className="text-muted-foreground text-sm">{t('companies.detail.noStays')}</p>
          )}
        </section>
      </div>
    </>
  )
}

function ListSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-4 md:grid-cols-2">
      <span className="sr-only">{t('common.loading')}</span>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-48 rounded-xl" aria-hidden />
      ))}
    </div>
  )
}

function CompaniesView({ onNew }: { onNew: () => void }) {
  const { t } = useTranslation()
  const can = useCan()
  const isMobile = useIsMobile()
  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim())
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<CompanyViewDto | null>(null)
  const list = useApiQuery('companies.list', { q: q || undefined }, { placeholderData: keepPreviousData })
  return (
    <div className="grid gap-3">
      <div className="relative min-w-0">
        <SearchIcon
          className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('guests.company.search')}
          aria-label={t('guests.company.searchLabel')}
          className="ps-9"
          data-testid="company-search"
        />
      </div>
      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data.length && !q ? (
        <EmptyState
          icon={Building2Icon}
          title={t('guests.company.empty')}
          body={t('guests.company.emptyHint')}
          action={
            can('companies', 'edit') ? (
              <Button variant="outline" size="sm" onClick={onNew}>
                {t('guests.company.new')}
              </Button>
            ) : undefined
          }
        />
      ) : !list.data.length ? (
        <EmptyState
          compact
          icon={SearchIcon}
          title={t('guests.company.noMatch')}
          body={t('common.noMatchBody')}
          action={
            <Button variant="outline" size="sm" onClick={() => setQuery('')}>
              {t('common.clearFilter')}
            </Button>
          }
        />
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2" data-testid="company-list">
          {list.data.map((company) => (
            <CompanyCard key={company.id} company={company} onEdit={() => setEditing(company)}>
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Badge variant="secondary" className="tabular-nums">
                  {t('companies.guestCount', { count: company.guestCount })}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="ms-auto"
                  onClick={() => setOpenId(company.id)}
                  data-testid={`company-open-${company.id}`}
                >
                  {t('companies.detail.open')}
                  <ChevronRightIcon className="rtl:rotate-180" aria-hidden />
                </Button>
              </div>
            </CompanyCard>
          ))}
        </div>
      )}
      <Sheet open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          className={cn(
            'gap-0 overflow-y-auto',
            isMobile ? 'max-h-[92dvh] rounded-t-xl' : 'w-full sm:max-w-xl'
          )}
          data-testid="company-sheet"
        >
          {openId ? <CompanyDetail key={openId} id={openId} /> : null}
        </SheetContent>
      </Sheet>
      {editing ? (
        <CompanyDialog key={editing.id} open company={editing} onOpenChange={(o) => !o && setEditing(null)} />
      ) : null}
    </div>
  )
}

export function CompaniesPage() {
  const { t } = useTranslation()
  const can = useCan()
  const [creating, setCreating] = useState(false)
  const add = can('companies', 'edit') ? (
    <Button onClick={() => setCreating(true)} data-testid="company-new">
      <PlusIcon aria-hidden />
      {t('guests.company.new')}
    </Button>
  ) : undefined
  return (
    <Page title={t('nav.companies')} description={t('companies.description')} actions={add}>
      {can('companies') ? <CompaniesView onNew={() => setCreating(true)} /> : <NoAccessState />}
      {creating ? <CompanyDialog open company={null} onOpenChange={setCreating} /> : null}
    </Page>
  )
}
