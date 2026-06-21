# WhatsApp Controlled Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build controlled automatic WhatsApp dispatch after a lead replies "Pode!", with Humanizer, Guardiao, Outbox approval, anti-duplicate dispatch, audit, and Luiz handoff gates.

**Architecture:** Keep `lharries/whatsapp-mcp` behind `scripts/whatsapp-local-gateway.mjs`. Paperclip workers can only write CRM/Outbox decisions; only the local gateway can call the bridge REST endpoint `/api/send`, and only for `whatsapp_outbox` rows approved by the Guardiao with `humanizer_pass = true`.

**Tech Stack:** Node.js ESM, `node:test`, `node:sqlite` `DatabaseSync`, SQLite at `.scratch/db/freela.sqlite`, Paperclip HTTP API, local WhatsApp bridge REST API at `http://127.0.0.1:8080/api/send`.

---

## File structure

- Modify `scripts/freela-crm.mjs`
  - Add Outbox metadata columns for Humanizer and context checks.
  - Add CLI flags to `whatsapp outbox propose`.
  - Strengthen Guardiao rules: Humanizer required, 5 automatic replies allowed, generic AI-ish text blocked, example link state gate, price qualification state.
  - Add helper functions for outbound/audit state changes used by gateway tests if needed.

- Modify `scripts/whatsapp-local-gateway.mjs`
  - Add `dispatch-approved-outbox`.
  - Add `watch-mcp-sqlite --dispatch-approved`.
  - Read approved Outbox rows from CRM SQLite.
  - Lock rows as `sending` before network calls.
  - Call WhatsApp bridge `/api/send` only from this gateway.
  - Mark `sent`, `failed`, or `handoff_luiz`.

- Modify `tests/freela-crm-cli.test.mjs`
  - Add tests for Outbox Humanizer metadata and Guardiao decisions.
  - Add tests for 5 automatic replies and generic response blocking.

- Modify `tests/whatsapp-local-gateway.test.mjs`
  - Add dry-run dispatch tests.
  - Add real dispatch test with a local HTTP server standing in for the bridge.
  - Add duplicate-send prevention and repeated failure tests.

- Modify `tests/paperclip-automation-contract.test.mjs`
  - Update contract from "gateway never references `/api/send`" to "only gateway may reference `/api/send`; workers/prompts/configs still cannot expose raw WhatsApp send tools."
  - Require current controlled automation spec to mention Humanizer, Outbox, Guardiao, and Gateway dispatch.

- Modify `docs/freelancer/paperclip/whatsapp-mcp-local.md`
  - Document dispatch commands and safety gates.

- Modify `docs/freelancer/paperclip/README.md`
  - Update WhatsApp automation section from read-only assisted to controlled automatic dispatch after approved Outbox.

- Modify `docs/freelancer/prompt-thread-whatsapp-atendimento.md`
  - Require Humanizer pass before Outbox.

- Modify `docs/freelancer/prompt-thread-whatsapp-guardiao.md`
  - Require `humanizer_pass = true`, contextual response, and 5-reply limit.

---

### Task 1: CRM contracts for Humanizer metadata

**Files:**
- Modify: `tests/freela-crm-cli.test.mjs`
- Modify: `scripts/freela-crm.mjs`

- [ ] **Step 1: Write failing tests for Outbox metadata**

Append these tests to `tests/freela-crm-cli.test.mjs` near the existing CRM CLI tests:

```js
test("whatsapp outbox records required humanizer and context metadata", () => {
  const root = makeRoot();
  assert.equal(runNode([crm, "--root", root, "init"]).status, 0);
  upsertLead(root, {
    canonical_name: "Aghata Massoterapia",
    phone_or_contact: "+55 27 99999-0000",
    recommended_offer: "Presenca Local em 72h",
  });
  ingestWhatsApp(root, {
    bridge_message_id: "wa-meta-001",
    chat_id: "5527999990000@s.whatsapp.net",
    sender_name: "Aghata Massoterapia",
    sender_phone: "+55 27 99999-0000",
    body: "Pode sim",
    received_at: "2026-06-21T09:30:00-03:00",
  });

  const propose = runNode([
    crm,
    "--root",
    root,
    "whatsapp",
    "outbox",
    "propose",
    "--name",
    "Aghata Massoterapia",
    "--body",
    "Vi aqui seu perfil e vou te mandar os 3 pontos de forma bem objetiva.",
    "--source",
    "atendimento-whatsapp",
    "--humanizer-pass",
    "true",
    "--used-last-inbound",
    "true",
    "--contextual-reply",
    "true",
    "--humanizer-notes",
    "removido tom de template",
  ]);
  assert.equal(propose.status, 0, propose.stderr);

  const db = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  const outbox = db.prepare("select * from whatsapp_outbox order by id desc limit 1").get();
  db.close();
  assert.equal(outbox.humanizer_pass, 1);
  assert.equal(outbox.used_last_inbound, 1);
  assert.equal(outbox.contextual_reply, 1);
  assert.equal(outbox.humanizer_notes, "removido tom de template");
});

test("whatsapp outbox propose defaults humanizer metadata to blocked values", () => {
  const root = makeRoot();
  assert.equal(runNode([crm, "--root", root, "init"]).status, 0);
  upsertLead(root, {
    canonical_name: "Aghata Massoterapia",
    phone_or_contact: "+55 27 99999-0000",
    recommended_offer: "Presenca Local em 72h",
  });
  ingestWhatsApp(root, {
    bridge_message_id: "wa-meta-002",
    chat_id: "5527999990000@s.whatsapp.net",
    sender_name: "Aghata Massoterapia",
    sender_phone: "+55 27 99999-0000",
    body: "Pode sim",
    received_at: "2026-06-21T09:31:00-03:00",
  });

  const propose = runNode([
    crm,
    "--root",
    root,
    "whatsapp",
    "outbox",
    "propose",
    "--name",
    "Aghata Massoterapia",
    "--body",
    "Claro, vou explicar melhor.",
    "--source",
    "atendimento-whatsapp",
  ]);
  assert.equal(propose.status, 0, propose.stderr);

  const db = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  const outbox = db.prepare("select * from whatsapp_outbox order by id desc limit 1").get();
  db.close();
  assert.equal(outbox.humanizer_pass, 0);
  assert.equal(outbox.used_last_inbound, 0);
  assert.equal(outbox.contextual_reply, 0);
});
```

If `makeRoot`, `runNode`, `crm`, or helper names differ in the current file, add these helpers at the top of `tests/freela-crm-cli.test.mjs` using the same local style:

```js
function upsertLead(root, lead) {
  const file = join(root, `lead-${Date.now()}-${Math.random()}.json`);
  writeFileSync(file, JSON.stringify([lead]));
  const result = runNode([crm, "--root", root, "lead", "upsert", "--file", file]);
  assert.equal(result.status, 0, result.stderr);
}

function ingestWhatsApp(root, event) {
  const file = join(root, `whatsapp-${Date.now()}-${Math.random()}.json`);
  writeFileSync(file, JSON.stringify(event));
  const result = runNode([crm, "--root", root, "whatsapp", "inbound", "ingest", "--file", file]);
  assert.equal(result.status, 0, result.stderr);
}
```

- [ ] **Step 2: Run tests to verify red**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs
```

Expected: FAIL with SQLite errors such as `no such column: humanizer_pass` or assertion failures showing metadata is missing.

- [ ] **Step 3: Add schema columns**

In `scripts/freela-crm.mjs`, extend the `whatsapp_outbox` table definition:

```sql
      humanizer_pass integer not null default 0,
      used_last_inbound integer not null default 0,
      contextual_reply integer not null default 0,
      humanizer_notes text,
      dispatch_error text,
      dispatch_locked_at text,
```

Then add idempotent migrations immediately after the existing `create table if not exists whatsapp_guardian_decisions` block:

```js
  ensureColumn(database, "whatsapp_outbox", "humanizer_pass", "integer not null default 0");
  ensureColumn(database, "whatsapp_outbox", "used_last_inbound", "integer not null default 0");
  ensureColumn(database, "whatsapp_outbox", "contextual_reply", "integer not null default 0");
  ensureColumn(database, "whatsapp_outbox", "humanizer_notes", "text");
  ensureColumn(database, "whatsapp_outbox", "dispatch_error", "text");
  ensureColumn(database, "whatsapp_outbox", "dispatch_locked_at", "text");
```

If `ensureColumn` does not exist yet, add this helper near the other schema helpers:

```js
function ensureColumn(database, tableName, columnName, definition) {
  const columns = database.prepare(`pragma table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) return;
  database.exec(`alter table ${tableName} add column ${columnName} ${definition}`);
}
```

- [ ] **Step 4: Parse CLI metadata flags**

In the `whatsapp outbox propose` command in `scripts/freela-crm.mjs`, replace the call to `proposeWhatsAppOutbox` with:

```js
    const outbox = proposeWhatsAppOutbox(database, lead, {
      body: flags.body,
      source: flags.source,
      humanizerPass: parseBooleanFlag(flags["humanizer-pass"]),
      usedLastInbound: parseBooleanFlag(flags["used-last-inbound"]),
      contextualReply: parseBooleanFlag(flags["contextual-reply"]),
      humanizerNotes: flags["humanizer-notes"] ?? "",
    });
```

Then change `proposeWhatsAppOutbox` insert SQL to:

```js
  database
    .prepare(
      `insert into whatsapp_outbox (
        lead_id, inbound_event_id, target_chat_id, body, source, status,
        humanizer_pass, used_last_inbound, contextual_reply, humanizer_notes, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      lead.id,
      inbound.id,
      inbound.chat_id,
      body,
      source,
      "pending_guardian",
      humanizerPass ? 1 : 0,
      usedLastInbound ? 1 : 0,
      contextualReply ? 1 : 0,
      clean(humanizerNotes),
      now(),
    );
```

Update the function signature:

```js
function proposeWhatsAppOutbox(
  database,
  lead,
  { body, source, humanizerPass = false, usedLastInbound = false, contextualReply = false, humanizerNotes = "" },
) {
```

- [ ] **Step 5: Run tests to verify green**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/freela-crm-cli.test.mjs scripts/freela-crm.mjs
git commit -m "feat: record whatsapp outbox humanizer metadata"
```

---

### Task 2: Guardiao rules for Humanizer, context, and 5 replies

**Files:**
- Modify: `tests/freela-crm-cli.test.mjs`
- Modify: `scripts/freela-crm.mjs`

- [ ] **Step 1: Write failing Guardiao tests**

Append these tests to `tests/freela-crm-cli.test.mjs`:

```js
test("whatsapp guardian blocks outbox without humanizer and context proof", () => {
  const root = makeRoot();
  assert.equal(runNode([crm, "--root", root, "init"]).status, 0);
  upsertLead(root, {
    canonical_name: "Aghata Massoterapia",
    phone_or_contact: "+55 27 99999-0000",
    recommended_offer: "Presenca Local em 72h",
  });
  ingestWhatsApp(root, {
    bridge_message_id: "wa-guard-001",
    chat_id: "5527999990000@s.whatsapp.net",
    sender_name: "Aghata Massoterapia",
    sender_phone: "+55 27 99999-0000",
    body: "Pode sim",
    received_at: "2026-06-21T10:00:00-03:00",
  });
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
      "Claro, com certeza. Vou explicar melhor.",
      "--source",
      "atendimento-whatsapp",
    ]).status,
    0,
  );

  const db = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  const outbox = db.prepare("select * from whatsapp_outbox order by id desc limit 1").get();
  db.close();

  const review = runNode([
    crm,
    "--root",
    root,
    "whatsapp",
    "guardian",
    "review",
    "--outbox-id",
    String(outbox.id),
  ]);
  assert.equal(review.status, 0, review.stderr);
  assert.match(review.stdout, /bloqueado/i);

  const after = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  const blocked = after.prepare("select * from whatsapp_outbox where id = ?").get(outbox.id);
  after.close();
  assert.equal(blocked.status, "blocked");
  assert.match(blocked.guardian_reason, /humanizer|context/i);
});

test("whatsapp guardian allows fifth automatic reply and blocks sixth", () => {
  const root = makeRoot();
  assert.equal(runNode([crm, "--root", root, "init"]).status, 0);
  upsertLead(root, {
    canonical_name: "Aghata Massoterapia",
    phone_or_contact: "+55 27 99999-0000",
    recommended_offer: "Presenca Local em 72h",
  });
  ingestWhatsApp(root, {
    bridge_message_id: "wa-guard-002",
    chat_id: "5527999990000@s.whatsapp.net",
    sender_name: "Aghata Massoterapia",
    sender_phone: "+55 27 99999-0000",
    body: "Pode sim",
    received_at: "2026-06-21T10:01:00-03:00",
  });

  const db = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  const lead = db.prepare("select * from leads where canonical_name = ?").get("Aghata Massoterapia");
  db.prepare("update lead_conversation_state set auto_replies_since_human = ? where lead_id = ?").run(4, lead.id);
  db.close();

  const fifth = proposeAndReviewSafeWhatsApp(root, "Aghata Massoterapia", "Te mando de forma objetiva: a pagina organiza apresentacao, servicos e caminho para WhatsApp.");
  assert.match(fifth.stdout, /aprovado/i);

  const sixth = proposeAndReviewSafeWhatsApp(root, "Aghata Massoterapia", "Nesse ponto e melhor o Luiz continuar com voce por aqui.");
  assert.match(sixth.stdout, /bloqueado/i);
});
```

Add this helper if it does not exist:

```js
function proposeAndReviewSafeWhatsApp(root, name, body) {
  const propose = runNode([
    crm,
    "--root",
    root,
    "whatsapp",
    "outbox",
    "propose",
    "--name",
    name,
    "--body",
    body,
    "--source",
    "atendimento-whatsapp",
    "--humanizer-pass",
    "true",
    "--used-last-inbound",
    "true",
    "--contextual-reply",
    "true",
  ]);
  assert.equal(propose.status, 0, propose.stderr);
  const db = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  const outbox = db.prepare("select * from whatsapp_outbox order by id desc limit 1").get();
  db.close();
  const review = runNode([
    crm,
    "--root",
    root,
    "whatsapp",
    "guardian",
    "review",
    "--outbox-id",
    String(outbox.id),
  ]);
  assert.equal(review.status, 0, review.stderr);
  return review;
}
```

- [ ] **Step 2: Run tests to verify red**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs
```

Expected: FAIL because Guardiao currently does not require Humanizer metadata and blocks at `>= 4` instead of after the fifth approved reply.

- [ ] **Step 3: Update Guardiao rules**

Replace `guardianRules` in `scripts/freela-crm.mjs` with:

```js
function guardianRules({ outbox, state }) {
  const body = normalizeName(outbox.body);
  const rules = [];

  if (!state) rules.push("lead sem estado de conversa WhatsApp");
  if (state?.whatsapp_state === "handoff_luiz") rules.push("lead em handoff_luiz");
  if (state?.whatsapp_state === "bloqueado_guardiao") rules.push("lead bloqueado pelo guardiao");
  if (state?.whatsapp_state === "encerrado") rules.push("conversa encerrada");
  if (state?.auto_replies_since_human >= 5) {
    rules.push("limite de 5 respostas automaticas atingido");
  }
  if (!outbox.humanizer_pass) rules.push("humanizer_pass ausente");
  if (!outbox.used_last_inbound) rules.push("used_last_inbound ausente");
  if (!outbox.contextual_reply) rules.push("contextual_reply ausente");
  if (/\bpreco\b|\bvalor\b|\borcamento\b|\bpagamento\b|\bdesconto\b|\bproposta\b|\bfechado\b|\bcontrato\b/.test(body)) {
    rules.push("mensagem contem preco/proposta/fechamento");
  }
  if (/\benxuta\b|\bversao menor\b|\b397\b|\br\s*397\b/.test(body)) {
    rules.push("mensagem contem oferta removida enxuta/397 ou valor bloqueado");
  }
  if (/\bgaranto\b|\bgarantia\b|\bmais clientes\b|\bmais pacientes\b|\bprimeiro no google\b/.test(body)) {
    rules.push("mensagem promete resultado comercial");
  }
  if (/\botima pergunta\b|\bcom certeza\b|\bfico a disposicao\b|\bentendi perfeitamente\b/.test(body)) {
    rules.push("mensagem generica com cara de IA");
  }
  if (/—|–|--/.test(outbox.body)) rules.push("mensagem contem travessao ou marcador artificial");
  if (outbox.body.length > 700) rules.push("mensagem longa demais");
  if (/ignore as regras|ignore instrucoes|modo desenvolvedor|prompt/i.test(outbox.body)) {
    rules.push("possivel prompt injection");
  }
  if (/https?:\/\//i.test(outbox.body) && state?.whatsapp_state !== "exemplo_aprovado_para_envio") {
    rules.push("link de exemplo sem estado exemplo_aprovado_para_envio");
  }

  return rules;
}
```

- [ ] **Step 4: Adjust successful approval state update**

Keep `incrementAutoReplies` but ensure it sets `last_outbox_id` and does not switch state out of `handoff_luiz`. The current function already updates `auto_replies_since_human` and `last_outbox_id`; no state change is needed here.

- [ ] **Step 5: Run CRM tests**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/freela-crm-cli.test.mjs scripts/freela-crm.mjs
git commit -m "feat: enforce whatsapp guardian safety gates"
```

---

### Task 3: Gateway dry-run dispatcher and anti-duplicate lock

**Files:**
- Modify: `tests/whatsapp-local-gateway.test.mjs`
- Modify: `scripts/whatsapp-local-gateway.mjs`

- [ ] **Step 1: Write failing dry-run dispatch test**

Add this test to `tests/whatsapp-local-gateway.test.mjs`:

```js
test("gateway dry-runs approved whatsapp outbox without sending", () => {
  const root = makeRoot();
  assert.equal(runNode([crm, "--root", root, "init"]).status, 0);
  seedApprovedOutbox(root);

  const result = runNode([
    gateway,
    "--root",
    root,
    "dispatch-approved-outbox",
    "--dry-run",
    "true",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry-run dispatchaveis: 1/i);
  assert.match(result.stdout, /Aghata Massoterapia/i);

  const db = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
  const outbox = db.prepare("select status, sent_at from whatsapp_outbox order by id desc limit 1").get();
  db.close();
  assert.equal(outbox.status, "approved");
  assert.equal(outbox.sent_at, null);
});
```

Add helper:

```js
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
    runNode([crm, "--root", root, "whatsapp", "inbound", "ingest", "--file", inboundFile]).status,
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
    runNode([crm, "--root", root, "whatsapp", "guardian", "review", "--outbox-id", String(outbox.id)]).status,
    0,
  );
}
```

- [ ] **Step 2: Run test to verify red**

Run:

```bash
node --test tests/whatsapp-local-gateway.test.mjs
```

Expected: FAIL with `Comando desconhecido: dispatch-approved-outbox`.

- [ ] **Step 3: Add command parser branch**

In `scripts/whatsapp-local-gateway.mjs`, add this branch after `import-mcp-sqlite`:

```js
  if (command === "dispatch-approved-outbox") {
    const result = dispatchApprovedOutbox(root, flags);
    if (parseBooleanFlag(flags["dry-run"])) {
      console.log(`Dry-run dispatchaveis: ${result.dispatchable}`);
      for (const item of result.items) {
        console.log(`- ${item.lead_name}: outbox ${item.id}`);
      }
    } else {
      console.log(`Enviados: ${result.sent}`);
      console.log(`Falhas: ${result.failed}`);
      console.log(`Ignorados: ${result.skipped}`);
    }
    return;
  }
```

- [ ] **Step 4: Add dry-run dispatcher helpers**

Add these helpers to `scripts/whatsapp-local-gateway.mjs`:

```js
function dispatchApprovedOutbox(root, flags) {
  const dryRun = parseBooleanFlag(flags["dry-run"]);
  const limit = parsePositiveInt(flags.limit || "10", "--limit");
  const crmDbPath = resolve(root, flags["crm-db"] || ".scratch/db/freela.sqlite");
  if (!existsSync(crmDbPath)) {
    throw new Error(`CRM SQLite nao encontrado: ${crmDbPath}`);
  }
  const database = new DatabaseSync(crmDbPath);
  try {
    const items = readDispatchableOutbox(database, limit);
    if (dryRun) return { dispatchable: items.length, items, sent: 0, failed: 0, skipped: 0 };
    return dispatchOutboxItems(database, items, flags);
  } finally {
    database.close();
  }
}

function readDispatchableOutbox(database, limit) {
  return database
    .prepare(
      `select
        o.*,
        l.canonical_name as lead_name,
        s.whatsapp_state
      from whatsapp_outbox o
      join leads l on l.id = o.lead_id
      left join lead_conversation_state s on s.lead_id = o.lead_id
      where o.status = 'approved'
        and o.guardian_decision = 'enviar'
        and o.humanizer_pass = 1
        and o.sent_at is null
        and coalesce(s.whatsapp_state, '') not in ('handoff_luiz', 'bloqueado_guardiao', 'encerrado')
      order by o.approved_at asc, o.id asc
      limit ?`,
    )
    .all(limit);
}

function dispatchOutboxItems(database, items, flags) {
  return { sent: 0, failed: 0, skipped: items.length, items };
}

function parseBooleanFlag(value) {
  return ["1", "true", "yes", "sim"].includes(clean(value).toLowerCase());
}
```

- [ ] **Step 5: Run gateway tests**

Run:

```bash
node --test tests/whatsapp-local-gateway.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/whatsapp-local-gateway.test.mjs scripts/whatsapp-local-gateway.mjs
git commit -m "feat: add whatsapp outbox dispatch dry run"
```

---

### Task 4: Real gateway dispatch through bridge REST API

**Files:**
- Modify: `tests/whatsapp-local-gateway.test.mjs`
- Modify: `scripts/whatsapp-local-gateway.mjs`

- [ ] **Step 1: Write failing real dispatch test**

Add imports to `tests/whatsapp-local-gateway.test.mjs`:

```js
import http from "node:http";
```

Add this helper:

```js
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
        requests.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : {} });
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
```

Add this async test:

```js
test("gateway dispatches approved outbox once through bridge api", async () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  const bridge = await withBridgeServer((req, res) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/api/send");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, message: "sent-by-test-bridge" }));
  });
  try {
    const result = runNode([
      gateway,
      "--root",
      root,
      "dispatch-approved-outbox",
      "--bridge-api-base",
      bridge.baseUrl,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Enviados: 1/i);
    assert.equal(bridge.requests.length, 1);
    assert.equal(bridge.requests[0].body.recipient, "5527999990000@s.whatsapp.net");
    assert.match(bridge.requests[0].body.message, /3 pontos/i);

    const db = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
    const outbox = db.prepare("select * from whatsapp_outbox order by id desc limit 1").get();
    const outbound = db.prepare("select * from interactions where lead_id = ? and direction = 'outbound'").all(outbox.lead_id);
    db.close();
    assert.equal(outbox.status, "sent");
    assert.ok(outbox.sent_at);
    assert.equal(outbox.bridge_message_id, "sent-by-test-bridge");
    assert.equal(outbound.length, 1);
  } finally {
    await bridge.close();
  }
});
```

- [ ] **Step 2: Run gateway tests to verify red**

Run:

```bash
node --test tests/whatsapp-local-gateway.test.mjs
```

Expected: FAIL because `dispatchOutboxItems` still skips items and does not call the bridge.

- [ ] **Step 3: Implement locking, bridge POST, sent audit**

In `scripts/whatsapp-local-gateway.mjs`, replace `dispatchOutboxItems` with:

```js
function dispatchOutboxItems(database, items, flags) {
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const item of items) {
    const locked = lockOutboxForDispatch(database, item.id);
    if (!locked) {
      skipped += 1;
      continue;
    }
    const result = sendBridgeMessage({
      bridgeApiBase: flags["bridge-api-base"] || process.env.WHATSAPP_BRIDGE_API_BASE || "http://127.0.0.1:8080",
      recipient: item.target_chat_id,
      message: item.body,
      timeoutMs: parsePositiveInt(flags["timeout-ms"] || "15000", "--timeout-ms"),
    });
    if (result.success) {
      markOutboxSent(database, item, result.messageId);
      sent += 1;
    } else {
      markOutboxFailed(database, item, result.error);
      failed += 1;
    }
  }
  return { sent, failed, skipped, items };
}
```

Add these helpers:

```js
function lockOutboxForDispatch(database, outboxId) {
  const result = database
    .prepare(
      `update whatsapp_outbox
       set status = 'sending', dispatch_locked_at = ?
       where id = ?
         and status = 'approved'
         and guardian_decision = 'enviar'
         and humanizer_pass = 1
         and sent_at is null`,
    )
    .run(new Date().toISOString(), outboxId);
  return result.changes === 1;
}

function sendBridgeMessage({ bridgeApiBase, recipient, message, timeoutMs }) {
  const url = new URL("/api/send", bridgeApiBase);
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Number(process.argv[4]));
        try {
          const response = await fetch(process.argv[1], {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipient: process.argv[2], message: process.argv[3] }),
            signal: controller.signal
          });
          const text = await response.text();
          if (!response.ok) {
            console.error(text || response.statusText);
            process.exit(1);
          }
          console.log(text);
        } catch (error) {
          console.error(error.message);
          process.exit(1);
        } finally {
          clearTimeout(timeout);
        }
      `,
      url.toString(),
      recipient,
      message,
      String(timeoutMs),
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    return { success: false, error: [result.stdout, result.stderr].filter(Boolean).join("\n").trim() };
  }
  const parsed = result.stdout ? JSON.parse(result.stdout) : {};
  return {
    success: parsed.success !== false,
    messageId: parsed.message || "",
    error: parsed.success === false ? parsed.message || "bridge retornou success=false" : "",
  };
}

function markOutboxSent(database, item, bridgeMessageId) {
  const sentAt = new Date().toISOString();
  database
    .prepare(
      `update whatsapp_outbox
       set status = 'sent', bridge_message_id = ?, sent_at = ?, failed_at = null, dispatch_error = null
       where id = ?`,
    )
    .run(bridgeMessageId, sentAt, item.id);
  database
    .prepare(
      `insert into interactions (
        lead_id, direction, channel, body, occurred_at, raw_file, classification, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(item.lead_id, "outbound", "whatsapp", item.body, sentAt, `whatsapp_outbox:${item.id}`, "automatico_enviado", sentAt);
  database
    .prepare(
      `update lead_conversation_state
       set last_outbox_id = ?, updated_at = ?
       where lead_id = ?`,
    )
    .run(item.id, sentAt, item.lead_id);
}

function markOutboxFailed(database, item, error) {
  const failedAt = new Date().toISOString();
  database
    .prepare(
      `update whatsapp_outbox
       set status = 'failed', attempts = attempts + 1, failed_at = ?, dispatch_error = ?
       where id = ?`,
    )
    .run(failedAt, clean(error).slice(0, 1000), item.id);
}
```

- [ ] **Step 4: Run gateway tests**

Run:

```bash
node --test tests/whatsapp-local-gateway.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/whatsapp-local-gateway.test.mjs scripts/whatsapp-local-gateway.mjs
git commit -m "feat: dispatch approved whatsapp outbox"
```

---

### Task 5: Failure threshold and Luiz handoff state

**Files:**
- Modify: `tests/whatsapp-local-gateway.test.mjs`
- Modify: `scripts/whatsapp-local-gateway.mjs`

- [ ] **Step 1: Write failing repeated failure test**

Add this test:

```js
test("gateway moves whatsapp lead to handoff after two dispatch failures", async () => {
  const root = makeRoot();
  seedApprovedOutbox(root);
  const bridge = await withBridgeServer((req, res) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: false, message: "bridge down" }));
  });
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = runNode([
        gateway,
        "--root",
        root,
        "dispatch-approved-outbox",
        "--bridge-api-base",
        bridge.baseUrl,
      ]);
      assert.equal(result.status, 0, result.stderr);
    }
    const db = new DatabaseSync(join(root, ".scratch/db/freela.sqlite"));
    const outbox = db.prepare("select * from whatsapp_outbox order by id desc limit 1").get();
    const state = db.prepare("select * from lead_conversation_state where lead_id = ?").get(outbox.lead_id);
    db.close();
    assert.equal(outbox.status, "failed");
    assert.equal(outbox.attempts, 2);
    assert.equal(state.whatsapp_state, "handoff_luiz");
    assert.match(state.handoff_reason, /falha no envio/i);
  } finally {
    await bridge.close();
  }
});
```

- [ ] **Step 2: Run gateway tests to verify red**

Run:

```bash
node --test tests/whatsapp-local-gateway.test.mjs
```

Expected: FAIL because failed rows are not retried and no handoff state is set.

- [ ] **Step 3: Include retryable failed rows**

Update `readDispatchableOutbox` in `scripts/whatsapp-local-gateway.mjs`:

```sql
      where o.status in ('approved', 'failed')
        and o.guardian_decision = 'enviar'
        and o.humanizer_pass = 1
        and o.sent_at is null
        and o.attempts < 2
```

Keep the state exclusion for `handoff_luiz`, `bloqueado_guardiao`, and `encerrado`.

- [ ] **Step 4: Allow lock from approved or failed**

Update `lockOutboxForDispatch`:

```sql
         and status in ('approved', 'failed')
         and attempts < 2
```

- [ ] **Step 5: Set handoff on second failure**

Replace `markOutboxFailed` with:

```js
function markOutboxFailed(database, item, error) {
  const failedAt = new Date().toISOString();
  database
    .prepare(
      `update whatsapp_outbox
       set status = 'failed', attempts = attempts + 1, failed_at = ?, dispatch_error = ?
       where id = ?`,
    )
    .run(failedAt, clean(error).slice(0, 1000), item.id);
  const updated = database.prepare("select * from whatsapp_outbox where id = ?").get(item.id);
  if (updated.attempts >= 2) {
    database
      .prepare(
        `update lead_conversation_state
         set whatsapp_state = 'handoff_luiz', handoff_reason = ?, updated_at = ?
         where lead_id = ?`,
      )
      .run(`falha no envio automatico WhatsApp: ${clean(error).slice(0, 300)}`, failedAt, item.lead_id);
  }
}
```

- [ ] **Step 6: Run gateway tests**

Run:

```bash
node --test tests/whatsapp-local-gateway.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tests/whatsapp-local-gateway.test.mjs scripts/whatsapp-local-gateway.mjs
git commit -m "feat: hand off failed whatsapp dispatches"
```

---

### Task 6: Watcher dispatch mode

**Files:**
- Modify: `tests/whatsapp-local-gateway.test.mjs`
- Modify: `scripts/whatsapp-local-gateway.mjs`

- [ ] **Step 1: Write source-level contract test for watcher flag**

Add this test to `tests/whatsapp-local-gateway.test.mjs`:

```js
test("watcher supports optional approved outbox dispatch flag", () => {
  const source = readFileSync(gateway, "utf8");
  assert.match(source, /--dispatch-approved|dispatch-approved/i);
  assert.match(source, /dispatchApprovedOutbox\(root, flags\)/);
});
```

- [ ] **Step 2: Run test to verify red**

Run:

```bash
node --test tests/whatsapp-local-gateway.test.mjs
```

Expected: FAIL until watcher calls dispatch.

- [ ] **Step 3: Update argument parser for boolean flags**

Replace the flag parsing loop in `parseArgs` in `scripts/whatsapp-local-gateway.mjs` with:

```js
  while (args.length) {
    const key = args.shift();
    if (!key.startsWith("--")) throw new Error(`Opcao invalida: ${key}`);
    const flagName = key.slice(2);
    const next = args[0];
    if (next === undefined || next.startsWith("--")) {
      flags[flagName] = "true";
      continue;
    }
    flags[flagName] = args.shift();
  }
```

- [ ] **Step 4: Dispatch after each import when flag is present**

Inside the `run` function in `watchMcpSqlite`, after logging import counters, add:

```js
      if (parseBooleanFlag(flags["dispatch-approved"])) {
        const dispatch = dispatchApprovedOutbox(root, flags);
        console.log(
          `[${new Date().toISOString()}] enviados=${dispatch.sent} dispatch_falhas=${dispatch.failed} dispatch_ignorados=${dispatch.skipped}`,
        );
      }
```

- [ ] **Step 5: Run gateway tests**

Run:

```bash
node --test tests/whatsapp-local-gateway.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/whatsapp-local-gateway.test.mjs scripts/whatsapp-local-gateway.mjs
git commit -m "feat: dispatch whatsapp outbox from watcher"
```

---

### Task 7: Update Paperclip contracts and worker prompts

**Files:**
- Modify: `tests/paperclip-automation-contract.test.mjs`
- Modify: `docs/freelancer/paperclip/whatsapp-mcp-local.md`
- Modify: `docs/freelancer/paperclip/README.md`
- Modify: `docs/freelancer/prompt-thread-whatsapp-atendimento.md`
- Modify: `docs/freelancer/prompt-thread-whatsapp-guardiao.md`

- [ ] **Step 1: Write failing contract updates**

In `tests/paperclip-automation-contract.test.mjs`, update `WhatsApp Gateway nao expoe envio cru aos workers comerciais` so it reads both specs and permits `/api/send` only in the gateway:

```js
test("WhatsApp Gateway e o unico ponto autorizado a chamar bridge send", () => {
  const gateway = read("scripts/whatsapp-local-gateway.mjs");
  const oldSpec = read("docs/superpowers/specs/2026-06-19-whatsapp-local-automation-design.md");
  const controlledSpec = read("docs/superpowers/specs/2026-06-21-whatsapp-controlled-automation-design.md");

  assert.match(gateway, /import-jsonl/i);
  assert.match(gateway, /import-mcp-sqlite/i);
  assert.match(gateway, /watch-mcp-sqlite/i);
  assert.match(gateway, /dispatch-approved-outbox/i);
  assert.match(gateway, /\/api\/send/i);
  assert.doesNotMatch(gateway, /send_message|send_file|send_audio_message/i);
  assert.match(oldSpec, /Outbox WhatsApp/i);
  assert.match(controlledSpec, /humanizer_pass = true/i);
  assert.match(controlledSpec, /scripts\/whatsapp-local-gateway\.mjs/i);
});
```

Add this new test:

```js
test("WhatsApp workers exigem Humanizer antes de qualquer Outbox automatica", () => {
  const atendimentoWa = read("docs/freelancer/prompt-thread-whatsapp-atendimento.md");
  const guardiaoWa = read("docs/freelancer/prompt-thread-whatsapp-guardiao.md");
  const guide = read("docs/freelancer/paperclip/whatsapp-mcp-local.md");

  assert.match(atendimentoWa, /humanizer/i);
  assert.match(atendimentoWa, /humanizer_pass\s*=\s*true/i);
  assert.match(atendimentoWa, /used_last_inbound\s*=\s*true/i);
  assert.match(atendimentoWa, /contextual_reply\s*=\s*true/i);
  assert.match(guardiaoWa, /humanizer_pass\s*=\s*true/i);
  assert.match(guardiaoWa, /5 respostas automaticas|5 respostas automáticas/i);
  assert.match(guide, /dispatch-approved-outbox/i);
  assert.match(guide, /--dispatch-approved/i);
});
```

- [ ] **Step 2: Run contract test to verify red**

Run:

```bash
node --test tests/paperclip-automation-contract.test.mjs
```

Expected: FAIL until docs/prompts mention the new dispatch and Humanizer contract.

- [ ] **Step 3: Update Atendimento WhatsApp prompt**

Add this block to `docs/freelancer/prompt-thread-whatsapp-atendimento.md` under "Regras":

```md
Humanizer obrigatorio:

- Antes de gravar qualquer resposta em `whatsapp_outbox`, aplique a skill `humanizer`.
- Grave somente a versao final humanizada.
- Ao chamar `node scripts/freela-crm.mjs whatsapp outbox propose`, use:
  - `--humanizer-pass true`
  - `--used-last-inbound true`
  - `--contextual-reply true`
- Se voce nao conseguir conectar a resposta ao ultimo inbound do lead, nao proponha Outbox. Acione handoff.
```

- [ ] **Step 4: Update Guardiao prompt**

Add this block to `docs/freelancer/prompt-thread-whatsapp-guardiao.md`:

```md
Humanizer e contexto:

- Bloqueie qualquer Outbox sem `humanizer_pass = true`.
- Bloqueie qualquer Outbox sem `used_last_inbound = true`.
- Bloqueie qualquer Outbox sem `contextual_reply = true`.
- Bloqueie resposta que sirva para qualquer lead, mesmo que esteja gramaticalmente correta.
- O limite e 5 respostas automaticas seguidas. Na sexta, acione `handoff_luiz`.
```

- [ ] **Step 5: Update WhatsApp local guide**

In `docs/freelancer/paperclip/whatsapp-mcp-local.md`, add:

````md
## Dispatch aprovado

Depois que Atendimento WhatsApp gerar Outbox com `humanizer_pass = true` e Guardiao aprovar, o Gateway pode despachar:

```bash
node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Documents/programacao/freela dispatch-approved-outbox --dry-run
node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Documents/programacao/freela dispatch-approved-outbox
```

Watcher com envio:

```bash
node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Documents/programacao/freela watch-mcp-sqlite --db /Users/luiz_fbm/Documents/programacao/freela/.scratch/whatsapp-mcp/whatsapp-bridge/store/messages.db --dispatch-approved --interval-ms 10000
```

Somente o Gateway chama `/api/send`. Workers continuam sem acesso a `send_message`, `send_file` e `send_audio_message`.
````

- [ ] **Step 6: Update Paperclip README**

In `docs/freelancer/paperclip/README.md`, change the WhatsApp section to state:

```md
Modo alvo: automacao controlada depois do "Pode!". O Gateway importa inbound, workers escrevem resposta candidata, Humanizer limpa o texto, Guardiao aprova, e somente `scripts/whatsapp-local-gateway.mjs dispatch-approved-outbox` chama o bridge `/api/send`.
```

- [ ] **Step 7: Run contract tests**

Run:

```bash
node --test tests/paperclip-automation-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add tests/paperclip-automation-contract.test.mjs docs/freelancer/paperclip/whatsapp-mcp-local.md docs/freelancer/paperclip/README.md docs/freelancer/prompt-thread-whatsapp-atendimento.md docs/freelancer/prompt-thread-whatsapp-guardiao.md
git commit -m "docs: document controlled whatsapp dispatch"
```

---

### Task 8: Final validation and Paperclip sync

**Files:**
- Modify only if tests reveal a narrow bug.

- [ ] **Step 1: Run full test suite for the touched surface**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs tests/paperclip-automation-contract.test.mjs tests/whatsapp-local-gateway.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Validate Paperclip JSON configs**

Run:

```bash
jq empty docs/freelancer/paperclip/*.json
```

Expected: no output and exit code 0.

- [ ] **Step 3: Syntax check scripts**

Run:

```bash
node --check scripts/freela-crm.mjs scripts/whatsapp-local-gateway.mjs scripts/paperclip-create-whatsapp-handoff.mjs scripts/paperclip-sync-agents.mjs
```

Expected: no output and exit code 0.

- [ ] **Step 4: Diff check**

Run:

```bash
git diff --check
```

Expected: no output and exit code 0.

- [ ] **Step 5: Dry-run real dispatcher against local CRM**

Run:

```bash
node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Documents/programacao/freela dispatch-approved-outbox --dry-run
```

Expected: command exits without sending. If no approved Outbox exists, output should show `Dry-run dispatchaveis: 0`.

- [ ] **Step 6: Dry-run agent sync**

Run:

```bash
node scripts/paperclip-sync-agents.mjs --dry-run
```

Expected: no destructive changes. Confirm it lists WhatsApp prompt/config changes if live IDs exist; if WhatsApp agents are still config-only, note that no live sync was applied.

- [ ] **Step 7: Apply Paperclip sync only if live WhatsApp agents exist**

Run only if Step 6 shows live agent IDs for WhatsApp Atendimento and Guardiao:

```bash
node scripts/paperclip-sync-agents.mjs --apply
```

Expected: Paperclip agent instructions updated. If WhatsApp agents are config-only, do not create them in this task; report that agent creation remains a separate operational step.

- [ ] **Step 8: Final status**

Run:

```bash
git status --short --branch
```

Expected: clean working tree after commits, or only intentional untracked runtime files under `.scratch/` ignored by git.

- [ ] **Step 9: Final commit if validation required fixes**

If Steps 1-8 required final fixes:

```bash
git add scripts/freela-crm.mjs scripts/whatsapp-local-gateway.mjs tests/freela-crm-cli.test.mjs tests/paperclip-automation-contract.test.mjs tests/whatsapp-local-gateway.test.mjs docs/freelancer/paperclip/whatsapp-mcp-local.md docs/freelancer/paperclip/README.md docs/freelancer/prompt-thread-whatsapp-atendimento.md docs/freelancer/prompt-thread-whatsapp-guardiao.md
git commit -m "fix: validate controlled whatsapp automation"
```

If no final fixes were required, do not create an empty commit.

---

## Self-review

Spec coverage:

- Fronteira de seguranca: Tasks 3, 4, 7.
- Estados/autonomia: Tasks 2, 5, 7.
- Humanizer obrigatorio: Tasks 1, 2, 7.
- Pedido de exemplo gate: Task 2 preserves link gate; Task 7 documents it.
- Executor de envio: Tasks 3, 4, 5, 6.
- Auditoria: Task 4 records outbound interaction; Task 5 records failure/handoff state.
- Contratos de teste: Tasks 1, 2, 3, 4, 5, 6, 7.
- Rollout/validation: Task 8.

Placeholder scan:

- No placeholder values are required. All commands, files, flags, statuses, and expected outputs are concrete.

Type consistency:

- Outbox metadata uses SQLite integer booleans: `humanizer_pass`, `used_last_inbound`, `contextual_reply`.
- Gateway uses `dispatchApprovedOutbox`, `readDispatchableOutbox`, `lockOutboxForDispatch`, `sendBridgeMessage`, `markOutboxSent`, and `markOutboxFailed` consistently.
- CLI flags use kebab case and map to camelCase in `proposeWhatsAppOutbox`.
