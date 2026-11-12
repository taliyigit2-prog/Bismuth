import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { MonitorIcon, MoonIcon, PaletteIcon, SunIcon } from 'lucide-react'
import { toast } from 'sonner'
import { STATUS_KEYS } from '@shared/contract'
import { money } from '@shared/money'
import { formatMoney, isAppLocale } from '@shared/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Page } from '@/components/page'
import { useSettings, useUpdateSettings } from '@/lib/api/hooks'
import { STATUS_FILL } from '@/lib/status-style'
import { cn } from '@/lib/utils'
import { useCan } from '@/lib/view-as'
import { ComponentGallery } from './component-gallery'
import { AccentCard, FontSizeSwitch } from './theme-editor'

const THEMES = [
  { value: 'light', key: 'settings.themeLight', icon: SunIcon },
  { value: 'dark', key: 'settings.themeDark', icon: MoonIcon },
  { value: 'system', key: 'settings.themeSystem', icon: MonitorIcon }
] as const

/** Light / dark / like the computer, right here: the same setting as Ayarlar → Görünüm. */
function ThemeSwitch() {
  const { t } = useTranslation()
  const settings = useSettings()
  const update = useUpdateSettings()
  const theme = settings.data?.['ui.theme'] ?? 'system'
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={1}
      value={theme}
      onValueChange={(v) => {
        if (v === 'light' || v === 'dark' || v === 'system')
          update.mutate({ 'ui.theme': v }, { onError: () => toast.error(t('settings.saveFailed')) })
      }}
      aria-label={t('settings.theme')}
      className="max-md:w-full max-md:flex-nowrap max-md:overflow-x-auto"
      data-testid="theme-switch"
    >
      {THEMES.map(({ value, key, icon: Icon }) => (
        <ToggleGroupItem key={value} value={value} className="gap-1.5 max-md:min-h-11 max-md:grow">
          <Icon aria-hidden />
          {t(key)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

// Theme preview and editor (faz-01 madde 7, faz-03 madde 2, faz-15 madde 5–6): light / dark / like the computer,
// the person's text size, the hotel's accent colour per theme, the status colours (edited in Ayarlar → Durum
// etiketleri, one link away), every component and sample text in three languages — all live.
export function ThemePreviewPage() {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const can = useCan()
  const locale = isAppLocale(i18n.language) ? i18n.language : 'tr'
  const price = formatMoney(money(250_000, 'TRY'), locale, {
    showMinor: settings.data?.['ui.showMinor'] ?? false
  })

  return (
    <Page
      title={t('themePreview.title')}
      description={t('themePreview.description')}
      actions={<ThemeSwitch />}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.fontSize')}</CardTitle>
          <CardDescription>{t('settings.fontSizeHelp')}</CardDescription>
        </CardHeader>
        <CardContent>
          <FontSizeSwitch />
        </CardContent>
      </Card>
      {settings.data ? <AccentCard values={settings.data} /> : null}
      <Card>
        <CardHeader>
          <CardTitle>{t('themePreview.buttons')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button>{t('themePreview.primary')}</Button>
          <Button variant="secondary">{t('common.cancel')}</Button>
          <Button variant="outline">{t('themePreview.outline')}</Button>
          <Button variant="destructive">{t('themePreview.destructive')}</Button>
          <Badge>{t('nav.today')}</Badge>
          <Badge variant="secondary">{t('nav.calendar')}</Badge>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('themePreview.statuses')}</CardTitle>
          <CardDescription>{t('themePreview.statusesHelp')}</CardDescription>
          {can('settings.colors') ? (
            <Button variant="link" className="h-auto justify-self-start p-0 max-md:min-h-11" asChild>
              <Link to="/settings" search={{ tab: 'tags' }} data-testid="edit-status-colors">
                <PaletteIcon aria-hidden />
                {t('themePreview.editStatusColors')}
              </Link>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {STATUS_KEYS.map((key, i) => {
            const sample = `${t('themePreview.sampleRoom', { room: 101 + i })} · ${t('themePreview.sampleGuest')} · ${price}`
            return (
              <div key={key} className="grid min-w-0 content-start gap-1.5 rounded-lg border p-2">
                {/* A calendar bar: the status colour with its own text colour, the status in words. */}
                <p
                  data-testid={`status-bar-${key}`}
                  className={cn(
                    'border-foreground/15 rounded-md border px-2 py-1.5 text-xs font-semibold break-words',
                    STATUS_FILL[key]
                  )}
                >
                  {t(`status.${key}`)} · <span className="tabular-nums">{101 + i}</span>
                </p>
                <p className="text-muted-foreground truncate text-xs" title={sample}>
                  {t('themePreview.sampleRoom', { room: 101 + i })} · {t('themePreview.sampleGuest')} ·{' '}
                  <bdi>{price}</bdi>
                </p>
              </div>
            )
          })}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('themePreview.texts')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <p className="text-xl font-semibold tracking-tight md:text-2xl">{t('themePreview.typeHeading')}</p>
          <p className="leading-snug font-semibold">{t('themePreview.typeCard')}</p>
          <p className="text-sm">{t('themePreview.typeBody')}</p>
          <p className="text-muted-foreground text-xs">{t('themePreview.typeHelp')}</p>
          <p className="text-sm break-words">{t('themePreview.longText')}</p>
        </CardContent>
      </Card>
      <ComponentGallery />
    </Page>
  )
}
