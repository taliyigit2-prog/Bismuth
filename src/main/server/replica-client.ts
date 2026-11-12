// The read-only copy on a client computer, put together (faz-13 madde 3, 4, 5): the copy itself
// (src/main/replica/store.ts), its live link (replica-sync.ts), the Drive box reader (src/main/relay/reader.ts),
// the Bismuth key typed in once from the owner's paper, the box folder, and "Bu bilgisayarı ana bilgisayar yap".
// The copy starts by itself the first time someone whose role may keep it (`remote.settings`) signs in here: the
// main computer gives this computer a grant (src/main/replica/grants.ts). The window's calls are answered from the
// copy only while the main computer cannot be reached (client-app.ts decides).
import type { ReplicaStatus } from '@shared/contract/remote'
import { hasData } from '../replica/apply'
import type { ReplicaStore } from '../replica/store'
import { planTakeover, promoteCopy } from '../replica/takeover'
import { highestAnnouncedTerm, highestBoxTerm } from '../relay/epoch'
import { resolveClientBoxFolder } from '../relay/paths'
import { readBox, type RelayReadResult } from '../relay/reader'
import { writeEpochFile } from '../relay/writer'
import { decodeRecoveryText, sameKey, type BismuthKeyStore } from '../security/bismuth-key'
import { AppError } from '../services/errors'
import type { ConfigStore } from './connection-config'
import type { HostLink } from './host-link'
import { createReplicaSync, type ReplicaSync } from './replica-sync'

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface ReplicaClientDeps {
  store: ReplicaStore
  config: ConfigStore
  link: HostLink
  keys: BismuthKeyStore
  /** This computer's hotel database path (used only by a takeover). */
  hotelDbFile: string
  machineName: string
  fetch?: FetchLike
  clock?: () => Date
  /** Box reading interval while the live link is down (default 30 s). */
  boxEveryMs?: number
  /** The system's folder dialog (Electron); absent in tests. */
  pickFolder?: () => Promise<string | null>
  /** After a takeover: keep the data here from now on and start again (the main process). */
  becomeMain(): void
  onChange?(): void
  onError?(error: unknown, what: string): void
}

const replicaOf = (config: ConfigStore) =>
  config.get().replica ?? { token: null, userId: null, userName: null, folder: null }

export function createReplicaClient(deps: ReplicaClientDeps) {
  const { store, config, link, keys } = deps
  const clock = deps.clock ?? (() => new Date())
  let lastBox: RelayReadResult | null = null
  let lastBoxAt: string | null = null
  let servingAt = 0
  let boxTimer: ReturnType<typeof setInterval> | null = null
  let granting = false

  const patch = (next: Partial<ReturnType<typeof replicaOf>>): void => {
    config.update({ replica: { ...replicaOf(config), ...next } })
    deps.onChange?.()
  }

  const sync: ReplicaSync = createReplicaSync({
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
    // Only to the main computer whose identity was checked (the grant must not reach a stranger, K-45 (1)).
    hostUrl: () => link.verifiedHostUrl(),
    token: () => replicaOf(config).token,
    reader: () => replicaOf(config).userId,
    dropToken: () => patch({ token: null }),
    writer: () => store.writer(),
    schemaVersion: () => store.schemaVersion(),
    clock,
    onChange: () => deps.onChange?.(),
    onError: (error) => deps.onError?.(error, 'replica live')
  })

  const boxFolder = (): string | null => resolveClientBoxFolder(replicaOf(config).folder)

  /** One pass over the Drive box (skipped without a key or a folder). */
  function readFromBox(): RelayReadResult | null {
    const dir = boxFolder()
    const key = keys.get()
    if (!dir || !key) return null
    try {
      lastBox = readBox(
        { writer: store.writer(), schemaVersion: store.schemaVersion(), reader: replicaOf(config).userId },
        dir,
        key
      )
      lastBoxAt = clock().toISOString()
      deps.onChange?.()
      return lastBox
    } catch (error) {
      deps.onError?.(error, 'replica box')
      return null
    }
  }

  function status(): ReplicaStatus {
    const r = replicaOf(config)
    let state: ReplicaStatus['state']
    let asOf: string | null = null
    let source: ReplicaStatus['source'] = null
    let usable = false
    try {
      const s = store.state()
      usable = hasData(s)
      asOf = s.asOf
      source = s.source
    } catch (error) {
      deps.onError?.(error, 'replica state')
    }
    const live = sync.state()
    if (live === 'needsUpdate' || lastBox?.status === 'needsUpdate') state = 'needsUpdate'
    else if (live === 'hostOlder' || lastBox?.status === 'hostOlder') state = 'hostOlder'
    else if (!r.token && !usable) state = 'off'
    else if (!usable) state = 'waiting'
    else if (live === 'live') state = 'live'
    else if (lastBox?.status === 'ok' && source === 'relay') state = 'relay'
    else state = 'behind'
    const dir = boxFolder()
    const key = keys.info()
    const boxProblem: ReplicaStatus['box']['problem'] = !dir
      ? 'noFolder'
      : !key.exists
        ? 'noKey'
        : lastBox?.status === 'waiting'
          ? lastBox.reason
          : null
    const reason: ReplicaStatus['takeover']['reason'] = !usable
      ? 'noCopy'
      : !key.exists
        ? 'noKey'
        : !dir
          ? 'noFolder'
          : link.status().state === 'connected'
            ? 'hostReachable'
            : null
    return {
      state,
      asOf,
      source,
      serving: Date.now() - servingAt < 15_000,
      userName: r.userName,
      key: { exists: key.exists, available: key.available },
      box: { folder: dir, chosen: r.folder, problem: boxProblem, lastReadAt: lastBoxAt },
      takeover: { possible: reason === null || reason === 'hostReachable', reason }
    }
  }

  return {
    start(): void {
      sync.start()
      if (boxTimer) return
      boxTimer = setInterval(() => {
        if (sync.state() !== 'live') readFromBox()
      }, deps.boxEveryMs ?? 30_000)
      boxTimer.unref?.()
      setTimeout(() => {
        if (sync.state() !== 'live') readFromBox()
      }, 3_000).unref?.()
    },
    stop(): void {
      sync.stop()
      if (boxTimer) clearInterval(boxTimer)
      boxTimer = null
      store.close()
    },
    status,
    /** The copy can answer the screens (it holds data and knows whose view to show). */
    usable(): boolean {
      return replicaOf(config).userId !== null && store.usable()
    },
    userId: (): string | null => replicaOf(config).userId,
    /** The window was just answered from the copy (the status says "serving"). */
    served(): void {
      servingAt = Date.now()
    },

    /**
     * After a window's sign-in on the main computer (or its state while signed in): ask for a grant once, when the
     * person's role allows it. Quietly nothing otherwise.
     */
    async maybeGrant(
      call: () => Promise<{ status: number; body: string }>,
      session: { user: { id: string; displayName: string }; permissions: Record<string, string> } | null
    ): Promise<void> {
      if (!session || granting || replicaOf(config).token) return
      const level = session.permissions['remote.settings']
      if (level !== 'view' && level !== 'edit') return
      granting = true
      try {
        const answer = await call()
        if (answer.status !== 200) return
        const grant = JSON.parse(answer.body) as { token: string; userId: string }
        // Another person's copy was here: start the copy again for this one.
        if (replicaOf(config).userId && replicaOf(config).userId !== grant.userId) store.reset()
        patch({ token: grant.token, userId: grant.userId, userName: session.user.displayName })
        sync.poke()
      } catch (error) {
        deps.onError?.(error, 'replica grant')
      } finally {
        granting = false
      }
    },

    syncNow(): ReplicaStatus {
      sync.poke()
      if (sync.state() !== 'live') readFromBox()
      return status()
    },

    /** The key from the owner's paper. A different key already here is replaced only when the person agreed. */
    setKey(text: string, replace: boolean): ReplicaStatus {
      const key = decodeRecoveryText(text)
      if (!key) throw new AppError('VALIDATION', 'errors.backupRecoveryText')
      const current = keys.get()
      if (current && !sameKey(current, key) && !replace)
        throw new AppError('CONFLICT', 'errors.backupKeyExists')
      if (!keys.info().available) throw new AppError('CONFLICT', 'errors.backupKeyUnavailable')
      keys.set(key)
      readFromBox()
      return status()
    },

    setFolder(folder: string | null): ReplicaStatus {
      patch({ folder: folder && folder.trim() ? folder.trim() : null })
      if (folder && !boxFolder()) throw new AppError('VALIDATION', 'errors.replicaFolder')
      readFromBox()
      return status()
    },

    async pickFolder(): Promise<ReplicaStatus> {
      const chosen = deps.pickFolder ? await deps.pickFolder() : null
      if (chosen) patch({ folder: chosen })
      readFromBox()
      return status()
    },

    /**
     * "Bu bilgisayarı ana bilgisayar yap". `keyText`: the Bismuth key from the owner's paper, typed again (K-45 (4),
     * O-5): the window of this computer is not proof enough of being the hotel's owner; the paper is.
     */
    async takeOver(password: string, force: boolean, keyText: string): Promise<void> {
      const s = status()
      if (s.takeover.reason === 'noCopy') throw new AppError('CONFLICT', 'errors.takeoverNoCopy')
      if (s.takeover.reason === 'noKey') throw new AppError('CONFLICT', 'errors.takeoverNoKey')
      const typed = decodeRecoveryText(keyText)
      const kept = keys.get()
      if (!typed || !kept || !sameKey(typed, kept))
        throw new AppError('VALIDATION', 'errors.takeoverKeyMismatch')
      if (s.takeover.reason === 'noFolder') throw new AppError('CONFLICT', 'errors.takeoverNoFolder')
      if (s.takeover.reason === 'hostReachable' && !force)
        throw new AppError('CONFLICT', 'errors.takeoverHostReachable')
      const userId = replicaOf(config).userId
      const key = keys.get()
      const dir = boxFolder()
      if (!userId || !key || !dir) throw new AppError('CONFLICT', 'errors.takeoverNoCopy')
      // As far as the box goes first.
      readFromBox()
      sync.stop()
      // Above every term the box knows: announced ones, and the newest any package was written in (a restore on the
      // main computer starts a term without an announcement).
      const plan = planTakeover(store.writer(), Math.max(highestAnnouncedTerm(dir, key), highestBoxTerm(dir)))
      try {
        await promoteCopy({
          writer: store.writer(),
          hotelDb: deps.hotelDbFile,
          plan,
          userId,
          password,
          machineName: deps.machineName,
          now: clock()
        })
        writeEpochFile(
          dir,
          key,
          {
            epoch: plan.epoch,
            previousEpoch: plan.previousEpoch,
            baseSeq: plan.baseSeq,
            by: deps.machineName
          },
          store.schemaVersion(),
          clock()
        )
      } catch (error) {
        sync.start()
        if (error instanceof AppError) throw error
        deps.onError?.(error, 'takeover')
        throw new AppError('CONFLICT', 'errors.takeoverFailed')
      }
      store.close()
      deps.becomeMain()
    }
  }
}
export type ReplicaClient = ReturnType<typeof createReplicaClient>
