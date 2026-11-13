// Guest card (G-50, G-190…G-192; faz-06 madde 2): tags (K-46 (2)), contact with copy buttons, blacklist and
// duplicate warnings,
// the standing request, the price/payment summary (the reservation panel's numbers) with "bu fiyatı yeni
// rezervasyona uygula", then tabs — history (the owner's favourite), details and the company card. Desktop:
// right-hand sheet; phone: bottom sheet (G-143 "misafir arama ve geçmişi").
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CrownIcon,
  LockIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  ShieldBanIcon,
  UserXIcon,
  UsersRoundIcon
} from 'lucide-react'
import type { GuestCardDto, GuestViewDto } from '@shared/contract/procedures/guests'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { CopyButton } from '@/components/copy-button'
import { ErrorState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { useAdminMutation } from '@/features/settings/use-admin'
import { CompanyCard } from '@/features/companies/company-card'
import { GuestFace } from './guest-face'
import { GUEST_READS } from './guests-api'
import { HistorySummary, StayList } from './guest-history'
import { GuestTagPicker } from './guest-tags'
import { StandingNote } from './standing-note'
import { useDisplayNames } from './use-names'

const NONE = '__none'

function NotesEditor({ guest, canEdit }: { guest: GuestViewDto; canEdit: boolean }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(guest.notes ?? '')
  const save = useAdminMutation('guests.update', {
    invalidate: GUEST_READS,
    success: t('guests.toast.saved')
  })
  if (!editing)
    return (
      <div className="flex items-start gap-2">
        <p
          className={cn(
            'min-w-0 flex-1 text-sm whitespace-pre-line',
            !guest.notes && 'text-muted-foreground'
          )}
        >
          {guest.notes ?? t('guests.info.noNotes')}
        </p>
        {canEdit ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="-my-1"
            aria-label={t('guests.info.editNotes')}
            onClick={() => {
              setText(guest.notes ?? '')
              setEditing(true)
            }}
          >
            <PencilIcon aria-hidden />
          </Button>
        ) : null}
      </div>
    )
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate({ id: guest.id, patch: { notes: text } }, { onSuccess: () => setEditing(false) })
      }}
    >
      <Textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={t('guests.info.notes')}
        placeholder={t('guests.form.notesPlaceholder')}
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}

function CompanyTab({ card }: { card: GuestCardDto }) {
  const { t } = useTranslation()
  const can = useCan()
  const [linkTo, setLinkTo] = useState<string>(card.guest.companyId ?? NONE)
  const companies = useApiQuery(
    'companies.list',
    {},
    { enabled: can('companies', 'edit') && can('guests', 'edit') }
  )
  const link = useAdminMutation('guests.update', {
    invalidate: GUEST_READS,
    success: t('guests.company.linked')
  })
  const canLink = can('companies') && can('guests', 'edit') && (companies.data?.length ?? 0) > 0
  return (
    <div className="grid gap-3">
      {card.company ? (
        <CompanyCard company={card.company} />
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
          {t('guests.company.none')}
        </p>
      )}
      {canLink ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-48 flex-1 gap-1.5">
            <Label htmlFor="link-company">
              {t(card.company ? 'guests.company.change' : 'guests.company.link')}
            </Label>
            <Select value={linkTo} onValueChange={setLinkTo}>
              <SelectTrigger id="link-company" className="w-full">
                <SelectValue placeholder={t('guests.company.pick')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('guests.form.noCompany')}</SelectItem>
                {(companies.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="secondary"
            disabled={(linkTo === NONE ? null : linkTo) === card.guest.companyId || link.isPending}
            onClick={() =>
              link.mutate({ id: card.guest.id, patch: { companyId: linkTo === NONE ? null : linkTo } })
            }
            data-testid="company-link"
          >
            {t('guests.company.linkAction')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function GuestCardView({
  card,
  onEdit,
  onMerge,
  onOpenGuest,
  onBlacklist,
  onNewReservation
}: {
  card: GuestCardDto
  onEdit: () => void
  onMerge: (other: GuestViewDto) => void
  onOpenGuest: (guestId: string) => void
  onBlacklist: () => void
  onNewReservation?: (price: { amountMinor: number; currency: string } | null) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const names = useDisplayNames()
  const { guest } = card
  const canEdit = can('guests', 'edit')
  const history = useApiQuery('guests.history', { guestId: guest.id })
  const vip = useAdminMutation('guests.update', { invalidate: GUEST_READS })
  const showMoney = can('payments') && !history.data?.moneyHidden
  const name = `${guest.firstName} ${guest.lastName}`.trim()
  const first = history.data?.stays.filter((s) => s.status !== 'cancelled').at(-1)?.checkIn ?? null
  const dup = card.duplicates[0]
  return (
    <>
      <SheetHeader className="gap-2 border-b text-start">
        <div className="flex flex-wrap items-center gap-2 pe-8">
          <SheetTitle className="text-lg break-words" data-testid="guest-card-name">
            {name}
          </SheetTitle>
          {guest.vip ? (
            <Badge variant="secondary" className="gap-1">
              <CrownIcon className="text-warning" aria-hidden />
              {t('guests.card.vip')}
            </Badge>
          ) : null}
        </div>
        <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {guest.nationality ? <span>{names.region(guest.nationality)}</span> : null}
          {guest.language ? <span>{names.language(guest.language)}</span> : null}
          <span>
            {first ? t('guests.card.since', { date: f.monthYear(first) }) : t('guests.card.firstTime')}
          </span>
        </SheetDescription>
        <GuestTagPicker guestId={guest.id} tagIds={card.tagIds} canEdit={canEdit} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {guest.phone ? (
            <span className="flex items-center gap-1">
              <PhoneIcon className="text-muted-foreground size-4" aria-hidden />
              <span dir="ltr" className="tabular-nums">
                {guest.phone}
              </span>
              <CopyButton
                text={guest.phone}
                size="icon-sm"
                variant="ghost"
                label={t('guests.card.copyPhone')}
              />
            </span>
          ) : (
            <span className="text-muted-foreground">{t('guests.card.noPhone')}</span>
          )}
          {guest.email ? (
            <span className="flex min-w-0 items-center gap-1">
              <MailIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <span className="truncate" dir="ltr">
                {guest.email}
              </span>
              <CopyButton
                text={guest.email}
                size="icon-sm"
                variant="ghost"
                label={t('guests.card.copyEmail')}
              />
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {onNewReservation ? (
            <Button size="sm" onClick={() => onNewReservation(null)} data-testid="guest-new-reservation">
              {t('guests.card.newReservation')}
            </Button>
          ) : null}
          {canEdit ? (
            <Button variant="outline" size="sm" onClick={onEdit} data-testid="guest-edit">
              <PencilIcon aria-hidden />
              {t('common.edit')}
            </Button>
          ) : null}
          {can('blacklist', 'edit') && !card.blacklist.length ? (
            <Button variant="outline" size="sm" onClick={onBlacklist} data-testid="guest-blacklist">
              <UserXIcon aria-hidden />
              {t('blacklist.add')}
            </Button>
          ) : null}
        </div>
      </SheetHeader>

      <div className="grid gap-4 p-4">
        {card.blacklist.length ? (
          <Alert
            variant="destructive"
            className="border-destructive bg-destructive/5"
            data-testid="card-blacklist"
          >
            <ShieldBanIcon />
            <AlertTitle>{t('booking.blacklist.title')}</AlertTitle>
            <AlertDescription>
              {card.blacklist.map((hit) => (
                <p key={hit.entryId}>
                  <span className="font-semibold">{hit.name}</span>
                  {' · '}
                  {hit.reasons.map((r) => t(`booking.blacklist.reason.${r}`)).join(', ')}
                  {hit.severity === 'block' ? ` · ${t('booking.blacklist.severe')}` : ''}
                  {hit.reasonText ? <span className="text-foreground block">{hit.reasonText}</span> : null}
                </p>
              ))}
            </AlertDescription>
          </Alert>
        ) : null}
        {dup ? (
          <Alert className="border-info/50" data-testid="duplicate-hint">
            <UsersRoundIcon />
            <AlertTitle>{t('guests.dup.title')}</AlertTitle>
            <AlertDescription className="grid gap-2">
              <p>
                {t('guests.dup.body', {
                  name: `${dup.guest.firstName} ${dup.guest.lastName}`.trim(),
                  reasons: dup.reasons.map((r) => t(`guests.dup.reason.${r}`)).join(', ')
                })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onOpenGuest(dup.guest.id)}>
                  {t('guests.dup.open')}
                </Button>
                {can('guests.merge', 'edit') ? (
                  <Button size="sm" onClick={() => onMerge(dup.guest)} data-testid="merge-open">
                    {t('guests.dup.merge')}
                  </Button>
                ) : null}
              </div>
            </AlertDescription>
          </Alert>
        ) : null}

        <StandingNote key={`${guest.id}-${guest.updatedAt}`} guest={guest} canEdit={canEdit} />
        {history.isPending ? (
          <div role="status" aria-busy className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <span className="sr-only">{t('common.loading')}</span>
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20" aria-hidden />
            ))}
          </div>
        ) : history.isError ? (
          <ErrorState error={history.error} onRetry={() => void history.refetch()} />
        ) : (
          <HistorySummary
            history={history.data}
            showMoney={showMoney}
            onApplyPrice={onNewReservation ? (price) => onNewReservation(price) : undefined}
          />
        )}

        <Tabs defaultValue="history" className="gap-4">
          <TabsList className="w-full">
            <TabsTrigger value="history">{t('guests.card.tabs.history')}</TabsTrigger>
            <TabsTrigger value="info">{t('guests.card.tabs.info')}</TabsTrigger>
            {can('companies') ? (
              <TabsTrigger value="company">{t('guests.card.tabs.company')}</TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="history">
            {history.data ? <StayList stays={history.data.stays} showMoney={showMoney} /> : null}
          </TabsContent>

          <TabsContent value="info" className="grid gap-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs">{t('guests.form.firstName')}</dt>
                <dd className="font-medium break-words">{guest.firstName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">{t('guests.form.lastName')}</dt>
                <dd className="font-medium break-words">{guest.lastName || '—'}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">{t('guests.form.language')}</dt>
                <dd className="font-medium">{names.language(guest.language) || '—'}</dd>
              </div>
              {guest.nationality ? (
                <div>
                  <dt className="text-muted-foreground text-xs">{t('guests.form.nationality')}</dt>
                  <dd className="font-medium">{names.region(guest.nationality)}</dd>
                </div>
              ) : null}
              {can('guests.identity') ? (
                <div className="col-span-2">
                  <dt className="text-muted-foreground text-xs">{t('guests.info.identity')}</dt>
                  <dd className="font-medium" data-testid="guest-identity">
                    {guest.idDocNumber ? (
                      <>
                        {guest.idDocType ? `${t(`guests.docType.${guest.idDocType}`)} · ` : null}
                        <span dir="ltr" className="tabular-nums">
                          {guest.idDocNumber}
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              ) : guest.idDocNumber ? (
                <div className="col-span-2">
                  <dt className="text-muted-foreground text-xs">{t('guests.info.identity')}</dt>
                  <dd className="text-muted-foreground flex items-center gap-1.5">
                    <LockIcon className="size-3.5" aria-hidden />
                    {t('guests.info.identityHidden')}
                  </dd>
                </div>
              ) : null}
            </dl>
            <Label
              htmlFor="card-vip"
              className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 font-normal"
            >
              <span className="grid flex-1 gap-0.5">
                <span className="text-sm font-medium">{t('guests.form.vip')}</span>
                <span className="text-muted-foreground text-xs">{t('guests.form.vipHint')}</span>
              </span>
              <Switch
                id="card-vip"
                checked={guest.vip}
                disabled={!canEdit || vip.isPending}
                onCheckedChange={(on) => vip.mutate({ id: guest.id, patch: { vip: on } })}
              />
            </Label>
            <GuestFace key={guest.id} guestId={guest.id} />
            <section className="grid gap-1.5" aria-labelledby="card-notes">
              <h3 id="card-notes" className="text-sm font-semibold">
                {t('guests.info.notes')}
              </h3>
              <NotesEditor key={`${guest.id}-${guest.updatedAt}`} guest={guest} canEdit={canEdit} />
            </section>
          </TabsContent>

          {can('companies') ? (
            <TabsContent value="company">
              <CompanyTab key={guest.id} card={card} />
            </TabsContent>
          ) : null}
        </Tabs>
      </div>
    </>
  )
}

export function GuestSheet({
  guestId,
  onOpenChange,
  onEdit,
  onMerge,
  onOpenGuest,
  onBlacklist,
  onNewReservation
}: {
  guestId: string | null
  onOpenChange: (open: boolean) => void
  onEdit: (guest: GuestViewDto) => void
  onMerge: (pair: readonly [GuestViewDto, GuestViewDto]) => void
  onOpenGuest: (guestId: string) => void
  onBlacklist: (guest: GuestViewDto) => void
  onNewReservation?: (guest: GuestViewDto, price: { amountMinor: number; currency: string } | null) => void
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const card = useApiQuery('guests.card', { id: guestId ?? '' }, { enabled: !!guestId })
  return (
    <Sheet open={!!guestId} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'gap-0 overflow-y-auto',
          isMobile ? 'max-h-[92dvh] rounded-t-xl' : 'w-full sm:max-w-xl'
        )}
        data-testid="guest-sheet"
      >
        {!guestId ? null : card.isPending ? (
          <div role="status" aria-busy className="grid gap-3 p-4">
            <SheetTitle className="sr-only">{t('common.loading')}</SheetTitle>
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : card.isError ? (
          <div className="p-4">
            <SheetTitle className="sr-only">{t('nav.guests')}</SheetTitle>
            <ErrorState error={card.error} onRetry={() => void card.refetch()} />
          </div>
        ) : (
          <GuestCardView
            key={card.data.guest.id}
            card={card.data}
            onEdit={() => onEdit(card.data.guest)}
            onMerge={(other) => onMerge([card.data.guest, other])}
            onOpenGuest={onOpenGuest}
            onBlacklist={() => onBlacklist(card.data.guest)}
            onNewReservation={
              onNewReservation ? (price) => onNewReservation(card.data.guest, price) : undefined
            }
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
