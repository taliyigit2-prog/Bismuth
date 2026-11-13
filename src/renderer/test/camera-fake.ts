// Test helper: the camera procedures over the fake transport (Faz 20 P20b). The service tests cover the rules
// (tests/unit/camera-screen-service.test.ts); this stand-in lets the screens run on their own.
import {
  SETTINGS_DEFAULTS,
  type ProcedureName,
  type ProcedureOutput,
  type SettingsValues
} from '@shared/contract'
import type { CameraAlert, CameraLive, CameraStatus } from '@shared/contract/camera'
import { ApiError, type Transport } from '@/lib/transport'
import { fakeTransport } from './render'

export const RUNNING: CameraStatus = {
  enabled: true,
  state: 'running',
  blocked: null,
  crashes: 0,
  totalCrashes: 0,
  lastExitAt: null,
  lastError: null,
  loop: 'ok',
  secrets: { source: true, telegramToken: false, telegramChats: false },
  telegram: { enabled: false, networkEnabled: true }
}

export const LIVE: CameraLive = {
  header: {
    location: 'Merdiven',
    activeGuests: 4,
    alarmsPaused: false,
    cameraConnected: true,
    cameraCovered: false,
    fps: 12
  },
  frame: { width: 1280, height: 720 },
  boxes: [
    { x: 100, y: 120, w: 160, h: 200, label: 'Иван Петров', kind: 'known' },
    { x: 600, y: 200, w: 140, h: 180, label: '', kind: 'unknown' }
  ]
}

export const alertOf = (id: number, at: string, state: CameraAlert['state'] = 'new'): CameraAlert => ({
  id: String(id),
  at,
  state
})

export interface CameraFakeState {
  status: CameraStatus
  live: CameraLive
  alerts: CameraAlert[]
  available: boolean
  streamUrl: string | null
  telegramTest: ProcedureOutput<'camera.testTelegram'>
}

export const emptyCamera = (): CameraFakeState => ({
  status: structuredClone(RUNNING),
  live: structuredClone(LIVE),
  alerts: [],
  available: true,
  streamUrl: 'http://127.0.0.1:51234/api/stream?st=1.abc',
  telegramTest: { ok: true, reason: null }
})

export function cameraTransport(
  state: CameraFakeState = emptyCamera(),
  opts: { kind?: 'ipc' | 'http'; settings?: Partial<SettingsValues>; canEdit?: boolean } = {}
) {
  const base = fakeTransport({ ...SETTINGS_DEFAULTS, ...opts.settings })
  const calls: { name: ProcedureName; input: unknown }[] = []
  const denied = (): ApiError => new ApiError('PERMISSION_DENIED', 403, 'errors.permissionDenied')
  const desktopOnly = (): void => {
    if (opts.kind === 'http') throw new ApiError('PERMISSION_DENIED', 403, 'errors.remoteLocalOnly')
  }
  const write = (): void => {
    if (opts.canEdit === false) throw denied()
  }
  const transport: Transport & {
    calls: typeof calls
    state: CameraFakeState
    callsTo: (n: string) => unknown[]
  } = {
    kind: opts.kind ?? 'ipc',
    calls,
    state,
    callsTo: (n) => calls.filter((c) => c.name === n).map((c) => c.input),
    async call(name, input) {
      calls.push({ name, input })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const i = input as any
      switch (name) {
        case 'camera.status':
          return structuredClone(state.status) as never
        case 'camera.streamUrl':
          desktopOnly()
          return { url: state.streamUrl } as never
        case 'camera.live':
          desktopOnly()
          return structuredClone(state.live) as never
        case 'camera.alerts':
          return { available: state.available, alerts: structuredClone(state.alerts) } as never
        case 'camera.markAlert': {
          const alert = state.alerts.find((a) => a.id === i.id)
          if (!alert) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
          alert.state = i.state
          return { ok: true } as never
        }
        case 'camera.setAlarmsPaused':
          write()
          desktopOnly()
          if (state.live.header) state.live.header.alarmsPaused = i.paused
          return { alarmsPaused: i.paused } as never
        case 'camera.restart':
          write()
          desktopOnly()
          return { ok: true } as never
        case 'camera.setSecrets':
          write()
          desktopOnly()
          if ('source' in i) state.status.secrets.source = i.source !== null
          if ('telegramToken' in i) state.status.secrets.telegramToken = i.telegramToken !== null
          if ('telegramChatIds' in i) state.status.secrets.telegramChats = i.telegramChatIds !== null
          return { ok: true } as never
        case 'camera.testTelegram':
          write()
          desktopOnly()
          return structuredClone(state.telegramTest) as never
        default:
          return base.call(name, input)
      }
    }
  }
  return transport
}

export type CameraTransport = ReturnType<typeof cameraTransport>
