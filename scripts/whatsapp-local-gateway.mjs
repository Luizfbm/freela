#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

function main() {
  const { root, command, flags } = parseArgs(process.argv.slice(2));

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

  if (command === "import-mcp-sqlite") {
    const result = importMcpSqlite(root, flags);
    console.log(`Importados: ${result.imported}`);
    console.log(`Ignorados: ${result.skipped}`);
    console.log(`Falhas: ${result.failed}`);
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
      console.log(`Falhas: ${result.failed}`);
      console.log(`Ignorados: ${result.skipped}`);
    }
    return;
  }

  if (command === "watch-mcp-sqlite") {
    watchMcpSqlite(root, flags);
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

function isUnknownLeadError(error) {
  return /Lead nao encontrado|Nenhum lead identificado/i.test(error.message);
}

function importMcpSqlite(root, flags) {
  const dbPath = resolve(
    root,
    flags.db || process.env.WHATSAPP_MCP_MESSAGES_DB || ".scratch/whatsapp-mcp/whatsapp-bridge/store/messages.db",
  );
  if (!existsSync(dbPath)) {
    throw new Error(`messages.db do whatsapp-mcp nao encontrado: ${dbPath}`);
  }

  const limit = parsePositiveInt(flags.limit || "100", "--limit");
  const scratchDir = join(root, ".scratch");
  mkdirSync(scratchDir, { recursive: true });
  const stateFile = resolve(root, flags["state-file"] || ".scratch/whatsapp-mcp-cursor.json");
  const cursor = readCursor(stateFile);
  const database = new DatabaseSync(dbPath);
  let imported = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const rows = readMcpRows(database, cursor, limit);
    for (const row of rows) {
      const rowCursor = cursorForRow(row);
      const event = eventFromMcpRow(row);

      if (!event) {
        skipped += 1;
        writeCursor(stateFile, rowCursor);
        continue;
      }

      const tempFile = join(
        scratchDir,
        `whatsapp-inbound-${sanitizeFilePart(event.bridge_message_id)}.json`,
      );
      writeFileSync(tempFile, JSON.stringify(event, null, 2));

      try {
        runCrm(root, ["whatsapp", "inbound", "ingest", "--file", tempFile]);
        imported += 1;
      } catch (error) {
        if (isUnknownLeadError(error)) {
          rmSync(tempFile, { force: true });
          skipped += 1;
        } else {
          failed += 1;
          writeFileSync(`${tempFile}.error.txt`, error.message);
        }
      }

      writeCursor(stateFile, rowCursor);
    }
  } finally {
    database.close();
  }

  return { imported, skipped, failed };
}

function dispatchApprovedOutbox(root, flags) {
  validateDispatchApprovedOutboxFlags(flags);
  const dryRun = parseBooleanFlag(flags["dry-run"]);
  const limit = parsePositiveInt(flags.limit || "10", "--limit");
  const crmDbPath = resolve(root, flags["crm-db"] || ".scratch/db/freela.sqlite");
  if (!existsSync(crmDbPath)) {
    throw new Error(`CRM SQLite nao encontrado: ${crmDbPath}`);
  }
  const database = new DatabaseSync(crmDbPath);
  try {
    const items = readDispatchableOutbox(database, limit);
    if (dryRun) return { dispatchable: items.length, items, sent: 0, failed: 0, skipped: 0 };
    return dispatchOutboxItems(database, items, flags);
  } finally {
    database.close();
  }
}

function readDispatchableOutbox(database, limit) {
  return database
    .prepare(
      `select
        o.*,
        l.canonical_name as lead_name,
        s.whatsapp_state
      from whatsapp_outbox o
      join leads l on l.id = o.lead_id
      join lead_conversation_state s on s.lead_id = o.lead_id
      where o.status = 'approved'
        and o.guardian_decision = 'enviar'
        and o.humanizer_pass = 1
        and o.sent_at is null
        and coalesce(s.whatsapp_state, '') not in ('handoff_luiz', 'bloqueado_guardiao', 'encerrado')
      order by o.approved_at asc, o.id asc
      limit ?`,
    )
    .all(limit);
}

function validateDispatchApprovedOutboxFlags(flags) {
  const allowed = new Set(["dry-run", "limit", "crm-db"]);
  for (const flag of Object.keys(flags)) {
    if (!allowed.has(flag)) {
      throw new Error(`Opcao desconhecida para dispatch-approved-outbox: --${flag}`);
    }
  }
}

function dispatchOutboxItems(database, items, flags) {
  return { sent: 0, failed: 0, skipped: items.length, items };
}

function readMcpRows(database, cursor, limit) {
  return database
    .prepare(
      `select
        m.id,
        m.chat_jid,
        m.sender,
        m.content,
        m.timestamp,
        m.is_from_me,
        m.media_type,
        m.filename,
        c.name as chat_name
      from messages m
      left join chats c on c.jid = m.chat_jid
      where (? = ''
        or m.timestamp > ?
        or (m.timestamp = ? and (m.id || ':' || m.chat_jid) > ?))
      order by m.timestamp asc, m.id asc, m.chat_jid asc
      limit ?`,
    )
    .all(
      cursor.lastTimestamp || "",
      cursor.lastTimestamp || "",
      cursor.lastTimestamp || "",
      cursor.lastKey || "",
      limit,
    );
}

function eventFromMcpRow(row) {
  const chatId = clean(row.chat_jid);
  const body = clean(row.content);
  const mediaType = clean(row.media_type);
  if (!chatId || row.is_from_me) return null;
  if (chatId.endsWith("@g.us")) return null;
  if (!body || mediaType) return null;

  const senderPhone = phoneFromValue(row.sender) || phoneFromValue(chatId);
  return {
    bridge_message_id: `${row.id}:${chatId}`,
    chat_id: chatId,
    sender_name: clean(row.chat_name) || senderPhone || clean(row.sender) || chatId,
    sender_phone: senderPhone,
    is_group: false,
    message_type: "text",
    body,
    received_at: clean(row.timestamp) || new Date().toISOString(),
    source: "whatsapp-mcp/messages.db",
  };
}

function cursorForRow(row) {
  return {
    lastTimestamp: clean(row.timestamp),
    lastKey: `${row.id}:${row.chat_jid}`,
    updatedAt: new Date().toISOString(),
  };
}

function readCursor(path) {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeCursor(path, cursor) {
  writeFileSync(path, JSON.stringify(cursor, null, 2));
}

function watchMcpSqlite(root, flags) {
  const intervalMs = parsePositiveInt(flags["interval-ms"] || "10000", "--interval-ms");
  console.log(`Observando whatsapp-mcp messages.db a cada ${intervalMs}ms`);
  const run = () => {
    try {
      const result = importMcpSqlite(root, flags);
      console.log(
        `[${new Date().toISOString()}] importados=${result.imported} ignorados=${result.skipped} falhas=${result.failed}`,
      );
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ${error.message}`);
    }
  };
  run();
  setInterval(run, intervalMs);
}

function parsePositiveInt(value, flagName) {
  const parsed = Number.parseInt(value, 10);
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
