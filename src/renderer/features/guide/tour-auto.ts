// When the first-run tour shows by itself (G-18): a signed-in person who has not seen it, in a hotel that shows it
// to new accounts (Ayarlar → Kılavuz).
import { useSettings } from '@/lib/api/hooks'
import { useMe } from '@/lib/session/session'

/** Whether the tour opens by itself for the person signed in. */
export function useTourAutoOpen(): boolean {
  const me = useMe()
  const settings = useSettings()
  const values = settings.data
  return Boolean(me && values && values['guide.tourForNewUsers'] && !values['ui.tourDone'])
}
