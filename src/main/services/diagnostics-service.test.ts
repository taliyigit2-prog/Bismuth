// Faz 16 madde 2 + son kontrol (QA2c #12): window error reports reach the error log at most REPORTS_PER_MINUTE a
// minute per source, so a device that reports in a loop cannot silence the hotel computer's own window.
import { describe, expect, it } from 'vitest'
import { anonymousCtx, ctxFromPermissions } from './context'
import { createDiagnosticsService, REPORTS_PER_MINUTE } from './diagnostics-service'

const report = { kind: 'window' as const, name: 'TypeError', message: 'x', stack: null, route: '/calendar' }

function setup() {
  let now = new Date('2026-10-05T09:00:00Z').getTime()
  const written: string[] = []
  const svc = createDiagnosticsService({
    clock: () => new Date(now),
    onClientError: (r) => written.push(`${r.transport}:${r.userId ?? ''}`)
  })
  return { svc, written, advance: (ms: number) => (now += ms) }
}

describe('pencere hata bildirimi oran sınırı', () => {
  it('uzaktaki bir oturumun döngüsü otel bilgisayarının kendi penceresinin bildirimini düşürmez', () => {
    const { svc, written } = setup()
    const phone = ctxFromPermissions('u-kat', 'phone', 'http', { room_issues: 'view' })
    for (let i = 0; i < REPORTS_PER_MINUTE + 5; i++) svc.reportClientError(phone, report, 'http')
    expect(written).toHaveLength(REPORTS_PER_MINUTE)
    const desk = ctxFromPermissions('u-resepsiyon', 'pc', 'ipc', { calendar: 'edit' })
    expect(svc.reportClientError(desk, report, 'ipc')).toBe(true)
    // Another person on another device has a budget of their own too.
    const owner = ctxFromPermissions('u-sahip', 'mac', 'http', { settings: 'edit' })
    expect(svc.reportClientError(owner, report, 'http')).toBe(true)
  })

  it('her kaynak dakikada en çok 20 bildirim yazar; bir dakika sonra yeniden yazabilir', () => {
    const { svc, advance } = setup()
    const desk = anonymousCtx('pc', 'ipc')
    for (let i = 0; i < REPORTS_PER_MINUTE; i++) expect(svc.reportClientError(desk, report, 'ipc')).toBe(true)
    expect(svc.reportClientError(desk, report, 'ipc')).toBe(false)
    advance(60_000)
    expect(svc.reportClientError(desk, report, 'ipc')).toBe(true)
  })

  it('oturumsuz uzak çağrı hiç yazılmaz', () => {
    const { svc, written } = setup()
    expect(svc.reportClientError(anonymousCtx('phone', 'http'), report, 'http')).toBe(false)
    expect(written).toEqual([])
  })
})
