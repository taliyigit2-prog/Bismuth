// The read-only copy's live link (faz-13 madde 3): while the main computer answers, the client computer keeps a
// change stream open (`GET /api/replica/changes`, SSE, with its copy grant) and applies each page as it comes; a copy
// that cannot continue (another term, the log trimmed past it, an empty copy) first takes a whole snapshot.
// A different data version stops the copy (the screens say which side to update). A refused grant (the device was
// removed, the person's role changed) is forgotten: the next allowed sign-in asks again. Connection trouble only
// means "try again in a few seconds"; meanwhile the Drive box keeps the copy going (src/main/relay/reader.ts).
import type Database from 'better-sqlite3'
import type { Change, SnapshotMeta, SnapshotRow } from '../replica/feed'
import {
  applyChanges,
  applySnapshot,
  forgetIdentity,
  hasData,
  identityAllowed,
  noteIdentityAllowed,
  readState,
  touchState
} from '../replica/apply'

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface ReplicaSyncDeps {
  fetch?: FetchLike
  /** The main computer's address, or null. */
  hostUrl(): string | null
  /** The copy grant, or null when this computer has none. */
  token(): string | null
  /** The person the grant stands for: only their own personal notes stay in the copy (§4.9-12). */
  reader?(): string | null
  /** The main computer refused the grant (401/403): forget it. */
  dropToken(): void
  writer(): Database.Database
  /** Data version of this program (and of the copy). */
  schemaVersion(): number
  clock?: () => Date
  /** Wait after a failure before the next try (default 5 s). */
  retryMs?: number
  onChange?(): void
  onError?(error: unknown): void
}

export type LiveState = 'idle' | 'connecting' | 'live' | 'down' | 'needsUpdate' | 'hostOlder' | 'denied'

interface FeedPage {
  epoch: number
  schemaVersion: number
  snapshotNeeded: boolean
  changes: Change[]
  more: boolean
  /** The person may see identity numbers (absent from an older main computer: as before). */
  identity?: boolean
}

export function createReplicaSync(deps: ReplicaSyncDeps) {
  const doFetch: FetchLike = deps.fetch ?? ((input, init) => fetch(input, init))
  const clock = deps.clock ?? (() => new Date())
  let state: LiveState = 'idle'
  let running = false
  let controller: AbortController | null = null
  let wake: (() => void) | null = null
  let lastEventAt = 0
  /** The connection was cut on purpose to start again now. */
  let poked = false

  const setState = (next: LiveState): void => {
    if (next === state) return
    state = next
    deps.onChange?.()
  }

  const headers = (url: string): Record<string, string> => ({
    authorization: `Bearer ${deps.token() ?? ''}`,
    origin: new URL(url).origin,
    'x-bismuth-client': 'desktop'
  })

  /** Whole snapshot over the network; applied only when it arrived complete. */
  async function takeSnapshot(url: string, signal: AbortSignal): Promise<void> {
    const res = await doFetch(`${url}/api/replica/snapshot`, {
      headers: headers(url),
      signal,
      redirect: 'error'
    })
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error('denied'), { denied: true })
    if (!res.ok) throw new Error(`snapshot ${res.status}`)
    const lines = (await res.text()).split('\n').filter(Boolean)
    const first = JSON.parse(lines[0] ?? 'null') as { meta: SnapshotMeta; identity: boolean } | null
    const last = JSON.parse(lines.at(-1) ?? 'null') as { end?: boolean; count?: number } | null
    if (!first?.meta || !last?.end || last.count !== lines.length - 2) throw new Error('snapshot cut off')
    if (!gate(first.meta.schemaVersion)) return
    const rows = lines.slice(1, -1).map((l) => JSON.parse(l) as SnapshotRow)
    applySnapshot(deps.writer(), first.meta, rows, {
      identity: first.identity,
      // The live feed sends identity numbers exactly when the person may see them: none kept otherwise (D6).
      allowed: first.identity,
      source: 'live',
      asOf: clock().toISOString(),
      ...(deps.reader ? { reader: deps.reader() } : {})
    })
    if (first.identity) noteIdentityAllowed(deps.writer())
    else forgetIdentity(deps.writer())
    deps.onChange?.()
  }

  /** Same data version on both sides; else the copy waits for an update. */
  function gate(remote: number): boolean {
    const mine = deps.schemaVersion()
    if (remote === mine) return true
    setState(remote > mine ? 'needsUpdate' : 'hostOlder')
    return false
  }

  /** Applies one page; false when the stream must start again (snapshot taken, or nothing more to do now). */
  async function onPage(url: string, page: FeedPage, signal: AbortSignal): Promise<boolean> {
    lastEventAt = Date.now()
    if (!gate(page.schemaVersion)) return false
    const writer = deps.writer()
    // The person's role lost (or got back) identity numbers (D6): forget those the copy holds, or fetch them again.
    if (page.identity === false && identityAllowed(writer) !== false) forgetIdentity(writer)
    const regained = page.identity === true && identityAllowed(writer) === false
    if (page.snapshotNeeded || regained || !hasData(readState(writer))) {
      await takeSnapshot(url, signal)
      return false
    }
    const now = clock().toISOString()
    if (page.changes.length === 0) touchState(writer, now, 'live')
    else {
      const result = applyChanges(writer, page.changes, {
        identity: true,
        source: 'live',
        asOf: now,
        ...(deps.reader ? { reader: deps.reader() } : {})
      })
      if (result.status === 'needSnapshot') {
        await takeSnapshot(url, signal)
        return false
      }
      // A copy grant without identity rights simply never receives those columns (kept as they were).
    }
    setState('live')
    deps.onChange?.()
    return true
  }

  async function connect(url: string): Promise<void> {
    controller = new AbortController()
    const signal = controller.signal
    const s = readState(deps.writer())
    const query = hasData(s) ? `after=${s.seq}&epoch=${s.epoch}` : 'after=0&epoch=0'
    setState(state === 'live' ? 'live' : 'connecting')
    const res = await doFetch(`${url}/api/replica/changes?${query}`, {
      headers: { ...headers(url), accept: 'text/event-stream' },
      signal,
      redirect: 'error'
    })
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error('denied'), { denied: true })
    if (!res.ok || !res.body) throw new Error(`changes ${res.status}`)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      let cut: number
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, cut)
        buffer = buffer.slice(cut + 2)
        lastEventAt = Date.now()
        const data = event
          .split('\n')
          .filter((l) => l.startsWith('data: '))
          .map((l) => l.slice(6))
          .join('\n')
        if (!data) continue
        const goOn = await onPage(url, JSON.parse(data) as FeedPage, signal)
        if (!goOn) {
          controller.abort()
          return
        }
      }
    }
  }

  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms)
      wake = () => {
        clearTimeout(timer)
        resolve()
      }
    })

  async function loop(): Promise<void> {
    while (running) {
      const url = deps.hostUrl()
      if (!url || !deps.token()) {
        setState('idle')
        await sleep(5_000)
        continue
      }
      try {
        await connect(url)
        // A stream that ended normally (the server closes it every few minutes): open the next one at once.
        if (state === 'needsUpdate' || state === 'hostOlder') await sleep(60_000)
      } catch (error) {
        if (!running) return
        if (poked) {
          poked = false
          continue
        }
        if ((error as { denied?: boolean }).denied) {
          deps.dropToken()
          setState('denied')
          continue
        }
        if ((error as { name?: string }).name !== 'AbortError') deps.onError?.(error)
        setState('down')
        await sleep(deps.retryMs ?? 5_000)
      }
    }
  }

  return {
    start(): void {
      if (running) return
      running = true
      void loop()
    },
    stop(): void {
      running = false
      controller?.abort()
      wake?.()
    },
    /** Try now (a new grant, the main computer is back, "Şimdi eşitle"). */
    poke(): void {
      poked = controller !== null && !controller.signal.aborted
      controller?.abort()
      wake?.()
    },
    state: (): LiveState => (state === 'live' && Date.now() - lastEventAt > 45_000 ? 'down' : state)
  }
}
export type ReplicaSync = ReturnType<typeof createReplicaSync>
