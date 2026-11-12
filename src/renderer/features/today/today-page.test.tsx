import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { housekeepingSummary, sampleState, withP9c } from '@/test/p9c-fake'
import { setViewAs } from '@/lib/view-as'
import { TodayPage } from './today-page'

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

describe('Bugün', () => {
  it('özet gelene kadar yükleniyor, okunamazsa yeniden dene düğmesi çıkar', async () => {
    const hanging = withP9c({ ...sampleState(), hang: ['today.summary'] })
    const view = await renderWithProviders(<TodayPage />, { transport: hanging })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
    view.unmount()
    await renderWithProviders(<TodayPage />, {
      transport: withP9c({ ...sampleState(), fail: ['today.summary'] })
    })
    expect(await screen.findByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument()
  })

  it('Bugün yetkisi olmayan rol "yetkiniz yok" görür; oda yoksa boş durum anlatır', async () => {
    const view = await renderWithProviders(<TodayPage />, {
      transport: withP9c({ ...sampleState(), denied: ['today.summary'] })
    })
    expect(await screen.findByText('Bu ekrana yetkiniz yok')).toBeInTheDocument()
    view.unmount()
    const empty = sampleState()
    empty.summary = { ...empty.summary, sellableRooms: 0 }
    await renderWithProviders(<TodayPage />, { transport: withP9c(empty) })
    expect(await screen.findByText('Henüz oda yok')).toBeInTheDocument()
  })

  it('çıkış saati geçmiş ve hâlâ odada olan misafir vurgulu; gelenin isteği adının altında; okunmamış devir', async () => {
    await renderWithProviders(<TodayPage />, { transport: withP9c() })
    const departures = await screen.findByRole('region', { name: /Bugün çıkacaklar/ })
    const late = within(departures).getByText('Carlos Ruiz').closest('li')!
    expect(late).toHaveAttribute('data-overdue', 'true')
    expect(within(late).getByText('Çıkış saati geçti')).toBeInTheDocument()
    expect(within(departures).getByText('Anna Schmidt').closest('li')).not.toHaveAttribute('data-overdue')
    const arrivals = screen.getByRole('region', { name: /Bugün gelecekler/ })
    const row = within(arrivals).getByText('Maryam Hosseini').closest('li')!
    expect(within(row).getByText('Geç gelecek, 23:30 civarı')).toBeInTheDocument()
    expect(
      within(row)
        .getByText(/Bakiye/)
        .querySelector('bdi')
    ).toHaveTextContent('₺6.000')
    expect(screen.getByTestId('handover-alert')).toHaveTextContent('203 klima sesi var.')
    expect(screen.getByRole('region', { name: /KBS eksikleri/ })).toHaveTextContent('Elif Yılmaz')
  })

  it('otelde kalan oda ve kişi sayısı; çıkış günü geçmiş misafir ve dünden beklenen giriş etiketli (P9fix #4, #7, #9)', async () => {
    const state = sampleState()
    const departures = state.summary.departures!
    const arrivals = state.summary.arrivals!
    state.summary = {
      ...state.summary,
      departures: [{ ...departures[0]!, checkIn: '2026-09-30' as never, checkOut: '2026-10-03' as never }],
      arrivals: [{ ...arrivals[0]!, checkIn: '2026-10-03' as never }]
    }
    await renderWithProviders(<TodayPage />, { transport: withP9c(state) })
    expect(await screen.findByTestId('today-in-house')).toHaveTextContent('Otelde 2 oda · 3 kişi')
    const out = screen.getByRole('region', { name: /Bugün çıkacaklar/ })
    expect(within(out).getByText('Carlos Ruiz').closest('li')).toHaveTextContent('Çıkış günü 3 Eki idi')
    const arriving = screen.getByRole('region', { name: /Bugün gelecekler/ })
    expect(within(arriving).getByText('Maryam Hosseini').closest('li')).toHaveTextContent('Dünden bekleniyor')
  })

  it('ayın ilk günlerinde turizm bildirimi hatırlatıcısı Turizm ekranına götürür', async () => {
    await renderWithProviders(<TodayPage />, { transport: withP9c() })
    const reminder = await screen.findByTestId('today-reminder-tourism')
    expect(reminder).toHaveTextContent('Turizm Bakanlığı konaklama istatistiği')
    expect(reminder).toHaveTextContent('7 gün kaldı')
    expect(within(reminder).getByRole('link', { name: 'Turizm ekranına git' })).toHaveAttribute(
      'href',
      '/tourism'
    )
    // The legal task in the task list links there too.
    const tasks = screen.getByRole('region', { name: /Bugünkü görevler/ })
    expect(within(tasks).getByRole('link', { name: 'Turizm ekranına git' })).toHaveAttribute(
      'href',
      '/tourism'
    )
  })

  it('açık arızalar önem sırasıyla; 7 gündür açık olan kırmızı', async () => {
    await renderWithProviders(<TodayPage />, { transport: withP9c() })
    const issues = await screen.findByRole('region', { name: /Açık arızalar/ })
    await within(issues).findByText('Tavandan su damlıyor')
    const items = within(issues).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Tavandan su damlıyor'),
      expect.stringContaining('Tuvalet kapağı kırık')
    ])
    expect(items[1]).toHaveAttribute('data-stale', 'true')
    expect(items[1]).toHaveTextContent('8 gündür açık')
  })

  it('görev işaretlenince "yapıldı" gider ve listeden düşer', async () => {
    const transport = withP9c()
    await renderWithProviders(<TodayPage />, { transport })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('checkbox', { name: /Yapıldı: 12:00 çıkış yapmayan/ }))
    await waitFor(() => expect(transport.calls.some((c) => c.name === 'today.completeTask')).toBe(true))
    await waitFor(() =>
      expect(screen.queryByText('12:00 çıkış yapmayan odaları ara')).not.toBeInTheDocument()
    )
  })

  it('bugünün özel günü, favori telefonlar, kasa ve personel durumu sahibe görünür; yedek uyarısı çıkar', async () => {
    await renderWithProviders(<TodayPage />, { transport: withP9c() })
    const special = await screen.findByRole('region', { name: /Bugünün özel günleri/ })
    expect(special).toHaveTextContent('Fuar')
    expect(special).toHaveTextContent('Kahvaltı 06:30')
    expect(await screen.findByRole('link', { name: /Su tesisatçısı Kemal ara/ })).toHaveAttribute(
      'href',
      'tel:05321112233'
    )
    expect(screen.getByText('Kasadaki nakit')).toBeInTheDocument()
    expect(await screen.findByTestId('today-staff')).toHaveTextContent('Deniz Arslan')
    expect(await screen.findByTestId('today-backup')).toHaveTextContent('İki gündür yedek alınmadı')
  })

  it('yapılamayan geri yükleme ve gösterilmemiş anahtar Bugün’de de söylenir, hiç yedek yokken bile (P14fix #4, #8)', async () => {
    const state = sampleState()
    state.backup = {
      ...state.backup,
      lastBackupAt: null,
      warnings: ['stale', 'restoreFailed', 'keyNotShown']
    }
    await renderWithProviders(<TodayPage />, { transport: withP9c(state) })
    const alert = await screen.findByTestId('today-backup')
    expect(alert).toHaveTextContent('Henüz yedek alınmadı')
    expect(alert).toHaveTextContent('Geri yükleme yapılamadı')
    expect(alert).toHaveTextContent('Bismuth anahtarı hiç gösterilmedi')
    expect(alert).not.toHaveTextContent('İki gündür')
  })

  it('temizlik rolü: misafir, KBS, kasa, personel ve yedek kartları yok; kirli odalar ve arızalar var', async () => {
    act(() => setViewAs('housekeeping'))
    const state = sampleState()
    state.summary = housekeepingSummary()
    await renderWithProviders(<TodayPage />, { transport: withP9c(state) })
    expect(await screen.findByRole('region', { name: /Kirli odalar/ })).toHaveTextContent('202')
    expect(screen.getByRole('region', { name: /Açık arızalar/ })).toBeInTheDocument()
    for (const gone of [/Bugün çıkacaklar/, /Bugün gelecekler/, /KBS eksikleri/, /Personel durumu/])
      expect(screen.queryByRole('region', { name: gone })).not.toBeInTheDocument()
    expect(screen.queryByText('Kasadaki nakit')).not.toBeInTheDocument()
    expect(screen.queryByTestId('today-backup')).not.toBeInTheDocument()
    expect(screen.queryByTestId('handover-alert')).not.toBeInTheDocument()
  })

  it('resepsiyon kasayı görür ama personel paneli ve yedek uyarısı yerine kendi saatini girer', async () => {
    act(() => setViewAs('reception'))
    const transport = withP9c()
    await renderWithProviders(<TodayPage />, { transport })
    expect(await screen.findByText('Kasadaki nakit')).toBeInTheDocument()
    expect(screen.queryByTestId('today-staff')).not.toBeInTheDocument()
    expect(screen.queryByTestId('today-backup')).not.toBeInTheDocument()
    await waitFor(() => expect(transport.calls.some((c) => c.name === 'staff.myEmployee')).toBe(true))
    expect(transport.calls.some((c) => c.name === 'staff.panel')).toBe(false)
  })

  it('telefonda hava durumu en üstte', async () => {
    phone()
    await renderWithProviders(<TodayPage />, { transport: withP9c() })
    const weather = await screen.findByTestId('weather-card')
    const kpis = screen.getByTestId('today-kpis')
    expect(weather.compareDocumentPosition(kpis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
