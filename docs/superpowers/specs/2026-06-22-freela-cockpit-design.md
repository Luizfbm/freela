# Freela Cockpit Design

Status: approved design, pending written-spec review.
Date: 2026-06-22
Owner: Luiz FBM
Repo: `/Users/luiz_fbm/Developer/freela`

## Goal

Build a private local UI for Luiz to operate the current freelancer lead pipeline with a dense cockpit view, real CRM actions, and selective Paperclip notification.

The Cockpit answers three operational questions:

1. What needs Luiz's action now?
2. What is moving through agents or WAHA automation without Luiz touching it?
3. Which action can Luiz safely take on a lead, and what will happen after it runs?

## Non-Goals

- Do not replace Paperclip as the agent control plane.
- Do not turn `.scratch` files into the source of truth.
- Do not send WhatsApp messages directly.
- Do not call `/api/sendText`.
- Do not build a public CRM, landing page, or shared hosted app.
- Do not add broad QA, handoff, or agent sync controls to the first release.

## Source Of Truth

The official state remains SQLite:

- Official DB: `/Users/luiz_fbm/Library/Application Support/freela-paperclip/db/freela.sqlite`
- Compatibility path: `.scratch/db/freela.sqlite`
- Official CLI: `node scripts/freela-crm.mjs`

Private mirrors in `.scratch/*.md` and `.scratch/*.csv` can be regenerated, but the UI must not treat them as authoritative input.

## Product Shape

The MVP is a local app served at `http://127.0.0.1:3200`.

It is a tool for daily operation, not a marketing surface. The first screen is a dense cockpit:

- Top scorebar for operating counts.
- Main kanban for active human and worker-facing stages.
- Right-side WAHA panel for automation health and delivery risks.
- Global search for every lead, including closed, lost, discarded, and duplicated leads.
- Command console with preview for commands not yet worth a dedicated button.

The UI should feel like an operations desk: compact, predictable, high-contrast, and optimized for repeated scanning.

## UX And Visual Direction

Use the `ui-ux-pro-max` findings as guidance, adapted to an internal dashboard:

- Pattern: operational dashboard, not enterprise landing page.
- Style: technical, dense, readable, low ornamentation.
- Typography: `Fira Sans` for interface text if external fonts are used; `Fira Code` only for command strings, IDs, and logs.
- Color use:
  - Neutral surfaces for default cards and panels.
  - Green for ready/success.
  - Amber for attention or pending confirmation.
  - Red for blocked, destructive, failed, or ambiguous delivery.
  - Blue or indigo for selected state, links, and primary navigation.
- Avoid one-note palettes, oversized hero sections, decorative cards, and explanatory marketing copy.
- Use icons from a consistent SVG icon set such as Lucide when an icon is useful.
- All clickable controls need pointer cursor, visible focus, loading state, and stable hover behavior.
- Text must not overflow buttons or cards on mobile or desktop.

## Layout

Desktop layout:

- Header: app title, DB health, last refresh time, manual refresh button.
- Scorebar: operational counters.
- Main area:
  - Left/center: kanban columns.
  - Right: fixed WAHA panel.
- Bottom or collapsible panel: command console and recent action feedback.

Mobile and narrow tablet layout:

- Header and scorebar remain visible.
- Kanban becomes tabs or stacked sections.
- WAHA panel moves below kanban.
- Lead detail opens as a full-width drawer or modal.

The UI auto-refreshes every 30 seconds and also has a manual refresh button. Auto-refresh pauses while a confirmation modal or action request is active.

## Kanban States

The kanban shows active operation, not every historical state.

Columns:

1. **Enviar agora**
   - Source: `commercial_ready_lead_cards`, with the same safe-outbox filtering used by `manualReadyLeadCardRows`.
   - Purpose: leads Luiz should contact manually now.

2. **Follow-up / resposta**
   - Source: `commercial_followups_today`.
   - Emphasis: `respondeu`, `interessado`, `tem_demo`, and leads needing a manual follow-up.

3. **Aguardando worker**
   - Source examples: `commercial_ready_for_writer`, `commercial_pending_qa`, active `worker_handoffs`.
   - Purpose: work exists, but the next owner is an agent or QA flow.

4. **Bloqueados**
   - Source examples: `commercial_pending_validation`, `dispatch_ambiguous`, old `delivery_pending`, guardiao blocked states, `contact_missing`.
   - Purpose: show operational blockers that cannot be treated as delivered or complete.

5. **Revisar**
   - Source examples: `commercial_stage = 'review'`, `reanalisar`, manual duplicate review, cases without a clear next action.
   - Purpose: prevent leads from silently disappearing.

Closed, lost, discarded, and duplicated leads do not appear in the active kanban by default, but they must be available in global search.

## Lead Card

Each card should show enough to act without opening the full detail:

- Lead name.
- Current status and commercial stage.
- Action type or next action.
- Contact channel summary.
- Queue date when relevant.
- QA status when relevant.
- WAHA state badge when relevant.
- External-update badge when the lead changed since the previous refresh.
- Primary safe action button when there is one clear action.

Cards must not expose unnecessary private data in screenshots or logs outside the local app.

## Lead Detail

The detail drawer or modal shows:

- Lead identity: name, niche, city/area, contact paths.
- Current CRM status and commercial stage.
- Validation blocker, if any.
- Last interaction summary.
- Ready message, if available.
- WAHA state and latest outbox summary.
- Available actions for the current state.
- Recent action result or pending Paperclip publication warning.

Action buttons operate by internal `lead_id`, not by display name.

## Global Search

Search should cover:

- Name.
- Phone/contact.
- Instagram.
- City and area.
- Category/niche.
- CRM status.
- Commercial stage.

The search result includes all leads, including closed, lost, discarded, and duplicated. Actions shown from search still depend on current state and must be revalidated before execution.

## Command Console

The console supports the same operator vocabulary documented in `docs/freelancer/paperclip/status-commands.md`, starting with:

- `status`
- `status [nome]`
- `enviado [nome]`
- `followup enviado [nome]`
- `respondeu [nome]: [mensagem recebida]`
- `pediu exemplo [nome]`
- `pediu preco [nome]`
- `perdido [nome]`
- `descartar [nome]`

The console must preview before execution:

- Resolved `lead_id`.
- Action to run.
- CLI command or internal action category.
- Expected CRM effect.
- Expected Paperclip effect.
- Whether the action may wake an agent.

If a command resolves to zero leads or multiple leads, execution is blocked.

## Actions

MVP actions:

1. `enviado`
   - Marks first manual message as sent.
   - Light confirmation.
   - Updates CRM and republishes operational surfaces.
   - Does not wake an agent.

2. `followup_enviado`
   - Marks manual follow-up as sent.
   - Light confirmation.
   - Updates CRM and republishes operational surfaces.
   - Does not wake an agent.

3. `respondeu`
   - Requires the received response text.
   - Strong confirmation with the exact text shown.
   - Updates CRM.
   - If classifiable, routes to the correct worker flow.
   - If ambiguous, routes to COO/FRE-7 for triage.

4. `pediu_exemplo`
   - Strong confirmation.
   - Updates CRM and triggers the demo/creation path with demo brief and QA gate.
   - Does not send links automatically through lead-cards when the safe WAHA outbox path applies.

5. `pediu_preco`
   - Strong confirmation.
   - Updates CRM and routes to Atendimento/Fechamento.
   - Remains manual. No WAHA automatic price/proposal response.

6. `perdido`
   - Strong confirmation with required reason.
   - Updates CRM and removes from active surfaces.
   - Does not wake an agent.

7. `descartar`
   - Strong confirmation with required reason.
   - Updates CRM and removes from active surfaces.
   - Does not wake an agent.

## Paperclip Notification

Paperclip is notified selectively after successful CRM writes.

For simple actions:

- `enviado`
- `followup_enviado`
- `perdido`
- `descartar`

The Cockpit runs the official CRM CLI to update SQLite, regenerates surfaces, and republishes:

- `FRE-7 / lead-cards`
- `FRE-7 / ops-status`

For agent-relevant actions:

- `respondeu`
- `pediu_exemplo`
- `pediu_preco`

The Cockpit runs the official CRM CLI to update SQLite, republishes operational surfaces, and creates or triggers the appropriate handoff/issue path. Direct worker routing is allowed for unambiguous event types. Ambiguous responses go to COO/FRE-7 triage.

If CRM write succeeds but Paperclip publication fails, the response must clearly report:

- CRM updated.
- Paperclip publication pending.
- Retry action available.

The UI must not report the whole action as a clean success in that partial-failure case.

## WAHA Autonomy

Leads can move without user clicks because WAHA, gateway, guardiao, inbound ingestion, and agents can update the CRM.

The Cockpit must treat SQLite as live state:

- Auto-refresh every 30 seconds.
- Re-read lead state before executing any action.
- If a lead changed while a modal is open, show "Este lead mudou desde que voce abriu".
- If the lead left the expected stage, block the action or require a new confirmation.
- Mark externally changed cards with a discreet badge.

WAHA panel responsibilities:

- Show `approved`, `delivery_pending`, `dispatch_ambiguous`, and `sent_strong_ack` counts.
- Highlight `dispatch_ambiguous` as a handoff/gargalo, never as confirmed delivery.
- Highlight `delivery_pending` as pending ACK, never as delivered.
- Show active safe outbox states that remove a lead from manual lead-cards.
- Do not dispatch WAHA directly from the Cockpit MVP.

The current safe path remains:

`Outbox -> Guardiao -> Gateway with --outbox-id`

## Backend Architecture

Create a local server script:

- `scripts/freela-cockpit.mjs`

The server listens only on loopback:

- Default host: `127.0.0.1`
- Default port: `3200`

Read behavior:

- Read official SQLite views directly for dashboard state.
- Use read-only queries for API endpoints.
- Do not read `.scratch` markdown or CSV files as source.

Write behavior:

- All CRM writes go through `node scripts/freela-crm.mjs`.
- No direct SQL writes from Cockpit action handlers in the MVP.
- Run SQLite healthcheck before write operations.
- Respect the existing Ops Doctor red-state block because writes use the official CLI.

Paperclip behavior:

- Use existing sync scripts for operational documents:
  - `scripts/paperclip-sync-lead-cards.mjs`
  - `scripts/paperclip-sync-operator-status.mjs`
  - `scripts/paperclip-sync-operational-surfaces.mjs`
- Use Paperclip API or existing handoff scripts only through explicit action paths.

## API Shape

Initial endpoints:

- `GET /`
  - Serves the Cockpit frontend.

- `GET /api/summary`
  - Returns scorebar counts, next best step, DB health summary, last refresh timestamp.

- `GET /api/leads?stage=&q=`
  - Returns kanban cards or search results.

- `GET /api/leads/:id`
  - Returns detailed lead state by internal lead id.

- `GET /api/waha`
  - Returns WAHA/outbox counters and notable blockers.

- `POST /api/command/preview`
  - Parses command text and returns a preview.
  - Does not mutate state.

- `POST /api/actions/:action`
  - Executes a validated action by lead id.
  - Revalidates current lead state before running.
  - Calls CLI for CRM write.
  - Republishes or schedules Paperclip work according to action type.

- `POST /api/refresh-paperclip`
  - Republishes operational surfaces without changing CRM state.

All mutation endpoints return structured results:

- `ok`
- `crmUpdated`
- `paperclipUpdated`
- `agentRouted`
- `warnings`
- `errors`
- `nextRefreshRecommended`

## Reliability And Safety

Required safeguards:

- Loopback-only server.
- One mutation at a time per process, or at minimum per lead id.
- Disable action buttons during pending requests.
- Prevent double submission from repeated clicks.
- Use strong confirmation for sensitive or destructive actions.
- Require notes/text for `respondeu`, `perdido`, and `descartar`.
- Revalidate lead state immediately before mutation.
- Show accessible error messages with `role="alert"` or equivalent.
- Never hide partial failure.
- Never treat `dispatch_ambiguous` as sent.
- Never treat `delivery_pending` as delivered.

## Privacy

Private lead data can be displayed in the local Cockpit, but must not be written to public or semi-public repo areas.

Allowed private output:

- `.scratch/ops`
- `.scratch/crm`
- SQLite official DB

Disallowed for private lead data:

- `docs/`
- `demos/`
- `outputs/`

The design spec itself intentionally contains no private lead names, phone numbers, or message bodies.

## Testing Strategy

Minimum tests for implementation:

- `GET /api/summary` returns coherent counts from SQLite.
- Kanban reads official SQLite views, not `.scratch` mirrors.
- Command preview refuses ambiguous lead names.
- `enviado` action calls the CRM CLI instead of writing SQL directly.
- Action revalidation blocks when the lead changed stage before execution.
- Paperclip partial failure returns "CRM updated, Paperclip pending".
- WAHA panel treats `delivery_pending` and `dispatch_ambiguous` correctly.
- `node --check scripts/freela-cockpit.mjs`.
- Existing tests continue passing:
  - `node --test tests/freela-crm-cli.test.mjs tests/paperclip-automation-contract.test.mjs tests/whatsapp-local-gateway.test.mjs`

## Acceptance Criteria

The MVP is ready when:

- Luiz can open `http://127.0.0.1:3200`.
- The scorebar reflects current SQLite state.
- The active kanban shows current actionable leads.
- The WAHA side panel shows delivery and ambiguity state.
- Global search can find active and closed leads.
- Luiz can mark a lead as sent from the UI.
- Luiz can register a received response with required text.
- Sensitive actions require strong confirmation.
- CRM writes happen through the official CLI.
- Paperclip surfaces are updated according to selective notification rules.
- No Cockpit action sends WhatsApp directly.
- The UI handles externally moved leads without stale-action writes.
- Private data stays out of `docs/`, `demos/`, and `outputs/`.

## Approved Decisions

- Use a local app separated from Paperclip.
- Use approach A: backend reads SQLite and writes through the official CLI.
- Use Cockpit layout option A: dense scorebar + kanban + WAHA side panel.
- Include real CRM actions in the MVP.
- Use risk-based confirmation.
- Add selective Paperclip notification.
- Route worker events with a hybrid rule: direct when unambiguous, COO/FRE-7 when ambiguous.
- Include both buttons and a command console with preview.
- Use active kanban plus global search for all leads.
- Use auto-refresh every 30 seconds plus manual refresh.
