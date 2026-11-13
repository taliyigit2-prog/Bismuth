import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { PhoneField, formatPhone, type PhoneValue } from './phone-field'

function Limited({ max }: { max: number }) {
  const [v, setV] = useState('')
  const [n, setN] = useState('')
  return (
    <>
      <Input aria-label="ad" value={v} maxLength={max} onChange={(e) => setV(e.target.value)} />
      <Textarea aria-label="not" value={n} maxLength={max} onChange={(e) => setN(e.target.value)} />
    </>
  )
}

describe('sınırlı metin alanı sayaç gösterir, sessizce kesmez (H-44)', () => {
  it('sınırın %80 altında sayaç yok; yaklaşınca "n / sınır"; sınırda kırmızı uyarı', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<Limited max={60} />)
    const name = await screen.findByLabelText('ad')
    await user.type(name, 'a'.repeat(40))
    expect(document.querySelector('[data-slot=char-counter]')).toBeNull()
    await user.type(name, 'a'.repeat(10))
    expect(screen.getByText('50 / 60')).toBeInTheDocument()
    await user.type(name, 'a'.repeat(30))
    expect((name as HTMLInputElement).value).toHaveLength(60)
    expect(screen.getByText('En çok 60 karakter yazabilirsiniz.')).toBeInTheDocument()
  })

  it('uzun yapıştırma kesilir ama alan bunu söyler; çok satırlı alan da aynı', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<Limited max={100} />)
    await user.click(await screen.findByLabelText('not'))
    await user.paste('b'.repeat(400))
    expect(screen.getByText('En çok 100 karakter yazabilirsiniz.')).toBeInTheDocument()
  })

  it('birkaç karakterlik kod alanları (sınır < 20) sayaç göstermez', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<Limited max={8} />)
    await user.type(await screen.findByLabelText('ad'), 'x'.repeat(8))
    expect(document.querySelector('[data-slot=char-counter]')).toBeNull()
  })
})

function Phone({ start }: { start?: PhoneValue }) {
  const [v, setV] = useState<PhoneValue>(start ?? { code: '90', number: '' })
  return (
    <>
      <PhoneField label="Telefon" value={v} onChange={setV} />
      <output data-testid="out">{v.number ? formatPhone(v) : ''}</output>
    </>
  )
}

describe('telefon alanı yapıştırmayı doğru ayrıştırır (H-05)', () => {
  it.each([
    ['+90 532 123 45 67', '+90 532 123 45 67'],
    ['0532 123 45 67', '+90 532 123 45 67'],
    ['905321234567', '+90 532 123 45 67'],
    ['0090 532 123 45 67', '+90 532 123 45 67'],
    ['+7 900 123 4567', '+7 900 123 4567'],
    ['(0532) 123-45-67', '+90 532 123 45 67']
  ])('"%s" → "%s"', async (pasted, expected) => {
    const user = userEvent.setup()
    await renderWithProviders(<Phone />)
    await user.click(await screen.findByLabelText('Telefon'))
    await user.paste(pasted)
    expect(screen.getByTestId('out')).toHaveTextContent(expected)
  })
})
