// Personel (G-80…G-88, G-25, G-69; Faz 8): employees with their linked account and today's status, the monthly
// salary table of the shared rule (locked months read-only), the "Personel durumu" panel (this month's advances,
// leave entitled / used / left), the 14-day leave schedule and work time with overtime. Everything is read from and
// written to the staff service; salary figures only for roles with `staff.salary` (Muhasebe and Sahip by default),
// overtime for Müdür/Sahip, own start/end times for anyone with a card (K-38).
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronRightIcon,
  CoffeeIcon,
  HandCoinsIcon,
  LockIcon,
  UserRoundPlusIcon,
  UsersIcon,
  WalletIcon
} from 'lucide-react'
import { addDays, type LocalDate } from '@shared/date'
import type { EmployeeViewDto, SalaryTableDto } from '@shared/contract/procedures/staff'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { KpiCard } from '@/components/kpi-card'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { EmptyState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { useRoleName } from '@/features/settings/use-admin'
import { kindOn, leaveIndex, leaveOn, OFF_KINDS, type LeaveIndex } from './derive'
import { EmployeeDialog } from './employee-dialogs'
import { EmployeeSheet } from './employee-sheet'
import { LeaveDialog } from './leave-dialog'
import { SalaryTable } from './salary-table'
import { DayChip, ScheduleGrid, StaffPanel } from './schedule'
import { AdvanceDialog, LockMonthDialog, PayDialog, UnlockMonthDialog, VoidDialog } from './staff-dialogs'
import { monthOf, sameMonth, shiftMonth, todayLocal, useStaffMutation, type YearMonth } from './use-staff'
import { useMonthLabel, useTenureText } from './use-staff-format'
import { MyHoursCard, WorkTab } from './work-time'

type DialogState =
  | { kind: 'advance'; employeeId: string | null }
  | { kind: 'pay'; employeeId: string | null }
  | { kind: 'leave'; employeeId: string | null; date: LocalDate | null }
  | { kind: 'voidLeave'; id: string; name: string; date: LocalDate }
  | { kind: 'lock' }
  | { kind: 'unlock' }
  | null

function EmployeesTab({
  employees,
  leave,
  today,
  onOpen
}: {
  employees: readonly EmployeeViewDto[]
  leave: LeaveIndex
  today: LocalDate
  onOpen: (id: string) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const isMobile = useIsMobile()
  const tenureText = useTenureText()
  const roleName = useRoleName()
  const showSalary = can('staff.salary')
  const showDay = can('staff.leave')
  if (isMobile)
    return (
      <ul className="grid gap-2" data-testid="employee-cards">
        {employees.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              data-testid={`employee-${e.id}`}
              onClick={() => onOpen(e.id)}
              className="bg-card focus-visible:ring-ring flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start outline-none focus-visible:ring-[3px]"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium break-words">{e.fullName}</span>
                <span className="text-muted-foreground block text-xs">
                  {[e.position, e.active ? null : t('staff.card.inactive')].filter(Boolean).join(' · ')}
                </span>
              </span>
              {showDay && e.active ? <DayChip kind={kindOn(leave, e.id, today)} /> : null}
              <ChevronRightIcon
                className="text-muted-foreground size-4 shrink-0 rtl:rotate-180"
                aria-hidden
              />
            </button>
          </li>
        ))}
      </ul>
    )
  return (
    <Card className="py-0">
      <Table data-testid="employee-table">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="ps-4 text-start">{t('staff.col.employee')}</TableHead>
            <TableHead className="text-start">{t('staff.col.phone')}</TableHead>
            <TableHead className="text-start">{t('staff.col.start')}</TableHead>
            <TableHead className="text-start">{t('staff.col.account')}</TableHead>
            {showDay ? <TableHead className="text-start">{t('staff.col.today')}</TableHead> : null}
            {showSalary ? <TableHead className="pe-4 text-end">{t('staff.col.monthly')}</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((e) => (
            <TableRow key={e.id} className="cursor-pointer" onClick={() => onOpen(e.id)}>
              <TableCell className="min-w-40 ps-4 whitespace-normal">
                <button
                  type="button"
                  data-testid={`employee-${e.id}`}
                  className="focus-visible:ring-ring rounded-sm text-start font-medium outline-none hover:underline focus-visible:ring-[3px]"
                  onClick={(ev) => {
                    ev.stopPropagation()
                    onOpen(e.id)
                  }}
                >
                  {e.fullName}
                </button>
                <span className="text-muted-foreground block text-xs">
                  {[e.position, e.active ? null : t('staff.card.inactive')].filter(Boolean).join(' · ')}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <span dir="ltr" className="tabular-nums">
                  {e.phone ?? '—'}
                </span>
              </TableCell>
              <TableCell>
                <span className="block">{f.date(e.startDate, 'medium')}</span>
                <span className="text-muted-foreground block text-xs">{tenureText(e.startDate, today)}</span>
              </TableCell>
              <TableCell>
                {e.account ? (
                  <Badge variant="outline">
                    {roleName(
                      { displayName: e.account.roleNameI18n, name: e.account.roleName },
                      e.account.roleCode
                    )}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">{t('staff.card.noAccountShort')}</span>
                )}
              </TableCell>
              {showDay ? (
                <TableCell>{e.active ? <DayChip kind={kindOn(leave, e.id, today)} /> : null}</TableCell>
              ) : null}
              {showSalary ? (
                <TableCell className="pe-4 text-end font-medium tabular-nums">
                  {e.currentSalary ? (
                    <bdi>{f.money(e.currentSalary.monthlyMinor, e.currentSalary.currency)}</bdi>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

/** The month that needs attention first: last month while someone is still owed, otherwise this month. */
function defaultMonth(current: YearMonth, previous: SalaryTableDto | undefined): YearMonth {
  return previous?.rows.some((r) => !r.locked && r.remaining > 0) ? shiftMonth(current, -1) : current
}

function StaffView({
  employees,
  today,
  newEmployee,
  onNewEmployee
}: {
  employees: readonly EmployeeViewDto[]
  today: LocalDate
  newEmployee: boolean
  onNewEmployee: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const monthLabel = useMonthLabel()
  const current = monthOf(today)
  const canSalary = can('staff.salary')
  const canLeaveView = can('staff.leave')
  const canLeave = can('staff.leave', 'edit')
  const canWork = can('staff.overtime')
  const [tab, setTab] = useState('employees')
  const [showInactive, setShowInactive] = useState(false)
  const [picked, setPicked] = useState<YearMonth | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)

  const panel = useApiQuery('staff.panel', current, { enabled: can('staff') })
  const policy = useApiQuery('staff.getPolicy', {}, { enabled: can('staff.policy') || canSalary })
  const leaveQuery = useApiQuery(
    'staff.leaveBetween',
    { from: today, to: addDays(today, 13) },
    { enabled: canLeaveView }
  )
  const previous = useApiQuery('staff.salaryTable', shiftMonth(current, -1), { enabled: canSalary })
  // The month opens once on the one needing attention, then stays where it is (also after locking it).
  if (picked === null && canSalary && (previous.data || previous.isError))
    setPicked(defaultMonth(current, previous.data))
  const month = picked ?? current
  const table = useApiQuery('staff.salaryTable', month, { enabled: canSalary })
  const voidLeave = useStaffMutation('staff.voidLeave', { success: t('staff.leave.voidedToast') })

  const leave = useMemo(() => leaveIndex(leaveQuery.data ?? []), [leaveQuery.data])
  const active = employees.filter((e) => e.active)
  const inactive = employees.length - active.length
  const listed = showInactive ? employees : active
  const off = canLeaveView ? active.filter((e) => OFF_KINDS.has(kindOn(leave, e.id, today))) : []
  const open = employees.find((e) => e.id === openId) ?? null
  const panelRows = panel.data ?? []
  const rows = table.data?.rows ?? []
  const openRows = rows.filter((r) => !r.locked)
  const missing = (table.data?.withoutSalary ?? []).map(
    (id) => employees.find((e) => e.id === id)?.fullName ?? '—'
  )
  const earliest = employees.reduce<LocalDate>((min, e) => (e.startDate < min ? e.startDate : min), today)
  const close = (o: boolean): void => {
    if (!o) setDialog(null)
  }
  const pick = (id: string, day: LocalDate): void => {
    const existing = leaveOn(leave, id, day)
    if (existing)
      setDialog({
        kind: 'voidLeave',
        id: existing.id,
        name: employees.find((e) => e.id === id)?.fullName ?? '',
        date: day
      })
    else setDialog({ kind: 'leave', employeeId: id, date: day })
  }
  const advancesSum = panelRows.reduce((s, r) => s + (r.advancesMinor ?? 0), 0)
  const currency = panelRows.find((r) => r.currency)?.currency ?? rows[0]?.currency

  return (
    <div className="grid gap-4">
      <div className={cn('grid grid-cols-2 gap-3', canSalary ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
        <KpiCard
          label={t('staff.kpi.employees')}
          value={f.number(active.length)}
          hint={
            canLeaveView ? t('staff.kpi.employeesHint', { count: active.length - off.length }) : undefined
          }
          icon={<UsersIcon className="size-3.5" aria-hidden />}
        />
        {canLeaveView ? (
          <KpiCard
            label={t('staff.kpi.off')}
            value={f.number(off.length)}
            hint={off.length ? off.map((e) => e.firstName).join(', ') : t('staff.kpi.offNone')}
            icon={<CoffeeIcon className="size-3.5" aria-hidden />}
          />
        ) : null}
        {canSalary ? (
          <>
            <KpiCard
              label={t('staff.kpi.advances')}
              value={f.money(advancesSum, currency)}
              hint={t('staff.kpi.advancesHint', { month: monthLabel(current) })}
              icon={<HandCoinsIcon className="size-3.5" aria-hidden />}
            />
            <KpiCard
              label={t('staff.kpi.remaining')}
              value={f.money(
                rows.reduce((s, r) => s + Math.max(0, r.remaining), 0),
                currency
              )}
              hint={t('staff.kpi.remainingHint', { month: monthLabel(month) })}
              icon={<WalletIcon className="size-3.5" aria-hidden />}
            />
          </>
        ) : (
          <KpiCard
            label={t('staff.kpi.leaveUsed')}
            value={`${panelRows.reduce((s, r) => s + r.leaveUsed, 0)}/${panelRows.reduce((s, r) => s + r.leaveEntitled, 0)}`}
            hint={t('staff.kpi.leaveUsedHint')}
            icon={<CoffeeIcon className="size-3.5" aria-hidden />}
          />
        )}
      </div>

      <MyHoursCard today={today} />

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList
          aria-label={t('nav.staff')}
          className="grid w-full grid-cols-2 group-data-[orientation=horizontal]/tabs:h-auto max-md:group-data-[orientation=horizontal]/tabs:h-auto sm:flex sm:w-fit"
        >
          <TabsTrigger value="employees" className="min-h-8 max-md:min-h-11">
            {t('staff.tabs.employees')}
          </TabsTrigger>
          {canSalary ? (
            <TabsTrigger value="salary" className="min-h-8 max-md:min-h-11">
              {t('staff.tabs.salary')}
            </TabsTrigger>
          ) : null}
          {canLeaveView ? (
            <TabsTrigger value="leave" className="min-h-8 max-md:min-h-11">
              {t('staff.tabs.leave')}
            </TabsTrigger>
          ) : null}
          {canWork ? (
            <TabsTrigger value="work" className="min-h-8 max-md:min-h-11">
              {t('staff.tabs.work')}
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="employees" className="grid gap-4">
          <EmployeesTab employees={listed} leave={leave} today={today} onOpen={setOpenId} />
          {inactive ? (
            <Button variant="ghost" className="justify-self-start" onClick={() => setShowInactive((v) => !v)}>
              {showInactive
                ? t('staff.list.hideInactive')
                : t('staff.list.showInactive', { count: inactive })}
            </Button>
          ) : null}
          {panelRows.length ? (
            <StaffPanel rows={panelRows} policy={policy.data?.values} monthLabel={monthLabel(current)} />
          ) : null}
        </TabsContent>
        {canSalary ? (
          <TabsContent value="salary">
            {table.isError ? (
              <QueryView query={table}>{() => null}</QueryView>
            ) : (
              <SalaryTable
                month={month}
                canPrev={
                  monthOf(earliest).year * 12 + monthOf(earliest).month < month.year * 12 + month.month
                }
                canNext={!sameMonth(month, current)}
                onMonth={(delta) => setPicked(shiftMonth(month, delta))}
                rows={rows}
                missing={missing}
                onOpen={setOpenId}
                onAdvance={(employeeId) => setDialog({ kind: 'advance', employeeId })}
                onPay={(employeeId) => setDialog({ kind: 'pay', employeeId })}
                onLock={() => setDialog({ kind: 'lock' })}
                onUnlock={() => setDialog({ kind: 'unlock' })}
              />
            )}
          </TabsContent>
        ) : null}
        {canLeaveView ? (
          <TabsContent value="leave" className="grid gap-4">
            <ScheduleGrid
              employees={active}
              leave={leave}
              today={today}
              onPick={canLeave ? pick : undefined}
              onRecord={
                canLeave ? () => setDialog({ kind: 'leave', employeeId: null, date: null }) : undefined
              }
            />
            <StaffPanel rows={panelRows} policy={policy.data?.values} monthLabel={monthLabel(current)} />
          </TabsContent>
        ) : null}
        {canWork ? (
          <TabsContent value="work">
            <WorkTab employees={active} today={today} />
          </TabsContent>
        ) : null}
      </Tabs>

      <EmployeeSheet
        employee={open}
        employees={active}
        panel={panelRows}
        leave={leave}
        policy={policy.data?.values}
        today={today}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
      {dialog?.kind === 'advance' ? (
        <AdvanceDialog
          open
          onOpenChange={close}
          rows={openRows}
          employeeId={dialog.employeeId}
          month={month}
          today={today}
        />
      ) : null}
      {dialog?.kind === 'pay' ? (
        <PayDialog
          open
          onOpenChange={close}
          rows={openRows}
          employeeId={dialog.employeeId}
          month={month}
          today={today}
        />
      ) : null}
      {dialog?.kind === 'leave' ? (
        <LeaveDialog
          open
          onOpenChange={close}
          employees={active}
          employeeId={dialog.employeeId}
          date={dialog.date}
          today={today}
          panel={panelRows}
          policy={policy.data?.values}
        />
      ) : null}
      {dialog?.kind === 'voidLeave' ? (
        <VoidDialog
          open
          onOpenChange={close}
          title={t('staff.leave.voidTitle')}
          body={t('staff.leave.voidBody', { name: dialog.name, date: f.date(dialog.date, 'medium') })}
          confirm={t('staff.leave.voidConfirm')}
          pending={voidLeave.isPending}
          onConfirm={(reason) =>
            voidLeave.mutate({ id: dialog.id, reason }, { onSuccess: () => setDialog(null) })
          }
        />
      ) : null}
      {newEmployee ? (
        <EmployeeDialog
          open
          onOpenChange={onNewEmployee}
          employee={null}
          today={today}
          onCreated={setOpenId}
        />
      ) : null}
      <LockMonthDialog
        month={dialog?.kind === 'lock' ? month : null}
        label={monthLabel(month)}
        onOpenChange={close}
      />
      <UnlockMonthDialog
        month={dialog?.kind === 'unlock' ? month : null}
        label={monthLabel(month)}
        onOpenChange={close}
      />
    </div>
  )
}

function StaffSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-4">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-9 w-72" aria-hidden />
      <Skeleton className="h-72" aria-hidden />
    </div>
  )
}

export function StaffPage() {
  const { t } = useTranslation()
  const can = useCan()
  const today = todayLocal()
  const allowed = can('staff')
  const query = useApiQuery('staff.employees', { includeInactive: true }, { enabled: allowed })
  const [newEmployee, setNewEmployee] = useState(false)
  // The main action is a worded button in the header; on the phone it sits under the title, full width.
  const add =
    allowed && can('staff', 'edit') ? (
      <Button onClick={() => setNewEmployee(true)} disabled={!query.data} data-testid="new-employee">
        <UserRoundPlusIcon aria-hidden />
        {t('staff.employee.new')}
      </Button>
    ) : undefined
  return (
    <Page title={t('nav.staff')} description={t('staff.description')} actions={add}>
      {allowed ? (
        <QueryView
          query={query}
          loading={<StaffSkeleton />}
          isEmpty={(list) => list.length === 0 && !newEmployee}
          empty={{ icon: UsersIcon, title: t('staff.emptyTitle'), body: t('staff.emptyBody') }}
        >
          {(employees) => (
            <StaffView
              employees={employees}
              today={today}
              newEmployee={newEmployee}
              onNewEmployee={setNewEmployee}
            />
          )}
        </QueryView>
      ) : (
        <EmptyState icon={LockIcon} title={t('common.noAccessTitle')} body={t('common.noAccessBody')} />
      )}
    </Page>
  )
}
