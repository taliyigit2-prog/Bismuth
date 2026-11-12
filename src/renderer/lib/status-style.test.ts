import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { tagClass } from '@/lib/theme/user-theme'
import { useTagStyles } from './status-style'

const css = (): string => document.getElementById('tag-colors')?.textContent ?? ''

afterEach(() => cleanup())

describe('useTagStyles (<style id="tag-colors">)', () => {
  it('ızgara ve panel aynı anda yazar: ikisinin etiketleri birlikte kalır, biri kapanınca yalnız onunki gider', () => {
    // The calendar writes every custom tag; the panel only the enabled ones (and a VIP tag it just created).
    const grid = renderHook(() =>
      useTagStyles([
        { id: 'tag-grup', color: '#2563eb' },
        { id: 'tag-eski', color: '#16a34a' }
      ])
    )
    const panel = renderHook(() => useTagStyles([{ id: 'tag-vip', color: '#7c3aed' }]))
    expect(css()).toContain(`.${tagClass('tag-grup')}`)
    expect(css()).toContain(`.${tagClass('tag-eski')}`)
    expect(css()).toContain(`.${tagClass('tag-vip')}`)
    panel.unmount()
    expect(css()).toContain(`.${tagClass('tag-grup')}`)
    expect(css()).not.toContain(`.${tagClass('tag-vip')}`)
    grid.unmount()
    expect(css()).toBe('')
  })

  it('aynı etiketin en son yazılan rengi geçerlidir (ayarda değiştirilen renk anında görünür)', () => {
    renderHook(() => useTagStyles([{ id: 'tag-vip', color: '#7c3aed' }]))
    const editor = renderHook(({ color }) => useTagStyles([{ id: 'tag-vip', color }]), {
      initialProps: { color: '#7c3aed' }
    })
    editor.rerender({ color: '#dc2626' })
    expect(css()).toContain('--tag: #dc2626')
    expect(css()).not.toContain('#7c3aed')
  })
})
