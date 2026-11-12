// Bayram denetimi (G-16, K-04): the religious feasts are calculated offline and can be a day off; once a year (or
// on demand) the announced dates are read from the internet. Only rows the program made move; a day someone edited
// stays and the difference is shown. Next to Döviz and Hava because all three need the internet and work without it.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarCheckIcon, SearchCheckIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { HolidayCheckResult } from '@shared/contract/external'
import { localDate, today } from '@shared/date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { SectionCard } from '@/components/section-card'
import { ErrorState, LoadingState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation, useApiQuery, useSettings, useUpdateSettings } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { useErrorToast } from './use-error-toast'
import { useWhen } from './use-when'

const OUTCOME_VARIANT = { moved: 'default', confirmed: 'secondary', userKept: 'outline' } as const

function Range({ dates }: { dates: readonly string[] }) {
  const f = useFormat()
  const first = dates[0]
  const last = dates.at(-1)
  if (!first || !last) return null
  return (
    <bdi className="tabular-nums">
      {first === last
        ? f.dayMonth(localDate(first))
        : `${f.dayMonth(localDate(first))} – ${f.dayMonth(localDate(last))}`}
    </bdi>
  )
}

function ResultView({ result }: { result: HolidayCheckResult }) {
  const { t } = useTranslation()
  const f = useFormat()
  const when = useWhen()
  return (
    <div className="grid gap-2" data-testid={`holiday-result-${result.year}`}>
      <p className="text-muted-foreground text-xs">
        {result.source
          ? t('holidayCheck.checkedAt', {
              year: result.year,
              when: when(result.checkedAt),
              source: t(`holidayCheck.source.${result.source}`)
            })
          : result.skipped
            ? t('holidayCheck.skipped', { year: result.year })
            : t('holidayCheck.failed', { year: result.year })}
      </p>
      {result.source && result.diffs.length === 0 ? (
        <p className="text-sm">{t('holidayCheck.nothing')}</p>
      ) : null}
      <ul className="grid gap-2">
        {result.diffs.map((d) => (
          <li key={d.groupKey} className="grid gap-1 rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 basis-40 font-medium">
                {d.groupKey.startsWith('kurban')
                  ? t('holidayCheck.feast.kurban')
                  : d.groupKey.startsWith('ramazan')
                    ? t('holidayCheck.feast.ramazan')
                    : f.name(d.title)}
              </span>
              {d.tentative ? <Badge variant="outline">{t('holidayCheck.tentative')}</Badge> : null}
              <Badge variant={OUTCOME_VARIANT[d.outcome]}>{t(`holidayCheck.outcome.${d.outcome}`)}</Badge>
            </div>
            <p className="text-muted-foreground text-xs">
              {d.outcome === 'confirmed' ? (
                <Range dates={d.after} />
              ) : (
                <>
                  {t('holidayCheck.calendar')} <Range dates={d.before} /> · {t('holidayCheck.announced')}{' '}
                  <Range dates={d.after} />
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function HolidayCheckTab() {
  const { t } = useTranslation()
  const can = useCan()
  const settings = useSettings()
  const update = useUpdateSettings()
  const failed = useErrorToast()
  const year = Number(today().slice(0, 4))
  const [picked, setPicked] = useState(String(year))
  const last = useApiQuery('holidays.lastChecks', {})
  const check = useApiMutation('holidays.check', {
    invalidates: ['holidays.lastChecks', 'calendar.days'],
    onError: failed,
    onSuccess: (r) => {
      if (r.source)
        toast.success(t('holidayCheck.done', { count: r.diffs.filter((d) => d.outcome === 'moved').length }))
      else toast.warning(r.skipped ? t('holidayCheck.offline') : t('holidayCheck.unreachable'))
    }
  })
  const online = settings.data?.['network.enabled'] ?? true
  return (
    <div className="grid gap-4">
      <SectionCard title={t('holidayCheck.title')} icon={CalendarCheckIcon} testId="holiday-check">
        <div className="grid gap-4">
          <p className="text-muted-foreground text-sm">{t('holidayCheck.description')}</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="holiday-year">{t('holidayCheck.year')}</Label>
              <Select value={picked} onValueChange={setPicked}>
                <SelectTrigger id="holiday-year" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[year, year + 1, year + 2].map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => check.mutate({ year: Number(picked) })}
              disabled={!online || check.isPending || !can('calendar.notes', 'edit')}
            >
              <SearchCheckIcon aria-hidden />
              {t('holidayCheck.run')}
            </Button>
          </div>
          {!online ? <p className="text-warning text-xs">{t('holidayCheck.offline')}</p> : null}
          <Label className="flex min-h-9 items-start gap-3 font-normal max-md:min-h-11">
            <Switch
              className="mt-0.5"
              checked={settings.data?.['holidays.onlineCheck'] ?? true}
              disabled={!can('settings', 'edit') || update.isPending}
              onCheckedChange={(v) => update.mutate({ 'holidays.onlineCheck': v }, { onError: failed })}
            />
            <span className="grid gap-0.5">
              <span>{t('holidayCheck.yearly')}</span>
              <span className="text-muted-foreground text-xs">{t('holidayCheck.yearlyHelp')}</span>
            </span>
          </Label>
        </div>
      </SectionCard>
      <SectionCard title={t('holidayCheck.results')} icon={CalendarCheckIcon} testId="holiday-results">
        {last.isPending ? (
          <LoadingState />
        ) : last.isError ? (
          <ErrorState error={last.error} onRetry={() => void last.refetch()} />
        ) : last.data.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('holidayCheck.none')}</p>
        ) : (
          <div className="grid gap-4">
            {[...last.data]
              .sort((a, b) => a.year - b.year)
              .map((r) => (
                <ResultView key={r.year} result={r} />
              ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
