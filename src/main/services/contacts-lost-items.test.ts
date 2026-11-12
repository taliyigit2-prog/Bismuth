// Faz 12: phone-book search, favourites and import (G-160); lost and found with who/when (G-55).
import { afterEach, describe, expect, it } from 'vitest'
import { parseContactsCsv } from '@shared/domain/contacts-csv'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { roles, roomTypes, users } from '../db/schema'
import { createContactsService } from './contacts-service'
import { createLostItemsService } from './lost-items-service'
import { createRoomsService } from './rooms-service'

const owner = roleCtx('owner')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-04T09:00:00.000Z')
  const deps = depsOf(handle, clock)
  return { clock, contacts: createContactsService(deps), lost: createLostItemsService(deps), deps }
}

describe('rehber (G-160)', () => {
  it('"sucu" araması ad ve otelin kendi kategori adı üzerinden bulur; favoriler önce gelir', async () => {
    const { contacts } = await setup()
    const reception = roleCtx('reception')
    contacts.create(reception, {
      name: 'Damacana Ahmet',
      category: 'custom',
      customCategory: 'Sucu',
      phones: [{ label: 'cep', number: '0532 000 00 01' }]
    })
    contacts.create(reception, {
      name: 'Sucu Mehmet',
      category: 'supplier',
      phones: [{ label: '', number: '0532 000 00 02' }],
      favorite: true
    })
    contacts.create(reception, { name: 'Usta Tesisat', category: 'plumber', note: '7/24 acil' })
    expect(contacts.list(reception, { q: 'sucu' }).map((c) => c.name)).toEqual([
      'Sucu Mehmet',
      'Damacana Ahmet'
    ])
    expect(contacts.list(reception, { q: 'SUCU' })).toHaveLength(2)
    expect(contacts.list(reception, { q: '7/24' }).map((c) => c.name)).toEqual(['Usta Tesisat'])
    expect(contacts.list(reception, { q: '0532 000 00 01' }).map((c) => c.name)).toEqual(['Damacana Ahmet'])
  })

  it('favori numaralar Bugün kartı için okunur; kaldırılan kişi favorilerde görünmez', async () => {
    const { contacts } = await setup()
    const taxi = contacts.create(owner, { name: 'Durak Taksi', category: 'taxi', favorite: true })
    contacts.create(owner, { name: 'Ambulans', category: 'emergency', favorite: true })
    contacts.create(owner, { name: 'Kırtasiye', category: 'other' })
    expect(contacts.favorites(roleCtx('housekeeping')).map((c) => c.name)).toEqual([
      'Ambulans',
      'Durak Taksi'
    ])
    contacts.deactivate(owner, taxi.id)
    expect(contacts.favorites(owner).map((c) => c.name)).toEqual(['Ambulans'])
    expect(() => contacts.favorites(roleCtx('employee'))).toThrow(/PERMISSION_DENIED/)
  })

  it('CSV içe aktarma hepsini tek seferde yazar; rehberde olan ad ikinci kez eklenmez', async () => {
    const { contacts } = await setup()
    contacts.create(owner, { name: 'Munzur Su', category: 'supplier' })
    const parsed = parseContactsCsv('Munzur Su;0532 000 00 01;Tedarikçi\nUsta Ali;0533 000 00 02;Sucu')
    const result = contacts.importMany(
      owner,
      parsed.rows.map((r) => ({
        name: r.name,
        phones: r.phones,
        category: r.category,
        customCategory: r.customCategory
      }))
    )
    expect(result.created.map((c) => [c.name, c.category, c.customCategory])).toEqual([
      ['Usta Ali', 'custom', 'Sucu']
    ])
    expect(result.skipped).toEqual(['Munzur Su'])
    expect(() => contacts.importMany(roleCtx('accountant'), [{ name: 'X', category: 'other' }])).toThrow(
      /PERMISSION_DENIED/
    )
  })
})

describe('kayıp eşya (G-55)', () => {
  it('kayıt → "sahibine verildi": kime, ne zaman ve işlemi yapan kişi saklanır', async () => {
    const { lost, clock, deps } = await setup()
    const roleId = handle.db.select().from(roles).get()!.id
    handle.db
      .insert(users)
      .values({
        id: 'user-reception',
        username: 'deniz',
        displayName: 'Deniz Arslan',
        roleId,
        passwordHash: 'x',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z'
      })
      .run()
    const reception = roleCtx('reception')
    const typeId = handle.db.select().from(roomTypes).get()!.id
    const room = createRoomsService(deps).createRoom(owner, {
      number: '204',
      roomTypeId: typeId,
      beds: 2,
      validFrom: '2026-01-01'
    })
    const item = lost.create(reception, {
      foundAt: '2026-10-03',
      roomId: room.id,
      foundBy: 'Ayşe (temizlik)',
      description: 'Siyah şarj aleti',
      storageLocation: 'Resepsiyon çekmecesi'
    })
    expect(lost.listView(reception)[0]).toMatchObject({
      status: 'stored',
      roomNumber: '204',
      createdByName: 'Deniz Arslan',
      statusChange: null
    })
    clock.set('2026-10-04T12:30:00.000Z')
    lost.markReturned(reception, item.id, {
      returnedTo: 'Misafir Kemal Yılmaz',
      returnedAt: '2026-10-04T15:30'
    })
    const [view] = lost.listView(reception, { search: 'şarj' })
    expect(view).toMatchObject({
      status: 'returned',
      returnedTo: 'Misafir Kemal Yılmaz',
      returnedAt: '2026-10-04T15:30',
      statusChange: { at: '2026-10-04T12:30:00.000Z', byName: 'Deniz Arslan' }
    })
    expect(() => lost.markReturned(reception, item.id, { returnedTo: 'Başkası' })).toThrow(
      /lostItemNotStored/
    )
    lost.restore(owner, item.id, 'yanlış kişiye işaretlendi')
    expect(lost.listView(owner)[0]).toMatchObject({
      status: 'stored',
      returnedTo: null,
      statusChange: { reason: 'yanlış kişiye işaretlendi', byName: null }
    })
    expect(() => lost.listView(roleCtx('accountant'))).toThrow(/PERMISSION_DENIED/)
  })
})
