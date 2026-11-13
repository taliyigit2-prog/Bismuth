// The Python camera sidecar's life (Faz 20 P20a, K-49): Electron starts it, watches it and stops it.
//   - every start gets a fresh 32-byte token and a free port on 127.0.0.1; both reach the sidecar through the
//     environment (never the command line, where `ps` shows them), the settings go as one JSON value,
//   - the stdin pipe stays open for the sidecar's whole life: when Bismuth ends (even by a crash) the pipe closes
//     and the sidecar exits by itself; on a normal stop Bismuth closes it, asks SIGTERM, and kills after a grace time,
//   - a crash restarts it with a growing pause; 3 crashes within the window raise one notice, 5 stop the retries
//     and raise another (the owner restarts it from the Kamera screen),
//   - health is polled while it starts (models load) and afterwards; a sidecar that stops answering is killed
//     and counted as a crash.
// Node only (no Electron import): the main process passes the paths and the notice handler; tests pass a fake sidecar.
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
// Only to pick a free loopback port for the sidecar (listen on 127.0.0.1:0, then close).
// eslint-disable-next-line no-restricted-imports
import { createServer } from 'node:net'
import { createBridge, BRIDGE_HOST, type Bridge, type BridgeFetch, type BridgeHealth } from './bridge'
import { redactSecrets } from './redact'

export type SidecarState = 'stopped' | 'starting' | 'running' | 'backoff' | 'gaveUp'

export type SidecarNotice = { kind: 'crashed'; crashes: number } | { kind: 'gaveUp'; crashes: number }

/** The settings do not allow a start (nothing wrong with the process): the sidecar stays stopped. */
export class SidecarConfigError extends Error {
  constructor(readonly code: 'noSource') {
    super(code)
  }
}

export interface SidecarSnapshot {
  state: SidecarState
  /** Why a start was refused (`noSource`: no camera address yet), else null. */
  blocked: 'noSource' | null
  pid: number | null
  /** Crashes inside the window (what the 3 / 5 thresholds count) and since Bismuth started. */
  crashes: number
  totalCrashes: number
  lastExitAt: string | null
  lastExit: string | null
  /** Last sidecar line that looked like an error, passwords masked. */
  lastError: string | null
  loop: BridgeHealth['loop']
  /** Start / stop / crash lines with times (no secrets): the sidecar's journal. */
  history: string[]
}

export interface SidecarOptions {
  command: string
  args: string[]
  cwd: string
  /** Extra environment on top of this process's own. */
  env?: NodeJS.ProcessEnv
  /** The settings as the sidecar reads them (`BISMUTH_CAMERA_CONFIG`); asked at every start, may throw SidecarConfigError. */
  buildConfig: (port: number) => Record<string, unknown>
  onNotice?: (notice: SidecarNotice) => void
  log?: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void }
  /** Tests. */
  spawn?: typeof spawn
  fetch?: BridgeFetch
  pickPort?: () => Promise<number>
  now?: () => number
  healthTimeoutMs?: number
  healthIntervalMs?: number
  monitorIntervalMs?: number
  stopGraceMs?: number
  windowMs?: number
  notifyAfter?: number
  giveUpAfter?: number
  backoffMs?: (crashes: number) => number
}

export interface Sidecar {
  /** Starts it (resolves when the process is launched, not when it is healthy). */
  start(): Promise<void>
  /** Stops it and resolves when the process is gone. */
  stop(): Promise<void>
  restart(): Promise<void>
  snapshot(): SidecarSnapshot
  /** The live bridge while a process runs (for the screen: alarms, live picture address). */
  bridge(): Bridge | null
}

/** A free port on the loopback interface (asked of the system, released at once; the sidecar binds it next). */
export function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, BRIDGE_HOST, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(() => (port > 0 ? resolve(port) : reject(new Error('no port'))))
    })
  })
}

const HISTORY_MAX = 100
const OUTPUT_TAIL = 20

export function createSidecar(opts: SidecarOptions): Sidecar {
  const spawnFn = opts.spawn ?? spawn
  const pick = opts.pickPort ?? pickFreePort
  const now = opts.now ?? (() => Date.now())
  const healthTimeout = opts.healthTimeoutMs ?? 120_000
  const healthInterval = opts.healthIntervalMs ?? 1_000
  const monitorInterval = opts.monitorIntervalMs ?? 10_000
  const stopGrace = opts.stopGraceMs ?? 5_000
  const windowMs = opts.windowMs ?? 10 * 60_000
  const notifyAfter = opts.notifyAfter ?? 3
  const giveUpAfter = opts.giveUpAfter ?? 5
  const backoff = opts.backoffMs ?? ((n: number) => Math.min(1_000 * 2 ** Math.max(0, n - 1), 15_000))

  let state: SidecarState = 'stopped'
  let blocked: SidecarSnapshot['blocked'] = null
  let child: ChildProcess | null = null
  let exited: Promise<void> = Promise.resolve()
  let stopping: ChildProcess | null = null
  let bridge: Bridge | null = null
  let wantRunning = false
  let generation = 0
  let crashTimes: number[] = []
  let totalCrashes = 0
  let lastExitAt: string | null = null
  let lastExit: string | null = null
  let lastError: string | null = null
  let loop: BridgeHealth['loop'] = null
  let restartTimer: NodeJS.Timeout | null = null
  let monitorTimer: NodeJS.Timeout | null = null
  const history: string[] = []
  const tail: string[] = []

  const note = (text: string): void => {
    const line = `${new Date(now()).toISOString()} ${redactSecrets(text)}`
    history.push(line)
    if (history.length > HISTORY_MAX) history.shift()
    opts.log?.info('camera sidecar:', redactSecrets(text))
  }

  // Bismuth ended abruptly: the pipe closes the sidecar too, and this is the second net (`kill` at process exit).
  const onProcessExit = (): void => {
    try {
      child?.kill('SIGKILL')
    } catch {
      // already gone
    }
  }
  process.once('exit', onProcessExit)

  const clearTimers = (): void => {
    if (restartTimer) clearTimeout(restartTimer)
    if (monitorTimer) clearInterval(monitorTimer)
    restartTimer = null
    monitorTimer = null
  }

  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms).unref?.())

  function feed(stream: NodeJS.ReadableStream | null): void {
    if (!stream) return
    let buffer = ''
    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      let at: number
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = redactSecrets(buffer.slice(0, at).trim())
        buffer = buffer.slice(at + 1)
        if (!line) continue
        tail.push(line)
        if (tail.length > OUTPUT_TAIL) tail.shift()
        if (/error|exception|traceback|fail/i.test(line)) lastError = line.slice(0, 300)
      }
    })
  }

  async function waitHealthy(gen: number, proc: ChildProcess, b: Bridge): Promise<void> {
    const deadline = now() + healthTimeout
    while (gen === generation && child === proc && now() < deadline) {
      const h = await b.health()
      if (gen !== generation || child !== proc) return
      if (h?.state === 'running') {
        state = 'running'
        loop = h.loop
        note('running')
        startMonitor(gen, proc, b)
        return
      }
      if (h?.state === 'failed') {
        lastError = h.error ?? 'failed'
        note('sidecar reported failed; killing it')
        proc.kill('SIGKILL')
        return
      }
      await sleep(healthInterval)
    }
    if (gen === generation && child === proc) {
      note('health timeout; killing it')
      proc.kill('SIGKILL')
    }
  }

  function startMonitor(gen: number, proc: ChildProcess, b: Bridge): void {
    let misses = 0
    monitorTimer = setInterval(() => {
      void b.health().then((h) => {
        if (gen !== generation || child !== proc) return
        loop = h?.loop ?? null
        if (h && h.state === 'running') {
          misses = 0
          return
        }
        if (++misses >= 3) {
          note('no health answer 3 times; killing it')
          proc.kill('SIGKILL')
        }
      })
    }, monitorInterval)
    monitorTimer.unref?.()
  }

  function onExit(proc: ChildProcess, code: number | null, signal: string | null): void {
    if (proc !== child) return
    child = null
    bridge = null
    loop = null
    if (monitorTimer) clearInterval(monitorTimer)
    monitorTimer = null
    lastExitAt = new Date(now()).toISOString()
    lastExit = signal ? `signal ${signal}` : `code ${code ?? '?'}`
    note(`exited (${lastExit})`)
    if (stopping === proc || !wantRunning) {
      state = 'stopped'
      return
    }
    const t = now()
    crashTimes = [...crashTimes.filter((c) => t - c < windowMs), t]
    totalCrashes++
    const crashes = crashTimes.length
    if (crashes === notifyAfter) opts.onNotice?.({ kind: 'crashed', crashes })
    if (crashes >= giveUpAfter) {
      state = 'gaveUp'
      wantRunning = false
      note(`gave up after ${crashes} crashes`)
      opts.onNotice?.({ kind: 'gaveUp', crashes })
      return
    }
    state = 'backoff'
    const wait = backoff(crashes)
    note(`crash ${crashes}; restart in ${wait} ms`)
    const gen = generation
    restartTimer = setTimeout(() => {
      restartTimer = null
      if (gen === generation && wantRunning) void launch()
    }, wait)
    restartTimer.unref?.()
  }

  async function launch(): Promise<void> {
    const gen = ++generation
    state = 'starting'
    blocked = null
    let port: number
    let config: Record<string, unknown>
    try {
      port = await pick()
      config = opts.buildConfig(port)
    } catch (error) {
      if (gen !== generation) return
      if (error instanceof SidecarConfigError) {
        blocked = error.code
        state = 'stopped'
        wantRunning = false
        note(`not started: ${error.code}`)
        return
      }
      lastError = redactSecrets(error instanceof Error ? error.message : String(error))
      state = 'stopped'
      wantRunning = false
      note('not started: configuration failed')
      return
    }
    if (gen !== generation || !wantRunning) return

    const token = randomBytes(32).toString('hex')
    const proc = spawnFn(opts.command, opts.args, {
      cwd: opts.cwd,
      env: {
        ...process.env,
        ...opts.env,
        PYTHONUNBUFFERED: '1',
        BISMUTH_CAMERA_TOKEN: token,
        BISMUTH_CAMERA_CONFIG: JSON.stringify(config),
        BISMUTH_CAMERA_WATCH_STDIN: '1'
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    child = proc
    exited = new Promise<void>((resolve) => {
      let done = false
      const finish = (code: number | null, signal: string | null): void => {
        if (done) return
        done = true
        onExit(proc, code, signal)
        resolve()
      }
      proc.once('exit', (code, signal) => finish(code, signal))
      proc.once('error', (error) => {
        lastError = redactSecrets(error.message)
        finish(null, null)
      })
    })
    proc.stdin?.on('error', () => undefined) // a closed pipe is the sidecar's own exit
    feed(proc.stdout)
    feed(proc.stderr)
    note(`started (pid ${proc.pid ?? '?'}, port ${port})`)
    bridge = createBridge({ port, token, fetch: opts.fetch })
    void waitHealthy(gen, proc, bridge)
  }

  async function start(): Promise<void> {
    if (wantRunning && (state === 'starting' || state === 'running' || state === 'backoff')) return
    wantRunning = true
    crashTimes = []
    clearTimers()
    await launch()
  }

  async function stop(): Promise<void> {
    wantRunning = false
    generation++
    clearTimers()
    const proc = child
    if (!proc) {
      state = 'stopped'
      return
    }
    stopping = proc
    note('stop requested')
    try {
      proc.stdin?.end()
    } catch {
      // the pipe may be closed already
    }
    try {
      proc.kill('SIGTERM')
    } catch {
      // already gone
    }
    const grace = new Promise<'late'>((r) => setTimeout(() => r('late'), stopGrace).unref?.())
    if ((await Promise.race([exited.then(() => 'done' as const), grace])) === 'late') {
      note(`still alive after ${stopGrace} ms; killing it`)
      try {
        proc.kill('SIGKILL')
      } catch {
        // already gone
      }
      await Promise.race([exited, sleep(2_000)])
    }
    stopping = null
    state = 'stopped'
  }

  return {
    start,
    stop,
    async restart() {
      await stop()
      await start()
    },
    snapshot: () => ({
      state,
      blocked,
      pid: child?.pid ?? null,
      crashes: crashTimes.filter((c) => now() - c < windowMs).length,
      totalCrashes,
      lastExitAt,
      lastExit,
      lastError,
      loop,
      history: [...history]
    }),
    bridge: () => bridge
  }
}
