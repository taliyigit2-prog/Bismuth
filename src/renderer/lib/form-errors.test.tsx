import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { contactInputSchema } from '@shared/contract/supply'
import { renderWithProviders } from '@/test/render'
import { numberInLimits, useRangeText, useSchemaErrors, useServerFieldErrors } from './form-errors'
import { ApiError } from './transport/types'

describe('numberInLimits', () => {
  it('yazıldığı gibi okur: boş, kesirli, sınır dışı geçmez', () => {
    const n = { min: 1, max: 500, integer: true }
    expect(['1', '500', ' 42 '].map((v) => numberInLimits(v, n))).toEqual([true, true, true])
    expect(['', '0', '-1', '501', '1.5', '1,5', 'abc', '1e3'].map((v) => numberInLimits(v, n))).toEqual(
      Array(8).fill(false)
    )
    expect(numberInLimits('2,75', { min: 0 })).toBe(true)
  })
})

function Probe() {
  const range = useRangeText()
  const check = useSchemaErrors()
  const server = useServerFieldErrors()
  const local = check(contactInputSchema, { name: 'Ş'.repeat(121), category: 'custom', customCategory: '' })
  const fromFlattened = server(
    new ApiError('VALIDATION', 400, 'errors.validation', { fieldErrors: { address: ['x'], patch: ['y'] } }),
    undefined,
    { name: 'Ali', address: 'x' }
  )
  const other = server(new ApiError('CONFLICT', 409, 'errors.conflict'))
  return (
    <ul>
      <li data-testid="range">{range({ min: 0, max: 100_000, integer: true })}</li>
      <li data-testid="local">{JSON.stringify(local)}</li>
      <li data-testid="server">{JSON.stringify(fromFlattened)}</li>
      <li data-testid="other">{String(other)}</li>
    </ul>
  )
}

describe('form hataları sözleşme şemasından', () => {
  it('sınır metni biçimli sayıyla; şema sorunları alan yoluna; sunucu yanıtı formun alanlarına', async () => {
    await renderWithProviders(<Probe />)
    expect(await screen.findByTestId('range')).toHaveTextContent('0 ile 100.000 arasında bir tam sayı yazın.')
    expect(JSON.parse(screen.getByTestId('local').textContent ?? '{}')).toEqual({
      name: 'En çok 120 karakter yazabilirsiniz.',
      customCategory: 'Bu değer kabul edilmedi. Düzeltip yeniden kaydedin.'
    })
    expect(JSON.parse(screen.getByTestId('server').textContent ?? '{}')).toEqual({
      address: 'Bu değer kabul edilmedi. Düzeltip yeniden kaydedin.'
    })
    expect(screen.getByTestId('other')).toHaveTextContent('null')
  })
})
