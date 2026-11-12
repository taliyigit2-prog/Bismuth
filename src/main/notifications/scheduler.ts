// The task round of the hotel's computer (G-94, §6.8): every few minutes today's and the coming week's tasks are
// written (idempotent), late tasks and "N days before" reminders become notifications once, and each new one is
// shown by the operating system. Pure Node: the Electron glue (index.ts) passes `show`; tests pass a fake.
import type { AppLocale } from '@shared/format'
import { formatDate } from '@shared/format'
import { datePart, isLocalDateTime, timePart } from '@shared/domain/local-datetime'

/** A notifications row as the task service returns it. */
export interface TaskNotice {
  id: string
  kind: string
  title: string
  /** The task's due time ("YYYY-MM-DDTHH:MM"). */
  body: string | null
}

export interface OsNotice {
  title: string
  body: string
}

type Translate = (key: string, vars?: Record<string, string>) => string

/** The words of an OS notification: "Geciken görev" / "Yaklaşan görev" and the task with its due day and time. */
export function noticeText(notice: TaskNotice, locale: AppLocale, t: Translate): OsNotice {
  const due = isLocalDateTime(notice.body) ? notice.body : null
  const when = due ? `${formatDate(datePart(due), locale, 'medium')} ${timePart(due)}` : ''
  const late = notice.kind === 'task_overdue'
  return {
    title: t(late ? 'tasks.notify.overdueTitle' : 'tasks.notify.reminderTitle'),
    body: when
      ? t(late ? 'tasks.notify.overdueBody' : 'tasks.notify.reminderBody', { title: notice.title, when })
      : notice.title
  }
}

export interface TaskSchedulerOptions {
  /** One round: writes the window's tasks and returns the notifications it created. */
  run: () => TaskNotice[]
  /** Shows one notification (Electron `Notification`). */
  show: (notice: OsNotice) => void
  /** Only while this is true (the hotel is set up). */
  active: () => boolean
  locale: () => AppLocale
  t: Translate
  onError: (error: unknown) => void
  /** First round after start (default 20 s, so the window opens first) and then every `everyMs` (5 min). */
  firstDelayMs?: number
  everyMs?: number
}

/** At most this many notifications in one round; the rest are summed up in one ("ve 4 görev daha"). */
export const MAX_NOTICES_PER_ROUND = 3

export function createTaskScheduler(opts: TaskSchedulerOptions) {
  let first: ReturnType<typeof setTimeout> | null = null
  let timer: ReturnType<typeof setInterval> | null = null

  const round = (): number => {
    if (!opts.active()) return 0
    try {
      const created = opts.run()
      const locale = opts.locale()
      for (const notice of created.slice(0, MAX_NOTICES_PER_ROUND))
        opts.show(noticeText(notice, locale, opts.t))
      const rest = created.length - MAX_NOTICES_PER_ROUND
      if (rest > 0)
        opts.show({
          title: opts.t('tasks.notify.moreTitle'),
          body: opts.t('tasks.notify.moreBody', { count: String(rest) })
        })
      return created.length
    } catch (error) {
      opts.onError(error)
      return 0
    }
  }

  return {
    round,
    start(): void {
      if (first || timer) return
      first = setTimeout(round, opts.firstDelayMs ?? 20_000)
      timer = setInterval(round, opts.everyMs ?? 5 * 60_000)
      first.unref?.()
      timer.unref?.()
    },
    stop(): void {
      if (first) clearTimeout(first)
      if (timer) clearInterval(timer)
      first = null
      timer = null
    }
  }
}
