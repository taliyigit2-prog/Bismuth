// The words of the damaged-data question at start (Faz 16 madde 2): the date and time it names are those of the
// backup that will really be restored — the newest one that unpacks and passes its check, not merely the newest
// file (QA2c #5). No Electron import: tested with plain Node.
import { formatDate } from '@shared/format'
import { localDateOf } from '@shared/date'
import { mainLocale, tMain } from './i18n'

const pad = (n: number): string => String(n).padStart(2, '0')

/** The body of the recovery question for a backup taken at `at` (local time, from its file name). */
export function recoveryDetail(kind: 'open' | 'integrity', at: Date): string {
  return tMain(kind === 'open' ? 'main.dialog.recovery.bodyOpen' : 'main.dialog.recovery.bodyIntegrity', {
    date: formatDate(localDateOf(at), mainLocale()),
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`
  })
}
