import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { WeekdayPicker } from './weekday-picker'

function Picker({ onChange }: { onChange: (days: number[]) => void }) {
  const [days, setDays] = useState<number[]>([])
  return (
    <WeekdayPicker
      id="days"
      aria-labelledby="days-label"
      value={days}
      onChange={(next) => {
        setDays(next)
        onChange(next)
      }}
      itemTestId={(d) => `day-${d}`}
    />
  )
}

describe('Gün seçici', () => {
  it('yedi gün Pazartesi başta sıralanır; her düğmenin adı günün tam adıdır', async () => {
    await renderWithProviders(<Picker onChange={vi.fn()} />)
    const group = await screen.findByTestId('day-1').then((el) => el.parentElement!)
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => [b.textContent, b.getAttribute('aria-label')])
    ).toEqual([
      ['Pzt', 'Pazartesi'],
      ['Sal', 'Salı'],
      ['Çar', 'Çarşamba'],
      ['Per', 'Perşembe'],
      ['Cum', 'Cuma'],
      ['Cmt', 'Cumartesi'],
      ['Paz', 'Pazar']
    ])
  })

  it('seçilen günler sayı olarak bildirilir (0 = Pazar) ve ikinci dokunuş seçimi kaldırır', async () => {
    const onChange = vi.fn()
    await renderWithProviders(<Picker onChange={onChange} />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Pazar' }))
    await user.click(screen.getByRole('button', { name: 'Pazartesi' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.arrayContaining([0, 1]))
    expect(screen.getByRole('button', { name: 'Pazar' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Pazar' }))
    expect(onChange).toHaveBeenLastCalledWith([1])
    expect(screen.getByRole('button', { name: 'Pazar' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('telefonda dört ve üç günlük iki satıra sarılır, masaüstünde tek satırdır; 44 px hedef korunur', async () => {
    await renderWithProviders(<Picker onChange={vi.fn()} />)
    const item = await screen.findByTestId('day-1')
    const group = item.parentElement!
    // jsdom has no layout: the classes carry the rule (measured in the phone e2e, tests/e2e/mobile/admin.spec.ts).
    expect(group).toHaveClass('grid-cols-7', 'max-md:grid-cols-4', 'w-full')
    expect(item.className).toContain('max-md:min-w-11')
    expect(item.className).toContain('max-md:h-11')
  })
})
