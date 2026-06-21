#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
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
  if (command === "restore") return commandRestore({ root, flags });
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
    if (value === undefined || value.startsWith("--")) {
      throw usageError(`Valor obrigatorio para --${key}`);
    }
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

function commandCheck({ root, flags }) {
  const report = buildReport(root, flags);
  writeReport(root, flags, report);
  console.log(`status: ${report.status}`);
  console.log(`relatorio: ${paths(root, flags).statusJson}`);
  return { exitCode: exitCodeForStatus(report.status) };
}

function buildReport(root, flags = {}) {
  const sqlite = checkSqlite(root, flags);
  const backups = checkBackups(root, flags);
  const operational = checkOperationalFromSqlite(sqlite);
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
      whatsapp_outbox_pending: countWhere(
        database,
        "whatsapp_outbox",
        "status in ('pending', 'approved', 'delivery_pending')",
      ),
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
    message: "header SQLite valido",
    size: stat.size,
    blocks: stat.blocks ?? null,
    mtime: stat.mtime.toISOString(),
  };
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

function checkOperationalFromSqlite(sqlite) {
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

function readManifest(root, flags = {}) {
  const file = paths(root, flags).manifest;
  if (!existsSync(file)) return { version: 1, snapshots: [] };
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeReport(root, flags, report) {
  const p = paths(root, flags);
  mkdirSync(p.opsDir, { recursive: true });
  writeFileSync(p.statusJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(p.statusMd, renderPrivateMarkdown(report), "utf8");
}

function renderPrivateMarkdown(report) {
  const lines = [
    "# Freela Reliability Status",
    "",
    `Status: ${report.status}`,
    `Checked at: ${report.checkedAt}`,
    "",
    "## Checks",
  ];
  for (const [name, check] of Object.entries(report.checks)) {
    lines.push(`- ${name}: ${check.status} - ${check.message}`);
  }
  lines.push("", "## Recommended action", report.recommendedAction, "");
  return `${lines.join("\n")}\n`;
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

function latestByKind(snapshots, kind) {
  return snapshots.find((snapshot) => snapshot.kind === kind) ?? null;
}

function countRows(database, table) {
  return database.prepare(`select count(*) as count from ${table}`).get().count;
}

function countWhere(database, table, where) {
  return database.prepare(`select count(*) as count from ${table} where ${where}`).get().count;
}

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

function usageError(message) {
  const error = new Error(message);
  error.exitCode = 1;
  return error;
}

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
    if (!["hourly", "daily"].includes(flags.kind)) {
      throw usageError(`--kind invalido: ${flags.kind}`);
    }
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

function writeManifest(root, flags, manifest) {
  const file = paths(root, flags).manifest;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
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

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw usageError(`Valor invalido para ${label}: ${value}`);
  }
  return parsed;
}

function commandPublish() {
  throw usageError("Comando publish ainda nao implementado.");
}

function commandRestorePlan() {
  throw usageError("Comando restore-plan ainda nao implementado.");
}

function commandRestore() {
  throw usageError("Comando restore ainda nao implementado.");
}

await main();
