// Measurement driver (prototype; only injected when BISMUTH_PERF is set). It runs the same steps as the Electron
// scenario in scripts/perf-measure.mjs: ready -> sign in -> reload -> first stay bar -> (on command) busy scenario.
// It tells the sidecar (/__perf/mark/<name>) and polls /__perf/cmd for the next command.
;(() => {
  if (window.top !== window) return
  const mark = (name) => fetch('/__perf/mark/' + name).catch(() => undefined)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const until = async (test, ms = 90000) => {
    const t0 = Date.now()
    for (;;) {
      const v = test()
      if (v) return v
      if (Date.now() - t0 > ms) return null
      await sleep(25)
    }
  }
  const api = async (name, body) => {
    const res = await fetch('/api/' + name, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {})
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  const ready = () => document.querySelector('[data-testid="app-ready"]')
  const stay = () => document.querySelector('[data-testid="tape-chart"] [data-testid^="stay-"]')

  const run = async () => {
    const phase = sessionStorage.getItem('perf-phase')
    if (phase === null) {
      await until(ready)
      mark('ready')
      const state = await api('auth.state')
      if (!state.body?.session) await api('auth.signIn', { username: 'sahip', secret: 'cok-gizli-sifre' })
      sessionStorage.setItem('perf-phase', 'reloaded')
      await mark('reloadStart')
      location.reload()
      return
    }
    await until(ready)
    await until(stay)
    await mark('calendar')
    for (;;) {
      const cmd = await fetch('/__perf/cmd').then(
        (r) => r.text(),
        () => ''
      )
      if (cmd === 'busy') {
        const chart = document.querySelector('[data-testid="tape-chart"]')
        for (let i = 0; i < 10; i++) {
          const day = chart?.querySelector('[data-testid^="tape-day-"]')
          if (chart) chart.scrollLeft += (day?.getBoundingClientRect().width ?? 40) * 7
          await sleep(300)
        }
        for (const h of ['#/reports', '#/ledger', '#/calendar']) {
          location.hash = h
          await sleep(2500)
        }
        await mark('busyDone')
      }
      await sleep(500)
    }
  }
  void run()
})()
