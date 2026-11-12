// Theme editor parts (faz-15 madde 5, 6): the hotel's accent colour per theme (`settings.colors`, like the status
// colours: everyone sees it) and the text size each person picks for themselves (K-37). Colours never reach the
// page as inline styles: the swatches are classes over <style id="tag-colors"> (useTagStyles), the theme itself is
// <style id="user-theme"> (lib/theme). The owner sees at once whether a colour is hard to see on the theme's
// background.
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangleIcon, CheckIcon, RotateCcwIcon, TypeIcon } from 'lucide-react'
import { toast } from 'sonner'
import { THEME_MODES, type SettingsPatch, type SettingsValues, type ThemeMode } from '@shared/contract'
import { ACCENT_PRESETS, DEFAULT_ACCENT } from '@shared/color'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useSettings, useUpdateSettings } from '@/lib/api/hooks'
import { tagFill, useTagStyles } from '@/lib/status-style'
import { accentHardToSee } from '@/lib/theme/user-theme'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { ViewOnlyNote } from '@/features/settings/view-only'
import { FONT_SIZES, isFontSize } from './font-sizes'

const KEY: Record<ThemeMode, 'ui.accentColor' | 'ui.accentColorDark'> = {
  light: 'ui.accentColor',
  dark: 'ui.accentColorDark'
}

const swatchId = (theme: ThemeMode, id: string): string => `accent-${theme}-${id}`

/** One theme's accent: the colour picker (the swatch is the button), the ready colours and "back to Bismuth's". */
function AccentRow({
  theme,
  value,
  canEdit,
  onSave
}: {
  theme: ThemeMode
  value: string | null
  canEdit: boolean
  onSave: (color: string | null) => void
}) {
  const { t } = useTranslation()
  const current = value ?? DEFAULT_ACCENT[theme]
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The native picker reports every step of a drag: the last one is saved.
  const later = (color: string): void => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => onSave(color), 250)
  }
  const hard = accentHardToSee(current, theme)
  const legend = t(theme === 'dark' ? 'themePreview.accent.dark' : 'themePreview.accent.light')
  return (
    <fieldset
      className="grid min-w-0 content-start gap-3 rounded-lg border p-3"
      data-testid={`accent-${theme}`}
    >
      <legend className="px-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <label
          title={t('settings.pickColor', { name: legend })}
          className={cn(
            'has-focus-visible:ring-ring relative grid h-9 min-w-24 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md border px-3 text-sm font-medium has-focus-visible:ring-[3px] max-md:h-11',
            tagFill(swatchId(theme, 'current')),
            !canEdit && 'cursor-not-allowed opacity-60'
          )}
        >
          {t('themePreview.primary')}
          <input
            type="color"
            aria-label={t('settings.pickColor', { name: legend })}
            disabled={!canEdit}
            value={current}
            onChange={(e) => later(e.target.value)}
            data-testid={`accent-picker-${theme}`}
            className="absolute -inset-px size-[calc(100%+2px)] cursor-pointer opacity-0 disabled:cursor-not-allowed"
          />
        </label>
        <ul className="flex flex-wrap gap-1.5" aria-label={t('themePreview.accent.presets')}>
          {ACCENT_PRESETS.map((p) => {
            const color = p[theme]
            const selected = value === color
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={!canEdit}
                  aria-pressed={selected}
                  aria-label={t(`themePreview.accent.preset.${p.id}`)}
                  title={t(`themePreview.accent.preset.${p.id}`)}
                  onClick={() => onSave(color)}
                  data-testid={`accent-preset-${theme}-${p.id}`}
                  className={cn(
                    'focus-visible:ring-ring grid size-7 place-items-center rounded-full border outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 max-md:size-11',
                    tagFill(swatchId(theme, p.id))
                  )}
                >
                  {selected ? <CheckIcon className="size-4" aria-hidden /> : null}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!canEdit || value === null}
          onClick={() => onSave(null)}
          data-testid={`accent-reset-${theme}`}
        >
          <RotateCcwIcon aria-hidden />
          {t('themePreview.accent.reset')}
        </Button>
        {hard ? (
          <Badge
            variant="outline"
            className="border-warning text-foreground gap-1 font-normal whitespace-normal"
            data-testid={`accent-hard-${theme}`}
          >
            <AlertTriangleIcon aria-hidden />
            {t('themePreview.accent.hardToSee')}
          </Badge>
        ) : null}
      </div>
    </fieldset>
  )
}

/** "Vurgu rengi": the hotel's accent for each theme (Sahip/Müdür with `settings.colors`). */
export function AccentCard({ values }: { values: SettingsValues }) {
  const { t } = useTranslation()
  const can = useCan()
  const canEdit = can('settings.colors', 'edit')
  const update = useUpdateSettings()
  const save = (patch: SettingsPatch): void =>
    update.mutate(patch, {
      onSuccess: () => toast.success(t('settings.saved')),
      onError: () => toast.error(t('settings.saveFailed'))
    })
  useTagStyles([
    { id: swatchId('light', 'current'), color: values['ui.accentColor'] ?? DEFAULT_ACCENT.light },
    { id: swatchId('dark', 'current'), color: values['ui.accentColorDark'] ?? DEFAULT_ACCENT.dark },
    ...ACCENT_PRESETS.flatMap((p) => [
      { id: swatchId('light', p.id), color: p.light },
      { id: swatchId('dark', p.id), color: p.dark }
    ])
  ])
  return (
    <Card data-testid="accent-card">
      <CardHeader>
        <CardTitle>{t('themePreview.accent.title')}</CardTitle>
        <CardDescription>{t('themePreview.accent.help')}</CardDescription>
        {canEdit ? null : <ViewOnlyNote />}
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {THEME_MODES.map((theme) => (
          <AccentRow
            key={theme}
            theme={theme}
            value={values[KEY[theme]]}
            canEdit={canEdit}
            onSave={(color) => save({ [KEY[theme]]: color })}
          />
        ))}
      </CardContent>
    </Card>
  )
}

/** Büyük yazı (faz-15 madde 5): each person's own text size, at once on every screen. */
export function FontSizeSwitch({ className }: { className?: string }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const update = useUpdateSettings()
  const size = settings.data?.['ui.fontSize'] ?? 'normal'
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={1}
      value={size}
      onValueChange={(v) => {
        if (isFontSize(v))
          update.mutate({ 'ui.fontSize': v }, { onError: () => toast.error(t('settings.saveFailed')) })
      }}
      aria-label={t('settings.fontSize')}
      className={cn('flex-wrap max-md:w-full', className)}
      data-testid="font-size-switch"
    >
      {FONT_SIZES.map(({ value, key }) => (
        <ToggleGroupItem key={value} value={value} className="gap-1.5 max-md:min-h-11 max-md:grow">
          <TypeIcon
            aria-hidden
            className={value === 'normal' ? 'size-3.5' : value === 'large' ? 'size-4' : 'size-5'}
          />
          {t(key)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
