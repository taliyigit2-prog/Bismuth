// Request context: every service call receives `ctx` (CLAUDE.md yasak 7, G-23). IPC and HTTP build the
// same shape; services decide what is allowed — hiding a button in the UI is never the protection.
import { levelAllows, type PermissionKey, type PermissionLevel } from '@shared/permissions'

export type { PermissionLevel } from '@shared/permissions'
export type Transport = 'ipc' | 'http'

/**
 * What kind of caller this is. The router lets each kind reach only the procedures open to it (contract `access`);
 * services still check permissions. Missing = `user` (contexts built from a role's permissions).
 *  - `user`: a signed-in, unlocked user;   - `locked`: signed in, the window is locked (unlock / sign-out only);
 *  - `anonymous`: nobody signed in;        - `setup`: the hotel is not set up yet (the wizard);
 *  - `system`: the program itself (scheduler, start-up, tests).
 */
export type CtxKind = 'user' | 'locked' | 'anonymous' | 'setup' | 'system'

export interface Ctx {
  /** Signed-in user; null for the program itself, the setup wizard and a window nobody has signed in to. */
  readonly userId: string | null
  readonly kind?: CtxKind
  readonly deviceId: string
  readonly transport: Transport
  /**
   * Nothing may be changed through this context (Faz 13): `replica` — the owner's read-only copy while the main
   * computer is away; `replaced` — this computer was replaced by another main computer. Every edit right is off and
   * a check for one says why (not "no permission").
   */
  readonly readOnly?: 'replica' | 'replaced'
  /** True when the user may use `permission` at `level` (edit implies view). */
  can(permission: PermissionKey, level: Exclude<PermissionLevel, 'none'>): boolean
}

/**
 * A caller on a main computer that may be replaced while the program runs (Faz 13 takeover): checked on every use,
 * so the moment another computer's newer term is seen, no screen, phone or other computer can change anything here.
 */
export function guardedCtx(base: Ctx, replaced: () => boolean): Ctx {
  return {
    userId: base.userId,
    ...(base.kind ? { kind: base.kind } : {}),
    deviceId: base.deviceId,
    transport: base.transport,
    get readOnly() {
      return replaced() ? ('replaced' as const) : undefined
    },
    can: (permission, level) => (level === 'edit' && replaced() ? false : base.can(permission, level))
  }
}

/** The same caller with every edit right off (read-only copy, replaced main computer); views stay as they were. */
export function readOnlyCtx(base: Ctx, why: 'replica' | 'replaced'): Ctx {
  return {
    userId: base.userId,
    ...(base.kind ? { kind: base.kind } : {}),
    deviceId: base.deviceId,
    transport: base.transport,
    readOnly: why,
    can: (permission, level) => level !== 'edit' && base.can(permission, level)
  }
}

/**
 * The program acting with every right on this computer: start-up reads (initial settings) and tests. Windows use
 * the signed-in person's ctx (session/desktop-sessions.ts). Never use this for HTTP requests.
 */
export function localOwnerCtx(deviceId = 'local'): Ctx {
  return { userId: null, kind: 'system', deviceId, transport: 'ipc', can: () => true }
}

export const ctxKind = (ctx: Ctx): CtxKind => ctx.kind ?? 'user'

/** Nobody is signed in to this window: only public procedures answer; every permission check fails. */
export function anonymousCtx(deviceId: string, transport: Transport): Ctx {
  return { userId: null, kind: 'anonymous', deviceId, transport, can: () => false }
}

/**
 * The hotel is not set up yet (no user exists): the wizard writes the first settings, rooms and the owner account.
 * The router allows only `setup` and `public` procedures with it, and only while setup is open.
 */
export function setupCtx(deviceId: string, transport: Transport, open: () => boolean = () => true): Ctx {
  // Checked on every use, not when the ctx was made: the moment setup closes (or the computer is set to use
  // another one), the wizard's rights are gone.
  return { userId: null, kind: 'setup', deviceId, transport, can: () => open() }
}

/** A signed-in user whose window is locked: no permission until unlocked. */
export function lockedCtx(userId: string, deviceId: string, transport: Transport): Ctx {
  return { userId, kind: 'locked', deviceId, transport, can: () => false }
}

/**
 * The program itself (scheduler: task materialisation, overdue notices, retention clean-up; restore notes at
 * start). Audit rows show device "system" and no user.
 */
export function systemCtx(): Ctx {
  return { userId: null, kind: 'system', deviceId: 'system', transport: 'ipc', can: () => true }
}

/** Context built from a role's permission rows (sessions in Faz 4, tests now). Missing keys mean none. */
export function ctxFromPermissions(
  userId: string,
  deviceId: string,
  transport: Transport,
  permissions: Readonly<Partial<Record<PermissionKey, PermissionLevel>>>
): Ctx {
  return {
    userId,
    deviceId,
    transport,
    can: (permission, level) => levelAllows(permissions[permission] ?? 'none', level)
  }
}
