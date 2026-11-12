// Faz 0 · A0.1 packaging spike (not product code).
// Verifies on real Windows/macOS: window opens with hardened webPreferences, better-sqlite3 loads from the
// unpacked asar, WAL + backup work in userData, and the renderer supports the CSS features Tailwind v4 needs.
// `--smoke` runs headless-ish: performs the checks, writes smoke-result.json next to userData, exits.
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const SMOKE = process.argv.includes("--smoke");
const SMOKE_OUT = (process.argv.find((a) => a.startsWith("--smoke-out=")) || "").slice("--smoke-out=".length);
const t0 = Date.now();

function dbCheck() {
  const Database = require("better-sqlite3");
  const dir = app.getPath("userData");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "proto.db");
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec("CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, at TEXT NOT NULL, amount_minor INTEGER NOT NULL, note TEXT)");
  const insert = db.prepare("INSERT INTO runs (at, amount_minor, note) VALUES (?, ?, ?)");
  const tx = db.transaction((n) => {
    for (let i = 0; i < n; i++) insert.run(new Date().toISOString(), 250000 + i, "Çağrı ğüşıöç İİ ı — Привет");
  });
  const w0 = performance.now();
  tx(10000);
  const writeMs = Math.round(performance.now() - w0);
  const count = db.prepare("SELECT COUNT(*) AS c FROM runs").get().c;
  const sample = db.prepare("SELECT note FROM runs ORDER BY id DESC LIMIT 1").get().note;
  const integrity = db.pragma("integrity_check", { simple: true });
  const sqliteVersion = db.prepare("SELECT sqlite_version() AS v").get().v;
  const backupFile = path.join(dir, "proto-backup.db");
  db.exec(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`);
  const backupBytes = fs.statSync(backupFile).size;
  fs.rmSync(backupFile);
  db.close();
  return { ok: true, file, count, writeMs10k: writeMs, sample, integrity, sqliteVersion, backupBytes };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    show: !SMOKE,
    title: "Bismuth Proto",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, "index.html"));
  return win;
}

ipcMain.handle("proto:info", () => {
  let db;
  try {
    db = dbCheck();
  } catch (e) {
    db = { ok: false, error: String(e && e.stack ? e.stack : e) };
  }
  return {
    app: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: `${process.platform}-${process.arch}`,
    osRelease: require("node:os").release(),
    locale: app.getLocale(),
    packaged: app.isPackaged,
    userData: app.getPath("userData"),
    startupMs: Date.now() - t0,
    db,
  };
});

ipcMain.handle("proto:report", (_e, renderer) => {
  if (!SMOKE) return;
  const out = SMOKE_OUT || path.join(app.getPath("userData"), "smoke-result.json");
  fs.writeFileSync(out, JSON.stringify(renderer, null, 2));
  console.log("SMOKE_RESULT " + JSON.stringify(renderer));
  setTimeout(() => app.quit(), 200);
});

app.setAppUserModelId("com.bismuth.hotel.proto");
app.whenReady().then(() => {
  createWindow();
  if (SMOKE) setTimeout(() => { console.log("SMOKE_TIMEOUT"); app.exit(3); }, 60000);
});
app.on("window-all-closed", () => app.quit());
