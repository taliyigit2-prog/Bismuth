// Son kontrol (QA2c #2): a person's own display choice made on another device does not reach the hotel computer's
// window. The listener below is the same wiring as src/main/index.ts (applyDisplay), with the Electron calls recorded.
import { afterEach, describe, expect, it } from 'vitest'
import { memoryDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { roles, users } from '../db/schema'
import { ctxFromPermissions, setupCtx } from '../services/context'
import { createSettingsService } from '../services/settings-service'
import { displayFollows } from './display-follow'

let h: DatabaseHandle | undefined
afterEach(() => h?.close())

function addUsers(db: DatabaseHandle, ...ids: string[]): void {
  const at = '2026-10-01T09:00:00.000Z'
  db.db.insert(roles).values({ id: 'r1', name: 'Rol', createdAt: at, updatedAt: at }).run()
  for (const id of ids)
    db.db
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

async function setup(windowUserId: string | null) {
  h = await memoryDatabase()
  addUsers(h, 'u-resepsiyon', 'u-sahip')
  const service = createSettingsService(h.db, () => new Date('2026-10-05T09:00:00Z'))
  const hotelWindow = { nativeTheme: 'light', menuLocale: 'tr', uiLocaleFile: 'tr', applied: 0 }
  service.onChange((values, changed, by) => {
    if (!displayFollows(changed, by, windowUserId)) return
    hotelWindow.applied++
    hotelWindow.uiLocaleFile = values['ui.language']
    hotelWindow.menuLocale = values['ui.language']
    hotelWindow.nativeTheme = values['ui.theme']
  })
  return { service, hotelWindow }
}

describe('kişisel görünüm ayarı yalnız kendi ekranına uygulanır (K-37)', () => {
  it('sahip telefondan (HTTP) koyu tema + Rusça seçince otel bilgisayarının penceresi değişmez', async () => {
    const { service, hotelWindow } = await setup('u-resepsiyon')
    const desk = ctxFromPermissions('u-resepsiyon', 'pc', 'ipc', { calendar: 'edit' })
    const phone = ctxFromPermissions('u-sahip', 'phone', 'http', { settings: 'edit' })
    service.set(desk, { 'ui.theme': 'light', 'ui.language': 'tr' })
    hotelWindow.applied = 0

    service.set(phone, { 'ui.theme': 'dark', 'ui.language': 'ru' })

    expect(service.get(desk)).toMatchObject({ 'ui.theme': 'light', 'ui.language': 'tr' })
    expect(hotelWindow).toEqual({ nativeTheme: 'light', menuLocale: 'tr', uiLocaleFile: 'tr', applied: 0 })
  })

  it('pencerede oturum açmış kişinin kendi seçimi pencereye uygulanır', async () => {
    const { service, hotelWindow } = await setup('u-resepsiyon')
    const desk = ctxFromPermissions('u-resepsiyon', 'pc', 'ipc', { calendar: 'edit' })
    service.set(desk, { 'ui.theme': 'dark', 'ui.language': 'en' })
    expect(hotelWindow).toMatchObject({
      nativeTheme: 'dark',
      menuLocale: 'en',
      uiLocaleFile: 'en',
      applied: 1
    })
  })

  it('aynı kişi telefondan değiştirse de otel penceresi değişmez; kurulum sihirbazı ve programın duyurusu uygulanır', async () => {
    const { service, hotelWindow } = await setup(null)
    const ownerPhone = ctxFromPermissions('u-sahip', 'phone', 'http', { settings: 'edit' })
    service.set(ownerPhone, { 'ui.language': 'ru' })
    expect(hotelWindow.applied).toBe(0)
    service.set(setupCtx('pc', 'ipc'), { 'ui.language': 'en' })
    expect(hotelWindow).toMatchObject({ menuLocale: 'en', applied: 1 })
    service.announce(['ui.theme'])
    expect(hotelWindow.applied).toBe(2)
    // Other keys never touch the window.
    expect(displayFollows(['hotel.name'], null, null)).toBe(false)
  })
})
