// Step 12 — summary (faz-04 madde 1.12): every answer in plain words, each part with "Düzenle" back to its step;
// what is still missing (hotel name, rooms, owner password after a restart) is marked. "Kurulumu bitir" is in the
// footer.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { PencilIcon } from 'lucide-react'
import { addDays, localDate } from '@shared/date'
import { LOCALE_TAG } from '@shared/format'
import { taskSuggestedIn } from '@shared/domain/task-country'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useFormat } from '@/hooks/use-format'
import { chosenTypes, localName, refKey, roomTotals } from './draft'
import { countryName, zoneLabel } from './regions'
import type { Step } from './steps'
import type { StepProps } from './step-props'

const MONDAY = localDate('2026-10-05')
const WEEK = [1, 2, 3, 4, 5, 6, 0] as const

function Section({
  step,
  goTo,
  children
}: {
  step: Exclude<Step, 'summary'>
  goTo: (step: Step) => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const title = t(`setup.step.${step}.title`)
  return (
    <section
      className="grid gap-2 rounded-lg border p-3"
      aria-label={title}
      data-testid={`setup-summary-${step}`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => goTo(step)}
          aria-label={t('setup.summary.editStep', { step: title })}
        >
          <PencilIcon aria-hidden />
          {t('setup.summary.edit')}
        </Button>
      </div>
      <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        {children}
      </dl>
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words max-sm:mb-1">{children}</dd>
    </>
  )
}

function Missing({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <Badge variant="outline" className="border-destructive text-destructive">
      {children ?? t('setup.summary.missing')}
    </Badge>
  )
}

export function SummaryStep({ draft, options, goTo }: StepProps) {
  const { t } = useTranslation()
  const f = useFormat()
  const list = new Intl.ListFormat(LOCALE_TAG[f.locale], { style: 'long', type: 'conjunction' })
  const join = (items: string[]): string => (items.length ? list.format(items) : t('setup.summary.none'))
  const onOff = (on: boolean): string => (on ? t('setup.summary.on') : t('setup.summary.off'))
  const base = draft.money.baseCurrency
  const money = (minor: number | null): string => (minor === null ? '' : f.money(minor, base))
  const types = chosenTypes(draft, options, f.locale)
  const totals = roomTotals(draft.rooms)
  const closed = draft.rooms.filter((r) => !r.sellable).length
  const listNames = (kind: 'paymentMethods' | 'salesChannels' | 'extraServices', own: string[]): string[] => [
    ...options[kind]
      .filter((row) => draft.lists[kind].includes(row.id))
      .map((row) => localName(f.locale, row.name, row.nameI18n)),
    ...own
  ]
  const methods = join(listNames('paymentMethods', draft.lists.customPaymentMethods))
  const channels = join(listNames('salesChannels', draft.lists.customSalesChannels))
  const services = join(listNames('extraServices', draft.lists.customExtraServices))
  const shiftNames = new Map(options.shifts.map((s) => [s.id, localName(f.locale, s.name, s.displayName)]))
  const roles = new Map(options.roles.map((r) => [r.id, localName(f.locale, r.name, r.displayName)]))
  const s = draft.staff
  const zone = zoneLabel(draft.hotel.timezone, f.locale)
  const priceOf = (key: string): { base: number | null; weekend: number | null } => {
    const picked = draft.roomTypes.selected.find((p) => refKey(p) === key)
    const own = draft.roomTypes.custom.find((c) => refKey(c) === key)
    const row = picked ?? own
    return { base: row?.basePriceMinor ?? null, weekend: row?.weekendPriceMinor ?? null }
  }
  const themeKey = {
    light: 'setup.language.themeLight',
    dark: 'setup.language.themeDark',
    system: 'setup.language.themeSystem'
  } as const

  return (
    <div className="grid gap-3" data-testid="setup-summary">
      <Section step="language" goTo={goTo}>
        <Row label={t('setup.language.language')}>{t(`language.${draft.language}`)}</Row>
        <Row label={t('setup.language.theme')}>{t(themeKey[draft.theme])}</Row>
      </Section>
      <Section step="mode" goTo={goTo}>
        <Row label={t('setup.step.mode.title')}>{t(`setup.mode.option.${draft.mode}.title`)}</Row>
      </Section>
      <Section step="hotel" goTo={goTo}>
        <Row label={t('setup.hotel.name')}>{draft.hotel.name.trim() || <Missing />}</Row>
        <Row label={t('setup.hotel.country')}>{countryName(draft.hotel.country, f.locale)}</Row>
        <Row label={t('setup.hotel.city')}>{draft.hotel.city.trim() || t('setup.summary.none')}</Row>
        <Row label={t('setup.hotel.timezone')}>
          <span title={draft.hotel.timezone} data-testid="setup-summary-timezone">
            {zone.offset
              ? t('setup.hotel.timezoneOption', { zone: zone.name, offset: zone.offset })
              : zone.name}
          </span>
        </Row>
        <Row label={t('setup.calendar.checkIn')}>
          <span dir="ltr">{draft.hotel.checkinTime}</span>
        </Row>
        <Row label={t('setup.calendar.checkOut')}>
          <span dir="ltr">{draft.hotel.checkoutTime}</span>
        </Row>
      </Section>
      <Section step="currencies" goTo={goTo}>
        <Row label={t('setup.hotel.baseCurrency')}>{base}</Row>
        <Row label={t('setup.hotel.currencies')}>{join([...new Set([base, ...draft.money.currencies])])}</Row>
      </Section>
      <Section step="roomTypes" goTo={goTo}>
        {types.length === 0 ? (
          <Row label={t('setup.step.roomTypes.title')}>
            <Missing />
          </Row>
        ) : (
          types.map((type) => {
            const price = priceOf(type.key)
            return (
              <Row key={type.key} label={type.label}>
                <bdi>
                  {price.base === null
                    ? t('setup.summary.noPrice')
                    : price.weekend === null
                      ? money(price.base)
                      : t('setup.summary.typePrices', {
                          base: money(price.base),
                          weekend: money(price.weekend)
                        })}
                </bdi>
              </Row>
            )
          })
        )}
      </Section>
      <Section step="rooms" goTo={goTo}>
        <Row label={t('common.total')}>
          {totals.rooms === 0 ? (
            <Missing />
          ) : (
            <span data-testid="setup-summary-totals">
              {t('setup.rooms.totals', {
                rooms: t('setup.rooms.roomCount', { count: totals.rooms }),
                beds: t('setup.rooms.bedCount', { count: totals.beds })
              })}
            </span>
          )}
        </Row>
        {types.map((type) => {
          const count = draft.rooms.filter((r) => r.roomType && refKey(r.roomType) === type.key).length
          return count > 0 ? (
            <Row key={type.key} label={type.label}>
              {t('setup.rooms.roomCount', { count })}
            </Row>
          ) : null
        })}
        {closed > 0 ? (
          <Row label={t('setup.rooms.sellable')}>{t('setup.summary.notSellable', { count: closed })}</Row>
        ) : null}
      </Section>
      <Section step="money" goTo={goTo}>
        <Row label={t('setup.money.methods')}>{methods}</Row>
        <Row label={t('setup.money.channels')}>{channels}</Row>
        <Row label={t('setup.money.services')}>{services}</Row>
      </Section>
      <Section step="staff" goTo={goTo}>
        <Row label={t('setup.staff.leaveDays')}>
          {t('setup.summary.leave', { count: Number(s.leaveDaysPerMonth) || 0 })}
        </Row>
        <Row label={t('setup.staff.unusedLeavePaid')}>{onOff(s.unusedLeavePaid)}</Row>
        <Row label={t('setup.staff.dailyDivisor')}>
          {s.divideByMonthDays
            ? t('setup.staff.dailyDivisorMode.days_in_month')
            : t('setup.summary.divisorDays', { count: Number(s.dailyDivisor) || 0 })}
        </Row>
        <Row label={t('setup.staff.standardHours')}>{s.standardHoursPerDay}</Row>
        <Row label={t('setup.staff.overtime')}>
          {t(`setup.staff.overtimeMode.${s.overtimeMode}`)}
          {s.overtimeMode === 'hourly_fixed' && s.overtimeHourlyMinor !== null ? (
            <bdi className="ms-2 font-medium">{money(s.overtimeHourlyMinor)}</bdi>
          ) : null}
          {s.overtimeMode === 'multiplier' ? (
            <span className="ms-2 font-medium" dir="ltr">
              {s.overtimeMultiplier}
            </span>
          ) : null}
        </Row>
        <Row label={t('setup.staff.holidayMultiplier')}>{s.holidayMultiplier}</Row>
        <Row label={t('setup.staff.commission')}>
          <span data-testid="setup-summary-commission">
            {t(`setup.staff.commissionMode.${s.commissionMode}`)}
            {s.commissionMode === 'pct' ? (
              <span className="ms-2 font-medium">
                {t('setup.summary.commissionPct', { pct: s.commissionPct.trim() })}
              </span>
            ) : null}
            {s.commissionMode === 'fixed' && s.commissionFixedMinor !== null ? (
              <bdi className="ms-2 font-medium">{money(s.commissionFixedMinor)}</bdi>
            ) : null}
          </span>
        </Row>
        <Row label={t('setup.staff.advanceFromDrawer')}>{onOff(s.advanceFromDrawer)}</Row>
        {draft.shifts.length === 0 ? (
          <Row label={t('setup.staff.shiftsTitle')}>{t('setup.summary.none')}</Row>
        ) : (
          draft.shifts.map((shift) => (
            <Row key={shift.key} label={shift.name ?? (shift.id ? (shiftNames.get(shift.id) ?? '') : '')}>
              <span dir="ltr">
                {t('setup.summary.shiftTime', { start: shift.startTime, end: shift.endTime })}
              </span>
            </Row>
          ))
        )}
        <Row label={t('setup.staff.tasksTitle')}>
          {t('setup.summary.tasks', { count: draft.tasks.suggestions.length })}
        </Row>
        <Row label={t('setup.staff.ownTasksTitle')}>
          <span data-testid="setup-summary-own-tasks">
            {join(draft.tasks.custom.map((task) => task.title.trim()))}
          </span>
        </Row>
        {options.taskTemplates.some(
          (task) => task.kind === 'legal' && taskSuggestedIn(task.code, draft.hotel.country)
        ) ? (
          <Row label={t('setup.staff.legal')}>{onOff(draft.tasks.legalReminders)}</Row>
        ) : null}
      </Section>
      <Section step="employees" goTo={goTo}>
        {draft.employees.length === 0 ? (
          <Row label={t('setup.step.employees.title')}>{t('setup.summary.noEmployees')}</Row>
        ) : (
          draft.employees.map((e) => (
            <Row
              key={e.key}
              label={[e.firstName, e.lastName].join(' ').trim() || t('setup.employees.unnamed')}
            >
              {e.hasAccount ? (
                <span className="flex flex-wrap gap-x-2">
                  <span dir="ltr">{e.username}</span>
                  <span className="text-muted-foreground">{roles.get(e.roleId)}</span>
                  {e.password ? null : <Missing>{t('setup.summary.passwordMissing')}</Missing>}
                </span>
              ) : (
                t('setup.summary.noAccount')
              )}
            </Row>
          ))
        )}
      </Section>
      <Section step="calendar" goTo={goTo}>
        <Row label={t('setup.calendar.highlight')}>
          {join(
            WEEK.flatMap((day, i) =>
              draft.calendar.highlightWeekdays.includes(day) ? [f.weekday(addDays(MONDAY, i), 'long')] : []
            )
          )}
        </Row>
        <Row label={t('setup.calendar.holidaysTitle')}>
          {draft.hotel.country === 'TR'
            ? countryName(draft.hotel.country, f.locale)
            : t('setup.summary.holidaysManual')}
        </Row>
        <Row label={t('setup.calendar.dayClosing')}>{onOff(draft.calendar.dayClosing)}</Row>
      </Section>
      <Section step="owner" goTo={goTo}>
        <Row label={t('setup.owner.name')}>{draft.owner.displayName.trim() || <Missing />}</Row>
        <Row label={t('setup.owner.username')}>
          {draft.owner.username.trim() ? <span dir="ltr">{draft.owner.username.trim()}</span> : <Missing />}
        </Row>
        <Row label={t('setup.owner.password')}>
          {draft.owner.password ? (
            t('setup.summary.passwordSet')
          ) : (
            <Missing>{t('setup.summary.passwordMissing')}</Missing>
          )}
        </Row>
        <Row label={t('setup.owner.pin')}>
          {draft.owner.pin ? t('setup.summary.pinSet') : t('setup.summary.none')}
        </Row>
      </Section>
    </div>
  )
}
