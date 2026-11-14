import ExcelJS from 'exceljs'
import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { readTable, TableReadError } from '../../src/main/services/data-transfer/table-reader'

async function book(rows: number, cols: number): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('S')
  ws.getCell(rows, cols).value = 'x'
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/** A minimal one-entry zip whose central directory claims a huge uncompressed size. */
function bomb(declared: number): Buffer {
  const name = Buffer.from('a.xml')
  const data = deflateRawSync(Buffer.alloc(10))
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(name.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(declared, 24)
  central.writeUInt16LE(name.length, 28)
  const cdOffset = local.length + name.length + data.length
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + name.length, 12)
  end.writeUInt32LE(cdOffset, 16)
  return Buffer.concat([local, name, data, central, name, end])
}

describe('xlsx boyut sınırları', () => {
  it('normal çalışma kitabı okunur', async () => {
    const t = await readTable('a.xlsx', await book(3, 2))
    expect(t.rows[2]![1]).toBe('x')
  })
  it('açılmış boyutu 50 MB üstü zip, açılmadan reddedilir', async () => {
    await expect(readTable('a.xlsx', bomb(60 * 1024 * 1024))).rejects.toBeInstanceOf(TableReadError)
  })
  it('5000 satırdan uzun sayfa reddedilir', async () => {
    await expect(readTable('a.xlsx', await book(5001, 1))).rejects.toBeInstanceOf(TableReadError)
  })
  it('100 sütundan geniş sayfa reddedilir', async () => {
    await expect(readTable('a.xlsx', await book(1, 101))).rejects.toBeInstanceOf(TableReadError)
  })
})
