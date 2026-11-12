// Son kontrol (QA2c #4): N and "Yeni rezervasyon" open the form on the day it is now, not on the day the calendar
// was opened (the calendar is the opening screen and the reception computer stays on overnight).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import { renderApp } from '@/test/render-app'
import { resetShortcutHandlers } from '@/lib/shortcuts/actions'
import { bookingTransport } from './booking-fake'

afterEach(() => {
  resetShortcutHandlers()
  vi.useRealTimers()
})

async function calendarOpenedLastNight() {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-05T22:00:00+03:00') })
  await renderApp({ hash: '#/calendar', transport: bookingTransport() })
  await screen.findByRole('heading', { level: 1, name: 'Takvim' })
  // The night passes with the calendar on screen.
  vi.setSystemTime(new Date('2026-10-06T09:00:00+03:00'))
}

describe('yeni rezervasyon gece yarısından sonra bugünün tarihiyle açılır', () => {
  it('takvim dün açıldıysa N, girişi bugün olan formu açar', async () => {
    await calendarOpenedLastNight()
    fireEvent.keyDown(document.body, { key: 'n' })
    const dialog = await screen.findByRole('dialog', { name: 'Yeni rezervasyon' })
    expect(await within(dialog).findByLabelText('Giriş')).toHaveTextContent('6 Ekim 2026')
  })

  it('takvim dün açıldıysa "Yeni rezervasyon" düğmesi de bugünle açar', async () => {
    await calendarOpenedLastNight()
    const page = screen.getByRole('main')
    fireEvent.click(within(page).getAllByRole('button', { name: 'Yeni rezervasyon' })[0]!)
    const dialog = await screen.findByRole('dialog', { name: 'Yeni rezervasyon' })
    expect(await within(dialog).findByLabelText('Giriş')).toHaveTextContent('6 Ekim 2026')
  })
})
