// Work time (G-84, S-39, K-38): employees enter their own start and end times (worked minutes follow; a shift over
// midnight counts on); overtime is entered only by Müdür/Sahip — from the day's suggestion (worked minus the
// standard day) or by hand — with the day's kind (normal / holiday). `MyHoursCard` is the employee's own entry and
// can also sit on another screen (Bugün).
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, PencilIcon, PlusIcon } from 'lucide-react'
import { addDays, type LocalDate } from '@shared/date'
import type { EmployeeViewDto, WorkRowDto } from '@shared/contract/procedures/staff'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DateInput } from '@/components/date-input'
import { QueryView } from '@/components/query-view'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { TimeInput } from '@/components/time-input'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery, useSettings } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { DialogFooter, FieldError, FormBody, NoteField } from './staff-dialogs'
import {
  firstDay,
  hoursToMinutes,
  lastDay,
  minutesToText,
  monthOf,
  shiftMonth,
  useStaffMutation,
  type YearMonth
} from './use-staff'
import { useHours, useMonthLabel } from './use-staff-format'

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
const WORK_KINDS = ['normal', 'holiday'] as const

/** A shift whose end is before its start ran past midnight. */
const crossesMidnight = (start: string, end: string): boolean =>
  CLOCK.test(start) && CLOCK.test(end) && end < start

function TimeField({
  id,
  label,
  value,
  onChange,
  invalid
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  invalid?: boolean
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <TimeInput
        id={id}
        className="tabular-nums"
        value={value}
        onChange={(v) => onChange(v)}
        aria-invalid={invalid || undefined}
        data-testid={id.replace(/^.*-/, 'work-')}
      />
    </div>
  )
}

/** One day's work record: the employee's own times, or Müdür/Sahip's overtime and kind. */
export function WorkDialog({
  open,
  onOpenChange,
  employee,
  record,
  date,
  today,
  own
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null = the caller's own card. */
  employee: EmployeeViewDto | null
  record: WorkRowDto | null
  date: LocalDate
  today: LocalDate
  /** Only start/end (the employee's own entry, S-39). */
  own: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const formId = useId()
  const [chosenDay, setDay] = useState<LocalDate>(record?.date ?? date)
  const [dayTouched, setDayTouched] = useState(false)
  const [start, setStart] = useState(record?.startTime ?? '')
  const [end, setEnd] = useState(record?.endTime ?? '')
  const [overtime, setOvertime] = useState(minutesToText(record?.overtimeMinutes ?? 0, f.locale))
  const [kind, setKind] = useState<(typeof WORK_KINDS)[number]>(
    record?.kind === 'holiday' ? 'holiday' : 'normal'
  )
  const [note, setNote] = useState(record?.note ?? '')
  const [tried, setTried] = useState(false)
  const save = useStaffMutation('staff.recordWork', { success: t('staff.work.saved') })
  // QA2a (K-46): an employee's own hours go on today and `staff.ownHoursBackDays` days back; the service checks it.
  const can = useCan()
  const settings = useSettings()
  const backDays = settings.data?.['staff.ownHoursBackDays'] ?? 7
  const limited = own && !can('staff.overtime', 'edit')
  const earliest = limited ? addDays(today, -backDays) : undefined
  // B28: a night shift entered the next morning belongs to the day it started: with no day picked, yesterday.
  const overnight = crossesMidnight(start, end)
  const day = !record && !dayTouched && overnight && chosenDay === today ? addDays(today, -1) : chosenDay
  const timesGiven = Boolean(start || end)
  const timesBad = timesGiven && !(CLOCK.test(start) && CLOCK.test(end))
  const overtimeMinutes = hoursToMinutes(overtime)
  const submit = (): void => {
    setTried(true)
    if (timesBad || (!own && overtimeMinutes === null) || (own && !timesGiven)) return
    if (earliest && day < earliest) return
    const times = timesGiven ? { startTime: start, endTime: end } : {}
    save.mutate(
      own
        ? { date: day, ...times }
        : {
            employeeId: employee?.id,
            date: day,
            ...times,
            overtimeMinutes: overtimeMinutes ?? 0,
            kind,
            note: note.trim() || null
          },
      { onSuccess: () => onOpenChange(false) }
    )
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={own ? t('staff.work.ownTitle') : t('staff.work.title', { name: employee?.fullName ?? '' })}
      description={own ? t('staff.work.ownDescription') : t('staff.work.description')}
      footer={<DialogFooter formId={formId} onCancel={() => onOpenChange(false)} pending={save.isPending} />}
    >
      <FormBody id={formId} onSubmit={submit} testId="work-form">
        <DateInput
          label={t('staff.form.date')}
          value={day}
          onChange={(d) => {
            setDay(d)
            setDayTouched(true)
          }}
          min={earliest}
          max={today}
        />
        {limited ? (
          <p
            className={cn(
              '-mt-2 text-xs',
              earliest && day < earliest ? 'text-destructive' : 'text-muted-foreground'
            )}
            data-testid="work-own-range"
          >
            {backDays ? t('staff.work.ownRange', { count: backDays }) : t('staff.work.ownToday')}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-4">
          <TimeField
            id={`${formId}-start`}
            label={t('staff.work.start')}
            value={start}
            onChange={setStart}
            invalid={tried && timesBad}
          />
          <TimeField
            id={`${formId}-end`}
            label={t('staff.work.end')}
            value={end}
            onChange={setEnd}
            invalid={tried && timesBad}
          />
        </div>
        {tried && (timesBad || (own && !timesGiven)) ? (
          <FieldError>{t('staff.work.timesInvalid')}</FieldError>
        ) : overnight ? (
          <p className="text-muted-foreground -mt-2 text-xs" data-testid="work-overnight-day">
            {t('staff.work.overnightDay', { date: f.date(day, 'long') })}
          </p>
        ) : (
          <p className="text-muted-foreground -mt-2 text-xs">{t('staff.work.overnight')}</p>
        )}
        {own ? null : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`${formId}-overtime`}>{t('staff.work.overtimeHours')}</Label>
                <Input
                  id={`${formId}-overtime`}
                  inputMode="decimal"
                  dir="ltr"
                  className="tabular-nums"
                  value={overtime}
                  onChange={(e) => setOvertime(e.target.value)}
                  aria-invalid={(tried && overtimeMinutes === null) || undefined}
                  data-testid="work-overtime"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${formId}-kind`}>{t('staff.work.kind')}</Label>
                <Select value={kind} onValueChange={(v) => setKind(v as (typeof WORK_KINDS)[number])}>
                  <SelectTrigger id={`${formId}-kind`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WORK_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {t(`staff.work.kinds.${k}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {tried && overtimeMinutes === null ? (
              <FieldError>{t('staff.work.hoursInvalid')}</FieldError>
            ) : (
              <p className="text-muted-foreground -mt-2 text-xs">{t('staff.work.overtimeHint')}</p>
            )}
            <NoteField id={`${formId}-note`} value={note} onChange={setNote} />
          </>
        )}
      </FormBody>
    </ResponsiveDialog>
  )
}

function WorkRows({
  rows,
  onEdit,
  onApprove,
  manager
}: {
  rows: readonly WorkRowDto[]
  onEdit?: (row: WorkRowDto) => void
  onApprove?: (row: WorkRowDto) => void
  manager: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const hours = useHours()
  const isMobile = useIsMobile()
  const pending = (r: WorkRowDto): boolean => (r.suggestedOvertimeMinutes ?? 0) > r.overtimeMinutes
  if (!rows.length)
    return <p className="text-muted-foreground py-4 text-center text-sm">{t('staff.work.empty')}</p>
  if (isMobile)
    return (
      <ul className="grid gap-2" data-testid="work-rows">
        {rows.map((r) => (
          <li key={r.id} className="grid gap-1 rounded-lg border p-3 text-sm">
            <p className="flex items-center justify-between gap-2">
              <span className="font-medium">{f.date(r.date, 'medium')}</span>
              {r.kind === 'holiday' ? <Badge variant="outline">{t('staff.work.kinds.holiday')}</Badge> : null}
            </p>
            <p className="text-muted-foreground text-xs tabular-nums" dir="ltr">
              {r.startTime && r.endTime ? `${r.startTime}–${r.endTime}` : '—'}
            </p>
            <p className="text-xs">
              {t('staff.work.workedLine', {
                worked: hours(r.minutesWorked),
                overtime: hours(r.overtimeMinutes)
              })}
            </p>
            {manager && (onApprove || onEdit) ? (
              <div className="flex gap-2 pt-1">
                {onApprove && pending(r) ? (
                  <Button variant="outline" className="flex-1" onClick={() => onApprove(r)}>
                    <CheckIcon aria-hidden />
                    {t('staff.work.approve', { hours: hours(r.suggestedOvertimeMinutes ?? 0) })}
                  </Button>
                ) : null}
                {onEdit ? (
                  <Button variant="ghost" className="flex-1" onClick={() => onEdit(r)}>
                    <PencilIcon aria-hidden />
                    {t('common.edit')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    )
  return (
    <Table className="text-sm" density="compact" data-testid="work-rows">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="text-start">{t('staff.form.date')}</TableHead>
          <TableHead className="text-start">{t('staff.work.times')}</TableHead>
          <TableHead className="text-end">{t('staff.work.worked')}</TableHead>
          {manager ? <TableHead className="text-end">{t('staff.work.suggested')}</TableHead> : null}
          <TableHead className="text-end">{t('staff.col.overtime')}</TableHead>
          <TableHead className="text-start">{t('staff.work.kind')}</TableHead>
          {onEdit ? (
            <TableHead>
              <span className="sr-only">{t('staff.col.actions')}</span>
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id} data-testid={`work-row-${r.date}`}>
            <TableCell>{f.date(r.date, 'medium')}</TableCell>
            <TableCell className="tabular-nums">
              <span dir="ltr">{r.startTime && r.endTime ? `${r.startTime}–${r.endTime}` : '—'}</span>
            </TableCell>
            <TableCell className="text-end tabular-nums">{hours(r.minutesWorked)}</TableCell>
            {manager ? (
              <TableCell className={cn('text-end tabular-nums', pending(r) && 'text-warning font-medium')}>
                {hours(r.suggestedOvertimeMinutes ?? 0)}
              </TableCell>
            ) : null}
            <TableCell className="text-end font-medium tabular-nums">{hours(r.overtimeMinutes)}</TableCell>
            <TableCell>{t(`staff.work.kinds.${r.kind === 'holiday' ? 'holiday' : 'normal'}`)}</TableCell>
            {onEdit ? (
              <TableCell className="text-end">
                <span className="inline-flex gap-1">
                  {onApprove && pending(r) ? (
                    <Button variant="outline" size="sm" onClick={() => onApprove(r)}>
                      <CheckIcon aria-hidden />
                      {t('staff.work.approve', { hours: hours(r.suggestedOvertimeMinutes ?? 0) })}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('staff.work.editDay', { date: f.date(r.date, 'medium') })}
                    onClick={() => onEdit(r)}
                  >
                    <PencilIcon aria-hidden />
                  </Button>
                </span>
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function MonthNav({ month, onMonth }: { month: YearMonth; onMonth: (m: YearMonth) => void }) {
  const { t } = useTranslation()
  const label = useMonthLabel()
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        aria-label={t('staff.salary.prevMonth')}
        onClick={() => onMonth(shiftMonth(month, -1))}
      >
        <ChevronLeftIcon className="rtl:rotate-180" />
      </Button>
      <p className="min-w-32 text-center text-sm font-semibold" aria-live="polite">
        {label(month)}
      </p>
      <Button
        variant="outline"
        size="icon"
        aria-label={t('staff.salary.nextMonth')}
        onClick={() => onMonth(shiftMonth(month, 1))}
      >
        <ChevronRightIcon className="rtl:rotate-180" />
      </Button>
    </div>
  )
}

/** Müdür/Sahip view: one employee's month of work days, overtime suggestions to approve, days to correct. */
export function WorkTab({ employees, today }: { employees: readonly EmployeeViewDto[]; today: LocalDate }) {
  const { t } = useTranslation()
  const can = useCan()
  const [who, setWho] = useState(employees[0]?.id ?? '')
  const [month, setMonth] = useState<YearMonth>(() => monthOf(today))
  const [editing, setEditing] = useState<{ record: WorkRowDto | null } | null>(null)
  const employee = employees.find((e) => e.id === who) ?? null
  const query = useApiQuery(
    'staff.listWork',
    { employeeId: who, from: firstDay(month), to: lastDay(month) },
    { enabled: Boolean(who) }
  )
  const canEdit = can('staff.overtime', 'edit')
  const approve = useStaffMutation('staff.recordWork', { success: t('staff.work.approved') })
  return (
    <Card className="gap-3 py-4" data-testid="work-tab">
      <CardHeader className="flex flex-wrap items-end gap-3 px-4">
        <div className="grid min-w-48 flex-1 gap-1.5 max-sm:w-full">
          <Label htmlFor="work-employee">{t('staff.form.employee')}</Label>
          <Select value={who} onValueChange={setWho}>
            <SelectTrigger id="work-employee" className="w-full">
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
        <MonthNav month={month} onMonth={setMonth} />
        {canEdit && employee ? (
          <Button variant="outline" className="max-sm:w-full" onClick={() => setEditing({ record: null })}>
            <PlusIcon aria-hidden />
            {t('staff.work.addDay')}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-2 px-4">
        <p className="text-muted-foreground text-xs">{t('staff.work.managerHint')}</p>
        {who ? (
          <QueryView query={query}>
            {(rows) => (
              <WorkRows
                rows={rows}
                manager
                onEdit={canEdit ? (record) => setEditing({ record }) : undefined}
                onApprove={
                  canEdit
                    ? (r) =>
                        approve.mutate({
                          employeeId: r.employeeId,
                          date: r.date,
                          overtimeMinutes: r.suggestedOvertimeMinutes ?? 0
                        })
                    : undefined
                }
              />
            )}
          </QueryView>
        ) : null}
      </CardContent>
      {editing && employee ? (
        <WorkDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          employee={employee}
          record={editing.record}
          date={today}
          today={today}
          own={false}
        />
      ) : null}
    </Card>
  )
}

/** The employee's own hours (S-39): today's start and end, and this month's days. */
export function MyHoursCard({ today }: { today: LocalDate }) {
  const { t } = useTranslation()
  const hours = useHours()
  const month = monthOf(today)
  const me = useApiQuery('staff.myEmployee', {})
  const rows = useApiQuery(
    'staff.listWork',
    { from: firstDay(month), to: lastDay(month) },
    { enabled: Boolean(me.data) }
  )
  const [editing, setEditing] = useState<{ record: WorkRowDto | null } | null>(null)
  if (!me.data) return null
  const todayRow = rows.data?.find((r) => r.date === today) ?? null
  const total = (rows.data ?? []).reduce((s, r) => s + r.minutesWorked, 0)
  return (
    <Card className="gap-3 py-4" data-testid="my-hours">
      <CardHeader className="flex flex-wrap items-start gap-2 px-4">
        <div className="grid flex-1 gap-1">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ClockIcon className="size-4" aria-hidden />
            {t('staff.work.mine')}
          </CardTitle>
          <CardDescription>{t('staff.work.mineTotal', { hours: hours(total) })}</CardDescription>
        </div>
        <Button className="max-sm:w-full" onClick={() => setEditing({ record: todayRow })}>
          <ClockIcon aria-hidden />
          {todayRow ? t('staff.work.editToday') : t('staff.work.enterToday')}
        </Button>
      </CardHeader>
      <CardContent className="px-4">
        <WorkRows rows={rows.data ?? []} manager={false} />
      </CardContent>
      {editing ? (
        <WorkDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          employee={null}
          record={editing.record}
          date={today}
          today={today}
          own
        />
      ) : null}
    </Card>
  )
}
