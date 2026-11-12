// The fields of "Kendi göreviniz" (G-94): what to do, how often (every day, chosen weekdays, a day of the month,
// every few months, every year) and at what time. The wizard's step 8 shows them inline with an Add button,
// Ayarlar → Görev önerileri in a dialog; both turn the answers into a rule with own-task.ts.
import type { KeyboardEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { OWN_TASK_TITLE_MAX } from '@shared/contract/operations'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TimeInput } from '@/components/time-input'
import { cn } from '@/lib/utils'
import {
  LAST_DAY,
  MONTH_DAYS,
  OWN_TASK_REPEATS,
  ownTaskIds,
  type OwnTaskError,
  type OwnTaskErrors,
  type OwnTaskRepeat,
  type OwnTaskValues
} from './own-task'
import { WeekdayPicker } from './weekday-picker'

function Message({ id, error, hint }: { id: string; error?: OwnTaskError; hint?: string }) {
  const { t } = useTranslation()
  if (error)
    return (
      <p id={`${id}-error`} className="text-destructive text-sm" data-testid={`${id}-error`}>
        {t(error.key, error.values ?? {})}
      </p>
    )
  return hint ? (
    <p id={`${id}-hint`} className="text-muted-foreground text-xs">
      {hint}
    </p>
  ) : null
}

const describedBy = (id: string, error?: OwnTaskError, hint?: string) => ({
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined
})

function Field({
  id,
  label,
  error,
  hint,
  className,
  children
}: {
  id: string
  label: string
  error?: OwnTaskError
  hint?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('grid min-w-0 content-start gap-1.5', className)}>
      <Label htmlFor={id} className="leading-snug">
        {label}
      </Label>
      {children}
      <Message id={id} error={error} hint={hint} />
    </div>
  )
}

/**
 * The form's fields. `onEnter` runs on Enter in a typed field (the wizard adds the task; Enter must not move the
 * wizard on); without it Enter submits the surrounding form as usual.
 */
export function OwnTaskFields({
  idPrefix,
  value,
  errors,
  onChange,
  onEnter
}: {
  idPrefix: string
  value: OwnTaskValues
  errors: OwnTaskErrors
  onChange: (patch: Partial<OwnTaskValues>) => void
  onEnter?: () => void
}) {
  const { t } = useTranslation()
  const ids = ownTaskIds(idPrefix)
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (!onEnter || e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return
    e.preventDefault()
    onEnter()
  }
  return (
    // Phone: one field under the other. From `sm`: the title alone, then how often beside its detail (day of
    // the month, number of months) or the time, the weekdays on a line of their own.
    <div className="grid gap-4 sm:grid-cols-2" onKeyDown={onKeyDown}>
      <Field id={ids.title} label={t('tasks.own.title')} error={errors.title} className="sm:col-span-2">
        <Input
          id={ids.title}
          value={value.title}
          maxLength={OWN_TASK_TITLE_MAX}
          autoComplete="off"
          placeholder={t('tasks.own.titlePlaceholder')}
          onChange={(e) => onChange({ title: e.target.value })}
          data-testid={ids.title}
          {...describedBy(ids.title, errors.title)}
        />
      </Field>
      <Field id={ids.repeat} label={t('tasks.own.repeat')}>
        <Select
          value={value.repeat}
          onValueChange={(v) => {
            const repeat = OWN_TASK_REPEATS.find((r) => r === v)
            if (repeat) onChange({ repeat })
          }}
        >
          <SelectTrigger id={ids.repeat} className="w-full" data-testid={ids.repeat}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OWN_TASK_REPEATS.map((r: OwnTaskRepeat) => (
              <SelectItem key={r} value={r}>
                {t(`tasks.own.repeatKind.${r}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {value.repeat === 'monthly' ? (
        <Field id={ids.monthDay} label={t('tasks.own.monthDay')}>
          <Select value={value.monthDay} onValueChange={(monthDay) => onChange({ monthDay })}>
            <SelectTrigger id={ids.monthDay} className="w-full" data-testid={ids.monthDay}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_DAYS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
              <SelectItem value={LAST_DAY}>{t('tasks.own.lastDay')}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {value.repeat === 'months' ? (
        <Field
          id={ids.everyMonths}
          label={t('tasks.own.everyMonths')}
          error={errors.everyMonths}
          hint={t('tasks.own.everyMonthsHint')}
        >
          <Input
            id={ids.everyMonths}
            inputMode="numeric"
            autoComplete="off"
            dir="ltr"
            maxLength={2}
            value={value.everyMonths}
            onChange={(e) => onChange({ everyMonths: e.target.value.replace(/\D/g, '') })}
            className="tabular-nums"
            data-testid={ids.everyMonths}
            {...describedBy(ids.everyMonths, errors.everyMonths, t('tasks.own.everyMonthsHint'))}
          />
        </Field>
      ) : null}
      <Field id={ids.time} label={t('tasks.own.time')} error={errors.time}>
        <TimeInput
          id={ids.time}
          value={value.time}
          onChange={(v) => onChange({ time: v })}
          data-testid={ids.time}
          {...describedBy(ids.time, errors.time)}
        />
      </Field>
      {value.repeat === 'weekly' ? (
        <div className="grid min-w-0 gap-1.5 sm:col-span-2">
          <Label id={`${ids.weekdays}-label`} className="leading-snug">
            {t('tasks.own.weekdays')}
          </Label>
          <WeekdayPicker
            id={ids.weekdays}
            value={value.weekdays}
            onChange={(weekdays) => onChange({ weekdays })}
            itemTestId={(d) => `${ids.weekdays}-${d}`}
            aria-labelledby={`${ids.weekdays}-label`}
            {...describedBy(ids.weekdays, errors.weekdays)}
          />
          <Message id={ids.weekdays} error={errors.weekdays} />
        </div>
      ) : null}
    </div>
  )
}
