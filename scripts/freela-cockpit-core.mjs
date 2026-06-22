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

function firstFilled(...values) {
  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned) return cleaned;
  }
  return "";
}
