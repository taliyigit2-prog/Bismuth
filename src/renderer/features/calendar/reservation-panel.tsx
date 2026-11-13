// Reservation panel (faz-05 madde 2, 3, 4, 7b): opens from a tape chart bar, after "Kaydet" in the new reservation
// form, or from the park area. Header: guest, status, warnings (standing request, KBS gaps, open issues in the
// room); actions: check in, check out (with KBS check-out marks), take a payment, park, cancel the reservation or
// one room still to come, no-show (also for a parked reservation, G-39, G-42). Tabs: summary
// (fields, tags, notes, guest history), nights (dates, rooms, night-by-night prices with their colours), money
// (folio and payments), people (occupants and KBS). Desktop: right-hand sheet; phone: bottom sheet.
import { useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangleIcon,
  BanknoteIcon,
  CrownIcon,
  LogInIcon,
  LogOutIcon,
  MoreHorizontalIcon,
  ShieldAlertIcon
} from 'lucide-react'
import { localDateOf } from '@shared/date'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ErrorState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useCan } from '@/lib/view-as'
import { useShortcutAction } from '@/lib/shortcuts/actions'
import { cn } from '@/lib/utils'
import {
  localName,
  requestPanel,
  useBooking,
  useBookingMutation,
  useBookingOptions,
  usePanelRequest,
  type BookingView
} from './booking-api'
import { StandingNoteAlert } from './guest-summary-card'
import { GiveUpDialog } from './giveup-dialog'
import { MoneyTab, StaysTab, SummaryTab } from './panel-tabs'
import { OccupantsEditor } from './occupants-editor'
import { PaymentDialog } from './payment-dialog'
import { CancelDialog, CancelStayDialog, CheckoutDialog, NoShowDialog, ParkDialog } from './stay-dialogs'

const OPEN_STATUSES = new Set(['tentative', 'confirmed', 'checked_in'])

export function ReservationPanel({
  reservation,
  onOpenChange
}: {
  /** The reservation to show (a tape chart bar, a day-list row: anything with its id). */
  reservation: { id: string } | null
  onOpenChange: (open: boolean) => void
  /** Earlier connection point of the calendar screen (Faz 3 mock-up); the panel reads the reservation itself. */
  hotel?: unknown
}) {
  const isMobile = useIsMobile()
  const requested = usePanelRequest()
  const id = reservation?.id ?? requested
  const close = (open: boolean): void => {
    if (open) return
    if (requested) requestPanel(null)
    onOpenChange(false)
  }
  const sheet = useRef<HTMLDivElement>(null)
  return (
    <Sheet open={!!id} onOpenChange={close}>
      <SheetContent
        ref={sheet}
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'gap-0 overflow-y-auto',
          isMobile ? 'max-h-[92dvh] rounded-t-xl' : 'w-full sm:max-w-2xl'
        )}
        data-testid="reservation-panel"
      >
        {id ? <PanelBody id={id} scope={sheet} /> : null}
      </SheetContent>
    </Sheet>
  )
}

/** `scope`: the open sheet; P (lib/shortcuts) pressed inside it adds a payment to this reservation. */
function PanelBody({ id, scope }: { id: string; scope: RefObject<HTMLDivElement | null> }) {
  const { t } = useTranslation()
  const query = useBooking(id)
  if (query.isPending)
    return (
      <>
        <SheetHeader className="border-b">
          <SheetTitle>{t('common.loading')}</SheetTitle>
          <SheetDescription className="sr-only">{t('booking.panel.loading')}</SheetDescription>
        </SheetHeader>
        <div role="status" aria-busy className="grid gap-3 p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </>
    )
  if (query.isError)
    return (
      <>
        <SheetHeader className="border-b">
          <SheetTitle>{t('booking.panel.title')}</SheetTitle>
          <SheetDescription className="sr-only">{t('errors.loadFailed')}</SheetDescription>
        </SheetHeader>
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </>
    )
  return <Panel view={query.data} scope={scope} />
}

function Panel({ view, scope }: { view: BookingView; scope: RefObject<HTMLDivElement | null> }) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const options = useBookingOptions()
  const [payOpen, setPayOpen] = useState(false)
  const [parkOpen, setParkOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [noShowOpen, setNoShowOpen] = useState(false)
  const [cancelStayId, setCancelStayId] = useState<string | null>(null)
  const [checkoutStay, setCheckoutStay] = useState<string | null>(null)
  const [giveUpStay, setGiveUpStay] = useState<string | null>(null)
  const [refundOpen, setRefundOpen] = useState(false)
  // Check-out chosen from "Vazgeçme ve iade": the refund window opens after it is saved (K-55).
  const [refundAfter, setRefundAfter] = useState(false)
  const [tab, setTab] = useState('summary')
  const r = view.reservation
  const today = localDateOf(new Date())
  const editable = can('calendar', 'edit') && OPEN_STATUSES.has(r.status)
  const live = view.stays.filter((s) => s.status !== 'cancelled')
  const arriving = live.filter((s) => s.status === 'planned' && s.checkIn <= today)
  const inHouse = live.filter((s) => s.status === 'in_house')
  const kbs = view.stays.flatMap((s) => s.kbsIssues.map((k) => ({ ...k, room: s.roomNumber })))
  const issues = live.flatMap((s) => s.openIssues.map((i) => ({ ...i, room: s.roomNumber })))
  const channel = options.data?.channels.find((c) => c.id === r.channelId)
  const checkIn = useBookingMutation('booking.checkIn', { success: t('booking.toast.checkedIn') })
  const stayToCheckOut = view.stays.find((s) => s.id === checkoutStay)
  const stayToCancel = view.stays.find((s) => s.id === cancelStayId)
  const stayToGiveUp = view.stays.find((s) => s.id === giveUpStay)
  const stayed = live.some((s) => s.status === 'done')
  const planned = live.filter((s) => s.status === 'planned')
  // Nobody in the house: the whole reservation can be cancelled (rooms stayed in keep their nights); park and
  // no-show only before anyone stayed. A parked reservation is closed from the park area's menu or here.
  const canCancel = editable && !inHouse.length
  const canPark = canCancel && !stayed
  const parked = r.status === 'parked' && can('calendar', 'edit')
  // QA3c1 #3: "Gelmedi" is not offered while every planned room still has its arrival day ahead.
  const arrivalAhead = planned.length > 0 && planned.every((s) => s.checkIn > today)
  const roomCancels = editable && live.length > 1 ? planned : []
  const mayPay = can('payments', 'edit') && !!view.payments
  // What the folio holds after the refunds (null: the user may not see payments).
  const collected = view.folio.creditedMinor
  // A closed reservation (stayed out, cancelled, no-show) keeps its menu: refund, history, note (K-55).
  const closed = r.status === 'checked_out' || r.status === 'cancelled' || r.status === 'no_show'
  const mayRefund = can('payments.refund', 'edit') && !!view.payments && (collected ?? 0) > 0
  const giveUps = editable ? inHouse : []
  useShortcutAction('addPayment', () => setPayOpen(true), { scope, enabled: mayPay })

  return (
    <>
      <SheetHeader className="gap-2 border-b text-start">
        <div className="flex flex-wrap items-center gap-2 pe-8">
          <SheetTitle className="text-lg" data-testid="panel-guest">
            {view.guest.firstName} {view.guest.lastName}
          </SheetTitle>
          {view.guest.vip ? (
            <Badge variant="secondary" className="gap-1">
              <CrownIcon className="text-warning" aria-hidden />
              {t('guestCombo.vip')}
            </Badge>
          ) : null}
          {kbs.length ? (
            <Badge variant="destructive" className="gap-1" data-testid="panel-kbs-warning">
              <ShieldAlertIcon aria-hidden />
              {t('booking.kbs.badge', { count: kbs.length })}
            </Badge>
          ) : null}
        </div>
        <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-mono text-xs">{r.code}</span>
          <span data-testid="panel-status">{t(`calendar.resStatus.${r.status}`)}</span>
          {channel ? <span>{localName(f, channel)}</span> : null}
          {r.channelRef ? <span className="font-mono text-xs">#{r.channelRef}</span> : null}
        </SheetDescription>
        <div className="flex flex-wrap gap-2">
          {editable
            ? arriving.map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  onClick={() => checkIn.mutate({ stayId: s.id })}
                  disabled={checkIn.isPending}
                  data-testid="panel-check-in"
                >
                  <LogInIcon aria-hidden />
                  {live.length > 1
                    ? t('booking.panel.checkInRoom', { room: s.roomNumber })
                    : t('calendar.panel.checkIn')}
                </Button>
              ))
            : null}
          {editable
            ? inHouse.map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant="secondary"
                  onClick={() => setCheckoutStay(s.id)}
                  data-testid="panel-check-out"
                >
                  <LogOutIcon aria-hidden />
                  {live.length > 1
                    ? t('booking.panel.checkOutRoom', { room: s.roomNumber })
                    : t('calendar.panel.checkOut')}
                </Button>
              ))
            : null}
          {mayPay ? (
            <Button size="sm" variant="outline" onClick={() => setPayOpen(true)} data-testid="panel-pay">
              <BanknoteIcon aria-hidden />
              {t('calendar.panel.takePayment')}
            </Button>
          ) : null}
          {editable || parked || closed ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={t('booking.panel.more')}
                  data-testid="panel-more"
                >
                  <MoreHorizontalIcon aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canPark ? (
                  <DropdownMenuItem onSelect={() => setParkOpen(true)} data-testid="panel-park">
                    {t('booking.park.confirm')}
                  </DropdownMenuItem>
                ) : null}
                {canPark || parked ? (
                  <DropdownMenuItem
                    onSelect={() => setNoShowOpen(true)}
                    disabled={arrivalAhead}
                    data-testid="panel-no-show"
                  >
                    {t('booking.noShow.confirm')}
                  </DropdownMenuItem>
                ) : null}
                {roomCancels.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    variant="destructive"
                    onSelect={() => setCancelStayId(s.id)}
                    data-testid={`panel-cancel-stay-${s.roomNumber}`}
                  >
                    {t('booking.cancelStay.menu', { room: s.roomNumber })}
                  </DropdownMenuItem>
                ))}
                {giveUps.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onSelect={() => setGiveUpStay(s.id)}
                    data-testid={giveUps.length > 1 ? `panel-giveup-${s.roomNumber}` : 'panel-giveup'}
                  >
                    {giveUps.length > 1
                      ? t('booking.giveup.menuRoom', { room: s.roomNumber })
                      : t('booking.giveup.menu')}
                  </DropdownMenuItem>
                ))}
                {canCancel || parked ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => setCancelOpen(true)}
                    data-testid="panel-cancel"
                  >
                    {t('booking.cancel.confirm')}
                  </DropdownMenuItem>
                ) : null}
                {closed ? (
                  <>
                    {mayRefund ? (
                      <DropdownMenuItem onSelect={() => setRefundOpen(true)} data-testid="panel-refund">
                        {t('booking.refund.menu')}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onSelect={() => setTab('summary')} data-testid="panel-history">
                      {t('booking.panel.history')}
                    </DropdownMenuItem>
                    {can('calendar', 'edit') ? (
                      <DropdownMenuItem onSelect={() => setTab('summary')} data-testid="panel-note">
                        {t('booking.notes.add')}
                      </DropdownMenuItem>
                    ) : null}
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </SheetHeader>

      {view.standingNote || kbs.length || issues.length ? (
        <div className="grid gap-2 px-4 pt-4">
          {view.standingNote ? <StandingNoteAlert note={view.standingNote} /> : null}
          {kbs.length ? (
            <Alert variant="destructive" data-testid="panel-kbs-alert">
              <ShieldAlertIcon />
              <AlertTitle>{t('booking.kbs.title')}</AlertTitle>
              <AlertDescription>
                {kbs
                  .map((k) =>
                    k.kind === 'unnamed'
                      ? t('booking.kbs.unnamed', { room: k.room })
                      : t(k.kind === 'checkout' ? 'booking.kbs.checkout' : 'booking.kbs.checkin', {
                          name: k.fullName ?? '',
                          room: k.room
                        })
                  )
                  .join(' ')}
              </AlertDescription>
            </Alert>
          ) : null}
          {issues.length ? (
            <Alert className="border-warning bg-warning/15" data-testid="panel-issue-alert">
              <AlertTriangleIcon />
              <AlertTitle>{t('booking.issues.panelTitle')}</AlertTitle>
              <AlertDescription className="text-foreground">
                {issues.map((i) => `${i.room} · ${i.title}`).join(' · ')}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab} className="gap-4 p-4">
        <TabsList className="w-full">
          <TabsTrigger value="summary">{t('calendar.panel.tabSummary')}</TabsTrigger>
          <TabsTrigger value="stay">{t('calendar.panel.tabStay')}</TabsTrigger>
          <TabsTrigger value="money">{t('calendar.panel.tabMoney')}</TabsTrigger>
          <TabsTrigger value="people">
            {t('calendar.panel.tabPeople')}
            {kbs.length ? (
              <ShieldAlertIcon className="text-destructive" aria-label={t('booking.kbs.title')} />
            ) : null}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="summary">
          <SummaryTab view={view} editable={editable} notesEditable={can('calendar', 'edit')} />
        </TabsContent>
        <TabsContent value="stay">
          <StaysTab view={view} editable={editable} />
        </TabsContent>
        <TabsContent value="money">
          <MoneyTab view={view} onPay={can('payments', 'edit') ? () => setPayOpen(true) : undefined} />
        </TabsContent>
        <TabsContent value="people" className="grid gap-4">
          {!view.occupantsVisible ? (
            <p className="text-muted-foreground text-sm">{t('booking.people.hidden')}</p>
          ) : (
            live.map((s) => (
              <section
                key={s.id}
                className="grid gap-2"
                aria-label={t('booking.price.roomTitle', { room: s.roomNumber })}
              >
                {live.length > 1 ? (
                  <h3 className="text-sm font-semibold">
                    {t('booking.price.roomTitle', { room: s.roomNumber })}
                  </h3>
                ) : null}
                <OccupantsEditor stay={s} editable={can('in_house', 'edit') && OPEN_STATUSES.has(r.status)} />
              </section>
            ))
          )}
        </TabsContent>
      </Tabs>

      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        reservationId={r.id}
        defaultMinor={Math.max(0, view.folio.balanceMinor ?? 0)}
        folioCurrency={view.folio.currency}
        channelId={r.channelId}
        balanceMinor={view.folio.balanceMinor}
      />
      <ParkDialog reservationId={r.id} open={parkOpen} onOpenChange={setParkOpen} />
      {cancelOpen ? (
        <CancelDialog
          reservationId={r.id}
          open
          onOpenChange={setCancelOpen}
          collectedMinor={collected}
          currency={view.folio.currency}
          allowPark={canPark}
        />
      ) : null}
      {refundOpen ? (
        <PaymentDialog
          open
          onOpenChange={setRefundOpen}
          reservationId={r.id}
          defaultMinor={Math.max(0, collected ?? 0)}
          folioCurrency={view.folio.currency}
          channelId={r.channelId}
          defaultKind="refund"
        />
      ) : null}
      {stayToGiveUp ? (
        <GiveUpDialog
          key={stayToGiveUp.id}
          stay={stayToGiveUp}
          rooms={live.length}
          collectedMinor={collected}
          currency={view.folio.currency}
          open
          onOpenChange={(o) => !o && setGiveUpStay(null)}
          onCheckout={(stayId, after) => {
            setGiveUpStay(null)
            setRefundAfter(after)
            setCheckoutStay(stayId)
          }}
        />
      ) : null}
      <NoShowDialog reservationId={r.id} open={noShowOpen} onOpenChange={setNoShowOpen} />
      {stayToCancel ? (
        <CancelStayDialog
          key={stayToCancel.id}
          stay={stayToCancel}
          open
          onOpenChange={(o) => !o && setCancelStayId(null)}
        />
      ) : null}
      {stayToCheckOut ? (
        <CheckoutDialog
          key={stayToCheckOut.id}
          stay={stayToCheckOut}
          currency={view.folio.currency}
          open
          onOpenChange={(o) => !o && setCheckoutStay(null)}
          onCheckedOut={() => {
            if (refundAfter && can('payments.refund', 'edit') && (collected ?? 0) > 0) setRefundOpen(true)
            setRefundAfter(false)
          }}
        />
      ) : null}
    </>
  )
}
