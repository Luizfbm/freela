import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";

const repoRoot = new URL("..", import.meta.url).pathname;
const gateway = join(repoRoot, "scripts/whatsapp-local-gateway.mjs");
const crm = join(repoRoot, "scripts/freela-crm.mjs");

function makeRoot() {
  return mkdtempSync(join(tmpdir(), "wa-gateway-"));
}

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, { cwd: repoRoot, encoding: "utf8", ...options });
}

function runNodeAsync(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: repoRoot, ...options });
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

function runNodeUntilStdout(args, pattern, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: repoRoot, ...options });
    let stdout = "";
    let stderr = "";
    let matched = false;
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`Timed out waiting for ${pattern}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 5000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!matched && pattern.test(stdout)) {
        matched = true;
        child.kill("SIGTERM");
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (matched) {
        resolve({ status, signal, stdout, stderr });
        return;
      }
      reject(new Error(`Process exited before ${pattern}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });
}

function runNodeUntilOutput(args, pattern, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: repoRoot, ...options });
    let stdout = "";
    let stderr = "";
    let matched = false;
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`Timed out waiting for ${pattern}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 5000);
    const stopOnMatch = () => {
      if (matched) return;
      if (!pattern.test(stdout) && !pattern.test(stderr)) return;
      matched = true;
      child.kill("SIGTERM");
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      stopOnMatch();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      stopOnMatch();
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (matched) {
        resolve({ status, signal, stdout, stderr });
        return;
      }
      reject(new Error(`Process exited before ${pattern}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });
}

function startNodeUntilStdout(args, pattern, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: repoRoot, ...options });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`Timed out waiting for ${pattern}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 5000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!settled && pattern.test(stdout)) {
        settled = true;
        clearTimeout(timeout);
        resolve({
          child,
          get stdout() {
            return stdout;
          },
          get stderr() {
            return stderr;
          },
        });
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`Process exited before ${pattern}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });
}

function stopChild(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode) {
      resolve();
      return;
    }
    child.once("close", resolve);
    child.kill("SIGTERM");
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

function withBridgeServer(handler) {
  return new Promise((resolve, reject) => {
    const requests = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        requests.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: body ? JSON.parse(body) : {},
        });
        handler(req, res);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((done) => server.close(done)),
      });
    });
    server.on("error", reject);
  });
}

function withPaperclipServer(handler) {
  return new Promise((resolve, reject) => {
    const requests = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        requests.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : {} });
        handler(req, res, requests);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((done) => server.close(done)),
      });
    });
    server.on("error", reject);
  });
}

function seedApprovedOutbox(root, suffix = "001") {
  assert.equal(runNode([crm, "--root", root, "init"]).status, 0);
  const leadFile = join(root, "lead.json");
  writeFileSync(
    leadFile,
    JSON.stringify([
      {
        canonical_name: "Aghata Massoterapia",
        phone_or_contact: "+55 27 99999-0000",
        recommended_offer: "Presenca Local em 72h",
      },
    ]),
  );
  assert.equal(runNode([crm, "--root", root, "lead", "upsert", "--file", leadFile]).status, 0);
  const inboundFile = join(root, `inbound-${suffix}.json`);
  writeFileSync(
    inboundFile,
    JSON.stringify({
      bridge_message_id: `wa-dispatch-${suffix}`,
      chat_id: "5527999990000@s.whatsapp.net",
      sender_name: "Aghata Massoterapia",
      sender_phone: "+55 27 99999-0000",
      body: suffix === "001" ? "Pode sim" : `Pode sim ${suffix}`,
      received_at: "2026-06-21T11:00:00-03:00",
    }),
  );
  assert.equal(
    runNode([crm, "--root", root, "whatsapp", "inbound", "ingest", "--file", inboundFile])
      .status,
    0,
  );
  assert.equal(
    runNode([
      crm,
      "--root",
      root,
      "whatsapp",
      "outbox",
      "propose",
      "--name",
      "Aghata Massoterapia",
      "--body",
      "Vi seu retorno. Vou te mandar os 3 pontos de forma bem objetiva.",
      "--source",
      "atendimento-whatsapp",
      "--humanizer-pass",
      "true",
      "--used-last-inbound",
      "true",
      "--contextual-reply",
      "true",
    ]).status,
    0,
  );
  const db = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  const outbox = db.prepare("select * from whatsapp_outbox order by id desc limit 1").get();
  db.close();
  assert.equal(
    runNode([
      crm,
      "--root",
      root,
      "whatsapp",
      "guardian",
      "review",
      "--outbox-id",
      String(outbox.id),
    ]).status,
    0,
  );
  return outbox.id;
}

function readLatestOutbox(root) {
  const db = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  const outbox = db.prepare("select * from whatsapp_outbox order by id desc limit 1").get();
  db.close();
  return outbox;
}

function readLatestDispatchAudit(root) {
  const db = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  const outbox = db.prepare("select * from whatsapp_outbox order by id desc limit 1").get();
  const outbound = db
    .prepare("select * from interactions where lead_id = ? and direction = 'outbound'")
    .all(outbox.lead_id);
  const state = db
    .prepare("select * from lead_conversation_state where lead_id = ?")
    .get(outbox.lead_id);
  db.close();
  return { outbox, outbound, state };
}

function updateLatestOutbox(root, assignments, values = []) {
  const db = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  const outbox = db.prepare("select id from whatsapp_outbox order by id desc limit 1").get();
  db.prepare(`update whatsapp_outbox set ${assignments} where id = ?`).run(...values, outbox.id);
  db.close();
}

function updateLatestLeadState(root, whatsappState) {
  const db = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  const outbox = db
    .prepare("select lead_id from whatsapp_outbox order by id desc limit 1")
    .get();
  db.prepare("update lead_conversation_state set whatsapp_state = ? where lead_id = ?").run(
    whatsappState,
    outbox.lead_id,
  );
  db.close();
}

function deleteLatestLeadState(root) {
  const db = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  const outbox = db
    .prepare("select lead_id from whatsapp_outbox order by id desc limit 1")
    .get();
  db.prepare("delete from lead_conversation_state where lead_id = ?").run(outbox.lead_id);
  db.close();
}

function recreateLegacyWhatsappOutbox(root, dbPath = join(root, ".scratch/db/freela.sqlite")) {
  const db = new DatabaseSync(dbPath);
  db.exec(`
    pragma foreign_keys = off;
    drop table whatsapp_outbox;
    create table whatsapp_outbox (
      id integer primary key autoincrement,
      lead_id integer not null references leads(id),
      inbound_event_id integer references whatsapp_inbound_events(id),
      target_chat_id text not null,
      body text not null,
      source text not null,
      status text not null default 'pending_guardian',
      guardian_decision text,
      guardian_reason text,
      attempts integer not null default 0,
      bridge_message_id text,
      created_at text not null,
      approved_at text,
      sent_at text,
      failed_at text
    );
    pragma foreign_keys = on;
  `);
  db.close();
}

function readOutboxColumns(root, dbPath = join(root, ".scratch/db/freela.sqlite")) {
  const db = new DatabaseSync(dbPath);
  const columns = db.prepare("pragma table_info(whatsapp_outbox)").all().map((column) => column.name);
  db.close();
  return columns;
}

function assertDryRunDispatchableCount(root, expected) {
  const result = runNode([gateway, "--root", root, "dispatch-approved-outbox", "--dry-run"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`Dry-run dispatchaveis: ${expected}`, "i"));
  return result;
}

test("gateway refuses real batch dispatch without explicit confirmation", () => {
  const root = makeRoot();
  assert.equal(runNode([crm, "--root", root, "init"]).status, 0);

  const result = runNode([
    gateway,
    "--root",
    root,
    "dispatch-approved-outbox",
    "--provider",
    "waha",
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--outbox-id ou --confirm-batch/i);
});

test("gateway allows batch dispatch in dry-run without confirmation", () => {
  const root = makeRoot();
  seedApprovedOutbox(root);

  const result = runNode([
    gateway,
    "--root",
    root,
    "dispatch-approved-outbox",
    "--provider",
    "waha",
    "--dry-run",
    "true",
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry-run dispatchaveis: 1/i);
});

test("gateway importa evento normalizado em dry-run sem expor send direto", () => {
  const root = makeRoot();
  assert.equal(runNode([crm, "--root", root, "init"]).status, 0);
  const leadFile = join(root, "lead.json");
  writeFileSync(
    leadFile,
    JSON.stringify([
      {
        canonical_name: "Aghata Massoterapia",
        phone_or_contact: "+55 27 99999-0000",
        recommended_offer: "Presenca Local em 72h",
      },
    ]),
  );
  assert.equal(runNode([crm, "--root", root, "lead", "upsert", "--file", leadFile]).status, 0);

  const inboxFile = join(root, "inbox.jsonl");
  writeFileSync(
    inboxFile,
    `${JSON.stringify({
      bridge_message_id: "msg-001",
      chat_id: "5527999990000@s.whatsapp.net",
      sender_name: "Aghata Massoterapia",
      sender_phone: "+55 27 99999-0000",
      body: "Pode sim",
      received_at: "2026-06-19T09:30:00-03:00",
    })}\n`,
  );

  const result = runNode([gateway, "--root", root, "import-jsonl", "--file", inboxFile]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Importados: 1/i);

  const source = readFileSync(gateway, "utf8");
  assert.doesNotMatch(source, /send_message|send_file|send_audio_message/i);
});

test("gateway dry-runs approved whatsapp outbox without sending", () => {
  const root = makeRoot();
  seedApprovedOutbox(root);

  const result = runNode([
    gateway,
    "--root",
    root,
    "dispatch-approved-outbox",
    "--dry-run",
    "--limit",
    "1",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry-run dispatchaveis: 1/i);
  assert.match(result.stdout, /Aghata Massoterapia/i);

  const outbox = readLatestOutbox(root);
  assert.equal(outbox.status, "approved");
  assert.equal(outbox.sent_at, null);
});

test("gateway migrates legacy CRM schema before dry-run dispatch", async () => {
  const root = makeRoot();
  assert.equal(runNode([crm, "--root", root, "init"]).status, 0);
  recreateLegacyWhatsappOutbox(root);
  assert.ok(!readOutboxColumns(root).includes("humanizer_pass"));

  const bridge = await withBridgeServer((_req, res) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, message: "dry-run must not send" }));
  });
  try {
    const result = runNode([
      gateway,
      "--root",
      root,
      "dispatch-approved-outbox",
      "--dry-run",
      "--bridge-api-base",
      bridge.baseUrl,
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Dry-run dispatchaveis: 0/i);
    assert.doesNotMatch(result.stderr, /no such column/i);
    assert.equal(bridge.requests.length, 0);
    assert.ok(readOutboxColumns(root).includes("humanizer_pass"));
  } finally {
    await bridge.close();
  }
});

test("gateway migrates explicit CRM DB before dry-run dispatch", () => {
  const root = makeRoot();
  const customDb = join(root, "custom-freela.sqlite");
  assert.equal(runNode([crm, "--root", root, "--db", customDb, "init"]).status, 0);
  recreateLegacyWhatsappOutbox(root, customDb);
  assert.ok(!readOutboxColumns(root, customDb).includes("humanizer_pass"));

  const result = runNode([
    gateway,
    "--root",
    root,
    "dispatch-approved-outbox",
    "--crm-db",
    customDb,
    "--dry-run",
  ]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry-run dispatchaveis: 0/i);
  assert.ok(readOutboxColumns(root, customDb).includes("humanizer_pass"));
});

test("gateway dispatches approved outbox once through bridge api", async () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  const bridge = await withBridgeServer((req, res) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/api/send");
    const lockedDb = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
    const locked = lockedDb
      .prepare("select status, dispatch_locked_at from whatsapp_outbox order by id desc limit 1")
      .get();
    lockedDb.close();
    assert.equal(locked.status, "sending");
    assert.ok(locked.dispatch_locked_at);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message_id: "3EB0AABDF3A653A54BE7197D9935D44694A2EB5D" }));
  });
  try {
    const result = await runNodeAsync([
      gateway,
      "--root",
      root,
      "dispatch-approved-outbox",
      "--confirm-batch",
      "true",
      "--bridge-api-base",
      bridge.baseUrl,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Enviados: 1/i);
    assert.equal(bridge.requests.length, 1);
    assert.equal(bridge.requests[0].body.recipient, "5527999990000@s.whatsapp.net");
    assert.match(bridge.requests[0].body.message, /3 pontos/i);

    const { outbox, outbound, state } = readLatestDispatchAudit(root);
    assert.equal(outbox.status, "sent");
    assert.ok(outbox.sent_at);
    assert.equal(outbox.bridge_message_id, "3EB0AABDF3A653A54BE7197D9935D44694A2EB5D");
    assert.equal(outbound.length, 1);
    assert.equal(state.last_outbox_id, outbox.id);
  } finally {
    await bridge.close();
  }
});

test("gateway dispatches only the requested approved outbox id", async () => {
  const root = makeRoot();
  const firstOutboxId = seedApprovedOutbox(root, "001");
  const secondOutboxId = seedApprovedOutbox(root, "002");
  const bridge = await withBridgeServer((req, res) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/api/send");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message_id: "3EB0AABDF3A653A54BE7197D9935D44694A2EB5D" }));
  });
  try {
    const result = await runNodeAsync([
      gateway,
      "--root",
      root,
      "dispatch-approved-outbox",
      "--outbox-id",
      String(secondOutboxId),
      "--bridge-api-base",
      bridge.baseUrl,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Enviados: 1/i);
    assert.equal(bridge.requests.length, 1);

    const database = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
    const rows = database
      .prepare("select id, status, sent_at from whatsapp_outbox order by id")
      .all();
    database.close();

    assert.equal(rows.find((row) => row.id === firstOutboxId).status, "approved");
    assert.equal(rows.find((row) => row.id === firstOutboxId).sent_at, null);
    assert.equal(rows.find((row) => row.id === secondOutboxId).status, "sent");
    assert.ok(rows.find((row) => row.id === secondOutboxId).sent_at);
  } finally {
    await bridge.close();
  }
});

test("gateway dispatches approved outbox through WAHA without marking sent before delivery ack", async () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  updateLatestOutbox(root, "target_chat_id = ?", ["5527999990000@s.whatsapp.net"]);
  const waha = await withBridgeServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    if (req.method === "GET" && req.url === "/api/contacts/check-exists?phone=5527999990000&session=default") {
      res.end(JSON.stringify({ numberExists: true, chatId: "5527999990000@c.us" }));
      return;
    }
    if (req.method === "POST" && req.url === "/api/sendText") {
      res.end(JSON.stringify({ id: "true_5527999990000@c.us_3EB0WAHAPENDING" }));
      return;
    }
    res.end(JSON.stringify({ success: true }));
  });
  try {
    const result = await runNodeAsync([
      gateway,
      "--root",
      root,
      "dispatch-approved-outbox",
      "--provider",
      "waha",
      "--confirm-batch",
      "true",
      "--waha-api-base",
      waha.baseUrl,
      "--waha-session",
      "default",
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Enviados: 0/i);
    assert.match(result.stdout, /Pendentes: 1/i);

    assert.equal(waha.requests[0].method, "GET");
    assert.equal(waha.requests[0].url, "/api/contacts/check-exists?phone=5527999990000&session=default");
    assert.deepEqual(
      waha.requests.filter((request) => request.method === "POST").map((request) => request.url),
      ["/api/sendSeen", "/api/startTyping", "/api/stopTyping", "/api/sendText"],
    );
    const sendText = waha.requests.find((request) => request.url === "/api/sendText");
    assert.equal(sendText.body.session, "default");
    assert.equal(sendText.body.chatId, "5527999990000@c.us");
    assert.match(sendText.body.text, /3 pontos/i);

    const { outbox, outbound, state } = readLatestDispatchAudit(root);
    assert.equal(outbox.status, "delivery_pending");
    assert.equal(outbox.dispatch_provider, "waha");
    assert.equal(outbox.provider_message_id, "true_5527999990000@c.us_3EB0WAHAPENDING");
    assert.equal(outbox.bridge_message_id, null);
    assert.equal(outbox.sent_at, null);
    assert.equal(outbox.delivered_at, null);
    assert.equal(outbound.length, 0);
    assert.notEqual(state.whatsapp_state, "handoff_luiz");
  } finally {
    await waha.close();
  }
});

test("gateway dispatch loads WAHA API key from local env file", async () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  updateLatestOutbox(root, "target_chat_id = ?", ["5527999990000"]);
  writeFileSync(join(root, ".env"), "WAHA_API_KEY=local-waha-key\n");
  const childEnv = { ...process.env };
  delete childEnv.WAHA_API_KEY;
  delete childEnv.WHATSAPP_WAHA_API_KEY;

  const waha = await withBridgeServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    if (req.method === "GET" && req.url === "/api/contacts/check-exists?phone=5527999990000&session=default") {
      res.end(JSON.stringify({ numberExists: true, chatId: "5527999990000@c.us" }));
      return;
    }
    if (req.method === "POST" && req.url === "/api/sendText") {
      res.end(JSON.stringify({ id: "true_5527999990000@c.us_3EB0WAHAENV" }));
      return;
    }
    res.end(JSON.stringify({ success: true }));
  });
  try {
    const result = await runNodeAsync(
      [
        gateway,
        "--root",
        root,
        "dispatch-approved-outbox",
        "--provider",
        "waha",
        "--confirm-batch",
        "true",
        "--waha-api-base",
        waha.baseUrl,
        "--waha-session",
        "default",
      ],
      { env: childEnv },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Pendentes: 1/i);
    assert.equal(waha.requests[0].headers["x-api-key"], "local-waha-key");
    assert.equal(
      waha.requests.find((request) => request.url === "/api/sendText").headers["x-api-key"],
      "local-waha-key",
    );
  } finally {
    await waha.close();
  }
});

test("gateway uses WAHA-resolved LID when check-exists returns one for a real phone", async () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  updateLatestOutbox(root, "target_chat_id = ?", ["5527999990000"]);
  const waha = await withBridgeServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    if (req.method === "GET" && req.url === "/api/contacts/check-exists?phone=5527999990000&session=default") {
      res.end(JSON.stringify({ numberExists: true, chatId: "273478418722987@lid" }));
      return;
    }
    if (req.method === "POST" && req.url === "/api/sendText") {
      res.end(JSON.stringify({ id: "true_273478418722987@lid_3EB0WAHALIDPENDING" }));
      return;
    }
    res.end(JSON.stringify({ success: true }));
  });
  try {
    const result = await runNodeAsync([
      gateway,
      "--root",
      root,
      "dispatch-approved-outbox",
      "--provider",
      "waha",
      "--confirm-batch",
      "true",
      "--waha-api-base",
      waha.baseUrl,
      "--waha-session",
      "default",
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Enviados: 0/i);
    assert.match(result.stdout, /Pendentes: 1/i);

    const sendText = waha.requests.find((request) => request.url === "/api/sendText");
    assert.equal(sendText.body.chatId, "273478418722987@lid");

    const { outbox, state } = readLatestDispatchAudit(root);
    assert.equal(outbox.status, "delivery_pending");
    assert.equal(outbox.provider_message_id, "true_273478418722987@lid_3EB0WAHALIDPENDING");
    assert.notEqual(state.whatsapp_state, "handoff_luiz");
  } finally {
    await waha.close();
  }
});

test("gateway stores serialized WAHA object ids instead of object string", async () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  updateLatestOutbox(root, "target_chat_id = ?", ["5527999990000"]);
  const waha = await withBridgeServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    if (req.method === "GET" && req.url === "/api/contacts/check-exists?phone=5527999990000&session=default") {
      res.end(JSON.stringify({ numberExists: true, chatId: "273478418722987@lid" }));
      return;
    }
    if (req.method === "POST" && req.url === "/api/sendText") {
      res.end(
        JSON.stringify({
          id: {
            fromMe: true,
            remote: "273478418722987@lid",
            id: "3EB0WAHAOBJECTID",
            _serialized: "true_273478418722987@lid_3EB0WAHAOBJECTID",
          },
          ack: 0,
          ackName: "PENDING",
        }),
      );
      return;
    }
    res.end(JSON.stringify({ success: true }));
  });
  try {
    const result = await runNodeAsync([
      gateway,
      "--root",
      root,
      "dispatch-approved-outbox",
      "--provider",
      "waha",
      "--confirm-batch",
      "true",
      "--waha-api-base",
      waha.baseUrl,
      "--waha-session",
      "default",
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Pendentes: 1/i);

    const { outbox } = readLatestDispatchAudit(root);
    assert.equal(outbox.provider_message_id, "true_273478418722987@lid_3EB0WAHAOBJECTID");
    assert.notEqual(outbox.provider_message_id, "[object Object]");
  } finally {
    await waha.close();
  }
});

test("gateway marks WAHA outbox sent only after DEVICE ack event", async () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  updateLatestOutbox(root, "target_chat_id = ?", ["5527999990000@s.whatsapp.net"]);
  const waha = await withBridgeServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    if (req.method === "GET" && req.url === "/api/contacts/check-exists?phone=5527999990000&session=default") {
      res.end(JSON.stringify({ numberExists: true, chatId: "5527999990000@c.us" }));
      return;
    }
    if (req.method === "POST" && req.url === "/api/sendText") {
      res.end(JSON.stringify({ id: "true_5527999990000@c.us_3EB0WAHADEVICE" }));
      return;
    }
    res.end(JSON.stringify({ success: true }));
  });
  try {
    const dispatch = await runNodeAsync([
      gateway,
      "--root",
      root,
      "dispatch-approved-outbox",
      "--provider",
      "waha",
      "--confirm-batch",
      "true",
      "--waha-api-base",
      waha.baseUrl,
    ]);
    assert.equal(dispatch.status, 0, dispatch.stderr);

    const eventFile = join(root, "waha-ack.json");
    writeFileSync(
      eventFile,
      JSON.stringify({
        event: "message.ack",
        session: "default",
        payload: {
          id: "true_5527999990000@c.us_3EB0WAHADEVICE",
          ack: 2,
          ackName: "DEVICE",
        },
        timestamp: 1782043200000,
      }),
    );
    const ack = runNode([
      gateway,
      "--root",
      root,
      "import-waha-event",
      "--file",
      eventFile,
    ]);
    assert.equal(ack.status, 0, ack.stderr);
    assert.match(ack.stdout, /WAHA ack atualizado: 1/i);

    const { outbox, outbound, state } = readLatestDispatchAudit(root);
    assert.equal(outbox.status, "sent");
    assert.equal(outbox.dispatch_provider, "waha");
    assert.equal(outbox.delivery_ack, 2);
    assert.equal(outbox.delivery_ack_name, "DEVICE");
    assert.ok(outbox.sent_at);
    assert.ok(outbox.delivered_at);
    assert.equal(outbound.length, 1);
    assert.equal(state.last_outbox_id, outbox.id);
  } finally {
    await waha.close();
  }
});

test("gateway treats WAHA waiting event as ambiguous handoff", async () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  updateLatestOutbox(root, "target_chat_id = ?", ["5527999990000@s.whatsapp.net"]);
  const waha = await withBridgeServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    if (req.method === "GET" && req.url === "/api/contacts/check-exists?phone=5527999990000&session=default") {
      res.end(JSON.stringify({ numberExists: true, chatId: "5527999990000@c.us" }));
      return;
    }
    if (req.method === "POST" && req.url === "/api/sendText") {
      res.end(JSON.stringify({ id: "true_5527999990000@c.us_3EB0WAHAWAITING" }));
      return;
    }
    res.end(JSON.stringify({ success: true }));
  });
  try {
    const dispatch = await runNodeAsync([
      gateway,
      "--root",
      root,
      "dispatch-approved-outbox",
      "--provider",
      "waha",
      "--confirm-batch",
      "true",
      "--waha-api-base",
      waha.baseUrl,
    ]);
    assert.equal(dispatch.status, 0, dispatch.stderr);

    const eventFile = join(root, "waha-waiting.json");
    writeFileSync(
      eventFile,
      JSON.stringify({
        event: "message.waiting",
        session: "default",
        payload: {
          id: "true_5527999990000@c.us_3EB0WAHAWAITING",
        },
      }),
    );
    const waiting = runNode([
      gateway,
      "--root",
      root,
      "import-waha-event",
      "--file",
      eventFile,
    ]);
    assert.equal(waiting.status, 0, waiting.stderr);
    assert.match(waiting.stdout, /WAHA waiting atualizado: 1/i);

    const { outbox, outbound, state } = readLatestDispatchAudit(root);
    assert.equal(outbox.status, "dispatch_ambiguous");
    assert.equal(outbox.sent_at, null);
    assert.match(outbox.dispatch_error, /waiting|Aguardando mensagem/i);
    assert.equal(outbound.length, 0);
    assert.equal(state.whatsapp_state, "handoff_luiz");
    assert.match(state.handoff_reason, /WAHA|Aguardando mensagem|waiting/i);
  } finally {
    await waha.close();
  }
});

test("gateway bloqueia dispatch legado com destinatario LID antes de chamar bridge", async () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  updateLatestOutbox(root, "target_chat_id = ?", ["273478418722987@lid"]);
  const bridge = await withBridgeServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "bridge must not be called" }));
  });
  try {
    const result = await runNodeAsync([
      gateway,
      "--root",
      root,
      "dispatch-approved-outbox",
      "--confirm-batch",
      "true",
      "--bridge-api-base",
      bridge.baseUrl,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Falhas: 1/i);
    assert.equal(bridge.requests.length, 0);

    const { outbox, outbound, state } = readLatestDispatchAudit(root);
    assert.equal(outbox.status, "failed");
    assert.equal(outbox.attempts, 2);
    assert.equal(outbox.sent_at, null);
    assert.match(outbox.dispatch_error, /LID|telefone real/i);
    assert.equal(outbound.length, 0);
    assert.equal(state.whatsapp_state, "handoff_luiz");
    assert.match(state.handoff_reason, /LID|telefone real/i);
  } finally {
    await bridge.close();
  }
});

test("gateway treats bridge responses without explicit success true as ambiguous handoff", async () => {
  const cases = [
    { name: "missing success", body: "{}" },
    { name: "null success", body: JSON.stringify({ success: null, message: "maybe" }) },
    { name: "string false success", body: JSON.stringify({ success: "false", message: "maybe" }) },
    { name: "invalid json", body: "not-json" },
    { name: "empty body", body: "" },
  ];

  for (const current of cases) {
    const root = makeRoot();
    seedApprovedOutbox(root);
    const bridge = await withBridgeServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(current.body);
    });
    try {
      const result = await runNodeAsync([
        gateway,
        "--root",
        root,
        "dispatch-approved-outbox",
        "--confirm-batch",
        "true",
        "--bridge-api-base",
        bridge.baseUrl,
      ]);
      assert.equal(result.status, 0, `${current.name}\n${result.stderr}`);
      assert.match(result.stdout, /Falhas: 1/i, current.name);

      const { outbox, outbound, state } = readLatestDispatchAudit(root);
      assert.notEqual(outbox.status, "sent", current.name);
      assert.equal(outbox.status, "dispatch_ambiguous", current.name);
      assert.equal(outbox.sent_at, null, current.name);
      assert.equal(outbound.length, 0, current.name);
      assert.equal(state.whatsapp_state, "handoff_luiz", current.name);
      assert.match(state.handoff_reason, /confirmacao|ambigua/i, current.name);
    } finally {
      await bridge.close();
    }
  }
});

test("gateway treats generic bridge success without WhatsApp message id as ambiguous handoff", async () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  const bridge = await withBridgeServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "Message sent to 5527992635649" }));
  });
  try {
    const result = await runNodeAsync([
      gateway,
      "--root",
      root,
      "dispatch-approved-outbox",
      "--confirm-batch",
      "true",
      "--bridge-api-base",
      bridge.baseUrl,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Falhas: 1/i);

    const { outbox, outbound, state } = readLatestDispatchAudit(root);
    assert.equal(outbox.status, "dispatch_ambiguous");
    assert.equal(outbox.sent_at, null);
    assert.equal(outbound.length, 0);
    assert.equal(state.whatsapp_state, "handoff_luiz");
    assert.match(state.handoff_reason, /id real|confirmacao|ambigua/i);
  } finally {
    await bridge.close();
  }
});

test("gateway treats http 200 success false json as confirmed failed dispatch", async () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  const bridge = await withBridgeServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, message: "bridge down" }));
  });
  try {
    const result = await runNodeAsync([
      gateway,
      "--root",
      root,
      "dispatch-approved-outbox",
      "--confirm-batch",
      "true",
      "--bridge-api-base",
      bridge.baseUrl,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Falhas: 1/i);

    const { outbox, outbound, state } = readLatestDispatchAudit(root);
    assert.equal(outbox.status, "failed");
    assert.equal(outbox.attempts, 1);
    assert.equal(outbox.dispatch_error, "bridge down");
    assert.equal(outbox.sent_at, null);
    assert.equal(outbound.length, 0);
    assert.notEqual(state.whatsapp_state, "handoff_luiz");
  } finally {
    await bridge.close();
  }
});

test("gateway moves whatsapp lead to handoff after two confirmed dispatch failures", async () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  const bridge = await withBridgeServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, message: "bridge down" }));
  });
  try {
    const first = await runNodeAsync([
      gateway,
      "--root",
      root,
      "dispatch-approved-outbox",
      "--confirm-batch",
      "true",
      "--bridge-api-base",
      bridge.baseUrl,
    ]);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Falhas: 1/i);

    const firstAudit = readLatestDispatchAudit(root);
    assert.equal(firstAudit.outbox.status, "failed");
    assert.equal(firstAudit.outbox.attempts, 1);
    assert.equal(firstAudit.outbox.sent_at, null);
    assert.notEqual(firstAudit.state.whatsapp_state, "handoff_luiz");

    const second = await runNodeAsync([
      gateway,
      "--root",
      root,
      "dispatch-approved-outbox",
      "--confirm-batch",
      "true",
      "--bridge-api-base",
      bridge.baseUrl,
    ]);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /Falhas: 1/i);
    assert.equal(bridge.requests.length, 2);

    const secondAudit = readLatestDispatchAudit(root);
    assert.equal(secondAudit.outbox.status, "failed");
    assert.equal(secondAudit.outbox.attempts, 2);
    assert.equal(secondAudit.outbox.sent_at, null);
    assert.equal(secondAudit.state.whatsapp_state, "handoff_luiz");
    assert.match(secondAudit.state.handoff_reason, /falha no envio/i);
  } finally {
    await bridge.close();
  }
});

test("gateway treats http 500 success false json as ambiguous handoff", async () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  const bridge = await withBridgeServer((_req, res) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, message: "bridge down" }));
  });
  try {
    const result = await runNodeAsync([
      gateway,
      "--root",
      root,
      "dispatch-approved-outbox",
      "--confirm-batch",
      "true",
      "--bridge-api-base",
      bridge.baseUrl,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Falhas: 1/i);

    const { outbox, outbound, state } = readLatestDispatchAudit(root);
    assert.equal(outbox.status, "dispatch_ambiguous");
    assert.equal(outbox.sent_at, null);
    assert.equal(outbound.length, 0);
    assert.equal(state.whatsapp_state, "handoff_luiz");
    assert.match(state.handoff_reason, /HTTP 500|confirmacao|ambigua/i);
  } finally {
    await bridge.close();
  }
});

test("gateway treats http 500 empty body as ambiguous handoff", async () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  const bridge = await withBridgeServer((_req, res) => {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("");
  });
  try {
    const result = await runNodeAsync([
      gateway,
      "--root",
      root,
      "dispatch-approved-outbox",
      "--confirm-batch",
      "true",
      "--bridge-api-base",
      bridge.baseUrl,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Falhas: 1/i);

    const { outbox, outbound, state } = readLatestDispatchAudit(root);
    assert.equal(outbox.status, "dispatch_ambiguous");
    assert.equal(outbox.sent_at, null);
    assert.equal(outbound.length, 0);
    assert.equal(state.whatsapp_state, "handoff_luiz");
    assert.match(state.handoff_reason, /confirmacao|ambigua/i);
  } finally {
    await bridge.close();
  }
});

test("gateway does not automatically retry ambiguous dispatches", async () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  const bridge = await withBridgeServer((_req, res) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, message: "bridge down" }));
  });
  try {
    const first = await runNodeAsync([
      gateway,
      "--root",
      root,
      "dispatch-approved-outbox",
      "--confirm-batch",
      "true",
      "--bridge-api-base",
      bridge.baseUrl,
    ]);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Falhas: 1/i);

    const second = await runNodeAsync([
      gateway,
      "--root",
      root,
      "dispatch-approved-outbox",
      "--confirm-batch",
      "true",
      "--bridge-api-base",
      bridge.baseUrl,
    ]);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /Falhas: 0/i);
    assert.equal(bridge.requests.length, 1);

    const { outbox, state } = readLatestDispatchAudit(root);
    assert.equal(outbox.status, "dispatch_ambiguous");
    assert.equal(outbox.attempts, 1);
    assert.equal(state.whatsapp_state, "handoff_luiz");
  } finally {
    await bridge.close();
  }
});

test("gateway rejects invalid timeout before locking outbox", () => {
  const root = makeRoot();
  seedApprovedOutbox(root);

  const result = runNode([
    gateway,
    "--root",
    root,
    "dispatch-approved-outbox",
    "--confirm-batch",
    "true",
    "--bridge-api-base",
    "http://127.0.0.1:9",
    "--timeout-ms",
    "nope",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--timeout-ms deve ser inteiro positivo/i);

  const outbox = readLatestOutbox(root);
  assert.equal(outbox.status, "approved");
  assert.equal(outbox.dispatch_locked_at, null);
});

test("gateway rejects timeout with numeric prefix before locking outbox", () => {
  const root = makeRoot();
  seedApprovedOutbox(root);

  const result = runNode([
    gateway,
    "--root",
    root,
    "dispatch-approved-outbox",
    "--confirm-batch",
    "true",
    "--bridge-api-base",
    "http://127.0.0.1:9",
    "--timeout-ms",
    "1000abc",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--timeout-ms deve ser inteiro positivo/i);

  const outbox = readLatestOutbox(root);
  assert.equal(outbox.status, "approved");
  assert.equal(outbox.dispatch_locked_at, null);
});

test("gateway rejects limit with numeric prefix in dry-run without mutating outbox", () => {
  const root = makeRoot();
  seedApprovedOutbox(root);

  const result = runNode([
    gateway,
    "--root",
    root,
    "dispatch-approved-outbox",
    "--limit",
    "1abc",
    "--dry-run",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--limit deve ser inteiro positivo/i);

  const outbox = readLatestOutbox(root);
  assert.equal(outbox.status, "approved");
  assert.equal(outbox.dispatch_locked_at, null);
});

test("gateway rejects invalid bridge base before locking outbox", () => {
  const root = makeRoot();
  seedApprovedOutbox(root);

  const result = runNode([
    gateway,
    "--root",
    root,
    "dispatch-approved-outbox",
    "--confirm-batch",
    "true",
    "--bridge-api-base",
    "http://[::1",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /bridge-api-base/i);

  const outbox = readLatestOutbox(root);
  assert.equal(outbox.status, "approved");
  assert.equal(outbox.dispatch_locked_at, null);
});

test("gateway lock rechecks lead conversation state before dispatch", () => {
  const source = readFileSync(gateway, "utf8");
  const lockFunction = source.match(/function lockOutboxForDispatch[\s\S]+?\n}\n/)[0];
  assert.match(lockFunction, /lead_conversation_state/i);
  assert.match(lockFunction, /handoff_luiz/);
  assert.match(lockFunction, /bloqueado_guardiao/);
  assert.match(lockFunction, /encerrado/);
});

test("gateway exposes WAHA webhook monitor and rejects removed MCP commands", () => {
  const source = readFileSync(gateway, "utf8");

  assert.match(source, /serve-waha-webhook/i);
  assert.match(source, /\/waha\/webhook/i);
  assert.match(source, /importWahaInboundEvent|eventFromWahaMessage/i);
  assert.match(source, /dispatch-approved-outbox/i);
  assert.doesNotMatch(source, /import-mcp-sqlite|watch-mcp-sqlite|whatsapp-mcp|WHATSAPP_MCP/i);

  for (const command of ["import-mcp-sqlite", "watch-mcp-sqlite"]) {
    const result = runNode([gateway, "--root", makeRoot(), command]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(`Comando desconhecido: ${command}`));
  }
});

test("WAHA webhook monitor imports inbound events without dispatching approved outbox", async () => {
  const root = makeRoot();
  const port = await getFreePort();
  seedApprovedOutbox(root);
  const bridge = await withBridgeServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "sent-by-test-bridge" }));
  });
  const server = await startNodeUntilStdout(
    [
      gateway,
      "--root",
      root,
      "serve-waha-webhook",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    /Observando WAHA webhook/i,
  );

  try {
    const response = await postJson(`http://127.0.0.1:${port}/waha/webhook`, {
      event: "message",
      session: "default",
      payload: {
        id: "false_5527999990000@c.us_3EB0WAHAWEBHOOK",
        from: "5527999990000@c.us",
        fromMe: false,
        type: "chat",
        body: "Pode!",
        notifyName: "Aghata Massoterapia",
        timestamp: 1782051829,
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.result.imported, 1);
    assert.equal(bridge.requests.length, 0);

    const outbox = readLatestOutbox(root);
    assert.equal(outbox.status, "approved");
    assert.equal(outbox.sent_at, null);

    const database = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
    const inbound = database.prepare("select * from whatsapp_inbound_events order by id desc limit 1").get();
    database.close();
    assert.equal(inbound.bridge_message_id, "false_5527999990000@c.us_3EB0WAHAWEBHOOK");
    assert.equal(inbound.chat_id, "5527999990000@c.us");
    assert.equal(inbound.sender_phone, "5527999990000");
    assert.equal(inbound.message_type, "text");
    assert.equal(inbound.body, "Pode!");
    assert.equal(JSON.parse(inbound.raw_json).source, "waha/webhook");

    const auditFile = join(root, ".scratch/whatsapp/waha-webhook-events.jsonl");
    assert.equal(existsSync(auditFile), true);
    const auditEntry = JSON.parse(readFileSync(auditFile, "utf8").trim().split("\n").at(-1));
    assert.equal(auditEntry.event, "message");
    assert.equal(auditEntry.result.imported, 1);
    assert.equal(auditEntry.result.failed, 0);
    assert.equal(auditEntry.messageId, "false_5527999990000@c.us_3EB0WAHAWEBHOOK");
  } finally {
    await stopChild(server.child);
    await bridge.close();
  }
});

test("WAHA webhook monitor rejects non-loopback hosts", async () => {
  const root = makeRoot();
  const port = await getFreePort();

  const result = await runNodeUntilOutput(
    [
      gateway,
      "--root",
      root,
      "serve-waha-webhook",
      "--host",
      "0.0.0.0",
      "--port",
      String(port),
    ],
    /--host deve usar loopback/i,
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--host deve usar loopback/i);
});

test("WAHA webhook monitor rejects Docker-facing host even with webhook secret", async () => {
  const root = makeRoot();
  const port = await getFreePort();

  const result = await runNodeUntilOutput(
    [
      gateway,
      "--root",
      root,
      "serve-waha-webhook",
      "--host",
      "0.0.0.0",
      "--port",
      String(port),
      "--webhook-secret",
      "local-secret",
    ],
    /--host deve usar loopback/i,
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--host deve usar loopback/i);
});

test("gateway rejects unknown dispatch flags without mutating outbox", () => {
  const root = makeRoot();
  seedApprovedOutbox(root);

  const result = runNode([gateway, "--root", root, "dispatch-approved-outbox", "--dryrun"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Opcao desconhecida para dispatch-approved-outbox: --dryrun/i);

  const outbox = readLatestOutbox(root);
  assert.equal(outbox.status, "approved");
  assert.equal(outbox.sent_at, null);
});

test("gateway rejects invalid dry-run boolean without mutating outbox", () => {
  const root = makeRoot();
  seedApprovedOutbox(root);

  const result = runNode([
    gateway,
    "--root",
    root,
    "dispatch-approved-outbox",
    "--dry-run",
    "tru",
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Valor booleano invalido: tru/i);

  const outbox = readLatestOutbox(root);
  assert.equal(outbox.status, "approved");
  assert.equal(outbox.sent_at, null);
});

test("gateway dry-run skips outbox without humanizer pass", () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  updateLatestOutbox(root, "humanizer_pass = 0");

  assertDryRunDispatchableCount(root, 0);
});

test("gateway dry-run skips blocked guardian decisions", () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  updateLatestOutbox(root, "status = 'blocked', guardian_decision = 'bloquear'");

  assertDryRunDispatchableCount(root, 0);
});

test("gateway dry-run skips already sent outbox", () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  updateLatestOutbox(root, "sent_at = ?", ["2026-06-21T12:00:00-03:00"]);

  assertDryRunDispatchableCount(root, 0);
});

test("gateway dry-run skips outbox without lead conversation state", () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  deleteLatestLeadState(root);

  assertDryRunDispatchableCount(root, 0);
});

test("gateway dry-run skips leads in handoff", () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  updateLatestLeadState(root, "handoff_luiz");

  assertDryRunDispatchableCount(root, 0);
});

test("gateway dry-run skips leads blocked by guardian state", () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  updateLatestLeadState(root, "bloqueado_guardiao");

  assertDryRunDispatchableCount(root, 0);
});

test("gateway dry-run skips closed conversations", () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  updateLatestLeadState(root, "encerrado");

  assertDryRunDispatchableCount(root, 0);
});

test("gateway importa eventos inbound WAHA e registra desconhecidos sem duplicar envio", () => {
  const root = makeRoot();
  assert.equal(runNode([crm, "--root", root, "init"]).status, 0);
  const leadFile = join(root, "lead.json");
  writeFileSync(
    leadFile,
    JSON.stringify([
      {
        canonical_name: "Aghata Massoterapia",
        phone_or_contact: "+55 27 99999-0000",
        recommended_offer: "Presenca Local em 72h",
      },
    ]),
  );
  assert.equal(runNode([crm, "--root", root, "lead", "upsert", "--file", leadFile]).status, 0);

  const inboundFile = join(root, "waha-inbound.json");
  writeFileSync(
    inboundFile,
    JSON.stringify({
      event: "message",
      session: "default",
      payload: {
        _data: {
          id: {
            _serialized: "false_5527999990000@c.us_3EB0WAHAINBOUND",
          },
        },
        from: "5527999990000@c.us",
        fromMe: false,
        body: "Pode sim",
        notifyName: "Aghata Massoterapia",
        timestamp: "2026-06-19T10:01:00-03:00",
      },
    }),
  );
  const outboundFile = join(root, "waha-outbound.json");
  writeFileSync(
    outboundFile,
    JSON.stringify({
      event: "message",
      session: "default",
      payload: {
        id: "true_5527999990000@c.us_3EB0WAHAOUTBOUND",
        from: "5527999990000@c.us",
        fromMe: true,
        body: "Mensagem enviada por mim",
        timestamp: "2026-06-19T10:02:00-03:00",
      },
    }),
  );
  const unknownFile = join(root, "waha-unknown.json");
  writeFileSync(
    unknownFile,
    JSON.stringify({
      event: "message",
      session: "default",
      payload: {
        id: "false_5527991112222@c.us_3EB0WAHAUNKNOWN",
        from: "5527991112222@c.us",
        fromMe: false,
        body: "Oi, tudo bem?",
        notifyName: "Contato fora do CRM",
        timestamp: "2026-06-19T10:03:00-03:00",
      },
    }),
  );
  const statusBroadcastFile = join(root, "waha-status-broadcast.json");
  writeFileSync(
    statusBroadcastFile,
    JSON.stringify({
      event: "message",
      session: "default",
      payload: {
        id: "false_status@broadcast_3EB0WAHASTATUS_273478418722987@lid",
        from: "status@broadcast",
        chatId: "status@broadcast",
        fromMe: false,
        body: "Atualizacao de status",
        type: "image",
        timestamp: "2026-06-19T10:04:00-03:00",
      },
    }),
  );

  const first = runNode([gateway, "--root", root, "import-waha-event", "--file", inboundFile]);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Importados: 1/i);
  assert.match(first.stdout, /Falhas: 0/i);

  const skipped = runNode([gateway, "--root", root, "import-waha-event", "--file", outboundFile]);
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.match(skipped.stdout, /Ignorados: 1/i);

  const unknown = runNode([gateway, "--root", root, "import-waha-event", "--file", unknownFile]);
  assert.equal(unknown.status, 0, unknown.stderr);
  assert.match(unknown.stdout, /Sem identidade: 1/i);

  const statusBroadcast = runNode([
    gateway,
    "--root",
    root,
    "import-waha-event",
    "--file",
    statusBroadcastFile,
  ]);
  assert.equal(statusBroadcast.status, 0, statusBroadcast.stderr);
  assert.match(statusBroadcast.stdout, /Ignorados: 1/i);
  assert.match(statusBroadcast.stdout, /Falhas: 0/i);

  const second = runNode([gateway, "--root", root, "import-waha-event", "--file", inboundFile]);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Importados: 0/i);

  const crmDb = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  const inbound = crmDb.prepare("select * from whatsapp_inbound_events").all();
  assert.equal(inbound.length, 1);
  assert.equal(inbound[0].bridge_message_id, "false_5527999990000@c.us_3EB0WAHAINBOUND");
  assert.equal(inbound[0].chat_id, "5527999990000@c.us");
  assert.equal(inbound[0].sender_phone, "5527999990000");
  assert.equal(inbound[0].body, "Pode sim");
  assert.equal(JSON.parse(inbound[0].raw_json).source, "waha/webhook");
  const unmatched = crmDb.prepare("select * from whatsapp_unmatched_inbound_events").all();
  assert.equal(unmatched.length, 1);
  assert.equal(unmatched[0].bridge_message_id, "false_5527991112222@c.us_3EB0WAHAUNKNOWN");
  assert.equal(unmatched[0].status, "unmatched");
  assert.equal(unmatched[0].classification, "resposta_recebida");
  crmDb.close();

  const errorFiles = readdirSync(join(root, ".scratch")).filter((file) =>
    file.endsWith(".error.txt"),
  );
  assert.deepEqual(errorFiles, []);
  assert.equal(
    existsSync(
      join(root, ".scratch/whatsapp-inbound-false-5527991112222-c.us-3EB0WAHAUNKNOWN.json"),
    ),
    false,
  );

  const source = readFileSync(gateway, "utf8");
  assert.match(source, /waha\/webhook/i);
  assert.doesNotMatch(source, /send_message|send_file|send_audio_message/i);
});

test("gateway auto-wake cria task Paperclip para inbound Pode e resposta comum sem duplicar envio", async () => {
  const root = makeRoot();
  assert.equal(runNode([crm, "--root", root, "init"]).status, 0);
  const leadFile = join(root, "lead.json");
  writeFileSync(
    leadFile,
    JSON.stringify([
      {
        canonical_name: "Aghata Massoterapia",
        phone_or_contact: "+55 27 99999-0000",
        recommended_offer: "Presenca Local em 72h",
      },
    ]),
  );
  assert.equal(runNode([crm, "--root", root, "lead", "upsert", "--file", leadFile]).status, 0);

  const firstInboundFile = join(root, "waha-auto-001.json");
  writeFileSync(
    firstInboundFile,
    JSON.stringify({
      event: "message",
      session: "default",
      payload: {
        id: "false_5527999990000@c.us_3EB0WAHAAUTO001",
        from: "5527999990000@c.us",
        fromMe: false,
        body: "Pode!",
        notifyName: "Aghata Massoterapia",
        timestamp: "2026-06-21T09:32:27-03:00",
      },
    }),
  );

  const paperclip = await withPaperclipServer((req, res) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/api/companies/company-test/issues");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "issue-test-1", identifier: "FRE-TEST-1" }));
  });

  try {
    const result = await runNodeAsync([
      gateway,
      "--root",
      root,
      "import-waha-event",
      "--file",
      firstInboundFile,
      "--auto-wake",
      "--paperclip-api-base",
      paperclip.baseUrl,
      "--paperclip-company-id",
      "company-test",
      "--atendimento-agent-id",
      "agent-atendimento-test",
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Importados: 1/i);
    assert.match(result.stdout, /Auto-wakes: 1/i);
    assert.equal(paperclip.requests.length, 1);
    assert.equal(paperclip.requests[0].body.assigneeAgentId, "agent-atendimento-test");
    assert.match(paperclip.requests[0].body.title, /WhatsApp.*Aghata Massoterapia/i);
    assert.match(paperclip.requests[0].body.description, /ultimo inbound WhatsApp/i);
    assert.match(paperclip.requests[0].body.description, /Nao envie WhatsApp|Nao chame bridge/i);

    const database = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
    const wake = database.prepare("select * from whatsapp_worker_wakes").get();
    assert.equal(wake.paperclip_issue_id, "issue-test-1");
    assert.equal(wake.paperclip_issue_identifier, "FRE-TEST-1");
    assert.equal(wake.status, "created");
    assert.equal(database.prepare("select count(*) as count from whatsapp_outbox").get().count, 0);
    database.close();

    const secondInboundFile = join(root, "waha-auto-002.json");
    writeFileSync(
      secondInboundFile,
      JSON.stringify({
        event: "message",
        session: "default",
        payload: {
          id: "false_5527999990000@c.us_3EB0WAHAAUTO002",
          from: "5527999990000@c.us",
          fromMe: false,
          body: "Oi, tudo bem?",
          notifyName: "Aghata Massoterapia",
          timestamp: "2026-06-21T09:33:27-03:00",
        },
      }),
    );

    const generic = await runNodeAsync([
      gateway,
      "--root",
      root,
      "import-waha-event",
      "--file",
      secondInboundFile,
      "--auto-wake",
      "--paperclip-api-base",
      paperclip.baseUrl,
      "--paperclip-company-id",
      "company-test",
      "--atendimento-agent-id",
      "agent-atendimento-test",
    ]);

    assert.equal(generic.status, 0, generic.stderr);
    assert.match(generic.stdout, /Importados: 1/i);
    assert.match(generic.stdout, /Auto-wakes: 1/i);
    assert.equal(paperclip.requests.length, 2);

    const afterGeneric = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
    const genericInbound = afterGeneric
      .prepare("select * from whatsapp_inbound_events where bridge_message_id = ?")
      .get("false_5527999990000@c.us_3EB0WAHAAUTO002");
    assert.equal(genericInbound.classification, "resposta_recebida");
    assert.equal(afterGeneric.prepare("select count(*) as count from whatsapp_worker_wakes").get().count, 2);
    assert.equal(afterGeneric.prepare("select count(*) as count from whatsapp_outbox").get().count, 0);
    afterGeneric.close();
  } finally {
    await paperclip.close();
  }
});

test("gateway auto-wake cria task Paperclip para resposta sem interesse sem propor envio", async () => {
  const root = makeRoot();
  assert.equal(runNode([crm, "--root", root, "init"]).status, 0);
  const leadFile = join(root, "lead.json");
  writeFileSync(
    leadFile,
    JSON.stringify([
      {
        canonical_name: "Espaço Viver Pilates Sabrina Cecato",
        phone_or_contact: "+55 27 99878-8631",
        recommended_offer: "Presenca Local em 72h",
      },
    ]),
  );
  assert.equal(runNode([crm, "--root", root, "lead", "upsert", "--file", leadFile]).status, 0);

  const inboundFile = join(root, "waha-no-interest.json");
  writeFileSync(
    inboundFile,
    JSON.stringify({
      event: "message",
      session: "default",
      payload: {
        id: "false_5527998788631@c.us_3EB0WAHANOINTEREST",
        from: "5527998788631@c.us",
        fromMe: false,
        body: "No momento o Studio não tem interesse. Obrigada!",
        notifyName: "Espaço Viver Pilates",
        timestamp: "2026-06-22T19:21:23-03:00",
      },
    }),
  );

  const paperclip = await withPaperclipServer((req, res) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/api/companies/company-test/issues");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "issue-no-interest-1", identifier: "FRE-NO-INTEREST-1" }));
  });

  try {
    const result = await runNodeAsync([
      gateway,
      "--root",
      root,
      "import-waha-event",
      "--file",
      inboundFile,
      "--auto-wake",
      "--paperclip-api-base",
      paperclip.baseUrl,
      "--paperclip-company-id",
      "company-test",
      "--atendimento-agent-id",
      "agent-atendimento-test",
    ]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Importados: 1/i);
    assert.match(result.stdout, /Auto-wakes: 1/i);
    assert.equal(paperclip.requests.length, 1);
    assert.equal(paperclip.requests[0].body.assigneeAgentId, "agent-atendimento-test");
    assert.equal(paperclip.requests[0].body.priority, "medium");
    assert.match(paperclip.requests[0].body.title, /sem interesse/i);
    assert.match(paperclip.requests[0].body.description, /Encerramento WhatsApp/i);
    assert.match(paperclip.requests[0].body.description, /Nao criar Outbox por padrao/i);
    assert.match(paperclip.requests[0].body.description, /Nao envie WhatsApp|Nao chame bridge/i);

    const database = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
    const inbound = database.prepare("select * from whatsapp_inbound_events").get();
    const state = database.prepare("select * from lead_conversation_state").get();
    const wake = database.prepare("select * from whatsapp_worker_wakes").get();
    assert.equal(inbound.classification, "resposta_sem_interesse");
    assert.equal(state.whatsapp_state, "encerrado");
    assert.equal(wake.wake_type, "whatsapp_no_interest");
    assert.equal(wake.paperclip_issue_identifier, "FRE-NO-INTEREST-1");
    assert.equal(database.prepare("select count(*) as count from whatsapp_outbox").get().count, 0);
    database.close();
  } finally {
    await paperclip.close();
  }
});

test("gateway auto-wake deduplica mensagens sequenciais do mesmo chat em janela curta", async () => {
  const root = makeRoot();
  assert.equal(runNode([crm, "--root", root, "init"]).status, 0);
  const leadFile = join(root, "lead.json");
  writeFileSync(
    leadFile,
    JSON.stringify([
      {
        canonical_name: "Espaco Marilsa Gama",
        phone_or_contact: "+55 27 99999-0000",
        recommended_offer: "Presenca Local em 72h",
      },
    ]),
  );
  assert.equal(runNode([crm, "--root", root, "lead", "upsert", "--file", leadFile]).status, 0);

  const firstInboundFile = join(root, "waha-auto-burst-001.json");
  writeFileSync(
    firstInboundFile,
    JSON.stringify({
      event: "message",
      session: "default",
      payload: {
        id: "false_5527999990000@c.us_3EB0WAHABURST001",
        from: "5527999990000@c.us",
        fromMe: false,
        body: "Boa noite",
        notifyName: "Espaco Marilsa Gama",
        timestamp: "2026-06-21T09:32:27-03:00",
      },
    }),
  );
  const secondInboundFile = join(root, "waha-auto-burst-002.json");
  writeFileSync(
    secondInboundFile,
    JSON.stringify({
      event: "message",
      session: "default",
      payload: {
        id: "false_5527999990000@c.us_3EB0WAHABURST002",
        from: "5527999990000@c.us",
        fromMe: false,
        body: "Sim",
        notifyName: "Espaco Marilsa Gama",
        timestamp: "2026-06-21T09:32:29-03:00",
      },
    }),
  );

  const paperclip = await withPaperclipServer((_req, res, requests) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: `issue-test-${requests.length}`, identifier: `FRE-TEST-${requests.length}` }));
  });

  try {
    const commonArgs = [
      "--auto-wake",
      "--paperclip-api-base",
      paperclip.baseUrl,
      "--paperclip-company-id",
      "company-test",
      "--atendimento-agent-id",
      "agent-atendimento-test",
    ];
    const first = await runNodeAsync([
      gateway,
      "--root",
      root,
      "import-waha-event",
      "--file",
      firstInboundFile,
      ...commonArgs,
    ]);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /Auto-wakes: 1/i);

    const second = await runNodeAsync([
      gateway,
      "--root",
      root,
      "import-waha-event",
      "--file",
      secondInboundFile,
      ...commonArgs,
    ]);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /Auto-wakes: 0/i);
    assert.equal(paperclip.requests.length, 1);

    const database = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
    const wakes = database
      .prepare(
        `select inbound_event_id, paperclip_issue_id, paperclip_issue_identifier, status
         from whatsapp_worker_wakes
         order by inbound_event_id`,
      )
      .all()
      .map((row) => ({ ...row }));
    database.close();

    assert.deepEqual(wakes, [
      {
        inbound_event_id: 1,
        paperclip_issue_id: "issue-test-1",
        paperclip_issue_identifier: "FRE-TEST-1",
        status: "created",
      },
      {
        inbound_event_id: 2,
        paperclip_issue_id: "issue-test-1",
        paperclip_issue_identifier: "FRE-TEST-1",
        status: "created",
      },
    ]);
  } finally {
    await paperclip.close();
  }
});

test("gateway wake-reconciled-inbound agrupa eventos reconciliados do mesmo chat em uma issue", async () => {
  const root = makeRoot();
  assert.equal(runNode([crm, "--root", root, "init"]).status, 0);
  const leadFile = join(root, "lead.json");
  writeFileSync(
    leadFile,
    JSON.stringify([
      {
        canonical_name: "Ana Claudia Santos Matos Esteticista",
        phone_or_contact: "+55 27 99747-6383",
        recommended_offer: "Presenca Local em 72h",
      },
    ]),
  );
  assert.equal(runNode([crm, "--root", root, "lead", "upsert", "--file", leadFile]).status, 0);
  assert.equal(
    runNode([
      crm,
      "--root",
      root,
      "whatsapp",
      "identity",
      "link",
      "--name",
      "Ana Claudia Santos Matos Esteticista",
      "--identity",
      "56405973332127@lid",
    ]).status,
    0,
  );

  for (const [index, event] of [
    {
      bridge_message_id: "lid-wake-001",
      chat_id: "56405973332127@lid",
      sender_name: "medmaisvitoria",
      sender_phone: "56405973332127",
      is_group: false,
      message_type: "text",
      body: "Boa noite. ela ja tem uma pessoa nessa area",
      received_at: "2026-06-22T20:45:52.000Z",
    },
    {
      bridge_message_id: "lid-wake-002",
      chat_id: "56405973332127@lid",
      sender_name: "medmaisvitoria",
      sender_phone: "56405973332127",
      is_group: false,
      message_type: "text",
      body: "obrigada",
      received_at: "2026-06-22T20:45:54.000Z",
    },
  ].entries()) {
    const file = join(root, `inbound-${index}.json`);
    writeFileSync(file, JSON.stringify(event));
    const ingest = runNode([crm, "--root", root, "whatsapp", "inbound", "ingest", "--file", file]);
    assert.equal(ingest.status, 0, ingest.stderr);
    assert.match(ingest.stdout, /WhatsApp inbound registrado/i);
  }

  const paperclip = await withPaperclipServer((req, res, requests) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/api/companies/company-test/issues");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: `issue-group-${requests.length}`, identifier: `FRE-GROUP-${requests.length}` }));
  });

  try {
    const result = await runNodeAsync([
      gateway,
      "--root",
      root,
      "wake-reconciled-inbound",
      "--chat-id",
      "56405973332127@lid",
      "--paperclip-api-base",
      paperclip.baseUrl,
      "--paperclip-company-id",
      "company-test",
      "--atendimento-agent-id",
      "agent-atendimento-test",
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Issues criadas: 1/i);
    assert.match(result.stdout, /Eventos acordados: 2/i);
    assert.equal(paperclip.requests.length, 1);
    assert.equal(paperclip.requests[0].body.assigneeAgentId, "agent-atendimento-test");
    assert.match(paperclip.requests[0].body.title, /Ana Claudia Santos Matos/i);
    assert.match(paperclip.requests[0].body.description, /inbound_event_ids: 1, 2/i);
    assert.match(paperclip.requests[0].body.description, /Boa noite/i);
    assert.match(paperclip.requests[0].body.description, /obrigada/i);
    assert.doesNotMatch(JSON.stringify(paperclip.requests[0].body), /sendText|send_message/i);

    const database = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
    const wakes = database
      .prepare("select inbound_event_id, paperclip_issue_id, paperclip_issue_identifier, status from whatsapp_worker_wakes order by inbound_event_id")
      .all()
      .map((row) => ({ ...row }));
    assert.deepEqual(wakes, [
      {
        inbound_event_id: 1,
        paperclip_issue_id: "issue-group-1",
        paperclip_issue_identifier: "FRE-GROUP-1",
        status: "created",
      },
      {
        inbound_event_id: 2,
        paperclip_issue_id: "issue-group-1",
        paperclip_issue_identifier: "FRE-GROUP-1",
        status: "created",
      },
    ]);
    database.close();

    const again = await runNodeAsync([
      gateway,
      "--root",
      root,
      "wake-reconciled-inbound",
      "--chat-id",
      "56405973332127@lid",
      "--paperclip-api-base",
      paperclip.baseUrl,
      "--paperclip-company-id",
      "company-test",
      "--atendimento-agent-id",
      "agent-atendimento-test",
    ]);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /Issues criadas: 0/i);
    assert.match(again.stdout, /Eventos acordados: 0/i);
    assert.equal(paperclip.requests.length, 1);
  } finally {
    await paperclip.close();
  }
});

test("gateway auto-wake roteia preco e lead quente para Jhon Snow", async () => {
  const root = makeRoot();
  assert.equal(runNode([crm, "--root", root, "init"]).status, 0);
  const leadFile = join(root, "lead.json");
  writeFileSync(
    leadFile,
    JSON.stringify([
      {
        canonical_name: "Aghata Massoterapia",
        phone_or_contact: "+55 27 99999-0000",
        recommended_offer: "Presenca Local em 72h",
      },
    ]),
  );
  assert.equal(runNode([crm, "--root", root, "lead", "upsert", "--file", leadFile]).status, 0);

  const priceFile = join(root, "waha-price.json");
  writeFileSync(
    priceFile,
    JSON.stringify({
      event: "message",
      session: "default",
      payload: {
        id: "false_5527999990000@c.us_3EB0WAHAPRICE",
        from: "5527999990000@c.us",
        fromMe: false,
        body: "Qual o valor?",
        notifyName: "Aghata Massoterapia",
        timestamp: "2026-06-21T09:35:27-03:00",
      },
    }),
  );
  const hotFile = join(root, "waha-hot.json");
  writeFileSync(
    hotFile,
    JSON.stringify({
      event: "message",
      session: "default",
      payload: {
        id: "false_5527999990000@c.us_3EB0WAHAHOT",
        from: "5527999990000@c.us",
        fromMe: false,
        body: "Gostei, quero fazer. Como contrato?",
        notifyName: "Aghata Massoterapia",
        timestamp: "2026-06-21T09:36:27-03:00",
      },
    }),
  );

  const paperclip = await withPaperclipServer((_req, res, requests) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: `issue-test-${requests.length}`, identifier: `FRE-TEST-${requests.length}` }));
  });

  try {
    for (const file of [priceFile, hotFile]) {
      const result = await runNodeAsync([
        gateway,
        "--root",
        root,
        "import-waha-event",
        "--file",
        file,
        "--auto-wake",
        "--paperclip-api-base",
        paperclip.baseUrl,
        "--paperclip-company-id",
        "company-test",
        "--atendimento-agent-id",
        "agent-atendimento-test",
        "--closer-agent-id",
        "agent-jhon-test",
      ]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Importados: 1/i);
      assert.match(result.stdout, /Auto-wakes: 1/i);
    }

    assert.equal(paperclip.requests.length, 2);
    assert.deepEqual(
      paperclip.requests.map((request) => request.body.assigneeAgentId),
      ["agent-jhon-test", "agent-jhon-test"],
    );
    assert.match(paperclip.requests[0].body.description, /Jhon Snow|Atendimento e Fechamento/i);
    assert.match(paperclip.requests[0].body.description, /preco|preço|valor/i);
    assert.match(paperclip.requests[1].body.title, /lead quente|fechamento|WhatsApp/i);

    const database = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
    const inbound = database
      .prepare("select classification from whatsapp_inbound_events order by received_at, id")
      .all()
      .map((row) => row.classification);
    const state = database.prepare("select * from lead_conversation_state").get();
    const wakes = database
      .prepare("select target_agent_id, wake_type from whatsapp_worker_wakes order by id")
      .all()
      .map((row) => ({ ...row }));
    database.close();

    assert.deepEqual(inbound, ["resposta_pediu_preco", "resposta_lead_quente"]);
    assert.equal(state.whatsapp_state, "lead_quente");
    assert.deepEqual(wakes, [
      { target_agent_id: "agent-jhon-test", wake_type: "whatsapp_closer" },
      { target_agent_id: "agent-jhon-test", wake_type: "whatsapp_closer" },
    ]);
  } finally {
    await paperclip.close();
  }
});

test("gateway keeps objective answer after price qualification with Jhon Snow", async () => {
  const root = makeRoot();
  assert.equal(runNode([crm, "--root", root, "init"]).status, 0);
  const leadFile = join(root, "lead.json");
  writeFileSync(
    leadFile,
    JSON.stringify([
      {
        canonical_name: "Aghata Massoterapia",
        phone_or_contact: "+55 27 99999-0000",
        recommended_offer: "Presenca Local em 72h",
      },
    ]),
  );
  assert.equal(runNode([crm, "--root", root, "lead", "upsert", "--file", leadFile]).status, 0);

  const priceFile = join(root, "price-inbound.json");
  writeFileSync(
    priceFile,
    JSON.stringify({
      bridge_message_id: "wa-price-objective-gateway-001",
      chat_id: "5527999990000@s.whatsapp.net",
      sender_name: "Aghata Massoterapia",
      sender_phone: "+55 27 99999-0000",
      body: "Quais sao os custos? Isso seria um site correto?",
      received_at: "2026-06-21T09:35:27-03:00",
    }),
  );
  assert.equal(
    runNode([crm, "--root", root, "whatsapp", "inbound", "ingest", "--file", priceFile]).status,
    0,
  );
  assert.equal(
    runNode([
      crm,
      "--root",
      root,
      "whatsapp",
      "outbox",
      "propose",
      "--name",
      "Aghata Massoterapia",
      "--body",
      "Depende um pouco do que precisa aparecer na pagina e do objetivo principal.\n\nPara eu te direcionar melhor: voce quer usar essa pagina mais como apresentacao oficial do seu trabalho, ou mais para organizar o caminho de quem vem do Instagram/WhatsApp?",
      "--source",
      "jhon-preco-qualificacao",
      "--humanizer-pass",
      "true",
      "--used-last-inbound",
      "true",
      "--contextual-reply",
      "true",
    ]).status,
    0,
  );
  const database = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  const outbox = database.prepare("select * from whatsapp_outbox order by id desc limit 1").get();
  database.close();
  const review = runNode([crm, "--root", root, "whatsapp", "guardian", "review", "--outbox-id", String(outbox.id)]);
  assert.equal(review.status, 0, review.stderr);
  assert.match(review.stdout, /aprovado/i);

  const objectiveFile = join(root, "waha-objective.json");
  writeFileSync(
    objectiveFile,
    JSON.stringify({
      event: "message",
      session: "default",
      payload: {
        id: "false_5527999990000@c.us_3EB0WAHAOBJECTIVE",
        from: "5527999990000@c.us",
        fromMe: false,
        body: "Seria para organizar o caminho",
        notifyName: "Aghata Massoterapia",
        timestamp: "2026-06-21T09:36:27-03:00",
      },
    }),
  );

  const paperclip = await withPaperclipServer((_req, res, requests) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: `issue-test-${requests.length}`, identifier: `FRE-TEST-${requests.length}` }));
  });

  try {
    const result = await runNodeAsync([
      gateway,
      "--root",
      root,
      "import-waha-event",
      "--file",
      objectiveFile,
      "--auto-wake",
      "--paperclip-api-base",
      paperclip.baseUrl,
      "--paperclip-company-id",
      "company-test",
      "--atendimento-agent-id",
      "agent-atendimento-test",
      "--closer-agent-id",
      "agent-jhon-test",
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Importados: 1/i);
    assert.match(result.stdout, /Auto-wakes: 1/i);

    assert.equal(paperclip.requests.length, 1);
    assert.equal(paperclip.requests[0].body.assigneeAgentId, "agent-jhon-test");
    assert.match(paperclip.requests[0].body.description, /qualificacao_preco_pendente|preco_pedido/i);
    assert.match(paperclip.requests[0].body.description, /Seria para organizar o caminho/i);
  } finally {
    await paperclip.close();
  }
});
