// Faz 9 (P9a) through the one router, as a window or a phone calls it: housekeeping changes room states but closing
// a room for sale needs the block right; who may report, plan and resolve an issue follows the role matrix
// (src/shared/permissions.ts); photos go to the attachments folder with a sha256 and are deleted after the
// retention days while the issue text stays.
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { SYSTEM_ROLE_CODES, defaultPermissions, levelAllows } from '../../src/shared/permissions'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import type { DatabaseHandle } from '../../src/main/db/client'
import { attachments, roomTypes } from '../../src/main/db/schema'
import { createServices } from '../../src/main/services'
import { ctxFromPermissions, type Ctx } from '../../src/main/services/context'
import { roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

let handle: DatabaseHandle
const temps: string[] = []
afterEach(() => {
  handle?.close()
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-04T07:00:00.000Z')
  const dir = mkdtempSync(join(tmpdir(), 'bismuth-hk-'))
  temps.push(dir)
  const services = createServices(
    handle,
    { name: 'Bismuth', version: 'test', packaged: false, dataDir: dir, electron: null, chrome: null },
    { attachmentsDir: join(dir, 'attachments'), clock }
  )
  const api = createApiApp({ handlers: createHandlers(services) })
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = services.rooms.createRoom(roleCtx('owner'), {
    number: '501',
    floor: '5',
    roomTypeId: standard.id,
    beds: 2,
    validFrom: '2026-01-01'
  })
  const call = async (ctx: Ctx, name: string, body: unknown) => {
    const res = await handleIpcRequest(api, ctx, { path: `/api/${name}`, body: JSON.stringify(body) })
    return { status: res.status, body: JSON.parse(res.body) as Record<string, unknown> & { error?: never } }
  }
  return { services, call, room, clock, dir }
}

const code = (r: { body: unknown }) => (r.body as { error?: { code: string } }).error?.code

describe('oda durumu yetkisi', () => {
  it('temizlik odayı kirli → temiz yapar; bakıma almak blok yetkisi ister (403)', async () => {
    const { call, room } = await setup()
    const hk = roleCtx('housekeeping')
    expect((await call(hk, 'housekeeping.setStatus', { roomId: room.id, status: 'dirty' })).status).toBe(200)
    const clean = await call(hk, 'housekeeping.setStatus', {
      roomId: room.id,
      status: 'clean',
      note: 'Tamam'
    })
    expect(clean.body).toMatchObject({ hk: 'clean', hkNote: 'Tamam', block: null })
    const refused = await call(hk, 'housekeeping.setStatus', { roomId: room.id, status: 'maintenance' })
    expect(refused.status).toBe(403)
    expect(code(refused)).toBe('PERMISSION_DENIED')
    const reception = await call(roleCtx('reception'), 'housekeeping.setStatus', {
      roomId: room.id,
      status: 'out_of_order'
    })
    expect(reception.body).toMatchObject({ hk: 'out_of_order', block: { kind: 'ooo', source: 'hk_status' } })
  })

  it.each(SYSTEM_ROLE_CODES)(
    '%s: pano ve durum yazma matristeki "Oda durumu" düzeyine uyar',
    async (role) => {
      const { call, room } = await setup()
      const level = defaultPermissions(role)['rooms.status']
      const board = await call(roleCtx(role), 'housekeeping.board', {})
      expect(board.status).toBe(levelAllows(level, 'view') ? 200 : 403)
      const set = await call(roleCtx(role), 'housekeeping.setStatus', { roomId: room.id, status: 'dirty' })
      expect(set.status).toBe(levelAllows(level, 'edit') ? 200 : 403)
    }
  )
})

describe('arıza yetkisi (matrise göre)', () => {
  it.each(SYSTEM_ROLE_CODES)(
    '%s: arıza bildirme, planlama ve kapatma "Arızalar" düzeyine; odayı kapatma blok yetkisine bağlı',
    async (role) => {
      const { call, room } = await setup()
      const ctx = roleCtx(role)
      const perms = defaultPermissions(role)
      const canEdit = levelAllows(perms.room_issues, 'edit')
      const owner = roleCtx('owner')
      const made = await call(owner, 'housekeeping.reportIssue', { roomId: room.id, title: 'Ampul yanmıyor' })
      const id = made.body['id'] as string
      const report = await call(ctx, 'housekeeping.reportIssue', { roomId: room.id, title: 'Musluk' })
      expect(report.status).toBe(canEdit ? 200 : 403)
      const plan = await call(ctx, 'housekeeping.planIssue', { id, plannedDate: '2026-10-05' })
      expect(plan.status).toBe(canEdit ? 200 : 403)
      const resolve = await call(ctx, 'housekeeping.resolveIssue', { id, resolutionNote: 'Değişti' })
      expect(resolve.status).toBe(canEdit ? 200 : 403)
      const closing = await call(ctx, 'housekeeping.reportIssue', {
        roomId: room.id,
        title: 'Su kaçağı',
        blocksRoom: true
      })
      expect(closing.status).toBe(canEdit && levelAllows(perms['rooms.block'], 'edit') ? 200 : 403)
      const list = await call(ctx, 'housekeeping.issues', {})
      expect(list.status).toBe(levelAllows(perms.room_issues, 'view') ? 200 : 403)
    }
  )

  it('temizlik arızayı bildirir ve kapatır (Temizlik: Arızalar düzenler) ama odayı satışa kapatamaz', async () => {
    const { call, room } = await setup()
    const hk = roleCtx('housekeeping')
    const made = await call(hk, 'housekeeping.reportIssue', { roomId: room.id, title: 'Klozet kapağı kırık' })
    expect(made.status).toBe(200)
    const done = await call(hk, 'housekeeping.resolveIssue', {
      id: made.body['id'],
      resolutionNote: 'Değişti'
    })
    expect(done.body).toMatchObject({ status: 'resolved', resolutionNote: 'Değişti' })
    const closing = await call(hk, 'housekeeping.reportIssue', {
      roomId: room.id,
      title: 'Su kaçağı',
      blocksRoom: true
    })
    expect(closing.status).toBe(403)
  })
})

describe('arıza fotoğrafı (K-25)', () => {
  it('fotoğraf ekler klasörüne yazılır, DB yol + sha256 tutar; 30 gün sonra dosya silinir, arıza yazısı kalır', async () => {
    const { call, room, services, clock, dir } = await setup()
    const hk = roleCtx('housekeeping')
    const issue = await call(hk, 'housekeeping.reportIssue', {
      roomId: room.id,
      title: 'Klozet kapağı kırık'
    })
    const id = issue.body['id'] as string
    const added = await call(hk, 'attachments.add', {
      entity: 'room_issue',
      entityId: id,
      fileName: 'kapak.png',
      mime: 'image/png',
      dataBase64: PNG.toString('base64')
    })
    expect(added.status).toBe(200)
    const row = handle.db.select().from(attachments).where(eq(attachments.entityId, id)).get()!
    expect(row.path).toMatch(/^room_issue\/2026\/[0-9A-Z]{26}\.png$/)
    const file = join(dir, 'attachments', row.path)
    expect(createHash('sha256').update(readFileSync(file)).digest('hex')).toBe(row.sha256)
    const read = await call(hk, 'attachments.read', { id: row.id })
    expect(Buffer.from(read.body['dataBase64'] as string, 'base64').equals(PNG)).toBe(true)
    expect((await call(hk, 'housekeeping.issue', { id })).body['photos']).toBe(1)
    const wrong = await call(hk, 'attachments.add', {
      entity: 'room_issue',
      entityId: id,
      fileName: 'x.jpg',
      mime: 'image/jpeg',
      dataBase64: PNG.toString('base64')
    })
    expect(code(wrong)).toBe('VALIDATION')
    // Someone without the issues right cannot read the photo.
    expect((await call(roleCtx('accountant'), 'attachments.read', { id: row.id })).status).toBe(403)

    await call(hk, 'housekeeping.resolveIssue', { id })
    clock.set('2026-11-02T08:00:00.000Z') // 29 days later: kept
    expect(services.attachments.purgeResolvedIssueFiles(roleCtx('owner'))).toBe(0)
    expect(existsSync(file)).toBe(true)
    clock.set('2026-11-04T08:00:00.000Z') // 31 days later: the file goes
    expect(services.attachments.purgeResolvedIssueFiles(roleCtx('owner'))).toBe(1)
    expect(existsSync(file)).toBe(false)
    const after = await call(hk, 'housekeeping.issue', { id })
    expect(after.body).toMatchObject({ title: 'Klozet kapağı kırık', status: 'resolved', photos: 0 })
    const listed = await call(hk, 'attachments.list', { entity: 'room_issue', entityId: id })
    expect((listed.body as unknown as { deletedAt: string | null }[])[0]?.deletedAt).not.toBeNull()
  })

  it('çözülen arızanın fotoğrafı elle silinir; açık arızanınki silinmez', async () => {
    const { call, room } = await setup()
    const reception = roleCtx('reception')
    const issue = await call(reception, 'housekeeping.reportIssue', { roomId: room.id, title: 'Perde rayı' })
    const id = issue.body['id'] as string
    const added = await call(reception, 'attachments.add', {
      entity: 'room_issue',
      entityId: id,
      fileName: 'ray.png',
      mime: 'image/png',
      dataBase64: PNG.toString('base64')
    })
    const photo = added.body['id'] as string
    expect(code(await call(reception, 'attachments.deleteFile', { id: photo }))).toBe('CONFLICT')
    await call(reception, 'housekeeping.resolveIssue', { id })
    const gone = await call(reception, 'attachments.deleteFile', { id: photo })
    expect(gone.body['deletedAt']).not.toBeNull()
  })
})

describe('oda başına açık arıza özeti (P9fix #17)', () => {
  it('arıza yetkisi olmayan rol sayıyı ve önemi alır, arıza başlıklarını almaz', async () => {
    const { services, call, room } = await setup()
    services.roomIssues.create(roleCtx('owner'), { roomId: room.id, title: 'Klima su damlatıyor' })
    const perms = { ...defaultPermissions('housekeeping'), room_issues: 'none' as const }
    const noIssues = ctxFromPermissions('u-nobody', 'dev', 'ipc', perms)
    const summary = await call(noIssues, 'housekeeping.openIssuesByRoom', {})
    expect(summary.status).toBe(200)
    expect(summary.body).toEqual([expect.objectContaining({ roomId: room.id, count: 1, issues: [] })])
    const full = await call(roleCtx('reception'), 'housekeeping.openIssuesByRoom', {})
    expect(JSON.stringify(full.body)).toContain('Klima su damlatıyor')
  })
})
