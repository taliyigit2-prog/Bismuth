#!/usr/bin/env node
// npm run dmg:background — renders the macOS DMG window background (build/background.png 540×380 and
// build/background@2x.png for Retina) with Chromium. electron-builder picks both up by name and places the Bismuth
// icon on the left and the Applications shortcut on the right (electron-builder.yml `dmg.contents`), so the window
// itself shows the one step: drag the icon onto the folder. Turkish first, English below (the DMG is not localised).
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const root = resolve(import.meta.dirname, '..')
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:540px;height:380px;overflow:hidden}
  body{background:linear-gradient(160deg,#f7f5fc 0%,#ece8f7 100%);font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#2a1f4d}
  .t{position:absolute;top:34px;width:100%;text-align:center;font-size:21px;font-weight:600}
  .s{position:absolute;top:66px;width:100%;text-align:center;font-size:13px;color:#6b6290}
  .f{position:absolute;bottom:26px;width:100%;text-align:center;font-size:11.5px;color:#8a82ad}
  svg{position:absolute;left:0;top:0}
</style></head><body>
  <div class="t">Bismuth'u Uygulamalar klasörüne sürükleyin</div>
  <div class="s">Drag Bismuth onto the Applications folder</div>
  <svg width="540" height="380" viewBox="0 0 540 380"><defs><marker id="h" markerUnits="userSpaceOnUse" markerWidth="16" markerHeight="16" refX="8" refY="8" orient="auto">
    <path d="M2,2 L14,8 L2,14 z" fill="#a78bfa"/></marker></defs>
    <path d="M214 196 C 250 176, 290 176, 322 196" fill="none" stroke="#a78bfa" stroke-width="5" stroke-linecap="round"
      stroke-dasharray="2 11" marker-end="url(#h)"/></svg>
  <div class="f">Sonra Uygulamalar'dan açın. İlk açılışta çıkan uyarı için kurulum rehberine bakın.</div>
</body></html>`

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}
)
for (const [scale, name] of [
  [1, 'background.png'],
  [2, 'background@2x.png']
]) {
  const page = await browser.newPage({ viewport: { width: 540, height: 380 }, deviceScaleFactor: scale })
  await page.setContent(html)
  await page.screenshot({ path: resolve(root, 'build', name) })
  await page.close()
  console.log(`build/${name}`)
}
await browser.close()
