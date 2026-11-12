// Prints the summary page to PDF (faz-13 madde 8; K-14 printToPDF): a hidden window without scripts loads the page
// from memory, Chromium prints it, the file goes to Drive through a temporary name. Electron only (main process);
// the numbers and the page come from summary.ts.
import { BrowserWindow } from 'electron'
import { writeWhole } from './format'

export async function printSummaryPdf(html: string, out: string): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 1100,
    webPreferences: { javascript: false, sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: false })
    writeWhole(out, Buffer.from(pdf))
  } finally {
    win.destroy()
  }
}
