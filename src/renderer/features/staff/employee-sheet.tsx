// Employee card (G-80, G-25, G-87): contact, start date and tenure, the linked user account, this month's salary
// row and money records (only for roles with `staff.salary`; a record is cancelled with a reason, never deleted),
// the salary history, leave balance and the next 14 days. Actions follow the permissions (G-23).
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BanknoteIcon,
  CalendarPlusIcon,
  HandCoinsIcon,
  KeyRoundIcon,
  PencilIcon,
  PhoneIcon,
  DiffIcon,
  SlidersHorizontalIcon,
  TrendingUpIcon,
  UserCheckIcon,
  UserMinusIcon,
  XIcon
} from 'lucide-react'
import { localDateOf, type LocalDate } from '@shared/date'
import type { ProcedureOutput } from '@shared/contract'
import type { EmployeeViewDto, StaffPanelRowDto, StaffTxnRowDto } from '@shared/contract/procedures/staff'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { CopyButton } from '@/components/copy-button'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { useRoleName } from '@/features/settings/use-admin'
import { kindOn, windowDays, type LeaveIndex } from './derive'
import { DeactivateDialog, EmployeeDialog, RehireDialog, RulesDialog, SalaryDialog } from './employee-dialogs'
import { KIND_ICON, KIND_ICON_TONE, KIND_STYLE } from './kinds'
import { LeaveDialog } from './leave-dialog'
import { AdjustDialog, AdvanceDialog, PayDialog, VoidDialog } from './staff-dialogs'
import { monthOf, useStaffMutation } from './use-staff'
import { useMonthLabel, useTenureText } from './use-staff-format'

type Policy = ProcedureOutput<'staff.getPolicy'>['values']
const MONEY_KEYS = ['monthly', 'advances', 'leavePayout', 'net', 'paid', 'remaining'] as const

type Dialog =
  | 'advance'
  | 'pay'
  | 'adjust'
  | 'leave'
  | 'edit'
  | 'salary'
  | 'rules'
  | 'deactivate'
  | 'rehire'
  | { void: StaffTxnRowDto }
  | null

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="grid gap-2" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function MonthMoney({ employee, today }: { employee: EmployeeViewDto; today: LocalDate }) {
  const { t } = useTranslation()
  const f = useFormat()
  const month = monthOf(today)
  const row = useApiQuery('staff.salaryPeriod', { employeeId: employee.id, ...month })
  if (row.isPending) return <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
  if (!row.data) return <p className="text-muted-foreground text-sm">{t('staff.card.noSalary')}</p>
  const r = row.data
  return (
    <dl className="grid grid-cols-3 gap-2 text-sm" data-testid="sheet-month">
      {MONEY_KEYS.map((key) => (
        <div
          key={key}
          className={cn('rounded-lg border p-2.5', key === 'remaining' && 'border-primary/40 bg-accent/60')}
        >
          <dt className="text-muted-foreground text-xs">{t(`staff.col.${key}`)}</dt>
          <dd className="font-semibold tabular-nums">
            <bdi>{f.money(key === 'monthly' ? (r.salaryDue ?? r.monthly) : r[key], r.currency)}</bdi>
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Transactions({
  employee,
  today,
  onVoid
}: {
  employee: EmployeeViewDto
  today: LocalDate
  onVoid?: (row: StaffTxnRowDto) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const month = monthOf(today)
  const rows = useApiQuery('staff.listTransactions', { employeeId: employee.id, ...month })
  const list = rows.data ?? []
  if (!list.length) return <p className="text-muted-foreground text-sm">{t('staff.txn.empty')}</p>
  return (
    <ul className="grid gap-1.5" data-testid="sheet-transactions">
      {list.map((r) => (
        <li
          key={r.id}
          className={cn(
            'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
            r.voidedAt && 'opacity-70'
          )}
        >
          <span className="grid min-w-0 flex-1">
            <span className={cn('font-medium', r.voidedAt && 'line-through')}>
              {t(`staff.txn.${r.kind}`)}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {f.date(r.date, 'medium')}
              {r.voidedAt
                ? ` · ${t('staff.txn.voided', { reason: r.voidReason ?? '' })}`
                : r.note
                  ? ` · ${r.note}`
                  : ''}
            </span>
          </span>
          <bdi className={cn('font-semibold tabular-nums', r.voidedAt && 'line-through')}>
            {r.kind === 'deduction' || r.kind === 'advance' ? '−' : ''}
            {f.money(r.amountMinor, r.currency)}
          </bdi>
          {onVoid && !r.voidedAt ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('staff.txn.void', { kind: t(`staff.txn.${r.kind}`) })}
              onClick={() => onVoid(r)}
            >
              <XIcon aria-hidden />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function SalaryHistory({ employee }: { employee: EmployeeViewDto }) {
  const { t } = useTranslation()
  const f = useFormat()
  const rows = useApiQuery('staff.salaryHistory', { employeeId: employee.id })
  const list = [...(rows.data ?? [])].reverse()
  if (!list.length) return <p className="text-muted-foreground text-sm">{t('staff.card.noSalary')}</p>
  return (
    <ol className="grid gap-1 text-sm" data-testid="salary-history">
      {list.map((s) => (
        <li key={s.id} className="flex justify-between gap-2">
          <span className="text-muted-foreground">
            {t('staff.salaryHistory.from', { date: f.date(s.validFrom, 'medium') })}
          </span>
          <bdi className="font-medium tabular-nums">{f.money(s.monthlyMinor, s.currency)}</bdi>
        </li>
      ))}
    </ol>
  )
}

export function EmployeeSheet({
  employee,
  employees,
  panel,
  leave,
  policy,
  today,
  onOpenChange
}: {
  employee: EmployeeViewDto | null
  employees: readonly EmployeeViewDto[]
  panel: readonly StaffPanelRowDto[]
  leave: LeaveIndex
  policy: Policy | undefined
  today: LocalDate
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const isMobile = useIsMobile()
  const tenureText = useTenureText()
  const monthLabel = useMonthLabel()
  const roleName = useRoleName()
  const [dialog, setDialog] = useState<Dialog>(null)
  const e = employee
  const month = monthOf(today)
  const canSalary = can('staff.salary')
  const canMoney = can('staff.salary', 'edit')
  const row = useApiQuery(
    'staff.salaryPeriod',
    { employeeId: e?.id ?? '', ...month },
    { enabled: Boolean(e && canSalary) }
  )
  const balance = panel.find((p) => p.employeeId === e?.id)
  const voidTxn = useStaffMutation('staff.voidTransaction', { success: t('staff.txn.voidedToast') })
  const reactivate = useStaffMutation('staff.updateEmployee', { success: t('staff.employee.saved') })
  const close = (o: boolean): void => {
    if (!o) setDialog(null)
  }
  const openRow = row.data && !row.data.locked ? row.data : null
  return (
    <Sheet open={!!e} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'gap-0 overflow-y-auto',
          isMobile ? 'max-h-[92dvh] rounded-t-xl' : 'w-full sm:max-w-lg'
        )}
        data-testid="employee-sheet"
      >
        {e ? (
          <>
            <SheetHeader className="gap-2 border-b text-start">
              <div className="flex flex-wrap items-center gap-2 pe-8">
                <SheetTitle className="text-lg">{e.fullName}</SheetTitle>
                {e.position ? <Badge variant="secondary">{e.position}</Badge> : null}
                {!e.active ? <Badge variant="outline">{t('staff.card.inactive')}</Badge> : null}
              </div>
              <SheetDescription>
                {t('staff.card.since', {
                  date: f.date(e.startDate, 'medium'),
                  tenure: tenureText(e.startDate, today)
                })}
                {e.endDate ? ` · ${t('staff.card.until', { date: f.date(e.endDate, 'medium') })}` : null}
              </SheetDescription>
              {e.phone ? (
                <p className="flex items-center gap-1 text-sm">
                  <PhoneIcon className="text-muted-foreground size-4" aria-hidden />
                  <span dir="ltr" className="tabular-nums">
                    {e.phone}
                  </span>
                  <CopyButton
                    text={e.phone}
                    size="icon-sm"
                    variant="ghost"
                    label={t('staff.card.copyPhone')}
                  />
                </p>
              ) : null}
            </SheetHeader>

            <div className="grid gap-5 p-4">
              <div className="flex flex-wrap gap-2">
                {canMoney && openRow ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setDialog('advance')}>
                      <HandCoinsIcon aria-hidden />
                      {t('staff.actions.advance')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDialog('pay')}>
                      <BanknoteIcon aria-hidden />
                      {t('staff.actions.pay')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDialog('adjust')}>
                      <DiffIcon aria-hidden />
                      {t('staff.actions.adjust')}
                    </Button>
                  </>
                ) : null}
                {can('staff.leave', 'edit') && e.active ? (
                  <Button size="sm" variant="outline" onClick={() => setDialog('leave')}>
                    <CalendarPlusIcon aria-hidden />
                    {t('staff.leave.record')}
                  </Button>
                ) : null}
                {can('staff', 'edit') ? (
                  <Button size="sm" variant="outline" onClick={() => setDialog('edit')}>
                    <PencilIcon aria-hidden />
                    {t('staff.card.edit')}
                  </Button>
                ) : null}
                {canMoney ? (
                  <Button size="sm" variant="outline" onClick={() => setDialog('salary')}>
                    <TrendingUpIcon aria-hidden />
                    {t('staff.actions.newSalary')}
                  </Button>
                ) : null}
                {can('staff.policy', 'edit') ? (
                  <Button size="sm" variant="outline" onClick={() => setDialog('rules')}>
                    <SlidersHorizontalIcon aria-hidden />
                    {t('staff.actions.rules')}
                  </Button>
                ) : null}
              </div>

              <Section title={t('staff.card.account')}>
                {e.account ? (
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <KeyRoundIcon className="text-muted-foreground size-4" aria-hidden />
                    <span className="font-medium">{e.account.displayName}</span>
                    <Badge variant="outline">
                      {roleName(
                        { displayName: e.account.roleNameI18n, name: e.account.roleName },
                        e.account.roleCode
                      )}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {e.account.lastLoginAt
                        ? t('staff.card.lastSeen', {
                            time: `${f.dayMonth(localDateOf(new Date(e.account.lastLoginAt)))} ${f.time(e.account.lastLoginAt)}`
                          })
                        : t('staff.card.neverSeen')}
                    </span>
                  </p>
                ) : (
                  <p className="text-muted-foreground text-sm">{t('staff.card.noAccount')}</p>
                )}
              </Section>

              {canSalary ? (
                <>
                  <Section title={t('staff.card.thisMonth', { month: monthLabel(month) })}>
                    <MonthMoney employee={e} today={today} />
                  </Section>
                  <Section title={t('staff.txn.title')}>
                    <Transactions
                      employee={e}
                      today={today}
                      onVoid={canMoney && openRow ? (r) => setDialog({ void: r }) : undefined}
                    />
                  </Section>
                  <Section title={t('staff.salaryHistory.title')}>
                    <SalaryHistory employee={e} />
                  </Section>
                </>
              ) : null}

              {balance ? (
                <Section title={t('staff.leave.title')}>
                  <div className="grid gap-1.5">
                    <p className="flex justify-between gap-2 text-sm">
                      <span>
                        {t('staff.leave.usedOf', {
                          used: balance.leaveUsed,
                          entitled: balance.leaveEntitled
                        })}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {t('staff.leave.left', { count: balance.leaveLeft })}
                      </span>
                    </p>
                    <Progress
                      value={
                        balance.leaveEntitled
                          ? Math.min(100, Math.round((balance.leaveUsed / balance.leaveEntitled) * 100))
                          : 0
                      }
                      aria-label={t('staff.leave.usedOf', {
                        used: balance.leaveUsed,
                        entitled: balance.leaveEntitled
                      })}
                    />
                  </div>
                </Section>
              ) : null}

              {can('staff.leave') ? (
                <Section title={t('staff.schedule.title')}>
                  <ol className="grid grid-cols-7 gap-1">
                    {windowDays(today).map((day) => {
                      const kind = kindOn(leave, e.id, day)
                      const Icon = KIND_ICON[kind]
                      const dayTitle = t('staff.schedule.dayTitle', {
                        date: f.date(day, 'medium'),
                        kind: t(`staff.day.${kind}`)
                      })
                      return (
                        <li
                          key={day}
                          className={cn(
                            'grid place-items-center gap-0.5 rounded-md border py-1 text-xs',
                            KIND_STYLE[kind]
                          )}
                          title={dayTitle}
                        >
                          <span className="text-[0.625rem] leading-none">
                            {f.weekday(day)} {Number(day.slice(8))}
                          </span>
                          <Icon className={cn('size-3.5', KIND_ICON_TONE[kind])} aria-hidden />
                          <span className="sr-only">{dayTitle}</span>
                        </li>
                      )
                    })}
                  </ol>
                </Section>
              ) : null}

              {can('staff', 'edit') ? (
                <>
                  <Separator />
                  {e.active ? (
                    <>
                      <Button
                        variant="ghost"
                        className="text-destructive justify-self-start"
                        onClick={() => setDialog('deactivate')}
                      >
                        <UserMinusIcon aria-hidden />
                        {t('staff.card.deactivate')}
                      </Button>
                      <p className="text-muted-foreground -mt-4 text-xs">{t('staff.card.deactivateHint')}</p>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      className="justify-self-start"
                      disabled={reactivate.isPending}
                      data-testid="employee-rehire"
                      onClick={() =>
                        // Left on a day: a new employment period from a new start (B6); only switched off: on again.
                        e.endDate
                          ? setDialog('rehire')
                          : reactivate.mutate({ id: e.id, patch: { active: true } })
                      }
                    >
                      <UserCheckIcon aria-hidden />
                      {t('staff.card.reactivate')}
                    </Button>
                  )}
                </>
              ) : null}
            </div>

            {dialog === 'advance' && openRow ? (
              <AdvanceDialog
                open
                onOpenChange={close}
                rows={[openRow]}
                employeeId={e.id}
                month={month}
                today={today}
              />
            ) : null}
            {dialog === 'pay' && openRow ? (
              <PayDialog
                open
                onOpenChange={close}
                rows={[openRow]}
                employeeId={e.id}
                month={month}
                today={today}
              />
            ) : null}
            {dialog === 'adjust' && openRow ? (
              <AdjustDialog open onOpenChange={close} row={openRow} month={month} today={today} />
            ) : null}
            {dialog === 'leave' ? (
              <LeaveDialog
                open
                onOpenChange={close}
                employees={employees}
                employeeId={e.id}
                date={null}
                today={today}
                panel={panel}
                policy={policy}
              />
            ) : null}
            {dialog === 'edit' ? (
              <EmployeeDialog open onOpenChange={close} employee={e} today={today} />
            ) : null}
            {dialog === 'salary' ? (
              <SalaryDialog open onOpenChange={close} employee={e} today={today} />
            ) : null}
            {dialog === 'rules' ? <RulesDialog open onOpenChange={close} employee={e} /> : null}
            {dialog === 'rehire' ? (
              <RehireDialog open onOpenChange={close} employee={e} today={today} />
            ) : null}
            {dialog === 'deactivate' ? (
              <DeactivateDialog open onOpenChange={close} employee={e} today={today} />
            ) : null}
            {dialog && typeof dialog === 'object' ? (
              <VoidDialog
                open
                onOpenChange={close}
                title={t('staff.txn.voidTitle', { kind: t(`staff.txn.${dialog.void.kind}`) })}
                body={dialog.void.expenseId ? t('staff.txn.voidBodyLedger') : t('staff.txn.voidBody')}
                confirm={t('staff.txn.voidConfirm')}
                pending={voidTxn.isPending}
                onConfirm={(reason) =>
                  voidTxn.mutate({ id: dialog.void.id, reason }, { onSuccess: () => setDialog(null) })
                }
              />
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
