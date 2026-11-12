import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildFixture } from "./make-fixture.mjs";
import { readKbs, ministryTable, nightsOf, toLocalDay, mapNationality, normalizeCountryKey, editDistance, toClipboardText } from "./kbs.mjs";

const FIX = new URL("./fixture-kbs.xlsx", import.meta.url).pathname;
await buildFixture(FIX);
const parsed = await readKbs(readFileSync(FIX));

test("Excel seri tarihleri saat dilimi kaymadan güne çevrilir", () => {
  assert.equal(toLocalDay(46286.97929471065), "2026-09-21"); // real-file sample, 23:30
  assert.equal(toLocalDay(46276.988396493056), "2026-09-11");
  assert.equal(toLocalDay(1), "1899-12-31"); // KBS "no departure" sentinel region
  assert.equal(toLocalDay("21.09.2026 10:00"), "2026-09-21");
});

test("aynı gün giriş-çıkış 1 gece sayılır; normal konaklama gün farkıdır", () => {
  assert.equal(nightsOf("2026-09-05", "2026-09-05"), 1);
  assert.equal(nightsOf("2026-09-10", "2026-09-14"), 4);
});

test("seyrek hücreli dosya başlık adına göre okunur; kimlik sütunları okunmaz", () => {
  assert.equal(parsed.rows.length, 8);
  for (const r of parsed.rows) assert.deepEqual(Object.keys(r).sort(), ["arrival", "departure", "gender", "nationalityRaw", "room", "status"]);
});

test("tüm geceler giriş ayına yazılır; başka ayda gelen hariç tutulur", () => {
  const res = ministryTable(parsed.rows, "2026-09", { beds: 28 });
  assert.equal(res.totals.arrivals, 7); // August arrival excluded
  assert.equal(res.totals.nights, 1 + 1 + 4 + 2 + 1 + 3 + 1); // 30 Sep → 2 Oct = 2 nights in Sep; in-house from 28 Sep = 3
  assert.equal(res.issues.sameDay, 1);
  assert.equal(res.issues.active, 1);
  assert.equal(res.issues.missingDeparture, 1); // 1900-01-01 sentinel treated as "not checked out"
  assert.equal(res.issues.outsidePeriod, 1);
  const tr = res.table.find((r) => r.iso === "TR");
  assert.deepEqual([tr.country, tr.arrivals, tr.nights], ["Türkiye", 2, 2]);
});

test("uyruk eşleme: parantezli uzun adlar, KKTC, tarihi kayıtlar", () => {
  assert.equal(mapNationality("GERMANY (Deutschland)").tr, "Almanya");
  assert.equal(mapNationality("SWITZERLAND (Confederation of Helvetia)").tr, "İsviçre");
  assert.equal(mapNationality("UZBEKISTAN").tr, "Özbekistan");
  assert.equal(mapNationality("KUZEY KIBRIS TURK CUMHURİYETİ").tr, "Kuzey Kıbrıs Türk Cumhuriyeti");
  assert.equal(mapNationality("SERBIA AND MONTENEGRO").needsReview, true);
  assert.equal(mapNationality("ATLANTIS").source, "unmapped");
  assert.equal(mapNationality("ATLANTIS", { ATLANTIS: { iso: "XA", tr: "Atlantis" } }).tr, "Atlantis");
});

test("ülke anahtarı Türkçe büyük harf, aksan ve noktalama farkını yok sayar", () => {
  assert.equal(normalizeCountryKey("Türkiye"), "TURKIYE");
  assert.equal(normalizeCountryKey("TÜRKİYE"), "TURKIYE");
  assert.equal(normalizeCountryKey("K.K.T.C."), "KKTC");
  assert.equal(normalizeCountryKey("Kuzey  Kıbrıs Türk Cumhuriyeti"), "KUZEY KIBRIS TURK CUMHURIYETI");
  assert.equal(normalizeCountryKey("KOREA, REPUBLIC OF"), "KOREA REPUBLIC OF");
  assert.equal(editDistance("TURKYIE", "TURKIYE"), 1); // adjacent transposition counts as one edit
});

test("Türkiye ve KKTC'nin farklı yazımları aynı ülkeye gider (yazım hatası önlemi)", () => {
  for (const s of ["TÜRKİYE", "TURKIYE", "Türkiye", "TURKEY", "TÜRKİYE CUMHURİYETİ", "T.C."]) {
    const m = mapNationality(s);
    assert.deepEqual([m.iso, m.needsReview], ["TR", false], s);
  }
  for (const s of ["KUZEY KIBRIS TURK CUMHURİYETİ", "KUZEY KIBRIS TÜRK CUMHURİYETİ", "Kuzey Kıbrıs Türk Cumhuriyeti", "KKTC", "K.K.T.C.", "NORTHERN CYPRUS"]) {
    const m = mapNationality(s);
    assert.deepEqual([m.iso, m.tr, m.needsReview], ["XC", "Kuzey Kıbrıs Türk Cumhuriyeti", false], s);
  }
});

test("harf hatalı yazım tek adaya yakınsa eşlenir ama kullanıcı onayı ister", () => {
  for (const [s, iso] of [["TÜRKYİE", "TR"], ["TRKİYE", "TR"], ["TÜRKİYYE", "TR"], ["KUZY KIBRIS TURK CUMHURIYETI", "XC"], ["GERMNY", "DE"]]) {
    const m = mapNationality(s);
    assert.deepEqual([m.iso, m.needsReview, m.reason, m.source], [iso, true, "typo", "fuzzy"], s);
  }
});

test("belirsiz ya da hassas değerler otomatik eşlenmez: KIBRIS, CYPRUS, tarihî ülke", () => {
  const kibris = mapNationality("KIBRIS");
  assert.deepEqual([kibris.iso, kibris.needsReview, kibris.suggestions], [null, true, ["XC", "CY"]]);
  const cyprus = mapNationality("CYPRUS");
  assert.deepEqual([cyprus.iso, cyprus.tr, cyprus.needsReview], ["CY", "Güney Kıbrıs Rum Kesimi", true]);
  assert.deepEqual(mapNationality("SERBIA AND MONTENEGRO").suggestions, ["RS", "ME"]);
});

test("Türkçe yazılmış ülke adları da tanınır; kısa kodlar bulanık eşlenmez", () => {
  assert.equal(mapNationality("ALMANYA").iso, "DE");
  assert.equal(mapNationality("IRAK").iso, "IQ");
  assert.equal(mapNationality("ÖZBEKİSTAN").iso, "UZ");
  assert.equal(mapNationality("RUSSIAN FEDERATION").tr, "Rusya Federasyonu");
  assert.equal(mapNationality("XQ").source, "unmapped");
});

test("kullanıcının onayladığı eşleme kalıcıdır ve önce gelir", () => {
  const userMap = { TURKYIE: { iso: "TR", tr: "Türkiye" } };
  const m = mapNationality("TÜRKYİE", userMap);
  assert.deepEqual([m.iso, m.needsReview, m.source], ["TR", false, "user"]);
});

test("bakanlık doluluk oranı = geceleme ÷ (yatak × gün): panel örneği %0,24", () => {
  const res = ministryTable([{ arrival: "2026-09-10", departure: "2026-09-12", room: "1", gender: null, nationalityRaw: "UZBEKISTAN", status: "Pasif" }], "2026-09", { beds: 28 });
  assert.equal(res.totals.nights, 2);
  assert.equal((res.occupancy * 100).toFixed(2), "0.24");
});

test("hâlâ otelde olanlar için sayım tarihi kullanıcıca değiştirilebilir", () => {
  const res = ministryTable(parsed.rows, "2026-09", { asOf: "2026-09-30" });
  assert.equal(res.totals.nights, 1 + 1 + 4 + 2 + 1 + 2 + 1);
});

test("otelde kalan misafir Bismuth'taki planlı çıkışa kadar sayılır (sonraki aya sarkan geceler dahil)", () => {
  const inHouse = parsed.rows.find((r) => !r.departure && r.arrival.startsWith("2026-09"));
  const key = `${inHouse.room}|${inHouse.arrival}`;
  const base = ministryTable(parsed.rows, "2026-09");
  const res = ministryTable(parsed.rows, "2026-09", { plannedDepartures: { [key]: "2026-10-04" } });
  assert.equal(res.totals.nights - base.totals.nights, 3); // 28 Sep → 4 Oct = 6 nights instead of 3
  assert.deepEqual(res.inHouse.map((x) => [x.basis, x.countedUntil, x.nights]), [["plan", "2026-10-04", 6]]);
  assert.deepEqual(base.inHouse.map((x) => x.basis), ["asOf"]);
});

test("panoya kopyalama metni sekmeyle ayrılmış satırlardır", () => {
  const res = ministryTable(parsed.rows, "2026-09");
  assert.match(toClipboardText(res).split("\n")[0], /^Türkiye\t2\t2$/);
});
