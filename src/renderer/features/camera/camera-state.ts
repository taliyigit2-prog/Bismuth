// How the sidecar's state reads on the Kamera screen (Faz 20 P20b): four words for the staff — works, starting, a
// problem, off — and the line that says what to do. Pure, so it is unit-tested.
import type { CameraStatus } from '@shared/contract/camera'

export type CameraTone = 'running' | 'starting' | 'problem' | 'off'

export type CameraStateKey =
  | 'running'
  | 'slow'
  | 'starting'
  | 'restarting'
  | 'gaveUp'
  | 'stopped'
  | 'noSource'
  | 'disabled'
  | 'unavailable'

export interface CameraStateView {
  tone: CameraTone
  /** `camera.state.<key>` is the word, `camera.stateHelp.<key>` what it means and what to do. */
  key: CameraStateKey
}

export function cameraStateView(status: CameraStatus): CameraStateView {
  if (status.state === 'unavailable') return { tone: 'off', key: 'unavailable' }
  if (!status.enabled) return { tone: 'off', key: 'disabled' }
  if (status.blocked === 'noSource') return { tone: 'off', key: 'noSource' }
  switch (status.state) {
    case 'running':
      return status.loop === 'degraded' || status.loop === 'stalled'
        ? { tone: 'problem', key: 'slow' }
        : { tone: 'running', key: 'running' }
    case 'starting':
      return { tone: 'starting', key: 'starting' }
    case 'backoff':
      return { tone: 'starting', key: 'restarting' }
    case 'gaveUp':
      return { tone: 'problem', key: 'gaveUp' }
    default:
      return { tone: 'off', key: 'stopped' }
  }
}
