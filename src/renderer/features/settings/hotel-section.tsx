// "Otel" (G-10, faz-04 madde 4): name, country (holidays), city (weather), e-mail (the weather service's contact,
// K-13), time zone, check-in/out times, the base
// currency and the currencies amount fields offer. One form, saved with Kaydet; only changed keys are written.
// The base currency cannot move once money is recorded: the service refuses with errors.baseCurrencyLocked.
// The common currencies are listed; any other ISO 4217 currency is added with the picker (at most
// MAX_ACCEPTED_CURRENCIES are accepted, the same cap the setting has); the focus moves to the new row, which the
// picker scrolls into view.
import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MAX_ACCEPTED_CURRENCIES,
  settingsShape,
  type SettingsPatch,
  type SettingsValues
} from '@shared/contract'
import { LOCALE_TAG, isAppLocale } from '@shared/format'
import { CurrencyPicker } from '@/components/currency-picker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TimeInput } from '@/components/time-input'
import { chipCurrencies, currencyName } from '@/lib/currencies'
import { useCan } from '@/lib/view-as'

/** Countries offered first (the hotel's guests and neighbours); the stored one is always listed too. */
const COUNTRIES = [
  'TR',
  'AZ',
  'BG',
  'CY',
  'DE',
  'ES',
  'FR',
  'GB',
  'GE',
  'GR',
  'IT',
  'KZ',
  'NL',
  'RU',
  'UA',
  'US'
]

interface Draft {
  name: string
  country: string
  city: string
  email: string
  timezone: string
  checkin: string
  checkout: string
  base: string
  currencies: string[]
}

type Field = keyof Draft
const FIELD_ID: Record<Field, string> = {
  name: 'hotel-name',
  country: 'hotel-country',
  city: 'hotel-city',
  email: 'hotel-email',
  timezone: 'hotel-timezone',
  checkin: 'hotel-checkin',
  checkout: 'hotel-checkout',
  base: 'hotel-base',
  currencies: 'hotel-currencies'
}

const currencyRowId = (code: string): string => `hotel-currency-row-${code}`

const draftOf = (v: SettingsValues): Draft => ({
  name: v['hotel.name'],
  country: v['hotel.country'],
  city: v['hotel.city'],
  email: v['hotel.email'],
  timezone: v['hotel.timezone'],
  checkin: v['hotel.checkinTime'],
  checkout: v['hotel.checkoutTime'],
  base: v['hotel.baseCurrency'],
  currencies: v['hotel.currencies']
})

function validate(d: Draft): Partial<Record<Field, true>> {
  const bad: Partial<Record<Field, true>> = {}
  if (!settingsShape['hotel.name'].safeParse(d.name).success) bad.name = true
  if (!settingsShape['hotel.city'].safeParse(d.city).success) bad.city = true
  if (!settingsShape['hotel.email'].safeParse(d.email).success) bad.email = true
  if (!settingsShape['hotel.checkinTime'].safeParse(d.checkin).success) bad.checkin = true
  if (!settingsShape['hotel.checkoutTime'].safeParse(d.checkout).success) bad.checkout = true
  if (d.currencies.length === 0) bad.currencies = true
  return bad
}

const same = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i])

function patchOf(d: Draft, v: SettingsValues): SettingsPatch {
  const patch: SettingsPatch = {}
  if (d.name.trim() !== v['hotel.name']) patch['hotel.name'] = d.name.trim()
  if (d.country !== v['hotel.country']) patch['hotel.country'] = d.country
  if (d.city.trim() !== v['hotel.city']) patch['hotel.city'] = d.city.trim()
  if (d.email.trim() !== v['hotel.email']) patch['hotel.email'] = d.email.trim()
  if (d.timezone !== v['hotel.timezone']) patch['hotel.timezone'] = d.timezone
  if (d.checkin !== v['hotel.checkinTime']) patch['hotel.checkinTime'] = d.checkin
  if (d.checkout !== v['hotel.checkoutTime']) patch['hotel.checkoutTime'] = d.checkout
  if (d.base !== v['hotel.baseCurrency']) patch['hotel.baseCurrency'] = d.base
  if (!same(d.currencies, v['hotel.currencies'])) patch['hotel.currencies'] = d.currencies
  return patch
}

function zones(current: string): string[] {
  let all: string[] = []
  try {
    all = Intl.supportedValuesOf('timeZone')
  } catch {
    all = []
  }
  return all.includes(current) ? all : [current, ...all]
}

export function HotelSection({
  values,
  onSave,
  pending
}: {
  values: SettingsValues
  onSave: (patch: SettingsPatch, announce?: boolean, onDone?: () => void) => void
  pending: boolean
}) {
  const { t, i18n } = useTranslation()
  const can = useCan()
  const canEdit = can('settings', 'edit')
  const lang = isAppLocale(i18n.language) ? i18n.language : 'tr'
  const tag = LOCALE_TAG[lang]
  const [draft, setDraft] = useState<Draft>(() => draftOf(values))
  const [errors, setErrors] = useState<Partial<Record<Field, true>>>({})
  const set = <K extends Field>(key: K, value: Draft[K]): void => {
    setDraft((d) => ({ ...d, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }
  const regions = useMemo(() => new Intl.DisplayNames([tag], { type: 'region' }), [tag])
  const countries = useMemo(() => {
    const codes = COUNTRIES.includes(draft.country) ? COUNTRIES : [draft.country, ...COUNTRIES]
    return codes
      .map((code) => ({ code, name: regions.of(code) ?? code }))
      .sort((a, b) => a.name.localeCompare(b.name, tag))
  }, [regions, tag, draft.country])
  const timeZones = useMemo(() => zones(draft.timezone), [draft.timezone])
  // Added with the picker and switched off again: still listed until the page is left.
  const [added, setAdded] = useState<string[]>([])
  const currencies = chipCurrencies(values['hotel.currencies'], [values['hotel.baseCurrency']], added)
  const full = draft.currencies.length >= MAX_ACCEPTED_CURRENCIES
  const blocked = (code: string): boolean => full && !draft.currencies.includes(code)
  const patch = patchOf(draft, values)
  const dirty = Object.keys(patch).length > 0

  const toggleCurrency = (code: string, on: boolean): void =>
    set(
      'currencies',
      on
        ? currencies.filter((c) => c === code || draft.currencies.includes(c))
        : draft.currencies.filter((c) => c !== code)
    )
  const addCurrency = (code: string): void => {
    setAdded((a) => (a.includes(code) ? a : [...a, code]))
    set('currencies', draft.currencies.includes(code) ? draft.currencies : [...draft.currencies, code])
  }
  const pickBase = (code: string): void => {
    set('base', code)
    // The base currency is always accepted.
    if (!draft.currencies.includes(code))
      set(
        'currencies',
        currencies.filter((c) => c === code || draft.currencies.includes(c))
      )
  }

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const bad = validate(draft)
    setErrors(bad)
    const first = (Object.keys(FIELD_ID) as Field[]).find((key) => bad[key])
    if (first) {
      document.getElementById(FIELD_ID[first])?.focus()
      return
    }
    if (dirty) onSave(patch, true)
  }
  const reset = (): void => {
    setDraft(draftOf(values))
    setErrors({})
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="max-md:sr-only">{t('settings.hotel.title')}</CardTitle>
        <CardDescription>{t('settings.hotel.help')}</CardDescription>
      </CardHeader>
      <form onSubmit={submit} noValidate>
        <fieldset disabled={!canEdit} className="contents">
          <CardContent className="grid gap-5 md:grid-cols-2">
            <div className="grid content-start gap-2 md:col-span-2">
              <Label htmlFor={FIELD_ID.name}>{t('settings.hotelName')}</Label>
              <Input
                id={FIELD_ID.name}
                value={draft.name}
                maxLength={80}
                autoComplete="organization"
                aria-invalid={errors.name || undefined}
                aria-describedby="hotel-name-help"
                onChange={(e) => set('name', e.target.value)}
              />
              {errors.name ? (
                <p
                  id="hotel-name-help"
                  className="text-destructive text-sm"
                  role="alert"
                  data-testid="hotel-name-error"
                >
                  {t('settings.hotelNameInvalid')}
                </p>
              ) : (
                <CardDescription id="hotel-name-help">{t('settings.hotelNameHelp')}</CardDescription>
              )}
            </div>

            <div className="grid content-start gap-2">
              <Label htmlFor={FIELD_ID.country}>{t('settings.hotel.country')}</Label>
              <Select value={draft.country} onValueChange={(v) => set('country', v)}>
                <SelectTrigger id={FIELD_ID.country} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {countries.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <CardDescription>{t('settings.hotel.countryHelp')}</CardDescription>
            </div>

            <div className="grid content-start gap-2">
              <Label htmlFor={FIELD_ID.city}>{t('settings.hotel.city')}</Label>
              <Input
                id={FIELD_ID.city}
                value={draft.city}
                maxLength={80}
                autoComplete="address-level2"
                aria-invalid={errors.city || undefined}
                onChange={(e) => set('city', e.target.value)}
              />
              <CardDescription>{t('settings.hotel.cityHelp')}</CardDescription>
            </div>

            <div className="grid content-start gap-2">
              <Label htmlFor={FIELD_ID.email}>{t('settings.hotel.email')}</Label>
              <Input
                id={FIELD_ID.email}
                type="email"
                dir="ltr"
                value={draft.email}
                maxLength={120}
                autoComplete="email"
                inputMode="email"
                placeholder={t('settings.hotel.emailPlaceholder')}
                aria-invalid={errors.email || undefined}
                aria-describedby="hotel-email-help"
                onChange={(e) => set('email', e.target.value)}
                data-testid="hotel-email"
              />
              {errors.email ? (
                <p
                  id="hotel-email-help"
                  className="text-destructive text-sm"
                  role="alert"
                  data-testid="hotel-email-error"
                >
                  {t('settings.hotel.emailInvalid')}
                </p>
              ) : (
                <CardDescription id="hotel-email-help">{t('settings.hotel.emailHelp')}</CardDescription>
              )}
            </div>

            <div className="grid content-start gap-2">
              <Label htmlFor={FIELD_ID.timezone}>{t('settings.hotel.timezone')}</Label>
              <Select value={draft.timezone} onValueChange={(v) => set('timezone', v)}>
                <SelectTrigger id={FIELD_ID.timezone} className="w-full" dir="ltr">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeZones.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone.replaceAll('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 content-start gap-3">
              <div className="grid content-start gap-2">
                <Label htmlFor={FIELD_ID.checkin}>{t('settings.hotel.checkin')}</Label>
                <TimeInput
                  id={FIELD_ID.checkin}
                  value={draft.checkin}
                  aria-invalid={errors.checkin || undefined}
                  onChange={(v) => set('checkin', v)}
                />
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor={FIELD_ID.checkout}>{t('settings.hotel.checkout')}</Label>
                <TimeInput
                  id={FIELD_ID.checkout}
                  value={draft.checkout}
                  aria-invalid={errors.checkout || undefined}
                  onChange={(v) => set('checkout', v)}
                />
              </div>
              {errors.checkin || errors.checkout ? (
                <p className="text-destructive col-span-2 text-sm" role="alert">
                  {t('settings.timeInvalid')}
                </p>
              ) : (
                <CardDescription className="col-span-2">{t('settings.hotel.checkoutHelp')}</CardDescription>
              )}
            </div>

            <div className="grid content-start gap-2">
              <Label htmlFor={FIELD_ID.base}>{t('settings.hotel.baseCurrency')}</Label>
              <Select value={draft.base} onValueChange={pickBase}>
                <SelectTrigger id={FIELD_ID.base} className="w-full" data-testid="base-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((code) => (
                    <SelectItem key={code} value={code} disabled={blocked(code)}>
                      {code} · {currencyName(code, lang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <CardDescription>{t('settings.hotel.baseCurrencyHelp')}</CardDescription>
            </div>

            <div
              role="group"
              className="grid content-start gap-2 md:col-span-2"
              aria-labelledby={FIELD_ID.currencies}
              aria-describedby="hotel-currencies-help"
            >
              {/* The picker sits beside the heading (under it on the phone): always in sight. */}
              <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <span id={FIELD_ID.currencies} tabIndex={-1} className="text-sm font-medium">
                  {t('settings.hotel.currencies')}
                </span>
                <CurrencyPicker
                  hidden={currencies}
                  onPick={addCurrency}
                  chipId={currencyRowId}
                  limitReached={full}
                  testId="currency-add"
                  className="md:justify-items-end md:text-end"
                />
              </div>
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                {currencies.map((code) => (
                  <Label
                    key={code}
                    className="min-h-8 scroll-my-2 items-start py-1 leading-snug font-normal max-md:min-h-11"
                  >
                    <Checkbox
                      id={currencyRowId(code)}
                      className="mt-0.5"
                      checked={draft.currencies.includes(code)}
                      disabled={code === draft.base || blocked(code)}
                      onCheckedChange={(v) => toggleCurrency(code, v === true)}
                      data-testid={`currency-${code}`}
                    />
                    <span className="min-w-0">
                      <span className="font-medium">{code}</span>{' '}
                      <span className="text-muted-foreground">{currencyName(code, lang)}</span>
                    </span>
                  </Label>
                ))}
              </div>
              {errors.currencies ? (
                <p id="hotel-currencies-help" className="text-destructive text-sm" role="alert">
                  {t('settings.hotel.currenciesInvalid')}
                </p>
              ) : (
                <CardDescription id="hotel-currencies-help">
                  {t('settings.hotel.currenciesHelp')}
                </CardDescription>
              )}
            </div>
          </CardContent>
          <CardFooter className="mt-6 flex flex-wrap justify-end gap-2 max-md:[&>button]:flex-1">
            <Button type="button" variant="outline" disabled={!dirty} onClick={reset}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!dirty || pending} data-testid="hotel-save">
              {t('settings.save')}
            </Button>
          </CardFooter>
        </fieldset>
      </form>
    </Card>
  )
}
