// Column titles and values of exported files in the asking person's language (G-08: the same locale files as the
// screens; "Türkçe başlıklar" for a Turkish user). Fallback ru/en → tr, like the screens.
import tr from '../../../renderer/i18n/tr.json'
import en from '../../../renderer/i18n/en.json'
import ru from '../../../renderer/i18n/ru.json'
import type { AppLocale } from '@shared/format'

const dictionaries: Record<AppLocale, unknown> = { tr, en, ru }

function lookup(dict: unknown, key: string): string | undefined {
  let node: unknown = dict
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' ? node : undefined
}

export type Translate = (key: string) => string

export const translator =
  (locale: AppLocale): Translate =>
  (key) =>
    lookup(dictionaries[locale], key) ?? lookup(dictionaries.tr, key) ?? key

/** Name of a list row (channel, method, section…): the user's own name, else the seeded translation. */
export function listLabel(
  name: string | null | undefined,
  nameI18n: Partial<Record<AppLocale, string>> | null | undefined,
  locale: AppLocale
): string {
  return nameI18n?.[locale] ?? nameI18n?.tr ?? name ?? ''
}
