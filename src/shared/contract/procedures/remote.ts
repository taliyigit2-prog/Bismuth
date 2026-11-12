// Faz 13: server mode, client mode, devices (P13b adds the replica, the encrypted relay and takeover).
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/remote.ts. In client mode the main
// process answers the client procedures itself (src/main/server/client-app.ts) and sends the rest to the host.
import * as z from 'zod'
import { empty, proc, type Procedure } from '../proc'
import {
  acceptHostIdentitySchema,
  clientStatusSchema,
  conflictReportSchema,
  connectInputSchema,
  epochStateSchema,
  foundHostSchema,
  helloInputSchema,
  helloSchema,
  hostModeSchema,
  hostStatusSchema,
  relayHostStatusSchema,
  replicaFolderInputSchema,
  replicaGrantSchema,
  replicaKeyInputSchema,
  replicaStatusSchema,
  takeOverInputSchema
} from '../remote'

const ok = z.object({ ok: z.literal(true) })
const anyone = ['public', 'setup', 'user', 'locked'] as const

export const remoteProcedures = {
  /**
   * Who answers at this address: Bismuth, its version and data version, the hotel's name (version gate), and its
   * identity signed over the asker's nonce (K-45 (1)).
   */
  'remote.hello': proc(helloInputSchema, helloSchema, anyone),
  /** Ayarlar → Uzaktan erişim: mode, port, addresses, start with the computer (`remote.settings`). */
  'remote.hostStatus': proc(empty, hostStatusSchema),
  /** Alone ↔ main computer; the hotel's own computer only (a phone cannot switch the server off under itself). */
  'remote.setMode': proc(z.object({ mode: hostModeSchema }).strict(), hostStatusSchema),
  /** Bismuth opens when the computer starts (G-146 "Hep açık"); the hotel's own computer only. */
  'remote.setOpenAtLogin': proc(z.object({ enabled: z.boolean() }).strict(), hostStatusSchema),
  /**
   * Serve the hotel's local network (Wi-Fi, cable) too, not only this computer and the private network (K-45 (1));
   * the hotel's own computer only.
   */
  'remote.setListenLan': proc(z.object({ enabled: z.boolean() }).strict(), hostStatusSchema),
  /** This computer will use the hotel's main computer from now on (the program starts again in client mode). */
  'remote.becomeClient': proc(empty, ok),

  // Client mode (answered by this computer itself; elsewhere they say "not client mode").
  'remote.clientStatus': proc(empty, clientStatusSchema, anyone),
  /** Bismuth main computers announcing themselves on the local network (bonjour, a few seconds). */
  'remote.discover': proc(empty, z.array(foundHostSchema), anyone),
  /** Checks the address answers as a compatible Bismuth, then keeps it. */
  'remote.connect': proc(connectInputSchema, clientStatusSchema, anyone),
  /** Another computer than the one met before answers at the hotel's address: the person accepts it. */
  'remote.acceptHostIdentity': proc(acceptHostIdentitySchema, clientStatusSchema, anyone),
  /** Forgets the main computer's address (the connection screen asks again). */
  'remote.forgetHost': proc(empty, clientStatusSchema, anyone),
  /** Back to keeping the data on this computer (the program starts again). */
  'remote.leaveClient': proc(empty, ok, anyone),
  /** Different versions: open the main computer's own screens in the web browser instead. */
  'remote.openInBrowser': proc(empty, ok, anyone),

  // P13b — on the computer that keeps the data (alone or the main computer).
  /** The encrypted box, the PDF summary, this computer's term, whether another one took over (`remote.settings`). */
  'remote.relayStatus': proc(empty, relayHostStatusSchema),
  /** "Şimdi yaz": a snapshot into the box and the PDF summary now (`remote.settings` edit). */
  'remote.relayRun': proc(empty, relayHostStatusSchema),
  /** Any signed-in screen: was this computer replaced by another main computer (the strip on top)? */
  'remote.epochState': proc(empty, epochStateSchema),
  /** What was written here after the new main computer's last known change (`remote.settings`). */
  'remote.conflicts': proc(empty, conflictReportSchema),
  /** The same list with the full rows into a file the owner chooses (this computer's own window). */
  'remote.saveConflicts': proc(empty, z.object({ path: z.string().nullable() })),
  /** A client computer asks once to keep a read-only copy (over the network, `remote.settings`). */
  'remote.replicaGrant': proc(empty, replicaGrantSchema),

  // P13b — client mode (answered by this computer itself; elsewhere they say "not client mode").
  'remote.replicaStatus': proc(empty, replicaStatusSchema, anyone),
  /** Brings the copy up to date now (live, else from the Drive box). */
  'remote.replicaSync': proc(empty, replicaStatusSchema, anyone),
  /** The Bismuth key from the owner's paper, once (`replace` after the person agreed to change this computer's). */
  'remote.replicaSetKey': proc(replicaKeyInputSchema, replicaStatusSchema, anyone),
  /** The Drive box folder chosen by hand (null: found by itself). */
  'remote.replicaSetFolder': proc(replicaFolderInputSchema, replicaStatusSchema, anyone),
  /** Choose the folder in the system's folder dialog. */
  'remote.replicaPickFolder': proc(empty, replicaStatusSchema, anyone),
  /** "Bu bilgisayarı ana bilgisayar yap": the copy becomes the hotel's data here, next term (program restarts). */
  'remote.takeOver': proc(takeOverInputSchema, ok, anyone)
} as const satisfies Record<string, Procedure>
