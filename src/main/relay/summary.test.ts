// The hourly PDF summary (faz-13 madde 8; G-145, S-62): today and the month at a glance, with no personal data —
// no guest or staff names, no descriptor notes, no identity numbers, no phone numbers. Checked over a demo hotel
// with a month of history: none of its personal values appears in the summary's data or page.
import { describe, expect, it } from 'vitest'
import { localDate } from '@shared/date'
import { seedDemo } from '../db/seed/demo'
import { createServices } from '../services'
import { seededDatabase } from '../../../tests/factories/db'
import { tempDataDir } from '../../../tests/factories/runtime'
import { collectSummary, summaryHtml } from './summary'

const t = (key: string, vars: Record<string, string> = {}): string =>
  `${key}${Object.values(vars).length ? ` ${Object.values(vars).join(' ')}` : ''}`

describe('saatlik PDF özet', () => {
  it('kişisel veri içermez: misafir ve personel adı, tanıtıcı not, kimlik ve telefon yok; sayılar var', async () => {
    const handle = await seededDatabase()
    try {
      await seedDemo(handle, { until: localDate('2026-10-03'), days: 20, aheadDays: 5, seed: 7 })
      // A descriptor note and identity numbers that must never show.
      handle.sqlite.prepare("UPDATE stay_occupants SET descriptor_note = 'kızıl saçlı uzun boylu'").run()
      handle.sqlite
        .prepare("UPDATE guests SET id_doc_type = 'tc', id_doc_number = 'TC' || substr(id, -9)")
        .run()
      const now = new Date('2026-10-03T11:30:00.000Z')
      const services = createServices(
        handle,
        {
          name: 'Bismuth',
          version: '0.1.0',
          packaged: false,
          dataDir: tempDataDir(),
          electron: null,
          chrome: null
        },
        { clock: () => now }
      )
      const data = collectSummary(services, now)
      expect(data.day.sellableRooms).toBeGreaterThan(0)
      expect(data.month).not.toBeNull()
      expect(data.month!.occupancyBp).toBeGreaterThan(0)
      const html = summaryHtml(data, 'tr', t)
      const everything = `${JSON.stringify(data)}\n${html}`

      const personal = new Set<string>()
      const add = (v: unknown): void => {
        if (typeof v === 'string' && v.trim().length >= 3) personal.add(v.trim())
      }
      for (const g of handle.sqlite
        .prepare(
          'SELECT first_name, last_name, phone, email, id_doc_number, notes, standing_note FROM guests'
        )
        .all() as Record<string, unknown>[])
        Object.values(g).forEach(add)
      for (const o of handle.sqlite
        .prepare('SELECT full_name, descriptor_note FROM stay_occupants')
        .all() as Record<string, unknown>[])
        Object.values(o).forEach(add)
      for (const u of handle.sqlite.prepare('SELECT display_name, username FROM users').all() as Record<
        string,
        unknown
      >[])
        Object.values(u).forEach(add)
      for (const e of handle.sqlite.prepare('SELECT * FROM employees').all() as Record<string, unknown>[])
        for (const [k, v] of Object.entries(e)) if (/name|phone/.test(k)) add(v)
      expect(personal.size).toBeGreaterThan(20)
      const leaked = [...personal].filter((p) => everything.includes(p))
      expect(leaked).toEqual([])
      expect(html).not.toContain('<script')
      expect(html).toContain('summaryPdf.today')
    } finally {
      handle.close()
    }
  }, 180_000)
})
