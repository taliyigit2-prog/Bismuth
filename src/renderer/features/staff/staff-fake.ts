// Test helper (imported by tests only, never by the app): an in-memory stand-in for the staff procedures over the
// shared settings fake (src/renderer/test/render.tsx). Salary rows are computed with the real shared rule
// (computeSalaryPeriod), so an advance or a payment changes the table as the service does; locked months keep
// their snapshot. Names and amounts are invented.
import { SETTINGS_DEFAULTS, type ProcedureName, type SettingsValues } from '@shared/contract'
import type {
  EmployeeViewDto,
  LeaveRowDto,
  SalaryPeriodDto,
  StaffTxnRowDto,
  WorkRowDto
} from '@shared/contract/procedures/staff'
import { addDays, localDate, type LocalDate } from '@shared/date'
import {
  computeSalaryPeriod,
  DEFAULT_PAY_POLICY,
  employedRange,
  salaryOn,
  suggestedOvertimeMinutes,
  type SalaryHistoryEntry
} from '@shared/domain/salary'
import { fakeTransport, type FakeTransport } from '@/test/render'
import { ApiError } from '@/lib/transport/types'

export interface StaffState {
  employees: EmployeeViewDto[]
  salaries: (SalaryHistoryEntry & { id: string; employeeId: string })[]
  txns: StaffTxnRowDto[]
  leave: LeaveRowDto[]
  work: WorkRowDto[]
  locked: Map<string, SalaryPeriodDto>
  /** The signed-in user's own card (staff.myEmployee). */
  myEmployeeId: string | null
  /** Closed business days: money written there without a reason is refused (G-72). */
  closedDays?: string[]
}

const STAMP = '2026-09-01T09:00:00.000Z'

export const employee = (
  id: string,
  firstName: string,
  lastName: string,
  extra: Partial<EmployeeViewDto> = {}
): EmployeeViewDto => ({
  id,
  firstName,
  lastName,
  fullName: `${firstName} ${lastName}`,
  position: 'Resepsiyon',
  phone: '+90 532 000 00 00',
  startDate: localDate('2025-03-01'),
  endDate: null,
  active: true,
  notes: null,
  userId: null,
  account: null,
  ...extra
})

/** Three invented employees: Selin (40.000), Murat (30.000 → 35.000 from 1 September), Olga (37.000). */
export function defaultStaffState(): StaffState {
  return {
    employees: [
      employee('e1', 'Selin', 'Kaya', {
        userId: 'u-selin',
        account: {
          id: 'u-selin',
          displayName: 'Selin Kaya',
          roleCode: 'reception',
          roleName: 'Resepsiyon',
          roleNameI18n: { tr: 'Resepsiyon', en: 'Reception', ru: 'Ресепшн' },
          active: true,
          lastLoginAt: null
        }
      }),
      employee('e2', 'Murat', 'Demir', { position: 'Kat hizmetleri', startDate: localDate('2024-06-01') }),
      employee('e3', 'Olga', 'Petrova', { position: 'Gece resepsiyonu', startDate: localDate('2025-11-15') })
    ],
    salaries: [
      {
        id: 's1',
        employeeId: 'e1',
        validFrom: localDate('2025-03-01'),
        monthlyMinor: 4_000_000,
        currency: 'TRY'
      },
      {
        id: 's2',
        employeeId: 'e2',
        validFrom: localDate('2024-06-01'),
        monthlyMinor: 3_000_000,
        currency: 'TRY'
      },
      {
        id: 's3',
        employeeId: 'e2',
        validFrom: localDate('2026-09-01'),
        monthlyMinor: 3_500_000,
        currency: 'TRY'
      },
      {
        id: 's4',
        employeeId: 'e3',
        validFrom: localDate('2025-11-15'),
        monthlyMinor: 3_700_000,
        currency: 'TRY'
      }
    ],
    txns: [],
    leave: [],
    work: [],
    locked: new Map(),
    myEmployeeId: null
  }
}

export type StaffTransport = FakeTransport & {
  staff: StaffState
  staffCalls: { name: string; input: unknown }[]
}

const ym = (date: string) => ({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) })
const key = (employeeId: string, year: number, month: number) => `${employeeId}:${year}-${month}`
const monthStart = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}-01` as LocalDate
const nextMonth = (year: number, month: number) =>
  month === 12 ? monthStart(year + 1, 1) : monthStart(year, month + 1)

export function staffTransport(
  opts: {
    settings?: SettingsValues
    state?: Partial<StaffState>
    refuse?: Partial<Record<string, ApiError>>
  } = {}
): StaffTransport {
  const base = fakeTransport(opts.settings ?? SETTINGS_DEFAULTS)
  const state: StaffState = { ...defaultStaffState(), ...opts.state }
  const staffCalls: { name: string; input: unknown }[] = []
  let next = 1
  const id = (prefix: string) => `${prefix}-${next++}`

  const history = (employeeId: string) => state.salaries.filter((s) => s.employeeId === employeeId)
  const view = (e: EmployeeViewDto): EmployeeViewDto => {
    const now = salaryOn(history(e.id), '2026-10-04' as LocalDate)
    const current = history(e.id)
      .filter((s) => s.validFrom <= '2026-10-04')
      .sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1))[0]
    return {
      ...e,
      currentSalary:
        now && current
          ? { monthlyMinor: now.amountMinor, currency: now.currency, validFrom: current.validFrom }
          : null
    }
  }
  const range = (e: EmployeeViewDto, year: number, month: number) =>
    employedRange(year, month, e.startDate as LocalDate, e.endDate as LocalDate | null)
  const period = (e: EmployeeViewDto, year: number, month: number): SalaryPeriodDto => {
    const locked = state.locked.get(key(e.id, year, month))
    if (locked) return locked
    const from = monthStart(year, month)
    const to = nextMonth(year, month)
    const p = computeSalaryPeriod({
      year,
      month,
      policy: DEFAULT_PAY_POLICY,
      salaryHistory: history(e.id),
      leave: state.leave
        .filter((l) => l.employeeId === e.id && !l.voidedAt && l.date >= from && l.date < to)
        .map((l) => ({ date: l.date as LocalDate, kind: l.kind })),
      work: state.work
        .filter((w) => w.employeeId === e.id && w.date >= from && w.date < to)
        .map((w) => ({
          date: w.date as LocalDate,
          kind: w.kind,
          minutesWorked: w.minutesWorked,
          overtimeMinutes: w.overtimeMinutes
        })),
      txns: state.txns
        .filter(
          (t) => t.employeeId === e.id && !t.voidedAt && t.periodYear === year && t.periodMonth === month
        )
        .map((t) => ({ kind: t.kind, amountMinor: t.amountMinor, currency: t.currency })),
      employedFrom: e.startDate as LocalDate,
      employedUntil: e.endDate as LocalDate | null
    })
    return {
      ...p,
      employeeId: e.id,
      fullName: e.fullName,
      position: e.position,
      commissionBaseMinor: null,
      locked: false,
      lockedAt: null,
      lockedBy: null
    }
  }
  const tableRows = (year: number, month: number) =>
    state.employees
      .filter((e) => range(e, year, month))
      .filter(
        (e) =>
          state.locked.has(key(e.id, year, month)) || salaryOn(history(e.id), range(e, year, month)!.start)
      )
      .map((e) => period(e, year, month))
  const find = (employeeId: string) => {
    const e = state.employees.find((x) => x.id === employeeId)
    if (!e) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
    return e
  }
  const assertOpen = (employeeId: string, year: number, month: number) => {
    if (state.locked.has(key(employeeId, year, month)))
      throw new ApiError('CONFLICT', 409, 'errors.salaryPeriodLocked')
  }

  const handle = (name: string, input: never): unknown => {
    const i = input as Record<string, unknown>
    switch (name) {
      case 'staff.employees':
        return state.employees.filter((e) => i.includeInactive || e.active).map(view)
      case 'staff.listEmployees':
        return state.employees.filter((e) => e.active)
      case 'staff.getEmployee':
        return view(find(String(i.id)))
      case 'staff.myEmployee': {
        const mine = state.employees.find((e) => e.id === state.myEmployeeId)
        return mine ? view(mine) : null
      }
      case 'staff.linkableUsers':
        return [
          {
            id: 'u-free',
            displayName: 'Deniz Arslan',
            roleCode: 'reception',
            roleName: 'Resepsiyon',
            roleNameI18n: { tr: 'Resepsiyon', en: 'Reception', ru: 'Ресепшн' }
          }
        ]
      case 'staff.getPolicy':
        return {
          employeeId: i.employeeId ?? null,
          values: { ...DEFAULT_PAY_POLICY, commissionBase: 'room_revenue_all' },
          hotel: {},
          employee: {}
        }
      case 'staff.panel': {
        const year = Number(i.year)
        const month = Number(i.month)
        return state.employees
          .filter((e) => e.active && range(e, year, month))
          .map((e) => {
            const p = salaryOn(history(e.id), range(e, year, month)!.start) ? period(e, year, month) : null
            return {
              employeeId: e.id,
              fullName: e.fullName,
              position: e.position,
              advancesMinor: p?.advances ?? 0,
              currency: p?.currency ?? 'TRY',
              leaveEntitled: p?.leaveEntitled ?? 4,
              leaveUsed: p?.leaveUsed ?? 0,
              leaveLeft: p?.leaveLeft ?? 4
            }
          })
      }
      case 'staff.leaveBetween':
        return state.leave.filter(
          (l) =>
            !l.voidedAt &&
            l.date >= String(i.from) &&
            l.date <= String(i.to) &&
            (!i.employeeId || l.employeeId === i.employeeId)
        )
      case 'staff.salaryTable': {
        const year = Number(i.year)
        const month = Number(i.month)
        const rows = tableRows(year, month)
        return {
          year,
          month,
          rows,
          withoutSalary: state.employees
            .filter((e) => range(e, year, month) && !rows.some((r) => r.employeeId === e.id))
            .map((e) => e.id)
        }
      }
      case 'staff.salaryPeriod': {
        const e = find(String(i.employeeId))
        const r = range(e, Number(i.year), Number(i.month))
        if (!r || !salaryOn(history(e.id), r.start)) throw new ApiError('VALIDATION', 400, 'errors.noSalary')
        return period(e, Number(i.year), Number(i.month))
      }
      case 'staff.listTransactions':
        return state.txns.filter(
          (t) => t.employeeId === i.employeeId && t.periodYear === i.year && t.periodMonth === i.month
        )
      case 'staff.salaryHistory':
        return history(String(i.employeeId)).map((s) => ({ ...s, createdAt: STAMP }))
      case 'staff.listWork': {
        const employeeId = (i.employeeId as string | undefined) ?? state.myEmployeeId
        return state.work
          .filter((w) => w.employeeId === employeeId && w.date >= String(i.from) && w.date <= String(i.to))
          .map((w) => ({ ...w, suggestedOvertimeMinutes: suggestedOvertimeMinutes(w.minutesWorked, 8) }))
      }
      case 'lists.list':
        return [
          {
            id: 'pm-cash',
            code: 'cash',
            name: null,
            nameI18n: { tr: 'Nakit', en: 'Cash', ru: 'Наличные' },
            active: true,
            sort: 0,
            seeded: true,
            isCash: true
          },
          {
            id: 'pm-bank',
            code: 'bank',
            name: null,
            nameI18n: { tr: 'Havale', en: 'Bank transfer', ru: 'Перевод' },
            active: true,
            sort: 1,
            seeded: true,
            isCash: false
          }
        ]
      // ── writes ──
      case 'staff.createEmployee': {
        const created = employee(id('e'), String(i.firstName), String(i.lastName), {
          position: (i.position as string | null) ?? null,
          phone: (i.phone as string | null) ?? null,
          startDate: localDate(String(i.startDate)),
          userId: (i.userId as string | null) ?? null,
          notes: (i.notes as string | null) ?? null
        })
        state.employees.push(created)
        const salary = i.salary as { monthlyMinor: number; currency: string } | undefined
        if (salary)
          state.salaries.push({
            id: id('s'),
            employeeId: created.id,
            validFrom: created.startDate as LocalDate,
            ...salary
          })
        return view(created)
      }
      case 'staff.updateEmployee': {
        const e = find(String(i.id))
        Object.assign(e, i.patch as object)
        e.fullName = `${e.firstName} ${e.lastName}`
        return view(e)
      }
      case 'staff.addSalary': {
        const row = {
          id: id('s'),
          employeeId: String(i.employeeId),
          validFrom: i.validFrom as LocalDate,
          monthlyMinor: Number(i.monthlyMinor),
          currency: String(i.currency)
        }
        state.salaries.push(row)
        return { ...row, createdAt: STAMP }
      }
      case 'staff.rehire': {
        const e = find(String(i.employeeId))
        Object.assign(e, { startDate: i.startDate, endDate: null, active: true })
        return view(e)
      }
      case 'staff.addTransaction': {
        const date = String(i.date)
        if (state.closedDays?.includes(date) && !i.reason)
          throw new ApiError('CONFLICT', 409, 'errors.dayClosed')
        const year = Number(i.periodYear ?? ym(date).year)
        const month = Number(i.periodMonth ?? ym(date).month)
        assertOpen(String(i.employeeId), year, month)
        const kind = i.kind as StaffTxnRowDto['kind']
        const row: StaffTxnRowDto = {
          id: id('t'),
          employeeId: String(i.employeeId),
          date: date as LocalDate,
          kind,
          amountMinor: Number(i.amountMinor),
          currency: String(i.currency ?? 'TRY'),
          periodYear: year,
          periodMonth: month,
          expenseId: kind === 'bonus' || kind === 'deduction' ? null : id('x'),
          note: (i.note as string | null) ?? null,
          voidedAt: null,
          voidReason: null,
          createdAt: STAMP
        }
        state.txns.push(row)
        return row
      }
      case 'staff.voidTransaction': {
        const row = state.txns.find((t) => t.id === i.id)!
        assertOpen(row.employeeId, row.periodYear, row.periodMonth)
        row.voidedAt = STAMP
        row.voidReason = String(i.reason)
        return row
      }
      case 'staff.addLeaveDays': {
        const out: LeaveRowDto[] = []
        for (let d = 0; d < Number(i.days); d++) {
          const date = addDays(i.from as LocalDate, d)
          if (state.leave.some((l) => !l.voidedAt && l.employeeId === i.employeeId && l.date === date))
            throw new ApiError('CONFLICT', 409, 'errors.leaveExists')
          out.push({
            id: id('l'),
            employeeId: String(i.employeeId),
            date,
            kind: i.kind as LeaveRowDto['kind'],
            note: null,
            voidedAt: null,
            createdAt: STAMP
          })
        }
        state.leave.push(...out)
        return out
      }
      case 'staff.voidLeave': {
        const row = state.leave.find((l) => l.id === i.id)!
        row.voidedAt = STAMP
        return row
      }
      case 'staff.recordWork': {
        const employeeId = (i.employeeId as string | undefined) ?? state.myEmployeeId!
        const existing = state.work.find((w) => w.employeeId === employeeId && w.date === i.date)
        const start = (i.startTime as string | undefined) ?? existing?.startTime ?? null
        const end = (i.endTime as string | undefined) ?? existing?.endTime ?? null
        const minutes =
          start && end
            ? (Number(end.slice(0, 2)) * 60 +
                Number(end.slice(3)) -
                (Number(start.slice(0, 2)) * 60 + Number(start.slice(3))) +
                1440) %
              1440
            : (existing?.minutesWorked ?? 0)
        const row: WorkRowDto = {
          id: existing?.id ?? id('w'),
          employeeId,
          date: i.date as LocalDate,
          startTime: start,
          endTime: end,
          minutesWorked: minutes,
          overtimeMinutes: (i.overtimeMinutes as number | undefined) ?? existing?.overtimeMinutes ?? 0,
          kind: (i.kind as WorkRowDto['kind'] | undefined) ?? existing?.kind ?? 'normal',
          note: (i.note as string | null | undefined) ?? existing?.note ?? null,
          createdBy: null
        }
        state.work = [...state.work.filter((w) => w !== existing), row]
        return row
      }
      case 'staff.lockMonth': {
        const year = Number(i.year)
        const month = Number(i.month)
        const rows = tableRows(year, month).filter((r) => !r.locked)
        for (const r of rows)
          state.locked.set(key(r.employeeId, year, month), {
            ...r,
            locked: true,
            lockedAt: '2026-10-04T08:00:00.000Z',
            lockedBy: 'u-owner'
          })
        return { locked: rows.length }
      }
      case 'staff.unlockMonth': {
        let n = 0
        for (const k of [...state.locked.keys()])
          if (k.endsWith(`:${String(i.year)}-${String(i.month)}`)) {
            state.locked.delete(k)
            n++
          }
        return { unlocked: n }
      }
      case 'staff.setPolicy':
        return { employeeId: i.employeeId ?? null, values: DEFAULT_PAY_POLICY, hotel: {}, employee: i.values }
      default:
        return undefined
    }
  }

  const transport = {
    ...base,
    staff: state,
    staffCalls,
    async call(name: ProcedureName, input: unknown) {
      if (!name.startsWith('staff.') && name !== 'lists.list') return base.call(name, input as never)
      staffCalls.push({ name, input })
      const refused = opts.refuse?.[name]
      if (refused) throw refused
      const out = handle(name, input as never)
      if (out === undefined) throw new Error(`unexpected ${name}`)
      return structuredClone(out) as never
    }
  }
  return transport as unknown as StaffTransport
}
