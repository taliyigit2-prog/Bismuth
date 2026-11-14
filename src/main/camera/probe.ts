// One-off camera test for the setup wizard (Faz 20 P20g, K-59): opens a picture from an rtsp:// address before it is
// saved. Runs `otel-kamera/probe_camera.py` as a short-lived process (it works whether or not the sidecar runs): the
// address (with the camera's user and password) goes in through the environment, never the command line, and nothing
// of it is logged or put into an error. The camera is reached by the Python process over rtsp:// inside the hotel's
// own network (K-49); this file talks to nothing itself.
import { spawn } from 'node:child_process'
import { CAMERA_PROBE_REASONS, type CameraProbe } from '@shared/contract/camera'
import { isCameraHost, rtspHost } from '@shared/domain/camera-source'

export const PROBE_TIMEOUT_MS = 20_000
const MAX_OUTPUT = 3_000_000
const JPEG_DATA_URL = 'data:image/jpeg;base64,'

export interface ProbeCommand {
  command: string
  args: string[]
  cwd: string
  /** Tests: more environment for a stand-in process. */
  env?: Record<string, string>
  /** The environment it starts from (default: this process's own; a packaged build passes an allow-list). */
  baseEnv?: NodeJS.ProcessEnv
  timeoutMs?: number
}

const fail = (reason: (typeof CAMERA_PROBE_REASONS)[number]): CameraProbe => ({
  ok: false,
  reason,
  image: null,
  width: 0,
  height: 0
})

/** The process's one JSON line, checked field by field (it is another program's text). */
export function readProbeOutput(text: string): CameraProbe {
  const line = text.trim().split('\n').pop() ?? ''
  let json: unknown
  try {
    json = JSON.parse(line)
  } catch {
    return fail('unavailable')
  }
  const o = json && typeof json === 'object' ? (json as Record<string, unknown>) : {}
  if (o['ok'] === true) {
    const image = o['image']
    const width = o['width']
    const height = o['height']
    if (
      typeof image !== 'string' ||
      !/^[A-Za-z0-9+/]+=*$/.test(image) ||
      !Buffer.from(image.slice(0, 8), 'base64')
        .subarray(0, 2)
        .equals(Buffer.from([0xff, 0xd8])) ||
      !Number.isInteger(width) ||
      !Number.isInteger(height)
    )
      return fail('noFrame')
    return {
      ok: true,
      reason: null,
      image: JPEG_DATA_URL + image,
      width: width as number,
      height: height as number
    }
  }
  const reason = (CAMERA_PROBE_REASONS as readonly unknown[]).includes(o['reason'])
    ? (o['reason'] as (typeof CAMERA_PROBE_REASONS)[number])
    : 'noFrame'
  return fail(reason)
}

/** Opens one picture from `source`. Never throws; an address outside the hotel's network is refused before any process starts. */
export function probeCamera(source: string, how: ProbeCommand): Promise<CameraProbe> {
  const host = rtspHost(source)
  if (!host || !isCameraHost(host)) return Promise.resolve(fail('badAddress'))
  return new Promise((resolve) => {
    let out = ''
    let settled = false
    const done = (result: CameraProbe): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(how.command, how.args, {
        cwd: how.cwd,
        env: {
          ...(how.baseEnv ?? process.env),
          ...how.env,
          BISMUTH_PROBE_SOURCE: source,
          PYTHONIOENCODING: 'utf-8'
        },
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true
      })
    } catch {
      return resolve(fail('unavailable'))
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      done(fail('timeout'))
    }, how.timeoutMs ?? PROBE_TIMEOUT_MS)
    child.stdout?.on('data', (chunk: Buffer) => {
      if (out.length < MAX_OUTPUT) out += chunk.toString('utf8')
    })
    child.on('error', () => done(fail('unavailable')))
    child.on('close', () => done(readProbeOutput(out)))
  })
}
