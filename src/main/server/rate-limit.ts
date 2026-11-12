// Sliding-window counters for the server mode (faz-13 madde 1, "Faz 4'ten notlar"): requests per address, and
// sign-in tries per address and per device — checked before any password hash is computed, so a flood of guesses
// costs the hotel's computer nothing. In memory: a restart only resets the pause.

export interface RateLimiter {
  /** How many hits `key` has in the window now. */
  count(key: string): number
  /** True when `key` has reached the limit (the caller refuses before doing the work). */
  blocked(key: string): boolean
  /** Counts one hit. */
  hit(key: string): void
  /** Counts one hit and says whether it was still allowed. */
  take(key: string): boolean
  reset(key: string): void
}

export interface RateLimitOptions {
  limit: number
  windowMs: number
  clock?: () => number
  /** Keys kept at most (oldest dropped first): a spoofed flood cannot grow memory without end. */
  maxKeys?: number
}

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const { limit, windowMs } = options
  const now = options.clock ?? (() => Date.now())
  const maxKeys = options.maxKeys ?? 10_000
  const hits = new Map<string, number[]>()

  const recent = (key: string): number[] => {
    const since = now() - windowMs
    const kept = (hits.get(key) ?? []).filter((t) => t > since)
    if (kept.length) hits.set(key, kept)
    else hits.delete(key)
    return kept
  }

  const hit = (key: string): void => {
    const list = recent(key)
    list.push(now())
    hits.delete(key)
    hits.set(key, list)
    while (hits.size > maxKeys) {
      const oldest = hits.keys().next().value
      if (oldest === undefined) break
      hits.delete(oldest)
    }
  }

  return {
    count: (key) => recent(key).length,
    blocked: (key) => recent(key).length >= limit,
    hit,
    take(key) {
      if (recent(key).length >= limit) return false
      hit(key)
      return true
    },
    reset: (key) => void hits.delete(key)
  }
}
