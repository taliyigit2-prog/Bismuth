// Client mode lives in a small file, not in the hotel database (CLAUDE.md yasak 13, faz-13 "Faz 4'ten notlar"): a
// computer that uses the hotel's main computer never opens a local hotel.db. The file says which way this computer
// works, the main computer's address, the device cookie the main computer gave it, and the last language and theme
// (so the connection screen keeps them while the main computer cannot be reached).
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import * as z from 'zod'
import { APP_LOCALES } from '@shared/format'
import { normalizeHostUrl } from '@shared/contract/remote'

const configSchema = z.object({
  mode: z.enum(['local', 'client']),
  hostUrl: z
    .string()
    .nullable()
    .transform((v) => (v ? normalizeHostUrl(v) : null)),
  /** The main computer's signed device cookie (`<id>.<mac>`): this computer is one device in its list. */
  device: z
    .string()
    .regex(/^[\w.-]{1,200}$/)
    .nullable()
    .optional(),
  /**
   * The main computer's public key met first (K-45 (1), trust on first use): another one at the hotel's address
   * stops the link until the person accepts it.
   */
  hostKey: z
    .string()
    .regex(/^[\w-]{43}$/)
    .nullable()
    .optional(),
  display: z
    .object({
      'ui.language': z.enum(APP_LOCALES).optional(),
      'ui.theme': z.enum(['light', 'dark', 'system']).optional()
    })
    .optional(),
  /**
   * The read-only copy (P13b): the main computer's grant to pull its change log (like the device cookie, a
   * credential kept only here), whose view the copy shows, and the Drive box folder chosen by hand.
   */
  replica: z
    .object({
      token: z
        .string()
        .regex(/^[\w-]{20,200}$/)
        .nullable(),
      /**
       * The same grant sealed with the system's key store (D5: Windows DPAPI, macOS Keychain); `token` is then null
       * in the file and filled in memory only.
       */
      tokenSealed: z.string().max(4000).nullable().optional(),
      userId: z.string().max(100).nullable(),
      userName: z.string().max(200).nullable(),
      folder: z.string().max(500).nullable()
    })
    .optional()
})
export type ConnectionConfig = z.output<typeof configSchema>

export const LOCAL_CONFIG: ConnectionConfig = { mode: 'local', hostUrl: null }

/** The saved choice; a missing or damaged file means this computer keeps its own data. */
export function readConnectionConfig(file: string): ConnectionConfig {
  try {
    const parsed = configSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
    return parsed.success ? parsed.data : LOCAL_CONFIG
  } catch {
    return LOCAL_CONFIG
  }
}

/** Write then rename: a crash mid-write never leaves half a file. */
export function writeConnectionConfig(file: string, config: ConnectionConfig): void {
  // Only this account may read it: it holds the device cookie and the copy grant.
  writeFileSync(`${file}.tmp`, JSON.stringify(config, null, 2), { mode: 0o600 })
  renameSync(`${file}.tmp`, file)
}

/** The system's key store (Electron safeStorage), when this computer has one. */
export interface Sealer {
  seal(text: string): string
  /** Null when it cannot be opened (another user, a copied file). */
  open(sealed: string): string | null
}

/**
 * A small store over the file (the client app keeps the address and the device cookie in it). With a sealer the
 * copy grant goes into the file only sealed (D5): another program reading the file learns nothing it can use.
 */
export function createConfigStore(file: string, sealer?: Sealer) {
  const unseal = (config: ConnectionConfig): ConnectionConfig => {
    const sealed = config.replica?.tokenSealed
    if (!sealer || !config.replica || !sealed) return config
    const token = sealer.open(sealed)
    return {
      ...config,
      replica: { ...config.replica, token: token && /^[\w-]{20,200}$/.test(token) ? token : null }
    }
  }
  const forFile = (config: ConnectionConfig): ConnectionConfig => {
    if (!sealer || !config.replica) return config
    const { token } = config.replica
    return {
      ...config,
      replica: { ...config.replica, token: null, tokenSealed: token ? sealer.seal(token) : null }
    }
  }
  let current = unseal(readConnectionConfig(file))
  // A grant written before sealing: sealed now.
  if (sealer && current.replica?.token && !current.replica.tokenSealed)
    writeConnectionConfig(file, forFile(current))
  return {
    get: (): ConnectionConfig => current,
    update(patch: Partial<ConnectionConfig>): ConnectionConfig {
      current = { ...current, ...patch }
      writeConnectionConfig(file, forFile(current))
      return current
    }
  }
}
export type ConfigStore = ReturnType<typeof createConfigStore>
