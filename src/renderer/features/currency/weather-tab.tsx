// Hava (G-113, K-13): next to Döviz — the place, now, the next 24 hours hour by hour and the week. The place comes
// from the hotel's city (bundled list) or a point typed by hand; nothing is looked up online. Offline the last
// forecast stays with its age; with no forecast at all an empty state says why.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CloudSunIcon, MapPinIcon, RefreshCwIcon, WifiOffIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { WeatherView } from '@shared/contract/external'
import { CITIES, cityLabel, type City } from '@shared/domain/cities'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { QueryView } from '@/components/query-view'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { SectionCard } from '@/components/section-card'
import { EmptyState } from '@/components/states'
import { WeatherIcon } from '@/components/weather-icon'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation, useApiQuery, useSettings, useUpdateSettings } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { WeatherAge, WeatherAttribution, WeatherNow, WeatherWeek } from '../today/weather-card'
import { kmh, parseDegrees } from '../today/weather-model'
import { useErrorToast } from './use-error-toast'
import { useWhen } from './use-when'

/** "40,99 / 29,03" in the reader's number style. */
function useCoords(): (lat: number, lon: number) => string {
  const f = useFormat()
  return (lat, lon) => `${f.number(lat, 2)} / ${f.number(lon, 2)}`
}

function LocationDialog({
  open,
  onOpenChange,
  onSaved,
  view
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** The place changed: fetch its forecast. */
  onSaved: () => void
  view: WeatherView
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const settings = useSettings()
  const update = useUpdateSettings()
  const failed = useErrorToast()
  const cities = useMemo(() => [...CITIES].sort((a, b) => f.compare(cityLabel(a), cityLabel(b))), [f])
  const [mode, setMode] = useState<'city' | 'manual'>(view.location.from === 'manual' ? 'manual' : 'city')
  const [city, setCity] = useState<string>(view.location.from === 'manual' ? '' : (view.location.name ?? ''))
  const [lat, setLat] = useState(view.location.from === 'manual' ? f.number(view.location.lat, 2) : '')
  const [lon, setLon] = useState(view.location.from === 'manual' ? f.number(view.location.lon, 2) : '')
  const [tried, setTried] = useState(false)
  const latN = parseDegrees(lat, 90)
  const lonN = parseDegrees(lon, 180)
  const chosen: City | undefined = cities.find((c) => cityLabel(c) === city)
  const save = (): void => {
    setTried(true)
    if (mode === 'city' && !chosen) return
    if (mode === 'manual' && (latN === null || lonN === null)) return
    const patch =
      mode === 'city' && chosen
        ? {
            'hotel.city': chosen.province ? `${chosen.name}, ${chosen.province}` : chosen.name,
            'weather.location': null
          }
        : { 'weather.location': { lat: latN!, lon: lonN! } }
    update.mutate(patch, {
      onError: failed,
      onSuccess: () => {
        toast.success(t('weather.location.saved'))
        onSaved()
        onOpenChange(false)
      }
    })
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('weather.location.title')}
      description={t('weather.location.description')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="weather-location-form" disabled={update.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        id="weather-location-form"
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as 'city' | 'manual')}
          className="grid gap-2"
        >
          <Label className="flex min-h-9 items-center gap-2 font-normal max-md:min-h-11">
            <RadioGroupItem value="city" />
            {t('weather.location.fromList')}
          </Label>
          <Label className="flex min-h-9 items-center gap-2 font-normal max-md:min-h-11">
            <RadioGroupItem value="manual" />
            {t('weather.location.manual')}
          </Label>
        </RadioGroup>
        {mode === 'city' ? (
          <div className="grid gap-1.5">
            <Label htmlFor="weather-city">{t('weather.location.city')}</Label>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger
                id="weather-city"
                className="w-full"
                aria-invalid={(tried && !chosen) || undefined}
              >
                <SelectValue placeholder={t('weather.location.pick')} />
              </SelectTrigger>
              <SelectContent>
                {cities.map((c) => (
                  <SelectItem key={cityLabel(c)} value={cityLabel(c)}>
                    {cityLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tried && !chosen ? (
              <p className="text-destructive text-xs">{t('weather.location.pickError')}</p>
            ) : (
              <p className="text-muted-foreground text-xs">{t('weather.location.cityHelp')}</p>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="weather-lat">{t('weather.location.lat')}</Label>
              <Input
                id="weather-lat"
                dir="ltr"
                inputMode="decimal"
                autoComplete="off"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                aria-invalid={(tried && latN === null) || undefined}
                placeholder={f.number(40.99, 2)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="weather-lon">{t('weather.location.lon')}</Label>
              <Input
                id="weather-lon"
                dir="ltr"
                inputMode="decimal"
                autoComplete="off"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                aria-invalid={(tried && lonN === null) || undefined}
                placeholder={f.number(29.03, 2)}
              />
            </div>
            <p
              className={
                tried && (latN === null || lonN === null)
                  ? 'text-destructive text-xs sm:col-span-2'
                  : 'text-muted-foreground text-xs sm:col-span-2'
              }
            >
              {tried && (latN === null || lonN === null)
                ? t('weather.location.coordError')
                : t('weather.location.coordHelp')}
            </p>
          </div>
        )}
        <Label className="flex min-h-9 items-start gap-3 font-normal max-md:min-h-11">
          <Switch
            className="mt-0.5"
            checked={settings.data?.['weather.openMeteo'] ?? false}
            disabled={update.isPending}
            onCheckedChange={(v) =>
              update.mutate({ 'weather.openMeteo': v }, { onError: failed, onSuccess: onSaved })
            }
          />
          <span className="grid gap-0.5">
            <span>{t('weather.openMeteo')}</span>
            <span className="text-muted-foreground text-xs">{t('weather.openMeteoHelp')}</span>
          </span>
        </Label>
      </form>
    </ResponsiveDialog>
  )
}

function Hours({ forecast }: { forecast: NonNullable<WeatherView['forecast']> }) {
  const { t } = useTranslation()
  const f = useFormat()
  const hours = forecast.hours.slice(0, 24)
  if (hours.length === 0) return null
  return (
    <SectionCard title={t('weather.hours')} icon={CloudSunIcon} testId="weather-hours">
      {/* One row that scrolls sideways inside the card (never the page); keyboard-scrollable. */}
      <ol
        className="focus-visible:ring-ring -mx-4 flex gap-1 overflow-x-auto rounded-lg px-4 pb-2 outline-none focus-visible:ring-[3px]"
        tabIndex={0}
        aria-label={t('weather.hours')}
      >
        {hours.map((h) => (
          <li
            key={h.time}
            className="grid w-16 shrink-0 justify-items-center gap-0.5 rounded-lg px-1 py-2 text-center"
          >
            <span className="text-muted-foreground text-xs tabular-nums">{f.time(h.time)}</span>
            <WeatherIcon symbol={h.symbol ?? 'cloudy'} className="size-8" />
            <span className="text-sm font-semibold tabular-nums">
              {t('weather.temp', { value: Math.round(h.tempC) })}
            </span>
            <span
              className={h.precipMm > 0 ? 'text-info text-xs tabular-nums' : 'text-muted-foreground text-xs'}
            >
              {h.precipMm > 0 ? t('weather.rain', { mm: f.number(h.precipMm, 1) }) : '—'}
            </span>
            {h.windMs !== null ? (
              <span className="text-muted-foreground text-xs tabular-nums">
                {t('weather.windShort', { value: kmh(h.windMs) })}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </SectionCard>
  )
}

function WeatherDetail({ view }: { view: WeatherView }) {
  const { t } = useTranslation()
  const can = useCan()
  const when = useWhen()
  const coords = useCoords()
  const update = useUpdateSettings()
  const failed = useErrorToast()
  const [locating, setLocating] = useState(false)
  const canEdit = can('settings', 'edit')
  const refresh = useApiMutation('weather.refresh', {
    invalidates: ['weather.get'],
    onError: failed,
    onSuccess: (r) => {
      if (!r.ok && !r.skipped) toast.warning(t('weather.refreshFailed'))
    }
  })
  const place =
    view.location.from === 'manual'
      ? t('weather.location.manualAt', { coords: coords(view.location.lat, view.location.lon) })
      : view.location.from === 'default'
        ? t('weather.location.defaultAt', { place: view.location.name ?? '' })
        : (view.location.name ?? '')
  const forecast = view.forecast
  return (
    <div className="grid gap-4">
      <Card className="py-3" data-testid="weather-status">
        <CardContent className="grid gap-3 px-4 md:flex md:flex-wrap md:items-center md:gap-x-4 md:gap-y-2">
          <span className="flex min-w-0 items-start gap-2 text-sm md:items-center">
            <MapPinIcon className="text-muted-foreground mt-0.5 size-4 shrink-0 md:mt-0" aria-hidden />
            <span className="grid gap-x-2 md:flex md:flex-wrap">
              <span className="font-medium" data-testid="weather-place">
                {place}
              </span>
              <span className="text-muted-foreground">
                {view.fetchedAt ? t('weather.updated', { when: when(view.fetchedAt) }) : t('weather.never')}
              </span>
            </span>
            <WeatherAge view={view} />
          </span>
          <Label className="flex min-h-9 items-center gap-2 font-normal max-md:min-h-11 md:ms-auto">
            <Switch
              checked={view.enabled}
              disabled={!canEdit || update.isPending}
              onCheckedChange={(v) =>
                update.mutate(
                  { 'weather.enabled': v },
                  { onError: failed, onSuccess: () => refresh.mutate({}) }
                )
              }
            />
            {t('weather.show')}
          </Label>
          <div className="grid grid-cols-2 gap-2 md:flex">
            <Button
              variant="outline"
              size="sm"
              disabled={!view.networkEnabled || !view.enabled || refresh.isPending}
              onClick={() => refresh.mutate({})}
              className={!canEdit ? 'col-span-2' : undefined}
            >
              <RefreshCwIcon aria-hidden className={refresh.isPending ? 'animate-spin' : undefined} />
              {t('weather.refresh')}
            </Button>
            {canEdit ? (
              <Button size="sm" variant="outline" onClick={() => setLocating(true)}>
                <MapPinIcon aria-hidden />
                {t('weather.location.open')}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
      {!view.networkEnabled && view.enabled ? (
        <Alert className="border-warning/60" data-testid="weather-offline">
          <WifiOffIcon aria-hidden />
          <AlertTitle>{t('weather.offline.title')}</AlertTitle>
          <AlertDescription>
            {view.fetchedAt
              ? t('weather.offline.body', { when: when(view.fetchedAt) })
              : t('weather.offline.never')}
          </AlertDescription>
        </Alert>
      ) : null}
      {!view.enabled ? (
        <EmptyState icon={CloudSunIcon} title={t('weather.off.title')} body={t('weather.off.body')} />
      ) : !forecast ? (
        <EmptyState
          icon={CloudSunIcon}
          title={t('weather.empty.title')}
          body={
            view.otherLocation
              ? t('weather.empty.moved')
              : view.networkEnabled
                ? t('weather.empty.body')
                : t('weather.empty.offline')
          }
        />
      ) : (
        <>
          <SectionCard title={t('weather.now')} icon={CloudSunIcon} testId="weather-today">
            <div className="grid gap-4">
              <WeatherNow forecast={forecast} />
              <WeatherWeek days={forecast.days} />
            </div>
          </SectionCard>
          <Hours forecast={forecast} />
          <WeatherAttribution forecast={forecast} />
        </>
      )}
      {locating ? (
        <LocationDialog
          open={locating}
          onOpenChange={setLocating}
          onSaved={() => refresh.mutate({})}
          view={view}
        />
      ) : null}
    </div>
  )
}

export function WeatherTab() {
  const query = useApiQuery('weather.get', {}, { refetchInterval: 5 * 60_000 })
  return (
    <QueryView
      query={query}
      loading={
        <div role="status" aria-busy className="grid gap-4">
          <Skeleton className="h-14" aria-hidden />
          <Skeleton className="h-64" aria-hidden />
        </div>
      }
    >
      {(view) => <WeatherDetail view={view} />}
    </QueryView>
  )
}
