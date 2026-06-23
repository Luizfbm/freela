# Presenca Local Pricing Policy Design

## Goal

Align the commercial contract for `Presenca Local em 72h` around one current price policy, remove old price references from worker behavior, and keep WhatsApp automation from sending price or closing messages automatically.

## Current Decision

`Presenca Local em 72h` has one current authorized price for the standard objective scope:

- Price: R$ 297.
- Entry payment: 20% to start.
- Remaining payment: 80% on delivery.
- Discount: not authorized for workers; any discount request goes to Luiz.
- Revoked values: R$ 897, R$ 1.200, R$ 1.500+, R$ 797, R$ 397.

Workers must treat revoked values as historical and invalid, even if they appear in old docs, old tests, old CRM history, previous issue comments, or previous conversations.

## Scope Boundary

The R$ 297 offer is intentionally narrow. It covers a simple local presence page focused on clarity and WhatsApp contact, not a broad web project.

Included in the standard scope:

- One simple presentation page.
- Main services.
- Region or location text when publicly confirmed or provided by the lead.
- WhatsApp and Instagram links when confirmed.
- Direct copy to organize the path from Instagram, Google, referral, or bio link to WhatsApp.
- Simple publication.
- One small adjustment round.

Not included unless Luiz explicitly authorizes:

- Domain cost.
- Professional email setup.
- Complex DNS or migration work.
- Long copywriting project.
- Multiple large sections or multiple pages.
- Automation, chatbot, or WhatsApp API.
- Monthly content, social posts, traffic campaigns, or ongoing support.
- Any discount.

## Domain Policy

Domain is optional and must not block the first sale.

Default positioning:

```text
O dominio proprio nao precisa travar o inicio. Eu posso publicar primeiro e, se voce quiser deixar mais profissional, te oriento a registrar um dominio no seu nome. O dominio e pago direto por voce e fica no seu CPF/CNPJ/e-mail. Eu so configuro.
```

Operational rules:

- Domain cost is not included in the R$ 297.
- The domain must stay under the client's CPF/CNPJ/e-mail.
- Luiz may guide the purchase and configure the domain.
- If domain work becomes complex, it is a separate commercial decision.
- The initial delivery may use a provisional/simple publication link and later point a domain.

## Monthly Maintenance Policy

Monthly maintenance is optional and should not be pushed before the initial close.

Default positioning:

```text
A entrega nao te prende em mensalidade. Depois que estiver pronto, se voce quiser, posso cuidar de pequenas alteracoes, link, textos e suporte leve por uma manutencao mensal simples. Se preferir, tambem pode me chamar so quando precisar alterar algo.
```

Operational rules:

- Do not make monthly maintenance mandatory.
- Do not include maintenance in the initial R$ 297 close.
- Mention it only if the lead asks, or after delivery approval.
- It may cover small text edits, link changes, opening hours, WhatsApp changes, and light support.
- It does not include redesign, large new pages, posts, traffic, automation, or client attendance.

## Worker Behavior

Jhon Snow / Atendimento e Fechamento:

- May prepare a manual response with R$ 297 when the lead explicitly asked for price and the issue context confirms price discussion.
- Must use only the current authorized price policy or explicit Luiz authorization.
- Must not use revoked values or old price ranges.
- Must route discount requests to Luiz.
- Must keep the response manual when it involves price, payment, proposal, discount, or closing.

Atendimento WhatsApp:

- Must not mention price, value, payment, discount, proposal, or closing.
- If a lead asks for price, it must route to Jhon Snow / Atendimento e Fechamento.

Guardiao de Envio WhatsApp:

- Must continue blocking Outbox messages that mention price, value, payment, proposal, discount, or closing.
- Must block all concrete prices in Outbox, including the current R$ 297.
- Must keep R$ 397/enxuta as an explicit revoked-offer block.

COO / Natienska:

- Must not change price or discount policy.
- May route price-policy updates only when Luiz explicitly approves the new policy.

## Expected Implementation

The implementation should update the commercial docs, worker prompts, agent mirrors, and regression tests so that:

- R$ 297 is the only current authorized price in the operational contract.
- Revoked values do not appear as usable commercial guidance.
- Old values may appear only in tests or guardrails that explicitly identify them as revoked/blocked.
- Domain and monthly maintenance are optional continuations, not blockers or required parts of the first sale.
- WhatsApp Outbox remains price-free.

## Acceptance Criteria

- `docs/freelancer/ofertas.md` and `docs/freelancer/playbook.md` expose the current R$ 297 policy and no longer recommend old prices.
- Jhon's prompt states that R$ 297 is the current authorized manual price and that old values are revoked.
- Atendimento WhatsApp remains prohibited from mentioning any price.
- Guardiao remains strict and blocks price in Outbox, including R$ 297.
- Tests fail if old prices return as usable guidance in active docs or prompts.
- Paperclip agents are synced after prompt/capability changes.
- The final implementation is committed and pushed to `origin/main`.
