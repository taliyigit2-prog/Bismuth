// Phone parts of Faz 13 (madde 6): the seven-day calendar, the "add to home screen" hint, the QR code drawing.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { localDate } from '@shared/date'
import { demoHotel } from '@/mocks/demo-source'
import { calendarTransport, gridFromDemo } from '@/test/grid-fixture'
import { renderWithProviders } from '@/test/render'
import { qrPath } from '@/components/qr-code'
import { olderSide } from '@/features/auth/connect-rules'
import { isApplePhone, shouldShowInstallHint } from './install-rules'
import { MobileCalendar } from './mobile-calendar'
import { WEEK_DAYS, weekOf } from './week'

const DAY = localDate('2026-10-04')

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
})

describe('telefonda takvim: gün listesi ve 7 günlük görünüm', () => {
  it('7 gün: her gün için gelen/giden ve boş oda; satıra dokununca rezervasyon açılır; seçim hatırlanır', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-04T09:00:00'))
    const onOpen = vi.fn()
    const transport = calendarTransport(demoHotel(DAY))
    await renderWithProviders(<MobileCalendar onOpen={onOpen} />, { transport })
    expect(await screen.findByTestId('day-list')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByTestId('calendar-view-week'))
    const days = await screen.findAllByTestId('week-day')
    expect(days).toHaveLength(7)
    expect(within(days[0]!).getByRole('heading', { level: 2 })).toHaveTextContent('4 Ekim 2026 Pazar')
    const first = within(screen.getByTestId('week-list'))
      .getAllByRole('button')
      .find((b) => b.closest('li[data-testid="week-day"]'))
    expect(first).toBeDefined()
    await user.click(first!)
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem('bismuth.mobileCalendarView')).toBe('week')
    // Next week: the grid is read for the following seven days.
    await user.click(screen.getByRole('button', { name: 'Sonraki 7 gün' }))
    await waitFor(() =>
      expect(transport.calls.filter((c) => c.name === 'reservations.grid').at(-1)?.input).toEqual({
        from: '2026-10-10',
        to: '2026-10-18'
      })
    )
  })

  it('haftanın modeli dayActivity ile aynı günleri sayar', () => {
    const page = gridFromDemo(demoHotel(DAY), localDate('2026-10-03'), localDate('2026-10-11'))
    const week = weekOf(page, DAY)
    expect(week).toHaveLength(WEEK_DAYS)
    expect(week.map((d) => d.day)[6]).toBe('2026-10-10')
    for (const d of week) expect(d.free.length).toBeLessThanOrEqual(page.rooms.length)
  })
})

describe('ana ekrana ekle ipucu', () => {
  it('yalnız ağdan açılan tarayıcıda; bu bilgisayarda, programda, eklenmiş kısayolda ve kapatılınca yok', () => {
    const base = { http: true, hostname: '192.168.1.20', asApp: false, dismissed: false }
    expect(shouldShowInstallHint(base)).toBe(true)
    expect(shouldShowInstallHint({ ...base, hostname: '100.64.0.2' })).toBe(true)
    expect(shouldShowInstallHint({ ...base, http: false })).toBe(false)
    expect(shouldShowInstallHint({ ...base, hostname: '127.0.0.1' })).toBe(false)
    expect(shouldShowInstallHint({ ...base, hostname: 'localhost' })).toBe(false)
    expect(shouldShowInstallHint({ ...base, asApp: true })).toBe(false)
    expect(shouldShowInstallHint({ ...base, dismissed: true })).toBe(false)
    expect(isApplePhone('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(true)
    expect(isApplePhone('Mozilla/5.0 (Linux; Android 14)')).toBe(false)
  })
})

describe('QR kodu ve sürüm karşılaştırması', () => {
  it('QR yolu sessiz bölgeyle çizilir; adres değişince desen değişir', () => {
    const a = qrPath('http://192.168.1.20:7373')
    const b = qrPath('http://100.64.0.2:7373')
    expect(a.size).toBe(25 + 4)
    expect(a.d.startsWith('M2 2h1v1h-1z')).toBe(true)
    expect(a.d).not.toBe(b.d)
  })

  it('hangi tarafın güncellenmesi gerektiği: önce veri sürümü, sonra program sürümü', () => {
    const mine = { version: '1.2.0', schemaVersion: 11 }
    const host = (version: string, schemaVersion: number) => ({
      app: 'bismuth' as const,
      version,
      schemaVersion,
      hotelName: 'x'
    })
    expect(olderSide({ mine, host: host('1.2.0', 12) })).toBe('mine')
    expect(olderSide({ mine, host: host('1.3.0', 10) })).toBe('host')
    expect(olderSide({ mine, host: host('1.10.0', 11) })).toBe('mine')
    expect(olderSide({ mine, host: host('1.1.9', 11) })).toBe('host')
    expect(olderSide({ mine, host: null })).toBe('mine')
  })
})
