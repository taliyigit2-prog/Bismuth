// "Genel" → Görünüm (G-17, faz-15 madde 5–6): theme, density, text size and whether amounts show decimals.
// Everyone's own choice (K-37); the hotel's colours are a link away (Tema önizleme, `settings.colors`).
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import type { SettingsPatch, SettingsValues } from '@shared/contract'
import { money } from '@shared/money'
import { formatMoney, isAppLocale } from '@shared/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { Link } from '@tanstack/react-router'
import { PaletteIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCan } from '@/lib/view-as'
import { FONT_SIZES } from '@/features/theme-preview/font-sizes'
import { useIsMobile } from '@/hooks/use-mobile'
import { ZOOM_STEPS } from '@shared/window-zoom'

interface Props {
  values: SettingsValues
  onSave: (patch: SettingsPatch) => void
}

const THEMES = [
  { value: 'light', key: 'settings.themeLight' },
  { value: 'dark', key: 'settings.themeDark' },
  { value: 'system', key: 'settings.themeSystem' }
] as const

const DENSITIES = [
  { value: 'comfortable', key: 'settings.densityComfortable' },
  { value: 'compact', key: 'settings.densityCompact' }
] as const

export function AppearanceSection({ values, onSave }: Props) {
  const { t, i18n } = useTranslation()
  const can = useCan()
  // Page zoom belongs to the computer's own window; a phone's browser has its own.
  const isMobile = useIsMobile()
  // Ctrl +/-/0 and the View menu change the zoom in the main process; the page only sees its window resize. Read the
  // saved value again then, so the selection here follows the key.
  const queryClient = useQueryClient()
  useEffect(() => {
    if (isMobile) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const onResize = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: ['settings.get'] }), 300)
    }
    window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [isMobile, queryClient])
  const locale = isAppLocale(i18n.language) ? i18n.language : 'tr'
  // The hotel's own currency: the sample looks like the amounts the person will see.
  const sample = money(250_000, values['hotel.baseCurrency'])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.sectionAppearance')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-medium">{t('settings.theme')}</legend>
          <RadioGroup
            className="content-start max-md:gap-1"
            value={values['ui.theme']}
            onValueChange={(v) => {
              if (v === 'light' || v === 'dark' || v === 'system') onSave({ 'ui.theme': v })
            }}
          >
            {THEMES.map((o) => (
              <Label
                key={o.value}
                htmlFor={`theme-${o.value}`}
                className="min-h-6 font-normal max-md:min-h-11"
              >
                <RadioGroupItem id={`theme-${o.value}`} value={o.value} data-testid={`theme-${o.value}`} />
                {t(o.key)}
              </Label>
            ))}
          </RadioGroup>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-medium">{t('settings.density')}</legend>
          <RadioGroup
            className="content-start max-md:gap-1"
            value={values['ui.density']}
            onValueChange={(v) => {
              if (v === 'comfortable' || v === 'compact') onSave({ 'ui.density': v })
            }}
          >
            {DENSITIES.map((o) => (
              <Label
                key={o.value}
                htmlFor={`density-${o.value}`}
                className="min-h-6 font-normal max-md:min-h-11"
              >
                <RadioGroupItem id={`density-${o.value}`} value={o.value} />
                {t(o.key)}
              </Label>
            ))}
          </RadioGroup>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-medium">{t('settings.fontSize')}</legend>
          <RadioGroup
            className="content-start max-md:gap-1"
            value={values['ui.fontSize']}
            onValueChange={(v) => {
              if (v === 'normal' || v === 'large' || v === 'larger') onSave({ 'ui.fontSize': v })
            }}
          >
            {FONT_SIZES.map((o) => (
              <Label
                key={o.value}
                htmlFor={`font-size-${o.value}`}
                className="min-h-6 font-normal max-md:min-h-11"
              >
                <RadioGroupItem id={`font-size-${o.value}`} value={o.value} />
                {t(o.key)}
              </Label>
            ))}
          </RadioGroup>
          <CardDescription>{t('settings.fontSizeHelp')}</CardDescription>
        </fieldset>

        {isMobile ? null : (
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-medium">{t('settings.zoom')}</legend>
            <RadioGroup
              className="content-start max-md:gap-1"
              value={String(values['ui.zoom'])}
              onValueChange={(v) => {
                const percent = Number(v)
                if (ZOOM_STEPS.some((z) => z === percent)) onSave({ 'ui.zoom': percent })
              }}
            >
              {ZOOM_STEPS.map((z) => (
                <Label key={z} htmlFor={`zoom-${z}`} className="min-h-6 font-normal">
                  <RadioGroupItem id={`zoom-${z}`} value={String(z)} data-testid={`zoom-${z}`} />
                  <bdi>{t('settings.zoomValue', { percent: z })}</bdi>
                </Label>
              ))}
            </RadioGroup>
            <CardDescription>{t('settings.zoomHelp')}</CardDescription>
          </fieldset>
        )}

        {can('settings.colors') ? (
          <div className="grid content-start gap-2">
            <p className="text-sm font-medium">{t('settings.colorsTitle')}</p>
            <CardDescription>{t('settings.colorsHelp')}</CardDescription>
            <Button variant="outline" className="justify-self-start" asChild>
              <Link to="/theme-preview" data-testid="open-theme-preview">
                <PaletteIcon aria-hidden />
                {t('settings.openThemePreview')}
              </Link>
            </Button>
          </div>
        ) : null}

        <div className="flex items-start justify-between gap-4 md:col-span-2">
          <div className="grid gap-1">
            <Label htmlFor="show-minor">{t('settings.showMinor')}</Label>
            <CardDescription>{t('settings.showMinorHelp')}</CardDescription>
            <p className="text-sm">
              {t('settings.moneyPreview')}{' '}
              <bdi className="font-medium tabular-nums" data-testid="money-preview">
                {formatMoney(sample, locale, { showMinor: values['ui.showMinor'] })}
              </bdi>
            </p>
          </div>
          <Switch
            className="relative max-md:after:absolute max-md:after:-inset-x-2 max-md:after:-inset-y-[14px]"
            id="show-minor"
            checked={values['ui.showMinor']}
            onCheckedChange={(checked) => onSave({ 'ui.showMinor': checked })}
          />
        </div>
      </CardContent>
    </Card>
  )
}
