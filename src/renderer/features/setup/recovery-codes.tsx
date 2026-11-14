// After "Kurulumu bitir": the single "write it on paper" step (K-41). The owner's recovery codes (G-22) and the
// Bismuth key (K-05) are shown once, together, with one print button: both are derived (the codes come from the
// finished setup, the key is read from the backup service), nothing is typed twice. The way into the program opens
// only after "Kâğıda yazdım" is ticked. The card starts where the page title starts (no step list beside it now).
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRightIcon, PartyPopperIcon, PrinterIcon, ShieldAlertIcon } from 'lucide-react'
import { localDateOf } from '@shared/date'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { CopyButton } from '@/components/copy-button'
import { QrCode } from '@/components/qr-code'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery, useSettings } from '@/lib/api/hooks'
import { usePrint } from '../reports/use-report-export'
import '../reports/print.css'

export function RecoveryCodes({ codes, onContinue }: { codes: readonly string[]; onContinue: () => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const print = usePrint()
  const [written, setWritten] = useState(false)
  // The key is made on first ask and the asking is audited: once, here (setup.finish signed this window in).
  const key = useApiQuery('backup.recoveryText', {}, { staleTime: Infinity, retry: false })
  // The hotel name written on the sheet was saved by "Kurulumu bitir"; the settings read before it are stale.
  useEffect(() => {
    void client.invalidateQueries({ queryKey: ['settings.get'] })
  }, [client])
  const keyText = key.data?.text ?? null
  return (
    <Card className="w-full max-w-2xl" data-testid="recovery-codes">
      <CardHeader>
        <p className="text-success flex items-center gap-2 text-sm font-medium">
          <PartyPopperIcon className="size-4" aria-hidden />
          {t('setup.recovery.ready')}
        </p>
        <CardTitle role="heading" aria-level={2} className="text-lg">
          {t('setup.recovery.title')}
        </CardTitle>
        <CardDescription>{t('setup.recovery.body')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <section className="grid gap-3" aria-labelledby="recovery-codes-title">
          <div className="grid gap-1">
            <h3 id="recovery-codes-title" className="text-sm font-semibold">
              {t('setup.recovery.codesTitle')}
            </h3>
            <p className="text-muted-foreground text-sm">{t('setup.recovery.codesHelp')}</p>
          </div>
          <ol
            className="bg-muted/50 grid gap-2 rounded-lg border p-3 sm:grid-cols-2 sm:p-4"
            aria-label={t('setup.recovery.list')}
            dir="ltr"
          >
            {codes.map((code) => (
              <li
                key={code}
                className="bg-background rounded-md border px-2 py-1.5 text-center font-mono text-sm tracking-wide whitespace-nowrap tabular-nums select-all"
                data-testid="recovery-code"
              >
                {code}
              </li>
            ))}
          </ol>
          <div className="flex justify-end">
            <CopyButton text={codes.join('\n')} label={t('setup.recovery.copy')} />
          </div>
        </section>
        <section className="grid gap-3" aria-labelledby="recovery-key-title" data-testid="recovery-key-box">
          <div className="grid gap-1">
            <h3 id="recovery-key-title" className="text-sm font-semibold">
              {t('setup.recovery.keyTitle')}
            </h3>
            <p className="text-muted-foreground text-sm">{t('setup.recovery.keyHelp')}</p>
          </div>
          {key.isPending ? (
            <p className="text-muted-foreground text-sm" role="status">
              {t('setup.recovery.keyLoading')}
            </p>
          ) : keyText ? (
            <>
              <code
                dir="ltr"
                className="bg-muted/50 rounded-lg border p-3 text-center font-mono text-sm leading-relaxed tracking-wider break-words select-all"
                data-testid="recovery-key"
              >
                {keyText}
              </code>
              <div className="flex justify-end">
                <CopyButton text={keyText} label={t('setup.recovery.keyCopy')} />
              </div>
            </>
          ) : (
            <Alert data-testid="recovery-key-failed">
              <AlertDescription className="text-sm">{t('setup.recovery.keyFailed')}</AlertDescription>
            </Alert>
          )}
        </section>
        <Alert className="border-warning bg-warning/10 [&>svg]:text-warning" data-testid="recovery-once">
          <ShieldAlertIcon aria-hidden />
          <AlertDescription className="text-foreground text-sm">{t('setup.recovery.once')}</AlertDescription>
        </Alert>
        <div className="flex">
          <Button
            type="button"
            variant="outline"
            onClick={print.start}
            disabled={print.printing}
            className="max-md:w-full"
            data-testid="recovery-print"
          >
            <PrinterIcon aria-hidden />
            {t('setup.recovery.print')}
          </Button>
        </div>
        {print.printing ? <PaperSheet codes={codes} keyText={keyText} /> : null}
      </CardContent>
      <CardFooter className="flex-wrap justify-between gap-3 border-t pt-6">
        <Label className="min-h-9 cursor-pointer gap-3 font-normal max-md:min-h-11">
          <Checkbox
            checked={written}
            onCheckedChange={(v) => setWritten(v === true)}
            data-testid="recovery-written"
          />
          {t('setup.recovery.written')}
        </Label>
        <Button type="button" disabled={!written} onClick={onContinue} data-testid="recovery-continue">
          {t('setup.recovery.continue')}
          <ArrowRightIcon className="rtl:rotate-180" aria-hidden />
        </Button>
      </CardFooter>
    </Card>
  )
}

/** One A4 sheet for the safe: codes and key (with its QR code) in one place; printed light whatever the theme. */
function PaperSheet({ codes, keyText }: { codes: readonly string[]; keyText: string | null }) {
  const { t } = useTranslation()
  const f = useFormat()
  const settings = useSettings()
  return createPortal(
    <div className="print-root bg-background text-foreground" data-testid="recovery-sheet">
      <div className="grid gap-6 p-4">
        <div>
          <p className="text-lg font-semibold">{settings.data?.['hotel.name'] ?? ''}</p>
          <p className="text-base">{t('setup.recovery.sheet.title')}</p>
          <p className="text-muted-foreground text-sm">{f.date(localDateOf(new Date()), 'long')}</p>
        </div>
        <div className="grid gap-2">
          <p className="font-semibold">{t('setup.recovery.codesTitle')}</p>
          <ol dir="ltr" className="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-lg tracking-wide">
            {codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ol>
          <p className="text-sm">{t('setup.recovery.sheet.codes')}</p>
        </div>
        {keyText ? (
          <div className="grid gap-2">
            <p className="font-semibold">{t('setup.recovery.keyTitle')}</p>
            <p dir="ltr" className="font-mono text-xl leading-loose tracking-widest break-words">
              {keyText}
            </p>
            <QrCode value={keyText} label={t('setup.recovery.keyQr')} className="size-48" />
            <p className="text-sm">{t('setup.recovery.sheet.key')}</p>
          </div>
        ) : null}
        <p className="text-sm">{t('setup.recovery.sheet.keep')}</p>
      </div>
    </div>,
    document.body
  )
}
