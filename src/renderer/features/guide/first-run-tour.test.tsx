import { afterEach, describe, expect, it } from 'vitest'
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FAKE_ACCOUNTS } from '@/test/render'
import { renderApp } from '@/test/render-app'
import { closeTour, resetTour, startTour } from './tour-store'

afterEach(() => act(() => resetTour()))

const tourOn = { 'guide.tourForNewUsers': true, 'ui.tourDone': false }

describe('ilk açılış turu', () => {
  it('yeni kullanıcıya kendiliğinden bir kez gösterilir; adımlar ileri ve geri gider', async () => {
    await renderApp({ settings: tourOn })
    const tour = await screen.findByTestId('guide-tour')
    expect(tour).toHaveAttribute('data-step', 'today')
    expect(screen.getByTestId('guide-tour-progress')).toHaveTextContent('Adım 1 / 6')
    expect(tour).toHaveTextContent('Hoş geldiniz')
    const user = userEvent.setup()
    await user.click(screen.getByTestId('guide-tour-next'))
    expect(screen.getByTestId('guide-tour')).toHaveAttribute('data-step', 'calendar')
    await user.click(screen.getByTestId('guide-tour-back'))
    expect(screen.getByTestId('guide-tour')).toHaveAttribute('data-step', 'today')
  })

  it('"Turu atla" turu kapatır ve kullanıcı için ui.tourDone kaydeder', async () => {
    const { transport } = await renderApp({ settings: tourOn })
    await userEvent.setup().click(await screen.findByTestId('guide-tour-skip'))
    await waitFor(() => expect(screen.queryByTestId('guide-tour')).not.toBeInTheDocument())
    await waitFor(() =>
      expect(transport.calls).toContainEqual({ name: 'settings.set', input: { 'ui.tourDone': true } })
    )
  })

  it('son adımda "Bitir" ile biter; Esc de turu kapatır', async () => {
    const { transport } = await renderApp({ settings: tourOn })
    const user = userEvent.setup()
    await screen.findByTestId('guide-tour')
    for (let i = 0; i < 5; i++) await user.click(screen.getByTestId('guide-tour-next'))
    expect(screen.getByTestId('guide-tour')).toHaveAttribute('data-step', 'guide')
    expect(screen.queryByTestId('guide-tour-skip')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('guide-tour-done'))
    await waitFor(() => expect(screen.queryByTestId('guide-tour')).not.toBeInTheDocument())
    expect(transport.calls.filter((c) => c.name === 'settings.set')).toHaveLength(1)

    act(() => startTour())
    const tour = await screen.findByTestId('guide-tour')
    await user.type(tour, '{Escape}')
    await waitFor(() => expect(screen.queryByTestId('guide-tour')).not.toBeInTheDocument())
  })

  it('turu görmüş kullanıcıya ve otel turu kapattıysa gösterilmez; kılavuzdan yeniden başlar', async () => {
    await renderApp({ settings: { 'guide.tourForNewUsers': true, 'ui.tourDone': true } })
    await screen.findByTestId('guide-help')
    expect(screen.queryByTestId('guide-tour')).not.toBeInTheDocument()
    act(() => startTour())
    expect(await screen.findByTestId('guide-tour')).toHaveAttribute('data-step', 'today')
  })

  it('turu kapatan kişiden sonra aynı pencerede oturum açan yeni hesap turu yine kendiliğinden görür (QA2c #13)', async () => {
    // Someone else closed the tour in this window earlier ("Başka kullanıcı", a shift handover).
    act(() => closeTour('u-onceki'))
    const view = await renderApp({ settings: tourOn })
    expect(await screen.findByTestId('guide-tour')).toBeInTheDocument()
    view.unmount()
    // The person who closed it does not get it back by itself in this window.
    act(() => closeTour(FAKE_ACCOUNTS[0]!.id))
    await renderApp({ settings: tourOn })
    await screen.findByTestId('guide-help')
    expect(screen.queryByTestId('guide-tour')).not.toBeInTheDocument()
  })

  it('otel ayarı kapalıyken yeni kullanıcıya da çıkmaz', async () => {
    await renderApp({ settings: { 'guide.tourForNewUsers': false, 'ui.tourDone': false } })
    await screen.findByTestId('guide-help')
    expect(screen.queryByTestId('guide-tour')).not.toBeInTheDocument()
  })

  it('rolün göremediği ekranların adımları atlanır: kat görevlisi yalnız Bugün ve kılavuz adımını görür', async () => {
    const accounts = [{ ...FAKE_ACCOUNTS[0]!, id: 'u-hk', roleCode: 'housekeeping' as const }]
    await renderApp({ accounts, signedIn: 'u-hk', settings: tourOn })
    expect(await screen.findByTestId('guide-tour-progress')).toHaveTextContent('Adım 1 / 2')
  })
})
