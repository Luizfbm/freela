# Presenca Local Pricing Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace old Presenca Local price guidance with the approved R$ 297 policy, keep domain and maintenance optional, and prevent WhatsApp Outbox from sending any price automatically.

**Architecture:** The commercial policy lives in docs and worker prompts, with regression tests locking the active contract. Jhon Snow can prepare manual price responses from the authorized policy; Atendimento WhatsApp and Guardiao keep all automated Outbox replies price-free. Paperclip agent JSON mirrors get updated so live agent capabilities match the new prompts before syncing with `paperclip-sync-agents`.

**Tech Stack:** Markdown operational docs, Paperclip agent JSON mirrors, Node.js `node:test`, SQLite-backed CRM CLI, Paperclip sync CLI.

---

## File Structure

- Modify `tests/paperclip-automation-contract.test.mjs`: add pricing-policy contract tests and helper assertions for concrete money mentions.
- Modify `tests/freela-crm-cli.test.mjs`: add a regression case showing `R$ 297` is blocked by the WhatsApp Guardiao when placed in Outbox.
- Modify `docs/freelancer/ofertas.md`: replace old price ladder with the R$ 297 policy, 20/80 payment, optional domain, optional maintenance, and no worker discounts.
- Modify `docs/freelancer/playbook.md`: update the sales funnel summary to R$ 297 and 20/80, with domain/maintenance separated from the initial sale.
- Modify `docs/freelancer/objecoes.md`: keep proposal language aligned with R$ 297 and manual discount handling.
- Modify `AGENTS.md`: add the current pricing policy to the bootstrap context so future agents do not reintroduce old values.
- Modify `docs/freelancer/prompt-thread-atendimento-clientes.md`: teach Jhon Snow the current authorized manual price policy and revoked values.
- Modify `docs/freelancer/prompt-thread-whatsapp-atendimento.md`: explicitly keep Atendimento WhatsApp from mentioning even the current R$ 297.
- Modify `docs/freelancer/prompt-thread-whatsapp-guardiao.md`: explicitly block all prices in Outbox, including R$ 297, while keeping old values quarantined as revoked.
- Modify `docs/freelancer/prompt-thread-coo-freelancer.md`: keep Natienska from changing prices and route discount/policy changes to Luiz.
- Modify `docs/freelancer/paperclip/agent-atendimento.json`: update Jhon capability summary.
- Modify `docs/freelancer/paperclip/agent-whatsapp-atendimento.json`: update Atendimento WhatsApp capability summary.
- Modify `docs/freelancer/paperclip/agent-whatsapp-guardiao.json`: update Guardiao capability summary.
- Modify `docs/freelancer/paperclip/agent-coo-freelancer.json`: update COO capability summary.

## Task 1: Add Commercial Pricing Contract Tests

**Files:**
- Modify: `tests/paperclip-automation-contract.test.mjs`
- Test: `tests/paperclip-automation-contract.test.mjs`

- [ ] **Step 1: Add money-mention helpers near existing helper functions**

Insert this after `walkFiles(dir)` and before `execFileText(...)`:

```js
function concreteMoneyMentions(doc) {
  return [...doc.matchAll(/R\$\s*\d{1,3}(?:\.\d{3})?(?:,\d{2})?\+?/g)].map((match) => ({
    value: match[0],
    index: match.index ?? 0,
  }));
}

function priceMentionContext(doc, index) {
  return doc.slice(Math.max(0, index - 180), Math.min(doc.length, index + 180));
}

function assertNoUsableConcreteMoneyExceptCurrent(path, doc) {
  for (const mention of concreteMoneyMentions(doc)) {
    if (/^R\$\s*297$/i.test(mention.value)) continue;

    const context = priceMentionContext(doc, mention.index);
    assert.match(
      context,
      /revogad|bloquead|proibid|removid|historico|histórico|invalido|inválido|nao usar|não usar|oferta removida/i,
      `${path} menciona ${mention.value} sem marcar como valor revogado/bloqueado`,
    );
  }
}
```

- [ ] **Step 2: Add a failing pricing-policy test**

Insert this after the existing test `Presenca Local em 72h nao tem rota enxuta nem preco nos bots`:

```js
test("Presenca Local em 72h usa preco atual R$ 297 e quarentena valores antigos", () => {
  const docs = [
    ["AGENTS.md", read("AGENTS.md")],
    ["docs/freelancer/ofertas.md", read("docs/freelancer/ofertas.md")],
    ["docs/freelancer/playbook.md", read("docs/freelancer/playbook.md")],
    ["docs/freelancer/prompt-thread-atendimento-clientes.md", atendimento()],
    ["docs/freelancer/prompt-thread-coo-freelancer.md", cooFreelancer()],
    ["docs/freelancer/prompt-thread-whatsapp-atendimento.md", whatsappAtendimento()],
    ["docs/freelancer/prompt-thread-whatsapp-guardiao.md", read("docs/freelancer/prompt-thread-whatsapp-guardiao.md")],
  ];

  const ofertas = read("docs/freelancer/ofertas.md");
  const playbook = read("docs/freelancer/playbook.md");
  const atendimentoPrompt = atendimento();
  const whatsappPrompt = whatsappAtendimento();
  const guardiaoPrompt = read("docs/freelancer/prompt-thread-whatsapp-guardiao.md");
  const jhonAgent = agentConfig("agent-atendimento.json");
  const atendimentoWhatsappAgent = agentConfig("agent-whatsapp-atendimento.json");
  const guardiaoAgent = agentConfig("agent-whatsapp-guardiao.json");
  const cooAgent = agentConfig("agent-coo-freelancer.json");

  assert.match(ofertas, /Preco atual autorizado|Preço atual autorizado/i);
  assert.match(ofertas, /R\$\s*297/i);
  assert.match(ofertas, /20%\s+para iniciar|20%\s+de entrada/i);
  assert.match(ofertas, /80%\s+na entrega|80%\s+restante/i);
  assert.match(ofertas, /Dominio.*nao.*incluido|Domínio.*não.*incluído/i);
  assert.match(ofertas, /mensalidade.*opcional|manutencao mensal.*opcional|manutenção mensal.*opcional/i);
  assert.match(ofertas, /desconto.*Luiz|Luiz.*desconto/i);
  assert.match(playbook, /Preco atual|Preço atual/i);
  assert.match(playbook, /R\$\s*297/i);

  assert.match(atendimentoPrompt, /R\$\s*297/i);
  assert.match(atendimentoPrompt, /20%/i);
  assert.match(atendimentoPrompt, /80%/i);
  assert.match(atendimentoPrompt, /manual/i);
  assert.match(atendimentoPrompt, /desconto.*Luiz|Luiz.*desconto/i);
  assert.match(atendimentoPrompt, /R\$\s*897|R\$\s*1\.200|R\$\s*1\.500\+|R\$\s*797|R\$\s*397/i);
  assert.match(atendimentoPrompt, /revogad|bloquead|proibid|invalido|inválido/i);

  assert.match(whatsappPrompt, /nao fala preco|não fala preço/i);
  assert.match(whatsappPrompt, /R\$\s*297/i);
  assert.match(whatsappPrompt, /bloque|proibid|nao pode|não pode/i);

  assert.match(guardiaoPrompt, /R\$\s*297/i);
  assert.match(guardiaoPrompt, /bloque/i);
  assert.match(guardiaoPrompt, /R\$\s*397|397|enxuta/i);

  for (const [path, doc] of docs) {
    assertNoUsableConcreteMoneyExceptCurrent(path, doc);
  }

  assert.match(jhonAgent.capabilities, /R\$\s*297|preco atual|preço atual/i);
  assert.match(jhonAgent.capabilities, /manual/i);
  assert.match(jhonAgent.capabilities, /desconto.*Luiz|Luiz.*desconto/i);
  assert.match(atendimentoWhatsappAgent.capabilities, /nao fala preco|não fala preço|sem preço/i);
  assert.match(guardiaoAgent.capabilities, /R\$\s*297|preco atual|preço atual/i);
  assert.match(guardiaoAgent.capabilities, /bloqueia/i);
  assert.match(cooAgent.capabilities, /preco|preço/i);
  assert.match(cooAgent.capabilities, /Luiz/i);
});
```

- [ ] **Step 3: Run the focused contract test and verify it fails**

Run:

```bash
node --test tests/paperclip-automation-contract.test.mjs
```

Expected: FAIL. The failure should point to old usable values in `docs/freelancer/ofertas.md`, `docs/freelancer/playbook.md`, missing R$ 297 policy in Jhon/Guardiao prompts, or missing agent capability language.

## Task 2: Update Commercial Docs And Bootstrap Context

**Files:**
- Modify: `docs/freelancer/ofertas.md`
- Modify: `docs/freelancer/playbook.md`
- Modify: `docs/freelancer/objecoes.md`
- Modify: `AGENTS.md`
- Test: `tests/paperclip-automation-contract.test.mjs`

- [ ] **Step 1: Replace the Presenca Local price block in `docs/freelancer/ofertas.md`**

Replace the current `Preco sugerido:` block under `## Oferta: Presenca Local em 72h` with:

```md
Preco atual autorizado:

- R$ 297 para o escopo objetivo de Presenca Local em 72h.
- 20% de entrada para iniciar.
- 80% restantes na entrega.
- Desconto nao autorizado por worker; qualquer pedido de desconto passa para Luiz.

Valores revogados e invalidos:

- R$ 897.
- R$ 1.200.
- R$ 1.500+.
- R$ 797.
- R$ 397.

Se qualquer valor antigo aparecer em historico, issue, conversa, teste ou documento legado, trate apenas como referencia revogada.
```

- [ ] **Step 2: Tighten the included scope in `docs/freelancer/ofertas.md`**

Replace the `Inclui:` list for Presenca Local with:

```md
Inclui:

- Pagina simples de apresentacao local.
- Servicos principais.
- Regiao/localizacao quando publica, confirmada ou fornecida pelo lead.
- Botoes de WhatsApp e Instagram quando confirmados.
- Texto direto para organizar o caminho do Instagram, Google, indicacao ou link da bio ate o WhatsApp.
- Publicacao simples.
- 1 rodada pequena de ajustes.
```

Replace `Pode incluir, se combinado:` with:

```md
Pode virar decisao separada, se Luiz autorizar:

- Configuracao de dominio proprio.
- Email profissional, DNS complexo ou migracao.
- Copy longa ou muitas secoes.
- Mais paginas.
- Automacao, chatbot ou WhatsApp API.
- Suporte mensal ou manutencao recorrente.
```

- [ ] **Step 3: Replace the domain section in `docs/freelancer/ofertas.md`**

Replace the content below `### Dominio proprio` with:

```md
Regra:

- Dominio proprio nao esta incluido no R$ 297.
- Dominio proprio fica no CPF/CNPJ/e-mail do cliente.
- Cliente paga o dominio direto no registrador.
- Luiz pode orientar e configurar.
- Dominio nao precisa travar o inicio; primeiro pode publicar em link simples e apontar dominio depois.
- Se virar email profissional, DNS complexo, migracao ou suporte externo, vira decisao comercial separada.

Mensagem para o cliente:

> O dominio proprio nao precisa travar o inicio. Eu posso publicar primeiro e, se voce quiser deixar mais profissional, te oriento a registrar um dominio no seu nome. O dominio e pago direto por voce e fica no seu CPF/CNPJ/e-mail. Eu so configuro.
```

- [ ] **Step 4: Remove concrete optional-service prices from `docs/freelancer/ofertas.md`**

For `## Oferta 3: WhatsApp Business Organizado`, replace `Preco sugerido:` and its bullets with:

```md
Preco:

- Nao usar como preco automatico na conversa atual.
- Se virar trabalho avulso, Luiz define o valor manualmente.
- Pode entrar como diferencial da Presenca Local em 72h quando ajudar a fechar, sem aumentar escopo sem autorizacao.
```

For `## Oferta 4: Mensalidade simples`, replace `Preco sugerido:` and its bullets with:

```md
Preco:

- Nao oferecer antes de fechar a primeira entrega.
- Nao incluir no R$ 297 inicial.
- Se o cliente perguntar ou depois da entrega aprovada, Luiz define o valor conforme suporte necessario.
```

Replace the maintenance message with:

```md
Mensagem:

> A entrega nao te prende em mensalidade. Depois que estiver pronto, se voce quiser, posso cuidar de pequenas alteracoes, link, textos e suporte leve por uma manutencao mensal simples. Se preferir, tambem pode me chamar so quando precisar alterar algo.
```

For `## Oferta futura: Recepcao Digital WhatsApp`, replace `Preco futuro possivel:` and its bullets with:

```md
Preco futuro:

- Nao definir preco em conversa atual.
- Produto futuro ou upsell; qualquer valor depende de autorizacao manual de Luiz.
```

- [ ] **Step 5: Replace payment and discount rules in `docs/freelancer/ofertas.md`**

Replace the `## Pagamento` content with:

```md
## Pagamento

Padrao da Presenca Local em 72h:

- 20% de entrada para iniciar.
- 80% restantes na entrega.

Mensagem:

> Para esse formato, fica R$ 297. Para iniciar, peço 20% de entrada e o restante so na entrega, quando estiver pronto.
```

Replace the `## Desconto` content with:

```md
## Desconto

Regra:

- Worker nao autoriza desconto.
- Pedido de desconto passa para Luiz.
- Nao recuperar valores antigos como desconto ou oferta alternativa.
- Se o cliente pedir para caber melhor, reduzir escopo ou mudar condicao so com aprovacao de Luiz.

Mensagem segura:

> Sobre desconto, prefiro confirmar com o Luiz para nao te passar uma condicao errada. O formato atual da Presenca Local em 72h esta em R$ 297, com 20% para iniciar e o restante na entrega.
```

- [ ] **Step 6: Update `docs/freelancer/playbook.md` summary**

Replace:

```md
Preco alvo: R$ 897 a R$ 1.200.
```

with:

```md
Preco atual: R$ 297 para o escopo objetivo de Presenca Local em 72h.

Condicao atual: 20% para iniciar e 80% na entrega.

Dominio e manutencao: opcionais, tratados separadamente; dominio fica no nome do cliente e manutencao nao entra no fechamento inicial.
```

In the funil list, replace:

```md
8. Falar preco e condicao.
```

with:

```md
8. Falar preco e condicao manualmente: R$ 297, 20% para iniciar e 80% na entrega.
```

- [ ] **Step 7: Update proposal/objective language in `docs/freelancer/objecoes.md`**

In the "Me manda uma proposta" response, keep the structure but replace the price/payment lines with:

```md
Investimento: R$ 297
Entrada: 20% para iniciar
Restante: 80% na entrega
```

In objections about value or discount, add this sentence near the response:

```md
Desconto ou condicao diferente passa para Luiz; nao recuperar valores antigos como alternativa.
```

- [ ] **Step 8: Add pricing policy to `AGENTS.md`**

Under `Primary offer:`, after `Strong current package:`, add:

```md
- Current authorized price for `Presenca Local em 72h`: R$ 297.
- Payment condition: 20% to start and 80% on delivery.
- Discount requests go to Luiz; workers do not authorize discounts.
- Domain is optional, paid by the client, and stays under the client's CPF/CNPJ/e-mail.
- Monthly maintenance is optional after delivery approval; it is not part of the initial R$ 297 close.
- Revoked values: R$ 897, R$ 1.200, R$ 1.500+, R$ 797, R$ 397.
```

Under `Core rule:`, add:

```md
- Jhon Snow may prepare manual price responses with the current policy when the lead explicitly asks for price; Atendimento WhatsApp and Guardiao must keep Outbox price-free.
```

- [ ] **Step 9: Run the contract test and verify docs are now aligned except prompts/agents**

Run:

```bash
node --test tests/paperclip-automation-contract.test.mjs
```

Expected: still FAIL if prompts/agent JSON have not been updated yet. Failures should no longer come from `ofertas.md`, `playbook.md`, `objecoes.md`, or `AGENTS.md`.

## Task 3: Update Worker Prompts And Agent Mirrors

**Files:**
- Modify: `docs/freelancer/prompt-thread-atendimento-clientes.md`
- Modify: `docs/freelancer/prompt-thread-whatsapp-atendimento.md`
- Modify: `docs/freelancer/prompt-thread-whatsapp-guardiao.md`
- Modify: `docs/freelancer/prompt-thread-coo-freelancer.md`
- Modify: `docs/freelancer/paperclip/agent-atendimento.json`
- Modify: `docs/freelancer/paperclip/agent-whatsapp-atendimento.json`
- Modify: `docs/freelancer/paperclip/agent-whatsapp-guardiao.json`
- Modify: `docs/freelancer/paperclip/agent-coo-freelancer.json`
- Test: `tests/paperclip-automation-contract.test.mjs`

- [ ] **Step 1: Update Jhon Snow pricing instructions**

In `docs/freelancer/prompt-thread-atendimento-clientes.md`, replace this line:

```md
- Se ja houver valor autorizado pelo Luiz, escreva a resposta pronta com esse valor. Se nao houver valor autorizado no contexto, entregue a proxima acao para Luiz em vez de criar Outbox automatica.
```

with:

```md
- Preco atual autorizado para resposta manual: R$ 297 no escopo objetivo de Presenca Local em 72h, com 20% para iniciar e 80% na entrega.
- Essa resposta com preco continua manual; nao criar Outbox automatica quando houver preco, pagamento, desconto, proposta ou fechamento.
- Desconto ou condicao diferente passa para Luiz.
- Valores revogados e invalidos: R$ 897, R$ 1.200, R$ 1.500+, R$ 797 e R$ 397. Se aparecerem em historico, issue, conversa ou documento antigo, nao use como opcao comercial.
```

In the `Ofertas disponíveis` item `2. Presença Local em 72h`, replace the final price bullet with:

```md
   - preco manual autorizado quando o lead pedir valor: R$ 297, com 20% para iniciar e 80% na entrega;
   - desconto passa para Luiz;
   - nao criar Outbox automatica para preco, proposta, pagamento ou fechamento.
```

In the `5. Mensalidade simples` item, replace the current bullets with:

```md
   - manutencao leve, ajustes, textos, pequenas atualizacoes e acompanhamento;
   - opcional depois da entrega aprovada ou se o cliente perguntar;
   - nao entra no R$ 297 inicial;
   - Luiz define valor e condicao quando fizer sentido.
```

- [ ] **Step 2: Update Atendimento WhatsApp prompt**

In `docs/freelancer/prompt-thread-whatsapp-atendimento.md`, after:

```md
- Nao fala preco, valor, desconto, pagamento, proposta ou fechamento.
```

add:

```md
- Mesmo o preco atual autorizado de R$ 297 e proibido na Outbox. Se o lead pedir valor, pare e devolva para Jhon Snow / Atendimento e Fechamento.
```

- [ ] **Step 3: Update Guardiao prompt**

In `docs/freelancer/prompt-thread-whatsapp-guardiao.md`, replace:

```md
- preco, valor, desconto, proposta, fechamento, pagamento ou contrato;
- "R$ 397", "397", "enxuta" ou oferta removida;
```

with:

```md
- preco, valor, desconto, proposta, fechamento, pagamento ou contrato;
- qualquer valor concreto em Outbox, incluindo o preco atual R$ 297;
- "R$ 397", "397", "enxuta" ou oferta removida/revogada;
```

After `Nunca:` add this bullet:

```md
- liberar R$ 297 pela Outbox; esse valor existe apenas para resposta manual de fechamento.
```

- [ ] **Step 4: Update COO prompt**

In `docs/freelancer/prompt-thread-coo-freelancer.md`, after the existing `- nao muda preco;` bullet, add:

```md
- politica atual de preco: Presenca Local em 72h custa R$ 297, com 20% para iniciar e 80% na entrega; desconto, dominio complexo ou manutencao mensal passam para Luiz;
- valores revogados: R$ 897, R$ 1.200, R$ 1.500+, R$ 797 e R$ 397;
```

- [ ] **Step 5: Update Paperclip agent JSON capability summaries**

In `docs/freelancer/paperclip/agent-atendimento.json`, update `capabilities` so it includes:

```text
usa politica atual de preco manual da Presenca Local em 72h: R$ 297, 20% para iniciar e 80% na entrega; desconto passa para Luiz; valores antigos R$ 897, R$ 1.200, R$ 1.500+, R$ 797 e R$ 397 sao revogados
```

In `docs/freelancer/paperclip/agent-whatsapp-atendimento.json`, update `capabilities` so it includes:

```text
nao fala preco, incluindo R$ 297, e devolve pedido de valor para Jhon/fechamento
```

In `docs/freelancer/paperclip/agent-whatsapp-guardiao.json`, update `capabilities` so it includes:

```text
bloqueia qualquer preco na Outbox, incluindo R$ 297, e mantem R$ 397/enxuta como oferta revogada
```

In `docs/freelancer/paperclip/agent-coo-freelancer.json`, update `capabilities` so it includes:

```text
preserva politica de preco aprovada por Luiz: R$ 297, 20/80, sem desconto por worker, dominio e manutencao separados
```

- [ ] **Step 6: Run the contract test and verify it passes**

Run:

```bash
node --test tests/paperclip-automation-contract.test.mjs
```

Expected: PASS.

## Task 4: Add Current-Price Guardiao CLI Regression

**Files:**
- Modify: `tests/freela-crm-cli.test.mjs`
- Test: `tests/freela-crm-cli.test.mjs`

- [ ] **Step 1: Add R$ 297 to the currency-blocking cases**

In `test("whatsapp guardian blocks currency and investment value phrases", () => {`, change the cases array to:

```js
  const cases = [
    ["wa-guard-value-001", "Fica R$ 1200 para fazer."],
    ["wa-guard-value-002", "O investimento fica em 1200 reais."],
    ["wa-guard-value-003", "Fica 1200 para fazer."],
    ["wa-guard-value-004", "Fica R$ 297 para fazer."],
  ];
```

- [ ] **Step 2: Run the focused CRM test**

Run:

```bash
node --test tests/freela-crm-cli.test.mjs
```

Expected: PASS. The production Guardiao already blocks concrete currency through `containsCommercialValue`; this test locks the current authorized price out of Outbox automation.

## Task 5: Sync Agents And Verify Full Contract

**Files:**
- Verify: `scripts/paperclip-sync-agents.mjs`
- Verify: `tests/paperclip-automation-contract.test.mjs`
- Verify: `tests/freela-crm-cli.test.mjs`
- Verify: `scripts/freela-crm.mjs`

- [ ] **Step 1: Run syntax checks for touched scripts**

Run:

```bash
node --check scripts/freela-crm.mjs scripts/paperclip-sync-agents.mjs
```

Expected: both scripts pass syntax checks.

- [ ] **Step 2: Run focused tests**

Run:

```bash
node --test tests/paperclip-automation-contract.test.mjs tests/freela-crm-cli.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Review Paperclip sync dry-run**

Run:

```bash
node scripts/paperclip-sync-agents.mjs --dry-run
```

Expected: diff shows only capability/prompt-related updates for the touched agents. If the dry-run shows empty `adapterConfig` or unrelated destructive changes, stop and inspect before applying.

- [ ] **Step 4: Apply Paperclip sync**

Run:

```bash
node scripts/paperclip-sync-agents.mjs --apply
```

Expected: live Paperclip agents receive the updated capability summaries/instruction references. No model, command, budget, runtime, or secrets are changed.

- [ ] **Step 5: Confirm sync is clean**

Run:

```bash
node scripts/paperclip-sync-agents.mjs --dry-run
```

Expected: no pending agent changes.

- [ ] **Step 6: Export CRM mirrors if operational docs changed state**

Run only if CRM state was changed during implementation:

```bash
node scripts/freela-crm.mjs export all
```

Expected: export succeeds. If no CRM state changed, skip this step and state that it was not needed.

## Task 6: Commit And Push Implementation

**Files:**
- Commit all files changed by Tasks 1 through 5.

- [ ] **Step 1: Inspect final worktree**

Run:

```bash
git -c core.fsmonitor=false status --short --branch
git -c core.fsmonitor=false diff --stat
```

Expected: only pricing-policy docs, prompts, agent JSON mirrors, and tests are modified.

- [ ] **Step 2: Stage scoped changes**

Run:

```bash
git add AGENTS.md docs/freelancer/ofertas.md docs/freelancer/playbook.md docs/freelancer/objecoes.md docs/freelancer/prompt-thread-atendimento-clientes.md docs/freelancer/prompt-thread-whatsapp-atendimento.md docs/freelancer/prompt-thread-whatsapp-guardiao.md docs/freelancer/prompt-thread-coo-freelancer.md docs/freelancer/paperclip/agent-atendimento.json docs/freelancer/paperclip/agent-whatsapp-atendimento.json docs/freelancer/paperclip/agent-whatsapp-guardiao.json docs/freelancer/paperclip/agent-coo-freelancer.json tests/paperclip-automation-contract.test.mjs tests/freela-crm-cli.test.mjs
```

Expected: staged diff contains no private CRM rows, phone numbers from private conversations, secrets, or demo/customer private data.

- [ ] **Step 3: Commit**

Run:

```bash
git commit -m "chore: align Presenca Local pricing policy"
```

Expected: commit succeeds.

- [ ] **Step 4: Push**

Run:

```bash
git push origin main
```

Expected: `main` pushes to `origin/main`.

- [ ] **Step 5: Confirm clean worktree**

Run:

```bash
git -c core.fsmonitor=false status --short --branch
```

Expected: `## main...origin/main` with no modified/untracked files.

## Self-Review

- Spec coverage: current R$ 297, 20/80 payment, revoked values, domain, maintenance, worker behavior, Outbox block, tests, Paperclip sync, commit, and push are covered.
- Placeholder scan: this plan contains no open-ended implementation gaps.
- Scope check: this is one coherent operational contract update; no separate subsystem plan is needed.
- Type consistency: all commands use existing Node test/CLI scripts and existing Paperclip agent mirror filenames.
