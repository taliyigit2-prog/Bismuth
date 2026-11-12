// Export and print of a report (faz-10 madde 8): one table as CSV/Excel from its card, every table of the open report
// as one Excel workbook, and the print layout (print.tsx). The service builds the files (same figures, the
// person's language); the program window saves them with its "Save as" dialog, a phone or browser downloads them.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DownloadIcon, FileSpreadsheetIcon, FileTextIcon, PrinterIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ReportRefContext, useReportExport, type ReportRef } from './use-report-export'

/** The small download menu of one table (CSV or Excel). */
export function TableExportMenu({ table, label }: { table: string; label: string }) {
  const { t } = useTranslation()
  const ex = useReportExport()
  if (!ex.allowed) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('reports.download.table', { name: label })}
          disabled={ex.pending}
          data-testid={`export-${table}`}
        >
          <DownloadIcon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => ex.run('xlsx', table)}>
          <FileSpreadsheetIcon aria-hidden />
          {t('reports.download.xlsx')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => ex.run('csv', table)}>
          <FileTextIcon aria-hidden />
          {t('reports.download.csv')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Page actions: the whole report as one workbook, and print / PDF. */
export function ReportActions({ onPrint }: { onPrint: () => void }) {
  const { t } = useTranslation()
  const ex = useReportExport()
  return (
    <>
      {ex.allowed ? (
        <Button
          variant="outline"
          onClick={() => ex.run('xlsx')}
          disabled={ex.pending}
          data-testid="export-report"
        >
          <FileSpreadsheetIcon aria-hidden />
          {ex.pending ? t('reports.download.running') : t('reports.download.all')}
        </Button>
      ) : null}
      <Button variant="outline" onClick={onPrint} data-testid="print-report">
        <PrinterIcon aria-hidden />
        {t('reports.print.button')}
      </Button>
    </>
  )
}

export function ReportScope({ value, children }: { value: ReportRef; children: ReactNode }) {
  return <ReportRefContext.Provider value={value}>{children}</ReportRefContext.Provider>
}
