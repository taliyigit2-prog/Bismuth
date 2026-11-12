// The guide's address: `#/guide?s=payments&a=cash-drawer` — the open section and the heading to scroll to.
export interface GuideSearch {
  /** Open section. */
  s?: string
  /** Heading to scroll to. */
  a?: string
}

/** `?s=payments&a=cash-drawer` (anything else is dropped). */
export const validateGuideSearch = (search: Record<string, unknown>): GuideSearch => {
  const ok = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,60}$/.test(v)
  return { ...(ok(search['s']) ? { s: search['s'] } : {}), ...(ok(search['a']) ? { a: search['a'] } : {}) }
}
