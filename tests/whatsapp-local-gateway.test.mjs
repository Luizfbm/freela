import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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

function seedApprovedOutbox(root) {
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
  const inboundFile = join(root, "inbound.json");
  writeFileSync(
    inboundFile,
    JSON.stringify({
      bridge_message_id: "wa-dispatch-001",
      chat_id: "5527999990000@s.whatsapp.net",
      sender_name: "Aghata Massoterapia",
      sender_phone: "+55 27 99999-0000",
      body: "Pode sim",
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
}

function readLatestOutbox(root) {
  const db = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  const outbox = db.prepare("select * from whatsapp_outbox order by id desc limit 1").get();
  db.close();
  return outbox;
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

function assertDryRunDispatchableCount(root, expected) {
  const result = runNode([gateway, "--root", root, "dispatch-approved-outbox", "--dry-run"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`Dry-run dispatchaveis: ${expected}`, "i"));
  return result;
}

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

test("gateway importa mensagens novas do messages.db do whatsapp-mcp sem duplicar", () => {
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

  const mcpDb = join(root, "messages.db");
  const mcp = new DatabaseSync(mcpDb);
  mcp.exec(`
    create table chats (
      jid text primary key,
      name text,
      last_message_time timestamp
    );
    create table messages (
      id text,
      chat_jid text,
      sender text,
      content text,
      timestamp timestamp,
      is_from_me boolean,
      media_type text,
      filename text,
      url text,
      media_key blob,
      file_sha256 blob,
      file_enc_sha256 blob,
      file_length integer,
      primary key (id, chat_jid)
    );
  `);
  mcp
    .prepare("insert into chats (jid, name, last_message_time) values (?, ?, ?)")
    .run("5527999990000@s.whatsapp.net", "Aghata Massoterapia", "2026-06-19T10:02:00-03:00");
  mcp
    .prepare(
      `insert into messages (
        id, chat_jid, sender, content, timestamp, is_from_me, media_type, filename
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "msg-in-001",
      "5527999990000@s.whatsapp.net",
      "5527999990000",
      "Pode sim",
      "2026-06-19T10:01:00-03:00",
      0,
      "",
      "",
    );
  mcp
    .prepare(
      `insert into messages (
        id, chat_jid, sender, content, timestamp, is_from_me, media_type, filename
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "msg-out-001",
      "5527999990000@s.whatsapp.net",
      "5527999990000",
      "Mensagem enviada por mim",
      "2026-06-19T10:02:00-03:00",
      1,
      "",
      "",
    );
  mcp
    .prepare("insert into chats (jid, name, last_message_time) values (?, ?, ?)")
    .run("5527991112222@s.whatsapp.net", "Contato fora do CRM", "2026-06-19T10:03:00-03:00");
  mcp
    .prepare(
      `insert into messages (
        id, chat_jid, sender, content, timestamp, is_from_me, media_type, filename
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "msg-unknown-001",
      "5527991112222@s.whatsapp.net",
      "5527991112222",
      "Oi, tudo bem?",
      "2026-06-19T10:03:00-03:00",
      0,
      "",
      "",
    );
  mcp.close();

  const first = runNode([gateway, "--root", root, "import-mcp-sqlite", "--db", mcpDb]);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Importados: 1/i);
  assert.match(first.stdout, /Ignorados: 2/i);
  assert.match(first.stdout, /Falhas: 0/i);

  const second = runNode([gateway, "--root", root, "import-mcp-sqlite", "--db", mcpDb]);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Importados: 0/i);

  const crmDb = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  const inbound = crmDb.prepare("select * from whatsapp_inbound_events").all();
  assert.equal(inbound.length, 1);
  assert.equal(inbound[0].bridge_message_id, "msg-in-001:5527999990000@s.whatsapp.net");
  assert.equal(inbound[0].chat_id, "5527999990000@s.whatsapp.net");
  assert.equal(inbound[0].sender_phone, "5527999990000");
  assert.equal(inbound[0].body, "Pode sim");
  crmDb.close();

  const errorFiles = readdirSync(join(root, ".scratch")).filter((file) =>
    file.endsWith(".error.txt"),
  );
  assert.deepEqual(errorFiles, []);
  assert.equal(
    existsSync(
      join(root, ".scratch/whatsapp-inbound-msg-unknown-001-5527991112222-s.whatsapp.net.json"),
    ),
    false,
  );

  const source = readFileSync(gateway, "utf8");
  assert.match(source, /messages\.db/i);
  assert.doesNotMatch(source, /\/api\/send|send_message|send_file|send_audio_message/i);
});
