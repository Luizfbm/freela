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
