import { ipcMain, type WebContents } from 'electron'
import type { Hono } from 'hono'
import { API_CHANNEL, READY_CHANNEL } from '@shared/contract'
import type { ApiEnv } from '../api/app'
import type { Ctx } from '../services/context'
import type { SessionBinding } from '../api/session'
import { handleIpcRequest } from './handle'

export interface IpcOptions {
  app: Hono<ApiEnv>
  /** ctx for the window that sent the call: its signed-in user, nobody, the setup wizard or locked. */
  ctxFor(sender: WebContents): Ctx
  /** The window's sign-in state (sign-in, sign-out, lock). */
  sessionFor(sender: WebContents): SessionBinding
  /** Only our own renderer may call the API (file:// bundle or the dev server). */
  isTrustedUrl(url: string): boolean
  onReady?(sender: WebContents): void
}

export function registerIpc(options: IpcOptions): void {
  ipcMain.handle(API_CHANNEL, (event, raw: unknown) => {
    const url = event.senderFrame?.url ?? ''
    if (!options.isTrustedUrl(url)) throw new Error('untrusted sender')
    return handleIpcRequest(options.app, options.ctxFor(event.sender), raw, options.sessionFor(event.sender))
  })
  ipcMain.on(READY_CHANNEL, (event) => {
    if (options.isTrustedUrl(event.senderFrame?.url ?? '')) options.onReady?.(event.sender)
  })
}
