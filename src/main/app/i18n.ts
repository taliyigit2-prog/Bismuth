// Main-process texts (dialogs, menu) come from the same locale files as the UI (CLAUDE.md yasak 8).
import tr from '../../renderer/i18n/tr.json'
import en from '../../renderer/i18n/en.json'
import ru from '../../renderer/i18n/ru.json'
import type { AppLocale } from '@shared/format'

const dictionaries: Record<AppLocale, unknown> = { tr, en, ru }
let current: AppLocale = 'tr'

export function setMainLocale(locale: AppLocale): void {
  current = locale
}

/** The language of the main-process texts now (dates in dialogs follow it). */
export function mainLocale(): AppLocale {
  return current
}

function lookup(dict: unknown, key: string): string | undefined {
  let node: unknown = dict
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

/** Main-process translation with ru/en → tr fallback, like the renderer; {{name}} placeholders. */
export function tMain(key: string, vars: Record<string, string> = {}): string {
  const text =
    lookup(dictionaries[current], key) ?? lookup(dictionaries.en, key) ?? lookup(dictionaries.tr, key) ?? key
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => vars[name] ?? '')
}

/** The same lookup in a given language (the PDF summary is written in the hotel's language, not the window's). */
export function tFor(locale: AppLocale): (key: string, vars?: Record<string, string>) => string {
  return (key, vars = {}) => {
    const text =
      lookup(dictionaries[locale], key) ?? lookup(dictionaries.en, key) ?? lookup(dictionaries.tr, key) ?? key
    return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => vars[name] ?? '')
  }
}
