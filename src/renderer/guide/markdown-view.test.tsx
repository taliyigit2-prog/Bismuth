import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { parseMarkdown } from './markdown'
import { MarkdownView } from './markdown-view'

const view = (source: string) =>
  renderWithProviders(<MarkdownView blocks={parseMarkdown(source)} lang="tr" section="payments" />)

describe('kılavuz sayfasının çizimi', () => {
  it('başlıkları çapalı, listeleri, kalın yazıyı ve tuşları React öğesi olarak çizer', async () => {
    await view('## Kasa {#cash-drawer}\n\n1. **Teslim al**a basın.\n2. <kbd>Enter</kbd> kaydeder.\n\n- madde')
    const heading = await screen.findByRole('heading', { level: 3, name: 'Kasa' })
    expect(heading).toHaveAttribute('id', 'guide-cash-drawer')
    expect(screen.getAllByRole('list').map((l) => l.tagName)).toEqual(['OL', 'UL'])
    expect(screen.getByText('Teslim al').tagName).toBe('STRONG')
    expect(screen.getByText('Enter').tagName).toBe('KBD')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('kılavuz içi bağlantı kılavuz adresine, ekran bağlantısı ekrana gider', async () => {
    await view('[Kasa](#cash-drawer) · [Kayıt](guide:reservations#cancel) · [Defter](app:/ledger)')
    expect(await screen.findByRole('link', { name: 'Kasa' })).toHaveAttribute(
      'href',
      '/guide?s=payments&a=cash-drawer'
    )
    expect(screen.getByRole('link', { name: 'Kayıt' })).toHaveAttribute(
      'href',
      '/guide?s=reservations&a=cancel'
    )
    expect(screen.getByRole('link', { name: 'Defter' })).toHaveAttribute('href', '/ledger')
  })

  it('HTML yazı olarak kalır: betik, resim ya da dış bağlantı sayfaya girmez', async () => {
    const { container } = await view(
      'Deneme <img src=x onerror=alert(1)> <script>alert(1)</script> [dış](https://example.com)'
    )
    await screen.findByText(/Deneme/)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(container.textContent).toContain('<script>alert(1)</script>')
  })

  it('ipucu ve dikkat kutusu simge ve sözcükle çıkar; resim kılavuzun görüntüsünden gelir', async () => {
    const { container } = await view(
      '> [!warning]\n> Dikkatli olun.\n\n> [!tip]\n> Kısa yol.\n\n![Takvim](calendar)'
    )
    expect(await screen.findByText('Dikkat')).toBeInTheDocument()
    expect(screen.getByText('İpucu')).toBeInTheDocument()
    expect(container.querySelector('[data-guide-callout="warning"]')).toHaveTextContent('Dikkatli olun.')
    const img = screen.getByRole('img', { name: 'Takvim' })
    expect(img.getAttribute('src')).toMatch(/img\/tr\/calendar\.jpg/)
  })

  it('olmayan resim boş yer bırakmaz', async () => {
    const { container } = await view('![Yok](olmayan-resim)\n\nMetin')
    await screen.findByText('Metin')
    expect(container.querySelector('img')).toBeNull()
  })

  it('[[shortcuts]] programın kısayol tablosunu çizer ("?" listesiyle aynı satırlar)', async () => {
    const { container } = await view('[[shortcuts]]')
    expect(await screen.findByText('Yeni rezervasyon')).toBeInTheDocument()
    expect(container.querySelector('[data-shortcut="add-payment"]')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 4, name: 'Her ekranda' })).toBeInTheDocument()
  })
})
