// Test helper: the camera procedures over the fake transport (Faz 20 P20b). The service tests cover the rules
// (tests/unit/camera-screen-service.test.ts); this stand-in lets the screens run on their own.
import {
  SETTINGS_DEFAULTS,
  type ProcedureName,
  type ProcedureOutput,
  type SettingsValues
} from '@shared/contract'
import type {
  CameraAddonInstallState,
  CameraAlert,
  CameraCandidate,
  CameraDiscovery,
  CameraFaceStatus,
  CameraHardware,
  CameraLive,
  CameraRetentionReport,
  CameraStaffList,
  CameraProbe,
  CameraStatus
} from '@shared/contract/camera'
import { ApiError, type Transport } from '@/lib/transport'
import { fakeTransport } from './render'

export const RUNNING: CameraStatus = {
  enabled: true,
  state: 'running',
  blocked: null,
  addonInstalled: true,
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
  state,
  hasCrop: false,
  linked: false
})

export interface CameraFakeState {
  status: CameraStatus
  live: CameraLive
  alerts: CameraAlert[]
  available: boolean
  streamUrl: string | null
  telegramTest: ProcedureOutput<'camera.testTelegram'>
  /** A guest's face record (P20c): one status for every guest id the test asks about. */
  face: CameraFaceStatus
  candidates: CameraCandidate[]
  /** The opened alarm crop (`data:` URL), null = the picture is gone. */
  crop: string | null
  /** The staff exclusion list (P20e). */
  staff: CameraStaffList
  /** The destruction report (P20e): the same answer for every range. */
  report: CameraRetentionReport
  /** P20g: the setup wizard's computer facts, network search and one-picture test. */
  hardware: CameraHardware
  discovery: CameraDiscovery
  probe: CameraProbe
  /** "Kamera ekini kur…": `pick` = the dialog's answer, `install` = what the polled state says next. */
  addon: { pick: 'started' | 'canceled'; install: CameraAddonInstallState }
}

export const emptyCamera = (): CameraFakeState => ({
  status: structuredClone(RUNNING),
  live: structuredClone(LIVE),
  alerts: [],
  available: true,
  streamUrl: 'http://127.0.0.1:51234/api/stream?st=1.abc',
  telegramTest: { ok: true, reason: null },
  face: { inHouse: true, count: 0, max: 5, enrolledAt: null, crop: null, keyStore: true },
  candidates: [],
  crop: 'data:image/jpeg;base64,/9j/',
  staff: { listed: [], others: [], max: 3, keyStore: true },
  report: {
    from: '2026-11-01',
    to: '2026-11-13',
    faces: { checkout: 0, retention: 0, manual: 0 },
    staff: { removed: 0, left: 0 },
    crops: 0,
    held: { guestFaces: 0, waitingForDeletion: 0, staffFaces: 0, alarmCrops: 0 },
    policy: { faceRetentionDays: 0, alertRetentionDays: 3 }
  },
  hardware: {
    cpuModel: 'Test CPU',
    cores: 8,
    ramGb: 7.8,
    platform: 'win32',
    osRelease: '10.0.19045',
    arch: 'x64',
    recommended: 'standard'
  },
  discovery: { devices: [], problem: null },
  probe: { ok: true, reason: null, image: 'data:image/jpeg;base64,/9j/', width: 1280, height: 720 },
  addon: { pick: 'started', install: { phase: 'idle', percent: 0, error: null } }
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
        case 'camera.faceStatus':
          return structuredClone(state.face) as never
        case 'camera.enrollFace':
          write()
          desktopOnly()
          state.face = { ...state.face, count: state.face.count + 1, enrolledAt: '2026-11-13T09:00:00.000Z' }
          return structuredClone(state.face) as never
        case 'camera.deleteFaces':
          write()
          state.face = { ...state.face, count: 0, enrolledAt: null, crop: null }
          return structuredClone(state.face) as never
        case 'camera.candidates':
          return structuredClone(state.candidates) as never
        case 'camera.alertCrop':
          desktopOnly()
          return { crop: state.crop } as never
        case 'camera.saveAlertAsGuest': {
          write()
          desktopOnly()
          const alert = state.alerts.find((a) => a.id === i.id)
          if (!alert) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
          alert.linked = true
          alert.state = 'handled'
          return { ok: true } as never
        }
        case 'camera.staff':
          return structuredClone(state.staff) as never
        case 'camera.enrollStaff': {
          write()
          desktopOnly()
          const person =
            state.staff.others.find((p) => p.employeeId === i.employeeId) ??
            state.staff.listed.find((p) => p.employeeId === i.employeeId)
          if (!person) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
          person.faces += 1
          state.staff.others = state.staff.others.filter((p) => p !== person)
          if (!state.staff.listed.includes(person)) state.staff.listed.push(person)
          return structuredClone(state.staff) as never
        }
        case 'camera.removeStaff': {
          write()
          const person = state.staff.listed.find((p) => p.employeeId === i.employeeId)
          if (!person) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
          person.faces = 0
          state.staff.listed = state.staff.listed.filter((p) => p !== person)
          state.staff.others.push(person)
          return structuredClone(state.staff) as never
        }
        case 'camera.retentionReport':
          return { ...structuredClone(state.report), from: i.from, to: i.to } as never
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
        case 'camera.hardware':
          write()
          desktopOnly()
          return structuredClone(state.hardware) as never
        case 'camera.discover':
          write()
          desktopOnly()
          return structuredClone(state.discovery) as never
        case 'camera.probe':
          write()
          desktopOnly()
          return structuredClone(state.probe) as never
        case 'camera.installAddon':
          write()
          desktopOnly()
          return { started: state.addon.pick === 'started' } as never
        case 'camera.addonInstallState':
          desktopOnly()
          return structuredClone(state.addon.install) as never
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
