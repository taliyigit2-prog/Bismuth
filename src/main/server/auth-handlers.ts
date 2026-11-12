// Sign-in procedures as the server mode answers them (faz-13 "Faz 4'ten notlar"): the same steps as the desktop's
// (api/handlers.ts), but password and PIN hashes are computed off the main thread (the hotel's own window never
// freezes under a burst of remote tries), the role's network rule is applied (local network only / anywhere), the
// session lasts `host.sessionHours`, and the sign-in list tells a stranger nothing (no names over the network).
// K-45 (2): over the network only username + password: the PIN (4–8 digits, a quick switch at the hotel's own desk)
// neither signs in nor unlocks, and wrong passwords (sign-in, unlock and the current password asked again) count
// on the remote counter only.
// The request rate and the try counters run before these (server/index.ts), so a refused try costs no hashing.
import type { Services } from '../services'
import { AppError } from '../services/errors'
import type { Handlers, HandlerEnv } from '../api/app'
import { isHttpBinding, type HttpSessionBinding } from './http-sessions'

/** Wrong unlock tries before the locked session is signed out (as on the desktop). */
const UNLOCK_TRIES = 5
const ok = { ok: true } as const
const unauthenticated = (): AppError => new AppError('UNAUTHENTICATED', 'errors.unauthenticated')

type HttpAuthProcedures =
  | 'auth.signInUsers'
  | 'auth.signIn'
  | 'auth.signInWithPin'
  | 'auth.recover'
  | 'auth.unlock'
  | 'auth.changePassword'
  | 'auth.setPin'
  | 'auth.newRecoveryCodes'

export function httpAuthHandlers(services: Services): Pick<Handlers, HttpAuthProcedures> {
  const me = (userId: string) => {
    const described = services.users.describe(userId)
    if (!described) throw unauthenticated()
    return { ...described, locked: false }
  }
  const binding = (env: HandlerEnv): HttpSessionBinding => {
    if (!isHttpBinding(env.session)) throw unauthenticated()
    return env.session
  }
  const options = (b: HttpSessionBinding) => ({
    remote: true,
    network: b.network,
    ip: b.ip,
    sessionHours: b.sessionHours()
  })

  return {
    // No account names over the network: people type their username (they know it; a stranger does not).
    'auth.signInUsers': () => [],
    'auth.signIn': async (_ctx, input, env) => {
      const b = binding(env)
      const result = await services.auth.loginAsync({ ...input, device: b.device() }, options(b))
      b.signedIn(result)
      return me(result.userId)
    },
    'auth.signInWithPin': () => {
      throw new AppError('PERMISSION_DENIED', 'errors.pinDesktopOnly')
    },
    'auth.recover': async (_ctx, input, env) => {
      await services.auth.recoverWithCodeAsync(input, options(binding(env)))
      return ok
    },
    'auth.unlock': async (ctx, input, env) => {
      const b = binding(env)
      if (!ctx.userId) throw unauthenticated()
      try {
        // The remote lock is the one that applies over the network (N-11).
        await services.auth.unlockAsync(ctx.userId, input.secret, b.device(), {
          pin: false,
          remote: true,
          network: b.network
        })
      } catch (error) {
        // Someone guessing at an unattended phone: after a few tries this session is signed out.
        if (b.unlockFailed() >= UNLOCK_TRIES) {
          b.signedOut()
          throw unauthenticated()
        }
        throw error
      }
      b.unlock()
      return me(ctx.userId)
    },
    // The current password asked again (N-2): checked off the main thread; a wrong one counts on the remote counter
    // and the try that locks ends this session (the service revokes it).
    'auth.changePassword': async (ctx, input) => {
      await services.auth.changePasswordAsync(ctx, input)
      return ok
    },
    'auth.setPin': async (ctx, input) => {
      await services.auth.setPinAsync(ctx, input)
      return ok
    },
    'auth.newRecoveryCodes': async (ctx, input) => {
      if (!ctx.userId) throw unauthenticated()
      return { codes: await services.auth.generateRecoveryCodesAsync(ctx, ctx.userId, input.currentPassword) }
    }
  }
}
