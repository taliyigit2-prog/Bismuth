// Kurulum, 4. adım: ortak para birimleri çip olarak, gerisi "Başka para birimi ekle" ile aranıp eklenir.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MAX_ACCEPTED_CURRENCIES, setupDraftSchema } from '@shared/contract'
import { COMMON_CURRENCIES } from '@/lib/currencies'
import { renderSetup, setupTransport } from './test-kit'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => vi.restoreAllMocks())

const heading = (name: string) => screen.findByRole('heading', { level: 2, name })
const openPicker = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByTestId('setup-currency-add'))
  return screen.findByTestId('setup-currency-add-search')
}

describe('kurulum: para birimi ekleme', () => {
  it('"yen" yazınca Japon yeni bulunur; seçilince işaretli çip olur, ana birim listesinde çıkar ve taslağa yazılır', async () => {
    const user = userEvent.setup()
    const { transport } = await renderSetup({ path: '/setup?step=4' })
    expect(await heading('Para birimleri')).toBeInTheDocument()
    expect(screen.queryByTestId('setup-currency-JPY')).not.toBeInTheDocument()

    await user.type(await openPicker(user), 'yen')
    expect(screen.getByTestId('setup-currency-add-JPY')).toHaveTextContent('Japon yeni')
    // Chips are not offered twice, and what does not match is not listed.
    expect(screen.queryByTestId('setup-currency-add-TRY')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('setup-currency-add-JPY'))

    expect(screen.queryByTestId('setup-currency-add-search')).not.toBeInTheDocument()
    const chip = screen.getByTestId('setup-currency-JPY')
    expect(chip).toBeChecked()
    expect(chip.closest('label')).toHaveTextContent('Japon yeni')

    await user.click(screen.getByTestId('setup-base-currency'))
    expect(await screen.findByRole('option', { name: /JPY/ })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(screen.getByTestId('setup-next'))
    expect(await heading('Oda tipleri')).toBeInTheDocument()
    expect(transport.saves.at(-1)?.draft).toMatchObject({
      money: { baseCurrency: 'TRY', currencies: ['TRY', 'EUR', 'USD', 'GBP', 'RUB', 'JPY'] }
    })
  })

  it('masaüstünde seçilince odak yeni çipe geçer, çip kaydırılır ve "eklendi" duyurulur', async () => {
    const user = userEvent.setup()
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    await renderSetup({ path: '/setup?step=4' })
    await user.type(await openPicker(user), 'yen')
    await user.click(screen.getByTestId('setup-currency-add-JPY'))

    const chip = screen.getByTestId('setup-currency-JPY')
    await waitFor(() => expect(chip).toHaveFocus())
    expect(scroll.mock.contexts).toContain(chip.closest('label'))
    expect(screen.getByTestId('setup-currency-add-announce')).toHaveTextContent('Japon yeni eklendi.')
  })

  it('telefonda alttan açılan sayfadan seçilince de odak yeni çipe geçer; Esc ile kapanınca düğmeye döner', async () => {
    const media = window.matchMedia
    window.matchMedia = ((query: string) => ({ ...media(query), matches: true })) as typeof window.matchMedia
    try {
      const user = userEvent.setup()
      const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
      await renderSetup({ path: '/setup?step=4' })
      expect(await screen.findByTestId('setup-step-of')).toHaveTextContent('Adım 4 / 13')
      const button = screen.getByTestId('setup-currency-add')

      await user.click(button)
      await user.type(await screen.findByTestId('setup-currency-add-search'), 'yen')
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(button).toHaveFocus())
      expect(screen.queryByTestId('setup-currency-JPY')).not.toBeInTheDocument()

      await user.click(button)
      await user.type(await screen.findByTestId('setup-currency-add-search'), 'yen')
      await user.click(screen.getByTestId('setup-currency-add-JPY'))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      const chip = screen.getByTestId('setup-currency-JPY')
      await waitFor(() => expect(chip).toHaveFocus())
      expect(scroll.mock.contexts).toContain(chip.closest('label'))
      expect(screen.getByTestId('setup-currency-add-announce')).toHaveTextContent('Japon yeni eklendi.')
    } finally {
      window.matchMedia = media
    }
  })

  it('kodla da aranır; eklenen birim işareti kaldırılınca çip olarak kalır ve taslaktan çıkar', async () => {
    const user = userEvent.setup()
    const { transport } = await renderSetup({ path: '/setup?step=4' })
    await user.type(await openPicker(user), 'pln')
    await user.click(screen.getByTestId('setup-currency-add-PLN'))
    expect(screen.getByTestId('setup-currency-PLN')).toBeChecked()

    await user.click(screen.getByTestId('setup-currency-PLN'))
    expect(screen.getByTestId('setup-currency-PLN')).not.toBeChecked()
    // Still listed as a chip, so it is not offered again in the picker.
    await openPicker(user)
    expect(screen.queryByTestId('setup-currency-add-PLN')).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(screen.getByTestId('setup-next'))
    expect(await heading('Oda tipleri')).toBeInTheDocument()
    expect(transport.saves.at(-1)?.draft).toMatchObject({
      money: { currencies: ['TRY', 'EUR', 'USD', 'GBP', 'RUB'] }
    })
  })

  it('eklenen birim ana para birimi olarak seçilebilir; ana birim her zaman kabul edilir', async () => {
    const user = userEvent.setup()
    await renderSetup({ path: '/setup?step=4' })
    await user.type(await openPicker(user), 'ürdün')
    await user.click(screen.getByTestId('setup-currency-add-JOD'))
    await user.click(screen.getByTestId('setup-base-currency'))
    await user.click(await screen.findByRole('option', { name: /JOD/ }))
    expect(screen.getByTestId('setup-currency-JOD')).toBeDisabled()
    expect(screen.getByTestId('setup-currency-JOD')).toBeChecked()
  })

  it('eşleşme yoksa "uyan para birimi yok" yazar', async () => {
    const user = userEvent.setup()
    await renderSetup({ path: '/setup?step=4' })
    await user.type(await openPicker(user), 'zzzqq')
    expect(
      await screen.findByText('Bu koda ya da ada uyan para birimi yok. Başka bir kod ya da ad deneyin.')
    ).toBeInTheDocument()
  })

  it('en çok kabul edilen sayıya gelince ekleme ve işaretsiz çipler kapanır, nedeni yazar; sınırdaki taslak geçerli kalır', async () => {
    const user = userEvent.setup()
    const taken = [...COMMON_CURRENCIES, 'JPY', 'PLN', 'CNY', 'CZK', 'SEK', 'NOK']
    expect(taken).toHaveLength(MAX_ACCEPTED_CURRENCIES)
    const transport = setupTransport({
      progress: { step: 4, draft: { money: { baseCurrency: 'TRY', currencies: taken } } }
    })
    await renderSetup({ transport })
    expect(await heading('Para birimleri')).toBeInTheDocument()
    expect(screen.getByTestId('setup-currency-add')).toBeDisabled()
    expect(screen.getByTestId('setup-currency-add-limit')).toHaveTextContent(
      'En çok 20 para birimi kabul edilebilir.'
    )
    expect(screen.getByTestId('setup-currency-add')).toHaveAccessibleDescription(/En çok 20/)
    // All the common ones are ticked here; switching one off frees a place again.
    await user.click(screen.getByTestId('setup-currency-CHF'))
    expect(screen.getByTestId('setup-currency-add')).toBeEnabled()
    expect(screen.queryByTestId('setup-currency-add-limit')).not.toBeInTheDocument()
    // A chip is not offered again in the picker.
    await user.click(screen.getByTestId('setup-currency-add'))
    await user.type(await screen.findByTestId('setup-currency-add-search'), 'chf')
    expect(screen.queryByTestId('setup-currency-add-CHF')).not.toBeInTheDocument()
  })

  it('sınırdayken işaretsiz çip işaretlenemez (taslak 20 birimi aşmaz)', async () => {
    // 13 of the 14 common chips (not UAH) and seven others.
    const taken = [...COMMON_CURRENCIES.slice(0, 13), 'JPY', 'PLN', 'CNY', 'CZK', 'SEK', 'NOK', 'DKK']
    const transport = setupTransport({
      progress: { step: 4, draft: { money: { baseCurrency: 'TRY', currencies: taken } } }
    })
    await renderSetup({ transport })
    expect(await heading('Para birimleri')).toBeInTheDocument()
    // UAH is a common chip but not among the twenty.
    expect(screen.getByTestId('setup-currency-UAH')).not.toBeChecked()
    expect(screen.getByTestId('setup-currency-UAH')).toBeDisabled()
    expect(screen.getByTestId('setup-currency-JPY')).toBeEnabled()
    const list = within(screen.getByRole('group', { name: 'Kabul ettiğiniz para birimleri' }))
    expect(
      list.getAllByRole('checkbox').filter((c) => c.getAttribute('aria-checked') === 'true')
    ).toHaveLength(20)
  })

  it('çok sayıda birim eklenmiş taslak sihirbazın sözleşmesine uyar', () => {
    const draft = { money: { baseCurrency: 'TRY', currencies: ['TRY', 'JPY'] } }
    expect(setupDraftSchema.shape.money.safeParse(draft.money).success).toBe(true)
    const tooMany = Array.from(
      { length: MAX_ACCEPTED_CURRENCIES + 1 },
      (_, i) => `A${String.fromCharCode(65 + i)}A`
    )
    expect(setupDraftSchema.shape.money.safeParse({ baseCurrency: 'TRY', currencies: tooMany }).success).toBe(
      false
    )
  })
})
