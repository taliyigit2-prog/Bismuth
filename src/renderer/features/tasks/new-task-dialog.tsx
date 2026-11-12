// New task (G-94, G-91): title, description, who (person / role / shift), optional room, due day and time,
// repeat (none, every day at a time, chosen weekdays, a day of the month, every N stays of a room — S-94). A task
// without repeat is written as one task; a repeating one becomes a template whose tasks the service writes
// (§6.17). Only task managers see the repeat choices (an own-tasks-only role adds one-off tasks).
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { XIcon } from 'lucide-react'
import { today as todayOf, type LocalDate } from '@shared/date'
import { isLocalTime } from '@shared/domain/local-datetime'
import {
  everyNStaysSchema,
  monthDaySchema,
  recurrenceRuleInputSchema,
  type RecurrenceRuleInput
} from '@shared/domain/task-recurrence'
import { fieldLimits } from '@shared/contract/limits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DateInput } from '@/components/date-input'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { RoomPicker } from '@/components/room-picker'
import { TimeInput } from '@/components/time-input'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation } from '@/lib/api/hooks'
import { useRangeText } from '@/lib/form-errors'
import { FieldError } from '@/components/field-error'
import { floorNumber } from '@/features/rooms/room-model'
import { nameOf, shiftName, TASK_QUERIES, useErrorText, type TaskLookups } from './task-data'
import { WeekdayPicker } from './weekday-picker'

const ASSIGNEE_KINDS = ['none', 'user', 'role', 'shift'] as const
type AssigneeKind = (typeof ASSIGNEE_KINDS)[number]
const REPEATS = ['none', 'daily', 'weekly', 'monthly', 'everyNStays'] as const
type Repeat = (typeof REPEATS)[number]
/** Bounds the service accepts (contract): "Her N konaklamada" 1–500, day of the month 1–31. */
const EVERY_N = fieldLimits(everyNStaysSchema)
const MONTH_DAY = fieldLimits(monthDaySchema)

export function NewTaskDialog({
  lookups,
  everyN,
  onOpenChange
}: {
  lookups: TaskLookups
  everyN: number
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const formId = useId()
  const errorText = useErrorText()
  const rangeText = useRangeText()
  const today = todayOf()
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [kind, setKind] = useState<AssigneeKind>('none')
  const [who, setWho] = useState<string>('')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [due, setDue] = useState<LocalDate>(today)
  const [time, setTime] = useState('12:00')
  const [repeat, setRepeat] = useState<Repeat>('none')
  const [days, setDays] = useState<number[]>([])
  const [monthDay, setMonthDay] = useState(String(Number(today.slice(8))))
  const [n, setN] = useState(String(everyN))
  const [tried, setTried] = useState(false)
  const createTask = useApiMutation('tasks.create', { invalidates: TASK_QUERIES })
  const addTemplate = useApiMutation('tasks.addTemplate', { invalidates: TASK_QUERIES })
  const pending = createTask.isPending || addTemplate.isPending

  const rule: RecurrenceRuleInput =
    repeat === 'daily'
      ? { kind: 'daily', time }
      : repeat === 'weekly'
        ? { kind: 'weekly', weekdays: days, time }
        : repeat === 'monthly'
          ? { kind: 'monthly', day: Number(monthDay), time }
          : repeat === 'everyNStays'
            ? { kind: 'everyNStays', n: Number(n) }
            : { kind: 'none' }
  const ruleOk = recurrenceRuleInputSchema.safeParse(rule).success
  const problems = {
    title: title.trim().length === 0,
    who: kind !== 'none' && !who,
    weekdays: repeat === 'weekly' && days.length === 0,
    monthDay: repeat === 'monthly' && !ruleOk,
    everyN: repeat === 'everyNStays' && !ruleOk,
    time: repeat !== 'everyNStays' && !isLocalTime(time)
  }
  /** Problems shown once the user tried to save. */
  const shown = Object.fromEntries(
    Object.entries(problems).map(([key, bad]) => [key, tried && bad])
  ) as Record<keyof typeof problems, boolean>

  const save = (): void => {
    setTried(true)
    if (Object.values(problems).some(Boolean) || pending) return
    const assignee = {
      assigneeUserId: kind === 'user' ? who : null,
      assigneeRoleId: kind === 'role' ? who : null,
      assigneeShiftId: kind === 'shift' ? who : null
    }
    const common = {
      title: title.trim(),
      description: details.trim() || null,
      roomId,
      ...assignee
    }
    const done = (): void => {
      toast.success(t('tasks.form.saved'))
      onOpenChange(false)
    }
    const failed = (error: unknown): void => void toast.error(errorText(error))
    if (repeat === 'none') {
      createTask.mutate({ ...common, dueAt: `${due}T${time}` }, { onSuccess: done, onError: failed })
      return
    }
    addTemplate.mutate(
      {
        ...common,
        kind: 'general',
        recurrence: rule as never,
        // Every day: the first task on the start day at its time; weekdays / day of month: from the start day on.
        ...(repeat === 'everyNStays'
          ? {}
          : { firstDueAt: repeat === 'daily' ? `${due}T${time}` : `${due}T00:00` })
      },
      { onSuccess: done, onError: failed }
    )
  }

  const whoOptions: { value: string; label: string }[] =
    kind === 'user'
      ? lookups.users.filter((u) => u.active).map((u) => ({ value: u.id, label: u.name }))
      : kind === 'role'
        ? lookups.roles.map((r) => ({
            value: r.id,
            label: nameOf(f, r.nameI18n ? null : r.name, r.nameI18n)
          }))
        : kind === 'shift'
          ? lookups.shifts.map((s) => ({ value: s.id, label: shiftName(f, s) }))
          : []
  const repeats = lookups.canManage ? REPEATS : (['none'] as const)

  return (
    <ResponsiveDialog
      open
      onOpenChange={onOpenChange}
      title={t('tasks.form.title')}
      description={t('tasks.form.description')}
      className="sm:max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={pending} data-testid="task-save">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        onKeyDown={(e) => {
          // Enter in a one-line field saves; the Save button sits in the dialog footer, outside the form.
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
            e.preventDefault()
            save()
          }
        }}
      >
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${formId}-title`}>{t('tasks.form.titleLabel')}</Label>
          <Input
            id={`${formId}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('tasks.form.titlePlaceholder')}
            aria-invalid={shown.title}
            autoComplete="off"
            maxLength={160}
            autoFocus
          />
          {shown.title ? (
            <p role="alert" className="text-destructive text-xs">
              {t('tasks.form.titleRequired')}
            </p>
          ) : null}
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${formId}-details`}>{t('tasks.form.details')}</Label>
          <Textarea
            id={`${formId}-details`}
            rows={2}
            value={details}
            maxLength={2000}
            onChange={(e) => setDetails(e.target.value)}
          />
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label id={`${formId}-kind`}>{t('tasks.form.assignee')}</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={1}
            value={kind}
            onValueChange={(v) => {
              if (!v) return
              setKind(v as AssigneeKind)
              setWho('')
            }}
            aria-labelledby={`${formId}-kind`}
            className="grid w-full grid-cols-2 sm:flex"
          >
            {ASSIGNEE_KINDS.map((k) => (
              <ToggleGroupItem key={k} value={k} className="flex-1">
                {t(k === 'none' ? 'tasks.assignee.everyone' : `tasks.assignee.${k}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {kind === 'none' ? (
            <p className="text-muted-foreground text-xs" data-testid="task-everyone-hint">
              {t('tasks.form.everyoneHint')}
            </p>
          ) : null}
        </div>
        {kind !== 'none' ? (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`${formId}-who`}>{t(`tasks.form.who.${kind}`)}</Label>
            <Select value={who} onValueChange={setWho}>
              <SelectTrigger id={`${formId}-who`} className="w-full" aria-invalid={shown.who}>
                <SelectValue placeholder={t('tasks.form.choose')} />
              </SelectTrigger>
              <SelectContent>
                {whoOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {shown.who ? (
              <p role="alert" className="text-destructive text-xs">
                {t('tasks.form.whoRequired')}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-1.5 sm:col-span-2">
          <RoomPicker
            id={`${formId}-room`}
            label={t('tasks.form.roomOptional')}
            rooms={lookups.rooms.map((r) => ({
              id: r.id,
              number: r.number,
              floor: floorNumber(r.floor),
              typeLabel: nameOf(f, r.typeNameI18n ? null : r.typeName, r.typeNameI18n),
              beds: r.beds
            }))}
            value={roomId}
            onChange={setRoomId}
          />
          {roomId ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground justify-self-start"
              onClick={() => setRoomId(null)}
            >
              <XIcon aria-hidden />
              {t('tasks.form.clearRoom')}
            </Button>
          ) : null}
        </div>

        {repeats.length > 1 ? (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`${formId}-repeat`}>{t('tasks.form.repeat')}</Label>
            <Select value={repeat} onValueChange={(v) => setRepeat(v as Repeat)}>
              <SelectTrigger id={`${formId}-repeat`} className="w-full" data-testid="task-repeat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {repeats.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`tasks.form.repeatKind.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {repeat === 'weekly' ? (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label id={`${formId}-days`}>{t('tasks.form.weekdays')}</Label>
            <WeekdayPicker value={days} onChange={setDays} aria-labelledby={`${formId}-days`} />
            {shown.weekdays ? (
              <p role="alert" className="text-destructive text-xs">
                {t('tasks.form.weekdaysRequired')}
              </p>
            ) : null}
          </div>
        ) : null}

        {repeat === 'monthly' ? (
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-mday`}>{t('tasks.form.monthDay')}</Label>
            <Input
              id={`${formId}-mday`}
              type="number"
              inputMode="numeric"
              min={MONTH_DAY.min}
              max={MONTH_DAY.max}
              dir="ltr"
              value={monthDay}
              onChange={(e) => setMonthDay(e.target.value)}
              aria-invalid={shown.monthDay}
            />
            <FieldError message={shown.monthDay && rangeText(MONTH_DAY)} />
            <p className="text-muted-foreground text-xs">{t('tasks.form.monthDayHint')}</p>
          </div>
        ) : null}

        {repeat === 'everyNStays' ? (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`${formId}-n`}>{t('tasks.form.everyN')}</Label>
            <Input
              id={`${formId}-n`}
              type="number"
              inputMode="numeric"
              min={EVERY_N.min}
              max={EVERY_N.max}
              dir="ltr"
              value={n}
              onChange={(e) => setN(e.target.value)}
              aria-invalid={shown.everyN}
              className="sm:max-w-32"
            />
            <FieldError message={shown.everyN && rangeText(EVERY_N)} />
            <p className="text-muted-foreground text-xs">{t('tasks.form.everyNRoomHint', { n: everyN })}</p>
          </div>
        ) : (
          <>
            <DateInput
              label={t(repeat === 'none' ? 'tasks.form.due' : 'tasks.form.startsOn')}
              value={due}
              onChange={setDue}
              min={today}
            />
            <div className="grid gap-1.5">
              <Label htmlFor={`${formId}-time`}>{t('tasks.form.time')}</Label>
              <TimeInput
                id={`${formId}-time`}
                value={time}
                onChange={(v) => setTime(v)}
                aria-invalid={shown.time}
                aria-describedby={shown.time ? `${formId}-time-msg` : undefined}
              />
              <FieldError id={`${formId}-time-msg`} message={shown.time && t('timeInput.invalid')} />
            </div>
          </>
        )}
      </form>
    </ResponsiveDialog>
  )
}
