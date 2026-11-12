// Before and after of one audit row, field by field (G-24): the values are the JSON the service stored, shown the
// way the screens show them — field names in the UI language (audit.fieldName.*; others by their program name,
// quietly), nested records as paths ("Yetkiler › Personel kartları: Yok → Görür"), amounts as money, times as
// dates, permission levels by name. Changed fields are marked (colour + words); the bookkeeping times are never
// counted as a change. A record created or removed shows its one side only; a value the reader may not see (salary
// data, a hidden expense section) arrives as {hidden: true} and says so.
import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRightIcon, CircleDotIcon, EyeOffIcon } from 'lucide-react'
import { isLocalDate, localDateOf } from '@shared/date'
import { PERMISSION_LEVELS, type PermissionLevel } from '@shared/permissions'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSettings } from '@/lib/api/hooks'
import { cn } from '@/lib/utils'
import { fieldStepLabel, shortId } from './audit-labels'
import { currencyOf, diffOf, isHidden, isIsoTime, type DiffRow, type Fields } from './audit-values'

const isLevel = (v: unknown): v is PermissionLevel =>
  typeof v === 'string' && (PERMISSION_LEVELS as readonly string[]).includes(v)

function Value({
  value,
  path,
  record,
  base
}: {
  value: unknown
  path: readonly string[]
  record: Fields
  /** The hotel's base currency: amounts without a currency of their own are in it. */
  base: string
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const field = path.at(-1) ?? ''
  if (value === undefined || value === null) return <span className="text-muted-foreground">—</span>
  if (typeof value === 'boolean') return <>{value ? t('audit.yes') : t('audit.no')}</>
  if (isHidden(value)) return <span className="text-muted-foreground italic">{t('audit.hidden')}</span>
  if (path.at(-2) === 'permissions' && isLevel(value)) return <>{t(`permissions.level.${value}`)}</>
  if (typeof value === 'number') {
    if (/Minor$/.test(field) && Number.isInteger(value))
      return <bdi className="tabular-nums">{f.money(value, currencyOf(field, record, base))}</bdi>
    if (/Bp$/.test(field))
      return (
        <bdi className="tabular-nums">
          {f.percent(value, value % 100 === 0 ? 0 : value % 10 === 0 ? 1 : 2)}
        </bdi>
      )
    return <bdi className="tabular-nums">{String(value)}</bdi>
  }
  if (typeof value === 'string') {
    if (isIsoTime(value))
      return (
        <bdi className="tabular-nums" title={value}>
          {`${f.date(localDateOf(new Date(value)), 'medium')} ${f.time(value)}`}
        </bdi>
      )
    if (isLocalDate(value)) return <bdi className="tabular-nums">{f.date(value, 'medium')}</bdi>
    const short = shortId(value)
    return short === value ? (
      <bdi>{value}</bdi>
    ) : (
      <bdi className="font-mono text-xs" title={value}>
        {short}
      </bdi>
    )
  }
  if (Array.isArray(value) && value.every((v) => v === null || typeof v !== 'object'))
    return <bdi>{value.map(String).join(', ')}</bdi>
  return <code className="font-mono text-xs">{JSON.stringify(value)}</code>
}

/** "Yetkiler › Personel kartları"; a step without a name shows its program name, quietly. */
function FieldName({ path }: { path: readonly string[] }) {
  const { t } = useTranslation()
  if (path.length === 0) return <span className="font-medium">{t('audit.value')}</span>
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 break-words" title={path.join('.')}>
      {path.map((step, i) => {
        const label = fieldStepLabel(t, path, i)
        return (
          <Fragment key={i}>
            {i ? (
              <ChevronRightIcon
                className="text-muted-foreground size-3 shrink-0 rtl:rotate-180"
                aria-hidden
              />
            ) : null}
            {label ? (
              <span className="font-medium">{label}</span>
            ) : (
              <span className="text-muted-foreground font-mono text-xs break-all">{step}</span>
            )}
          </Fragment>
        )
      })}
    </span>
  )
}

function Changed() {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium">
      <CircleDotIcon className="text-warning size-3.5" aria-hidden />
      {t('audit.changed')}
    </span>
  )
}

export function AuditDiff({ before, after }: { before: unknown; after: unknown }) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const base = useSettings().data?.['hotel.baseCurrency'] ?? 'TRY'
  const diff = diffOf(before, after)
  const changedCount = diff.kind === 'fields' ? diff.rows.filter((r) => r.changed).length : 0
  const [onlyChanged, setOnlyChanged] = useState(changedCount > 0)

  if (diff.kind === 'hidden')
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm" data-testid="audit-hidden">
        <EyeOffIcon className="size-4" aria-hidden />
        {t('audit.hidden')}
      </p>
    )
  if (diff.kind === 'empty') return <p className="text-muted-foreground text-sm">{t('audit.noValues')}</p>

  const rows =
    diff.kind === 'value' ? [diff.row] : onlyChanged ? diff.rows.filter((r) => r.changed) : diff.rows
  // A record added (or removed) has nothing to compare with: only its one side is shown.
  const { hasBefore, hasAfter } = diff
  const both = hasBefore && hasAfter
  const key = (r: DiffRow): string => r.path.join('\u0000')

  return (
    <div className="grid gap-3" data-testid="audit-diff">
      {changedCount > 0 ? (
        <Label className="min-h-6 font-normal max-md:min-h-11">
          <Checkbox
            checked={onlyChanged}
            onCheckedChange={(v) => setOnlyChanged(v === true)}
            data-testid="only-changed"
          />
          {t('audit.onlyChanged', { count: changedCount })}
        </Label>
      ) : null}
      {isMobile ? (
        <dl className="divide-y rounded-lg border">
          {rows.map((r) => (
            <div
              key={key(r)}
              className={cn('grid gap-1 p-3 text-sm', r.changed && 'bg-warning/15')}
              data-changed={r.changed || undefined}
              data-field={r.path.join('.')}
            >
              <dt className="flex flex-wrap items-center justify-between gap-2">
                <FieldName path={r.path} />
                {r.changed ? <Changed /> : null}
              </dt>
              {both ? (
                <dd className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 [overflow-wrap:anywhere]">
                  <span className="text-muted-foreground text-xs">{t('audit.before')}</span>
                  <span>
                    <Value value={r.before} path={r.path} record={r.beforeIn} base={base} />
                  </span>
                  <span className="text-muted-foreground text-xs">{t('audit.after')}</span>
                  <span>
                    <Value value={r.after} path={r.path} record={r.afterIn} base={base} />
                  </span>
                </dd>
              ) : (
                <dd className="[overflow-wrap:anywhere]">
                  {hasAfter ? (
                    <Value value={r.after} path={r.path} record={r.afterIn} base={base} />
                  ) : (
                    <Value value={r.before} path={r.path} record={r.beforeIn} base={base} />
                  )}
                </dd>
              )}
            </div>
          ))}
        </dl>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className={cn('px-3 py-2 text-start font-medium', both ? 'w-1/3' : 'w-2/5')}>
                  {t('audit.field')}
                </th>
                {hasBefore ? (
                  <th className="px-3 py-2 text-start font-medium" data-testid="audit-col-before">
                    {t('audit.before')}
                  </th>
                ) : null}
                {hasAfter ? (
                  <th className="px-3 py-2 text-start font-medium" data-testid="audit-col-after">
                    {t('audit.after')}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={key(r)}
                  className={cn('border-b align-top last:border-0', r.changed && 'bg-warning/15')}
                  data-changed={r.changed || undefined}
                  data-field={r.path.join('.')}
                >
                  <th scope="row" className="px-3 py-2 text-start font-normal">
                    <span className="grid gap-1">
                      <FieldName path={r.path} />
                      {r.changed ? <Changed /> : null}
                    </span>
                  </th>
                  {hasBefore ? (
                    <td className="px-3 py-2 [overflow-wrap:anywhere]">
                      <Value value={r.before} path={r.path} record={r.beforeIn} base={base} />
                    </td>
                  ) : null}
                  {hasAfter ? (
                    <td className="px-3 py-2 [overflow-wrap:anywhere]">
                      <Value value={r.after} path={r.path} record={r.afterIn} base={base} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
