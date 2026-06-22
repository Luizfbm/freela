#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const DEFAULT_PAPERCLIP_API_BASE = "http://127.0.0.1:3100";
const DEFAULT_PAPERCLIP_COMPANY_ID = "50a2756c-2942-40c1-90f8-b16807a62ef3";
const DEFAULT_ATENDIMENTO_AGENT_ID = "db8a76a9-e503-4cdc-b8cb-f14cf757070a";
const DEFAULT_CLOSER_AGENT_ID = "4d334072-4966-4c9d-a16a-f3e48faf05d9";
const WHATSAPP_ATENDIMENTO_WAKE_TYPE = "atendimento_whatsapp";
const WHATSAPP_CLOSER_WAKE_TYPE = "whatsapp_closer";

function main() {
  const { root, command, flags } = parseArgs(process.argv.slice(2));
  loadLocalEnv(root);

  if (command === "import-jsonl") {
    const file = requireFlag(flags, "file");
    const lines = readFileSync(resolve(root, file), "utf8").split(/\r?\n/).filter(Boolean);
    const scratchDir = join(root, ".scratch");
    mkdirSync(scratchDir, { recursive: true });

    let imported = 0;
    for (const line of lines) {
      const event = JSON.parse(line);
      const messageId = sanitizeFilePart(event.bridge_message_id || `event-${imported + 1}`);
      const tempFile = join(scratchDir, `whatsapp-inbound-${messageId}.json`);
      writeFileSync(tempFile, JSON.stringify(event, null, 2));
      runCrm(root, ["whatsapp", "inbound", "ingest", "--file", tempFile]);
      imported += 1;
    }

    console.log(`Importados: ${imported}`);
    return;
  }

  if (command === "dispatch-approved-outbox") {
    const result = dispatchApprovedOutbox(root, flags);
    if (parseBooleanFlag(flags["dry-run"])) {
      console.log(`Dry-run dispatchaveis: ${result.dispatchable}`);
      for (const item of result.items) {
        console.log(`- ${item.lead_name}: outbox ${item.id}`);
      }
    } else {
      console.log(`Enviados: ${result.sent}`);
      console.log(`Pendentes: ${result.pending || 0}`);
      console.log(`Falhas: ${result.failed}`);
      console.log(`Ignorados: ${result.skipped}`);
    }
    return;
  }

  if (command === "import-waha-event") {
    const result = importWahaEvent(root, flags);
    printWahaEventResult(result, flags);
    return;
  }

  if (command === "serve-waha-webhook") {
    serveWahaWebhook(root, flags);
    return;
  }

  throw new Error(`Comando desconhecido: ${command}`);
}

function parseArgs(argv) {
  const args = [...argv];
  let root = process.cwd();
  if (args[0] === "--root") {
    args.shift();
    const value = args.shift();
    if (!value) throw new Error("Valor obrigatorio para --root");
    root = resolve(value);
  }

  const command = args.shift();
  const flags = {};
  while (args.length) {
    const key = args.shift();
    if (!key.startsWith("--")) throw new Error(`Opcao invalida: ${key}`);
    const value = args[0];
    if (value === undefined || value.startsWith("--")) {
      flags[key.slice(2)] = "true";
    } else {
      flags[key.slice(2)] = args.shift();
    }
  }

  return { root, command, flags };
}

function loadLocalEnv(root) {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] != null && process.env[key] !== "") continue;
    process.env[key] = parseEnvValue(rawValue);
  }
}

function parseEnvValue(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function requireFlag(flags, name) {
  if (!flags[name]) throw new Error(`--${name} obrigatorio`);
  return flags[name];
}

function runCrm(root, args) {
  const result = spawnSync(
    process.execPath,
    ["scripts/freela-crm.mjs", "--root", root, ...args],
    {
      cwd: new URL("..", import.meta.url).pathname,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join("\n"));
  }
  return result;
}

function ensureCrmInitialized(root, crmDbPath, explicitCrmDb) {
  const args = ["scripts/freela-crm.mjs", "--root", root];
  if (explicitCrmDb) args.push("--db", crmDbPath);
  args.push("init");
  const result = spawnSync(process.execPath, args, {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join("\n"));
  }
  return result;
}

function isUnknownLeadError(error) {
  return /Lead nao encontrado|Nenhum lead identificado/i.test(error.message);
}

function buildAutoWakeOptions(flags) {
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
    atendimentoAgentId:
      flags["atendimento-agent-id"] ||
      process.env.WHATSAPP_ATENDIMENTO_AGENT_ID ||
      DEFAULT_ATENDIMENTO_AGENT_ID,
    closerAgentId:
      flags["closer-agent-id"] ||
      process.env.WHATSAPP_CLOSER_AGENT_ID ||
      DEFAULT_CLOSER_AGENT_ID,
    timeoutMs: parsePositiveInt(flags["timeout-ms"] || "15000", "--timeout-ms"),
  };
}

function autoWakeForInbound(root, event, options) {
  const crmDbPath = resolve(root, ".scratch/db/freela.sqlite");
  if (!existsSync(crmDbPath)) {
    throw new Error(`CRM SQLite nao encontrado para auto-wake: ${crmDbPath}`);
  }
  const database = new DatabaseSync(crmDbPath);
  try {
    const inbound = database
      .prepare(
        `select
          e.*,
          l.canonical_name as lead_name,
          s.whatsapp_state
        from whatsapp_inbound_events e
        join leads l on l.id = e.lead_id
        left join lead_conversation_state s on s.lead_id = e.lead_id
        where e.bridge_message_id = ?
        order by e.id desc
        limit 1`,
      )
      .get(clean(event.bridge_message_id));

    const route = inbound ? whatsappWakeRouteForInbound(inbound, options) : null;
    if (!route) return 0;

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
      .get(inbound.id, route.targetAgentId, route.wakeType);

    if (["created", "creating"].includes(existing?.status)) return 0;

    const timestamp = new Date().toISOString();
    if (existing) {
      database
        .prepare("update whatsapp_worker_wakes set status = 'creating', updated_at = ? where id = ?")
        .run(timestamp, existing.id);
    } else {
      database
        .prepare(
          `insert into whatsapp_worker_wakes (
            inbound_event_id, lead_id, target_agent_id, wake_type, status, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          inbound.id,
          inbound.lead_id,
          route.targetAgentId,
          route.wakeType,
          "creating",
          timestamp,
          timestamp,
        );
    }

    try {
      const issue = createPaperclipIssue({
        apiBase: options.apiBase,
        companyId: options.companyId,
        apiKey: options.apiKey,
        runId: options.runId,
        timeoutMs: options.timeoutMs,
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
          new Date().toISOString(),
          inbound.id,
          route.targetAgentId,
          route.wakeType,
        );
      return 1;
    } catch (error) {
      database
        .prepare(
          `update whatsapp_worker_wakes
           set status = 'failed', updated_at = ?
           where inbound_event_id = ?
             and target_agent_id = ?
             and wake_type = ?`,
        )
        .run(new Date().toISOString(), inbound.id, route.targetAgentId, route.wakeType);
      throw error;
    }
  } finally {
    database.close();
  }
}

function whatsappWakeRouteForInbound(inbound, options) {
  const classification = clean(inbound.classification);
  const state = clean(inbound.whatsapp_state);

  if (state === "encerrado" || classification === "resposta_sem_interesse") return null;

  if (shouldWakeCloser(classification, state)) {
    return {
      targetAgentId: options.closerAgentId,
      wakeType: WHATSAPP_CLOSER_WAKE_TYPE,
      payload: buildCloserWakePayload(inbound, options.closerAgentId),
    };
  }

  if (["resposta_permissao", "resposta_pediu_exemplo", "resposta_recebida"].includes(classification)) {
    return {
      targetAgentId: options.atendimentoAgentId,
      wakeType: WHATSAPP_ATENDIMENTO_WAKE_TYPE,
      payload: buildAtendimentoWakePayload(inbound, options.atendimentoAgentId),
    };
  }

  return null;
}

function shouldWakeCloser(classification, state) {
  return (
    ["resposta_pediu_preco", "resposta_lead_quente", "resposta_objecao"].includes(classification) ||
    [
      "preco_pedido",
      "lead_quente",
      "objecao_comercial",
      "handoff_luiz",
      "qualificacao_preco_pendente",
      "bloqueado_guardiao",
    ].includes(state)
  );
}

function buildAtendimentoWakePayload(inbound, atendimentoAgentId) {
  return {
    title: `WhatsApp - ${inbound.lead_name}: ${labelForWhatsAppClassification(inbound.classification)}`,
    description: [
      "## ultimo inbound WhatsApp",
      "",
      `Lead: ${inbound.lead_name}`,
      `chat_id: ${inbound.chat_id}`,
      `classification: ${inbound.classification}`,
      `whatsapp_state: ${inbound.whatsapp_state || "nao_definido"}`,
      `inbound_event_id: ${inbound.id}`,
      "",
      "## Mensagem recebida",
      "",
      inbound.body,
      "",
      "## Trabalho",
      "",
      "- Escrever resposta candidata curta, contextual e humanizada na Outbox WhatsApp.",
      "- Usar contexto real do lead no CRM antes de propor a resposta.",
      "- Nao envie WhatsApp. Nao chame bridge.",
      "- Depois da proposta, o Guardiao de Envio WhatsApp deve revisar antes de qualquer dispatch.",
    ].join("\n"),
    assigneeAgentId: atendimentoAgentId,
    priority: "high",
    status: "todo",
  };
}

function buildCloserWakePayload(inbound, closerAgentId) {
  return {
    title: `WhatsApp - ${inbound.lead_name}: ${labelForCloserWake(inbound)}`,
    description: [
      "## Handoff WhatsApp para Jhon Snow",
      "",
      `Lead: ${inbound.lead_name}`,
      `chat_id: ${inbound.chat_id}`,
      `classification: ${inbound.classification}`,
      `whatsapp_state: ${inbound.whatsapp_state || "nao_definido"}`,
      `inbound_event_id: ${inbound.id}`,
      "",
      "## Mensagem recebida",
      "",
      inbound.body,
      "",
      "## Trabalho",
      "",
      "- Assumir como Atendimento e Fechamento quando houver preco, objeção, lead quente, bloqueio de guardiao ou handoff.",
      "- Preparar resposta comercial curta, contextual e segura; se precisar falar preco/proposta, manter criterio comercial.",
      "- Registrar a resposta ou proxima acao no CRM/Paperclip.",
      "- Nao envie WhatsApp. Nao chame bridge.",
    ].join("\n"),
    assigneeAgentId: closerAgentId,
    priority: "high",
    status: "todo",
  };
}

function labelForCloserWake(inbound) {
  if (inbound.classification === "resposta_pediu_preco" || inbound.whatsapp_state === "preco_pedido") {
    return "pedido de preco";
  }
  if (inbound.classification === "resposta_lead_quente" || inbound.whatsapp_state === "lead_quente") {
    return "lead quente";
  }
  if (inbound.classification === "resposta_objecao" || inbound.whatsapp_state === "objecao_comercial") {
    return "objecao comercial";
  }
  return "fechamento";
}

function labelForWhatsAppClassification(classification) {
  if (classification === "resposta_permissao") return "respondeu Pode";
  if (classification === "resposta_pediu_exemplo") return "pediu exemplo";
  return "nova resposta";
}

function createPaperclipIssue({ apiBase, companyId, apiKey, runId, timeoutMs, payload }) {
  if (!companyId) throw new Error("companyId obrigatorio para auto-wake Paperclip");
  const url = `${normalizePaperclipApiBase(apiBase)}/api/companies/${encodeURIComponent(companyId)}/issues`;
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Number(process.argv[5]));
        try {
          const headers = { "Content-Type": "application/json" };
          if (process.argv[3]) headers.Authorization = \`Bearer \${process.argv[3]}\`;
          if (process.argv[4]) headers["X-Paperclip-Run-Id"] = process.argv[4];
          const response = await fetch(process.argv[1], {
            method: "POST",
            headers,
            body: process.argv[2],
            signal: controller.signal
          });
          const text = await response.text();
          console.log(JSON.stringify({ ok: response.ok, status: response.status, text }));
        } catch (error) {
          console.error(error.message);
          process.exit(2);
        } finally {
          clearTimeout(timeout);
        }
      `,
      url,
      JSON.stringify(payload),
      clean(apiKey),
      clean(runId),
      String(timeoutMs),
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(`Falha no auto-wake Paperclip: ${[result.stdout, result.stderr].filter(Boolean).join("\n").trim()}`);
  }
  const response = JSON.parse(result.stdout);
  if (!response.ok) {
    throw new Error(`Falha no auto-wake Paperclip: HTTP ${response.status}\n${response.text}`);
  }
  return response.text ? JSON.parse(response.text) : {};
}

function normalizePaperclipApiBase(value) {
  const base = clean(value).replace(/\/+$/, "");
  if (!base) throw new Error("Paperclip API base vazia");
  return base.endsWith("/api") ? base.slice(0, -4) : base;
}

function dispatchApprovedOutbox(root, flags) {
  validateDispatchApprovedOutboxFlags(flags);
  const dryRun = parseBooleanFlag(flags["dry-run"]);
  const confirmBatch = parseBooleanFlag(flags["confirm-batch"]);
  const limit = parsePositiveInt(flags.limit || "10", "--limit");
  const outboxId = flags["outbox-id"] ? parsePositiveInt(flags["outbox-id"], "--outbox-id") : null;
  if (!outboxId && !dryRun && !confirmBatch) {
    throw new Error("--outbox-id ou --confirm-batch obrigatorio para dispatch real em lote");
  }
  const explicitCrmDb = flags["crm-db"] !== undefined;
  const crmDbPath = resolve(root, flags["crm-db"] || ".scratch/db/freela.sqlite");
  ensureCrmInitialized(root, crmDbPath, explicitCrmDb);
  if (!existsSync(crmDbPath)) {
    throw new Error(`CRM SQLite nao encontrado: ${crmDbPath}`);
  }
  const database = new DatabaseSync(crmDbPath);
  try {
    const items = readDispatchableOutbox(database, { limit, outboxId });
    if (dryRun) return { dispatchable: items.length, items, sent: 0, failed: 0, skipped: 0 };
    return dispatchOutboxItems(database, items, buildDispatchOptions(flags));
  } finally {
    database.close();
  }
}

function readDispatchableOutbox(database, { limit, outboxId = null }) {
  const whereId = outboxId ? "and o.id = ?" : "";
  const params = outboxId ? [outboxId, limit] : [limit];
  return database
    .prepare(
      `select
        o.*,
        l.canonical_name as lead_name,
        s.whatsapp_state
      from whatsapp_outbox o
      join leads l on l.id = o.lead_id
      join lead_conversation_state s on s.lead_id = o.lead_id
      where o.status in ('approved', 'failed')
        and o.guardian_decision = 'enviar'
        and o.humanizer_pass = 1
        and o.sent_at is null
        and o.attempts < 2
        ${whereId}
        and coalesce(s.whatsapp_state, '') not in ('handoff_luiz', 'bloqueado_guardiao', 'encerrado')
      order by o.approved_at asc, o.id asc
      limit ?`,
    )
    .all(...params);
}

function validateDispatchApprovedOutboxFlags(flags) {
  const allowed = new Set([
    "dry-run",
    "confirm-batch",
    "limit",
    "outbox-id",
    "crm-db",
    "provider",
    "bridge-api-base",
    "waha-api-base",
    "waha-session",
    "waha-api-key",
    "timeout-ms",
  ]);
  for (const flag of Object.keys(flags)) {
    if (!allowed.has(flag)) {
      throw new Error(`Opcao desconhecida para dispatch-approved-outbox: --${flag}`);
    }
  }
}

function buildDispatchOptions(flags) {
  const provider = clean(flags.provider || process.env.WHATSAPP_DISPATCH_PROVIDER || "bridge").toLowerCase();
  if (!["bridge", "waha"].includes(provider)) {
    throw new Error(`--provider invalido: ${provider}`);
  }
  const timeoutMs = parsePositiveInt(flags["timeout-ms"] || "15000", "--timeout-ms");
  if (provider === "waha") {
    const wahaApiBase =
      flags["waha-api-base"] ||
      process.env.WHATSAPP_WAHA_API_BASE ||
      "http://127.0.0.1:3000";
    const session = clean(flags["waha-session"] || process.env.WHATSAPP_WAHA_SESSION || "default");
    const apiKey = clean(flags["waha-api-key"] || process.env.WHATSAPP_WAHA_API_KEY || process.env.WAHA_API_KEY);
    if (!session) throw new Error("--waha-session obrigatorio");
    try {
      const base = new URL(wahaApiBase);
      return {
        provider,
        wahaApiBase: base.toString().replace(/\/$/, ""),
        session,
        apiKey,
        timeoutMs,
      };
    } catch {
      throw new Error(`--waha-api-base invalido: ${clean(wahaApiBase)}`);
    }
  }

  const bridgeApiBase =
    flags["bridge-api-base"] ||
    process.env.WHATSAPP_BRIDGE_API_BASE ||
    "http://127.0.0.1:8080";
  try {
    return {
      provider,
      sendUrl: new URL("/api/send", bridgeApiBase).toString(),
      timeoutMs,
    };
  } catch {
    throw new Error(`--bridge-api-base invalido: ${clean(bridgeApiBase)}`);
  }
}

function dispatchOutboxItems(database, items, dispatchOptions) {
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let pending = 0;
  for (const item of items) {
    const locked = lockOutboxForDispatch(database, item.id);
    if (!locked) {
      skipped += 1;
      continue;
    }
    if (isWhatsAppLidRecipient(item.target_chat_id)) {
      markOutboxUnsendableRecipient(
        database,
        item,
        "destinatario WhatsApp LID nao enviavel; vincule telefone real antes do dispatch",
      );
      failed += 1;
      continue;
    }
    const result =
      dispatchOptions.provider === "waha"
        ? sendWahaMessage({
            options: dispatchOptions,
            recipient: item.target_chat_id,
            message: item.body,
          })
        : sendBridgeMessage({
            sendUrl: dispatchOptions.sendUrl,
            recipient: item.target_chat_id,
            message: item.body,
            timeoutMs: dispatchOptions.timeoutMs,
          });
    if (result.success) {
      if (dispatchOptions.provider === "waha") {
        markWahaOutboxDelivered(database, item, {
          messageId: result.messageId,
          ack: result.ack,
          ackName: result.ackName,
        });
      } else {
        markOutboxSent(database, item, result.messageId);
      }
      sent += 1;
    } else if (result.pending) {
      markWahaOutboxDeliveryPending(database, item, result);
      pending += 1;
    } else if (result.ambiguous) {
      markOutboxAmbiguousFailure(database, item, result.error);
      failed += 1;
    } else {
      markOutboxFailed(database, item, result.error);
      failed += 1;
    }
  }
  return { sent, pending, failed, skipped, items };
}

function lockOutboxForDispatch(database, outboxId) {
  const result = database
    .prepare(
      `update whatsapp_outbox
       set status = 'sending', dispatch_locked_at = ?
       where id = ?
         and status in ('approved', 'failed')
         and guardian_decision = 'enviar'
         and humanizer_pass = 1
         and sent_at is null
         and attempts < 2
         and exists (
           select 1
           from lead_conversation_state s
           where s.lead_id = whatsapp_outbox.lead_id
             and coalesce(s.whatsapp_state, '') not in ('handoff_luiz', 'bloqueado_guardiao', 'encerrado')
         )`,
    )
    .run(new Date().toISOString(), outboxId);
  return result.changes === 1;
}

function isWhatsAppLidRecipient(value) {
  return clean(value).toLowerCase().endsWith("@lid");
}

function markOutboxUnsendableRecipient(database, item, error) {
  const failedAt = new Date().toISOString();
  const reason = clean(error);
  database
    .prepare(
      `update whatsapp_outbox
       set status = 'failed',
           attempts = 2,
           failed_at = ?,
           dispatch_error = ?,
           dispatch_locked_at = null
       where id = ?`,
    )
    .run(failedAt, reason.slice(0, 1000), item.id);
  database
    .prepare(
      `update lead_conversation_state
       set whatsapp_state = 'handoff_luiz', handoff_reason = ?, updated_at = ?
       where lead_id = ?`,
    )
    .run(reason.slice(0, 1000), failedAt, item.lead_id);
}

function sendBridgeMessage({ sendUrl, recipient, message, timeoutMs }) {
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Number(process.argv[4]));
        try {
          const response = await fetch(process.argv[1], {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipient: process.argv[2], message: process.argv[3] }),
            signal: controller.signal
          });
          const text = await response.text();
          console.log(JSON.stringify({ ok: response.ok, status: response.status, text }));
        } catch (error) {
          console.error(error.message);
          process.exit(2);
        } finally {
          clearTimeout(timeout);
        }
      `,
      sendUrl,
      recipient,
      message,
      String(timeoutMs),
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    return {
      success: false,
      ambiguous: true,
      error: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
    };
  }
  try {
    const response = JSON.parse(result.stdout);
    const parsed = JSON.parse(response.text);
    if (parsed.success === true && response.ok) {
      const messageId = extractConfirmedBridgeMessageId(parsed);
      if (messageId) return { success: true, messageId };
      return {
        success: false,
        ambiguous: true,
        error: "confirmacao ambigua do bridge: success=true sem id real de mensagem WhatsApp",
      };
    }
    if (parsed.success === false && response.ok) {
      return {
        success: false,
        ambiguous: false,
        error: parsed.message || "bridge retornou success=false",
      };
    }
    return {
      success: false,
      ambiguous: true,
      error: response.ok
        ? "confirmacao ambigua do bridge: success true ausente"
        : `confirmacao ambigua do bridge: HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      ambiguous: true,
      error: `confirmacao ambigua do bridge: ${error.message}`,
    };
  }
}

function extractConfirmedBridgeMessageId(parsed) {
  const candidate = clean(parsed.message_id || parsed.messageId || parsed.id || parsed.message);
  if (!candidate) return "";
  if (/^message sent to\b/i.test(candidate)) return "";
  if (!/^[A-Z0-9]{16,80}$/.test(candidate)) return "";
  return candidate;
}

function sendWahaMessage({ options, recipient, message }) {
  const chatTarget = wahaChatTargetFromRecipient(recipient);
  if (!chatTarget.phone && !chatTarget.chatId) {
    return {
      success: false,
      ambiguous: false,
      error: `destinatario WAHA invalido: ${clean(recipient)}`,
    };
  }

  const resolved = chatTarget.phone
    ? resolveWahaChatId(options, chatTarget.phone)
    : { success: true, chatId: chatTarget.chatId };
  if (!resolved.success) return resolved;

  for (const path of ["/api/sendSeen", "/api/startTyping", "/api/stopTyping"]) {
    const step = requestJsonSync({
      method: "POST",
      url: `${options.wahaApiBase}${path}`,
      apiKey: options.apiKey,
      timeoutMs: options.timeoutMs,
      body: {
        session: options.session,
        chatId: resolved.chatId,
      },
    });
    if (!step.ok) {
      return {
        success: false,
        ambiguous: true,
        error: `WAHA ${path} falhou: ${step.error || `HTTP ${step.status}`}`,
      };
    }
  }

  const sent = requestJsonSync({
    method: "POST",
    url: `${options.wahaApiBase}/api/sendText`,
    apiKey: options.apiKey,
    timeoutMs: options.timeoutMs,
    body: {
      session: options.session,
      chatId: resolved.chatId,
      text: message,
    },
  });
  if (!sent.ok) {
    return {
      success: false,
      ambiguous: true,
      error: `WAHA sendText falhou: ${sent.error || `HTTP ${sent.status}`}`,
    };
  }

  const messageId = extractWahaMessageId(sent.parsed);
  if (!messageId) {
    return {
      success: false,
      ambiguous: true,
      error: "confirmacao ambigua do WAHA: sendText sem id de mensagem",
    };
  }

  const ack = wahaAckFromPayload(sent.parsed);
  if (isStrongWahaAck(ack)) {
    return { success: true, messageId, ack: ack.ack, ackName: ack.ackName };
  }

  return {
    success: false,
    pending: true,
    messageId,
    ack: ack.ack,
    ackName: ack.ackName,
  };
}

function resolveWahaChatId(options, phone) {
  const query = new URLSearchParams({ phone, session: options.session });
  const checked = requestJsonSync({
    method: "GET",
    url: `${options.wahaApiBase}/api/contacts/check-exists?${query.toString()}`,
    apiKey: options.apiKey,
    timeoutMs: options.timeoutMs,
  });
  if (!checked.ok) {
    return {
      success: false,
      ambiguous: true,
      error: `WAHA check-exists falhou: ${checked.error || `HTTP ${checked.status}`}`,
    };
  }
  if (checked.parsed?.numberExists === false) {
    return {
      success: false,
      ambiguous: false,
      error: `numero nao existe no WhatsApp segundo WAHA: ${phone}`,
    };
  }
  const chatId = clean(checked.parsed?.chatId || `${phone}@c.us`);
  if (!chatId.endsWith("@c.us") && !isWhatsAppLidRecipient(chatId)) {
    return {
      success: false,
      ambiguous: true,
      error: `WAHA check-exists retornou chatId nao enviavel: ${chatId}`,
    };
  }
  return { success: true, chatId };
}

function wahaChatTargetFromRecipient(recipient) {
  const value = clean(recipient);
  if (!value || isWhatsAppLidRecipient(value)) return { phone: "", chatId: "" };
  if (value.endsWith("@c.us")) return { phone: "", chatId: value };
  const phone = wahaPhoneFromRecipient(value);
  return phone ? { phone, chatId: "" } : { phone: "", chatId: "" };
}

function wahaPhoneFromRecipient(value) {
  const jidPhone = phoneFromValue(value);
  if (jidPhone) return jidPhone;
  const digits = clean(value).replace(/\D+/g, "");
  if (digits.startsWith("55") && digits.length >= 12 && digits.length <= 13) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return "";
}

function requestJsonSync({ method, url, body, apiKey, timeoutMs }) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (apiKey) headers["X-Api-Key"] = apiKey;
  const result = spawnSync(
    process.execPath,
    [
      "-e",
      `
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Number(process.argv[5]));
        try {
          const body = process.argv[3] ? JSON.parse(process.argv[3]) : undefined;
          const response = await fetch(process.argv[2], {
            method: process.argv[1],
            headers: JSON.parse(process.argv[4]),
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal
          });
          const text = await response.text();
          console.log(JSON.stringify({ ok: response.ok, status: response.status, text }));
        } catch (error) {
          console.error(error.message);
          process.exit(2);
        } finally {
          clearTimeout(timeout);
        }
      `,
      method,
      url,
      body === undefined ? "" : JSON.stringify(body),
      JSON.stringify(headers),
      String(timeoutMs),
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    return {
      ok: false,
      status: 0,
      error: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
      parsed: null,
    };
  }
  try {
    const response = JSON.parse(result.stdout);
    let parsed = null;
    if (response.text) parsed = JSON.parse(response.text);
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? "" : clean(parsed?.message || response.text || `HTTP ${response.status}`),
      parsed,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: `resposta WAHA invalida: ${error.message}`,
      parsed: null,
    };
  }
}

function extractWahaMessageId(payload) {
  return firstWahaMessageId(
    payload?.id,
    payload?.messageId,
    payload?.message_id,
    payload?.key?.id,
    payload?._data?.id,
  );
}

function firstWahaMessageId(...candidates) {
  for (const candidate of candidates) {
    const messageId = wahaMessageIdValue(candidate);
    if (messageId) return messageId;
  }
  return "";
}

function wahaMessageIdValue(candidate) {
  if (!candidate) return "";
  if (typeof candidate === "string" || typeof candidate === "number") return clean(candidate);
  if (typeof candidate !== "object") return "";
  return clean(candidate._serialized || candidate.serialized || candidate.id || candidate.messageId || candidate.message_id);
}

function wahaAckFromPayload(payload) {
  const ackName = clean(payload?.ackName || payload?.ack?.ackName || payload?.payload?.ackName).toUpperCase();
  const rawAck = payload?.ack ?? payload?.payload?.ack;
  const ack = Number.isInteger(rawAck) ? rawAck : Number.parseInt(clean(rawAck || ""), 10);
  return {
    ack: Number.isFinite(ack) ? ack : null,
    ackName,
  };
}

function isStrongWahaAck(ack) {
  if (["DEVICE", "READ", "PLAYED"].includes(clean(ack.ackName).toUpperCase())) return true;
  return Number.isFinite(ack.ack) && ack.ack >= 2;
}

function markOutboxSent(database, item, bridgeMessageId) {
  const sentAt = new Date().toISOString();
  database
    .prepare(
      `update whatsapp_outbox
       set status = 'sent', bridge_message_id = ?, sent_at = ?, failed_at = null, dispatch_error = null
       where id = ?`,
    )
    .run(bridgeMessageId, sentAt, item.id);
  database
    .prepare(
      `insert into interactions (
        lead_id, direction, channel, body, occurred_at, raw_file, classification, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      item.lead_id,
      "outbound",
      "whatsapp",
      item.body,
      sentAt,
      `whatsapp_outbox:${item.id}`,
      "automatico_enviado",
      sentAt,
    );
  database
    .prepare(
      `update lead_conversation_state
       set last_outbox_id = ?, updated_at = ?
       where lead_id = ?`,
    )
    .run(item.id, sentAt, item.lead_id);
}

function markWahaOutboxDeliveryPending(database, item, result) {
  const checkedAt = new Date().toISOString();
  database
    .prepare(
      `update whatsapp_outbox
       set status = 'delivery_pending',
           dispatch_provider = 'waha',
           provider_message_id = ?,
           delivery_ack = ?,
           delivery_ack_name = ?,
           delivery_checked_at = ?,
           attempts = attempts + 1,
           failed_at = null,
           dispatch_error = null,
           dispatch_locked_at = null
       where id = ?`,
    )
    .run(
      clean(result.messageId),
      Number.isFinite(result.ack) ? result.ack : null,
      clean(result.ackName) || null,
      checkedAt,
      item.id,
    );
}

function markWahaOutboxDelivered(database, item, delivery) {
  const deliveredAt = new Date().toISOString();
  database
    .prepare(
      `update whatsapp_outbox
       set status = 'sent',
           dispatch_provider = 'waha',
           provider_message_id = ?,
           delivery_ack = ?,
           delivery_ack_name = ?,
           delivered_at = ?,
           delivery_checked_at = ?,
           sent_at = ?,
           failed_at = null,
           dispatch_error = null,
           dispatch_locked_at = null
       where id = ?`,
    )
    .run(
      clean(delivery.messageId),
      Number.isFinite(delivery.ack) ? delivery.ack : null,
      clean(delivery.ackName) || null,
      deliveredAt,
      deliveredAt,
      deliveredAt,
      item.id,
    );
  insertOutboundWhatsAppInteraction(database, item, deliveredAt);
  database
    .prepare(
      `update lead_conversation_state
       set last_outbox_id = ?, updated_at = ?
       where lead_id = ?`,
    )
    .run(item.id, deliveredAt, item.lead_id);
}

function insertOutboundWhatsAppInteraction(database, item, occurredAt) {
  database
    .prepare(
      `insert into interactions (
        lead_id, direction, channel, body, occurred_at, raw_file, classification, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      item.lead_id,
      "outbound",
      "whatsapp",
      item.body,
      occurredAt,
      `whatsapp_outbox:${item.id}`,
      "automatico_enviado",
      occurredAt,
    );
}

function markOutboxFailed(database, item, error) {
  const failedAt = new Date().toISOString();
  const reason = clean(error || "falha ao enviar pelo bridge");
  database
    .prepare(
      `update whatsapp_outbox
       set status = 'failed', attempts = attempts + 1, failed_at = ?, dispatch_error = ?
       where id = ?`,
    )
    .run(failedAt, reason.slice(0, 1000), item.id);
  const updated = database.prepare("select attempts from whatsapp_outbox where id = ?").get(item.id);
  if (updated?.attempts >= 2) {
    database
      .prepare(
        `update lead_conversation_state
         set whatsapp_state = 'handoff_luiz', handoff_reason = ?, updated_at = ?
         where lead_id = ?`,
      )
      .run(`falha no envio automatico WhatsApp: ${reason.slice(0, 300)}`, failedAt, item.lead_id);
  }
}

function markOutboxAmbiguousFailure(database, item, error) {
  const failedAt = new Date().toISOString();
  const reason = clean(error || "confirmacao ambigua do bridge");
  database
    .prepare(
      `update whatsapp_outbox
       set status = 'dispatch_ambiguous', attempts = attempts + 1, failed_at = ?, dispatch_error = ?
       where id = ?`,
    )
    .run(failedAt, reason.slice(0, 1000), item.id);
  database
    .prepare(
      `update lead_conversation_state
       set whatsapp_state = 'handoff_luiz', handoff_reason = ?, updated_at = ?
       where lead_id = ?`,
    )
    .run(`confirmacao ambigua do envio pelo bridge: ${reason}`.slice(0, 1000), failedAt, item.lead_id);
}

function importWahaEvent(root, flags) {
  validateImportWahaEventFlags(flags);
  const event = JSON.parse(readFileSync(resolve(root, requireFlag(flags, "file")), "utf8"));
  return processWahaEvent(root, flags, event);
}

function processWahaEvent(root, flags, event) {
  const explicitCrmDb = flags["crm-db"] !== undefined;
  const crmDbPath = resolve(root, flags["crm-db"] || ".scratch/db/freela.sqlite");
  ensureCrmInitialized(root, crmDbPath, explicitCrmDb);
  const database = new DatabaseSync(crmDbPath);
  try {
    if (event.event === "message.ack") {
      return { event: event.event, updated: applyWahaAckEvent(database, event) };
    }
    if (event.event === "message.waiting") {
      return { event: event.event, updated: applyWahaWaitingEvent(database, event) };
    }
  } finally {
    database.close();
  }

  const inbound = eventFromWahaMessage(event);
  if (!inbound) {
    return { event: clean(event.event), imported: 0, skipped: 1, unmatched: 0, autoWakes: 0, failed: 0 };
  }
  return {
    event: "message",
    ...importWahaInboundEvent(root, flags, inbound),
  };
}

function validateImportWahaEventFlags(flags) {
  const allowed = new Set([
    "file",
    "crm-db",
    "auto-wake",
    "paperclip-api-base",
    "paperclip-company-id",
    "paperclip-api-key",
    "paperclip-run-id",
    "atendimento-agent-id",
    "closer-agent-id",
    "timeout-ms",
  ]);
  for (const flag of Object.keys(flags)) {
    if (!allowed.has(flag)) {
      throw new Error(`Opcao desconhecida para import-waha-event: --${flag}`);
    }
  }
}

function importWahaInboundEvent(root, flags, event) {
  if (isRecordedWhatsAppInbound(root, event.bridge_message_id)) {
    return { imported: 0, skipped: 1, unmatched: 0, autoWakes: 0, failed: 0 };
  }

  const scratchDir = join(root, ".scratch");
  mkdirSync(scratchDir, { recursive: true });
  const tempFile = join(scratchDir, `whatsapp-inbound-${sanitizeFilePart(event.bridge_message_id)}.json`);
  writeFileSync(tempFile, JSON.stringify(event, null, 2));

  let autoWakes = 0;
  const autoWake = parseBooleanFlag(flags["auto-wake"]);
  try {
    const crmResult = runCrm(root, ["whatsapp", "inbound", "ingest", "--file", tempFile]);
    if (/WhatsApp inbound sem lead/i.test(crmResult.stdout)) {
      rmSync(tempFile, { force: true });
      return { imported: 0, skipped: 0, unmatched: 1, autoWakes: 0, failed: 0 };
    }
    if (autoWake) {
      autoWakes = autoWakeForInbound(root, event, buildAutoWakeOptions(flags));
    }
    return { imported: 1, skipped: 0, unmatched: 0, autoWakes, failed: 0 };
  } catch (error) {
    if (isUnknownLeadError(error)) {
      rmSync(tempFile, { force: true });
      return { imported: 0, skipped: 0, unmatched: 1, autoWakes: 0, failed: 0 };
    }
    writeFileSync(`${tempFile}.error.txt`, error.message);
    return { imported: 0, skipped: 0, unmatched: 0, autoWakes: 0, failed: 1 };
  }
}

function isRecordedWhatsAppInbound(root, bridgeMessageId) {
  const messageId = clean(bridgeMessageId);
  if (!messageId) return false;
  const dbPath = resolve(root, ".scratch/db/freela.sqlite");
  if (!existsSync(dbPath)) return false;
  const database = new DatabaseSync(dbPath);
  try {
    const inbound = database
      .prepare("select id from whatsapp_inbound_events where bridge_message_id = ? limit 1")
      .get(messageId);
    if (inbound) return true;
    const unmatched = database
      .prepare("select id from whatsapp_unmatched_inbound_events where bridge_message_id = ? limit 1")
      .get(messageId);
    return Boolean(unmatched);
  } finally {
    database.close();
  }
}

function eventFromWahaMessage(event) {
  if (!isWahaInboundMessageEvent(event)) return null;
  const payload = wahaPayload(event);
  const fromMe = Boolean(payload.fromMe || payload._data?.id?.fromMe);
  if (fromMe) return null;

  const chatId = clean(
    payload.from ||
      payload.chatId ||
      payload._data?.from ||
      payload._data?.id?.remote ||
      payload._data?.id?.participant,
  );
  if (!chatId || isIgnoredWahaChatId(chatId)) return null;

  const body = clean(payload.body || payload.text || payload.message?.body || payload._data?.body);
  if (!body) return null;

  const messageId = extractWahaEventMessageId(event);
  if (!messageId) return null;

  const senderPhone =
    phoneFromValue(payload.from) ||
    phoneFromValue(payload.chatId) ||
    phoneFromValue(payload._data?.from) ||
    phoneFromValue(payload.author);
  return {
    bridge_message_id: messageId,
    chat_id: chatId,
    sender_name:
      clean(payload.notifyName || payload.pushName || payload._data?.notifyName || payload.contact?.name) ||
      senderPhone ||
      chatId,
    sender_phone: senderPhone,
    is_group: false,
    message_type: normalizeWahaMessageType(payload.type || payload.message_type || payload._data?.type),
    body,
    received_at: wahaReceivedAt(payload),
    source: "waha/webhook",
  };
}

function isIgnoredWahaChatId(chatId) {
  const normalized = clean(chatId).toLowerCase();
  return normalized.endsWith("@g.us") || normalized === "status@broadcast" || normalized.endsWith("@broadcast");
}

function normalizeWahaMessageType(messageType) {
  const normalized = clean(messageType).toLowerCase();
  if (!normalized || normalized === "text" || normalized === "chat") return "text";
  return normalized;
}

function isWahaInboundMessageEvent(event) {
  const eventName = clean(event?.event || event?.type).toLowerCase();
  if (["message", "message.received", "message.any"].includes(eventName)) return true;
  const payload = wahaPayload(event);
  return Boolean(payload?.body && (payload.from || payload.chatId || payload._data?.from));
}

function wahaPayload(event) {
  return event?.payload && typeof event.payload === "object" ? event.payload : event;
}

function wahaReceivedAt(payload) {
  const raw = payload?.timestamp ?? payload?._data?.timestamp ?? payload?.t;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return new Date(raw > 1_000_000_000_000 ? raw : raw * 1000).toISOString();
  }
  if (/^\d+$/.test(clean(raw))) {
    const numeric = Number.parseInt(clean(raw), 10);
    return new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000).toISOString();
  }
  return clean(raw) || new Date().toISOString();
}

function printWahaEventResult(result, flags) {
  if (result.event === "message.ack") {
    console.log(`WAHA ack atualizado: ${result.updated}`);
    return;
  }
  if (result.event === "message.waiting") {
    console.log(`WAHA waiting atualizado: ${result.updated}`);
    return;
  }
  if (result.event === "message") {
    console.log(`Importados: ${result.imported}`);
    console.log(`Ignorados: ${result.skipped}`);
    console.log(`Sem identidade: ${result.unmatched}`);
    if (parseBooleanFlag(flags["auto-wake"])) {
      console.log(`Auto-wakes: ${result.autoWakes}`);
    }
    console.log(`Falhas: ${result.failed}`);
    return;
  }
  console.log(`WAHA evento ignorado: ${result.event || "desconhecido"}`);
}

function serveWahaWebhook(root, flags) {
  validateServeWahaWebhookFlags(flags);
  const host = clean(flags.host || process.env.WHATSAPP_WAHA_WEBHOOK_HOST || "127.0.0.1");
  const port = parsePositiveInt(flags.port || process.env.WHATSAPP_WAHA_WEBHOOK_PORT || "3105", "--port");
  const secret = clean(flags["webhook-secret"] || process.env.WHATSAPP_WAHA_WEBHOOK_SECRET || "");
  assertSafeWebhookHost(host, { hasSecret: Boolean(secret) });

  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.method !== "POST" || request.url !== "/waha/webhook") {
      response.statusCode = 404;
      response.end(JSON.stringify({ ok: false, error: "not_found" }));
      return;
    }
    if (secret && request.headers["x-webhook-secret"] !== secret) {
      response.statusCode = 401;
      response.end(JSON.stringify({ ok: false, error: "unauthorized" }));
      return;
    }

    try {
      const event = await readRequestJson(request);
      const result = processWahaEvent(root, flags, event);
      writeWahaWebhookAudit(root, event, result);
      logWahaWebhookResult(result);
      response.end(JSON.stringify({ ok: true, result }));
    } catch (error) {
      writeWahaWebhookAudit(root, null, null, error);
      console.error(`[waha-webhook] failed=1 error=${error.message}`);
      response.statusCode = 500;
      response.end(JSON.stringify({ ok: false, error: error.message }));
    }
  });

  server.listen(port, host, () => {
    const address = server.address();
    console.log(`Observando WAHA webhook em http://${host}:${address.port}/waha/webhook`);
  });
}

function assertSafeWebhookHost(host, { hasSecret }) {
  const value = clean(host).toLowerCase();
  if (value === "localhost" || value === "::1" || value === "[::1]" || /^127(?:\.\d{1,3}){3}$/.test(value)) {
    return;
  }
  if (hasSecret && (value === "0.0.0.0" || value === "::" || value === "[::]")) {
    return;
  }
  throw new Error(
    `--host deve usar loopback local (127.0.0.1, localhost ou ::1), ` +
      `ou webhook secret para bind Docker; recebido: ${host || "-"}`,
  );
}

function writeWahaWebhookAudit(root, event, result, error = null) {
  const auditDir = join(root, ".scratch/whatsapp");
  mkdirSync(auditDir, { recursive: true });
  const payload = wahaPayload(event);
  const entry = {
    created_at: new Date().toISOString(),
    event: clean(event?.event || event?.type || result?.event || "desconhecido"),
    messageId: event ? extractWahaEventMessageId(event) : "",
    chatId: clean(
      payload?.from ||
        payload?.chatId ||
        payload?._data?.from ||
        payload?._data?.id?.remote ||
        payload?._data?.id?.participant,
    ),
    fromMe: Boolean(payload?.fromMe || payload?._data?.id?.fromMe),
    result: result || {
      imported: 0,
      skipped: 0,
      unmatched: 0,
      autoWakes: 0,
      failed: 1,
    },
    error: error ? error.message : "",
    rawEvent: event,
  };
  appendFileSync(join(auditDir, "waha-webhook-events.jsonl"), `${JSON.stringify(entry)}\n`);
}

function logWahaWebhookResult(result) {
  const parts = [
    `event=${result.event || "desconhecido"}`,
    `imported=${result.imported ?? 0}`,
    `skipped=${result.skipped ?? 0}`,
    `unmatched=${result.unmatched ?? 0}`,
    `autoWakes=${result.autoWakes ?? 0}`,
    `failed=${result.failed ?? 0}`,
  ];
  console.log(`[waha-webhook] ${parts.join(" ")}`);
}

function validateServeWahaWebhookFlags(flags) {
  const allowed = new Set([
    "host",
    "port",
    "webhook-secret",
    "crm-db",
    "auto-wake",
    "paperclip-api-base",
    "paperclip-company-id",
    "paperclip-api-key",
    "paperclip-run-id",
    "atendimento-agent-id",
    "closer-agent-id",
    "timeout-ms",
  ]);
  for (const flag of Object.keys(flags)) {
    if (!allowed.has(flag)) {
      throw new Error(`Opcao desconhecida para serve-waha-webhook: --${flag}`);
    }
  }
}

function readRequestJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("payload grande demais"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error(`JSON invalido: ${error.message}`));
      }
    });
    request.on("error", reject);
  });
}

function applyWahaAckEvent(database, event) {
  const messageId = extractWahaEventMessageId(event);
  if (!messageId) return 0;
  const ack = wahaAckFromPayload(event.payload || event);
  const checkedAt = new Date().toISOString();
  const outbox = database
    .prepare(
      `select *
       from whatsapp_outbox
       where dispatch_provider = 'waha'
         and provider_message_id = ?
       order by id desc
       limit 1`,
    )
    .get(messageId);
  if (!outbox) return 0;
  if (!isStrongWahaAck(ack)) {
    database
      .prepare(
        `update whatsapp_outbox
         set delivery_ack = ?, delivery_ack_name = ?, delivery_checked_at = ?
         where id = ?`,
      )
      .run(Number.isFinite(ack.ack) ? ack.ack : null, clean(ack.ackName) || null, checkedAt, outbox.id);
    return 0;
  }
  if (outbox.status === "sent" && outbox.sent_at) {
    database
      .prepare(
        `update whatsapp_outbox
         set delivery_ack = ?, delivery_ack_name = ?, delivery_checked_at = ?
         where id = ?`,
      )
      .run(Number.isFinite(ack.ack) ? ack.ack : null, clean(ack.ackName) || null, checkedAt, outbox.id);
    return 0;
  }
  markWahaOutboxDelivered(database, outbox, {
    messageId,
    ack: ack.ack,
    ackName: ack.ackName,
  });
  return 1;
}

function applyWahaWaitingEvent(database, event) {
  const messageId = extractWahaEventMessageId(event);
  if (!messageId) return 0;
  const failedAt = new Date().toISOString();
  const reason = "WAHA message.waiting: Aguardando mensagem no destinatario";
  const outbox = database
    .prepare(
      `select *
       from whatsapp_outbox
       where dispatch_provider = 'waha'
         and provider_message_id = ?
       order by id desc
       limit 1`,
    )
    .get(messageId);
  if (!outbox) return 0;
  database
    .prepare(
      `update whatsapp_outbox
       set status = 'dispatch_ambiguous',
           failed_at = ?,
           dispatch_error = ?,
           delivery_checked_at = ?,
           dispatch_locked_at = null
       where id = ?`,
    )
    .run(failedAt, reason, failedAt, outbox.id);
  database
    .prepare(
      `update lead_conversation_state
       set whatsapp_state = 'handoff_luiz', handoff_reason = ?, updated_at = ?
       where lead_id = ?`,
    )
    .run(reason, failedAt, outbox.lead_id);
  return 1;
}

function extractWahaEventMessageId(event) {
  return firstWahaMessageId(
    event?.payload?.id,
    event?.payload?.messageId,
    event?.payload?.message_id,
    event?.payload?.message?.id,
    event?.payload?._data?.id,
    event?.id,
    event?.messageId,
    event?._data?.id,
  );
}

function parsePositiveInt(value, flagName) {
  const normalized = clean(value);
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${flagName} deve ser inteiro positivo`);
  }
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flagName} deve ser inteiro positivo`);
  }
  return parsed;
}

function parseBooleanFlag(value) {
  const normalized = clean(value).toLowerCase();
  if (!normalized) return false;
  if (["1", "true", "yes", "sim"].includes(normalized)) return true;
  if (["0", "false", "no", "nao", "não"].includes(normalized)) return false;
  throw new Error(`Valor booleano invalido: ${clean(value)}`);
}

function phoneFromValue(value) {
  const beforeAt = clean(value).split("@")[0].split(":")[0];
  return /^\d{8,15}$/.test(beforeAt) ? beforeAt : "";
}

function clean(value) {
  return value == null ? "" : String(value).trim();
}

function sanitizeFilePart(value) {
  return String(value).replace(/[^a-zA-Z0-9_.-]+/g, "-");
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
