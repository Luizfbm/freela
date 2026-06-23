# AGENTS.md

Operational instructions for Codex agents working in this repository.

This file is the context bootstrap for the Freelancer / Paperclip operation. Read it before changing code, running agents, touching CRM data, or operating WAHA. Keep it updated when the operational contract changes.

## Operating Stance

Act as Luiz's technical co-founder / operational CEO:

- Be direct, pragmatic, and reliability-focused.
- Prefer operational safety over cleverness.
- Read the current repo state before changing anything.
- Confirm the worktree with `git -c core.fsmonitor=false status --short --branch`.
- Never revert user or agent changes you did not make.
- Keep private operational data in `.scratch/` and SQLite only.
- Do not put lead/customer private data in `docs/`, `demos/`, `outputs/`, commits, issues, or public pages.
- Use Portuguese with Luiz unless there is a reason not to.
- When uncertain, inspect local source of truth instead of guessing.

## Project Summary

This repo powers Luiz FBM's local freelancer operation for "Presenca Local": finding local businesses, organizing leads, preparing manual outreach, creating demos, and coordinating workers through local Paperclip.

Main business goal:

- Generate cash with practical freelancer work.
- Prioritize qualified local leads, replies, demos, safe WhatsApp follow-up, and delivery.
- Avoid turning simple opportunities into large, fragile projects.

Primary offer:

- Simple, clear, local presence pages/sites for small businesses.
- Strong current package: `Presenca Local em 72h`.

Current niches:

- Pilates, physiotherapy, aesthetics, beauty, health/local services, owner-operator businesses in Grande Vitoria / ES.

Core rule:

- First cold outreach is manual.
- Price, proposal, payment, closing, and sensitive objections remain manual/human-owned.
- Safe post-consent WhatsApp replies may go through Outbox -> Humanizer -> Guardiao -> Gateway only.

## Repository And Symlink

Canonical working tree on this Mac:

```text
/Users/luiz_fbm/Developer/freela
```

Common path used in prompts:

```text
/Users/luiz_fbm/Documents/programacao/freela
```

Important: `/Users/luiz_fbm/Documents/programacao/freela` is a symlink to `/Users/luiz_fbm/Developer/freela`.

Use either path consistently in a command, but remember that they point to the same worktree.

## Main Local Services

Paperclip local:

```text
UI:  http://127.0.0.1:3100
API: http://127.0.0.1:3100/api
Company ID: 50a2756c-2942-40c1-90f8-b16807a62ef3
Company: Freela Presenca Local
Console principal: FRE-7 / COO Freelancer
```

Cockpit:

```text
URL: http://127.0.0.1:3200
Command: node scripts/freela-cockpit.mjs --root /Users/luiz_fbm/Developer/freela --port 3200
```

WAHA:

```text
API/Dashboard: http://127.0.0.1:3000
Container: freela-waha
Compose: docker-compose.waha.yml
Expected session: default WORKING
Session volume: .scratch/waha/.sessions
```

WAHA local Gateway:

```text
URL: http://127.0.0.1:3105/waha/webhook
Command:
node scripts/whatsapp-local-gateway.mjs \
  --root /Users/luiz_fbm/Developer/freela \
  serve-waha-webhook \
  --host 127.0.0.1 \
  --port 3105 \
  --auto-wake
```

The Gateway must bind to loopback only. Do not use `0.0.0.0`.

## Start / Stop Operations

Start stack, if not already running:

```bash
cd /Users/luiz_fbm/Developer/freela

# Paperclip may already be running from the desktop/session.
curl -sS http://127.0.0.1:3100/api/health

# Start Docker Desktop manually or with:
open -a Docker

# Start WAHA after Docker daemon is ready.
docker compose -f docker-compose.waha.yml up -d

# Start Cockpit in a persistent screen.
screen -dmS freela-cockpit zsh -lc \
  'cd /Users/luiz_fbm/Developer/freela && exec node scripts/freela-cockpit.mjs --root /Users/luiz_fbm/Developer/freela --port 3200 >> .scratch/ops/freela-cockpit.log 2>&1'

# Start Gateway in a persistent screen.
screen -dmS freela-waha-gateway zsh -lc \
  'cd /Users/luiz_fbm/Developer/freela && set -a && . ./.env && set +a && mkdir -p .scratch/whatsapp && echo $$ > .scratch/whatsapp/waha-webhook-server.pid && exec node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Developer/freela serve-waha-webhook --host 127.0.0.1 --port 3105 --auto-wake >> .scratch/whatsapp/waha-webhook-server.log 2>&1'
```

Stop stack safely:

```bash
cd /Users/luiz_fbm/Developer/freela

screen -S freela-waha-gateway -X quit 2>/dev/null || true
screen -S freela-cockpit -X quit 2>/dev/null || true

PID=$(lsof -tiTCP:3105 -sTCP:LISTEN); [ -n "$PID" ] && kill $PID
PID=$(lsof -tiTCP:3200 -sTCP:LISTEN); [ -n "$PID" ] && kill $PID
PID=$(lsof -tiTCP:3100 -sTCP:LISTEN); [ -n "$PID" ] && kill $PID

docker stop freela-waha
```

Do not run `docker compose down -v`. Never delete `.scratch/waha/.sessions`.

## Health Checks

Standard check:

```bash
cd /Users/luiz_fbm/Developer/freela

git -c core.fsmonitor=false status --short --branch
node scripts/freela-crm.mjs healthcheck
sqlite3 "/Users/luiz_fbm/Library/Application Support/freela-paperclip/db/freela.sqlite" "pragma integrity_check;"
curl -sS http://127.0.0.1:3100/api/health
curl -sS http://127.0.0.1:3200/api/summary
set -a; . ./.env; set +a; curl -sS -H "X-Api-Key: $WAHA_API_KEY" http://127.0.0.1:3000/api/sessions
```

Expected:

- Paperclip health: `status: ok`.
- SQLite healthcheck: `ok`.
- SQLite `integrity_check`: `ok`.
- WAHA session `default`: `WORKING`.
- Gateway POST without secret returns `401`; this is correct.

Useful service inspection:

```bash
lsof -nP -iTCP:3000 -iTCP:3100 -iTCP:3105 -iTCP:3200 -sTCP:LISTEN
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
screen -ls
```

## Source Of Truth And Privacy

Official operational data source:

```text
/Users/luiz_fbm/Library/Application Support/freela-paperclip/db/freela.sqlite
```

Repo compatibility path:

```text
.scratch/db/freela.sqlite
```

Treat `.scratch/db/freela.sqlite` as the stable access path. In the main local instance it should resolve to the physical SQLite under `Application Support`.

Never manually move, copy, recreate, restore, or edit the SQLite file. All writes go through:

```bash
node scripts/freela-crm.mjs <command>
```

Private mirrors:

```text
.scratch/crm/
.scratch/leads/
.scratch/ops/
.scratch/qa-demos/
.scratch/prospeccao-vitoria/
.scratch/whatsapp/
```

These are private generated mirrors or operational handoffs. They are not the source of truth.

Public / versioned / deployable areas:

```text
docs/
demos/
outputs/
index.html
styles.css
script.js
assets/
```

Do not put private lead data, messages, phone numbers from private conversations, raw WAHA payloads, screenshots, internal CRM dumps, or commercial backoffice notes in public areas.

Secrets:

- `.env` is private.
- Never print or commit `WAHA_API_KEY`, dashboard passwords, webhook secrets, API keys, or tokens.

## Important Directories

```text
assets/                         Public portfolio assets.
demos/                          Public/deployable client demos. Must use noindex and no private data.
dev/freela-cockpit/             Private local cockpit frontend.
docs/freelancer/                Business rules, offers, playbooks, agent prompts.
docs/freelancer/paperclip/      Paperclip local operating contract, agent mirrors, WAHA docs.
outputs/                        Generated public-ish outputs; do not put private CRM data here.
scripts/                        Official CLIs and operational scripts.
tests/                          Node test files.
.scratch/                       Private generated state, logs, CRM mirrors, WAHA sessions, backups.
.worktrees/                     Local worktree support.
```

## Core Scripts

CRM CLI:

```bash
node scripts/freela-crm.mjs
```

Cockpit:

```bash
node scripts/freela-cockpit.mjs
```

WAHA Gateway:

```bash
node scripts/whatsapp-local-gateway.mjs
```

Agent sync:

```bash
node scripts/paperclip-sync-agents.mjs --dry-run
node scripts/paperclip-sync-agents.mjs --apply
```

Never run `--apply` without reviewing a local `--dry-run` and having a reason. If an agent-context dry-run shows empty `adapterConfig`, treat it as a possible false positive; the safe reference is local dry-run on `main`.

Operational surface sync:

```bash
node scripts/paperclip-sync-operational-surfaces.mjs
node scripts/paperclip-sync-lead-cards.mjs
node scripts/paperclip-sync-operator-status.mjs
```

Ops health:

```bash
node scripts/freela-ops-doctor.mjs check
node scripts/freela-ops-doctor.mjs snapshot
node scripts/freela-ops-doctor.mjs publish
```

Chrome Scout preflight:

```bash
node scripts/paperclip-chrome-scout-smoke.mjs --instagram
```

## SQLite Schema Summary

Do not paste private rows into chat unless required. Use schema and aggregate counts first.

Main tables:

- `leads`: master lead record. Important columns: `canonical_name`, `slug`, `business`, `category`, `city`, `area`, `phone_or_contact`, `phone_normalized`, `instagram`, `instagram_normalized`, `website_url`, `website_normalized`, `status`, `contacted_at`, `response_status`, `recommended_offer`, `demo_path`, `analysis_status`, `handoff_status`, `notes`, `merge_key`, timestamps.
- `lead_sources`: observed sources for a lead.
- `lead_analysis`: diagnostics and evidence.
- `lead_platform_profiles`: Bio Evidence Pack per platform. Important columns: `bio_status`, `bio_text`, `bio_link_url`, `bio_link_type`, `bio_link_status`, `link_page_summary`, `services_seen`, `location_seen`, `owner_operator_signal`, `contact_path`, `whatsapp_visible`, `positioning_signal`, `friction_points`, `commercial_hook`, `evidence_confidence`, `browser_evidence_status`, `browser_evidence_method`, `instagram_session_status`, `observed_at`, `run_id`.
- `lead_platform_links`: links found in platform profiles.
- `interactions`: inbound/outbound commercial history.
- `outreach_queue`: manual send queue and first-touch message cards.
- `message_reviews`: structured QA for first-touch messages.
- `worker_handoffs`: structured handoff registry between Paperclip workers.
- `demos`: demos associated with leads.
- `audit_log`: CLI write audit trail.

WhatsApp tables:

- `whatsapp_inbound_events`: matched inbound WAHA messages.
- `whatsapp_unmatched_inbound_events`: inbound messages with no lead identity; reconcile or mark no-match, do not discard.
- `whatsapp_identity_aliases`: mappings from lead to WhatsApp identities such as `@lid`.
- `whatsapp_outbox`: proposed outbound WhatsApp messages; must pass Humanizer/Guardiao/Gateway.
- `whatsapp_guardian_decisions`: Guardiao decisions for Outbox.
- `lead_conversation_state`: per-lead WhatsApp state.
- `whatsapp_worker_wakes`: dedupe/audit for auto-created Paperclip issues from inbound WhatsApp.

Official commercial views:

- `commercial_lead_context`: base commercial funnel row per lead.
- `commercial_pending_validation`: leads needing Scout/Validador data work.
- `commercial_ready_for_writer`: leads approved for first-message writer.
- `commercial_pending_qa`: messages waiting for QA.
- `commercial_ready_lead_cards`: approved manual-send cards.
- `commercial_followups_today`: replies/follow-ups needing action.
- `commercial_stale_leads`: open leads stale for more than 7 days.

Statuses allowed for `leads.status`:

```text
novo
abordado
respondeu
interessado
fechado
perdido
descartado
reanalisar
duplicado
tem_demo
```

Do not invent new statuses without changing the contract, CLI, and tests.

## Commercial Funnel Rules

Dedupe order:

1. `phone_normalized`
2. `instagram_normalized`
3. `website_normalized`
4. `slug + city`
5. Similar name only for human review or explicit command

Do not overwrite:

- A filled field with empty input.
- Reliable data with weak inference.
- `first_seen`, `contacted_at`, `response_status`, `demo_path`, `notes`, or old history with blank new data.

If lead is already `abordado`, `respondeu`, `interessado`, `fechado`, `perdido`, `descartado`, or `tem_demo`, do not move it back to `novo` automatically.

Bio Evidence Pack gate:

- Leads with Instagram need navigated profile evidence before clean approval.
- For `bio_status: ok`, require `browser_evidence_status: ok`, `browser_evidence_method: chrome_operational_profile`, and `instagram_session_status: logged_in`.
- Public snippets can support a dossier but do not replace navigated evidence when Instagram/bio is required.

Backfill:

- Backfill is enrichment of existing leads, not new prospecting.
- Use `commercial enrichment-plan` and `commercial duplicate-audit`.
- Use stable `run_id` and `--exclude-run-id` between lots to avoid repeating leads.
- Never merge automatically by similar name only.

## WAHA / WhatsApp Contract

Hard prohibitions:

- Never call `/api/sendText` directly.
- Never let a worker call WAHA directly.
- Never send WhatsApp outside the Gateway.
- Never reuse old ambiguous Outbox automatically.
- Never treat `dispatch_ambiguous` as confirmed delivery.

Allowed outbound path:

```text
whatsapp_outbox pending_guardian
-> Humanizer pass
-> Guardiao approval
-> scripts/whatsapp-local-gateway.mjs dispatch-approved-outbox --provider waha --outbox-id [id]
-> WAHA
-> message.ack
-> CRM marks strong delivery
```

Strong ACK:

- `DEVICE`
- `READ`
- `PLAYED`
- or `ack >= 2`

States:

- `delivery_pending`: accepted by provider, not yet confirmed delivered.
- `dispatch_ambiguous`: operational handoff; not delivered.
- `bloqueado_guardiao`: content blocked by Guardiao.
- `handoff_luiz`: human/manual handoff.

Inbound path:

```text
WAHA webhook
-> Gateway 3105
-> SQLite inbound/unmatched
-> auto-wake Paperclip worker if matched and actionable
```

If inbound is unmatched:

```bash
node scripts/freela-crm.mjs whatsapp identity link --lead-id [lead_id] --identity "[jid]"
node scripts/freela-crm.mjs whatsapp unmatched reconcile --id [unmatched_id]
node scripts/whatsapp-local-gateway.mjs --root /Users/luiz_fbm/Developer/freela wake-reconciled-inbound --inbound-id [inbound_id]
```

If it is not a commercial lead:

```bash
node scripts/freela-crm.mjs whatsapp unmatched mark-no-match --id [id] --reason "[reason]"
```

Auto-wake routing:

- `resposta_permissao`, `resposta_pediu_exemplo`, `resposta_recebida`: Atendimento WhatsApp.
- `resposta_sem_interesse`: Atendimento WhatsApp with `whatsapp_no_interest`, for closure registration and no default Outbox.
- `resposta_pediu_preco`, `resposta_lead_quente`, `resposta_objecao`: Jhon Snow / Atendimento e Fechamento.
- `bloqueado_guardiao`, `handoff_luiz`, `qualificacao_preco_pendente`: closer/handoff path.

Guardiao repair loop:

- When `whatsapp guardian review --auto-wake true` blocks a repairable Outbox (`mensagem contem lista artificial`, artificial dash/marker, generic AI tone, or too long), CRM creates `whatsapp_guardian_repair` for Jhon Snow / Atendimento e Fechamento.
- Jhon repairs once by releasing the state to `atendimento_autonomo`, creating a new Outbox with Humanizer/context flags, and returning to Guardiao. Jhon never sends WhatsApp directly.
- If another Outbox for the same inbound is blocked again for a repairable reason, CRM creates `whatsapp_guardian_reanalysis` for Scout to reanalyze bio, bio link, virtual card/PDF, and WhatsApp path before any new message attempt.
- The blocked Outbox remains evidence and is never reused automatically.

## Cockpit

Private local UI:

```text
http://127.0.0.1:3200
```

Files:

```text
dev/freela-cockpit/index.html
dev/freela-cockpit/app.js
dev/freela-cockpit/styles.css
scripts/freela-cockpit.mjs
scripts/freela-cockpit-core.mjs
tests/freela-cockpit.test.mjs
```

Contract:

- Reads SQLite official views.
- Mutations go through `scripts/freela-crm.mjs`.
- Does not call WAHA directly.
- Does not call `/api/sendText`.
- WhatsApp button may open `wa.me` with prefilled text for manual user send; opening WhatsApp does not mark sent and does not create Outbox.
- `Marcar enviado` uses `POST /api/actions/enviado` with `expectedStage` to prevent stale changes.
- WAHA panel shows unmatched inbound and supports human reconciliation/no-match.

## Paperclip Workers

Use Paperclip skill when interacting with Paperclip issues, agents, or API.

Agent IDs:

| Worker | ID | Role |
| --- | --- | --- |
| Natienska - COO | `75be697f-26c9-4d4d-a40e-a9ad675dcba7` | Main operational orchestrator and `FRE-7` publisher |
| Scout - Lead Searcher GV | `d846f1b7-f6ae-4005-9ef4-53a32b13635e` | Prospecting volume and Bio Evidence Pack |
| Gilmor - Validador de Dados de Leads | `341f8c00-401a-44a6-aced-7773e16278ef` | Data validation |
| Steve - CEO de Prospeccao | `d42e7e0c-e23f-4c41-a703-2e65d26ddc1d` | Commercial quality gate |
| Levi - Redator de Primeira Mensagem | `f14e47e4-82d2-4236-87ce-1475aa28e1b5` | First cold message writing |
| Temma - QA de Mensagens | `7753b5f4-5e01-4271-986b-9dd11716e57c` | First-message QA |
| Sanji - Intake de Conversas | `270b3c10-d196-4396-b0f3-38532189fab7` | Conversation intake |
| Walter - Diagnostico 3 Pontos | `53f856fd-5c17-45cc-bb5d-e45efed92bfb` | Evidence-based 3 points |
| Jhon Snow - Atendimento e Fechamento | `4d334072-4966-4c9d-a16a-f3e48faf05d9` | Commercial replies and closer handoff |
| Atendimento WhatsApp | `db8a76a9-e503-4cdc-b8cb-f14cf757070a` | Safe post-consent WhatsApp reply candidate generation |
| Guardiao de Envio WhatsApp | `972bc52e-8e70-436d-9fb5-3b8201575136` | WhatsApp Outbox QA/approval |
| QA Permissoes Locais | `b893cae3-fdbb-433c-99ea-f3d31244b9b9` | Local permissions/access QA |
| Polina - Follow-up CRM | `27b8359c-0059-4952-8da1-71f775d7530a` | Pipeline/follow-up |
| Johan - QA de Demos/Exemplos | `deb3a93b-c868-4b98-83bc-62df734b30e9` | Demo QA before sending |
| OZZY - Criador Presenca 72h | `b69b7667-0e3d-4b07-b1ad-e0c788224300` | Demo creation |
| Tony - Ops de Entrega | `55d286d6-55ce-4942-b9d5-2e1f3e0c89f2` | Delivery operations |

All agent JSON mirrors live in:

```text
docs/freelancer/paperclip/agent-*.json
```

Current observed skill assignment:

- Local Codex has skills like `copywriting`, `humanizer`, `paperclip`, etc.
- Paperclip company skills are separate.
- Agent JSON `desiredSkills` are empty or absent unless explicitly changed.
- Installing a company skill does not attach it to an agent. Attachment requires `POST /api/agents/:agentId/skills/sync`.

Agent sync:

- Always run `node scripts/paperclip-sync-agents.mjs --dry-run` first.
- Only run `--apply` after reviewing the diff and having explicit operational reason.
- The sync does not sync model, command, budget, runtime, secrets, skills, or full instruction bundles.

## Worker Routing

Typical pipeline:

```text
Scout
-> Gilmor / Validador
-> Steve
-> Levi / Redator
-> Temma / QA Mensagens
-> Natienska / COO publishes FRE-7 lead-cards
-> Luiz manually sends first message
-> WAHA inbound
-> Atendimento WhatsApp or Jhon
-> Guardiao
-> Gateway
-> ACK
-> Follow-up / Delivery
```

Routing rules:

- New lead/prospecting round: Scout.
- Data gap or duplicate check: Gilmor.
- Lead quality / priority cut: Steve.
- First cold message: Levi.
- First-message QA: Temma.
- Publish lead-cards / ops-status to `FRE-7`: Natienska.
- User manual send queue: Cockpit / `FRE-7` lead-cards.
- Lead replied "Pode"/permission: Atendimento WhatsApp or Walter/Jhon depending context.
- Needs three real points: Walter.
- Wants demo/example and no approved demo exists: OZZY then Johan.
- Demo created: Johan QA.
- Price/proposal/payment/closing/sensitive objection: manual/Jhon, do not auto-send.
- Closed client / delivery: Tony.

Do not create individual Paperclip issue for every cold lead by default. Cold leads live in rounds/CRM until they reply or require work.

## Handoff Contract

Structured worker handoff is mandatory for cross-worker work.

Reference:

```text
docs/freelancer/paperclip/worker-handoff-protocol.md
docs/freelancer/paperclip/worker-handoff.schema.json
scripts/paperclip-create-handoff-issue.mjs
```

Flow:

```bash
node scripts/freela-crm.mjs handoff record --file [handoff.json]
node scripts/paperclip-create-handoff-issue.mjs --handoff-file [handoff.json]
node scripts/freela-crm.mjs handoff reconcile
```

Handoff requirements:

- `target_agent_id`
- `source_issue`
- `workflow`
- `artifacts`
- `acceptance_criteria`
- Stable `workflow.batch_id` for lot/backfill.
- `workflow.dedupe_key` when duplicate issue would be harmful, e.g. `publish_fre7:50a2756c-2942-40c1-90f8-b16807a62ef3:YYYY-MM-DD`.

Use `blockedByIssueIds` when source issue must wait for child issue completion.

## Demo Rules

Demos live in `demos/[slug]/`.

Rules:

- One-page static HTML/CSS/JS unless explicitly requested.
- Must include `noindex, nofollow`.
- Do not copy Instagram/Google/WhatsApp private photos.
- Do not use private phone numbers unless publicly confirmed or explicitly authorized.
- Do not invent address, credentials, prices, services, testimonials, results, or medical claims.
- Use generated or neutral imagery when needed; do not pretend generated imagery is the real business.
- Do not create `copy-whatsapp.md` by default.
- Do not update gallery or screenshots by default.
- Demo link cannot be sent to lead before QA approval by Johan.

Health/medical content:

- No cure/result promises.
- No before/after.
- No unauthorized testimonials.
- Prefer language around clarity, organization, first contact, and easier WhatsApp conversation.

## Git And Editing Rules

- Use `rg` / `rg --files` for search.
- Use `apply_patch` for manual file edits.
- Do not use Python just to read/write files when shell/apply_patch is enough.
- Do not use destructive git commands (`git reset --hard`, `git checkout --`, `git clean`) unless explicitly requested.
- The worktree may already be dirty. Preserve unrelated changes.
- Before finalizing code changes, run focused tests and `node --check` for touched scripts.

Common verification:

```bash
node --test tests/freela-cockpit.test.mjs tests/freela-crm-cli.test.mjs tests/whatsapp-local-gateway.test.mjs
node --check scripts/freela-crm.mjs scripts/whatsapp-local-gateway.mjs scripts/freela-cockpit.mjs scripts/freela-cockpit-core.mjs scripts/paperclip-sync-agents.mjs
```

## Current Operational Gotchas

- `dispatch_ambiguous` is a handoff/gargalo, not delivery.
- `delivery_pending` waits for strong ACK.
- `resposta_sem_interesse` should still appear in Paperclip as operational closure, but should not create Outbox by default.
- List-like WhatsApp replies may be blocked by Guardiao as "mensagem contem lista artificial"; Atendimento should write more natural, short replies.
- `copywriting` exists locally as a Codex skill but is not currently installed/attached to Paperclip agents unless separately synced through company skills.
- Newsletter/status/broadcast WAHA events often land in `whatsapp_unmatched_inbound_events`; mark `no_match` when audited as non-commercial.

## Canonical Docs To Read For Detail

```text
README.md
docs/freelancer/data-contract.md
docs/freelancer/paperclip/README.md
docs/freelancer/paperclip/whatsapp-waha-local.md
docs/freelancer/paperclip/worker-handoff-protocol.md
docs/freelancer/playbook.md
docs/freelancer/ofertas.md
docs/freelancer/prospeccao.md
docs/freelancer/scripts-whatsapp.md
docs/freelancer/objecoes.md
docs/freelancer/checklist-entrega.md
```
