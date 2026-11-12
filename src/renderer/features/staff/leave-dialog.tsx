// Leave record (G-83): one or more consecutive days of one kind for one employee — rest day (counts against the
// monthly entitlement), annual, sick, unpaid, or "worked on a holiday". Written together or not at all; the month's
// used and left days follow by themselves.
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalDate } from '@shared/date'
import type { ProcedureOutput } from '@shared/contract'
import type { EmployeeViewDto, StaffPanelRowDto } from '@shared/contract/procedures/staff'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DateInput } from '@/components/date-input'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import type { LeaveKind } from './derive'
import { DialogFooter, EmployeeSelect, FieldError, FormBody, NoteField } from './staff-dialogs'
import { useStaffMutation } from './use-staff'

type Policy = ProcedureOutput<'staff.getPolicy'>['values']
const LEAVE_KINDS = [
  'rest_day',
  'annual',
  'sick',
  'unpaid',
  'holiday_worked'
] as const satisfies readonly LeaveKind[]

export function LeaveDialog({
  open,
  onOpenChange,
  employees,
  employeeId,
  date,
  today,
  panel,
  policy
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employees: readonly EmployeeViewDto[]
  employeeId: string | null
  date: LocalDate | null
  today: LocalDate
  /** This month's balances (the line under the form). */
  panel: readonly StaffPanelRowDto[]
  policy: Policy | undefined
}) {
  const { t } = useTranslation()
  const formId = useId()
  const [who, setWho] = useState(employeeId ?? '')
  const [kind, setKind] = useState<LeaveKind>('rest_day')
  const [day, setDay] = useState<LocalDate>(date ?? today)
  const [days, setDays] = useState('1')
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const save = useStaffMutation('staff.addLeaveDays', { success: t('staff.leave.saved') })
  const count = Number(days)
  const validDays = /^\d+$/.test(days.trim()) && count >= 1 && count <= 31
  const balance = panel.find((p) => p.employeeId === who)
  const sameMonth = day.slice(0, 7) === today.slice(0, 7)
  const submit = (): void => {
    setTried(true)
    if (!who || !validDays) return
    save.mutate(
      { employeeId: who, from: day, days: count, kind, note: note.trim() || null },
      { onSuccess: () => onOpenChange(false) }
    )
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('staff.leave.dialogTitle')}
      description={t('staff.leave.dialogDescription')}
      footer={<DialogFooter formId={formId} onCancel={() => onOpenChange(false)} pending={save.isPending} />}
    >
      <FormBody id={formId} onSubmit={submit} testId="leave-form">
        <EmployeeSelect id={`${formId}-employee`} employees={employees} value={who} onChange={setWho} />
        {tried && !who ? <FieldError>{t('staff.form.required')}</FieldError> : null}
        <div className="grid gap-1.5">
          <span id={`${formId}-kind`} className="text-sm font-medium">
            {t('staff.leave.kindLabel')}
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={1}
            value={kind}
            onValueChange={(v) => v && setKind(v as LeaveKind)}
            aria-labelledby={`${formId}-kind`}
            className="grid w-full grid-cols-2 sm:grid-cols-3"
          >
            {LEAVE_KINDS.map((key) => (
              <ToggleGroupItem
                key={key}
                value={key}
                className="h-auto min-h-9 w-full py-1.5 whitespace-normal"
              >
                {t(`staff.leaveKind.${key}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-muted-foreground text-xs">{t(`staff.leaveKindHint.${kind}`)}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <DateInput label={t('staff.leave.from')} value={day} onChange={setDay} />
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-days`}>{t('staff.leave.days')}</Label>
            <Input
              id={`${formId}-days`}
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              dir="ltr"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              aria-invalid={(tried && !validDays) || undefined}
              className="tabular-nums"
            />
          </div>
        </div>
        {tried && !validDays ? <FieldError>{t('staff.leave.daysInvalid')}</FieldError> : null}
        <NoteField id={`${formId}-note`} value={note} onChange={setNote} />
        {balance && kind === 'rest_day' && sameMonth ? (
          <p className="bg-muted/50 rounded-md px-3 py-2 text-xs" data-testid="leave-balance-line">
            {t('staff.leave.balanceLine', {
              used: balance.leaveUsed,
              entitled: balance.leaveEntitled,
              after: balance.leaveUsed + (validDays ? count : 0)
            })}
            {policy?.unusedLeavePaid && !policy.leaveCarryOver ? ` ${t('staff.leave.paidNote')}` : null}
          </p>
        ) : null}
      </FormBody>
    </ResponsiveDialog>
  )
}
