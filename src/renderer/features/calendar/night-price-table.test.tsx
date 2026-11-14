// A night's price cell (QA2a): a text that is not a price leaves no older price behind and stops the form.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { LocalDate } from '@shared/date'
import { renderWithProviders } from '@/test/render'
import { NightPriceTable } from './night-price-table'

const day = '2026-10-04' as LocalDate

describe('gece fiyatı hücresi (QA2a)', () => {
  it('"abc" ya da eksi yazılınca eski fiyat kalmaz; form gönderilmez', async () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault())
    await renderWithProviders(
      <form onSubmit={onSubmit}>
        <NightPriceTable
          label="Geceler"
          currency="TRY"
          rows={[{ date: day, priceMinor: 250_000 }]}
          onChange={onChange}
        />
      </form>
    )
    const user = userEvent.setup()
    const cell = await screen.findByRole('textbox')
    expect(cell).toHaveValue('2.500')
    await user.clear(cell)
    await user.type(cell, 'abc')
    await user.tab()
    expect(onChange).toHaveBeenLastCalledWith(day, null)
    expect(cell).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('price-cell-error')).toHaveTextContent('Tutar sayı olmalı')
    fireEvent.submit(cell.closest('form')!)
    expect(onSubmit).not.toHaveBeenCalled()
    await user.clear(cell)
    await user.type(cell, '-5')
    await user.tab()
    expect(cell).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('price-cell-error')).toHaveTextContent('sıfırdan küçük olamaz')
    await user.clear(cell)
    await user.type(cell, '99999999999999999')
    await user.tab()
    expect(screen.getByTestId('price-cell-error')).toHaveTextContent('Tutar çok büyük')
    await user.clear(cell)
    await user.type(cell, '3.000')
    await user.tab()
    expect(onChange).toHaveBeenLastCalledWith(day, 300_000)
    expect(cell).not.toHaveAttribute('aria-invalid')
  })
})
