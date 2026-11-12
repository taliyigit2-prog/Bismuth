// The main computer's Drive box and PDF summary card, and the card of a computer another one took over from
// (faz-13 madde 4, 5, 8): state lines, switches that write settings, "Şimdi yaz"; the conflicting records listed
// and saved; "Yeni ana bilgisayara bağlan" behind a question.
import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SETTINGS_DEFAULTS, type ProcedureName } from '@shared/contract'
import type { ConflictReport, EpochState, RelayHostStatus } from '@shared/contract/remote'
import { fakeTransport, renderWithProviders } from '@/test/render'
import { RelayCard, ReplacedCard } from './relay-card'

const STATUS: RelayHostStatus = {
  epoch: 1,
  box: {
    folder: 'G:\\Drive’ım\\Bismuth\\kutu',
    problem: null,
    lastSegmentAt: new Date().toISOString(),
    lastSnapshotAt: null,
    pending: 0
  },
  summary: { folder: 'G:\\Drive’ım\\Bismuth', problem: null, lastAt: null },
  keyExists: false,
  replaced: null
}

function relayTransport(opts: { replaced?: boolean; kind?: 'ipc' | 'http' } = {}) {
  const base = fakeTransport(SETTINGS_DEFAULTS)
  const calls: { name: ProcedureName; input: unknown }[] = []
  const epoch: EpochState = {
    epoch: 1,
    replaced: opts.replaced ? { epoch: 2, by: 'Sahibin Mac', at: '2026-10-05T09:00:00.000Z' } : null
  }
  const conflicts: ConflictReport = {
    replaced: epoch.replaced,
    items: [
      {
        seq: 41,
        tbl: 'payments',
        pk: ['01J9PAYMENTAAAAAAAAAAAAAAA'],
        op: 'I',
        ts: '2026-10-05T09:30:00.000Z'
      },
      { seq: 42, tbl: 'guests', pk: ['01J9GUESTAAAAAAAAAAAAAAAAA'], op: 'U', ts: '2026-10-05T09:31:00.000Z' }
    ]
  }
  return Object.assign(Object.create(base) as typeof base, {
    kind: opts.kind ?? base.kind,
    relayCalls: calls,
    async call(name: ProcedureName, input: unknown) {
      calls.push({ name, input })
      switch (name) {
        case 'remote.relayStatus':
        case 'remote.relayRun':
          return STATUS as never
        case 'remote.epochState':
          return epoch as never
        case 'remote.conflicts':
          return conflicts as never
        case 'remote.saveConflicts':
          return { path: 'C:\\Belgeler\\x.json' } as never
        case 'remote.becomeClient':
          return { ok: true } as never
        default:
          return base.call(name, input as never)
      }
    }
  })
}

describe('şifreli kutu ve PDF özet kartı', () => {
  it('klasörü, anahtarın olmadığını ve son paketi gösterir; anahtarlar ayar yazar; "Şimdi yaz" çalışır', async () => {
    const transport = relayTransport()
    const user = userEvent.setup()
    await renderWithProviders(<RelayCard />, { transport })
    expect(await screen.findByTestId('relay-folder')).toHaveTextContent('Bismuth\\kutu')
    expect(screen.getByTestId('relay-no-key')).toHaveTextContent('Bismuth anahtarı yok')
    expect(screen.getByTestId('relay-last-segment')).toHaveTextContent(/^\d{2}:\d{2}$/)
    await user.click(screen.getByRole('switch', { name: 'Kimlik numaraları kutuya konmasın' }))
    await waitFor(() =>
      expect(transport.relayCalls).toContainEqual({
        name: 'settings.set',
        input: { 'relay.excludeIdentity': false }
      })
    )
    await user.click(screen.getByRole('switch', { name: 'Saatlik PDF özet' }))
    await waitFor(() =>
      expect(transport.relayCalls).toContainEqual({
        name: 'settings.set',
        input: { 'summary.enabled': false }
      })
    )
    await user.click(screen.getByTestId('relay-run'))
    await waitFor(() => expect(transport.relayCalls.some((c) => c.name === 'remote.relayRun')).toBe(true))
  })
})

describe('kutu ayarları telefonda (QA3d D3)', () => {
  it('telefondan (HTTP) açıldığında anahtarlar kilitli ve "Şimdi yaz" yok; yalnız okunur', async () => {
    const transport = relayTransport({ kind: 'http' })
    await renderWithProviders(<RelayCard />, { transport })
    expect(await screen.findByTestId('relay-folder')).toBeInTheDocument()
    for (const name of ['Kutuya yaz', 'Kimlik numaraları kutuya konmasın', 'Saatlik PDF özet'])
      expect(screen.getByRole('switch', { name })).toBeDisabled()
    expect(screen.queryByTestId('relay-run')).not.toBeInTheDocument()
  })
})

describe('yerine başkası geçen bilgisayar', () => {
  it('kimin ne zaman devraldığını, çakışan kayıtları gösterir; liste kaydedilir; yeni ana bilgisayara bağlanma sorulur', async () => {
    const transport = relayTransport({ replaced: true })
    const user = userEvent.setup()
    await renderWithProviders(<ReplacedCard />, { transport })
    const card = await screen.findByTestId('replaced-card')
    expect(card).toHaveTextContent('“Sahibin Mac” ana bilgisayar oldu')
    await waitFor(() => expect(screen.getByTestId('conflict-count')).toHaveTextContent('2 değişiklik var'))
    await user.click(screen.getByRole('button', { name: 'Listeyi göster' }))
    const list = screen.getByTestId('conflict-list')
    expect(within(list).getByText('Ödeme', { exact: false })).toBeInTheDocument()
    expect(within(list).getByText('Değiştirildi')).toBeInTheDocument()
    await user.click(screen.getByTestId('save-conflicts'))
    await waitFor(() =>
      expect(transport.relayCalls.some((c) => c.name === 'remote.saveConflicts')).toBe(true)
    )
    await user.click(screen.getByRole('button', { name: 'Yeni ana bilgisayara bağlan' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Yeni ana bilgisayara bağlan' }))
    await waitFor(() => expect(transport.relayCalls.some((c) => c.name === 'remote.becomeClient')).toBe(true))
  })

  it('yerine kimse geçmediyse hiçbir şey göstermez', async () => {
    await renderWithProviders(<ReplacedCard />, { transport: relayTransport() })
    await waitFor(() => expect(screen.queryByTestId('replaced-card')).not.toBeInTheDocument())
  })
})
