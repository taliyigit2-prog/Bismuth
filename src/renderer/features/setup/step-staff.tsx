// Step 8 — staff rules and shifts (G-82, G-94, G-95, K-38, S-34…S-38): the pay policy essentials (days off, the
// daily wage, overtime, holiday work and the bonus), advances from the drawer, the shift pattern (seeded Gündüz /
// Gece, editable), the hotel's own repeating tasks (own-tasks.tsx, first under the heading), the suggested tasks
// with how often each repeats and the legal reminders. The names match Ayarlar → Personel kuralları and Görev önerileri.
import { useTranslation } from 'react-i18next'
import { PlusIcon, XIcon } from 'lucide-react'
import { taskSuggestedIn } from '@shared/domain/task-country'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MoneyInput } from '@/components/money-input'
import { TimeInput } from '@/components/time-input'
import { useFormat } from '@/hooks/use-format'
import { useRuleText } from '../tasks/rule-text'
import { describe } from './aria'
import { ids, localName, newKey, type DraftShift, type WizardDraft } from './draft'
import { DigitsInput, Field, FieldMessage, SectionTitle, SwitchRow } from './fields'
import { OwnTasks } from './own-tasks'
import type { StepProps } from './step-props'

const OVERTIME_MODES = ['none', 'hourly_fixed', 'multiplier'] as const
const COMMISSION_MODES = ['none', 'pct', 'fixed'] as const
const DIVISOR_MODES = ['days_in_month', 'fixed'] as const
const MAX_SHIFTS = 10
const TASK_KINDS = ['general', 'maintenance'] as const
/** Russian labels wrap to two lines: the fields of a row line up at their inputs; hints go under the row. */
const ROW = 'grid items-end gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3'
const MULTIPLIER_HINT = 'setup-multiplier-hint'
const COMMISSION_HINT = 'setup-commission-hint'

export function StaffStep({ draft, update, options, errors }: StepProps) {
  const { t } = useTranslation()
  const f = useFormat()
  const ruleText = useRuleText()
  const s = draft.staff
  const base = draft.money.baseCurrency
  const set = (patch: Partial<WizardDraft['staff']>): void =>
    update((d) => ({ ...d, staff: { ...d.staff, ...patch } }))
  const setShift = (key: string, patch: Partial<DraftShift>): void =>
    update((d) => ({ ...d, shifts: d.shifts.map((x) => (x.key === key ? { ...x, ...patch } : x)) }))
  const seededName = new Map(options.shifts.map((x) => [x.id, localName(f.locale, x.name, x.displayName)]))
  const shiftName = (x: DraftShift): string => x.name ?? (x.id ? (seededName.get(x.id) ?? '') : '')
  const suggestions = new Set(draft.tasks.suggestions)
  // Turkish legal reminders only for a hotel in Türkiye (K-46 (7)); the same rule for any country-bound suggestion.
  const offered = options.taskTemplates.filter((task) => taskSuggestedIn(task.code, draft.hotel.country))
  const legal = offered.filter((task) => task.kind === 'legal')

  return (
    <div className="grid gap-8">
      <section className="grid gap-4" aria-labelledby="setup-policy-title">
        <div className="grid gap-1">
          <SectionTitle>
            <span id="setup-policy-title">{t('setup.staff.policyTitle')}</span>
          </SectionTitle>
          <p className="text-muted-foreground text-xs">{t('setup.staff.policyHint')}</p>
        </div>
        <div className={ROW}>
          <Field id={ids.leaveDays} label={t('setup.staff.leaveDays')} errors={errors}>
            <DigitsInput
              id={ids.leaveDays}
              maxLength={2}
              value={s.leaveDaysPerMonth}
              onChange={(leaveDaysPerMonth) => set({ leaveDaysPerMonth })}
              aria={describe(ids.leaveDays, errors)}
            />
          </Field>
          <Field id={ids.standardHours} label={t('setup.staff.standardHours')} errors={errors}>
            <DigitsInput
              id={ids.standardHours}
              maxLength={2}
              value={s.standardHoursPerDay}
              onChange={(standardHoursPerDay) => set({ standardHoursPerDay })}
              aria={describe(ids.standardHours, errors)}
            />
          </Field>
        </div>
        <SwitchRow
          id="setup-unused-leave-paid"
          checked={s.unusedLeavePaid}
          onChange={(unusedLeavePaid) => set({ unusedLeavePaid })}
          label={t('setup.staff.unusedLeavePaid')}
        />
        <div className={ROW}>
          <Choice
            id="setup-daily-divisor-mode"
            label={t('setup.staff.dailyDivisor')}
            options={DIVISOR_MODES}
            value={s.divideByMonthDays ? 'days_in_month' : 'fixed'}
            text={(m) => t(`setup.staff.dailyDivisorMode.${m}`)}
            onChange={(m) => set({ divideByMonthDays: m === 'days_in_month' })}
          />
          {s.divideByMonthDays ? null : (
            <Field id={ids.dailyDivisor} label={t('setup.staff.dailyDivisorDays')} errors={errors}>
              <DigitsInput
                id={ids.dailyDivisor}
                maxLength={2}
                value={s.dailyDivisor}
                onChange={(dailyDivisor) => set({ dailyDivisor })}
                aria={describe(ids.dailyDivisor, errors)}
              />
            </Field>
          )}
        </div>
        <div className="grid gap-1.5">
          <div className={ROW}>
            <Choice
              id="setup-overtime-mode"
              label={t('setup.staff.overtime')}
              options={OVERTIME_MODES}
              value={s.overtimeMode}
              text={(m) => t(`setup.staff.overtimeMode.${m}`)}
              onChange={(overtimeMode) => set({ overtimeMode })}
            />
            {s.overtimeMode === 'hourly_fixed' ? (
              <Amount
                id={ids.overtimeHourly}
                label={t('setup.staff.overtimeHourly')}
                value={s.overtimeHourlyMinor}
                currency={base}
                errors={errors}
                onChange={(overtimeHourlyMinor) => set({ overtimeHourlyMinor })}
              />
            ) : null}
            {s.overtimeMode === 'multiplier' ? (
              <Field id={ids.overtimeMultiplier} label={t('setup.staff.overtimeMultiplier')} errors={errors}>
                <DecimalInput
                  id={ids.overtimeMultiplier}
                  value={s.overtimeMultiplier}
                  onChange={(overtimeMultiplier) => set({ overtimeMultiplier })}
                  aria={describe(ids.overtimeMultiplier, errors, MULTIPLIER_HINT)}
                />
              </Field>
            ) : null}
            <Field id={ids.holidayMultiplier} label={t('setup.staff.holidayMultiplier')} errors={errors}>
              <DecimalInput
                id={ids.holidayMultiplier}
                value={s.holidayMultiplier}
                onChange={(holidayMultiplier) => set({ holidayMultiplier })}
                aria={describe(ids.holidayMultiplier, errors, MULTIPLIER_HINT)}
              />
            </Field>
          </div>
          <p id={MULTIPLIER_HINT} className="text-muted-foreground text-xs">
            {t('setup.staff.multiplierHint')}
          </p>
        </div>
        <div className="grid gap-1.5" data-testid="setup-commission">
          <div className={ROW}>
            <Choice
              id="setup-commission-mode"
              label={t('setup.staff.commission')}
              options={COMMISSION_MODES}
              value={s.commissionMode}
              text={(m) => t(`setup.staff.commissionMode.${m}`)}
              onChange={(commissionMode) => set({ commissionMode })}
            />
            {s.commissionMode === 'pct' ? (
              <Field id={ids.commissionPct} label={t('setup.staff.commissionPct')} errors={errors}>
                <DecimalInput
                  id={ids.commissionPct}
                  value={s.commissionPct}
                  onChange={(commissionPct) => set({ commissionPct })}
                  aria={describe(ids.commissionPct, errors, COMMISSION_HINT)}
                />
              </Field>
            ) : null}
            {s.commissionMode === 'fixed' ? (
              <Amount
                id={ids.commissionFixed}
                label={t('setup.staff.commissionFixed')}
                value={s.commissionFixedMinor}
                currency={base}
                errors={errors}
                onChange={(commissionFixedMinor) => set({ commissionFixedMinor })}
              />
            ) : null}
          </div>
          {s.commissionMode === 'none' ? null : (
            <p id={COMMISSION_HINT} className="text-muted-foreground text-xs">
              {t(`setup.staff.commissionHint.${s.commissionMode}`)}
            </p>
          )}
        </div>
        <SwitchRow
          id="setup-advance-from-drawer"
          checked={s.advanceFromDrawer}
          onChange={(advanceFromDrawer) => set({ advanceFromDrawer })}
          label={t('setup.staff.advanceFromDrawer')}
          hint={t('setup.staff.advanceHint')}
        />
      </section>

      <section className="grid gap-3" aria-labelledby="setup-shifts-title">
        <div className="grid gap-1">
          <SectionTitle>
            <span id="setup-shifts-title">{t('setup.staff.shiftsTitle')}</span>
          </SectionTitle>
          <p className="text-muted-foreground text-xs">{t('setup.staff.shiftsHint')}</p>
        </div>
        {draft.shifts.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('setup.staff.noShifts')}</p>
        ) : (
          <ul className="grid gap-2" data-testid="setup-shifts">
            {draft.shifts.map((shift) => (
              <ShiftRow
                key={shift.key}
                shift={shift}
                name={shiftName(shift)}
                errors={errors}
                onChange={(patch) => setShift(shift.key, patch)}
                onRemove={() =>
                  update((d) => ({ ...d, shifts: d.shifts.filter((x) => x.key !== shift.key) }))
                }
              />
            ))}
          </ul>
        )}
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          disabled={draft.shifts.length >= MAX_SHIFTS}
          onClick={() =>
            update((d) => ({
              ...d,
              shifts: [
                ...d.shifts,
                { key: newKey(), id: null, name: '', startTime: '09:00', endTime: '17:00' }
              ]
            }))
          }
          data-testid="setup-add-shift"
        >
          <PlusIcon aria-hidden />
          {t('setup.staff.addShift')}
        </Button>
      </section>

      <section className="grid gap-3" aria-labelledby="setup-tasks-title">
        <div className="grid gap-1">
          <SectionTitle>
            <span id="setup-tasks-title">{t('setup.staff.tasksTitle')}</span>
          </SectionTitle>
          <p className="text-muted-foreground text-xs">{t('setup.staff.tasksHint')}</p>
        </div>
        {/* First, not after the ~40 suggestions: the owner asked for it and would not scroll that far. */}
        <OwnTasks draft={draft} update={update} />
        {TASK_KINDS.map((kind) => {
          const templates = offered.filter((task) => task.kind === kind && task.suggested)
          if (templates.length === 0) return null
          return (
            <fieldset key={kind} className="grid gap-1">
              <legend className="text-muted-foreground mb-1 text-xs font-medium">
                {t(`setup.staff.taskKind.${kind}`)}
              </legend>
              <div className="grid gap-x-4 sm:grid-cols-2">
                {templates.map((task) => (
                  <Label
                    key={task.id}
                    className="min-h-9 cursor-pointer items-start gap-3 py-1.5 leading-snug font-normal max-md:min-h-11"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={suggestions.has(task.id)}
                      onCheckedChange={(on) =>
                        update((d) => ({
                          ...d,
                          tasks: {
                            ...d.tasks,
                            suggestions:
                              on === true
                                ? [...d.tasks.suggestions, task.id]
                                : d.tasks.suggestions.filter((id) => id !== task.id)
                          }
                        }))
                      }
                      data-testid={`setup-task-${task.code ?? task.id}`}
                    />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="break-words">{localName(f.locale, task.title, task.titleI18n)}</span>
                      {ruleText(task.recurrence) ? (
                        <span className="text-muted-foreground text-xs">{ruleText(task.recurrence)}</span>
                      ) : null}
                    </span>
                  </Label>
                ))}
              </div>
            </fieldset>
          )
        })}
        {legal.length > 0 ? (
          <div className="grid gap-1 rounded-lg border p-3">
            <SwitchRow
              id="setup-legal-reminders"
              checked={draft.tasks.legalReminders}
              onChange={(legalReminders) => update((d) => ({ ...d, tasks: { ...d.tasks, legalReminders } }))}
              label={t('setup.staff.legal')}
              hint={t('setup.staff.legalHint')}
            />
            <ul className="text-muted-foreground ms-11 list-disc ps-4 text-xs leading-relaxed">
              {legal.map((task) => (
                <li key={task.id}>{localName(f.locale, task.title, task.titleI18n)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  )
}

function ShiftRow({
  shift,
  name,
  errors,
  onChange,
  onRemove
}: {
  shift: DraftShift
  name: string
  errors: StepProps['errors']
  onChange: (patch: Partial<DraftShift>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const fieldIds = {
    name: ids.shift(shift.key, 'name'),
    start: ids.shift(shift.key, 'start'),
    end: ids.shift(shift.key, 'end')
  }
  // Phone: the name and the remove button, then the two times side by side (each wide enough for "09:00 AM").
  // From `sm`: one line (the times' wrapper turns into `contents`, the remove button moves to the end).
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto]">
      <Field id={fieldIds.name} label={t('setup.staff.shiftName')} errors={errors}>
        <Input
          id={fieldIds.name}
          value={name}
          maxLength={60}
          onChange={(e) => onChange({ name: e.target.value })}
          data-testid={fieldIds.name}
          {...describe(fieldIds.name, errors)}
        />
      </Field>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="sm:order-last"
        aria-label={t('setup.remove', { name: name || t('setup.staff.shiftName') })}
        onClick={onRemove}
      >
        <XIcon aria-hidden />
      </Button>
      <div
        className="col-span-2 grid grid-cols-2 items-end gap-2 sm:contents"
        data-testid="setup-shift-times"
      >
        <Field id={fieldIds.start} label={t('setup.staff.shiftStart')} errors={errors}>
          <TimeInput
            id={fieldIds.start}
            value={shift.startTime}
            onChange={(v) => onChange({ startTime: v })}
            {...describe(fieldIds.start, errors)}
          />
        </Field>
        <Field id={fieldIds.end} label={t('setup.staff.shiftEnd')} errors={errors}>
          <TimeInput
            id={fieldIds.end}
            value={shift.endTime}
            onChange={(v) => onChange({ endTime: v })}
            {...describe(fieldIds.end, errors)}
          />
        </Field>
      </div>
    </li>
  )
}

/** A choice from a short fixed list (overtime, daily wage, bonus), its label above like every field. */
function Choice<T extends string>({
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
  text: (value: T) => string
  onChange: (value: T) => void
}) {
  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <Label htmlFor={id} className="leading-snug">
        {label}
      </Label>
      <Select
        value={value}
        onValueChange={(v) => {
          const next = options.find((o) => o === v)
          if (next) onChange(next)
        }}
      >
        <SelectTrigger id={id} className="w-full" data-testid={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {text(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** An amount in the base currency (overtime per hour, a fixed bonus) with its message under it. */
function Amount({
  id,
  label,
  value,
  currency,
  errors,
  onChange
}: {
  id: string
  label: string
  value: number | null
  currency: string
  errors: StepProps['errors']
  onChange: (amountMinor: number | null) => void
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <MoneyInput
        id={id}
        label={label}
        value={{ amountMinor: value, currency }}
        onChange={(v) => onChange(v.amountMinor)}
        currencies={[currency]}
      />
      <FieldMessage id={id} error={errors[id]} />
    </div>
  )
}

/** "1,5" or "1.5": a rate, never money (the server keeps it as text, domain/salary.ts). */
function DecimalInput({
  id,
  value,
  onChange,
  aria
}: {
  id: string
  value: string
  onChange: (value: string) => void
  aria: ReturnType<typeof describe>
}) {
  return (
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      dir="ltr"
      maxLength={13}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
      className="tabular-nums"
      data-testid={id}
      {...aria}
    />
  )
}
