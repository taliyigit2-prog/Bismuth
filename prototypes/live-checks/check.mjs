#!/usr/bin/env node
// Faz 0 · A0.5 live verification of external data sources (FX mid rates, weather, holiday feeds).
// Runs on GitHub Actions runners (the dev container's egress proxy blocks these hosts).
// Spike code: not part of the product. Node >= 20 (global fetch), no dependencies.
//
// Usage: node check.mjs [--samples N] [--interval SECONDS] [--out results.json]
import { writeFileSync, appendFileSync } from "node:fs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith("--") ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
const SAMPLES = Number(args.samples ?? 1);
const INTERVAL = Number(args.interval ?? 0);
const OUT = args.out ?? "results.json";
const UA = "Bismuth-Faz0-check/0.1 (+https://github.com/taliyigit2-prog/Hotel-CRM)";
const QUOTES = ["USD", "EUR", "GBP", "RUB"];
const LAT = 40.9903; // Kadıköy, İstanbul
const LON = 29.0290;

async function get(url, { type = "json", headers = {}, timeout = 8000 } = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: type === "json" ? "application/json" : "*/*", ...headers },
      signal: AbortSignal.timeout(timeout),
    });
    const ms = Math.round(performance.now() - t0);
    const body = type === "json" ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, ms, body };
  } catch (e) {
    return { ok: false, status: 0, ms: Math.round(performance.now() - t0), error: String(e?.message ?? e) };
  }
}

// Each FX source returns { USD: TRY per 1 USD, EUR: ..., GBP: ..., RUB: ... } (mid rate) or throws.
const fxSources = {
  async "fawazahmed0-jsdelivr"() {
    const r = await get("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/try.min.json");
    if (!r.ok) throw r;
    const t = r.body.try; // 1 TRY = x CUR
    return { meta: { date: r.body.date, ms: r.ms }, rates: Object.fromEntries(QUOTES.map((q) => [q, 1 / t[q.toLowerCase()]])) };
  },
  async "fawazahmed0-pagesdev"() {
    const r = await get("https://latest.currency-api.pages.dev/v1/currencies/try.min.json");
    if (!r.ok) throw r;
    const t = r.body.try;
    return { meta: { date: r.body.date, ms: r.ms }, rates: Object.fromEntries(QUOTES.map((q) => [q, 1 / t[q.toLowerCase()]])) };
  },
  async "open.er-api"() {
    const r = await get("https://open.er-api.com/v6/latest/TRY");
    if (!r.ok) throw r;
    const t = r.body.rates;
    return { meta: { updated: r.body.time_last_update_utc, next: r.body.time_next_update_utc, ms: r.ms }, rates: Object.fromEntries(QUOTES.map((q) => [q, 1 / t[q]])) };
  },
  async "exchangerate-api-v4"() {
    const r = await get("https://api.exchangerate-api.com/v4/latest/TRY");
    if (!r.ok) throw r;
    const t = r.body.rates;
    return { meta: { date: r.body.date, ms: r.ms }, rates: Object.fromEntries(QUOTES.map((q) => [q, 1 / t[q]])) };
  },
  async frankfurter() {
    const r = await get("https://api.frankfurter.app/latest?from=TRY&to=USD,EUR,GBP");
    if (!r.ok) throw r;
    const t = r.body.rates;
    return { meta: { date: r.body.date, ms: r.ms, note: "ECB, no RUB" }, rates: Object.fromEntries(QUOTES.filter((q) => t[q]).map((q) => [q, 1 / t[q]])) };
  },
  async "truncgil-v4"() {
    const r = await get("https://finans.truncgil.com/v4/today.json");
    if (!r.ok) throw r;
    const pick = (k) => {
      const o = r.body[k];
      if (!o) return undefined;
      const b = Number(String(o.Buying).replace(",", ".")), s = Number(String(o.Selling).replace(",", "."));
      return (b + s) / 2;
    };
    return { meta: { updated: r.body.Update_Date ?? r.body.Meta_Data?.Update_Date, ms: r.ms, note: "TR market buy/sell → mid" }, rates: Object.fromEntries(QUOTES.map((q) => [q, pick(q)]).filter(([, v]) => v)) };
  },
  async genelpara() {
    const r = await get("https://api.genelpara.com/embed/doviz.json");
    if (!r.ok) throw r;
    const pick = (k) => {
      const o = r.body[k];
      if (!o) return undefined;
      return (Number(o.alis) + Number(o.satis)) / 2;
    };
    return { meta: { ms: r.ms, note: "TR market buy/sell → mid" }, rates: Object.fromEntries(QUOTES.map((q) => [q, pick(q)]).filter(([, v]) => v)) };
  },
  async "tcmb-today"() {
    const r = await get("https://www.tcmb.gov.tr/kurlar/today.xml", { type: "text" });
    if (!r.ok) throw r;
    const rates = {};
    for (const q of QUOTES) {
      const block = r.body.match(new RegExp(`<Currency[^>]*CurrencyCode="${q}"[\\s\\S]*?</Currency>`))?.[0];
      if (!block) continue;
      const unit = Number(block.match(/<Unit>(\d+)<\/Unit>/)?.[1] ?? 1);
      const fb = Number(block.match(/<ForexBuying>([\d.]+)<\/ForexBuying>/)?.[1]);
      const fs = Number(block.match(/<ForexSelling>([\d.]+)<\/ForexSelling>/)?.[1]);
      if (fb && fs) rates[q] = (fb + fs) / 2 / unit;
    }
    const date = r.body.match(/Tarih="([^"]+)"/)?.[1];
    return { meta: { date, ms: r.ms, note: "official, reference only" }, rates };
  },
  // Reference only (no API, scraping is NOT a product option): what Google shows the owner today.
  async "google-finance-ref"() {
    const rates = {};
    let ms = 0;
    for (const q of QUOTES) {
      const r = await get(`https://www.google.com/finance/quote/${q}-TRY?hl=en`, { type: "text", headers: { "Accept-Language": "en" } });
      ms += r.ms;
      const m = r.ok && r.body.match(/data-last-price="([\d.]+)"/);
      if (m) rates[q] = Number(m[1]);
    }
    if (!Object.keys(rates).length) throw { error: "no data-last-price found" };
    return { meta: { ms, note: "reference scrape for comparison only" }, rates };
  },
  async "yahoo-ref"() {
    const rates = {};
    let ms = 0;
    for (const q of QUOTES) {
      const sym = q === "USD" ? "TRY=X" : `${q}TRY=X`;
      const r = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=5m`);
      ms += r.ms;
      const p = r.ok ? r.body?.chart?.result?.[0]?.meta?.regularMarketPrice : undefined;
      if (p) rates[q] = p;
    }
    if (!Object.keys(rates).length) throw { error: "no price" };
    return { meta: { ms, note: "unofficial, reference only" }, rates };
  },
};

async function sampleFx() {
  const at = new Date().toISOString();
  const out = {};
  await Promise.all(
    Object.entries(fxSources).map(async ([name, fn]) => {
      try {
        out[name] = { ok: true, ...(await fn()) };
      } catch (e) {
        out[name] = { ok: false, status: e?.status, error: e?.error ?? e?.message ?? String(e) };
      }
    }),
  );
  return { at, sources: out };
}

async function weather() {
  const res = {};
  const met = await get(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${LAT.toFixed(4)}&lon=${LON.toFixed(4)}`);
  res["met.no"] = met.ok
    ? {
        ok: true,
        ms: met.ms,
        updated: met.body.properties?.meta?.updated_at,
        now: met.body.properties?.timeseries?.[0]?.data?.instant?.details,
        symbol_next_1h: met.body.properties?.timeseries?.[0]?.data?.next_1_hours?.summary?.symbol_code,
        hours: met.body.properties?.timeseries?.length,
      }
    : { ok: false, status: met.status, error: met.error };
  const om = await get(
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FIstanbul&forecast_days=7`,
  );
  res["open-meteo"] = om.ok
    ? { ok: true, ms: om.ms, current: om.body.current, daily_days: om.body.daily?.time?.length, daily_sample: { max: om.body.daily?.temperature_2m_max?.[0], min: om.body.daily?.temperature_2m_min?.[0], pop: om.body.daily?.precipitation_probability_max?.[0] } }
    : { ok: false, status: om.status, error: om.error };
  const wttr = await get("https://wttr.in/Kadikoy?format=j1");
  res["wttr.in"] = wttr.ok ? { ok: true, ms: wttr.ms, temp_C: wttr.body.current_condition?.[0]?.temp_C, desc: wttr.body.current_condition?.[0]?.weatherDesc?.[0]?.value } : { ok: false, status: wttr.status, error: wttr.error };
  const t7 = await get(`https://www.7timer.info/bin/api.pl?lon=${LON}&lat=${LAT}&product=civillight&output=json`);
  res["7timer"] = t7.ok ? { ok: true, ms: t7.ms, days: t7.body.dataseries?.length, first: t7.body.dataseries?.[0] } : { ok: false, status: t7.status, error: t7.error };
  return res;
}

async function holidays() {
  const res = {};
  const ics = await get("https://calendar.google.com/calendar/ical/tr.turkish%23holiday%40group.v.calendar.google.com/public/basic.ics", { type: "text", timeout: 15000 });
  if (ics.ok) {
    const events = [...ics.body.matchAll(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g)].map((m) => {
      const e = m[0];
      return {
        start: e.match(/DTSTART(?:;VALUE=DATE)?:(\d{8})/)?.[1],
        end: e.match(/DTEND(?:;VALUE=DATE)?:(\d{8})/)?.[1],
        summary: e.match(/SUMMARY:(.*)/)?.[1]?.trim(),
      };
    });
    const sel = events.filter((e) => e.start && e.start >= "20260101" && e.start <= "20271231").sort((a, b) => a.start.localeCompare(b.start));
    res["google-ics-tr"] = { ok: true, ms: ics.ms, total: events.length, range: [events.map((e) => e.start).sort()[0], events.map((e) => e.start).sort().at(-1)], events_2026_2027: sel };
  } else res["google-ics-tr"] = { ok: false, status: ics.status, error: ics.error };
  for (const url of ["https://date.nager.at/api/v3/PublicHolidays/2026/TR", "https://nagerholidays.com/api/v3/PublicHolidays/2026/TR"]) {
    const r = await get(url);
    res[url] = r.ok ? { ok: true, ms: r.ms, count: r.body.length, names: r.body.map((h) => `${h.date} ${h.localName}`) } : { ok: false, status: r.status, error: r.error };
  }
  return res;
}

function pct(a, b) {
  return a && b ? ((a / b - 1) * 100).toFixed(3) : "";
}

const result = { started: new Date().toISOString(), runner: process.env.RUNNER_OS ?? "local", fx: [], weather: null, holidays: null };
result.weather = await weather();
result.holidays = await holidays();
for (let i = 0; i < SAMPLES; i++) {
  if (i > 0 && INTERVAL) await new Promise((r) => setTimeout(r, INTERVAL * 1000));
  const s = await sampleFx();
  result.fx.push(s);
  console.log(`sample ${i + 1}/${SAMPLES} at ${s.at}`);
}
writeFileSync(OUT, JSON.stringify(result, null, 2));

// Human-readable summary (GitHub step summary when available).
let md = `## Faz 0 canlı doğrulama — ${result.started}\n\n### Kur (TRY karşılığı, orta kur) ve Google'a fark %\n\n`;
for (const s of result.fx) {
  const g = s.sources["google-finance-ref"]?.rates ?? {};
  md += `**Örnek ${s.at}**\n\n| Kaynak | Durum | ${QUOTES.join(" | ")} | Δ% USD | Δ% EUR | Δ% GBP | Δ% RUB | not |\n|---|---|${QUOTES.map(() => "---").join("|")}|---|---|---|---|---|\n`;
  for (const [name, v] of Object.entries(s.sources)) {
    const r = v.rates ?? {};
    md += `| ${name} | ${v.ok ? "✅" : `❌ ${v.status ?? ""} ${String(v.error ?? "").slice(0, 60)}`} | ${QUOTES.map((q) => (r[q] ? r[q].toFixed(4) : "–")).join(" | ")} | ${QUOTES.map((q) => pct(r[q], g[q])).join(" | ")} | ${v.meta?.note ?? ""} ${v.meta?.date ?? v.meta?.updated ?? ""} |\n`;
  }
  md += "\n";
}
md += "### Hava durumu\n\n```json\n" + JSON.stringify(result.weather, null, 2) + "\n```\n\n### Bayram kaynakları\n\n```json\n" + JSON.stringify(result.holidays, null, 2) + "\n```\n";
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
console.log(md);
