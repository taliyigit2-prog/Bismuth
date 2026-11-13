// The bar above the grid while stays are picked with Ctrl/Shift-click (P17c, G-195): bulk note, check-in, check-out,
// payment, and linking loose reservations to a group. Each bulk action is the existing service call made once per
// stay or reservation; the rooms of one group check in or out through the group's own all-or-nothing call. A call
// that is refused (a room that is not due yet, a guest with a KBS gap) is counted and named in the result, the rest
// still go through — and the bar says so, never silently.
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BanknoteIcon, LinkIcon, LogInIcon, LogOutIcon, MessageSquarePlusIcon, XIcon } from 'lucide-react'
import type { LocalDate } from '@shared/date'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useTransport } from '@/lib/api/api-context'
import { useCan } from '@/lib/view-as'
import {
  bookingErrorText,
  isCalendarQuery,
  localName,
  useBookingMutation,
  useBookingOptions,
  type BookingView
} from './booking-api'
import { NOTE_LOG_MAX } from './booking-limits'
import { stayActions } from './stay-actions'
import type { GridStayView } from './grid-model'
import { uniqueReservations } from './selection'

type Bulk = 'note' | 'pay' | 'attach' | null

/** Runs `job` over `items` one by one; how many went through and how many were refused (the first refusal's text). */
async function eachOf<T>(
  items: readonly T[],
  job: (item: T) => Promise<unknown>
): Promise<{ ok: number; failed: number; firstError: unknown }> {
  let ok = 0
  let failed = 0
  let firstError: unknown = null
  for (const item of items) {
    try {
      await job(item)
      ok += 1
    } catch (error) {
      failed += 1
      firstError ??= error
    }
  }
  return { ok, failed, firstError }
}

export function SelectionBar({
  picked,
  today,
  onClear
}: {
  picked: readonly GridStayView[]
  today: LocalDate
  onClear: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const transport = useTransport()
  const client = useQueryClient()
  const [open, setOpen] = useState<Bulk>(null)
  const [busy, setBusy] = useState(false)
  const rights = { edit: can('calendar', 'edit'), pay: can('payments', 'edit') }
  const state = picked.map((s) => ({ stay: s, can: stayActions(s, today, rights) }))
  const toCheckIn = state.filter((x) => x.can.checkIn).map((x) => x.stay)
  const toCheckOut = state.filter((x) => x.can.checkOut).map((x) => x.stay)
  const reservationIds = uniqueReservations(picked)
  const ungrouped = [...new Set(picked.filter((s) => !s.groupId).map((s) => s.reservationId))]
  const groupIds = [...new Set(picked.flatMap((s) => (s.groupId ? [s.groupId] : [])))]
  const canAttach =
    rights.edit &&
    ungrouped.length > 0 &&
    (groupIds.length === 1 || (groupIds.length === 0 && ungrouped.length > 1))

  const report = (
    key: 'checkIn' | 'checkOut',
    r: { ok: number; failed: number; firstError: unknown }
  ): void => {
    if (r.failed === 0) toast.success(t(`calendar.quick.bulk.${key}Done`, { count: r.ok }))
    else
      toast.error(
        t('calendar.quick.bulk.partial', { ok: r.ok, failed: r.failed }) +
          ' ' +
          bookingErrorText(t, f, r.firstError)
      )
  }
  const run = async (key: 'checkIn' | 'checkOut', stays: readonly GridStayView[]): Promise<void> => {
    setBusy(true)
    try {
      const groups = new Set(stays.map((s) => s.groupId ?? ''))
      let result
      if (stays.length > 1 && groups.size === 1 && !groups.has('')) {
        // One group: its all-or-nothing call.
        const groupId = stays[0]!.groupId!
        const stayIds = stays.map((s) => s.id)
        result = await eachOf([stayIds], (ids) =>
          key === 'checkIn'
            ? transport.call('booking.checkInMany', { groupId, stayIds: ids })
            : transport.call('booking.checkOutMany', { groupId, stayIds: ids })
        )
        if (result.ok) result.ok = stays.length
      } else {
        result = await eachOf(stays, (s) =>
          key === 'checkIn'
            ? transport.call('booking.checkIn', { stayId: s.id })
            : transport.call('booking.checkOut', { stayId: s.id, kbsCheckoutIds: [] })
        )
      }
      report(key, result)
      if (result.failed === 0) onClear()
    } finally {
      await client.invalidateQueries({ predicate: isCalendarQuery })
      setBusy(false)
    }
  }

  return (
    <div
      className="bg-accent flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2"
      role="region"
      aria-label={t('calendar.quick.bulk.label')}
      data-testid="selection-bar"
    >
      <p className="me-auto text-sm font-medium" role="status" data-testid="selection-count">
        {t('calendar.quick.bulk.count', { count: picked.length })}
      </p>
      {rights.edit ? (
        <>
          <Button
            size="sm"
            disabled={!toCheckIn.length || busy}
            onClick={() => void run('checkIn', toCheckIn)}
            data-testid="bulk-check-in"
          >
            <LogInIcon aria-hidden />
            {t('calendar.quick.bulk.checkIn')} ({toCheckIn.length})
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!toCheckOut.length || busy}
            onClick={() => void run('checkOut', toCheckOut)}
            data-testid="bulk-check-out"
          >
            <LogOutIcon aria-hidden />
            {t('calendar.quick.bulk.checkOut')} ({toCheckOut.length})
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOpen('note')} data-testid="bulk-note">
            <MessageSquarePlusIcon aria-hidden />
            {t('calendar.quick.bulk.note')}
          </Button>
        </>
      ) : null}
      {rights.pay ? (
        <Button size="sm" variant="outline" onClick={() => setOpen('pay')} data-testid="bulk-pay">
          <BanknoteIcon aria-hidden />
          {t('calendar.quick.bulk.pay')}
        </Button>
      ) : null}
      {canAttach ? (
        <Button size="sm" variant="outline" onClick={() => setOpen('attach')} data-testid="bulk-attach">
          <LinkIcon aria-hidden />
          {t('calendar.quick.bulk.attach')}
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" onClick={onClear} data-testid="bulk-clear">
        <XIcon aria-hidden />
        {t('calendar.quick.bulk.clear')}
      </Button>
      {open === 'note' ? (
        <BulkReservationNote
          reservationIds={reservationIds}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null)
            onClear()
          }}
        />
      ) : null}
      {open === 'pay' ? (
        <BulkPayDialog
          reservationIds={reservationIds}
          today={today}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null)
            onClear()
          }}
        />
      ) : null}
      {open === 'attach' ? (
        <AttachDialog
          reservationIds={ungrouped}
          groupId={groupIds[0] ?? null}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null)
            onClear()
          }}
        />
      ) : null}
    </div>
  )
}

function BulkReservationNote({
  reservationIds,
  onClose,
  onDone
}: {
  reservationIds: readonly string[]
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const transport = useTransport()
  const client = useQueryClient()
  const id = useId()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (): Promise<void> => {
    if (!text.trim()) return
    setBusy(true)
    const r = await eachOf(reservationIds, (reservationId) =>
      transport.call('booking.addNote', { reservationId, text: text.trim() })
    )
    await client.invalidateQueries({ predicate: isCalendarQuery })
    setBusy(false)
    if (r.failed === 0) {
      toast.success(t('calendar.quick.bulk.noteDone', { count: r.ok }))
      onDone()
    } else
      toast.error(
        t('calendar.quick.bulk.partial', { ok: r.ok, failed: r.failed }) +
          ' ' +
          bookingErrorText(t, f, r.firstError)
      )
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('calendar.quick.bulk.noteTitle')}
      description={t('calendar.quick.bulk.noteBody', { count: reservationIds.length })}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form={`${id}-form`}
            disabled={!text.trim() || busy}
            data-testid="bulk-note-save"
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        className="grid gap-1.5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Label htmlFor={id}>{t('calendar.quick.bulk.noteLabel')}</Label>
        <Textarea
          id={id}
          rows={3}
          autoFocus
          value={text}
          maxLength={NOTE_LOG_MAX}
          onChange={(e) => setText(e.target.value)}
          data-testid="bulk-note-text"
        />
      </form>
    </ResponsiveDialog>
  )
}

function BulkPayDialog({
  reservationIds,
  today,
  onClose,
  onDone
}: {
  reservationIds: readonly string[]
  today: LocalDate
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const transport = useTransport()
  const client = useQueryClient()
  const options = useBookingOptions()
  const id = useId()
  const [methodPick, setMethodPick] = useState('')
  const [busy, setBusy] = useState(false)
  const views = useQueries({
    queries: reservationIds.map((rid) => ({
      queryKey: ['booking.get', { id: rid }],
      queryFn: () => transport.call('booking.get', { id: rid })
    }))
  })
  const loading = views.some((v) => v.isPending)
  const failed = views.some((v) => v.isError)
  const rows = views.flatMap((v) => (v.data ? [v.data as BookingView] : []))
  const due = rows.filter((v) => (v.folio.balanceMinor ?? 0) > 0)
  const methods = options.data?.methods ?? []
  const methodId = methodPick || methods[0]?.id || ''
  const totals = new Map<string, number>()
  for (const v of due)
    totals.set(v.folio.currency, (totals.get(v.folio.currency) ?? 0) + (v.folio.balanceMinor ?? 0))
  const pay = async (): Promise<void> => {
    if (!methodId || !due.length) return
    setBusy(true)
    const r = await eachOf(due, (v) =>
      transport.call('booking.addPayment', {
        reservationId: v.reservation.id,
        date: options.data?.today ?? today,
        kind: 'payment',
        methodId,
        amountMinor: v.folio.balanceMinor ?? 0,
        currency: v.folio.currency
      })
    )
    await client.invalidateQueries({ predicate: isCalendarQuery })
    setBusy(false)
    if (r.failed === 0) {
      toast.success(t('calendar.quick.bulk.payDone', { count: r.ok }))
      onDone()
    } else
      toast.error(
        t('calendar.quick.bulk.partial', { ok: r.ok, failed: r.failed }) +
          ' ' +
          bookingErrorText(t, f, r.firstError)
      )
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('calendar.quick.bulk.payTitle')}
      description={t('calendar.quick.bulk.payBody')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form={`${id}-form`}
            disabled={busy || loading || !due.length || !methodId}
            data-testid="bulk-pay-save"
          >
            {t('calendar.quick.bulk.paySave')}
          </Button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        className="grid gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void pay()
        }}
      >
        {loading ? (
          <div role="status" aria-busy className="grid gap-2">
            <span className="sr-only">{t('common.loading')}</span>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : failed ? (
          <p className="text-destructive text-sm" role="alert">
            {t('errors.loadFailed')}
          </p>
        ) : due.length ? (
          <ul className="grid gap-1 text-sm" data-testid="bulk-pay-list">
            {due.map((v) => (
              <li key={v.reservation.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  {v.guest.firstName} {v.guest.lastName}
                </span>
                <bdi className="tabular-nums">{f.money(v.folio.balanceMinor ?? 0, v.folio.currency)}</bdi>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm" data-testid="bulk-pay-none">
            {t('calendar.quick.bulk.payNone')}
          </p>
        )}
        {due.length ? (
          <p className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">
            <span>{t('calendar.quick.bulk.payTotal')}</span>
            <span className="tabular-nums" data-testid="bulk-pay-total">
              {[...totals].map(([currency, minor], i) => (
                <span key={currency}>
                  {i ? ' + ' : ''}
                  <bdi>{f.money(minor, currency)}</bdi>
                </span>
              ))}
            </span>
          </p>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-method`}>{t('calendar.quick.bulk.method')}</Label>
          <Select value={methodId} onValueChange={setMethodPick}>
            <SelectTrigger id={`${id}-method`} className="w-full" data-testid="bulk-pay-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {methods.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {localName(f, m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </form>
    </ResponsiveDialog>
  )
}

function AttachDialog({
  reservationIds,
  groupId,
  onClose,
  onDone
}: {
  reservationIds: readonly string[]
  /** The group the loose reservations join; null = a new group named here. */
  groupId: string | null
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [name, setName] = useState('')
  const attach = useBookingMutation('booking.attachToGroup', {
    success: t('calendar.quick.bulk.attachDone', { count: reservationIds.length }),
    onSuccess: onDone
  })
  const valid = groupId !== null || name.trim().length > 0
  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('calendar.quick.bulk.attachTitle')}
      description={t(groupId ? 'calendar.quick.bulk.attachBodyJoin' : 'calendar.quick.bulk.attachBodyNew', {
        count: reservationIds.length
      })}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form={`${id}-form`}
            disabled={!valid || attach.isPending}
            data-testid="bulk-attach-save"
          >
            {t('calendar.quick.bulk.attachSave')}
          </Button>
        </>
      }
    >
      <form
        id={`${id}-form`}
        className="grid gap-1.5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          attach.mutate(
            groupId
              ? { groupId, reservationIds: [...reservationIds] }
              : { name: name.trim(), reservationIds: [...reservationIds] }
          )
        }}
      >
        {groupId === null ? (
          <>
            <Label htmlFor={id}>{t('calendar.quick.bulk.groupName')}</Label>
            <Input
              id={id}
              autoFocus
              autoComplete="off"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              data-testid="bulk-attach-name"
            />
          </>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}
