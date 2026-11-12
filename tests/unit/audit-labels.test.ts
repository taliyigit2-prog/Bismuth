// Every record type and action the services write to the audit log has a name on the Denetim kaydı screen
// (G-24): a missing one would show a raw identifier ("archive", "user_preference") to the owner.
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AUDIT_ACTIONS } from '@shared/audit'
import type { TFunction } from 'i18next'
import { AUDIT_ENTITIES, recordRef } from '../../src/renderer/features/audit/audit-labels'

const SERVICES = resolve(__dirname, '../../src/main/services')
const sources = readdirSync(SERVICES)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .map((f) => readFileSync(join(SERVICES, f), 'utf8'))

/** `entity: 'room'` in an audit call, and the lists service's table → entity map (`paymentMethods: 'payment_method'`). */
const written = new Set(sources.flatMap((s) => [...s.matchAll(/entity: '([a-z_]+)'/g)].map((m) => m[1]!)))
const lists = readFileSync(join(SERVICES, 'lists-service.ts'), 'utf8')
const listEntities = /const ENTITY: Record<ListKind, string> = \{([^}]*)\}/.exec(lists)?.[1]
for (const m of listEntities?.matchAll(/'([a-z_]+)'/g) ?? []) written.add(m[1]!)

const tr = JSON.parse(readFileSync(resolve(__dirname, '../../src/renderer/i18n/tr.json'), 'utf8')) as {
  audit: { entity: Record<string, string>; action: Record<string, string> }
}

describe('denetim kaydı adları', () => {
  it('servislerin yazdığı her kayıt türünün ekranda bir adı var', () => {
    expect(listEntities, 'lists-service ENTITY map').toBeTruthy()
    expect(written.size).toBeGreaterThan(40)
    expect([...written].filter((e) => !(AUDIT_ENTITIES as readonly string[]).includes(e))).toEqual([])
    expect(AUDIT_ENTITIES.filter((e) => !tr.audit.entity[e])).toEqual([])
  })

  it('her işlemin ekranda bir adı var', () => {
    const actions = new Set(sources.flatMap((s) => [...s.matchAll(/action: '([a-z_]+)'/g)].map((m) => m[1]!)))
    expect([...actions].filter((a) => !(AUDIT_ACTIONS as readonly string[]).includes(a))).toEqual([])
    expect(AUDIT_ACTIONS.filter((a) => !tr.audit.action[a])).toEqual([])
  })
})

describe('adı olmayan kayıt', () => {
  const t = ((key: string) => `«${key}»`) as unknown as TFunction
  it('ayar ve kişisel görünüm seçimi ekrandaki adıyla görünür; kayıt kimliği ve program anahtarları gizlenir', () => {
    expect(recordRef(t, { entity: 'user_preference', entityId: '01M447TW649GHFKBPSFZTJ19WQ:ui.theme' })).toBe(
      '«settings.theme»'
    )
    expect(recordRef(t, { entity: 'settings', entityId: 'guide.tourForNewUsers' })).toBe(
      '«audit.setting.guideTour»'
    )
    expect(recordRef(t, { entity: 'settings', entityId: 'hotel.city' })).toBe('')
    expect(recordRef(t, { entity: 'session', entityId: '01M447TW649GHFKBPSFZY6STYE' })).toBe('')
    expect(recordRef(t, { entity: 'task', entityId: 'materialize:2026-10-10T00:00..2026-10-18T00:00' })).toBe(
      ''
    )
    expect(recordRef(t, { entity: 'setup', entityId: 'setup' })).toBe('')
    expect(recordRef(t, { entity: 'holiday_calc', entityId: '2027' })).toBe('2027')
  })
})
