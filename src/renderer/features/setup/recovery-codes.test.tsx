// The single "write it on paper" step (K-41): recovery codes and the Bismuth key together; the key may be missing.
import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SETTINGS_DEFAULTS, type ProcedureName } from '@shared/contract'
import { ApiError, type Transport } from '@/lib/transport'
import { renderWithProviders } from '@/test/render'
import { RecoveryCodes } from './recovery-codes'

const CODES = ['AAAA-1111', 'BBBB-2222']
const KEY = '7KQ2M-ABCDE-FGHJK-LMNPQ-RSTUV-WXYZ2-34567-89ABC-DEFGH-JKLMN-PQRST'

const transport = (key: 'ok' | 'fail' | 'wait'): Transport => ({
  kind: 'ipc',
  async call(name: ProcedureName) {
    if (name === 'settings.get') return { ...SETTINGS_DEFAULTS, 'hotel.name': 'Martı Otel' } as never
    if (name === 'backup.recoveryText') {
      if (key === 'wait') return new Promise(() => undefined)
      if (key === 'fail') throw new ApiError('CONFLICT', 409, 'errors.backupKeyUnavailable')
      return { text: KEY, createdAt: '2026-11-13T09:00:00.000Z' } as never
    }
    throw new Error(`unexpected ${name}`)
  }
})

describe('kurulum: kâğıda yazın adımı', () => {
  it('kurtarma kodları ve Bismuth anahtarı birlikte görünür; kâğıda yazdım işaretlenmeden geçilmez', async () => {
    const onContinue = vi.fn()
    renderWithProviders(<RecoveryCodes codes={CODES} onContinue={onContinue} />, {
      transport: transport('ok')
    })
    expect(await screen.findByTestId('recovery-key')).toHaveTextContent(KEY)
    expect(screen.getAllByTestId('recovery-code').map((c) => c.textContent)).toEqual(CODES)
    expect(screen.getByTestId('recovery-continue')).toBeDisabled()
    const user = userEvent.setup()
    await user.click(screen.getByTestId('recovery-written'))
    await user.click(screen.getByTestId('recovery-continue'))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  it('yazdır düğmesi kodları, anahtarı ve otel adını tek sayfada basar', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    renderWithProviders(<RecoveryCodes codes={CODES} onContinue={() => undefined} />, {
      transport: transport('ok')
    })
    await screen.findByTestId('recovery-key')
    await userEvent.setup().click(screen.getByTestId('recovery-print'))
    const sheet = await screen.findByTestId('recovery-sheet')
    expect(sheet).toHaveTextContent('AAAA-1111')
    expect(sheet).toHaveTextContent(KEY)
    await vi.waitFor(() => expect(sheet).toHaveTextContent('Martı Otel'))
    await vi.waitFor(() => expect(print).toHaveBeenCalled())
    print.mockRestore()
  })

  it('anahtar yüklenirken bilgi, alınamazsa sonradan nereden alınacağı yazılır; kodlar yine görünür', async () => {
    const waiting = await renderWithProviders(<RecoveryCodes codes={CODES} onContinue={() => undefined} />, {
      transport: transport('wait')
    })
    expect(await screen.findByText('Anahtar hazırlanıyor…')).toBeInTheDocument()
    waiting.unmount()
    await renderWithProviders(<RecoveryCodes codes={CODES} onContinue={() => undefined} />, {
      transport: transport('fail')
    })
    expect(await screen.findByTestId('recovery-key-failed')).toHaveTextContent('Ayarlar → Yedek')
    expect(screen.getAllByTestId('recovery-code')).toHaveLength(2)
  })
})
