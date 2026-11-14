// Client mode lives in a small file, not in the hotel database (CLAUDE.md yasak 13, faz-13 "Faz 4'ten notlar"): a
// computer that uses the hotel's main computer never opens a local hotel.db. The file says which way this computer
// works, the main computer's address, the device cookie the main computer gave it, and the last language and theme
// (so the connection screen keeps them while the main computer cannot be reached).
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import * as z from 'zod'
import { APP_LOCALES } from '@shared/format'
import { hotelCodeSchema, isReservedHotelCode, normalizeHostUrl } from '@shared/contract/remote'

const deviceSchema = z
  .string()
  .regex(/^[\w.-]{1,200}$/)
  .nullable()
  .optional()
const hostKeySchema = z
  .string()
  .regex(/^[\w-]{43}$/)
  .nullable()
  .optional()
const replicaSchema = z.object({
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

/** One hotel of the list (P21b, K-54). Its credentials live at the top level while it is in use, in `parked` else. */
const hotelSchema = z.object({
  code: hotelCodeSchema,
  /** Empty: the name the main computer announces is shown. */
  name: z.string().max(80),
  url: z.string().regex(/^http:\/\/[^\s/]+$/),
  lastUsedAt: z.string().nullable()
})
export type SavedHotelEntry = z.output<typeof hotelSchema>

const configSchema = z.object({
  mode: z.enum(['local', 'client']),
  hostUrl: z
    .string()
    .nullable()
    .transform((v) => (v ? normalizeHostUrl(v) : null)),
  /** The main computer's signed device cookie (`<id>.<mac>`): this computer is one device in its list. */
  device: deviceSchema,
  /** The device cookie sealed with the system's key store (`device` is then null in the file). */
  deviceSealed: z.string().max(4000).nullable().optional(),
  /**
   * The main computer's public key met first (K-45 (1), trust on first use): another one at the hotel's address
   * stops the link until the person accepts it.
   */
  hostKey: hostKeySchema,
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
  replica: replicaSchema.optional(),
  /** P21b: the hotels this computer knows, and which one is in use (`hostUrl`, `device`... are its). */
  hotels: z.array(hotelSchema).max(50).optional(),
  activeHotel: hotelCodeSchema.nullable().optional(),
  /** The credentials of the hotels not in use: the device cookie, the identity kept, the copy's grant. */
  parked: z
    .record(
      hotelCodeSchema,
      z.object({
        device: deviceSchema,
        deviceSealed: z.string().max(4000).nullable().optional(),
        hostKey: hostKeySchema,
        replica: replicaSchema.optional()
      })
    )
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

const slug = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)

/** A reserved name (`con`, `attachments`...) gets a suffix. */
const safeCode = (code: string): string => (isReservedHotelCode(code) ? `${code}-otel` : code)

/** The host name of a saved address ("bismuth-b.netbird.cloud"). */
export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

type ReplicaConfig = z.output<typeof replicaSchema>

/**
 * A small store over the file (the client app keeps the address and the device cookie in it). With a sealer the
 * copy grant goes into the file only sealed (D5): another program reading the file learns nothing it can use.
 */
export function createConfigStore(file: string, sealer?: Sealer) {
  const unsealReplica = (replica: ReplicaConfig): ReplicaConfig => {
    const sealed = replica.tokenSealed
    if (!sealer || !sealed) return replica
    const token = sealer.open(sealed)
    return { ...replica, token: token && /^[\w-]{20,200}$/.test(token) ? token : null }
  }
  const sealReplica = (replica: ReplicaConfig): ReplicaConfig => {
    if (!sealer) return replica
    const { token } = replica
    return { ...replica, token: null, tokenSealed: token ? sealer.seal(token) : null }
  }
  const DEVICE_OK = /^[\w.-]{1,200}$/
  const sealDevice = <T extends { device?: string | null; deviceSealed?: string | null }>(holder: T): T => {
    if (!sealer) return holder
    const { device } = holder
    return {
      ...holder,
      device: null,
      deviceSealed: device ? sealer.seal(device) : null
    }
  }
  const unsealDevice = <T extends { device?: string | null; deviceSealed?: string | null }>(holder: T): T => {
    if (!sealer || !holder.deviceSealed) return holder
    const opened = sealer.open(holder.deviceSealed)
    return { ...holder, device: opened && DEVICE_OK.test(opened) ? opened : null }
  }
  const through = (
    config: ConnectionConfig,
    fn: (r: ReplicaConfig) => ReplicaConfig,
    device: <T extends { device?: string | null; deviceSealed?: string | null }>(h: T) => T
  ): ConnectionConfig => {
    const parked = config.parked
      ? Object.fromEntries(
          Object.entries(config.parked).map(([code, p]) => [
            code,
            device(p.replica ? { ...p, replica: fn(p.replica) } : p)
          ])
        )
      : undefined
    return device({
      ...config,
      ...(config.replica ? { replica: fn(config.replica) } : {}),
      ...(parked ? { parked } : {})
    })
  }
  const unseal = (config: ConnectionConfig): ConnectionConfig => through(config, unsealReplica, unsealDevice)
  const forFile = (config: ConnectionConfig): ConnectionConfig =>
    sealer ? through(config, sealReplica, sealDevice) : config
  let current = unseal(readConnectionConfig(file))
  /** A computer from before the list: the hotel it used becomes the first entry (its copy moves under its code). */
  let migrated: string | null = null
  if (current.mode === 'client' && current.hostUrl && !current.hotels) {
    const code = safeCode(slug(hostOf(current.hostUrl)) || 'otel')
    migrated = code
    current = {
      ...current,
      hotels: [{ code, name: '', url: current.hostUrl, lastUsedAt: null }],
      activeHotel: code
    }
    writeConnectionConfig(file, forFile(current))
  } else if (
    sealer &&
    ((current.replica?.token && !current.replica.tokenSealed) || (current.device && !current.deviceSealed))
  )
    // A grant or device cookie written before sealing: sealed now.
    writeConnectionConfig(file, forFile(current))
  const save = (): void => writeConnectionConfig(file, forFile(current))
  const hotels = (): SavedHotelEntry[] => current.hotels ?? []

  /** The hotel in use is put aside with its credentials; `code` (or none) takes the top level. */
  function activate(code: string | null, now: Date = new Date()): void {
    // No prototype: a hotel code is never confused with an object's own keys.
    const parked: NonNullable<ConnectionConfig['parked']> = Object.assign(Object.create(null), current.parked)
    if (current.activeHotel)
      parked[current.activeHotel] = {
        device: current.device ?? null,
        hostKey: current.hostKey ?? null,
        ...(current.replica ? { replica: current.replica } : {})
      }
    const target = code ? hotels().find((h) => h.code === code) : undefined
    if (code && !target) throw new Error(`unknown hotel ${code}`)
    const saved = code ? parked[code] : undefined
    if (code) delete parked[code]
    const { replica: _left, ...rest } = current
    void _left
    current = {
      ...rest,
      hostUrl: target?.url ?? null,
      device: saved?.device ?? null,
      hostKey: saved?.hostKey ?? null,
      ...(saved?.replica ? { replica: saved.replica } : {}),
      activeHotel: code,
      parked,
      hotels: hotels().map((h) => (h.code === code ? { ...h, lastUsedAt: now.toISOString() } : h))
    }
    save()
  }

  return {
    get: (): ConnectionConfig => current,
    update(patch: Partial<ConnectionConfig>): ConnectionConfig {
      current = { ...current, ...patch }
      save()
      return current
    },
    /** Set once when the list was made from a single saved address at start (its copy folder must move). */
    takeMigration(): string | null {
      const code = migrated
      migrated = null
      return code
    },
    hotels,
    findByUrl: (url: string): SavedHotelEntry | undefined => hotels().find((h) => h.url === url),
    /** The identity kept for a hotel (in use or not). */
    hotelKey: (code: string): string | null =>
      (current.activeHotel === code ? current.hostKey : current.parked?.[code]?.hostKey) ?? null,
    findByKey: (key: string): SavedHotelEntry | undefined =>
      hotels().find(
        (h) => (current.activeHotel === h.code ? current.hostKey : current.parked?.[h.code]?.hostKey) === key
      ),
    /** Adds a hotel (not in use yet); returns its code, unique and safe as a folder name. */
    addHotel(name: string, url: string): string {
      const base = safeCode(slug(name) || slug(hostOf(url)) || 'otel')
      const taken = new Set(hotels().map((h) => h.code))
      let code = base
      for (let n = 2; taken.has(code); n++) code = `${base}-${n}`.slice(-40)
      current = {
        ...current,
        hotels: [...hotels(), { code, name: name.slice(0, 80), url, lastUsedAt: null }]
      }
      save()
      return code
    },
    updateHotel(code: string, patch: { name?: string; url?: string }): void {
      current = {
        ...current,
        hotels: hotels().map((h) => (h.code === code ? { ...h, ...patch } : h)),
        ...(patch.url && current.activeHotel === code ? { hostUrl: patch.url } : {})
      }
      save()
    },
    activate,
    /** Takes the hotel off the list with everything kept for it (the one in use is left first). */
    removeHotel(code: string): void {
      if (current.activeHotel === code) activate(null)
      const parked = Object.assign(Object.create(null), current.parked) as NonNullable<
        ConnectionConfig['parked']
      >
      delete parked[code]
      current = { ...current, hotels: hotels().filter((h) => h.code !== code), parked }
      save()
    }
  }
}
export type ConfigStore = ReturnType<typeof createConfigStore>
