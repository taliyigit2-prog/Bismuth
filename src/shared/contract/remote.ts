// Server mode, client mode and the devices that reach the hotel's computer (Faz 13; G-140…G-146, K-19, K-31).
// Shapes only; who may do what is decided in the main process (src/main/server, G-23).
import * as z from 'zod'

/** The port other devices open when none is typed (Faz 13: 7373). */
export const DEFAULT_HOST_PORT = 7373

/** Hours a remote session may last: Ayarlar → Uzaktan erişim → "Oturum süresi". */
export const SESSION_HOUR_CHOICES = [1, 12, 24, 168, 720] as const

export const hostAddressSchema = z.object({
  url: z.string(),
  address: z.string(),
  /** lan = hotel Wi-Fi/cable; netbird / tailscale by interface name; private = another 100.64.0.0/10 address. */
  kind: z.enum(['lan', 'netbird', 'tailscale', 'private']),
  iface: z.string()
})
export type HostAddressView = z.infer<typeof hostAddressSchema>

/**
 * Who the main computer is (K-45 (1)): its public key and, when the asker sent a nonce, a signature over it. A client
 * computer keeps the key it met first and stops when another one answers (src/main/server/host-identity.ts).
 */
export const hostIdentitySchema = z.object({
  key: z.string().regex(/^[\w-]{43}$/),
  proof: z.string().max(200).nullable()
})

/** What a Bismuth server says about itself to anyone who asks (no hotel data beyond its name). */
export const helloSchema = z.object({
  app: z.literal('bismuth'),
  version: z.string(),
  schemaVersion: z.number().int().nonnegative(),
  hotelName: z.string(),
  /** Null only where no server runs (tests, the phone harness): a client computer then refuses to connect. */
  identity: hostIdentitySchema.nullable().optional()
})
export type Hello = z.infer<typeof helloSchema>

/** A random nonce the main computer signs (a copied answer cannot be replayed). */
export const helloInputSchema = z
  .object({
    nonce: z
      .string()
      .regex(/^[\w-]{16,64}$/)
      .optional()
  })
  .strict()

export const HOST_MODES = ['standalone', 'host'] as const
export const hostModeSchema = z.enum(HOST_MODES)

export const hostStatusSchema = z.object({
  /** This computer's way of working: alone, the hotel's main computer, or using another one. */
  mode: z.enum(['standalone', 'host', 'client']),
  running: z.boolean(),
  port: z.number().int(),
  addresses: z.array(hostAddressSchema),
  /** Why the server is not running although it should: the port is taken, or another failure. */
  error: z.enum(['portInUse', 'failed']).nullable(),
  /** Bismuth starts when the computer starts (null: this system cannot tell). */
  openAtLogin: z.boolean().nullable(),
  /** Other devices found this server on the local network (bonjour). */
  announced: z.boolean(),
  /** The hotel's local network (Wi-Fi, cable) is served too (`host.listenLan`, K-45 (1)); off by default. */
  listenLan: z.boolean(),
  /**
   * 100.64.0.0/10 addresses on cards that are not NetBird or Tailscale: not served (an internet provider may give the
   * same range to its customers).
   */
  unservedPrivate: z.array(z.object({ address: z.string(), iface: z.string() })),
  /** This computer's identity as a client computer shows it ("AB12-CD34-EF56-7890"); null when no server can run. */
  identity: z.string().nullable()
})
export type HostStatus = z.infer<typeof hostStatusSchema>

/** Client mode: the state of the link to the hotel's main computer. */
export const LINK_STATES = ['none', 'connected', 'unreachable', 'incompatible', 'identityChanged'] as const
export type LinkState = (typeof LINK_STATES)[number]

export const clientStatusSchema = z.object({
  /** `local` = this computer keeps the data itself (alone or as the main computer). */
  mode: z.enum(['client', 'local']),
  hostUrl: z.string().nullable(),
  state: z.enum(LINK_STATES),
  host: helloSchema.nullable(),
  mine: z.object({ version: z.string(), schemaVersion: z.number().int().nonnegative() }),
  /** Last answer from the main computer (ISO time). */
  lastContactAt: z.string().nullable(),
  /**
   * The main computer's identity this computer keeps, and the other one that answered instead (state
   * `identityChanged`: not connected until the person accepts it). Both as fingerprints.
   */
  identity: z.object({ known: z.string().nullable(), offered: z.string().nullable() })
})
export type ClientStatus = z.infer<typeof clientStatusSchema>

export const foundHostSchema = z.object({
  name: z.string(),
  url: z.string(),
  hotelName: z.string().nullable(),
  version: z.string().nullable()
})
export type FoundHost = z.infer<typeof foundHostSchema>

/** A main computer's fingerprint as the screen shows it ("AB12-CD34-EF56-7890"). */
export const fingerprintSchema = z.string().regex(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/)

export const connectInputSchema = z
  .object({
    url: z.string().trim().min(1).max(300),
    /**
     * The person saw that another computer answers than the one met before and accepts it: the fingerprint the
     * screen showed. Kept only when the key answering now has that fingerprint (N-7: not one that changed since).
     */
    acceptIdentity: fingerprintSchema.optional()
  })
  .strict()

/** Accepting the other main computer: the fingerprint the screen showed (N-7). */
export const acceptHostIdentitySchema = z.object({ fingerprint: fingerprintSchema }).strict()

/**
 * "192.168.1.20", "bismuth-host.netbird.cloud:7373", "http://100.64.0.2:7373/" → `http://host:port` (no path).
 * Null when it is not an address. Only http: the private network already encrypts (K-31).
 */
export function normalizeHostUrl(input: string, defaultPort: number = DEFAULT_HOST_PORT): string | null {
  const text = input.trim()
  if (!text || /\s/.test(text)) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' || !url.hostname || url.username || url.password) return null
  // A name longer than DNS allows (253 characters, 63 per label) is not an address: say so up front.
  if (url.hostname.length > 253 || url.hostname.split('.').some((label) => label.length > 63)) return null
  const port = url.port || String(defaultPort)
  return `http://${url.hostname}:${port}`
}

// ---- P13b: the change log, the owner's read-only copy, the encrypted box, takeover, the PDF summary ----

/** Why the box is not being written on the hotel's computer. */
export const RELAY_PROBLEMS = ['off', 'noFolder', 'noKey', 'replaced', 'writeFailed'] as const
export const SUMMARY_PROBLEMS = ['off', 'noFolder', 'replaced', 'writeFailed'] as const

export const relayHostStatusSchema = z.object({
  /** Term of this main computer (`host.epoch`). */
  epoch: z.number().int().min(1),
  box: z.object({
    folder: z.string().nullable(),
    problem: z.enum(RELAY_PROBLEMS).nullable(),
    lastSegmentAt: z.string().nullable(),
    lastSnapshotAt: z.string().nullable(),
    /** Changes not in the box yet. */
    pending: z.number().int().nonnegative()
  }),
  summary: z.object({
    folder: z.string().nullable(),
    problem: z.enum(SUMMARY_PROBLEMS).nullable(),
    lastAt: z.string().nullable()
  }),
  /** The Bismuth key is kept on this computer (the box needs it). */
  keyExists: z.boolean(),
  /** Another computer took over as the main computer: this one writes nothing more. */
  replaced: z
    .object({
      epoch: z.number().int(),
      by: z.string(),
      at: z.string(),
      seenAt: z.string(),
      /** Changes written here after the new main computer's last known one. */
      conflicts: z.number().int().nonnegative()
    })
    .nullable()
})
export type RelayHostStatus = z.infer<typeof relayHostStatusSchema>

/** What any signed-in screen needs for the "this computer was replaced" strip. */
export const epochStateSchema = z.object({
  epoch: z.number().int().min(1),
  replaced: z.object({ epoch: z.number().int(), by: z.string(), at: z.string() }).nullable()
})
export type EpochState = z.infer<typeof epochStateSchema>

const keyValue = z.union([z.string(), z.number(), z.null()])

export const conflictItemSchema = z.object({
  seq: z.number().int(),
  /** Table name (shown translated where the screen has a word for it). */
  tbl: z.string(),
  pk: z.array(keyValue),
  op: z.enum(['I', 'U', 'D']),
  ts: z.string()
})
export type ConflictItemView = z.infer<typeof conflictItemSchema>

export const conflictReportSchema = z.object({
  replaced: epochStateSchema.shape.replaced,
  items: z.array(conflictItemSchema)
})
export type ConflictReport = z.infer<typeof conflictReportSchema>

/** A client computer's grant to pull the change log (the token goes to the main process only). */
export const replicaGrantSchema = z.object({ token: z.string(), userId: z.string() })

/**
 * The owner's read-only copy on a client computer:
 *  off = no copy (nobody allowed signed in here yet); waiting = nothing arrived yet; live = up to date over the
 *  network; relay = up to date from the Drive box; behind = neither source answers, the copy shows its last state;
 *  needsUpdate = the main computer runs a newer Bismuth; hostOlder = the main computer should be updated.
 */
export const REPLICA_STATES = [
  'off',
  'waiting',
  'live',
  'relay',
  'behind',
  'needsUpdate',
  'hostOlder'
] as const
export type ReplicaStateName = (typeof REPLICA_STATES)[number]

export const BOX_PROBLEMS = ['noFolder', 'noKey', 'wrongKey', 'damaged', 'empty'] as const

export const replicaStatusSchema = z.object({
  state: z.enum(REPLICA_STATES),
  /** The main computer's data is in the copy up to this moment ("Yedek kopya · 14:32"). */
  asOf: z.string().nullable(),
  source: z.enum(['live', 'relay']).nullable(),
  /** The screens are reading from the copy right now (the main computer cannot be reached). */
  serving: z.boolean(),
  /** Whose view of the data the copy shows (the person who started it). */
  userName: z.string().nullable(),
  key: z.object({ exists: z.boolean(), available: z.boolean() }),
  box: z.object({
    folder: z.string().nullable(),
    chosen: z.string().nullable(),
    problem: z.enum(BOX_PROBLEMS).nullable(),
    lastReadAt: z.string().nullable()
  }),
  /** "Bu bilgisayarı ana bilgisayar yap" is possible now, or why not. */
  takeover: z.object({
    possible: z.boolean(),
    reason: z.enum(['noCopy', 'noKey', 'noFolder', 'hostReachable']).nullable()
  })
})
export type ReplicaStatus = z.infer<typeof replicaStatusSchema>

export const replicaKeyInputSchema = z
  .object({ text: z.string().trim().min(20).max(200), replace: z.boolean().optional() })
  .strict()
export const replicaFolderInputSchema = z.object({ folder: z.string().trim().max(500).nullable() }).strict()
export const takeOverInputSchema = z
  .object({
    /** The new password of the person taking over (no password hash ever leaves the main computer). */
    password: z.string().min(8).max(200),
    /** The Bismuth key from the owner's paper, typed again: only the hotel's owner can make this computer the main one. */
    keyText: z.string().trim().min(20).max(200),
    /** The main computer still answers: take over anyway (what it writes later becomes a conflict there). */
    force: z.boolean().optional()
  })
  .strict()
