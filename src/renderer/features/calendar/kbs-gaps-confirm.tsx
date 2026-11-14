// Before a bulk check-out: rooms that still lack KBS information are listed by name as a warning (S-124). The
// check-out is never blocked by it (same as a single check-out): "Yine de çıkış yap" goes on.
import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { useTransport } from '@/lib/api/api-context'

export function useKbsGapsConfirm(): {
  /** Runs `go` at once when nothing is missing, else asks first. A failed lookup never stops the check-out. */
  check: (stayIds: readonly string[], go: () => void) => Promise<void>
  dialog: ReactElement
} {
  const { t } = useTranslation()
  const transport = useTransport()
  const [ask, setAsk] = useState<{ rooms: string[]; go: () => void } | null>(null)
  const check = async (stayIds: readonly string[], go: () => void): Promise<void> => {
    let rooms: string[] = []
    try {
      const gaps = await transport.call('booking.kbsGaps', { stayIds: [...stayIds] })
      rooms = gaps.map((g) => g.roomNumber)
    } catch {
      rooms = []
    }
    if (rooms.length === 0) go()
    else setAsk({ rooms, go })
  }
  const dialog = (
    <AlertDialog open={!!ask} onOpenChange={(o) => (o ? null : setAsk(null))}>
      <AlertDialogContent data-testid="kbs-gaps-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('calendar.kbsGaps.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('calendar.kbsGaps.body', { rooms: ask?.rooms.join(', ') ?? '' })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            data-testid="kbs-gaps-go"
            onClick={() => {
              const go = ask?.go
              setAsk(null)
              go?.()
            }}
          >
            {t('calendar.kbsGaps.go')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  return { check, dialog }
}
