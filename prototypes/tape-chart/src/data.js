// Synthetic data for the spike: Pandora-like 19 rooms, 10 years, deterministic PRNG.
export const ROOMS = [
  ["101", "Junior"], ["102", "Standard"], ["103", "Double"], ["104", "Regular"],
  ["201", "Junior"], ["202", "Standard"], ["203", "Double"], ["204", "Regular"],
  ["301", "Junior"], ["302", "Standard"], ["303", "Twin"], ["304", "Regular"],
  ["401", "Junior"], ["402", "Standard"], ["403", "Twin"], ["404", "Regular"],
  ["501", "Luxury"], ["502", "Deluxe"], ["503", "Deluxe"],
];
export const START = Date.UTC(2026, 0, 1);
export const DAYS = 3653; // 2026-01-01 … 2035-12-31
export const dayIso = (i) => new Date(START + i * 86400000).toISOString().slice(0, 10);
export const TODAY = Math.round((Date.UTC(2026, 9, 1) - START) / 86400000);

function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const NAMES = ["Ömer Başbuğ", "Gizem Yüce", "Fethi Erdem", "Serhat Sakar", "Gökhan Sarı", "Emre Çalışkan", "Salih Çelik", "Aynur Kılıç", "Onur Öztürk", "Kenan Demir", "Ivan Petrov", "Anna Müller"];

/** stays[roomIndex] = sorted [{start, nights, kind:'night'|'dayuse'|'block', name, price, paidNights, partial}] */
export function generate() {
  const r = rng(42);
  const stays = ROOMS.map(() => []);
  let total = 0;
  for (let room = 0; room < ROOMS.length; room++) {
    let d = 0;
    while (d < DAYS) {
      d += Math.floor(r() * 3); // gap 0–2 days
      if (d >= DAYS) break;
      const roll = r();
      if (roll < 0.04) {
        stays[room].push({ start: d, nights: 1, kind: "dayuse", name: NAMES[Math.floor(r() * NAMES.length)], price: 1600 });
        // a normal stay can start the same day after a day-use (split cell)
      } else if (roll < 0.05) {
        const n = 2 + Math.floor(r() * 5);
        stays[room].push({ start: d, nights: n, kind: "block", name: "SATILMAZ" });
        d += n;
        continue;
      }
      const nights = 1 + Math.floor(r() * 5);
      const paidNights = r() < 0.75 ? nights : Math.floor(r() * nights);
      stays[room].push({ start: d, nights: Math.min(nights, DAYS - d), kind: "night", name: NAMES[Math.floor(r() * NAMES.length)], price: 2000 + 100 * Math.floor(r() * 9), paidNights });
      d += nights;
      total++;
    }
  }
  return { stays, total: stays.reduce((a, s) => a + s.length, 0) };
}

/** Binary search: stays of a room overlapping [d0, d1). */
export function overlapping(list, d0, d1) {
  let lo = 0, hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].start + Math.max(1, list[mid].nights) <= d0) lo = mid + 1;
    else hi = mid;
  }
  const out = [];
  for (let i = Math.max(0, lo - 1); i < list.length && list[i].start < d1; i++) {
    const s = list[i];
    if (s.start + Math.max(1, s.nights) > d0) out.push(s);
  }
  return out;
}
