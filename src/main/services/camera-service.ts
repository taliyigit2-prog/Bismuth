// Camera module's service layer (Faz 20 P20a; K-49…K-53): permission (`camera`: view = state, edit = secrets and
// restart), audit, the sealed secrets and the Telegram test. The sidecar itself is driven through `CameraRuntime`
// (src/main/camera), attached by the main process after the services exist; on a computer that does not host the
// camera (client device, tests) there is none and the state reads `unavailable`.
// Secrets (camera address with password, Telegram token) only go in and are never returned, logged or audited as values.
import {
  cameraSecretsInputSchema,
  type CameraSecretsInput,
  type CameraStatus,
  type CameraTelegramTest
} from '@shared/contract/camera'
import { ulid } from '@shared/ids'
import { notifications } from '../db/schema'
import type { CameraRuntime } from '../camera'
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
import { inTransaction, invalid, parseInput, requirePermission, stamps, type ServiceDeps } from './kit'
import { readSetting } from './settings-service'

export interface CameraServiceDeps extends ServiceDeps {
  secrets: SecretStore
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

export function createCameraService(deps: CameraServiceDeps) {
  const { db, secrets } = deps
  let runtime: CameraRuntime | null = null

  const networkOn = (): boolean => readSetting(db, 'network.enabled')
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
      const changed: string[] = []
      if (
        input.source !== undefined &&
        input.source !== null &&
        input.source !== '' &&
        !isValidSource(input.source)
      )
        throw invalid('errors.cameraSourceInvalid')
      if (
        input.telegramToken !== undefined &&
        input.telegramToken !== null &&
        input.telegramToken !== '' &&
        !isValidToken(input.telegramToken)
      )
        throw invalid('errors.cameraTelegramInvalid')
      let chats: string | null | undefined
      if (input.telegramChatIds !== undefined) {
        if (input.telegramChatIds === null || input.telegramChatIds === '') chats = null
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
      for (const [key] of writes) changed.push(key)
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
