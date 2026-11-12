// The hotel computer's task round: OS notifications in the user's language, at most a few at once, nothing when
// the hotel is not set up, and a failing round never stops the program.
import { describe, expect, it, vi } from 'vitest'
import tr from '../../renderer/i18n/tr.json'
import ru from '../../renderer/i18n/ru.json'
import {
  createTaskScheduler,
  MAX_NOTICES_PER_ROUND,
  noticeText,
  type OsNotice,
  type TaskNotice
} from './scheduler'

const lookup =
  (dict: unknown) =>
  (key: string, vars: Record<string, string> = {}) => {
    let node: unknown = dict
    for (const part of key.split('.')) node = (node as Record<string, unknown>)[part]
    return String(node).replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '')
  }

const late: TaskNotice = {
  id: 'n1',
  kind: 'task_overdue',
  title: 'Sigortayı yenile',
  body: '2026-10-12T10:00'
}

describe('görev bildirimi', () => {
  it('geciken ve yaklaşan görev bildirimi kullanıcının dilinde, tarih ve saatle', () => {
    expect(noticeText(late, 'tr', lookup(tr))).toEqual({
      title: 'Geciken görev',
      body: 'Sigortayı yenile · 12 Eki 2026 10:00'
    })
    const soon = noticeText({ ...late, kind: 'task_reminder' }, 'ru', lookup(ru))
    expect(soon.title).toBe('Предстоящая задача')
    expect(soon.body).toMatch(/^Sigortayı yenile · 12 окт\. 2026 г\. 10:00$/)
  })

  it('bir turda en çok üç bildirim; fazlası tek bildirimde toplanır', () => {
    const shown: OsNotice[] = []
    const scheduler = createTaskScheduler({
      run: () => Array.from({ length: 5 }, (_, i) => ({ ...late, id: `n${i}`, title: `İş ${i}` })),
      show: (n) => shown.push(n),
      active: () => true,
      locale: () => 'tr',
      t: lookup(tr),
      onError: () => {}
    })
    expect(scheduler.round()).toBe(5)
    expect(shown).toHaveLength(MAX_NOTICES_PER_ROUND + 1)
    expect(shown.at(-1)).toEqual({
      title: 'Başka görevler de var',
      body: '2 görev daha var. Görevler ekranına bakın.'
    })
  })

  it('otel kurulmadan tur çalışmaz; hata programı durdurmaz', () => {
    const run = vi.fn(() => [])
    const onError = vi.fn()
    const idle = createTaskScheduler({
      run,
      show: () => {},
      active: () => false,
      locale: () => 'tr',
      t: lookup(tr),
      onError
    })
    expect(idle.round()).toBe(0)
    expect(run).not.toHaveBeenCalled()
    const broken = createTaskScheduler({
      run: () => {
        throw new Error('disk dolu')
      },
      show: () => {},
      active: () => true,
      locale: () => 'tr',
      t: lookup(tr),
      onError
    })
    expect(broken.round()).toBe(0)
    expect(onError).toHaveBeenCalledOnce()
  })
})
