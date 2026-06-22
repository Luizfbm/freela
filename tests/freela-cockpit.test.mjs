import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  openCockpitDatabase,
  previewCommand,
  readLeadDetail,
  readCockpitSummary,
  readKanban,
  searchLeads,
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

function openScratchDatabase(root) {
  return new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
}

function insertActiveSafeOutbox(root, name = "Aghata Massoterapia") {
  const database = openScratchDatabase(root);
  database
    .prepare(
      `insert into whatsapp_outbox (
        lead_id, target_chat_id, body, source, status,
        humanizer_pass, used_last_inbound, contextual_reply, created_at
      )
      select id, coalesce(phone_normalized, '5527999990000@s.whatsapp.net'),
        'Mensagem WAHA segura', 'test', 'approved', 1, 1, 1, datetime('now')
      from leads
      where canonical_name = ?`,
    )
    .run(name);
  database.close();
}

function setWhatsAppState(root, name, state) {
  const database = openScratchDatabase(root);
  database
    .prepare(
      `insert into lead_conversation_state (lead_id, whatsapp_state, updated_at)
       select id, ?, datetime('now') from leads where canonical_name = ?
       on conflict(lead_id) do update set
         whatsapp_state = excluded.whatsapp_state,
         updated_at = excluded.updated_at`,
    )
    .run(state, name);
  database.close();
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

test("safe WAHA outbox hides manual-ready cards unless state is a manual exception", () => {
  const root = makeRoot();
  assert.equal(runCrm(root, ["init"]).status, 0);
  seedLead(root, {
    canonical_name: "Aghata Massoterapia",
    phone_or_contact: "+55 27 99999-0000",
    status: "novo",
    handoff_status: "writer_pending",
    recommended_offer: "Presenca Local em 72h",
  });
  approveManualLeadCard(root, "Aghata Massoterapia", "Oi, posso te mandar 3 sugestoes rapidas?");
  insertActiveSafeOutbox(root);

  const database = openCockpitDatabase({ root, readOnly: true });
  try {
    const hidden = readKanban(database, { queueDate: "2026-06-22" });
    assert.equal(hidden.enviarAgora.length, 0);
  } finally {
    database.close();
  }

  setWhatsAppState(root, "Aghata Massoterapia", "lead_quente");

  const withException = openCockpitDatabase({ root, readOnly: true });
  try {
    const visible = readKanban(withException, { queueDate: "2026-06-22" });
    assert.equal(visible.enviarAgora.length, 1);
    assert.equal(visible.enviarAgora[0].canonicalName, "Aghata Massoterapia");
  } finally {
    withException.close();
  }
});

test("kanban aguardandoWorker includes active worker handoffs", () => {
  const root = makeRoot();
  assert.equal(runCrm(root, ["init"]).status, 0);
  const database = openScratchDatabase(root);
  database.exec(`
    insert into worker_handoffs (
      handoff_key, handoff_version, source_agent_id, source_agent_name,
      source_issue_id, source_issue_identifier, target_agent_id, target_agent_name,
      title, required_action, workflow_run_id, workflow_round_date, workflow_stage,
      workflow_expected_count, workflow_next_owner, status, paperclip_issue_id,
      paperclip_issue_identifier, artifacts_json, acceptance_criteria_json,
      created_at, updated_at
    ) values (
      'handoff-active', 1, 'coo', 'COO Freelancer',
      'issue-1', 'FRE-1', 'qa-mensagens', 'QA Mensagens',
      'Revisar mensagens pendentes', 'Validar cards aprovados para hoje',
      'run-1', '2026-06-22', 'qa_messages', 1, 'qa-mensagens',
      'pending_issue', 'pc-1', 'FRE-9', '[]', '["validar"]',
      datetime('now'), datetime('now')
    );
    insert into worker_handoffs (
      handoff_key, handoff_version, source_agent_id, source_agent_name,
      source_issue_id, source_issue_identifier, target_agent_id, target_agent_name,
      title, required_action, workflow_run_id, workflow_round_date, workflow_stage,
      workflow_expected_count, workflow_next_owner, status, paperclip_issue_id,
      paperclip_issue_identifier, artifacts_json, acceptance_criteria_json,
      created_at, updated_at
    ) values (
      'handoff-done', 1, 'coo', 'COO Freelancer',
      'issue-1', 'FRE-1', 'qa-mensagens', 'QA Mensagens',
      'Handoff concluido', 'Nada a fazer',
      'run-1', '2026-06-22', 'qa_messages', 1, 'qa-mensagens',
      'completed', 'pc-2', 'FRE-10', '[]', '["validar"]',
      datetime('now'), datetime('now')
    );
  `);
  database.close();

  const readOnly = openCockpitDatabase({ root, readOnly: true });
  try {
    const kanban = readKanban(readOnly, { queueDate: "2026-06-22" });
    const handoffs = kanban.aguardandoWorker.filter((card) => card.cardKind === "worker_handoff");
    assert.equal(handoffs.length, 1);
    assert.equal(handoffs[0].canonicalName, "Revisar mensagens pendentes");
    assert.equal(handoffs[0].status, "pending_issue");
    assert.equal(handoffs[0].commercialStage, "worker_handoff");
    assert.equal(handoffs[0].category, "QA Mensagens");
    assert.equal(handoffs[0].message, "Validar cards aprovados para hoje");
    assert.equal(handoffs[0].paperclipIssueIdentifier, "FRE-9");
  } finally {
    readOnly.close();
  }
});

test("kanban bloqueados includes WAHA blocker cards", () => {
  const root = makeRoot();
  assert.equal(runCrm(root, ["init"]).status, 0);
  seedLead(root, {
    canonical_name: "Aghata Massoterapia",
    phone_or_contact: "+55 27 99999-0000",
    recommended_offer: "Presenca Local em 72h",
  });
  seedLead(root, {
    canonical_name: "Beta Fisio",
    phone_or_contact: "+55 27 99999-0001",
    recommended_offer: "Presenca Local em 72h",
  });

  const database = openScratchDatabase(root);
  database.exec(`
    insert into whatsapp_outbox (
      lead_id, target_chat_id, body, source, status, dispatch_error,
      humanizer_pass, used_last_inbound, contextual_reply, created_at
    )
    select id, phone_normalized, 'Mensagem ambigua', 'test', 'dispatch_ambiguous',
      'ACK ambiguo no provedor', 1, 1, 1, datetime('now')
    from leads
    where canonical_name = 'Aghata Massoterapia';
    insert into whatsapp_outbox (
      lead_id, target_chat_id, body, source, status, guardian_decision, guardian_reason,
      humanizer_pass, used_last_inbound, contextual_reply, created_at
    )
    select id, phone_normalized, 'Mensagem bloqueada', 'test', 'blocked', 'bloquear',
      'guardiao bloqueou por regra', 1, 1, 1, datetime('now')
    from leads
    where canonical_name = 'Aghata Massoterapia';
    insert into whatsapp_outbox (
      lead_id, target_chat_id, body, source, status,
      humanizer_pass, used_last_inbound, contextual_reply, created_at, sent_at
    )
    select id, phone_normalized, 'Mensagem pendente antiga', 'test', 'delivery_pending',
      1, 1, 1, datetime('now', '-31 minutes'), datetime('now', '-31 minutes')
    from leads
    where canonical_name = 'Aghata Massoterapia';
    insert into whatsapp_outbox (
      lead_id, target_chat_id, body, source, status,
      humanizer_pass, used_last_inbound, contextual_reply, created_at
    )
    select id, phone_normalized, 'Mensagem pendente recente', 'test', 'delivery_pending',
      1, 1, 1, datetime('now')
    from leads
    where canonical_name = 'Aghata Massoterapia';
    insert into whatsapp_outbox (
      lead_id, target_chat_id, body, source, status,
      humanizer_pass, used_last_inbound, contextual_reply, created_at, sent_at
    )
    select id, phone_normalized, 'Mensagem enviada recente', 'test', 'delivery_pending',
      1, 1, 1, datetime('now', '-31 minutes'), datetime('now')
    from leads
    where canonical_name = 'Aghata Massoterapia';
    insert into whatsapp_outbox (
      lead_id, target_chat_id, body, source, status,
      humanizer_pass, used_last_inbound, contextual_reply, created_at, delivery_checked_at
    )
    select id, phone_normalized, 'Mensagem checada recente', 'test', 'delivery_pending',
      1, 1, 1, datetime('now', '-31 minutes'), datetime('now')
    from leads
    where canonical_name = 'Aghata Massoterapia';
    insert into whatsapp_outbox (
      lead_id, target_chat_id, body, source, status,
      humanizer_pass, used_last_inbound, contextual_reply, created_at
    )
    select id, phone_normalized, 'Mensagem com estado bloqueado', 'test', 'pending_guardian',
      1, 1, 1, datetime('now')
    from leads
    where canonical_name = 'Beta Fisio';
    insert into lead_conversation_state (lead_id, whatsapp_state, handoff_reason, updated_at)
    select id, 'bloqueado_guardiao', 'estado bloqueado pelo guardiao', datetime('now')
    from leads
    where canonical_name = 'Beta Fisio';
  `);
  database.close();

  const readOnly = openCockpitDatabase({ root, readOnly: true });
  try {
    const kanban = readKanban(readOnly, { queueDate: "2026-06-22" });
    const blockers = kanban.bloqueados.filter((card) => card.cardKind === "waha_blocker");
    assert.equal(blockers.length, 4);
    assert.deepEqual(
      blockers.map((card) => card.status).sort(),
      ["blocked", "delivery_pending", "dispatch_ambiguous", "pending_guardian"],
    );
    assert.equal(blockers.some((card) => card.message === "Mensagem pendente recente"), false);
    assert.equal(blockers.some((card) => card.message === "Mensagem enviada recente"), false);
    assert.equal(blockers.some((card) => card.message === "Mensagem checada recente"), false);
    assert.equal(
      blockers.find((card) => card.status === "dispatch_ambiguous")?.validationBlocker,
      "ACK ambiguo no provedor",
    );
    assert.equal(
      blockers.find((card) => card.status === "blocked")?.validationBlocker,
      "guardiao bloqueou por regra",
    );
    assert.equal(
      blockers.find((card) => card.status === "pending_guardian")?.validationBlocker,
      "estado bloqueado pelo guardiao",
    );
  } finally {
    readOnly.close();
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

test("cockpit search includes closed leads and resolves by lead id", () => {
  const root = makeRoot();
  assert.equal(runCrm(root, ["init"]).status, 0);
  seedLead(root, {
    canonical_name: "Clara Pilates",
    city: "Vila Velha",
    category: "pilates",
    phone_or_contact: "+55 27 90000-0001",
    status: "perdido",
    recommended_offer: "Presenca Local em 72h",
  });

  const database = openCockpitDatabase({ root, readOnly: true });
  try {
    const results = searchLeads(database, { q: "Clara" });
    assert.equal(results.length, 1);
    assert.equal(results[0].canonicalName, "Clara Pilates");
    assert.equal(results[0].status, "perdido");

    const detail = readLeadDetail(database, results[0].leadId);
    assert.equal(detail.canonicalName, "Clara Pilates");
    assert.equal(detail.availableActions.includes("enviado"), false);
  } finally {
    database.close();
  }
});

test("command preview refuses ambiguous lead names", () => {
  const root = makeRoot();
  assert.equal(runCrm(root, ["init"]).status, 0);
  seedLead(root, { canonical_name: "Clara Pilates", recommended_offer: "Presenca Local em 72h" });
  seedLead(root, { canonical_name: "Clara Fisio", recommended_offer: "Presenca Local em 72h" });

  const database = openCockpitDatabase({ root, readOnly: true });
  try {
    const preview = previewCommand(database, "enviado Clara");
    assert.equal(preview.ok, false);
    assert.equal(preview.reason, "ambiguous_lead");
    assert.equal(preview.matches.length, 2);
  } finally {
    database.close();
  }
});

test("command preview resolves resposta command with required message", () => {
  const root = makeRoot();
  assert.equal(runCrm(root, ["init"]).status, 0);
  seedLead(root, {
    canonical_name: "Aghata Massoterapia",
    phone_or_contact: "+55 27 99999-0000",
    recommended_offer: "Presenca Local em 72h",
  });

  const database = openCockpitDatabase({ root, readOnly: true });
  try {
    const preview = previewCommand(database, "respondeu Aghata Massoterapia: Pode sim");
    assert.equal(preview.ok, true);
    assert.equal(preview.action, "respondeu");
    assert.equal(preview.requiresStrongConfirmation, true);
    assert.equal(preview.payload.message, "Pode sim");
    assert.equal(preview.crmEffect, "record_response");
    assert.equal(preview.paperclipEffect, "route_worker_or_triage");
  } finally {
    database.close();
  }
});
