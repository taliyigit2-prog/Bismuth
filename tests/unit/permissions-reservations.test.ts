// faz-05 Excel senaryosu "satılmaz blok" (G-38) through the shared router with each system role's default
// rights: closing a room on the calendar needs `rooms.block` (owner, manager, reception); the accountant and
// housekeeping only see the grid. Never over sold nights; a block with a cause (status board) is not lifted here.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import { createServices } from '../../src/main/services'
import type { DatabaseHandle } from '../../src/main/db/client'
import { roomBlocks, roomTypes, salesChannels } from '../../src/main/db/schema'
import type { SystemRoleCode } from '../../src/shared/permissions'
import { roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

let handle: DatabaseHandle
let api: ReturnType<typeof createApiApp>
const ids = { room: '', room2: '', channel: '' }

const call = async (role: SystemRoleCode, name: string, body: unknown) => {
  const res = await handleIpcRequest(api, roleCtx(role), {
    path: `/api/${name}`,
    body: JSON.stringify(body)
  })
  return {
    status: res.status,
    body: JSON.parse(res.body) as Record<string, unknown> & { error?: Record<string, unknown> }
  }
}

type Block = { id: string; roomId: string; manual: boolean; dateTo: string; reason: string }
const gridBlocks = async (role: SystemRoleCode = 'reception'): Promise<Block[]> => {
  const res = await call(role, 'reservations.grid', { from: '2026-10-01', to: '2026-11-01' })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return (res.body as unknown as { blocks: Block[] }).blocks
}

beforeAll(async () => {
  handle = await seededDatabase()
  const services = createServices(
    handle,
    {
      name: 'Bismuth',
      version: 'test',
      packaged: false,
      dataDir: '/tmp/unused',
      electron: null,
      chrome: null
    },
    { clock: testClock('2026-10-05T09:00:00.000Z') }
  )
  api = createApiApp({ handlers: createHandlers(services) })
  const owner = roleCtx('owner')
  const type = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = (number: string) =>
    services.rooms.createRoom(owner, { number, roomTypeId: type.id, beds: 2, validFrom: '2026-01-01' }).id
  ids.room = room('101')
  ids.room2 = room('102')
  ids.channel = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const created = await call('reception', 'booking.create', {
    guest: { firstName: 'Deneme', lastName: 'Misafir' },
    channelId: ids.channel,
    stays: [{ roomId: ids.room2, checkIn: '2026-10-10', checkOut: '2026-10-12', nightlyPriceMinor: 200_000 }]
  })
  expect(created.status, JSON.stringify(created.body)).toBe(200)
})

afterAll(() => handle?.close())

const block = (roomId: string, dateFrom: string, dateTo: string) => ({
  roomId,
  dateFrom,
  dateTo,
  kind: 'oos',
  reason: 'Sahibin misafiri'
})

describe('takvimden oda kapatma (reservations.createBlock / cancelBlock)', () => {
  it.each(['accountant', 'housekeeping'] as const)('%s odayı kapatamaz (403)', async (role) => {
    const res = await call(role, 'reservations.createBlock', block(ids.room, '2026-10-06', '2026-10-08'))
    expect(res.status).toBe(403)
  })

  it('resepsiyon satılmaz blok açar; ızgara onu elle kapatılmış olarak gösterir', async () => {
    const res = await call(
      'reception',
      'reservations.createBlock',
      block(ids.room, '2026-10-06', '2026-10-08')
    )
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    expect(res.body).toMatchObject({ kind: 'oos', reason: 'Sahibin misafiri', manual: true, note: null })
    const found = (await gridBlocks('accountant')).find((b) => b.id === res.body['id'])
    expect(found).toMatchObject({ roomId: ids.room, manual: true })
  })

  it('satılmış gecelerin üstüne blok açılmaz (409, nedeni söylenir)', async () => {
    const res = await call(
      'manager',
      'reservations.createBlock',
      block(ids.room2, '2026-10-09', '2026-10-11')
    )
    expect(res.status).toBe(409)
    expect(res.body.error).toMatchObject({ messageKey: 'errors.blockOverReservation' })
  })

  it('çıkış günü girişten önce olamaz (400)', async () => {
    const res = await call(
      'reception',
      'reservations.createBlock',
      block(ids.room, '2026-10-08', '2026-10-08')
    )
    expect(res.status).toBe(400)
  })

  it('bloğu muhasebe kaldıramaz; resepsiyon kaldırır, ızgaradan düşer', async () => {
    const created = await call(
      'reception',
      'reservations.createBlock',
      block(ids.room, '2026-10-20', '2026-10-22')
    )
    const id = created.body['id'] as string
    expect((await call('accountant', 'reservations.cancelBlock', { id })).status).toBe(403)
    const lifted = await call('reception', 'reservations.cancelBlock', { id })
    expect(lifted.status, JSON.stringify(lifted.body)).toBe(200)
    expect((await gridBlocks()).some((b) => b.id === id)).toBe(false)
  })

  it('oda durumundan açılan blok takvimden kaldırılmaz (nedeni kapanınca kalkar)', async () => {
    const now = '2026-10-05T09:00:00.000Z'
    handle.db
      .insert(roomBlocks)
      .values({
        id: '01JZZZZZZZZZZZZZZZZZZZZBLK',
        roomId: ids.room,
        dateFrom: '2026-10-25',
        dateTo: '2026-10-27',
        kind: 'ooo',
        reason: 'Bakımda',
        source: 'hk_status',
        createdAt: now,
        updatedAt: now
      })
      .run()
    expect((await gridBlocks()).find((b) => b.id === '01JZZZZZZZZZZZZZZZZZZZZBLK')?.manual).toBe(false)
    const res = await call('owner', 'reservations.cancelBlock', { id: '01JZZZZZZZZZZZZZZZZZZZZBLK' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatchObject({ messageKey: 'errors.blockHasCause' })
  })
})
