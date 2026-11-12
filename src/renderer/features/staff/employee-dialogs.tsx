// Employee card forms (G-80, G-25, K-38): add or edit a card (name, job, phone, start date, linked account, notes;
// the first salary when adding), a new salary from a day on (the history is never rewritten), leaving the hotel
// (end date + passive; the card and its records stay) and the employee's own pay rules over the hotel's
// (Sahip + Müdür only; a rule left "as the hotel's" follows later changes of the hotel rule).
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, type LocalDate } from '@shared/date'
import { COMMISSION_BASES, type PayPolicyKey, type PayPolicyValues } from '@shared/contract/staff'
import type { EmployeeViewDto } from '@shared/contract/procedures/staff'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { DateInput } from '@/components/date-input'
import { isAmount, MoneyInput, type MoneyValue } from '@/components/money-input'
import { parsePhone, formatPhone, PhoneField, type PhoneValue } from '@/components/phone-field'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery, useSettings } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { useRoleName } from '@/features/settings/use-admin'
import { DialogFooter, FieldError, FormBody } from './staff-dialogs'
import { firstDay, monthOf, shiftMonth, useStaffMutation } from './use-staff'

const NO_USER = '__none'
const NAME_FIELDS = ['firstName', 'lastName'] as const

export function EmployeeDialog({
  open,
  onOpenChange,
  employee,
  today,
  onCreated
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = a new card. */
  employee: EmployeeViewDto | null
  today: LocalDate
  onCreated?: (id: string) => void
}) {
  const { t } = useTranslation()
  const can = useCan()
  const formId = useId()
  const roleName = useRoleName()
  const settings = useSettings()
  const base = settings.data?.['hotel.baseCurrency'] ?? 'TRY'
  const users = useApiQuery('staff.linkableUsers', {})
  const [firstName, setFirstName] = useState(employee?.firstName ?? '')
  const [lastName, setLastName] = useState(employee?.lastName ?? '')
  const names = { firstName, lastName, set: { firstName: setFirstName, lastName: setLastName } }
  const [position, setPosition] = useState(employee?.position ?? '')
  const [phone, setPhone] = useState<PhoneValue>(() => parsePhone(employee?.phone))
  const [start, setStart] = useState<LocalDate>(employee?.startDate ?? today)
  const [salary, setSalary] = useState<MoneyValue>({ amountMinor: null, currency: base })
  const [userId, setUserId] = useState(employee?.userId ?? NO_USER)
  const [notes, setNotes] = useState(employee?.notes ?? '')
  const [tried, setTried] = useState(false)
  const create = useStaffMutation('staff.createEmployee', { success: t('staff.employee.created') })
  const update = useStaffMutation('staff.updateEmployee', { success: t('staff.employee.saved') })
  const choices = [
    ...(employee?.account
      ? [
          {
            id: employee.account.id,
            displayName: employee.account.displayName,
            roleCode: employee.account.roleCode,
            roleName: employee.account.roleName,
            roleNameI18n: employee.account.roleNameI18n
          }
        ]
      : []),
    ...(users.data ?? [])
  ]
  const salaryAllowed = !employee && can('staff.salary', 'edit')
  const submit = (): void => {
    setTried(true)
    if (!firstName.trim() || !lastName.trim()) return
    const phoneText = phone.number ? formatPhone(phone) : null
    const fields = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      position: position.trim() || null,
      phone: phoneText,
      startDate: start,
      notes: notes.trim() || null,
      userId: userId === NO_USER ? null : userId
    }
    if (employee) {
      update.mutate({ id: employee.id, patch: fields }, { onSuccess: () => onOpenChange(false) })
      return
    }
    create.mutate(
      {
        ...fields,
        ...(salaryAllowed && salary.amountMinor
          ? { salary: { monthlyMinor: salary.amountMinor, currency: salary.currency } }
          : {})
      },
      {
        onSuccess: (created) => {
          onOpenChange(false)
          onCreated?.(created.id)
        }
      }
    )
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={employee ? t('staff.employee.editTitle') : t('staff.employee.newTitle')}
      description={employee ? undefined : t('staff.employee.newDescription')}
      footer={
        <DialogFooter
          formId={formId}
          onCancel={() => onOpenChange(false)}
          pending={create.isPending || update.isPending}
        />
      }
    >
      <FormBody id={formId} onSubmit={submit} testId="employee-form">
        <div className="grid gap-4 sm:grid-cols-2">
          {NAME_FIELDS.map((key) => [key, names[key], names.set[key]] as const).map(([key, value, set]) => (
            <div key={key} className="grid gap-1.5">
              <Label htmlFor={`${formId}-${key}`}>{t(`staff.employee.${key}`)}</Label>
              <Input
                id={`${formId}-${key}`}
                value={value}
                maxLength={60}
                onChange={(e) => set(e.target.value)}
                aria-invalid={(tried && !value.trim()) || undefined}
                autoComplete="off"
                data-testid={`employee-${key}`}
              />
              {tried && !value.trim() ? (
                <p className="text-destructive text-xs" role="alert">
                  {t('staff.form.required')}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-position`}>{t('staff.employee.position')}</Label>
          <Input
            id={`${formId}-position`}
            value={position}
            maxLength={60}
            onChange={(e) => setPosition(e.target.value)}
            placeholder={t('staff.employee.positionPlaceholder')}
            autoComplete="off"
          />
        </div>
        <PhoneField label={t('staff.employee.phone')} value={phone} onChange={setPhone} />
        <div className="grid gap-4 sm:grid-cols-2">
          <DateInput label={t('staff.employee.start')} value={start} onChange={setStart} />
          {salaryAllowed ? (
            <div className="grid min-w-0 gap-1.5">
              <MoneyInput
                label={t('staff.employee.monthly')}
                value={salary}
                onChange={setSalary}
                currencies={[base]}
              />
              {/* QA2a: no salary (or 0) does not stop the card, but it is said before saving. */}
              {salary.amountMinor === 0 || salary.amountMinor === null ? (
                <p
                  className={
                    salary.amountMinor === 0
                      ? 'border-warning bg-warning/15 rounded-md border px-2 py-1 text-xs'
                      : 'text-muted-foreground text-xs'
                  }
                  data-testid="employee-no-salary"
                >
                  {t('staff.employee.noSalaryHint')}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        {can('staff', 'edit') ? (
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-user`}>{t('staff.employee.user')}</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger id={`${formId}-user`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_USER}>{t('staff.employee.noUser')}</SelectItem>
                {choices.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.displayName} ·{' '}
                    {roleName({ displayName: u.roleNameI18n, name: u.roleName }, u.roleCode)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">{t('staff.employee.userHint')}</p>
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-notes`}>{t('staff.form.note')}</Label>
          <Input
            id={`${formId}-notes`}
            value={notes}
            maxLength={1000}
            onChange={(e) => setNotes(e.target.value)}
            autoComplete="off"
          />
        </div>
      </FormBody>
    </ResponsiveDialog>
  )
}

/** A new salary from a day on ("Kenan 30.000 → 40.000"); earlier months keep the old one. */
export function SalaryDialog({
  open,
  onOpenChange,
  employee,
  today
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: EmployeeViewDto
  today: LocalDate
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const formId = useId()
  const settings = useSettings()
  const currency = employee.currentSalary?.currency ?? settings.data?.['hotel.baseCurrency'] ?? 'TRY'
  // QA2a (K-46): a first salary counts from this month's 1st (this month is not left without one); a raise
  // from next month's 1st.
  const [from, setFrom] = useState<LocalDate>(() =>
    firstDay(employee.currentSalary ? shiftMonth(monthOf(today), 1) : monthOf(today))
  )
  const [amount, setAmount] = useState<MoneyValue>({ amountMinor: null, currency })
  const [tried, setTried] = useState(false)
  const save = useStaffMutation('staff.addSalary', { success: t('staff.salaryHistory.saved') })
  const amountOk = isAmount(amount) && amount.amountMinor > 0
  const submit = (): void => {
    setTried(true)
    if (!amountOk || amount.amountMinor === null) return
    save.mutate(
      { employeeId: employee.id, validFrom: from, monthlyMinor: amount.amountMinor, currency },
      { onSuccess: () => onOpenChange(false) }
    )
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('staff.salaryHistory.newTitle', { name: employee.fullName })}
      description={t('staff.salaryHistory.newDescription')}
      footer={<DialogFooter formId={formId} onCancel={() => onOpenChange(false)} pending={save.isPending} />}
    >
      <FormBody id={formId} onSubmit={submit} testId="salary-form">
        {employee.currentSalary ? (
          <p className="text-muted-foreground text-sm">
            {t('staff.salaryHistory.current')}{' '}
            <bdi className="text-foreground font-medium tabular-nums">
              {f.money(employee.currentSalary.monthlyMinor, employee.currentSalary.currency)}
            </bdi>
          </p>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyInput
            label={t('staff.employee.monthly')}
            value={{ ...amount, currency }}
            onChange={setAmount}
            currencies={[currency]}
            error={tried && !amountOk ? t('staff.form.amountRequired') : null}
          />
          <DateInput label={t('staff.salaryHistory.validFrom')} value={from} onChange={setFrom} />
        </div>
      </FormBody>
    </ResponsiveDialog>
  )
}

/** Leaving the hotel: end date and passive; nothing is deleted (G-24), the last month is paid by its days. */
export function DeactivateDialog({
  open,
  onOpenChange,
  employee,
  today
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: EmployeeViewDto
  today: LocalDate
}) {
  const { t } = useTranslation()
  const formId = useId()
  const [end, setEnd] = useState<LocalDate>(today)
  const save = useStaffMutation('staff.updateEmployee', { success: t('staff.deactivate.saved') })
  const tooEarly = end < employee.startDate
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('staff.deactivate.title', { name: employee.fullName })}
      description={t('staff.card.deactivateHint')}
      footer={
        <DialogFooter
          formId={formId}
          onCancel={() => onOpenChange(false)}
          saveLabel={t('staff.deactivate.confirm')}
          pending={save.isPending}
          destructive
        />
      }
    >
      <FormBody
        id={formId}
        testId="deactivate-form"
        onSubmit={() => {
          if (tooEarly) return
          save.mutate(
            { id: employee.id, patch: { endDate: end, active: false } },
            { onSuccess: () => onOpenChange(false) }
          )
        }}
      >
        <DateInput
          label={t('staff.deactivate.endDate')}
          value={end}
          onChange={setEnd}
          min={addDays(employee.startDate, 0)}
        />
        {tooEarly ? <FieldError>{t('staff.deactivate.tooEarly')}</FieldError> : null}
        <p className="text-muted-foreground text-xs">{t('staff.deactivate.lastMonth')}</p>
      </FormBody>
    </ResponsiveDialog>
  )
}

/**
 * Hiring a former employee again (B6): a new employment period from the chosen day; the old months stay as they
 * were and the months in between have no salary row.
 */
export function RehireDialog({
  open,
  onOpenChange,
  employee,
  today
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: EmployeeViewDto
  today: LocalDate
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const formId = useId()
  const lastDay = employee.endDate as LocalDate | null
  const earliest = lastDay ? addDays(lastDay, 1) : today
  const [start, setStart] = useState<LocalDate>(today > earliest ? today : earliest)
  const save = useStaffMutation('staff.rehire', { success: t('staff.rehire.saved') })
  const tooEarly = start < earliest
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('staff.rehire.title', { name: employee.fullName })}
      description={lastDay ? t('staff.rehire.description', { date: f.date(lastDay, 'long') }) : undefined}
      footer={
        <DialogFooter
          formId={formId}
          onCancel={() => onOpenChange(false)}
          saveLabel={t('staff.rehire.confirm')}
          pending={save.isPending}
        />
      }
    >
      <FormBody
        id={formId}
        testId="rehire-form"
        onSubmit={() => {
          if (tooEarly) return
          save.mutate({ employeeId: employee.id, startDate: start }, { onSuccess: () => onOpenChange(false) })
        }}
      >
        <DateInput label={t('staff.rehire.startDate')} value={start} onChange={setStart} min={earliest} />
        {tooEarly ? <FieldError>{t('errors.rehireBeforeEnd')}</FieldError> : null}
        <p className="text-muted-foreground text-xs">{t('staff.rehire.hint')}</p>
      </FormBody>
    </ResponsiveDialog>
  )
}

// ── The employee's own pay rules (K-38: Sahip + Müdür) ───────────────────────────────────────────────────────

type RuleKey = Extract<
  PayPolicyKey,
  | 'leaveDaysPerMonth'
  | 'standardHoursPerDay'
  | 'overtimeMode'
  | 'overtimeMultiplier'
  | 'overtimeHourlyMinor'
  | 'holidayMultiplier'
  | 'commissionMode'
  | 'commissionPct'
  | 'commissionBase'
  | 'commissionFixedMinor'
>
type Draft = { [K in RuleKey]: { own: boolean; text: string } }

const RULE_KEYS: readonly RuleKey[] = [
  'leaveDaysPerMonth',
  'standardHoursPerDay',
  'overtimeMode',
  'overtimeMultiplier',
  'overtimeHourlyMinor',
  'holidayMultiplier',
  'commissionMode',
  'commissionPct',
  'commissionBase',
  'commissionFixedMinor'
]
const INT_KEYS = new Set<RuleKey>(['leaveDaysPerMonth', 'standardHoursPerDay'])
const MONEY_KEYS = new Set<RuleKey>(['overtimeHourlyMinor', 'commissionFixedMinor'])
const RATE_KEYS = new Set<RuleKey>(['overtimeMultiplier', 'holidayMultiplier', 'commissionPct'])
const RATE = /^\d{1,6}(?:[.,]\d{1,6})?$/
const OVERTIME = ['none', 'hourly_fixed', 'multiplier'] as const
const COMMISSION = ['none', 'pct', 'fixed'] as const

const LABEL = {
  leaveDaysPerMonth: 'settings.staffPolicy.leaveDaysPerMonth',
  standardHoursPerDay: 'settings.staffPolicy.standardHoursPerDay',
  overtimeMode: 'settings.staffPolicy.overtimeMode',
  overtimeMultiplier: 'settings.staffPolicy.overtimeMultiplier',
  overtimeHourlyMinor: 'settings.staffPolicy.overtimeHourly',
  holidayMultiplier: 'settings.staffPolicy.holidayMultiplier',
  commissionMode: 'settings.staffPolicy.commissionMode',
  commissionPct: 'settings.staffPolicy.commissionPct',
  commissionBase: 'settings.staffPolicy.commissionBase',
  commissionFixedMinor: 'settings.staffPolicy.commissionFixed'
} as const satisfies Record<RuleKey, string>

const textOf = (v: unknown): string => (v === undefined || v === null ? '' : String(v))

export function RulesDialog({
  open,
  onOpenChange,
  employee
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: EmployeeViewDto
}) {
  const { t } = useTranslation()
  const policy = useApiQuery('staff.getPolicy', { employeeId: employee.id })
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('staff.rules.title', { name: employee.fullName })}
      description={t('staff.rules.description')}
      className="sm:max-w-2xl"
    >
      {policy.data ? (
        <RulesForm employeeId={employee.id} policy={policy.data} onDone={() => onOpenChange(false)} />
      ) : (
        <p className="text-muted-foreground py-6 text-sm">{t('common.loading')}</p>
      )}
    </ResponsiveDialog>
  )
}

function RulesForm({
  employeeId,
  policy,
  onDone
}: {
  employeeId: string
  policy: { values: PayPolicyValues; hotel: PayPolicyValues; employee: PayPolicyValues }
  onDone: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const formId = useId()
  const settings = useSettings()
  const base = settings.data?.['hotel.baseCurrency'] ?? 'TRY'
  const inherited = { ...policy.values, ...policy.hotel }
  const [draft, setDraft] = useState<Draft>(
    () =>
      Object.fromEntries(
        RULE_KEYS.map((k) => [
          k,
          { own: policy.employee[k] !== undefined, text: textOf(policy.employee[k] ?? policy.values[k]) }
        ])
      ) as Draft
  )
  const [bad, setBad] = useState<Partial<Record<RuleKey, true>>>({})
  const save = useStaffMutation('staff.setPolicy', { success: t('staff.rules.saved') })
  const set = (key: RuleKey, patch: Partial<{ own: boolean; text: string }>): void =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...patch } }))
  const effective = (key: RuleKey): string => (draft[key].own ? draft[key].text : textOf(inherited[key]))
  const visible = (key: RuleKey): boolean => {
    if (key === 'overtimeMultiplier') return effective('overtimeMode') === 'multiplier'
    if (key === 'overtimeHourlyMinor') return effective('overtimeMode') === 'hourly_fixed'
    if (key === 'commissionPct' || key === 'commissionBase') return effective('commissionMode') === 'pct'
    if (key === 'commissionFixedMinor') return effective('commissionMode') === 'fixed'
    return true
  }
  const shown = (key: RuleKey): string => {
    const v = inherited[key]
    if (v === undefined) return '—'
    if (MONEY_KEYS.has(key)) return f.money(Number(v), base)
    if (key === 'overtimeMode') return t(`settings.staffPolicy.overtime.${v as (typeof OVERTIME)[number]}`)
    if (key === 'commissionMode')
      return t(`settings.staffPolicy.commission.${v as (typeof COMMISSION)[number]}`)
    if (key === 'commissionBase')
      return t(`settings.staffPolicy.base.${v as (typeof COMMISSION_BASES)[number]}`)
    return String(v).replace('.', f.locale === 'en' ? '.' : ',')
  }
  const submit = (): void => {
    const values: Record<string, unknown> = {}
    const inherit: RuleKey[] = []
    const errors: Partial<Record<RuleKey, true>> = {}
    for (const key of RULE_KEYS) {
      const { own, text } = draft[key]
      if (!own || !visible(key)) {
        if (policy.employee[key] !== undefined && !own) inherit.push(key)
        continue
      }
      if (INT_KEYS.has(key)) {
        const n = Number(text)
        const max = key === 'leaveDaysPerMonth' ? 31 : 24
        const min = key === 'leaveDaysPerMonth' ? 0 : 1
        if (!/^\d+$/.test(text.trim()) || n < min || n > max) errors[key] = true
        else values[key] = n
      } else if (RATE_KEYS.has(key)) {
        if (!RATE.test(text.trim())) errors[key] = true
        else values[key] = text.trim().replace(',', '.')
      } else if (MONEY_KEYS.has(key)) {
        if (!/^\d+$/.test(text)) errors[key] = true
        else values[key] = Number(text)
      } else values[key] = text
    }
    setBad(errors)
    if (Object.keys(errors).length) return
    if (!Object.keys(values).length && !inherit.length) {
      onDone()
      return
    }
    save.mutate({ employeeId, values: values as PayPolicyValues, inherit }, { onSuccess: () => onDone() })
  }
  return (
    <FormBody id={formId} onSubmit={submit} testId="rules-form">
      <ul className="grid gap-3">
        {RULE_KEYS.filter(visible).map((key) => {
          const id = `${formId}-${key}`
          const own = draft[key].own
          return (
            <li
              key={key}
              className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_14rem] sm:items-center"
            >
              <div className="grid gap-1">
                <Label
                  htmlFor={`${id}-own`}
                  className="flex min-h-11 items-center gap-3 font-normal sm:min-h-0"
                >
                  <Switch
                    id={`${id}-own`}
                    className="relative max-md:after:absolute max-md:after:-inset-x-2 max-md:after:-inset-y-[14px]"
                    checked={own}
                    onCheckedChange={(v) => set(key, { own: v, text: v ? effective(key) : draft[key].text })}
                  />
                  <span className="grid gap-0.5">
                    <span className="text-sm font-medium">{t(LABEL[key])}</span>
                    <span className="text-muted-foreground text-xs">
                      {own ? t('staff.rules.own') : t('staff.rules.hotel', { value: shown(key) })}
                    </span>
                  </span>
                </Label>
              </div>
              {own ? (
                <RuleInput
                  id={id}
                  ruleKey={key}
                  value={draft[key].text}
                  currency={base}
                  invalid={Boolean(bad[key])}
                  onChange={(text) => set(key, { text })}
                />
              ) : null}
              {bad[key] ? (
                <p className="text-destructive text-xs sm:col-span-2" role="alert">
                  {MONEY_KEYS.has(key)
                    ? t('settings.staffPolicy.amountRequired')
                    : RATE_KEYS.has(key)
                      ? t('settings.staffPolicy.rateInvalid')
                      : t('settings.staffPolicy.numberInvalid')}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>
      <div className="flex justify-end gap-2 max-sm:grid">
        <DialogFooter formId={formId} onCancel={onDone} pending={save.isPending} />
      </div>
    </FormBody>
  )
}

function RuleInput({
  id,
  ruleKey,
  value,
  currency,
  invalid,
  onChange
}: {
  id: string
  ruleKey: RuleKey
  value: string
  currency: string
  invalid: boolean
  onChange: (text: string) => void
}) {
  const { t } = useTranslation()
  const options =
    ruleKey === 'overtimeMode'
      ? OVERTIME.map((v) => [v, t(`settings.staffPolicy.overtime.${v}`)] as const)
      : ruleKey === 'commissionMode'
        ? COMMISSION.map((v) => [v, t(`settings.staffPolicy.commission.${v}`)] as const)
        : ruleKey === 'commissionBase'
          ? COMMISSION_BASES.map((v) => [v, t(`settings.staffPolicy.base.${v}`)] as const)
          : null
  if (options)
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full" aria-label={t(LABEL[ruleKey])}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, label]) => (
            <SelectItem key={v} value={v}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  if (MONEY_KEYS.has(ruleKey))
    return (
      <MoneyInput
        id={id}
        label={t(LABEL[ruleKey])}
        value={{ amountMinor: value === '' ? null : Number(value), currency }}
        onChange={(v) =>
          onChange(v.amountMinor === null || Number.isNaN(v.amountMinor) ? '' : String(v.amountMinor))
        }
        currencies={[currency]}
      />
    )
  return (
    <Input
      id={id}
      aria-label={t(LABEL[ruleKey])}
      inputMode={INT_KEYS.has(ruleKey) ? 'numeric' : 'decimal'}
      dir="ltr"
      className="text-end tabular-nums"
      value={value}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
