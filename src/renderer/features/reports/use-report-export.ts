// Export and print state of the open report (report-export.tsx draws the buttons): the service builds the files in
// the person's language; the program window saves them with its "Save as" dialog, a phone or browser downloads them.
import { createContext, useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ReportExportInput, ReportKind } from '@shared/contract/procedures/reports'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation } from '@/lib/api/hooks'
import { shell } from '@/lib/shell'
import { useCan } from '@/lib/view-as'
import { saveExport } from '../data-transfer/files'

/** What the open report is: its kind and the period/year inputs the service needs to rebuild it. */
export type ReportRef = Omit<ReportExportInput, 'format' | 'locale' | 'table'> & { report: ReportKind }

export const ReportRefContext = createContext<ReportRef | null>(null)

export function useReportExport() {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const ref = useContext(ReportRefContext)
  const run = useApiMutation('reports.export', {
    onSuccess: (file) => {
      if (file.delivery === 'canceled') return
      if (file.delivery === 'download') saveExport(file)
      toast.success(t('reports.download.done', { name: file.savedPath ?? file.fileName }))
    },
    onError: (error) =>
      toast.error(t('reports.download.failed'), {
        description: t(error.messageKey as 'errors.internal', { defaultValue: t('errors.internal') })
      })
  })
  return {
    allowed: can('reports.export') && ref !== null,
    pending: run.isPending,
    run: (format: 'csv' | 'xlsx', table?: string) => {
      if (!ref) return
      run.mutate({ ...ref, format, locale: f.locale, ...(table ? { table } : {}) })
    }
  }
}

/** How long the print layout stays after printing (see below). */
export const PRINT_LINGER_MS = 1500

/** Print state: the print layout is mounted, the browser's print runs, and it goes away after printing. */
export function usePrint() {
  const [printing, setPrinting] = useState(false)
  return {
    printing,
    start: () => {
      // Paper is light: the dark theme's light ink would vanish on it.
      const root = document.documentElement
      const dark = root.classList.contains('dark')
      root.classList.remove('dark')
      setPrinting(true)
      const done = () => {
        window.removeEventListener('afterprint', done)
        // Some print paths (the program's PDF) fire "afterprint" before the pages are drawn: keep the layout a moment.
        setTimeout(() => {
          if (dark) root.classList.add('dark')
          setPrinting(false)
        }, PRINT_LINGER_MS)
      }
      window.addEventListener('afterprint', done)
      // Let React draw the print layout first.
      setTimeout(() => shell.print(), 50)
    }
  }
}
