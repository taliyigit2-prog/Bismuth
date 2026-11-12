// What the optional-data module remembers between runs, outside the database (it is cache, not hotel data):
// per-source health (24 h rest after a schema mismatch), the last weather answer with its HTTP caching headers,
// the user's own API keys (never sent to the screens) and the last holiday check. One JSON file in userData,
// written atomically; in memory for tests and the e2e harness. The API keys are sealed with the operating system's
// key store (Electron `safeStorage`, as the copy grant in connection.json, D5) and never written in the clear
// (P14fix #20, N-10). Not with the Bismuth key: that key changes with a restore or a key typed from the paper, and
// sealed API keys would be lost with it; nor is the Bismuth key made just because an API key was saved. A file
// sealed with the Bismuth key by the earlier version is read once and sealed again. A computer without a key store
// keeps them in the clear, in a file only its own user can read (0600).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmodSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import * as z from 'zod'
import { holidayCheckResultSchema } from '@shared/contract/external'
import type { BismuthKeyStore, SecretStorage } from '../security/bismuth-key'

const sourceHealth = z.object({
  lastOkAt: z.string().nullable().default(null),
  lastFailAt: z.string().nullable().default(null),
  /** A schema mismatch rests the source until then (K-06). */
  restingUntil: z.string().nullable().default(null)
})
export type SourceHealth = z.infer<typeof sourceHealth>

const weatherCache = z.object({
  provider: z.enum(['metno', 'openmeteo']),
  lat: z.number(),
  lon: z.number(),
  fetchedAt: z.string(),
  /** MET: do not ask again before this (Expires header). */
  expiresAt: z.string().nullable(),
  /** MET: sent back as If-Modified-Since. */
  lastModified: z.string().nullable(),
  /** The raw series kept so `now` and the days move on with the clock while offline. */
  series: z.array(
    z.object({
      time: z.string(),
      tempC: z.number(),
      windMs: z.number().nullable(),
      humidity: z.number().nullable(),
      symbol1h: z.string().nullable(),
      precip1h: z.number().nullable(),
      symbol6h: z.string().nullable(),
      precip6h: z.number().nullable()
    })
  ),
  updatedAt: z.string().nullable()
})
export type WeatherCache = z.infer<typeof weatherCache>

const stateSchema = z.object({
  version: z.literal(1).default(1),
  sources: z.record(z.string(), sourceHealth).default({}),
  fx: z
    .object({
      lastAttemptAt: z.string().nullable().default(null),
      lastSuccessAt: z.string().nullable().default(null),
      lastTcmbAt: z.string().nullable().default(null)
    })
    .default({ lastAttemptAt: null, lastSuccessAt: null, lastTcmbAt: null }),
  apiKeys: z.record(z.string(), z.string()).default({}),
  /**
   * The API keys sealed; the file holds these instead of `apiKeys`. `os:` + base64 of the key store's blob; without
   * the prefix: the earlier version's base64 of iv · tag · ciphertext under the Bismuth key (read once, sealed again).
   */
  sealedKeys: z.record(z.string(), z.string()).optional(),
  weather: weatherCache.nullable().default(null),
  holidays: z
    .object({
      lastCheckedAt: z.string().nullable().default(null),
      /** Calendar year in which the automatic check last ran (it runs once a year). */
      lastYear: z.number().nullable().default(null),
      lastResults: z.array(holidayCheckResultSchema).default([])
    })
    .default({ lastCheckedAt: null, lastYear: null, lastResults: [] })
})
export type ExternalState = z.infer<typeof stateSchema>

export interface StateStore {
  read(): ExternalState
  update(fn: (state: ExternalState) => void): ExternalState
}

const fresh = (): ExternalState => stateSchema.parse({})

/** Seals short secrets for the cache file; null when this computer has no safe key (then they stay as they are). */
export interface Sealer {
  seal(plain: string): string | null
  open(sealed: string): string | null
}

const SYSTEM_PREFIX = 'os:'

/** Sealed with the operating system's key store (DPAPI, Keychain); null when this computer has none. */
export function systemSealer(storage: SecretStorage | null): Sealer | null {
  const available = (): boolean => {
    try {
      return storage?.isEncryptionAvailable() ?? false
    } catch {
      return false
    }
  }
  if (!storage || !available()) return null
  return {
    seal(plain) {
      try {
        return SYSTEM_PREFIX + storage.encryptString(plain).toString('base64')
      } catch {
        return null
      }
    },
    open(sealed) {
      if (!sealed.startsWith(SYSTEM_PREFIX)) return null
      try {
        return storage.decryptString(Buffer.from(sealed.slice(SYSTEM_PREFIX.length), 'base64'))
      } catch {
        return null // another computer's (or user's) key store: that key is forgotten
      }
    }
  }
}

/**
 * AES-256-GCM with the Bismuth key: the earlier version's sealing, kept to read its files once (`legacy` of
 * createStateStore). It never makes the Bismuth key (N-10).
 */
export function keySealer(keys: BismuthKeyStore): Sealer {
  const key = (): Buffer | null => {
    try {
      return keys.get()
    } catch {
      return null
    }
  }
  return {
    seal(plain) {
      const k = key()
      if (!k) return null
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', k, iv)
      const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
    },
    open(sealed) {
      const k = key()
      if (!k || sealed.startsWith(SYSTEM_PREFIX)) return null
      try {
        const raw = Buffer.from(sealed, 'base64')
        const decipher = createDecipheriv('aes-256-gcm', k, raw.subarray(0, 12))
        decipher.setAuthTag(raw.subarray(12, 28))
        return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
      } catch {
        return null // another computer's key, or a damaged line: that key is forgotten
      }
    }
  }
}

/**
 * `file` null = memory only. A missing or damaged file starts empty (it is only a cache). With a `sealer` the API
 * keys are written sealed (a file of the earlier version with keys in the clear is read, and sealed at the next
 * write). `legacy` opens what an earlier version sealed differently (the Bismuth key); such a file is written again
 * at once with `sealer`. The file is only ever readable by this computer's user (0600).
 */
export function createStateStore(
  file: string | null,
  sealer: Sealer | null = null,
  legacy: Sealer | null = null
): StateStore {
  let state: ExternalState | null = null
  let resealNow = false
  const load = (): ExternalState => {
    if (state) return state
    if (!file) return (state = fresh())
    try {
      const parsed = stateSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')))
      state = parsed.success ? parsed.data : fresh()
    } catch {
      state = fresh()
    }
    if (state.sealedKeys) {
      for (const [id, sealed] of Object.entries(state.sealedKeys)) {
        let plain = sealer?.open(sealed) ?? null
        if (plain === null && !sealed.startsWith(SYSTEM_PREFIX)) {
          plain = legacy?.open(sealed) ?? null
          if (plain !== null) resealNow = true
        }
        if (plain !== null) state.apiKeys[id] = plain
      }
      delete state.sealedKeys
    }
    return state
  }
  const write = (next: ExternalState): void => {
    if (!file) return
    try {
      writeFileSync(`${file}.tmp`, JSON.stringify(onDisk(next)), { mode: 0o600 })
      chmodSync(`${file}.tmp`, 0o600)
      renameSync(`${file}.tmp`, file)
    } catch {
      // A cache that cannot be written is only forgotten at the next start.
    }
  }
  /** What goes to the file: the keys sealed when they can be. */
  const onDisk = (next: ExternalState): ExternalState => {
    const ids = Object.keys(next.apiKeys)
    if (!sealer || ids.length === 0) return next
    const sealedKeys: Record<string, string> = {}
    for (const id of ids) {
      const sealed = sealer.seal(next.apiKeys[id]!)
      if (sealed === null) return next
      sealedKeys[id] = sealed
    }
    return { ...next, apiKeys: {}, sealedKeys }
  }
  /** A file sealed with the Bismuth key by the earlier version is sealed again with the key store once read. */
  const loaded = (): ExternalState => {
    const current = load()
    if (resealNow) {
      resealNow = false
      write(current)
    }
    return current
  }
  return {
    read: () => structuredClone(loaded()),
    update(fn) {
      const next = structuredClone(loaded())
      fn(next)
      state = next
      write(next)
      return structuredClone(next)
    }
  }
}
