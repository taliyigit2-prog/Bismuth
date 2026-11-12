// Usage: node cli.mjs <EGM_Konaklayan_Listesi.xlsx> [--period YYYY-MM] [--beds 28]
// Prints the ministry table. Never writes the input file anywhere (KVKK).
import { readFileSync } from "node:fs";
import { readKbs, ministryTable } from "./kbs.mjs";

const [file, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.reduce((a, v, i, arr) => (v.startsWith("--") ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const t0 = performance.now();
const { rows } = await readKbs(readFileSync(file));
const fromName = file.match(/(\d{2})(\d{2})(\d{4})_\d{8}\.xlsx$/);
const period = opt.period ?? (fromName ? `${fromName[3]}-${fromName[2]}` : rows[0].arrival.slice(0, 7));
const res = ministryTable(rows, period, { beds: opt.beds ? Number(opt.beds) : undefined });
const ms = Math.round(performance.now() - t0);
console.log(`Dönem ${period} · ${rows.length} satır okundu · ${ms} ms`);
console.log("Ülke | Toplam Giriş | Toplam Geceleme");
for (const r of res.table) console.log(`${r.country} | ${r.arrivals} | ${r.nights}`);
console.log(`TOPLAM | ${res.totals.arrivals} | ${res.totals.nights}`);
if (res.occupancy != null) console.log(`Doluluk (geceleme ÷ yatak×gün): %${(res.occupancy * 100).toFixed(2)}`);
for (const r of res.review) console.log(`Kontrol edin: "${r.raw}" (${r.rows} satır) → ${r.tr ?? "?"} [${r.reason}${r.suggestions.length ? ": " + r.suggestions.join("/") : ""}]`);
for (const h of res.inHouse) console.log(`Otelde kalan: oda ${h.room}, giriş ${h.arrival} → ${h.countedUntil} tarihine kadar ${h.nights} gece (${h.basis === "plan" ? "planlı çıkış" : "sayım günü"})`);
console.log("Uyarılar:", JSON.stringify(res.issues));
