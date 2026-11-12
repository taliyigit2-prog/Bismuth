import type { FieldErrors } from './draft'

export interface Aria {
  'aria-invalid': true | undefined
  'aria-describedby': string | undefined
}

/**
 * aria props for a field: invalid, and described by its error, otherwise by its hint (`true` = its own
 * `<id>-hint`, a string = the id of a hint the field shares with its row).
 */
export function describe(id: string, errors: FieldErrors, hint: boolean | string = false): Aria {
  const error = errors[id]
  const hintId = typeof hint === 'string' ? hint : hint ? `${id}-hint` : undefined
  return {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hintId
  }
}
