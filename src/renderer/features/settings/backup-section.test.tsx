import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SETTINGS_DEFAULTS, type ProcedureName } from '@shared/contract'
import type { BackupOverview, ImportBatch, ImportPreview, ImportReport } from '@shared/contract/backup'
import { fakeTransport, renderWithProviders } from '@/test/render'
import { ApiError, type Transport } from '@/lib/transport'
import { BackupSection } from './backup-section'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(() => vi.restoreAllMocks())

const overview = (patch: Partial<BackupOverview> = {}): BackupOverview => ({
  status: {
    lastBackupAt: '2026-10-04T01:00:00.000Z',
    lastAutoAt: '2026-10-04T01:00:00.000Z',
    nextAutoAt: '2026-10-05T01:00:00.000Z',
    running: false,
    drive: { state: 'missing', lastAt: null },
    warnings: ['drive'],
    restorePending: false
  },
  dataDir: 'C:\\Users\\Otel\\AppData\\Roaming\\Bismuth',
  dbBytes: 3 * 1024 * 1024,
  attachmentsBytes: 512 * 1024,
  backupsDir: 'C:\\Users\\Otel\\AppData\\Roaming\\Bismuth\\backups',
  driveDir: null,
  key: { available: true, exists: false, createdAt: null },
  items: [
    {
      id: 'bismuth-yedek-2026-10-04-0400.bmy',
      source: 'local',
      kind: 'auto',
      createdAt: '2026-10-04T01:00:00.000Z',
      sizeBytes: 900 * 1024,
      encrypted: false,
      verified: true,
      note: null
    },
    {
      id: 'bismuth-yedek-2026-10-03-0400.bmy',
      source: 'drive',
      kind: 'auto',
      createdAt: '2026-10-03T01:00:00.000Z',
      sizeBytes: 900 * 1024,
      encrypted: true,
      verified: null,
      note: null
    }
  ],
  pendingRestore: null,
  restoreFailed: null,
  lastError: null,
  canOpenFolders: true,
  ...patch
})

const preview: ImportPreview = {
  template: 'reservationGrid',
  sheetNames: [],
  headerRow: 1,
  columns: ['ODA NO', '01.10.2026', '02.10.2026'],
  mapping: { room: 0, firstDay: 1 },
  needsMonth: false,
  rows: 3,
  records: [
    {
      row: 2,
      kind: 'stay',
      date: '2026-10-01',
      until: '2026-10-03',
      room: '101',
      name: 'Deneme Misafir',
      amountMinor: 400_000,
      currency: 'TRY',
      paidMinor: 0,
      marked: false,
      detail: null,
      already: false
    }
  ],
  recordCount: 1,
  errors: [{ row: 3, column: 'ODA NO', code: 'unknownRoom', value: '999' }],
  errorCount: 1,
  duplicates: [{ name: 'Gadir Gadirov', similar: ['Gadir Garibov'] }],
  blockedCells: 0,
  alreadyImported: 0,
  sameFileAt: null
}

const report: ImportReport = {
  batchId: 'b-1',
  salaries: 0,
  salaryPayments: 0,
  skipped: 0,
  reservations: 1,
  nights: 2,
  payments: 0,
  expenses: 0,
  guestsCreated: 1,
  errors: preview.errors,
  errorCount: 1,
  duplicates: preview.duplicates
}

const KEY_TEXT = '7KQ2M-ABCDE-FGHJK-MNPQR-STVWX-YZ012-34567-89ABC-DEFGH-JKMNP-QRSTV'

const batch: ImportBatch = {
  id: 'b-1',
  template: 'ledgerRows',
  fileName: 'Defter Ekim 2026.csv',
  createdAt: '2026-10-04T09:00:00.000Z',
  createdByName: 'Otel Sahibi',
  summary: { payments: 70, expenses: 30 },
  voidedAt: null,
  voidReason: null
}

function backupTransport(
  data = overview(),
  previewData: ImportPreview = preview,
  kind: 'ipc' | 'http' = 'ipc'
) {
  const base = fakeTransport(SETTINGS_DEFAULTS)
  const calls: { name: ProcedureName; input: unknown }[] = []
  const transport: Transport = {
    kind,
    async call(name, input) {
      calls.push({ name, input })
      switch (name) {
        case 'backup.overview':
          return structuredClone(data) as never
        case 'backup.run':
          return data.items[0] as never
        case 'backup.restore': {
          const r = input as { id: string; recoveryText?: string; replace?: boolean }
          // The paper's key differs from this computer's own one: only with the person's yes (Faz 11/14 #7).
          if (r.recoveryText && !r.replace) throw new ApiError('CONFLICT', 409, 'errors.backupKeyExists')
          return { id: r.id, requestedAt: '2026-10-04T09:00:00.000Z' } as never
        }
        case 'backup.pickDriveFolder':
          return { folder: "G:\\Drive'ım\\Bismuth\\yedekler" } as never
        case 'lists.list':
          return [] as never
        case 'dataExport.datasets':
          return [
            { id: 'reservations', rows: 12, sensitiveHidden: false },
            { id: 'guests', rows: 30, sensitiveHidden: true }
          ] as never
        case 'dataExport.run':
          return {
            fileName: 'Bismuth tüm tablolar 2026-10-04.xlsx',
            mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            base64: btoa('PK'),
            rows: 42,
            delivery: 'download',
            savedPath: null
          } as never
        case 'dataImport.preview':
          return previewData as never
        case 'dataImport.batches':
          return [batch] as never
        case 'dataImport.voidBatch':
          return {
            ...batch,
            voidedAt: '2026-10-04T10:00:00.000Z',
            voidReason: (input as { reason: string }).reason
          } as never
        case 'dataImport.sample':
          return {
            fileName: 'Maaşlar (çalışan - ay).csv',
            mime: 'text/csv;charset=utf-8',
            base64: btoa('x'),
            rows: 2,
            delivery: 'download',
            savedPath: null
          } as never
        case 'dataImport.run':
          return report as never
        case 'backup.recoveryText':
          return { text: KEY_TEXT, createdAt: '2026-10-04T09:00:00.000Z' } as never
        case 'backup.setRecoveryText':
          // This computer made its own key before: only with the person's yes (P16d).
          if (!(input as { replace?: boolean }).replace)
            throw new ApiError('CONFLICT', 409, 'errors.backupKeyExists')
          return { ok: true } as never
        default:
          return base.call(name, input)
      }
    }
  }
  return { transport, callsTo: (n: ProcedureName) => calls.filter((c) => c.name === n).map((c) => c.input) }
}

const render = (
  t = backupTransport(),
  values = SETTINGS_DEFAULTS,
  onSave: (patch: Partial<typeof SETTINGS_DEFAULTS>) => void = () => undefined
) =>
  renderWithProviders(<BackupSection values={values} onSave={onSave} />, {
    transport: t.transport
  })

describe('Ayarlar → Yedek', () => {
  it('son yedek, Drive uyarısı ve klasör yolu görünür; "Şimdi yedek al" yedek alır', async () => {
    const t = backupTransport()
    await render(t)
    expect(await screen.findByTestId('backup-status')).toBeInTheDocument()
    expect(screen.getByTestId('drive-state')).toHaveTextContent('Drive klasörü yok')
    expect(screen.getByText(/Drive'a kopya gitmiyor/)).toBeInTheDocument()
    expect(screen.getByText('Kayıtlar 3,0 MB, ekler 512 KB.')).toBeInTheDocument()
    expect(screen.getAllByTestId('backup-item')).toHaveLength(2)
    await userEvent.setup().click(screen.getByTestId('backup-run'))
    await waitFor(() => expect(t.callsTo('backup.run')).toEqual([{}]))
  })

  it('geri yükleme onay ister; anahtarı olmayan Drive yedeği için anahtar sorulur', async () => {
    const t = backupTransport()
    await render(t)
    const user = userEvent.setup()
    const [local, drive] = await screen.findAllByTestId('backup-item')
    await user.click(within(local!).getByTestId('backup-restore'))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Bu yedek geri yüklensin mi?')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Bismuth anahtarı')).not.toBeInTheDocument()
    await user.click(within(dialog).getByTestId('restore-confirm'))
    await waitFor(() =>
      expect(t.callsTo('backup.restore')).toEqual([
        { source: 'local', id: 'bismuth-yedek-2026-10-04-0400.bmy' }
      ])
    )
    await user.click(within(drive!).getByTestId('backup-restore'))
    const second = await screen.findByRole('alertdialog')
    const confirm = within(second).getByTestId('restore-confirm')
    expect(confirm).toBeDisabled()
    await user.type(within(second).getByLabelText('Bismuth anahtarı'), '7KQ2M-ABCDE-FGHJK-MNPQR-STVWX')
    expect(confirm).toBeEnabled()
  })

  it('Bismuth anahtarı metniyle birlikte QR koduyla gösterilir ve yazdırılabilir (K-41)', async () => {
    await render()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Anahtarı göster' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByTestId('recovery-text')).toHaveTextContent(KEY_TEXT)
    expect(within(dialog).getByRole('img', { name: 'Bismuth anahtarının QR kodu' })).toBeInTheDocument()
    expect(within(dialog).getByTestId('key-print')).toBeEnabled()
  })

  it('kendi anahtarı olan bilgisayarda kâğıttaki anahtar önce sorulup onayla kaydedilir', async () => {
    const t = backupTransport(
      overview({ key: { available: true, exists: true, createdAt: '2026-10-01T09:00:00.000Z' } })
    )
    await render(t)
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('key-enter'))
    await user.type(screen.getByLabelText('Bismuth anahtarı'), KEY_TEXT)
    await user.click(screen.getByRole('button', { name: 'Kaydet' }))
    expect(await screen.findByText('Bu bilgisayarın anahtarı değiştirilsin mi?')).toBeInTheDocument()
    await user.click(screen.getByTestId('key-replace'))
    await waitFor(() =>
      expect(t.callsTo('backup.setRecoveryText')).toEqual([
        { text: KEY_TEXT },
        { text: KEY_TEXT, replace: true }
      ])
    )
  })

  it('açılışta yapılamayan geri yükleme nedeniyle gösterilir; "Tamam" uyarıyı kaldırır (P14fix #4)', async () => {
    const t = backupTransport(
      overview({
        restoreFailed: {
          id: 'bismuth-yedek-2026-10-04-0400.bmy',
          reason: 'checksum',
          failedAt: '2026-10-04T09:00:00.000Z'
        },
        status: { ...overview().status, warnings: ['restoreFailed'] }
      })
    )
    await render(t)
    const box = await screen.findByTestId('restore-failed')
    expect(box).toHaveTextContent('Geri yükleme yapılamadı')
    expect(box).toHaveTextContent('Açılan kopya diskte değişmiş.')
    await userEvent.setup().click(within(box).getByTestId('restore-failed-ok'))
    await waitFor(() => expect(t.callsTo('backup.cancelRestore')).toEqual([{}]))
  })

  it('Drive yedeği kâğıttaki farklı anahtarla geri yüklenirken bu bilgisayarın anahtarı önce sorulur (Faz 11/14 #7)', async () => {
    const t = backupTransport(
      overview({ key: { available: true, exists: true, createdAt: '2026-10-01T09:00:00.000Z' } })
    )
    await render(t)
    const user = userEvent.setup()
    const [, drive] = await screen.findAllByTestId('backup-item')
    await user.click(within(drive!).getByTestId('backup-restore'))
    const dialog = await screen.findByRole('alertdialog')
    await user.type(within(dialog).getByLabelText('Bismuth anahtarı'), KEY_TEXT)
    await user.click(within(dialog).getByTestId('restore-confirm'))
    expect(await screen.findByText('Bu bilgisayarın anahtarı değiştirilsin mi?')).toBeInTheDocument()
    await user.click(screen.getByTestId('restore-key-replace'))
    await waitFor(() =>
      expect(t.callsTo('backup.restore')).toEqual([
        { source: 'drive', id: 'bismuth-yedek-2026-10-03-0400.bmy', recoveryText: KEY_TEXT },
        { source: 'drive', id: 'bismuth-yedek-2026-10-03-0400.bmy', recoveryText: KEY_TEXT, replace: true }
      ])
    )
  })

  it('Drive klasörü yazılarak değil klasör seçiciyle seçilir; "Otomatik bul" ayarı boşaltır (K-45)', async () => {
    const t = backupTransport()
    const saved: unknown[] = []
    await render(t, { ...SETTINGS_DEFAULTS, 'backup.driveFolder': 'D:\\Drive\\Bismuth\\yedekler' }, (p) =>
      saved.push(p)
    )
    const user = userEvent.setup()
    expect(await screen.findByTestId('backup-drive')).toHaveTextContent('D:\\Drive\\Bismuth\\yedekler')
    expect(screen.queryByRole('textbox', { name: 'Drive klasörü' })).not.toBeInTheDocument()
    await user.click(screen.getByTestId('backup-drive-pick'))
    await waitFor(() => expect(t.callsTo('backup.pickDriveFolder')).toEqual([{}]))
    await user.click(screen.getByTestId('backup-drive-auto'))
    expect(saved).toEqual([{ 'backup.driveFolder': '' }])
  })

  it("geçersiz saklama günü Kaydet'e basınca alan altında söylenir, kaydedilmez (H-36)", async () => {
    const saved: unknown[] = []
    await render(backupTransport(), SETTINGS_DEFAULTS, (p) => saved.push(p))
    const user = userEvent.setup()
    const keep = await screen.findByLabelText('Saklama süresi (gün)')
    await user.clear(keep)
    await user.type(keep, '0')
    await user.click(screen.getByRole('button', { name: 'Kaydet' }))
    expect(keep).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('1 ile 365 arasında bir tam sayı yazın.')).toBeInTheDocument()
    expect(saved).toEqual([])
    await user.clear(keep)
    await user.type(keep, '20')
    await user.click(screen.getByRole('button', { name: 'Kaydet' }))
    expect(saved).toHaveLength(1)
  })

  it('telefondan anahtar gösterilmez/girilmez, geri yükleme ve klasör seçimi yoktur (K-45)', async () => {
    await render(backupTransport(overview(), preview, 'http'))
    expect(await screen.findByTestId('key-desktop-only')).toHaveTextContent(
      'Anahtar yalnız ana bilgisayardaki program penceresinde gösterilir ve girilir.'
    )
    expect(screen.queryByRole('button', { name: 'Anahtarı göster' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('key-enter')).not.toBeInTheDocument()
    expect(screen.queryByTestId('backup-restore')).not.toBeInTheDocument()
    expect(screen.queryByTestId('backup-drive-pick')).not.toBeInTheDocument()
  })

  it('telefonda klasör yolları ve geri yükleme iptali yok; yalnız ana bilgisayarda yönetildiği söylenir (N-9)', async () => {
    await render(
      backupTransport(
        overview({
          dataDir: null,
          backupsDir: null,
          driveDir: null,
          canOpenFolders: false,
          pendingRestore: { id: 'bismuth-yedek-2026-10-04-0400.bmy', requestedAt: '2026-10-04T09:00:00.000Z' }
        }),
        preview,
        'http'
      )
    )
    expect(await screen.findByTestId('folders-desktop-only')).toHaveTextContent(
      'Klasörlerin yeri yalnız ana bilgisayarda gösterilir.'
    )
    // Not "no Drive folder found": a phone simply is not told where it is.
    expect(screen.queryByText(/Drive klasörü bulunamadı/)).not.toBeInTheDocument()
    const pending = await screen.findByTestId('restore-pending')
    expect(within(pending).getByText('Geri yükleme ana bilgisayarda yönetilir.')).toBeInTheDocument()
    expect(within(pending).queryByText('Geri yüklemeyi iptal et')).not.toBeInTheDocument()
  })

  it('bekleyen geri yükleme yeniden başlat ve iptal düğmeleriyle görünür', async () => {
    await render(
      backupTransport(
        overview({
          pendingRestore: { id: 'bismuth-yedek-2026-10-04-0400.bmy', requestedAt: '2026-10-04T09:00:00.000Z' }
        })
      )
    )
    const pending = await screen.findByTestId('restore-pending')
    expect(within(pending).getByText('Şimdi yeniden başlat')).toBeInTheDocument()
    expect(within(pending).getByText('Geri yüklemeyi iptal et')).toBeInTheDocument()
  })

  it('dışa aktarma tüm tabloları XLSX olarak ister ve dosyayı indirir', async () => {
    const links: HTMLAnchorElement[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      links.push(this)
    })
    const t = backupTransport()
    await render(t)
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('open-export'))
    expect(await screen.findByText(/Kimlik numaraları ve tanıtıcı notlar/)).toBeInTheDocument()
    await user.click(screen.getByTestId('export-run'))
    await waitFor(() =>
      expect(t.callsTo('dataExport.run')).toEqual([{ dataset: 'all', format: 'xlsx', locale: 'tr' }])
    )
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(links[0]?.download).toBe('Bismuth tüm tablolar 2026-10-04.xlsx')
    expect(links[0]?.href.startsWith('data:application/vnd.openxmlformats')).toBe(true)
  })

  it('içe aktarma: dosya → sütunlar → önizleme (hata ve olası tekrar) → sonuç', async () => {
    const t = backupTransport()
    await render(t)
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('open-import'))
    const file = new File(['ODA NO;01.10.2026\n101;Deneme (2000 TL)'], 'ekim.csv', { type: 'text/csv' })
    await user.upload(screen.getByTestId('import-file'), file)
    await waitFor(() => expect(screen.getByTestId('import-next')).toBeEnabled())
    await user.click(screen.getByTestId('import-next'))
    expect(await screen.findByTestId('map-room')).toHaveTextContent('1. sütun · ODA NO')
    await user.click(screen.getByTestId('import-preview'))
    const step = await screen.findByTestId('import-preview-step')
    expect(within(step).getByTestId('import-summary')).toHaveTextContent('1 kayıt alınacak. 1 sorun var')
    expect(within(step).getByText('Bu numarada oda yok')).toBeInTheDocument()
    expect(within(step).getByText('Gadir Gadirov → Gadir Garibov')).toBeInTheDocument()
    await user.click(screen.getByTestId('import-run'))
    const result = await screen.findByTestId('import-report')
    expect(within(result).getByText('1 rezervasyon')).toBeInTheDocument()
    expect(within(result).getByText('2 gece')).toBeInTheDocument()
    const input = t.callsTo('dataImport.run')[0] as { template: string; fileName: string; mapping: object }
    expect(input).toMatchObject({
      template: 'reservationGrid',
      fileName: 'ekim.csv',
      mapping: { room: 0, firstDay: 1 }
    })
  })

  it('daha önce alınmış kayıtlar önizlemede işaretlenir ve sayılmaz; aynı dosya uyarısı çıkar (P14fix #2)', async () => {
    const twice: ImportPreview = {
      ...preview,
      records: [
        { ...preview.records[0]!, already: true },
        { ...preview.records[0]!, row: 3, name: 'Yeni Misafir', already: false }
      ],
      recordCount: 2,
      alreadyImported: 1,
      sameFileAt: '2026-10-04T09:00:00.000Z'
    }
    await render(backupTransport(overview(), twice))
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('open-import'))
    await user.upload(screen.getByTestId('import-file'), new File(['x'], 'ekim.csv', { type: 'text/csv' }))
    await waitFor(() => expect(screen.getByTestId('import-next')).toBeEnabled())
    await user.click(screen.getByTestId('import-next'))
    await user.click(await screen.findByTestId('import-preview'))
    const step = await screen.findByTestId('import-preview-step')
    expect(within(step).getByTestId('import-same-file')).toHaveTextContent(
      'Bu dosya 4 Eki 2026 içe alınmıştı.'
    )
    expect(within(step).getByTestId('import-summary')).toHaveTextContent(
      '1 kayıt daha önce içe alınmış; yeniden alınmaz.'
    )
    expect(within(step).getAllByText('Alınmış').length).toBeGreaterThan(0)
    expect(screen.getByTestId('import-run')).toHaveTextContent('1 kaydı içe al')
  })

  it('maaş şablonu seçilir ve örnek dosyası indirilir (P14fix #10)', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const t = backupTransport()
    await render(t)
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('open-import'))
    await user.click(screen.getByLabelText(/Maaşlar \(çalışan × ay\)/))
    await user.click(screen.getByTestId('import-sample'))
    await waitFor(() =>
      expect(t.callsTo('dataImport.sample')).toEqual([{ template: 'salaryRows', locale: 'tr' }])
    )
    await waitFor(() => expect(click).toHaveBeenCalled())
  })

  it('içe aktarmalar listelenir; "Aktarımı iptal et" gerekçe ister ve servise gider (P14fix #2)', async () => {
    const t = backupTransport()
    await render(t)
    const user = userEvent.setup()
    const row = await screen.findByTestId('import-batch')
    expect(row).toHaveTextContent('Defter Ekim 2026.csv')
    expect(row).toHaveTextContent('70 ödeme · 30 gider')
    await user.click(within(row).getByTestId('import-batch-cancel'))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Bu içe aktarma iptal edilsin mi?')).toBeInTheDocument()
    const confirm = within(dialog).getByTestId('import-cancel-confirm')
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByTestId('import-cancel-reason'), 'Yanlış dosya')
    await user.click(confirm)
    await waitFor(() =>
      expect(t.callsTo('dataImport.voidBatch')).toEqual([{ id: 'b-1', reason: 'Yanlış dosya' }])
    )
  })
})
