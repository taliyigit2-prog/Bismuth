import { test } from "node:test";
import assert from "node:assert/strict";
import { trHolidays, genericHolidays } from "./tr-holidays.mjs";

const pick = (y, re) => trHolidays(y).filter((r) => re.test(r.title)).map((r) => `${r.date} ${r.kind === "half_holiday" ? "½" : "1"}`);

test("2026 Ramazan Bayramı: arife 19 Mart yarım gün + 20–22 Mart (Diyanet)", () => {
  assert.deepEqual(pick(2026, /^Ramazan/), ["2026-03-19 ½", "2026-03-20 1", "2026-03-21 1", "2026-03-22 1"]);
});

test("2026 Kurban Bayramı: arife 26 Mayıs yarım gün + 27–30 Mayıs (Diyanet)", () => {
  assert.deepEqual(pick(2026, /^Kurban/), ["2026-05-26 ½", "2026-05-27 1", "2026-05-28 1", "2026-05-29 1", "2026-05-30 1"]);
});

test("28 Ekim öğleden sonra yarım gün, 29 Ekim tam gün", () => {
  assert.deepEqual(pick(2026, /^Cumhuriyet/), ["2026-10-28 ½", "2026-10-29 1"]);
});

test("sabit resmi tatiller her yıl var (15 Temmuz dahil)", () => {
  const dates = trHolidays(2031).filter((r) => r.kind === "holiday").map((r) => r.date.slice(5));
  for (const d of ["01-01", "04-23", "05-01", "05-19", "07-15", "08-30", "10-29"]) assert.ok(dates.includes(d), d);
});

test("2033'te iki Ramazan Bayramı vardır (Hicri yıl kayması)", () => {
  const firstDays = trHolidays(2033).filter((r) => r.title === "Ramazan Bayramı 1. Gün").map((r) => r.date);
  assert.equal(firstDays.length, 2, JSON.stringify(firstDays));
});

test("sınırsız yıl: 2026–2200 arası her yıl üretilir; kütüphane tablosu bitince Intl yedeği devreye girer", () => {
  assert.equal(trHolidays(2050).find((r) => /Bayramı 1\. Gün/.test(r.title)).source, "date-holidays");
  assert.equal(trHolidays(2100).find((r) => /Bayramı 1\. Gün/.test(r.title)).source, "intl-umalqura");
  for (let y = 2026; y <= 2200; y++) {
    const rows = trHolidays(y);
    assert.ok(rows.some((r) => /Bayramı 1\. Gün/.test(r.title)), String(y));
  }
});

test("diğer ülkeler için de üretim çalışır (ürün genel)", () => {
  assert.ok(genericHolidays("DE", 2027, "de").length >= 9);
  assert.ok(genericHolidays("RU", 2027, "ru").length >= 8);
});
