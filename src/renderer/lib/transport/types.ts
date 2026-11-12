import type { ErrorCode, ProcedureInput, ProcedureName, ProcedureOutput } from '@shared/contract'

/** One contract, two transports (03-mimari.md §2): the rest of the UI never knows which is used. */
export interface Transport {
  readonly kind: 'ipc' | 'http'
  call<K extends ProcedureName>(name: K, input: ProcedureInput<K>): Promise<ProcedureOutput<K>>
  /**
   * The same call with the answer's status: 203 means "from the read-only copy" (the owner's computer while the
   * main computer is away, or a main computer that was replaced), so the screens close their write buttons.
   */
  callWithStatus?<K extends ProcedureName>(
    name: K,
    input: ProcedureInput<K>
  ): Promise<{ output: ProcedureOutput<K>; status: number }>
}

/** A failed call. `messageKey` is a tr.json key (errors.*) the UI can show as is. */
export class ApiError extends Error {
  readonly code: ErrorCode | 'NETWORK'
  readonly status: number
  readonly messageKey: string
  readonly details: unknown

  constructor(code: ErrorCode | 'NETWORK', status: number, messageKey: string, details?: unknown) {
    super(`${code} (${status}): ${messageKey}`)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.messageKey = messageKey
    this.details = details
  }
}
