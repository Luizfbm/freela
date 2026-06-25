# WhatsApp Context Repetition Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block WhatsApp Outbox messages that repeat already-used lead context and route them back through the existing Jhon repair loop.

**Architecture:** The Guardiao review in `scripts/freela-crm.mjs` gets one new repairable rule that compares the current Outbox with the latest previous outbound message for the same lead. Worker prompts and Gateway wake descriptions remind Atendimento/Jhon to advance the conversation instead of recapping the diagnostic context. No schema migration is required.

**Tech Stack:** Node.js ESM scripts, `node:test`, SQLite via `node:sqlite`, Paperclip local issue wakes.

---

## File structure

- Modify `scripts/freela-crm.mjs`: add the context-recap rule, helper functions, and repairable-rule mapping.
- Modify `scripts/whatsapp-local-gateway.mjs`: add the short no-recap instruction to Atendimento and Jhon wake payloads.
- Modify `docs/freelancer/prompt-thread-whatsapp-atendimento.md`: add the style rule for Atendimento WhatsApp.
- Modify `docs/freelancer/prompt-thread-atendimento-clientes.md`: add the style rule for Jhon / Atendimento e Fechamento.
- Modify `docs/freelancer/prompt-thread-whatsapp-guardiao.md`: document the new block reason.
- Modify `tests/freela-crm-cli.test.mjs`: add focused Guardiao tests and repair wake coverage.
- Modify `tests/whatsapp-local-gateway.test.mjs`: assert the wake payload includes the no-recap reminder.
- Optionally update `tests/paperclip-automation-contract.test.mjs` only if existing prompt contract tests require new assertions.

---

### Task 1: Add failing Guardiao tests

**Files:**
- Modify: `tests/freela-crm-cli.test.mjs`

- [ ] **Step 1: Add tests for first message, repeated context, short reference, inbound echo, generic words, and repair wake**

Insert these tests after `test("whatsapp guardian aprova resposta segura e bloqueia preco/enxuta", ...)`:

```js
test("whatsapp guardian allows first contextual message with distinctive terms", () => {
  const root = makeWhatsAppLeadRoot("wa-context-recap-first-001", "Pode sim");

  const review = proposeAndReviewSafeWhatsApp(
    root,
    "Aghata Massoterapia",
    "Vi que voces comunicam pilates, fisioterapia e treino funcional. Posso te mandar os pontos por aqui.",
  );

  assert.match(review.stdout, /aprovado/i);
});

test("whatsapp guardian blocks repeated distinctive context from previous outbound", () => {
  const root = makeWhatsAppLeadRoot("wa-context-recap-block-001", "Pode sim");
  const first = proposeAndReviewSafeWhatsApp(
    root,
    "Aghata Massoterapia",
    "Vi que voces comunicam pilates, fisioterapia e treino funcional. Posso te mandar os pontos por aqui.",
  );
  assert.match(first.stdout, /aprovado/i);

  ingestWhatsApp(root, {
    bridge_message_id: "wa-context-recap-block-002",
    chat_id: "5527999990000@s.whatsapp.net",
    sender_name: "Aghata Massoterapia",
    sender_phone: "+55 27 99999-0000",
    body: "Certo",
    received_at: "2026-06-21T10:03:00-03:00",
  });

  const second = proposeAndReviewSafeWhatsApp(
    root,
    "Aghata Massoterapia",
    "A ideia e organizar pilates, fisioterapia, treino funcional, endereco e WhatsApp em uma pagina.",
  );

  assert.match(second.stdout, /bloqueado/i);
  const database = db(root);
  const outbox = database.prepare("select * from whatsapp_outbox order by id desc limit 1").get();
  database.close();
  assert.match(outbox.guardian_reason, /mensagem recapitula contexto ja usado/i);
});

test("whatsapp guardian allows short references instead of recapping previous context", () => {
  const root = makeWhatsAppLeadRoot("wa-context-recap-reference-001", "Pode sim");
  const first = proposeAndReviewSafeWhatsApp(
    root,
    "Aghata Massoterapia",
    "Vi que voces comunicam pilates, fisioterapia e treino funcional. Posso te mandar os pontos por aqui.",
  );
  assert.match(first.stdout, /aprovado/i);

  ingestWhatsApp(root, {
    bridge_message_id: "wa-context-recap-reference-002",
    chat_id: "5527999990000@s.whatsapp.net",
    sender_name: "Aghata Massoterapia",
    sender_phone: "+55 27 99999-0000",
    body: "Certo",
    received_at: "2026-06-21T10:04:00-03:00",
  });

  const second = proposeAndReviewSafeWhatsApp(
    root,
    "Aghata Massoterapia",
    "A ideia e deixar esse caminho mais claro em uma pagina curta, com endereco e botao direto para WhatsApp.",
  );

  assert.match(second.stdout, /aprovado/i);
});

test("whatsapp guardian allows repeated terms when latest inbound mentioned them", () => {
  const root = makeWhatsAppLeadRoot("wa-context-recap-inbound-001", "Pode sim");
  const first = proposeAndReviewSafeWhatsApp(
    root,
    "Aghata Massoterapia",
    "Vi que voces comunicam pilates, fisioterapia e treino funcional. Posso te mandar os pontos por aqui.",
  );
  assert.match(first.stdout, /aprovado/i);

  ingestWhatsApp(root, {
    bridge_message_id: "wa-context-recap-inbound-002",
    chat_id: "5527999990000@s.whatsapp.net",
    sender_name: "Aghata Massoterapia",
    sender_phone: "+55 27 99999-0000",
    body: "Seria para pilates e fisioterapia mesmo",
    received_at: "2026-06-21T10:05:00-03:00",
  });

  const second = proposeAndReviewSafeWhatsApp(
    root,
    "Aghata Massoterapia",
    "Perfeito. Nesse caso, pilates e fisioterapia podem aparecer como parte do mesmo caminho de contato.",
  );

  assert.match(second.stdout, /aprovado/i);
});

test("whatsapp guardian ignores generic operational words for context recap", () => {
  const root = makeWhatsAppLeadRoot("wa-context-recap-generic-001", "Pode sim");
  const first = proposeAndReviewSafeWhatsApp(
    root,
    "Aghata Massoterapia",
    "A pagina pode organizar Instagram, WhatsApp, endereco, contato e servicos.",
  );
  assert.match(first.stdout, /aprovado/i);

  ingestWhatsApp(root, {
    bridge_message_id: "wa-context-recap-generic-002",
    chat_id: "5527999990000@s.whatsapp.net",
    sender_name: "Aghata Massoterapia",
    sender_phone: "+55 27 99999-0000",
    body: "Entendi",
    received_at: "2026-06-21T10:06:00-03:00",
  });

  const second = proposeAndReviewSafeWhatsApp(
    root,
    "Aghata Massoterapia",
    "Sim. A pagina deixa Instagram, WhatsApp, endereco, contato e servicos em um caminho mais facil.",
  );

  assert.match(second.stdout, /aprovado/i);
});

test("context recap guardian block auto-wakes Jhon for repair", async () => {
  const root = makeWhatsAppLeadRoot("wa-context-recap-repair-001", "Pode sim");
  const first = proposeAndReviewSafeWhatsApp(
    root,
    "Aghata Massoterapia",
    "Vi que voces comunicam pilates, fisioterapia e treino funcional. Posso te mandar os pontos por aqui.",
  );
  assert.match(first.stdout, /aprovado/i);

  ingestWhatsApp(root, {
    bridge_message_id: "wa-context-recap-repair-002",
    chat_id: "5527999990000@s.whatsapp.net",
    sender_name: "Aghata Massoterapia",
    sender_phone: "+55 27 99999-0000",
    body: "Certo",
    received_at: "2026-06-21T10:07:00-03:00",
  });

  const outbox = proposeSafeWhatsApp(
    root,
    "Aghata Massoterapia",
    "A ideia e organizar pilates, fisioterapia, treino funcional, endereco e WhatsApp em uma pagina.",
  );

  const paperclip = await withPaperclipServer((req, res) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/api/companies/company-test/issues");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: "issue-jhon-context", identifier: "FRE-JHON-CONTEXT" }));
  });

  try {
    const review = await runAsync(root, [
      "whatsapp",
      "guardian",
      "review",
      "--outbox-id",
      String(outbox.id),
      "--auto-wake",
      "true",
      "--paperclip-api-base",
      paperclip.baseUrl,
      "--paperclip-company-id",
      "company-test",
      "--closer-agent-id",
      "agent-jhon-test",
    ]);

    assert.equal(review.status, 0, review.stderr);
    assert.match(review.stdout, /Guardiao: bloqueado/i);
    assert.match(review.stdout, /Wake Paperclip: created/i);
    assert.equal(paperclip.requests.length, 1);
    assert.equal(paperclip.requests[0].body.assigneeAgentId, "agent-jhon-test");
    assert.match(paperclip.requests[0].body.description, /mensagem recapitula contexto ja usado/i);

    const database = db(root);
    const wake = database.prepare("select * from whatsapp_worker_wakes order by id desc limit 1").get();
    database.close();
    assert.equal(wake.wake_type, "whatsapp_guardian_repair");
  } finally {
    await paperclip.close();
  }
});
```

- [ ] **Step 2: Run the focused test file and confirm the new tests fail**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs --test-name-pattern "context recap|distinctive context|generic operational"
```

Expected: the new blocking tests fail because `mensagem recapitula contexto ja usado` does not exist yet. Existing unrelated tests may be skipped by the pattern.

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/freela-crm-cli.test.mjs
git commit -m "test: cover whatsapp context recap guard"
```

---

### Task 2: Implement the Guardiao context-recap rule

**Files:**
- Modify: `scripts/freela-crm.mjs`
- Test: `tests/freela-crm-cli.test.mjs`

- [ ] **Step 1: Add constants near the other WhatsApp constants**

Add this near the existing WhatsApp rule constants:

```js
const WHATSAPP_CONTEXT_RECAP_REASON = "mensagem recapitula contexto ja usado";
const CONTEXT_RECAP_MIN_REPEATED_TERMS = 2;
const CONTEXT_RECAP_MIN_TERM_LENGTH = 5;
const CONTEXT_RECAP_STOPWORDS = new Set([
  "agora",
  "ainda",
  "antes",
  "aqui",
  "assim",
  "botao",
  "caminho",
  "claro",
  "cliente",
  "contato",
  "deixar",
  "direto",
  "endereco",
  "entendi",
  "exemplo",
  "ficar",
  "ficaria",
  "ideia",
  "instagram",
  "melhor",
  "mensagem",
  "pagina",
  "perfil",
  "pessoa",
  "pontos",
  "primeiro",
  "servico",
  "servicos",
  "simples",
  "sobre",
  "trabalho",
  "voce",
  "voces",
  "whatsapp",
]);
```

- [ ] **Step 2: Pass the database into `guardianRules`**

Change this call inside `reviewWhatsAppOutbox`:

```js
const rules = guardianRules({ outbox, lead, state });
```

to:

```js
const rules = guardianRules({ database, outbox, lead, state });
```

Change the function signature:

```js
function guardianRules({ outbox, state }) {
```

to:

```js
function guardianRules({ database, outbox, state }) {
```

- [ ] **Step 3: Add the rule inside `guardianRules`**

Insert this after the generic AI-tone check and before the dash/list checks:

```js
  if (contextRecapRepeatedTerms(database, outbox).length >= CONTEXT_RECAP_MIN_REPEATED_TERMS) {
    rules.push(WHATSAPP_CONTEXT_RECAP_REASON);
  }
```

- [ ] **Step 4: Add helper functions below `isNeutralPriceQualificationReply`**

Add:

```js
function contextRecapRepeatedTerms(database, outbox) {
  const previous = latestPreviousOutboundForContext(database, outbox);
  if (!previous?.body) return [];

  const previousTerms = extractContextRecapTerms(previous.body);
  if (previousTerms.size < CONTEXT_RECAP_MIN_REPEATED_TERMS) return [];

  const currentTerms = extractContextRecapTerms(outbox.body);
  if (currentTerms.size < CONTEXT_RECAP_MIN_REPEATED_TERMS) return [];

  const inboundTerms = latestInboundTermsForOutbox(database, outbox);
  return [...currentTerms]
    .filter((term) => previousTerms.has(term))
    .filter((term) => !inboundTerms.has(term))
    .sort();
}

function latestPreviousOutboundForContext(database, outbox) {
  return database
    .prepare(
      `select body
       from (
         select body, occurred_at as sort_at, id as sort_id
         from interactions
         where lead_id = ?
           and direction = 'outbound'
           and channel = 'whatsapp'
           and trim(coalesce(body, '')) != ''
         union all
         select body, coalesce(sent_at, delivered_at, approved_at, created_at) as sort_at, id as sort_id
         from whatsapp_outbox
         where lead_id = ?
           and id != ?
           and id < ?
           and status in ('approved', 'sent', 'delivery_pending', 'dispatch_ambiguous')
           and trim(coalesce(body, '')) != ''
       )
       order by sort_at desc, sort_id desc
       limit 1`,
    )
    .get(outbox.lead_id, outbox.lead_id, outbox.id, outbox.id);
}

function latestInboundTermsForOutbox(database, outbox) {
  if (!outbox.inbound_event_id) return new Set();
  const inbound = database
    .prepare("select body from whatsapp_inbound_events where id = ?")
    .get(outbox.inbound_event_id);
  return extractContextRecapTerms(inbound?.body || "");
}

function extractContextRecapTerms(value) {
  return new Set(
    normalizeName(value)
      .split(/\s+/)
      .map(clean)
      .filter((term) => term.length >= CONTEXT_RECAP_MIN_TERM_LENGTH)
      .filter((term) => !CONTEXT_RECAP_STOPWORDS.has(term)),
  );
}
```

- [ ] **Step 5: Make the rule repairable**

Add `WHATSAPP_CONTEXT_RECAP_REASON` to `hasRepairableGuardianRule`:

```js
function hasRepairableGuardianRule(rules) {
  return rules.some((rule) =>
    [
      "mensagem contem lista artificial",
      "mensagem contem travessao ou marcador artificial",
      "mensagem generica com cara de IA",
      "mensagem longa demais",
      WHATSAPP_CONTEXT_RECAP_REASON,
    ].includes(rule),
  );
}
```

- [ ] **Step 6: Run the focused tests**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs --test-name-pattern "context recap|distinctive context|generic operational"
```

Expected: PASS for all new context-recap tests.

- [ ] **Step 7: Run the broader CRM CLI tests**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Run syntax check**

Run:

```bash
node --check scripts/freela-crm.mjs
```

Expected: no output and exit code 0.

- [ ] **Step 9: Commit the implementation**

```bash
git add scripts/freela-crm.mjs tests/freela-crm-cli.test.mjs
git commit -m "feat: block repeated whatsapp context recaps"
```

---

### Task 3: Update worker prompts and Gateway wake payloads

**Files:**
- Modify: `docs/freelancer/prompt-thread-whatsapp-atendimento.md`
- Modify: `docs/freelancer/prompt-thread-atendimento-clientes.md`
- Modify: `docs/freelancer/prompt-thread-whatsapp-guardiao.md`
- Modify: `scripts/whatsapp-local-gateway.mjs`
- Modify: `tests/whatsapp-local-gateway.test.mjs`

- [ ] **Step 1: Add the style rule to Atendimento WhatsApp**

In `docs/freelancer/prompt-thread-whatsapp-atendimento.md`, under `Humanizer obrigatorio`, add:

```md
Continuidade natural:

- Contextualidade nao e recapitulacao.
- Use dados do lead para entender a conversa, mas nao repita a lista de servicos ou o diagnostico em toda resposta.
- Depois da primeira mencao, avance usando referencia curta: "esse caminho", "a pagina", "o exemplo" ou "isso".
- Se a resposta parecer que esta provando contexto de novo, reescreva antes de criar a Outbox.
```

- [ ] **Step 2: Add the style rule to Jhon / Atendimento e Fechamento**

In `docs/freelancer/prompt-thread-atendimento-clientes.md`, under `Regras de tom`, add:

```md
- Contextualidade nao e recapitulacao: depois de citar o nicho ou os servicos uma vez, nao repita essa lista em cada resposta.
- Em continuacoes, avance com referencias curtas como "esse caminho", "a pagina", "o exemplo" ou "isso".
- Se estiver reparando bloqueio do Guardiao por contexto repetido, mantenha a intencao comercial e corte a recapitulacao.
```

- [ ] **Step 3: Document the Guardiao block reason**

In `docs/freelancer/prompt-thread-whatsapp-guardiao.md`, add this under `Bloquear quando houver:`:

```md
- recapitulacao artificial de contexto ja usado, como repetir a mesma lista de servicos ou nicho da mensagem anterior sem o lead ter puxado isso no ultimo inbound;
```

Under `Loop seguro de bloqueio:`, add:

```md
- Bloqueio por `mensagem recapitula contexto ja usado` e reparavel: Jhon deve reformular avancando a conversa com referencias curtas, sem repetir o diagnostico.
```

- [ ] **Step 4: Add no-recap reminder to Atendimento wake payload**

In `scripts/whatsapp-local-gateway.mjs`, update `buildAtendimentoWakePayload` work lines:

```js
      "- Escrever resposta candidata curta, contextual e humanizada na Outbox WhatsApp.",
      "- Usar contexto real do lead no CRM antes de propor a resposta.",
      "- Nao recapitule o diagnostico anterior; responda ao ultimo inbound e avance uma etapa.",
      "- Nao envie WhatsApp. Nao chame bridge.",
      "- Depois da proposta, o Guardiao de Envio WhatsApp deve revisar antes de qualquer dispatch.",
```

- [ ] **Step 5: Add no-recap reminder to closer wake payload**

In `scripts/whatsapp-local-gateway.mjs`, update `buildCloserWakePayload` work lines:

```js
      "- Assumir como Atendimento e Fechamento quando houver preco, objeção, lead quente, bloqueio de guardiao ou handoff.",
      "- Preparar resposta comercial curta, contextual e segura; se precisar falar preco/proposta, manter criterio comercial.",
      "- Nao recapitule o diagnostico anterior; responda ao ultimo inbound e avance uma etapa.",
      "- Registrar a resposta ou proxima acao no CRM/Paperclip.",
      "- Nao envie WhatsApp. Nao chame bridge.",
```

- [ ] **Step 6: Add no-recap reminder to shared work lines**

In `workLinesForWhatsAppWake`, add the same reminder in the default route and closer route arrays:

```js
      "- Nao recapitule o diagnostico anterior; responda ao ultimo inbound e avance uma etapa.",
```

- [ ] **Step 7: Update Gateway tests**

Find the tests in `tests/whatsapp-local-gateway.test.mjs` that assert Paperclip wake descriptions for Atendimento and Jhon. Add assertions like:

```js
assert.match(
  paperclip.requests[0].body.description,
  /Nao recapitule o diagnostico anterior/i,
);
```

Use the actual request index already used in those tests. Do not add a new server fixture if the existing tests already inspect `paperclip.requests`.

- [ ] **Step 8: Run Gateway tests**

Run:

```bash
node --test tests/whatsapp-local-gateway.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Run prompt contract tests**

Run:

```bash
node --test tests/paperclip-automation-contract.test.mjs
```

Expected: PASS. If it fails because the contract test needs the new rule explicitly asserted, update that test with exact `assert.match` checks for `mensagem recapitula contexto ja usado` and `Nao recapitule o diagnostico anterior`.

- [ ] **Step 10: Run syntax check**

Run:

```bash
node --check scripts/whatsapp-local-gateway.mjs
```

Expected: no output and exit code 0.

- [ ] **Step 11: Commit prompt and wake updates**

```bash
git add docs/freelancer/prompt-thread-whatsapp-atendimento.md docs/freelancer/prompt-thread-atendimento-clientes.md docs/freelancer/prompt-thread-whatsapp-guardiao.md scripts/whatsapp-local-gateway.mjs tests/whatsapp-local-gateway.test.mjs tests/paperclip-automation-contract.test.mjs
git commit -m "docs: guide whatsapp workers away from recaps"
```

---

### Task 4: Final verification and push

**Files:**
- Verify: `scripts/freela-crm.mjs`
- Verify: `scripts/whatsapp-local-gateway.mjs`
- Verify: `tests/freela-crm-cli.test.mjs`
- Verify: `tests/whatsapp-local-gateway.test.mjs`
- Verify: `tests/paperclip-automation-contract.test.mjs`

- [ ] **Step 1: Run focused full verification**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs tests/whatsapp-local-gateway.test.mjs tests/paperclip-automation-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run syntax checks**

Run:

```bash
node --check scripts/freela-crm.mjs scripts/whatsapp-local-gateway.mjs
```

Expected: no output and exit code 0.

- [ ] **Step 3: Check worktree**

Run:

```bash
git -c core.fsmonitor=false status --short --branch
```

Expected: branch is `main` and only intentional files are staged or committed. Preserve unrelated user or agent changes.

- [ ] **Step 4: Push**

Run:

```bash
git push origin main
```

Expected: push succeeds. If rejected because `origin/main` moved, run:

```bash
git fetch origin
git rebase origin/main
git push origin main
```

Resolve only conflicts in files touched by this plan. Do not overwrite unrelated work.

---

## Self-review

Spec coverage:

- Guardiao block rule: Task 2.
- Repair path through Jhon: Task 1 repair wake test and Task 2 repairable-rule mapping.
- Worker instruction changes: Task 3.
- Gateway wake reminder: Task 3.
- Error handling for no previous outbound, inbound echo, and generic terms: Task 1 and Task 2 helpers.
- Verification: Task 4.

Completeness scan:

- The plan has concrete file paths, code snippets, commands, and expected outcomes.
- Test bodies, helper code, commands, and expected outcomes are explicit.

Type and name consistency:

- New reason string is `mensagem recapitula contexto ja usado` everywhere.
- New constant is `WHATSAPP_CONTEXT_RECAP_REASON`.
- New helper names are `contextRecapRepeatedTerms`, `latestPreviousOutboundForContext`, `latestInboundTermsForOutbox`, and `extractContextRecapTerms`.
