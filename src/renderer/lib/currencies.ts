// The currencies the screens offer (wizard step 4, Ayarlar → Otel): a short common list shown as chips, and every
// ISO 4217 code the platform knows behind "add another currency". Names come from the platform's own translations
// (Intl.DisplayNames, bundled ICU): no currency name in code, every UI language covered. The codes are the same
// values the settings keep (`hotel.currencies`, at most MAX_ACCEPTED_CURRENCIES of them).
import { normalizeName } from '@shared/domain/normalize'
import { LOCALE_TAG, type AppLocale } from '@shared/format'

/**
 * Shown as chips: what an Istanbul hotel is paid in (Excel: TL, Euro, Dolar, Sterlin, Ruble) plus the neighbours and
 * the Gulf. Any other code is one search away in the picker.
 */
export const COMMON_CURRENCIES: readonly string[] = [
  'TRY',
  'EUR',
  'USD',
  'GBP',
  'RUB',
  'CHF',
  'AED',
  'SAR',
  'KWD',
  'QAR',
  'AZN',
  'GEL',
  'KZT',
  'UAH'
]

/**
 * Codes the platform lists that are not money a guest pays with: accounting units (SDR, the sucre clearing unit)
 * and currencies that were replaced (kuna by the euro, the old Cuban convertible peso, the old leone, the old
 * Zimbabwe dollar and the Salvadoran colón).
 */
const NOT_OFFERED: ReadonlySet<string> = new Set(['XDR', 'XSU', 'HRK', 'CUC', 'SLL', 'ZWL', 'SVC'])

export interface CurrencyOption {
  code: string
  /** The currency's name in the UI language ("Japon yeni"); the code itself when the platform has no name. */
  name: string
}

export function currencyName(code: string, lang: AppLocale): string {
  try {
    return new Intl.DisplayNames([LOCALE_TAG[lang]], { type: 'currency' }).of(code) ?? code
  } catch {
    return code
  }
}

/** Every code the platform knows (the common ones when it cannot say). */
function knownCodes(): readonly string[] {
  try {
    const known = Intl.supportedValuesOf('currency').filter(
      (c) => /^[A-Z]{3}$/.test(c) && !NOT_OFFERED.has(c)
    )
    return [...new Set([...COMMON_CURRENCIES, ...known])]
  } catch {
    return COMMON_CURRENCIES
  }
}

/** Every currency the platform knows, named and sorted in the UI language. */
export function allCurrencies(lang: AppLocale): CurrencyOption[] {
  const names = new Intl.DisplayNames([LOCALE_TAG[lang]], { type: 'currency' })
  const name = (code: string): string => {
    try {
      return names.of(code) ?? code
    } catch {
      return code
    }
  }
  const sorter = new Intl.Collator(LOCALE_TAG[lang])
  return knownCodes()
    .map((code) => ({ code, name: name(code) }))
    .sort((a, b) => sorter.compare(a.name, b.name) || sorter.compare(a.code, b.code))
}

/** The chips: the common currencies, then the ones the hotel already has or just added (in that order). */
export function chipCurrencies(...more: (readonly string[])[]): string[] {
  return [...new Set<string>([...COMMON_CURRENCIES, ...more.flat()])]
}

/**
 * The picker's answer to what was typed: matches by code or by name (case, Turkish letters and accents folded),
 * the exact code first, then codes and names that begin with the text. Codes in `hidden` (already chips) are left out.
 */
export function matchCurrencies(
  options: readonly CurrencyOption[],
  query: string,
  hidden: readonly string[] = []
): CurrencyOption[] {
  const skip = new Set(hidden)
  const q = normalizeName(query)
  const open = options.filter((o) => !skip.has(o.code))
  if (!q) return open
  const ranked: { option: CurrencyOption; rank: number }[] = []
  for (const option of open) {
    const code = normalizeName(option.code)
    const name = normalizeName(option.name)
    let rank = -1
    if (code === q) rank = 0
    else if (code.startsWith(q)) rank = 1
    else if (name.startsWith(q) || name.includes(` ${q}`)) rank = 2
    else if (name.includes(q)) rank = 3
    if (rank >= 0) ranked.push({ option, rank })
  }
  // Array.prototype.sort is stable: inside a rank the options keep their name order.
  return ranked.sort((a, b) => a.rank - b.rank).map((r) => r.option)
}
