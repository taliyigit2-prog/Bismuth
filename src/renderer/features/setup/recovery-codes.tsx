// After "Kurulumu bitir": the owner's recovery codes (G-22), shown once. The way into the program opens only
// after "Kodları sakladım" is ticked. The card starts where the page title starts (no step list beside it now).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRightIcon, PartyPopperIcon, ShieldAlertIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { CopyButton } from '@/components/copy-button'

export function RecoveryCodes({ codes, onContinue }: { codes: readonly string[]; onContinue: () => void }) {
  const { t } = useTranslation()
  const [written, setWritten] = useState(false)
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
      <CardContent className="grid gap-4">
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
        <Alert className="border-warning bg-warning/10 [&>svg]:text-warning" data-testid="recovery-once">
          <ShieldAlertIcon aria-hidden />
          <AlertDescription className="text-foreground text-sm">{t('setup.recovery.once')}</AlertDescription>
        </Alert>
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
