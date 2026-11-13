// The camera module's secrets (K-49, K-51): the camera address (an RTSP URL carries the camera's user and password)
// and the Telegram bot token and chat ids. They are NOT settings: every signed-in user reads settings. One JSON file in
// userData, each value sealed with the operating system's key store (Electron `safeStorage`, as `network/state.ts`
// seals the rate-provider keys); a computer without a key store keeps them in the clear in a file only its own user
// can read (0600). Written atomically; never copied into a backup, a log or a window.
import { chmodSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { Sealer } from '../network/state'

export const SECRET_IDS = ['camera.source', 'telegram.token', 'telegram.chatIds'] as const
export type SecretId = (typeof SECRET_IDS)[number]

export interface SecretStore {
  get(id: SecretId): string | null
  has(id: SecretId): boolean
  /** null removes it. */
  set(id: SecretId, value: string | null): void
}

interface FileShape {
  version: 1
  /** `os:` + base64 when sealed. */
  sealed: Partial<Record<SecretId, string>>
  /** Only on a computer without a key store. */
  plain: Partial<Record<SecretId, string>>
}

const isId = (id: string): id is SecretId => (SECRET_IDS as readonly string[]).includes(id)

/** `file` null = memory only (tests). A missing or damaged file starts empty. */
export function createSecretStore(file: string | null, sealer: Sealer | null): SecretStore {
  let values: Partial<Record<SecretId, string>> | null = null

  const load = (): Partial<Record<SecretId, string>> => {
    if (values) return values
    values = {}
    if (!file) return values
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<FileShape>
      for (const [id, sealed] of Object.entries(parsed.sealed ?? {})) {
        if (!isId(id) || typeof sealed !== 'string') continue
        const plain = sealer?.open(sealed) ?? null
        if (plain !== null) values[id] = plain // another computer's key store: forgotten
      }
      for (const [id, plain] of Object.entries(parsed.plain ?? {})) {
        if (isId(id) && typeof plain === 'string') values[id] = plain
      }
    } catch {
      values = {}
    }
    return values
  }

  const write = (): void => {
    if (!file) return
    const sealedOut: FileShape['sealed'] = {}
    const plainOut: FileShape['plain'] = {}
    for (const [id, value] of Object.entries(load())) {
      if (!isId(id) || value === undefined) continue
      const sealed = sealer?.seal(value) ?? null
      if (sealed !== null) sealedOut[id] = sealed
      else plainOut[id] = value
    }
    const body: FileShape = { version: 1, sealed: sealedOut, plain: plainOut }
    writeFileSync(`${file}.tmp`, JSON.stringify(body), { mode: 0o600 })
    chmodSync(`${file}.tmp`, 0o600)
    renameSync(`${file}.tmp`, file)
  }

  return {
    get: (id) => load()[id] ?? null,
    has: (id) => (load()[id] ?? '') !== '',
    set(id, value) {
      const all = load()
      if (value === null || value === '') delete all[id]
      else all[id] = value
      write()
    }
  }
}
