# Freela Operational Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an operational reliability loop around the Freela/Paperclip SQLite source of truth with verified local snapshots, private technical reports, Paperclip `Ops Health` publication, restore planning, and write-blocking when the system is red.

**Architecture:** Add `scripts/freela-ops-doctor.mjs` as a focused read-mostly operational script that owns reliability checks, SQLite snapshots, backup manifest maintenance, restore planning, and Paperclip publishing. Keep `.scratch/ops` as the private evidence/report surface, but store heavy SQLite snapshot files under `/Users/luiz_fbm/Library/Application Support/freela-paperclip/backups` so backups do not re-enter the offload-prone `Documents` tree. Integrate `scripts/freela-crm.mjs` with the private reliability status so critical writes refuse to run when the last Ops Doctor status is `red`.

**Tech Stack:** Node.js ESM, `node:test`, `node:sqlite` `DatabaseSync`, SQLite `VACUUM INTO` and `pragma integrity_check`, Paperclip HTTP API, macOS `launchd` plist templates.

---

## File Structure

- Create: `scripts/freela-ops-doctor.mjs`
  - Single operational entrypoint for `check`, `snapshot`, `publish`, `restore-plan`, and `restore`.
  - Writes private reports to `.scratch/ops`.
  - Writes snapshot databases to local application data, not `Documents`.
  - Publishes only sanitized executive status to Paperclip.
- Create: `tests/freela-ops-doctor.test.mjs`
  - Isolated tests with temp roots and mock Paperclip HTTP servers.
  - Covers `green`, `yellow`, `red`, snapshot manifest, privacy, restore planning, and restore confirmation.
- Modify: `scripts/freela-crm.mjs`
  - Before critical write commands, read `.scratch/ops/reliability-status.json`.
  - If status is `red`, refuse the write with a clear operational message.
  - Allow bootstrap when the report does not exist yet.
- Modify: `tests/freela-crm-cli.test.mjs`
  - Add regression coverage that a `red` Ops Doctor status blocks a critical write but does not block `healthcheck`.
- Modify: `tests/paperclip-automation-contract.test.mjs`
  - Add contract tests that Paperclip docs mention `Ops Health`, `freela-ops-doctor.mjs`, and private `.scratch/ops` evidence.
- Modify: `docs/freelancer/data-contract.md`
  - Document `Ops Health`, `.scratch/ops/reliability-status.*`, and backup manifest rules.
- Modify: `docs/freelancer/paperclip/README.md`
  - Add operator commands and launchd setup instructions.
- Modify: `docs/freelancer/prompt-thread-coo-freelancer.md`
  - Instruct COO Freelancer to read/publish operational health and stop writes on `red`.
- Create: `docs/freelancer/paperclip/launchd/com.luiz-fbm.freela-ops-snapshot.plist`
  - Hourly local snapshot job template.
- Create: `docs/freelancer/paperclip/launchd/com.luiz-fbm.freela-ops-publish.plist`
  - Daily local check-and-publish job template.

Runtime/private outputs:

- `.scratch/ops/reliability-status.json`
- `.scratch/ops/reliability-status.md`
- `.scratch/ops/backup-manifest.json`
- `.scratch/ops/restore-plans/*.json`
- `.scratch/ops/restore-plans/*.md`
- `/Users/luiz_fbm/Library/Application Support/freela-paperclip/backups/hourly/*.sqlite`
- `/Users/luiz_fbm/Library/Application Support/freela-paperclip/backups/daily/*.sqlite`

No private data is added to `docs/`, `demos/`, or `outputs/`.

## Task 1: Add Ops Doctor Test Harness And Red/Green Status Tests

**Files:**
- Create: `tests/freela-ops-doctor.test.mjs`
- Create later: `scripts/freela-ops-doctor.mjs`

- [ ] **Step 1: Create the test harness**

Create `tests/freela-ops-doctor.test.mjs` with this top-level harness:

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";

const repoRoot = new URL("..", import.meta.url).pathname;
const crm = join(repoRoot, "scripts/freela-crm.mjs");
const opsDoctor = join(repoRoot, "scripts/freela-ops-doctor.mjs");

function makeRoot() {
  return mkdtempSync(join(tmpdir(), "freela-ops-doctor-"));
}

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });
}

function runCrm(root, args) {
  return runNode([crm, "--root", root, ...args]);
}

function runOps(root, args, options = {}) {
  return runNode([opsDoctor, "--root", root, ...args], options);
}

function initDb(root) {
  const result = runCrm(root, ["init"]);
  assert.equal(result.status, 0, result.stderr);
}

function writeReliabilityStatus(root, value) {
  const dir = join(root, ".scratch/ops");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "reliability-status.json"), JSON.stringify(value, null, 2), "utf8");
}

function readStatus(root) {
  return JSON.parse(readFileSync(join(root, ".scratch/ops/reliability-status.json"), "utf8"));
}

function readManifest(root) {
  return JSON.parse(readFileSync(join(root, ".scratch/ops/backup-manifest.json"), "utf8"));
}

function appBackupDir(root) {
  return join(root, "local-app-support/freela-paperclip/backups");
}
```

- [ ] **Step 2: Add the failing red test for invalid SQLite**

Append:

```js
test("check writes red status when SQLite header is invalid", () => {
  const root = makeRoot();
  const dbDir = join(root, ".scratch/db");
  mkdirSync(dbDir, { recursive: true });
  writeFileSync(join(dbDir, "freela.sqlite"), "not sqlite", "utf8");

  const result = runOps(root, ["check"]);

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /status: red/i);

  const status = readStatus(root);
  assert.equal(status.status, "red");
  assert.equal(status.checks.sqlite.status, "red");
  assert.match(status.checks.sqlite.message, /header SQLite/i);
  assert.equal(existsSync(join(root, ".scratch/ops/reliability-status.md")), true);
});
```

- [ ] **Step 3: Add the failing red test for missing verified snapshot**

Append:

```js
test("check writes red status when DB is valid but no verified snapshot exists", () => {
  const root = makeRoot();
  initDb(root);

  const result = runOps(root, ["check", "--backup-dir", appBackupDir(root)]);

  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /status: red/i);

  const status = readStatus(root);
  assert.equal(status.status, "red");
  assert.equal(status.checks.sqlite.status, "green");
  assert.equal(status.checks.backups.status, "red");
  assert.match(status.checks.backups.message, /snapshot integro/i);
});
```

- [ ] **Step 4: Verify RED**

Run:

```bash
node --test --test-name-pattern 'check writes red status' tests/freela-ops-doctor.test.mjs
```

Expected: FAIL because `scripts/freela-ops-doctor.mjs` does not exist.

## Task 2: Implement Ops Doctor Check Command

**Files:**
- Create: `scripts/freela-ops-doctor.mjs`
- Test: `tests/freela-ops-doctor.test.mjs`

- [ ] **Step 1: Create the script skeleton**

Create `scripts/freela-ops-doctor.mjs` with these imports, constants, CLI parsing, and command dispatch:

```js
#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_API_BASE = "http://127.0.0.1:3100";
const DEFAULT_COMPANY_ID = "50a2756c-2942-40c1-90f8-b16807a62ef3";
const DEFAULT_OPS_ISSUE_TITLE = "Ops Health";
const DEFAULT_OPS_DOCUMENT_KEY = "reliability-status";
const DEFAULT_TIMEOUT_MS = 15000;
const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "ascii");
const DEFAULT_BACKUP_DIR = "/Users/luiz_fbm/Library/Application Support/freela-paperclip/backups";
const MIN_TABLES = [
  "audit_log",
  "leads",
  "interactions",
  "outreach_queue",
  "worker_handoffs",
  "whatsapp_inbound_events",
  "whatsapp_outbox",
  "whatsapp_unmatched_inbound_events",
];

async function main() {
  try {
    const parsed = parseCommand(process.argv.slice(2));
    const result = await dispatch(parsed);
    if (result?.exitCode !== undefined) process.exit(result.exitCode);
  } catch (error) {
    console.error(error.message);
    process.exit(error.exitCode ?? 1);
  }
}

async function dispatch({ root, command, args, flags }) {
  if (command === "check") return commandCheck({ root, flags });
  if (command === "snapshot") return commandSnapshot({ root, flags });
  if (command === "publish") return commandPublish({ root, flags });
  if (command === "restore-plan") return commandRestorePlan({ root, args, flags });
  if (command === "restore") return commandRestore({ root, args, flags });
  printUsage();
  return { exitCode: 1 };
}

function parseCommand(argv) {
  const flags = {};
  const positionals = [];
  let root = process.cwd();
  let command = "";

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      if (!command) command = token;
      else positionals.push(token);
      continue;
    }
    const key = token.slice(2);
    if (key === "confirm") {
      flags[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw usageError(`Valor obrigatorio para --${key}`);
    index += 1;
    if (key === "root") root = resolve(value);
    else flags[key] = value;
  }

  return { root, command, args: positionals, flags };
}

function printUsage() {
  console.error(`Uso:
  node scripts/freela-ops-doctor.mjs --root <repo> check
  node scripts/freela-ops-doctor.mjs --root <repo> snapshot [--kind hourly|daily]
  node scripts/freela-ops-doctor.mjs --root <repo> publish
  node scripts/freela-ops-doctor.mjs --root <repo> restore-plan <snapshot>
  node scripts/freela-ops-doctor.mjs --root <repo> restore --from <snapshot> --confirm`);
}

function usageError(message) {
  const error = new Error(message);
  error.exitCode = 1;
  return error;
}

await main();
```

- [ ] **Step 2: Add path and report helpers**

Add these helpers above `await main();`:

```js
function paths(root, flags = {}) {
  return {
    dbPath: resolve(flags.db ?? join(root, ".scratch/db/freela.sqlite")),
    dbCompatDir: join(root, ".scratch/db"),
    opsDir: join(root, ".scratch/ops"),
    statusJson: join(root, ".scratch/ops/reliability-status.json"),
    statusMd: join(root, ".scratch/ops/reliability-status.md"),
    manifest: join(root, ".scratch/ops/backup-manifest.json"),
    restorePlansDir: join(root, ".scratch/ops/restore-plans"),
    backupDir: resolve(flags["backup-dir"] ?? DEFAULT_BACKUP_DIR),
  };
}

function nowIso(flags = {}) {
  return flags.now ?? new Date().toISOString();
}

function writeReport(root, flags, report) {
  const p = paths(root, flags);
  mkdirSync(p.opsDir, { recursive: true });
  writeFileSync(p.statusJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(p.statusMd, renderPrivateMarkdown(report), "utf8");
}

function renderPrivateMarkdown(report) {
  const lines = [
    `# Freela Reliability Status`,
    ``,
    `Status: ${report.status}`,
    `Checked at: ${report.checkedAt}`,
    ``,
    `## Checks`,
  ];
  for (const [name, check] of Object.entries(report.checks)) {
    lines.push(`- ${name}: ${check.status} - ${check.message}`);
  }
  lines.push(``, `## Recommended action`, report.recommendedAction, ``);
  return `${lines.join("\n")}\n`;
}

function aggregateStatus(checks) {
  const statuses = Object.values(checks).map((check) => check.status);
  if (statuses.includes("red")) return "red";
  if (statuses.includes("yellow")) return "yellow";
  return "green";
}

function exitCodeForStatus(status) {
  if (status === "red") return 2;
  if (status === "yellow") return 1;
  return 0;
}
```

- [ ] **Step 3: Add SQLite validation helpers**

Add:

```js
function inspectSqliteFile(file) {
  if (!existsSync(file)) {
    return { status: "red", message: `SQLite nao encontrado: ${file}` };
  }

  let stat;
  try {
    stat = statSync(file);
  } catch (error) {
    return { status: "red", message: `stat falhou: ${error.message}` };
  }

  if (stat.size === 0) {
    return { status: "red", message: `arquivo vazio: ${file}` };
  }

  const header = Buffer.alloc(SQLITE_HEADER.length);
  let fd = null;
  try {
    fd = openSync(file, "r");
    const bytesRead = readSync(fd, header, 0, SQLITE_HEADER.length, 0);
    if (bytesRead !== SQLITE_HEADER.length) {
      return { status: "red", message: `header SQLite incompleto: ${bytesRead} bytes` };
    }
  } catch (error) {
    return { status: "red", message: `falha lendo header SQLite: ${error.message}` };
  } finally {
    if (fd !== null) closeSync(fd);
  }

  if (!header.equals(SQLITE_HEADER)) {
    const offloadHint = stat.size > 0 && Number(stat.blocks) === 0 ? " possivel offload/dataless." : "";
    return { status: "red", message: `header SQLite ausente em ${file}.${offloadHint}` };
  }

  return {
    status: "green",
    message: `header SQLite valido`,
    size: stat.size,
    blocks: stat.blocks ?? null,
    mtime: stat.mtime.toISOString(),
  };
}
```

- [ ] **Step 4: Add database check implementation**

Add:

```js
function checkSqlite(root, flags = {}) {
  const p = paths(root, flags);
  const file = inspectSqliteFile(p.dbPath);
  if (file.status === "red") return file;

  let database;
  try {
    database = new DatabaseSync(p.dbPath, { readOnly: true });
    database.exec("PRAGMA busy_timeout = 10000;");
    const integrityCheck = database.prepare("pragma integrity_check").get().integrity_check;
    if (integrityCheck !== "ok") {
      return { status: "red", message: `integrity_check retornou ${integrityCheck}` };
    }

    const tables = new Set(
      database
        .prepare("select name from sqlite_master where type = 'table'")
        .all()
        .map((row) => row.name),
    );
    const missingTables = MIN_TABLES.filter((table) => !tables.has(table));
    if (missingTables.length) {
      return { status: "red", message: `tabelas obrigatorias ausentes: ${missingTables.join(", ")}` };
    }

    const counts = {
      leads: countRows(database, "leads"),
      audit_log: countRows(database, "audit_log"),
      worker_handoffs_active: countWhere(database, "worker_handoffs", "status not in ('completed', 'cancelled')"),
      whatsapp_outbox_pending: countWhere(database, "whatsapp_outbox", "status in ('pending', 'approved', 'delivery_pending')"),
      whatsapp_outbox_failed: countWhere(database, "whatsapp_outbox", "status = 'failed'"),
      whatsapp_unmatched_open: countWhere(database, "whatsapp_unmatched_inbound_events", "status != 'reconciled'"),
    };

    return {
      status: "green",
      message: "SQLite integro",
      path: p.dbPath,
      integrityCheck,
      file,
      counts,
    };
  } catch (error) {
    return { status: "red", message: `SQLite invalido: ${error.message}` };
  } finally {
    if (database) database.close();
  }
}

function countRows(database, table) {
  return database.prepare(`select count(*) as count from ${table}`).get().count;
}

function countWhere(database, table, where) {
  return database.prepare(`select count(*) as count from ${table} where ${where}`).get().count;
}
```

- [ ] **Step 5: Add manifest and backup check implementation**

Add:

```js
function readManifest(root, flags = {}) {
  const file = paths(root, flags).manifest;
  if (!existsSync(file)) return { version: 1, snapshots: [] };
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeManifest(root, flags, manifest) {
  const file = paths(root, flags).manifest;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function checkBackups(root, flags = {}) {
  const manifest = readManifest(root, flags);
  const snapshots = manifest.snapshots ?? [];
  const valid = snapshots
    .filter((snapshot) => snapshot.integrityCheck === "ok" && existsSync(snapshot.path))
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));

  if (!valid.length) {
    return { status: "red", message: "nenhum snapshot integro encontrado", validSnapshots: 0 };
  }

  const now = Date.parse(nowIso(flags));
  const hourly = latestByKind(valid, "hourly");
  const daily = latestByKind(valid, "daily");
  const hourlyAgeMs = hourly ? now - Date.parse(hourly.createdAt) : Number.POSITIVE_INFINITY;
  const dailyAgeMs = daily ? now - Date.parse(daily.createdAt) : Number.POSITIVE_INFINITY;
  const staleHourly = hourlyAgeMs > 90 * 60 * 1000;
  const staleDaily = dailyAgeMs > 36 * 60 * 60 * 1000;

  if (staleHourly && daily && !staleDaily) {
    return {
      status: "yellow",
      message: `snapshot horario velho; diario ainda integro em ${daily.createdAt}`,
      latestSnapshot: valid[0],
      validSnapshots: valid.length,
    };
  }

  if (staleHourly || staleDaily || !daily) {
    return {
      status: "red",
      message: "snapshot recente obrigatorio ausente ou velho",
      latestSnapshot: valid[0],
      validSnapshots: valid.length,
    };
  }

  return {
    status: "green",
    message: `snapshots integros: horario ${hourly.createdAt}, diario ${daily.createdAt}`,
    latestSnapshot: valid[0],
    validSnapshots: valid.length,
  };
}

function latestByKind(snapshots, kind) {
  return snapshots.find((snapshot) => snapshot.kind === kind) ?? null;
}
```

- [ ] **Step 6: Add operational check and `check` command**

Add:

```js
function checkOperational(root, flags = {}) {
  const sqlite = checkSqlite(root, flags);
  if (sqlite.status === "red") {
    return { status: "yellow", message: "checks operacionais limitados porque SQLite esta indisponivel" };
  }

  const counts = sqlite.counts ?? {};
  if ((counts.whatsapp_outbox_failed ?? 0) >= 2) {
    return { status: "yellow", message: `outbox WhatsApp com ${counts.whatsapp_outbox_failed} falhas` };
  }
  if ((counts.whatsapp_unmatched_open ?? 0) >= 5) {
    return { status: "yellow", message: `eventos inbound nao conciliados: ${counts.whatsapp_unmatched_open}` };
  }
  return { status: "green", message: "sem acumulado operacional critico" };
}

function buildReport(root, flags = {}) {
  const sqlite = checkSqlite(root, flags);
  const backups = checkBackups(root, flags);
  const operational = checkOperational(root, flags);
  const checks = { sqlite, backups, operational };
  const status = aggregateStatus(checks);
  return {
    version: 1,
    checkedAt: nowIso(flags),
    status,
    checks,
    recommendedAction: recommendedAction(status, checks),
  };
}

function recommendedAction(status, checks) {
  if (status === "red") {
    return `Parar escritas criticas. Corrigir: ${Object.entries(checks)
      .filter(([, check]) => check.status === "red")
      .map(([name, check]) => `${name}: ${check.message}`)
      .join("; ")}`;
  }
  if (status === "yellow") {
    return `Operacao permitida com atencao. Corrigir alertas: ${Object.entries(checks)
      .filter(([, check]) => check.status === "yellow")
      .map(([name, check]) => `${name}: ${check.message}`)
      .join("; ")}`;
  }
  return "Operacao normal.";
}

function commandCheck({ root, flags }) {
  const report = buildReport(root, flags);
  writeReport(root, flags, report);
  console.log(`status: ${report.status}`);
  console.log(`relatorio: ${paths(root, flags).statusJson}`);
  return { exitCode: exitCodeForStatus(report.status) };
}
```

- [ ] **Step 7: Verify tests pass for red checks**

Run:

```bash
node --test --test-name-pattern 'check writes red status' tests/freela-ops-doctor.test.mjs
```

Expected: PASS for the two red tests.

- [ ] **Step 8: Commit**

Run:

```bash
git add scripts/freela-ops-doctor.mjs tests/freela-ops-doctor.test.mjs
git commit -m "Add freela ops doctor health checks"
```

## Task 3: Add Verified Snapshots, Manifest, Retention, And Green/Yellow Tests

**Files:**
- Modify: `scripts/freela-ops-doctor.mjs`
- Modify: `tests/freela-ops-doctor.test.mjs`

- [ ] **Step 1: Add failing snapshot and green check tests**

Append to `tests/freela-ops-doctor.test.mjs`:

```js
test("snapshot creates verified hourly and daily backups outside Documents and check becomes green", () => {
  const root = makeRoot();
  initDb(root);

  const snapshot = runOps(root, [
    "snapshot",
    "--backup-dir",
    appBackupDir(root),
    "--now",
    "2026-06-21T12:00:00.000Z",
  ]);
  assert.equal(snapshot.status, 0, snapshot.stderr);
  assert.match(snapshot.stdout, /snapshot: ok/i);

  const manifest = readManifest(root);
  assert.equal(manifest.snapshots.length, 2);
  assert.deepEqual(
    manifest.snapshots.map((item) => item.kind).sort(),
    ["daily", "hourly"],
  );

  for (const item of manifest.snapshots) {
    assert.match(item.path, /local-app-support\/freela-paperclip\/backups/i);
    assert.equal(item.integrityCheck, "ok");
    assert.equal(existsSync(item.path), true);
  }

  const check = runOps(root, [
    "check",
    "--backup-dir",
    appBackupDir(root),
    "--now",
    "2026-06-21T12:10:00.000Z",
  ]);
  assert.equal(check.status, 0, check.stderr);
  assert.equal(readStatus(root).status, "green");
});

test("check is yellow when hourly snapshot is stale but daily snapshot is still valid", () => {
  const root = makeRoot();
  initDb(root);

  assert.equal(
    runOps(root, ["snapshot", "--backup-dir", appBackupDir(root), "--now", "2026-06-21T08:00:00.000Z"]).status,
    0,
  );

  const check = runOps(root, ["check", "--backup-dir", appBackupDir(root), "--now", "2026-06-21T10:00:00.000Z"]);

  assert.equal(check.status, 1, check.stderr);
  const status = readStatus(root);
  assert.equal(status.status, "yellow");
  assert.equal(status.checks.backups.status, "yellow");
});
```

- [ ] **Step 2: Add snapshot helpers**

Add to `scripts/freela-ops-doctor.mjs`:

```js
function commandSnapshot({ root, flags }) {
  const sqlite = checkSqlite(root, flags);
  if (sqlite.status !== "green") {
    throw usageError(`Snapshot bloqueado: ${sqlite.message}`);
  }

  const createdAt = nowIso(flags);
  const kinds = snapshotKindsToCreate(root, flags, createdAt);
  const created = kinds.map((kind) => createSnapshot(root, flags, kind, createdAt));
  pruneSnapshots(root, flags);
  console.log(`snapshot: ok (${created.map((item) => item.kind).join(", ")})`);
  return { exitCode: 0 };
}

function snapshotKindsToCreate(root, flags, createdAt) {
  if (flags.kind) {
    if (!["hourly", "daily"].includes(flags.kind)) throw usageError(`--kind invalido: ${flags.kind}`);
    return [flags.kind];
  }
  const manifest = readManifest(root, flags);
  const day = createdAt.slice(0, 10);
  const hasDailyToday = (manifest.snapshots ?? []).some(
    (snapshot) => snapshot.kind === "daily" && String(snapshot.createdAt).startsWith(day),
  );
  return hasDailyToday ? ["hourly"] : ["hourly", "daily"];
}

function createSnapshot(root, flags, kind, createdAt) {
  const p = paths(root, flags);
  const dir = join(p.backupDir, kind);
  mkdirSync(dir, { recursive: true });
  const destination = join(dir, `freela-${kind}-${timestampForFile(createdAt)}.sqlite`);
  let database;
  try {
    database = new DatabaseSync(p.dbPath, { readOnly: true });
    database.exec("PRAGMA busy_timeout = 10000;");
    database.exec(`VACUUM INTO ${sqlStringLiteral(destination)};`);
  } finally {
    if (database) database.close();
  }

  const integrityCheck = integrityCheckDatabase(destination);
  if (integrityCheck !== "ok") {
    rmSync(destination, { force: true });
    throw usageError(`Snapshot invalido removido: integrity_check=${integrityCheck}`);
  }

  const snapshot = {
    kind,
    path: destination,
    createdAt,
    size: statSync(destination).size,
    sha256: sha256File(destination),
    integrityCheck,
  };
  const manifest = readManifest(root, flags);
  manifest.snapshots = [...(manifest.snapshots ?? []), snapshot].sort((left, right) =>
    String(right.createdAt).localeCompare(String(left.createdAt)),
  );
  writeManifest(root, flags, manifest);
  return snapshot;
}

function integrityCheckDatabase(file) {
  let database;
  try {
    database = new DatabaseSync(file, { readOnly: true });
    database.exec("PRAGMA busy_timeout = 10000;");
    return database.prepare("pragma integrity_check").get().integrity_check;
  } finally {
    if (database) database.close();
  }
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function timestampForFile(value = new Date().toISOString()) {
  return `${value.replace(/[-:.TZ]/g, "")}-${process.hrtime.bigint().toString(36)}`;
}

function sqlStringLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
```

- [ ] **Step 3: Add retention pruning**

Add:

```js
function pruneSnapshots(root, flags) {
  const manifest = readManifest(root, flags);
  const keepHourly = parsePositiveInteger(flags["keep-hourly"] ?? "24", "--keep-hourly");
  const keepDaily = parsePositiveInteger(flags["keep-daily"] ?? "14", "--keep-daily");
  const kept = [];

  for (const kind of ["hourly", "daily"]) {
    const limit = kind === "hourly" ? keepHourly : keepDaily;
    const items = (manifest.snapshots ?? [])
      .filter((snapshot) => snapshot.kind === kind)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
    kept.push(...items.slice(0, limit));
    for (const item of items.slice(limit)) {
      rmSync(item.path, { force: true });
    }
  }

  manifest.snapshots = kept.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  writeManifest(root, flags, manifest);
}

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw usageError(`Valor invalido para ${label}: ${value}`);
  }
  return parsed;
}
```

- [ ] **Step 4: Verify snapshot tests**

Run:

```bash
node --test --test-name-pattern 'snapshot creates|check is yellow' tests/freela-ops-doctor.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add scripts/freela-ops-doctor.mjs tests/freela-ops-doctor.test.mjs
git commit -m "Add verified Freela SQLite snapshots"
```

## Task 4: Add Restore Planning And Explicit Restore

**Files:**
- Modify: `scripts/freela-ops-doctor.mjs`
- Modify: `tests/freela-ops-doctor.test.mjs`

- [ ] **Step 1: Add failing restore-plan and restore confirmation tests**

Append:

```js
test("restore-plan compares snapshot with current DB without restoring", () => {
  const root = makeRoot();
  initDb(root);
  assert.equal(runOps(root, ["snapshot", "--backup-dir", appBackupDir(root), "--now", "2026-06-21T08:00:00.000Z"]).status, 0);
  const snapshot = readManifest(root).snapshots.find((item) => item.kind === "hourly");

  const leadFile = join(root, "lead-after-snapshot.json");
  writeFileSync(
    leadFile,
    JSON.stringify([{ canonical_name: "Lead Depois Do Snapshot", recommended_offer: "Presenca Local em 72h" }]),
    "utf8",
  );
  assert.equal(runCrm(root, ["lead", "upsert", "--file", leadFile]).status, 0);

  const plan = runOps(root, ["restore-plan", snapshot.path, "--backup-dir", appBackupDir(root)]);

  assert.equal(plan.status, 0, plan.stderr);
  assert.match(plan.stdout, /restore-plan: ok/i);
  const files = readdirSync(join(root, ".scratch/ops/restore-plans")).filter((name) => name.endsWith(".json"));
  assert.equal(files.length, 1);
  const body = JSON.parse(readFileSync(join(root, ".scratch/ops/restore-plans", files[0]), "utf8"));
  assert.equal(body.snapshot.path, snapshot.path);
  assert.equal(body.counts.current.leads, 1);
  assert.equal(body.counts.snapshot.leads, 0);
  assert.equal(body.estimatedLoss.leads, 1);
});

test("restore refuses without confirm and creates forensic snapshot before replacing DB", () => {
  const root = makeRoot();
  initDb(root);
  assert.equal(runOps(root, ["snapshot", "--backup-dir", appBackupDir(root), "--now", "2026-06-21T08:00:00.000Z"]).status, 0);
  const snapshot = readManifest(root).snapshots.find((item) => item.kind === "hourly");

  const refused = runOps(root, ["restore", "--from", snapshot.path, "--backup-dir", appBackupDir(root)]);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /--confirm/i);

  const restored = runOps(root, ["restore", "--from", snapshot.path, "--confirm", "--backup-dir", appBackupDir(root)]);
  assert.equal(restored.status, 0, restored.stderr);
  assert.match(restored.stdout, /restore: ok/i);
  const forensic = readdirSync(join(root, ".scratch/forensics")).filter((name) => name.startsWith("sqlite-restore-"));
  assert.equal(forensic.length, 1);
});
```

- [ ] **Step 2: Implement restore-plan**

Add:

```js
function commandRestorePlan({ root, args, flags }) {
  const snapshotPath = resolve(args[0] ?? "");
  if (!snapshotPath) throw usageError("Informe o caminho do snapshot.");
  if (!existsSync(snapshotPath)) throw usageError(`Snapshot nao encontrado: ${snapshotPath}`);

  const p = paths(root, flags);
  mkdirSync(p.restorePlansDir, { recursive: true });
  const plan = buildRestorePlan(root, flags, snapshotPath);
  const base = `restore-plan-${timestampForFile(plan.createdAt)}`;
  const jsonPath = join(p.restorePlansDir, `${base}.json`);
  const mdPath = join(p.restorePlansDir, `${base}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  writeFileSync(mdPath, renderRestorePlanMarkdown(plan), "utf8");
  console.log(`restore-plan: ok (${jsonPath})`);
  return { exitCode: 0 };
}

function buildRestorePlan(root, flags, snapshotPath) {
  const currentCounts = readCounts(paths(root, flags).dbPath);
  const snapshotCounts = readCounts(snapshotPath);
  return {
    version: 1,
    createdAt: nowIso(flags),
    snapshot: {
      path: snapshotPath,
      integrityCheck: integrityCheckDatabase(snapshotPath),
      size: statSync(snapshotPath).size,
      sha256: sha256File(snapshotPath),
    },
    counts: {
      current: currentCounts,
      snapshot: snapshotCounts,
    },
    estimatedLoss: {
      leads: Math.max(0, currentCounts.leads - snapshotCounts.leads),
      audit_log: Math.max(0, currentCounts.audit_log - snapshotCounts.audit_log),
      interactions: Math.max(0, currentCounts.interactions - snapshotCounts.interactions),
      whatsapp_outbox: Math.max(0, currentCounts.whatsapp_outbox - snapshotCounts.whatsapp_outbox),
      worker_handoffs: Math.max(0, currentCounts.worker_handoffs - snapshotCounts.worker_handoffs),
    },
    recommendation: "Restaurar somente se o DB atual estiver invalido ou a perda estimada for aceita pelo operador.",
  };
}

function readCounts(dbPath) {
  let database;
  try {
    database = new DatabaseSync(dbPath, { readOnly: true });
    return {
      leads: countRows(database, "leads"),
      audit_log: countRows(database, "audit_log"),
      interactions: countRows(database, "interactions"),
      whatsapp_outbox: countRows(database, "whatsapp_outbox"),
      worker_handoffs: countRows(database, "worker_handoffs"),
    };
  } finally {
    if (database) database.close();
  }
}

function renderRestorePlanMarkdown(plan) {
  return [
    "# Restore Plan",
    "",
    `Created at: ${plan.createdAt}`,
    `Snapshot: ${plan.snapshot.path}`,
    `Integrity: ${plan.snapshot.integrityCheck}`,
    "",
    "## Estimated loss",
    `- leads: ${plan.estimatedLoss.leads}`,
    `- audit_log: ${plan.estimatedLoss.audit_log}`,
    `- interactions: ${plan.estimatedLoss.interactions}`,
    `- whatsapp_outbox: ${plan.estimatedLoss.whatsapp_outbox}`,
    `- worker_handoffs: ${plan.estimatedLoss.worker_handoffs}`,
    "",
    `Recommendation: ${plan.recommendation}`,
    "",
  ].join("\n");
}
```

- [ ] **Step 3: Implement restore**

Add:

```js
function commandRestore({ root, flags }) {
  if (!flags.confirm) throw usageError("Restore real exige --confirm.");
  const snapshotPath = resolve(flags.from ?? "");
  if (!snapshotPath) throw usageError("Informe --from <snapshot>.");
  if (!existsSync(snapshotPath)) throw usageError(`Snapshot nao encontrado: ${snapshotPath}`);
  if (integrityCheckDatabase(snapshotPath) !== "ok") throw usageError("Snapshot recusado: integrity_check falhou.");

  const p = paths(root, flags);
  const forensicDir = join(root, ".scratch/forensics", `sqlite-restore-${timestampForFile(nowIso(flags))}`);
  mkdirSync(join(forensicDir, "before"), { recursive: true });
  for (const candidate of [p.dbPath, `${p.dbPath}-wal`, `${p.dbPath}-shm`]) {
    if (existsSync(candidate)) copyFileSync(candidate, join(forensicDir, "before", basename(candidate)));
  }

  const staging = join(dirname(p.dbPath), `.${basename(p.dbPath)}.restore-${process.pid}.tmp`);
  copyFileSync(snapshotPath, staging);
  if (integrityCheckDatabase(staging) !== "ok") {
    rmSync(staging, { force: true });
    throw usageError("Restore abortado: staging falhou no integrity_check.");
  }
  renameSync(staging, p.dbPath);
  rmSync(`${p.dbPath}-wal`, { force: true });
  rmSync(`${p.dbPath}-shm`, { force: true });
  console.log(`restore: ok (${p.dbPath})`);
  console.log(`snapshot forense: ${forensicDir}`);
  return { exitCode: 0 };
}
```

- [ ] **Step 4: Verify restore tests**

Run:

```bash
node --test --test-name-pattern 'restore-plan|restore refuses' tests/freela-ops-doctor.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add scripts/freela-ops-doctor.mjs tests/freela-ops-doctor.test.mjs
git commit -m "Add Freela SQLite restore planning"
```

## Task 5: Add Paperclip Ops Health Publish With Privacy Guard

**Files:**
- Modify: `scripts/freela-ops-doctor.mjs`
- Modify: `tests/freela-ops-doctor.test.mjs`

- [ ] **Step 1: Add mock Paperclip server helper and privacy test**

Append:

```js
async function withOpsHealthServer(run) {
  const requests = [];
  const documents = new Map();
  const issues = [{ id: "ops-health-id", identifier: "FRE-OPS", title: "Ops Health", status: "in_progress" }];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const body = bodyText ? JSON.parse(bodyText) : null;
    requests.push({ method: req.method, url: req.url, headers: req.headers, body });
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && req.url?.startsWith("/api/companies/company-test/issues")) {
      res.end(JSON.stringify({ issues }));
      return;
    }

    const docMatch = req.url?.match(/^\/api\/issues\/([^/]+)\/documents\/([^/]+)$/);
    if (docMatch && req.method === "GET") {
      const current = documents.get(`${decodeURIComponent(docMatch[1])}/${decodeURIComponent(docMatch[2])}`);
      if (!current) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      res.end(JSON.stringify(current));
      return;
    }
    if (docMatch && req.method === "PUT") {
      const key = `${decodeURIComponent(docMatch[1])}/${decodeURIComponent(docMatch[2])}`;
      const next = { key: decodeURIComponent(docMatch[2]), ...body, latestRevisionId: "rev-1" };
      documents.set(key, next);
      res.end(JSON.stringify({ document: next }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    return await run(`http://127.0.0.1:${port}`, requests, documents);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("publish updates Paperclip Ops Health without leaking private lead data", async () => {
  const root = makeRoot();
  initDb(root);
  const leadFile = join(root, "private-lead.json");
  writeFileSync(
    leadFile,
    JSON.stringify([
      {
        canonical_name: "Lead Privado",
        phone_or_contact: "+55 27 99999-1111",
        recommended_offer: "Presenca Local em 72h",
      },
    ]),
    "utf8",
  );
  assert.equal(runCrm(root, ["lead", "upsert", "--file", leadFile]).status, 0);
  assert.equal(runOps(root, ["snapshot", "--backup-dir", appBackupDir(root), "--now", "2026-06-21T12:00:00.000Z"]).status, 0);

  await withOpsHealthServer(async (apiBase, requests, documents) => {
    const result = runOps(root, [
      "publish",
      "--backup-dir",
      appBackupDir(root),
      "--api-base",
      apiBase,
      "--company-id",
      "company-test",
      "--now",
      "2026-06-21T12:05:00.000Z",
    ]);

    assert.equal(result.status, 0, result.stderr);
    const put = requests.find((request) => request.method === "PUT");
    assert.ok(put);
    assert.equal(put.url, "/api/issues/FRE-OPS/documents/reliability-status");
    const body = put.body.body;
    assert.match(body, /Status: green/i);
    assert.match(body, /Ultimo snapshot integro/i);
    assert.doesNotMatch(body, /Lead Privado/i);
    assert.doesNotMatch(body, /99999-1111/i);
    assert.equal(documents.has("FRE-OPS/reliability-status"), true);
  });
});
```

- [ ] **Step 2: Implement Paperclip publish helpers**

Add to `scripts/freela-ops-doctor.mjs`:

```js
async function commandPublish({ root, flags }) {
  const report = buildReport(root, flags);
  writeReport(root, flags, report);
  const issue = await findOpsHealthIssue(flags);
  await putOpsHealthDocument({ flags, issue, report });
  console.log(`status: ${report.status}`);
  console.log(`Ops Health publicado: ${issue.identifier ?? issue.id} / ${DEFAULT_OPS_DOCUMENT_KEY}`);
  return { exitCode: exitCodeForStatus(report.status) };
}

async function findOpsHealthIssue(flags) {
  if (flags.issue) return { id: flags.issue, identifier: flags.issue, title: DEFAULT_OPS_ISSUE_TITLE };
  const apiBase = normalizeApiBase(flags["api-base"] ?? process.env.PAPERCLIP_API_URL ?? DEFAULT_API_BASE);
  const companyId = flags["company-id"] ?? process.env.PAPERCLIP_COMPANY_ID ?? DEFAULT_COMPANY_ID;
  const timeoutMs = parsePositiveInteger(flags["timeout-ms"] ?? `${DEFAULT_TIMEOUT_MS}`, "--timeout-ms");
  const query = `${apiBase}/api/companies/${encodeURIComponent(companyId)}/issues?q=${encodeURIComponent(
    DEFAULT_OPS_ISSUE_TITLE,
  )}&status=todo,in_progress`;
  const data = await requestJson({ url: query, method: "GET", flags, timeoutMs });
  const issues = data?.issues ?? data ?? [];
  const issue = issues.find((item) => item.title === DEFAULT_OPS_ISSUE_TITLE) ?? issues[0];
  if (!issue) throw usageError("Issue Ops Health nao encontrada. Crie a issue ou informe --issue.");
  return issue;
}

async function putOpsHealthDocument({ flags, issue, report }) {
  const apiBase = normalizeApiBase(flags["api-base"] ?? process.env.PAPERCLIP_API_URL ?? DEFAULT_API_BASE);
  const timeoutMs = parsePositiveInteger(flags["timeout-ms"] ?? `${DEFAULT_TIMEOUT_MS}`, "--timeout-ms");
  const issueRef = issue.identifier ?? issue.id;
  const key = flags.key ?? DEFAULT_OPS_DOCUMENT_KEY;
  const url = `${apiBase}/api/issues/${encodeURIComponent(issueRef)}/documents/${encodeURIComponent(key)}`;
  const payload = {
    title: "Reliability Status",
    format: "markdown",
    body: renderExecutiveStatus(report),
    changeSummary: "Atualiza Ops Health",
  };
  return requestJson({ url, method: "PUT", payload, flags, timeoutMs });
}

function renderExecutiveStatus(report) {
  const latest = report.checks.backups.latestSnapshot?.createdAt ?? "sem snapshot integro";
  return [
    "# Ops Health",
    "",
    `Status: ${report.status}`,
    `Ultimo check: ${report.checkedAt}`,
    `Ultimo snapshot integro: ${latest}`,
    "",
    "## Riscos",
    `- SQLite: ${report.checks.sqlite.status}`,
    `- Backups: ${report.checks.backups.status}`,
    `- Operacional: ${report.checks.operational.status}`,
    "",
    "## Acao recomendada",
    report.recommendedAction,
    "",
    "Evidencia tecnica privada: .scratch/ops/reliability-status.json",
    "",
  ].join("\n");
}

async function requestJson({ url, method, payload, flags, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { Accept: "application/json" };
  if (payload !== undefined) headers["Content-Type"] = "application/json";
  const apiKey = flags["api-key"] ?? process.env.PAPERCLIP_API_KEY ?? null;
  const runId = flags["run-id"] ?? process.env.PAPERCLIP_RUN_ID ?? null;
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (runId) headers["X-Paperclip-Run-Id"] = runId;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = new Error(`Paperclip retornou HTTP ${response.status} em ${method} ${url}`);
      error.status = response.status;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeApiBase(apiBase) {
  return String(apiBase).replace(/\/+$/, "");
}
```

- [ ] **Step 3: Verify publish privacy test**

Run:

```bash
node --test --test-name-pattern 'publish updates Paperclip Ops Health' tests/freela-ops-doctor.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit**

Run:

```bash
git add scripts/freela-ops-doctor.mjs tests/freela-ops-doctor.test.mjs
git commit -m "Publish Freela Ops Health status"
```

## Task 6: Block Critical CRM Writes When Ops Status Is Red

**Files:**
- Modify: `scripts/freela-crm.mjs`
- Modify: `tests/freela-crm-cli.test.mjs`

- [ ] **Step 1: Add failing CRM red guard test**

In `tests/freela-crm-cli.test.mjs`, add after the healthcheck/backup tests:

```js
test("CRM bloqueia escrita critica quando Ops Doctor marcou status red", () => {
  const root = makeRoot();
  assert.equal(run(root, ["init"]).status, 0);

  const opsDir = join(root, ".scratch/ops");
  mkdirSync(opsDir, { recursive: true });
  writeFileSync(
    join(opsDir, "reliability-status.json"),
    JSON.stringify({
      version: 1,
      checkedAt: "2026-06-21T12:00:00.000Z",
      status: "red",
      recommendedAction: "Parar escritas criticas.",
      checks: {
        sqlite: { status: "red", message: "header SQLite ausente" },
      },
    }),
    "utf8",
  );

  const leadFile = writeJson(root, "red-block-lead.json", [
    { canonical_name: "Lead Bloqueado", recommended_offer: "Presenca Local em 72h" },
  ]);

  const blocked = run(root, ["lead", "upsert", "--file", leadFile]);
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /Ops Doctor.*red|status operacional.*red/i);

  const health = run(root, ["healthcheck"]);
  assert.equal(health.status, 0, health.stderr);
});
```

- [ ] **Step 2: Add CRM guard helpers**

In `scripts/freela-crm.mjs`, add `readJsonSync` imports only if needed. The current imports already include `readFileSync`, `existsSync`, and `join`.

Add this helper near `openDatabase`:

```js
function ensureOperationalWritesAllowed(root, command) {
  if (!requiresOperationalWriteGuard(command)) return;
  const statusPath = join(root, ".scratch/ops/reliability-status.json");
  if (!existsSync(statusPath)) return;

  let report;
  try {
    report = JSON.parse(readFileSync(statusPath, "utf8"));
  } catch (error) {
    throw usageError(`Status operacional ilegivel em ${statusPath}: ${error.message}`);
  }

  if (report.status === "red") {
    throw usageError(
      `Ops Doctor marcou status operacional red em ${report.checkedAt ?? "data desconhecida"}. ` +
        `Escrita critica bloqueada. Rode node scripts/freela-ops-doctor.mjs check e siga .scratch/ops/reliability-status.md.`,
    );
  }
}

function requiresOperationalWriteGuard(command) {
  const joined = command.join(" ");
  const readOnly = new Set([
    "healthcheck",
    "commercial status",
    "commercial export",
    "commercial enrichment-plan",
    "commercial duplicate-audit",
    "export all",
    "export paperclip-cards",
    "export operator-status",
    "profile-evidence export",
  ]);
  if (command[0] === "init") return false;
  return !readOnly.has(joined);
}
```

- [ ] **Step 3: Call the guard before opening the database for commands**

In `dispatch`, before `const database = openDatabase(root, dbPath);`, add:

```js
  ensureOperationalWritesAllowed(root, command);
```

Do not call this guard before `healthcheck` or `init`.

- [ ] **Step 4: Verify CRM guard test**

Run:

```bash
node --test --test-name-pattern 'CRM bloqueia escrita critica' tests/freela-crm-cli.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add scripts/freela-crm.mjs tests/freela-crm-cli.test.mjs
git commit -m "Block Freela CRM writes on red ops status"
```

## Task 7: Add Paperclip And Launchd Contracts

**Files:**
- Create: `docs/freelancer/paperclip/launchd/com.luiz-fbm.freela-ops-snapshot.plist`
- Create: `docs/freelancer/paperclip/launchd/com.luiz-fbm.freela-ops-publish.plist`
- Modify: `docs/freelancer/data-contract.md`
- Modify: `docs/freelancer/paperclip/README.md`
- Modify: `docs/freelancer/prompt-thread-coo-freelancer.md`
- Modify: `tests/paperclip-automation-contract.test.mjs`

- [ ] **Step 1: Add failing contract test**

In `tests/paperclip-automation-contract.test.mjs`, add:

```js
test("Paperclip docs expose Ops Health reliability loop without private data leakage", () => {
  const readme = paperclipReadme();
  const contract = read("docs/freelancer/data-contract.md");
  const coo = cooFreelancer();
  const opsDoctorScript = read("scripts/freela-ops-doctor.mjs");
  const snapshotPlist = read("docs/freelancer/paperclip/launchd/com.luiz-fbm.freela-ops-snapshot.plist");
  const publishPlist = read("docs/freelancer/paperclip/launchd/com.luiz-fbm.freela-ops-publish.plist");

  for (const doc of [readme, contract, coo]) {
    assert.match(doc, /Ops Health/i);
    assert.match(doc, /freela-ops-doctor\.mjs/i);
    assert.match(doc, /\.scratch\/ops\/reliability-status\.json/i);
    assert.match(doc, /status.*green.*yellow.*red|green.*yellow.*red/is);
    assert.match(doc, /nao.*dados brutos|sem.*dados brutos/is);
  }

  assert.match(opsDoctorScript, /reliability-status/i);
  assert.match(opsDoctorScript, /DEFAULT_BACKUP_DIR/i);
  assert.match(snapshotPlist, /freela-ops-doctor\.mjs/);
  assert.match(snapshotPlist, /snapshot/);
  assert.match(snapshotPlist, /StartInterval/);
  assert.match(publishPlist, /freela-ops-doctor\.mjs/);
  assert.match(publishPlist, /publish/);
  assert.match(publishPlist, /StartCalendarInterval/);
});
```

- [ ] **Step 2: Create launchd plist templates**

Create `docs/freelancer/paperclip/launchd/com.luiz-fbm.freela-ops-snapshot.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.luiz-fbm.freela-ops-snapshot</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/luiz_fbm/Documents/programacao/freela/scripts/freela-ops-doctor.mjs</string>
    <string>--root</string>
    <string>/Users/luiz_fbm/Documents/programacao/freela</string>
    <string>snapshot</string>
  </array>
  <key>StartInterval</key>
  <integer>3600</integer>
  <key>StandardOutPath</key>
  <string>/Users/luiz_fbm/Library/Logs/freela-ops-snapshot.out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/luiz_fbm/Library/Logs/freela-ops-snapshot.err.log</string>
</dict>
</plist>
```

Create `docs/freelancer/paperclip/launchd/com.luiz-fbm.freela-ops-publish.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.luiz-fbm.freela-ops-publish</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/luiz_fbm/Documents/programacao/freela/scripts/freela-ops-doctor.mjs</string>
    <string>--root</string>
    <string>/Users/luiz_fbm/Documents/programacao/freela</string>
    <string>publish</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>8</integer>
    <key>Minute</key>
    <integer>15</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/Users/luiz_fbm/Library/Logs/freela-ops-publish.out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/luiz_fbm/Library/Logs/freela-ops-publish.err.log</string>
</dict>
</plist>
```

- [ ] **Step 3: Update docs with exact commands**

Add this section to `docs/freelancer/paperclip/README.md`:

    ## Ops Health

    O status de confiabilidade da operacao fica em dois lugares:

    - evidencia tecnica privada: `.scratch/ops/reliability-status.json` e `.scratch/ops/reliability-status.md`;
    - painel executivo: issue `Ops Health`, documento `reliability-status`.

    Comandos:

    ```bash
    node scripts/freela-ops-doctor.mjs check
    node scripts/freela-ops-doctor.mjs snapshot
    node scripts/freela-ops-doctor.mjs publish
    node scripts/freela-ops-doctor.mjs restore-plan /caminho/do/snapshot.sqlite
    ```

    Se o status for `red`, agentes devem parar novas escritas criticas e escalar. O Paperclip recebe somente resumo executivo, sem nomes, telefones, mensagens ou dados brutos.

    LaunchAgents opcionais:

    ```bash
    cp docs/freelancer/paperclip/launchd/com.luiz-fbm.freela-ops-snapshot.plist ~/Library/LaunchAgents/
    cp docs/freelancer/paperclip/launchd/com.luiz-fbm.freela-ops-publish.plist ~/Library/LaunchAgents/
    launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.luiz-fbm.freela-ops-snapshot.plist
    launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.luiz-fbm.freela-ops-publish.plist
    ```

Add this section to `docs/freelancer/data-contract.md`:

    ## Ops Health e confiabilidade

    O SQLite continua sendo a fonte oficial. O Ops Doctor registra a saude operacional em `.scratch/ops/reliability-status.json`, `.scratch/ops/reliability-status.md` e `.scratch/ops/backup-manifest.json`.

    Snapshots SQLite ficam em `/Users/luiz_fbm/Library/Application Support/freela-paperclip/backups`, fora de `Documents`. O manifesto em `.scratch/ops/backup-manifest.json` guarda apenas metadata tecnica e caminhos locais.

    Status:

    - `green`: operacao normal.
    - `yellow`: operacao permitida com atencao.
    - `red`: novas escritas criticas devem parar ate diagnostico/recuperacao.

Add this section to `docs/freelancer/prompt-thread-coo-freelancer.md`:

    Antes de coordenar uma rodada com escrita no CRM, consulte o status operacional quando houver duvida:

    ```bash
    node scripts/freela-ops-doctor.mjs check
    ```

    Se `.scratch/ops/reliability-status.json` estiver `red`, pare novas escritas criticas e publique/escale via `Ops Health`. Nao copie dados brutos, nomes, telefones ou mensagens para o documento executivo.

- [ ] **Step 4: Verify contract test**

Run:

```bash
node --test --test-name-pattern 'Ops Health reliability loop' tests/paperclip-automation-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add docs/freelancer/data-contract.md docs/freelancer/paperclip/README.md docs/freelancer/prompt-thread-coo-freelancer.md docs/freelancer/paperclip/launchd tests/paperclip-automation-contract.test.mjs
git commit -m "Document Freela Ops Health loop"
```

## Task 8: Final Validation And Operational Bootstrap

**Files:**
- Modify if needed: `scripts/freela-ops-doctor.mjs`
- Runtime outputs: `.scratch/ops/*`

- [ ] **Step 1: Run focused tests**

Run:

```bash
node --test tests/freela-ops-doctor.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run required project tests**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs tests/whatsapp-local-gateway.test.mjs
node --test tests/paperclip-automation-contract.test.mjs
```

Expected: all tests pass.

- [ ] **Step 3: Run syntax checks**

Run:

```bash
node --check scripts/freela-crm.mjs scripts/freela-ops-doctor.mjs scripts/whatsapp-local-gateway.mjs
```

Expected: no output and exit code 0.

- [ ] **Step 4: Validate JSON docs**

Run:

```bash
jq empty docs/freelancer/paperclip/*.json
```

Expected: no output and exit code 0.

- [ ] **Step 5: Check whitespace**

Run:

```bash
git -c core.fsmonitor=false diff --check
```

Expected: no output and exit code 0.

- [ ] **Step 6: Create the first verified local snapshot**

Run:

```bash
node scripts/freela-ops-doctor.mjs snapshot
```

Expected: prints `snapshot: ok` and writes `.scratch/ops/backup-manifest.json`.

- [ ] **Step 7: Check local reliability status**

Run:

```bash
node scripts/freela-ops-doctor.mjs check
```

Expected: status is `green` or `yellow`. If `yellow`, the report must explain only non-critical freshness or operational attention, not DB corruption.

- [ ] **Step 8: Publish Ops Health**

Run only when Paperclip API is available at `http://127.0.0.1:3100`:

```bash
node scripts/freela-ops-doctor.mjs publish
```

Expected: updates issue `Ops Health` document `reliability-status` and does not include names, phones, messages, or raw private payloads.

- [ ] **Step 9: Validate official SQLite integrity**

Run:

```bash
sqlite3 ".scratch/db/freela.sqlite" "pragma integrity_check;"
```

Expected: `ok`.

- [ ] **Step 10: Commit final adjustments**

Run:

```bash
git add scripts/freela-ops-doctor.mjs scripts/freela-crm.mjs tests/freela-ops-doctor.test.mjs tests/freela-crm-cli.test.mjs tests/paperclip-automation-contract.test.mjs docs/freelancer/data-contract.md docs/freelancer/paperclip/README.md docs/freelancer/prompt-thread-coo-freelancer.md docs/freelancer/paperclip/launchd
git commit -m "Add Freela operational consistency loop"
```

## Self-Review

Spec coverage:

- `.scratch/ops` private reports: Task 2.
- Paperclip `Ops Health`: Task 5 and Task 7.
- Verified hourly/daily snapshots: Task 3.
- No remote/cloud backup: file structure and docs keep backups local.
- Restore planning before restore: Task 4.
- Explicit restore confirmation and forensic snapshot: Task 4.
- CLI red guardrails: Task 6.
- launchd local scheduler: Task 7.
- TDD: every implementation task starts with failing tests.

Scope check:

- This is one coherent subsystem: operational consistency around the SQLite source of truth.
- WhatsApp behavior is not changed, except required regression tests still run.

Type and naming consistency:

- Status values are `green`, `yellow`, `red`.
- Paperclip issue title is `Ops Health`.
- Paperclip document key is `reliability-status`.
- Private status file is `.scratch/ops/reliability-status.json`.
- Private manifest file is `.scratch/ops/backup-manifest.json`.
