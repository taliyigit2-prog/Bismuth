// The change feed of the main computer (faz-13 madde 3, 10): what a client computer's read-only copy pulls over
// the local or private network.
//   GET /api/replica/changes?after=<seq>&epoch=<term>[&limit=n]  — a page of changes (JSON), or, with
//       `Accept: text/event-stream`, the same pages pushed as they happen (SSE, a ping every 15 s);
//   GET /api/replica/snapshot                                     — every copied row (NDJSON, one row per line,
//       the first line says where the snapshot starts, the last line that it is complete).
// Who: a copy grant (`Authorization: Bearer …`, src/main/replica/grants.ts) or a signed-in session whose role has
// `remote.settings`. Nobody → 401, not allowed → 403. GET only, nothing changes, no cookie needed for a grant, so
// another site's page gains nothing (and no CORS header lets it read an answer). Identity numbers only to a person
// whose role may see them; sign-in hashes never (src/main/replica/tables.ts).
import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { BismuthDb } from '../db/client'
import { checkGrant } from '../replica/grants'
import {
  currentEpoch,
  logBounds,
  readChanges,
  snapshotMeta,
  snapshotRows,
  type Change
} from '../replica/feed'
import type { RowFilter } from '../replica/tables'
import type { RequestNetwork } from '../services/auth-service'
import type { Ctx } from '../services/context'

const PAGE = 1_000
const POLL_MS = 1_000
const PING_MS = 15_000
/** An open stream ends after this long; the client simply opens the next one. */
const STREAM_MS = 10 * 60_000
/** Open change streams per grant and per address (one copy needs one; a second covers a reconnect). D4. */
const MAX_STREAMS = 2
/** Whole snapshots per grant and per address in a minute (each reads every table). D4. */
const SNAPSHOTS_PER_MINUTE = 2

export interface FeedPage {
  epoch: number
  schemaVersion: number
  minSeq: number
  maxSeq: number
  /** The client's copy cannot continue from `after` (another term, or the log was trimmed past it). */
  snapshotNeeded: boolean
  changes: Change[]
  /** More changes wait after this page. */
  more: boolean
  /** The reader may receive identity numbers (false: the copy forgets those it holds, D6). */
  identity: boolean
}

export interface ReplicaFeedDeps {
  db: BismuthDb
  sqlite: Database.Database
  schemaVersion(): number
  /** True once another computer took over: this one's feed is not the hotel's data any more. */
  replaced(): boolean
  clock?: () => Date
}

export interface FeedCaller {
  /** `Authorization: Bearer <token>`. */
  token: string | null
  /** The signed-in session's context, when the request carries one. */
  sessionCtx: Ctx | null
  network: RequestNetwork
  /** The caller's address (streams and snapshots are counted per address too). */
  ip?: string
}

const errorJson = (status: number, code: string, messageKey: string): Response =>
  new Response(JSON.stringify({ error: { code, messageKey } }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  })

export function createReplicaFeed(deps: ReplicaFeedDeps) {
  const clock = deps.clock ?? (() => new Date())
  const openStreams = new Map<string, number>()
  const snapshotsAt = new Map<string, number[]>()

  /** Who is counted: the grant (never its token itself) and the address. */
  const countKeys = (caller: FeedCaller): string[] => [
    ...(caller.token ? [`grant:${createHash('sha256').update(caller.token).digest('hex')}`] : []),
    ...(caller.sessionCtx?.userId ? [`user:${caller.sessionCtx.userId}`] : []),
    ...(caller.ip ? [`ip:${caller.ip}`] : [])
  ]
  const tooMany = (): Response => errorJson(429, 'RATE_LIMITED', 'errors.tooManyRequests')

  function snapshotAllowed(keys: string[]): boolean {
    const since = clock().getTime() - 60_000
    const recent = keys.map((k) => (snapshotsAt.get(k) ?? []).filter((t) => t > since))
    if (recent.some((list) => list.length >= SNAPSHOTS_PER_MINUTE)) return false
    keys.forEach((k, i) => snapshotsAt.set(k, [...recent[i]!, clock().getTime()]))
    return true
  }

  /** Who asks, and whether identity numbers may go to them; or the refusal. */
  function authorise(caller: FeedCaller): RowFilter | Response {
    if (caller.token) {
      const grant = checkGrant(deps.db, caller.token, caller.network, clock())
      if (!grant.ok)
        return grant.status === 401
          ? errorJson(401, 'UNAUTHENTICATED', 'errors.unauthenticated')
          : errorJson(403, 'PERMISSION_DENIED', 'errors.permissionDenied')
      // The copy is this person's: their own personal notes go to it, nobody else's (§4.9-12).
      return { identity: grant.identity, reader: grant.userId }
    }
    const ctx = caller.sessionCtx
    if (!ctx || ctx.userId === null || ctx.kind === 'anonymous' || ctx.kind === 'locked')
      return errorJson(401, 'UNAUTHENTICATED', 'errors.unauthenticated')
    if (!ctx.can('remote.settings', 'view'))
      return errorJson(403, 'PERMISSION_DENIED', 'errors.permissionDenied')
    return { identity: ctx.can('guests.identity', 'view'), reader: ctx.userId }
  }

  function page(after: number, epoch: number | null, limit: number, filter: RowFilter): FeedPage {
    const { minSeq, maxSeq } = logBounds(deps.sqlite)
    const mine = currentEpoch(deps.sqlite)
    const snapshotNeeded = (epoch !== null && epoch !== mine) || after < minSeq - 1 || after > maxSeq
    const changes = snapshotNeeded ? [] : readChanges(deps.sqlite, after, limit, filter)
    return {
      epoch: mine,
      schemaVersion: deps.schemaVersion(),
      minSeq,
      maxSeq,
      snapshotNeeded,
      changes,
      more: !snapshotNeeded && changes.length > 0 && changes.at(-1)!.seq < maxSeq,
      identity: filter.identity
    }
  }

  function stream(
    after: number,
    epoch: number | null,
    filter: RowFilter,
    signal: AbortSignal,
    keys: string[]
  ): Response {
    for (const k of keys) openStreams.set(k, (openStreams.get(k) ?? 0) + 1)
    let released = false
    const release = (): void => {
      if (released) return
      released = true
      for (const k of keys) {
        const left = (openStreams.get(k) ?? 1) - 1
        if (left > 0) openStreams.set(k, left)
        else openStreams.delete(k)
      }
    }
    const encoder = new TextEncoder()
    let cursor = after
    let timer: ReturnType<typeof setInterval> | null = null
    let lastSent = 0
    const started = Date.now()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (text: string): void => {
          try {
            controller.enqueue(encoder.encode(text))
          } catch {
            stop()
          }
        }
        const stop = (): void => {
          if (timer) clearInterval(timer)
          timer = null
          release()
          try {
            controller.close()
          } catch {
            // already closed
          }
        }
        const round = (first: boolean): void => {
          if (signal.aborted || Date.now() - started > STREAM_MS) return stop()
          try {
            const p = page(cursor, epoch, PAGE, filter)
            if (first || p.changes.length || p.snapshotNeeded) {
              send(`event: changes\ndata: ${JSON.stringify(p)}\n\n`)
              lastSent = Date.now()
              if (p.snapshotNeeded) return stop()
              if (p.changes.length) cursor = p.changes.at(-1)!.seq
            } else if (Date.now() - lastSent >= PING_MS) {
              send(': ping\n\n')
              lastSent = Date.now()
            }
          } catch {
            stop()
          }
        }
        round(true)
        timer = setInterval(() => round(false), POLL_MS)
        signal.addEventListener('abort', stop)
      },
      cancel() {
        if (timer) clearInterval(timer)
        timer = null
        release()
      }
    })
    return new Response(body, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no'
      }
    })
  }

  function snapshot(filter: RowFilter): Response {
    const identity = filter.identity
    const meta = snapshotMeta(deps.sqlite, deps.schemaVersion(), clock())
    const rows = snapshotRows(deps.sqlite, filter)
    const encoder = new TextEncoder()
    let count = 0
    let sentMeta = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sentMeta) {
          sentMeta = true
          controller.enqueue(encoder.encode(`${JSON.stringify({ meta, identity })}\n`))
          return
        }
        // About a thousand rows per pull: the event loop keeps turning between them.
        let chunk = ''
        for (let i = 0; i < 1_000; i++) {
          const next = rows.next()
          if (next.done) {
            controller.enqueue(encoder.encode(`${chunk}${JSON.stringify({ end: true, count })}\n`))
            controller.close()
            return
          }
          count++
          chunk += `${JSON.stringify(next.value)}\n`
        }
        controller.enqueue(encoder.encode(chunk))
      }
    })
    return new Response(body, {
      headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' }
    })
  }

  return {
    /** Answers GET /api/replica/changes and /api/replica/snapshot. */
    handle(request: Request, caller: FeedCaller): Response {
      if (deps.replaced()) return errorJson(409, 'CONFLICT', 'errors.notMainComputer')
      const allowed = authorise(caller)
      if (allowed instanceof Response) return allowed
      const url = new URL(request.url)
      const keys = countKeys(caller)
      if (url.pathname === '/api/replica/snapshot')
        return snapshotAllowed(keys) ? snapshot(allowed) : tooMany()
      if (url.pathname !== '/api/replica/changes')
        return errorJson(404, 'UNKNOWN_PROCEDURE', 'errors.unknownProcedure')
      const after = Number(url.searchParams.get('after') ?? '0')
      const epochText = url.searchParams.get('epoch')
      const epoch = epochText === null ? null : Number(epochText)
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? PAGE) || PAGE, 1), 5_000)
      if (!Number.isInteger(after) || after < 0 || (epoch !== null && !Number.isInteger(epoch)))
        return errorJson(400, 'VALIDATION', 'errors.validation')
      if ((request.headers.get('accept') ?? '').includes('text/event-stream')) {
        if (keys.some((k) => (openStreams.get(k) ?? 0) >= MAX_STREAMS)) return tooMany()
        return stream(after, epoch, allowed, request.signal, keys)
      }
      return new Response(JSON.stringify(page(after, epoch, limit, allowed)), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
      })
    }
  }
}
export type ReplicaFeed = ReturnType<typeof createReplicaFeed>
