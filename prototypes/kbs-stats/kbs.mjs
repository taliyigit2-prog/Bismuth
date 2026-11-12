// Faz 0 · A0.8 spike — KBS "EGM Konaklayan Listesi" (.xlsx) → Turizm Bakanlığı tablosu (Ülke · Toplam Giriş · Toplam Geceleme).
// Not product code. Rules (K-29, owner confirmed with the ministry):
//   • nights = calendar-day difference between arrival and departure; same day = 1 night
//   • all nights of a stay are attributed to the ARRIVAL month
//   • every KBS row is one arrival (children are not counted separately)
//   • Turkish citizens are included
//   • ministry occupancy = nights ÷ (beds × days in month)
// Privacy (KVKK): identity columns (TC no, document, name, surname, plate) are never read.
import ExcelJS from "exceljs";
import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json" with { type: "json" };
import tr from "i18n-iso-countries/langs/tr.json" with { type: "json" };

countries.registerLocale(en);
countries.registerLocale(tr);

const REQUIRED = {
  arrival: "Geliş Tarihi",
  departure: "Çıkış Tarihi",
  room: "Verilen Oda",
  gender: "Cinsiyet",
  nationality: "Uyruğu",
  status: "Durum",
};

/** Excel serial (or Date) → local calendar day "YYYY-MM-DD" without any timezone shift. */
export function toLocalDay(v) {
  if (v == null || v === "") return null;
  let ms;
  if (v instanceof Date) ms = v.getTime();
  else if (typeof v === "number") ms = Math.round((v - 25569) * 86400000); // 25569 = 1970-01-01 in Excel serial
  else if (typeof v === "string") {
    const m = v.match(/^(\d{2})\.(\d{2})\.(\d{4})/); // "21.09.2026 14:30" fallback
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    const n = Number(v.replace(",", "."));
    if (!Number.isFinite(n)) return null;
    ms = Math.round((n - 25569) * 86400000);
  } else return null;
  return new Date(ms).toISOString().slice(0, 10); // serial is wall-clock → read as UTC to avoid shifts
}

export function dayDiff(a, b) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

export function nightsOf(arrivalDay, departureDay) {
  if (!departureDay) return null;
  return Math.max(1, dayDiff(arrivalDay, departureDay));
}

/** Parse the workbook buffer. Columns are located by header text (robust to column order / sparse cells). */
export async function readKbs(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("KBS_NO_SHEET");
  const header = {};
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
    header[String(cell.value ?? "").trim().toLocaleLowerCase("tr-TR")] = col;
  });
  const cols = {};
  for (const [key, title] of Object.entries(REQUIRED)) {
    const col = header[title.toLocaleLowerCase("tr-TR")];
    if (!col) throw new Error(`KBS_MISSING_COLUMN:${title}`);
    cols[key] = col;
  }
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const get = (k) => {
      const v = row.getCell(cols[k]).value;
      return v && typeof v === "object" && "result" in v ? v.result : v; // formula cells
    };
    const arrival = toLocalDay(get("arrival"));
    if (!arrival) return; // empty/garbage row
    let departure = toLocalDay(get("departure"));
    // KBS writes "1900-01-01" (Excel serial ~1) when the guest has not checked out yet ("Aktif").
    if (departure && (departure < "1901-01-01" || departure < arrival)) departure = null;
    rows.push({
      arrival,
      departure,
      room: String(get("room") ?? "").trim(),
      gender: String(get("gender") ?? "").trim() || null,
      nationalityRaw: String(get("nationality") ?? "").trim(),
      status: String(get("status") ?? "").trim(),
    });
  });
  return { sheet: ws.name, columns: Object.keys(header).length, rows };
}

// KBS writes nationalities in English upper case, sometimes with a native/long name in parentheses,
// plus a few non-ISO or historical entries — and, as the owner warned, occasional misspellings of
// "Türkiye" and "Kuzey Kıbrıs" (the real September file has "KUZEY KIBRIS TURK CUMHURİYETİ").
// Product: these live in the country_map table and the user confirms a corrected value once; here the
// seed + a small fuzzy matcher prove the approach.

const FOLD = { Ç: "C", Ğ: "G", İ: "I", Ö: "O", Ş: "S", Ü: "U", Â: "A", Î: "I", Û: "U" };

/** Upper-case (Turkish rules), fold diacritics and punctuation: "K.K.T.C." → "KKTC", "Türkiye" → "TURKIYE". */
export function normalizeCountryKey(raw) {
  return String(raw ?? "")
    .toLocaleUpperCase("tr-TR")
    .replace(/[ÇĞİÖŞÜÂÎÛ]/g, (c) => FOLD[c])
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[.'’`]/g, "")
    .replace(/[^A-Z0-9()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const stripParen = (key) => key.replace(/\s*\(.*\)\s*$/, "").trim(); // "GERMANY (DEUTSCHLAND)" → "GERMANY"

// Seed aliases. `review` = the value is valid but sensitive or ambiguous; the user confirms it once.
const SEED = [
  { iso: "TR", names: ["TÜRKİYE", "TURKEY", "TÜRKİYE CUMHURİYETİ", "REPUBLIC OF TURKEY", "REPUBLIC OF TÜRKİYE", "TÜRKEI", "T.C."] },
  {
    iso: "XC",
    tr: "Kuzey Kıbrıs Türk Cumhuriyeti",
    names: ["KUZEY KIBRIS TÜRK CUMHURİYETİ", "KKTC", "K.K.T.C.", "KUZEY KIBRIS", "KIBRIS TÜRK", "KIBRIS (KUZEY)", "TURKISH REPUBLIC OF NORTHERN CYPRUS", "NORTHERN CYPRUS", "NORTH CYPRUS", "TRNC"],
  },
  { iso: "CY", names: ["CYPRUS", "GÜNEY KIBRIS", "GÜNEY KIBRIS RUM YÖNETİMİ", "GKRY"], review: "cyprus" },
  { iso: null, names: ["KIBRIS"], review: "ambiguous", suggestions: ["XC", "CY"] },
  { iso: null, tr: "Sırbistan ve Karadağ", names: ["SERBIA AND MONTENEGRO"], review: "historical", suggestions: ["RS", "ME"] },
  { iso: "PS", tr: "Filistin", names: ["PALESTINIAN TERRITORIES", "PALESTINE", "FİLİSTİN"] },
  { iso: "XK", tr: "Kosova", names: ["KOSOVO", "KOSOVA"] },
  { iso: "RU", tr: "Rusya Federasyonu", names: ["RUSSIAN FEDERATION"] },
  { iso: "US", tr: "Amerika Birleşik Devletleri", names: ["UNITED STATES"] },
  { iso: "KR", names: ["KOREA, REPUBLIC OF"] },
  { iso: "IR", names: ["IRAN, ISLAMIC REPUBLIC OF"] },
  { iso: "SY", names: ["SYRIAN ARAB REPUBLIC"] },
];
const DISPLAY = Object.fromEntries(SEED.filter((e) => e.iso && e.tr).map((e) => [e.iso, e.tr]));

// One index of every known spelling → entry. Seed first so it wins over library names.
const INDEX = new Map();
for (const e of SEED) for (const n of e.names) INDEX.set(normalizeCountryKey(n), { ...e, source: "seed" });
for (const lang of ["en", "tr"]) {
  for (const [iso, names] of Object.entries(countries.getNames(lang, { select: "all" }))) {
    for (const n of names) {
      const k = normalizeCountryKey(n);
      if (!INDEX.has(k)) INDEX.set(k, { iso, source: "iso" });
    }
  }
}

/** Optimal string alignment distance (Levenshtein + adjacent transposition), with an early cut-off. */
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

const nameOf = (iso) => (iso ? DISPLAY[iso] ?? countries.getName(iso, "tr") ?? iso : null);

function fromEntry(raw, e, source) {
  return {
    raw,
    iso: e.iso,
    tr: e.tr ?? nameOf(e.iso),
    needsReview: !!e.review,
    reason: e.review ?? null,
    suggestions: e.suggestions ?? [],
    source,
  };
}

export function mapNationality(raw, userMap = {}) {
  const key = normalizeCountryKey(raw);
  const user = userMap[key] ?? userMap[String(raw).toLocaleUpperCase("tr-TR").trim()];
  if (user) return { raw, needsReview: false, reason: null, suggestions: [], ...user, source: "user" };
  const base = stripParen(key);
  const hit = INDEX.get(key) ?? INDEX.get(base);
  if (hit) return fromEntry(raw, hit, hit.source);
  // Misspelling guard: accept a unique nearest spelling but always ask the user to confirm it.
  const max = base.length >= 8 ? 2 : base.length >= 5 ? 1 : 0;
  let best = max + 1;
  let candidates = new Set();
  if (max > 0) {
    for (const [k, e] of INDEX) {
      if (!e.iso) continue;
      const dist = editDistance(base, k, max);
      if (dist < best) [best, candidates] = [dist, new Set([e.iso])];
      else if (dist === best && dist <= max) candidates.add(e.iso);
    }
  }
  if (best <= max && candidates.size === 1) {
    const iso = [...candidates][0];
    return { raw, iso, tr: nameOf(iso), needsReview: true, reason: "typo", suggestions: [iso], source: "fuzzy" };
  }
  const suggestions = best <= max ? [...candidates] : [];
  return { raw, iso: null, tr: null, needsReview: true, reason: suggestions.length ? "ambiguous" : "unknown", suggestions, source: "unmapped" };
}

/**
 * @param rows parsed KBS rows
 * @param period "YYYY-MM"
 * @param opts { beds, asOf, plannedDepartures, userMap }
 *   Guests still in-house have no departure in the file (KBS "1900" sentinel). Owner (S-81): stays may
 *   run into the next month and all their nights still belong to the arrival month. So:
 *   1. plannedDepartures["<room>|<arrival>"] (from Bismuth's own reservation) → counted to that day;
 *   2. otherwise counted to `asOf` (product: the import day; default here: first day of next month).
 *   Both are marked as estimated and listed in `inHouse` so the user can correct them.
 */
export function ministryTable(rows, period, opts = {}) {
  const [y, m] = period.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const inPeriod = rows.filter((r) => r.arrival.startsWith(period));
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const asOf = opts.asOf ?? next;
  const planned = opts.plannedDepartures ?? {};
  const byCountry = new Map();
  const inHouse = [];
  const review = new Map();
  const issues = { sameDay: 0, active: 0, missingDeparture: 0, unmapped: new Set(), outsidePeriod: rows.length - inPeriod.length };
  for (const r of inPeriod) {
    const nat = mapNationality(r.nationalityRaw, opts.userMap);
    let nights = nightsOf(r.arrival, r.departure);
    if (nights == null) {
      issues.missingDeparture++;
      const plan = planned[`${r.room}|${r.arrival}`];
      const until = plan && plan >= r.arrival ? plan : asOf;
      nights = Math.max(1, dayDiff(r.arrival, until));
      inHouse.push({ room: r.room, arrival: r.arrival, countedUntil: until, nights, basis: plan ? "plan" : "asOf" });
    }
    if (r.departure && dayDiff(r.arrival, r.departure) === 0) issues.sameDay++;
    if (/aktif/i.test(r.status)) issues.active++;
    if (nat.needsReview) {
      if (!nat.iso) issues.unmapped.add(r.nationalityRaw);
      const k = r.nationalityRaw;
      const cur = review.get(k) ?? { raw: k, iso: nat.iso, tr: nat.tr, reason: nat.reason, suggestions: nat.suggestions, rows: 0 };
      cur.rows++;
      review.set(k, cur);
    }
    const label = nat.tr ?? `? ${r.nationalityRaw}`;
    const cur = byCountry.get(label) ?? { country: label, iso: nat.iso, arrivals: 0, nights: 0 };
    cur.arrivals += 1;
    cur.nights += nights;
    byCountry.set(label, cur);
  }
  const table = [...byCountry.values()].sort((a, b) => b.arrivals - a.arrivals || b.nights - a.nights || a.country.localeCompare(b.country, "tr"));
  const totals = table.reduce((t, r) => ({ arrivals: t.arrivals + r.arrivals, nights: t.nights + r.nights }), { arrivals: 0, nights: 0 });
  const occupancy = opts.beds ? totals.nights / (opts.beds * daysInMonth) : null;
  return {
    period,
    daysInMonth,
    table,
    totals,
    occupancy,
    inHouse,
    review: [...review.values()],
    issues: { ...issues, unmapped: [...issues.unmapped] },
  };
}

/** Tab-separated text the user can paste row by row into the ministry panel. */
export function toClipboardText(result) {
  return result.table.map((r) => `${r.country}\t${r.arrivals}\t${r.nights}`).join("\n");
}
