// Step 1 — language and theme (G-10, G-17): both apply at once (settings.set is open during setup).
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { APP_LOCALES, isAppLocale } from '@shared/format'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useUpdateSettings } from '@/lib/api/hooks'
import type { ApiError } from '@/lib/transport'
import type { Theme } from './draft'
import type { StepProps } from './step-props'

const THEMES = ['light', 'dark', 'system'] as const
const THEME_KEY = {
  light: 'setup.language.themeLight',
  dark: 'setup.language.themeDark',
  system: 'setup.language.themeSystem'
} as const

const isTheme = (v: string): v is Theme => (THEMES as readonly string[]).includes(v)

export function LanguageStep({ draft, update }: StepProps) {
  const { t } = useTranslation()
  const settings = useUpdateSettings()
  // A window switched to client mode may not write settings any more: say so instead of doing nothing.
  const onError = (error: ApiError): void => {
    toast.error(t(error.messageKey as 'errors.internal', { defaultValue: t('errors.internal') }))
  }
  return (
    <div className="grid gap-6">
      <fieldset className="grid gap-3">
        <legend className="mb-3 text-sm font-medium">{t('setup.language.language')}</legend>
        <RadioGroup
          value={draft.language}
          onValueChange={(v) => {
            if (!isAppLocale(v)) return
            update((d) => ({ ...d, language: v }))
            settings.mutate({ 'ui.language': v }, { onError })
          }}
          className="grid gap-3 sm:grid-cols-3"
        >
          {APP_LOCALES.map((lng) => (
            <Label
              key={lng}
              htmlFor={`setup-lang-${lng}`}
              lang={lng}
              className="has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent min-h-14 cursor-pointer rounded-xl border p-4 text-base"
            >
              <RadioGroupItem id={`setup-lang-${lng}`} value={lng} data-testid={`setup-lang-${lng}`} />
              {t(`language.${lng}`)}
            </Label>
          ))}
        </RadioGroup>
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="mb-3 text-sm font-medium">{t('setup.language.theme')}</legend>
        <RadioGroup
          value={draft.theme}
          onValueChange={(v) => {
            if (!isTheme(v)) return
            update((d) => ({ ...d, theme: v }))
            settings.mutate({ 'ui.theme': v }, { onError })
          }}
          className="grid gap-3 sm:grid-cols-3"
        >
          {THEMES.map((theme) => (
            <Label
              key={theme}
              htmlFor={`setup-theme-${theme}`}
              className="has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent min-h-11 cursor-pointer rounded-xl border px-4 py-3 font-normal"
            >
              <RadioGroupItem
                id={`setup-theme-${theme}`}
                value={theme}
                data-testid={`setup-theme-${theme}`}
              />
              {t(THEME_KEY[theme])}
            </Label>
          ))}
        </RadioGroup>
      </fieldset>
    </div>
  )
}
