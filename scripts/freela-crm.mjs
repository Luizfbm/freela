#!/usr/bin/env node
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";

const VALID_STATUSES = new Set([
  "novo",
  "abordado",
  "respondeu",
  "interessado",
  "fechado",
  "perdido",
  "descartado",
  "reanalisar",
  "duplicado",
  "tem_demo",
]);

const NON_REGRESSIVE_STATUSES = new Set([
  "abordado",
  "respondeu",
  "interessado",
  "fechado",
  "perdido",
  "descartado",
  "tem_demo",
]);

const QA_APPROVED_STATUSES = new Set(["aprovado_para_lead_cards", "aprovado_com_observacao"]);
const QA_STATUSES = new Set([...QA_APPROVED_STATUSES, "requer_ajuste", "bloqueado"]);
const PROFILE_BIO_STATUSES = new Set(["ok", "sem_bio", "privado", "bloqueado", "nao_encontrado", "erro_tecnico"]);
const PROFILE_BIO_LINK_TYPES = new Set([
  "whatsapp",
  "linktree",
  "bio_site",
  "site",
  "agenda",
  "maps",
  "outro",
  "nenhum",
]);
const PROFILE_BIO_LINK_STATUSES = new Set([
  "analisado",
  "nao_aplicavel",
  "bloqueado",
  "pendente",
  "erro_tecnico",
]);
const PROFILE_EVIDENCE_CONFIDENCES = new Set(["alta", "media", "baixa"]);
const PROFILE_BROWSER_EVIDENCE_STATUSES = new Set([
  "ok",
  "dom_blocked",
  "session_blocked",
  "login_required",
  "challenge",
  "profile_private",
  "not_found",
  "page_loading",
  "technical_error",
  "not_checked",
]);
const PROFILE_BROWSER_EVIDENCE_METHODS = new Set([
  "chrome_operational_profile",
  "chrome_personal_apple_events",
  "public_indexed",
  "manual_review",
  "none",
]);
const PROFILE_INSTAGRAM_SESSION_STATUSES = new Set([
  "logged_in",
  "logged_out",
  "challenge",
  "unknown",
  "not_checked",
]);
const WHATSAPP_CONVERSATION_STATES = new Set([
  "none",
  "atendimento_autonomo",
  "respondeu_pode",
  "pedido_exemplo",
  "exemplo_aprovado_para_envio",
  "preco_pedido",
  "lead_quente",
  "objecao_comercial",
  "qualificacao_preco_pendente",
  "handoff_luiz",
  "bloqueado_guardiao",
  "encerrado",
]);
const HANDOFF_STATUSES = new Set([
  "pending_issue",
  "issue_created",
  "blocked",
  "completed",
  "cancelled",
]);
const DEFAULT_PAPERCLIP_API_BASE = "http://127.0.0.1:3100";
const DEFAULT_PAPERCLIP_COMPANY_ID = "50a2756c-2942-40c1-90f8-b16807a62ef3";
const DEFAULT_CLOSER_AGENT_ID = "4d334072-4966-4c9d-a16a-f3e48faf05d9";
const DEFAULT_SCOUT_AGENT_ID = "d846f1b7-f6ae-4005-9ef4-53a32b13635e";
const WHATSAPP_GUARDIAN_REPAIR_WAKE_TYPE = "whatsapp_guardian_repair";
const WHATSAPP_GUARDIAN_REANALYSIS_WAKE_TYPE = "whatsapp_guardian_reanalysis";
const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "ascii");
const DEFAULT_DB_BACKUP_LIMIT = 20;

async function main() {
  try {
    const parsed = parseCommand(process.argv.slice(2));
    await withSqliteBusyRetry(() => dispatch(parsed));
  } catch (error) {
    const exitCode = error.exitCode ?? 1;
    console.error(error.message);
    process.exit(exitCode);
  }
}

async function withSqliteBusyRetry(operation) {
  const delays = [100, 250, 500];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isSqliteBusy(error) || attempt >= delays.length) throw error;
      sleepSync(delays[attempt]);
    }
  }
}

function isSqliteBusy(error) {
  return /SQLITE_BUSY|database is locked/i.test(String(error?.code ?? error?.message ?? error));
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

async function dispatch({ root, dbPath, command, args }) {
  if (!command.length) {
    throw usageError("Comando obrigatorio. Ex.: init, lead upsert --file leads.json");
  }

  if (command[0] === "healthcheck") {
    const report = healthcheckDatabase(root, dbPath);
    console.log("SQLite healthcheck: ok");
    console.log(`path: ${report.path}`);
    console.log(`integrity_check: ${report.integrityCheck}`);
    if (report.materialized) console.log("materialized: true");
    return;
  }

  if (command[0] === "init") {
    const database = openDatabase(root, dbPath);
    database.close();
    console.log(`SQLite pronto em ${databasePath(root, dbPath)}`);
    return;
  }

  const readOnlyDatabase = isDatabaseReadOnlyCommand(command);
  ensureOperationalWritesAllowed(root, command);
  const database = openDatabase(root, dbPath, { readOnly: readOnlyDatabase });

  if (command[0] === "lead" && command[1] === "upsert") {
    const flags = parseFlags(args);
    requireFlag(flags, "file");
    const records = readRecords(resolve(root, flags.file));
    const result = upsertLeads(database, records);
    console.log(`Leads processados: ${result.inserted} novos, ${result.merged} merges`);
    return;
  }

  if (command[0] === "lead" && command[1] === "status") {
    const flags = parseFlags(args);
    requireFlag(flags, "name");
    const lead = requireUniqueLead(database, flags.name);
    console.log(formatLeadStatus(database, lead));
    return;
  }

  if (command[0] === "lead" && command[1] === "update") {
    const flags = parseFlags(args);
    requireFlag(flags, "name");
    const lead = requireUniqueLead(database, flags.name);
    const updates = collectLeadUpdates(flags);
    if (!Object.keys(updates).length) {
      throw usageError(
        "Informe ao menos um campo: --status, --response-status, --recommended-offer, --demo-path, --analysis-status, --handoff-status, --instagram ou --notes",
      );
    }
    updateLeadFields(database, lead, updates);
    console.log(`Lead atualizado: ${lead.canonical_name}`);
    return;
  }

  if (command[0] === "lead" && command[1] === "mark-contacted") {
    const flags = parseFlags(args);
    requireFlag(flags, "name");
    const lead = requireUniqueLead(database, flags.name);
    markContacted(database, lead, flags.date ?? today());
    console.log(`Lead marcado como abordado: ${lead.canonical_name}`);
    return;
  }

  if (command[0] === "lead" && command[1] === "mark-response") {
    const flags = parseFlags(args);
    requireFlag(flags, "name");
    requireFlag(flags, "message");
    const lead = requireUniqueLead(database, flags.name);
    markResponse(database, lead, {
      message: flags.message,
      occurredAt: flags["received-at"] ?? now(),
      status: flags.status ?? "respondeu",
      responseStatus: flags["response-status"] ?? classifyResponse(flags.message),
      rawFile: null,
    });
    console.log(`Resposta registrada: ${lead.canonical_name}`);
    return;
  }

  if (command[0] === "conversation" && command[1] === "ingest") {
    const flags = parseFlags(args);
    requireFlag(flags, "file");
    const file = resolve(root, flags.file);
    const conversation = readConversation(file);
    const lead = identifyLeadForConversation(database, conversation);
    markResponse(database, lead, {
      message: conversation.message,
      occurredAt: conversation.received_at ?? now(),
      status: "respondeu",
      responseStatus: classifyResponse(conversation.message),
      rawFile: file,
    });
    console.log(`Conversa registrada: ${lead.canonical_name}`);
    return;
  }

  if (command[0] === "profile-evidence" && command[1] === "upsert") {
    const flags = parseFlags(args);
    requireFlag(flags, "file");
    const records = readRecords(resolve(root, flags.file));
    const result = upsertProfileEvidence(database, records);
    console.log(`Evidencias de perfil processadas: ${result.upserted}`);
    return;
  }

  if (command[0] === "profile-evidence" && command[1] === "export") {
    const flags = parseFlags(args);
    const evidenceDate = flags.date ?? today();
    exportProfileEvidence(database, root, evidenceDate);
    console.log(`Evidence pack exportado em .scratch/prospeccao-vitoria/${evidenceDate}/profile-evidence.md`);
    return;
  }

  if (command[0] === "queue" && command[1] === "generate") {
    const flags = parseFlags(args);
    const queueDate = flags.date ?? today();
    const count = generateQueue(database, queueDate);
    exportTodayQueue(database, root, queueDate);
    exportPaperclipLeadCards(database, root, queueDate);
    console.log(`Fila gerada para ${queueDate}: ${count} leads`);
    return;
  }

  if (command[0] === "queue" && command[1] === "set-message") {
    const flags = parseFlags(args);
    requireFlag(flags, "name");
    requireFlag(flags, "message");
    const lead = requireUniqueLead(database, flags.name);
    const queueDate = flags.date ?? latestQueueDate(database) ?? today();
    setQueueMessage(database, lead, {
      queueDate,
      message: flags.message,
    });
    exportTodayQueue(database, root, queueDate);
    exportPaperclipLeadCards(database, root, queueDate);
    console.log(`Mensagem pronta registrada: ${lead.canonical_name} (${queueDate})`);
    return;
  }

  if (command[0] === "queue" && command[1] === "approve-card") {
    const flags = parseFlags(args);
    requireFlag(flags, "name");
    requireFlag(flags, "qa-status");
    const lead = requireUniqueLead(database, flags.name);
    const queueDate = flags.date ?? latestQueueDate(database) ?? today();
    approveQueueCard(database, lead, {
      queueDate,
      qaStatus: flags["qa-status"],
    });
    exportTodayQueue(database, root, queueDate);
    exportPaperclipLeadCards(database, root, queueDate);
    console.log(`Card liberado por QA: ${lead.canonical_name} (${queueDate})`);
    return;
  }

  if (command[0] === "queue" && command[1] === "approve-cards") {
    const flags = parseFlags(args);
    requireFlag(flags, "file");
    const result = approveQueueCardsFromQaReport(database, {
      file: resolve(root, flags.file),
      queueDate: flags.date ?? null,
    });
    exportTodayQueue(database, root, result.queueDate);
    exportPaperclipLeadCards(database, root, result.queueDate);
    console.log(`Cards liberados por QA: ${result.count} (${result.queueDate})`);
    return;
  }

  if (command[0] === "queue" && command[1] === "close-pending") {
    const flags = parseFlags(args);
    requireFlag(flags, "name");
    const lead = requireUniqueLead(database, flags.name);
    const status = flags.status ?? "done";
    const count = closePendingQueueItems(database, lead, status, {
      queueDate: flags.date,
      cardStatus: flags["card-status"],
      placeholderOnly: parseBooleanFlag(flags["placeholder-only"]),
    });
    const queueDate = flags.date ?? latestQueueDate(database) ?? today();
    exportTodayQueue(database, root, queueDate);
    exportPaperclipLeadCards(database, root, queueDate);
    console.log(`Pendencias de fila fechadas: ${lead.canonical_name} (${count})`);
    return;
  }

  if (command[0] === "whatsapp" && command[1] === "inbound" && command[2] === "ingest") {
    const flags = parseFlags(args);
    requireFlag(flags, "file");
    const file = resolve(root, flags.file);
    const event = readJsonFile(file);
    const result = ingestWhatsAppInbound(database, event, file);
    if (result.unmatched) {
      console.log(`WhatsApp inbound sem lead: unmatched ${result.unmatched.id} (${result.classification})`);
      return;
    }
    console.log(
      `WhatsApp inbound registrado: ${result.lead.canonical_name} (${result.classification})`,
    );
    return;
  }

  if (command[0] === "whatsapp" && command[1] === "identity" && command[2] === "link") {
    const flags = parseFlags(args);
    requireFlag(flags, "identity");
    const lead = resolveLeadForIdentityLink(database, flags);
    const identity = linkWhatsAppIdentity(database, lead, {
      identity: flags.identity,
      source: flags.source ?? "manual",
      notes: flags.notes ?? "",
    });
    console.log(`Identidade WhatsApp vinculada: ${lead.canonical_name} (${identity.identity_value})`);
    return;
  }

  if (command[0] === "whatsapp" && command[1] === "unmatched" && command[2] === "reconcile") {
    const flags = parseFlags(args);
    const result = reconcileUnmatchedWhatsAppInbound(database, {
      limit: flags.limit ? parsePositiveInt(flags.limit, "limit") : 50,
      ids: flags.id ? parseListFlag(flags.id).map((id) => parsePositiveInt(id, "id")) : [],
      chatId: clean(flags["chat-id"]),
    });
    console.log(`Reconciliados: ${result.reconciled}`);
    console.log(`Pendentes: ${result.pending}`);
    return;
  }

  if (command[0] === "whatsapp" && command[1] === "unmatched" && command[2] === "mark-no-match") {
    const flags = parseFlags(args);
    requireFlag(flags, "reason");
    const result = markNoMatchUnmatchedWhatsAppInbound(database, {
      ids: flags.id ? parseListFlag(flags.id).map((id) => parsePositiveInt(id, "id")) : [],
      chatId: clean(flags["chat-id"]),
      reason: flags.reason,
    });
    console.log(`Eventos sem match registrados: ${result.marked}`);
    return;
  }

  if (command[0] === "whatsapp" && command[1] === "state" && command[2] === "set") {
    const flags = parseFlags(args);
    requireFlag(flags, "name");
    requireFlag(flags, "state");
    const lead = requireUniqueLead(database, flags.name);
    setWhatsAppConversationState(database, lead, {
      state: flags.state,
      reason: flags.reason ?? "",
      resetAutoReplies: parseBooleanFlag(flags["reset-auto-replies"]),
    });
    console.log(`Estado WhatsApp atualizado: ${lead.canonical_name} (${flags.state})`);
    return;
  }

  if (command[0] === "whatsapp" && command[1] === "outbox" && command[2] === "propose") {
    const flags = parseFlags(args);
    requireFlag(flags, "name");
    requireFlag(flags, "body");
    requireFlag(flags, "source");
    const lead = requireUniqueLead(database, flags.name);
    const outbox = proposeWhatsAppOutbox(database, lead, {
      body: flags.body,
      source: flags.source,
      humanizerPass: parseBooleanFlag(flags["humanizer-pass"]),
      usedLastInbound: parseBooleanFlag(flags["used-last-inbound"]),
      contextualReply: parseBooleanFlag(flags["contextual-reply"]),
      humanizerNotes: flags["humanizer-notes"] ?? "",
    });
    console.log(`Outbox pendente de guardiao: ${outbox.id}`);
    return;
  }

  if (command[0] === "whatsapp" && command[1] === "outbox" && command[2] === "status") {
    const flags = parseFlags(args);
    requireFlag(flags, "outbox-id");
    const report = whatsappOutboxStatus(database, parsePositiveInt(flags["outbox-id"], "outbox-id"), root);
    console.log(formatWhatsAppOutboxStatus(report));
    return;
  }

  if (command[0] === "whatsapp" && command[1] === "outbox" && command[2] === "list-dispatchable") {
    listDispatchableWhatsAppOutboxes(database, root);
    return;
  }

  if (command[0] === "whatsapp" && command[1] === "guardian" && command[2] === "review") {
    const flags = parseFlags(args);
    requireFlag(flags, "outbox-id");
    const outboxId = parsePositiveInt(flags["outbox-id"], "outbox-id");
    const decision = reviewWhatsAppOutbox(database, outboxId);
    console.log(`Guardiao: ${decision.decision} (${decision.reason})`);
    if (parseBooleanFlag(flags["auto-wake"])) {
      const wake = await autoWakeForGuardianReview(database, outboxId, buildGuardianAutoWakeOptions(flags));
      console.log(`Wake Paperclip: ${wake.status}${wake.error ? ` (${wake.error})` : ""}`);
    }
    return;
  }

  if (command[0] === "commercial" && command[1] === "status") {
    const flags = parseFlags(args);
    const queueDate = flags.date ?? latestQueueDate(database) ?? today();
    const report = commercialStatusReport(database, queueDate);
    exportCommercialStatus(root, report);
    console.log(formatCommercialStatus(report));
    return;
  }

  if (command[0] === "commercial" && command[1] === "export") {
    const flags = parseFlags(args);
    const queueDate = flags.date ?? latestQueueDate(database) ?? today();
    const report = exportCommercialSurfaces(database, root, queueDate);
    console.log(`SQLite comercial exportado em .scratch/crm/commercial-funnel.md e .scratch/ops/commercial-status.md`);
    console.log(formatCommercialStatus(report));
    return;
  }

  if (command[0] === "commercial" && command[1] === "enrichment-plan") {
    const flags = parseFlags(args);
    const planDate = flags.date ?? today();
    const limit = parsePositiveInt(flags.limit ?? "25", "limit");
    const excludeRunIds = parseListFlag(flags["exclude-run-id"] ?? flags["exclude-run-ids"]);
    const plan = exportCommercialEnrichmentPlan(database, root, { planDate, limit, excludeRunIds });
    console.log(
      `Plano de enriquecimento: ${plan.summary.selected_leads} leads em .scratch/crm/enrichment-backfill-${planDate}/`,
    );
    return;
  }

  if (command[0] === "commercial" && command[1] === "duplicate-audit") {
    const flags = parseFlags(args);
    const auditDate = flags.date ?? today();
    const audit = exportCommercialDuplicateAudit(database, root, { auditDate });
    console.log(
      `Auditoria de duplicidade: ${audit.summary.total_groups} grupos em .scratch/crm/enrichment-backfill-${auditDate}/`,
    );
    return;
  }

  if (command[0] === "handoff" && command[1] === "record") {
    const flags = parseFlags(args);
    requireFlag(flags, "file");
    const file = resolve(root, flags.file);
    const handoff = readJsonFile(file);
    const result = recordWorkerHandoff(database, {
      handoff,
      sourceFile: file,
      status: flags.status,
      paperclipIssueId: flags["paperclip-issue-id"],
      paperclipIssueIdentifier: flags["paperclip-issue-identifier"],
    });
    console.log(`Handoff registrado: ${result.workflowStage} (${result.status})`);
    return;
  }

  if (command[0] === "handoff" && command[1] === "reconcile") {
    const flags = parseFlags(args);
    const result = await reconcileWorkerHandoffs(database, {
      apiBase: normalizeApiBase(flags["api-base"] ?? process.env.PAPERCLIP_API_URL ?? "http://127.0.0.1:3100"),
      apiKey: flags["api-key"] ?? process.env.PAPERCLIP_API_KEY ?? null,
      runId: flags["run-id"] ?? process.env.PAPERCLIP_RUN_ID ?? null,
    });
    const errorSuffix = result.errors ? `, ${result.errors} erros` : "";
    console.log(
      `Handoffs reconciliados: ${result.closed} fechados, ${result.active} ainda ativos${errorSuffix}`,
    );
    return;
  }

  if (command[0] === "export" && command[1] === "all") {
    exportAll(database, root);
    console.log("Espelhos exportados em .scratch/");
    return;
  }

  if (command[0] === "export" && command[1] === "paperclip-cards") {
    const flags = parseFlags(args);
    const queueDate = flags.date ?? latestQueueDate(database) ?? today();
    exportPaperclipLeadCards(database, root, queueDate);
    console.log(`Cards Paperclip exportados em .scratch/crm/paperclip-lead-cards.md`);
    return;
  }

  if (command[0] === "export" && command[1] === "operator-status") {
    const flags = parseFlags(args);
    const queueDate = flags.date ?? latestQueueDate(database) ?? today();
    exportOperatorStatus(database, root, queueDate);
    console.log(`Status operacional exportado em .scratch/ops/paperclip-operator-status.md`);
    return;
  }

  throw usageError(`Comando desconhecido: ${command.join(" ")}`);
}

function parseCommand(argv) {
  const args = [...argv];
  let root = process.cwd();
  let dbPath = null;

  while (args[0]?.startsWith("--")) {
    const key = args.shift().slice(2);
    const value = args.shift();
    if (!value) throw usageError(`Valor obrigatorio para --${key}`);
    if (key === "root") root = resolve(value);
    else if (key === "db") dbPath = parseDatabasePath(value);
    else throw usageError(`Opcao global desconhecida: --${key}`);
  }

  const command = [];
  if (args[0]) command.push(args.shift());
  if (
    command[0] &&
    ["lead", "conversation", "profile-evidence", "queue", "commercial", "handoff", "export", "whatsapp"].includes(command[0])
  ) {
    if (!args[0]) throw usageError(`Subcomando obrigatorio para ${command[0]}`);
    command.push(args.shift());
    if (command[0] === "whatsapp" && ["inbound", "outbox", "guardian", "identity", "unmatched", "state"].includes(command[1])) {
      if (!args[0]) throw usageError(`Acao obrigatoria para ${command.join(" ")}`);
      command.push(args.shift());
    }
  }

  return { root, dbPath, command, args };
}

function parseFlags(args) {
  const flags = {};
  const rest = [...args];
  while (rest.length) {
    const token = rest.shift();
    if (!token.startsWith("--")) throw usageError(`Opcao invalida: ${token}`);
    const key = token.slice(2);
    const value = rest.shift();
    if (value === undefined || value.startsWith("--")) {
      throw usageError(`Valor obrigatorio para --${key}`);
    }
    flags[key] = value;
  }
  return flags;
}

function requireFlag(flags, name) {
  if (!flags[name]) throw usageError(`--${name} obrigatorio`);
}

function parsePositiveInt(value, name) {
  const number = Number.parseInt(clean(value), 10);
  if (!Number.isInteger(number) || number < 1) {
    throw usageError(`--${name} deve ser um inteiro positivo`);
  }
  return number;
}

function parseBooleanFlag(value) {
  if (value === undefined) return false;
  const normalized = clean(value).toLowerCase();
  if (["1", "true", "sim", "yes"].includes(normalized)) return true;
  if (["0", "false", "nao", "não", "no"].includes(normalized)) return false;
  throw usageError(`Valor booleano invalido: ${value}`);
}

function parseListFlag(value) {
  return clean(value)
    .split(",")
    .map((item) => clean(item))
    .filter(Boolean);
}

function usageError(message) {
  const error = new Error(message);
  error.exitCode = 1;
  return error;
}

function ambiguityError(message) {
  const error = new Error(message);
  error.exitCode = 2;
  return error;
}

function databasePath(root, explicitPath) {
  return explicitPath ?? join(root, ".scratch/db/freela.sqlite");
}

function parseDatabasePath(value) {
  const raw = clean(value);
  if (/^file:/i.test(raw)) {
    try {
      return fileURLToPath(new URL(raw));
    } catch (error) {
      throw usageError(`URI SQLite invalida em --db: ${error.message}`);
    }
  }
  return resolve(raw);
}

function healthcheckDatabase(root, explicitPath) {
  const path = databasePath(root, explicitPath);
  if (!existsSync(path)) {
    throw usageError(`SQLite nao encontrado: ${path}. Rode init antes de operar.`);
  }

  const validation = ensureUsableDatabaseFile(root, path);
  let database = null;
  try {
    database = new DatabaseSync(sqliteFileUri(path, "ro"), { readOnly: true });
    database.exec("PRAGMA busy_timeout = 10000;");
    const result = database.prepare("pragma integrity_check").get().integrity_check;
    if (result !== "ok") {
      const snapshot = snapshotInvalidDatabase(root, path, `integrity_check: ${result}`);
      throw usageError(`SQLite invalido: integrity_check retornou ${result}. Snapshot forense: ${snapshot}`);
    }
    return {
      path,
      integrityCheck: result,
      materialized: validation.materialized,
    };
  } catch (error) {
    if (error.exitCode) throw error;
    const snapshot = snapshotInvalidDatabase(root, path, error.message);
    throw usageError(`SQLite invalido: ${error.message}. Snapshot forense: ${snapshot}`);
  } finally {
    if (database) database.close();
  }
}

function openDatabase(root, explicitPath, options = {}) {
  const path = databasePath(root, explicitPath);

  if (options.readOnly) {
    if (!existsSync(path)) {
      throw usageError(`SQLite nao encontrado: ${path}. Rode init antes de operar.`);
    }
    ensureUsableDatabaseFile(root, path);
    const database = new DatabaseSync(sqliteFileUri(path, "ro"), { readOnly: true });
    database.exec("PRAGMA busy_timeout = 10000;");
    database.exec("PRAGMA foreign_keys = ON;");
    return database;
  }

  mkdirSync(dirname(path), { recursive: true });
  mkdirSync(join(root, ".scratch/leads"), { recursive: true });
  mkdirSync(join(root, ".scratch/crm"), { recursive: true });

  if (existsSync(path)) {
    ensureUsableDatabaseFile(root, path);
    createRotatingDatabaseBackup(root, path);
  }

  const database = new DatabaseSync(path);
  database.exec("PRAGMA busy_timeout = 10000;");
  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec(schemaSql());
  migrateDatabase(database);
  return database;
}

function ensureOperationalWritesAllowed(root, command) {
  if (!requiresOperationalWriteGuard(command)) return;
  const statusPath = join(root, ".scratch/ops/reliability-status.json");
  if (!existsSync(statusPath)) return;

  let report;
  try {
    report = JSON.parse(readFileSync(statusPath, "utf8"));
  } catch (error) {
    throw usageError(`Status operacional ilegivel em ${statusPath}: ${error.message}`);
  }

  if (report.status === "red") {
    throw usageError(
      `Ops Doctor marcou status operacional red em ${report.checkedAt ?? "data desconhecida"}. ` +
        "Escrita critica bloqueada. Rode node scripts/freela-ops-doctor.mjs check e siga .scratch/ops/reliability-status.md.",
    );
  }
}

function requiresOperationalWriteGuard(command) {
  const joined = command.join(" ");
  const readOnly = new Set([
    "healthcheck",
    "lead status",
    "commercial status",
    "commercial export",
    "commercial enrichment-plan",
    "commercial duplicate-audit",
    "export all",
    "export paperclip-cards",
    "export operator-status",
    "whatsapp outbox status",
    "profile-evidence export",
  ]);
  if (command[0] === "init") return false;
  return !readOnly.has(joined);
}

function isDatabaseReadOnlyCommand(command) {
  const joined = command.join(" ");
  return new Set([
    "lead status",
    "commercial status",
    "commercial enrichment-plan",
    "commercial duplicate-audit",
    "whatsapp outbox status",
    "profile-evidence export",
  ]).has(joined);
}

function ensureUsableDatabaseFile(root, path) {
  const initial = inspectSqliteFile(path);
  if (initial.ok) return { materialized: false };

  if (initial.datalessCandidate) {
    materializeDatalessCandidate(path);
    const afterMaterialize = inspectSqliteFile(path);
    if (afterMaterialize.ok) return { materialized: true };
  }

  const snapshot = snapshotInvalidDatabase(root, path, initial.reason);
  throw usageError(`SQLite invalido: ${initial.reason}. Snapshot forense: ${snapshot}`);
}

function inspectSqliteFile(path) {
  let stat;
  try {
    stat = statSync(path);
  } catch (error) {
    return {
      ok: false,
      reason: `stat falhou para ${path}: ${error.message}`,
      datalessCandidate: false,
    };
  }

  if (stat.size === 0) {
    return {
      ok: false,
      reason: `arquivo vazio: ${path}`,
      datalessCandidate: false,
    };
  }

  const header = Buffer.alloc(SQLITE_HEADER.length);
  let fd = null;
  try {
    fd = openSync(path, "r");
    const bytesRead = readSync(fd, header, 0, SQLITE_HEADER.length, 0);
    if (bytesRead !== SQLITE_HEADER.length) {
      return {
        ok: false,
        reason: `header SQLite incompleto em ${path}: ${bytesRead} bytes`,
        datalessCandidate: isDatalessCandidate(stat),
      };
    }
  } catch (error) {
    return {
      ok: false,
      reason: `falha lendo header SQLite em ${path}: ${error.message}`,
      datalessCandidate: isDatalessCandidate(stat),
    };
  } finally {
    if (fd !== null) closeSync(fd);
  }

  if (!header.equals(SQLITE_HEADER)) {
    return {
      ok: false,
      reason: `header SQLite ausente em ${path}`,
      datalessCandidate: isDatalessCandidate(stat),
    };
  }

  return { ok: true, stat, datalessCandidate: false };
}

function isDatalessCandidate(stat) {
  return stat.size > 0 && Number(stat.blocks) === 0;
}

function materializeDatalessCandidate(path) {
  const tempPath = join(dirname(path), `.${basename(path)}.hydrate-${process.pid}-${timestampForFile()}.tmp`);
  try {
    copyFileSync(path, tempPath);
  } finally {
    rmSync(tempPath, { force: true });
  }
}

function createRotatingDatabaseBackup(root, path) {
  const backupDir = databaseBackupDir(root, path);
  try {
    return createDatabaseBackupInDir(path, backupDir);
  } catch (error) {
    removePartialBackup(error.backupPath);
    if (isSqliteBusy(error)) throw error;
    if (!canRetryBackupInPrivateOpsDir(error)) {
      const snapshot = snapshotInvalidDatabase(root, path, `backup falhou: ${error.message}`);
      throw usageError(`Backup SQLite falhou antes de operar: ${error.message}. Snapshot forense: ${snapshot}`);
    }
  }

  const fallbackBackupDir = join(root, ".scratch/ops/sqlite-backups");
  try {
    return createDatabaseBackupInDir(path, fallbackBackupDir);
  } catch (fallbackError) {
    removePartialBackup(fallbackError.backupPath);
    if (isSqliteBusy(fallbackError)) throw fallbackError;
    const snapshot = snapshotInvalidDatabase(root, path, `backup falhou: ${fallbackError.message}`);
    throw usageError(
      `Backup SQLite falhou antes de operar: ${fallbackError.message}. Snapshot forense: ${snapshot}`,
    );
  }
}

function databaseBackupDir(root, path) {
  if (isPathInsideRoot(root, path)) return join(dirname(path), "backups");
  return join(root, ".scratch/db-backups");
}

function isPathInsideRoot(root, path) {
  const rootPath = realExistingPath(root);
  const targetPath = realExistingPath(path);
  const distance = relative(rootPath, targetPath);
  return distance === "" || (!distance.startsWith("..") && !isAbsolute(distance));
}

function realExistingPath(path) {
  try {
    return realpathSync(path);
  } catch {
    const parent = dirname(path);
    try {
      return join(realpathSync(parent), basename(path));
    } catch {
      return resolve(path);
    }
  }
}

function sqliteFileUri(path, mode) {
  const url = pathToFileURL(path);
  url.searchParams.set("mode", mode);
  return url.href;
}

function createDatabaseBackupInDir(path, backupDir) {
  mkdirSync(backupDir, { recursive: true });
  const base = sanitizeBackupName(basename(path, extname(path)) || "sqlite");
  const backupPath = join(backupDir, `${base}-${timestampForFile()}.sqlite`);
  let database = null;

  try {
    database = new DatabaseSync(path, { readOnly: true });
    database.exec("PRAGMA busy_timeout = 10000;");
    database.exec(`VACUUM INTO ${sqlStringLiteral(backupPath)};`);
  } catch (error) {
    error.backupPath = backupPath;
    throw error;
  } finally {
    if (database) database.close();
  }

  pruneDatabaseBackups(backupDir, base, backupRetentionLimit());
  return backupPath;
}

function removePartialBackup(path) {
  if (path) rmSync(path, { force: true });
}

function canRetryBackupInPrivateOpsDir(error) {
  return /unable to open database|operation not permitted|permission denied|readonly|not authorized/i.test(
    String(error?.message ?? error),
  );
}

function backupRetentionLimit() {
  const configured = process.env.FREELA_CRM_BACKUP_LIMIT;
  if (!configured) return DEFAULT_DB_BACKUP_LIMIT;
  const parsed = Number.parseInt(configured, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_DB_BACKUP_LIMIT;
  return parsed;
}

function pruneDatabaseBackups(backupDir, base, limit) {
  const backups = readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(`${base}-`) && entry.name.endsWith(".sqlite"))
    .map((entry) => {
      const path = join(backupDir, entry.name);
      return { path, name: entry.name, mtimeMs: statSync(path).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name));

  for (const backup of backups.slice(limit)) {
    rmSync(backup.path, { force: true });
  }
}

function snapshotInvalidDatabase(root, path, reason) {
  const snapshotDir = join(root, ".scratch/forensics", `sqlite-invalid-${timestampForFile()}`);
  const dbDir = join(snapshotDir, "db");
  mkdirSync(dbDir, { recursive: true });
  const metadata = [
    `created_at=${new Date().toISOString()}`,
    `path=${path}`,
    `reason=${reason}`,
  ];

  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
    if (!existsSync(candidate)) continue;
    try {
      const stat = statSync(candidate);
      metadata.push(
        `file=${candidate} size=${stat.size} blocks=${stat.blocks ?? "unknown"} mtime=${stat.mtime.toISOString()}`,
      );
      copyFileSync(candidate, join(dbDir, basename(candidate)));
    } catch (error) {
      metadata.push(`copy_error=${candidate}: ${error.message}`);
    }
  }

  writeFileSync(join(snapshotDir, "metadata.txt"), `${metadata.join("\n")}\n`, "utf8");
  return snapshotDir;
}

function sanitizeBackupName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function timestampForFile() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  return `${stamp}-${process.hrtime.bigint().toString(36)}`;
}

function sqlStringLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function migrateDatabase(database) {
  ensureColumn(database, "outreach_queue", "action_type", "text not null default 'first_touch'");
  ensureColumn(database, "outreach_queue", "card_status", "text not null default 'pending_message'");
  ensureColumn(database, "outreach_queue", "qa_status", "text");
  ensureColumn(database, "outreach_queue", "card_status_updated_at", "text");
  ensureColumn(database, "worker_handoffs", "dedupe_key", "text");
  ensureColumn(database, "worker_handoffs", "workflow_batch_id", "text");
  ensureColumn(database, "lead_platform_profiles", "browser_evidence_status", "text");
  ensureColumn(database, "lead_platform_profiles", "browser_evidence_method", "text");
  ensureColumn(database, "lead_platform_profiles", "instagram_session_status", "text");
  ensureColumn(database, "whatsapp_outbox", "humanizer_pass", "integer not null default 0");
  ensureColumn(database, "whatsapp_outbox", "used_last_inbound", "integer not null default 0");
  ensureColumn(database, "whatsapp_outbox", "contextual_reply", "integer not null default 0");
  ensureColumn(database, "whatsapp_outbox", "humanizer_notes", "text");
  ensureColumn(database, "whatsapp_outbox", "dispatch_error", "text");
  ensureColumn(database, "whatsapp_outbox", "dispatch_locked_at", "text");
  ensureColumn(database, "whatsapp_outbox", "dispatch_provider", "text");
  ensureColumn(database, "whatsapp_outbox", "provider_message_id", "text");
  ensureColumn(database, "whatsapp_outbox", "delivery_ack", "integer");
  ensureColumn(database, "whatsapp_outbox", "delivery_ack_name", "text");
  ensureColumn(database, "whatsapp_outbox", "delivered_at", "text");
  ensureColumn(database, "whatsapp_outbox", "delivery_checked_at", "text");
  ensureColumn(database, "whatsapp_unmatched_inbound_events", "classification", "text");
  ensureColumn(database, "whatsapp_unmatched_inbound_events", "matched_lead_id", "integer references leads(id)");
  ensureColumn(database, "whatsapp_unmatched_inbound_events", "matched_inbound_event_id", "integer references whatsapp_inbound_events(id)");
  normalizeQueueCardMetadata(database);
  normalizeStoredLegacyOffers(database);
  database.exec(`
    create index if not exists idx_worker_handoffs_dedupe on worker_handoffs(dedupe_key);
    create index if not exists idx_worker_handoffs_batch on worker_handoffs(workflow_batch_id, target_agent_id);
    create unique index if not exists idx_worker_handoffs_active_dedupe
      on worker_handoffs(dedupe_key)
      where dedupe_key is not null
        and dedupe_key != ''
        and status not in ('completed', 'cancelled');
    create unique index if not exists idx_whatsapp_identity_alias_value
      on whatsapp_identity_aliases(identity_value);
    create index if not exists idx_whatsapp_identity_alias_lead
      on whatsapp_identity_aliases(lead_id);
    create index if not exists idx_whatsapp_unmatched_status
      on whatsapp_unmatched_inbound_events(status, received_at);
    create unique index if not exists idx_whatsapp_worker_wake_unique
      on whatsapp_worker_wakes(inbound_event_id, target_agent_id, wake_type);
  `);
  refreshCommercialViews(database);
}

function normalizeStoredLegacyOffers(database) {
  const rows = database
    .prepare(
      `select id, recommended_offer, notes
       from leads
       where recommended_offer is not null
         and trim(recommended_offer) != ''`,
    )
    .all();
  const update = database.prepare(
    `update leads
     set recommended_offer = ?, notes = ?, updated_at = ?
     where id = ?`,
  );
  const timestamp = now();

  for (const row of rows) {
    const normalizedOffer = normalizeRecommendedOffer(row.recommended_offer);
    if (normalizedOffer === row.recommended_offer) continue;
    update.run(
      normalizedOffer,
      mergeNotes(row.notes, "Oferta legada mapeada para Presença Local em 72h"),
      timestamp,
      row.id,
    );
  }
}

function ensureColumn(database, table, column, definition) {
  const columns = database.prepare(`pragma table_info(${table})`).all();
  if (columns.some((item) => item.name === column)) return;
  database.exec(`alter table ${table} add column ${column} ${definition}`);
}

function normalizeQueueCardMetadata(database) {
  database
    .prepare(
      `update outreach_queue
       set action_type = case
         when (select status from leads where leads.id = outreach_queue.lead_id) = 'tem_demo'
           then 'demo_followup'
         when (select status from leads where leads.id = outreach_queue.lead_id) = 'respondeu'
           then 'reply'
         when (select status from leads where leads.id = outreach_queue.lead_id) in ('abordado', 'interessado')
           then 'followup'
         else 'first_touch'
       end
       where status = 'pending'
         and (
           action_type is null
           or action_type = ''
           or action_type != case
             when (select status from leads where leads.id = outreach_queue.lead_id) = 'tem_demo'
               then 'demo_followup'
             when (select status from leads where leads.id = outreach_queue.lead_id) = 'respondeu'
               then 'reply'
             when (select status from leads where leads.id = outreach_queue.lead_id) in ('abordado', 'interessado')
               then 'followup'
             else 'first_touch'
           end
         )`,
    )
    .run();

  database
    .prepare(
      `update outreach_queue
       set card_status = case
         when message is null or trim(message) = '' or message like 'Preparar envio manual para %'
           then 'pending_message'
         when (select status from leads where leads.id = outreach_queue.lead_id) = 'novo'
           then 'pending_qa'
         else 'approved'
       end
       where card_status is null or card_status = '' or card_status = 'pending_message'`,
    )
    .run();
}

function refreshCommercialViews(database) {
  database.exec(`
    drop view if exists commercial_stale_leads;
    drop view if exists commercial_followups_today;
    drop view if exists commercial_ready_lead_cards;
    drop view if exists commercial_ready_for_writer;
    drop view if exists commercial_pending_validation;
    drop view if exists commercial_pending_qa;
    drop view if exists commercial_lead_context;

    create view commercial_lead_context as
    with base as (
      select
        l.id as lead_id,
        l.canonical_name,
        l.status,
        l.category,
        l.city,
        l.area,
        l.phone_or_contact,
        l.instagram,
        l.website_url,
        l.recommended_offer,
        l.run_id,
        l.contacted_at,
        l.response_status,
        l.analysis_status,
        l.handoff_status,
        l.updated_at,
        p.id as instagram_profile_id,
        p.bio_status,
        p.bio_text,
        p.bio_link_url,
        p.bio_link_type,
        p.bio_link_status,
        p.commercial_hook,
        p.evidence_confidence,
        p.browser_evidence_status,
        p.browser_evidence_method,
        p.instagram_session_status,
        p.contact_path,
        p.whatsapp_visible,
        p.observed_at as profile_observed_at,
        q.id as queue_id,
        q.queue_date,
        q.status as queue_status,
        q.action_type,
        q.card_status,
        q.qa_status,
        q.message,
        case
          when p.id is not null then 1
          else 0
        end as has_profile_evidence,
        case
          when p.bio_status = 'ok'
            and coalesce(trim(p.browser_evidence_status), '') = 'ok'
            and coalesce(trim(p.instagram_session_status), '') = 'logged_in'
            and (
              p.bio_link_url is null
              or trim(p.bio_link_url) = ''
              or p.bio_link_status = 'analisado'
            )
          then 1
          else 0
        end as has_analyzed_bio,
        case
          when p.commercial_hook is not null and trim(p.commercial_hook) != '' then 1
          else 0
        end as has_commercial_hook,
        case
          when q.message is not null
            and trim(q.message) != ''
            and q.message not like 'Preparar envio manual para %'
          then 1
          else 0
        end as has_ready_message,
        case
          when coalesce(trim(l.instagram), '') != ''
            and p.id is not null
            and p.bio_status = 'ok'
            and coalesce(trim(p.browser_evidence_status), '') = 'ok'
            and coalesce(trim(p.instagram_session_status), '') = 'logged_in'
            and (
              p.bio_link_url is null
              or trim(p.bio_link_url) = ''
              or p.bio_link_status = 'analisado'
            )
            and coalesce(trim(p.commercial_hook), '') != ''
          then 'instagram_bio_ok'
          when coalesce(trim(l.instagram), '') != '' and p.id is null then 'instagram_bio_missing'
          when coalesce(trim(l.instagram), '') != ''
            and coalesce(trim(p.browser_evidence_status), '') != 'ok'
          then 'instagram_browser_evidence_blocked'
          when coalesce(trim(l.instagram), '') != ''
            and coalesce(trim(p.instagram_session_status), '') != 'logged_in'
          then 'instagram_session_not_ready'
          when coalesce(trim(l.instagram), '') != '' and p.bio_status != 'ok' then 'instagram_bio_blocked'
          when coalesce(trim(l.instagram), '') != ''
            and coalesce(trim(p.bio_link_url), '') != ''
            and p.bio_link_status != 'analisado'
          then 'instagram_bio_link_pending'
          when coalesce(trim(l.instagram), '') != '' and coalesce(trim(p.commercial_hook), '') = ''
          then 'instagram_commercial_hook_missing'
          when coalesce(trim(l.instagram), '') = '' and l.handoff_status = 'writer_pending'
          then 'no_instagram_observation_required'
          when coalesce(trim(l.instagram), '') = '' then 'no_instagram_pending_observation'
          else 'profile_review'
        end as bio_gate_status,
        (
          select max(i.occurred_at)
          from interactions i
          where i.lead_id = l.id
        ) as last_interaction_at,
        (
          select i.classification
          from interactions i
          where i.lead_id = l.id
          order by i.occurred_at desc, i.id desc
          limit 1
        ) as last_interaction_classification,
        case
          when l.status in ('fechado', 'perdido', 'descartado', 'duplicado') then null
          when p.id is null and coalesce(trim(l.instagram), '') != '' then 'bio_evidence_missing'
          when p.id is not null
            and coalesce(trim(l.instagram), '') != ''
            and coalesce(trim(p.browser_evidence_status), '') != 'ok'
          then 'browser_evidence_not_ok'
          when p.id is not null
            and coalesce(trim(l.instagram), '') != ''
            and coalesce(trim(p.instagram_session_status), '') != 'logged_in'
          then 'instagram_session_not_ready'
          when p.id is not null and p.bio_status != 'ok' then 'bio_status_not_ok'
          when p.id is not null
            and coalesce(trim(p.bio_link_url), '') != ''
            and p.bio_link_status != 'analisado'
          then 'bio_link_pending'
          when p.id is not null and coalesce(trim(p.commercial_hook), '') = '' then 'commercial_hook_missing'
          when coalesce(
            nullif(trim(l.phone_or_contact), ''),
            nullif(trim(p.contact_path), ''),
            nullif(trim(l.instagram), ''),
            nullif(trim(l.website_url), ''),
            ''
          ) = ''
          then 'contact_missing'
          else null
        end as validation_blocker
      from leads l
      left join lead_platform_profiles p
        on p.lead_id = l.id
       and p.platform = 'instagram'
      left join outreach_queue q
        on q.id = (
          select q2.id
          from outreach_queue q2
          where q2.lead_id = l.id
            and q2.status = 'pending'
          order by q2.queue_date desc, q2.id desc
          limit 1
        )
    )
    select
      base.*,
      case
        when base.status in ('fechado', 'perdido', 'descartado', 'duplicado') then 'closed'
        when base.queue_status = 'pending'
          and base.card_status = 'approved'
          and base.has_ready_message = 1
        then 'ready_lead_card'
        when base.queue_status = 'pending'
          and base.card_status = 'pending_qa'
          and base.has_ready_message = 1
        then 'pending_message_qa'
        when base.status in ('abordado', 'respondeu', 'interessado', 'tem_demo') then 'followup'
        when base.status in ('novo', 'reanalisar') and base.validation_blocker is not null then 'pending_validation'
        when base.status = 'novo'
          and base.handoff_status = 'writer_pending'
          and (
            base.queue_id is null
            or base.has_ready_message = 0
            or base.card_status = 'pending_message'
          )
        then 'ready_for_writer'
        else 'review'
      end as commercial_stage
    from base;

    create view commercial_pending_validation as
    select *
    from commercial_lead_context
    where commercial_stage = 'pending_validation';

    create view commercial_ready_for_writer as
    select *
    from commercial_lead_context
    where commercial_stage = 'ready_for_writer';

    create view commercial_pending_qa as
    select *
    from commercial_lead_context
    where commercial_stage = 'pending_message_qa';

    create view commercial_ready_lead_cards as
    select *
    from commercial_lead_context
    where commercial_stage = 'ready_lead_card';

    create view commercial_followups_today as
    select *
    from commercial_lead_context
    where commercial_stage = 'followup';

    create view commercial_stale_leads as
    select *
    from commercial_lead_context
    where commercial_stage not in ('closed', 'ready_lead_card')
      and datetime(updated_at) < datetime('now', '-7 days');
  `);
}

function schemaSql() {
  return `
    create table if not exists leads (
      id integer primary key autoincrement,
      canonical_name text not null,
      slug text not null,
      business text,
      category text,
      city text,
      area text,
      phone_or_contact text,
      phone_normalized text,
      instagram text,
      instagram_normalized text,
      website_url text,
      website_normalized text,
      website_status text,
      source_urls text,
      first_seen text not null,
      last_seen text not null,
      run_id text,
      status text not null,
      contacted_at text,
      response_status text,
      recommended_offer text,
      demo_path text,
      analysis_status text,
      handoff_status text,
      notes text,
      merge_key text,
      created_at text not null,
      updated_at text not null
    );

    create index if not exists idx_leads_phone on leads(phone_normalized);
    create index if not exists idx_leads_instagram on leads(instagram_normalized);
    create index if not exists idx_leads_website on leads(website_normalized);
    create index if not exists idx_leads_slug_city on leads(slug, city);
    create index if not exists idx_leads_status on leads(status);

    create table if not exists lead_sources (
      id integer primary key autoincrement,
      lead_id integer not null references leads(id) on delete cascade,
      source_url text not null,
      source_type text,
      observed_at text not null,
      unique(lead_id, source_url)
    );

    create table if not exists lead_analysis (
      id integer primary key autoincrement,
      lead_id integer not null references leads(id) on delete cascade,
      analysis_date text not null,
      point_1 text,
      point_2 text,
      point_3 text,
      evidence_json text,
      created_at text not null
    );

    create table if not exists lead_platform_profiles (
      id integer primary key autoincrement,
      lead_id integer not null references leads(id) on delete cascade,
      platform text not null,
      profile_url text,
      handle text,
      bio_status text not null,
      bio_text text,
      bio_link_url text,
      bio_link_type text,
      bio_link_status text,
      link_page_summary text,
      services_seen text,
      location_seen text,
      owner_operator_signal text,
      contact_path text,
      whatsapp_visible text,
      positioning_signal text,
      friction_points text,
      commercial_hook text,
      evidence_confidence text,
      browser_evidence_status text,
      browser_evidence_method text,
      instagram_session_status text,
      observed_at text not null,
      run_id text,
      notes text,
      created_at text not null,
      updated_at text not null,
      unique(lead_id, platform)
    );

    create index if not exists idx_lead_platform_profiles_lead on lead_platform_profiles(lead_id);
    create index if not exists idx_lead_platform_profiles_platform on lead_platform_profiles(platform);
    create index if not exists idx_lead_platform_profiles_observed on lead_platform_profiles(observed_at);

    create table if not exists lead_platform_links (
      id integer primary key autoincrement,
      platform_profile_id integer not null references lead_platform_profiles(id) on delete cascade,
      url text not null,
      label text,
      link_type text,
      is_contact_path integer not null default 0,
      summary text,
      position integer,
      observed_status text,
      created_at text not null,
      unique(platform_profile_id, url)
    );

    create index if not exists idx_lead_platform_links_profile on lead_platform_links(platform_profile_id);

    create table if not exists interactions (
      id integer primary key autoincrement,
      lead_id integer not null references leads(id) on delete cascade,
      direction text not null,
      channel text not null,
      body text not null,
      occurred_at text not null,
      raw_file text,
      classification text,
      created_at text not null
    );

    create table if not exists message_reviews (
      id integer primary key autoincrement,
      lead_id integer references leads(id) on delete set null,
      queue_id integer references outreach_queue(id) on delete set null,
      queue_date text not null,
      lead_name text not null,
      qa_status text not null,
      problem text,
      excerpt text,
      recommended_adjustment text,
      decision text,
      source text,
      source_file text,
      reviewed_at text not null,
      created_at text not null
    );

    create table if not exists outreach_queue (
      id integer primary key autoincrement,
      lead_id integer not null references leads(id) on delete cascade,
      queue_date text not null,
      status text not null,
      message text,
      action_type text not null default 'first_touch',
      card_status text not null default 'pending_message',
      qa_status text,
      card_status_updated_at text,
      created_at text not null,
      unique(lead_id, queue_date)
    );

    create table if not exists worker_handoffs (
      id integer primary key autoincrement,
      handoff_key text not null unique,
      dedupe_key text,
      handoff_version integer not null,
      source_agent_id text not null,
      source_agent_name text,
      source_issue_id text not null,
      source_issue_identifier text not null,
      target_agent_id text not null,
      target_agent_name text not null,
      title text not null,
      required_action text not null,
      workflow_batch_id text,
      workflow_run_id text not null,
      workflow_round_date text not null,
      workflow_stage text not null,
      workflow_expected_count integer not null,
      workflow_actual_count integer,
      workflow_gate_status text,
      workflow_next_owner text not null,
      status text not null default 'pending_issue',
      paperclip_issue_id text,
      paperclip_issue_identifier text,
      artifacts_json text not null,
      acceptance_criteria_json text not null,
      source_file text,
      created_at text not null,
      updated_at text not null
    );

    create index if not exists idx_worker_handoffs_target on worker_handoffs(target_agent_id);
    create index if not exists idx_worker_handoffs_status on worker_handoffs(status);
    create index if not exists idx_worker_handoffs_workflow on worker_handoffs(workflow_run_id, workflow_stage);

    create table if not exists whatsapp_inbound_events (
      id integer primary key autoincrement,
      bridge_message_id text unique,
      chat_id text not null,
      sender_name text,
      sender_phone text,
      is_group integer not null default 0,
      message_type text not null default 'text',
      body text not null,
      received_at text not null,
      lead_id integer references leads(id),
      processing_status text not null default 'new',
      classification text,
      raw_json text,
      created_at text not null
    );

    create table if not exists whatsapp_identity_aliases (
      id integer primary key autoincrement,
      lead_id integer not null references leads(id),
      identity_value text not null unique,
      source text not null,
      notes text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists whatsapp_unmatched_inbound_events (
      id integer primary key autoincrement,
      bridge_message_id text unique,
      chat_id text not null,
      sender_name text,
      sender_phone text,
      is_group integer not null default 0,
      message_type text not null default 'text',
      body text not null,
      received_at text not null,
      classification text,
      status text not null default 'unmatched',
      match_reason text,
      matched_lead_id integer references leads(id),
      matched_inbound_event_id integer references whatsapp_inbound_events(id),
      raw_json text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists whatsapp_outbox (
      id integer primary key autoincrement,
      lead_id integer not null references leads(id),
      inbound_event_id integer references whatsapp_inbound_events(id),
      target_chat_id text not null,
      body text not null,
      source text not null,
      status text not null default 'pending_guardian',
      humanizer_pass integer not null default 0,
      used_last_inbound integer not null default 0,
      contextual_reply integer not null default 0,
      humanizer_notes text,
      dispatch_error text,
      dispatch_locked_at text,
      dispatch_provider text,
      provider_message_id text,
      delivery_ack integer,
      delivery_ack_name text,
      delivered_at text,
      delivery_checked_at text,
      guardian_decision text,
      guardian_reason text,
      attempts integer not null default 0,
      bridge_message_id text,
      created_at text not null,
      approved_at text,
      sent_at text,
      failed_at text
    );

    create table if not exists lead_conversation_state (
      lead_id integer primary key references leads(id),
      whatsapp_state text not null default 'none',
      auto_replies_since_human integer not null default 0,
      last_inbound_event_id integer references whatsapp_inbound_events(id),
      last_outbox_id integer references whatsapp_outbox(id),
      handoff_reason text,
      updated_at text not null
    );

    create table if not exists whatsapp_guardian_decisions (
      id integer primary key autoincrement,
      outbox_id integer not null references whatsapp_outbox(id),
      decision text not null,
      reason text not null,
      triggered_rules text not null,
      created_at text not null
    );

    create table if not exists whatsapp_worker_wakes (
      id integer primary key autoincrement,
      inbound_event_id integer not null references whatsapp_inbound_events(id),
      lead_id integer not null references leads(id),
      target_agent_id text not null,
      wake_type text not null,
      status text not null default 'created',
      paperclip_issue_id text,
      paperclip_issue_identifier text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists demos (
      id integer primary key autoincrement,
      lead_id integer references leads(id) on delete set null,
      demo_path text not null unique,
      demo_type text,
      status text,
      created_at text not null
    );

    create table if not exists audit_log (
      id integer primary key autoincrement,
      entity_type text not null,
      entity_id integer,
      action text not null,
      details_json text,
      created_at text not null
    );
  `;
}

function readRecords(file) {
  const raw = readFileSync(file, "utf8");
  const extension = extname(file).toLowerCase();
  if (extension === ".json") {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.leads)) return parsed.leads;
    return [parsed];
  }
  if (extension === ".csv") return parseCsv(raw);
  throw usageError(`Formato nao suportado para upsert: ${extension}`);
}

function readJsonFile(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function parseCsv(raw) {
  const lines = raw.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function readConversation(file) {
  const raw = readFileSync(file, "utf8");
  if (extname(file).toLowerCase() === ".json") {
    const parsed = JSON.parse(raw);
    return {
      lead_name: clean(parsed.lead_name ?? parsed.name),
      message: clean(parsed.message ?? parsed.body ?? parsed.text),
      received_at: clean(parsed.received_at ?? parsed.occurred_at),
    };
  }
  return { lead_name: null, message: raw.trim(), received_at: null };
}

function upsertLeads(database, records) {
  let inserted = 0;
  let merged = 0;

  database.exec("BEGIN");
  try {
    for (const record of records) {
      const normalized = normalizeLeadRecord(record);
      const existing = findExistingLead(database, normalized);
      if (existing) {
        updateLead(database, existing, normalized);
        merged += 1;
      } else {
        insertLead(database, normalized);
        inserted += 1;
      }
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return { inserted, merged };
}

function normalizeLeadRecord(record) {
  const canonicalName = clean(
    record.canonical_name ?? record.name ?? record.business ?? record.nome ?? record.negocio,
  );
  if (!canonicalName) throw usageError("Lead sem canonical_name/name/business");

  const status = clean(record.status) || "novo";
  if (!VALID_STATUSES.has(status)) throw usageError(`Status invalido: ${status}`);

  const city = clean(record.city ?? record.cidade);
  const phone = clean(record.phone_or_contact ?? record.phone ?? record.whatsapp ?? record.contato);
  const instagram = clean(record.instagram);
  const website = clean(record.website_url ?? record.website ?? record.site);
  const sourceUrls = sourceUrlsFrom(record.source_urls ?? record.source_url ?? record.fonte);
  const nowIso = now();
  const firstSeen = clean(record.first_seen) || today();
  const rawRecommendedOffer = clean(record.recommended_offer ?? record.oferta_recomendada);
  const recommendedOffer = normalizeRecommendedOffer(rawRecommendedOffer);
  const baseNotes = clean(record.notes ?? record.observacoes);
  const notes = isLegacyEssentialOffer(rawRecommendedOffer)
    ? mergeNotes(baseNotes, "Oferta legada mapeada para Presença Local em 72h")
    : baseNotes;

  return {
    canonical_name: canonicalName,
    slug: slugify(canonicalName),
    business: clean(record.business ?? record.negocio),
    category: clean(record.category ?? record.nicho ?? record.categoria),
    city,
    area: clean(record.area ?? record.bairro),
    phone_or_contact: phone,
    phone_normalized: normalizePhone(phone),
    instagram,
    instagram_normalized: normalizeInstagram(instagram),
    website_url: website,
    website_normalized: normalizeWebsite(website),
    website_status: clean(record.website_status ?? record.site_status),
    source_urls: sourceUrls.join(" | "),
    source_url_list: sourceUrls,
    first_seen: firstSeen,
    last_seen: clean(record.last_seen) || today(),
    run_id: clean(record.run_id),
    status,
    contacted_at: clean(record.contacted_at),
    response_status: clean(record.response_status),
    recommended_offer: recommendedOffer,
    demo_path: clean(record.demo_path),
    analysis_status: clean(record.analysis_status),
    handoff_status: clean(record.handoff_status),
    notes,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

function findExistingLead(database, lead) {
  const ids = new Set();
  addMatchingIds(database, ids, "phone_normalized", lead.phone_normalized);
  addMatchingIds(database, ids, "instagram_normalized", lead.instagram_normalized);
  addMatchingIds(database, ids, "website_normalized", lead.website_normalized);

  if (lead.slug && lead.city) {
    const matches = database
      .prepare("select id from leads where slug = ? and lower(city) = lower(?)")
      .all(lead.slug, lead.city);
    for (const match of matches) ids.add(match.id);
  }

  if (ids.size > 1) {
    throw ambiguityError(`Dedupe ambiguo para ${lead.canonical_name}; IDs: ${[...ids].join(", ")}`);
  }

  const id = [...ids][0];
  if (!id) return null;
  return database.prepare("select * from leads where id = ?").get(id);
}

function addMatchingIds(database, ids, column, value) {
  if (!value) return;
  const matches = database.prepare(`select id from leads where ${column} = ?`).all(value);
  for (const match of matches) ids.add(match.id);
}

function insertLead(database, lead) {
  const mergeKey = buildMergeKey(lead);
  const result = database
    .prepare(
      `insert into leads (
        canonical_name, slug, business, category, city, area, phone_or_contact,
        phone_normalized, instagram, instagram_normalized, website_url,
        website_normalized, website_status, source_urls, first_seen, last_seen,
        run_id, status, contacted_at, response_status, recommended_offer,
        demo_path, analysis_status, handoff_status, notes, merge_key,
        created_at, updated_at
      ) values (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )`,
    )
    .run(
      lead.canonical_name,
      lead.slug,
      lead.business,
      lead.category,
      lead.city,
      lead.area,
      lead.phone_or_contact,
      lead.phone_normalized,
      lead.instagram,
      lead.instagram_normalized,
      lead.website_url,
      lead.website_normalized,
      lead.website_status,
      lead.source_urls,
      lead.first_seen,
      lead.last_seen,
      lead.run_id,
      lead.status,
      lead.contacted_at,
      lead.response_status,
      lead.recommended_offer,
      lead.demo_path,
      lead.analysis_status,
      lead.handoff_status,
      lead.notes,
      mergeKey,
      lead.created_at,
      lead.updated_at,
    );

  const leadId = Number(result.lastInsertRowid);
  addSources(database, leadId, lead.source_url_list, lead.last_seen);
  audit(database, "lead", leadId, "insert", { canonical_name: lead.canonical_name, mergeKey });
}

function updateLead(database, existing, incoming) {
  const recommendedOffer = normalizeRecommendedOffer(
    preferFilled(existing.recommended_offer, incoming.recommended_offer),
  );
  const legacyOfferNote =
    isLegacyEssentialOffer(existing.recommended_offer) || isLegacyEssentialOffer(incoming.recommended_offer)
      ? "Oferta legada mapeada para Presença Local em 72h"
      : "";
  const merged = {
    canonical_name: existing.canonical_name || incoming.canonical_name,
    slug: existing.slug || incoming.slug,
    business: preferFilled(existing.business, incoming.business),
    category: preferFilled(existing.category, incoming.category),
    city: preferFilled(existing.city, incoming.city),
    area: preferFilled(existing.area, incoming.area),
    phone_or_contact: preferFilled(existing.phone_or_contact, incoming.phone_or_contact),
    phone_normalized: preferFilled(existing.phone_normalized, incoming.phone_normalized),
    instagram: preferFilled(existing.instagram, incoming.instagram),
    instagram_normalized: preferFilled(existing.instagram_normalized, incoming.instagram_normalized),
    website_url: preferFilled(existing.website_url, incoming.website_url),
    website_normalized: preferFilled(existing.website_normalized, incoming.website_normalized),
    website_status: preferFilled(existing.website_status, incoming.website_status),
    source_urls: mergeListText(existing.source_urls, incoming.source_urls),
    first_seen: existing.first_seen || incoming.first_seen,
    last_seen: incoming.last_seen || today(),
    run_id: preferFilled(incoming.run_id, existing.run_id),
    status: mergeStatus(existing.status, incoming.status),
    contacted_at: preferFilled(existing.contacted_at, incoming.contacted_at),
    response_status: preferFilled(existing.response_status, incoming.response_status),
    recommended_offer: recommendedOffer,
    demo_path: preferFilled(existing.demo_path, incoming.demo_path),
    analysis_status: preferFilled(existing.analysis_status, incoming.analysis_status),
    handoff_status: preferFilled(existing.handoff_status, incoming.handoff_status),
    notes: mergeNotes(mergeNotes(existing.notes, incoming.notes), legacyOfferNote),
    merge_key: existing.merge_key || buildMergeKey(incoming),
    updated_at: now(),
  };

  database
    .prepare(
      `update leads set
        canonical_name = ?, slug = ?, business = ?, category = ?, city = ?, area = ?,
        phone_or_contact = ?, phone_normalized = ?, instagram = ?,
        instagram_normalized = ?, website_url = ?, website_normalized = ?,
        website_status = ?, source_urls = ?, first_seen = ?, last_seen = ?,
        run_id = ?, status = ?, contacted_at = ?, response_status = ?,
        recommended_offer = ?, demo_path = ?, analysis_status = ?,
        handoff_status = ?, notes = ?, merge_key = ?, updated_at = ?
      where id = ?`,
    )
    .run(
      merged.canonical_name,
      merged.slug,
      merged.business,
      merged.category,
      merged.city,
      merged.area,
      merged.phone_or_contact,
      merged.phone_normalized,
      merged.instagram,
      merged.instagram_normalized,
      merged.website_url,
      merged.website_normalized,
      merged.website_status,
      merged.source_urls,
      merged.first_seen,
      merged.last_seen,
      merged.run_id,
      merged.status,
      merged.contacted_at,
      merged.response_status,
      merged.recommended_offer,
      merged.demo_path,
      merged.analysis_status,
      merged.handoff_status,
      merged.notes,
      merged.merge_key,
      merged.updated_at,
      existing.id,
    );

  addSources(database, existing.id, incoming.source_url_list, incoming.last_seen);
  audit(database, "lead", existing.id, "merge", {
    canonical_name: existing.canonical_name,
    incoming: incoming.canonical_name,
  });
}

function addSources(database, leadId, urls, observedAt) {
  for (const url of urls) {
    database
      .prepare(
        `insert or ignore into lead_sources (lead_id, source_url, source_type, observed_at)
         values (?, ?, ?, ?)`,
      )
      .run(leadId, url, inferSourceType(url), observedAt);
  }
}

function upsertProfileEvidence(database, records) {
  let upserted = 0;

  database.exec("BEGIN");
  try {
    for (const record of records) {
      const evidence = normalizeProfileEvidenceRecord(record);
      const lead = requireUniqueLead(database, evidence.leadName);
      const profileId = upsertLeadPlatformProfile(database, lead, evidence);
      replaceLeadPlatformLinks(database, profileId, evidence.links);
      promoteWhatsappContactFromProfileEvidence(database, lead, evidence);
      audit(database, "lead_platform_profile", profileId, "upsert", {
        lead: lead.canonical_name,
        platform: evidence.platform,
        bioStatus: evidence.bio_status,
        linkCount: evidence.links.length,
      });
      upserted += 1;
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return { upserted };
}

function normalizeProfileEvidenceRecord(record) {
  const leadName = clean(record.lead_name ?? record.canonical_name ?? record.name ?? record.business);
  if (!leadName) throw usageError("Evidencia de perfil sem lead_name");

  const platform = normalizeProfileChoice(record.platform);
  if (!platform) throw usageError(`Evidencia de perfil sem platform para ${leadName}`);

  const bioStatus = normalizeProfileChoice(record.bio_status ?? record.bioStatus);
  if (!PROFILE_BIO_STATUSES.has(bioStatus)) {
    throw usageError(`bio_status invalido para ${leadName}: ${record.bio_status ?? record.bioStatus}`);
  }

  const bioLinkUrl = clean(record.bio_link_url ?? record.bioLinkUrl);
  const bioLinkType = normalizeProfileChoice(record.bio_link_type ?? record.bioLinkType) || (bioLinkUrl ? "outro" : "nenhum");
  if (!PROFILE_BIO_LINK_TYPES.has(bioLinkType)) {
    throw usageError(`bio_link_type invalido para ${leadName}: ${record.bio_link_type ?? record.bioLinkType}`);
  }

  const bioLinkStatus =
    normalizeProfileChoice(record.bio_link_status ?? record.bioLinkStatus) ||
    (bioLinkUrl ? "pendente" : "nao_aplicavel");
  if (!PROFILE_BIO_LINK_STATUSES.has(bioLinkStatus)) {
    throw usageError(`bio_link_status invalido para ${leadName}: ${record.bio_link_status ?? record.bioLinkStatus}`);
  }

  const confidence = normalizeProfileChoice(record.evidence_confidence ?? record.evidenceConfidence) || "baixa";
  if (!PROFILE_EVIDENCE_CONFIDENCES.has(confidence)) {
    throw usageError(
      `evidence_confidence invalido para ${leadName}: ${record.evidence_confidence ?? record.evidenceConfidence}`,
    );
  }

  const browserEvidenceStatus = normalizeProfileChoice(
    record.browser_evidence_status ?? record.browserEvidenceStatus,
  );
  if (browserEvidenceStatus && !PROFILE_BROWSER_EVIDENCE_STATUSES.has(browserEvidenceStatus)) {
    throw usageError(
      `browser_evidence_status invalido para ${leadName}: ${record.browser_evidence_status ?? record.browserEvidenceStatus}`,
    );
  }

  const browserEvidenceMethod = normalizeProfileChoice(
    record.browser_evidence_method ?? record.browserEvidenceMethod,
  );
  if (browserEvidenceMethod && !PROFILE_BROWSER_EVIDENCE_METHODS.has(browserEvidenceMethod)) {
    throw usageError(
      `browser_evidence_method invalido para ${leadName}: ${record.browser_evidence_method ?? record.browserEvidenceMethod}`,
    );
  }

  const instagramSessionStatus = normalizeProfileChoice(
    record.instagram_session_status ?? record.instagramSessionStatus,
  );
  if (instagramSessionStatus && !PROFILE_INSTAGRAM_SESSION_STATUSES.has(instagramSessionStatus)) {
    throw usageError(
      `instagram_session_status invalido para ${leadName}: ${record.instagram_session_status ?? record.instagramSessionStatus}`,
    );
  }

  return {
    leadName,
    platform,
    profile_url: clean(record.profile_url ?? record.profileUrl),
    handle: clean(record.handle),
    bio_status: bioStatus,
    bio_text: clean(record.bio_text ?? record.bioText),
    bio_link_url: bioLinkUrl,
    bio_link_type: bioLinkType,
    bio_link_status: bioLinkStatus,
    link_page_summary: clean(record.link_page_summary ?? record.linkPageSummary),
    services_seen: listText(record.services_seen ?? record.servicesSeen),
    location_seen: clean(record.location_seen ?? record.locationSeen),
    owner_operator_signal: clean(record.owner_operator_signal ?? record.ownerOperatorSignal),
    contact_path: clean(record.contact_path ?? record.contactPath),
    whatsapp_visible: normalizeTriState(record.whatsapp_visible ?? record.whatsappVisible),
    positioning_signal: clean(record.positioning_signal ?? record.positioningSignal),
    friction_points: listText(record.friction_points ?? record.frictionPoints),
    commercial_hook: clean(record.commercial_hook ?? record.commercialHook),
    evidence_confidence: confidence,
    browser_evidence_status: browserEvidenceStatus,
    browser_evidence_method: browserEvidenceMethod,
    instagram_session_status: instagramSessionStatus,
    observed_at: clean(record.observed_at ?? record.observedAt) || now(),
    run_id: clean(record.run_id ?? record.runId),
    notes: clean(record.notes),
    links: normalizeProfileLinks(record.links ?? record.profile_links ?? record.profileLinks),
  };
}

function upsertLeadPlatformProfile(database, lead, evidence) {
  const existing = database
    .prepare("select id, created_at from lead_platform_profiles where lead_id = ? and platform = ?")
    .get(lead.id, evidence.platform);
  const timestamp = now();

  if (existing) {
    database
      .prepare(
        `update lead_platform_profiles set
          profile_url = ?, handle = ?, bio_status = ?, bio_text = ?, bio_link_url = ?,
          bio_link_type = ?, bio_link_status = ?, link_page_summary = ?, services_seen = ?,
          location_seen = ?, owner_operator_signal = ?, contact_path = ?, whatsapp_visible = ?,
          positioning_signal = ?, friction_points = ?, commercial_hook = ?, evidence_confidence = ?,
          browser_evidence_status = ?, browser_evidence_method = ?, instagram_session_status = ?,
          observed_at = ?, run_id = ?, notes = ?, updated_at = ?
        where id = ?`,
      )
      .run(
        evidence.profile_url,
        evidence.handle,
        evidence.bio_status,
        evidence.bio_text,
        evidence.bio_link_url,
        evidence.bio_link_type,
        evidence.bio_link_status,
        evidence.link_page_summary,
        evidence.services_seen,
        evidence.location_seen,
        evidence.owner_operator_signal,
        evidence.contact_path,
        evidence.whatsapp_visible,
        evidence.positioning_signal,
        evidence.friction_points,
        evidence.commercial_hook,
        evidence.evidence_confidence,
        evidence.browser_evidence_status,
        evidence.browser_evidence_method,
        evidence.instagram_session_status,
        evidence.observed_at,
        evidence.run_id,
        evidence.notes,
        timestamp,
        existing.id,
      );
    return existing.id;
  }

  const result = database
    .prepare(
      `insert into lead_platform_profiles (
        lead_id, platform, profile_url, handle, bio_status, bio_text, bio_link_url,
        bio_link_type, bio_link_status, link_page_summary, services_seen, location_seen,
        owner_operator_signal, contact_path, whatsapp_visible, positioning_signal,
        friction_points, commercial_hook, evidence_confidence, browser_evidence_status,
        browser_evidence_method, instagram_session_status, observed_at, run_id,
        notes, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      lead.id,
      evidence.platform,
      evidence.profile_url,
      evidence.handle,
      evidence.bio_status,
      evidence.bio_text,
      evidence.bio_link_url,
      evidence.bio_link_type,
      evidence.bio_link_status,
      evidence.link_page_summary,
      evidence.services_seen,
      evidence.location_seen,
      evidence.owner_operator_signal,
      evidence.contact_path,
      evidence.whatsapp_visible,
      evidence.positioning_signal,
      evidence.friction_points,
      evidence.commercial_hook,
      evidence.evidence_confidence,
      evidence.browser_evidence_status,
      evidence.browser_evidence_method,
      evidence.instagram_session_status,
      evidence.observed_at,
      evidence.run_id,
      evidence.notes,
      timestamp,
      timestamp,
    );
  return Number(result.lastInsertRowid);
}

function replaceLeadPlatformLinks(database, profileId, links) {
  database.prepare("delete from lead_platform_links where platform_profile_id = ?").run(profileId);
  const insert = database.prepare(
    `insert or ignore into lead_platform_links (
       platform_profile_id, url, label, link_type, is_contact_path, summary,
       position, observed_status, created_at
     ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  links.forEach((link, index) => {
    insert.run(
      profileId,
      link.url,
      link.label,
      link.link_type,
      link.is_contact_path,
      link.summary,
      link.position || index + 1,
      link.observed_status,
      now(),
    );
  });
}

function promoteWhatsappContactFromProfileEvidence(database, lead, evidence) {
  const whatsapp = whatsappContactFromProfileEvidence(evidence);
  if (!whatsapp) return;

  const existingContact = clean(lead.phone_or_contact);
  const existingNormalized = normalizePhone(existingContact);
  const nextContact = `WhatsApp confirmado via ${whatsapp.source}: ${formatBrazilWhatsapp(whatsapp.normalized)}`;
  const oldContactNote =
    existingContact && existingContact !== nextContact
      ? `Contato anterior preservado: ${existingContact}`
      : "";

  database
    .prepare(
      `update leads
       set phone_or_contact = ?,
           phone_normalized = ?,
           notes = ?,
           updated_at = ?
       where id = ?`,
    )
    .run(
      nextContact,
      whatsapp.normalized,
      mergeNotes(lead.notes, oldContactNote),
      now(),
      lead.id,
    );

  audit(database, "lead", lead.id, "whatsapp_contact_promoted", {
    source: whatsapp.source,
    previousPhoneNormalized: existingNormalized,
    nextPhoneNormalized: whatsapp.normalized,
  });
}

function whatsappContactFromProfileEvidence(evidence) {
  if (evidence.bio_status !== "ok") return null;
  if (evidence.bio_link_status !== "analisado") return null;
  if (evidence.browser_evidence_status && evidence.browser_evidence_status !== "ok") return null;
  if (evidence.instagram_session_status && evidence.instagram_session_status !== "logged_in") return null;

  const links = evidence.links.filter((link) => {
    if (!link.is_contact_path && evidence.bio_link_type !== "whatsapp") return false;
    if (link.observed_status && !["ok", "analisado"].includes(normalizeProfileChoice(link.observed_status))) {
      return false;
    }
    return link.link_type === "whatsapp" || /wa\.me|whatsapp\.com/i.test(link.url);
  });

  for (const link of links) {
    const normalized = extractWhatsappPhone(link.url);
    if (normalized) {
      return {
        normalized,
        source: whatsappEvidenceSource(evidence),
      };
    }
  }

  return null;
}

function whatsappEvidenceSource(evidence) {
  if (evidence.bio_link_type === "linktree" || /linktr\.ee|linktree/i.test(evidence.bio_link_url)) {
    return "Instagram/Linktree";
  }
  return "bio do Instagram";
}

function extractWhatsappPhone(url) {
  const rawUrl = clean(url);
  if (!rawUrl) return "";

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    let phone = "";

    if (host === "wa.me") {
      phone = parsed.pathname.replace(/^\/+/, "");
    } else if (host.endsWith("whatsapp.com")) {
      phone = parsed.searchParams.get("phone") || "";
    }

    const normalized = normalizePhone(phone);
    return normalized.length >= 10 ? normalized : "";
  } catch {
    const normalized = normalizePhone(rawUrl);
    return normalized.length >= 10 ? normalized : "";
  }
}

function formatBrazilWhatsapp(normalizedPhone) {
  const digits = normalizePhone(normalizedPhone);
  if (digits.length === 11) {
    return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `+55 ${digits}`;
}

function normalizeProfileLinks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((link, index) => {
      const url = clean(link.url ?? link.href);
      if (!url) return null;
      return {
        url,
        label: clean(link.label ?? link.text),
        link_type: normalizeProfileChoice(link.link_type ?? link.type) || inferSourceType(url),
        is_contact_path: truthy(link.is_contact_path ?? link.isContactPath) ? 1 : 0,
        summary: clean(link.summary),
        position: parseOptionalInteger(link.position) || index + 1,
        observed_status: clean(link.observed_status ?? link.status) || "ok",
      };
    })
    .filter(Boolean);
}

function normalizeProfileChoice(value) {
  return stripAccents(clean(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function listText(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).join(" | ");
  return clean(value);
}

function normalizeTriState(value) {
  if (value === true) return "sim";
  if (value === false) return "nao";
  const normalized = normalizeProfileChoice(value);
  if (["sim", "true", "1", "yes"].includes(normalized)) return "sim";
  if (["nao", "false", "0", "no"].includes(normalized)) return "nao";
  return normalized || "incerto";
}

function truthy(value) {
  if (value === true) return true;
  return ["sim", "true", "1", "yes"].includes(normalizeProfileChoice(value));
}

function parseOptionalInteger(value) {
  const cleanValue = clean(value);
  if (!cleanValue) return null;
  const parsed = Number.parseInt(cleanValue, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function recordWorkerHandoff(
  database,
  { handoff, sourceFile, status, paperclipIssueId, paperclipIssueIdentifier },
) {
  const hasStatusOverride = status !== undefined && status !== null && status !== "";
  const hasExplicitDedupeKey = Boolean(clean(handoff?.workflow?.dedupe_key ?? handoff?.dedupe_key));
  const normalized = normalizeWorkerHandoff(handoff, {
    sourceFile,
    status,
    paperclipIssueId,
    paperclipIssueIdentifier,
  });
  if (normalized.dedupe_key) {
    const existing = database
      .prepare(
        `select *
         from worker_handoffs
         where dedupe_key = ?
           and status not in ('completed', 'cancelled')
         order by id asc
         limit 1`,
      )
      .get(normalized.dedupe_key);
    if (existing) {
      normalized.handoff_key = existing.handoff_key;
      if (hasExplicitDedupeKey) {
        normalized.dedupe_key = existing.dedupe_key;
        normalized.handoff_version = existing.handoff_version;
        normalized.source_agent_id = existing.source_agent_id;
        normalized.source_agent_name = existing.source_agent_name;
        normalized.source_issue_id = existing.source_issue_id;
        normalized.source_issue_identifier = existing.source_issue_identifier;
        normalized.target_agent_id = existing.target_agent_id;
        normalized.target_agent_name = existing.target_agent_name;
        normalized.title = existing.title;
        normalized.required_action = existing.required_action;
        normalized.workflow_batch_id = existing.workflow_batch_id;
        normalized.workflow_run_id = existing.workflow_run_id;
        normalized.workflow_round_date = existing.workflow_round_date;
        normalized.workflow_stage = existing.workflow_stage;
        normalized.workflow_expected_count = existing.workflow_expected_count;
        normalized.workflow_actual_count = existing.workflow_actual_count;
        normalized.workflow_gate_status = existing.workflow_gate_status;
        normalized.workflow_next_owner = existing.workflow_next_owner;
        normalized.artifacts_json = existing.artifacts_json;
        normalized.acceptance_criteria_json = existing.acceptance_criteria_json;
        normalized.source_file = existing.source_file;
      }
      if (!hasStatusOverride) normalized.status = existing.status;
      normalized.paperclip_issue_id = normalized.paperclip_issue_id || existing.paperclip_issue_id;
      normalized.paperclip_issue_identifier =
        normalized.paperclip_issue_identifier || existing.paperclip_issue_identifier;
    }
  }
  const timestamp = now();

  database
    .prepare(
      `insert into worker_handoffs (
        handoff_key, dedupe_key, handoff_version, source_agent_id, source_agent_name,
        source_issue_id, source_issue_identifier, target_agent_id, target_agent_name,
        title, required_action, workflow_batch_id, workflow_run_id, workflow_round_date, workflow_stage,
        workflow_expected_count, workflow_actual_count, workflow_gate_status,
        workflow_next_owner, status, paperclip_issue_id, paperclip_issue_identifier,
        artifacts_json, acceptance_criteria_json, source_file, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(handoff_key) do update set
        dedupe_key = coalesce(nullif(excluded.dedupe_key, ''), worker_handoffs.dedupe_key),
        handoff_version = excluded.handoff_version,
        source_agent_id = excluded.source_agent_id,
        source_agent_name = excluded.source_agent_name,
        source_issue_id = excluded.source_issue_id,
        source_issue_identifier = excluded.source_issue_identifier,
        target_agent_id = excluded.target_agent_id,
        target_agent_name = excluded.target_agent_name,
        title = excluded.title,
        required_action = excluded.required_action,
        workflow_batch_id = excluded.workflow_batch_id,
        workflow_run_id = excluded.workflow_run_id,
        workflow_round_date = excluded.workflow_round_date,
        workflow_stage = excluded.workflow_stage,
        workflow_expected_count = excluded.workflow_expected_count,
        workflow_actual_count = excluded.workflow_actual_count,
        workflow_gate_status = excluded.workflow_gate_status,
        workflow_next_owner = excluded.workflow_next_owner,
        status = excluded.status,
        paperclip_issue_id = coalesce(nullif(excluded.paperclip_issue_id, ''), worker_handoffs.paperclip_issue_id),
        paperclip_issue_identifier = coalesce(
          nullif(excluded.paperclip_issue_identifier, ''),
          worker_handoffs.paperclip_issue_identifier
        ),
        artifacts_json = excluded.artifacts_json,
        acceptance_criteria_json = excluded.acceptance_criteria_json,
        source_file = excluded.source_file,
        updated_at = excluded.updated_at`,
    )
    .run(
      normalized.handoff_key,
      normalized.dedupe_key,
      normalized.handoff_version,
      normalized.source_agent_id,
      normalized.source_agent_name,
      normalized.source_issue_id,
      normalized.source_issue_identifier,
      normalized.target_agent_id,
      normalized.target_agent_name,
      normalized.title,
      normalized.required_action,
      normalized.workflow_batch_id,
      normalized.workflow_run_id,
      normalized.workflow_round_date,
      normalized.workflow_stage,
      normalized.workflow_expected_count,
      normalized.workflow_actual_count,
      normalized.workflow_gate_status,
      normalized.workflow_next_owner,
      normalized.status,
      normalized.paperclip_issue_id,
      normalized.paperclip_issue_identifier,
      normalized.artifacts_json,
      normalized.acceptance_criteria_json,
      normalized.source_file,
      timestamp,
      timestamp,
    );

  const row = database
    .prepare("select * from worker_handoffs where handoff_key = ?")
    .get(normalized.handoff_key);
  audit(database, "worker_handoff", row.id, "record", {
    handoffKey: normalized.handoff_key,
    status: normalized.status,
    workflowStage: normalized.workflow_stage,
  });

  return {
    id: row.id,
    status: normalized.status,
    workflowStage: normalized.workflow_stage,
  };
}

async function reconcileWorkerHandoffs(database, { apiBase, apiKey, runId }) {
  const rows = database
    .prepare(
      `select id, paperclip_issue_id, paperclip_issue_identifier
       from worker_handoffs
       where status not in ('completed', 'cancelled')
         and (
           (paperclip_issue_id is not null and trim(paperclip_issue_id) != '')
           or (paperclip_issue_identifier is not null and trim(paperclip_issue_identifier) != '')
         )
       order by id`,
    )
    .all();

  const result = { closed: 0, active: 0, errors: 0 };
  for (const row of rows) {
    try {
      const paperclipIssueRef = clean(row.paperclip_issue_id) || clean(row.paperclip_issue_identifier);
      const issue = await fetchPaperclipIssue({
        apiBase,
        apiKey,
        runId,
        issueId: paperclipIssueRef,
      });
      const nextStatus = terminalHandoffStatus(issue.status);
      if (!nextStatus) {
        result.active += 1;
        continue;
      }
      database
        .prepare(
          `update worker_handoffs
           set status = ?,
               paperclip_issue_id = coalesce(nullif(?, ''), paperclip_issue_id),
               paperclip_issue_identifier = coalesce(nullif(?, ''), paperclip_issue_identifier),
               updated_at = ?
           where id = ?`,
        )
        .run(nextStatus, clean(issue.id), clean(issue.identifier), now(), row.id);
      audit(database, "worker_handoff", row.id, "reconcile", {
        paperclipIssueId: clean(row.paperclip_issue_id),
        paperclipIssueIdentifier: clean(row.paperclip_issue_identifier),
        paperclipStatus: issue.status,
        status: nextStatus,
      });
      result.closed += 1;
    } catch {
      result.errors += 1;
    }
  }
  return result;
}

function terminalHandoffStatus(paperclipStatus) {
  const status = clean(paperclipStatus);
  if (status === "done") return "completed";
  if (status === "cancelled") return "cancelled";
  return null;
}

async function fetchPaperclipIssue({ apiBase, apiKey, runId, issueId }) {
  const response = await fetch(`${apiBase}/api/issues/${encodeURIComponent(issueId)}`, {
    method: "GET",
    headers: paperclipHeaders({ apiKey, runId }),
  });
  const text = await response.text();
  const body = text ? parseJsonResponse(text, response.url) : {};
  if (!response.ok) {
    throw new Error(`Falha ao consultar issue Paperclip ${issueId}: HTTP ${response.status}`);
  }
  return body;
}

function paperclipHeaders({ apiKey, runId }) {
  const headers = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (runId) headers["X-Paperclip-Run-Id"] = runId;
  return headers;
}

function parseJsonResponse(text, url) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Resposta invalida da API Paperclip em ${url}: ${text.slice(0, 500)}`);
  }
}

function normalizeApiBase(apiBase) {
  return String(apiBase).replace(/\/+$/, "");
}

function normalizeWorkerHandoff(
  handoff,
  { sourceFile, status, paperclipIssueId, paperclipIssueIdentifier },
) {
  if (!handoff || typeof handoff !== "object" || Array.isArray(handoff)) {
    throw usageError("Handoff deve ser um objeto JSON");
  }

  const workflow = handoff.workflow;
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    throw usageError("workflow obrigatorio no handoff");
  }

  const sourceIssue = handoff.source_issue;
  if (!sourceIssue || typeof sourceIssue !== "object" || Array.isArray(sourceIssue)) {
    throw usageError("source_issue obrigatorio no handoff");
  }

  const required = {
    handoff_version: handoff.handoff_version,
    source_agent_id: handoff.source_agent_id,
    "source_issue.id": sourceIssue.id,
    "source_issue.identifier": sourceIssue.identifier,
    target_agent_id: handoff.target_agent_id,
    target_agent_name: handoff.target_agent_name,
    title: handoff.title,
    required_action: handoff.required_action,
    "workflow.run_id": workflow.run_id,
    "workflow.round_date": workflow.round_date,
    "workflow.stage": workflow.stage,
    "workflow.expected_count": workflow.expected_count,
    "workflow.next_owner": workflow.next_owner,
  };

  for (const [key, value] of Object.entries(required)) {
    if (value === undefined || value === null || value === "") {
      throw usageError(`Campo obrigatorio ausente no handoff: ${key}`);
    }
  }

  if (handoff.handoff_version !== 1) throw usageError("handoff_version deve ser 1");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(workflow.round_date))) {
    throw usageError("workflow.round_date deve estar no formato YYYY-MM-DD");
  }

  const expectedCount = parseOptionalInteger(workflow.expected_count);
  if (expectedCount === null || expectedCount < 0) {
    throw usageError("workflow.expected_count deve ser inteiro maior ou igual a zero");
  }

  const actualCount =
    workflow.actual_count === undefined ? null : parseOptionalInteger(workflow.actual_count);
  if (workflow.actual_count !== undefined && (actualCount === null || actualCount < 0)) {
    throw usageError("workflow.actual_count deve ser inteiro maior ou igual a zero");
  }

  if (!Array.isArray(handoff.artifacts) || handoff.artifacts.length === 0) {
    throw usageError("artifacts deve ser uma lista nao vazia");
  }
  if (!Array.isArray(handoff.acceptance_criteria) || handoff.acceptance_criteria.length === 0) {
    throw usageError("acceptance_criteria deve ser uma lista nao vazia");
  }

  const normalizedStatus = normalizeProfileChoice(status) || "pending_issue";
  if (!HANDOFF_STATUSES.has(normalizedStatus)) {
    throw usageError(`Status de handoff invalido: ${status}`);
  }

  const sourceIssueId = clean(sourceIssue.id);
  const targetAgentId = clean(handoff.target_agent_id);
  const workflowRunId = clean(workflow.run_id);
  const workflowStage = clean(workflow.stage);
  const workflowBatchId = clean(workflow.batch_id);
  const explicitDedupeKey = clean(workflow.dedupe_key ?? handoff.dedupe_key);
  const dedupeKey = explicitDedupeKey || (workflowBatchId ? `batch:${workflowBatchId}:target:${targetAgentId}` : "");

  return {
    handoff_key: [sourceIssueId, targetAgentId, workflowRunId, workflowStage].join(":"),
    dedupe_key: dedupeKey,
    handoff_version: 1,
    source_agent_id: clean(handoff.source_agent_id),
    source_agent_name: clean(handoff.source_agent_name),
    source_issue_id: sourceIssueId,
    source_issue_identifier: clean(sourceIssue.identifier),
    target_agent_id: targetAgentId,
    target_agent_name: clean(handoff.target_agent_name),
    title: clean(handoff.title),
    required_action: clean(handoff.required_action),
    workflow_batch_id: workflowBatchId,
    workflow_run_id: workflowRunId,
    workflow_round_date: clean(workflow.round_date),
    workflow_stage: workflowStage,
    workflow_expected_count: expectedCount,
    workflow_actual_count: actualCount,
    workflow_gate_status: clean(workflow.gate_status),
    workflow_next_owner: clean(workflow.next_owner),
    status: normalizedStatus,
    paperclip_issue_id: clean(paperclipIssueId),
    paperclip_issue_identifier: clean(paperclipIssueIdentifier),
    artifacts_json: JSON.stringify(handoff.artifacts),
    acceptance_criteria_json: JSON.stringify(handoff.acceptance_criteria),
    source_file: clean(sourceFile),
  };
}

function audit(database, entityType, entityId, action, details) {
  database
    .prepare(
      `insert into audit_log (entity_type, entity_id, action, details_json, created_at)
       values (?, ?, ?, ?, ?)`,
    )
    .run(entityType, entityId, action, JSON.stringify(details ?? {}), now());
}

function requireUniqueLead(database, name) {
  const matches = findLeadsByName(database, name);
  if (matches.length === 0) throw usageError(`Lead nao encontrado: ${name}`);
  if (matches.length > 1) {
    throw ambiguityError(
      `Match ambiguo para "${name}": ${matches.map((lead) => lead.canonical_name).join(", ")}`,
    );
  }
  return matches[0];
}

function requireLeadById(database, leadId) {
  const id = parsePositiveInt(leadId, "lead-id");
  const lead = database.prepare("select * from leads where id = ?").get(id);
  if (!lead) throw usageError(`Lead nao encontrado: ${id}`);
  return lead;
}

function resolveLeadForIdentityLink(database, flags) {
  const hasName = Boolean(clean(flags.name));
  const hasLeadId = Boolean(clean(flags["lead-id"]));
  if (hasName === hasLeadId) throw usageError("Informe exatamente um filtro: --name ou --lead-id");
  return hasLeadId ? requireLeadById(database, flags["lead-id"]) : requireUniqueLead(database, flags.name);
}

function findLeadsByName(database, name) {
  const query = normalizeName(name);
  if (!query) return [];
  const leads = database.prepare("select * from leads order by canonical_name").all();
  const exact = leads.filter((lead) => normalizeName(lead.canonical_name) === query);
  if (exact.length) return exact;
  return leads.filter((lead) => normalizeName(lead.canonical_name).includes(query));
}

function identifyLeadForConversation(database, conversation) {
  if (conversation.lead_name) return requireUniqueLead(database, conversation.lead_name);
  const text = normalizeName(conversation.message);
  const leads = database.prepare("select * from leads order by canonical_name").all();
  const fullNameMatches = leads.filter((lead) => text.includes(normalizeName(lead.canonical_name)));
  if (fullNameMatches.length === 1) return fullNameMatches[0];
  if (fullNameMatches.length > 1) {
    throw ambiguityError(
      `Match ambiguo na conversa: ${fullNameMatches.map((lead) => lead.canonical_name).join(", ")}`,
    );
  }
  const firstTokenMatches = leads.filter((lead) => {
    const [firstToken] = normalizeName(lead.canonical_name).split(" ");
    return firstToken && text.includes(firstToken);
  });
  if (firstTokenMatches.length === 1) return firstTokenMatches[0];
  if (firstTokenMatches.length > 1) {
    throw ambiguityError(
      `Match ambiguo na conversa: ${firstTokenMatches.map((lead) => lead.canonical_name).join(", ")}`,
    );
  }
  throw usageError("Nenhum lead identificado na conversa");
}

function ingestWhatsAppInbound(database, event, rawFile, options = {}) {
  if (event.is_group) throw usageError("Eventos de grupo nao entram na automacao WhatsApp");
  const messageType = normalizeWhatsAppInboundMessageType(event.message_type);
  if (messageType !== "text") {
    throw usageError(`Tipo de mensagem nao suportado para automacao: ${event.message_type}`);
  }
  if (!clean(event.body)) throw usageError("Mensagem inbound sem texto");

  const classification = classifyResponse(event.body);
  const receivedAt = clean(event.received_at) || now();
  const leadMatch = identifyLeadForWhatsAppEvent(database, event);
  if (!leadMatch.lead) {
    if (options.recordUnmatched === false) {
      return { lead: null, classification, inbound: null, unmatched: null };
    }
    const unmatched = recordUnmatchedWhatsAppInbound(database, event, {
      rawFile,
      classification,
      receivedAt,
      reason: leadMatch.reason,
    });
    return { lead: null, classification, inbound: null, unmatched };
  }

  const lead = leadMatch.lead;
  const existingInbound = clean(event.bridge_message_id)
    ? database
        .prepare("select * from whatsapp_inbound_events where bridge_message_id = ?")
        .get(clean(event.bridge_message_id))
    : null;

  if (existingInbound) {
    if (options.unmatchedId) {
      markUnmatchedReconciled(database, options.unmatchedId, lead.id, existingInbound.id, "inbound_existente");
    }
    return { lead, classification: existingInbound.classification, inbound: existingInbound };
  }

  database
    .prepare(
      `insert into whatsapp_inbound_events (
        bridge_message_id, chat_id, sender_name, sender_phone, is_group, message_type,
        body, received_at, lead_id, processing_status, classification, raw_json, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      clean(event.bridge_message_id),
      clean(event.chat_id),
      clean(event.sender_name),
      clean(event.sender_phone),
      event.is_group ? 1 : 0,
      messageType,
      event.body,
      receivedAt,
      lead.id,
      "classified",
      classification,
      JSON.stringify({ ...event, raw_file: rawFile }),
      now(),
    );

  const inbound = clean(event.bridge_message_id)
    ? database
        .prepare("select * from whatsapp_inbound_events where bridge_message_id = ?")
        .get(clean(event.bridge_message_id))
    : database
        .prepare("select * from whatsapp_inbound_events where lead_id = ? order by id desc limit 1")
        .get(lead.id);

  if (options.unmatchedId) {
    markUnmatchedReconciled(database, options.unmatchedId, lead.id, inbound.id, "identity_alias");
  }

  upsertLeadConversationState(database, lead, {
    inboundEventId: inbound.id,
    whatsappState: stateForWhatsAppClassification(classification),
    handoffReason: null,
    resetAutoReplies: true,
  });

  markResponse(database, lead, {
    message: event.body,
    occurredAt: receivedAt,
    status: "respondeu",
    responseStatus: classification,
    rawFile,
  });

  return { lead, classification, inbound };
}

function identifyLeadForWhatsAppEvent(database, event) {
  if (event.lead_name) {
    return { lead: requireUniqueLead(database, event.lead_name), reason: "lead_name" };
  }
  const aliasMatches = findLeadsByWhatsAppIdentity(database, whatsappIdentityCandidates(event));
  if (aliasMatches.length === 1) return { lead: aliasMatches[0], reason: "identity_alias" };
  if (aliasMatches.length > 1) {
    throw ambiguityError(
      `Identidade WhatsApp ambigua: ${aliasMatches.map((lead) => lead.canonical_name).join(", ")}`,
    );
  }

  const normalizedPhone = normalizePhone(event.sender_phone ?? event.chat_id ?? "");
  if (normalizedPhone) {
    const matches = database
      .prepare("select * from leads where phone_normalized = ? order by canonical_name")
      .all(normalizedPhone);
    if (matches.length === 1) return { lead: matches[0], reason: "phone_normalized" };
    if (matches.length > 1) {
      throw ambiguityError(`Telefone ambiguo no WhatsApp: ${normalizedPhone}`);
    }
  }
  try {
    return { lead: requireUniqueLead(database, event.sender_name ?? ""), reason: "sender_name" };
  } catch (error) {
    if (error.exitCode === 1 && /Lead nao encontrado/i.test(error.message)) {
      return { lead: null, reason: error.message };
    }
    throw error;
  }
}

function whatsappIdentityCandidates(event) {
  return uniqueClean([
    normalizeWhatsAppIdentity(event.chat_id),
    normalizeWhatsAppIdentity(event.sender_phone),
    normalizePhone(event.sender_phone ?? ""),
    normalizePhone(event.chat_id ?? ""),
  ]);
}

function findLeadsByWhatsAppIdentity(database, candidates) {
  if (!candidates.length) return [];
  const placeholders = candidates.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `select distinct l.*
       from whatsapp_identity_aliases a
       join leads l on l.id = a.lead_id
       where a.identity_value in (${placeholders})
       order by l.canonical_name`,
    )
    .all(...candidates);
  const byId = new Map(rows.map((lead) => [lead.id, lead]));
  return [...byId.values()];
}

function linkWhatsAppIdentity(database, lead, { identity, source, notes }) {
  const identityValue = normalizeWhatsAppIdentity(identity);
  if (!identityValue) throw usageError("Identidade WhatsApp vazia");
  const timestamp = now();
  database
    .prepare(
      `insert into whatsapp_identity_aliases (
        lead_id, identity_value, source, notes, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?)
      on conflict(identity_value) do update set
        lead_id = excluded.lead_id,
        source = excluded.source,
        notes = excluded.notes,
        updated_at = excluded.updated_at`,
    )
    .run(lead.id, identityValue, clean(source) || "manual", clean(notes), timestamp, timestamp);
  return database
    .prepare("select * from whatsapp_identity_aliases where identity_value = ?")
    .get(identityValue);
}

function recordUnmatchedWhatsAppInbound(database, event, { rawFile, classification, receivedAt, reason }) {
  const bridgeMessageId = clean(event.bridge_message_id);
  const messageType = normalizeWhatsAppInboundMessageType(event.message_type);
  const timestamp = now();
  database
    .prepare(
      `insert into whatsapp_unmatched_inbound_events (
        bridge_message_id, chat_id, sender_name, sender_phone, is_group, message_type,
        body, received_at, classification, status, match_reason, raw_json, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(bridge_message_id) do update set
        chat_id = excluded.chat_id,
        sender_name = excluded.sender_name,
        sender_phone = excluded.sender_phone,
        body = excluded.body,
        received_at = excluded.received_at,
        classification = excluded.classification,
        match_reason = excluded.match_reason,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at`,
    )
    .run(
      bridgeMessageId,
      clean(event.chat_id),
      clean(event.sender_name),
      clean(event.sender_phone),
      event.is_group ? 1 : 0,
      messageType,
      event.body,
      receivedAt,
      classification,
      "unmatched",
      clean(reason),
      JSON.stringify({ ...event, raw_file: rawFile }),
      timestamp,
      timestamp,
    );

  if (bridgeMessageId) {
    return database
      .prepare("select * from whatsapp_unmatched_inbound_events where bridge_message_id = ?")
      .get(bridgeMessageId);
  }
  return database
    .prepare("select * from whatsapp_unmatched_inbound_events order by id desc limit 1")
    .get();
}

function normalizeWhatsAppInboundMessageType(messageType) {
  const normalized = clean(messageType).toLowerCase();
  if (!normalized || normalized === "text" || normalized === "chat") return "text";
  return normalized;
}

function reconcileUnmatchedWhatsAppInbound(database, { limit, ids = [], chatId = "" }) {
  if (ids.length && chatId) throw usageError("Informe apenas um filtro: --id ou --chat-id");

  let rows;
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(", ");
    rows = database
      .prepare(
        `select *
         from whatsapp_unmatched_inbound_events
         where status = 'unmatched'
           and id in (${placeholders})
         order by received_at asc, id asc`,
      )
      .all(...ids);
  } else if (chatId) {
    rows = database
      .prepare(
        `select *
         from whatsapp_unmatched_inbound_events
         where status = 'unmatched'
           and chat_id = ?
         order by received_at asc, id asc`,
      )
      .all(chatId);
  } else {
    rows = database
      .prepare(
        `select *
         from whatsapp_unmatched_inbound_events
         where status = 'unmatched'
         order by received_at asc, id asc
         limit ?`,
      )
      .all(limit);
  }
  let reconciled = 0;
  let pending = 0;

  for (const row of rows) {
    const event = JSON.parse(row.raw_json);
    const result = ingestWhatsAppInbound(database, event, event.raw_file ?? "", {
      recordUnmatched: false,
      unmatchedId: row.id,
    });
    if (result.inbound) reconciled += 1;
    else pending += 1;
  }

  return { reconciled, pending };
}

function markNoMatchUnmatchedWhatsAppInbound(database, { ids, chatId, reason }) {
  const normalizedReason = clean(reason);
  if (!normalizedReason) throw usageError("--reason obrigatorio");
  if ((ids.length ? 1 : 0) + (chatId ? 1 : 0) !== 1) {
    throw usageError("Informe exatamente um filtro: --id ou --chat-id");
  }

  let rows;
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(", ");
    rows = database
      .prepare(
        `select *
         from whatsapp_unmatched_inbound_events
         where status = 'unmatched'
           and id in (${placeholders})
         order by received_at asc, id asc`,
      )
      .all(...ids);
  } else {
    rows = database
      .prepare(
        `select *
         from whatsapp_unmatched_inbound_events
         where status = 'unmatched'
           and chat_id = ?
         order by received_at asc, id asc`,
      )
      .all(chatId);
  }

  const timestamp = now();
  database.exec("BEGIN");
  try {
    for (const row of rows) {
      database
        .prepare(
          `update whatsapp_unmatched_inbound_events
           set status = 'no_match',
               match_reason = ?,
               updated_at = ?
           where id = ?`,
        )
        .run(normalizedReason, timestamp, row.id);
      audit(database, "whatsapp_unmatched_inbound_event", row.id, "mark-no-match", {
        reason: normalizedReason,
        chat_id: row.chat_id,
        classification: row.classification,
      });
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  return { marked: rows.length };
}

function markUnmatchedReconciled(database, unmatchedId, leadId, inboundId, reason) {
  database
    .prepare(
      `update whatsapp_unmatched_inbound_events
       set status = 'reconciled',
           matched_lead_id = ?,
           matched_inbound_event_id = ?,
           match_reason = ?,
           updated_at = ?
       where id = ?`,
    )
    .run(leadId, inboundId, reason, now(), unmatchedId);
}

function stateForWhatsAppClassification(classification) {
  if (classification === "resposta_permissao") return "respondeu_pode";
  if (classification === "resposta_pediu_preco") return "preco_pedido";
  if (classification === "resposta_lead_quente") return "lead_quente";
  if (classification === "resposta_objecao") return "objecao_comercial";
  if (classification === "resposta_pediu_exemplo") return "pedido_exemplo";
  if (classification === "resposta_sem_interesse") return "encerrado";
  return "atendimento_autonomo";
}

function upsertLeadConversationState(database, lead, input) {
  const existing = database
    .prepare("select * from lead_conversation_state where lead_id = ?")
    .get(lead.id);
  const autoReplies = input.resetAutoReplies ? 0 : existing?.auto_replies_since_human ?? 0;

  database
    .prepare(
      `insert into lead_conversation_state (
        lead_id, whatsapp_state, auto_replies_since_human, last_inbound_event_id,
        last_outbox_id, handoff_reason, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?)
      on conflict(lead_id) do update set
        whatsapp_state = excluded.whatsapp_state,
        auto_replies_since_human = excluded.auto_replies_since_human,
        last_inbound_event_id = excluded.last_inbound_event_id,
        handoff_reason = excluded.handoff_reason,
        updated_at = excluded.updated_at`,
    )
    .run(
      lead.id,
      input.whatsappState,
      autoReplies,
      input.inboundEventId ?? existing?.last_inbound_event_id ?? null,
      existing?.last_outbox_id ?? null,
      input.handoffReason ?? existing?.handoff_reason ?? null,
      now(),
    );
}

function proposeWhatsAppOutbox(
  database,
  lead,
  {
    body,
    source,
    humanizerPass = false,
    usedLastInbound = false,
    contextualReply = false,
    humanizerNotes = "",
  },
) {
  const normalizedBody = normalizeWhatsAppOutboxBody(body);
  const state = database
    .prepare("select * from lead_conversation_state where lead_id = ?")
    .get(lead.id);
  if (!state?.last_inbound_event_id) {
    throw usageError(`Lead sem evento inbound WhatsApp: ${lead.canonical_name}`);
  }

  const inbound = database
    .prepare("select * from whatsapp_inbound_events where id = ?")
    .get(state.last_inbound_event_id);
  if (!inbound) {
    throw usageError(`Evento inbound WhatsApp nao encontrado: ${state.last_inbound_event_id}`);
  }
  const targetChatId = whatsappOutboxTargetChatId(lead, inbound);

  database
    .prepare(
      `insert into whatsapp_outbox (
        lead_id, inbound_event_id, target_chat_id, body, source, status,
        humanizer_pass, used_last_inbound, contextual_reply, humanizer_notes, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      lead.id,
      inbound.id,
      targetChatId,
      normalizedBody,
      source,
      "pending_guardian",
      humanizerPass ? 1 : 0,
      usedLastInbound ? 1 : 0,
      contextualReply ? 1 : 0,
      clean(humanizerNotes),
      now(),
    );

  return database.prepare("select * from whatsapp_outbox order by id desc limit 1").get();
}

function normalizeWhatsAppOutboxBody(value) {
  return clean(value)
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

function whatsappOutboxTargetChatId(lead, inbound) {
  const inboundChatId = clean(inbound.chat_id);
  if (!isWhatsAppLid(inboundChatId)) return inboundChatId;

  const phoneTarget = whatsappSendPhoneFromLead(lead);
  if (phoneTarget) return phoneTarget;

  throw usageError(`Lead sem telefone real para envio WhatsApp: ${lead.canonical_name}`);
}

function isWhatsAppLid(value) {
  return clean(value).toLowerCase().endsWith("@lid");
}

function whatsappSendPhoneFromLead(lead) {
  for (const value of [lead.phone_or_contact, lead.phone_normalized]) {
    const phone = whatsappSendPhoneFromValue(value);
    if (phone) return phone;
  }
  return "";
}

function whatsappSendPhoneFromValue(value) {
  const raw = clean(value);
  if (!raw || isWhatsAppLid(raw)) return "";

  const jidPhone = raw.toLowerCase().endsWith("@s.whatsapp.net") ? raw.split("@")[0] : "";
  if (/^\d{8,15}$/.test(jidPhone)) return jidPhone;

  const digits = raw.replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) return digits;
  if (raw.includes("+") && digits.length >= 8 && digits.length <= 15) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return "";
}

function whatsappOutboxStatus(database, outboxId, root) {
  const row = database
    .prepare(
      `select
        o.*,
        l.canonical_name as lead_name,
        s.whatsapp_state,
        s.handoff_reason
      from whatsapp_outbox o
      join leads l on l.id = o.lead_id
      left join lead_conversation_state s on s.lead_id = o.lead_id
      where o.id = ?`,
    )
    .get(outboxId);
  if (!row) throw usageError(`Outbox nao encontrada: ${outboxId}`);

  const dispatchCheck = whatsappOutboxDispatchCheck(row);
  return {
    ...row,
    can_dispatch: dispatchCheck.canDispatch,
    dispatch_blockers: dispatchCheck.blockers,
    gateway_command:
      `node scripts/whatsapp-local-gateway.mjs --root ${root} dispatch-approved-outbox ` +
      `--provider waha --outbox-id ${row.id}`,
  };
}

function listDispatchableWhatsAppOutboxes(database, root) {
  const rows = database
    .prepare(
      `select
        o.*,
        l.canonical_name as lead_name,
        s.whatsapp_state
       from whatsapp_outbox o
       join leads l on l.id = o.lead_id
       left join lead_conversation_state s on s.lead_id = o.lead_id
       where o.status = 'approved'
         and o.guardian_decision = 'enviar'
         and o.humanizer_pass = 1
         and o.used_last_inbound = 1
         and o.contextual_reply = 1
       order by o.id asc`,
    )
    .all()
    .filter((row) => whatsappOutboxDispatchCheck(row).canDispatch);

  if (!rows.length) {
    console.log("Nenhuma Outbox aprovada e despachavel.");
    return;
  }

  for (const row of rows) {
    console.log(`Outbox ${row.id}: ${row.lead_name}`);
    console.log(
      `  node scripts/whatsapp-local-gateway.mjs --root ${root} dispatch-approved-outbox --provider waha --outbox-id ${row.id}`,
    );
  }
}

function whatsappOutboxDispatchCheck(outbox) {
  const blockers = [];
  if (!["approved", "failed"].includes(outbox.status)) blockers.push(`status ${outbox.status}`);
  if (outbox.guardian_decision !== "enviar") blockers.push("guardiao nao aprovou envio");
  if (!outbox.humanizer_pass) blockers.push("humanizer_pass ausente");
  if (!outbox.used_last_inbound) blockers.push("used_last_inbound ausente");
  if (!outbox.contextual_reply) blockers.push("contextual_reply ausente");
  if (outbox.sent_at) blockers.push("ja possui sent_at");
  if (outbox.attempts >= 2) blockers.push("limite de tentativas atingido");
  if (["handoff_luiz", "bloqueado_guardiao", "encerrado"].includes(clean(outbox.whatsapp_state))) {
    blockers.push(`estado ${outbox.whatsapp_state}`);
  }
  if (isWhatsAppLid(outbox.target_chat_id)) blockers.push("destino direto @lid");
  return { canDispatch: blockers.length === 0, blockers };
}

function formatWhatsAppOutboxStatus(report) {
  const lines = [
    `Outbox: ${report.id}`,
    `Lead: ${report.lead_name}`,
    `Inbound: ${report.inbound_event_id ?? "-"}`,
    `Status: ${report.status}`,
    `Destino: ${report.target_chat_id}`,
    `Guardiao: ${report.guardian_decision || "-"}`,
    `Motivo guardiao: ${report.guardian_reason || "-"}`,
    `WhatsApp state: ${report.whatsapp_state || "-"}`,
    `Humanizer: ${report.humanizer_pass ? "sim" : "nao"}`,
    `Usou ultimo inbound: ${report.used_last_inbound ? "sim" : "nao"}`,
    `Resposta contextual: ${report.contextual_reply ? "sim" : "nao"}`,
    `Provider: ${report.dispatch_provider || "-"}`,
    `Provider message id: ${report.provider_message_id || "-"}`,
    `ACK: ${report.delivery_ack_name || report.delivery_ack || "-"}`,
    `Sent at: ${report.sent_at || "-"}`,
    `Pode despachar: ${report.can_dispatch ? "sim" : "nao"}`,
  ];
  if (!report.can_dispatch) {
    lines.push(`Bloqueios: ${report.dispatch_blockers.join("; ")}`);
  }
  lines.push(`Gateway: ${report.gateway_command}`);
  return lines.join("\n");
}

const WHATSAPP_AUTO_REPLY_LIMIT_REASON = "limite de 5 respostas automaticas atingido";
const WHATSAPP_PRICE_QUALIFICATION_HANDOFF_REASON = "qualificacao de preco ja enviada; handoff Luiz";
const NEUTRAL_PRICE_QUALIFICATION_REPLY = [
  "Depende um pouco do que precisa aparecer na pagina e do objetivo principal.",
  "",
  "Para eu te direcionar melhor: voce quer usar essa pagina mais como apresentacao oficial do seu trabalho, ou mais para organizar o caminho de quem vem do Instagram/WhatsApp?",
].join("\n");

function reviewWhatsAppOutbox(database, outboxId) {
  const outbox = database.prepare("select * from whatsapp_outbox where id = ?").get(outboxId);
  if (!outbox) throw usageError(`Outbox nao encontrado: ${outboxId}`);
  if (outbox.status !== "pending_guardian") {
    return {
      decision: outbox.status === "approved" ? "aprovado" : outbox.status === "blocked" ? "bloqueado" : outbox.status,
      reason: outbox.guardian_reason || "decisao ja registrada",
      rules: outbox.guardian_reason ? outbox.guardian_reason.split("; ") : [],
    };
  }
  const lead = database.prepare("select * from leads where id = ?").get(outbox.lead_id);
  const state = database
    .prepare("select * from lead_conversation_state where lead_id = ?")
    .get(outbox.lead_id);
  const rules = guardianRules({ outbox, lead, state });
  const decision = rules.length ? "bloquear" : "enviar";
  const status = decision === "enviar" ? "approved" : "blocked";
  const reason = rules.length ? rules.join("; ") : "mensagem dentro da zona segura";

  database
    .prepare(
      `insert into whatsapp_guardian_decisions (
        outbox_id, decision, reason, triggered_rules, created_at
      ) values (?, ?, ?, ?, ?)`,
    )
    .run(outbox.id, decision, reason, JSON.stringify(rules), now());

  database
    .prepare(
      `update whatsapp_outbox
       set status = ?, guardian_decision = ?, guardian_reason = ?, approved_at = ?
       where id = ?`,
    )
    .run(status, decision, reason, decision === "enviar" ? now() : null, outbox.id);

  if (decision === "enviar" && state?.whatsapp_state === "preco_pedido") {
    markPriceQualificationPending(database, outbox.lead_id, outbox.id);
  } else if (decision === "enviar") {
    incrementAutoReplies(database, outbox.lead_id, outbox.id);
  } else {
    setBlockedWhatsAppState(database, outbox, state, reason, rules);
  }

  return { decision: status === "approved" ? "aprovado" : "bloqueado", reason, rules };
}

function setBlockedWhatsAppState(database, outbox, state, reason, rules) {
  const handoff = blockedWhatsAppHandoffForRules(rules, reason, state);
  setWhatsAppHandoff(database, outbox.lead_id, handoff.state, handoff.reason);
}

function blockedWhatsAppHandoffForRules(rules, reason, state) {
  if (state?.whatsapp_state === "handoff_luiz") {
    return { state: "handoff_luiz", reason: state.handoff_reason || reason };
  }
  if (state?.whatsapp_state === "encerrado") {
    return { state: "encerrado", reason: state.handoff_reason || reason };
  }
  if (rules.includes(WHATSAPP_AUTO_REPLY_LIMIT_REASON)) {
    return { state: "handoff_luiz", reason };
  }
  if (rules.includes(WHATSAPP_PRICE_QUALIFICATION_HANDOFF_REASON)) {
    return { state: "handoff_luiz", reason: "preco_pedido" };
  }
  return { state: "bloqueado_guardiao", reason };
}

function buildGuardianAutoWakeOptions(flags) {
  return {
    apiBase:
      flags["paperclip-api-base"] ||
      process.env.PAPERCLIP_API_URL ||
      DEFAULT_PAPERCLIP_API_BASE,
    companyId:
      flags["paperclip-company-id"] ||
      process.env.PAPERCLIP_COMPANY_ID ||
      DEFAULT_PAPERCLIP_COMPANY_ID,
    apiKey: flags["paperclip-api-key"] || process.env.PAPERCLIP_API_KEY || "",
    runId: flags["paperclip-run-id"] || process.env.PAPERCLIP_RUN_ID || "",
    closerAgentId:
      flags["closer-agent-id"] ||
      process.env.WHATSAPP_CLOSER_AGENT_ID ||
      DEFAULT_CLOSER_AGENT_ID,
    scoutAgentId:
      flags["scout-agent-id"] ||
      process.env.WHATSAPP_SCOUT_AGENT_ID ||
      DEFAULT_SCOUT_AGENT_ID,
    timeoutMs: parsePositiveInt(flags["timeout-ms"] || "15000", "timeout-ms"),
  };
}

async function autoWakeForGuardianReview(database, outboxId, options) {
  const blocked = guardianBlockedOutboxContext(database, outboxId);
  if (!blocked || blocked.status !== "blocked" || blocked.guardian_decision !== "bloquear") {
    return { status: "skipped" };
  }
  if (!blocked.inbound_event_id) return { status: "skipped", error: "outbox sem inbound_event_id" };

  const route = guardianWakeRoute(database, blocked, options);
  if (!route) return { status: "skipped" };

  const existing = database
    .prepare(
      `select *
       from whatsapp_worker_wakes
       where inbound_event_id = ?
         and target_agent_id = ?
         and wake_type = ?
       order by id desc
       limit 1`,
    )
    .get(blocked.inbound_event_id, route.targetAgentId, route.wakeType);

  if (["created", "creating"].includes(existing?.status)) return { status: "existing" };

  const timestamp = now();
  if (existing) {
    database
      .prepare("update whatsapp_worker_wakes set status = 'creating', updated_at = ? where id = ?")
      .run(timestamp, existing.id);
  } else {
    database
      .prepare(
        `insert into whatsapp_worker_wakes (
          inbound_event_id, lead_id, target_agent_id, wake_type, status, created_at, updated_at
        ) values (?, ?, ?, ?, 'creating', ?, ?)`,
      )
      .run(blocked.inbound_event_id, blocked.lead_id, route.targetAgentId, route.wakeType, timestamp, timestamp);
  }

  try {
    const issue = await createPaperclipIssueFromCrm({
      ...options,
      payload: route.payload,
    });
    database
      .prepare(
        `update whatsapp_worker_wakes
         set status = 'created',
             paperclip_issue_id = ?,
             paperclip_issue_identifier = ?,
             updated_at = ?
         where inbound_event_id = ?
           and target_agent_id = ?
           and wake_type = ?`,
      )
      .run(
        clean(issue.id),
        clean(issue.identifier),
        now(),
        blocked.inbound_event_id,
        route.targetAgentId,
        route.wakeType,
      );
    return { status: "created" };
  } catch (error) {
    database
      .prepare(
        `update whatsapp_worker_wakes
         set status = 'failed', updated_at = ?
         where inbound_event_id = ?
           and target_agent_id = ?
           and wake_type = ?`,
      )
      .run(now(), blocked.inbound_event_id, route.targetAgentId, route.wakeType);
    return { status: "failed", error: error.message };
  }
}

function guardianBlockedOutboxContext(database, outboxId) {
  return database
    .prepare(
      `select
        o.*,
        l.canonical_name as lead_name,
        e.chat_id,
        e.body as inbound_body,
        e.classification,
        s.whatsapp_state,
        s.handoff_reason
       from whatsapp_outbox o
       join leads l on l.id = o.lead_id
       left join whatsapp_inbound_events e on e.id = o.inbound_event_id
       left join lead_conversation_state s on s.lead_id = o.lead_id
       where o.id = ?`,
    )
    .get(outboxId);
}

function guardianWakeRoute(database, blocked, options) {
  const rules = guardianTriggeredRules(database, blocked);
  const repairable = hasRepairableGuardianRule(rules);
  const previousRepairBlock = repairable && hasPreviousRepairableGuardianBlock(database, blocked);
  if (previousRepairBlock) {
    return {
      targetAgentId: options.scoutAgentId,
      wakeType: WHATSAPP_GUARDIAN_REANALYSIS_WAKE_TYPE,
      payload: buildGuardianReanalysisPayload(blocked, rules, options.scoutAgentId),
    };
  }
  return {
    targetAgentId: options.closerAgentId,
    wakeType: WHATSAPP_GUARDIAN_REPAIR_WAKE_TYPE,
    payload: buildGuardianRepairPayload(blocked, rules, options.closerAgentId),
  };
}

function guardianTriggeredRules(database, blocked) {
  const decision = database
    .prepare(
      `select triggered_rules
       from whatsapp_guardian_decisions
       where outbox_id = ?
       order by id desc
       limit 1`,
    )
    .get(blocked.id);
  if (decision?.triggered_rules) {
    try {
      const parsed = JSON.parse(decision.triggered_rules);
      if (Array.isArray(parsed)) return parsed.map((rule) => clean(rule)).filter(Boolean);
    } catch {
      // Fall back to guardian_reason below.
    }
  }
  return clean(blocked.guardian_reason)
    .split(";")
    .map((rule) => clean(rule))
    .filter(Boolean);
}

function hasRepairableGuardianRule(rules) {
  return rules.some((rule) =>
    [
      "mensagem contem lista artificial",
      "mensagem contem travessao ou marcador artificial",
      "mensagem generica com cara de IA",
      "mensagem longa demais",
    ].includes(rule),
  );
}

function hasPreviousRepairableGuardianBlock(database, blocked) {
  const rows = database
    .prepare(
      `select o.id, o.guardian_reason, d.triggered_rules
       from whatsapp_outbox o
       left join whatsapp_guardian_decisions d on d.outbox_id = o.id
       where o.lead_id = ?
         and o.id != ?
         and coalesce(o.inbound_event_id, -1) = coalesce(?, -1)
         and o.status = 'blocked'
       order by o.id`,
    )
    .all(blocked.lead_id, blocked.id, blocked.inbound_event_id ?? -1);
  return rows.some((row) => hasRepairableGuardianRule(guardianRulesFromBlockedRow(row)));
}

function guardianRulesFromBlockedRow(row) {
  if (row.triggered_rules) {
    try {
      const parsed = JSON.parse(row.triggered_rules);
      if (Array.isArray(parsed)) return parsed.map((rule) => clean(rule)).filter(Boolean);
    } catch {
      // Fall back to guardian_reason below.
    }
  }
  return clean(row.guardian_reason)
    .split(";")
    .map((rule) => clean(rule))
    .filter(Boolean);
}

function buildGuardianRepairPayload(blocked, rules, closerAgentId) {
  const reason = rules.join("; ") || blocked.guardian_reason || "bloqueio do Guardiao";
  return {
    title: `WhatsApp - ${blocked.lead_name}: reparar Outbox bloqueada pelo Guardiao`,
    description: [
      "## Reparo de Outbox WhatsApp",
      "",
      `Lead: ${blocked.lead_name}`,
      `classification: ${blocked.classification || "-"}`,
      `whatsapp_state: ${blocked.whatsapp_state || "nao_definido"}`,
      `inbound_event_id: ${blocked.inbound_event_id}`,
      `outbox_id bloqueada: ${blocked.id}`,
      `motivo_guardiao: ${reason}`,
      "",
      "## Mensagem recebida",
      "",
      blocked.inbound_body || "-",
      "",
      "## Resposta bloqueada",
      "",
      blocked.body,
      "",
      "## Trabalho",
      "",
      "- Reescrever a resposta de forma curta, natural e contextual.",
      "- Antes de propor a nova Outbox, liberar o estado com `node scripts/freela-crm.mjs whatsapp state set --name \"[lead]\" --state atendimento_autonomo --reason \"reparo de bloqueio do Guardiao\" --reset-auto-replies true`.",
      "- Criar nova Outbox com `node scripts/freela-crm.mjs whatsapp outbox propose --name \"[lead]\" --body \"[mensagem]\" --source jhon-guardiao-repair --humanizer-pass true --used-last-inbound true --contextual-reply true`.",
      "- Nao envie WhatsApp. Nao chame Gateway. Nao chame bridge.",
      "- Esta e uma tentativa de reparo. Se faltar contexto real ou se a nova Outbox bloquear de novo, acione Scout para reanalisar bio, link da bio, cartao virtual/PDF e caminho ate o WhatsApp.",
    ].join("\n"),
    assigneeAgentId: closerAgentId,
    priority: "high",
    status: "todo",
  };
}

function buildGuardianReanalysisPayload(blocked, rules, scoutAgentId) {
  const reason = rules.join("; ") || blocked.guardian_reason || "bloqueio repetido do Guardiao";
  return {
    title: `WhatsApp - ${blocked.lead_name}: reanalisar contexto apos bloqueio do Guardiao`,
    description: [
      "## Reanalise apos bloqueio do Guardiao",
      "",
      `Lead: ${blocked.lead_name}`,
      `classification: ${blocked.classification || "-"}`,
      `whatsapp_state: ${blocked.whatsapp_state || "nao_definido"}`,
      `inbound_event_id: ${blocked.inbound_event_id}`,
      `outbox_id bloqueada: ${blocked.id}`,
      `motivo_guardiao: ${reason}`,
      "",
      "## Trabalho",
      "",
      "- Reanalisar o cliente antes de nova tentativa de resposta.",
      "- Conferir Instagram, bio, link da bio, cartao virtual/PDF, servicos vistos, friccoes e caminho ate o WhatsApp.",
      "- Registrar ou atualizar o Bio Evidence Pack no CRM com evidencia navegada quando aplicavel.",
      "- Nao envie WhatsApp. Nao crie Outbox se o contexto continuar fraco.",
      "- Depois da reanalise, devolver para Jhon/Atendimento com o gancho comercial real para nova Outbox.",
    ].join("\n"),
    assigneeAgentId: scoutAgentId,
    priority: "high",
    status: "todo",
  };
}

async function createPaperclipIssueFromCrm({
  apiBase,
  companyId,
  apiKey,
  runId,
  timeoutMs,
  payload,
}) {
  const base = normalizePaperclipApiBase(apiBase);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${base}/api/companies/${encodeURIComponent(companyId)}/issues`, {
      method: "POST",
      headers: paperclipJsonHeaders({ apiKey, runId }),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timeout);
  }
}

function normalizePaperclipApiBase(value) {
  const base = clean(value).replace(/\/+$/, "");
  if (!base) throw usageError("Paperclip API base vazia");
  return base.endsWith("/api") ? base.slice(0, -4) : base;
}

function paperclipJsonHeaders({ apiKey, runId }) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (runId) headers["X-Paperclip-Run-Id"] = runId;
  return headers;
}

function guardianRules({ outbox, state }) {
  const body = normalizeName(outbox.body);
  const rules = [];

  if (!state) rules.push("lead sem estado de conversa WhatsApp");
  if (state?.whatsapp_state === "handoff_luiz") rules.push("lead em handoff_luiz");
  if (state?.whatsapp_state === "bloqueado_guardiao") rules.push("lead bloqueado pelo guardiao");
  if (state?.whatsapp_state === "encerrado") rules.push("conversa encerrada");
  if (state?.whatsapp_state === "qualificacao_preco_pendente") {
    rules.push(WHATSAPP_PRICE_QUALIFICATION_HANDOFF_REASON);
  }
  if (state?.whatsapp_state === "preco_pedido" && !isNeutralPriceQualificationReply(outbox.body)) {
    rules.push("preco_pedido exige qualificacao neutra");
  }
  if (state?.auto_replies_since_human >= 5) {
    rules.push(WHATSAPP_AUTO_REPLY_LIMIT_REASON);
  }
  if (!outbox.humanizer_pass) rules.push("humanizer_pass ausente");
  if (!outbox.used_last_inbound) rules.push("used_last_inbound ausente");
  if (!outbox.contextual_reply) rules.push("contextual_reply ausente");
  if (containsCommercialValue(body, outbox.body)) {
    rules.push("mensagem contem preco/proposta/fechamento");
  }
  if (/\benxuta\b|\bversao menor\b|\b397\b|\br\s*397\b/.test(body)) {
    rules.push("mensagem contem oferta removida enxuta/397 ou valor bloqueado");
  }
  if (/\bgaranto\b|\bgarantia\b|\bmais clientes\b|\bmais pacientes\b|\bprimeiro no google\b/.test(body)) {
    rules.push("mensagem promete resultado comercial");
  }
  if (/\botima pergunta\b|\bcom certeza\b|\bfico a disposicao\b|\bentendi perfeitamente\b/.test(body)) {
    rules.push("mensagem generica com cara de IA");
  }
  if (/—|–|--/.test(outbox.body)) rules.push("mensagem contem travessao ou marcador artificial");
  if (/^\s*(?:[-*]|\d+[.)]|\d+\s*[-])\s+\S/m.test(outbox.body)) {
    rules.push("mensagem contem lista artificial");
  }
  if (outbox.body.length > 700) rules.push("mensagem longa demais");
  if (containsPromptInjection(body)) {
    rules.push("possivel prompt injection");
  }
  if (containsLinkLikeText(body, outbox.body) && state?.whatsapp_state !== "exemplo_aprovado_para_envio") {
    rules.push("link de exemplo sem estado exemplo_aprovado_para_envio");
  }

  return rules;
}

function containsCommercialValue(body, rawBody) {
  return (
    /\bpreco\b|\bvalor\b|\borcamento\b|\bpagamento\b|\bdesconto\b|\bproposta\b|\bfechado\b|\bcontrato\b|\binvestimento\b|\breais\b/.test(
      body,
    ) ||
    /r\s*\$\s*\d+/i.test(clean(rawBody)) ||
    /\b(?:fica|sai|por|custa|cobro)\s+\d{3,}\b/.test(body)
  );
}

function containsPromptInjection(body) {
  return (
    /\b(ignore|ignora|ignorar|desconsidere|desconsiderar)\b.{0,80}\b(instrucoes|regras|prompt|sistema|anteriores|acima)\b/.test(
      body,
    ) ||
    /\bmodo desenvolvedor\b|\bprompt\b/.test(body)
  );
}

function isNeutralPriceQualificationReply(body) {
  return normalizeWhatsAppReplyText(body) === normalizeWhatsAppReplyText(NEUTRAL_PRICE_QUALIFICATION_REPLY);
}

function normalizeWhatsAppReplyText(value) {
  return clean(value)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function containsLinkLikeText(body, rawBody) {
  const raw = clean(rawBody);
  return (
    /https?:\/\//i.test(raw) ||
    /(?:^|[\s([<{])(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*\.[a-z]{2,}(?:\/[^\s)\]}>]*)?/i.test(raw) ||
    /\b(?:www|instagram|bit|wa) (?:com|ly|me)\b/.test(body)
  );
}

function markPriceQualificationPending(database, leadId, outboxId) {
  const existing = database
    .prepare("select * from lead_conversation_state where lead_id = ?")
    .get(leadId);
  database
    .prepare(
      `update lead_conversation_state
       set whatsapp_state = ?, handoff_reason = ?, auto_replies_since_human = ?, last_outbox_id = ?, updated_at = ?
       where lead_id = ?`,
    )
    .run(
      "qualificacao_preco_pendente",
      "preco_pedido",
      (existing?.auto_replies_since_human ?? 0) + 1,
      outboxId,
      now(),
      leadId,
    );
}

function incrementAutoReplies(database, leadId, outboxId) {
  const existing = database
    .prepare("select * from lead_conversation_state where lead_id = ?")
    .get(leadId);
  database
    .prepare(
      `update lead_conversation_state
       set auto_replies_since_human = ?, last_outbox_id = ?, updated_at = ?
       where lead_id = ?`,
    )
    .run((existing?.auto_replies_since_human ?? 0) + 1, outboxId, now(), leadId);
}

function setWhatsAppHandoff(database, leadId, state, reason) {
  database
    .prepare(
      `update lead_conversation_state
       set whatsapp_state = ?, handoff_reason = ?, updated_at = ?
       where lead_id = ?`,
    )
    .run(state, reason, now(), leadId);
}

function setWhatsAppConversationState(database, lead, input) {
  const state = clean(input.state);
  if (!WHATSAPP_CONVERSATION_STATES.has(state)) {
    throw usageError(`Estado WhatsApp invalido: ${state}`);
  }

  upsertLeadConversationState(database, lead, {
    whatsappState: state,
    handoffReason: clean(input.reason) || null,
    resetAutoReplies: Boolean(input.resetAutoReplies),
  });
  audit(database, "lead", lead.id, "whatsapp-state-set", {
    whatsapp_state: state,
    handoff_reason: clean(input.reason) || null,
    reset_auto_replies: Boolean(input.resetAutoReplies),
  });
}

function markContacted(database, lead, date) {
  database
    .prepare("update leads set status = ?, contacted_at = ?, updated_at = ? where id = ?")
    .run("abordado", date, now(), lead.id);
  closePendingQueueItems(database, lead, "sent");
  audit(database, "lead", lead.id, "mark-contacted", { contacted_at: date });
}

function markResponse(database, lead, { message, occurredAt, status, responseStatus, rawFile }) {
  if (!VALID_STATUSES.has(status)) throw usageError(`Status invalido: ${status}`);
  database
    .prepare(
      "update leads set status = ?, response_status = ?, updated_at = ? where id = ?",
    )
    .run(status, responseStatus, now(), lead.id);
  database
    .prepare(
      `insert into interactions (
        lead_id, direction, channel, body, occurred_at, raw_file, classification, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(lead.id, "inbound", "whatsapp", message, occurredAt, rawFile, responseStatus, now());
  closePendingQueueItems(database, lead, "responded");
  audit(database, "lead", lead.id, "mark-response", { responseStatus, occurredAt });
}

function closePendingQueueItems(database, lead, status, options = {}) {
  const filters = ["lead_id = ?", "status = 'pending'"];
  const values = [lead.id];
  const queueDate = clean(options.queueDate);
  const cardStatus = clean(options.cardStatus);

  if (queueDate) {
    filters.push("queue_date = ?");
    values.push(queueDate);
  }
  if (cardStatus) {
    filters.push("card_status = ?");
    values.push(cardStatus);
  }
  if (options.placeholderOnly) {
    filters.push("coalesce(message, '') like 'Preparar envio manual para %'");
  }

  const result = database
    .prepare(`update outreach_queue set status = ? where ${filters.join(" and ")}`)
    .run(status, ...values);
  if (result.changes > 0) {
    audit(database, "queue", lead.id, "close-pending", {
      lead: lead.canonical_name,
      status,
      count: result.changes,
      filters: {
        queueDate,
        cardStatus,
        placeholderOnly: Boolean(options.placeholderOnly),
      },
    });
  }
  return result.changes;
}

function collectLeadUpdates(flags) {
  const allowed = {
    status: "status",
    "response-status": "response_status",
    "recommended-offer": "recommended_offer",
    "demo-path": "demo_path",
    "analysis-status": "analysis_status",
    "handoff-status": "handoff_status",
    instagram: "instagram",
    notes: "notes",
  };

  const updates = {};
  for (const [flag, column] of Object.entries(allowed)) {
    if (!Object.hasOwn(flags, flag)) continue;
    const value = clean(flags[flag]);
    if (!value) continue;
    if (column === "status" && !VALID_STATUSES.has(value)) {
      throw usageError(`Status invalido: ${value}`);
    }
    updates[column] = value;
  }
  return updates;
}

function updateLeadFields(database, lead, updates) {
  const next = { ...updates };
  if (Object.hasOwn(next, "recommended_offer")) {
    const rawRecommendedOffer = next.recommended_offer;
    next.recommended_offer = normalizeRecommendedOffer(rawRecommendedOffer);
    if (isLegacyEssentialOffer(rawRecommendedOffer)) {
      next.notes = mergeNotes(next.notes, "Oferta legada mapeada para Presença Local em 72h");
    }
  }
  if (Object.hasOwn(next, "instagram")) {
    next.instagram_normalized = normalizeInstagram(next.instagram);
  }
  if (Object.hasOwn(next, "notes")) {
    next.notes = mergeNotes(lead.notes, next.notes);
  }

  const columns = Object.keys(next);
  const assignments = columns.map((column) => `${column} = ?`).join(", ");
  const values = columns.map((column) => next[column]);
  database
    .prepare(`update leads set ${assignments}, updated_at = ? where id = ?`)
    .run(...values, now(), lead.id);

  audit(database, "lead", lead.id, "update", {
    fields: columns,
    previous: Object.fromEntries(columns.map((column) => [column, lead[column] ?? ""])),
    current: next,
  });
}

function formatLeadStatus(database, lead) {
  const safeLead = normalizeLeadForOutput(lead);
  const latest = database
    .prepare(
      `select body, occurred_at from interactions
       where lead_id = ? and direction = 'inbound'
       order by occurred_at desc, id desc
       limit 1`,
    )
    .get(lead.id);

  return [
    `Lead: ${safeLead.canonical_name}`,
    `Status: ${safeLead.status}`,
    `Oferta recomendada: ${safeLead.recommended_offer || "-"}`,
    `Contato: ${safeLead.phone_or_contact || safeLead.instagram || "-"}`,
    `Contacted at: ${safeLead.contacted_at || "-"}`,
    `Response status: ${safeLead.response_status || "-"}`,
    `Ultima resposta: ${latest?.body || "-"}`,
  ].join("\n");
}

function generateQueue(database, queueDate) {
  const leads = database
    .prepare(
      `select * from leads
       where status in ('novo', 'interessado')
       order by case status when 'interessado' then 0 else 1 end, canonical_name`,
    )
    .all();

  const insert = database.prepare(
    `insert or ignore into outreach_queue (
       lead_id, queue_date, status, message, action_type, card_status, qa_status,
       card_status_updated_at, created_at
     )
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const lead of leads) {
    insert.run(
      lead.id,
      queueDate,
      "pending",
      `Preparar envio manual para ${lead.canonical_name}`,
      inferQueueActionType(lead),
      "pending_message",
      null,
      null,
      now(),
    );
  }

  normalizeQueueCardMetadata(database);
  audit(database, "queue", null, "generate", { queueDate, count: leads.length });
  return leads.length;
}

function setQueueMessage(database, lead, { queueDate, message }) {
  const trimmedMessage = clean(message);
  if (!trimmedMessage) throw usageError("Mensagem vazia");
  const actionType = inferQueueActionType(lead);
  const cardStatus = defaultCardStatusForMessage(lead, actionType);
  const statusUpdatedAt = cardStatus === "approved" ? now() : null;

  database
    .prepare(
      `insert into outreach_queue (
         lead_id, queue_date, status, message, action_type, card_status, qa_status,
         card_status_updated_at, created_at
       )
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(lead_id, queue_date) do update set
         status = excluded.status,
         message = excluded.message,
         action_type = excluded.action_type,
         card_status = excluded.card_status,
         qa_status = excluded.qa_status,
         card_status_updated_at = excluded.card_status_updated_at`,
    )
    .run(
      lead.id,
      queueDate,
      "pending",
      trimmedMessage,
      actionType,
      cardStatus,
      null,
      statusUpdatedAt,
      now(),
    );

  audit(database, "queue", lead.id, "set-message", {
    queueDate,
    lead: lead.canonical_name,
    actionType,
    cardStatus,
  });
}

function approveQueueCard(database, lead, { queueDate, qaStatus }) {
  const normalizedQaStatus = clean(qaStatus);
  if (!QA_APPROVED_STATUSES.has(normalizedQaStatus)) {
    throw usageError(`Status de QA invalido para liberar lead-cards: ${qaStatus}`);
  }

  const row = database
    .prepare(
      `select * from outreach_queue
       where lead_id = ? and queue_date = ? and status = 'pending'
       limit 1`,
    )
    .get(lead.id, queueDate);
  if (!row) throw usageError(`Fila pendente nao encontrada para ${lead.canonical_name}`);
  if (!clean(row.message) || clean(row.message).startsWith("Preparar envio manual para ")) {
    throw usageError(`Mensagem pronta obrigatoria antes de liberar ${lead.canonical_name}`);
  }

  database
    .prepare(
      `update outreach_queue
       set card_status = 'approved', qa_status = ?, card_status_updated_at = ?
       where id = ?`,
    )
    .run(normalizedQaStatus, now(), row.id);
  closeNewerPlaceholderQueueItems(database, lead, row.queue_date);

  audit(database, "queue", lead.id, "approve-card", {
    queueDate,
    lead: lead.canonical_name,
    qaStatus: normalizedQaStatus,
  });
}

function closeNewerPlaceholderQueueItems(database, lead, approvedQueueDate) {
  const result = database
    .prepare(
      `update outreach_queue
       set status = 'superseded_placeholder'
       where lead_id = ?
         and status = 'pending'
         and queue_date > ?
         and card_status = 'pending_message'
         and coalesce(message, '') like 'Preparar envio manual para %'`,
    )
    .run(lead.id, approvedQueueDate);

  if (result.changes > 0) {
    audit(database, "queue", lead.id, "close-pending", {
      lead: lead.canonical_name,
      status: "superseded_placeholder",
      count: result.changes,
      filters: {
        afterQueueDate: approvedQueueDate,
        cardStatus: "pending_message",
        placeholderOnly: true,
      },
    });
  }
}

function approveQueueCardsFromQaReport(database, { file, queueDate }) {
  const report = readQaReport(file);
  const effectiveQueueDate = queueDate ?? report.queueDate ?? latestQueueDate(database) ?? today();
  let count = 0;
  database.exec("BEGIN");
  try {
    for (const review of report.reviews) {
      const lead = requireUniqueLead(database, review.name);
      const queueRow = database
        .prepare("select * from outreach_queue where lead_id = ? and queue_date = ? limit 1")
        .get(lead.id, effectiveQueueDate);
      recordMessageReview(database, {
        lead,
        queueRow,
        queueDate: effectiveQueueDate,
        sourceFile: file,
        review,
      });
      if (!queueRow || queueRow.status !== "pending") continue;
      if (!QA_APPROVED_STATUSES.has(review.qaStatus)) continue;
      approveQueueCard(database, lead, {
        queueDate: effectiveQueueDate,
        qaStatus: review.qaStatus,
      });
      count += 1;
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return { count, queueDate: effectiveQueueDate };
}

function readQaReport(file) {
  const raw = readFileSync(file, "utf8");
  if (extname(file).toLowerCase() === ".json") {
    return readStructuredQaReport(raw);
  }

  return { reviews: readMarkdownQaReviews(raw), queueDate: null };
}

function readStructuredQaReport(raw) {
  let report;
  try {
    report = JSON.parse(raw);
  } catch (error) {
    throw usageError(`JSON de QA invalido: ${error.message}`);
  }

  if (report.schema_version !== 1) {
    throw usageError("schema_version do QA estruturado deve ser 1");
  }
  if (!Array.isArray(report.reviews) || report.reviews.length === 0) {
    throw usageError("QA estruturado precisa de reviews nao vazio");
  }

  return {
    queueDate: clean(report.queue_date),
    reviews: report.reviews.map((item) =>
      normalizeQaReview({
        name: item.lead_name ?? item.name,
        qaStatus: item.status_qa ?? item.qa_status,
        problem: item.problema ?? item.problem,
        excerpt: item.trecho ?? item.excerpt,
        recommendedAdjustment: item.ajuste_recomendado ?? item.recommended_adjustment,
        decision: item.decisao ?? item.decision,
        source: report.source,
        reviewedAt: report.review_date,
      }),
    ),
  };
}

function readMarkdownQaReviews(raw) {
  const approvals = [];
  const seen = new Set();
  let currentName = null;
  let currentReview = null;

  for (const line of raw.split(/\r?\n/)) {
    const heading = line.match(/^###\s+(.+?)\s*$/);
    if (heading) {
      if (currentReview) approvals.push(normalizeQaReview(currentReview));
      currentName = clean(heading[1]);
      currentReview = { name: currentName };
      continue;
    }

    if (!currentName || !currentReview) continue;

    const field = line.match(/^-\s*([^:]+):\s*(.*?)\s*$/);
    if (!field) continue;

    const key = normalizeQaFieldKey(field[1]);
    const value = field[2];
    if (key === "status_qa") currentReview.qaStatus = value;
    if (key === "problema") currentReview.problem = value;
    if (key === "trecho") currentReview.excerpt = value;
    if (key === "ajuste_recomendado") currentReview.recommendedAdjustment = value;
    if (key === "decisao") currentReview.decision = value;
  }
  if (currentReview) approvals.push(normalizeQaReview(currentReview));

  return approvals.filter((review) => {
    const key = `${normalizeName(review.name)}:${review.qaStatus}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeQaFieldKey(value) {
  return stripAccents(clean(value))
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeQaReview(review) {
  const name = clean(review.name);
  const qaStatus = clean(review.qaStatus);
  if (!name) throw usageError("QA sem lead_name");
  if (!QA_STATUSES.has(qaStatus)) {
    throw usageError(`Status de QA invalido: ${review.qaStatus}`);
  }
  return {
    name,
    qaStatus,
    problem: clean(review.problem),
    excerpt: clean(review.excerpt),
    recommendedAdjustment: clean(review.recommendedAdjustment),
    decision: clean(review.decision),
    source: clean(review.source),
    reviewedAt: clean(review.reviewedAt) || now(),
  };
}

function recordMessageReview(database, { lead, queueRow, queueDate, sourceFile, review }) {
  database
    .prepare(
      `insert into message_reviews (
        lead_id, queue_id, queue_date, lead_name, qa_status, problem, excerpt,
        recommended_adjustment, decision, source, source_file, reviewed_at, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      lead.id,
      queueRow?.id ?? null,
      queueDate,
      lead.canonical_name,
      review.qaStatus,
      review.problem,
      review.excerpt,
      review.recommendedAdjustment,
      review.decision,
      review.source,
      sourceFile,
      review.reviewedAt,
      now(),
    );
}

function inferQueueActionType(lead) {
  if (lead.status === "tem_demo") return "demo_followup";
  if (lead.status === "respondeu") return "reply";
  if (["abordado", "interessado"].includes(lead.status)) return "followup";
  return "first_touch";
}

function defaultCardStatusForMessage(lead, actionType) {
  if (actionType === "first_touch" && lead.status === "novo") return "pending_qa";
  return "approved";
}

function exportAll(database, root) {
  mkdirSync(join(root, ".scratch/leads"), { recursive: true });
  mkdirSync(join(root, ".scratch/crm"), { recursive: true });
  mkdirSync(join(root, ".scratch/ops"), { recursive: true });
  exportMasterLeads(database, root);
  exportPipeline(database, root);
  const queueDate = latestQueueDate(database) ?? today();
  exportTodayQueue(database, root, queueDate);
  exportPaperclipLeadCards(database, root, queueDate);
  exportOperatorStatus(database, root, queueDate);
  exportCommercialSurfaces(database, root, queueDate);
  exportFollowups(database, root);
  exportHistory(database, root);
}

function exportMasterLeads(database, root) {
  const headers = [
    "canonical_name",
    "slug",
    "business",
    "category",
    "city",
    "area",
    "phone_or_contact",
    "instagram",
    "website_url",
    "website_status",
    "source_urls",
    "first_seen",
    "last_seen",
    "run_id",
    "status",
    "contacted_at",
    "response_status",
    "recommended_offer",
    "demo_path",
    "analysis_status",
    "handoff_status",
    "notes",
  ];
  const leads = database.prepare("select * from leads order by canonical_name").all();
  const rows = [headers.join(",")];
  for (const rawLead of leads) {
    const lead = normalizeLeadForOutput(rawLead);
    rows.push(headers.map((header) => csvCell(lead[header] ?? "")).join(","));
  }
  writeFileSync(join(root, ".scratch/leads/master-leads.csv"), `${rows.join("\n")}\n`);
}

function exportCommercialEnrichmentPlan(database, root, { planDate, limit, excludeRunIds = [] }) {
  const allRows = database
    .prepare(
      `select *
       from commercial_lead_context
       where status not in ('fechado', 'perdido', 'descartado', 'duplicado')
       order by canonical_name`,
    )
    .all();
  const excludedLeadIds = leadIdsWithProfileRunIds(database, excludeRunIds);
  const rows = allRows.filter((row) => !excludedLeadIds.has(row.lead_id));
  const candidates = rows
    .map((row) => commercialEnrichmentItem(row))
    .filter(Boolean)
    .sort(compareCommercialEnrichmentItems);
  const items = candidates.slice(0, limit);
  const plan = {
    schema_version: 1,
    plan_date: planDate,
    generated_at: now(),
    exclude_run_ids: excludeRunIds,
    summary: {
      total_open_leads: allRows.length,
      excluded_by_run_id: allRows.length - rows.length,
      enrichment_candidates: candidates.length,
      selected_leads: items.length,
      pending_validation: items.filter((item) => item.priority_bucket === "p0_pending_validation").length,
      missing_instagram: items.filter((item) => item.reasons.includes("no_instagram")).length,
      ready_card_enrichment: items.filter((item) => item.priority_bucket === "p2_ready_card_enrichment").length,
      followup_enrichment: items.filter((item) => item.priority_bucket === "p3_followup_enrichment").length,
    },
    items,
  };
  writeCommercialEnrichmentPlan(root, plan);
  return plan;
}

function leadIdsWithProfileRunIds(database, runIds) {
  const normalized = runIds.map((runId) => clean(runId)).filter(Boolean);
  if (!normalized.length) return new Set();
  const placeholders = normalized.map(() => "?").join(", ");
  const rows = database
    .prepare(`select distinct lead_id from lead_platform_profiles where run_id in (${placeholders})`)
    .all(...normalized);
  return new Set(rows.map((row) => row.lead_id));
}

function commercialEnrichmentItem(row) {
  const reasons = commercialEnrichmentReasons(row);
  if (!reasons.length) return null;
  const priorityBucket = commercialEnrichmentPriority(row, reasons);
  const nextAction = commercialEnrichmentNextAction(row, reasons);
  return {
    lead_id: row.lead_id ?? row.id,
    lead_name: row.canonical_name,
    status: row.status,
    commercial_stage: row.commercial_stage,
    priority_bucket: priorityBucket,
    next_action: nextAction,
    recommended_owner: commercialEnrichmentOwner(nextAction),
    reasons,
    city: clean(row.city),
    area: clean(row.area),
    category: clean(row.category),
    phone_or_contact: clean(row.phone_or_contact),
    instagram: clean(row.instagram),
    website_url: clean(row.website_url),
    bio_gate_status: clean(row.bio_gate_status),
    validation_blocker: clean(row.validation_blocker),
    browser_evidence_status: clean(row.browser_evidence_status),
    instagram_session_status: clean(row.instagram_session_status),
    evidence_confidence: clean(row.evidence_confidence),
    current_handoff_status: clean(row.handoff_status),
    current_analysis_status: clean(row.analysis_status),
  };
}

function commercialEnrichmentReasons(row) {
  const reasons = [];
  if (clean(row.validation_blocker)) reasons.push(clean(row.validation_blocker));
  if (!clean(row.instagram)) reasons.push("no_instagram");
  if (clean(row.instagram) && !row.has_profile_evidence) reasons.push("bio_evidence_missing");
  if (clean(row.instagram) && row.has_profile_evidence && !row.has_analyzed_bio) reasons.push("bio_not_navigated");
  if (clean(row.instagram) && row.has_profile_evidence && !row.has_commercial_hook) {
    reasons.push("commercial_hook_missing");
  }
  if (!clean(row.phone_or_contact) && !clean(row.contact_path)) reasons.push("contact_path_weak");
  if (row.commercial_stage === "ready_lead_card" && !clean(row.contact_path)) {
    reasons.push("ready_card_contact_enrichment");
  }
  return [...new Set(reasons)];
}

function commercialEnrichmentPriority(row, reasons) {
  if (clean(row.validation_blocker)) return "p0_pending_validation";
  if (reasons.includes("no_instagram")) return "p1_missing_instagram";
  if (row.commercial_stage === "ready_lead_card") return "p2_ready_card_enrichment";
  if (row.commercial_stage === "followup") return "p3_followup_enrichment";
  return "p2_profile_enrichment";
}

function commercialEnrichmentNextAction(row, reasons) {
  if (reasons.includes("no_instagram")) return "discover_or_confirm_instagram";
  if (
    reasons.includes("bio_evidence_missing") ||
    reasons.includes("bio_not_navigated") ||
    reasons.includes("browser_evidence_not_ok") ||
    reasons.includes("instagram_session_not_ready") ||
    reasons.includes("bio_status_not_ok") ||
    reasons.includes("bio_link_pending") ||
    reasons.includes("commercial_hook_missing")
  ) {
    return "capture_bio_evidence";
  }
  if (reasons.includes("contact_missing") || reasons.includes("contact_path_weak")) return "confirm_contact_path";
  if (row.commercial_stage === "ready_lead_card") return "refresh_ready_card_context";
  if (row.commercial_stage === "followup") return "refresh_followup_context";
  return "enrich_commercial_context";
}

function commercialEnrichmentOwner(nextAction) {
  if (["capture_bio_evidence", "discover_or_confirm_instagram", "confirm_contact_path"].includes(nextAction)) {
    return "Scout - Lead Searcher GV";
  }
  if (nextAction === "refresh_followup_context") return "Polina - Follow-up CRM";
  return "Gilmor - Validador de Dados de Leads";
}

function compareCommercialEnrichmentItems(left, right) {
  const priority = {
    p0_pending_validation: 0,
    p1_missing_instagram: 1,
    p2_profile_enrichment: 2,
    p2_ready_card_enrichment: 3,
    p3_followup_enrichment: 4,
  };
  return (
    (priority[left.priority_bucket] ?? 99) - (priority[right.priority_bucket] ?? 99) ||
    left.lead_name.localeCompare(right.lead_name, "pt-BR")
  );
}

function writeCommercialEnrichmentPlan(root, plan) {
  const dir = join(root, `.scratch/crm/enrichment-backfill-${plan.plan_date}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "enrichment-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  writeFileSync(join(dir, "enrichment-plan.md"), formatCommercialEnrichmentPlanMarkdown(plan));
}

function formatCommercialEnrichmentPlanMarkdown(plan) {
  const chunks = [
    `# Plano de enriquecimento da base - ${plan.plan_date}`,
    "",
    "Escopo: enriquecer leads existentes sem alterar status automaticamente.",
    "Fonte oficial: SQLite comercial. Este arquivo e espelho privado para coordenar Scout, Validador e COO.",
    "",
    "## Resumo",
    "",
    `- Leads abertos analisados: ${plan.summary.total_open_leads}`,
    `- Candidatos a enriquecimento: ${plan.summary.enrichment_candidates}`,
    `- Leads selecionados: ${plan.summary.selected_leads}`,
    `- Pendentes de validacao: ${plan.summary.pending_validation}`,
    `- Sem Instagram: ${plan.summary.missing_instagram}`,
    "",
    "## Fila priorizada",
    "",
  ];

  if (!plan.items.length) {
    chunks.push("Nenhum lead precisa de enriquecimento agora.");
  } else {
    plan.items.forEach((item, index) => {
      chunks.push(`### ${index + 1}. ${item.lead_name}`);
      chunks.push("");
      chunks.push(`- Bucket: ${item.priority_bucket}`);
      chunks.push(`- Acao: ${item.next_action}`);
      chunks.push(`- Dono recomendado: ${item.recommended_owner}`);
      chunks.push(`- Status atual: ${item.status}`);
      chunks.push(`- Estagio comercial: ${item.commercial_stage}`);
      chunks.push(`- Motivos: ${item.reasons.join(", ")}`);
      chunks.push(`- Instagram: ${item.instagram || "-"}`);
      chunks.push(`- Contato atual: ${item.phone_or_contact || "-"}`);
      chunks.push("");
    });
  }

  return `${chunks.join("\n").trim()}\n`;
}

function exportCommercialDuplicateAudit(database, root, { auditDate }) {
  const leads = database
    .prepare(
      `select id, canonical_name, slug, category, city, area, phone_or_contact,
              phone_normalized, instagram, instagram_normalized, website_url,
              website_normalized, status, analysis_status, handoff_status
       from leads
       where status not in ('fechado', 'perdido', 'descartado', 'duplicado')
       order by canonical_name`,
    )
    .all();
  const exactGroups = duplicateExactGroups(leads);
  const fuzzyGroups = duplicateFuzzyGroups(leads);
  const groups = [...exactGroups, ...fuzzyGroups].sort(compareDuplicateGroups);
  const audit = {
    schema_version: 1,
    audit_date: auditDate,
    generated_at: now(),
    summary: {
      total_open_leads: leads.length,
      total_groups: groups.length,
      exact_duplicate_groups: exactGroups.length,
      fuzzy_candidate_groups: fuzzyGroups.length,
    },
    groups,
  };
  writeCommercialDuplicateAudit(root, audit);
  return audit;
}

function duplicateExactGroups(leads) {
  return [
    ...duplicateGroupsByField(leads, "phone_normalized", "phone_normalized"),
    ...duplicateGroupsByField(leads, "instagram_normalized", "instagram_normalized"),
    ...duplicateGroupsByField(leads, "website_normalized", "website_normalized"),
  ];
}

function duplicateGroupsByField(leads, field, matchType) {
  const groups = new Map();
  for (const lead of leads) {
    const value = clean(lead[field]);
    if (!value) continue;
    const current = groups.get(value) ?? [];
    current.push(lead);
    groups.set(value, current);
  }
  return [...groups.entries()]
    .filter(([, groupLeads]) => groupLeads.length > 1)
    .map(([matchValue, groupLeads]) => ({
      group_id: `${matchType}:${matchValue}`,
      match_type: matchType,
      match_value: matchValue,
      confidence: "alta",
      merge_policy: "safe_merge_candidate",
      reason: `Mesmo ${matchType}; revisar e consolidar pelo identificador forte.`,
      leads: duplicateLeadSummaries(groupLeads),
    }));
}

function duplicateFuzzyGroups(leads) {
  const groups = new Map();
  for (const lead of leads) {
    const tokens = significantLeadNameTokens(lead.canonical_name);
    if (tokens.length < 2) continue;
    const key = `${normalizeName(lead.city)}:${tokens.join(" ")}`;
    const current = groups.get(key) ?? [];
    current.push(lead);
    groups.set(key, current);
  }

  return [...groups.entries()]
    .map(([, groupLeads]) => groupLeads)
    .filter((groupLeads) => groupLeads.length > 1)
    .filter((groupLeads) => !hasSharedStrongIdentifier(groupLeads))
    .map((groupLeads) => ({
      group_id: `fuzzy_name_city:${normalizeName(groupLeads[0].city)}:${significantLeadNameTokens(groupLeads[0].canonical_name).join("-")}`,
      match_type: "fuzzy_name_city",
      match_value: `${normalizeName(groupLeads[0].city)}:${significantLeadNameTokens(groupLeads[0].canonical_name).join(" ")}`,
      confidence: "media",
      merge_policy: "manual_review_only",
      reason: "Nome essencial parecido na mesma cidade; nao consolidar sem revisao humana.",
      leads: duplicateLeadSummaries(groupLeads),
    }));
}

function significantLeadNameTokens(value) {
  const genericTokens = new Set([
    "studio",
    "estudio",
    "clinica",
    "espaco",
    "pilates",
    "fisioterapia",
    "fisio",
    "estetica",
    "beleza",
    "saude",
    "vitoria",
    "serra",
    "cariacica",
    "vila",
    "velha",
    "es",
    "ltda",
    "me",
    "unidade",
    "centro",
    "funcional",
    "avancada",
  ]);
  return [
    ...new Set(
      normalizeName(value)
        .split(" ")
        .filter((token) => token.length >= 3)
        .filter((token) => !genericTokens.has(token))
        .sort(),
    ),
  ];
}

function hasSharedStrongIdentifier(groupLeads) {
  return ["phone_normalized", "instagram_normalized", "website_normalized"].some((field) => {
    const values = groupLeads.map((lead) => clean(lead[field])).filter(Boolean);
    return values.length > 1 && new Set(values).size === 1;
  });
}

function duplicateLeadSummaries(groupLeads) {
  return [...groupLeads]
    .sort((left, right) => left.canonical_name.localeCompare(right.canonical_name, "pt-BR"))
    .map((lead) => ({
      lead_id: lead.id,
      lead_name: lead.canonical_name,
      status: lead.status,
      city: clean(lead.city),
      area: clean(lead.area),
      category: clean(lead.category),
      phone_or_contact: clean(lead.phone_or_contact),
      instagram: clean(lead.instagram),
      website_url: clean(lead.website_url),
      analysis_status: clean(lead.analysis_status),
      handoff_status: clean(lead.handoff_status),
    }));
}

function compareDuplicateGroups(left, right) {
  const priority = {
    phone_normalized: 0,
    instagram_normalized: 1,
    website_normalized: 2,
    fuzzy_name_city: 3,
  };
  return (
    (priority[left.match_type] ?? 99) - (priority[right.match_type] ?? 99) ||
    left.match_value.localeCompare(right.match_value, "pt-BR")
  );
}

function writeCommercialDuplicateAudit(root, audit) {
  const dir = join(root, `.scratch/crm/enrichment-backfill-${audit.audit_date}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "duplicate-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);
  writeFileSync(join(dir, "duplicate-audit.md"), formatCommercialDuplicateAuditMarkdown(audit));
}

function formatCommercialDuplicateAuditMarkdown(audit) {
  const chunks = [
    `# Auditoria de duplicidade - ${audit.audit_date}`,
    "",
    "Escopo: apontar candidatos de consolidacao sem alterar leads automaticamente.",
    "Merge forte ainda exige revisao operacional; nome parecido sozinho e sempre manual_review_only.",
    "",
    "## Resumo",
    "",
    `- Leads abertos analisados: ${audit.summary.total_open_leads}`,
    `- Grupos encontrados: ${audit.summary.total_groups}`,
    `- Grupos com identificador forte: ${audit.summary.exact_duplicate_groups}`,
    `- Grupos fuzzy: ${audit.summary.fuzzy_candidate_groups}`,
    "",
    "## Grupos",
    "",
  ];

  if (!audit.groups.length) {
    chunks.push("Nenhum candidato de duplicidade encontrado.");
  } else {
    audit.groups.forEach((group, index) => {
      chunks.push(`### ${index + 1}. ${group.match_type}: ${group.match_value}`);
      chunks.push("");
      chunks.push(`- Confiança: ${group.confidence}`);
      chunks.push(`- Politica: ${group.merge_policy}`);
      chunks.push(`- Motivo: ${group.reason}`);
      chunks.push("- Leads:");
      for (const lead of group.leads) {
        chunks.push(`  - ${lead.lead_id}: ${lead.lead_name} (${lead.status})`);
      }
      chunks.push("");
    });
  }

  return `${chunks.join("\n").trim()}\n`;
}

function exportPipeline(database, root) {
  const leads = database.prepare("select * from leads order by canonical_name").all();
  const chunks = ["# Pipeline CRM", ""];
  for (const rawLead of leads) {
    const lead = normalizeLeadForOutput(rawLead);
    chunks.push(`## ${lead.canonical_name}`);
    chunks.push("");
    chunks.push(`- Status: ${lead.status}`);
    chunks.push(`- Prioridade: ${lead.status === "interessado" ? "alta" : "normal"}`);
    chunks.push(`- Oferta recomendada: ${lead.recommended_offer || "-"}`);
    chunks.push(`- Nicho: ${lead.category || "-"}`);
    chunks.push(`- Local: ${[lead.area, lead.city].filter(Boolean).join(", ") || "-"}`);
    chunks.push(`- WhatsApp/contato: ${lead.phone_or_contact || lead.instagram || "-"}`);
    chunks.push(`- Origem/rodada: ${lead.run_id || "-"}`);
    chunks.push("- Responsavel atual: Follow-up CRM");
    chunks.push(`- Ultima acao: ${lead.response_status || lead.status}`);
    chunks.push(`- Ultima acao em: ${lead.updated_at || "-"}`);
    chunks.push("- Proxima acao: revisar fila manual");
    chunks.push("- Proxima acao em: -");
    chunks.push(`- Arquivos relacionados: ${lead.demo_path || "-"}`);
    chunks.push(`- Observacoes: ${lead.notes || "-"}`);
    chunks.push("");
  }
  writeFileSync(join(root, ".scratch/crm/pipeline.md"), `${chunks.join("\n").trim()}\n`);
}

function exportTodayQueue(database, root, queueDate) {
  mkdirSync(join(root, ".scratch/crm"), { recursive: true });
  const rows = manualReadyLeadCardRows(database, "c.canonical_name");

  const chunks = [
    `# Hoje enviar - ${queueDate}`,
    "",
    "Superficie: acao_manual_hoje",
    "Somente mensagens prontas e aprovadas para envio manual hoje.",
    "",
  ];
  if (!rows.length) {
    chunks.push("Nenhum envio manual pendente.");
  } else {
    for (const rawRow of rows) {
      const row = normalizeLeadForOutput(rawRow);
      chunks.push(`## ${row.canonical_name}`);
      chunks.push(`- Status: ${row.status}`);
      chunks.push(`- Oferta recomendada: ${row.recommended_offer || "-"}`);
      chunks.push(`- Contato: ${row.phone_or_contact || row.instagram || "-"}`);
      chunks.push(`- Acao: ${row.message}`);
      chunks.push("");
    }
  }
  writeFileSync(join(root, ".scratch/crm/hoje-enviar.md"), `${chunks.join("\n").trim()}\n`);
}

function exportPaperclipLeadCards(database, root, queueDate) {
  mkdirSync(join(root, ".scratch/crm"), { recursive: true });
  const rows = manualReadyLeadCardRows(
    database,
    "case c.status when 'interessado' then 0 when 'respondeu' then 1 else 2 end, c.canonical_name",
  );

  const chunks = [
    `# Leads para copiar e enviar - ${queueDate}`,
    "",
    "Superficie: acao_manual_hoje",
    "Somente mensagens prontas e aprovadas para envio manual hoje.",
    "Nao inclui CRM historico, handoffs, QA reports, rascunhos ou pendencias sem mensagem pronta.",
    "",
    "Uso: abrir este documento no Paperclip, copiar a mensagem e enviar manualmente. Nenhum agente envia WhatsApp.",
    "",
  ];

  if (!rows.length) {
    chunks.push("Nenhum envio manual pendente.");
  } else {
    rows.forEach((rawRow, index) => {
      const row = normalizeLeadForOutput(rawRow);
      chunks.push(`## ${index + 1}. ${row.canonical_name}`);
      chunks.push("");
      chunks.push(`- Status: ${row.status}`);
      chunks.push(`- Oferta recomendada: ${row.recommended_offer || "-"}`);
      chunks.push(`- Nicho: ${row.category || "-"}`);
      chunks.push(`- Local: ${[row.area, row.city].filter(Boolean).join(", ") || "-"}`);
      chunks.push(`- Telefone/contato: ${row.phone_or_contact || "-"}`);
      chunks.push(`- Instagram: ${formatMarkdownLink(row.instagram)}`);
      chunks.push(`- Site: ${formatMarkdownLink(row.website_url)}`);
      if (row.qa_status) {
        chunks.push(`- QA status: ${row.qa_status}`);
      }
      if (row.qa_status === "aprovado_com_observacao") {
        chunks.push(
          "- Observacao de QA: use somente a mensagem aprovada; nao acrescente auditoria de Google, ranking, pesquisa ampla ou decisor identificado.",
        );
      }
      chunks.push(`- Proximo comando: \`${nextQueueCommand(row)}\``);
      chunks.push("");
      chunks.push("Mensagem pronta:");
      chunks.push("");
      chunks.push("```text");
      chunks.push(formatReadyMessage(row));
      chunks.push("```");
      chunks.push("");
      chunks.push("---");
      chunks.push("");
    });
  }

  writeFileSync(
    join(root, ".scratch/crm/paperclip-lead-cards.md"),
    `${chunks.join("\n").trim()}\n`,
  );
}

function manualReadyLeadCardRows(database, orderBy) {
  const rows = database
    .prepare(
      `select c.*, s.whatsapp_state
       from commercial_ready_lead_cards c
       left join lead_conversation_state s on s.lead_id = c.lead_id
       where c.has_ready_message = 1
       order by ${orderBy}`,
    )
    .all();
  return rows.filter((row) => shouldKeepManualLeadCard(database, row));
}

function shouldKeepManualLeadCard(database, lead) {
  if (isManualWhatsAppException(lead)) return true;
  return !leadHasActiveSafeOutbox(database, lead.lead_id);
}

function isManualWhatsAppException(lead) {
  return [
    "preco_pedido",
    "lead_quente",
    "objecao_comercial",
    "handoff_luiz",
    "bloqueado_guardiao",
    "qualificacao_preco_pendente",
  ].includes(clean(lead?.whatsapp_state));
}

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

function formatReadyMessage(row) {
  const message = clean(row.message);
  if (message && !message.startsWith("Preparar envio manual para ")) return message;
  return [
    `Mensagem ainda nao esta pronta no CRM para ${row.canonical_name}.`,
    `Peca no FRE-7: preparar mensagem para ${row.canonical_name}.`,
  ].join("\n");
}

function nextQueueCommand(row) {
  const leadName = row.canonical_name;
  if (["respondeu", "interessado", "tem_demo"].includes(row.status)) {
    return `followup enviado ${leadName}`;
  }
  return `enviado ${leadName}`;
}

function formatMarkdownLink(value) {
  const cleanValue = clean(value);
  if (!cleanValue) return "-";
  if (/^https?:\/\//i.test(cleanValue)) return `[${cleanValue}](${cleanValue})`;
  if (cleanValue.startsWith("@")) {
    const handle = cleanValue.slice(1);
    return `[${cleanValue}](https://www.instagram.com/${handle}/)`;
  }
  return cleanValue;
}

function exportOperatorStatus(database, root, queueDate) {
  mkdirSync(join(root, ".scratch/ops"), { recursive: true });
  const manualActions = manualReadyLeadCardRows(database, "c.canonical_name").length;
  const awaitingQa = countRows(
    database,
    `select count(*) as count
     from outreach_queue q
     where q.queue_date = ?
       and q.status = 'pending'
       and q.card_status = 'pending_qa'
       and q.message is not null
       and trim(q.message) != ''
       and q.message not like 'Preparar envio manual para %'`,
    [queueDate],
  );
  const missingMessages = countRows(
    database,
    `select count(*) as count
     from outreach_queue q
     where q.queue_date = ?
       and q.status = 'pending'
       and (
         q.card_status = 'pending_message'
         or q.message is null
         or trim(q.message) = ''
         or q.message like 'Preparar envio manual para %'
       )`,
    [queueDate],
  );
  const waitingResponse = countRows(database, "select count(*) as count from leads where status = 'abordado'");
  const receivedResponses = countRows(database, "select count(*) as count from leads where status = 'respondeu'");
  const interested = countRows(database, "select count(*) as count from leads where status = 'interessado'");
  const demosReady = countRows(database, "select count(*) as count from leads where status = 'tem_demo'");
  const nextStep = nextOperatorStep({
    manualActions,
    awaitingQa,
    missingMessages,
    receivedResponses,
    interested,
    demosReady,
  });

  const chunks = [
    `# Status operacional - ${queueDate}`,
    "",
    "Superficie: status_executivo",
    "Uso: orientar prioridade, gargalos e proximo dono. Nao copiar mensagem por este documento.",
    "",
    "## Placar",
    "",
    `- Acoes manuais em lead-cards: ${manualActions}`,
    `- Aguardando QA de Mensagens: ${awaitingQa}`,
    `- Mensagens sem texto pronto: ${missingMessages}`,
    `- Leads aguardando resposta: ${waitingResponse}`,
    `- Respostas recebidas para triagem: ${receivedResponses}`,
    `- Leads interessados: ${interested}`,
    `- Demos prontas para follow-up: ${demosReady}`,
    "",
    "## Onde agir",
    "",
    "- Enviar agora: Documento lead-cards no FRE-7.",
    "- Status e gargalos: este documento.",
    "- Historico e auditoria: SQLite e espelhos privados em .scratch/.",
    "- Handoffs: issues filhas do Paperclip, nao lead-cards.",
    "",
    `## Próximo melhor passo: ${nextStep}`,
  ];

  writeFileSync(
    join(root, ".scratch/ops/paperclip-operator-status.md"),
    `${chunks.join("\n").trim()}\n`,
  );
}

function exportCommercialSurfaces(database, root, queueDate) {
  const report = commercialStatusReport(database, queueDate);
  exportCommercialStatus(root, report);
  exportCommercialFunnel(database, root, queueDate, report);
  return report;
}

function commercialStatusReport(database, queueDate) {
  const whatsappDelivery = whatsappDeliveryReport(database);
  const report = {
    queueDate,
    pendingValidation: countRows(database, "select count(*) as count from commercial_pending_validation"),
    readyForWriter: countRows(database, "select count(*) as count from commercial_ready_for_writer"),
    pendingQa: countRows(
      database,
      "select count(*) as count from commercial_pending_qa where queue_date = ?",
      [queueDate],
    ),
    readyLeadCards: manualReadyLeadCardRows(database, "c.canonical_name").length,
    followupsToday: countRows(database, "select count(*) as count from commercial_followups_today"),
    staleLeads: countRows(database, "select count(*) as count from commercial_stale_leads"),
    openHandoffs: countRows(
      database,
      "select count(*) as count from worker_handoffs where status not in ('completed', 'cancelled')",
    ),
    whatsappApproved: whatsappDelivery.approved,
    whatsappDeliveryPending: whatsappDelivery.deliveryPending,
    whatsappDispatchAmbiguous: whatsappDelivery.dispatchAmbiguous,
    whatsappSentStrongAck: whatsappDelivery.sentStrongAck,
  };
  report.nextStep = nextCommercialStep(report);
  return report;
}

function whatsappDeliveryReport(database) {
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

function formatCommercialStatus(report) {
  return [
    `SQLite comercial - ${report.queueDate}`,
    `Pendentes de validacao: ${report.pendingValidation}`,
    `Prontos para Redator: ${report.readyForWriter}`,
    `Aguardando QA de Mensagens: ${report.pendingQa}`,
    `Lead-cards prontos: ${report.readyLeadCards}`,
    `Follow-ups ativos: ${report.followupsToday}`,
    `WAHA aprovadas para envio: ${report.whatsappApproved}`,
    `WAHA pendentes de ACK: ${report.whatsappDeliveryPending}`,
    `WAHA ambiguas/handoff: ${report.whatsappDispatchAmbiguous}`,
    `WAHA entregues com ACK forte: ${report.whatsappSentStrongAck}`,
    `Leads parados: ${report.staleLeads}`,
    `Handoffs abertos: ${report.openHandoffs}`,
    `Proximo melhor passo: ${report.nextStep}`,
  ].join("\n");
}

function exportCommercialStatus(root, report) {
  mkdirSync(join(root, ".scratch/ops"), { recursive: true });
  const chunks = [
    `# SQLite comercial - ${report.queueDate}`,
    "",
    "Superficie: commercial_status",
    "Fonte oficial: views do SQLite em `.scratch/db/freela.sqlite`.",
    "",
    "## Placar",
    "",
    `- Pendentes de validacao: ${report.pendingValidation}`,
    `- Prontos para Redator: ${report.readyForWriter}`,
    `- Aguardando QA de Mensagens: ${report.pendingQa}`,
    `- Lead-cards prontos: ${report.readyLeadCards}`,
    `- Follow-ups ativos: ${report.followupsToday}`,
    `- WAHA aprovadas para envio: ${report.whatsappApproved}`,
    `- WAHA pendentes de ACK: ${report.whatsappDeliveryPending}`,
    `- WAHA ambiguas/handoff: ${report.whatsappDispatchAmbiguous}`,
    `- WAHA entregues com ACK forte: ${report.whatsappSentStrongAck}`,
    `- Leads parados: ${report.staleLeads}`,
    `- Handoffs abertos: ${report.openHandoffs}`,
    "",
    `## Proximo melhor passo: ${report.nextStep}`,
  ];

  writeFileSync(join(root, ".scratch/ops/commercial-status.md"), `${chunks.join("\n").trim()}\n`);
}

function exportCommercialFunnel(database, root, queueDate, report) {
  mkdirSync(join(root, ".scratch/crm"), { recursive: true });
  const sections = [
    {
      title: "Pendentes de validacao",
      rows: database
        .prepare("select * from commercial_pending_validation order by canonical_name")
        .all(),
    },
    {
      title: "Prontos para Redator",
      rows: database.prepare("select * from commercial_ready_for_writer order by canonical_name").all(),
    },
    {
      title: "Aguardando QA de Mensagens",
      rows: database
        .prepare("select * from commercial_pending_qa where queue_date = ? order by canonical_name")
        .all(queueDate),
    },
    {
      title: "Lead-cards prontos",
      rows: manualReadyLeadCardRows(database, "c.canonical_name"),
    },
    {
      title: "Follow-ups ativos",
      rows: database.prepare("select * from commercial_followups_today order by updated_at, canonical_name").all(),
    },
    {
      title: "Leads parados",
      rows: database.prepare("select * from commercial_stale_leads order by updated_at, canonical_name").all(),
    },
  ];

  const chunks = [
    `# Funil comercial SQLite - ${queueDate}`,
    "",
    "Espelho privado gerado. Fonte oficial: SQLite `.scratch/db/freela.sqlite`.",
    "",
    "## Placar",
    "",
    `- Pendentes de validacao: ${report.pendingValidation}`,
    `- Prontos para Redator: ${report.readyForWriter}`,
    `- Aguardando QA de Mensagens: ${report.pendingQa}`,
    `- Lead-cards prontos: ${report.readyLeadCards}`,
    `- Follow-ups ativos: ${report.followupsToday}`,
    `- WAHA aprovadas para envio: ${report.whatsappApproved}`,
    `- WAHA pendentes de ACK: ${report.whatsappDeliveryPending}`,
    `- WAHA ambiguas/handoff: ${report.whatsappDispatchAmbiguous}`,
    `- WAHA entregues com ACK forte: ${report.whatsappSentStrongAck}`,
    `- Leads parados: ${report.staleLeads}`,
    `- Handoffs abertos: ${report.openHandoffs}`,
    "",
  ];

  for (const section of sections) {
    chunks.push(`## ${section.title}`);
    chunks.push("");
    if (!section.rows.length) {
      chunks.push("- Nenhum item.");
      chunks.push("");
      continue;
    }

    for (const row of section.rows) {
      chunks.push(`### ${row.canonical_name}`);
      chunks.push(`- Stage: ${row.commercial_stage}`);
      chunks.push(`- Status: ${row.status}`);
      chunks.push(`- Bloqueio de validacao: ${row.validation_blocker || "-"}`);
      chunks.push(`- Nicho: ${row.category || "-"}`);
      chunks.push(`- Local: ${[row.area, row.city].filter(Boolean).join(", ") || "-"}`);
      chunks.push(`- Contato: ${row.phone_or_contact || row.contact_path || row.instagram || "-"}`);
      chunks.push(`- Instagram: ${formatMarkdownLink(row.instagram)}`);
      chunks.push(`- Bio status: ${row.bio_status || "-"}`);
      chunks.push(`- Gancho comercial: ${row.commercial_hook || "-"}`);
      chunks.push(`- Queue date: ${row.queue_date || "-"}`);
      chunks.push(`- Card status: ${row.card_status || "-"}`);
      chunks.push(`- QA status: ${row.qa_status || "-"}`);
      chunks.push(`- Mensagem: ${row.message || "-"}`);
      chunks.push("");
    }
  }

  writeFileSync(join(root, ".scratch/crm/commercial-funnel.md"), `${chunks.join("\n").trim()}\n`);
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

function countRows(database, sql, params = []) {
  return database.prepare(sql).get(...params).count;
}

function nextOperatorStep({
  manualActions,
  awaitingQa,
  missingMessages,
  receivedResponses,
  interested,
  demosReady,
}) {
  if (manualActions > 0) return "abrir `lead-cards` no FRE-7 e enviar as mensagens aprovadas.";
  if (receivedResponses > 0) return "acionar Intake ou Follow-up CRM para triar respostas recebidas.";
  if (interested > 0) return "acionar Atendimento e Fechamento para avançar leads interessados.";
  if (demosReady > 0) return "acionar Follow-up CRM para enviar ou cobrar demos aprovadas.";
  if (awaitingQa > 0) return "acionar QA de Mensagens antes de liberar lead-cards.";
  if (missingMessages > 0) return "acionar Redator de Primeira Mensagem para preparar mensagens pendentes.";
  return "rodar nova prospeccao ou revisar gargalos com o COO.";
}

function exportFollowups(database, root) {
  const leads = database
    .prepare(
      `select * from leads
       where status in ('abordado', 'respondeu', 'interessado')
       order by updated_at, canonical_name`,
    )
    .all();
  const chunks = ["# Follow-ups do dia", ""];
  if (!leads.length) chunks.push("Nenhum follow-up pendente calculado.");
  for (const lead of leads) {
    chunks.push(`- ${lead.canonical_name}: status ${lead.status}; ultima acao ${lead.updated_at}`);
  }
  writeFileSync(join(root, ".scratch/crm/followups-do-dia.md"), `${chunks.join("\n").trim()}\n`);
}

function exportHistory(database, root) {
  const rows = database
    .prepare(
      `select i.*, l.canonical_name
       from interactions i
       join leads l on l.id = i.lead_id
       order by i.occurred_at, i.id`,
    )
    .all();
  const chunks = ["# Historico de atendimento", ""];
  if (!rows.length) chunks.push("Nenhuma interacao registrada.");
  for (const row of rows) {
    chunks.push(`## ${row.canonical_name}`);
    chunks.push(`- Quando: ${row.occurred_at}`);
    chunks.push(`- Direcao: ${row.direction}`);
    chunks.push(`- Canal: ${row.channel}`);
    chunks.push(`- Classificacao: ${row.classification || "-"}`);
    chunks.push(`- Mensagem: ${row.body}`);
    chunks.push("");
  }
  writeFileSync(
    join(root, ".scratch/crm/historico-atendimento.md"),
    `${chunks.join("\n").trim()}\n`,
  );
}

function exportProfileEvidence(database, root, evidenceDate) {
  const targetDir = join(root, ".scratch/prospeccao-vitoria", evidenceDate);
  mkdirSync(targetDir, { recursive: true });
  const rows = database
    .prepare(
      `select p.*, l.canonical_name, l.category, l.city, l.area
       from lead_platform_profiles p
       join leads l on l.id = p.lead_id
       where substr(p.observed_at, 1, 10) = ?
       order by l.canonical_name, p.platform`,
    )
    .all(evidenceDate);

  const chunks = [
    `# Profile Evidence - ${evidenceDate}`,
    "",
    "Espelho privado sob demanda. Fonte oficial: SQLite `.scratch/db/freela.sqlite`.",
    "",
  ];

  if (!rows.length) {
    chunks.push("Nenhuma evidencia de perfil encontrada para a data.");
  }

  for (const profile of rows) {
    const links = database
      .prepare(
        `select *
         from lead_platform_links
         where platform_profile_id = ?
         order by position, id`,
      )
      .all(profile.id);

    chunks.push(`## ${profile.canonical_name}`);
    chunks.push("");
    chunks.push(`- Plataforma: ${profile.platform}`);
    chunks.push(`- Perfil: ${profile.profile_url || "-"}`);
    chunks.push(`- Handle: ${profile.handle || "-"}`);
    chunks.push(`- Nicho: ${profile.category || "-"}`);
    chunks.push(`- Local: ${[profile.area, profile.city].filter(Boolean).join(", ") || "-"}`);
    chunks.push(`- Bio status: ${profile.bio_status}`);
    chunks.push(`- Bio: ${profile.bio_text || "-"}`);
    chunks.push(`- Bio link: ${profile.bio_link_url || "-"}`);
    chunks.push(`- Tipo do link: ${profile.bio_link_type || "-"}`);
    chunks.push(`- Status do link: ${profile.bio_link_status || "-"}`);
    chunks.push(`- Resumo da pagina do link: ${profile.link_page_summary || "-"}`);
    chunks.push(`- Servicos vistos: ${profile.services_seen || "-"}`);
    chunks.push(`- Localizacao vista: ${profile.location_seen || "-"}`);
    chunks.push(`- Sinal dono-operador: ${profile.owner_operator_signal || "-"}`);
    chunks.push(`- Caminho de contato: ${profile.contact_path || "-"}`);
    chunks.push(`- WhatsApp visivel: ${profile.whatsapp_visible || "incerto"}`);
    chunks.push(`- Posicionamento: ${profile.positioning_signal || "-"}`);
    chunks.push(`- Atritos: ${profile.friction_points || "-"}`);
    chunks.push(`- Gancho comercial: ${profile.commercial_hook || "-"}`);
    chunks.push(`- Confianca: ${profile.evidence_confidence || "-"}`);
    chunks.push(`- Evidencia navegador: ${profile.browser_evidence_status || "-"}`);
    chunks.push(`- Metodo navegador: ${profile.browser_evidence_method || "-"}`);
    chunks.push(`- Sessao Instagram: ${profile.instagram_session_status || "-"}`);
    chunks.push(`- Observado em: ${profile.observed_at}`);
    chunks.push(`- Run ID: ${profile.run_id || "-"}`);
    chunks.push(`- Notas: ${profile.notes || "-"}`);
    chunks.push("");
    chunks.push("### Links analisados");
    if (!links.length) {
      chunks.push("");
      chunks.push("- Nenhum link registrado.");
    } else {
      chunks.push("");
      for (const link of links) {
        const contactMarker = link.is_contact_path ? "contato" : "apoio";
        chunks.push(
          `- ${link.label || link.url} (${link.link_type || "web"}, ${contactMarker}): ${link.summary || "-"} - ${link.url}`,
        );
      }
    }
    chunks.push("");
  }

  writeFileSync(join(targetDir, "profile-evidence.md"), `${chunks.join("\n").trim()}\n`);
}

function latestQueueDate(database) {
  return database
    .prepare("select queue_date from outreach_queue order by queue_date desc limit 1")
    .get()?.queue_date;
}

function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeRecommendedOffer(value) {
  const offer = clean(value);
  if (!offer) return "";
  if (isLegacyEssentialOffer(offer)) return "Presença Local em 72h";
  return offer;
}

function normalizeLeadForOutput(lead) {
  const rawRecommendedOffer = lead?.recommended_offer;
  if (!isLegacyEssentialOffer(rawRecommendedOffer)) {
    return {
      ...lead,
      recommended_offer: normalizeRecommendedOffer(rawRecommendedOffer),
    };
  }

  return {
    ...lead,
    recommended_offer: normalizeRecommendedOffer(rawRecommendedOffer),
    notes: mergeNotes(lead?.notes, "Oferta legada mapeada para Presença Local em 72h"),
  };
}

function isLegacyEssentialOffer(value) {
  return /presen[cç]a local essencial/i.test(clean(value));
}

function preferFilled(primary, fallback) {
  return clean(primary) || clean(fallback) || "";
}

function mergeStatus(existing, incoming) {
  if (!incoming) return existing || "novo";
  if (!VALID_STATUSES.has(incoming)) throw usageError(`Status invalido: ${incoming}`);
  if (NON_REGRESSIVE_STATUSES.has(existing) && incoming === "novo") return existing;
  return incoming || existing || "novo";
}

function mergeListText(existing, incoming) {
  const items = new Set([...splitList(existing), ...splitList(incoming)].filter(Boolean));
  return [...items].join(" | ");
}

function mergeNotes(existing, incoming) {
  const oldNote = clean(existing);
  const newNote = clean(incoming);
  if (!oldNote) return newNote;
  if (!newNote || oldNote.includes(newNote)) return oldNote;
  return `${oldNote} | ${newNote}`;
}

function sourceUrlsFrom(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return splitList(clean(value));
}

function splitList(value) {
  return clean(value)
    .split(/\s*\|\s*|\s*,\s*/)
    .map(clean)
    .filter(Boolean);
}

function buildMergeKey(lead) {
  if (lead.phone_normalized) return `phone:${lead.phone_normalized}`;
  if (lead.instagram_normalized) return `instagram:${lead.instagram_normalized}`;
  if (lead.website_normalized) return `website:${lead.website_normalized}`;
  return `name:${lead.slug}:${normalizeName(lead.city)}`;
}

function classifyResponse(message) {
  const normalized = normalizeName(message);
  if (
    /\bpreco\b|\bvalor\b|\bquanto\b|\borcamento\b|\bcusto\b|\binvestimento\b|\bpagamento\b|\bdesconto\b|\bproposta\b/.test(
      normalized,
    )
  ) {
    return "resposta_pediu_preco";
  }
  if (/\bsem interesse\b|\bnao tenho interesse\b|\bnao quero\b/.test(normalized)) {
    return "resposta_sem_interesse";
  }
  if (
    /\bexemplo\b|\bmodelo\b|\blink\b|\bsite\b|\bdemo\b|\bdemonstracao\b|\bcomo ficaria\b|\bficaria visualmente\b|\bvisualmente\b|\bver na pratica\b/.test(
      normalized,
    )
  ) {
    return "resposta_pediu_exemplo";
  }
  if (
    !/\bnao\b/.test(normalized) &&
    /\bgostei\b|\bquero fazer\b|\bquero fechar\b|\bbora\b|\bfechar\b|\bcontratar\b|\bcontrato\b|\bcomecar\b|\bcomeçar\b|\bvamos fazer\b|\bvou querer\b/.test(
      normalized,
    )
  ) {
    return "resposta_lead_quente";
  }
  if (
    /\bcaro\b|\bachei caro\b|\bsem tempo\b|\bvou pensar\b|\bpensar um pouco\b|\bja tenho site\b|\btenho site\b|\bdepois\b|\bmais pra frente\b|\bmais para frente\b|\bnao agora\b|\bagora nao\b/.test(
      normalized,
    )
  ) {
    return "resposta_objecao";
  }
  if (/\bpode\b|\bclaro\b|\bsim\b/.test(normalized)) return "resposta_permissao";
  if (/\bnao\b|\bsem interesse\b/.test(normalized)) return "resposta_sem_interesse";
  return "resposta_recebida";
}

function normalizeName(value) {
  return stripAccents(clean(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slugify(value) {
  return normalizeName(value).replace(/\s+/g, "-");
}

function normalizePhone(value) {
  let digits = clean(value).replace(/\D+/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
}

function normalizeWhatsAppIdentity(value) {
  const normalized = clean(value).toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("@")) return normalized;
  return normalizePhone(normalized) || normalized;
}

function uniqueClean(values) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function normalizeInstagram(value) {
  return clean(value)
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
}

function normalizeWebsite(value) {
  return clean(value)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

function stripAccents(value) {
  return clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function inferSourceType(url) {
  const normalized = normalizeWebsite(url);
  if (normalized.includes("instagram.com")) return "instagram";
  if (normalized.includes("facebook.com")) return "facebook";
  if (normalized.includes("google.")) return "google";
  return "web";
}

function csvCell(value) {
  const text = clean(value);
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function now() {
  return new Date().toISOString();
}

await main();
