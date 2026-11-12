// ONE router for both transports (faz-01 "Başlangıç" 5; repo-masaustu-sablonlar.md §4.4):
//   Electron window → ipcMain.handle(API_CHANNEL) → app.fetch(request, { ctx })   (no port is opened)
//   server mode     → @hono/node-server → the same app, ctx from the session cookie (Faz 13)
// Every call: procedure lookup → ctx → zod input → service (authorisation inside) → zod output.
import { Hono, type Context } from 'hono'
import * as z from 'zod'
import {
  accessOf,
  contract,
  isProcedureName,
  type Access,
  type ApiErrorBody,
  type Contract,
  type ProcedureName
} from '@shared/contract'
import { AppError } from '../services/errors'
import { ctxKind, type Ctx, type Transport } from '../services/context'
import type { SessionBinding } from './session'

/** What a handler gets besides ctx and input: the caller's sign-in state (null where sign-in is not possible). */
export interface HandlerEnv {
  session: SessionBinding | null
  /** How the call arrived: decided by the entry point (IPC handler or HTTP server), never by the request. */
  transport: 'ipc' | 'http'
}

export type Handlers = {
  [K in ProcedureName]: (
    ctx: Ctx,
    input: z.output<Contract[K]['input']>,
    env: HandlerEnv
  ) => z.input<Contract[K]['output']> | Promise<z.input<Contract[K]['output']>>
}

/** The handlers of some procedures: what a module file (handlers/<module>.ts) provides. */
export type HandlersFor<K extends ProcedureName> = Pick<Handlers, K>

export interface ApiEnv {
  Bindings: { ctx?: Ctx; session?: SessionBinding; transport?: 'ipc' | 'http' }
  Variables: { ctx: Ctx }
}

/**
 * Whether this kind of caller may reach a procedure (contract `access`); the service still checks permissions.
 * The program itself (`system`) reaches everything.
 */
export function mayCall(ctx: Ctx, access: readonly Access[], transport: Transport): boolean {
  const kind = ctxKind(ctx)
  if (kind === 'system' || access.includes('public')) return true
  // The wizard runs on the hotel's own computer only, never over the network.
  if (kind === 'setup' && (transport !== 'ipc' || ctx.transport !== 'ipc')) return false
  return kind !== 'anonymous' && access.includes(kind)
}

function refused(ctx: Ctx, access: readonly Access[]): AppError {
  switch (ctxKind(ctx)) {
    case 'setup':
      return new AppError('CONFLICT', 'errors.setupNeeded')
    case 'locked':
      return new AppError('UNAUTHENTICATED', 'errors.locked')
    case 'user':
      return access.includes('setup')
        ? new AppError('CONFLICT', 'errors.setupDone')
        : new AppError('UNAUTHENTICATED', 'errors.unauthenticated')
    default:
      return new AppError('UNAUTHENTICATED', 'errors.unauthenticated')
  }
}

export interface ApiOptions {
  handlers: Handlers
  /** HTTP only: derive ctx from the request (session cookie). Return null → 401. */
  resolveCtx?: (c: Context<ApiEnv>) => Ctx | null | Promise<Ctx | null>
  onInternalError?: (error: unknown, procedure: string) => void
  /** Turns a known non-AppError into one (the read-only copy: SQLite refusing a write says "read-only"). */
  mapError?: (error: unknown) => AppError | null
}

function errorBody(error: AppError): ApiErrorBody {
  return {
    error: {
      code: error.code,
      messageKey: error.messageKey,
      ...(error.details === undefined ? {} : { details: error.details })
    }
  }
}

export function createApiApp(options: ApiOptions): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>()

  app.post('/api/:name', async (c) => {
    const name = c.req.param('name')
    if (!isProcedureName(name)) throw new AppError('UNKNOWN_PROCEDURE', 'errors.unknownProcedure', { name })

    const ctx = c.env?.ctx ?? (options.resolveCtx ? await options.resolveCtx(c) : null)
    if (!ctx) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated')
    // Anything that did not come through the IPC entry point counts as remote (the safe default).
    const transport: Transport = c.env?.transport === 'ipc' ? 'ipc' : 'http'
    const access = accessOf(name)
    if (!mayCall(ctx, access, transport)) throw refused(ctx, access)

    let body: unknown
    try {
      const text = await c.req.text()
      body = text.length === 0 ? {} : JSON.parse(text)
    } catch {
      throw new AppError('VALIDATION', 'errors.validation', { reason: 'invalid json' })
    }
    // One procedure at a time: widen the per-name schema union to a plain schema for parsing.
    const parsed = (contract[name].input as z.ZodType).safeParse(body)
    if (!parsed.success) throw new AppError('VALIDATION', 'errors.validation', z.flattenError(parsed.error))

    const handler = options.handlers[name] as (ctx: Ctx, input: unknown, env: HandlerEnv) => unknown
    const result = await handler(ctx, parsed.data, { session: c.env?.session ?? null, transport })
    return c.json((contract[name].output as z.ZodType).parse(result) as object)
  })

  app.notFound(() => {
    throw new AppError('UNKNOWN_PROCEDURE', 'errors.unknownProcedure')
  })

  app.onError((error, c) => {
    if (error instanceof AppError) return c.json(errorBody(error), error.status as 400)
    const mapped = options.mapError?.(error) ?? null
    if (mapped) return c.json(errorBody(mapped), mapped.status as 400)
    options.onInternalError?.(error, c.req.path)
    return c.json(errorBody(new AppError('INTERNAL', 'errors.internal')), 500)
  })

  return app
}
