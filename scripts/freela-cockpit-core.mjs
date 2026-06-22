import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

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
    ].map(mapLeadContextRow).concat(readActiveWorkerHandoffs(database)),
    bloqueados: database
      .prepare("select * from commercial_pending_validation order by canonical_name")
      .all()
      .map(mapLeadContextRow)
      .concat(readWahaBlockers(database)),
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

export function searchLeads(database, { q = "", limit = 50 } = {}) {
  const query = clean(q).toLowerCase();
  const term = `%${query}%`;
  const rows = database
    .prepare(
      `select *
       from commercial_lead_context
       where lower(coalesce(canonical_name, '')) like ?
          or lower(coalesce(phone_or_contact, '')) like ?
          or lower(coalesce(contact_path, '')) like ?
          or lower(coalesce(instagram, '')) like ?
          or lower(coalesce(city, '')) like ?
          or lower(coalesce(area, '')) like ?
          or lower(coalesce(category, '')) like ?
          or lower(coalesce(status, '')) like ?
          or lower(coalesce(commercial_stage, '')) like ?
       order by
         case
           when lower(coalesce(canonical_name, '')) = ? then 0
           when lower(coalesce(canonical_name, '')) like ? then 1
           else 2
         end,
         datetime(updated_at) desc,
         canonical_name
       limit ?`,
    )
    .all(term, term, term, term, term, term, term, term, term, query, term, normalizeLimit(limit));
  return rows.map(mapLeadContextRow);
}

export function readLeadDetail(database, leadId) {
  const row = database.prepare("select * from commercial_lead_context where lead_id = ?").get(leadId);
  if (!row) {
    throw Object.assign(new Error(`Lead nao encontrado: ${leadId}`), {
      code: "LEAD_NOT_FOUND",
      status: 404,
    });
  }

  const outbox = database
    .prepare(
      `select
         id,
         status,
         source,
         target_chat_id,
         body,
         delivery_ack,
         delivery_ack_name,
         provider_message_id,
         dispatch_error,
         dispatch_locked_at,
         dispatch_provider,
         delivered_at,
         delivery_checked_at,
         guardian_decision,
         guardian_reason,
         attempts,
         bridge_message_id,
         created_at,
         approved_at,
         sent_at,
         failed_at
       from whatsapp_outbox
       where lead_id = ?
       order by datetime(coalesce(delivery_checked_at, delivered_at, sent_at, failed_at, approved_at, created_at)) desc, id desc
       limit 5`,
    )
    .all(leadId)
    .map(mapOutboxRow);

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
      agentMayWake: false,
      requiresStrongConfirmation: false,
      payload: {},
    };
  }

  const matches = resolveLeadMatches(database, parsed.name);
  if (matches.length === 0) return { ok: false, reason: "lead_not_found", matches: [] };
  if (matches.length > 1) return { ok: false, reason: "ambiguous_lead", matches };

  const action = parsed.action;
  const lead = readLeadDetail(database, matches[0].leadId);
  if (isMutationAction(action) && !lead.availableActions.includes(action)) {
    return {
      ok: false,
      reason: "action_unavailable",
      action,
      lead,
      leadId: lead.leadId,
      availableActions: lead.availableActions,
    };
  }

  return {
    ok: true,
    action,
    lead,
    leadId: lead.leadId,
    crmEffect: crmEffectForAction(action),
    paperclipEffect: paperclipEffectForAction(action),
    agentMayWake: agentMayWakeForAction(action),
    requiresStrongConfirmation: requiresStrongConfirmationForAction(action),
    payload: parsed.payload ?? {},
  };
}

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
  const database = openCockpitDatabase({ root, dbPath, readOnly: true });
  let lead;
  try {
    lead = readLeadDetail(database, leadId);
  } finally {
    database.close();
  }

  if (expectedStage && lead.commercialStage !== expectedStage) {
    return actionFailure({
      reason: "lead_stage_changed",
      action,
      lead,
      crmUpdated: false,
      paperclipUpdated: false,
      warnings: [`Lead saiu de ${expectedStage} para ${lead.commercialStage}`],
      nextRefreshRecommended: true,
      extra: {
        expectedStage,
        currentStage: lead.commercialStage,
      },
    });
  }

  if (isMutationAction(action) && !lead.availableActions.includes(action)) {
    return actionFailure({
      reason: "action_unavailable",
      action,
      lead,
      crmUpdated: false,
      paperclipUpdated: false,
      warnings: [`Acao indisponivel para o lead no estado atual: ${action}`],
      nextRefreshRecommended: true,
      extra: {
        availableActions: lead.availableActions,
      },
    });
  }

  const crmArgs = crmArgsForAction({ action, lead, payload });
  if (!crmArgs) {
    return actionFailure({
      reason: "unsupported_action",
      action,
      lead,
      crmUpdated: false,
      paperclipUpdated: false,
      errors: [`Acao nao suportada: ${action}`],
      nextRefreshRecommended: false,
    });
  }

  const health = await runCommand(["healthcheck"]);
  if (commandFailed(health)) {
    return commandFailure("healthcheck_failed", {
      action,
      lead,
      command: ["healthcheck"],
      result: health,
      crmUpdated: false,
    });
  }

  const write = await runCommand(crmArgs);
  if (commandFailed(write)) {
    return commandFailure("crm_write_failed", {
      action,
      lead,
      command: crmArgs,
      result: write,
      crmUpdated: false,
    });
  }

  try {
    await syncPaperclip({ action, lead, payload });
  } catch (error) {
    const message = errorMessage(error);
    return {
      ok: false,
      reason: "paperclip_sync_failed",
      action,
      leadId: lead.leadId,
      lead,
      crmUpdated: true,
      paperclipUpdated: false,
      agentRouted: false,
      warnings: ["CRM atualizado; Paperclip pendente de republicacao."],
      errors: [message],
      error: message,
      nextRefreshRecommended: true,
    };
  }

  return {
    ok: true,
    action,
    leadId: lead.leadId,
    lead,
    crmUpdated: true,
    paperclipUpdated: true,
    agentRouted: agentMayWakeForAction(action),
    warnings: [],
    errors: [],
    nextRefreshRecommended: true,
  };
}

export function parseOperatorCommand(rawCommand) {
  const command = clean(rawCommand);
  const lowerCommand = command.toLowerCase();
  if (!command) return { ok: false, reason: "empty_command" };
  if (lowerCommand === "status") return { ok: true, action: "status", name: "", payload: {} };
  if (lowerCommand.startsWith("status ")) {
    return parseNamedAction(command, "status ", "status_lead");
  }
  if (lowerCommand.startsWith("followup enviado ") || lowerCommand === "followup enviado") {
    return parseNamedAction(command, "followup enviado ", "followup_enviado");
  }
  if (lowerCommand.startsWith("enviado ") || lowerCommand === "enviado") {
    return parseNamedAction(command, "enviado ", "enviado");
  }
  if (lowerCommand.startsWith("respondeu ") || lowerCommand === "respondeu") {
    return parseResponseCommand(command);
  }
  if (lowerCommand.startsWith("pediu exemplo ") || lowerCommand === "pediu exemplo") {
    return parseNamedAction(command, "pediu exemplo ", "pediu_exemplo");
  }
  if (lowerCommand.startsWith("pediu preco ") || lowerCommand === "pediu preco") {
    return parseNamedAction(command, "pediu preco ", "pediu_preco");
  }
  if (lowerCommand.startsWith("perdido ") || lowerCommand === "perdido") {
    return parseClosureAction(command, "perdido ", "perdido");
  }
  if (lowerCommand.startsWith("descartar ") || lowerCommand === "descartar") {
    return parseClosureAction(command, "descartar ", "descartar");
  }
  return { ok: false, reason: "unknown_command" };
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

function latestQueueDate(database) {
  return (
    database.prepare("select queue_date from outreach_queue order by queue_date desc limit 1").get()?.queue_date ??
    new Date().toISOString().slice(0, 10)
  );
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

function readActiveWorkerHandoffs(database) {
  return database
    .prepare(
      `select *
       from worker_handoffs
       where status not in ('completed', 'cancelled')
       order by datetime(updated_at) desc, id desc`,
    )
    .all()
    .map(mapWorkerHandoffRow);
}

function readWahaBlockers(database) {
  return database
    .prepare(
      `select
         o.id as outbox_id,
         o.lead_id,
         o.target_chat_id,
         o.body,
         o.source,
         o.status as outbox_status,
         o.dispatch_error,
         o.dispatch_locked_at,
         o.dispatch_provider,
         o.provider_message_id,
         o.delivery_ack,
         o.delivery_ack_name,
         o.delivered_at,
         o.delivery_checked_at,
         o.guardian_decision,
         o.guardian_reason,
         o.attempts,
         o.bridge_message_id,
         o.created_at,
         o.approved_at,
         o.sent_at,
         o.failed_at,
         l.canonical_name,
         l.status as lead_status,
         l.category,
         l.city,
         l.area,
         l.phone_or_contact,
         l.instagram,
         l.website_url,
         l.recommended_offer,
         s.whatsapp_state,
         s.handoff_reason,
         s.updated_at as state_updated_at
       from whatsapp_outbox o
       join leads l on l.id = o.lead_id
       left join lead_conversation_state s on s.lead_id = o.lead_id
       where o.status = 'dispatch_ambiguous'
          or o.status = 'blocked'
          or o.guardian_decision in ('bloquear', 'bloqueado', 'blocked')
          or s.whatsapp_state = 'bloqueado_guardiao'
          or (
            o.status = 'delivery_pending'
            and datetime(coalesce(o.delivery_checked_at, o.sent_at, o.approved_at, o.created_at)) <= datetime('now', '-30 minutes')
          )
       order by datetime(coalesce(o.failed_at, o.sent_at, o.created_at)) desc, o.id desc`,
    )
    .all()
    .map(mapWahaBlockerRow);
}

function parseNamedAction(command, prefix, action) {
  const name = clean(command.slice(prefix.length));
  if (!name) return { ok: false, reason: "lead_name_required", action };
  return { ok: true, action, name, payload: {} };
}

function parseResponseCommand(command) {
  const body = command.slice("respondeu ".length);
  const separator = body.indexOf(":");
  if (separator === -1) return { ok: false, reason: "response_message_required" };

  const name = clean(body.slice(0, separator));
  if (!name) return { ok: false, reason: "lead_name_required", action: "respondeu" };

  const message = clean(body.slice(separator + 1));
  if (!message) return { ok: false, reason: "response_message_required" };

  return { ok: true, action: "respondeu", name, payload: { message } };
}

function parseClosureAction(command, prefix, action) {
  const body = clean(command.slice(prefix.length));
  if (!body) return { ok: false, reason: "lead_name_required", action };

  const separator = body.indexOf(":");
  if (separator === -1) return { ok: false, reason: "closure_reason_required", action };

  const name = clean(body.slice(0, separator));
  if (!name) return { ok: false, reason: "lead_name_required", action };

  const reason = clean(body.slice(separator + 1));
  if (!reason) return { ok: false, reason: "closure_reason_required", action };

  return { ok: true, action, name, payload: { reason } };
}

function resolveLeadMatches(database, name) {
  const query = clean(name).toLowerCase();
  if (!query) return [];

  const exactRows = database
    .prepare(
      `select *
       from commercial_lead_context
       where lower(trim(coalesce(canonical_name, ''))) = ?
       order by canonical_name
       limit 10`,
    )
    .all(query);
  if (exactRows.length > 0) return exactRows.map(mapLeadContextRow);

  const term = `%${query}%`;
  return database
    .prepare(
      `select *
       from commercial_lead_context
       where lower(coalesce(canonical_name, '')) like ?
       order by canonical_name
       limit 10`,
    )
    .all(term)
    .map(mapLeadContextRow);
}

function crmArgsForAction({ action, lead, payload = {} }) {
  const name = lead.canonicalName;
  if (action === "enviado" || action === "followup_enviado") {
    return ["lead", "mark-contacted", "--name", name];
  }

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
      clean(payload.message) || "Lead pediu preco.",
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
      clean(payload.message) || "Lead pediu exemplo.",
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

function actionFailure({
  reason,
  action,
  lead,
  crmUpdated,
  paperclipUpdated,
  warnings = [],
  errors = [],
  nextRefreshRecommended,
  extra = {},
}) {
  return {
    ok: false,
    reason,
    action,
    leadId: lead?.leadId,
    lead,
    crmUpdated,
    paperclipUpdated,
    agentRouted: false,
    warnings,
    errors,
    nextRefreshRecommended,
    ...extra,
  };
}

function commandFailure(reason, { action, lead, command, result, crmUpdated }) {
  const message = commandErrorMessage(command, result);
  return actionFailure({
    reason,
    action,
    lead,
    crmUpdated,
    paperclipUpdated: false,
    errors: [message],
    nextRefreshRecommended: true,
    extra: {
      command,
      exitStatus: commandStatus(result),
    },
  });
}

function commandFailed(result) {
  return commandStatus(result) !== 0;
}

function commandStatus(result) {
  if (!result) return 1;
  if (typeof result.status === "number") return result.status;
  if (typeof result.exitCode === "number") return result.exitCode;
  if (typeof result.code === "number") return result.code;
  return 0;
}

function commandErrorMessage(command, result) {
  return firstFilled(result?.stderr, result?.stdout, `Comando falhou: ${command.join(" ")}`);
}

function errorMessage(error) {
  return clean(error?.message) || String(error);
}

function availableActionsForLead(row) {
  const status = clean(row.status).toLowerCase();
  const commercialStage = clean(row.commercial_stage).toLowerCase();
  if (["fechado", "perdido", "descartado", "duplicado"].includes(status)) return [];

  const actions = [];
  if (commercialStage === "ready_lead_card") actions.push("enviado");
  if (commercialStage === "followup" || ["abordado", "respondeu", "interessado", "tem_demo"].includes(status)) {
    actions.push("followup_enviado");
  }
  actions.push("respondeu", "pediu_exemplo", "pediu_preco", "perdido", "descartar");
  return [...new Set(actions)];
}

function isMutationAction(action) {
  return ["enviado", "followup_enviado", "respondeu", "pediu_exemplo", "pediu_preco", "perdido", "descartar"].includes(
    action,
  );
}

function crmEffectForAction(action) {
  return (
    {
      status: "read_summary",
      status_lead: "read_lead",
      enviado: "mark_contacted",
      followup_enviado: "mark_followup_sent",
      respondeu: "record_response",
      pediu_exemplo: "record_demo_request",
      pediu_preco: "record_price_request",
      perdido: "mark_lost",
      descartar: "mark_discarded",
    }[action] ?? "unknown"
  );
}

function paperclipEffectForAction(action) {
  if (["respondeu", "pediu_exemplo", "pediu_preco"].includes(action)) return "route_worker_or_triage";
  if (["enviado", "followup_enviado", "perdido", "descartar"].includes(action)) return "refresh_surfaces";
  return "none";
}

function agentMayWakeForAction(action) {
  return ["respondeu", "pediu_exemplo", "pediu_preco"].includes(action);
}

function requiresStrongConfirmationForAction(action) {
  return ["respondeu", "pediu_exemplo", "pediu_preco", "perdido", "descartar"].includes(action);
}

function mapOutboxRow(row) {
  return {
    id: row.id,
    status: row.status,
    source: row.source,
    targetChatId: row.target_chat_id,
    body: row.body,
    deliveryAck: row.delivery_ack,
    deliveryAckName: row.delivery_ack_name,
    providerMessageId: row.provider_message_id,
    dispatchError: row.dispatch_error,
    dispatchLockedAt: row.dispatch_locked_at,
    dispatchProvider: row.dispatch_provider,
    deliveredAt: row.delivered_at,
    deliveryCheckedAt: row.delivery_checked_at,
    guardianDecision: row.guardian_decision,
    guardianReason: row.guardian_reason,
    attempts: row.attempts,
    bridgeMessageId: row.bridge_message_id,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    sentAt: row.sent_at,
    failedAt: row.failed_at,
  };
}

function mapWorkerHandoffRow(row) {
  return {
    cardKind: "worker_handoff",
    handoffId: row.id,
    canonicalName: row.title,
    status: row.status,
    commercialStage: "worker_handoff",
    category: row.target_agent_name,
    message: row.required_action,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    targetAgentId: row.target_agent_id,
    targetAgentName: row.target_agent_name,
    sourceAgentId: row.source_agent_id,
    sourceAgentName: row.source_agent_name,
    workflowBatchId: row.workflow_batch_id,
    workflowRunId: row.workflow_run_id,
    workflowRoundDate: row.workflow_round_date,
    workflowStage: row.workflow_stage,
    workflowExpectedCount: row.workflow_expected_count,
    workflowActualCount: row.workflow_actual_count,
    workflowGateStatus: row.workflow_gate_status,
    workflowNextOwner: row.workflow_next_owner,
    paperclipIssueId: row.paperclip_issue_id,
    paperclipIssueIdentifier: row.paperclip_issue_identifier,
  };
}

function mapWahaBlockerRow(row) {
  return {
    cardKind: "waha_blocker",
    outboxId: row.outbox_id,
    leadId: row.lead_id,
    canonicalName: row.canonical_name,
    status: row.outbox_status,
    commercialStage: "waha_blocked",
    category: row.source,
    city: row.city,
    area: row.area,
    contact: row.phone_or_contact || row.instagram || row.target_chat_id || "",
    instagram: row.instagram,
    websiteUrl: row.website_url,
    recommendedOffer: row.recommended_offer,
    targetChatId: row.target_chat_id,
    guardianDecision: row.guardian_decision,
    guardianReason: row.guardian_reason,
    whatsappState: row.whatsapp_state,
    validationBlocker: firstFilled(row.dispatch_error, row.guardian_reason, row.handoff_reason, row.outbox_status),
    message: row.body,
    dispatchError: row.dispatch_error,
    dispatchLockedAt: row.dispatch_locked_at,
    dispatchProvider: row.dispatch_provider,
    providerMessageId: row.provider_message_id,
    deliveryAck: row.delivery_ack,
    deliveryAckName: row.delivery_ack_name,
    deliveredAt: row.delivered_at,
    deliveryCheckedAt: row.delivery_checked_at,
    attempts: row.attempts,
    bridgeMessageId: row.bridge_message_id,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    sentAt: row.sent_at,
    failedAt: row.failed_at,
    updatedAt: firstFilled(row.delivery_checked_at, row.delivered_at, row.sent_at, row.failed_at, row.state_updated_at, row.created_at),
  };
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

function normalizeLimit(limit) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(0, Math.trunc(parsed));
}

function firstFilled(...values) {
  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned) return cleaned;
  }
  return "";
}
