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
