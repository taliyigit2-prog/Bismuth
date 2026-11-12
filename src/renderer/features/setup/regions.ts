// Countries and time zones the wizard offers. Names come from the platform's own translations (Intl.DisplayNames,
// bundled ICU): no text in code, every UI language covered. A short list on purpose; the codes are ISO 3166-1 /
// IANA, the same values the settings keep. Currencies live in `@/lib/currencies`.
import { LOCALE_TAG, type AppLocale } from '@shared/format'

/** Country → its usual time zone (picked automatically when the country changes). */
export const COUNTRY_ZONES: Readonly<Record<string, string>> = {
  TR: 'Europe/Istanbul',
  AZ: 'Asia/Baku',
  GE: 'Asia/Tbilisi',
  RU: 'Europe/Moscow',
  UA: 'Europe/Kyiv',
  KZ: 'Asia/Almaty',
  DE: 'Europe/Berlin',
  GB: 'Europe/London',
  NL: 'Europe/Amsterdam',
  FR: 'Europe/Paris',
  IT: 'Europe/Rome',
  ES: 'Europe/Madrid',
  GR: 'Europe/Athens',
  BG: 'Europe/Sofia',
  CY: 'Asia/Nicosia',
  AE: 'Asia/Dubai',
  US: 'America/New_York'
}

export function countryName(code: string, lang: AppLocale): string {
  try {
    return new Intl.DisplayNames([LOCALE_TAG[lang]], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/** Countries of the list (and the current one), sorted by their name in the UI language. */
export function countryChoices(current: string, lang: AppLocale): { code: string; name: string }[] {
  const codes = new Set([...Object.keys(COUNTRY_ZONES), current])
  const sorter = new Intl.Collator(LOCALE_TAG[lang])
  return [...codes]
    .map((code) => ({ code, name: countryName(code, lang) }))
    .sort((a, b) => sorter.compare(a.name, b.name))
}

/** "GMT+3" for a zone today; empty when the platform does not know the zone. */
export function zoneOffset(zone: string, at = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      timeZoneName: 'shortOffset'
    }).formatToParts(at)
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

/**
 * A zone as people read it, in the UI language: "Türkiye Saati (UTC+03:00)" / "Türkiye Time (UTC+03:00)". The zone
 * id when the platform does not know the zone.
 */
export function zoneLabel(zone: string, lang: AppLocale, at = new Date()): { name: string; offset: string } {
  const part = (locale: string, style: 'longGeneric' | 'longOffset'): string | undefined =>
    new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: style })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value
  try {
    const offset = (part('en-GB', 'longOffset') ?? '').replace(/^GMT/, 'UTC') || 'UTC'
    return { name: part(LOCALE_TAG[lang], 'longGeneric') ?? zone, offset }
  } catch {
    return { name: zone, offset: '' }
  }
}

export function zoneChoices(current: string): string[] {
  return [...new Set([...Object.values(COUNTRY_ZONES), current])].sort()
}
