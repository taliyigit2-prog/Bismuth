import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { CurrencyPicker } from './currency-picker'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => vi.restoreAllMocks())

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

/** The picker beside the list it adds to: one checkbox per currency, found by its DOM id. */
function WithChips({ start = ['TRY'] }: { start?: string[] }) {
  const [chips, setChips] = useState(start)
  return (
    <>
      <CurrencyPicker
        hidden={chips}
        onPick={(code) => setChips((c) => [...c, code])}
        chipId={(code) => `chip-${code}`}
      />
      <ul>
        {chips.map((code) => (
          <li key={code}>
            <label>
              <input type="checkbox" id={`chip-${code}`} defaultChecked />
              {code}
            </label>
          </li>
        ))}
      </ul>
    </>
  )
}

describe('para birimi seçici', () => {
  it('masaüstünde düğmenin altında açılır; yazılan koda ya da ada göre süzer; ok ve Enter ile seçilir', async () => {
    const onPick = vi.fn()
    await renderWithProviders(<CurrencyPicker hidden={['TRY']} onPick={onPick} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Başka para birimi ekle' }))
    expect(screen.queryByRole('dialog', { name: 'Başka para birimi ekle' })).not.toBeInTheDocument()
    const search = await screen.findByPlaceholderText('Kod ya da ad yazın…')
    expect(search).toHaveFocus()
    // Everything the platform knows, minus the codes already shown as chips.
    expect(screen.getAllByRole('option').length).toBeGreaterThan(100)
    expect(screen.queryByTestId('currency-picker-TRY')).not.toBeInTheDocument()
    await user.type(search, 'japon')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await user.keyboard('{Enter}')
    expect(onPick).toHaveBeenCalledWith('JPY')
    await waitFor(() => expect(screen.queryByPlaceholderText('Kod ya da ad yazın…')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Başka para birimi ekle' })).toHaveFocus()
  })

  it('Esc kapatır ve yazılan arama bir sonraki açılışta temizdir', async () => {
    await renderWithProviders(<CurrencyPicker hidden={[]} onPick={vi.fn()} />)
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('currency-picker'))
    await user.type(await screen.findByTestId('currency-picker-search'), 'zzz')
    expect(
      await screen.findByText('Bu koda ya da ada uyan para birimi yok. Başka bir kod ya da ad deneyin.')
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('currency-picker-search')).not.toBeInTheDocument())
    await user.click(screen.getByTestId('currency-picker'))
    expect(await screen.findByTestId('currency-picker-search')).toHaveValue('')
  })

  it('telefonda alttan açılan sayfa olur: başlığı var, tam genişlikli düğmeden açılır, seçince kapanır', async () => {
    phone()
    const onPick = vi.fn()
    await renderWithProviders(<CurrencyPicker hidden={[]} onPick={onPick} />)
    const user = userEvent.setup()
    const button = await screen.findByTestId('currency-picker')
    expect(button).toHaveClass('max-md:w-full')
    await user.click(button)
    const sheet = await screen.findByRole('dialog', { name: 'Başka para birimi ekle' })
    expect(sheet).toHaveAttribute('data-slot', 'sheet-content')
    expect(sheet).toHaveAttribute('data-state', 'open')
    await user.type(within(sheet).getByPlaceholderText('Kod ya da ad yazın…'), 'yen')
    await user.click(within(sheet).getByTestId('currency-picker-JPY'))
    expect(onPick).toHaveBeenCalledWith('JPY')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('sınırdayken düğme kapalıdır ve nedeni yazar', async () => {
    await renderWithProviders(<CurrencyPicker hidden={[]} onPick={vi.fn()} limitReached />)
    expect(await screen.findByTestId('currency-picker')).toBeDisabled()
    expect(screen.getByTestId('currency-picker')).toHaveAccessibleDescription(
      'En çok 20 para birimi kabul edilebilir. Yenisini eklemek için birinin işaretini kaldırın.'
    )
  })

  it('sınır yokken düğme açıktır ve sınır ipucu görünmez', async () => {
    await renderWithProviders(<CurrencyPicker hidden={[]} onPick={vi.fn()} />)
    expect(await screen.findByTestId('currency-picker')).toBeEnabled()
    expect(screen.queryByTestId('currency-picker-limit')).not.toBeInTheDocument()
  })

  it.each([
    ['masaüstünde', false],
    ['telefonda', true]
  ])('%s düğme bir pencere açtığını ve açık olup olmadığını bildirir', async (_name, onPhone) => {
    if (onPhone) phone()
    await renderWithProviders(<CurrencyPicker hidden={[]} onPick={vi.fn()} />)
    const user = userEvent.setup()
    const button = await screen.findByTestId('currency-picker')
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await user.click(button)
    await screen.findByTestId('currency-picker-search')
    expect(button).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(button).toHaveAttribute('aria-expanded', 'false'))
  })

  it('masaüstünde seçilince odak yeni çipe geçer, çip görünür alana kaydırılır ve ne eklendiği söylenir', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    await renderWithProviders(<WithChips />)
    const user = userEvent.setup()
    const live = await screen.findByTestId('currency-picker-announce')
    expect(live).toHaveAttribute('role', 'status')
    expect(live).toBeEmptyDOMElement()
    await user.click(screen.getByTestId('currency-picker'))
    await user.type(await screen.findByTestId('currency-picker-search'), 'japon')
    await user.keyboard('{Enter}')

    const chip = await screen.findByRole('checkbox', { name: 'JPY' })
    await waitFor(() => expect(chip).toHaveFocus())
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
    expect(scroll.mock.contexts).toContain(chip.closest('label'))
    expect(live).toHaveTextContent('Japon yeni eklendi.')
  })

  it('telefonda seçilince sayfa kapanır, odak yeni çipe geçer, çip kaydırılır ve ne eklendiği söylenir', async () => {
    phone()
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    await renderWithProviders(<WithChips />)
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('currency-picker'))
    const sheet = await screen.findByRole('dialog', { name: 'Başka para birimi ekle' })
    await user.type(within(sheet).getByPlaceholderText('Kod ya da ad yazın…'), 'yen')
    await user.click(within(sheet).getByTestId('currency-picker-JPY'))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const chip = await screen.findByRole('checkbox', { name: 'JPY' })
    await waitFor(() => expect(chip).toHaveFocus())
    expect(scroll.mock.contexts).toContain(chip.closest('label'))
    expect(screen.getByTestId('currency-picker-announce')).toHaveTextContent('Japon yeni eklendi.')
  })

  it.each([
    ['masaüstünde', false],
    ['telefonda', true]
  ])('%s Esc ile seçmeden kapanınca odak düğmeye döner ve bir şey duyurulmaz', async (_name, onPhone) => {
    if (onPhone) phone()
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    await renderWithProviders(<WithChips />)
    const user = userEvent.setup()
    const button = await screen.findByTestId('currency-picker')
    await user.click(button)
    await user.type(await screen.findByTestId('currency-picker-search'), 'japon')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByTestId('currency-picker-search')).not.toBeInTheDocument())
    await waitFor(() => expect(button).toHaveFocus())
    expect(screen.queryByRole('checkbox', { name: 'JPY' })).not.toBeInTheDocument()
    expect(screen.getByTestId('currency-picker-announce')).toBeEmptyDOMElement()
    // (The list scrolls its own highlighted row; nothing is scrolled to a chip.)
    expect(scroll.mock.contexts.some((el) => el instanceof HTMLInputElement)).toBe(false)
  })

  it('çip bulunamazsa odak düğmeye döner; eklendi bilgisi yine verilir', async () => {
    await renderWithProviders(<CurrencyPicker hidden={[]} onPick={vi.fn()} chipId={(c) => `yok-${c}`} />)
    const user = userEvent.setup()
    const button = await screen.findByTestId('currency-picker')
    await user.click(button)
    await user.type(await screen.findByTestId('currency-picker-search'), 'japon')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(button).toHaveFocus())
    expect(screen.getByTestId('currency-picker-announce')).toHaveTextContent('Japon yeni eklendi.')
  })

  it('eklendi bilgisi bir süre sonra sayfadan kalkar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      await renderWithProviders(<WithChips />)
      const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })
      await user.click(await screen.findByTestId('currency-picker'))
      await user.type(await screen.findByTestId('currency-picker-search'), 'japon')
      await user.keyboard('{Enter}')
      const live = screen.getByTestId('currency-picker-announce')
      await waitFor(() => expect(live).toHaveTextContent('Japon yeni eklendi.'))
      act(() => {
        vi.advanceTimersByTime(7000)
      })
      expect(live).toBeEmptyDOMElement()
    } finally {
      vi.useRealTimers()
    }
  })
})
