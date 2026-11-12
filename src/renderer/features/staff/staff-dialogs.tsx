// Money and month forms of the Personel screen (G-69, G-81, G-87, G-88): give an advance (from the drawer only when
// the setting `staff.advanceFromDrawer` is on), pay part of a salary (also out of the drawer, B9), add a bonus or a
// deduction, cancel a record with a reason, lock or open a month. A closed business day asks for a reason from those
// who may write into it (G-72, B8). Each write goes to the staff service, which also writes the locked ledger
// expense of money paid out (G-69) in the same transaction.
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { LocalDate } from '@shared/date'
import type { SalaryPeriodDto } from '@shared/contract/procedures/staff'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DateInput } from '@/components/date-input'
import { isAmount, MoneyInput, type MoneyValue } from '@/components/money-input'
import { useOverAmountConfirm } from '@/components/money-input-confirm'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { ClosedDayReason, useMayWriteClosedDay } from '@/components/closed-day-reason'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery, useSettings } from '@/lib/api/hooks'
import { deferForPendingAmount, useLocalName } from '@/features/settings/use-admin'
import { useStaffMutation, type YearMonth } from './use-staff'
import { useMonthLabel } from './use-staff-format'

const PAY_SUMMARY = ['net', 'paid', 'remaining'] as const

/** The method choice "out of the drawer" (no payment method: the cash the reception holds). */
const FROM_DRAWER = '__drawer'

/**
 * A money form on a closed business day (G-72, B8): after the service refuses the day, those with `ledger.locked`
 * give a reason and save again; the others see that the day is locked.
 */
function useClosedDay() {
  const { t } = useTranslation()
  const mayWrite = useMayWriteClosedDay()
  const [closed, setClosed] = useState(false)
  const [reason, setReason] = useState('')
  return {
    closed,
    reset: () => setClosed(false),
    handled: (e: { messageKey: string }): boolean => {
      if (e.messageKey !== 'errors.dayClosed') return false
      setClosed(true)
      return true
    },
    /** Null = the form may not be sent yet (a reason is missing or the day is locked for this person). */
    extra: (): { reason?: string } | null => {
      if (!closed) return {}
      if (!mayWrite || reason.trim().length < 3) return null
      return { reason: reason.trim() }
    },
    field: closed ? (
      <>
        <ClosedDayReason value={reason} onChange={setReason} />
        {mayWrite && reason.trim().length < 3 ? (
          <FieldError>{t('ledger.closed.reasonNeeded')}</FieldError>
        ) : null}
      </>
    ) : null
  }
}

export function DialogFooter({
  formId,
  onCancel,
  saveLabel,
  pending,
  destructive
}: {
  formId: string
  onCancel: () => void
  saveLabel?: string
  pending?: boolean
  destructive?: boolean
}) {
  const { t } = useTranslation()
  return (
    <>
      <Button variant="outline" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
      <Button
        type="submit"
        form={formId}
        disabled={pending}
        variant={destructive ? 'destructive' : 'default'}
        data-testid="dialog-save"
      >
        {saveLabel ?? t('common.save')}
      </Button>
    </>
  )
}

export function EmployeeSelect({
  employees,
  value,
  onChange,
  id
}: {
  employees: readonly { id: string; fullName: string }[]
  value: string
  onChange: (id: string) => void
  id: string
}) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{t('staff.form.employee')}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={t('staff.form.pickEmployee')} />
        </SelectTrigger>
        <SelectContent>
          {employees.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              {e.fullName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** A form whose Enter saves; an amount still being typed is turned into minor units first. */
export function FormBody({
  id,
  onSubmit,
  children,
  testId
}: {
  id: string
  onSubmit: () => void
  children: ReactNode
  testId: string
}) {
  return (
    <form
      id={id}
      className="grid gap-4"
      noValidate
      data-testid={testId}
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (deferForPendingAmount(e.currentTarget)) return
        onSubmit()
      }}
    >
      {children}
    </form>
  )
}

export function FieldError({ children }: { children: ReactNode }) {
  return (
    <p className="text-destructive -mt-2 text-xs" role="alert">
      {children}
    </p>
  )
}

export function NoteField({
  id,
  value,
  onChange
}: {
  id: string
  value: string
  onChange: (v: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{t('staff.form.note')}</Label>
      <Input
        id={id}
        value={value}
        maxLength={300}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
    </div>
  )
}

export function AdvanceDialog({
  open,
  onOpenChange,
  rows,
  employeeId,
  month,
  today
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The month's open salary rows: who can get an advance, and how much salary is left. */
  rows: readonly SalaryPeriodDto[]
  employeeId: string | null
  month: YearMonth
  today: LocalDate
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const monthLabel = useMonthLabel()
  const formId = useId()
  const settings = useSettings()
  const fromDrawerAllowed = settings.data?.['staff.advanceFromDrawer'] ?? false
  const [who, setWho] = useState(employeeId ?? '')
  const row = rows.find((r) => r.employeeId === who)
  const currency = row?.currency ?? settings.data?.['hotel.baseCurrency'] ?? 'TRY'
  const [day, setDay] = useState<LocalDate>(today)
  const [amount, setAmount] = useState<MoneyValue>({ amountMinor: null, currency })
  const [fromDrawer, setFromDrawer] = useState(true)
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const closedDay = useClosedDay()
  const save = useStaffMutation('staff.addTransaction', {
    success: t('staff.advance.saved'),
    handled: closedDay.handled
  })
  const remaining = row?.remaining
  const over = remaining !== undefined && amount.amountMinor !== null && amount.amountMinor > remaining
  // QA2a: written, a number, above zero (the message sits under the field); more than is left is asked once.
  const amountOk = isAmount(amount) && amount.amountMinor > 0
  const overAmount = useOverAmountConfirm()
  const submit = (): void => {
    setTried(true)
    if (!who || !amountOk || amount.amountMinor === null) return
    const extra = closedDay.extra()
    if (!extra) return
    const amountMinor = amount.amountMinor
    const send = (): void =>
      save.mutate(
        {
          employeeId: who,
          date: day,
          kind: 'advance',
          amountMinor,
          currency,
          periodYear: month.year,
          periodMonth: month.month,
          paidFromDrawer: fromDrawerAllowed && fromDrawer,
          note: note.trim() || null,
          ...extra
        },
        { onSuccess: () => onOpenChange(false) }
      )
    if (remaining === undefined || amountMinor <= remaining) return send()
    overAmount.ask({
      title: t('staff.advance.overTitle'),
      body: t('staff.overBody', {
        month: monthLabel(month),
        remaining: f.money(Math.max(0, remaining), currency),
        amount: f.money(amountMinor, currency)
      }),
      action: t('ledger.pay.overConfirm'),
      go: send
    })
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('staff.advance.title')}
      description={t('staff.advance.descriptionMonth', { month: monthLabel(month) })}
      footer={<DialogFooter formId={formId} onCancel={() => onOpenChange(false)} pending={save.isPending} />}
    >
      <FormBody id={formId} onSubmit={submit} testId="advance-form">
        <EmployeeSelect
          id={`${formId}-employee`}
          employees={rows.map((r) => ({ id: r.employeeId, fullName: r.fullName }))}
          value={who}
          onChange={setWho}
        />
        {tried && !who ? <FieldError>{t('staff.form.required')}</FieldError> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyInput
            label={t('staff.advance.amount')}
            value={{ ...amount, currency }}
            onChange={setAmount}
            currencies={[currency]}
            error={tried && !amountOk ? t('staff.form.amountRequired') : null}
          />
          <DateInput
            label={t('staff.form.date')}
            value={day}
            onChange={(d) => {
              setDay(d)
              closedDay.reset()
            }}
            max={today}
          />
        </div>
        {closedDay.field}
        {remaining !== undefined ? (
          <p className={over ? 'text-destructive -mt-2 text-xs' : 'text-muted-foreground -mt-2 text-xs'}>
            <Trans
              i18nKey={over ? 'staff.advance.overRemaining' : 'staff.advance.remaining'}
              values={{ amount: f.money(remaining, currency), month: monthLabel(month) }}
              components={{ m: <bdi className="tabular-nums" /> }}
            />
          </p>
        ) : null}
        {fromDrawerAllowed ? (
          <Label
            htmlFor={`${formId}-drawer`}
            className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 font-normal"
          >
            <span className="grid flex-1 gap-0.5">
              <span className="text-sm font-medium">{t('staff.advance.fromDrawer')}</span>
              <span className="text-muted-foreground text-xs">{t('staff.advance.fromDrawerHint')}</span>
            </span>
            <Switch
              id={`${formId}-drawer`}
              checked={fromDrawer}
              onCheckedChange={setFromDrawer}
              className="relative max-md:after:absolute max-md:after:-inset-x-2 max-md:after:-inset-y-[14px]"
            />
          </Label>
        ) : null}
        <NoteField id={`${formId}-note`} value={note} onChange={setNote} />
        <p className="text-muted-foreground text-xs">
          {t('staff.advance.description', { month: monthLabel(month) })}
        </p>
        {overAmount.dialog}
      </FormBody>
    </ResponsiveDialog>
  )
}

export function PayDialog({
  open,
  onOpenChange,
  rows,
  employeeId,
  month,
  today
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: readonly SalaryPeriodDto[]
  employeeId: string | null
  month: YearMonth
  today: LocalDate
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const formId = useId()
  const monthLabel = useMonthLabel()
  const nameOf = useLocalName()
  const methods = useApiQuery('lists.list', { kind: 'paymentMethods' })
  const owed = rows.filter((r) => r.remaining > 0)
  const [who, setWho] = useState(employeeId ?? owed[0]?.employeeId ?? '')
  const row = rows.find((r) => r.employeeId === who)
  const currency = row?.currency ?? 'TRY'
  const [amount, setAmount] = useState<MoneyValue>({
    amountMinor: row && row.remaining > 0 ? row.remaining : null,
    currency
  })
  const [method, setMethod] = useState<string>('')
  const methodId = method || methods.data?.find((m) => m.isCash)?.id || methods.data?.[0]?.id || ''
  const [day, setDay] = useState<LocalDate>(today)
  const [tried, setTried] = useState(false)
  const closedDay = useClosedDay()
  const save = useStaffMutation('staff.addTransaction', {
    success: t('staff.pay.saved'),
    handled: closedDay.handled
  })
  const after = row && amount.amountMinor ? row.remaining - amount.amountMinor : null
  // QA2a: written, a number, above zero (the message sits under the field); more than is left is asked once.
  const amountOk = isAmount(amount) && amount.amountMinor > 0
  const overAmount = useOverAmountConfirm()
  const submit = (): void => {
    setTried(true)
    if (!who || !amountOk || amount.amountMinor === null) return
    const extra = closedDay.extra()
    if (!extra) return
    const drawer = methodId === FROM_DRAWER
    const amountMinor = amount.amountMinor
    const send = (): void =>
      save.mutate(
        {
          employeeId: who,
          date: day,
          kind: 'salary_payment',
          amountMinor,
          currency,
          periodYear: month.year,
          periodMonth: month.month,
          paidFromDrawer: drawer,
          methodId: drawer ? null : methodId || null,
          ...extra
        },
        { onSuccess: () => onOpenChange(false) }
      )
    if (!row || amountMinor <= row.remaining) return send()
    overAmount.ask({
      title: t('staff.pay.overTitle'),
      body: t('staff.overBody', {
        month: monthLabel(month),
        remaining: f.money(Math.max(0, row.remaining), currency),
        amount: f.money(amountMinor, currency)
      }),
      action: t('ledger.pay.overConfirm'),
      go: send
    })
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('staff.pay.title')}
      description={t('staff.pay.description', { month: monthLabel(month) })}
      footer={
        <DialogFooter
          formId={formId}
          onCancel={() => onOpenChange(false)}
          saveLabel={t('staff.pay.confirm')}
          pending={save.isPending}
        />
      }
    >
      <FormBody id={formId} onSubmit={submit} testId="pay-form">
        <EmployeeSelect
          id={`${formId}-employee`}
          employees={rows.map((r) => ({ id: r.employeeId, fullName: r.fullName }))}
          value={who}
          onChange={(id) => {
            setWho(id)
            const next = rows.find((r) => r.employeeId === id)
            setAmount({ amountMinor: next && next.remaining > 0 ? next.remaining : null, currency })
          }}
        />
        {row ? (
          <dl className="grid grid-cols-3 gap-2 text-sm" data-testid="pay-summary">
            {PAY_SUMMARY.map((key) => (
              <div key={key} className="rounded-lg border p-2.5">
                <dt className="text-muted-foreground text-xs">{t(`staff.col.${key}`)}</dt>
                <dd className="font-semibold tabular-nums">
                  <bdi>{f.money(row[key], currency)}</bdi>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyInput
            label={t('staff.pay.amount')}
            value={{ ...amount, currency }}
            onChange={setAmount}
            currencies={[currency]}
            error={tried && !amountOk ? t('staff.form.amountRequired') : null}
          />
          <DateInput
            label={t('staff.form.date')}
            value={day}
            onChange={(d) => {
              setDay(d)
              closedDay.reset()
            }}
            max={today}
          />
        </div>
        {closedDay.field}
        {after !== null && amountOk ? (
          <p
            className={after < 0 ? 'text-destructive -mt-2 text-xs' : 'text-muted-foreground -mt-2 text-xs'}
            data-testid="pay-after"
          >
            <Trans
              i18nKey={after < 0 ? 'staff.pay.over' : 'staff.pay.after'}
              values={{ amount: f.money(Math.abs(after), currency) }}
              components={{ m: <bdi className="tabular-nums" /> }}
            />
          </p>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-method`}>{t('staff.pay.method')}</Label>
          <Select value={methodId} onValueChange={setMethod}>
            <SelectTrigger id={`${formId}-method`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FROM_DRAWER} data-testid="pay-from-drawer">
                {t('staff.pay.fromDrawer')}
              </SelectItem>
              {(methods.data ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {nameOf(m.nameI18n, m.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {methodId === FROM_DRAWER ? (
            <p className="text-muted-foreground text-xs">{t('staff.pay.fromDrawerHint')}</p>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">{t('staff.pay.hint')}</p>
        {overAmount.dialog}
      </FormBody>
    </ResponsiveDialog>
  )
}

const ADJUST_KINDS = ['bonus', 'deduction'] as const

/** A bonus (adds to the net) or a deduction (takes from it); neither is money paid out, so no ledger row. */
export function AdjustDialog({
  open,
  onOpenChange,
  row,
  month,
  today
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: SalaryPeriodDto
  month: YearMonth
  today: LocalDate
}) {
  const { t } = useTranslation()
  const formId = useId()
  const [kind, setKind] = useState<(typeof ADJUST_KINDS)[number]>('bonus')
  const [amount, setAmount] = useState<MoneyValue>({ amountMinor: null, currency: row.currency })
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const save = useStaffMutation('staff.addTransaction', { success: t('staff.adjust.saved') })
  const amountOk = isAmount(amount) && amount.amountMinor > 0
  const submit = (): void => {
    setTried(true)
    if (!amountOk || amount.amountMinor === null || !note.trim()) return
    save.mutate(
      {
        employeeId: row.employeeId,
        date: today,
        kind,
        amountMinor: amount.amountMinor,
        currency: row.currency,
        periodYear: month.year,
        periodMonth: month.month,
        note: note.trim()
      },
      { onSuccess: () => onOpenChange(false) }
    )
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('staff.adjust.title', { name: row.fullName })}
      description={t('staff.adjust.description')}
      footer={<DialogFooter formId={formId} onCancel={() => onOpenChange(false)} pending={save.isPending} />}
    >
      <FormBody id={formId} onSubmit={submit} testId="adjust-form">
        <div className="grid gap-1.5">
          <span id={`${formId}-kind`} className="text-sm font-medium">
            {t('staff.leave.kindLabel')}
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={1}
            value={kind}
            onValueChange={(v) => v && setKind(v as (typeof ADJUST_KINDS)[number])}
            aria-labelledby={`${formId}-kind`}
            className="grid w-full grid-cols-2"
          >
            {ADJUST_KINDS.map((k) => (
              <ToggleGroupItem key={k} value={k} className="w-full">
                {t(`staff.txn.${k}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <MoneyInput
          label={t('staff.adjust.amount')}
          value={amount}
          onChange={setAmount}
          currencies={[row.currency]}
          error={tried && !amountOk ? t('staff.form.amountRequired') : null}
        />
        <NoteField id={`${formId}-note`} value={note} onChange={setNote} />
        {tried && !note.trim() ? <FieldError>{t('staff.adjust.noteRequired')}</FieldError> : null}
      </FormBody>
    </ResponsiveDialog>
  )
}

/** "… iptal edilsin mi?" with a reason (records are never deleted, G-24). */
export function VoidDialog({
  open,
  onOpenChange,
  title,
  body,
  confirm,
  pending,
  onConfirm
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  body: string
  confirm: string
  pending?: boolean
  onConfirm: (reason: string) => void
}) {
  const { t } = useTranslation()
  const formId = useId()
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={body}
      footer={
        <DialogFooter
          formId={formId}
          onCancel={() => onOpenChange(false)}
          saveLabel={confirm}
          pending={pending}
          destructive
        />
      }
    >
      <FormBody
        id={formId}
        testId="void-form"
        onSubmit={() => {
          setTried(true)
          if (reason.trim()) onConfirm(reason.trim())
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-reason`}>{t('staff.void.reason')}</Label>
          <Input
            id={`${formId}-reason`}
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={(tried && !reason.trim()) || undefined}
            autoComplete="off"
          />
        </div>
        {tried && !reason.trim() ? <FieldError>{t('staff.void.reasonRequired')}</FieldError> : null}
      </FormBody>
    </ResponsiveDialog>
  )
}

export function LockMonthDialog({
  month,
  label,
  onOpenChange
}: {
  month: YearMonth | null
  label: string
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const lock = useStaffMutation('staff.lockMonth', { success: t('staff.lock.saved') })
  return (
    <AlertDialog open={!!month} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('staff.lock.title', { month: label })}</AlertDialogTitle>
          <AlertDialogDescription>{t('staff.lock.description')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={lock.isPending}
            onClick={() => month && lock.mutate({ year: month.year, month: month.month })}
          >
            {t('staff.lock.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function UnlockMonthDialog({
  month,
  label,
  onOpenChange
}: {
  month: YearMonth | null
  label: string
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const unlock = useStaffMutation('staff.unlockMonth', { success: t('staff.unlock.saved') })
  return month ? (
    <VoidDialog
      open
      onOpenChange={onOpenChange}
      title={t('staff.unlock.title', { month: label })}
      body={t('staff.unlock.description')}
      confirm={t('staff.unlock.confirm')}
      pending={unlock.isPending}
      onConfirm={(reason) =>
        unlock.mutate(
          { year: month.year, month: month.month, reason },
          { onSuccess: () => onOpenChange(false) }
        )
      }
    />
  ) : null
}
