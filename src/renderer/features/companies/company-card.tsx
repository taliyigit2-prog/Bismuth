// Company / billing details (G-191): entered once, copied with one click into the owner's own invoice program
// (Bismuth issues no invoice, G-06). The copy text comes from the shared rule (company-copy.ts) with the field
// labels of the UI language; "alt alta" or "tek satır" as the invoice program likes it. A copy or a star moves
// the company up the list (favourites first, then the last used).
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2Icon, PencilIcon, StarIcon } from 'lucide-react'
import type { CopyFormat } from '@shared/contract/guests'
import type { CompanyViewDto } from '@shared/contract/procedures/guests'
import { companyCopyFields, formatCopyText, type CopyFieldKey } from '@shared/domain/company-copy'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CopyButton } from '@/components/copy-button'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { useAdminMutation } from '@/features/settings/use-admin'
import { COMPANY_READS, useCopyLabels } from './company-api'

const FORMATS = ['multi', 'single'] as const satisfies readonly CopyFormat[]
const LTR_FIELDS: ReadonlySet<CopyFieldKey> = new Set(['tax', 'phone', 'email', 'iban'])

export function CompanyCard({
  company,
  children,
  className,
  onEdit
}: {
  company: CompanyViewDto
  /** Extra blocks under the details (linked guests, the company's history). */
  children?: ReactNode
  className?: string
  onEdit?: () => void
}) {
  const { t } = useTranslation()
  const can = useCan()
  const labels = useCopyLabels()
  const canEdit = can('companies', 'edit')
  const [format, setFormat] = useState<CopyFormat>('multi')
  const update = useAdminMutation('companies.update', { invalidate: COMPANY_READS })
  const used = useAdminMutation('companies.markUsed', { invalidate: ['companies.list'] })
  const fields = companyCopyFields(company)
  const details = fields.filter((field) => field.key !== 'title')
  const star = (
    <StarIcon
      className={cn(company.favorite ? 'fill-warning text-warning' : 'text-muted-foreground')}
      aria-hidden
    />
  )
  return (
    <Card className={cn('gap-3 py-4', className)} data-testid={`company-${company.id}`}>
      <CardHeader className="flex items-start gap-2 px-4">
        <Building2Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
        <CardTitle className="min-w-0 flex-1 text-sm leading-snug break-words">{company.title}</CardTitle>
        {canEdit ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              className="-my-1.5"
              aria-pressed={company.favorite}
              aria-label={t(company.favorite ? 'companies.unfavorite' : 'companies.makeFavorite', {
                name: company.title
              })}
              disabled={update.isPending}
              onClick={() => update.mutate({ id: company.id, patch: { favorite: !company.favorite } })}
              data-testid="company-favorite"
            >
              {star}
            </Button>
            {onEdit ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="-my-1.5 -me-2"
                aria-label={t('companies.editOf', { name: company.title })}
                onClick={onEdit}
              >
                <PencilIcon aria-hidden />
              </Button>
            ) : null}
          </>
        ) : company.favorite ? (
          <span role="img" aria-label={t('guests.company.favorite')}>
            {star}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3 px-4">
        {details.length ? (
          <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
            {details.map((field) => (
              <div key={field.key} className="contents">
                <dt className="text-muted-foreground text-xs sm:pt-0.5">{labels[field.key]}</dt>
                <dd className="min-w-0 break-words max-sm:mb-1">
                  {LTR_FIELDS.has(field.key) ? (
                    <span
                      dir="ltr"
                      className={cn(field.key === 'iban' && 'font-mono text-xs tracking-tight')}
                    >
                      {field.value}
                    </span>
                  ) : (
                    field.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-muted-foreground text-sm">{t('companies.noDetails')}</p>
        )}
        {company.note ? (
          <p className="text-muted-foreground text-xs whitespace-pre-line">{company.note}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={format}
            onValueChange={(v) => v && setFormat(v as CopyFormat)}
            aria-label={t('guests.company.format.label')}
          >
            {FORMATS.map((key) => (
              <ToggleGroupItem key={key} value={key}>
                {t(`guests.company.format.${key}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <CopyButton
            text={() => formatCopyText(fields, labels, format)}
            variant="secondary"
            onCopied={() => {
              if (canEdit) used.mutate({ id: company.id })
            }}
          />
        </div>
        <p className="text-muted-foreground -mt-1 text-xs">{t('guests.company.copyHint')}</p>
        {children}
      </CardContent>
    </Card>
  )
}
