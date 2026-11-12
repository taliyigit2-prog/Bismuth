// The window's own language (faz-15 madde 11): Chromium draws built-in controls (number fields, spelling, the
// print dialog, a time field) in its locale, which follows the computer — an English (US) Windows showed "02:00 PM".
// The program's language (`ui.language`) is applied to Chromium with `--lang` at the next start (English as
// en-GB: 24-hour clock, day before month). `--lang` is read before `ready`, when the database is not open yet, so
// the last language is kept in a small file next to it.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { APP_LOCALES, type AppLocale } from '@shared/format'

const CHROMIUM_LANG: Record<AppLocale, string> = { tr: 'tr', en: 'en-GB', ru: 'ru' }

export const chromiumLang = (locale: AppLocale): string => CHROMIUM_LANG[locale]

export const uiLocaleFile = (root: string): string => join(root, 'ui-locale.json')

/** The language last chosen in the program, or null (first start, unreadable file). */
export function readUiLocale(file: string): AppLocale | null {
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'))
    const locale = value && typeof value === 'object' ? (value as { locale?: unknown }).locale : null
    return typeof locale === 'string' && (APP_LOCALES as readonly string[]).includes(locale)
      ? (locale as AppLocale)
      : null
  } catch {
    return null
  }
}

/** Keeps the language for the next start; a failure only means the next start uses the computer's language. */
export function writeUiLocale(file: string, locale: AppLocale): void {
  try {
    writeFileSync(file, JSON.stringify({ locale }))
  } catch {
    // Not worth stopping the program for: the menus and the screens use the setting anyway.
  }
}

/** Before `ready`: the `--lang` switch for the language kept from the last run (nothing on the first start). */
export function chromiumLangSwitch(file: string): string | null {
  const locale = readUiLocale(file)
  return locale ? chromiumLang(locale) : null
}
