// The four views of the task list (G-94: bugün / geciken / yaklaşan / tamamlanan) and its filters (person, role,
// shift, room). Overdue is the shared rule (§6.17 isOverdue) on the hotel's wall clock; due times are local
// "YYYY-MM-DDTHH:MM", done times ISO instants.
import { localDateOf, type LocalDate } from '@shared/date'
import type { LocalDateTime } from '@shared/domain/local-datetime'
import { isOverdue } from '@shared/domain/task-recurrence'
import type { TaskItem } from './task-data'

export const TASK_VIEWS = ['today', 'overdue', 'upcoming', 'done'] as const
export type TaskView = (typeof TASK_VIEWS)[number]

export const dayOf = (iso: string): LocalDate => localDateOf(new Date(iso))
const dueDay = (task: TaskItem): string | null => (task.dueAt ? task.dueAt.slice(0, 10) : null)

export const taskOverdue = (task: TaskItem, now: LocalDateTime): boolean =>
  isOverdue({ status: task.status, dueAt: task.dueAt as LocalDateTime | null }, now)

const byDue = (a: TaskItem, b: TaskItem): number =>
  (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || a.title.localeCompare(b.title, 'tr')

/**
 * today: open tasks due today or earlier (the late ones first), then the undated ones (a room's deep clean is due
 * now), then what was done today; overdue: open and past due; upcoming: open and due after today;
 * done: newest first.
 */
export function tasksOf(tasks: readonly TaskItem[], view: TaskView, now: LocalDateTime): TaskItem[] {
  const today = now.slice(0, 10)
  const open = tasks.filter((t) => t.status === 'open')
  switch (view) {
    case 'today':
      return [
        ...open.filter((t) => dueDay(t) !== null && (dueDay(t) as string) <= today).sort(byDue),
        ...open.filter((t) => t.dueAt === null).sort(byDue),
        ...tasks
          .filter((t) => t.status === 'done' && t.doneAt && dayOf(t.doneAt) === today)
          .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
      ]
    case 'overdue':
      return open.filter((t) => taskOverdue(t, now)).sort(byDue)
    case 'upcoming':
      return open.filter((t) => dueDay(t) !== null && (dueDay(t) as string) > today).sort(byDue)
    case 'done':
      return tasks
        .filter((t) => t.status === 'done')
        .sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? ''))
  }
}

/** The badge count of a view: what is still to do (done shows how many were done). */
export const countOf = (tasks: readonly TaskItem[], view: TaskView, now: LocalDateTime): number =>
  tasksOf(tasks, view, now).filter((t) => (view === 'done' ? true : t.status === 'open')).length

/** "all", "me", "user:<id>", "role:<id>", "shift:<id>". */
export type AssigneeFilter = string
export const ALL = 'all'

export function matchesFilter(
  task: TaskItem,
  who: AssigneeFilter,
  roomId: string,
  me: string | null
): boolean {
  if (roomId !== ALL && task.roomId !== roomId) return false
  if (who === ALL) return true
  if (who === 'me') return me !== null && task.assigneeUserId === me
  const [kind, id] = who.split(':')
  if (kind === 'user') return task.assigneeUserId === id
  if (kind === 'role') return task.assigneeRoleId === id
  if (kind === 'shift') return task.assigneeShiftId === id
  return true
}

/** Seeded legal reminder that opens the Turizm istatistiği screen (G-93). */
export const TOURISM_TEMPLATE = 'legal_tourism_stats'
