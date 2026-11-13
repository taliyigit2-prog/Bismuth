// Camera module's service layer (Faz 20 P20a; K-49…K-53): permission (`camera`: view = state, edit = secrets and
// restart), audit, the sealed secrets and the Telegram test. The sidecar itself is driven through `CameraRuntime`
// (src/main/camera), attached by the main process after the services exist; on a computer that does not host the
// camera (client device, tests) there is none and the state reads `unavailable`.
// Secrets (camera address with password, Telegram token) only go in and are never returned, logged or audited as values.
import {
  cameraBoxSchema,
  cameraMarkAlertInputSchema,
  cameraPauseInputSchema,
  cameraSecretsInputSchema,
  type CameraAlerts,
  type CameraLive,
  type CameraMarkAlertInput,
  type CameraSecretsInput,
  type CameraStatus,
  type CameraStream,
  type CameraTelegramTest
} from '@shared/contract/camera'
import { ulid } from '@shared/ids'
import { notifications } from '../db/schema'
import type { CameraRuntime } from '../camera'
import type { Bridge } from '../camera/bridge'
import { alertKey, type AlertStateStore } from '../camera/alert-state'
import type { SecretStore } from '../camera/secrets'
import type { SidecarNotice } from '../camera/sidecar'
import {
  createTelegramClient,
  isValidChatId,
  isValidToken,
  parseChatIds,
  type TelegramClient
} from '../network/telegram'
import type { FetchLike } from '../network/http'
import { AppError } from './errors'
import type { Ctx } from './context'
import {
  inTransaction,
  invalid,
  notFound,
  parseInput,
  requirePermission,
  stamps,
  type ServiceDeps
} from './kit'
import { readSetting } from './settings-service'

export interface CameraServiceDeps extends ServiceDeps {
  secrets: SecretStore
  /** Which alarms staff marked seen or handled (P20b; moves into `camera_events` with P20c). */
  alertState: AlertStateStore
  /** Tests: the fake Telegram server's fetch / local origin (never in a packaged build). */
  telegram?: { fetch?: FetchLike; origin?: string | null }
  /** The Telegram test message in the hotel's language (the main process passes its translator). */
  testMessage?: () => string
}

/** A webcam number ("0") or an RTSP address: the only camera targets (K-49). */
export const isValidSource = (source: string): boolean =>
  /^\d{1,2}$/.test(source) || /^rtsp:\/\/[^\s]{3,}$/i.test(source)

const desktopOnly = (ctx: Ctx): void => {
  if (ctx.transport !== 'ipc') throw new AppError('PERMISSION_DENIED', 'errors.remoteLocalOnly')
}

/** How long a live picture address works (the picture asks again when it drops). */
const STREAM_TTL_SECONDS = 60

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0

/** One GET to the sidecar: the JSON answer, or null when it cannot be reached or says no. */
async function ask(bridge: Bridge, path: string): Promise<unknown> {
  try {
    const res = await bridge.request('GET', path)
    return res.status === 200 ? res.json : null
  } catch {
    return null
  }
}

/** The sidecar's latest alarms (id and time only: the picture paths and texts never leave it, K-51). */
async function fetchAlerts(bridge: Bridge): Promise<{ id: string; at: string | null }[] | null> {
  const body = await ask(bridge, '/api/alerts?limit=100')
  const list = (body as { alerts?: unknown } | null)?.alerts
  if (!Array.isArray(list)) return null
  const rows: { id: string; at: string | null }[] = []
  for (const item of list) {
    const r = item as Record<string, unknown>
    const id =
      typeof r['id'] === 'number' && Number.isInteger(r['id']) && r['id'] >= 0 ? String(r['id']) : null
    if (id === null) continue
    const at =
      typeof r['alert_time'] === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(r['alert_time'])
        ? r['alert_time']
        : null
    rows.push({ id, at })
  }
  return rows
}

export function createCameraService(deps: CameraServiceDeps) {
  const { db, secrets } = deps
  let runtime: CameraRuntime | null = null

  const networkOn = (): boolean => readSetting(db, 'network.enabled')
  /** The sidecar's bridge while it runs; null otherwise (stopped, starting, backing off, a client device). */
  const running = (): Bridge | null => (runtime?.snapshot().state === 'running' ? runtime.bridge() : null)
  const telegram: TelegramClient = createTelegramClient({
    enabled: () => networkOn() && readSetting(db, 'camera.telegram.enabled'),
    photoEnabled: () => readSetting(db, 'camera.telegram.photo'),
    credentials: () => {
      const token = secrets.get('telegram.token')
      const chats = secrets.get('telegram.chatIds')
      return token && chats ? { token, chatIds: parseChatIds(chats) } : null
    },
    ...(deps.telegram?.fetch ? { fetch: deps.telegram.fetch } : {}),
    ...(deps.telegram?.origin ? { origin: deps.telegram.origin } : {})
  })

  return {
    /** The main process hands over the sidecar it built (after the services exist: it reads settings and secrets). */
    attach(next: CameraRuntime | null): void {
      runtime = next
    },

    /** Main process only: the camera address for the sidecar (a secret; never leaves the process). */
    sidecarSource: (): string | null => secrets.get('camera.source'),

    /** The Telegram client the alarm path uses (P20c): the alarm text and, when allowed, its photo. */
    telegram,

    status(ctx: Ctx): CameraStatus {
      requirePermission(ctx, 'camera', 'view')
      const snap = runtime?.snapshot() ?? null
      return {
        enabled: readSetting(db, 'camera.enabled'),
        state: snap?.state ?? 'unavailable',
        blocked: snap?.blocked ?? null,
        crashes: snap?.crashes ?? 0,
        totalCrashes: snap?.totalCrashes ?? 0,
        lastExitAt: snap?.lastExitAt ?? null,
        lastError: snap?.lastError ?? null,
        loop: snap?.loop ?? null,
        secrets: {
          source: secrets.has('camera.source'),
          telegramToken: secrets.has('telegram.token'),
          telegramChats: secrets.has('telegram.chatIds')
        },
        telegram: { enabled: readSetting(db, 'camera.telegram.enabled'), networkEnabled: networkOn() }
      }
    },

    async restart(ctx: Ctx): Promise<void> {
      requirePermission(ctx, 'camera', 'edit')
      desktopOnly(ctx)
      if (!runtime) throw new AppError('CONFLICT', 'errors.cameraUnavailable')
      // Writes the audit row first: restarting is the owner's act even when the process then refuses to start.
      inTransaction(deps, ctx, (_tx, audit) =>
        audit({ entity: 'camera', entityId: 'sidecar', action: 'update', reason: 'restart' })
      )
      await runtime.apply({ restart: true })
    },

    async setSecrets(ctx: Ctx, raw: CameraSecretsInput): Promise<void> {
      requirePermission(ctx, 'camera', 'edit')
      desktopOnly(ctx)
      const input = parseInput(cameraSecretsInputSchema, raw)
      if (input.source && !isValidSource(input.source)) throw invalid('errors.cameraSourceInvalid')
      if (input.telegramToken && !isValidToken(input.telegramToken))
        throw invalid('errors.cameraTelegramInvalid')
      let chats: string | null | undefined
      if (input.telegramChatIds !== undefined) {
        if (!input.telegramChatIds) chats = null
        else {
          const parsed = parseChatIds(input.telegramChatIds)
          const typed = input.telegramChatIds.split(/[,;\s]+/).filter(Boolean)
          if (parsed.length === 0 || parsed.length !== typed.length || !parsed.every(isValidChatId))
            throw invalid('errors.cameraTelegramInvalid')
          chats = parsed.join(',')
        }
      }
      const writes: [Parameters<typeof secrets.set>[0], string | null][] = []
      if (input.source !== undefined) writes.push(['camera.source', input.source || null])
      if (input.telegramToken !== undefined) writes.push(['telegram.token', input.telegramToken || null])
      if (chats !== undefined) writes.push(['telegram.chatIds', chats])
      const changed = writes.map(([key]) => key)
      // Which secrets changed, never their values. The file is written after the audit row is committed:
      // a file write cannot be rolled back, so a failed audit must not leave an unrecorded secret behind.
      inTransaction(deps, ctx, (_tx, audit) => {
        audit({ entity: 'camera', entityId: 'secrets', action: 'update', after: { changed } })
      })
      for (const [key, value] of writes) secrets.set(key, value)
      // A new camera address is used at once.
      if (changed.includes('camera.source')) await runtime?.apply({ restart: true })
    },

    async testTelegram(ctx: Ctx): Promise<CameraTelegramTest> {
      requirePermission(ctx, 'camera', 'edit')
      desktopOnly(ctx)
      const out = await telegram.sendAlert({ text: deps.testMessage?.() ?? 'Bismuth Telegram test' })
      return out.ok ? { ok: out.sent > 0, reason: null } : { ok: false, reason: out.reason }
    },

    /**
     * The live picture's address (S-108: the hotel computer's own window only). Signed and short-lived; the renderer
     * asks again when the picture drops. null while the sidecar is not running.
     */
    streamUrl(ctx: Ctx): CameraStream {
      requirePermission(ctx, 'camera', 'view')
      desktopOnly(ctx)
      const bridge = running()
      return { url: bridge ? bridge.streamUrl(STREAM_TTL_SECONDS) : null }
    },

    /** The strip above the live picture and the face boxes drawn over it (the sidecar paints no text, K-49). */
    async live(ctx: Ctx): Promise<CameraLive> {
      requirePermission(ctx, 'camera', 'view')
      desktopOnly(ctx)
      const bridge = running()
      if (!bridge) return { header: null, frame: null, boxes: [] }
      const status = await ask(bridge, '/api/status')
      const header =
        status && typeof status === 'object'
          ? (() => {
              const s = status as Record<string, unknown>
              return {
                location: typeof s['camera_location'] === 'string' ? s['camera_location'] : '',
                activeGuests: count(s['active_guests_count']),
                alarmsPaused: s['alarms_paused'] === true,
                cameraConnected: s['camera_connected'] === true,
                cameraCovered: s['camera_covered'] === true,
                fps: typeof s['fps'] === 'number' && s['fps'] > 0 ? s['fps'] : 0
              }
            })()
          : null
      // Face boxes come from the sidecar's overlay answer (P20d); an older sidecar has none: an empty list.
      const overlay = await ask(bridge, '/api/overlay')
      const raw = overlay && typeof overlay === 'object' ? (overlay as Record<string, unknown>) : {}
      const frame = raw['frame'] as Record<string, unknown> | undefined
      const width = Number(frame?.['width'])
      const height = Number(frame?.['height'])
      // The sidecar (P20d) sends faces as 0..1 corners [x1, y1, x2, y2]; the screen draws pixel boxes of the frame.
      const toBox = (f: unknown): unknown => {
        const o = f && typeof f === 'object' ? (f as Record<string, unknown>) : {}
        const box = Array.isArray(o['box']) ? o['box'].map(Number) : []
        if (box.length !== 4 || box.some((v) => !Number.isFinite(v))) return null
        const [x1, y1, x2, y2] = box as [number, number, number, number]
        const known = o['kind'] === 'known'
        const label = known
          ? [o['name'], o['room']].filter((v) => typeof v === 'string' && v).join(' · ')
          : ''
        return {
          x: Math.round(x1 * width),
          y: Math.round(y1 * height),
          w: Math.round((x2 - x1) * width),
          h: Math.round((y2 - y1) * height),
          label,
          kind: known ? 'known' : 'unknown'
        }
      }
      const source = Array.isArray(raw['faces']) ? raw['faces'].map(toBox) : []
      const boxes = source
        .map((b) => cameraBoxSchema.safeParse(b))
        .flatMap((r) => (r.success ? [r.data] : []))
        .slice(0, 50)
      const sized = Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0
      return { header, frame: sized ? { width, height } : null, boxes: sized ? boxes : [] }
    },

    /** The latest alarms from the sidecar with the staff's marks (P20c moves the rows into Bismuth's own table). */
    async alerts(ctx: Ctx): Promise<CameraAlerts> {
      requirePermission(ctx, 'camera', 'view')
      const bridge = running()
      if (!bridge) return { available: false, alerts: [] }
      const rows = await fetchAlerts(bridge)
      if (!rows) return { available: false, alerts: [] }
      return {
        available: true,
        alerts: rows.map((r) => ({ ...r, state: deps.alertState.get(alertKey(r.id, r.at)) }))
      }
    },

    /**
     * Seen / handled / new again. Marking an alarm is the front desk's daily work, so the `view` level is enough (the
     * mark holds no personal data); it is audited all the same.
     */
    async markAlert(ctx: Ctx, raw: CameraMarkAlertInput): Promise<void> {
      requirePermission(ctx, 'camera', 'view')
      const input = parseInput(cameraMarkAlertInputSchema, raw)
      const bridge = running()
      const rows = bridge ? await fetchAlerts(bridge) : null
      const alert = rows?.find((r) => r.id === input.id)
      if (!alert) throw notFound('camera_alert', input.id)
      inTransaction(deps, ctx, (_tx, audit) =>
        audit({
          entity: 'camera_alert',
          entityId: input.id,
          action: 'update',
          after: { state: input.state }
        })
      )
      deps.alertState.set(alertKey(alert.id, alert.at), input.state)
    },

    /** "Alarmları duraklat" / "Alarmları sürdür": the sidecar only toggles, so the state is read first. */
    async setAlarmsPaused(ctx: Ctx, raw: { paused: boolean }): Promise<{ alarmsPaused: boolean }> {
      requirePermission(ctx, 'camera', 'edit')
      desktopOnly(ctx)
      const input = parseInput(cameraPauseInputSchema, raw)
      const bridge = running()
      if (!bridge) throw new AppError('CONFLICT', 'errors.cameraUnavailable')
      const status = await ask(bridge, '/api/status')
      const now = (status as Record<string, unknown> | null)?.['alarms_paused'] === true
      if (!status) throw new AppError('CONFLICT', 'errors.cameraUnavailable')
      if (now === input.paused) return { alarmsPaused: now }
      inTransaction(deps, ctx, (_tx, audit) =>
        audit({
          entity: 'camera',
          entityId: 'sidecar',
          action: 'update',
          reason: input.paused ? 'alarms paused' : 'alarms resumed'
        })
      )
      const res = await bridge.request('POST', '/api/system/toggle-alarms').catch(() => null)
      const after = (res?.json as Record<string, unknown> | null)?.['alarms_paused']
      if (res?.status !== 200 || typeof after !== 'boolean')
        throw new AppError('CONFLICT', 'errors.cameraUnavailable')
      return { alarmsPaused: after }
    },

    /**
     * The sidecar crashed three times (or gave up after five): one notification row for the notice centre, written by
     * the program itself (`systemCtx`). The title is a message key; the screen shows it in the person's language.
     */
    noticeProblem(ctx: Ctx, notice: SidecarNotice): void {
      inTransaction(deps, ctx, (tx, audit, now) => {
        const id = ulid(now.getTime())
        tx.insert(notifications)
          .values({
            id,
            kind: 'camera_problem',
            refId: notice.kind,
            userId: null,
            title: notice.kind === 'gaveUp' ? 'main.camera.gaveUpTitle' : 'main.camera.crashedTitle',
            body: String(notice.crashes),
            dueAt: now.toISOString(),
            ...stamps(now)
          })
          .run()
        audit({
          entity: 'camera',
          entityId: 'sidecar',
          action: 'create',
          after: { notification: id, kind: notice.kind }
        })
      })
    }
  }
}

export type CameraService = ReturnType<typeof createCameraService>
