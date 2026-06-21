import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

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

function readStatus(root) {
  return JSON.parse(readFileSync(join(root, ".scratch/ops/reliability-status.json"), "utf8"));
}

function readManifest(root) {
  return JSON.parse(readFileSync(join(root, ".scratch/ops/backup-manifest.json"), "utf8"));
}

function appBackupDir(root) {
  return join(root, "local-app-support/freela-paperclip/backups");
}

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

test("restore-plan compares snapshot with current DB without restoring", () => {
  const root = makeRoot();
  initDb(root);
  assert.equal(
    runOps(root, ["snapshot", "--backup-dir", appBackupDir(root), "--now", "2026-06-21T08:00:00.000Z"]).status,
    0,
  );
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
  assert.equal(
    runOps(root, ["snapshot", "--backup-dir", appBackupDir(root), "--now", "2026-06-21T08:00:00.000Z"]).status,
    0,
  );
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
