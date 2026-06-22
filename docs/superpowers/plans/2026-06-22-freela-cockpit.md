# Freela Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private local Cockpit UI at `http://127.0.0.1:3200` for operating freelancer leads, executing approved CRM actions through the official CLI, and selectively updating Paperclip.

**Architecture:** Create a thin Node.js local server that reads official SQLite views directly and performs every CRM mutation through `node scripts/freela-crm.mjs`. Keep the domain/read/action logic in a small testable core module, serve static frontend files from `dev/freela-cockpit/`, and reuse existing Paperclip sync scripts for `FRE-7` surfaces. The Cockpit never sends WhatsApp directly and never treats `.scratch` markdown/CSV mirrors as source.

**Tech Stack:** Node.js ESM, `node:http`, `node:sqlite` `DatabaseSync`, `node:test`, plain HTML/CSS/JS, existing `scripts/freela-crm.mjs`, existing Paperclip sync scripts.

---

## Spec Reference

Design spec: `docs/superpowers/specs/2026-06-22-freela-cockpit-design.md`

Important operational constraints:

- Official SQLite DB: `/Users/luiz_fbm/Library/Application Support/freela-paperclip/db/freela.sqlite`
- Compatibility DB path: `.scratch/db/freela.sqlite`
- Official CRM CLI: `node scripts/freela-crm.mjs`
- Paperclip console issue: `FRE-7`
- No private lead data in `docs/`, `demos/`, or `outputs/`
- Never call `/api/sendText`
- Never dispatch WAHA from the Cockpit MVP

## File Structure

- Create: `scripts/freela-cockpit-core.mjs`
  - Pure and injectable Cockpit logic: DB read model, stage queries, WAHA summary, command preview, action planning, mutation orchestration with injected runners.

- Create: `scripts/freela-cockpit.mjs`
  - Local HTTP server entrypoint. Parses flags, binds to `127.0.0.1:3200`, serves frontend files, exposes JSON API, and calls core functions.

- Create: `dev/freela-cockpit/index.html`
  - Static shell for the private Cockpit UI.

- Create: `dev/freela-cockpit/styles.css`
  - Dense operational dashboard styling. No private data.

- Create: `dev/freela-cockpit/app.js`
  - Browser-side state, fetch calls, rendering, auto-refresh, modals, command preview, action submission.

- Create: `tests/freela-cockpit.test.mjs`
  - Unit and integration tests for core logic and HTTP routes using temporary SQLite roots.

- Modify only if needed: `README.md`
  - Add one short local-only command after implementation is complete. Do not document private data or real leads.

Do not modify `scripts/freela-crm.mjs` for this MVP unless a failing Cockpit test proves the current CLI lacks a required safe command. If a CLI gap appears, stop after the failing test and revise the plan before broadening scope.

---

### Task 1: Cockpit Read Model Core

**Files:**
- Create: `scripts/freela-cockpit-core.mjs`
- Create: `tests/freela-cockpit.test.mjs`

- [ ] **Step 1: Write the failing read-model test**

Add this initial test file:

```js
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

test("waha summary treats delivery pending and ambiguous dispatch separately", () => {
  const root = makeRoot();
  assert.equal(runCrm(root, ["init"]).status, 0);
  seedLead(root, {
    canonical_name: "Aghata Massoterapia",
    phone_or_contact: "+55 27 99999-0000",
    recommended_offer: "Presenca Local em 72h",
  });

  const database = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  database.exec(`
    insert into whatsapp_outbox (lead_id, body, source, status, humanizer_pass, used_last_inbound, contextual_reply, created_at, updated_at)
    select id, 'Mensagem aprovada', 'test', 'approved', 1, 1, 1, datetime('now'), datetime('now') from leads;
    insert into whatsapp_outbox (lead_id, body, source, status, humanizer_pass, used_last_inbound, contextual_reply, created_at, updated_at)
    select id, 'Mensagem pendente', 'test', 'delivery_pending', 1, 1, 1, datetime('now'), datetime('now') from leads;
    insert into whatsapp_outbox (lead_id, body, source, status, humanizer_pass, used_last_inbound, contextual_reply, created_at, updated_at)
    select id, 'Mensagem ambigua', 'test', 'dispatch_ambiguous', 1, 1, 1, datetime('now'), datetime('now') from leads;
  `);
  database.close();

  const readOnly = openCockpitDatabase({ root, readOnly: true });
  try {
    const waha = readWahaSummary(readOnly);
    assert.equal(waha.approved, 1);
    assert.equal(waha.deliveryPending, 1);
    assert.equal(waha.dispatchAmbiguous, 1);
    assert.equal(waha.sentStrongAck, 0);
  } finally {
    readOnly.close();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/freela-cockpit.test.mjs
```

Expected: FAIL with `Cannot find module '../scripts/freela-cockpit-core.mjs'`.

- [ ] **Step 3: Implement the minimal read-model core**

Create `scripts/freela-cockpit-core.mjs`:

```js
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const DEFAULT_QUEUE_DATE = null;

export function databasePath(root, explicitDbPath = null) {
  if (explicitDbPath) return explicitDbPath;
  return join(resolve(root), ".scratch/db/freela.sqlite");
}

export function openCockpitDatabase({ root, dbPath = null, readOnly = true }) {
  const path = databasePath(root, dbPath);
  if (!existsSync(path)) {
    throw Object.assign(new Error(`SQLite nao encontrado: ${path}`), {
      code: "SQLITE_MISSING",
      status: 503,
    });
  }
  return new DatabaseSync(path, { readOnly });
}

export function latestQueueDate(database) {
  return database
    .prepare("select queue_date from outreach_queue order by queue_date desc limit 1")
    .get()?.queue_date ?? new Date().toISOString().slice(0, 10);
}

export function readCockpitSummary(database, options = {}) {
  const queueDate = options.queueDate ?? latestQueueDate(database);
  const waha = readWahaSummary(database);
  const report = {
    queueDate,
    pendingValidation: countRows(database, "select count(*) as count from commercial_pending_validation"),
    readyForWriter: countRows(database, "select count(*) as count from commercial_ready_for_writer"),
    pendingQa: countRows(database, "select count(*) as count from commercial_pending_qa where queue_date = ?", [
      queueDate,
    ]),
    readyLeadCards: manualReadyLeadCards(database).length,
    followupsToday: countRows(database, "select count(*) as count from commercial_followups_today"),
    staleLeads: countRows(database, "select count(*) as count from commercial_stale_leads"),
    openHandoffs: countRows(
      database,
      "select count(*) as count from worker_handoffs where status not in ('completed', 'cancelled')",
    ),
    waha,
  };
  return {
    ...report,
    nextStep: nextCommercialStep(report),
  };
}

export function readKanban(database, options = {}) {
  const queueDate = options.queueDate ?? latestQueueDate(database);
  return {
    enviarAgora: manualReadyLeadCards(database).map(mapLeadContextRow),
    followupResposta: database
      .prepare("select * from commercial_followups_today order by updated_at, canonical_name")
      .all()
      .map(mapLeadContextRow),
    aguardandoWorker: [
      ...database.prepare("select * from commercial_ready_for_writer order by canonical_name").all(),
      ...database
        .prepare("select * from commercial_pending_qa where queue_date = ? order by canonical_name")
        .all(queueDate),
    ].map(mapLeadContextRow),
    bloqueados: database
      .prepare("select * from commercial_pending_validation order by canonical_name")
      .all()
      .map(mapLeadContextRow),
    revisar: database
      .prepare(
        `select *
         from commercial_lead_context
         where commercial_stage = 'review'
            or status = 'reanalisar'
         order by updated_at desc, canonical_name`,
      )
      .all()
      .map(mapLeadContextRow),
  };
}

export function readWahaSummary(database) {
  const row = database
    .prepare(
      `select
        sum(case when status = 'approved' then 1 else 0 end) as approved,
        sum(case when status = 'delivery_pending' then 1 else 0 end) as delivery_pending,
        sum(case when status = 'dispatch_ambiguous' then 1 else 0 end) as dispatch_ambiguous,
        sum(
          case
            when status = 'sent'
             and (
               delivery_ack_name in ('DEVICE', 'READ', 'PLAYED')
               or coalesce(delivery_ack, 0) >= 2
             )
            then 1
            else 0
          end
        ) as sent_strong_ack
       from whatsapp_outbox`,
    )
    .get();
  return {
    approved: row.approved ?? 0,
    deliveryPending: row.delivery_pending ?? 0,
    dispatchAmbiguous: row.dispatch_ambiguous ?? 0,
    sentStrongAck: row.sent_strong_ack ?? 0,
  };
}

function manualReadyLeadCards(database) {
  const rows = database
    .prepare(
      `select c.*, s.whatsapp_state
       from commercial_ready_lead_cards c
       left join lead_conversation_state s on s.lead_id = c.lead_id
       where c.has_ready_message = 1
       order by case c.status when 'interessado' then 0 when 'respondeu' then 1 else 2 end, c.canonical_name`,
    )
    .all();
  return rows.filter((row) => keepManualLeadCard(database, row));
}

function keepManualLeadCard(database, lead) {
  if (manualWhatsAppException(lead.whatsapp_state)) return true;
  return !hasActiveSafeOutbox(database, lead.lead_id);
}

function manualWhatsAppException(state) {
  return [
    "preco_pedido",
    "lead_quente",
    "objecao_comercial",
    "handoff_luiz",
    "bloqueado_guardiao",
    "qualificacao_preco_pendente",
  ].includes(clean(state));
}

function hasActiveSafeOutbox(database, leadId) {
  const row = database
    .prepare(
      `select id
       from whatsapp_outbox
       where lead_id = ?
         and status in ('pending_guardian', 'approved', 'delivery_pending', 'sent')
         and humanizer_pass = 1
         and used_last_inbound = 1
         and contextual_reply = 1
       order by id desc
       limit 1`,
    )
    .get(leadId);
  return Boolean(row);
}

function mapLeadContextRow(row) {
  return {
    leadId: row.lead_id,
    canonicalName: row.canonical_name,
    status: row.status,
    commercialStage: row.commercial_stage,
    category: row.category,
    city: row.city,
    area: row.area,
    contact: row.phone_or_contact || row.contact_path || row.instagram || "",
    instagram: row.instagram,
    websiteUrl: row.website_url,
    recommendedOffer: row.recommended_offer,
    queueId: row.queue_id,
    queueDate: row.queue_date,
    actionType: row.action_type,
    cardStatus: row.card_status,
    qaStatus: row.qa_status,
    validationBlocker: row.validation_blocker,
    bioGateStatus: row.bio_gate_status,
    lastInteractionAt: row.last_interaction_at,
    lastInteractionClassification: row.last_interaction_classification,
    updatedAt: row.updated_at,
    message: row.message,
  };
}

function countRows(database, sql, params = []) {
  return database.prepare(sql).get(...params).count;
}

function nextCommercialStep(report) {
  if (report.readyLeadCards > 0) return "abrir lead-cards no FRE-7 e enviar manualmente.";
  if (report.pendingQa > 0) return "acionar QA de Mensagens para liberar ou devolver ajustes.";
  if (report.readyForWriter > 0) return "acionar Redator de Primeira Mensagem.";
  if (report.pendingValidation > 0) return "acionar Validador de Dados ou devolver lacunas para Scout.";
  if (report.followupsToday > 0) return "acionar Follow-up CRM para priorizar respostas e demos.";
  if (report.openHandoffs > 0) return "verificar handoffs abertos e destravar workers.";
  if (report.staleLeads > 0) return "revisar leads parados antes de nova prospeccao.";
  return "rodar nova prospeccao qualificada.";
}

function clean(value) {
  return String(value ?? "").trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/freela-cockpit.test.mjs
```

Expected: PASS for the two Cockpit read-model tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/freela-cockpit-core.mjs tests/freela-cockpit.test.mjs
git commit -m "feat: add freela cockpit read model" -m "Co-Authored-By: Paperclip <noreply@paperclip.ing>"
```

---

### Task 2: Lead Detail, Search, And Command Preview

**Files:**
- Modify: `scripts/freela-cockpit-core.mjs`
- Modify: `tests/freela-cockpit.test.mjs`

- [ ] **Step 1: Add failing tests for search and preview**

Append these tests:

```js
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
    assert.equal(preview.paperclipEffect, "route_worker_or_triage");
  } finally {
    database.close();
  }
});
```

Also update the import list at the top of `tests/freela-cockpit.test.mjs`:

```js
import {
  openCockpitDatabase,
  previewCommand,
  readCockpitSummary,
  readKanban,
  readLeadDetail,
  readWahaSummary,
  searchLeads,
} from "../scripts/freela-cockpit-core.mjs";
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test tests/freela-cockpit.test.mjs
```

Expected: FAIL with missing exports `searchLeads`, `readLeadDetail`, and `previewCommand`.

- [ ] **Step 3: Implement search, detail, and preview exports**

Append these functions to `scripts/freela-cockpit-core.mjs`:

```js
export function searchLeads(database, { q = "", limit = 50 } = {}) {
  const term = `%${clean(q).toLowerCase()}%`;
  const rows = database
    .prepare(
      `select *
       from commercial_lead_context
       where lower(coalesce(canonical_name, '')) like ?
          or lower(coalesce(phone_or_contact, '')) like ?
          or lower(coalesce(instagram, '')) like ?
          or lower(coalesce(city, '')) like ?
          or lower(coalesce(area, '')) like ?
          or lower(coalesce(category, '')) like ?
          or lower(coalesce(status, '')) like ?
          or lower(coalesce(commercial_stage, '')) like ?
       order by
         case when lower(coalesce(canonical_name, '')) like ? then 0 else 1 end,
         updated_at desc,
         canonical_name
       limit ?`,
    )
    .all(term, term, term, term, term, term, term, term, term, limit);
  return rows.map(mapLeadContextRow);
}

export function readLeadDetail(database, leadId) {
  const row = database
    .prepare("select * from commercial_lead_context where lead_id = ?")
    .get(leadId);
  if (!row) {
    throw Object.assign(new Error(`Lead nao encontrado: ${leadId}`), {
      code: "LEAD_NOT_FOUND",
      status: 404,
    });
  }
  const outbox = database
    .prepare(
      `select id, status, source, delivery_ack, delivery_ack_name, provider_message_id,
              dispatch_error, created_at, updated_at
       from whatsapp_outbox
       where lead_id = ?
       order by id desc
       limit 5`,
    )
    .all(leadId);
  return {
    ...mapLeadContextRow(row),
    outbox,
    availableActions: availableActionsForLead(row),
  };
}

export function previewCommand(database, rawCommand) {
  const parsed = parseOperatorCommand(rawCommand);
  if (!parsed.ok) return parsed;
  if (parsed.action === "status" && !parsed.name) {
    return {
      ok: true,
      action: "status",
      crmEffect: "read_summary",
      paperclipEffect: "none",
      requiresStrongConfirmation: false,
      payload: {},
    };
  }

  const matches = resolveLeadMatches(database, parsed.name);
  if (matches.length === 0) return { ok: false, reason: "lead_not_found", matches: [] };
  if (matches.length > 1) return { ok: false, reason: "ambiguous_lead", matches };

  const lead = readLeadDetail(database, matches[0].leadId);
  const action = parsed.action;
  return {
    ok: true,
    action,
    lead,
    leadId: lead.leadId,
    crmEffect: crmEffectForAction(action),
    paperclipEffect: paperclipEffectForAction(action),
    agentMayWake: ["respondeu", "pediu_exemplo", "pediu_preco"].includes(action),
    requiresStrongConfirmation: ["respondeu", "pediu_exemplo", "pediu_preco", "perdido", "descartar"].includes(action),
    payload: parsed.payload,
  };
}

export function parseOperatorCommand(rawCommand) {
  const command = clean(rawCommand);
  if (!command) return { ok: false, reason: "empty_command" };
  if (command === "status") return { ok: true, action: "status", name: "", payload: {} };
  if (command.startsWith("status ")) {
    return { ok: true, action: "status_lead", name: command.slice("status ".length), payload: {} };
  }
  if (command.startsWith("followup enviado ")) {
    return {
      ok: true,
      action: "followup_enviado",
      name: command.slice("followup enviado ".length),
      payload: {},
    };
  }
  if (command.startsWith("enviado ")) {
    return { ok: true, action: "enviado", name: command.slice("enviado ".length), payload: {} };
  }
  if (command.startsWith("respondeu ")) {
    const body = command.slice("respondeu ".length);
    const separator = body.indexOf(":");
    if (separator === -1) return { ok: false, reason: "response_message_required" };
    const name = clean(body.slice(0, separator));
    const message = clean(body.slice(separator + 1));
    if (!message) return { ok: false, reason: "response_message_required" };
    return { ok: true, action: "respondeu", name, payload: { message } };
  }
  if (command.startsWith("pediu exemplo ")) {
    return { ok: true, action: "pediu_exemplo", name: command.slice("pediu exemplo ".length), payload: {} };
  }
  if (command.startsWith("pediu preco ")) {
    return { ok: true, action: "pediu_preco", name: command.slice("pediu preco ".length), payload: {} };
  }
  if (command.startsWith("perdido ")) {
    return { ok: true, action: "perdido", name: command.slice("perdido ".length), payload: {} };
  }
  if (command.startsWith("descartar ")) {
    return { ok: true, action: "descartar", name: command.slice("descartar ".length), payload: {} };
  }
  return { ok: false, reason: "unknown_command" };
}

function resolveLeadMatches(database, name) {
  const term = `%${clean(name).toLowerCase()}%`;
  return database
    .prepare(
      `select lead_id, canonical_name, status, commercial_stage
       from commercial_lead_context
       where lower(canonical_name) like ?
       order by canonical_name
       limit 10`,
    )
    .all(term)
    .map((row) => ({
      leadId: row.lead_id,
      canonicalName: row.canonical_name,
      status: row.status,
      commercialStage: row.commercial_stage,
    }));
}

function availableActionsForLead(row) {
  if (["fechado", "perdido", "descartado", "duplicado"].includes(row.status)) return [];
  const actions = [];
  if (row.commercial_stage === "ready_lead_card") actions.push("enviado");
  if (["abordado", "respondeu", "interessado", "tem_demo"].includes(row.status)) {
    actions.push("followup_enviado", "respondeu", "pediu_exemplo", "pediu_preco");
  }
  actions.push("perdido", "descartar");
  return [...new Set(actions)];
}

function crmEffectForAction(action) {
  return {
    status: "read_lead_or_summary",
    status_lead: "read_lead",
    enviado: "mark_contacted",
    followup_enviado: "mark_followup_sent",
    respondeu: "record_response",
    pediu_exemplo: "record_demo_request",
    pediu_preco: "record_price_request",
    perdido: "mark_lost",
    descartar: "mark_discarded",
  }[action] ?? "unknown";
}

function paperclipEffectForAction(action) {
  if (["enviado", "followup_enviado", "perdido", "descartar"].includes(action)) return "refresh_surfaces";
  if (["respondeu", "pediu_exemplo", "pediu_preco"].includes(action)) return "route_worker_or_triage";
  return "none";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/freela-cockpit.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/freela-cockpit-core.mjs tests/freela-cockpit.test.mjs
git commit -m "feat: add freela cockpit lead preview" -m "Co-Authored-By: Paperclip <noreply@paperclip.ing>"
```

---

### Task 3: Safe Action Execution Through CRM CLI

**Files:**
- Modify: `scripts/freela-cockpit-core.mjs`
- Modify: `tests/freela-cockpit.test.mjs`

- [ ] **Step 1: Add failing tests for CLI-based mutation orchestration**

Append these tests:

```js
test("enviado action runs healthcheck and mark-contacted through CRM CLI", async () => {
  const root = makeRoot();
  assert.equal(runCrm(root, ["init"]).status, 0);
  seedLead(root, {
    canonical_name: "Aghata Massoterapia",
    phone_or_contact: "+55 27 99999-0000",
    recommended_offer: "Presenca Local em 72h",
  });
  approveManualLeadCard(root, "Aghata Massoterapia", "Oi, posso te mandar 3 sugestoes rapidas?");

  const calls = [];
  const result = await executeCockpitAction({
    root,
    action: "enviado",
    leadId: 1,
    expectedStage: "ready_lead_card",
    runCommand: async (args) => {
      calls.push(args);
      return { status: 0, stdout: "ok", stderr: "" };
    },
    syncPaperclip: async () => ({ ok: true }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.crmUpdated, true);
  assert.deepEqual(calls[0], ["healthcheck"]);
  assert.deepEqual(calls[1], ["lead", "mark-contacted", "--name", "Aghata Massoterapia"]);
});

test("action execution blocks when lead stage changed before submit", async () => {
  const root = makeRoot();
  assert.equal(runCrm(root, ["init"]).status, 0);
  seedLead(root, {
    canonical_name: "Aghata Massoterapia",
    status: "perdido",
    recommended_offer: "Presenca Local em 72h",
  });

  const result = await executeCockpitAction({
    root,
    action: "enviado",
    leadId: 1,
    expectedStage: "ready_lead_card",
    runCommand: async () => {
      throw new Error("runCommand should not be called");
    },
    syncPaperclip: async () => ({ ok: true }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "lead_stage_changed");
  assert.equal(result.crmUpdated, false);
});

test("paperclip sync failure after CRM write returns partial success", async () => {
  const root = makeRoot();
  assert.equal(runCrm(root, ["init"]).status, 0);
  seedLead(root, {
    canonical_name: "Aghata Massoterapia",
    phone_or_contact: "+55 27 99999-0000",
    recommended_offer: "Presenca Local em 72h",
  });
  approveManualLeadCard(root, "Aghata Massoterapia", "Oi, posso te mandar 3 sugestoes rapidas?");

  const result = await executeCockpitAction({
    root,
    action: "enviado",
    leadId: 1,
    expectedStage: "ready_lead_card",
    runCommand: async () => ({ status: 0, stdout: "ok", stderr: "" }),
    syncPaperclip: async () => {
      throw new Error("Paperclip offline");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.crmUpdated, true);
  assert.equal(result.paperclipUpdated, false);
  assert.match(result.errors[0], /Paperclip offline/);
});
```

Update the import list:

```js
import {
  executeCockpitAction,
  openCockpitDatabase,
  previewCommand,
  readCockpitSummary,
  readKanban,
  readLeadDetail,
  readWahaSummary,
  searchLeads,
} from "../scripts/freela-cockpit-core.mjs";
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test tests/freela-cockpit.test.mjs
```

Expected: FAIL with missing export `executeCockpitAction`.

- [ ] **Step 3: Implement execution orchestration with injected runners**

Append this export and helpers to `scripts/freela-cockpit-core.mjs`:

```js
export async function executeCockpitAction({
  root,
  dbPath = null,
  action,
  leadId,
  expectedStage = null,
  payload = {},
  runCommand,
  syncPaperclip,
}) {
  const beforeDb = openCockpitDatabase({ root, dbPath, readOnly: true });
  let lead;
  try {
    lead = readLeadDetail(beforeDb, leadId);
  } finally {
    beforeDb.close();
  }

  if (expectedStage && lead.commercialStage !== expectedStage) {
    return {
      ok: false,
      reason: "lead_stage_changed",
      crmUpdated: false,
      paperclipUpdated: false,
      agentRouted: false,
      warnings: [`Lead saiu de ${expectedStage} para ${lead.commercialStage}`],
      errors: [],
      nextRefreshRecommended: true,
    };
  }

  const crmArgs = crmArgsForAction({ action, lead, payload });
  if (!crmArgs) {
    return {
      ok: false,
      reason: "unsupported_action",
      crmUpdated: false,
      paperclipUpdated: false,
      agentRouted: false,
      warnings: [],
      errors: [`Acao nao suportada: ${action}`],
      nextRefreshRecommended: false,
    };
  }

  const health = await runCommand(["healthcheck"]);
  if (health.status !== 0) return commandFailure("healthcheck_failed", health);

  const write = await runCommand(crmArgs);
  if (write.status !== 0) return commandFailure("crm_write_failed", write);

  try {
    await syncPaperclip({ action, lead, payload });
  } catch (error) {
    return {
      ok: false,
      reason: "paperclip_sync_failed",
      crmUpdated: true,
      paperclipUpdated: false,
      agentRouted: false,
      warnings: ["CRM atualizado; Paperclip pendente de republicacao."],
      errors: [error.message],
      nextRefreshRecommended: true,
    };
  }

  return {
    ok: true,
    crmUpdated: true,
    paperclipUpdated: true,
    agentRouted: ["respondeu", "pediu_exemplo", "pediu_preco"].includes(action),
    warnings: [],
    errors: [],
    nextRefreshRecommended: true,
  };
}

export function crmArgsForAction({ action, lead, payload = {} }) {
  const name = lead.canonicalName;
  if (action === "enviado") return ["lead", "mark-contacted", "--name", name];
  if (action === "followup_enviado") return ["lead", "mark-contacted", "--name", name];
  if (action === "respondeu") {
    return ["lead", "mark-response", "--name", name, "--message", clean(payload.message)];
  }
  if (action === "pediu_preco") {
    return [
      "lead",
      "mark-response",
      "--name",
      name,
      "--message",
      clean(payload.message || "Lead pediu preco pelo WhatsApp."),
      "--response-status",
      "resposta_pediu_preco",
    ];
  }
  if (action === "pediu_exemplo") {
    return [
      "lead",
      "mark-response",
      "--name",
      name,
      "--message",
      clean(payload.message || "Lead pediu exemplo/demo pelo WhatsApp."),
      "--response-status",
      "resposta_pediu_exemplo",
    ];
  }
  if (action === "perdido") {
    return ["lead", "update", "--name", name, "--status", "perdido", "--notes", clean(payload.reason)];
  }
  if (action === "descartar") {
    return ["lead", "update", "--name", name, "--status", "descartado", "--notes", clean(payload.reason)];
  }
  return null;
}

function commandFailure(reason, result) {
  return {
    ok: false,
    reason,
    crmUpdated: false,
    paperclipUpdated: false,
    agentRouted: false,
    warnings: [],
    errors: [clean(result.stderr) || clean(result.stdout) || `Comando falhou: ${reason}`],
    nextRefreshRecommended: true,
  };
}
```

If the existing CRM CLI does not accept `resposta_pediu_exemplo` as a valid `response_status`, change that string in this task to the existing closest classification from `classifyResponse` and add a comment in the implementation plan review notes. Do not change the CRM status vocabulary in this task.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
node --test tests/freela-cockpit.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/freela-cockpit-core.mjs tests/freela-cockpit.test.mjs
git commit -m "feat: execute cockpit actions through crm cli" -m "Co-Authored-By: Paperclip <noreply@paperclip.ing>"
```

---

### Task 4: Local HTTP Server And JSON API

**Files:**
- Create: `scripts/freela-cockpit.mjs`
- Modify: `tests/freela-cockpit.test.mjs`

- [ ] **Step 1: Add failing HTTP route tests**

Append:

```js
import { once } from "node:events";
import { createCockpitServer } from "../scripts/freela-cockpit.mjs";

test("cockpit server serves summary and rejects non-loopback host config", async () => {
  const root = makeRoot();
  assert.equal(runCrm(root, ["init"]).status, 0);

  assert.throws(
    () => createCockpitServer({ root, host: "0.0.0.0", port: 0 }),
    /loopback/i,
  );

  const server = createCockpitServer({ root, host: "127.0.0.1", port: 0 });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/summary`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(typeof body.summary.readyLeadCards, "number");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("cockpit server command preview does not mutate state", async () => {
  const root = makeRoot();
  assert.equal(runCrm(root, ["init"]).status, 0);
  seedLead(root, { canonical_name: "Aghata Massoterapia", recommended_offer: "Presenca Local em 72h" });

  const server = createCockpitServer({ root, host: "127.0.0.1", port: 0 });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/command/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: "enviado Aghata Massoterapia" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.preview.ok, true);
    assert.equal(body.preview.action, "enviado");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test tests/freela-cockpit.test.mjs
```

Expected: FAIL with missing module `scripts/freela-cockpit.mjs`.

- [ ] **Step 3: Implement HTTP server**

Create `scripts/freela-cockpit.mjs`:

```js
#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";

import {
  executeCockpitAction,
  openCockpitDatabase,
  previewCommand,
  readCockpitSummary,
  readKanban,
  readLeadDetail,
  readWahaSummary,
  searchLeads,
} from "./freela-cockpit-core.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3200;
const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

export function createCockpitServer({ root = process.cwd(), host = DEFAULT_HOST, port = DEFAULT_PORT, dbPath = null } = {}) {
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error("Freela Cockpit deve escutar apenas em loopback");
  }
  const resolvedRoot = resolve(root);
  const publicDir = join(resolvedRoot, "dev/freela-cockpit");

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${host}:${port}`);
      if (url.pathname.startsWith("/api/")) {
        await handleApi({ request, response, url, root: resolvedRoot, dbPath });
        return;
      }
      serveStatic({ response, publicDir, pathname: url.pathname });
    } catch (error) {
      sendJson(response, error.status ?? 500, {
        ok: false,
        error: error.message,
      });
    }
  });
}

async function handleApi({ request, response, url, root, dbPath }) {
  if (request.method === "GET" && url.pathname === "/api/summary") {
    return withReadDb({ root, dbPath }, (database) =>
      sendJson(response, 200, { ok: true, summary: readCockpitSummary(database) }),
    );
  }
  if (request.method === "GET" && url.pathname === "/api/leads") {
    return withReadDb({ root, dbPath }, (database) => {
      const q = url.searchParams.get("q");
      const stage = url.searchParams.get("stage");
      const payload = q ? { mode: "search", leads: searchLeads(database, { q }) } : { mode: "kanban", kanban: readKanban(database) };
      if (stage && payload.kanban) payload.kanban = { [stage]: payload.kanban[stage] ?? [] };
      sendJson(response, 200, { ok: true, ...payload });
    });
  }
  if (request.method === "GET" && /^\/api\/leads\/\d+$/.test(url.pathname)) {
    const leadId = Number.parseInt(url.pathname.split("/").at(-1), 10);
    return withReadDb({ root, dbPath }, (database) =>
      sendJson(response, 200, { ok: true, lead: readLeadDetail(database, leadId) }),
    );
  }
  if (request.method === "GET" && url.pathname === "/api/waha") {
    return withReadDb({ root, dbPath }, (database) =>
      sendJson(response, 200, { ok: true, waha: readWahaSummary(database) }),
    );
  }
  if (request.method === "POST" && url.pathname === "/api/command/preview") {
    const body = await readJsonBody(request);
    return withReadDb({ root, dbPath }, (database) =>
      sendJson(response, 200, { ok: true, preview: previewCommand(database, body.command) }),
    );
  }
  if (request.method === "POST" && url.pathname.startsWith("/api/actions/")) {
    const action = url.pathname.split("/").at(-1);
    const body = await readJsonBody(request);
    const result = await executeCockpitAction({
      root,
      dbPath,
      action,
      leadId: body.leadId,
      expectedStage: body.expectedStage,
      payload: body.payload ?? {},
      runCommand: (args) => runCrmCommand({ root, dbPath, args }),
      syncPaperclip: () => syncOperationalSurfaces({ root }),
    });
    return sendJson(response, result.ok ? 200 : 409, { ok: result.ok, result });
  }
  if (request.method === "POST" && url.pathname === "/api/refresh-paperclip") {
    await syncOperationalSurfaces({ root });
    return sendJson(response, 200, { ok: true });
  }
  sendJson(response, 404, { ok: false, error: "Rota nao encontrada" });
}

function withReadDb({ root, dbPath }, fn) {
  const database = openCockpitDatabase({ root, dbPath, readOnly: true });
  try {
    return fn(database);
  } finally {
    database.close();
  }
}

function serveStatic({ response, publicDir, pathname }) {
  const file = pathname === "/" ? join(publicDir, "index.html") : join(publicDir, pathname);
  if (!file.startsWith(publicDir) || !existsSync(file)) {
    sendJson(response, 404, { ok: false, error: "Arquivo nao encontrado" });
    return;
  }
  response.writeHead(200, { "Content-Type": MIME.get(extname(file)) ?? "application/octet-stream" });
  createReadStream(file).pipe(response);
}

async function readJsonBody(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  if (!raw) return {};
  return JSON.parse(raw);
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function runCrmCommand({ root, dbPath, args }) {
  return runNode([join(root, "scripts/freela-crm.mjs"), "--root", root, ...optionalDb(dbPath), ...args], root);
}

function syncOperationalSurfaces({ root }) {
  return runNode([join(root, "scripts/paperclip-sync-operational-surfaces.mjs"), "--root", root], root);
}

function optionalDb(dbPath) {
  return dbPath ? ["--db", dbPath] : [];
}

function runNode(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function parseFlags(argv) {
  const flags = {};
  const rest = [...argv];
  while (rest.length) {
    const token = rest.shift();
    if (!token.startsWith("--")) throw new Error(`Opcao invalida: ${token}`);
    const key = token.slice(2);
    const value = rest.shift();
    if (value === undefined || value.startsWith("--")) throw new Error(`Valor obrigatorio para --${key}`);
    flags[key] = value;
  }
  return flags;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const flags = parseFlags(process.argv.slice(2));
  const root = resolve(flags.root ?? process.cwd());
  const host = flags.host ?? DEFAULT_HOST;
  const port = Number.parseInt(flags.port ?? `${DEFAULT_PORT}`, 10);
  const server = createCockpitServer({ root, host, port, dbPath: flags.db ?? null });
  server.listen(port, host, () => {
    console.log(`Freela Cockpit: http://${host}:${port}`);
  });
}
```

- [ ] **Step 4: Run server tests**

Run:

```bash
node --test tests/freela-cockpit.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/freela-cockpit.mjs tests/freela-cockpit.test.mjs
git commit -m "feat: add freela cockpit local server" -m "Co-Authored-By: Paperclip <noreply@paperclip.ing>"
```

---

### Task 5: Private Cockpit Frontend Shell

**Files:**
- Create: `dev/freela-cockpit/index.html`
- Create: `dev/freela-cockpit/styles.css`
- Create: `dev/freela-cockpit/app.js`

- [ ] **Step 1: Create the static HTML shell**

Create `dev/freela-cockpit/index.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex,nofollow">
  <title>Freela Cockpit</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="app-header">
    <div>
      <p class="eyebrow">Freela Cockpit</p>
      <h1>Operacao de leads</h1>
    </div>
    <div class="header-actions">
      <span id="db-health" class="health-pill">SQLite</span>
      <span id="last-refresh" class="muted">Sem atualizacao</span>
      <button id="refresh-button" class="button secondary" type="button">Atualizar</button>
    </div>
  </header>

  <main class="cockpit-layout">
    <section class="main-column" aria-label="Cockpit de leads">
      <div id="scorebar" class="scorebar" aria-live="polite"></div>

      <section class="search-panel" aria-label="Busca global">
        <label for="lead-search">Buscar lead</label>
        <input id="lead-search" type="search" placeholder="Nome, contato, cidade, status..." autocomplete="off">
        <div id="search-results" class="search-results"></div>
      </section>

      <section id="kanban" class="kanban" aria-label="Kanban operacional"></section>

      <section class="command-panel" aria-label="Console de comando">
        <label for="command-input">Console com preview</label>
        <div class="command-row">
          <input id="command-input" type="text" placeholder="enviado Nome do Lead">
          <button id="preview-command" class="button secondary" type="button">Preview</button>
        </div>
        <div id="command-preview" class="command-preview"></div>
      </section>
    </section>

    <aside class="waha-panel" aria-label="Painel WAHA">
      <h2>WAHA</h2>
      <div id="waha-summary"></div>
    </aside>
  </main>

  <div id="lead-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="lead-modal-title">
    <div class="modal-panel">
      <button id="modal-close" class="icon-button" type="button" aria-label="Fechar">x</button>
      <h2 id="lead-modal-title">Lead</h2>
      <div id="lead-detail"></div>
    </div>
  </div>

  <div id="toast" class="toast hidden" role="status" aria-live="polite"></div>
  <div id="error-box" class="error-box hidden" role="alert"></div>

  <script type="module" src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create dense responsive CSS**

Create `dev/freela-cockpit/styles.css`:

```css
:root {
  --bg: #0f1115;
  --surface: #171a21;
  --surface-strong: #1f2430;
  --line: #2f3543;
  --text: #f4f6fb;
  --muted: #a8b0c0;
  --green: #16a34a;
  --amber: #d97706;
  --red: #dc2626;
  --blue: #4f46e5;
  --shadow: rgba(0, 0, 0, 0.35);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

button,
input {
  font: inherit;
}

button {
  cursor: pointer;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}

.app-header h1 {
  margin: 0;
  font-size: 24px;
  letter-spacing: 0;
}

.eyebrow,
.muted {
  color: var(--muted);
}

.eyebrow {
  margin: 0 0 4px;
  font-size: 12px;
  text-transform: uppercase;
}

.header-actions,
.command-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cockpit-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  padding: 16px;
}

.main-column {
  min-width: 0;
}

.scorebar {
  display: grid;
  grid-template-columns: repeat(7, minmax(120px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.metric,
.column,
.search-panel,
.command-panel,
.waha-panel,
.modal-panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 12px 32px var(--shadow);
}

.metric {
  padding: 12px;
}

.metric strong {
  display: block;
  font-size: 24px;
}

.search-panel,
.command-panel {
  padding: 12px;
  margin-bottom: 14px;
}

label {
  display: block;
  margin-bottom: 6px;
  color: var(--muted);
  font-size: 13px;
}

input {
  width: 100%;
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #0b0d12;
  color: var(--text);
}

input:focus,
button:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}

.kanban {
  display: grid;
  grid-template-columns: repeat(5, minmax(220px, 1fr));
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 6px;
}

.column {
  min-height: 260px;
  padding: 10px;
}

.column h2 {
  margin: 0 0 10px;
  font-size: 15px;
}

.lead-card {
  display: grid;
  gap: 8px;
  padding: 10px;
  margin-bottom: 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface-strong);
}

.lead-card h3 {
  margin: 0;
  font-size: 15px;
}

.badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 2px 7px;
  border-radius: 999px;
  background: #283042;
  color: var(--text);
  font-size: 12px;
}

.badge.green { background: rgba(22, 163, 74, 0.18); color: #86efac; }
.badge.amber { background: rgba(217, 119, 6, 0.2); color: #fcd34d; }
.badge.red { background: rgba(220, 38, 38, 0.18); color: #fca5a5; }

.button {
  min-height: 36px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--blue);
  color: white;
}

.button.secondary {
  border-color: var(--line);
  background: transparent;
  color: var(--text);
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.waha-panel {
  position: sticky;
  top: 16px;
  align-self: start;
  padding: 14px;
}

.modal.hidden,
.toast.hidden,
.error-box.hidden {
  display: none;
}

.modal {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.62);
}

.modal-panel {
  width: min(720px, 100%);
  max-height: calc(100vh - 40px);
  overflow: auto;
  padding: 18px;
}

.icon-button {
  float: right;
  width: 36px;
  height: 36px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--text);
}

.toast,
.error-box {
  position: fixed;
  right: 16px;
  bottom: 16px;
  max-width: 420px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--surface-strong);
  border: 1px solid var(--line);
}

.error-box {
  border-color: var(--red);
}

@media (max-width: 1100px) {
  .cockpit-layout {
    grid-template-columns: 1fr;
  }

  .waha-panel {
    position: static;
  }

  .scorebar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .app-header,
  .header-actions,
  .command-row {
    align-items: stretch;
    flex-direction: column;
  }

  .cockpit-layout {
    padding: 10px;
  }

  .scorebar {
    grid-template-columns: 1fr;
  }

  .kanban {
    grid-template-columns: 1fr;
    overflow: visible;
  }
}
```

- [ ] **Step 3: Create browser app JavaScript**

Create `dev/freela-cockpit/app.js`:

```js
const state = {
  busy: false,
  modalOpen: false,
  refreshTimer: null,
};

const columns = [
  ["enviarAgora", "Enviar agora"],
  ["followupResposta", "Follow-up / resposta"],
  ["aguardandoWorker", "Aguardando worker"],
  ["bloqueados", "Bloqueados"],
  ["revisar", "Revisar"],
];

document.getElementById("refresh-button").addEventListener("click", () => refresh());
document.getElementById("preview-command").addEventListener("click", () => previewCommand());
document.getElementById("lead-search").addEventListener("input", debounce(searchLeads, 250));
document.getElementById("modal-close").addEventListener("click", closeModal);

await refresh();
state.refreshTimer = setInterval(() => {
  if (!state.busy && !state.modalOpen) refresh();
}, 30000);

async function refresh() {
  setBusy(true);
  try {
    const [summary, leads, waha] = await Promise.all([
      api("/api/summary"),
      api("/api/leads"),
      api("/api/waha"),
    ]);
    renderSummary(summary.summary);
    renderKanban(leads.kanban);
    renderWaha(waha.waha);
    document.getElementById("last-refresh").textContent = new Date().toLocaleTimeString("pt-BR");
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
  }
}

function renderSummary(summary) {
  const items = [
    ["Enviar hoje", summary.readyLeadCards, "green"],
    ["Follow-ups", summary.followupsToday, ""],
    ["Redator", summary.readyForWriter, ""],
    ["Validacao", summary.pendingValidation, "amber"],
    ["QA", summary.pendingQa, "amber"],
    ["Handoffs", summary.openHandoffs, ""],
    ["WAHA ambiguas", summary.waha.dispatchAmbiguous, summary.waha.dispatchAmbiguous ? "red" : ""],
  ];
  document.getElementById("scorebar").innerHTML = items.map(([label, value, color]) => `
    <article class="metric">
      <span class="badge ${color}">${escapeHtml(label)}</span>
      <strong>${Number(value ?? 0)}</strong>
    </article>
  `).join("");
}

function renderKanban(kanban) {
  document.getElementById("kanban").innerHTML = columns.map(([key, label]) => `
    <section class="column">
      <h2>${escapeHtml(label)} <span class="badge">${kanban[key]?.length ?? 0}</span></h2>
      ${(kanban[key] ?? []).map(renderCard).join("") || '<p class="muted">Nenhum item.</p>'}
    </section>
  `).join("");
  for (const button of document.querySelectorAll("[data-lead-id]")) {
    button.addEventListener("click", () => openLead(button.dataset.leadId));
  }
}

function renderCard(lead) {
  return `
    <article class="lead-card">
      <h3>${escapeHtml(lead.canonicalName)}</h3>
      <span class="badge">${escapeHtml(lead.status || "-")}</span>
      <span class="muted">${escapeHtml([lead.category, lead.area, lead.city].filter(Boolean).join(" - ") || "-")}</span>
      ${lead.validationBlocker ? `<span class="badge amber">${escapeHtml(lead.validationBlocker)}</span>` : ""}
      <button class="button secondary" type="button" data-lead-id="${lead.leadId}">Abrir</button>
    </article>
  `;
}

function renderWaha(waha) {
  const items = [
    ["Aprovadas", waha.approved, "green"],
    ["Aguardando ACK", waha.deliveryPending, "amber"],
    ["Ambiguas", waha.dispatchAmbiguous, "red"],
    ["ACK forte", waha.sentStrongAck, "green"],
  ];
  document.getElementById("waha-summary").innerHTML = items.map(([label, value, color]) => `
    <article class="metric">
      <span class="badge ${color}">${escapeHtml(label)}</span>
      <strong>${Number(value ?? 0)}</strong>
    </article>
  `).join("");
}

async function openLead(leadId) {
  try {
    const { lead } = await api(`/api/leads/${leadId}`);
    state.modalOpen = true;
    document.getElementById("lead-modal-title").textContent = lead.canonicalName;
    document.getElementById("lead-detail").innerHTML = `
      <p><strong>Status:</strong> ${escapeHtml(lead.status || "-")}</p>
      <p><strong>Stage:</strong> ${escapeHtml(lead.commercialStage || "-")}</p>
      <p><strong>Contato:</strong> ${escapeHtml(lead.contact || "-")}</p>
      <p><strong>Bloqueio:</strong> ${escapeHtml(lead.validationBlocker || "-")}</p>
      <p><strong>Mensagem:</strong></p>
      <pre>${escapeHtml(lead.message || "Sem mensagem pronta.")}</pre>
      <div>${lead.availableActions.map((action) => actionButton(action, lead)).join("")}</div>
    `;
    document.getElementById("lead-modal").classList.remove("hidden");
    for (const button of document.querySelectorAll("[data-action]")) {
      button.addEventListener("click", () => submitAction(button.dataset.action, lead));
    }
  } catch (error) {
    showError(error.message);
  }
}

function actionButton(action, lead) {
  return `<button class="button" type="button" data-action="${action}" data-lead-id="${lead.leadId}">${escapeHtml(labelForAction(action))}</button> `;
}

async function submitAction(action, lead) {
  const payload = {};
  if (["respondeu", "perdido", "descartar"].includes(action)) {
    const value = window.prompt(action === "respondeu" ? "Cole a resposta recebida:" : "Informe o motivo:");
    if (!value) return;
    if (action === "respondeu") payload.message = value;
    else payload.reason = value;
  }
  if (!window.confirm(`Confirmar ${labelForAction(action)} para ${lead.canonicalName}?`)) return;

  setBusy(true);
  try {
    const response = await api(`/api/actions/${action}`, {
      method: "POST",
      body: JSON.stringify({ leadId: lead.leadId, expectedStage: lead.commercialStage, payload }),
    });
    if (!response.ok) showError(response.result.errors?.join("\n") || "Acao incompleta");
    else showToast("Acao registrada.");
    closeModal();
    await refresh();
  } catch (error) {
    showError(error.message);
  } finally {
    setBusy(false);
  }
}

async function previewCommand() {
  const command = document.getElementById("command-input").value;
  try {
    const { preview } = await api("/api/command/preview", {
      method: "POST",
      body: JSON.stringify({ command }),
    });
    document.getElementById("command-preview").textContent = JSON.stringify(preview, null, 2);
  } catch (error) {
    showError(error.message);
  }
}

async function searchLeads(event) {
  const q = event.target.value.trim();
  if (!q) {
    document.getElementById("search-results").innerHTML = "";
    return;
  }
  const result = await api(`/api/leads?q=${encodeURIComponent(q)}`);
  document.getElementById("search-results").innerHTML = result.leads.map(renderCard).join("");
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body ? { "Content-Type": "application/json" } : {},
    ...options,
  });
  const body = await response.json();
  if (!response.ok && !body.result) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function closeModal() {
  state.modalOpen = false;
  document.getElementById("lead-modal").classList.add("hidden");
}

function setBusy(value) {
  state.busy = value;
  for (const button of document.querySelectorAll("button")) button.disabled = value;
}

function labelForAction(action) {
  return {
    enviado: "Marcar enviado",
    followup_enviado: "Follow-up enviado",
    respondeu: "Registrar resposta",
    pediu_exemplo: "Pediu exemplo",
    pediu_preco: "Pediu preco",
    perdido: "Marcar perdido",
    descartar: "Descartar",
  }[action] ?? action;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 3000);
}

function showError(message) {
  const box = document.getElementById("error-box");
  box.textContent = message;
  box.classList.remove("hidden");
}

function debounce(fn, delay) {
  let timeout = null;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}
```

- [ ] **Step 4: Verify static files are served**

Run:

```bash
node scripts/freela-cockpit.mjs --root "$(pwd)" --port 3200
```

Expected stdout: `Freela Cockpit: http://127.0.0.1:3200`

In a second terminal:

```bash
curl -s http://127.0.0.1:3200/ | rg "Freela Cockpit"
curl -s http://127.0.0.1:3200/app.js | rg "refresh"
```

Expected: both commands find matching text.

- [ ] **Step 5: Commit**

```bash
git add dev/freela-cockpit/index.html dev/freela-cockpit/styles.css dev/freela-cockpit/app.js
git commit -m "feat: add freela cockpit frontend shell" -m "Co-Authored-By: Paperclip <noreply@paperclip.ing>"
```

---

### Task 6: Integration Checks And Documentation

**Files:**
- Modify: `README.md`
- Modify: `tests/freela-cockpit.test.mjs`

- [ ] **Step 1: Add final integration test for static route**

Append:

```js
test("cockpit server serves private frontend shell", async () => {
  const root = repoRoot;
  const server = createCockpitServer({ root, host: "127.0.0.1", port: 0 });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Freela Cockpit/);
    assert.match(html, /Console com preview/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
```

- [ ] **Step 2: Run focused test**

Run:

```bash
node --test tests/freela-cockpit.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Add README local command**

Add this short section to `README.md` under "Rodando localmente":

````md
### Cockpit privado de leads

Na maquina local, com SQLite privado disponivel:

```bash
node scripts/freela-cockpit.mjs
```

Acesse `http://127.0.0.1:3200`. O Cockpit e privado, le o SQLite oficial e executa escritas apenas pela CLI `scripts/freela-crm.mjs`.
````

Do not include real lead names, phone numbers, message bodies, or screenshots.

- [ ] **Step 4: Run full verification**

Run:

```bash
node --test tests/freela-cockpit.test.mjs tests/freela-crm-cli.test.mjs tests/paperclip-automation-contract.test.mjs tests/whatsapp-local-gateway.test.mjs
node --check scripts/freela-cockpit.mjs scripts/freela-cockpit-core.mjs scripts/freela-crm.mjs scripts/whatsapp-local-gateway.mjs scripts/paperclip-sync-agents.mjs
git -c core.fsmonitor=false status --short --branch
```

Expected:

- All tests pass.
- `node --check` prints no output.
- Git status shows only intended files before commit.

- [ ] **Step 5: Commit**

```bash
git add README.md tests/freela-cockpit.test.mjs
git commit -m "docs: document freela cockpit local usage" -m "Co-Authored-By: Paperclip <noreply@paperclip.ing>"
```

---

### Task 7: Manual Operational Smoke Test

**Files:**
- No new files required.

- [ ] **Step 1: Confirm worktree and DB health**

Run:

```bash
git -c core.fsmonitor=false status --short --branch
node scripts/freela-crm.mjs healthcheck
sqlite3 "/Users/luiz_fbm/Library/Application Support/freela-paperclip/db/freela.sqlite" "pragma integrity_check;"
```

Expected:

- Branch is the intended implementation branch.
- Healthcheck returns `SQLite healthcheck: ok`.
- Integrity check returns `ok`.

- [ ] **Step 2: Start the Cockpit**

Run:

```bash
node scripts/freela-cockpit.mjs
```

Expected stdout:

```text
Freela Cockpit: http://127.0.0.1:3200
```

- [ ] **Step 3: Validate API manually**

In a second terminal:

```bash
curl -s http://127.0.0.1:3200/api/summary | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const j=JSON.parse(s); if(!j.ok) process.exit(1); console.log(j.summary.nextStep)})'
curl -s http://127.0.0.1:3200/api/waha | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const j=JSON.parse(s); if(!j.ok) process.exit(1); console.log(j.waha.dispatchAmbiguous ?? 0)})'
```

Expected: both commands print a value and exit `0`.

- [ ] **Step 4: Browser smoke**

Open:

```text
http://127.0.0.1:3200
```

Check:

- Scorebar appears.
- Kanban columns appear.
- WAHA panel appears.
- Search field accepts text.
- Command preview returns structured JSON.
- Buttons show loading/disabled state during requests.

- [ ] **Step 5: Final commit if smoke required code changes**

If the smoke test required fixes, commit only those fixes:

```bash
git add scripts/freela-cockpit.mjs scripts/freela-cockpit-core.mjs dev/freela-cockpit tests/freela-cockpit.test.mjs README.md
git commit -m "fix: stabilize freela cockpit smoke path" -m "Co-Authored-By: Paperclip <noreply@paperclip.ing>"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Local app separated from Paperclip: Tasks 4 and 5.
- SQLite as source of truth: Tasks 1, 2, and 4.
- Writes through CLI: Task 3.
- Paperclip selective notification: Task 3 and Task 4 through sync runner.
- WAHA panel and delivery semantics: Tasks 1 and 5.
- Search all leads: Task 2.
- Command console with preview: Tasks 2, 4, and 5.
- Risk-based confirmations and loading states: Task 5.
- Externally moved leads revalidation: Task 3.
- Tests and verification: Tasks 1 through 7.

Placeholder scan:

- This plan contains no placeholder sections and no incomplete file paths.

Type consistency:

- Core functions use `leadId`, `canonicalName`, `commercialStage`, `readyLeadCards`, `deliveryPending`, `dispatchAmbiguous`, and `sentStrongAck` consistently across tests, API, and frontend.

Implementation risk notes:

- `followup_enviado` initially maps to `lead mark-contacted` because the existing CLI does not expose a distinct follow-up sent command in the inspected dispatch block. If implementation needs exact follow-up semantics, add a failing test for that gap before changing `scripts/freela-crm.mjs`.
- Worker routing for `respondeu`, `pediu_exemplo`, and `pediu_preco` is represented in MVP results as `agentRouted`; if full issue creation is required in the first implementation pass, add a dedicated task using existing handoff scripts before enabling the UI button for those actions.
