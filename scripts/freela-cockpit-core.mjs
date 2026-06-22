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
    ].map(mapLeadContextRow),
    bloqueados: database
      .prepare("select * from commercial_pending_validation order by canonical_name")
      .all()
      .map(mapLeadContextRow),
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
