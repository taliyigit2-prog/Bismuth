#!/usr/bin/env node
// PostToolUse on Edit|Write|MultiEdit: formats the edited file with the project's own Prettier
// (node_modules/.bin/prettier, prettier.cmd on Windows) so no model turns are spent on style.
// Scope: .ts .tsx .js .mjs .cjs .json .css under src/, tests/, scripts/ and the root tool configs.
// Never touches docs/, drizzle/ (generated migrations and meta must stay byte-identical) or anything
// outside the project. Never blocks: every error is swallowed and the hook always exits 0.
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, join, relative, resolve } from "node:path";

const ROOT_CONFIGS = new Set([
  "electron.vite.config.ts",
  "vitest.config.ts",
  "playwright.config.ts",
  "eslint.config.mjs",
  "drizzle.config.ts",
]);

try {
  run();
} catch {
  /* formatting is a convenience, never an obstacle */
}
process.exit(0);

function run() {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const raw = String(input.tool_input?.file_path ?? "");
  if (!raw) return;

  const abs = isAbsolute(raw) ? raw : resolve(input.cwd || root, raw);
  const rel = relative(root, abs).replace(/\\/g, "/");
  if (!rel || /^\.\.(\/|$)/.test(rel) || isAbsolute(rel)) return; // outside the project
  if (!/\.(ts|tsx|js|mjs|cjs|json|css)$/.test(rel)) return;
  if (/(^|\/)(node_modules|drizzle|migrations|docs)\//.test(rel)) return;
  if (!/^(src|tests|scripts)\//.test(rel) && !ROOT_CONFIGS.has(rel)) return;
  if (!existsSync(abs)) return;

  const isWin = process.platform === "win32";
  const bin = join(root, "node_modules", ".bin", isWin ? "prettier.cmd" : "prettier");
  if (!existsSync(bin)) return; // toolchain not installed yet

  const opts = { cwd: root, stdio: "ignore", timeout: 25_000, windowsHide: true };
  if (isWin) {
    // .cmd shims need a shell on Windows (Node refuses to spawn them directly); quote both paths.
    spawnSync(`"${bin}" --write "${abs}"`, { ...opts, shell: true });
  } else {
    spawnSync(bin, ["--write", abs], opts);
  }
}
