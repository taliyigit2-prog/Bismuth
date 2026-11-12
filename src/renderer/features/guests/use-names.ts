// Country and language names in the UI language from the platform (Intl.DisplayNames): no country list in the
// language files, codes stay ISO (guests.nationality ISO 3166-1, guests.language ISO 639-1).
import { useMemo } from 'react'
import { LOCALE_TAG } from '@shared/format'
import { useFormat } from '@/hooks/use-format'

export function useDisplayNames() {
  const f = useFormat()
  return useMemo(() => {
    const tag = LOCALE_TAG[f.locale]
    const regions = new Intl.DisplayNames([tag], { type: 'region' })
    const languages = new Intl.DisplayNames([tag], { type: 'language' })
    // Russian language names are lower case ("английский"); a field value starts with a capital.
    const safe = (names: Intl.DisplayNames, code: string | null): string => {
      if (!code) return ''
      try {
        const name = names.of(code) ?? code
        return name.charAt(0).toLocaleUpperCase(tag) + name.slice(1)
      } catch {
        return code
      }
    }
    return {
      region: (code: string | null): string => safe(regions, code),
      language: (code: string | null): string => safe(languages, code)
    }
  }, [f.locale])
}
