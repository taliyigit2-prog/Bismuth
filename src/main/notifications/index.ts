// In-app and OS notifications for tasks, maintenance and legal reminders (Faz 9): the Electron side of the task
// round (scheduler.ts). A click brings the program's window to the front.
import { BrowserWindow, Notification } from 'electron'
import type { OsNotice } from './scheduler'

export { createTaskScheduler, noticeText, type TaskNotice } from './scheduler'

/** Shows one notification by the operating system (Windows action centre, macOS Notification Centre). */
export function showOsNotice(notice: OsNotice): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title: notice.title, body: notice.body, silent: false })
  n.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
  n.show()
}
