// The owner's read-only copy on a client computer (faz-13 madde 3; G-141): a separate SQLite file
// (`userData/replica/replica.db`, never the hotel's database — yasak 13) kept up to date from the main computer's
// change log (live) and the Drive box. While the main computer cannot be reached, every screen reads from it through
// the same router and services as on the hotel's computer, as the person the copy was made for, with every edit
// right off: changes are refused with "read-only copy". Answers carry status 203 so the screens know where the data
// comes from (the "Yedek kopya · 14:32" badge, write buttons closed).
// No Electron here (the main process passes paths and version in; tests use a temporary folder).
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { isProcedureName, type ProcedureName } from '@shared/contract'
import { createApiApp } from '../api/app'
import { createHandlers } from '../api/handlers'
import { MigrationError, openReplicaDatabase, type ReplicaDatabase } from '../db/client'
import { createServices, type Services } from '../services'
import { readOnlyCtx, type Ctx } from '../services/context'
import { AppError } from '../services/errors'
import { readOnlyError } from '../services/kit'
import { ctxForUser } from '../services/users-service'
import { hasData, readState, type ReplicaState } from './apply'

export interface ReplicaAnswer {
  status: number
  body: string
}

/** Sign-in and account procedures cannot work on a copy without password hashes; these answer. */
const AUTH_OK: ReadonlySet<string> = new Set([
  'auth.state',
  'auth.ping',
  'auth.me',
  'auth.signInUsers',
  'auth.devices'
])

export interface ReplicaStoreOptions {
  /** userData of this computer. */
  root: string
  /** P21b: the copy of this hotel lives in `replica/<hotel>/`; none = an empty placeholder (no hotel in use). */
  hotel?: string | null
  migrationsFolder: string
  version: string
  onError?: (error: unknown, what: string) => void
}

const json = (status: number, value: unknown): ReplicaAnswer => ({ status, body: JSON.stringify(value) })

/** SQLite refusing a write on the read-only connection is the copy saying "read-only". */
const isReadOnlyFailure = (error: unknown): boolean =>
  !!error &&
  typeof error === 'object' &&
  String((error as { code?: unknown }).code ?? '').startsWith('SQLITE_READONLY')

/** `userData/replica/<hotel>/` (P21b). */
export const copyFolder = (root: string, hotel: string | null | undefined): string =>
  join(root, 'replica', hotel ?? '_none')

/**
 * Before P21b a computer kept one copy in `replica/` itself: it moves under the hotel's code (once, when the saved
 * hotel list is first made from the one address this computer used).
 */
export function migrateLegacyCopy(root: string, hotel: string): void {
  const legacy = join(root, 'replica')
  if (!existsSync(join(legacy, 'replica.db'))) return
  const target = copyFolder(root, hotel)
  if (existsSync(join(target, 'replica.db'))) return
  mkdirSync(target, { recursive: true })
  for (const name of ['replica.db', 'replica.db-wal', 'replica.db-shm', 'attachments', 'backups'])
    if (existsSync(join(legacy, name))) renameSync(join(legacy, name), join(target, name))
}

export function createReplicaStore(options: ReplicaStoreOptions) {
  let folder = copyFolder(options.root, options.hotel)
  let file = join(folder, 'replica.db')
  let db: ReplicaDatabase | null = null
  let services: Services | null = null
  let api: ReturnType<typeof createApiApp> | null = null

  function open(): ReplicaDatabase {
    if (db) return db
    mkdirSync(folder, { recursive: true })
    try {
      db = openReplicaDatabase({ file, migrationsFolder: options.migrationsFolder })
    } catch (error) {
      if (!(error instanceof MigrationError)) throw error
      // A copy this program cannot read (made by a newer one): start a fresh copy.
      options.onError?.(error, 'replica reset')
      removeFiles()
      db = openReplicaDatabase({ file, migrationsFolder: options.migrationsFolder })
    }
    return db
  }

  function drop(): void {
    db?.close()
    db = null
    services = null
    api = null
  }

  function removeFiles(): void {
    for (const f of [file, `${file}-wal`, `${file}-shm`]) rmSync(f, { force: true })
  }

  function router(): { services: Services; api: ReturnType<typeof createApiApp> } {
    const handle = open()
    if (!services || !api) {
      services = createServices(
        handle.reader,
        {
          name: 'Bismuth',
          version: options.version,
          packaged: false,
          dataDir: folder,
          electron: null,
          chrome: null
        },
        { attachmentsDir: join(folder, 'attachments'), backupsDir: join(folder, 'backups') }
      )
      api = createApiApp({
        handlers: createHandlers(services),
        mapError: (error) => (isReadOnlyFailure(error) ? readOnlyError('replica') : null),
        onInternalError: (error, path) => options.onError?.(error, `replica ${path}`)
      })
    }
    return { services, api }
  }

  /** The copy's reader as `userId` would be on the main computer, every edit right off; null when unknown here. */
  function ctxFor(userId: string): Ctx | null {
    const base = ctxForUser(open().reader.db, userId, 'replica', 'ipc')
    return base ? readOnlyCtx(base, 'replica') : null
  }

  return {
    get file(): string {
      return file
    },
    /** Another hotel's copy from now on (null: none in use). The earlier one stays on disk as it was. */
    use(hotel: string | null): void {
      drop()
      folder = copyFolder(options.root, hotel)
      file = join(folder, 'replica.db')
    },
    /** A hotel left the list: its copy goes (it is only a copy; the hotel's own data is untouched). */
    removeCopy(hotel: string): void {
      const target = copyFolder(options.root, hotel)
      if (target === folder) drop()
      rmSync(target, { recursive: true, force: true })
    },
    state(): ReplicaState {
      return readState(open().writer)
    },
    /** The copy has data to show. */
    usable(): boolean {
      try {
        return hasData(readState(open().writer))
      } catch (error) {
        options.onError?.(error, 'replica state')
        return false
      }
    },
    /** The copier's connection (live sync, box reader). */
    writer: () => open().writer,
    schemaVersion: () => open().schemaVersion,

    /** One call of a window, answered from the copy as `userId` (status 203 on success). */
    async call(name: string, body: string, userId: string): Promise<ReplicaAnswer> {
      if (!isProcedureName(name))
        return json(404, { error: { code: 'UNKNOWN_PROCEDURE', messageKey: 'errors.unknownProcedure' } })
      const procedure: ProcedureName = name
      const ctx = ctxFor(userId)
      if (!ctx) return json(401, { error: { code: 'UNAUTHENTICATED', messageKey: 'errors.unauthenticated' } })
      if (procedure === 'auth.lock') return json(203, { ok: true })
      if (procedure.startsWith('auth.') && !AUTH_OK.has(procedure)) {
        const error = readOnlyError('replica')
        return json(error.status, { error: { code: error.code, messageKey: error.messageKey } })
      }
      if (procedure === 'auth.signInUsers' || procedure === 'auth.devices') return json(203, [])
      const { api: app } = router()
      const response = await app.fetch(
        new Request(`http://bismuth.replica/api/${procedure}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: body || '{}'
        }),
        { ctx, session: null, transport: 'ipc' }
      )
      const text = await response.text()
      return { status: response.status >= 200 && response.status < 300 ? 203 : response.status, body: text }
    },

    /** Forget the copy (another main computer, or switched off): the files go, a new copy starts empty. */
    reset(): void {
      db?.close()
      db = null
      services = null
      api = null
      removeFiles()
    },
    close(): void {
      db?.close()
      db = null
      services = null
      api = null
    }
  }
}
export type ReplicaStore = ReturnType<typeof createReplicaStore>

export { AppError }
