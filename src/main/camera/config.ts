// The settings the Python sidecar reads at start (`BISMUTH_CAMERA_CONFIG`): the hotel's `camera.*` settings and the
// camera address from the sealed store. Names are the sidecar's (otel-kamera/config.py). Thresholds live in settings,
// never in code (G-09); the sidecar only ever listens on 127.0.0.1.
import { join } from 'node:path'
import type { SettingsValues } from '@shared/contract'
import { SidecarConfigError } from './sidecar'

export interface SidecarDirs {
  /** Where the sidecar keeps its local files until P20c moves the data into Bismuth's database (userData/camera). */
  dataDir: string
}

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
    MIN_FACE_DET_SCORE: settings['camera.minFaceScore'],
    MIN_FACE_SIZE_PX: settings['camera.minFacePx'],
    CONFIRMATION_FRAMES: settings['camera.confirmationFrames'],
    PROCESS_EVERY_N_FRAMES: settings['camera.processEveryN'],
    ALARM_COOLDOWN_SECONDS: settings['camera.alarmCooldownSeconds'],
    VERIFIED_TTL_SECONDS: settings['camera.verifiedTtlSeconds'],
    ZONE_POLYGON: settings['camera.zonePolygon'],
    ALERT_RETENTION_DAYS: settings['camera.alertRetentionDays'],
    WEB_HOST: '127.0.0.1',
    WEB_PORT: port,
    DB_PATH: join(dirs.dataDir, 'hotel_guests.db'),
    ALERTS_DIR: join(dirs.dataDir, 'alerts'),
    GUEST_PHOTOS_DIR: join(dirs.dataDir, 'guest_photos')
  }
}
