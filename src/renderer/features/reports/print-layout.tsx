// The print layout of a report (faz-10 madde 8): mounted only while printing, straight under <body> so the app
// shell is left out; every card shows its table (PrintModeContext). The table header repeats on each A4 page with
// the hotel's name, the report and its period; print.css numbers the pages. Printed light whatever the theme.
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { localDateOf } from '@shared/date'
import { useFormat } from '@/hooks/use-format'
import { useSettings } from '@/lib/api/hooks'
import { PrintModeContext } from './print-mode'
import './print.css'

export function PrintLayout({
  title,
  range,
  children
}: {
  title: string
  range: string
  children: ReactNode
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const settings = useSettings()
  const [printedAt] = useState(() => new Date())
  const hotel = settings.data?.['hotel.name'] ?? ''
  return createPortal(
    <div className="print-root bg-background text-foreground" data-testid="print-root">
      {/* A table so the header (hotel, report, period) repeats at the top of every printed page. */}
      <table className="print-sheet">
        <thead>
          <tr>
            <td>
              <div className="mb-4 flex items-end justify-between gap-4 border-b pb-2">
                <div>
                  <p className="text-base font-semibold" data-testid="print-hotel">
                    {hotel}
                  </p>
                  <p className="text-sm">
                    {title} · <span data-testid="print-range">{range}</span>
                  </p>
                </div>
                <p className="text-muted-foreground text-xs">
                  {t('reports.print.printedAt', {
                    date: f.date(localDateOf(printedAt), 'medium'),
                    time: f.time(printedAt.toISOString())
                  })}
                </p>
              </div>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <PrintModeContext.Provider value={true}>
                <div className="grid gap-4">{children}</div>
              </PrintModeContext.Provider>
            </td>
          </tr>
        </tbody>
      </table>
    </div>,
    document.body
  )
}
