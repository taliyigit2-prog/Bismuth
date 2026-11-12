#!/usr/bin/env node
// PreToolUse on Edit|Write|MultiEdit: a migration file that is already committed is immutable
// (it may have run on a customer machine). New (untracked) migration files are allowed.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

let input;
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const fp = String(input.tool_input?.file_path ?? "").replace(/\\/g, "/");
const match = fp.match(/(?:^|\/)(?:drizzle|src\/main\/db\/migrations)\/([0-9]{4}_[^/]+\.sql)$/);
if (!match) process.exit(0);

let committed = false;
try {
  const out = execFileSync("git", ["ls-files", "--error-unmatch", "--", fp], {
    cwd: process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd(),
    stdio: "pipe",
  }).toString();
  committed = out.trim() !== "";
} catch {
  committed = false; // untracked = new migration
}
if (committed) {
  process.stderr.write(
    `Engellendi: ${match[1]} commit edilmiş bir migrasyon; müşteri makinesinde çalışmış olabilir. ` +
      `Migrasyonlar yalnızca eklenir: bir sonraki numarayla yeni dosya aç (CLAUDE.md > Yasaklar 9, G-133).\n`,
  );
  process.exit(2);
}
process.exit(0);
