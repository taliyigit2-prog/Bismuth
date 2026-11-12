// The Bismuth key as the owner keeps it (K-41): the 11 × 5 recovery text and the same key as a QR code, on screen
// and on one printed A4 sheet to keep in the safe. On the owner's Mac (or a new computer) the key is typed in once,
// or the QR code is read with a phone camera and its text typed or pasted. Printed light whatever the theme; only
// the sheet is printed (the reports' print stylesheet leaves the program window out).
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { PrinterIcon } from 'lucide-react'
import { localDateOf } from '@shared/date'
import { Button } from '@/components/ui/button'
import { QrCode } from '@/components/qr-code'
import { useFormat } from '@/hooks/use-format'
import { useSettings } from '@/lib/api/hooks'
import { usePrint } from '../reports/use-report-export'
import '../reports/print.css'

export function KeyQr({ text }: { text: string }) {
  const { t } = useTranslation()
  const print = usePrint()
  return (
    <div className="grid justify-items-center gap-3">
      <QrCode value={text} label={t('backup.keyQr')} className="size-48" />
      <p className="text-muted-foreground max-w-prose text-center text-xs">{t('backup.keyQrHelp')}</p>
      <Button variant="outline" onClick={print.start} disabled={print.printing} data-testid="key-print">
        <PrinterIcon aria-hidden />
        {t('backup.keyPrint')}
      </Button>
      {print.printing ? <KeySheet text={text} /> : null}
    </div>
  )
}

function KeySheet({ text }: { text: string }) {
  const { t } = useTranslation()
  const f = useFormat()
  const settings = useSettings()
  const today = localDateOf(new Date())
  return createPortal(
    <div className="print-root bg-background text-foreground" data-testid="key-sheet">
      <div className="grid gap-6 p-4">
        <div>
          <p className="text-lg font-semibold">{settings.data?.['hotel.name'] ?? ''}</p>
          <p className="text-base">{t('backup.keyTitle')}</p>
          <p className="text-muted-foreground text-sm">{f.date(today, 'long')}</p>
        </div>
        <p dir="ltr" className="font-mono text-xl leading-loose tracking-widest break-words">
          {text}
        </p>
        <QrCode value={text} label={t('backup.keyQr')} className="size-56" />
        <ul className="grid list-disc gap-1 ps-5 text-sm">
          <li>{t('backup.keySheet.keep')}</li>
          <li>{t('backup.keySheet.use')}</li>
          <li>{t('backup.keySheet.lost')}</li>
        </ul>
      </div>
    </div>,
    document.body
  )
}
