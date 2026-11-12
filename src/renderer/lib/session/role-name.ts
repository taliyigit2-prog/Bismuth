// Role names as the screens show them: a seeded role carries its name in every language until the hotel renames
// it (the rename clears the translations); the hotel's own roles have one name.
import type { AppLocale } from '@shared/format'

export function localizedName(
  name: string,
  i18n: Partial<Record<AppLocale, string>> | null | undefined,
  locale: AppLocale
): string {
  return i18n?.[locale] || name
}
