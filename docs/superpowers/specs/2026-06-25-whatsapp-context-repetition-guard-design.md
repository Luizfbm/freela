# WhatsApp context repetition guard design

## Context

WhatsApp workers currently prove that a reply is contextual by repeating lead-specific facts from the CRM, such as the niche, services, location, and contact path. That is useful in the first diagnostic message, but it becomes artificial when the same facts are repeated in later turns.

The desired behavior is:

- First mention: use real context to show that the message is specific.
- Later turns: advance the conversation with short references like "esse caminho", "a pagina", "o exemplo" or "isso".
- Guardiao should block obvious recaps that make the conversation feel automated.

This spec intentionally uses generic examples and does not include private lead details.

## Approved approach

Use a Guardiao-backed repair loop for repeated context.

The main change is a new review rule that blocks an Outbox when it recaps too much of the previous outbound message for the same lead. The block returns to the existing repair path: Jhon Snow / Atendimento e Fechamento rewrites the message, creates a new Outbox, and sends it back through Guardiao and Gateway.

## Rule

Add a new Guardiao rule:

```text
mensagem recapitula contexto ja usado
```

The rule triggers when all conditions are true:

- The current Outbox is not the first outbound WhatsApp message for that lead.
- The previous outbound message for the same lead contains lead-specific terms.
- The current Outbox repeats at least two lead-specific terms from that previous outbound.
- The latest inbound from the lead did not itself mention those repeated terms.

The rule must not trigger on generic operational words:

```text
whatsapp
instagram
pagina
site
endereco
exemplo
contato
servicos
```

The rule should focus on distinctive business/niche terms, service names, treatment names, and proper nouns extracted from recent outbound text.

## Example

Previous outbound:

```text
Vi que voces comunicam [servico A], [servico B] e [servico C] no perfil. Percebi alguns pontos simples para deixar modalidades, endereco e agendamento mais claros.
```

Bad next outbound:

```text
A ideia e organizar [servico A], [servico B], [servico C], endereco e WhatsApp em uma pagina.
```

Better next outbound:

```text
A ideia e deixar esse caminho mais claro em uma pagina curta, com endereco e botao direto para WhatsApp. Se fizer sentido, posso te mostrar um exemplo simples.
```

## Data flow

1. Atendimento WhatsApp or Jhon creates a candidate Outbox.
2. Guardiao loads:
   - current Outbox body;
   - current lead conversation state;
   - latest inbound for the Outbox;
   - latest previous outbound interaction or sent Outbox for the same lead.
3. Guardiao extracts distinctive terms from the previous outbound and current Outbox.
4. Guardiao subtracts generic words and terms present in the latest inbound.
5. If two or more distinctive repeated terms remain, Guardiao blocks with `mensagem recapitula contexto ja usado`.
6. Existing auto-wake creates a repair issue for Jhon because this is a repairable content issue.
7. Jhon rewrites the same intent without recapping the lead profile and returns to Guardiao.

## Worker instruction changes

Atendimento WhatsApp and Jhon should receive an explicit style rule:

```text
Contextualidade nao e recapitulacao. Use dados do lead para entender a conversa, mas nao repita a lista de servicos ou o diagnostico em toda resposta. Depois da primeira mencao, avance usando referencia curta: "esse caminho", "a pagina", "o exemplo" ou "isso".
```

Gateway wake descriptions should include the same reminder in shorter form:

```text
- Nao recapitule o diagnostico anterior; responda ao ultimo inbound e avance uma etapa.
```

Guardiao instructions should document the new block reason and the repair path.

## Error handling

- If there is no previous outbound message, do not trigger this rule.
- If the latest inbound repeats the terms, do not trigger this rule. The worker may mirror the lead naturally.
- If the current Outbox is blocked for price, link, handoff state, or another higher-risk rule, keep those existing reasons.
- This rule is repairable and should use the existing Jhon repair loop.
- If the repaired Outbox repeats context again for the same inbound, the existing repeated repair logic may escalate to Scout reanalysis.

## Testing

Add focused tests around Guardiao review:

- Allows first contextual message with service/niche terms.
- Blocks a second Outbox that repeats two distinctive terms from the previous outbound.
- Allows a second Outbox that replaces repeated service terms with short references.
- Allows repeated terms when the latest inbound mentioned them.
- Does not count generic words such as WhatsApp, Instagram, pagina, site, endereco, exemplo, contato, servicos.
- Confirms the new rule is repairable and routes to Jhon through the existing guardian repair path.

## Rollout

This is a small behavioral guard. It should ship with:

- prompt updates;
- Guardiao rule implementation;
- CLI tests;
- focused `node --check`;
- focused `node --test` for CRM/Gateway contracts.

No data migration is required.
