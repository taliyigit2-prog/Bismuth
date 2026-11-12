// Faz 0 · A0.4 spike — rule-based, offline holiday generation for ANY year (K-04 v2: no 10-year limit).
// date-holidays (ISC; data CC-BY-3.0) gives the Islamic holiday first day via its Hijri table (valid to ~2080) but
// models the day as starting at sunset with odd end times. Turkish law (2429) defines:
//   Ramazan Bayramı = arife (from 13:00) + 3 days; Kurban Bayramı = arife (from 13:00) + 4 days; 28 Ekim from 13:00.
// We normalise to whole local days + half days. Output rows map 1:1 to calendar_days (source = "generated").
import Holidays from "date-holidays";

const hd = new Holidays("TR");

// Fallback for years beyond the library's Hijri table (~2076): ICU's islamic-umalqura calendar (built into
// Node/Chromium, no dependency). The two sources differ by ±1 day in some years → the UI marks religious
// holidays as "tahmini" and the yearly online check (Faz 11) corrects generated rows.
const hijriFmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", timeZone: "UTC" });
function intlIslamicFirstDays(year) {
  const out = [];
  for (let t = Date.UTC(year - 1, 11, 1); t < Date.UTC(year + 1, 0, 31); t += 86400000) {
    const p = Object.fromEntries(hijriFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    const iso = new Date(t).toISOString().slice(0, 10);
    if (+p.month === 10 && +p.day === 1) out.push({ name: "Ramazan Bayramı", date: iso + " 00:00:00", type: "public", fallback: true });
    if (+p.month === 12 && +p.day === 10) out.push({ name: "Kurban Bayramı", date: iso + " 00:00:00", type: "public", fallback: true });
  }
  return out;
}

const addDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

/** First local day of a date-holidays entry ("2026-03-20 00:00:00 -0600" → "2026-03-20"). */
const firstDay = (h) => h.date.slice(0, 10);

/**
 * @returns {{date:string, kind:'holiday'|'half_holiday', title:string, group:string}[]}
 */
export function trHolidays(year) {
  const out = [];
  // Pull neighbouring years too, because an arife can fall on 31 Dec of the previous year.
  let raw = [year - 1, year, year + 1].flatMap((y) => hd.getHolidays(y, "tr"));
  const hasIslamic = raw.some((h) => /^(Ramazan|Kurban) Bayramı$/.test(h.name) && h.date.startsWith(String(year)));
  if (!hasIslamic) raw = raw.filter((h) => !/^(Ramazan|Kurban) Bayramı$/.test(h.name)).concat(intlIslamicFirstDays(year));
  for (const h of raw) {
    const d = firstDay(h);
    if (h.name === "Ramazan Bayramı" || h.name === "Kurban Bayramı") {
      const days = h.name === "Ramazan Bayramı" ? 3 : 4;
      const group = `${h.name}-${d}`;
      const estimated = true; // religious dates are calculated, may differ ±1 day from Diyanet
      out.push({ date: addDays(d, -1), kind: "half_holiday", title: `${h.name} Arifesi`, group, estimated, source: h.fallback ? "intl-umalqura" : "date-holidays" });
      for (let i = 0; i < days; i++) out.push({ date: addDays(d, i), kind: "holiday", title: `${h.name} ${i + 1}. Gün`, group, estimated, source: h.fallback ? "intl-umalqura" : "date-holidays" });
    } else if (h.type === "public") {
      out.push({ date: d, kind: "holiday", title: h.name, group: `${h.name}-${d}` });
      if (h.name === "Cumhuriyet Bayramı") out.push({ date: addDays(d, -1), kind: "half_holiday", title: "Cumhuriyet Bayramı Arifesi", group: `${h.name}-${d}` });
    }
  }
  const seen = new Set();
  return out
    .filter((r) => r.date.startsWith(String(year)))
    .filter((r) => (seen.has(r.date + r.title) ? false : seen.add(r.date + r.title)))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Holidays for any country supported by date-holidays (product is not TR-only). */
export function genericHolidays(country, year, lang) {
  return new Holidays(country)
    .getHolidays(year, lang)
    .filter((h) => h.type === "public")
    .map((h) => ({ date: firstDay(h), kind: "holiday", title: h.name, group: `${h.name}-${firstDay(h)}` }));
}
