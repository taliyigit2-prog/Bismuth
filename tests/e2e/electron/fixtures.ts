// Launch the built app with a throw-away data folder (idea from electron-db e2e fixtures, MIT). A fresh data folder
// starts in the setup wizard (Faz 4): by default `launch()` sets the hotel up through the API with a small draft
// and signs the owner in; `{ signIn: false }` leaves the window signed out, `{ setup: false }` leaves the wizard.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test as base, _electron, type ElectronApplication, type Page } from '@playwright/test'
import { api, completeSetup, reload, signIn } from '../bridge'

export interface LaunchOptions {
  /** Data folder (default: the test's own fresh folder). */
  dir?: string
  /** Set the hotel up when it is not (default true). */
  setup?: boolean
  /** Sign the owner in (default true; needs setup). */
  signIn?: boolean
  /** Fake server for the optional online data (default: a closed port, nothing answers). */
  externalOrigin?: string
  /** Extra environment for the app (the camera spec points the sidecar at the Node stand-in). */
  env?: Record<string, string>
}

export interface Launched {
  app: ElectronApplication
  page: Page
  requests: string[]
  /** Recovery codes of the owner, when this launch set the hotel up. */
  recoveryCodes: string[]
}

export interface AppFixtures {
  userData: string
  launch: (options?: string | LaunchOptions) => Promise<Launched>
}

const root = resolve(__dirname, '../../..')

export const test = base.extend<AppFixtures>({
  // eslint-disable-next-line no-empty-pattern
  userData: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'bismuth-e2e-'))
    await use(dir)
    rmSync(dir, { recursive: true, force: true })
  },
  launch: async ({ userData }, use, testInfo) => {
    const apps: ElectronApplication[] = []
    /** The app's own output (main-process log lines, Chromium warnings): attached when a test fails. */
    const output: string[] = []
    const dirs: string[] = []
    await use(async (options = {}) => {
      const opts: LaunchOptions = typeof options === 'string' ? { dir: options } : options
      const app = await _electron.launch({
        args: [root, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
        env: {
          ...process.env,
          BISMUTH_USER_DATA: opts.dir ?? userData,
          // The data folder doubles as "home" for the Drive lookup: tests never write into the real Google Drive.
          BISMUTH_DRIVE_HOME: opts.dir ?? userData,
          ELECTRON_RENDERER_URL: '',
          // Tests never reach the internet: optional online data (Faz 11) goes to a closed local port unless a
          // spec starts its own fake server.
          BISMUTH_EXTERNAL_ORIGIN: opts.externalOrigin ?? 'http://127.0.0.1:9',
          ...opts.env
        },
        cwd: root
      })
      apps.push(app)
      dirs.push(opts.dir ?? userData)
      const keep = (chunk: Buffer) => {
        output.push(chunk.toString())
        if (output.length > 2000) output.shift()
      }
      app.process().stdout?.on('data', keep)
      app.process().stderr?.on('data', keep)
      const page = await app.firstWindow()
      const requests: string[] = []
      page.on('request', (r) => requests.push(r.url()))
      await page.getByTestId('app-ready').waitFor({ state: 'attached' })
      let recoveryCodes: string[] = []
      if (opts.setup !== false) {
        recoveryCodes = await completeSetup(page)
        const state = await api<{ session: unknown }>(page, 'auth.state')
        if (opts.signIn === false) {
          if (state.body.session) await api(page, 'auth.signOut')
        } else if (!state.body.session) await signIn(page)
        await reload(page)
      }
      return { app, page, requests, recoveryCodes }
    })
    if (testInfo.status !== testInfo.expectedStatus) {
      // A failure on a machine we cannot reach (CI) needs the main process's side of the story.
      await testInfo.attach('app-output.txt', { body: output.join(''), contentType: 'text/plain' })
      for (const dir of new Set(dirs)) {
        const logs = join(dir, 'logs')
        if (!existsSync(logs)) continue
        for (const name of readdirSync(logs))
          await testInfo.attach(`app-log-${name}`, {
            body: readFileSync(join(logs, name)),
            contentType: 'text/plain'
          })
      }
    }
    for (const app of apps) {
      // A main process stuck on a native box (or a dead page) must not take the whole worker down with it.
      const closed = await Promise.race([
        app.close().then(
          () => true,
          () => true
        ),
        new Promise<boolean>((done) => setTimeout(() => done(false), 15_000))
      ])
      if (!closed) app.process().kill('SIGKILL')
    }
  }
})

export { expect } from '@playwright/test'
