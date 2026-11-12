// Maintenance forms (G-91, K-34): mark a reminder or a room's deep clean done (the day it was done + a note; the
// next due follows the shared recurrence rule), and add, change or switch on a reminder (every N days / months /
// years, first due, warn N days before, who is responsible). Reminders are task templates; their tasks drop into
// Görevler (G-94).
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { InfoIcon } from 'lucide-react'
import { today as todayOf, type LocalDate } from '@shared/date'
import { datePart, type LocalDateTime } from '@shared/domain/local-datetime'
import { intervalEverySchema } from '@shared/domain/task-recurrence'
import { fieldLimits } from '@shared/contract/limits'
import { taskTemplateInputSchema } from '@shared/contract/operations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DateInput } from '@/components/date-input'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation } from '@/lib/api/hooks'
import { numberInLimits, useRangeText } from '@/lib/form-errors'
import { FieldError } from '@/components/field-error'
import {
  nameOf,
  TASK_QUERIES,
  templateTitle,
  useErrorText,
  type TaskLookups,
  type TemplateDetail
} from '../tasks/task-data'
import { nextDueIfDone, ruleOf, type ReminderRow } from './derive'

export type DoneTarget =
  | { kind: 'reminder'; row: ReminderRow }
  | {
      kind: 'room'
      templateId: string
      roomId: string
      roomNumber: string
      n: number
      /** The hotel's own every-N-stays task; null = the seeded deep clean. */
      title: string | null
    }

export function DoneDialog({ target, onClose }: { target: DoneTarget; onClose: () => void }) {
  const { t } = useTranslation()
  const f = useFormat()
  const formId = useId()
  const errorText = useErrorText()
  const today = todayOf()
  const [day, setDay] = useState<LocalDate>(today)
  const [note, setNote] = useState('')
  const complete = useApiMutation('tasks.completeTemplate', { invalidates: TASK_QUERIES })
  const save = (): void => {
    if (complete.isPending) return
    complete.mutate(
      {
        id: target.kind === 'reminder' ? target.row.template.id : target.templateId,
        roomId: target.kind === 'room' ? target.roomId : null,
        doneOn: day,
        note: note.trim() || null
      },
      {
        onSuccess: () => {
          toast.success(t('maintenance.done.saved'))
          onClose()
        },
        onError: (error) => void toast.error(errorText(error))
      }
    )
  }
  const title =
    target.kind === 'reminder'
      ? templateTitle(f, target.row.template)
      : target.title
        ? t('maintenance.stayCount.roomTitle', { room: target.roomNumber, title: target.title })
        : t('maintenance.deepClean.roomTitle', { room: target.roomNumber })
  const next = target.kind === 'reminder' ? nextDueIfDone(target.row, day) : null
  // Not due yet and nothing waiting in Görevler: ask whether it was really done early (a second click by mistake).
  const early =
    target.kind === 'reminder' &&
    target.row.template.openTaskId === null &&
    target.row.daysLeft !== null &&
    target.row.daysLeft > 0 &&
    target.row.template.nextDueAt
      ? (target.row.template.nextDueAt.slice(0, 10) as LocalDate)
      : null
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t('maintenance.done.title')}
      description={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={complete.isPending}
            data-testid="maintenance-done-save"
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {early ? (
          <p
            className="border-warning bg-warning/10 flex items-start gap-2 rounded-lg border p-3 text-sm"
            data-testid="maintenance-done-early"
          >
            <InfoIcon className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
            {t('maintenance.done.early', { date: f.date(early, 'full') })}
          </p>
        ) : null}
        <DateInput label={t('maintenance.done.day')} value={day} onChange={setDay} max={today} />
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-note`}>{t('common.note')}</Label>
          <Textarea
            id={`${formId}-note`}
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('maintenance.done.notePlaceholder')}
          />
        </div>
        {target.kind === 'room' || next ? (
          <p className="bg-muted/50 flex items-start gap-2 rounded-lg p-3 text-sm" aria-live="polite">
            <InfoIcon className="text-info mt-0.5 size-4 shrink-0" aria-hidden />
            {target.kind === 'room'
              ? t('maintenance.done.resetCounter', { count: target.n })
              : t('maintenance.done.next', { date: f.date(next as LocalDate, 'full') })}
          </p>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}

const UNITS = ['days', 'months', 'years'] as const
type Unit = (typeof UNITS)[number]
const NOBODY = 'none'
const MINUTES_PER_DAY = 24 * 60
/** Bounds the service accepts (contract): every 1–999 days / months / years; warn 0–365 days before. */
const EVERY = fieldLimits(intervalEverySchema)
const REMIND_MINUTES = fieldLimits(taskTemplateInputSchema.shape.remindMinutesBefore)
const TEXT = {
  title: fieldLimits(taskTemplateInputSchema.shape.title).maxLength,
  note: fieldLimits(taskTemplateInputSchema.shape.description).maxLength
}
const REMIND = {
  min: 0,
  max: Math.floor((REMIND_MINUTES.max ?? 0) / MINUTES_PER_DAY),
  integer: true
} as const
const DEFAULT_TIME = '10:00'

/** new: an empty form; edit: an active reminder; activate: a seeded suggestion switched on with a first date. */
export type ReminderMode =
  | { kind: 'new' }
  | { kind: 'edit'; template: TemplateDetail }
  | { kind: 'activate'; template: TemplateDetail }

export function ReminderDialog({
  mode,
  lookups,
  onClose
}: {
  mode: ReminderMode
  lookups: TaskLookups
  onClose: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const formId = useId()
  const errorText = useErrorText()
  const today = todayOf()
  const template = mode.kind === 'new' ? null : mode.template
  const rule = template ? ruleOf(template) : null
  const interval = rule?.kind === 'interval' ? rule : null
  const shownTitle = template ? templateTitle(f, template) : ''
  const [title, setTitle] = useState(shownTitle)
  const [every, setEvery] = useState(String(interval?.every ?? 6))
  const [unit, setUnit] = useState<Unit>(interval?.unit ?? 'months')
  const [first, setFirst] = useState<LocalDate>(
    template?.firstDueAt ? datePart(template.firstDueAt as LocalDateTime) : today
  )
  const [remind, setRemind] = useState(
    String(template?.remindMinutesBefore ? Math.round(template.remindMinutesBefore / MINUTES_PER_DAY) : 3)
  )
  const [who, setWho] = useState(
    template?.assigneeUserId
      ? `user:${template.assigneeUserId}`
      : template?.assigneeRoleId
        ? `role:${template.assigneeRoleId}`
        : NOBODY
  )
  const [note, setNote] = useState(template?.description ?? '')
  const [tried, setTried] = useState(false)
  const add = useApiMutation('tasks.addTemplate', { invalidates: TASK_QUERIES })
  const edit = useApiMutation('tasks.editTemplate', { invalidates: TASK_QUERIES })
  const activate = useApiMutation('tasks.setTemplateActive', { invalidates: TASK_QUERIES })
  const pending = add.isPending || edit.isPending || activate.isPending
  const everyN = Number(every)
  const remindN = Number(remind)
  const titleMissing = !title.trim()
  const everyBad = !numberInLimits(every, EVERY)
  const remindBad = !numberInLimits(remind, REMIND)
  const rangeText = useRangeText()
  const showFirst = mode.kind !== 'edit'

  const save = (): void => {
    if (titleMissing || everyBad || remindBad) {
      setTried(true)
      return
    }
    if (pending) return
    const [kind, id] = who.split(':')
    const fields = {
      // A seeded title keeps its three languages unless it was changed.
      ...(title.trim() !== shownTitle ? { title: title.trim() } : {}),
      description: note.trim() || null,
      recurrence: { kind: 'interval' as const, unit, every: everyN, time: interval?.time ?? DEFAULT_TIME },
      remindMinutesBefore: remindN * MINUTES_PER_DAY,
      assigneeUserId: kind === 'user' ? (id ?? null) : null,
      assigneeRoleId: kind === 'role' ? (id ?? null) : null,
      ...(showFirst ? { firstDueAt: `${first}T${interval?.time ?? DEFAULT_TIME}` } : {})
    }
    const done = (): void => {
      toast.success(t('maintenance.add.saved'))
      onClose()
    }
    const failed = (error: unknown): void => void toast.error(errorText(error))
    if (mode.kind === 'new') {
      add.mutate(
        { ...fields, title: title.trim(), kind: 'maintenance' },
        { onSuccess: done, onError: failed }
      )
      return
    }
    edit.mutate(
      { id: mode.template.id, patch: fields },
      {
        onSuccess: () =>
          mode.kind === 'activate'
            ? activate.mutate({ id: mode.template.id, active: true }, { onSuccess: done, onError: failed })
            : done(),
        onError: failed
      }
    )
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t(mode.kind === 'edit' ? 'maintenance.add.editTitle' : 'maintenance.add.title')}
      description={t('maintenance.add.description')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={pending} data-testid="reminder-save">
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
          if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
            e.preventDefault()
            save()
          }
        }}
      >
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${formId}-title`}>{t('maintenance.add.name')}</Label>
          <Input
            id={`${formId}-title`}
            value={title}
            maxLength={TEXT.title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('maintenance.add.namePlaceholder')}
            aria-invalid={(tried && titleMissing) || undefined}
          />
          {tried && titleMissing ? (
            <p className="text-destructive text-xs">{t('maintenance.add.nameRequired')}</p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-every`}>{t('maintenance.add.every')}</Label>
          <div className="flex gap-2">
            <Input
              id={`${formId}-every`}
              type="number"
              inputMode="numeric"
              min={EVERY.min}
              max={EVERY.max}
              dir="ltr"
              value={every}
              onChange={(e) => setEvery(e.target.value)}
              className="w-20 text-end tabular-nums"
              aria-invalid={(tried && everyBad) || undefined}
            />
            <Select value={unit} onValueChange={(v) => setUnit(v as Unit)}>
              <SelectTrigger className="min-w-0 flex-1" aria-label={t('maintenance.add.unit')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {t(`maintenance.add.units.${u}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <FieldError message={tried && everyBad && rangeText(EVERY)} />
        </div>
        {showFirst ? (
          <div className="grid gap-1.5">
            <DateInput label={t('maintenance.add.first')} value={first} onChange={setFirst} />
            {first < today ? (
              <p className="text-muted-foreground text-xs">{t('maintenance.add.firstPast')}</p>
            ) : null}
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-remind`}>{t('maintenance.add.remind')}</Label>
          <Input
            id={`${formId}-remind`}
            type="number"
            inputMode="numeric"
            min={REMIND.min}
            max={REMIND.max}
            dir="ltr"
            value={remind}
            onChange={(e) => setRemind(e.target.value)}
            className="w-24 text-end tabular-nums"
            aria-invalid={(tried && remindBad) || undefined}
            aria-describedby={`${formId}-remind-hint`}
          />
          <FieldError message={tried && remindBad && rangeText(REMIND)} />
          <p id={`${formId}-remind-hint`} className="text-muted-foreground text-xs">
            {t('maintenance.add.remindHint')}
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-who`}>{t('maintenance.add.assignee')}</Label>
          <Select value={who} onValueChange={setWho}>
            <SelectTrigger id={`${formId}-who`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>{t('maintenance.add.noAssignee')}</SelectItem>
              <SelectGroup>
                <SelectLabel>{t('tasks.assignee.user')}</SelectLabel>
                {lookups.users
                  .filter((u) => u.active)
                  .map((u) => (
                    <SelectItem key={u.id} value={`user:${u.id}`}>
                      {u.name}
                    </SelectItem>
                  ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>{t('tasks.assignee.role')}</SelectLabel>
                {lookups.roles.map((r) => (
                  <SelectItem key={r.id} value={`role:${r.id}`}>
                    {nameOf(f, r.nameI18n ? null : r.name, r.nameI18n)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${formId}-note`}>{t('common.note')}</Label>
          <Textarea
            id={`${formId}-note`}
            rows={2}
            maxLength={TEXT.note}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </form>
    </ResponsiveDialog>
  )
}
