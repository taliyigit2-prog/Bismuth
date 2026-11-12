import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { sampleState, withP9c } from '@/test/p9c-fake'
import { setViewAs } from '@/lib/view-as'
import { InHousePage } from './in-house-page'

afterEach(() => {
  vi.restoreAllMocks()
  act(() => setViewAs('owner'))
})

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

const kpi = (label: string) =>
  within(screen.getByTestId('in-house-summary'))
    .getAllByTestId('kpi-card')
    .find((card) => card.textContent?.includes(label))!

describe('otelde kalanlar', () => {
  it('yükleniyor, hata ve yetkisiz durumları', async () => {
    const a = await renderWithProviders(<InHousePage />, {
      transport: withP9c({ ...sampleState(), hang: ['inHouse.list'] })
    })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
    a.unmount()
    const b = await renderWithProviders(<InHousePage />, {
      transport: withP9c({ ...sampleState(), fail: ['inHouse.list'] })
    })
    expect(await screen.findByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument()
    b.unmount()
    await renderWithProviders(<InHousePage />, {
      transport: withP9c({ ...sampleState(), denied: ['inHouse.list'] })
    })
    expect(await screen.findByText('Bu ekrana yetkiniz yok')).toBeInTheDocument()
  })

  it('otelde kimse yoksa boş durumu anlatır; kişi ekle ve yazdır düğmesi yok', async () => {
    const state = sampleState()
    state.inHouse = { ...state.inHouse, rooms: [], checkoutPending: [] }
    await renderWithProviders(<InHousePage />, { transport: withP9c(state) })
    expect(await screen.findByText('Otelde kimse yok')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kişi ekle' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Yazdır' })).not.toBeInTheDocument()
  })

  it('her oda kişileri, tanıtıcı not ve KBS işaretini kimin koyduğuyla; işaretsiz kişi kırmızı', async () => {
    await renderWithProviders(<InHousePage />, { transport: withP9c() })
    const r101 = await screen.findByTestId('in-house-room-101')
    expect(r101).toHaveTextContent('Kızıl saçlı, gözlüklü')
    expect(within(r101).getByTestId('occupant-o-1')).toHaveTextContent('Deniz Arslan')
    expect(within(r101).getByTestId('occupant-o-1')).toHaveAttribute('data-kbs', 'ok')
    const elif = within(r101).getByTestId('occupant-o-2')
    expect(elif).toHaveAttribute('data-kbs', 'missing')
    expect(elif).toHaveClass('border-destructive/50')
    expect(within(r101).getByText('1 KBS eksik')).toBeInTheDocument()
    expect(kpi('KBS eksiği')).toHaveTextContent('2') // Elif + Ivan (left without the KBS check-out)
    expect(screen.getByTestId('in-house-checkout-pending')).toHaveTextContent('Ivan Petrov')
  })

  it('KBS girişi de işaretlenmemiş ayrılan kişide "iki işaret birlikte" notu çıkar (P9fix #3)', async () => {
    const state = sampleState()
    state.inHouse = {
      ...state.inHouse,
      checkoutPending: state.inHouse.checkoutPending.map((p) => ({ ...p, kbsReported: false }))
    }
    await renderWithProviders(<InHousePage />, { transport: withP9c(state) })
    const pending = await screen.findByTestId('in-house-checkout-pending')
    expect(within(pending).getByTestId('pending-no-entry')).toHaveTextContent(
      'KBS girişi de işaretlenmemiş; düğme ikisini birlikte işaretler.'
    )
    expect(within(pending).getByRole('button', { name: 'KBS çıkışını yaptım' })).toBeInTheDocument()
  })

  it('otel KBS kontrollerini kapatınca işaretsiz kişi kırmızı değildir (P9fix #14)', async () => {
    const state = sampleState()
    state.inHouse = {
      ...state.inHouse,
      kbsChecks: false,
      checkoutPending: [],
      rooms: state.inHouse.rooms.map((r) => ({ ...r, kbsGaps: 0 }))
    }
    await renderWithProviders(<InHousePage />, { transport: withP9c(state) })
    const elif = await screen.findByTestId('occupant-o-2')
    expect(elif).toHaveAttribute('data-kbs', 'off')
    expect(elif).not.toHaveClass('border-destructive/50')
    expect(within(elif).queryByText('KBS girişi eksik')).not.toBeInTheDocument()
  })

  it('"kızıl" araması tanıtıcı notu bulur; uymayan aramada boş durum ve filtreyi temizle', async () => {
    await renderWithProviders(<InHousePage />, { transport: withP9c() })
    const user = userEvent.setup()
    const search = await screen.findByRole('searchbox', { name: 'Otelde kalanlarda ara' })
    await user.type(search, 'KIZIL')
    expect(screen.getByTestId('in-house-room-101')).toBeInTheDocument()
    expect(screen.queryByTestId('in-house-room-102')).not.toBeInTheDocument()
    await user.clear(search)
    await user.type(search, 'yok böyle biri')
    expect(screen.getByText('Aramaya uyan kimse yok')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Filtreyi temizle' }))
    expect(screen.getByTestId('in-house-room-102')).toBeInTheDocument()
  })

  it('"KBS\'ye bildirdim" işareti kimin koyduğuyla görünür; çıkış bekleyen işaretlenince listeden düşer', async () => {
    const transport = withP9c()
    await renderWithProviders(<InHousePage />, { transport })
    const user = userEvent.setup()
    const elif = await screen.findByTestId('occupant-o-2')
    await user.click(within(elif).getByRole('button', { name: "KBS'ye bildirdim" }))
    await waitFor(() => expect(screen.getByTestId('occupant-o-2')).toHaveAttribute('data-kbs', 'ok'))
    expect(screen.getByTestId('occupant-o-2')).toHaveTextContent('Otel Sahibi')
    expect(transport.calls).toContainEqual({
      name: 'inHouse.markKbs',
      input: { occupantId: 'o-2', mark: 'reported' }
    })
    const pending = screen.getByTestId('in-house-checkout-pending')
    await user.click(within(pending).getByRole('button', { name: 'KBS çıkışını yaptım' }))
    await waitFor(() => expect(screen.queryByTestId('in-house-checkout-pending')).not.toBeInTheDocument())
  })

  it('kişi tanıtıcı not ve KBS işaretiyle eklenir; ad yazılmadan kaydedilmez', async () => {
    const transport = withP9c()
    await renderWithProviders(<InHousePage />, { transport })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Oda 102: kişi ekle' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    expect(within(dialog).getByText('Ad soyad yazın.')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Ad soyad'), 'Lena Schmidt')
    await user.type(within(dialog).getByLabelText('Tanıtıcı not (isteğe bağlı)'), 'Sarı şapkalı')
    await user.click(within(dialog).getByRole('checkbox'))
    await user.click(within(dialog).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(transport.calls).toContainEqual({
      name: 'inHouse.addPerson',
      input: {
        stayId: 'stay-102',
        fullName: 'Lena Schmidt',
        descriptorNote: 'Sarı şapkalı',
        kbsReported: true
      }
    })
    expect(await screen.findByText('Sarı şapkalı')).toBeInTheDocument()
  })

  it('yazdır A4 gece listesini açar: liste yalnız yazdırmada görünür, her oda ve KBS durumu yazıyla', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    await renderWithProviders(<InHousePage />, { transport: withP9c() })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Yazdır' }))
    expect(print).toHaveBeenCalled()
    const sheet = screen.getByTestId('night-list')
    expect(sheet).toHaveClass('night-list', 'hidden')
    expect(sheet.parentElement).toBe(document.body)
    const rows = within(sheet).getAllByRole('row', { hidden: true })
    expect(rows).toHaveLength(3) // header + 2 rooms
    expect(rows[1]).toHaveTextContent('Elif Yılmaz — Kızıl saçlı, gözlüklü')
    expect(rows[1]).toHaveTextContent('KBS girişi eksik')
    expect(sheet).toHaveTextContent('KBS çıkışı bekleyenler: 104 Ivan Petrov')
  })

  it('yetkisi görmekle sınırlı rol düğmeleri görmez', async () => {
    act(() => setViewAs('accountant'))
    const state = sampleState()
    await renderWithProviders(<InHousePage />, { transport: withP9c(state) })
    await screen.findByTestId('in-house-room-101')
    expect(screen.queryByRole('button', { name: "KBS'ye bildirdim" })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kişi ekle' })).not.toBeInTheDocument()
  })

  it('telefonda oda kartı başlığında kişi ekleme düğmesi 44 px', async () => {
    phone()
    await renderWithProviders(<InHousePage />, { transport: withP9c() })
    const add = await screen.findByRole('button', { name: 'Oda 101: kişi ekle' })
    expect(add.className).toContain('max-md:min-w-11')
  })
  it('telefonda KBS işareti her kişi satırında kendi satırına geçer ve ad hizasında durur', async () => {
    phone()
    await renderWithProviders(<InHousePage />, { transport: withP9c() })
    const r101 = await screen.findByTestId('in-house-room-101')
    const okMark = within(within(r101).getByTestId('occupant-o-1'))
      .getByText(/KBS'ye bildirildi/)
      .closest('span.flex')
    expect(okMark?.className).toContain('max-md:basis-full')
    const missing = within(within(r101).getByTestId('occupant-o-2')).getByText(
      'KBS girişi eksik'
    ).parentElement
    expect(missing?.className).toContain('max-md:basis-full')
  })
})
