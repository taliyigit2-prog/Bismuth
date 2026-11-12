// Shared bits of the Görevler, Vardiya and Bakım screens (Faz 9): the task procedures they read and refresh
// together, the names of seeded rows in the UI language, error toasts and one combined query state.
import { useTranslation } from 'react-i18next'
import type { ProcedureName, ProcedureOutput } from '@shared/contract'
import type { QueryLike } from '@/components/query-view'
import type { Format } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { ApiError } from '@/lib/transport/types'

export type TaskItem = ProcedureOutput<'tasks.list'>[number]
export type TaskLookups = ProcedureOutput<'tasks.lookups'>
export type TemplateDetail = ProcedureOutput<'tasks.templates'>[number]
export type StayCounterGroup = ProcedureOutput<'tasks.stayCounters'>[number]
export type ShiftView = TaskLookups['shifts'][number]

/** Every write on tasks refreshes the lists that show them (Görevler, Bakım, the handover summary). */
export const TASK_QUERIES: readonly ProcedureName[] = [
  'tasks.list',
  'tasks.templates',
  'tasks.stayCounters',
  'tasks.listTemplates',
  'shift.summary'
]

type I18nName = { tr?: string; en?: string; ru?: string } | null

/** A row's own name, else its seeded name in the UI language (Turkish when a language is missing). */
export function nameOf(f: Pick<Format, 'locale'>, plain: string | null, i18n: I18nName): string {
  return plain ?? i18n?.[f.locale] ?? i18n?.tr ?? ''
}

/** "Gündüz 09:00–21:00" → the shift's name. */
export const shiftName = (f: Pick<Format, 'locale'>, s: Pick<ShiftView, 'name' | 'displayName'>): string =>
  nameOf(f, s.name, s.displayName)

/** The title of a task in the UI language (seeded templates carry three). */
export const taskTitle = (f: Pick<Format, 'locale'>, task: Pick<TaskItem, 'title' | 'titleI18n'>): string =>
  task.titleI18n ? nameOf(f, null, task.titleI18n) || task.title : task.title

export const templateTitle = (
  f: Pick<Format, 'locale'>,
  t: Pick<TemplateDetail, 'title' | 'titleI18n' | 'code'>
): string => nameOf(f, t.title, t.titleI18n) || (t.code ?? '')

/** Who a task is for, in words: a person, a role, a shift, or everyone. */
export function assigneeText(
  f: Pick<Format, 'locale'>,
  lookups: TaskLookups | undefined,
  task: Pick<TaskItem, 'assigneeUserId' | 'assigneeRoleId' | 'assigneeShiftId'> & {
    assigneeName?: string | null
  }
): { kind: 'user' | 'role' | 'shift' | 'none'; name: string | null } {
  if (task.assigneeUserId)
    return {
      kind: 'user',
      name: task.assigneeName ?? lookups?.users.find((u) => u.id === task.assigneeUserId)?.name ?? null
    }
  if (task.assigneeRoleId) {
    const role = lookups?.roles.find((r) => r.id === task.assigneeRoleId)
    return { kind: 'role', name: role ? nameOf(f, role.nameI18n ? null : role.name, role.nameI18n) : null }
  }
  if (task.assigneeShiftId) {
    const shift = lookups?.shifts.find((s) => s.id === task.assigneeShiftId)
    return { kind: 'shift', name: shift ? shiftName(f, shift) : null }
  }
  return { kind: 'none', name: null }
}

export function useTaskLookups() {
  return useApiQuery('tasks.lookups', {}, { staleTime: 60_000 })
}

/** A failed write in words: the service's message, or "Bir sorun oluştu". */
export function useErrorText(): (error: unknown) => string {
  const { t } = useTranslation()
  return (error) => {
    const key = (error instanceof ApiError ? error.messageKey : 'errors.internal') as 'errors.internal'
    return t(key, { defaultValue: t('errors.internal') })
  }
}

/** Several queries as one for QueryView: pending while any is, failed when any failed (the first error). */
export function combine<T extends readonly QueryLike<unknown>[]>(
  queries: T
): QueryLike<{ [K in keyof T]: T[K] extends QueryLike<infer D> ? D : never }> {
  const failed = queries.find((q) => q.isError)
  const pending = !failed && queries.some((q) => q.isPending)
  const ready = !failed && !pending
  return {
    data: ready
      ? (queries.map((q) => q.data) as { [K in keyof T]: T[K] extends QueryLike<infer D> ? D : never })
      : undefined,
    isPending: pending,
    isError: !!failed,
    error: failed?.error ?? null,
    refetch: () => queries.forEach((q) => void q.refetch())
  }
}
