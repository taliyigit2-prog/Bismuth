import { apiErrorBodySchema, type ProcedureName, type ProcedureOutput } from '@shared/contract'
import { ApiError } from './types'

/** Turn a status + JSON text into the procedure output or an ApiError (shared by both transports). */
export function decodeResponse<K extends ProcedureName>(status: number, body: string): ProcedureOutput<K> {
  let json: unknown
  try {
    json = body.length ? JSON.parse(body) : null
  } catch {
    throw new ApiError('INTERNAL', status, 'errors.internal')
  }
  if (status >= 200 && status < 300) return json as ProcedureOutput<K>
  const parsed = apiErrorBodySchema.safeParse(json)
  if (parsed.success) {
    const { code, messageKey, details } = parsed.data.error
    throw new ApiError(code, status, messageKey, details)
  }
  throw new ApiError('INTERNAL', status, 'errors.internal')
}
