import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, configure, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { SETTINGS_DEFAULTS } from '@shared/contract'
import type { Transport } from '@/lib/transport'
import { renderWithProviders } from '@/test/render'
import { setViewAs } from '@/lib/view-as'
import { defaultHousekeeping, housekeepingTransport, type HousekeepingState } from './housekeeping-fake'
import { IssuesPage } from './issues-page'

// The whole suite runs in parallel; give slow machines time before a findBy gives up.
configure({ asyncUtilTimeout: 4000 })
vi.setConfig({ testTimeout: 20_000 })

function phone(): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false
      }) as MediaQueryList
  )
}

const render = async (
  state: HousekeepingState = defaultHousekeeping(),
  opts: Parameters<typeof housekeepingTransport>[1] = {}
) => {
  const transport = housekeepingTransport(state, opts)
  const result = await renderWithProviders(<IssuesPage />, { transport, settings: opts.settings })
  return { ...result, transport }
}

beforeEach(() => {
  // "Today" of the fake hotel: 12 Oct 2026 (only Date is faked; timers stay real for user events).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-12T10:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  act(() => setViewAs('owner'))
})

describe('Arızalar', () => {
  it('veri gelene kadar yükleniyor durumunu gösterir', async () => {
    const pending: Transport = { kind: 'ipc', call: () => new Promise(() => {}) }
    await renderWithProviders(<IssuesPage />, { transport: pending })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
  })

  it('arıza yoksa boş durumu anlatır', async () => {
    await render({ ...defaultHousekeeping(), issues: [] })
    expect(await screen.findByText('Kayıtlı arıza yok')).toBeInTheDocument()
  })

  it('arızaları duruma göre gruplar; acil olan önce; 7 gündür açık olan kırmızı; genel alanın adı yazar', async () => {
    await render()
    const open = await screen.findByRole('region', { name: /Açık/ })
    const rows = within(open).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Klozet kapağı kırık')
    expect(within(rows[0]!).getByText('Acil')).toBeInTheDocument()
    expect(within(rows[0]!).getByTestId('issue-stale')).toHaveTextContent('10 gündür açık')
    expect(rows[1]).toHaveTextContent('Lobi')
    expect(within(rows[1]!).queryByTestId('issue-stale')).toBeNull()
    expect(screen.getByRole('region', { name: /Çözüldü/ })).toHaveTextContent('Lavabo gideri yavaş')
  })

  it('durum süzgeci yalnızca seçilen grubu gösterir', async () => {
    const user = userEvent.setup()
    await render()
    await screen.findByRole('region', { name: /Açık/ })
    await user.click(screen.getByRole('radio', { name: /Çözüldü/ }))
    expect(screen.queryByRole('region', { name: /Açık/ })).not.toBeInTheDocument()
    expect(screen.getByText('Lavabo gideri yavaş')).toBeInTheDocument()
  })

  it('çözülmüş arızanın fotoğrafları gösterilir; silineceği gün ayardan; elle silme onay ister', async () => {
    const user = userEvent.setup()
    const { transport } = await render(defaultHousekeeping(), {
      settings: { ...SETTINGS_DEFAULTS, 'attachments.resolvedIssueRetentionDays': 10 }
    })
    await user.click(await screen.findByRole('button', { name: 'Lavabo gideri yavaş' }))
    const sheet = await screen.findByTestId('issue-sheet')
    const photos = await within(sheet).findByRole('list', { name: 'Fotoğraflar' })
    expect(await within(photos).findAllByTestId('issue-photo')).toHaveLength(2)
    expect(sheet).toHaveTextContent('13 Ekim 2026 Salı günü kendiliğinden silinir (çözümden 10 gün sonra)')
    expect(within(sheet).getByRole('list', { name: 'Geçmiş' })).toHaveTextContent('Çözen: Deniz Arslan')
    await user.click(within(sheet).getByRole('button', { name: 'Fotoğrafları şimdi sil' }))
    const confirm = await screen.findByRole('alertdialog')
    expect(confirm).toHaveTextContent('Fotoğraflar silinsin mi?')
    await user.click(within(confirm).getByRole('button', { name: 'Fotoğrafları şimdi sil' }))
    await vi.waitFor(() =>
      expect(transport.calls.filter((c) => c.name === 'attachments.deleteFile')).toHaveLength(2)
    )
  })

  it('yeniden açılan arızanın geçmişi eski çözümü ve yeniden açma nedenini gösterir (P9fix #19)', async () => {
    const user = userEvent.setup()
    const state = defaultHousekeeping()
    state.issues = state.issues.map((i) =>
      i.id === 'i2'
        ? {
            ...i,
            history: [
              { kind: 'resolved', at: '2026-10-05T09:00:00.000Z', byName: 'Deniz Arslan', note: 'Yağlandı' },
              {
                kind: 'reopened',
                at: '2026-10-08T09:00:00.000Z',
                byName: 'Otel Sahibi',
                note: 'Yine gıcırdıyor'
              }
            ]
          }
        : i
    )
    await render(state)
    await user.click(await screen.findByRole('button', { name: 'Kapı gıcırdıyor' }))
    const history = within(await screen.findByTestId('issue-sheet')).getByRole('list', { name: 'Geçmiş' })
    expect(within(history).getByTestId('issue-history-resolved')).toHaveTextContent('Çözen: Deniz Arslan')
    expect(within(history).getByTestId('issue-history-resolved')).toHaveTextContent('Yağlandı')
    expect(within(history).getByTestId('issue-history-reopened')).toHaveTextContent(
      'Yeniden açan: Otel Sahibi'
    )
    expect(within(history).getByTestId('issue-history-reopened')).toHaveTextContent('Yine gıcırdıyor')
  })

  it('arıza planlanır (gün + kim) ve çözülür; maliyet alanı yoktur', async () => {
    const user = userEvent.setup()
    const resolved = vi.spyOn(toast, 'success')
    const { transport } = await render()
    await user.click(await screen.findByRole('button', { name: 'Klozet kapağı kırık' }))
    const sheet = await screen.findByTestId('issue-sheet')
    await user.type(within(sheet).getByLabelText('Kim yapacak?'), 'Tesisatçı')
    await user.click(within(sheet).getByRole('button', { name: 'Planı kaydet' }))
    await vi.waitFor(() =>
      expect(transport.calls.find((c) => c.name === 'housekeeping.planIssue')?.input).toEqual({
        id: 'i1',
        plannedDate: '2026-10-13',
        assignedTo: 'Tesisatçı'
      })
    )
    expect(within(sheet).queryByLabelText(/Tutar|Maliyet/)).toBeNull()
    await user.type(within(sheet).getByLabelText('Çözüm notu'), 'Kapak değişti')
    await user.click(within(sheet).getByTestId('issue-resolve'))
    await vi.waitFor(() => expect(resolved).toHaveBeenCalledWith('Arıza çözüldü olarak kapatıldı'))
    expect(transport.state.issues.find((i) => i.id === 'i1')).toMatchObject({
      status: 'resolved',
      resolutionNote: 'Kapak değişti'
    })
  })

  it('arıza bildir formu başlıksız kaydetmez; genel alanda odayı kapatma kapalıdır', async () => {
    const user = userEvent.setup()
    await render()
    await screen.findByRole('region', { name: /Açık/ })
    await user.click(screen.getByRole('button', { name: 'Arıza bildir' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    expect(within(dialog).getByText('Kısa bir başlık yazın.')).toBeInTheDocument()
    expect(within(dialog).getByText('Odayı seçin.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('radio', { name: 'Genel alan' }))
    expect(within(dialog).getByRole('switch')).toBeDisabled()
  })

  it('genel alan arızası adıyla kaydedilir; bildiren servisten gelir', async () => {
    const user = userEvent.setup()
    const { transport } = await render()
    await screen.findByRole('region', { name: /Açık/ })
    await user.click(screen.getByRole('button', { name: 'Arıza bildir' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('radio', { name: 'Genel alan' }))
    await user.type(within(dialog).getByLabelText('Alan'), 'Çatı')
    await user.type(within(dialog).getByLabelText('Kısa başlık'), 'Su deposu taşıyor')
    await user.click(within(dialog).getByRole('radio', { name: 'Acil' }))
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await vi.waitFor(() =>
      expect(transport.calls.find((c) => c.name === 'housekeeping.reportIssue')?.input).toEqual({
        roomId: null,
        area: 'Çatı',
        title: 'Su deposu taşıyor',
        description: null,
        severity: 'urgent',
        blocksRoom: false
      })
    )
    expect(await screen.findByText('Su deposu taşıyor')).toBeInTheDocument()
  })

  it('telefonda kartlar ve başlıkta tam genişlik yazılı bildir düğmesi çıkar, tablo yoktur', async () => {
    phone()
    await render()
    expect(await screen.findByTestId('issue-card-i1')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    const report = screen.getAllByRole('button', { name: 'Arıza bildir' })
    // One copy only, in the page header's action row (which spans the phone's width), above the list.
    expect(report).toHaveLength(1)
    expect(report[0]!.parentElement).toHaveClass('max-md:w-full')
    expect(
      report[0]!.compareDocumentPosition(screen.getByTestId('issue-card-i1')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('arıza yetkisi olmayan rol bildir düğmesini görmez', async () => {
    await render()
    await screen.findByRole('region', { name: /Açık/ })
    act(() => setViewAs('employee'))
    expect(screen.queryByRole('button', { name: 'Arıza bildir' })).not.toBeInTheDocument()
  })
})
