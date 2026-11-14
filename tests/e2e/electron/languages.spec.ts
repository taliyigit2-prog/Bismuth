// Faz 16 v2 "Üç dil" on the desktop: in Turkish, English and Russian the setup wizard, Today, the calendar and the
// payment flow work from an empty data folder; on every screen no raw key ("ledger.") or unfilled placeholder shows,
// nothing widens the page and no button or tab label is cut off (Russian is the longest).
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'
import { OWNER } from '../setup-draft.mjs'
import { overflowReport } from '../routes'
import { LANGS, clippedControls, rawTextReport, text, type Lang } from '../i18n-guard'

/** The screen is fully in the language: no raw key, no overflow, no cut-off label. */
async function clean(page: Page, where: string): Promise<void> {
  await expect.poll(() => rawTextReport(page), { message: `${where}: raw keys` }).toEqual([])
  await expect.poll(() => page.evaluate(overflowReport), { message: `${where}: overflow` }).toEqual([])
  await expect.poll(() => clippedControls(page), { message: `${where}: cut-off labels` }).toEqual([])
}

/** The wizard's next step: waits until the step title changes. */
async function next(page: Page): Promise<string> {
  const title = page.getByTestId('setup-step-title')
  const before = await title.innerText()
  await page.getByTestId('setup-next').click()
  await expect(title).not.toHaveText(before)
  return title.innerText()
}

async function wizard(page: Page, lang: Lang): Promise<void> {
  await page.goto(page.url().replace(/#.*$/, '#/setup'))
  await page.getByTestId('setup-step-body').waitFor()
  await page.getByTestId(`setup-lang-${lang}`).click()
  const title = page.getByTestId('setup-step-title')
  // 1 Dil ve tema → 12 Özet, each in the chosen language.
  const steps = ['language', 'mode', 'hotel', 'currencies', 'roomTypes', 'rooms']
  await expect(title).toHaveText(text(lang, `setup.step.${steps[0]}.title`))
  await clean(page, `setup ${steps[0]}`)
  for (const step of steps.slice(1)) {
    await next(page)
    await expect(title).toHaveText(text(lang, `setup.step.${step}.title`))
    if (step === 'hotel') {
      await page.getByTestId('setup-hotel-name').fill('Martı Otel')
      await page.getByTestId('setup-hotel-city').fill('İstanbul')
    }
    if (step === 'roomTypes') {
      await page.locator('[id^="setup-price-"][id$="-base"]').first().fill('2500')
      await page.locator('[id^="setup-price-"][id$="-weekend"]').first().fill('2500')
    }
    if (step === 'rooms') {
      await page.getByTestId('setup-floors').fill('2')
      await page.getByTestId('setup-per-floor').fill('3')
      await page.getByTestId('setup-beds').fill('2')
      await page.getByTestId('setup-generate').click()
      await expect(page.getByTestId('setup-room-totals')).toBeVisible()
    }
    await clean(page, `setup ${step}`)
  }
  for (const step of ['hourly', 'money', 'staff', 'employees', 'calendar', 'camera', 'owner']) {
    await next(page)
    await expect(title).toHaveText(text(lang, `setup.step.${step}.title`))
    await clean(page, `setup ${step}`)
  }
  await page.getByTestId('setup-owner-name').fill(OWNER.displayName)
  await page.getByTestId('setup-owner-username').fill(OWNER.username)
  await page.getByTestId('setup-owner-password').fill(OWNER.password)
  await page.getByTestId('setup-owner-repeat').fill(OWNER.password)
  await page.getByTestId('setup-owner-pin').fill(OWNER.pin)
  await next(page)
  await expect(title).toHaveText(text(lang, 'setup.step.summary.title'))
  await clean(page, 'setup summary')
  await page.getByTestId('setup-finish').click()
  await expect(page.getByTestId('recovery-codes')).toBeVisible()
  await clean(page, 'recovery codes')
  await page.getByTestId('recovery-written').click()
  await page.getByTestId('recovery-continue').click()
  await expect(page.getByRole('heading', { level: 1, name: text(lang, 'nav.calendar') })).toBeVisible()
}

for (const lang of LANGS) {
  test(`${lang}: kurulum sihirbazı → Bugün → takvim → ödeme, ham anahtar ve taşma yok`, async ({
    launch
  }) => {
    test.setTimeout(300_000)
    const { page } = await launch({ setup: false })
    await wizard(page, lang)
    expect(
      (await api(page, 'settings.set', { 'guide.tourForNewUsers': false, 'ui.tourDone': true })).status
    ).toBe(200)

    await reload(page, '#/today')
    await expect(page.getByRole('heading', { level: 1, name: text(lang, 'today.title') })).toBeVisible()
    await clean(page, 'today')

    await reload(page, '#/calendar')
    await expect(page.getByTestId('tape-chart')).toBeVisible()
    await clean(page, 'calendar')

    // A reservation through the form, then a payment through the panel, all in the language.
    const guest = lang === 'ru' ? 'Ирина Смирнова' : lang === 'en' ? 'Emily Clarke' : 'Deniz Yıldırım'
    await page
      .getByRole('button', { name: text(lang, 'calendar.newReservation') })
      .first()
      .click()
    const form = page.getByRole('dialog', { name: text(lang, 'calendar.new.title') })
    await expect(form).toBeVisible()
    await form.getByRole('combobox', { name: text(lang, 'calendar.new.guest') }).click()
    await page.getByPlaceholder(text(lang, 'guestCombo.search')).fill(guest)
    await page.getByText(text(lang, 'guestCombo.create', { name: guest })).click()
    await page.getByTestId('room-multi-picker').click()
    await page.getByTestId('room-option-101').getByRole('checkbox').click()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('suggested-price')).toBeVisible()
    await clean(page, 'new reservation')
    await page.getByTestId('new-reservation-save').click()
    const panel = page.getByTestId('reservation-panel')
    await expect(panel.getByTestId('panel-guest')).toHaveText(guest)
    await clean(page, 'reservation panel')
    await panel.getByTestId('panel-pay').click()
    await expect(page.getByRole('dialog', { name: text(lang, 'calendar.payment.title') })).toBeVisible()
    await clean(page, 'payment')
    await page.getByTestId('payment-save').click()
    await expect(page.getByTestId('payment-save')).toHaveCount(0)
    await panel.getByRole('tab', { name: text(lang, 'calendar.panel.tabMoney') }).click()
    await expect(panel.getByTestId('folio-balance')).toHaveText(/^\D*0\D*$/)
    await clean(page, 'reservation money')

    // The check itself sees a missing text: a raw key and an unfilled placeholder put on the page are reported.
    await page.evaluate(() => {
      const probe = document.createElement('p')
      probe.id = 'raw-probe'
      probe.textContent = 'ledger.summary.title {{count}}'
      document.body.append(probe)
    })
    expect(await rawTextReport(page)).toEqual(['ledger.summary.title', '{{count}}'])
    await page.evaluate(() => document.getElementById('raw-probe')?.remove())
  })
}
