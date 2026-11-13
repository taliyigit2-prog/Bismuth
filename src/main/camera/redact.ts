// Nothing the camera module logs or reports may carry a camera password or a bot token (K-49, K-51).

// Greedy up to the last `@` of the token: passwords may contain `/`, `:` or `@` (typed by hand, not URL-encoded).
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s"'`]*@/gi
const BOT_TOKEN = /\bbot\d{3,}:[A-Za-z0-9_-]{10,}/g

/** The user and password in front of the host of a URL become `***:***`; `bot<id>:<secret>` becomes `bot***`. */
export function redactSecrets(text: string): string {
  return text.replace(URL_CREDENTIALS, '$1***:***@').replace(BOT_TOKEN, 'bot***')
}
