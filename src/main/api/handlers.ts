import type { Services } from '../services'
import { ctxKind } from '../services/context'
import { AppError } from '../services/errors'
import type { Handlers, HandlerEnv } from './app'
import type { SessionBinding } from './session'
import { moduleHandlers } from './handlers/index'

const ok = { ok: true } as const
const unauthenticated = (): AppError => new AppError('UNAUTHENTICATED', 'errors.unauthenticated')
/** Wrong unlock tries before the locked window is signed out (the account itself is not locked by them). */
const UNLOCK_TRIES = 5

/** Maps every contract procedure to a service call. Adding a procedure without a handler fails typecheck. */
export function createHandlers(services: Services): Handlers {
  /**
   * Who is signed in, for the shell (account, role, full matrix) and whether the window is locked. A locked
   * window shows only the lock screen: it learns no permissions until unlocked.
   */
  const me = (userId: string | null, locked = false) => {
    const described = userId ? services.users.describe(userId) : null
    if (!described) throw unauthenticated()
    if (!locked) return { ...described, locked }
    const none = Object.fromEntries(Object.keys(described.permissions).map((k) => [k, 'none' as const]))
    return { ...described, permissions: none as typeof described.permissions, locked }
  }
  const sessionOf = (env: HandlerEnv): SessionBinding => {
    if (!env.session) throw unauthenticated()
    return env.session
  }
  /** Signed in from outside the hotel's own computers: decided by how the request came, not by the caller. */
  const remote = (env: HandlerEnv): boolean => env.transport !== 'ipc'

  return {
    'app.getInfo': (ctx) => services.appInfo.get(ctx),
    'auth.ping': (ctx) => ({
      ok: true,
      userId: ctx.userId,
      transport: ctx.transport,
      at: new Date().toISOString()
    }),
    'settings.get': (ctx) => services.settings.get(ctx),
    'settings.set': (ctx, input) => services.settings.set(ctx, input),

    // ---- sign-in, lock, sessions ----
    'auth.state': (ctx) => {
      const state = services.setup.state(ctx)
      const kind = ctxKind(ctx)
      const signedIn = (kind === 'user' || kind === 'locked') && ctx.userId !== null
      return {
        setup: state.done ? ('done' as const) : ('needed' as const),
        mode: state.mode,
        session: signedIn ? me(ctx.userId, kind === 'locked') : null
      }
    },
    'auth.signInUsers': (ctx) => (services.setup.isDone() ? services.users.signInList(ctx.transport) : []),
    'auth.signIn': (_ctx, input, env) => {
      const session = sessionOf(env)
      const result = services.auth.login({ ...input, device: session.device() }, { remote: remote(env) })
      session.signedIn(result)
      return me(result.userId)
    },
    'auth.signInWithPin': (_ctx, input, env) => {
      const session = sessionOf(env)
      const result = services.auth.loginWithPin(
        { ...input, device: session.device() },
        { remote: remote(env) }
      )
      session.signedIn(result)
      return me(result.userId)
    },
    'auth.recover': (_ctx, input, env) => {
      services.auth.recoverWithCode(input, { remote: remote(env) })
      return ok
    },
    'auth.signOut': (_ctx, _input, env) => {
      sessionOf(env).signedOut()
      return ok
    },
    'auth.lock': (_ctx, _input, env) => {
      sessionOf(env).lock()
      return ok
    },
    'auth.unlock': (ctx, input, env) => {
      const session = sessionOf(env)
      if (!ctx.userId) throw unauthenticated()
      try {
        services.auth.unlock(ctx.userId, input.secret, session.device())
      } catch (error) {
        // Someone guessing at a locked desk: after a few tries the window is signed out (password sign-in).
        if (session.unlockFailed() >= UNLOCK_TRIES) {
          session.signedOut()
          throw unauthenticated()
        }
        throw error
      }
      session.unlock()
      return me(ctx.userId)
    },
    'auth.me': (ctx) => me(ctx.userId),
    'auth.changePassword': (ctx, input) => {
      services.auth.changePassword(ctx, input)
      return ok
    },
    'auth.setPin': (ctx, input) => {
      services.auth.setPin(ctx, input)
      return ok
    },
    'auth.newRecoveryCodes': (ctx, input) => {
      if (!ctx.userId) throw unauthenticated()
      return { codes: services.auth.generateRecoveryCodes(ctx, ctx.userId, input.currentPassword) }
    },
    'auth.devices': (ctx) => services.auth.listDevices(ctx),
    'auth.revokeDevice': (ctx, input) => {
      services.auth.revokeDevice(ctx, input.id)
      return ok
    },
    'auth.revokeSession': (ctx, input) => {
      services.auth.revokeSession(ctx, input.id)
      return ok
    },

    // ---- setup wizard ----
    'setup.state': (ctx) => services.setup.state(ctx),
    'setup.options': (ctx) => services.setup.options(ctx),
    'setup.saveProgress': (ctx, input) => {
      services.setup.saveProgress(ctx, input)
      return ok
    },
    'setup.setMode': (ctx, input) => {
      services.setup.setMode(ctx, input.mode)
      return ok
    },
    'setup.finish': (ctx, input, env) => {
      const session = sessionOf(env)
      const { recoveryCodes } = services.setup.finish(ctx, input)
      // The owner who just set the hotel up is signed in on this window.
      const signedIn = services.auth.login({
        username: input.owner.username,
        secret: input.owner.password,
        device: session.device()
      })
      session.signedIn(signedIn)
      return { recoveryCodes, me: me(signedIn.userId) }
    },

    // ---- users and roles ----
    'users.list': (ctx, input) => services.users.listUsers(ctx, input),
    'users.create': (ctx, input) => services.users.createUser(ctx, input),
    'users.update': (ctx, input) => services.users.updateUser(ctx, input.id, input.patch),
    'users.setActive': (ctx, input) => services.users.setActive(ctx, input.id, input.active),
    'users.resetPassword': (ctx, input) => services.users.resetPassword(ctx, input.id, input.password),
    'roles.list': (ctx) => services.users.listRoles(ctx),
    'roles.create': (ctx, input) => services.users.createRole(ctx, input),
    'roles.update': (ctx, input) => services.users.updateRole(ctx, input.id, input.patch),
    'roles.delete': (ctx, input) => {
      services.users.deleteRole(ctx, input.id)
      return ok
    },

    // ---- rooms, room types, lists ----
    'rooms.listTypes': (ctx, input) => services.rooms.listRoomTypes(ctx, input),
    'rooms.createType': (ctx, input) => services.rooms.createRoomType(ctx, input),
    'rooms.updateType': (ctx, input) => services.rooms.updateRoomType(ctx, input.id, input.patch),
    'rooms.list': (ctx, input) => services.rooms.listRooms(ctx, input),
    'rooms.create': (ctx, input) => services.rooms.createRoom(ctx, input),
    'rooms.createMany': (ctx, input) => services.rooms.createMany(ctx, input.rooms),
    'rooms.update': (ctx, input) => services.rooms.updateRoom(ctx, input.id, input.patch),
    'lists.list': (ctx, input) => services.lists.list(ctx, input.kind, input),
    'lists.create': (ctx, input) => services.lists.create(ctx, input),
    'lists.update': (ctx, input) => services.lists.update(ctx, input),

    // ---- shifts, task suggestions, pay rules, employees, calendar ----
    'shifts.list': (ctx, input) => services.shifts.listShifts(ctx, input),
    'shifts.create': (ctx, input) => services.shifts.createShift(ctx, input),
    'shifts.update': (ctx, input) => services.shifts.updateShift(ctx, input.id, input.patch),
    'tasks.listTemplates': (ctx, input) => services.tasks.listTemplates(ctx, input),
    'tasks.createTemplate': (ctx, input) => services.tasks.createTemplate(ctx, input),
    'tasks.activateTemplate': (ctx, input) => services.tasks.activateTemplate(ctx, input.id),
    'tasks.deactivateTemplate': (ctx, input) => services.tasks.deactivateTemplate(ctx, input.id),
    'staff.getPolicy': (ctx, input) => services.staff.getPolicy(ctx, input.employeeId ?? null),
    'staff.setPolicy': (ctx, input) => services.staff.setPolicy(ctx, input),
    'staff.listEmployees': (ctx, input) => services.staff.listEmployees(ctx, input),
    'calendar.days': (ctx, input) => services.calendar.listRange(ctx, input.from, input.to),

    'audit.list': (ctx, input) => services.audit.list(ctx, input),

    'statusTags.list': (ctx) => services.statusTags.list(ctx),
    'statusTags.update': (ctx, input) => services.statusTags.update(ctx, input.id, input.patch),
    'statusTags.createCustom': (ctx, input) => services.statusTags.createCustom(ctx, input),
    'statusTags.removeCustom': (ctx, input) => services.statusTags.removeCustom(ctx, input.id),

    // ---- module procedures (one file each, handlers/<module>.ts) ----
    ...moduleHandlers(services)
  }
}
