// Nothing the camera module logs or reports may carry a camera password or a bot token (K-49, K-51).

// Greedy up to the last `@` of the token: passwords may contain `/`, `:`, `@` or quotes (typed by hand, not URL-encoded); a token has no whitespace.
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)\S*@/gi
const BOT_TOKEN = /\bbot\d{3,}:[A-Za-z0-9_-]{10,}/g

const known = new Set<string>()
const MIN_KNOWN_LENGTH = 4

/** Remember secret values (camera password, bot token) so they are masked verbatim wherever they show up. */
export function registerSecretValues(values: Iterable<string | null | undefined>): void {
  for (const v of values) if (v && v.length >= MIN_KNOWN_LENGTH) known.add(v)
}

/** Tests only. */
export function clearSecretValues(): void {
  known.clear()
}

/** The user and password in front of the host of a URL become `***:***`; `bot<id>:<secret>` becomes `bot***`. */
export function redactSecrets(text: string): string {
  let out = text.replace(URL_CREDENTIALS, '$1***:***@').replace(BOT_TOKEN, 'bot***')
  // Longest first, so a secret that contains another one is masked whole.
  for (const v of [...known].sort((a, b) => b.length - a.length)) out = out.split(v).join('***')
  return out
}
