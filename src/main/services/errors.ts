import { ERROR_STATUS, type ErrorCode } from '@shared/contract'

/** A failure the user can understand: `messageKey` is a tr.json key under `errors.*`. */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly messageKey: string
  readonly details: unknown

  constructor(code: ErrorCode, messageKey: string, details?: unknown) {
    super(`${code}: ${messageKey}`)
    this.name = 'AppError'
    this.code = code
    this.messageKey = messageKey
    this.details = details
  }

  get status(): number {
    return ERROR_STATUS[this.code]
  }
}

export const permissionDenied = (): AppError => new AppError('PERMISSION_DENIED', 'errors.permissionDenied')
