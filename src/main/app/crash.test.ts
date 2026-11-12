// Faz 16 madde 2: an error nobody caught is logged and the user is asked what to do — once, not in a flood.
import { describe, expect, it, vi } from 'vitest'
import {
  AUTO_RELOAD_LIMIT,
  AUTO_RELOAD_PERIOD_MS,
  createCrashHandler,
  DIALOG_GAP_MS,
  type CrashChoice,
  type CrashQuestion
} from './crash'

function setup(choice: CrashChoice = 'continue') {
  let now = 1_000_000
  const log = { error: vi.fn(), warn: vi.fn() }
  const ask = vi.fn(() => Promise.resolve(choice))
  const restart = vi.fn()
  const handler = createCrashHandler({ log, ask, restart, now: () => now })
  return { handler, log, ask, restart, advance: (ms: number) => (now += ms) }
}

describe('beklenmeyen hata (ana süreç)', () => {
  it('yakalanmamış hata günlüğe yazılır, kullanıcıya sorulur; "Yeniden başlat" programı yeniden başlatır', async () => {
    const { handler, log, ask, restart } = setup('restart')
    const error = new Error('boom')
    await handler.uncaught(error)
    expect(log.error).toHaveBeenCalledWith('uncaught exception', error)
    expect(ask).toHaveBeenCalledWith('main')
    expect(restart).toHaveBeenCalledOnce()
  })

  it('"Devam et" programı açık bırakır; bir dakika içinde tekrar eden hata yeni pencere açmaz ama günlüğe yazılır', async () => {
    const { handler, log, ask, restart, advance } = setup('continue')
    await handler.uncaught(new Error('a'))
    await handler.uncaught(new Error('b'))
    expect(ask).toHaveBeenCalledTimes(1)
    expect(log.error).toHaveBeenCalledTimes(2)
    expect(restart).not.toHaveBeenCalled()
    advance(DIALOG_GAP_MS)
    await handler.uncaught(new Error('c'))
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it('bekleyeni olmayan promise hatası yalnızca günlüğe yazılır (arka plan işi)', () => {
    const { handler, log, ask } = setup()
    handler.unhandledRejection(new Error('rates timeout'))
    expect(log.warn).toHaveBeenCalledOnce()
    expect(ask).not.toHaveBeenCalled()
  })

  it('pencere çökünce "Pencereyi yeniden aç" pencereyi yeniler; olağan kapanış sessizdir', async () => {
    const { handler, log, ask } = setup('reload')
    const reload = vi.fn()
    await handler.windowGone({ reason: 'clean-exit', exitCode: 0 }, reload)
    expect(ask).not.toHaveBeenCalled()
    await handler.windowGone({ reason: 'crashed', exitCode: 133 }, reload)
    expect(log.error).toHaveBeenCalledWith('window gone', 'crashed', 133)
    expect(ask).toHaveBeenCalledWith('window')
    expect(reload).toHaveBeenCalledOnce()
  })

  it('soru penceresi açılamazsa (program henüz hazır değil) hata yine günlükte kalır, program durmaz', async () => {
    const log = { error: vi.fn(), warn: vi.fn() }
    const handler = createCrashHandler({
      log,
      ask: () => Promise.reject(new Error('not ready')),
      restart: vi.fn()
    })
    await expect(handler.uncaught(new Error('early'))).resolves.toBeUndefined()
    expect(log.error).toHaveBeenCalledOnce()
    handler.childGone({ type: 'GPU', reason: 'crashed', exitCode: 1 })
    expect(log.warn).toHaveBeenCalledWith('child process gone', 'GPU', 'crashed', 1)
  })
})

// Son kontrol (QA2c #1): a window that crashes again must not stay a dead page.
describe('çökme döngüsü: pencere her zaman geri gelir', () => {
  it('pencere bir dakika içinde ikinci kez çökerse soru sorulmadan kendiliğinden yeniden açılır', async () => {
    const { handler, ask, advance } = setup('reload')
    const reload = vi.fn()
    await handler.windowGone({ reason: 'crashed', exitCode: 133 }, reload)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
    advance(20_000)
    await handler.windowGone({ reason: 'oom', exitCode: -536870904 }, reload)
    expect(ask).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('ana süreç hata penceresi açıkken pencere çökerse sıraya girer; soru kapanınca pencere yeniden açılır', async () => {
    let releaseMain: (v: CrashChoice) => void = () => {}
    const log = { error: vi.fn(), warn: vi.fn() }
    const ask = vi.fn((kind: CrashQuestion) =>
      kind === 'main'
        ? new Promise<CrashChoice>((r) => (releaseMain = r))
        : Promise.resolve<CrashChoice>('reload')
    )
    const handler = createCrashHandler({ log, ask, restart: vi.fn(), now: () => 5_000_000 })
    const main = handler.uncaught(new Error('boom'))
    const reload = vi.fn()
    const gone = handler.windowGone({ reason: 'crashed', exitCode: 1 }, reload)
    await Promise.resolve()
    expect(reload).not.toHaveBeenCalled()
    releaseMain('continue')
    await main
    await gone
    expect(reload).toHaveBeenCalledOnce()
    // One question on screen only.
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('5 dakikada 3 kendiliğinden açılıştan sonra "yeniden başlat / kapat" sorulur; "Kapat" programı kapatır', async () => {
    let now = 1_000_000
    const log = { error: vi.fn(), warn: vi.fn() }
    const answers: CrashChoice[] = ['reload', 'close']
    const ask = vi.fn((_kind: CrashQuestion) => Promise.resolve(answers.shift() ?? 'continue'))
    const quit = vi.fn()
    const restart = vi.fn()
    const handler = createCrashHandler({ log, ask, restart, quit, now: () => now })
    const reload = vi.fn()
    await handler.windowGone({ reason: 'crashed' }, reload)
    for (let i = 0; i < AUTO_RELOAD_LIMIT; i++) {
      now += 10_000
      await handler.windowGone({ reason: 'crashed' }, reload)
    }
    expect(reload).toHaveBeenCalledTimes(1 + AUTO_RELOAD_LIMIT)
    expect(ask).toHaveBeenCalledTimes(1)
    now += 10_000
    await handler.windowGone({ reason: 'crashed' }, reload)
    expect(ask).toHaveBeenLastCalledWith('windowLoop')
    expect(quit).toHaveBeenCalledOnce()
    expect(restart).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1 + AUTO_RELOAD_LIMIT)
  })

  it('eski kendiliğinden açılışlar 5 dakika sonra sayılmaz', async () => {
    let now = 1_000_000
    const ask = vi.fn((_kind: CrashQuestion) => Promise.resolve<CrashChoice>('reload'))
    const handler = createCrashHandler({
      log: { error: vi.fn(), warn: vi.fn() },
      ask,
      restart: vi.fn(),
      now: () => now
    })
    const reload = vi.fn()
    await handler.windowGone({ reason: 'crashed' }, reload)
    for (let i = 0; i < AUTO_RELOAD_LIMIT; i++) {
      now += 10_000
      await handler.windowGone({ reason: 'crashed' }, reload)
    }
    // A question (a minute passed), then a crash right after it: the older automatic openings have expired.
    now += AUTO_RELOAD_PERIOD_MS
    await handler.windowGone({ reason: 'crashed' }, reload)
    now += 10_000
    await handler.windowGone({ reason: 'crashed' }, reload)
    expect(ask).not.toHaveBeenCalledWith('windowLoop')
    expect(reload).toHaveBeenCalledTimes(3 + AUTO_RELOAD_LIMIT)
  })
})
