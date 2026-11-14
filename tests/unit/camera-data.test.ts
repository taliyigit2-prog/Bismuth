// Camera data in Bismuth's own database (Faz 20 P20c; K-50…K-53, K-58): a face is taken from the camera and sealed, kept only
// while the guest is in the house, deleted for real at check-out / at the end of its keep time with an audit row (without the
// sealed bytes); alarms are pulled from the sidecar into `camera_events` once each, with a notification and, when the hotel
// asked for it, a Telegram message that never names a guest. A stand-in bridge answers like the Python sidecar does.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { defaultPermissions } from '@shared/permissions'
import {
  auditLog,
  cameraEvents,
  guestFaces,
  notifications,
  roles,
  roomTypes,
  staffFaces,
  stayOccupants,
  users
} from '../../src/main/db/schema'
import type { DatabaseHandle } from '../../src/main/db/client'
import type { CameraRuntime } from '../../src/main/camera'
import { createBridge, type BridgeFetch } from '../../src/main/camera/bridge'
import { createFaceCrypto } from '../../src/main/camera/crypto'
import type { FetchLike } from '../../src/main/network/http'
import { createServices } from '../../src/main/services'
import { ctxFromPermissions, systemCtx, type Ctx } from '../../src/main/services/context'
import { AppError } from '../../src/main/services/errors'
import { roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'
import { tempDataDir } from '../factories/runtime'

let handle: DatabaseHandle
afterEach(() => handle?.close())

const TOKEN = 'b'.repeat(32)
const BOT = '1234567:TESTtokenNotReal_abc'
const GUEST_NAME = 'Ayşe Gizlikişi'
/** Bytes that must never show up unsealed in a row, an audit row or a Telegram text. */
const CROP_MARK = 'SECRET-CROP-BYTES'
const jpeg = (mark = CROP_MARK): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(mark)])
const vector = (seed: number): Buffer => {
  const v = Buffer.alloc(2048)
  for (let i = 0; i < 512; i++) v.writeFloatLE(((i * seed) % 17) / 17 + 0.01, i * 4)
  return v
}

interface Alert {
  id: number
  alert_time: string
  track: number
  crop: string
}

function fakeSidecar() {
  const s = {
    boot: 'a'.repeat(32),
    alerts: [] as Alert[],
    puts: [] as { faces: { id: string; name: string; room: string; embedding: string }[] }[],
    extractBodies: [] as { image: string }[],
    alertQueries: [] as string[],
    captureStatus: 200,
    face: {
      embedding: vector(3).toString('base64'),
      crop: jpeg('LIVE-CROP').toString('base64'),
      model: 'buffalo_s'
    }
  }
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const fetch: BridgeFetch = (url, init) => {
    const u = new URL(url)
    const path = u.pathname
    if (path === '/api/alerts') {
      s.alertQueries.push(u.search)
      const after = u.searchParams.get('boot') === s.boot ? Number(u.searchParams.get('after') ?? 0) : 0
      return Promise.resolve(json(200, { boot: s.boot, alerts: s.alerts.filter((a) => a.id > after) }))
    }
    if (path === '/api/faces/active' && init.method === 'PUT') {
      s.puts.push(JSON.parse(init.body as string))
      return Promise.resolve(json(200, { ok: true, count: s.puts.at(-1)!.faces.length }))
    }
    if (path === '/api/faces/capture')
      return Promise.resolve(
        s.captureStatus === 200 ? json(200, s.face) : json(s.captureStatus, { detail: 'no_face' })
      )
    if (path === '/api/faces/extract') {
      s.extractBodies.push(JSON.parse(init.body as string))
      return Promise.resolve(json(200, s.face))
    }
    return Promise.resolve(json(404, {}))
  }
  return { s, fetch }
}

async function setup(opts: { sealer?: boolean } = {}) {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T09:00:00.000Z')
  const sidecar = fakeSidecar()
  const bridge = createBridge({ port: 51234, token: TOKEN, fetch: sidecar.fetch })
  const faceCrypto =
    opts.sealer === false ? createFaceCrypto('/nonexistent/key.bin', null) : createFaceCrypto(null, null)
  const telegram: { url: string; body: FormData | string }[] = []
  const telegramFetch: FetchLike = (url, init) => {
    telegram.push({ url, body: init.body as FormData | string })
    return Promise.resolve(new Response('{}', { status: 200 }))
  }
  const notices: { eventId: string; time: string; location: string }[] = []
  const services = createServices(
    handle,
    {
      name: 'Bismuth',
      version: '0.1.0',
      packaged: false,
      dataDir: tempDataDir(),
      electron: null,
      chrome: null
    },
    {
      clock,
      network: { fetch: telegramFetch },
      camera: {
        secretsFile: null,
        faceCrypto,
        alertMessage: ({ time, location }) => `Alarm ${time}${location ? ` ${location}` : ''}`,
        onAlert: (n) => notices.push(n)
      }
    }
  )
  const runtime = {
    apply: () => Promise.resolve(),
    restart: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    snapshot: () => ({ state: 'running' }) as ReturnType<CameraRuntime['snapshot']>,
    bridge: () => bridge
  } satisfies CameraRuntime
  services.camera.attach(runtime)

  // Accounts the rows point at (enrolled_by, seen_by, handled_by).
  for (const code of ['owner', 'reception'] as const) {
    const roleId = handle.db.select().from(roles).where(eq(roles.code, code)).get()!.id
    handle.db
      .insert(users)
      .values({
        id: `user-${code}`,
        username: code,
        displayName: code,
        roleId,
        passwordHash: 'x',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z'
      })
      .run()
  }
  const owner = roleCtx('owner')
  const reception = roleCtx('reception')
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = services.rooms.createRoom(owner, {
    number: '204',
    roomTypeId: standard.id,
    beds: 2,
    validFrom: '2026-01-01'
  })
  const channel = services.lists.list(owner, 'salesChannels').find((c) => c.code === 'direct')!
  /** A guest staying in room 204 from today. */
  const stay = (first = 'Ayşe', last = 'Gizlikişi', roomId = room.id) => {
    const d = services.reservations.create(reception, {
      guest: { firstName: first, lastName: last, phone: '0532 000 00 00' },
      channelId: channel.id,
      stays: [{ roomId, checkIn: '2026-10-01', checkOut: '2026-10-04', nightlyPriceMinor: 200_000 }]
    })
    const stayId = d.stays[0]!.id
    services.reservations.checkIn(reception, stayId)
    const occupant = handle.db
      .select()
      .from(stayOccupants)
      .where(eq(stayOccupants.reservationRoomId, stayId))
      .get()!
    return { stayId, guestId: occupant.guestId as string }
  }
  /** Another free room, for a second guest in the house. */
  const spareRoom = (number: string): string =>
    services.rooms.createRoom(owner, { number, roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' }).id
  const settings = (patch: Record<string, unknown>) => services.settings.set(owner, patch as never)
  const phone: Ctx = ctxFromPermissions('user-owner', 'phone', 'http', defaultPermissions('owner'))
  return {
    services,
    sidecar,
    faceCrypto,
    telegram,
    notices,
    clock,
    owner,
    reception,
    phone,
    stay,
    spareRoom,
    settings,
    room
  }
}

const code = async (fn: () => unknown): Promise<string> => {
  try {
    await fn()
    return 'ok'
  } catch (error) {
    return error instanceof AppError ? `${error.code}:${error.messageKey}` : 'other'
  }
}

const faces = () => handle.db.select().from(guestFaces).all()
const events = () => handle.db.select().from(cameraEvents).all()
const audit = (entity: string) => handle.db.select().from(auditLog).where(eq(auditLog.entity, entity)).all()

describe('kameradan yüz al (K-53)', () => {
  it('otelde kalan misafir için yüz şifreli yazılır; denetim kaydında bayt yok; yan sürece liste gider', async () => {
    const { services, sidecar, faceCrypto, owner, stay } = await setup()
    const { guestId } = stay()
    const status = await services.camera.enrollFace(owner, { guestId })
    expect(status).toMatchObject({ inHouse: true, count: 1, max: 5, keyStore: true })
    expect(status.crop).toMatch(/^data:image\/jpeg;base64,/)

    const [row] = faces()
    expect(row).toMatchObject({ guestId, model: 'buffalo_s', enrolledBy: 'user-owner', expiresAt: null })
    // Sealed: neither column holds the plain vector or the plain picture; a blob opens only under its own context.
    expect(row!.embeddingEnc.includes(vector(3))).toBe(false)
    expect(row!.embeddingEnc[0]).toBe(1)
    expect(faceCrypto.decrypt(row!.embeddingEnc, `guest_faces:embedding:${row!.id}`).equals(vector(3))).toBe(
      true
    )
    expect(() => faceCrypto.decrypt(row!.embeddingEnc, `guest_faces:crop:${row!.id}`)).toThrow()

    const rows = audit('guest_face')
    expect(rows.map((r) => [r.action, r.reason])).toEqual([['create', 'camera']])
    expect(JSON.stringify(rows)).not.toContain(vector(3).toString('base64').slice(0, 40))
    expect(JSON.stringify(rows)).not.toContain('LIVE-CROP')

    // The sidecar got the face of the guest who is in the house, with the label (name, room) from Bismuth.
    expect(sidecar.s.puts.at(-1)!.faces).toEqual([
      { id: row!.id, name: GUEST_NAME, room: '204', embedding: vector(3).toString('base64') }
    ])
  })

  it('otelde olmayan misafir, anahtar deposu yok, yüz sınırı, kamerada yüz yok: açık hata, satır yok', async () => {
    const { services, sidecar, owner, stay, phone } = await setup()
    const { guestId } = stay()
    // A guest who never checked in.
    const other = services.guests.create(owner, { firstName: 'Can', lastName: 'Örnek' })
    expect(await code(() => services.camera.enrollFace(owner, { guestId: other.id }))).toBe(
      'CONFLICT:errors.cameraGuestNotInHouse'
    )
    sidecar.s.captureStatus = 400
    expect(await code(() => services.camera.enrollFace(owner, { guestId }))).toBe(
      'CONFLICT:errors.cameraNoFace'
    )
    sidecar.s.captureStatus = 200
    expect(await code(() => services.camera.enrollFace(phone, { guestId }))).toBe(
      'PERMISSION_DENIED:errors.remoteLocalOnly'
    )
    for (let i = 0; i < 5; i++) await services.camera.enrollFace(owner, { guestId })
    expect(await code(() => services.camera.enrollFace(owner, { guestId }))).toBe(
      'CONFLICT:errors.cameraFaceLimit'
    )
    expect(faces()).toHaveLength(5)

    const bare = await setup({ sealer: false })
    const { guestId: g2 } = bare.stay()
    expect(bare.services.camera.faceStatus(bare.owner, { guestId: g2 }).keyStore).toBe(false)
    expect(await code(() => bare.services.camera.enrollFace(bare.owner, { guestId: g2 }))).toBe(
      'CONFLICT:errors.cameraNoKeyStore'
    )
    expect(faces()).toHaveLength(0)
  })

  it('yetkisiz rol (housekeeping) yüz alamaz, silemez, aday listesini ve alarm resmini göremez', async () => {
    const { services, stay } = await setup()
    const { guestId } = stay()
    const hk = roleCtx('housekeeping')
    for (const run of [
      () => services.camera.enrollFace(hk, { guestId }),
      () => services.camera.deleteFaces(hk, { guestId }),
      () => services.camera.faceStatus(hk, { guestId }),
      () => services.camera.candidates(hk),
      () => services.camera.alertCrop(hk, { id: '0'.repeat(26) }),
      () => services.camera.saveAlertAsGuest(hk, { id: '0'.repeat(26), guestId })
    ])
      expect(await code(run)).toMatch(/^PERMISSION_DENIED/)
  })

  it('elle silme: tüm yüz satırları gerçekten silinir, denetim kaydı yazılır, yan sürecin listesi boşalır', async () => {
    const { services, sidecar, owner, stay } = await setup()
    const { guestId } = stay()
    await services.camera.enrollFace(owner, { guestId })
    await services.camera.enrollFace(owner, { guestId })
    const out = await services.camera.deleteFaces(owner, { guestId })
    expect(out.count).toBe(0)
    expect(faces()).toHaveLength(0)
    expect(
      audit('guest_face')
        .filter((r) => r.action === 'delete')
        .map((r) => r.reason)
    ).toEqual(['manual', 'manual'])
    expect(sidecar.s.puts.at(-1)!.faces).toEqual([])
  })
})

describe('çıkışta silme (K-52)', () => {
  it('çıkış yapınca yüz satırı fiziksel silinir; denetim kaydında "checkout" var, bayt yok; sonraki turda liste boşalır', async () => {
    const { services, sidecar, owner, reception, stay, clock } = await setup()
    const { guestId, stayId } = stay()
    await services.camera.enrollFace(owner, { guestId })
    expect(faces()).toHaveLength(1)

    clock.set('2026-10-01T15:00:00.000Z')
    services.reservations.checkOut(reception, stayId)
    expect(faces()).toHaveLength(0)
    const del = audit('guest_face').filter((r) => r.action === 'delete')
    expect(del.map((r) => r.reason)).toEqual(['checkout'])
    expect(del[0]!.beforeJson).toContain(guestId)
    expect(JSON.stringify(handle.db.select().from(auditLog).all())).not.toContain(
      vector(3).toString('base64').slice(0, 40)
    )

    await services.camera.tick(systemCtx())
    expect(sidecar.s.puts.at(-1)!.faces).toEqual([])
  })

  it('saklama süresi > 0: çıkışta bitiş tarihi konur, tarih gelince saklama işi siler (sayı denetim kaydında)', async () => {
    const { services, settings, owner, reception, stay, clock } = await setup()
    settings({ 'camera.faceRetentionDays': 2 })
    const { guestId, stayId } = stay()
    await services.camera.enrollFace(owner, { guestId })
    clock.set('2026-10-01T15:00:00.000Z')
    services.reservations.checkOut(reception, stayId)
    const [row] = faces()
    expect(row!.expiresAt).toBe('2026-10-03T15:00:00.000Z')

    clock.set('2026-10-03T14:00:00.000Z')
    expect(services.camera.purge(systemCtx())).toEqual({ faces: 0, crops: 0, staff: 0 })
    expect(faces()).toHaveLength(1)
    clock.set('2026-10-03T15:00:01.000Z')
    expect(services.camera.purge(systemCtx())).toEqual({ faces: 1, crops: 0, staff: 0 })
    expect(faces()).toHaveLength(0)
    expect(
      audit('guest_face')
        .filter((r) => r.action === 'delete')
        .map((r) => r.reason)
    ).toEqual(['retention'])
  })

  it('çıkışı görmeyen bir yoldan ayrılan misafirin yüzü saklama işiyle silinir', async () => {
    const { services, owner, stay, clock } = await setup()
    const { guestId, stayId } = stay()
    await services.camera.enrollFace(owner, { guestId })
    // The stay ends without the check-out transaction (e.g. a data repair): the guest is no longer in the house.
    handle.sqlite.prepare("update reservation_rooms set status = 'done' where id = ?").run(stayId)
    clock.advance(10)
    expect(services.camera.purge(systemCtx()).faces).toBe(1)
    expect(faces()).toHaveLength(0)
  })

  it('başka bir konaklamada hâlâ içerideki misafirin yüzü çıkışta silinmez', async () => {
    const { services, owner, reception, stay, room, clock } = await setup()
    const { guestId, stayId } = stay()
    await services.camera.enrollFace(owner, { guestId })
    // The same guest also has an in-house stay of another room (a second reservation): leaving one keeps the face.
    const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
    const room2 = services.rooms.createRoom(owner, {
      number: '205',
      roomTypeId: standard.id,
      beds: 2,
      validFrom: '2026-01-01'
    })
    const channel = services.lists.list(owner, 'salesChannels').find((c) => c.code === 'direct')!
    const second = services.reservations.create(reception, {
      guest: { id: guestId },
      channelId: channel.id,
      stays: [{ roomId: room2.id, checkIn: '2026-10-01', checkOut: '2026-10-04', nightlyPriceMinor: 200_000 }]
    })
    services.reservations.checkIn(reception, second.stays[0]!.id)
    expect(room.id).not.toBe(room2.id)
    clock.advance(60)
    services.reservations.checkOut(reception, stayId)
    expect(faces()).toHaveLength(1)
  })
})

describe('alarm → Bismuth (K-50, K-52)', () => {
  const alert = (id: number, time = '2026-10-01T11:30:00', mark = CROP_MARK): Alert => ({
    id,
    alert_time: time,
    track: 40 + id,
    crop: jpeg(mark).toString('base64')
  })

  it('alarm tabloya şifreli kırpmayla yazılır; bildirim + denetim; aynı alarm iki kez yazılmaz; yan süreç yeniden başlarsa yeni sayılır', async () => {
    const { services, sidecar, notices, owner, settings } = await setup()
    settings({ 'camera.location': 'Merdiven' })
    sidecar.s.alerts = [alert(1), alert(2, '2026-10-01T11:45:00')]
    expect(await services.camera.tick(systemCtx())).toMatchObject({ alerts: 2 })
    expect(await services.camera.tick(systemCtx())).toMatchObject({ alerts: 0 })

    const rows = events()
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.sourceRef).sort()).toEqual([`${'a'.repeat(32)}:1`, `${'a'.repeat(32)}:2`])
    const first = rows.find((r) => r.sourceRef?.endsWith(':1'))!
    expect(first).toMatchObject({ kind: 'alarm', state: 'new', trackRef: '41' })
    expect(first.occurredAt).toBe(new Date('2026-10-01T11:30:00').toISOString())
    expect(first.expiresAt).toBe(
      new Date(new Date('2026-10-01T11:30:00').getTime() + 3 * 86_400_000).toISOString()
    )
    expect(first.cropEnc!.includes(Buffer.from(CROP_MARK))).toBe(false)

    const notes = handle.db
      .select()
      .from(notifications)
      .all()
      .filter((n) => n.kind === 'camera_alert')
    expect(notes.map((n) => [n.title, n.refId]).sort()).toEqual(
      rows.map((r) => ['main.camera.alertTitle', r.id]).sort()
    )
    expect(audit('camera_event').filter((r) => r.action === 'create')).toHaveLength(2)
    expect(JSON.stringify(handle.db.select().from(auditLog).all())).not.toContain(CROP_MARK)
    expect(notices).toHaveLength(2)
    expect(notices[0]).toMatchObject({ time: '11:30', location: 'Merdiven' })
    // The second round asked only for what is newer, and told the sidecar which run it knew.
    expect(sidecar.s.alertQueries.at(-1)).toBe(`?after=2&limit=50&boot=${'a'.repeat(32)}`)

    // A restarted sidecar counts from 1 again under a new boot id: those are new alarms, not repeats.
    sidecar.s.boot = 'c'.repeat(32)
    sidecar.s.alerts = [alert(1, '2026-10-01T12:10:00')]
    expect(await services.camera.tick(systemCtx())).toMatchObject({ alerts: 1 })
    expect(events()).toHaveLength(3)
    // …and it knows no faces yet: the list is sent again.
    expect(sidecar.s.puts.length).toBeGreaterThanOrEqual(2)

    // The list reads from the table, newest first, in local time.
    const list = services.camera.alerts(owner)
    expect(list.alerts.map((a) => a.at)).toEqual([
      '2026-10-01T12:10:00',
      '2026-10-01T11:45:00',
      '2026-10-01T11:30:00'
    ])
    expect(list.alerts.every((a) => a.hasCrop && !a.linked)).toBe(true)
  })

  it('telefon yalnız kimlik, zaman ve durum görür; kırpma bilgisi ve resim yok (S-108)', async () => {
    const { services, sidecar, phone } = await setup()
    sidecar.s.alerts = [alert(1)]
    await services.camera.tick(systemCtx())
    const out = services.camera.alerts(phone)
    expect(out.alerts).toHaveLength(1)
    expect(out.alerts[0]).toMatchObject({ hasCrop: false, state: 'new' })
    expect(JSON.stringify(out)).not.toContain('crop')
    const id = out.alerts[0]!.id
    expect(await code(() => services.camera.alertCrop(phone, { id }))).toBe(
      'PERMISSION_DENIED:errors.remoteLocalOnly'
    )
  })

  it('Telegram açıkken fotoğraflı mesaj gider; mesajda misafir adı yok (otelde adı bilinen misafir olsa da)', async () => {
    const { services, sidecar, telegram, owner, stay, settings } = await setup()
    await services.camera.setSecrets(owner, { telegramToken: BOT, telegramChatIds: '42' })
    settings({ 'network.enabled': true, 'camera.telegram.enabled': true, 'camera.location': 'Merdiven' })
    const { guestId } = stay()
    await services.camera.enrollFace(owner, { guestId }) // the guest's name is in the sidecar's memory now

    sidecar.s.alerts = [alert(1)]
    await services.camera.tick(systemCtx())
    expect(telegram).toHaveLength(1)
    expect(telegram[0]!.url).toBe(`https://api.telegram.org/bot${BOT}/sendPhoto`)
    const form = telegram[0]!.body as FormData
    expect(form.get('caption')).toBe('Alarm 11:30 Merdiven')
    expect(
      Buffer.from(await (form.get('photo') as Blob).arrayBuffer()).includes(Buffer.from(CROP_MARK))
    ).toBe(true)
    expect(String(form.get('caption'))).not.toContain('Ayşe')
    expect(String(form.get('caption'))).not.toContain(GUEST_NAME)
    expect(JSON.stringify([...form.entries()].filter(([k]) => k !== 'photo'))).not.toMatch(/Ayşe|Gizli|204/)

    // Photo off: a text message only.
    settings({ 'camera.telegram.photo': false })
    sidecar.s.alerts = [alert(1), alert(2, '2026-10-01T11:50:00')]
    await services.camera.tick(systemCtx())
    expect(telegram).toHaveLength(2)
    expect(telegram[1]!.url).toBe(`https://api.telegram.org/bot${BOT}/sendMessage`)
    expect(String(telegram[1]!.body)).not.toMatch(/Ayşe|Gizli/)
  })

  it('ağ kapalıyken Telegram isteği çıkmaz ama alarm tabloya ve bildirim merkezine yine düşer', async () => {
    const { services, sidecar, telegram, owner, settings } = await setup()
    await services.camera.setSecrets(owner, { telegramToken: BOT, telegramChatIds: '42' })
    settings({ 'network.enabled': false, 'camera.telegram.enabled': true })
    sidecar.s.alerts = [alert(1)]
    await services.camera.tick(systemCtx())
    expect(telegram).toHaveLength(0)
    expect(events()).toHaveLength(1)
    expect(
      handle.db
        .select()
        .from(notifications)
        .all()
        .filter((n) => n.kind === 'camera_alert')
    ).toHaveLength(1)
  })

  it('anahtar deposu yoksa alarm yine yazılır, kırpma tutulmaz (düz kırpma asla yazılmaz)', async () => {
    const { services, sidecar } = await setup({ sealer: false })
    sidecar.s.alerts = [alert(1)]
    expect(await services.camera.tick(systemCtx())).toMatchObject({ alerts: 1 })
    expect(events()[0]).toMatchObject({ cropEnc: null, expiresAt: null })
  })

  it('bozuk yan süreç yanıtı (boot yok, kırpma JPEG değil) hiçbir şey yazmaz ya da kırpmasız yazar', async () => {
    const { services, sidecar } = await setup()
    sidecar.s.alerts = [
      { id: 1, alert_time: 'dün', track: 1, crop: Buffer.from('jpeg değil').toString('base64') }
    ]
    expect(await services.camera.tick(systemCtx())).toMatchObject({ alerts: 1 })
    expect(events()[0]!.cropEnc).toBeNull()
    expect(Number.isNaN(new Date(events()[0]!.occurredAt).getTime())).toBe(false)
  })

  it('alarm kırpması saklama süresi (camera.alertRetentionDays) sonunda silinir; olay satırı kalır; sayı denetim kaydında', async () => {
    const { services, sidecar, clock } = await setup()
    sidecar.s.alerts = [alert(1, '2026-10-01T11:30:00')]
    await services.camera.tick(systemCtx())
    clock.set(new Date(new Date('2026-10-01T11:30:00').getTime() + 2 * 86_400_000).toISOString())
    expect(services.camera.purge(systemCtx())).toEqual({ faces: 0, crops: 0, staff: 0 })
    clock.set(new Date(new Date('2026-10-01T11:30:00').getTime() + 3 * 86_400_000 + 1000).toISOString())
    expect(services.camera.purge(systemCtx())).toEqual({ faces: 0, crops: 1, staff: 0 })
    expect(events()).toHaveLength(1)
    expect(events()[0]!.cropEnc).toBeNull()
    expect(
      audit('camera_event')
        .filter((r) => r.action === 'delete')
        .map((r) => r.afterJson)
    ).toEqual(['{"crops":1}'])
    // Nothing left to delete: a second pass writes no audit row.
    services.camera.purge(systemCtx())
    expect(audit('camera_event').filter((r) => r.action === 'delete')).toHaveLength(1)
  })
})

describe('alarm işaretleri ve "misafir olarak kaydet"', () => {
  const sealedAlert = (id = 1): Alert => ({
    id,
    alert_time: '2026-10-01T11:30:00',
    track: 7,
    crop: jpeg('ALERT-FACE').toString('base64')
  })

  it('işaretler tabloda kalır: görüldü/halledildi kim ve ne zaman; yeni yapılınca sıfırlanır; denetim kaydı düşer', async () => {
    const { services, sidecar, reception } = await setup()
    sidecar.s.alerts = [sealedAlert()]
    await services.camera.tick(systemCtx())
    const id = events()[0]!.id
    await services.camera.markAlert(reception, { id, state: 'seen' })
    expect(events()[0]).toMatchObject({ state: 'seen', seenBy: 'user-reception', handledBy: null })
    await services.camera.markAlert(reception, { id, state: 'handled' })
    expect(events()[0]).toMatchObject({ state: 'handled', handledBy: 'user-reception' })
    expect(services.camera.alerts(reception).alerts[0]!.state).toBe('handled')
    await services.camera.markAlert(reception, { id, state: 'new' })
    expect(events()[0]).toMatchObject({ state: 'new', seenBy: null, handledBy: null, handledAt: null })
    expect(audit('camera_alert')).toHaveLength(3)
    expect(
      await code(() => services.camera.markAlert(reception, { id: '0'.repeat(26), state: 'seen' }))
    ).toMatch(/^NOT_FOUND/)
  })

  it('alarmdaki yüz, otelde kalan misafire bağlanır: kırpma açılıp yan sürece verilir, yüz satırı + olay bağı + halledildi', async () => {
    const { services, sidecar, faceCrypto, owner, stay } = await setup()
    const { guestId } = stay()
    sidecar.s.alerts = [sealedAlert()]
    await services.camera.tick(systemCtx())
    const id = events()[0]!.id
    expect(services.camera.alertCrop(owner, { id }).crop).toBe(
      `data:image/jpeg;base64,${jpeg('ALERT-FACE').toString('base64')}`
    )
    expect(services.camera.candidates(owner)).toEqual([{ guestId, name: GUEST_NAME, room: '204', faces: 0 }])

    await services.camera.saveAlertAsGuest(owner, { id, guestId })
    expect(Buffer.from(sidecar.s.extractBodies[0]!.image, 'base64').equals(jpeg('ALERT-FACE'))).toBe(true)
    const [row] = faces()
    expect(row).toMatchObject({ guestId, enrolledBy: 'user-owner' })
    expect(faceCrypto.decrypt(row!.embeddingEnc, `guest_faces:embedding:${row!.id}`).equals(vector(3))).toBe(
      true
    )
    expect(events()[0]).toMatchObject({ guestId, state: 'handled', handledBy: 'user-owner' })
    expect(audit('guest_face').map((r) => r.reason)).toEqual(['alert'])
    expect(services.camera.alerts(owner).alerts[0]).toMatchObject({ linked: true, state: 'handled' })
    expect(sidecar.s.puts.at(-1)!.faces.map((f) => f.name)).toEqual([GUEST_NAME])
  })

  it('yüz sınırı dolmuşsa alarm bağlanmaz: yüz satırı da olay güncellemesi de yazılmaz (tek işlem)', async () => {
    const { services, sidecar, owner, stay } = await setup()
    const { guestId } = stay()
    for (let i = 0; i < 5; i++) await services.camera.enrollFace(owner, { guestId })
    sidecar.s.alerts = [sealedAlert()]
    await services.camera.tick(systemCtx())
    const id = events()[0]!.id
    expect(await code(() => services.camera.saveAlertAsGuest(owner, { id, guestId }))).toBe(
      'CONFLICT:errors.cameraFaceLimit'
    )
    expect(faces()).toHaveLength(5)
    expect(events()[0]).toMatchObject({ guestId: null, state: 'new' })
  })

  it('otelde olmayan misafire ya da silinmiş kırpmaya bağlanamaz', async () => {
    const { services, sidecar, owner, stay, clock } = await setup()
    const { guestId } = stay()
    const outsider = services.guests.create(owner, { firstName: 'Dışarıdan', lastName: 'Biri' })
    sidecar.s.alerts = [sealedAlert()]
    await services.camera.tick(systemCtx())
    const id = events()[0]!.id
    expect(await code(() => services.camera.saveAlertAsGuest(owner, { id, guestId: outsider.id }))).toBe(
      'CONFLICT:errors.cameraGuestNotInHouse'
    )
    clock.set('2026-10-10T00:00:00.000Z')
    services.camera.purge(systemCtx())
    expect(await code(() => services.camera.saveAlertAsGuest(owner, { id, guestId }))).toBe(
      'CONFLICT:errors.cameraCropGone'
    )
    expect(services.camera.alertCrop(owner, { id }).crop).toBeNull()
    expect(faces()).toHaveLength(0)
  })
})

describe('yan sürece eşitleme', () => {
  it('liste yalnız değişince gönderilir; yan süreç yeniden başlarsa (yeni boot) yeniden gönderilir; yeni misafir adı odası değişince güncellenir', async () => {
    const { services, sidecar, owner, stay } = await setup()
    const { guestId } = stay()
    await services.camera.enrollFace(owner, { guestId })
    await services.camera.tick(systemCtx()) // learns the sidecar's run (boot) and sends the list for it
    const after = sidecar.s.puts.length
    await services.camera.tick(systemCtx())
    expect(sidecar.s.puts).toHaveLength(after) // nothing changed
    sidecar.s.boot = 'd'.repeat(32)
    await services.camera.tick(systemCtx())
    expect(sidecar.s.puts).toHaveLength(after + 1)
    expect(sidecar.s.puts.at(-1)!.faces).toHaveLength(1)
  })

  it('yan süreç çalışmıyorsa tur sessizce hiçbir şey yapmaz', async () => {
    const { services } = await setup()
    services.camera.attach(null)
    expect(await services.camera.tick(systemCtx())).toEqual({ alerts: 0, pushed: false })
  })
})

describe('geri dönen misafirin yüzü (P21e, K-52)', () => {
  it('saklama süresi > 0: önceki konaklamadan kalan bitiş tarihi, yeniden içeride olan misafirin yüzünü silmez; yeni çıkışta yeni tarih konur', async () => {
    const { services, settings, owner, reception, stay, room, clock } = await setup()
    settings({ 'camera.faceRetentionDays': 2 })
    const { guestId, stayId } = stay()
    await services.camera.enrollFace(owner, { guestId })
    clock.set('2026-10-01T15:00:00.000Z')
    services.reservations.checkOut(reception, stayId)
    expect(faces()[0]!.expiresAt).toBe('2026-10-03T15:00:00.000Z')

    // The same guest is back in the house (another stay) before the old date comes.
    const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
    const room2 = services.rooms.createRoom(owner, {
      number: '205',
      roomTypeId: standard.id,
      beds: 2,
      validFrom: '2026-01-01'
    })
    const channel = services.lists.list(owner, 'salesChannels').find((c) => c.code === 'direct')!
    const back = services.reservations.create(reception, {
      guest: { id: guestId },
      channelId: channel.id,
      stays: [{ roomId: room2.id, checkIn: '2026-10-01', checkOut: '2026-10-06', nightlyPriceMinor: 200_000 }]
    })
    services.reservations.checkIn(reception, back.stays[0]!.id)
    expect(room.id).not.toBe(room2.id)

    clock.set('2026-10-03T16:00:00.000Z')
    expect(services.camera.purge(systemCtx())).toEqual({ faces: 0, crops: 0, staff: 0 })
    expect(faces()).toHaveLength(1)
    expect(faces()[0]!.expiresAt).toBeNull()
    expect(
      audit('guest_face').filter((r) => r.action === 'update' && r.reason === 'back in house')
    ).toHaveLength(1)

    clock.set('2026-10-04T10:00:00.000Z')
    services.reservations.checkOut(reception, back.stays[0]!.id)
    expect(faces()[0]!.expiresAt).toBe('2026-10-06T10:00:00.000Z')
  })
})

describe('personel dışlama listesi (S-107, K-58)', () => {
  const employee = (services: Awaited<ReturnType<typeof setup>>['services'], owner: Ctx, last = 'Personel') =>
    services.staff.createEmployee(owner, {
      firstName: 'Hasan',
      lastName: last,
      position: 'Resepsiyon',
      startDate: '2026-01-01'
    })

  it('kameradan yüz alınır: vektör şifreli, kırpma yok, denetimde bayt yok; yan sürece adsız ve odasız "personel" yüzü gider', async () => {
    const { services, sidecar, faceCrypto, owner } = await setup()
    const person = employee(services, owner)
    expect(services.camera.staffList(owner)).toMatchObject({ listed: [], keyStore: true, max: 3 })
    expect(services.camera.staffList(owner).others.map((p) => p.employeeId)).toEqual([person.id])

    const out = await services.camera.enrollStaff(owner, { employeeId: person.id })
    expect(out.listed).toEqual([
      { employeeId: person.id, name: 'Hasan Personel', position: 'Resepsiyon', faces: 1 }
    ])
    expect(out.others).toEqual([])
    const [row] = handle.db.select().from(staffFaces).all()
    expect(row).toMatchObject({ employeeId: person.id, model: 'buffalo_s', enrolledBy: 'user-owner' })
    expect(row!.embeddingEnc.includes(vector(3))).toBe(false)
    expect(faceCrypto.decrypt(row!.embeddingEnc, `staff_faces:embedding:${row!.id}`).equals(vector(3))).toBe(
      true
    )
    // A guest's context does not open it.
    expect(() => faceCrypto.decrypt(row!.embeddingEnc, `guest_faces:embedding:${row!.id}`)).toThrow()
    const rows = audit('staff_face')
    expect(rows.map((r) => [r.action, r.reason])).toEqual([['create', 'camera']])
    expect(JSON.stringify(rows)).not.toContain(vector(3).toString('base64').slice(0, 40))
    expect(JSON.stringify(rows)).not.toContain('LIVE-CROP')

    expect(sidecar.s.puts.at(-1)!.faces).toEqual([
      { id: `staff:${row!.id}`, name: '', room: '', embedding: vector(3).toString('base64') }
    ])
  })

  it('listeden çıkarınca satırlar gerçekten silinir (denetim: staff-removed), yan sürecin listesi boşalır', async () => {
    const { services, sidecar, owner } = await setup()
    const person = employee(services, owner)
    await services.camera.enrollStaff(owner, { employeeId: person.id })
    await services.camera.enrollStaff(owner, { employeeId: person.id })
    const out = await services.camera.removeStaff(owner, { employeeId: person.id })
    expect(out.listed).toEqual([])
    expect(handle.db.select().from(staffFaces).all()).toHaveLength(0)
    expect(
      audit('staff_face')
        .filter((r) => r.action === 'delete')
        .map((r) => r.reason)
    ).toEqual(['staff-removed', 'staff-removed'])
    expect(sidecar.s.puts.at(-1)!.faces).toEqual([])
  })

  it('işten ayrılan personelin yüzü saklama işiyle silinir ve yan sürece gitmez; yüz sınırı 3', async () => {
    const { services, sidecar, owner, clock } = await setup()
    const person = employee(services, owner)
    for (let i = 0; i < 3; i++) await services.camera.enrollStaff(owner, { employeeId: person.id })
    expect(await code(() => services.camera.enrollStaff(owner, { employeeId: person.id }))).toBe(
      'CONFLICT:errors.cameraFaceLimit'
    )
    handle.sqlite.prepare("update employees set end_date = '2026-10-02' where id = ?").run(person.id)
    // The day the person leaves is still employed; the day after, the face is not sent and the job deletes it.
    await services.camera.tick(systemCtx())
    expect(sidecar.s.puts.at(-1)!.faces).toHaveLength(3)
    clock.set('2026-10-03T09:00:00.000Z')
    await services.camera.tick(systemCtx(), { force: true })
    expect(sidecar.s.puts.at(-1)!.faces).toEqual([])
    expect(services.camera.purge(systemCtx())).toEqual({ faces: 0, crops: 0, staff: 3 })
    expect(handle.db.select().from(staffFaces).all()).toHaveLength(0)
    expect(
      audit('staff_face')
        .filter((r) => r.action === 'delete')
        .map((r) => r.reason)
    ).toEqual(['staff-left', 'staff-left', 'staff-left'])
    expect(await code(() => services.camera.enrollStaff(owner, { employeeId: person.id }))).toBe(
      'CONFLICT:errors.cameraStaffLeft'
    )
    expect(services.camera.staffList(owner).others).toEqual([])
  })

  it('pasif yapılan personelin yüzü yan sürece gitmez ve saklama işiyle silinir', async () => {
    const { services, sidecar, owner } = await setup()
    const person = employee(services, owner)
    await services.camera.enrollStaff(owner, { employeeId: person.id })
    handle.sqlite.prepare('update employees set active = 0 where id = ?').run(person.id)
    await services.camera.tick(systemCtx(), { force: true })
    expect(sidecar.s.puts.at(-1)!.faces).toEqual([])
    expect(services.camera.purge(systemCtx())).toMatchObject({ staff: 1 })
    expect(handle.db.select().from(staffFaces).all()).toHaveLength(0)
  })

  it('bilinmeyen personel, telefon, anahtar deposu yok, kamerada yüz yok, yetkisiz rol: açık hata, satır yok', async () => {
    const { services, sidecar, owner, phone } = await setup()
    const person = employee(services, owner)
    expect(await code(() => services.camera.enrollStaff(owner, { employeeId: 'none' }))).toBe(
      'NOT_FOUND:errors.notFound'
    )
    expect(await code(() => services.camera.enrollStaff(phone, { employeeId: person.id }))).toBe(
      'PERMISSION_DENIED:errors.remoteLocalOnly'
    )
    // the staff list (who is on the exclusion list) is biometric too: not served to a phone either
    expect(await code(() => services.camera.staffList(phone))).toBe(
      'PERMISSION_DENIED:errors.remoteLocalOnly'
    )
    sidecar.s.captureStatus = 400
    expect(await code(() => services.camera.enrollStaff(owner, { employeeId: person.id }))).toBe(
      'CONFLICT:errors.cameraNoFace'
    )
    const hk = roleCtx('housekeeping')
    for (const run of [
      () => services.camera.staffList(hk),
      () => services.camera.enrollStaff(hk, { employeeId: person.id }),
      () => services.camera.removeStaff(hk, { employeeId: person.id })
    ])
      expect(await code(run)).toMatch(/^PERMISSION_DENIED/)
    expect(handle.db.select().from(staffFaces).all()).toHaveLength(0)
    const none = await setup({ sealer: false })
    const p2 = employee(none.services, none.owner)
    expect(await code(() => none.services.camera.enrollStaff(none.owner, { employeeId: p2.id }))).toBe(
      'CONFLICT:errors.cameraNoKeyStore'
    )
  })
})

describe('imha raporu (K-52, K-58)', () => {
  it('seçilen günlerdeki silmeleri nedenine göre sayar (çıkış, süre sonu, elle, personel, alarm resmi); aralık dışı ve sonrası sayılmaz; elde kalanlar ve kurallar yazılır', async () => {
    const { services, settings, owner, reception, stay, spareRoom, clock, sidecar } = await setup()
    const first = stay('Ayşe', 'Gizlikişi')
    await services.camera.enrollFace(owner, { guestId: first.guestId })
    // Check-out deletes at once (retention 0): one "checkout".
    clock.set('2026-10-01T15:00:00.000Z')
    services.reservations.checkOut(reception, first.stayId)
    // A face deleted by hand.
    const second = stay('Can', 'Örnek', spareRoom('301'))
    await services.camera.enrollFace(owner, { guestId: second.guestId })
    await services.camera.deleteFaces(owner, { guestId: second.guestId })
    // A staff face taken off the list.
    const person = services.staff.createEmployee(owner, {
      firstName: 'Hasan',
      lastName: 'P',
      startDate: '2026-01-01'
    })
    await services.camera.enrollStaff(owner, { employeeId: person.id })
    await services.camera.removeStaff(owner, { employeeId: person.id })
    // An alarm picture past its time.
    sidecar.s.alerts = [
      { id: 1, alert_time: '2026-10-01T11:30:00', track: 41, crop: jpeg().toString('base64') }
    ]
    await services.camera.tick(systemCtx())
    clock.set('2026-10-05T12:00:00.000Z')
    services.camera.purge(systemCtx())
    // One more face, still held, with retention on.
    settings({ 'camera.faceRetentionDays': 7 })
    const third = stay('Zeynep', 'Kalan', spareRoom('302'))
    await services.camera.enrollFace(owner, { guestId: third.guestId })

    const day1 = services.camera.retentionReport(reception, { from: '2026-10-01', to: '2026-10-01' })
    expect(day1).toMatchObject({
      faces: { checkout: 1, retention: 0, manual: 1 },
      staff: { removed: 1, left: 0 },
      crops: 0,
      held: { guestFaces: 1, waitingForDeletion: 0, staffFaces: 0, alarmCrops: 0 },
      policy: { faceRetentionDays: 7, alertRetentionDays: 3 }
    })
    const day5 = services.camera.retentionReport(reception, { from: '2026-10-02', to: '2026-10-05' })
    expect(day5).toMatchObject({ faces: { checkout: 0, retention: 0, manual: 0 }, crops: 1 })
    const all = services.camera.retentionReport(owner, { from: '2026-10-01', to: '2026-10-31' })
    expect(all.crops).toBe(1)
    expect(all.faces).toEqual({ checkout: 1, retention: 0, manual: 1 })
    // Nothing about a guest or a face goes into the report: counts only.
    expect(JSON.stringify(all)).not.toContain('Gizlikişi')
    expect(
      await code(() => services.camera.retentionReport(owner, { from: '2026-10-05', to: '2026-10-01' }))
    ).toMatch(/^VALIDATION/)
    expect(
      await code(() =>
        services.camera.retentionReport(roleCtx('housekeeping'), { from: '2026-10-01', to: '2026-10-02' })
      )
    ).toMatch(/^PERMISSION_DENIED/)
  })
})
