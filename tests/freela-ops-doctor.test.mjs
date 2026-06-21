import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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

function runOpsAsync(root, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [opsDoctor, "--root", root, ...args], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
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

test("publish updates Paperclip Ops Health without leaking private lead data", async () => {
  const root = makeRoot();
  initDb(root);
  const leadFile = join(root, "private-lead.json");
  writeFileSync(
    leadFile,
    JSON.stringify([
      {
        canonical_name: "Lidiane Privada",
        phone_or_contact: "+55 27 99999-1111",
        recommended_offer: "Presenca Local em 72h",
      },
    ]),
    "utf8",
  );
  assert.equal(runCrm(root, ["lead", "upsert", "--file", leadFile]).status, 0);
  assert.equal(
    runOps(root, ["snapshot", "--backup-dir", appBackupDir(root), "--now", "2026-06-21T12:00:00.000Z"]).status,
    0,
  );

  await withOpsHealthServer(async (apiBase, requests, documents) => {
    const result = await runOpsAsync(root, [
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
    assert.doesNotMatch(body, /Lidiane Privada/i);
    assert.doesNotMatch(body, /99999-1111/i);
    assert.equal(documents.has("FRE-OPS/reliability-status"), true);
  });
});
