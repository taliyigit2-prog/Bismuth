// "Personel politikası" (G-82, K-38, S-34…S-38): the hotel-wide pay rules — leave days and what happens to unused
// ones, the day and hour divisors, overtime (none / fixed hourly / multiple of the hourly wage), holiday work and
// commission — plus whether staff may take an advance from the reception drawer. Owner and manager change them
// (staff.policy); a single employee's own rule is set on the Personel screen. Rates are decimal text ("1,5"), never
// floating point; fixed amounts are minor units in the base currency.
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { COMMISSION_BASES, type PayPolicyValues } from '@shared/contract/staff'
import type { ProcedureOutput, SettingsPatch, SettingsValues } from '@shared/contract'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ErrorState, LoadingState } from '@/components/states'
import { MoneyInput } from '@/components/money-input'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { Field, SwitchRow } from './room-dialogs'
import { deferForPendingAmount, useAdminMutation } from './use-admin'

type Policy = ProcedureOutput<'staff.getPolicy'>['values']

const OVERTIME = ['none', 'hourly_fixed', 'multiplier'] as const
const HOLIDAY = ['hourly', 'daily'] as const
const COMMISSION = ['none', 'pct', 'fixed'] as const
/** Choices of "how many days back an employee writes their own hours" (QA2a); a stored other value is kept. */
const OWN_HOURS_BACK = [0, 1, 2, 3, 7, 14, 30] as const
const pick = <T extends string>(list: readonly T[], v: string): T | undefined => list.find((x) => x === v)

interface Draft {
  leaveDaysPerMonth: string
  unusedLeavePaid: boolean
  unusedLeaveMultiplier: string
  leaveCarryOver: boolean
  dailyDivisorMode: 'days_in_month' | 'fixed'
  dailyDivisor: string
  standardHoursPerDay: string
  hourlyDivisor: string
  overtimeMode: (typeof OVERTIME)[number]
  overtimeHourlyMinor: number | null
  overtimeMultiplier: string
  holidayMultiplier: string
  holidayPayMode: (typeof HOLIDAY)[number]
  commissionMode: (typeof COMMISSION)[number]
  commissionPct: string
  commissionFixedMinor: number | null
  commissionBase: (typeof COMMISSION_BASES)[number]
}

const str = (v: number | undefined): string => (v === undefined ? '' : String(v))

function draftOf(p: Policy): Draft {
  return {
    leaveDaysPerMonth: str(p.leaveDaysPerMonth),
    unusedLeavePaid: p.unusedLeavePaid ?? false,
    unusedLeaveMultiplier: p.unusedLeaveMultiplier ?? '',
    leaveCarryOver: p.leaveCarryOver ?? false,
    dailyDivisorMode: typeof p.dailyDivisor === 'number' ? 'fixed' : 'days_in_month',
    dailyDivisor: typeof p.dailyDivisor === 'number' ? String(p.dailyDivisor) : '30',
    standardHoursPerDay: str(p.standardHoursPerDay),
    hourlyDivisor: str(p.hourlyDivisor),
    overtimeMode: p.overtimeMode ?? 'none',
    overtimeHourlyMinor: p.overtimeHourlyMinor ?? null,
    overtimeMultiplier: p.overtimeMultiplier ?? '',
    holidayMultiplier: p.holidayMultiplier ?? '',
    holidayPayMode: p.holidayPayMode ?? 'daily',
    commissionMode: p.commissionMode ?? 'none',
    commissionPct: p.commissionPct ?? '',
    commissionFixedMinor: p.commissionFixedMinor ?? null,
    commissionBase: p.commissionBase ?? 'room_revenue_all'
  }
}

/** Allowed whole numbers per field (also the words of the message under it). */
const RANGES: Partial<Record<keyof Draft, readonly [number, number]>> = {
  leaveDaysPerMonth: [0, 31],
  dailyDivisor: [1, 31],
  standardHoursPerDay: [1, 24],
  hourlyDivisor: [1, 744]
}
const rangeOf = (key: keyof Draft): readonly [number, number] => RANGES[key] ?? [0, 31]

/** Rates with a sensible range (H-40): a holiday multiplier of 0 or 99 would wreck the salary table. */
const RATE_LIMITS: Partial<Record<keyof Draft, readonly [number, number]>> = { holidayMultiplier: [1, 5] }

const RATE = /^\d{1,6}(?:[.,]\d{1,6})?$/
type Bad = Partial<Record<keyof Draft, true>>

/** The draft as policy values: only what is shown is sent (a hidden rate keeps its stored value). */
function valuesOf(d: Draft): { values: PayPolicyValues; bad: Bad } {
  const bad: Bad = {}
  const values: PayPolicyValues = {}
  const int = (key: keyof Draft, text: string, min: number, max: number): number | undefined => {
    if (!/^\d+$/.test(text.trim()) || Number(text) < min || Number(text) > max) {
      bad[key] = true
      return undefined
    }
    return Number(text)
  }
  const rate = (key: keyof Draft, text: string): string | undefined => {
    const limits = RATE_LIMITS[key]
    const n = Number(text.trim().replace(',', '.'))
    if (!RATE.test(text.trim()) || (limits && (n < limits[0] || n > limits[1]))) {
      bad[key] = true
      return undefined
    }
    return text.trim().replace(',', '.')
  }
  const set = <K extends keyof PayPolicyValues>(key: K, value: PayPolicyValues[K] | undefined): void => {
    if (value !== undefined) values[key] = value
  }
  set('leaveDaysPerMonth', int('leaveDaysPerMonth', d.leaveDaysPerMonth, ...rangeOf('leaveDaysPerMonth')))
  set('unusedLeavePaid', d.unusedLeavePaid)
  if (d.unusedLeavePaid) set('unusedLeaveMultiplier', rate('unusedLeaveMultiplier', d.unusedLeaveMultiplier))
  set('leaveCarryOver', d.leaveCarryOver)
  set(
    'dailyDivisor',
    d.dailyDivisorMode === 'days_in_month'
      ? 'days_in_month'
      : int('dailyDivisor', d.dailyDivisor, ...rangeOf('dailyDivisor'))
  )
  set(
    'standardHoursPerDay',
    int('standardHoursPerDay', d.standardHoursPerDay, ...rangeOf('standardHoursPerDay'))
  )
  set('hourlyDivisor', int('hourlyDivisor', d.hourlyDivisor, ...rangeOf('hourlyDivisor')))
  set('overtimeMode', d.overtimeMode)
  if (d.overtimeMode === 'hourly_fixed') {
    if (d.overtimeHourlyMinor === null || d.overtimeHourlyMinor < 0) bad.overtimeHourlyMinor = true
    else set('overtimeHourlyMinor', d.overtimeHourlyMinor)
  }
  if (d.overtimeMode === 'multiplier')
    set('overtimeMultiplier', rate('overtimeMultiplier', d.overtimeMultiplier))
  set('holidayMultiplier', rate('holidayMultiplier', d.holidayMultiplier))
  set('holidayPayMode', d.holidayPayMode)
  set('commissionMode', d.commissionMode)
  if (d.commissionMode === 'pct') {
    set('commissionPct', rate('commissionPct', d.commissionPct))
    set('commissionBase', d.commissionBase)
  }
  if (d.commissionMode === 'fixed') {
    if (d.commissionFixedMinor === null || d.commissionFixedMinor < 0) bad.commissionFixedMinor = true
    else set('commissionFixedMinor', d.commissionFixedMinor)
  }
  return { values, bad }
}

/** Rates compare as numbers ("1.5" = "1,50"). */
const sameValue = (a: unknown, b: unknown): boolean =>
  a === b ||
  (typeof a === 'string' &&
    typeof b === 'string' &&
    Number(a.replace(',', '.')) === Number(b.replace(',', '.')))

function changed(values: PayPolicyValues, current: Policy): PayPolicyValues {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values))
    if (!sameValue(value, current[key as keyof Policy])) out[key] = value
  return out as PayPolicyValues
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid content-start gap-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  )
}

type TextKey = {
  [K in keyof Draft]: Draft[K] extends string ? (string extends Draft[K] ? K : never) : never
}[keyof Draft]
const DIVISOR = ['days_in_month', 'fixed'] as const

/** What the text fields share: the form's ids, its draft and errors, and the setter. */
interface FormApi {
  prefix: string
  draft: Draft
  bad: Bad
  set: (key: TextKey, value: string) => void
}

/** A whole number or a rate typed as text ("1,5"); the error replaces the help line. */
function TextField({
  form,
  name,
  kind,
  label,
  help
}: {
  form: FormApi
  name: TextKey
  kind: 'number' | 'rate'
  label: string
  help?: string
}) {
  const { t } = useTranslation()
  const id = `${form.prefix}-${name}`
  const error = form.bad[name]
    ? kind === 'rate'
      ? RATE_LIMITS[name]
        ? t('settings.staffPolicy.rateRange', { min: RATE_LIMITS[name][0], max: RATE_LIMITS[name][1] })
        : t('settings.staffPolicy.rateInvalid')
      : t('settings.staffPolicy.numberRange', { min: rangeOf(name)[0], max: rangeOf(name)[1] })
    : null
  return (
    <Field id={id} label={label} help={help} error={error}>
      <Input
        id={id}
        inputMode={kind === 'rate' ? 'decimal' : 'numeric'}
        dir="ltr"
        className="text-end tabular-nums sm:max-w-40"
        value={form.draft[name]}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={`${id}-msg`}
        onChange={(e) => form.set(name, e.target.value)}
        data-testid={`policy-${name}`}
      />
    </Field>
  )
}

function ChoiceField<T extends string>({
  id,
  label,
  options,
  value,
  text,
  onChange
}: {
  id: string
  label: string
  options: readonly T[]
  value: T
  text: (v: T) => string
  onChange: (v: T) => void
}) {
  return (
    <Field id={id} label={label}>
      <Select
        value={value}
        onValueChange={(v) => {
          const next = pick(options, v)
          if (next) onChange(next)
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((v) => (
            <SelectItem key={v} value={v}>
              {text(v)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

function PolicyForm({
  policy,
  settings,
  canEdit
}: {
  policy: Policy
  settings: SettingsValues
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const id = useId()
  const [draft, setDraft] = useState<Draft>(() => draftOf(policy))
  const [initial] = useState<Draft>(() => draftOf(policy))
  const [submitBad, setBad] = useState<Bad>({})
  const save = useAdminMutation('staff.setPolicy', {
    invalidate: ['staff.getPolicy'],
    success: t('settings.saved')
  })
  const set = <K extends keyof Draft>(key: K, value: Draft[K]): void => {
    setDraft((d) => ({ ...d, [key]: value }))
    if (submitBad[key]) setBad((b) => ({ ...b, [key]: undefined }))
  }
  const { values, bad: draftBad } = valuesOf(draft)
  // A field the person edited into an invalid value shows its message at once and keeps Kaydet enabled, so the
  // click does not look dead (QA3c2 #2); an untouched field that was never valid is not flagged.
  const liveBad: Bad = {}
  for (const key of Object.keys(draftBad) as (keyof Draft)[])
    if (draft[key] !== initial[key]) liveBad[key] = true
  const bad: Bad = { ...submitBad, ...liveBad }
  const patch = changed(values, policy)
  const dirty = Object.keys(patch).length > 0 || Object.keys(liveBad).length > 0
  const base = settings['hotel.baseCurrency']
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (deferForPendingAmount(e.currentTarget)) return
    const result = valuesOf(draft)
    setBad(result.bad)
    const first = Object.keys(result.bad)[0]
    if (first) {
      document.getElementById(`${id}-${first}`)?.focus()
      return
    }
    const values = changed(result.values, policy)
    if (Object.keys(values).length) save.mutate({ employeeId: null, values })
  }
  const form: FormApi = { prefix: id, draft, bad, set }
  const multiplierHelp = t('settings.staffPolicy.multiplierHelp')

  return (
    <form onSubmit={submit} noValidate>
      <fieldset disabled={!canEdit} className="contents">
        <CardContent className="grid gap-4 lg:grid-cols-2">
          <Group title={t('settings.staffPolicy.leaveTitle')}>
            <TextField
              form={form}
              name="leaveDaysPerMonth"
              kind="number"
              label={t('settings.staffPolicy.leaveDaysPerMonth')}
            />
            <SwitchRow
              id={`${id}-unusedLeavePaid`}
              label={t('settings.staffPolicy.unusedLeavePaid')}
              checked={draft.unusedLeavePaid}
              onChange={(v) => set('unusedLeavePaid', v)}
            />
            {draft.unusedLeavePaid ? (
              <TextField
                form={form}
                name="unusedLeaveMultiplier"
                kind="rate"
                label={t('settings.staffPolicy.unusedLeaveMultiplier')}
                help={multiplierHelp}
              />
            ) : null}
            <SwitchRow
              id={`${id}-leaveCarryOver`}
              label={t('settings.staffPolicy.leaveCarryOver')}
              checked={draft.leaveCarryOver}
              onChange={(v) => set('leaveCarryOver', v)}
            />
          </Group>

          <Group title={t('settings.staffPolicy.dayTitle')}>
            <ChoiceField
              id={`${id}-dailyDivisorMode`}
              label={t('settings.staffPolicy.dailyDivisor')}
              options={DIVISOR}
              value={draft.dailyDivisorMode}
              text={(v) => t(`settings.staffPolicy.dailyDivisorMode.${v}`)}
              onChange={(v) => set('dailyDivisorMode', v)}
            />
            {draft.dailyDivisorMode === 'fixed' ? (
              <TextField
                form={form}
                name="dailyDivisor"
                kind="number"
                label={t('settings.staffPolicy.dailyDivisorDays')}
              />
            ) : null}
            <div className="grid items-end gap-4 sm:grid-cols-2">
              <TextField
                form={form}
                name="standardHoursPerDay"
                kind="number"
                label={t('settings.staffPolicy.standardHoursPerDay')}
              />
              <TextField
                form={form}
                name="hourlyDivisor"
                kind="number"
                label={t('settings.staffPolicy.hourlyDivisor')}
              />
            </div>
          </Group>

          <Group title={t('settings.staffPolicy.overtimeTitle')}>
            <ChoiceField
              id={`${id}-overtimeMode`}
              label={t('settings.staffPolicy.overtimeMode')}
              options={OVERTIME}
              value={draft.overtimeMode}
              text={(v) => t(`settings.staffPolicy.overtime.${v}`)}
              onChange={(v) => set('overtimeMode', v)}
            />
            {draft.overtimeMode === 'hourly_fixed' ? (
              <div className="grid gap-1.5">
                <MoneyInput
                  id={`${id}-overtimeHourlyMinor`}
                  label={t('settings.staffPolicy.overtimeHourly')}
                  value={{ amountMinor: draft.overtimeHourlyMinor, currency: base }}
                  onChange={(v) => set('overtimeHourlyMinor', v.amountMinor)}
                  currencies={[base]}
                />
                {bad.overtimeHourlyMinor ? (
                  <p className="text-destructive text-xs" role="alert">
                    {t('settings.staffPolicy.amountRequired')}
                  </p>
                ) : null}
              </div>
            ) : null}
            {draft.overtimeMode === 'multiplier' ? (
              <TextField
                form={form}
                name="overtimeMultiplier"
                kind="rate"
                label={t('settings.staffPolicy.overtimeMultiplier')}
                help={multiplierHelp}
              />
            ) : null}
          </Group>

          <Group title={t('settings.staffPolicy.holidayTitle')}>
            <TextField
              form={form}
              name="holidayMultiplier"
              kind="rate"
              label={t('settings.staffPolicy.holidayMultiplier')}
              help={multiplierHelp}
            />
            <ChoiceField
              id={`${id}-holidayPayMode`}
              label={t('settings.staffPolicy.holidayPayMode')}
              options={HOLIDAY}
              value={draft.holidayPayMode}
              text={(v) => t(`settings.staffPolicy.holidayPay.${v}`)}
              onChange={(v) => set('holidayPayMode', v)}
            />
          </Group>

          <Group title={t('settings.staffPolicy.commissionTitle')}>
            <ChoiceField
              id={`${id}-commissionMode`}
              label={t('settings.staffPolicy.commissionMode')}
              options={COMMISSION}
              value={draft.commissionMode}
              text={(v) => t(`settings.staffPolicy.commission.${v}`)}
              onChange={(v) => set('commissionMode', v)}
            />
            {draft.commissionMode === 'pct' ? (
              <>
                <TextField
                  form={form}
                  name="commissionPct"
                  kind="rate"
                  label={t('settings.staffPolicy.commissionPct')}
                />
                <ChoiceField
                  id={`${id}-commissionBase`}
                  label={t('settings.staffPolicy.commissionBase')}
                  options={COMMISSION_BASES}
                  value={draft.commissionBase}
                  text={(v) => t(`settings.staffPolicy.base.${v}`)}
                  onChange={(v) => set('commissionBase', v)}
                />
              </>
            ) : null}
            {draft.commissionMode === 'fixed' ? (
              <div className="grid gap-1.5">
                <MoneyInput
                  id={`${id}-commissionFixedMinor`}
                  label={t('settings.staffPolicy.commissionFixed')}
                  value={{ amountMinor: draft.commissionFixedMinor, currency: base }}
                  onChange={(v) => set('commissionFixedMinor', v.amountMinor)}
                  currencies={[base]}
                />
                {bad.commissionFixedMinor ? (
                  <p className="text-destructive text-xs" role="alert">
                    {t('settings.staffPolicy.amountRequired')}
                  </p>
                ) : null}
              </div>
            ) : null}
          </Group>
        </CardContent>
        <CardFooter className="mt-6 flex flex-wrap justify-end gap-2 max-md:[&>button]:flex-1">
          <Button
            type="button"
            variant="outline"
            disabled={!dirty}
            onClick={() => {
              setDraft(draftOf(policy))
              setBad({})
            }}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!dirty || save.isPending} data-testid="policy-save">
            {t('settings.save')}
          </Button>
        </CardFooter>
      </fieldset>
    </form>
  )
}

export function StaffPolicySection({
  values,
  onSave
}: {
  values: SettingsValues
  onSave: (patch: SettingsPatch, announce?: boolean) => void
}) {
  const { t } = useTranslation()
  const can = useCan()
  const canEdit = can('staff.policy', 'edit')
  const query = useApiQuery('staff.getPolicy', { employeeId: null })
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="max-md:sr-only">{t('settings.staffPolicy.title')}</CardTitle>
          <CardDescription>{t('settings.staffPolicy.help')}</CardDescription>
        </CardHeader>
        {query.isPending ? (
          <CardContent>
            <LoadingState cards={1} />
          </CardContent>
        ) : query.isError || !query.data ? (
          <CardContent>
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          </CardContent>
        ) : (
          // A refetch (after Kaydet) starts the form again from the stored rules.
          <PolicyForm
            key={query.dataUpdatedAt}
            policy={query.data.values}
            settings={values}
            canEdit={canEdit}
          />
        )}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.staffPolicy.advanceTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <SwitchRow
            id="advance-from-drawer"
            label={t('settings.staffPolicy.advanceFromDrawer')}
            help={t('settings.staffPolicy.advanceHelp')}
            checked={values['staff.advanceFromDrawer']}
            disabled={!canEdit}
            onChange={(v) => onSave({ 'staff.advanceFromDrawer': v }, true)}
          />
        </CardContent>
      </Card>
      <OwnHoursCard values={values} onSave={onSave} canEdit={canEdit} />
    </div>
  )
}

/** "Çalışanın kendi saati" (QA2a, K-46): how far back an employee may write their own start and end times. */
function OwnHoursCard({
  values,
  onSave,
  canEdit
}: {
  values: SettingsValues
  onSave: (patch: SettingsPatch, announce?: boolean) => void
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const current = values['staff.ownHoursBackDays']
  const choices = [...new Set<number>([...OWN_HOURS_BACK, current])].sort((a, b) => a - b)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.staffPolicy.ownHoursTitle')}</CardTitle>
        <CardDescription>{t('settings.staffPolicy.ownHoursHelp')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid content-start gap-2 md:max-w-[calc(50%-0.75rem)]">
          <Label htmlFor="own-hours-back">{t('settings.staffPolicy.ownHoursBackDays')}</Label>
          <Select
            value={String(current)}
            disabled={!canEdit}
            onValueChange={(v) => {
              const days = Number(v)
              if (Number.isInteger(days)) onSave({ 'staff.ownHoursBackDays': days }, true)
            }}
          >
            <SelectTrigger id="own-hours-back" className="w-full" data-testid="own-hours-back">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {choices.map((d) => (
                <SelectItem key={d} value={String(d)} data-testid={`own-hours-back-${d}`}>
                  {d === 0
                    ? t('settings.staffPolicy.ownHoursToday')
                    : t('settings.staffPolicy.ownHoursDays', { count: d })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}
