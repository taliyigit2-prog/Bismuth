// Camera module (Faz 20, K-49…K-53): the only place Bismuth runs the Python sidecar and talks to it. Network code
// here is for 127.0.0.1 (the sidecar) and rtsp:// (the camera itself, inside the sidecar) only; the `no-network-guard`
// hook enforces it. Other outside traffic (Telegram) lives in src/main/network/telegram.
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SettingsValues } from '@shared/contract'
import { cameraDiscoverySchema, type CameraDiscovery, type CameraProbe } from '@shared/contract/camera'
import { addonEnv, type CameraAddon } from './addon'
import { buildSidecarConfig } from './config'
import { discoverCameras } from './discovery'
import { probeCamera } from './probe'
import {
  createSidecar,
  type Sidecar,
  type SidecarNotice,
  type SidecarOptions,
  type SidecarSnapshot
} from './sidecar'
import type { Bridge } from './bridge'

export { createBridge, makeStreamToken, TOKEN_HEADER, type Bridge, type BridgeHealth } from './bridge'
export { createSecretStore, SECRET_IDS, type SecretId, type SecretStore } from './secrets'
export { redactSecrets } from './redact'
export { createFaceCrypto, FaceCryptoError, type FaceCrypto, type FaceCryptoErrorCode } from './crypto'
export { SidecarConfigError, createSidecar, pickFreePort } from './sidecar'
export type { Sidecar, SidecarNotice, SidecarSnapshot, SidecarState } from './sidecar'
export { buildSidecarConfig } from './config'
export { addonRoot, findCameraAddon, type CameraAddon } from './addon'
export { discoverCameras, parseSadp, parseWsDiscovery, mergeDevices } from './discovery'
export { probeCamera, readProbeOutput } from './probe'
export { readHardware, type Hardware } from './hardware'

/** What the service layer drives (the main process builds the real one below; tests pass a fake). */
export interface CameraRuntime {
  /** Starts or stops the sidecar to match `camera.enabled` (and restarts a running one when `restart`). */
  apply(opts?: { restart?: boolean }): Promise<void>
  restart(): Promise<void>
  stop(): Promise<void>
  snapshot(): SidecarSnapshot
  bridge(): Bridge | null
  /** False in a packaged build without the camera add-on (the UI wiring of "not installed" is the camera package's). */
  addonInstalled?(): boolean
}

export interface CameraRuntimeOptions {
  /** Folder with `web_app.py`: `<app>/otel-kamera` in development, `resources/camera` once packaged (P20f). */
  scriptDir: string
  /** userData: the sidecar's local files live in `<dataDir>/camera` (outside backups, copies and the export). */
  dataDir: string
  /** Bundled model files (`resources/camera/models`). The sidecar never downloads a model (K-57, G-01). */
  modelsDir?: string
  settings: () => SettingsValues
  /** The camera address from the sealed store. */
  source: () => string | null
  onNotice?: (notice: SidecarNotice) => void
  log?: SidecarOptions['log']
  /** Entry file inside `scriptDir` (default `web_app.py`). */
  script?: string
  /** A packaged build ignores `BISMUTH_CAMERA_SCRIPT`. */
  packaged?: boolean
  /**
   * Packaged build: the camera add-on found under userData (`findCameraAddon`); without it the sidecar never starts.
   * `BISMUTH_CAMERA_PYTHON` counts only in an unpackaged build (a variable must not name an installed program's interpreter).
   */
  addon?: CameraAddon | null
  /** `BISMUTH_CAMERA_PYTHON` (unpackaged only); otherwise the folder's venv, then `python3`. */
  python?: string | null
  /** Tests: command, arguments and timing of a fake sidecar. */
  overrides?: Partial<SidecarOptions>
}

/** Packaged: the add-on's Python only. Unpackaged: `BISMUTH_CAMERA_PYTHON`, the folder's venv, the system's. */
export function pythonFor(opts: {
  scriptDir: string
  packaged?: boolean
  addon?: CameraAddon | null
  python?: string | null
}): string {
  if (opts.packaged) return opts.addon?.python ?? ''
  return resolvePython(opts.scriptDir, opts.python ?? process.env['BISMUTH_CAMERA_PYTHON'] ?? null)
}

/** The interpreter: explicit > the folder's virtual environment > the system's. */
export function resolvePython(scriptDir: string, explicit?: string | null): string {
  if (explicit) return explicit
  const venv =
    process.platform === 'win32'
      ? join(scriptDir, 'venv', 'Scripts', 'python.exe')
      : join(scriptDir, 'venv', 'bin', 'python')
  if (existsSync(venv)) return venv
  return process.platform === 'win32' ? 'python' : 'python3'
}

/**
 * The wizard's one-picture test (P20g): `probe_camera.py` beside `web_app.py`, started only when asked. A development or
 * e2e run may name another entry (`BISMUTH_CAMERA_PROBE_SCRIPT`, the Node stand-in); a packaged build ignores it.
 */
export function createProbeRunner(opts: {
  scriptDir: string
  packaged: boolean
  addon?: CameraAddon | null
  python?: string | null
}): (source: string) => Promise<CameraProbe> {
  const script =
    (!opts.packaged ? process.env['BISMUTH_CAMERA_PROBE_SCRIPT'] : undefined) ?? 'probe_camera.py'
  return (source) =>
    probeCamera(source, {
      command: pythonFor(opts),
      args: [script],
      cwd: opts.scriptDir,
      ...(opts.packaged && opts.addon ? { env: addonEnv(opts.addon) as Record<string, string> } : {})
    })
}

/**
 * The wizard's search of the local network (P20g). A development or e2e run may point `BISMUTH_CAMERA_FAKE_DISCOVERY` at a
 * JSON file with the answer (a packaged build ignores it): no packets go out then.
 */
export function createDiscoverer(opts: { packaged: boolean }): () => Promise<CameraDiscovery> {
  return async () => {
    const fake = !opts.packaged ? process.env['BISMUTH_CAMERA_FAKE_DISCOVERY'] : undefined
    if (!fake) return discoverCameras()
    return cameraDiscoverySchema.parse(JSON.parse(readFileSync(fake, 'utf8')))
  }
}

/** `web_app.py`; a test build may name another entry (the Node stand-in `tests/fixtures/fake-sidecar.mjs`). */
const scriptName = (opts: CameraRuntimeOptions): string =>
  opts.script ?? (!opts.packaged ? process.env['BISMUTH_CAMERA_SCRIPT'] : undefined) ?? 'web_app.py'

export function createCameraRuntime(opts: CameraRuntimeOptions): CameraRuntime {
  const localDir = join(opts.dataDir, 'camera')
  const sidecar: Sidecar = createSidecar({
    command: pythonFor(opts),
    args: [scriptName(opts)],
    cwd: opts.scriptDir,
    ...(opts.packaged && opts.addon ? { env: addonEnv(opts.addon) } : {}),
    buildConfig: (port) => {
      mkdirSync(localDir, { recursive: true })
      return buildSidecarConfig(opts.settings(), opts.source(), port, {
        dataDir: localDir,
        ...(opts.modelsDir ? { modelsDir: opts.modelsDir } : {})
      })
    },
    ...(opts.onNotice ? { onNotice: opts.onNotice } : {}),
    ...(opts.log ? { log: opts.log } : {}),
    ...opts.overrides
  })

  // Packaged without the add-on: nothing to start (the Camera tab says "camera add-on not installed", docs/kurulum.md).
  const addonMissing = !!opts.packaged && !opts.addon
  const wanted = (): boolean => opts.settings()['camera.enabled'] && !addonMissing
  const running = (): boolean => ['starting', 'running', 'backoff'].includes(sidecar.snapshot().state)

  return {
    async apply(o) {
      if (!wanted()) return sidecar.stop()
      if (running()) return o?.restart ? sidecar.restart() : undefined
      await sidecar.start()
    },
    restart: () => sidecar.restart(),
    stop: () => sidecar.stop(),
    snapshot: () => sidecar.snapshot(),
    bridge: () => sidecar.bridge(),
    addonInstalled: () => !addonMissing
  }
}
