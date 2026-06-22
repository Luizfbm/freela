import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  openCockpitDatabase,
  readCockpitSummary,
  readKanban,
  readWahaSummary,
} from "../scripts/freela-cockpit-core.mjs";

const repoRoot = new URL("..", import.meta.url).pathname;
const crm = join(repoRoot, "scripts/freela-crm.mjs");

function makeRoot() {
  return mkdtempSync(join(tmpdir(), "freela-cockpit-"));
}

function runCrm(root, args, options = {}) {
  return spawnSync(process.execPath, [crm, "--root", root, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });
}

function writeJson(root, name, value) {
  const file = join(root, name);
  writeFileSync(file, JSON.stringify(value, null, 2));
  return file;
}

function seedLead(root, lead) {
  const file = writeJson(root, `lead-${Date.now()}-${Math.random()}.json`, [lead]);
  const result = runCrm(root, ["lead", "upsert", "--file", file]);
  assert.equal(result.status, 0, result.stderr);
}

function approveManualLeadCard(root, name, message, date = "2026-06-22") {
  assert.equal(runCrm(root, ["queue", "generate", "--date", date]).status, 0);
  assert.equal(
    runCrm(root, ["queue", "set-message", "--date", date, "--name", name, "--message", message]).status,
    0,
  );
  const approve = runCrm(root, [
    "queue",
    "approve-card",
    "--date",
    date,
    "--name",
    name,
    "--qa-status",
    "aprovado_para_lead_cards",
  ]);
  assert.equal(approve.status, 0, approve.stderr);
}

test("cockpit summary and kanban read official SQLite views", () => {
  const root = makeRoot();
  assert.equal(runCrm(root, ["init"]).status, 0);
  seedLead(root, {
    canonical_name: "Aghata Massoterapia",
    city: "Vitoria",
    area: "Praia do Canto",
    category: "massoterapia",
    phone_or_contact: "+55 27 99999-0000",
    status: "novo",
    handoff_status: "writer_pending",
    recommended_offer: "Presenca Local em 72h",
  });
  approveManualLeadCard(root, "Aghata Massoterapia", "Oi, posso te mandar 3 sugestoes rapidas?");

  const database = openCockpitDatabase({ root, readOnly: true });
  try {
    const summary = readCockpitSummary(database, { queueDate: "2026-06-22" });
    const kanban = readKanban(database, { queueDate: "2026-06-22" });

    assert.equal(summary.readyLeadCards, 1);
    assert.equal(summary.pendingValidation >= 0, true);
    assert.equal(kanban.enviarAgora.length, 1);
    assert.equal(kanban.enviarAgora[0].canonicalName, "Aghata Massoterapia");
    assert.equal(kanban.enviarAgora[0].leadId > 0, true);
  } finally {
    database.close();
  }
});

test("waha summary treats delivery pending, ambiguous dispatch, and strong ACK separately", () => {
  const root = makeRoot();
  assert.equal(runCrm(root, ["init"]).status, 0);
  seedLead(root, {
    canonical_name: "Aghata Massoterapia",
    phone_or_contact: "+55 27 99999-0000",
    recommended_offer: "Presenca Local em 72h",
  });

  const database = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  database.exec(`
    insert into whatsapp_outbox (lead_id, target_chat_id, body, source, status, humanizer_pass, used_last_inbound, contextual_reply, created_at)
    select id, phone_normalized, 'Mensagem aprovada', 'test', 'approved', 1, 1, 1, datetime('now') from leads;
    insert into whatsapp_outbox (lead_id, target_chat_id, body, source, status, humanizer_pass, used_last_inbound, contextual_reply, created_at)
    select id, phone_normalized, 'Mensagem pendente', 'test', 'delivery_pending', 1, 1, 1, datetime('now') from leads;
    insert into whatsapp_outbox (lead_id, target_chat_id, body, source, status, humanizer_pass, used_last_inbound, contextual_reply, created_at)
    select id, phone_normalized, 'Mensagem ambigua', 'test', 'dispatch_ambiguous', 1, 1, 1, datetime('now') from leads;
    insert into whatsapp_outbox (lead_id, target_chat_id, body, source, status, delivery_ack_name, humanizer_pass, used_last_inbound, contextual_reply, created_at)
    select id, phone_normalized, 'Mensagem entregue', 'test', 'sent', 'DEVICE', 1, 1, 1, datetime('now') from leads;
  `);
  database.close();

  const readOnly = openCockpitDatabase({ root, readOnly: true });
  try {
    const waha = readWahaSummary(readOnly);
    assert.equal(waha.approved, 1);
    assert.equal(waha.deliveryPending, 1);
    assert.equal(waha.dispatchAmbiguous, 1);
    assert.equal(waha.sentStrongAck, 1);
  } finally {
    readOnly.close();
  }
});
