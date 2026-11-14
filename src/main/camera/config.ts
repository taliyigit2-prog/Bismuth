// The settings the Python sidecar reads at start (`BISMUTH_CAMERA_CONFIG`): the hotel's `camera.*` settings and the
// camera address from the sealed store. Names are the sidecar's (otel-kamera/config.py). Thresholds live in settings,
// never in code (G-09); the sidecar only ever listens on 127.0.0.1.
import type { SettingsValues } from '@shared/contract'
import { SidecarConfigError } from './sidecar'

export interface SidecarDirs {
  /** The model runtimes' settings folder (userData/camera); never guests' data (P20c). */
  dataDir: string
  /** Where the bundled model files are (`resources/camera/models`); the sidecar loads only from here, never downloads. */
  modelsDir?: string
}

/** The `camera.*` settings the sidecar reads at start: only a change of one of these restarts it. */
export const SIDECAR_SETTING_KEYS: readonly string[] = [
  'camera.location',
  'camera.similarityThreshold',
  'camera.confirmSimilarity',
  'camera.uncertainMargin',
  'camera.idleFaceScanEvery',
  'camera.streamMaxWidth',
  'camera.minFaceScore',
  'camera.minFacePx',
  'camera.confirmationFrames',
  'camera.processEveryN',
  'camera.alarmCooldownSeconds',
  'camera.verifiedTtlSeconds',
  'camera.zonePolygon'
]

export function buildSidecarConfig(
  settings: SettingsValues,
  source: string | null,
  port: number,
  dirs: SidecarDirs
): Record<string, unknown> {
  if (!source) throw new SidecarConfigError('noSource')
  return {
    CAMERA_SOURCE: source,
    ...(settings['camera.location'] ? { CAMERA_LOCATION: settings['camera.location'] } : {}),
    FACE_SIMILARITY_THRESHOLD: settings['camera.similarityThreshold'],
    CHECKOUT_MIN_SIMILARITY: settings['camera.confirmSimilarity'],
    FACE_UNCERTAIN_MARGIN: settings['camera.uncertainMargin'],
    IDLE_FACE_SCAN_EVERY: settings['camera.idleFaceScanEvery'],
    STREAM_MAX_WIDTH: settings['camera.streamMaxWidth'],
    ...(dirs.modelsDir ? { MODELS_DIR: dirs.modelsDir } : {}),
    MIN_FACE_DET_SCORE: settings['camera.minFaceScore'],
    MIN_FACE_SIZE_PX: settings['camera.minFacePx'],
    CONFIRMATION_FRAMES: settings['camera.confirmationFrames'],
    PROCESS_EVERY_N_FRAMES: settings['camera.processEveryN'],
    ALARM_COOLDOWN_SECONDS: settings['camera.alarmCooldownSeconds'],
    VERIFIED_TTL_SECONDS: settings['camera.verifiedTtlSeconds'],
    ZONE_POLYGON: settings['camera.zonePolygon'],
    WEB_HOST: '127.0.0.1',
    WEB_PORT: port,
    // Only the model runtimes' own settings and caches (no guest data): the sidecar writes no face, crop or alarm file
    // (K-51, K-53), so there is no database or picture folder to name any more.
    RUNTIME_DIR: dirs.dataDir
  }
}
