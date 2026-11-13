import { describe, expect, it } from 'vitest'
import { RUNNING } from '@/test/camera-fake'
import { cameraStateView } from './camera-state'
import { groupByDay } from './alert-groups'

describe('kamera durumu kelimeleri', () => {
  it.each([
    [{}, 'running', 'running'],
    [{ loop: 'degraded' as const }, 'slow', 'problem'],
    [{ loop: 'stalled' as const }, 'slow', 'problem'],
    [{ state: 'starting' as const }, 'starting', 'starting'],
    [{ state: 'backoff' as const }, 'restarting', 'starting'],
    [{ state: 'gaveUp' as const }, 'gaveUp', 'problem'],
    [{ state: 'stopped' as const }, 'stopped', 'off'],
    [{ enabled: false, state: 'stopped' as const }, 'disabled', 'off'],
    [{ blocked: 'noSource' as const, state: 'stopped' as const }, 'noSource', 'off'],
    [{ state: 'unavailable' as const }, 'unavailable', 'off']
  ])('%o → %s (%s)', (patch, key, tone) => {
    expect(cameraStateView({ ...RUNNING, ...patch })).toEqual({ key, tone })
  })

  it('kapalı ayar, adres yokluğundan ve çöküşten önce gelir', () => {
    expect(cameraStateView({ ...RUNNING, enabled: false, state: 'gaveUp', blocked: 'noSource' }).key).toBe(
      'disabled'
    )
  })
})

describe('alarmları güne göre gruplama', () => {
  const a = (id: string, at: string | null) => ({
    id,
    at,
    state: 'new' as const,
    hasCrop: false,
    linked: false
  })

  it('yeni gün üstte, aynı günün alarmları bir arada; saatsizler sona', () => {
    const days = groupByDay([
      a('5', '2026-11-13T03:00:00'),
      a('4', '2026-11-13T01:00:00'),
      a('3', null),
      a('2', '2026-11-12T22:00:00')
    ])
    expect(days.map((d) => [d.key, d.alerts.map((x) => x.id)])).toEqual([
      ['2026-11-13', ['5', '4']],
      ['2026-11-12', ['2']],
      ['', ['3']]
    ])
  })

  it('boş liste boş gün listesi verir', () => {
    expect(groupByDay([])).toEqual([])
  })
})
