// P17b (G-194) on the phone (390×844): a group booked from the form, the group panel as a bottom sheet with the
// rooms as a list (no sideways scroll), the bulk check-in, and the group mark in the day list.
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { overflowReport } from '../routes'
import { freeRooms, hotelToday, shiftDay } from '../shared-hotel'

async function pickRoom(page: Page, room: string): Promise<void> {
  await page.getByTestId('room-multi-picker').click()
  await page.getByTestId(`room-option-${room}`).getByRole('checkbox').click()
  await page.keyboard.press('Escape')
}

test.describe('telefonda grup rezervasyonu', () => {
  test('grup oluştur, paneldeki oda listesinden toplu giriş yap, gün listesinde grup simgesi görünür', async ({
    page
  }) => {
    await page.goto('/#/calendar')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    const today = await hotelToday(page)
    const rooms = await freeRooms(page, today, shiftDay(today, 1), 3)
    await page.reload()
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    const tag = Date.now().toString(36)
    await page.getByRole('button', { name: 'Yeni rezervasyon' }).first().click()
    await page.getByRole('combobox', { name: 'Misafir' }).click()
    await page.getByPlaceholder('Ad ya da telefon…').fill(`Telefon Lider ${tag}`)
    await page.getByText(`Yeni misafir: Telefon Lider ${tag}`).click()
    for (const room of rooms) await pickRoom(page, room.number)
    await page.getByTestId('group-toggle').click()
    await page.getByTestId('group-name-input').fill(`Telefon grubu ${tag}`)
    await page.getByTestId(`group-room-guest-${rooms[0]!.number}`).fill(`Birinci Misafir ${tag}`)
    await page.getByTestId('new-reservation-save').click()

    const panel = page.getByTestId('group-panel')
    await expect(panel.getByTestId('group-name')).toHaveText(`Telefon grubu ${tag}`)
    await expect(panel.getByTestId(`group-guest-${rooms[0]!.number}`)).toHaveText(`Birinci Misafir ${tag}`)
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])

    await panel.getByTestId('group-check-in').click()
    await expect(panel.getByTestId('group-check-out')).toContainText('(3)')

    // The day list marks the rooms of the group.
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    const list = page.getByTestId('day-list')
    // The phone harness keeps one hotel across retries: at least this group's three rooms are marked.
    await expect
      .poll(() => list.getByRole('img', { name: 'Grup rezervasyonu' }).count())
      .toBeGreaterThanOrEqual(3)
  })
})
