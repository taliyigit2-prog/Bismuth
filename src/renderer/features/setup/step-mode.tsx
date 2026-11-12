// Step 2 — how this computer works (faz-04 madde 1.2): alone, as the hotel's main computer, or as a client of
// another Bismuth. "İleri" saves the choice (setup.setMode); a client leaves the wizard for the connection screen.
import { useTranslation } from 'react-i18next'
import { InfoIcon } from 'lucide-react'
import { APP_MODES, type AppMode } from '@shared/contract'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { StepProps } from './step-props'

const isMode = (v: string): v is AppMode => (APP_MODES as readonly string[]).includes(v)

export function ModeStep({ draft, update }: StepProps) {
  const { t } = useTranslation()
  const note =
    draft.mode === 'client'
      ? t('setup.mode.clientNote')
      : draft.mode === 'host'
        ? t('setup.mode.hostNote')
        : null
  return (
    <div className="grid gap-4">
      <RadioGroup
        value={draft.mode}
        onValueChange={(v) => {
          if (isMode(v)) update((d) => ({ ...d, mode: v }))
        }}
        className="grid gap-3"
        aria-label={t('setup.step.mode.title')}
      >
        {APP_MODES.map((m) => (
          <Label
            key={m}
            htmlFor={`setup-mode-${m}`}
            className="has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent cursor-pointer items-start rounded-lg border p-3 font-normal"
          >
            <RadioGroupItem
              id={`setup-mode-${m}`}
              value={m}
              className="mt-0.5"
              data-testid={`setup-mode-${m}`}
            />
            <span className="grid gap-1">
              <span className="font-medium">{t(`setup.mode.option.${m}.title`)}</span>
              <span className="text-muted-foreground text-xs leading-snug">
                {t(`setup.mode.option.${m}.desc`)}
              </span>
            </span>
          </Label>
        ))}
      </RadioGroup>
      {note ? (
        <p className="text-muted-foreground flex items-start gap-2 text-sm" data-testid="setup-mode-note">
          <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {note}
        </p>
      ) : null}
    </div>
  )
}
