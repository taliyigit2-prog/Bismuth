import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { adminTransport, permissionDenied } from '../settings/admin-fake'
import { AuditPage } from './audit-page'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(async () => {
  const { setViewAs } = await import('@/lib/view-as')
  setViewAs('owner')
})

const rows = () => within(screen.getByTestId('audit-list')).getAllByRole('row').slice(1)

describe('Denetim kaydı', () => {
  it('en yeni kayıt en üstte; "Daha fazla" eski sayfaları ekler, son sayfada düğme kalkar', async () => {
    const transport = adminTransport()
    await renderWithProviders(<AuditPage />, { transport })
    const user = userEvent.setup()
    await screen.findByTestId('audit-list', {}, { timeout: 5000 })
    expect(rows()).toHaveLength(50)
    expect(within(rows()[0]!).getByText('Ödeme')).toBeInTheDocument()
    expect(within(rows()[0]!).getByText('Geçersiz kıldı')).toBeInTheDocument()
    expect(within(rows()[0]!).getByText('Resepsiyon bilgisayarı')).toBeInTheDocument()
    expect(screen.getByText('50 kayıt gösteriliyor')).toBeInTheDocument()
    await user.click(screen.getByTestId('audit-more'))
    await waitFor(() => expect(rows()).toHaveLength(100), { timeout: 5000 })
    await user.click(screen.getByTestId('audit-more'))
    await waitFor(() => expect(rows()).toHaveLength(120), { timeout: 5000 })
    expect(screen.queryByTestId('audit-more')).not.toBeInTheDocument()
    const calls = transport.callsTo('audit.list') as { cursor?: string; limit: number }[]
    expect(calls.map((c) => c.cursor)).toEqual([undefined, '50', '100'])
    expect(calls.every((c) => c.limit === 50)).toBe(true)
  })

  it('kayıt türü, işlem ve kişi süzgeci servise gider; eşleşme yoksa süzgeç temizlenir', async () => {
    const transport = adminTransport()
    await renderWithProviders(<AuditPage />, { transport })
    const user = userEvent.setup()
    await screen.findByTestId('audit-list', {}, { timeout: 5000 })
    await user.click(screen.getByTestId('audit-entity'))
    await user.click(await screen.findByRole('option', { name: 'Ayar' }))
    await waitFor(() => expect(rows().every((r) => within(r).queryByText('Ayar'))).toBe(true))
    // A setting is named by its screen label, not its key.
    expect(within(rows()[0]!).getByText('Otel adı')).toBeInTheDocument()
    await user.click(screen.getByTestId('audit-user'))
    await user.click(await screen.findByRole('option', { name: 'Deniz Arslan' }))
    await user.click(screen.getByTestId('audit-action'))
    await user.click(await screen.findByRole('option', { name: 'Kaldırdı' }))
    expect(await screen.findByText('Eşleşen kayıt yok')).toBeInTheDocument()
    // One way to clear the filter: the button in the filter card (the empty list does not repeat it).
    expect(screen.getAllByRole('button', { name: 'Filtreyi temizle' })).toHaveLength(1)
    expect(transport.callsTo('audit.list').at(-1)).toEqual({
      limit: 50,
      entity: 'settings',
      userId: 'user-deniz',
      action: 'delete'
    })
    await user.click(screen.getAllByRole('button', { name: 'Filtreyi temizle' })[0]!)
    await waitFor(() => expect(rows()).toHaveLength(50), { timeout: 5000 })
  })

  it('satır açılınca önce ve sonra yan yana; değişen alan işaretli; yalnız değişenler gösterilebilir', async () => {
    await renderWithProviders(<AuditPage />, { transport: adminTransport() })
    const user = userEvent.setup()
    await screen.findByTestId('audit-list', {}, { timeout: 5000 })
    await user.click(screen.getAllByRole('button', { name: 'Ayrıntıyı aç: Ödeme' })[0]!)
    const sheet = await screen.findByTestId('audit-sheet')
    expect(within(sheet).getByText('Yanlış oda')).toBeInTheDocument()
    expect(within(sheet).getByText('01JXAMPLEPAYMENT000000ABCD')).toBeInTheDocument()
    const diff = within(sheet).getByTestId('audit-diff')
    // Only the changed field by default.
    const changed = diff.querySelectorAll('[data-changed]')
    expect(changed).toHaveLength(1)
    // Field names in the UI language; the time as a date, not ISO text.
    const voided = changed[0] as HTMLElement
    expect(within(voided).getByText('İptal zamanı')).toBeInTheDocument()
    expect(within(voided).getByText('Değişti')).toBeInTheDocument()
    expect(voided).not.toHaveTextContent('T12:59')
    expect(voided).toHaveTextContent(/4 Eki \d{4}/)
    expect(within(diff).queryByText('Tutar')).not.toBeInTheDocument()
    await user.click(within(sheet).getByTestId('only-changed'))
    // Minor units with their currency field read as money.
    expect(within(diff).getByText('Tutar')).toBeInTheDocument()
    expect(within(diff).getAllByText('₺2.500')).toHaveLength(2)
    expect(within(diff).queryByText('250000')).not.toBeInTheDocument()
  })

  it('rolün yetki değişikliği tek tek okunur: "Yetkiler › Personel kartları: Yok → Görür"; zaman damgası değişiklik sayılmaz', async () => {
    await renderWithProviders(<AuditPage />, { transport: adminTransport() })
    const user = userEvent.setup()
    await screen.findByTestId('audit-list', {}, { timeout: 5000 })
    await user.click(screen.getByRole('button', { name: 'Ayrıntıyı aç: Rol' }))
    const diff = within(await screen.findByTestId('audit-sheet')).getByTestId('audit-diff')
    const changed = [...diff.querySelectorAll<HTMLElement>('[data-changed]')]
    expect(changed.map((row) => row.dataset['field'])).toEqual(['permissions.staff'])
    const row = changed[0]!
    expect(within(row).getByText('Yetkiler')).toBeInTheDocument()
    expect(within(row).getByText('Personel kartları')).toBeInTheDocument()
    expect(within(row).getByText('Yok')).toBeInTheDocument()
    expect(within(row).getByText('Görür')).toBeInTheDocument()
    expect(diff).not.toHaveTextContent('"staff"')
    expect(within(diff).getByText('Yalnız değişen alanı göster (1)')).toBeInTheDocument()
    // Every field: the time stamp is there, as a date, and not marked as changed.
    await user.click(within(diff).getByTestId('only-changed'))
    const stamp = diff.querySelector<HTMLElement>('[data-field="updatedAt"]')!
    expect(within(stamp).getByText('Değişme zamanı')).toBeInTheDocument()
    expect(stamp).not.toHaveAttribute('data-changed')
    expect(stamp).not.toHaveTextContent('T08:00')
  })

  it('eklenen kayıtta "Önce" sütunu yoktur; tutar kendi para birimiyle yazılır', async () => {
    await renderWithProviders(<AuditPage />, { transport: adminTransport() })
    const user = userEvent.setup()
    await screen.findByTestId('audit-list', {}, { timeout: 5000 })
    await user.click(screen.getByRole('button', { name: 'Ayrıntıyı aç: Oda tipi' }))
    const diff = within(await screen.findByTestId('audit-sheet')).getByTestId('audit-diff')
    expect(within(diff).queryByTestId('audit-col-before')).not.toBeInTheDocument()
    expect(within(diff).getByTestId('audit-col-after')).toHaveTextContent('Sonra')
    const price = diff.querySelector<HTMLElement>('[data-field="basePriceMinor"]')!
    expect(within(price).getByText('Hafta içi fiyatı')).toBeInTheDocument()
    expect(price).toHaveTextContent('€3.200')
    expect(diff.querySelectorAll('td')).toHaveLength(4)
  })

  it('yetkinin göstermediği değer "Gizli (yetkiniz yok)" yazar', async () => {
    await renderWithProviders(<AuditPage />, { transport: adminTransport() })
    const user = userEvent.setup()
    await screen.findByTestId('audit-list', {}, { timeout: 5000 })
    await user.click(screen.getByRole('button', { name: 'Ayrıntıyı aç: Maaş' }))
    expect(await screen.findByTestId('audit-hidden')).toHaveTextContent('Gizli (yetkiniz yok)')
  })

  it('içe aktarmanın gerekçesi kod olarak yazılır, ekranda okuyanın dilinde görünür; kişinin gerekçesi olduğu gibi', async () => {
    const entry = (id: string, reason: string) => ({
      id,
      ts: '2026-10-04T12:00:00.000Z',
      userId: 'user-owner',
      userName: 'Otel Sahibi',
      deviceId: null,
      deviceName: null,
      entity: 'payment',
      entityId: `01JXAMPLEPAYMENT0000000${id}`,
      action: 'import' as const,
      before: null,
      after: { note: 'x' },
      reason
    })
    const transport = adminTransport({ state: { audit: [entry('A1', 'import'), entry('A2', 'Kasa farkı')] } })
    await renderWithProviders(<AuditPage />, { transport })
    const user = userEvent.setup()
    await screen.findByTestId('audit-list', {}, { timeout: 5000 })
    await user.click(screen.getAllByRole('button', { name: 'Ayrıntıyı aç: Ödeme' })[0]!)
    const sheet = await screen.findByTestId('audit-sheet')
    expect(within(sheet).getByText('İçe aktarma')).toBeInTheDocument()
    expect(within(sheet).queryByText('import')).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(screen.getAllByRole('button', { name: 'Ayrıntıyı aç: Ödeme' })[1]!)
    expect(within(await screen.findByTestId('audit-sheet')).getByText('Kasa farkı')).toBeInTheDocument()
  })

  it('denetim kaydını göremeyen rol ekranı açamaz; servis reddederse de "yetkiniz yok" görünür', async () => {
    const { setViewAs } = await import('@/lib/view-as')
    setViewAs('reception')
    const transport = adminTransport()
    const view = await renderWithProviders(<AuditPage />, { transport })
    expect(await screen.findByText('Bu ekrana yetkiniz yok')).toBeInTheDocument()
    expect(transport.callsTo('audit.list')).toEqual([])
    view.unmount()

    setViewAs('owner')
    await renderWithProviders(<AuditPage />, {
      transport: adminTransport({ refuse: { 'audit.list': permissionDenied() } })
    })
    expect(await screen.findByText('Bu ekrana yetkiniz yok')).toBeInTheDocument()
  })
})
