// The setup wizard's steps, in order (G-10, faz-04 madde 1). Shared with the router, whose `?step=N` opens a step
// (1-based, like the "Adım N / M" line); the saved progress uses the same numbers.
export const STEPS = [
  'language',
  'mode',
  'hotel',
  'currencies',
  'roomTypes',
  'rooms',
  'money',
  'staff',
  'employees',
  'calendar',
  'owner',
  'summary'
] as const
export type Step = (typeof STEPS)[number]
export const SETUP_STEP_COUNT = STEPS.length

/**
 * Steps that cannot be skipped: language, work mode, hotel name, base currency, at least one room type and one
 * room, the owner.
 */
export const REQUIRED_STEPS: readonly Step[] = [
  'language',
  'mode',
  'hotel',
  'currencies',
  'roomTypes',
  'rooms',
  'owner'
]

export const isRequiredStep = (step: Step): boolean => REQUIRED_STEPS.includes(step)
