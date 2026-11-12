// Quantities in the Excel files (P10fix #15): a whole number has no decimal sign ("160", not "160,"), a fraction
// keeps up to three digits ("7,5").
import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { translator } from './labels'
import { toXlsx } from './writers'

describe('Excel miktar biçimi', () => {
  it('tam sayı miktar ondalık işaretsiz, kesirli miktar en çok üç basamakla yazılır', async () => {
    const bytes = await toXlsx(
      [
        {
          title: 'Miktar',
          columns: [{ key: 'qty', label: 'reports.col.rows', type: 'qty' }],
          rows: [{ qty: 160_000 }, { qty: 7_500 }, { qty: 2_750 }]
        }
      ],
      { locale: 'tr', t: translator('tr'), timeZone: 'Europe/Istanbul' }
    )
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(bytes as unknown as ArrayBuffer)
    const ws = wb.worksheets[0]!
    const cells = [2, 3, 4].map((r) => ws.getRow(r).getCell(1))
    expect(cells.map((c) => c.value)).toEqual([160, 7.5, 2.75])
    expect(cells.map((c) => c.numFmt)).toEqual(['#,##0', '#,##0.###', '#,##0.###'])
  })
})
