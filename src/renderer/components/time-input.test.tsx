import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { isClock, normalizeClock, stepClock, TimeInput, typedClock } from './time-input'

function Harness({ initial = '', onSubmit }: { initial?: string; onSubmit?: (v: string) => void }) {
  const [value, setValue] = useState(initial)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.(value)
      }}
    >
      <label htmlFor="t">Saat</label>
      <TimeInput id="t" value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
    </form>
  )
}

describe('saat alanı (24 saat, faz-15 madde 11)', () => {
  it('yazılanı 24 saatlik SS:DD biçimine çevirir; saat olmayanı olduğu gibi bırakır', () => {
    expect(normalizeClock('9')).toBe('09:00')
    expect(normalizeClock('14')).toBe('14:00')
    expect(normalizeClock('930')).toBe('09:30')
    expect(normalizeClock('1430')).toBe('14:30')
    expect(normalizeClock('9:5')).toBe('09:05')
    expect(normalizeClock('14.30')).toBe('14:30')
    expect(normalizeClock('00:00')).toBe('00:00')
    expect(normalizeClock('24:00')).toBeNull()
    expect(normalizeClock('12:60')).toBeNull()
    expect(normalizeClock('2 PM')).toBeNull()
    expect(normalizeClock('')).toBeNull()
    expect(isClock('07:05')).toBe(true)
    expect(isClock('7:05')).toBe(false)
  })

  it('yazarken yalnız rakam ve iki nokta kalır; dört rakam hemen saate döner', () => {
    expect(typedClock('14a:3')).toBe('14:3')
    expect(typedClock('1430')).toBe('14:30')
    expect(typedClock('14.30')).toBe('14:30')
    expect(typedClock('9999')).toBe('9999')
  })

  it('ok tuşlarının adımı gece yarısını geçer', () => {
    expect(stepClock('23:59', 1)).toBe('00:00')
    expect(stepClock('00:00', -60)).toBe('23:00')
    expect(stepClock('', 60)).toBe('01:00')
  })

  it('İngilizcede de 24 saat: "02:00 PM" değil 14:00; alan soldan sağa ve sayısal klavyeyle', async () => {
    await renderWithProviders(<Harness initial="14:00" />, { settings: { 'ui.language': 'en' } })
    const input = await screen.findByLabelText('Saat')
    expect(input).toHaveValue('14:00')
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('dir', 'ltr')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAttribute('placeholder', 'hh:mm')
  })

  it('klavyeyle yazılır; alandan çıkınca "930" 09:30 olur', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<Harness />)
    const input = await screen.findByLabelText('Saat')
    await user.type(input, '930')
    expect(input).toHaveValue('930')
    await user.tab()
    expect(input).toHaveValue('09:30')
  })

  it('alana girince saatin tamamı seçilir; yazılan eskisinin yerine geçer', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<Harness initial="09:00" />)
    const input = await screen.findByLabelText('Saat')
    await user.click(input)
    await user.keyboard('1830')
    expect(input).toHaveValue('18:30')
  })

  it('dolu alana altıncı karakter eklenmez; saati değiştirmek için seçip yazılır', async () => {
    await renderWithProviders(<Harness initial="09:00" />)
    const input = await screen.findByLabelText('Saat')
    fireEvent.change(input, { target: { value: '09:001' } })
    expect(input).toHaveValue('09:00')
    fireEvent.change(input, { target: { value: '18:30' } })
    expect(input).toHaveValue('18:30')
  })

  it('yukarı/aşağı ok imleç saatteyse saati, dakikadaysa dakikayı değiştirir', async () => {
    await renderWithProviders(<Harness initial="14:30" />)
    const input = await screen.findByLabelText<HTMLInputElement>('Saat')
    input.setSelectionRange(1, 1)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(screen.getByTestId('value')).toHaveTextContent('15:30')
    input.setSelectionRange(4, 4)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByTestId('value')).toHaveTextContent('15:29')
    fireEvent.keyDown(input, { key: 'PageDown' })
    expect(screen.getByTestId('value')).toHaveTextContent('14:29')
  })

  it('Enter yarım yazılmış saati düzeltip formu düzeltilmiş saatle gönderir', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const onSubmit = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await renderWithProviders(<Harness onSubmit={onSubmit} />)
    await user.type(await screen.findByLabelText('Saat'), '930{Enter}')
    await vi.runAllTimersAsync()
    expect(onSubmit).toHaveBeenCalledWith('09:30')
    vi.useRealTimers()
  })
})

function FormWithSave({
  initial = '',
  onSubmit,
  saveDisabled = false
}: {
  initial?: string
  onSubmit?: (v: string) => void
  saveDisabled?: boolean
}) {
  const [value, setValue] = useState(initial)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.(value)
      }}
    >
      <label htmlFor="t">Saat</label>
      <TimeInput id="t" value={value} onChange={setValue} />
      <output data-testid="value">{value}</output>
      <button type="submit" disabled={saveDisabled}>
        Kaydet
      </button>
    </form>
  )
}

// Son kontrol (QA2c #9): pasted times and Enter with the save button off.
describe('saat alanı: yapıştırma ve kapalı kaydet düğmesi', () => {
  it('yapıştırılan "14:30:00" (saniyeli saat) 14:30 olur', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<FormWithSave initial="09:00" />)
    await user.click(await screen.findByLabelText('Saat'))
    await user.paste('14:30:00')
    expect(screen.getByTestId('value')).toHaveTextContent('14:30')
  })

  it('yapıştırılan "2:30 PM" 02:30 olmaz: olduğu gibi kalır ve saat sayılmaz', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<FormWithSave />)
    await user.click(await screen.findByLabelText('Saat'))
    await user.paste('2:30 PM')
    await user.tab()
    expect(screen.getByTestId('value')).toHaveTextContent('2:30 PM')
    expect(isClock('2:30 PM')).toBe(false)
  })

  it('başında boşlukla yapıştırılan " 9:00" 09:00 olur', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<FormWithSave />)
    await user.click(await screen.findByLabelText('Saat'))
    await user.paste(' 9:00')
    await user.tab()
    expect(screen.getByTestId('value')).toHaveTextContent('09:00')
  })

  it('kaydet düğmesi kapalıyken Enter formu göndermez; açıkken düzeltilmiş saatle gönderir', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const onSubmit = vi.fn()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const view = await renderWithProviders(<FormWithSave onSubmit={onSubmit} saveDisabled />)
    await user.type(await screen.findByLabelText('Saat'), '930{Enter}')
    await vi.runAllTimersAsync()
    expect(onSubmit).not.toHaveBeenCalled()
    view.unmount()
    await renderWithProviders(<FormWithSave onSubmit={onSubmit} />)
    await user.type(await screen.findByLabelText('Saat'), '845{Enter}')
    await vi.runAllTimersAsync()
    expect(onSubmit).toHaveBeenCalledWith('08:45')
    vi.useRealTimers()
  })
})
