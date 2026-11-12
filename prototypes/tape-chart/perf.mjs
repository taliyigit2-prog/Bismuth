// Measures the tape chart spike in headless Chromium (software rendering — pessimistic vs. a real laptop GPU).
// Usage: npm run build && node perf.mjs
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const exe = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const server = spawn("npx", ["vite", "preview", "--port", "4173", "--strictPort"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 2500));

const browser = await chromium.launch({ executablePath: exe, args: ["--no-sandbox"] });
const results = {};
try {
  for (const [label, viewport] of [["laptop-1366x768", { width: 1366, height: 768 }], ["fullhd-1920x1080", { width: 1920, height: 1080 }]]) {
    const page = await browser.newPage({ viewport });
    const t0 = Date.now();
    await page.goto("http://localhost:4173/", { waitUntil: "load" });
    await page.waitForFunction(() => window.__perf?.ready, null, { timeout: 30000 });
    const loadMs = Date.now() - t0;
    const perf = await page.evaluate(() => window.__perf);
    const domNodes = await page.evaluate(() => document.querySelectorAll("*").length);

    // Smooth scroll: 40 px per frame for 600 frames (~214 days), measure frame intervals.
    const scroll = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const el = window.__scroller;
          const times = [];
          let last = performance.now(), n = 0;
          function step(t) {
            times.push(t - last);
            last = t;
            el.scrollLeft += 40;
            if (++n < 600) requestAnimationFrame(step);
            else {
              times.shift();
              times.sort((a, b) => a - b);
              const avg = times.reduce((a, b) => a + b, 0) / times.length;
              resolve({ frames: times.length, avgMs: +avg.toFixed(2), fps: +(1000 / avg).toFixed(1), p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(2), maxMs: +times.at(-1).toFixed(2), nodesAfter: document.querySelectorAll("*").length });
            }
          }
          requestAnimationFrame(step);
        }),
    );

    // Jump: 9 years ahead, time until two frames painted.
    const jumpMs = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const el = window.__scroller;
          const t = performance.now();
          el.scrollLeft = 112 * 3500;
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(+(performance.now() - t).toFixed(1))));
        }),
    );
    const barsVisible = await page.evaluate(() => document.querySelectorAll(".bar").length);
    results[label] = { loadMs, ...perf, domNodes, scroll, jumpMs, barsVisible };
    await page.screenshot({ path: `screenshot-${label}.png` });
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}
writeFileSync("perf-result.json", JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
