// Task suggestions that only make sense in one country (K-46 (7); karar denetimi #11, G-09, G-93): the Turkish
// legal reminders — the Ministry of Tourism accommodation statistics and the KBS check-out reports — are suggested
// and seeded only for a hotel in Türkiye. A hotel elsewhere is not offered them; an existing hotel keeps its tasks
// as they are (only the suggestion and the first seed follow this rule).

/** Seeded task template code → the countries (ISO 3166-1 alpha-2) it is suggested in. Absent = everywhere. */
export const TASK_COUNTRIES: Readonly<Record<string, readonly string[]>> = {
  legal_tourism_stats: ['TR'],
  legal_kbs_checkout: ['TR']
}

/** Whether the seeded template `code` is suggested to a hotel in `country` (a template without a code: always). */
export function taskSuggestedIn(
  code: string | null | undefined,
  country: string | null | undefined
): boolean {
  const only = code ? TASK_COUNTRIES[code] : undefined
  return !only || (!!country && only.includes(country.toUpperCase()))
}
