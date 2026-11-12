// The owner's computer in client mode (faz-13 madde 3–5): the read-only copy's state, the Drive box folder and the
// Bismuth key (typed in once; a different key already here is replaced only after a question), and the takeover
// wizard (new password twice; when the main computer still answers, only with "Yine de devral").
import { beforeAll, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SETTINGS_DEFAULTS, type ProcedureName } from '@shared/contract'
import type { ReplicaStatus } from '@shared/contract/remote'
import { ApiError } from '@/lib/transport'
import { fakeTransport, renderWithProviders } from '@/test/render'
import { ReplicaCard } from './replica-card'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

const KEY = '7KQ2M-ABCDE-FGHJK-MNPQR-STVWX-YZ012-34567-89ABC-DEFGH-JKMNP-QRSTV'

const STATUS: ReplicaStatus = {
  state: 'relay',
  asOf: new Date().toISOString(),
  source: 'relay',
  serving: true,
  userName: 'Sahip',
  key: { exists: false, available: true },
  box: {
    folder: '/Users/sahip/Google Drive/Drive’ım/Bismuth/kutu',
    chosen: null,
    problem: 'noKey',
    lastReadAt: null
  },
  takeover: { possible: false, reason: 'noKey' }
}

function copyTransport(initial: ReplicaStatus = STATUS, opts: { keyExists?: boolean } = {}) {
  const base = fakeTransport({ ...SETTINGS_DEFAULTS, 'app.mode': 'client' })
  let status = initial
  const calls: { name: ProcedureName; input: unknown }[] = []
  return Object.assign(Object.create(base) as typeof base, {
    copyCalls: calls,
    async call(name: ProcedureName, input: unknown) {
      calls.push({ name, input })
      switch (name) {
        case 'remote.replicaStatus':
        case 'remote.replicaSync':
        case 'remote.replicaPickFolder':
          return status as never
        case 'remote.replicaSetKey': {
          const replace = (input as { replace?: boolean }).replace
          if (opts.keyExists && !replace) throw new ApiError('CONFLICT', 409, 'errors.backupKeyExists')
          status = {
            ...status,
            key: { exists: true, available: true },
            box: { ...status.box, problem: null },
            takeover: { possible: true, reason: 'hostReachable' }
          }
          return status as never
        }
        case 'remote.takeOver':
          return { ok: true } as never
        default:
          return base.call(name, input as never)
      }
    }
  })
}

describe('yedek kopya kartı (istemci)', () => {
  it('kopyanın saatini, kimin adına tutulduğunu ve ekranların kopyadan gösterildiğini söyler', async () => {
    await renderWithProviders(<ReplicaCard />, { transport: copyTransport() })
    expect(await screen.findByTestId('replica-state')).toHaveTextContent(
      /Güncel · \d{2}:\d{2} \(Drive kutusundan\)/
    )
    expect(
      screen.getByText('Kopya Sahip adına tutuluyor; ekranlar onun yetkileriyle görünür.')
    ).toBeInTheDocument()
    expect(screen.getByTestId('replica-serving')).toBeInTheDocument()
    expect(screen.getByTestId('replica-box-problem')).toHaveTextContent(
      'Kutuyu okumak için Bismuth anahtarını'
    )
    // Takeover waits for the key.
    expect(screen.getByTestId('takeover-open')).toBeDisabled()
    expect(screen.getByText('Önce Bismuth anahtarını girin.')).toBeInTheDocument()
  })

  it('kâğıttaki anahtar girilir; bu bilgisayarda başka anahtar varsa önce sorulur, onayla değiştirilir', async () => {
    const transport = copyTransport(STATUS, { keyExists: true })
    const user = userEvent.setup()
    await renderWithProviders(<ReplicaCard />, { transport })
    await user.click(await screen.findByTestId('replica-key-enter'))
    await user.type(screen.getByTestId('replica-key-input'), '7KQ2M-ABCDE-FGHJK-MNPQR-STVWX')
    await user.click(screen.getByTestId('replica-key-save'))
    expect(await screen.findByText('Bu bilgisayarın anahtarı değiştirilsin mi?')).toBeInTheDocument()
    await user.click(screen.getByTestId('replica-key-replace'))
    await waitFor(() => expect(screen.getByTestId('replica-key-state')).toHaveTextContent('kayıtlı'))
    expect(transport.copyCalls.filter((c) => c.name === 'remote.replicaSetKey').map((c) => c.input)).toEqual([
      { text: '7KQ2M-ABCDE-FGHJK-MNPQR-STVWX' },
      { text: '7KQ2M-ABCDE-FGHJK-MNPQR-STVWX', replace: true }
    ])
  })

  it('devral: şifre iki kez aynı ve en az 8 karakter, kâğıttaki anahtar yeniden yazılır (K-45); ana bilgisayar çalışıyorsa "Yine de devral" işaretlenmeden gitmez', async () => {
    const ready: ReplicaStatus = {
      ...STATUS,
      key: { exists: true, available: true },
      box: { ...STATUS.box, problem: null },
      takeover: { possible: true, reason: 'hostReachable' }
    }
    const transport = copyTransport(ready)
    const user = userEvent.setup()
    await renderWithProviders(<ReplicaCard />, { transport })
    await user.click(await screen.findByTestId('takeover-open'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Drive kutusuna yeni dönem notu yazılır/)).toBeInTheDocument()
    await user.type(within(dialog).getByTestId('takeover-password'), 'kisa')
    await user.click(within(dialog).getByTestId('takeover-confirm'))
    expect(within(dialog).getByTestId('takeover-password')).toHaveAttribute('aria-invalid', 'true')
    await user.clear(within(dialog).getByTestId('takeover-password'))
    await user.type(within(dialog).getByTestId('takeover-password'), 'yeni-sifre-123')
    await user.type(within(dialog).getByTestId('takeover-again'), 'yeni-sifre-124')
    await user.click(within(dialog).getByTestId('takeover-confirm'))
    expect(within(dialog).getByText('Şifreler aynı değil.')).toBeInTheDocument()
    await user.clear(within(dialog).getByTestId('takeover-again'))
    await user.type(within(dialog).getByTestId('takeover-again'), 'yeni-sifre-123')
    // Without the key from the paper nothing goes (K-45 (4)).
    await user.click(within(dialog).getByTestId('takeover-force'))
    await user.click(within(dialog).getByTestId('takeover-confirm'))
    expect(within(dialog).getByTestId('takeover-key')).toHaveAttribute('aria-invalid', 'true')
    expect(transport.copyCalls.some((c) => c.name === 'remote.takeOver')).toBe(false)
    await user.click(within(dialog).getByTestId('takeover-force'))
    await user.type(within(dialog).getByTestId('takeover-key'), KEY)
    await user.click(within(dialog).getByTestId('takeover-confirm'))
    expect(transport.copyCalls.some((c) => c.name === 'remote.takeOver')).toBe(false)
    await user.click(within(dialog).getByTestId('takeover-force'))
    await user.click(within(dialog).getByTestId('takeover-confirm'))
    await waitFor(() =>
      expect(transport.copyCalls.find((c) => c.name === 'remote.takeOver')?.input).toEqual({
        password: 'yeni-sifre-123',
        keyText: KEY,
        force: true
      })
    )
  })

  it('henüz kopya yoksa nasıl başlayacağını söyler', async () => {
    await renderWithProviders(<ReplicaCard />, {
      transport: copyTransport({ ...STATUS, state: 'off', asOf: null, userName: null, serving: false })
    })
    expect(await screen.findByTestId('replica-state')).toHaveTextContent('Henüz yedek kopya yok')
    expect(screen.getByTestId('replica-sync')).toBeDisabled()
  })
})
