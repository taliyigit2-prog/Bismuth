// ULID (26 chars, Crockford base32): time-sortable primary keys for every table (03-mimari.md §4).
// Works in the main process (Node ≥ 22 global WebCrypto) and in the renderer.
// Monotonic: ids made in the same millisecond (rows of one transaction share `now`) or with an earlier clock
// keep the previous time part and increment the random part, so ids sort in the order they were made
// (product lines, nights and other rows listed by id keep their entry order).
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

let lastTime = -1
let lastRandom = ''

function encodeTime(now: number): string {
  let time = ''
  let t = now
  for (let i = 0; i < 10; i++) {
    time = ALPHABET.charAt(t % 32) + time
    t = Math.floor(t / 32)
  }
  return time
}

function freshRandom(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  let random = ''
  for (const b of bytes) random += ALPHABET.charAt(b % 32)
  return random
}

function increment(random: string): string {
  const chars = random.split('')
  for (let i = chars.length - 1; i >= 0; i--) {
    const index = ALPHABET.indexOf(chars[i] as string)
    if (index < 31) {
      chars[i] = ALPHABET.charAt(index + 1)
      return chars.join('')
    }
    chars[i] = ALPHABET.charAt(0)
  }
  throw new RangeError('ulid: random part exhausted')
}

export function ulid(now: number = Date.now()): string {
  if (!Number.isSafeInteger(now) || now < 0) throw new RangeError('ulid: invalid timestamp')
  if (now <= lastTime) {
    lastRandom = increment(lastRandom)
    return encodeTime(lastTime) + lastRandom
  }
  lastTime = now
  lastRandom = freshRandom()
  return encodeTime(now) + lastRandom
}

export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/
