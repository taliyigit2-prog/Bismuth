import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError } from '@/lib/transport'
import { renderWithProviders } from '@/test/render'
import { useBlockOverride } from './override'
import { OverrideDialog } from './override-dialog'

function Probe({ error }: { error: ApiError }) {
  const override = useBlockOverride<{ id: string }>()
  return (
    <>
      <button type="button" onClick={() => override.onError(error, { id: 'x' })}>
        refuse
      </button>
      <OverrideDialog override={override} onConfirm={() => {}} />
    </>
  )
}

describe('yine de yaz penceresi (QA3c1 #12)', () => {
  it('kapalı odayı söyler, "başka oda seçin" demez; gerekçe alanı aynı pencerededir', async () => {
    const error = new ApiError('CONFLICT', 409, 'errors.roomNotForSale', { room: '101' })
    await renderWithProviders(<Probe error={error} />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'refuse' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Oda 101 satışa kapalı.')
    expect(dialog).not.toHaveTextContent('Başka')
    expect(screen.getByTestId('override-reason')).toBeInTheDocument()
  })

  it('satış bloğunda odayı ve geceleri söyler', async () => {
    const error = new ApiError('CONFLICT', 409, 'errors.roomBlocked', { room: '102', dates: ['2026-10-03'] })
    await renderWithProviders(<Probe error={error} />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'refuse' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('Oda 102 3 Eki tarihinde satışa kapalı.')
  })
})
