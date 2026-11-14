// "Dışa aktar" (faz-14 madde 3; G-122, S-43): every table the role may see, as one XLSX workbook or one table as
// CSV/XLSX, optionally for a date range. Titles in the person's language; identity numbers and descriptive notes only
// for roles that may see them (the service decides, the dialog says so).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { DownloadIcon, FileSpreadsheetIcon, ShieldAlertIcon } from 'lucide-react'
import type { ExportDataset, ExportFormat } from '@shared/contract/backup'
import type { LocalDate } from '@shared/date'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DateInput } from '@/components/date-input'
import { QueryView } from '@/components/query-view'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'
import { saveExport } from './files'

type Choice = ExportDataset | 'all'
const FORMATS: readonly ExportFormat[] = ['xlsx', 'csv']

export function ExportDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const datasets = useApiQuery('dataExport.datasets', {}, { enabled: open })
  const [dataset, setDataset] = useState<Choice>('all')
  const [format, setFormat] = useState<ExportFormat>('xlsx')
  const [from, setFrom] = useState<LocalDate | null>(null)
  const [to, setTo] = useState<LocalDate | null>(null)
  const run = useApiMutation('dataExport.run', {
    onSuccess: (file) => {
      if (file.delivery === 'canceled') return
      if (file.delivery === 'download') saveExport(file)
      toast.success(t('dataTransfer.export.done', { name: file.fileName }), { id: 'data-export' })
    },
    onError: (error) =>
      toast.error(t('dataTransfer.export.failed'), {
        description: t(error.messageKey as 'errors.internal', { defaultValue: t('errors.internal') })
      })
  })
  const csvBlocked = dataset === 'all'
  const effectiveFormat: ExportFormat = csvBlocked ? 'xlsx' : format
  const submit = (): void =>
    run.mutate({
      dataset,
      format: effectiveFormat,
      locale: f.locale,
      ...(from ? { from } : {}),
      ...(to ? { to } : {})
    })

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('dataTransfer.export.title')}
      description={t('dataTransfer.export.description')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="export-form"
            disabled={run.isPending || !datasets.data?.length}
            data-testid="export-run"
          >
            <DownloadIcon aria-hidden />
            {run.isPending ? t('dataTransfer.export.running') : t('dataTransfer.export.run')}
          </Button>
        </>
      }
    >
      <QueryView
        query={datasets}
        isEmpty={(list) => list.length === 0}
        empty={{
          icon: FileSpreadsheetIcon,
          title: t('dataTransfer.export.emptyTitle'),
          body: t('dataTransfer.export.emptyBody')
        }}
        loading={<p className="text-muted-foreground py-6 text-sm">{t('common.loading')}</p>}
      >
        {(list) => (
          <form
            id="export-form"
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="export-dataset">{t('dataTransfer.export.dataset')}</Label>
              <Select value={dataset} onValueChange={(v) => setDataset(v as Choice)}>
                <SelectTrigger id="export-dataset" className="w-full" data-testid="export-dataset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('dataTransfer.export.all', { count: list.length })}</SelectItem>
                  {list.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {t('dataTransfer.export.datasetLine', {
                        name: t(`dataTransfer.dataset.${d.id}`),
                        count: d.rows
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">{t('dataTransfer.export.format')}</legend>
              <RadioGroup
                value={effectiveFormat}
                onValueChange={(v) => setFormat(v as ExportFormat)}
                className="grid gap-2 sm:grid-cols-2"
              >
                {FORMATS.map((fmt) => (
                  <Label
                    key={fmt}
                    htmlFor={`export-format-${fmt}`}
                    className="has-[[data-state=checked]]:border-primary flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                  >
                    <RadioGroupItem
                      id={`export-format-${fmt}`}
                      value={fmt}
                      disabled={fmt === 'csv' && csvBlocked}
                      className="mt-0.5"
                    />
                    <span className="grid gap-0.5">
                      <span className="font-medium">{t(`dataTransfer.export.${fmt}`)}</span>
                      <span className="text-muted-foreground text-xs">
                        {t(`dataTransfer.export.${fmt}Help`)}
                      </span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <DateInput
                label={t('dataTransfer.export.from')}
                value={from}
                onChange={setFrom}
                max={to ?? undefined}
                placeholder={t('dataTransfer.export.anyDate')}
              />
              <DateInput
                label={t('dataTransfer.export.to')}
                value={to}
                onChange={setTo}
                min={from ?? undefined}
                placeholder={t('dataTransfer.export.anyDate')}
              />
            </div>
            <p className="text-muted-foreground text-xs">{t('dataTransfer.export.rangeHelp')}</p>
            {list.some((d) => d.sensitiveHidden) ? (
              <Alert>
                <ShieldAlertIcon aria-hidden />
                <AlertDescription>{t('dataTransfer.export.sensitiveHidden')}</AlertDescription>
              </Alert>
            ) : null}
          </form>
        )}
      </QueryView>
    </ResponsiveDialog>
  )
}
