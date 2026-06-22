# WAHA Outbox-First Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move safe post-consent WhatsApp work from manual lead-cards to an Outbox-first flow using Humanizer, Guardiao, Gateway WAHA dispatch, and ACK-based follow-up.

**Architecture:** Keep SQLite as the source of truth and keep WAHA isolated behind `scripts/whatsapp-local-gateway.mjs`. The CRM decides what is manual vs Outbox-first; workers write candidates and Guardiao approves; only the Gateway sends, and Follow-up advances only after strong ACK.

**Tech Stack:** Node.js CLI, experimental `node:sqlite`, SQLite, Paperclip local API, WAHA Docker Compose, Node test runner.

---

## Scope

This plan implements controlled WAHA automation for safe flows only:

- Normal post-consent WhatsApp replies after the lead says "pode", "claro", "sim", or asks a safe contextual question.
- Approved demo/example link replies after QA has released `exemplo_aprovado_para_envio`.
- Follow-up state transitions based on real WAHA delivery state, not message preparation.

This plan does not automate:

- First cold outreach.
- Price, discount, proposal, payment, or closing.
- Objections that require commercial judgment.
- Any direct `/api/sendText` call.
- Reuse of `dispatch_ambiguous` Outboxes.

No real WhatsApp dispatch is part of implementation. Use dry-run for verification. A live send requires a separate operator approval.

## Files

- Modify: `scripts/freela-crm.mjs`
  - Classify and expose safe WAHA automation state.
  - Keep manual lead-cards for cold outreach and commercial exceptions.
  - Add a small CLI listing dispatchable Outboxes for operator/COO use.
  - Ensure follow-up surfaces use ACK state.
- Modify: `scripts/whatsapp-local-gateway.mjs`
  - Keep explicit `--outbox-id` as worker path.
  - Add a stronger batch dispatch guard if no `--outbox-id` is used.
  - Improve dry-run output for dispatchable Outboxes.
- Modify: `tests/freela-crm-cli.test.mjs`
  - Add CRM policy tests for Outbox-first vs manual lead-cards.
  - Add dispatchable Outbox listing tests.
  - Add ACK-gated follow-up/status tests.
- Modify: `tests/whatsapp-local-gateway.test.mjs`
  - Add gateway batch guard tests.
  - Add dry-run output tests.
- Modify: `tests/paperclip-automation-contract.test.mjs`
  - Freeze worker contracts for WAHA-full mode.
- Modify: `docs/freelancer/data-contract.md`
- Modify: `docs/freelancer/paperclip/README.md`
- Modify: `docs/freelancer/paperclip/whatsapp-waha-local.md`
- Modify: `docs/freelancer/prompt-thread-whatsapp-atendimento.md`
- Modify: `docs/freelancer/prompt-thread-whatsapp-guardiao.md`
- Modify: `docs/freelancer/prompt-thread-atendimento-clientes.md`
- Modify: `docs/freelancer/prompt-thread-followup-crm.md`
- Modify: `docs/freelancer/prompt-thread-coo-freelancer.md`
- Modify: relevant `docs/freelancer/paperclip/agent-*.json` capabilities only when the dry-run shows expected agent patches.

---

### Task 1: Freeze WAHA-Full Operating Contract

**Files:**
- Modify: `tests/paperclip-automation-contract.test.mjs`
- Modify after red: `docs/freelancer/data-contract.md`
- Modify after red: `docs/freelancer/paperclip/README.md`
- Modify after red: `docs/freelancer/paperclip/whatsapp-waha-local.md`

- [ ] **Step 1: Write the failing contract test**

Add this test near the current WhatsApp automation contract tests in `tests/paperclip-automation-contract.test.mjs`:

```js
test("WAHA pleno usa Outbox-first para respostas seguras e preserva manual para excecoes", () => {
  const dataContract = read("docs/freelancer/data-contract.md");
  const readme = paperclipReadme();
  const waha = read("docs/freelancer/paperclip/whatsapp-waha-local.md");

  for (const [name, doc] of [
    ["data-contract", dataContract],
    ["paperclip README", readme],
    ["WAHA local", waha],
  ]) {
    assert.match(doc, /Outbox-first|Outbox first|outbox-first/i, `${name} deve nomear o modo alvo`);
    assert.match(doc, /pos-consentimento|p[oó]s-consentimento|depois do "Pode/i, `${name} deve limitar a respostas apos consentimento`);
    assert.match(doc, /primeira abordagem fria.*manual|manual.*primeira abordagem fria/is, `${name} deve manter primeira abordagem manual`);
    assert.match(doc, /preco|preço|fechamento|proposta/i, `${name} deve preservar excecoes comerciais`);
    assert.match(doc, /ACK forte|DEVICE|READ|PLAYED/i, `${name} deve exigir ACK forte para entrega`);
    assert.match(doc, /dispatch_ambiguous/i, `${name} deve tratar ambiguidade como excecao operacional`);
    assert.doesNotMatch(doc, /\/api\/sendText.*permitido|permitido.*\/api\/sendText/i, `${name} nao pode liberar envio cru`);
  }
});
```

- [ ] **Step 2: Run the contract test to verify it fails**

Run:

```bash
node --test tests/paperclip-automation-contract.test.mjs
```

Expected: FAIL on missing `Outbox-first` or missing explicit post-consent/manual boundary text.

- [ ] **Step 3: Update the operating contract**

Add a short `Outbox-first WAHA mode` section to:

- `docs/freelancer/data-contract.md`
- `docs/freelancer/paperclip/README.md`
- `docs/freelancer/paperclip/whatsapp-waha-local.md`

Required text content:

```md
## Outbox-first WAHA mode

Quando WAHA estiver saudavel, respostas seguras pos-consentimento deixam de ir para lead-cards por padrao. O caminho alvo e:

1. Atendimento WhatsApp ou Jhon cria nova Outbox com `whatsapp outbox propose`.
2. Guardiao revisa a Outbox.
3. Gateway despacha somente com `dispatch-approved-outbox --provider waha --outbox-id [id]`.
4. Follow-up so considera enviado apos ACK forte: `DEVICE`, `READ`, `PLAYED` ou `ack >= 2`.

Continuam manuais: primeira abordagem fria, preco, desconto, proposta, pagamento, fechamento, objecao sensivel, Guardiao bloqueado, WAHA/Gateway falho, `delivery_pending` prolongado e `dispatch_ambiguous`.

Workers nunca chamam `/api/sendText` diretamente.
```

- [ ] **Step 4: Run the contract test to verify it passes**

Run:

```bash
node --test tests/paperclip-automation-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/paperclip-automation-contract.test.mjs docs/freelancer/data-contract.md docs/freelancer/paperclip/README.md docs/freelancer/paperclip/whatsapp-waha-local.md
git commit -m "Document WAHA outbox-first operating mode"
```

---

### Task 2: Add CRM Policy Tests For Manual vs Outbox-First

**Files:**
- Modify: `tests/freela-crm-cli.test.mjs`
- Modify after red: `scripts/freela-crm.mjs`

- [ ] **Step 1: Write failing tests**

Add tests near existing WhatsApp and lead-card tests in `tests/freela-crm-cli.test.mjs`:

```js
test("safe approved WhatsApp outbox keeps lead out of manual lead-cards", () => {
  const root = makeWhatsAppLeadRoot("wa-outbox-first-001", "Pode sim");

  const propose = run(root, [
    "whatsapp",
    "outbox",
    "propose",
    "--name",
    "Aghata Massoterapia",
    "--body",
    "Perfeito, vi aqui e tenho 3 pontos simples para te mandar.",
    "--source",
    "safe_post_consent_test",
    "--humanizer-pass",
    "true",
    "--used-last-inbound",
    "true",
    "--contextual-reply",
    "true",
  ]);
  assert.equal(propose.status, 0, propose.stderr);

  const outboxId = propose.stdout.match(/Outbox pendente de guardiao: (\\d+)/)?.[1];
  assert.ok(outboxId, propose.stdout);

  const review = run(root, ["whatsapp", "guardian", "review", "--outbox-id", outboxId]);
  assert.equal(review.status, 0, review.stderr);

  const exportResult = run(root, ["export", "paperclip-cards"]);
  assert.equal(exportResult.status, 0, exportResult.stderr);
  const cards = readFileSync(join(root, ".scratch/crm/paperclip-lead-cards.md"), "utf8");

  assert.doesNotMatch(cards, /Aghata Massoterapia/i);
  assert.match(cards, /Sem acoes manuais|Nenhuma acao manual|0 leads/i);
});

test("price and closing conversations stay manual even when WAHA is healthy", () => {
  const root = makeWhatsAppLeadRoot("wa-outbox-first-price-001", "Pode mandar a proposta?");

  const exportResult = run(root, ["export", "paperclip-cards"]);
  assert.equal(exportResult.status, 0, exportResult.stderr);
  const cards = readFileSync(join(root, ".scratch/crm/paperclip-lead-cards.md"), "utf8");

  assert.match(cards, /Aghata Massoterapia/i);
  assert.match(cards, /preco|preço|proposta|manual/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs
```

Expected: FAIL because safe approved Outbox still appears in manual lead-card surfaces or because the manual exception is not explicit.

- [ ] **Step 3: Implement minimal CRM policy**

In `scripts/freela-crm.mjs`, locate the paperclip card export path around the functions that write `.scratch/crm/paperclip-lead-cards.md`.

Add a helper:

```js
function isManualWhatsAppException(state) {
  const whatsappState = clean(state?.whatsapp_state);
  return [
    "preco_pedido",
    "lead_quente",
    "objecao_comercial",
    "handoff_luiz",
    "bloqueado_guardiao",
    "qualificacao_preco_pendente",
  ].includes(whatsappState);
}
```

Add a helper that checks whether a lead already has a safe Outbox path:

```js
function leadHasActiveSafeOutbox(database, leadId) {
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
```

In the card export filtering logic, skip manual cards when:

```js
if (leadHasActiveSafeOutbox(database, lead.id) && !isManualWhatsAppException(conversationState)) {
  continue;
}
```

Do not skip when `isManualWhatsAppException(conversationState)` is true.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/freela-crm-cli.test.mjs scripts/freela-crm.mjs
git commit -m "Route safe WhatsApp replies away from manual lead cards"
```

---

### Task 3: Add Dispatchable Outbox Listing

**Files:**
- Modify: `tests/freela-crm-cli.test.mjs`
- Modify after red: `scripts/freela-crm.mjs`
- Modify docs after green: `docs/freelancer/paperclip/README.md`

- [ ] **Step 1: Write a failing CLI test**

Add this test near the existing Outbox status tests:

```js
test("whatsapp outbox list-dispatchable exposes explicit ids for Gateway dispatch", () => {
  const root = makeWhatsAppLeadRoot("wa-list-dispatchable-001", "Pode sim");

  const propose = run(root, [
    "whatsapp",
    "outbox",
    "propose",
    "--name",
    "Aghata Massoterapia",
    "--body",
    "Perfeito, posso te mandar os 3 pontos por aqui.",
    "--source",
    "list_dispatchable_test",
    "--humanizer-pass",
    "true",
    "--used-last-inbound",
    "true",
    "--contextual-reply",
    "true",
  ]);
  assert.equal(propose.status, 0, propose.stderr);
  const outboxId = propose.stdout.match(/Outbox pendente de guardiao: (\\d+)/)?.[1];
  assert.ok(outboxId, propose.stdout);

  const review = run(root, ["whatsapp", "guardian", "review", "--outbox-id", outboxId]);
  assert.equal(review.status, 0, review.stderr);

  const list = run(root, ["whatsapp", "outbox", "list-dispatchable"]);
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, new RegExp(`Outbox ${outboxId}`));
  assert.match(list.stdout, /dispatch-approved-outbox --provider waha --outbox-id/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs
```

Expected: FAIL with unknown command `whatsapp outbox list-dispatchable`.

- [ ] **Step 3: Implement the command**

In `scripts/freela-crm.mjs`, add command routing beside the existing `whatsapp outbox status` branch:

```js
if (command[0] === "whatsapp" && command[1] === "outbox" && command[2] === "list-dispatchable") {
  return withDatabase(root, flags, { write: false }, (database) => listDispatchableOutbox(database, root));
}
```

Add implementation:

```js
function listDispatchableOutbox(database, root) {
  const rows = database
    .prepare(
      `select o.id, o.lead_id, o.body, o.target_chat_id, l.name, s.whatsapp_state
         from whatsapp_outbox o
         join leads l on l.id = o.lead_id
         left join lead_conversation_state s on s.lead_id = o.lead_id
        where o.status = 'approved'
          and o.humanizer_pass = 1
          and o.used_last_inbound = 1
          and o.contextual_reply = 1
          and coalesce(s.whatsapp_state, '') not in (
            'preco_pedido',
            'lead_quente',
            'objecao_comercial',
            'handoff_luiz',
            'bloqueado_guardiao',
            'qualificacao_preco_pendente',
            'encerrado'
          )
        order by o.id asc`,
    )
    .all();

  if (rows.length === 0) {
    console.log("Nenhuma Outbox aprovada e despachavel.");
    return;
  }

  for (const row of rows) {
    console.log(`Outbox ${row.id}: ${row.name}`);
    console.log(
      `  node scripts/whatsapp-local-gateway.mjs --root ${root} dispatch-approved-outbox --provider waha --outbox-id ${row.id}`,
    );
  }
}
```

If the local schema uses different boolean storage, adapt the equality to match the current `whatsapp_outbox` table.

- [ ] **Step 4: Document the command**

Add to `docs/freelancer/paperclip/README.md`:

```md
Para ver itens aprovados que podem sair pelo WAHA, use:

```bash
node scripts/freela-crm.mjs whatsapp outbox list-dispatchable
```

Cada linha deve ser enviada pelo Gateway com `--outbox-id` explicito.
```

- [ ] **Step 5: Run tests**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs tests/paperclip-automation-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/freela-crm.mjs tests/freela-crm-cli.test.mjs docs/freelancer/paperclip/README.md
git commit -m "Expose dispatchable WhatsApp outboxes"
```

---

### Task 4: Harden Gateway Batch Dispatch

**Files:**
- Modify: `tests/whatsapp-local-gateway.test.mjs`
- Modify after red: `scripts/whatsapp-local-gateway.mjs`
- Modify docs after green: `docs/freelancer/paperclip/whatsapp-waha-local.md`

- [ ] **Step 1: Write failing gateway tests**

Add tests near the dispatch flag validation tests:

```js
test("gateway refuses real batch dispatch without explicit confirmation", () => {
  const root = makeGatewayRoot("wa-batch-confirm-001");
  const gateway = join(rootDir, "scripts/whatsapp-local-gateway.mjs");

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
  const root = makeGatewayRoot("wa-batch-dry-run-001");
  const gateway = join(rootDir, "scripts/whatsapp-local-gateway.mjs");

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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test tests/whatsapp-local-gateway.test.mjs
```

Expected: FAIL because real batch dispatch currently does not require `--confirm-batch`.

- [ ] **Step 3: Implement `--confirm-batch` guard**

In `scripts/whatsapp-local-gateway.mjs`, add `confirm-batch` to the allowed flags for `dispatch-approved-outbox`.

Before selecting multiple Outboxes, add:

```js
const outboxId = clean(flags["outbox-id"]);
const dryRun = parseBooleanFlag(flags["dry-run"] ?? "false", "--dry-run");
const confirmBatch = parseBooleanFlag(flags["confirm-batch"] ?? "false", "--confirm-batch");

if (!outboxId && !dryRun && !confirmBatch) {
  throw new Error("--outbox-id ou --confirm-batch obrigatorio para dispatch real em lote");
}
```

Keep worker-facing docs saying workers must use `--outbox-id`; `--confirm-batch` is only for operator-assisted maintenance.

- [ ] **Step 4: Document the guard**

Add to `docs/freelancer/paperclip/whatsapp-waha-local.md`:

```md
Workers sempre usam `--outbox-id`. O modo em lote real exige `--confirm-batch true` e fica reservado para operacao assistida pelo operador/COO. Dry-run em lote continua permitido para auditoria.
```

- [ ] **Step 5: Run gateway tests**

Run:

```bash
node --test tests/whatsapp-local-gateway.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/whatsapp-local-gateway.mjs tests/whatsapp-local-gateway.test.mjs docs/freelancer/paperclip/whatsapp-waha-local.md
git commit -m "Require confirmation for batch WhatsApp dispatch"
```

---

### Task 5: Make Follow-up ACK-Gated

**Files:**
- Modify: `tests/freela-crm-cli.test.mjs`
- Modify after red: `scripts/freela-crm.mjs`
- Modify docs after green: `docs/freelancer/prompt-thread-followup-crm.md`

- [ ] **Step 1: Write failing tests**

Add tests near existing follow-up / paperclip card tests:

```js
test("delivery_pending outbox does not create follow-up as delivered", () => {
  const root = makeWhatsAppLeadRoot("wa-followup-pending-001", "Pode sim");
  const database = db(root);
  const lead = database.prepare("select * from leads").get();
  database
    .prepare(
      `insert into whatsapp_outbox
        (lead_id, target_chat_id, body, status, guardian_decision, humanizer_pass, used_last_inbound, contextual_reply, created_at, updated_at)
       values (?, ?, ?, 'delivery_pending', 'send', 1, 1, 1, datetime('now'), datetime('now'))`,
    )
    .run(lead.id, lead.phone_normalized, "Mensagem pendente");
  database.close();

  const status = run(root, ["status", "commercial"]);
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /delivery_pending|pendente/i);
  assert.doesNotMatch(status.stdout, /follow-up.*enviado/i);
});

test("sent outbox with strong ack can advance follow-up surface", () => {
  const root = makeWhatsAppLeadRoot("wa-followup-sent-001", "Pode sim");
  const database = db(root);
  const lead = database.prepare("select * from leads").get();
  database
    .prepare(
      `insert into whatsapp_outbox
        (lead_id, target_chat_id, body, status, guardian_decision, provider_message_id, delivery_ack, delivered_at, humanizer_pass, used_last_inbound, contextual_reply, created_at, updated_at)
       values (?, ?, ?, 'sent', 'send', 'msg-1', 'DEVICE', datetime('now'), 1, 1, 1, datetime('now'), datetime('now'))`,
    )
    .run(lead.id, lead.phone_normalized, "Mensagem entregue");
  database.close();

  const status = run(root, ["status", "commercial"]);
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /sent|DEVICE|entregue/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs
```

Expected: FAIL because commercial status/follow-up surfaces do not expose or respect delivery state clearly enough.

- [ ] **Step 3: Implement ACK-aware status**

In `scripts/freela-crm.mjs`, update commercial status/report generation to count:

```js
const whatsappDelivery = database
  .prepare(
    `select
       sum(case when status = 'approved' then 1 else 0 end) as approved,
       sum(case when status = 'delivery_pending' then 1 else 0 end) as delivery_pending,
       sum(case when status = 'dispatch_ambiguous' then 1 else 0 end) as dispatch_ambiguous,
       sum(case when status = 'sent' and (delivery_ack in ('DEVICE', 'READ', 'PLAYED') or coalesce(delivery_ack, '') >= '2') then 1 else 0 end) as sent_strong_ack
     from whatsapp_outbox`,
  )
  .get();
```

Add these counts to the relevant status object and text output:

```js
`WAHA aprovadas para envio: ${whatsappDelivery.approved ?? 0}`,
`WAHA pendentes de ACK: ${whatsappDelivery.delivery_pending ?? 0}`,
`WAHA ambiguas/handoff: ${whatsappDelivery.dispatch_ambiguous ?? 0}`,
`WAHA entregues com ACK forte: ${whatsappDelivery.sent_strong_ack ?? 0}`,
```

Do not mark follow-up as due from `delivery_pending` or `dispatch_ambiguous`.

- [ ] **Step 4: Update Follow-up worker prompt**

In `docs/freelancer/prompt-thread-followup-crm.md`, add:

```md
Follow-up de WhatsApp automatico so nasce de entrega real. `delivery_pending` aguarda ACK; `dispatch_ambiguous` vira gargalo operacional; `sent` so conta como enviado com ACK forte (`DEVICE`, `READ`, `PLAYED` ou `ack >= 2`).
```

- [ ] **Step 5: Run tests**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs tests/paperclip-automation-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/freela-crm.mjs tests/freela-crm-cli.test.mjs docs/freelancer/prompt-thread-followup-crm.md
git commit -m "Gate WhatsApp follow-up on delivery ACK"
```

---

### Task 6: Update Worker Contracts And Sync Agents

**Files:**
- Modify: `tests/paperclip-automation-contract.test.mjs`
- Modify after red: worker prompts and agent JSON files listed below.

- [ ] **Step 1: Write failing contract test**

Add to `tests/paperclip-automation-contract.test.mjs`:

```js
test("Workers conhecem modo Outbox-first WAHA pleno", () => {
  const docs = [
    ["COO", read("docs/freelancer/prompt-thread-coo-freelancer.md")],
    ["Atendimento WhatsApp", read("docs/freelancer/prompt-thread-whatsapp-atendimento.md")],
    ["Jhon", read("docs/freelancer/prompt-thread-atendimento-clientes.md")],
    ["Guardiao", read("docs/freelancer/prompt-thread-whatsapp-guardiao.md")],
    ["Follow-up", read("docs/freelancer/prompt-thread-followup-crm.md")],
  ];

  for (const [name, doc] of docs) {
    assert.match(doc, /Outbox-first|Outbox first|outbox-first/i, `${name} deve conhecer modo Outbox-first`);
    assert.match(doc, /primeira abordagem fria.*manual|manual.*primeira abordagem fria/is, `${name} deve preservar primeira abordagem manual`);
    assert.match(doc, /preco|preço|fechamento|proposta/i, `${name} deve preservar excecoes comerciais`);
    assert.match(doc, /dispatch-approved-outbox[\s\S]*--outbox-id|--outbox-id[\s\S]*dispatch-approved-outbox/i, `${name} deve exigir outbox id`);
    assert.doesNotMatch(doc, /\/api\/sendText.*diretamente permitido/i, `${name} nao pode liberar envio cru`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/paperclip-automation-contract.test.mjs
```

Expected: FAIL on missing Outbox-first text in one or more prompts.

- [ ] **Step 3: Update prompts**

Update:

- `docs/freelancer/prompt-thread-coo-freelancer.md`
- `docs/freelancer/prompt-thread-whatsapp-atendimento.md`
- `docs/freelancer/prompt-thread-atendimento-clientes.md`
- `docs/freelancer/prompt-thread-whatsapp-guardiao.md`
- `docs/freelancer/prompt-thread-followup-crm.md`

Use this canonical block, adapted per role:

```md
Modo WAHA pleno / Outbox-first:

- Respostas seguras pos-consentimento e demos ja aprovadas nao voltam para lead-cards por padrao.
- O caminho e nova Outbox, Guardiao e Gateway com `dispatch-approved-outbox --provider waha --outbox-id [id]`.
- Primeira abordagem fria, preco, proposta, pagamento, fechamento e objecao sensivel continuam manuais.
- `delivery_pending` nao e entrega; aguarde ACK.
- `dispatch_ambiguous` e falha operacional/handoff; nao reaproveite a mesma Outbox automaticamente.
- Nunca chame `/api/sendText`.
```

- [ ] **Step 4: Update capabilities if needed**

Update only these agent JSON files if the prompt change should be visible in the Paperclip agent cards:

- `docs/freelancer/paperclip/agent-coo-freelancer.json`
- `docs/freelancer/paperclip/agent-whatsapp-atendimento.json`
- `docs/freelancer/paperclip/agent-atendimento.json`
- `docs/freelancer/paperclip/agent-whatsapp-guardiao.json`
- `docs/freelancer/paperclip/agent-followup-crm.json`

Each updated `capabilities` should include a short phrase like:

```text
opera modo WAHA Outbox-first para respostas seguras pos-consentimento, preservando manual para primeira abordagem, preco e fechamento
```

- [ ] **Step 5: Run contract tests and JSON validation**

Run:

```bash
node --test tests/paperclip-automation-contract.test.mjs
jq empty docs/freelancer/paperclip/*.json
```

Expected: PASS.

- [ ] **Step 6: Sync live agents**

Run:

```bash
node scripts/paperclip-sync-agents.mjs --dry-run
```

Expected:

- Only expected prompt/capability-related agents show as changed.
- `adapterConfigPatches: 0` unless explicitly expected.
- No env, command, model, permission, or secret change.

Then:

```bash
node scripts/paperclip-sync-agents.mjs --apply
node scripts/paperclip-sync-agents.mjs --dry-run
```

Expected final dry-run:

```text
"changedAgents": 0
```

- [ ] **Step 7: Commit**

```bash
git add tests/paperclip-automation-contract.test.mjs docs/freelancer/prompt-thread-*.md docs/freelancer/paperclip/agent-*.json
git commit -m "Contextualize workers for WAHA outbox-first mode"
```

---

### Task 7: Final Verification And Paperclip Context

**Files:**
- No code files unless verification finds an issue.
- Paperclip comment on `[FRE-7](/FRE/issues/FRE-7)`.

- [ ] **Step 1: Run full validation**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs tests/paperclip-automation-contract.test.mjs tests/whatsapp-local-gateway.test.mjs
node --check scripts/freela-crm.mjs scripts/whatsapp-local-gateway.mjs scripts/paperclip-sync-agents.mjs
jq empty docs/freelancer/paperclip/*.json
WAHA_API_KEY=dummy WAHA_DASHBOARD_PASSWORD=dummy WHATSAPP_SWAGGER_PASSWORD=dummy WHATSAPP_WAHA_WEBHOOK_SECRET=dummy docker compose -f docker-compose.waha.yml config --quiet
git -c core.fsmonitor=false diff --check
node scripts/freela-crm.mjs healthcheck
sqlite3 "/Users/luiz_fbm/Library/Application Support/freela-paperclip/db/freela.sqlite" "pragma integrity_check;"
```

Expected:

- All tests pass.
- `node --check` prints no output.
- `jq empty` prints no output.
- Docker compose config exits `0`.
- `diff --check` prints no output.
- Healthcheck reports `SQLite healthcheck: ok`.
- SQLite integrity returns `ok`.

- [ ] **Step 2: Verify no real send was performed**

Run:

```bash
node scripts/freela-crm.mjs whatsapp outbox list-dispatchable
```

Expected: It may list approved Outboxes, but this command does not send. Do not run Gateway without explicit operator approval.

- [ ] **Step 3: Post concise Paperclip context**

Post a comment on `[FRE-7](/FRE/issues/FRE-7)`:

```md
## Contexto operacional: WAHA Outbox-first

Status: modo Outbox-first implementado e agentes sincronizados.

- Respostas seguras pos-consentimento e demos ja aprovadas agora seguem Outbox -> Guardiao -> Gateway com `--outbox-id`.
- Primeira abordagem fria, preco, proposta, pagamento, fechamento e objecoes sensiveis continuam manuais.
- Follow-up so avanca com ACK forte; `delivery_pending` aguarda e `dispatch_ambiguous` vira gargalo operacional.
- Nenhum WhatsApp real foi enviado nesta implementacao.
```

- [ ] **Step 4: Final commit if context/docs changed after previous task**

If Step 3 required only API comment, no commit is needed. If any repo files changed:

```bash
git status --short
git add scripts/freela-crm.mjs scripts/whatsapp-local-gateway.mjs tests/freela-crm-cli.test.mjs tests/whatsapp-local-gateway.test.mjs tests/paperclip-automation-contract.test.mjs docs/freelancer/data-contract.md docs/freelancer/paperclip/README.md docs/freelancer/paperclip/whatsapp-waha-local.md docs/freelancer/prompt-thread-coo-freelancer.md docs/freelancer/prompt-thread-whatsapp-atendimento.md docs/freelancer/prompt-thread-atendimento-clientes.md docs/freelancer/prompt-thread-whatsapp-guardiao.md docs/freelancer/prompt-thread-followup-crm.md docs/freelancer/paperclip/agent-coo-freelancer.json docs/freelancer/paperclip/agent-whatsapp-atendimento.json docs/freelancer/paperclip/agent-atendimento.json docs/freelancer/paperclip/agent-whatsapp-guardiao.json docs/freelancer/paperclip/agent-followup-crm.json
git commit -m "Verify WAHA outbox-first rollout"
```

- [ ] **Step 5: Push when requested**

Only if the operator asks for push:

```bash
git push
```

---

## Rollback

Rollback should not touch private `.scratch` data or SQLite manually.

If the flow causes operational confusion:

1. Revert the code commit that changed CRM lead-card routing or Gateway batch guard.
2. Keep WAHA transport hardening and docs unless they are the cause.
3. Run:

```bash
node --test tests/freela-crm-cli.test.mjs tests/paperclip-automation-contract.test.mjs tests/whatsapp-local-gateway.test.mjs
node scripts/paperclip-sync-agents.mjs --dry-run
```

4. If prompts/capabilities were reverted, run:

```bash
node scripts/paperclip-sync-agents.mjs --apply
node scripts/paperclip-sync-agents.mjs --dry-run
```

Expected final dry-run: `changedAgents: 0`.

## Acceptance Criteria

- Safe post-consent WhatsApp responses do not appear in manual `lead-cards` once they have an active safe Outbox path.
- Approved demo links use new Outbox, Guardiao, and Gateway with explicit `--outbox-id`.
- First cold outreach remains manual.
- Price, proposal, payment, closing, and sensitive objections remain manual.
- Gateway refuses real batch dispatch without either `--outbox-id` or explicit batch confirmation.
- Follow-up does not advance on `delivery_pending` or `dispatch_ambiguous`.
- Workers are synced and know the Outbox-first boundary.
- No real WhatsApp is sent during implementation without separate approval.
