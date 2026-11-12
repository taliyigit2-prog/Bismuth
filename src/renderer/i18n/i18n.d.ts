import 'i18next'
import type tr from './tr.json'

// Typed keys: a misspelled key passed to t() fails typecheck (CLAUDE.md yasak 8).
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof tr }
  }
}
