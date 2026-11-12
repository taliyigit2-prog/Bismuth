// Step 3 — the hotel (G-10): name (required), country (holidays), city (weather), time zone, check-in and
// check-out times. Picking a country also picks its usual time zone.
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TimeInput } from '@/components/time-input'
import { useFormat } from '@/hooks/use-format'
import { describe } from './aria'
import { ids } from './draft'
import { Field } from './fields'
import { COUNTRY_ZONES, countryChoices, zoneChoices, zoneLabel } from './regions'
import type { StepProps } from './step-props'

export function HotelStep({ draft, update, errors }: StepProps) {
  const { t } = useTranslation()
  const f = useFormat()
  const hotel = draft.hotel
  const set = (patch: Partial<WizardHotel>): void =>
    update((d) => ({ ...d, hotel: { ...d.hotel, ...patch } }))
  // The zone is named the way the summary names it ("Orta Avrupa Saati (UTC+02:00)"); zones the platform gives one
  // name (Berlin, Paris, Rome…) also show their id so the list tells them apart.
  const labels = zoneChoices(hotel.timezone).map((zone) => ({ zone, label: zoneLabel(zone, f.locale) }))
  const zoneOptions = labels.map(({ zone, label }) => {
    const text = t('setup.hotel.timezoneOption', { zone: label.name, offset: label.offset })
    const twins = labels.filter((x) => x.label.name === label.name && x.label.offset === label.offset)
    return { zone, text: twins.length > 1 ? `${text} · ${zone}` : text }
  })
  return (
    <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
      <Field id={ids.hotelName} label={t('setup.hotel.name')} errors={errors} className="sm:col-span-2">
        <Input
          id={ids.hotelName}
          value={hotel.name}
          maxLength={80}
          autoComplete="organization"
          placeholder={t('setup.hotel.namePlaceholder')}
          onChange={(e) => set({ name: e.target.value })}
          data-testid={ids.hotelName}
          {...describe(ids.hotelName, errors)}
        />
      </Field>
      <Field
        id="setup-country"
        label={t('setup.hotel.country')}
        errors={errors}
        hint={t('setup.hotel.countryHint')}
      >
        <Select
          value={hotel.country}
          onValueChange={(country) => set({ country, timezone: COUNTRY_ZONES[country] ?? hotel.timezone })}
        >
          <SelectTrigger
            id="setup-country"
            className="w-full"
            aria-describedby="setup-country-hint"
            data-testid="setup-country"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {countryChoices(hotel.country, f.locale).map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field
        id={ids.hotelCity}
        label={t('setup.hotel.city')}
        errors={errors}
        hint={t('setup.hotel.cityHint')}
      >
        <Input
          id={ids.hotelCity}
          value={hotel.city}
          maxLength={80}
          autoComplete="address-level2"
          placeholder={t('setup.hotel.sampleCity')}
          onChange={(e) => set({ city: e.target.value })}
          data-testid={ids.hotelCity}
          {...describe(ids.hotelCity, errors, true)}
        />
      </Field>
      <Field id="setup-timezone" label={t('setup.hotel.timezone')} errors={errors} className="sm:col-span-2">
        <Select value={hotel.timezone} onValueChange={(timezone) => set({ timezone })}>
          <SelectTrigger id="setup-timezone" className="w-full" dir="ltr" data-testid="setup-timezone">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {zoneOptions.map(({ zone, text }) => (
              <SelectItem key={zone} value={zone} dir="ltr">
                {text}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id={ids.checkIn} label={t('setup.calendar.checkIn')} errors={errors}>
        <TimeInput
          id={ids.checkIn}
          value={hotel.checkinTime}
          onChange={(v) => set({ checkinTime: v })}
          data-testid={ids.checkIn}
          {...describe(ids.checkIn, errors)}
        />
      </Field>
      <Field
        id={ids.checkOut}
        label={t('setup.calendar.checkOut')}
        errors={errors}
        hint={t('setup.hotel.timesHint')}
      >
        <TimeInput
          id={ids.checkOut}
          value={hotel.checkoutTime}
          onChange={(v) => set({ checkoutTime: v })}
          data-testid={ids.checkOut}
          {...describe(ids.checkOut, errors, true)}
        />
      </Field>
    </div>
  )
}

type WizardHotel = StepProps['draft']['hotel']
