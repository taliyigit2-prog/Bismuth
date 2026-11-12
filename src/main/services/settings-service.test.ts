import { describe, expect, it } from 'vitest'
import { SETTINGS_DEFAULTS } from '@shared/contract'
import { memoryDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { auditLog, folios, roles, users } from '../db/schema'
import { anonymousCtx, ctxFromPermissions, localOwnerCtx, lockedCtx, setupCtx } from './context'
import { createSettingsService } from './settings-service'

/** Accounts for per-person choices (the preference rows point at a user). */
function addUsers(h: DatabaseHandle, ...ids: string[]): void {
  const at = '2026-10-01T09:00:00.000Z'
  h.db.insert(roles).values({ id: 'r1', name: 'Rol', createdAt: at, updatedAt: at }).run()
  for (const id of ids)
    h.db
      .insert(users)
      .values({
        id,
        username: id,
        displayName: id,
        roleId: 'r1',
        passwordHash: 'x',
        createdAt: at,
        updatedAt: at
      })
      .run()
}

describe('ayar servisi', () => {
  it('boş veritabanında varsayılanları döner', async () => {
    const h = await memoryDatabase()
    expect(createSettingsService(h.db).get(localOwnerCtx())).toEqual(SETTINGS_DEFAULTS)
  })

  it('yazar, geri okur ve her değişikliği denetim kaydına ekler', async () => {
    const h = await memoryDatabase()
    const service = createSettingsService(h.db, () => new Date('2026-10-02T09:00:00Z'))
    const changed: string[][] = []
    service.onChange((_, keys) => changed.push(keys))

    const values = service.set(localOwnerCtx(), { 'ui.theme': 'dark', 'ui.language': 'ru' })
    expect(values['ui.theme']).toBe('dark')
    expect(values['ui.language']).toBe('ru')
    expect(service.get(localOwnerCtx())['ui.theme']).toBe('dark')
    expect(changed).toEqual([['ui.theme', 'ui.language']])

    const audit = h.db.select().from(auditLog).all()
    expect(audit).toHaveLength(2)
    expect(audit[0]).toMatchObject({
      entity: 'settings',
      entityId: 'ui.theme',
      action: 'update',
      beforeJson: '"system"',
      afterJson: '"dark"'
    })
  })

  it('kişisel görünüm ayarını herkes, otel ayarını yalnız yetkili değiştirir (yetki serviste)', async () => {
    const h = await memoryDatabase()
    addUsers(h, 'u1', 'u2')
    const service = createSettingsService(h.db)
    const reception = ctxFromPermissions('u1', 'd1', 'ipc', { settings: 'view' })
    expect(service.set(reception, { 'ui.theme': 'light' })['ui.theme']).toBe('light')
    expect(() => service.set(reception, { 'hotel.name': 'Başka Otel' })).toThrowError(/PERMISSION_DENIED/)
    expect(service.get(reception)['hotel.name']).toBe('Bismuth')
    // Status colours are the hotel's, shared by everyone: they need the colour right (G-33).
    expect(() => service.set(reception, { 'ui.statusColors': { paid: '#000000' } })).toThrowError(
      /PERMISSION_DENIED/
    )
    const colours = ctxFromPermissions('u2', 'd1', 'ipc', { 'settings.colors': 'edit' })
    expect(
      service.set(colours, { 'ui.statusColorsDark': { paid: '#111111' } })['ui.statusColorsDark']
    ).toEqual({
      paid: '#111111'
    })
  })

  it('dil, tema ve açılış ekranı kişiye özeldir: biri değiştirince otelin ve başkasının değeri kalır (K-37, G-47)', async () => {
    const h = await memoryDatabase()
    addUsers(h, 'u-sahip', 'u-resepsiyon')
    const service = createSettingsService(h.db, () => new Date('2026-10-02T09:00:00Z'))
    // The wizard writes the hotel's value: everyone's default and the sign-in screen's.
    service.set(setupCtx('d', 'ipc'), { 'ui.language': 'tr', 'ui.theme': 'light' })
    const owner = ctxFromPermissions('u-sahip', 'd', 'ipc', { settings: 'edit' })
    const reception = ctxFromPermissions('u-resepsiyon', 'd', 'ipc', { calendar: 'edit' })
    const changed: { language: string; keys: string[] }[] = []
    service.onChange((values, keys) => changed.push({ language: values['ui.language'], keys }))

    service.set(reception, { 'ui.language': 'ru', 'ui.startScreen': 'today', 'ui.theme': 'dark' })
    expect(service.get(reception)).toMatchObject({
      'ui.language': 'ru',
      'ui.startScreen': 'today',
      'ui.theme': 'dark'
    })
    expect(service.get(owner)).toMatchObject({
      'ui.language': 'tr',
      'ui.startScreen': 'calendar',
      'ui.theme': 'light'
    })
    expect(service.get(anonymousCtx('d', 'ipc'))['ui.language']).toBe('tr')
    // The lock screen speaks the locked person's language.
    expect(service.get(lockedCtx('u-resepsiyon', 'd', 'ipc'))['ui.language']).toBe('ru')
    // The owner's own choice does not move the hotel's default either; a hotel setting still does.
    service.set(owner, { 'ui.language': 'en', 'hotel.name': 'Örnek Otel' })
    expect(service.get(anonymousCtx('d', 'ipc'))).toMatchObject({
      'ui.language': 'tr',
      'hotel.name': 'Örnek Otel'
    })
    expect(service.get(reception)).toMatchObject({ 'ui.language': 'ru', 'hotel.name': 'Örnek Otel' })
    expect(changed.map((c) => c.language)).toEqual(['ru', 'en'])
    const rows = h.db
      .select()
      .from(auditLog)
      .all()
      .filter((r) => r.entity === 'user_preference')
    expect(rows.map((r) => r.entityId)).toContain('u-resepsiyon:ui.language')
  })

  it('geçersiz kalmış kayıt varsayılana düşer', async () => {
    const h = await memoryDatabase()
    h.sqlite
      .prepare("insert into settings (key, value_json, updated_at) values ('ui.theme', '\"purple\"', 'x')")
      .run()
    expect(createSettingsService(h.db).get(localOwnerCtx())['ui.theme']).toBe('system')
  })

  it('geçersiz değer ve bilinmeyen anahtar yazılmaz', async () => {
    const h = await memoryDatabase()
    const service = createSettingsService(h.db)
    expect(() => service.set(localOwnerCtx(), { 'ui.theme': 'purple' as 'dark' })).toThrow(/VALIDATION/)
    expect(() => service.set(localOwnerCtx(), { 'no.such': 1 } as never)).toThrow(/VALIDATION/)
    expect(h.db.select().from(auditLog).all()).toEqual([])
  })

  it('folyo, ödeme ya da gider varken ana para birimi değişmez; aynı değeri yazmak serbest', async () => {
    const h = await memoryDatabase()
    const service = createSettingsService(h.db)
    expect(service.set(localOwnerCtx(), { 'hotel.baseCurrency': 'EUR' })['hotel.baseCurrency']).toBe('EUR')
    h.db
      .insert(folios)
      .values({ id: 'f1', kind: 'sale', currency: 'EUR', createdAt: '', updatedAt: '' })
      .run()
    expect(() => service.set(localOwnerCtx(), { 'hotel.baseCurrency': 'TRY' })).toThrow(
      /errors.baseCurrencyLocked/
    )
    expect(
      service.set(localOwnerCtx(), { 'hotel.baseCurrency': 'EUR', 'ui.theme': 'dark' })['ui.theme']
    ).toBe('dark')
  })

  it('otel kuru genel ayar yazımıyla değişmez: tek kaynak döviz servisidir (P14fix #11)', async () => {
    const h = await memoryDatabase()
    const service = createSettingsService(h.db)
    expect(() => service.set(localOwnerCtx(), { 'fx.hotelRates': { EUR: 60_000_000 } })).toThrow(
      /errors.settingServiceOnly/
    )
    expect(service.get(localOwnerCtx())['fx.hotelRates']).toEqual({})
  })
})
