// Bismuth <-> sidecar data flow (Faz 20 P20c; K-51…K-53). Bismuth is the only keeper of guest data: the sidecar holds
// the faces of the guests who are in the house in memory (Bismuth pushes the list), and its alarms are pulled by
// Bismuth, written to `camera_events` (crop sealed) and turned into a notification (and, when the hotel asked for it,
// a Telegram message with no guest name, K-50). One `tick` does both; the main process calls it every few seconds
// while the sidecar runs. Nothing here writes a file: the sealed bytes live only in the database.
import { ulid } from '@shared/ids'
import { eq, inArray } from 'drizzle-orm'
import { cameraEvents, guestFaces, notifications, staffFaces } from '../db/schema'
import type { Bridge } from '../camera/bridge'
import { FaceCryptoError, type FaceCrypto } from '../camera/crypto'
import type { TelegramClient } from '../network/telegram'
import { activeFaces, activeStaffFaces } from './camera-faces'
import type { Ctx } from './context'
import { inTransaction, stamps, type ServiceDeps } from './kit'
import { readSetting } from './settings-service'

/** Sealing contexts: a blob copied into another row or column does not open (`crypto.ts`, AAD). */
export const faceContext = (kind: 'embedding' | 'crop', id: string): string => `guest_faces:${kind}:${id}`
export const eventCropContext = (id: string): string => `camera_events:crop:${id}`
export const staffFaceContext = (id: string): string => `staff_faces:embedding:${id}`

export const EMBEDDING_BYTES = 512 * 4
const MAX_CROP_BYTES = 400_000

export interface AlertNotice {
  eventId: string
  /** Local `HH:mm`. */
  time: string
  location: string
}

export interface CameraSyncDeps extends ServiceDeps {
  faceCrypto: FaceCrypto
  telegram: TelegramClient
  /** The Telegram text in the hotel's language; never carries a guest name. */
  alertMessage?: (info: { time: string; location: string }) => string
  /** The program's own window notice for a new alarm (the main process passes it). */
  onAlert?: (notice: AlertNotice) => void
}

export interface TickResult {
  /** New alarms written to `camera_events`. */
  alerts: number
  /** The face list was sent to the sidecar. */
  pushed: boolean
}

const isJpeg = (bytes: Buffer): boolean => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8

/** Base64 text → bytes, or null when it is not base64 of a sane size. */
export function decodeBase64(text: unknown, max: number): Buffer | null {
  if (typeof text !== 'string' || text === '' || text.length > max * 2) return null
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return null
  const bytes = Buffer.from(text, 'base64')
  return bytes.length > 0 && bytes.length <= max ? bytes : null
}

const pad = (n: number): string => String(n).padStart(2, '0')
/** The hotel computer's local clock as `YYYY-MM-DDTHH:mm:ss` (the Kamera screen shows and groups by it). */
export const localIso = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`

interface RawAlert {
  id: number
  at: string | null
  track: number | null
  crop: Buffer | null
}

/** What the sidecar's `/api/alerts` says, field by field; anything that does not fit is dropped. */
function parseAlerts(body: unknown): { boot: string; alerts: RawAlert[] } | null {
  if (!body || typeof body !== 'object') return null
  const o = body as Record<string, unknown>
  if (typeof o['boot'] !== 'string' || !/^[0-9a-f]{8,64}$/.test(o['boot']) || !Array.isArray(o['alerts']))
    return null
  const alerts: RawAlert[] = []
  for (const item of o['alerts']) {
    const r = item as Record<string, unknown>
    const id = r['id']
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) continue
    const at =
      typeof r['alert_time'] === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?/.test(r['alert_time'])
        ? r['alert_time']
        : null
    const track = typeof r['track'] === 'number' && Number.isInteger(r['track']) ? r['track'] : null
    const crop = decodeBase64(r['crop'], MAX_CROP_BYTES)
    alerts.push({ id, at, track, crop: crop && isJpeg(crop) ? crop : null })
  }
  return { boot: o['boot'], alerts }
}

export function createCameraSync(deps: CameraSyncDeps, bridge: () => Bridge | null) {
  const { db, faceCrypto } = deps
  /** The sidecar's alarm counter restarts with it: `boot` tells runs apart; `last` is the newest alarm taken. */
  let cursor: { boot: string | null; last: number } = { boot: null, last: 0 }
  let pushed: { boot: string | null; digest: string } | null = null
  let busy = false

  const seal = (plain: Uint8Array, context: string): Buffer | null => {
    try {
      return faceCrypto.encrypt(plain, context)
    } catch (error) {
      if (error instanceof FaceCryptoError) return null
      throw error
    }
  }

  /** Writes one alarm: the event row (crop sealed), its notification and the audit row, in one transaction. */
  function ingest(
    ctx: Ctx,
    boot: string,
    a: RawAlert,
    location: string
  ): { notice: AlertNotice; crop: Buffer | null } | null {
    const sourceRef = `${boot}:${a.id}`
    return inTransaction(deps, ctx, (tx, audit, now) => {
      if (
        tx
          .select({ id: cameraEvents.id })
          .from(cameraEvents)
          .where(eq(cameraEvents.sourceRef, sourceRef))
          .get()
      )
        return null
      const at = a.at ? new Date(a.at) : now
      const when = Number.isNaN(at.getTime()) ? now : at
      const id = ulid(now.getTime())
      // Retention (K-52): the crop's keep time counts from the alarm's own time (`when`, the sidecar's clock), not from
      // the moment Bismuth pulled it, and uses the setting as it is now; a later change of `camera.alertRetentionDays`
      // does not move rows already written. The retention job (`purgeExpired`) deletes the sealed crop at `expiresAt`;
      // the event row itself stays. A row with no crop has no `expiresAt`.
      const days = readSetting(tx, 'camera.alertRetentionDays')
      const sealed = a.crop ? seal(a.crop, eventCropContext(id)) : null
      tx.insert(cameraEvents)
        .values({
          id,
          kind: 'alarm',
          occurredAt: when.toISOString(),
          state: 'new',
          trackRef: a.track === null ? null : String(a.track),
          sourceRef,
          cropEnc: sealed,
          expiresAt: sealed ? new Date(when.getTime() + days * 86_400_000).toISOString() : null,
          ...stamps(now)
        })
        .run()
      tx.insert(notifications)
        .values({
          id: ulid(now.getTime()),
          kind: 'camera_alert',
          refId: id,
          userId: null,
          title: 'main.camera.alertTitle',
          body: null,
          dueAt: now.toISOString(),
          ...stamps(now)
        })
        .run()
      audit({ entity: 'camera_event', entityId: id, action: 'create', after: { kind: 'alarm' } })
      return {
        notice: { eventId: id, time: `${pad(when.getHours())}:${pad(when.getMinutes())}`, location },
        crop: a.crop
      }
    })
  }

  async function pullAlerts(ctx: Ctx, b: Bridge): Promise<number> {
    // The sidecar ignores `after` when `boot` is not its own run: a restarted sidecar answers from its first alarm.
    const boot = cursor.boot ? `&boot=${cursor.boot}` : ''
    const res = await b.request('GET', `/api/alerts?after=${cursor.last}&limit=50${boot}`).catch(() => null)
    if (res?.status !== 200) return 0
    const parsed = parseAlerts(res.json)
    if (!parsed) return 0
    if (parsed.boot !== cursor.boot) {
      // A new sidecar run: its counter starts over, and it knows no faces yet.
      cursor = { boot: parsed.boot, last: 0 }
      pushed = null
    }
    const location = readSetting(db, 'camera.location')
    let added = 0
    const sends: Promise<unknown>[] = []
    for (const a of [...parsed.alerts].sort((x, y) => x.id - y.id)) {
      if (a.id <= cursor.last) continue
      const made = ingest(ctx, parsed.boot, a, location)
      cursor = { boot: parsed.boot, last: a.id }
      if (!made) continue
      added++
      try {
        deps.onAlert?.(made.notice)
      } catch {
        // A window notice that fails changes nothing: the notification row is written.
      }
      const text =
        deps.alertMessage?.({ time: made.notice.time, location }) ??
        `Bismuth: unknown person at the camera ${made.notice.time}${location ? ` (${location})` : ''}`
      // K-50: a copy to Telegram when the hotel asked for it; a failure is silent and nothing is queued.
      sends.push(deps.telegram.sendAlert({ text, photo: made.crop }).catch(() => null))
    }
    await Promise.all(sends)
    return added
  }

  /** Sends the faces of the guests in the house to the sidecar, when they changed or the sidecar started over. */
  async function pushFaces(b: Bridge, force: boolean): Promise<boolean> {
    const rows = activeFaces(db)
    const staffRows = activeStaffFaces(db, deps.clock())
    const digest =
      rows.map((r) => `${r.id}|${r.name}|${r.room}`).join('\n') +
      '\n#staff\n' +
      staffRows.map((r) => r.id).join('\n')
    if (!force && pushed && pushed.boot === cursor.boot && pushed.digest === digest) return false
    const faces: { id: string; name: string; room: string; embedding: string }[] = []
    if (rows.length > 0) {
      const sealed = db
        .select({ id: guestFaces.id, blob: guestFaces.embeddingEnc })
        .from(guestFaces)
        .where(
          inArray(
            guestFaces.id,
            rows.map((r) => r.id)
          )
        )
        .all()
      const blobs = new Map(sealed.map((s) => [s.id, s.blob]))
      for (const r of rows) {
        const blob = blobs.get(r.id)
        if (!blob) continue
        try {
          const plain = faceCrypto.decrypt(blob, faceContext('embedding', r.id))
          if (plain.length === EMBEDDING_BYTES)
            faces.push({ id: r.id, name: r.name, room: r.room, embedding: plain.toString('base64') })
        } catch {
          // A vector this computer cannot open (another computer's key) is skipped; the retention job removes it.
        }
      }
    }
    // S-107: staff are known to the sidecar as faces with no name and no room, so they raise no alarm and are not
    // told apart from one another; the live picture marks them "Personel" (the screen's word for a known face without a label).
    if (staffRows.length > 0) {
      const sealed = db
        .select({ id: staffFaces.id, blob: staffFaces.embeddingEnc })
        .from(staffFaces)
        .where(
          inArray(
            staffFaces.id,
            staffRows.map((r) => r.id)
          )
        )
        .all()
      for (const s of sealed) {
        try {
          const plain = faceCrypto.decrypt(s.blob, staffFaceContext(s.id))
          if (plain.length === EMBEDDING_BYTES)
            faces.push({ id: `staff:${s.id}`, name: '', room: '', embedding: plain.toString('base64') })
        } catch {
          // Sealed by another computer's key: skipped, like a guest's.
        }
      }
    }
    const res = await b.request('PUT', '/api/faces/active', { faces }).catch(() => null)
    if (res?.status !== 200) return false
    pushed = { boot: cursor.boot, digest }
    return true
  }

  return {
    /** One round: new alarms in, the face list out. Overlapping calls are skipped (the main process also guards). */
    async tick(ctx: Ctx, opts: { force?: boolean } = {}): Promise<TickResult> {
      const b = bridge()
      if (!b || busy) return { alerts: 0, pushed: false }
      busy = true
      try {
        const alerts = await pullAlerts(ctx, b)
        const didPush = await pushFaces(b, opts.force === true)
        return { alerts, pushed: didPush }
      } finally {
        busy = false
      }
    },
    /** Sends the list now (a face was added or deleted) without waiting for the next round. */
    async pushNow(): Promise<boolean> {
      const b = bridge()
      return b ? pushFaces(b, true).catch(() => false) : false
    },
    /** Tests: forget what was sent. */
    reset(): void {
      cursor = { boot: null, last: 0 }
      pushed = null
    }
  }
}

export type CameraSync = ReturnType<typeof createCameraSync>
