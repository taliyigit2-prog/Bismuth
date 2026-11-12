// Builds a synthetic KBS export that mimics the real file's structure (same headers, masked identity columns,
// Excel serial dates, SPARSE cells — empty cells are simply absent). Contains no real personal data.
import ExcelJS from "exceljs";

const serial = (iso, hh = 14, mm = 0) => (iso === "1900-01-01" ? 1 : Date.parse(iso + "T00:00:00Z") / 86400000 + 25569 + (hh * 60 + mm) / 1440);

export const FIXTURE_ROWS = [
  // tc, belge, ad, soyad, plaka, gelis, cikis, oda, cinsiyet, uyruk, durum
  ["11******111", "", "AA***** ", "BB***** ", "", ["2026-09-01", 23], ["2026-09-02", 11], "203", "Kadın", "TÜRKİYE", "Pasif"], // 1 night
  ["22******222", "", "CC***** ", "DD***** ", "34***12", ["2026-09-05", 2], ["2026-09-05", 10], "104", "Erkek", "TÜRKİYE", "Pasif"], // same day → 1
  ["", "U1*****", "EE***** ", "FF***** ", "", ["2026-09-10", 15], ["2026-09-14", 11], "502", "Kadın", "GERMANY (Deutschland)", "Pasif"], // 4
  ["", "U2*****", "GG***** ", "HH***** ", "", ["2026-09-30", 20], ["2026-10-02", 10], "501", "Erkek", "UZBEKISTAN", "Pasif"], // cross-month → 2 in Sep
  ["", "U3*****", "II***** ", "JJ***** ", "", ["2026-09-20", 18], ["2026-09-21", 9], "301", "Erkek", "KUZEY KIBRIS TURK CUMHURİYETİ", "Pasif"], // 1
  ["", "U4*****", "KK***** ", "LL***** ", "", ["2026-09-28", 12], ["1900-01-01", 0], "402", "Kadın", "SWITZERLAND (Confederation of Helvetia)", "Aktif"], // in-house → 3 (28,29,30 Sep)
  ["", "U5*****", "MM***** ", "NN***** ", "", ["2026-09-15", 1], ["2026-09-16", 8], "303", "Erkek", "SERBIA AND MONTENEGRO", "Pasif"], // 1, needs review
  ["", "U6*****", "OO***** ", "PP***** ", "", ["2026-08-31", 22], ["2026-09-02", 9], "201", "Kadın", "POLAND", "Pasif"], // August arrival → excluded
];

export async function buildFixture(file) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(" EGM_Konaklayan_Listesi");
  ws.addRow(["Tc Kimlik No", "Geçerli Belge", "Adı", "Soyadı", "Araç Plakası", "Geliş Tarihi", "Çıkış Tarihi", "Verilen Oda", "Cinsiyet", "Uyruğu", "Durum"]);
  FIXTURE_ROWS.forEach((r, i) => {
    const row = ws.getRow(i + 2);
    const values = r.map((v) => (Array.isArray(v) ? serial(v[0], v[1]) : v));
    values.forEach((v, c) => {
      if (v !== "" && v != null) row.getCell(c + 1).value = v; // leave empty cells absent (sparse)
    });
    row.commit();
  });
  await wb.xlsx.writeFile(file);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildFixture(new URL("./fixture-kbs.xlsx", import.meta.url).pathname);
  console.log("fixture-kbs.xlsx written");
}
