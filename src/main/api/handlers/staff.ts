// Handlers of procedures/staff.ts (Faz 8): contract procedure → service call. The service checks permissions.
import type { staffProcedures } from '@shared/contract/procedures/staff'
import type { Services } from '../../services'
import type { HandlersFor } from '../app'

export const staffHandlers = ({ staff }: Services): HandlersFor<keyof typeof staffProcedures> => ({
  'staff.employees': (ctx, input) => staff.listEmployees(ctx, input),
  'staff.getEmployee': (ctx, input) => staff.getEmployee(ctx, input.id),
  'staff.myEmployee': (ctx) => staff.myEmployee(ctx),
  'staff.createEmployee': (ctx, input) => staff.createEmployee(ctx, input),
  'staff.updateEmployee': (ctx, input) => staff.updateEmployee(ctx, input.id, input.patch),
  'staff.linkableUsers': (ctx) => staff.linkableUsers(ctx),
  'staff.rehire': (ctx, input) => staff.rehire(ctx, input),
  'staff.salaryHistory': (ctx, input) => staff.salaryHistory(ctx, input.employeeId),
  'staff.addSalary': (ctx, input) => staff.addSalary(ctx, input),
  'staff.leaveBetween': (ctx, input) => staff.leaveBetween(ctx, input),
  'staff.addLeave': (ctx, input) => staff.addLeave(ctx, input),
  'staff.addLeaveDays': (ctx, input) => staff.addLeaveDays(ctx, input),
  'staff.voidLeave': (ctx, input) => staff.voidLeave(ctx, input.id, input.reason),
  'staff.listWork': (ctx, input) => staff.listWork(ctx, input),
  'staff.recordWork': (ctx, input) => staff.recordWork(ctx, input),
  'staff.listTransactions': (ctx, input) =>
    staff.listTransactions(ctx, input.employeeId, input.year, input.month),
  'staff.addTransaction': (ctx, input) => staff.addTransaction(ctx, input),
  'staff.voidTransaction': (ctx, input) =>
    staff.voidTransaction(ctx, input.id, input.reason, input.dayClosedReason),
  'staff.salaryTable': (ctx, input) => staff.salaryTable(ctx, input.year, input.month),
  'staff.salaryPeriod': (ctx, input) => staff.salaryPeriod(ctx, input),
  'staff.lockMonth': (ctx, input) => staff.lockMonth(ctx, input.year, input.month),
  'staff.unlockMonth': (ctx, input) => staff.unlockMonth(ctx, input.year, input.month, input.reason),
  'staff.lockPeriod': (ctx, input) => staff.lockPeriod(ctx, input),
  'staff.panel': (ctx, input) => staff.staffPanel(ctx, input.year, input.month)
})
