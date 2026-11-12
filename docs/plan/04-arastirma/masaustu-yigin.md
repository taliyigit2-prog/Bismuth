# Desktop stack research — offline hotel management app (Electron vs Tauri, SQLite, packaging, signing)

Researched 2026-10-01. Facts were checked against primary sources where reachable (npm registry, Electron `DEPS` files on GitHub, Node.js docs, electron-builder source, Tauri docs source, better-sqlite3 tarball). Secondary sources (search summaries, blog posts, GitHub issues) are marked as such. Several official doc sites (electronjs.org, electron.build, tauri.app, tailwindcss.com, learn.microsoft.com, playwright.dev) were blocked by the sandbox proxy, so their content was read from the GitHub source of the docs or from search excerpts.

Project constraints recap: fully offline, React + TS + Tailwind + shadcn/ui, local SQLite, Windows `Setup.exe` + macOS `.dmg`, double-click install by non-technical staff, "lightweight", widest possible OS coverage, **frozen after v1.0 (no multi-year maintenance)**, builds from GitHub Actions, possible later LAN mode (one PC hosts the DB, other PCs connect), development in Linux cloud sessions driven by AI.

---

## 1. Electron

### 1.1 Current versions (npm registry + Electron `DEPS`, 2026-10-01)

| Electron | Latest patch | Published | Chromium | Node.js | Status |
|---|---|---|---|---|---|
| **44** | **44.5.1** | 2026-09-30 | 152.0.7977.130 | v24.21.0 | current stable (44.0.0 on 2026-08-25) |
| 43 | 43.7.7 | 2026-09-30 | 150.0.7871.250 | v24.21.0 | supported |
| 42 | 42.11.10 | 2026-09-30 | 148.0.7778.280 | v24.19.0 | supported (drops when 45 ships) |
| 41 | 41.10.7 | 2026-08-25 | 146.0.7680.216 | v24.18.0 | EOL |
| 40 | 40.10.6 | 2026-07-01 | 144.0.7559.236 | v24.15.0 | EOL (first major on Node 24) |
| 39 | 39.8.10 | — | 142.0.7444.265 | v22.22.1 | EOL |
| 38 | 38.8.6 | — | 140.0.7339.249 | v22.22.0 | EOL |
| 37 | 37.10.3 | — | 138.0.7204.251 | v22.21.1 | EOL — last line that runs on macOS 11 |
| 45 | 45.0.0-alpha.13 | 2026-09-28 | 154/156 | v24.x | stable expected **2026-10-20** |

Policy: the Electron team supports the **latest three stable majors**; a new major every 8 weeks (Chromium even numbers). Electron moves to even Node.js majors when they reach Active LTS.

### 1.2 Minimum OS versions (from `docs/breaking-changes.md` + README on GitHub)

| OS floor | Electron majors |
|---|---|
| **macOS 13 Ventura+** | **44 and newer** (Chromium 152 dropped macOS 12) |
| macOS 12 Monterey+ | 38–43 (43.7.7 is the last Monterey-capable line, supported until ~March 2027) |
| macOS 11 Big Sur+ | 33–37 (37.10.3 last) |
| macOS 10.15 Catalina+ | 27–32 (32.3.3 last, 2025-03-03) |
| macOS 10.13/10.14 | ≤26 (26.6.10 last, 2024-02-19) |
| **Windows 10+** (x64 + arm64) | **23 and newer** |
| Windows 7 / 8 / 8.1 | ≤22 (22.3.27 last, 2023-10-09; Chromium 108 — unusable with Tailwind v4 / modern CSS) |

Notes:
- Electron's README now lists only `x64` and `arm64` for Windows. Community reports say Electron 44 also stopped publishing some prebuilt architectures (likely `win32-ia32`). If 32-bit Windows 10 PCs matter, verify ia32 availability for the chosen major before committing; 43.x still had it. (Secondary source.)
- Windows 10 reached end of support 2025-10-14 (ESU to Oct 2026, with press reports of a further extension). Microsoft committed Edge/WebView2 updates on Windows 10 until at least Oct 2028; Google has made no firm Chrome-on-Win10 cutoff statement. For a frozen Electron app this is irrelevant: the bundled Chromium keeps running on Windows 10 regardless.

### 1.3 Size and memory (facts + typical numbers)

- Official prebuilt runtime zips for v44.5.1 (GitHub release assets): `win32-x64` **151 MB**, `win32-arm64` 149 MB, `darwin-arm64` 124 MB, `darwin-x64` 128 MB, `linux-x64` 117 MB (these are the zips; unpacked on disk ≈ 200–260 MB incl. your app).
- Expect an NSIS installer of roughly **80–110 MB** (LZMA compression) and a DMG of **~100–130 MB** per architecture; a universal macOS build is nearly double.
- RAM: a small app typically sits at **150–300 MB** total across main + renderer + GPU processes; the floor for any Electron app is ~80 MB (secondary sources: HN threads, Windows Latest 2026-09-27). A hello-world Tauri app idles around 40–80 MB. On a 4 GB front-desk PC this is acceptable; on a 2 GB machine it is tight but workable if you keep one window.

### 1.4 Build tooling

| Tool | Version | Date | Notes |
|---|---|---|---|
| electron-vite | **5.0.0** | 2025-12-07 | Stable. Peer `vite ^5 || ^6 || ^7`, Node `^20.19 || >=22.12`. Main/preload/renderer in one config, HMR, `externalizeDeps`, optional bytecode. **Does not support Vite 8.** |
| electron-vite | 6.0.0-beta.5 | 2026-09-29 | Vite 8 + rolldown, "compat target for Electron 42/43/44". Beta since 2026-04. |
| vite-plugin-electron | 1.1.2 | 2026-08-31 | Peer `vite >=6` (works with Vite 8.3.2). Lighter, less opinionated; renderer Node access needs the sibling `vite-plugin-electron-renderer`. |
| vite | 8.3.2 / 7.3.6 | 2026-10-01 / — | Pin 7.3.x if using electron-vite 5. |
| electron-builder | **26.15.3** | 2026-06-09 | NSIS, DMG, universal, notarization, Windows/mac signing. Node ≥14. |
| @electron-forge/cli | 8.0.1 | 2026-09-29 | ESM-only, Node ≥22.13, Vite 8 integration, makers: Squirrel.Windows, WiX MSI, DMG, ZIP (no NSIS maker). |
| @electron/rebuild | 4.2.0 | 2026-07-07 | Not needed with N-API prebuilt modules (see §3). |
| electron-updater | 6.8.9 | 2026-06-05 | **Separate optional package**; simply do not install it. |

**electron-builder vs Electron Forge for this project**
- electron-builder: the only mainstream path to a classic **NSIS `Setup.exe`** (one-click or assisted wizard, per-user or per-machine choice, Turkish installer language, custom `installer.nsh` for things like firewall rules). Produces `.dmg` directly. Single YAML config. Recommended here.
- Forge: official Electron project, cleaner signing story (`@electron/osx-sign`, `@electron/windows-sign`), but Windows default is Squirrel (installs silently to `%LocalAppData%`, no wizard, awkward uninstall UX) or WiX MSI. Fine, but it does not match the "Setup.exe wizard" expectation.

**NSIS options that matter** (electron-builder `nsis` block; defaults from the option docs):
- `oneClick: true` (default) → silent-ish one-click installer, per-user. For a hotel PC use `oneClick: false` (assisted wizard).
- `perMachine: false` (default). With `oneClick: false` + `perMachine: false` the wizard shows an **"Install for me / for all users"** page; `allowElevation: true` lets it request UAC when "all users" is chosen.
- `allowToChangeInstallationDirectory: true` for the wizard.
- `differentialPackage: false` to stop generating `.blockmap` files (only needed by electron-updater). `publish: null` at the top level disables publishing and `latest.yml` generation.
- `installerLanguages: [tr_TR, en_US]` + `multiLanguageInstaller`.
- Windows ARM64: `win.target: [{ target: nsis, arch: [x64, arm64] }]` produces two installers; x64 also runs under emulation on ARM PCs.

**macOS targets**: `mac.target` default is `dmg` + `zip`; set `[{ target: dmg, arch: [x64, arm64] }]`. Universal (`arch: [universal]`) uses `@electron/universal` and must be told about native binaries that are identical across slices (`x64ArchFiles`), otherwise it fails with "Expected all non-binary files to have identical SHAs" (electron-builder issue #10031, and several 2026 repos hit this with better-sqlite3's bundled prebuilds). Two separate DMGs ("Apple Silicon" / "Intel") are simpler and half the size; universal is friendlier for non-technical users. Either works; if you go universal, set `asarUnpack` for better-sqlite3 and `x64ArchFiles: "**/*.node"`.

### 1.5 Cross-building and GitHub Actions

- NSIS from Linux: still requires **Wine 2.0+** (electron-builder shells out to `makensis.exe`); use the `electronuserland/builder:wine` Docker image. It works, but Windows code signing from Linux is painful and you cannot smoke-test the result there.
- DMG: requires `hdiutil` → **macOS only**. Signing/notarization also require macOS.
- Therefore the sane layout is a **matrix with `windows-latest` + `macos-latest`**, each building its own installer natively. As of June 2026 `macos-latest` = **macOS 26 on Apple Silicon (arm64)**; `windows-latest` = Windows Server 2025 with VS 2026. The arm64 Mac runner can package the x64 DMG too (Electron is prebuilt; native modules are prebuilt for both arches).
- Current action majors: `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7` (Node 24 runtime; older Node 20 actions are being removed). Sample workflow in §10.

### 1.6 Electron Fuses (optional hardening)

`@electron/fuses` 2.1.3 can flip `RunAsNode`, `EnableNodeCliInspectArguments`, `OnlyLoadAppFromAsar` etc. Note Playwright's Electron driver needs `EnableNodeCliInspectArguments`/remote debugging; keep fuses default until E2E tests are stable, or only flip them in the release job after smoke tests.

---

## 2. Tauri v2

### 2.1 Versions and requirements

- `@tauri-apps/cli` / `@tauri-apps/api` **2.12.1** (2026-09-30); 2.12.0 on 2026-09-26; 2.11.0 on 2026-04-30; 2.0.0 GA on 2024-10-02.
- **MSRV: Rust 1.90** (workspace `rust-version = "1.90"`, raised in 2.12). CI: `dtolnay/rust-toolchain@stable` + `Swatinem/rust-cache` + `tauri-apps/tauri-action@v1`; cold builds take ~5–15 min per OS; Windows needs the MSVC toolchain (present on GitHub runners).
- **Windows: 2.12 dropped Windows 7** (the current WebView2 installer no longer runs on Win7). Effective floor: Windows 10 (WebView2 Evergreen supports Win10/11; Edge/WebView2 ended Win7/8.1 in Jan 2023).
- **macOS**: default `minimumSystemVersion` is 10.13; docs recommend targeting 10.15+. Tauri itself runs on old macOS, but the *rendering engine is the OS's WebKit* (see 2.3).

### 2.2 WebView2 on Windows (facts from Microsoft and Tauri docs via search/source)

- Windows 11: WebView2 Runtime is part of the OS.
- Windows 10: Microsoft pushed the Evergreen Runtime via Windows Update to **consumer Home/Pro devices on 1803+** starting June 2022. It is commonly **missing on clean installs, LTSC, Server and some managed/domain PCs**. A PC without it cannot start a Tauri app unless the installer brings it.
- Tauri `bundle.windows.webviewInstallMode` options: `downloadBootstrapper` (0 MB, **needs internet**, default), `embedBootstrapper` (~1.8 MB, **still needs internet** to download the runtime), `offlineInstaller` (Tauri docs say ~127 MB; the current Evergreen Standalone Installer is actually **~200–250 MB**), `fixedVersion` (~180 MB+, pinned engine), `skip`.
- Consequence for an **offline hotel**: you must ship `offlineInstaller` or `fixedVersion`, so the "tiny installer" advantage evaporates (installer ≈ 130–250 MB, i.e. the same or larger than Electron's). With Evergreen, the engine also keeps auto-updating underneath a frozen app, so rendering is not reproducible; `fixedVersion` fixes that but you then ship an unpatched Chromium forever, same as Electron.
- `installMode`: `currentUser` (default, no admin), `perMachine` (admin), `both`. NSIS can be cross-compiled from Linux; MSI (WiX) is Windows-only.

### 2.3 WKWebView on macOS — this is the real problem for Tailwind v4

WKWebView uses the system WebKit, which is only as new as the last Safari update that macOS version received:

| macOS | Last Safari/WebKit | Tailwind v4 (needs Safari 16.4+) |
|---|---|---|
| 10.15 Catalina | 15.6.1 | **broken** (no `@property`, no `color-mix()`, no container queries) |
| 11 Big Sur | 16.6.1 | works **only if the user installed Safari 16.4+ updates** |
| 12 Monterey | 17.6 | works |
| 13 Ventura | 18.6 | works |
| 14/15/26 | current | works |

Tailwind CSS **4.3.3** (2026-07-16) officially requires **Safari 16.4+, Chrome 111+, Firefox 128+**; it depends on `@property`, `color-mix()`, OKLCH and cascade layers for core features, and the maintainers say it is not possible to use v4 on older engines (official compatibility page; discussion #15356). Feature arrival in Safari: `:has()` 15.4, OKLCH 15.4, `@layer` 15.4, container queries 16.0, `color-mix()` 16.2, `@property` 16.4, `@starting-style` 17.5, `field-sizing` not shipped. In Electron 44 (Chromium 152) all of these are present and identical on every machine.

So with Tauri the "works on old Macs" promise is false for a Tailwind v4 + shadcn/ui UI: Catalina is out, Big Sur is a coin-flip, and bugs would differ per OS version. With Electron you decide the floor once (macOS 13 for 44.x, macOS 12 for 43.x) and rendering is byte-identical everywhere.

### 2.4 Data layer in Tauri

- `tauri-plugin-sql` (sqlx-based): migrations defined in Rust (`Migration { version, description, sql, kind }`), JS API `Database.load("sqlite:app.db")`, `execute`/`select` with `$1` placeholders, permissions must be enabled in capabilities. No TypeScript-side schema/typing; every query is a string crossing the IPC bridge. Backup/integrity need extra Rust commands.
- `rusqlite` directly: you write all data access as Rust `#[tauri::command]`s — a second language and toolchain for every AI session to get right.
- Node sidecar: `externalBin` with `-$TARGET_TRIPLE` suffixed binaries per platform (`x86_64-pc-windows-msvc`, `aarch64-apple-darwin`, `x86_64-apple-darwin`), built with Node SEA/`pkg`; adds ~50–100 MB per platform and a second process to supervise — defeats the purpose.

### 2.5 Honest comparison for THIS project

| Criterion | Electron 44 | Tauri 2.12 |
|---|---|---|
| Installer size (offline-capable) | ~90–110 MB | ~5–10 MB **+ 200–250 MB offline WebView2** on Windows; ~5–15 MB on macOS |
| Idle RAM | ~150–300 MB | ~40–100 MB |
| Renderer consistency | identical Chromium 152 everywhere, frozen with the app | depends on OS WebKit / Evergreen WebView2; Tailwind v4 unsupported on Catalina, fragile on Big Sur |
| Old machines | Win10+, macOS 13+ (or 12+ with 43.x); heavy but predictable | Runs on older OS versions but the UI engine there is old |
| No-maintenance future | the engine never changes under you | Evergreen WebView2 updates can break a frozen app; WebKit differs per OS |
| Developer complexity | one language (TS), one process model, huge body of examples | TS + Rust, capabilities/permissions system, sqlx or rusqlite, cross-language debugging |
| AI-driven sessions | very well represented in training data; errors are JS errors | more moving parts; Rust compile errors per session; Linux session cannot run the Windows/mac webview at all |
| LAN mode later | Node HTTP server (Hono) in main process, same code | needs Rust HTTP server (axum) or sidecar |
| Offline fonts/printing/PDF | built-in `printToPDF`, Chromium print | WKWebView/WebView2 printing APIs differ per OS; PDF export needs plugins |

**Verdict: Electron.** Tauri wins on size and RAM only when you can rely on a modern online-updated system webview; this project explicitly cannot (offline, old machines, Tailwind v4, frozen product).

---

## 3. SQLite in Electron

### 3.1 Options

**better-sqlite3 13.0.3** (2026-08-05; 13.0.0 on 2026-07-21) — recommended.
- Rewritten on **Node-API (node-addon-api ^8)**: one binary works across Node and Electron versions, **no `@electron/rebuild`, no `node-gyp`, no network download at install**. Verified by unpacking the tarball (11.4 MB): `prebuilds/{darwin,linux,linuxmusl,win32}-{x64,arm64}.node` (≈2 MB each) are shipped inside the package; `package.json` has `gypfile: false` and no `install` script; `engines.node >= 22`.
- Bundled SQLite 3.53.x; synchronous API; `db.backup()`, `db.pragma()`, transactions, WAL all first-class.
- electron-builder: set `npmRebuild: false` (nothing to rebuild) and `asarUnpack: ["node_modules/better-sqlite3/**"]` (electron-builder auto-unpacks `.node` files, but being explicit avoids surprises with the universal merger). Windows ARM64 and macOS arm64 prebuilds are included, so one `npm ci` on the runner serves all targets.
- Pitfalls: Linux prebuilds need glibc 2.41+ (irrelevant for Win/mac); `@types/better-sqlite3` 9.6.0 for typings; keep the module in the **main process only**.

**Node built-in `node:sqlite`** — viable fallback, not first choice.
- Added in Node 22.5; unflagged in **22.13 / 23.4**; **Stability 1.2 "Release candidate"** since **Node 24.15.0 / 25.7.0**. Electron 40+ ships Node 24 (44.5.1 → v24.21.0), so `DatabaseSync` works in the main process.
- API: `DatabaseSync`, `StatementSync`, `backup(db, path)` (since 23.8), `timeout` busy option (24.0), `createTagStore` cache, sessions/changesets. Sync-only like better-sqlite3.
- Caveats: no first-party Drizzle driver yet (drizzle-orm 0.45.3 peers list better-sqlite3, libsql, sqlite3, expo, op-sqlite — not node:sqlite); Vite tries to externalize/polyfill it unless configured; no SQLCipher; "RC" not "stable". It is the right choice if you want **zero native modules**, but better-sqlite3's prebuilds already make that a non-issue.

**sql.js 1.14.2** — WASM, **entire database lives in memory**; persistence is "export the whole file" on each write. No WAL, crash = lost writes since last export. Not for a system of record.

**node-sqlite3-wasm 0.8.60** — file-backed WASM with a sync VFS, no native code. Slower, smaller community; a fallback if a native module ever becomes a packaging problem.

**@libsql/client 0.18.0** — native per-platform `@libsql/*` binaries (~8 MB), designed around Turso; Electron is not a first-class target and there are reports of rebuild/arch mix-ups. No benefit offline.

**Prisma 7** — now adapter-based (`@prisma/adapter-better-sqlite3`), but migrations still run through the CLI (`prisma migrate deploy`) which you cannot ship in a desktop app; generated client is large; avoid.

**Kysely 0.29.6** — excellent typed query builder with `SqliteDialect` over better-sqlite3; migrations via `Migrator` with a custom `MigrationProvider` (migrations as code, bundler-friendly). No schema-first generation; you hand-write migrations.

**Drizzle ORM 0.45.3 + drizzle-kit 0.31.11** (both 2026-09-21) — recommended.
- Schema in TypeScript (`sqliteTable(...)`), `drizzle-kit generate` emits `drizzle/0000_*.sql` + `drizzle/meta/_journal.json`; at runtime `migrate(db, { migrationsFolder })` applies pending files and records them in `__drizzle_migrations`.
- Shipped-app workflow: commit the `drizzle/` folder, add `extraResources: [{ from: "drizzle", to: "drizzle" }]`, and at startup use `app.isPackaged ? path.join(process.resourcesPath, "drizzle") : path.resolve("drizzle")`. Never use `drizzle-kit push` in production. Alternative that avoids the resources folder: import the `.sql` files with Vite `import.meta.glob('../../drizzle/*.sql', { query: '?raw', eager: true })` and run them with a 30-line custom runner using the same journal.

### 3.2 Operational essentials

```ts
import Database from "better-sqlite3";
import { app } from "electron";
import path from "node:path";

const dbFile = path.join(app.getPath("userData"), "hotel.db");    // Win: %APPDATA%\<name>\ ; mac: ~/Library/Application Support/<name>/
const sqlite = new Database(dbFile, { timeout: 5000 });
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("synchronous = NORMAL");
sqlite.pragma("foreign_keys = ON");

// backup to a user-chosen folder (dialog.showOpenDialog({ properties: ["openDirectory"] }))
await sqlite.backup(path.join(backupDir, `hotel-${new Date().toISOString().slice(0,10)}.db`)); // online, consistent, WAL-safe
// or: sqlite.exec(`VACUUM INTO '${escaped}'`)  (compacts at the same time)

// health check on startup / before backup
const ok = sqlite.pragma("integrity_check", { simple: true }) === "ok";   // or quick_check for speed
sqlite.pragma("wal_checkpoint(TRUNCATE)");  // before copying files or shutting down
```

- Never "copy the .db file" for backups while the app runs: WAL mode keeps `hotel.db-wal` / `hotel.db-shm` alongside; use the backup API or `VACUUM INTO`.
- Store the backup folder path in the DB or `electron-store`-style JSON; schedule daily backups on app start; keep N rotating copies; offer "Restore" that validates with `integrity_check` before swapping files.
- Keep the DB on the local disk, not on a network share or OneDrive/iCloud-synced folder (SQLite locking breaks).

---

## 4. IPC, process architecture, LAN-readiness, security

### 4.1 Process model

- Electron defaults: `contextIsolation: true` (since 12), `sandbox: true` (since 20), `nodeIntegration: false`. Keep them. The renderer gets a small typed `window.api` via `contextBridge.exposeInMainWorld` in the preload.
- Layout (electron-vite convention): `src/main` (Electron main: DB, services, windows, printing, notifications, HTTP server), `src/preload` (bridge only), `src/renderer` (React/Tailwind/shadcn), `src/shared` (zod contracts + types).

### 4.2 Typed IPC without extra frameworks

- `electron-trpc` 0.7.1 is from 2024-12 and targets tRPC v10; tRPC is at 11.19.0. Forks exist (`trpc-electron` by mat-sz, `electron-trpc-experimental` by makp0) but they are small projects — unattractive for a frozen product.
- Recommended: a **contract object** validated with **zod 4.6.5** and generated handlers:

```ts
// shared/contract.ts
export const contract = {
  "reservations.list": { input: z.object({ from: z.string(), to: z.string() }), output: z.array(Reservation) },
  "guests.create":     { input: GuestInput, output: Guest },
} as const;
export type Contract = typeof contract;

// main/services/*.ts  — plain functions, no Electron imports: (db, input) => output
// main/transports/ipc.ts
for (const key of Object.keys(contract)) ipcMain.handle(key, (_e, raw) => handlers[key](contract[key].input.parse(raw)));
// preload
contextBridge.exposeInMainWorld("api", { call: (k, i) => ipcRenderer.invoke(k, i) });
// renderer: const api = createClient<Contract>(transport) → api["reservations.list"]({...}) fully typed
```

### 4.3 LAN mode later — same service, second transport

- Put **Hono 4.13.12 + @hono/node-server 2.1.3** in the main process behind a setting ("Host mode"): one route per contract key, `zValidator` for input, and `hono/client` (`hc<AppType>`) gives a typed fetch client that satisfies the same `Contract`. The renderer's `createClient` takes either the IPC transport (host PC) or the HTTP transport (client PCs, "Connect to server" screen). Serving the built renderer as static files from the same Hono app lets any browser on the LAN open the UI too. Fastify 5.12.5 works as well but has no typed client story.
- Discovery: **bonjour-service 1.4.4** (TypeScript rewrite of `bonjour`, pure JS over `multicast-dns`, no Apple Bonjour install needed). Host publishes `{ type: "hotelcrm", port, txt: { version } }`; clients `find({ type: "hotelcrm" })` and show a list; always keep a manual "IP:port" fallback. Windows resolves `name.local` only partially without Apple Bonjour, so rely on the in-app browser rather than `.local` hostnames in Chrome.
- Windows Firewall will prompt on first listen (allow on **Private** networks). For per-machine installs you can pre-create the rule in `build/installer.nsh` (`!macro customInstall` → `nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Hotel CRM" dir=in action=allow program="$INSTDIR\Hotel CRM.exe" protocol=TCP localport=48080 profile=private'`), and remove it in `customUnInstall`.
- Concurrency note: with one SQLite file and one Node process holding it, LAN clients are serialized through the host — fine for a hotel front desk (tens of writes/minute).

### 4.4 Local login and secrets

- Password hashing without native modules: **`node:crypto` scrypt**. OWASP (2026 cheat sheet): **N = 2^17, r = 8, p = 1** (128 MiB) or equivalents (`N=2^15, r=8, p=3` = 32 MiB). Node's `maxmem` defaults to **32 MiB** and throws `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` above it, so pass `maxmem: 256 * 1024 * 1024` explicitly. Store `scrypt$N$r$p$saltB64$hashB64`; compare with `crypto.timingSafeEqual`. Alternatives: `argon2` 0.45.1 (OWASP's first choice, native but N-API prebuilt — acceptable), `bcrypt` 6.0.0 (native), `bcryptjs` 3.0.3 (pure JS, slower). scrypt is enough and keeps the native-module count at one.
- PIN reality check: a 4–6 digit PIN is brute-forceable offline in hours no matter the KDF. Treat PINs as a convenience lock for role switching, add in-app lockout/rate limiting, and rely on Windows/macOS user accounts + physical control for real security. Use full passwords for the admin role.
- SQLCipher: `better-sqlite3-multiple-ciphers` **13.0.3** (2026-08-07) is a drop-in with `PRAGMA key`, prebuilt like upstream. Cost: a forgotten passphrase destroys the data, every backup is opaque, DB Browser/CLI tooling needs SQLCipher builds, two native modules if you also keep upstream around for tests. For an offline front-desk PC the realistic threat is a stolen laptop or backup drive; **recommend BitLocker/FileVault guidance + optionally encrypting the exported backup archive (AES via `node:crypto` with the admin password) instead of database-level encryption in v1**. Guest ID data falls under KVKK (Turkish data protection law), which asks for "appropriate technical measures" but does not mandate DB encryption. Keep the door open: Drizzle + better-sqlite3 code is unchanged if you swap the module later.

---

## 5. Code signing and what unsigned users see

### 5.1 Windows

- Unsigned `Setup.exe` downloaded from the internet: Microsoft Defender SmartScreen shows **"Windows protected your PC"**; the user must click **"More info" → "Run anyway"**. If the installer elevates (per-machine), UAC also shows "Publisher: Unknown". Some corporate AV quarantines unsigned NSIS installers. Copying the installer via USB (no Mark-of-the-Web) usually skips SmartScreen entirely.
- **Self-signed certificates are useless for SmartScreen** (no chain to a trusted CA, no reputation).
- OV certificate: **~$200–300/year**; since June 2023 the private key must live on a hardware token or HSM, so CI signing needs a CA "cloud signing" add-on (extra cost) or a self-hosted runner with the USB token. EV: **~$280–350/year** with the same hardware rule; since 2024 EV **no longer bypasses SmartScreen instantly** — reputation builds by download volume for OV and EV alike. Even a signed brand-new app can show SmartScreen for the first days/weeks.
- **Azure Trusted Signing**, renamed **Azure Artifact Signing** (2026): Basic **$9.99/month** (5,000 signatures), Premium $99.99/month; integrates with GitHub Actions (`azure/artifact-signing-action`) and electron-builder (`win.azureSignOptions`). Identity validation is the catch: as of 2026 Microsoft Q&A threads state it is limited to **legal entities with 3+ years of verifiable tax/business history, in the US/Canada (EU/UK for some)**; the individual-developer path announced in the Oct 2024 preview is not generally available (open feature request on `azure/artifact-signing-action`). A hobby developer in Türkiye cannot use it today.
- Realistic options for a personal/hobby release:
  1. **Ship unsigned** and include a one-page illustrated "Install" guide (More info → Run anyway; UAC Yes). Cheapest; acceptable for a handful of hotel PCs you install yourself or walk staff through.
  2. Buy an OV certificate with cloud signing (~$250–400/year all-in) and sign in CI; warning still appears until reputation builds, then disappears.
  3. Check CA programs for open-source/individual developers (e.g. Certum's open-source code-signing offer, historically ~€70–100 incl. a smart card, Windows-only signing flow) — verify current terms before planning on it.

### 5.2 macOS

- Gatekeeper on macOS 14/15/26 for a downloaded (quarantined) app that is **not notarized**: "Apple could not verify "App" is free of malware..." with only "Done / Move to Trash". Since **macOS 15 Sequoia (2024) the Control-click → Open bypass is gone**; the user must try to open once, then go to **System Settings → Privacy & Security → scroll down → "Open Anyway"**, authenticate, and open again.
- If the app has **no signature at all** (electron-builder skips signing when it finds no certificate — it does **not** fall back to ad-hoc automatically), Apple Silicon Macs report **"App is damaged and can't be opened. You should move it to the Bin"** with no Open Anyway path (several Electron projects fixed this in 2026 by ad-hoc signing). Fix: `mac.identity: "-"` in electron-builder (ad-hoc; it applies built-in ad-hoc entitlements with library-validation disabled), plus `hardenedRuntime: false`, `gatekeeperAssess: false`, `notarize: false`.
- Terminal workaround that always works: `xattr -cr "/Applications/Hotel CRM.app"` (or `xattr -d com.apple.quarantine ...`) removes the quarantine flag; apps copied via USB/AirDrop often carry no quarantine flag at all.
- Proper path: **Apple Developer Program $99/year** → "Developer ID Application" certificate → electron-builder signs (`CSC_LINK` = base64 `.p12`, `CSC_KEY_PASSWORD`) and notarizes (`mac.notarize: true` with env **`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`** — App Store Connect API key, recommended — or `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`) via `@electron/notarize` (`notarytool`). Takes 2–10 minutes in CI; result opens with no prompt on any Mac. Hardened runtime is required (default `true`).
- Also note: on macOS, **Electron ≥42 notifications require a code signature; ad-hoc is sufficient** (grant is per bundle ID).

Decision guidance: pay the $99 for macOS if any Mac user who is not you will install it — the Sequoia flow is genuinely confusing for non-technical staff. On Windows, unsigned + instructions is tolerable for a few PCs; buy OV only if distribution grows.

---

## 6. Testing

- **Vitest 5.0.3** for unit tests: services run against `new Database(":memory:")` + the same Drizzle migrations; zero Electron dependency, runs in the Linux session.
- **Playwright 1.63.0** (`@playwright/test`) has the `_electron` driver: `const app = await _electron.launch({ args: ["."] })`, `const page = await app.firstWindow()`, `app.evaluate(({ app }) => app.getPath("userData"))` runs in the main process. Officially "experimental" but used by VS Code; keep Playwright within a few releases of your Electron's Chromium (152) to avoid CDP mismatches (Electron 36/Playwright "Process failed to launch" incidents in 2025 came from such drift).
- Linux CI: `xvfb-run --auto-servernum --server-args="-screen 0 1280x960x24" npx playwright test`; install Electron's runtime libs (`libnss3 libgbm1 libasound2t64 libxss1 libgtk-3-0`); pass `--no-sandbox` (Ubuntu 24.04 user-namespace restrictions break the SUID sandbox on runners). The main dev loop in the Linux cloud session can therefore run both unit and E2E tests without a display.
- Smoke-testing the real installers in CI (pattern used by several 2026 Electron repos):
  - Windows: `Start-Process -Wait .\release\Hotel-CRM-Setup-1.0.0-x64.exe -ArgumentList "/S"` (NSIS silent, per-user), then `_electron.launch({ executablePath: "$env:LOCALAPPDATA\Programs\hotel-crm\Hotel CRM.exe" })`, assert the first window title, then `Uninstall Hotel CRM.exe /S`.
  - macOS: `hdiutil attach release/Hotel-CRM-1.0.0-arm64.dmg`, `cp -R "/Volumes/Hotel CRM/Hotel CRM.app" /tmp/`, `xattr -cr`, launch via `executablePath: "/tmp/Hotel CRM.app/Contents/MacOS/Hotel CRM"`.
  - If you later disable the `EnableNodeCliInspectArguments` fuse, Playwright cannot attach; launch with `--remote-debugging-port` and `chromium.connectOverCDP` instead.

---

## 7. Printing and export

- **PDF**: `webContents.printToPDF({ pageSize: "A4", landscape, printBackground: true, margins: { top, bottom, left, right }, preferCSSPageSize: true, displayHeaderFooter, headerTemplate, footerTemplate, scale, pageRanges, generateTaggedPDF, generateDocumentOutline })` → `Promise<Buffer>`. Render reports in a hidden `BrowserWindow` (or the same window with a print stylesheet), save with `dialog.showSaveDialog` + `fs.writeFile`, open with `shell.openPath`. Direct printing: `webContents.print({ silent: true, deviceName, printBackground })` for receipt printers (list printers with `webContents.getPrintersAsync()`).
- **XLSX**: **exceljs 4.4.0** (MIT, last release 2023-10 but stable and widely used, ~1.9M weekly downloads; streams, styles, number formats, Turkish text fine). **SheetJS Community Edition on npm (`xlsx` 0.18.5, 2022-03) is abandoned on the registry with known CVEs (ReDoS, prototype pollution); current 0.20.x is only distributed from cdn.sheetjs.com (Apache-2.0)**. Use exceljs.
- **CSV**: `csv-stringify` 6.9.0 or a 20-line writer. Write a **UTF-8 BOM** (`﻿`) so Excel shows Turkish characters correctly, and note that Excel on a Turkish locale expects `;` as the separator (offer both or use `sep=;` first line).

---

## 8. Fonts and offline UI

- Bundle fonts locally: `@fontsource-variable/inter` **5.3.0** (OFL-1.1; `latin` + `latin-ext` subsets cover Turkish İ ı Ğ ğ Ş ş Ç ç Ö ö Ü ü) or `geist` **1.7.2** (Vercel's package, OFL; Geist Sans/Mono list Turkish among supported languages). `import "@fontsource-variable/inter";` in the renderer entry; Vite copies the `woff2` files; no network requests. Set CSP `font-src 'self'` and never reference Google Fonts.
- Turkish casing: use `str.toLocaleUpperCase("tr-TR")` / `"tr-TR"` collation in JS and set `<html lang="tr">` so CSS `text-transform` handles dotted/dotless i correctly; `Intl.Collator("tr")` for sorting; `date-fns` 4.4.0 with the `tr` locale for dates.
- Electron ships ICU, so `Intl` works offline; shadcn/ui (`shadcn` CLI 4.21.1) + Tailwind 4.3.3 + `lucide-react` 1.49.0 are plain assets, nothing is fetched at runtime.

---

## 9. Notifications and badges

- Main process: `new Notification({ title, body, silent }).show()`; listen to `click` and **`failed`** (emitted on macOS when the app is not code-signed — ad-hoc is enough).
- Windows: toasts need a Start Menu shortcut with an **AppUserModelID** (+ ToastActivatorCLSID). electron-builder's NSIS installer creates that shortcut using `appId`; still call `app.setAppUserModelId("com.yourname.hotelcrm")` first thing in `main.ts` (required in dev, harmless in prod). Electron's doc tip for dev: pin `node_modules\electron\dist\electron.exe` to Start Menu and call `app.setAppUserModelId(process.execPath)`.
- macOS: Electron ≥42 uses `UNUserNotificationCenter`; unsigned apps get a `failed` event. Users must allow notifications on first use (System Settings → Notifications).
- In-app badge: `app.setBadgeCount(n)` (macOS Dock), `win.setOverlayIcon(nativeImage, "3 bakım hatırlatması")` (Windows taskbar), `win.flashFrame(true)` for attention, plus a badge in the sidebar nav. Maintenance reminders: compute due items on launch and every N minutes in main (`setInterval`); the app must be running — optionally `app.setLoginItemSettings({ openAtLogin: true })` and a tray icon so it stays resident.

---

## 10. Recommended stack

### 10.1 Packages (exact versions as of 2026-10-01)

| Layer | Package | Version | Why |
|---|---|---|---|
| Runtime | `electron` | **44.5.1** (`~44.5`) — or `43.7.7` if macOS 12 Macs must be supported | Chromium 152 / Node 24.21; macOS 13+, Win10+ |
| Bundler | `electron-vite` + `vite` | **5.0.0** + **7.3.6** | Stable; Vite 8 only via electron-vite 6 beta |
| Packager | `electron-builder` | **26.15.3** | NSIS wizard + DMG, ad-hoc/Developer ID signing, notarize |
| Helpers | `@electron-toolkit/preload`, `@electron-toolkit/utils`, `@electron-toolkit/tsconfig` | 3.0.2 / 4.0.0 / 2.0.0 | electron-vite companions |
| UI | `react`, `react-dom` | 19.3.0 | |
| UI | `tailwindcss`, `@tailwindcss/vite` | 4.3.3 | Needs Chromium ≥111 — guaranteed by Electron |
| UI | `shadcn` (CLI), `lucide-react` | 4.21.1 / 1.49.0 | |
| Routing | `@tanstack/react-router` | 1.170.41 | (or `react-router` 8.4.0) |
| DB driver | `better-sqlite3` + `@types/better-sqlite3` | **13.0.3** / 9.6.0 | N-API prebuilt for win32/darwin x64+arm64, no rebuild |
| ORM/migrations | `drizzle-orm` + `drizzle-kit` | **0.45.3** / **0.31.11** | Schema in TS, SQL migrations embedded via `extraResources` |
| Validation | `zod` | 4.6.5 | IPC + HTTP contract |
| LAN (phase 2) | `hono`, `@hono/node-server`, `bonjour-service` | 4.13.12 / 2.1.3 / 1.4.4 | Same contract over HTTP + mDNS discovery |
| Logging | `electron-log` | 5.4.4 | File logs in `userData/logs` for support |
| Export | `exceljs`, `csv-stringify` | 4.4.0 / 6.9.0 | XLSX/CSV reports |
| Fonts | `@fontsource-variable/inter` (or `geist`) | 5.3.0 (1.7.2) | Offline, Turkish glyphs |
| Dates | `date-fns` | 4.4.0 | `tr` locale |
| Tests | `vitest`, `@playwright/test` | 5.0.3 / 1.63.0 | Unit + Electron E2E (xvfb on Linux) |
| Types/TS | `typescript`, `@types/node` | 7.0.2 (fallback 6.x if a tool objects) / 26.6.3 | |
| Not used | `electron-updater`, `@electron/rebuild`, Prisma, sql.js, SheetJS npm | — | not needed / avoid |

Native modules in the final app: **one** (`better-sqlite3`). Everything else is pure JS.

### 10.2 electron-builder.yml (starting point)

```yaml
appId: com.yourname.hotelcrm
productName: Hotel CRM
directories: { output: release, buildResources: build }
files: ["out/**/*", "package.json"]          # electron-vite output
extraResources: [{ from: drizzle, to: drizzle }]
asar: true
asarUnpack: ["node_modules/better-sqlite3/**"]
npmRebuild: false                             # N-API prebuilds already in node_modules
publish: null                                 # no auto-update, no latest.yml
compression: normal
win:
  target: [{ target: nsis, arch: [x64, arm64] }]
  artifactName: "${productName}-Setup-${version}-${arch}.${ext}"
nsis:
  oneClick: false
  perMachine: false            # wizard offers "only me" / "all users"
  allowElevation: true
  allowToChangeInstallationDirectory: true
  differentialPackage: false
  installerLanguages: [tr_TR, en_US]
  multiLanguageInstaller: true
  include: build/installer.nsh # optional firewall rule for LAN mode
mac:
  target: [{ target: dmg, arch: [arm64, x64] }]   # or [universal] with x64ArchFiles: "**/*.node"
  category: public.app-category.business
  minimumSystemVersion: "13.0"
  artifactName: "${productName}-${version}-${arch}.${ext}"
  # --- unsigned/ad-hoc release (hobby) ---
  identity: "-"
  hardenedRuntime: false
  gatekeeperAssess: false
  notarize: false
  # --- signed release: delete the 4 lines above, set notarize: true and provide
  #     CSC_LINK, CSC_KEY_PASSWORD, APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER secrets
dmg:
  sign: false
```

### 10.3 GitHub Actions workflow (`.github/workflows/release.yml`)

```yaml
name: build-release
on:
  push:
    tags: ["v*"]
  workflow_dispatch:

permissions:
  contents: write

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test            # vitest (services + in-memory sqlite)
      - run: npm run build           # electron-vite build
      - name: E2E (Playwright + Electron under xvfb)
        run: |
          sudo apt-get update && sudo apt-get install -y xvfb libnss3 libgbm1 libasound2t64 libxss1 libgtk-3-0
          xvfb-run --auto-servernum --server-args="-screen 0 1280x960x24" npx playwright test

  package:
    needs: test
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: windows-latest       # Windows Server 2025 — builds NSIS x64 + arm64
            args: --win
          - os: macos-latest         # macOS 26, Apple Silicon — builds dmg arm64 + x64
            args: --mac
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run build
      - name: Package
        run: npx electron-builder ${{ matrix.args }} --publish never
        env:
          # macOS signed+notarized builds (leave unset for ad-hoc):
          CSC_LINK: ${{ secrets.MAC_CERT_P12_BASE64 }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERT_PASSWORD }}
          APPLE_API_KEY: ${{ secrets.APPLE_API_KEY_P8 }}
          APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
          APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
      - name: Smoke-test installer (Windows)
        if: runner.os == 'Windows'
        shell: pwsh
        run: |
          $exe = Get-ChildItem release\*-x64.exe | Select-Object -First 1
          Start-Process -Wait $exe.FullName -ArgumentList "/S"
          $env:HOTELCRM_EXE = "$env:LOCALAPPDATA\Programs\hotel-crm\Hotel CRM.exe"
          npx playwright test tests/smoke --project=installed
      - name: Smoke-test DMG (macOS)
        if: runner.os == 'macOS'
        run: |
          hdiutil attach release/*-arm64.dmg -nobrowse -mountpoint /Volumes/HotelCRM
          cp -R "/Volumes/HotelCRM/Hotel CRM.app" /tmp/ && hdiutil detach /Volumes/HotelCRM
          xattr -cr "/tmp/Hotel CRM.app"
          HOTELCRM_EXE="/tmp/Hotel CRM.app/Contents/MacOS/Hotel CRM" npx playwright test tests/smoke --project=installed
      - uses: actions/upload-artifact@v7
        with:
          name: installers-${{ matrix.os }}
          path: |
            release/*.exe
            release/*.dmg

  release:
    needs: package
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v7
        with: { path: dist, merge-multiple: true }
      - uses: softprops/action-gh-release@v2
        with:
          files: dist/*
          body: "See INSTALL.md for the SmartScreen / Gatekeeper steps."
```

### 10.4 Decisions and defaults

1. **Electron 44.x**, floor macOS 13 / Windows 10. If the hotel has Monterey Macs, build with 43.7.7 (identical code; supported until ~Mar 2027). Do not chase newer majors after v1.0 — pin the exact version.
2. **electron-builder NSIS assisted installer** (per-user default, "all users" option) and **two DMGs** (Apple Silicon / Intel) named for humans.
3. **better-sqlite3 13 + Drizzle**, WAL, daily backups via backup API to a user-chosen folder, `integrity_check` on launch.
4. **Contract-based IPC** (zod) with services decoupled from Electron so the same handlers can be mounted on Hono for LAN mode; bonjour-service for discovery.
5. **scrypt** (`node:crypto`, N=2^17/r=8/p=1, `maxmem` 256 MiB) for passwords; PIN only as a convenience lock; no SQLCipher in v1.
6. **Unsigned Windows + ad-hoc-signed macOS** for a hobby release with an illustrated install guide; budget **$99/year** for Apple notarization if non-technical Mac users will install it; Windows OV signing only if distribution widens.
7. **No auto-update**, no telemetry, no CDN fonts; `publish: null`, `differentialPackage: false`.

### 10.5 Main risks

- **Gatekeeper on macOS 15/26**: unsigned apps are a support burden ("Open Anyway" flow); the only clean fix costs $99/year. Forgetting `identity: "-"` yields the unrecoverable "damaged" dialog on Apple Silicon.
- **SmartScreen on Windows**: every fresh download shows "Windows protected your PC" until you pay for signing *and* accumulate reputation; Trusted/Artifact Signing is not available to individuals or non-US/CA hobbyists.
- **OS floors**: Electron 44 excludes macOS ≤12 and Windows ≤8.1; Big Sur/Catalina Macs cannot be served by any stack that uses Tailwind v4 (Tauri's WKWebView is too old there too). Decide the floor before choosing 44 vs 43.
- **Playwright ↔ Electron drift**: keep the Playwright version close to the Electron Chromium; pin both.
- **Universal mac build + native module**: either ship two DMGs or configure `x64ArchFiles`; otherwise `@electron/universal` fails.
- **Vite 8 vs electron-vite 5**: stay on Vite 7.3.x until electron-vite 6 is stable, or use vite-plugin-electron 1.1.2 with Vite 8.
- **Frozen product means frozen Chromium**: an offline app mitigates this, but if LAN mode is enabled the HTTP surface must be bound to the LAN interface only, with the login layer in front of every route.
- **Backups**: the single biggest data-loss risk is users copying `hotel.db` by hand while WAL is active; make the in-app backup/restore prominent and automatic.

---

## Sources (reachable primary/secondary)

- npm registry metadata (versions, publish dates, engines, peer deps) for all packages listed, fetched 2026-10-01.
- Electron `DEPS` files at tags v44.5.1, v43.7.7, v42.11.10, v41.10.7, v40.10.6, v39.8.10, v38.8.6, v37.10.3, v33.4.11; `docs/breaking-changes.md`; README platform-support section; `docs/api/web-contents.md`; `docs/tutorial/notifications.md`; `docs/tutorial/code-signing.md`; GitHub release assets page for v44.5.1.
- electron-builder source (`packages/app-builder-lib/src/options/macOptions.ts`, `configuration.ts`, `macPackager.ts`) for `identity`, `notarize`, `hardenedRuntime`, `npmRebuild`, `nodeGypRebuild`; NSIS option semantics from electron.build search excerpts.
- better-sqlite3 13.0.3 npm tarball contents; GitHub releases page (13.0.0–13.0.3, 12.12.0 glibc note).
- Node.js docs `api/sqlite.html` (latest and v24.x) for stability history, `backup()`, `timeout`.
- Tauri: `tauri-apps/tauri` `Cargo.toml` (`rust-version = "1.90"`), tauri-docs `distribute/windows-installer.mdx`, `start/prerequisites.mdx`, `distribute/macos-application-bundle.mdx`, `plugin/sql.mdx`, `develop/sidecar.mdx`, tauri-action README; Tauri 2.12 announcement (search excerpt: Windows 7 dropped, MSRV 1.90).
- Tailwind compatibility doc (tailwindcss.com repo source) and GitHub discussions #15284/#15356/#18270.
- OWASP Password Storage Cheat Sheet (GitHub source) for scrypt/Argon2id parameters; Node issue #21524/#29686 for `maxmem`.
- Search excerpts: Electron v44.0.0 release notes (macOS 13 requirement), Microsoft Q&A on Azure Artifact Signing eligibility (2026), Microsoft Edge blog on WebView2 Windows 10 rollout (2022-06-27), GitHub changelog on `macos-latest` → macOS 26 (2026-05/06) and `windows-latest` → Windows Server 2025/VS 2026, MacRumors/Michael Tsai on Sequoia Gatekeeper change, 2026 Electron repos adopting ad-hoc signing and installer smoke tests, Playwright issues #33824/#34251/#47419, electron-builder issues #10031/#9529/#4613, SheetJS npm status, Safari final versions per macOS.
