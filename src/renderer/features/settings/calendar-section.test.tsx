// Ayarlar → Takvim → "Takvim başlangıç yılı" (G-31, K-46 (1)).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SETTINGS_DEFAULTS } from '@shared/contract'
import { renderWithProviders } from '@/test/render'
import { setViewAs } from '@/lib/view-as'
import { adminTransport } from './admin-fake'
import { CalendarSection } from './calendar-section'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  vi.restoreAllMocks()
  act(() => setViewAs('owner'))
})

const thisYear = new Date().getFullYear()

describe('takvim başlangıç yılı', () => {
  const save = () => screen.getAllByRole('button', { name: 'Kaydet' })[0]!

  it('yıl yazılıp kaydedilir', async () => {
    const onSave = vi.fn()
    await renderWithProviders(<CalendarSection values={SETTINGS_DEFAULTS} onSave={onSave} />, {
      transport: adminTransport()
    })
    const user = userEvent.setup()
    const field = await screen.findByLabelText('Takvim başlangıç yılı')
    expect(save()).toBeDisabled()
    await user.type(field, '2015')
    await user.click(save())
    expect(onSave).toHaveBeenCalledWith({ 'calendar.startYear': 2015 }, true)
  })

  it('boş bırakılıp kaydedilirse ayar kaldırılır (en eski konaklamadan başlar)', async () => {
    const onSave = vi.fn()
    await renderWithProviders(
      <CalendarSection values={{ ...SETTINGS_DEFAULTS, 'calendar.startYear': 2015 }} onSave={onSave} />,
      { transport: adminTransport() }
    )
    const user = userEvent.setup()
    const field = await screen.findByLabelText('Takvim başlangıç yılı')
    expect(field).toHaveValue('2015')
    await user.clear(field)
    await user.click(save())
    expect(onSave).toHaveBeenCalledWith({ 'calendar.startYear': null }, true)
  })

  it('2000 öncesi ya da gelecek yıl yazılırsa uyarı çıkar ve kaydedilmez', async () => {
    const onSave = vi.fn()
    await renderWithProviders(<CalendarSection values={SETTINGS_DEFAULTS} onSave={onSave} />, {
      transport: adminTransport()
    })
    const user = userEvent.setup()
    const field = await screen.findByLabelText('Takvim başlangıç yılı')
    await user.type(field, '1999')
    expect(screen.getByRole('alert')).toHaveTextContent(`Yıl 2000 ile ${thisYear} arasında olmalı.`)
    expect(field).toHaveAttribute('aria-invalid', 'true')
    await user.clear(field)
    await user.type(field, `${thisYear + 1}{Enter}`)
    expect(screen.getAllByRole('button', { name: 'Kaydet' })[0]).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('otel ayarı yetkisi olmayan rol yılı görür ama değiştiremez (alan kapalı, düğme yok)', async () => {
    act(() => setViewAs('reception'))
    await renderWithProviders(
      <CalendarSection values={{ ...SETTINGS_DEFAULTS, 'calendar.startYear': 2018 }} onSave={vi.fn()} />,
      { transport: adminTransport() }
    )
    const field = await screen.findByLabelText('Takvim başlangıç yılı')
    expect(field).toBeDisabled()
    expect(field).toHaveValue('2018')
    expect(screen.queryByRole('button', { name: 'Kaydet' })).not.toBeInTheDocument()
  })
})
