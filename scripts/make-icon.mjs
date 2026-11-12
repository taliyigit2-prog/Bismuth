#!/usr/bin/env node
// npm run icon — renders build/icon.png (1024×1024) from the SVG below with Chromium.
// electron-builder derives the Windows .ico and macOS .icns from this PNG.
// The mark: a stepped "hopper" crystal — the shape bismuth grows in — with its iridescent oxide colours.
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const root = resolve(import.meta.dirname, '..')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2a1f4d"/><stop offset="1" stop-color="#120d24"/>
    </linearGradient>
    <linearGradient id="iri" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f0abfc"/><stop offset="0.3" stop-color="#a78bfa"/>
      <stop offset="0.55" stop-color="#22d3ee"/><stop offset="0.8" stop-color="#fde047"/><stop offset="1" stop-color="#fb7185"/>
    </linearGradient>
  </defs>
  <rect x="64" y="64" width="896" height="896" rx="200" fill="url(#bg)"/>
  <g fill="none" stroke="url(#iri)" stroke-linejoin="miter" stroke-linecap="square">
    <path d="M232 232h560v560H232z" stroke-width="56"/>
    <path d="M352 352h320v320H352z" stroke-width="48" opacity="0.92"/>
    <path d="M456 456h112v112H456z" stroke-width="40" opacity="0.85"/>
    <path d="M232 232l120 120M792 232L672 352M792 792L672 672M232 792l120-120" stroke-width="24" opacity="0.55"/>
  </g>
</svg>`
writeFileSync(resolve(root, 'build/icon.svg'), svg)
const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}
)
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } })
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`)
await page.locator('svg').screenshot({ path: resolve(root, 'build/icon.png'), omitBackground: true })
await page.setViewportSize({ width: 256, height: 256 })
await page.setContent(
  `<html><body style="margin:0;background:transparent"><div style="width:256px;height:256px">${svg}</div></body></html>`
)
await page.locator('div').screenshot({ path: resolve(root, 'resources/icon.png'), omitBackground: true })
await browser.close()
console.log('build/icon.png, resources/icon.png')
