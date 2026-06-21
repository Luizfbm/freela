#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DEFAULT_API_BASE = "http://127.0.0.1:3100";
const DEFAULT_ISSUE = "FRE-7";
const DEFAULT_KEY = "lead-cards";
const DEFAULT_TIMEOUT_MS = 15000;
const DOCUMENT_TITLE = "Leads para copiar e enviar";
const CHANGE_SUMMARY = "Atualiza cards de leads para envio manual";

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const root = resolve(flags.root ?? process.cwd());
  const issue = flags.issue ?? DEFAULT_ISSUE;
  const key = flags.key ?? DEFAULT_KEY;
  const apiBase = normalizeApiBase(flags["api-base"] ?? process.env.PAPERCLIP_API_URL ?? DEFAULT_API_BASE);
  const apiKey = flags["api-key"] ?? process.env.PAPERCLIP_API_KEY ?? null;
  const runId = flags["run-id"] ?? process.env.PAPERCLIP_RUN_ID ?? null;
  const timeoutMs = parsePositiveInteger(flags["timeout-ms"] ?? `${DEFAULT_TIMEOUT_MS}`, "--timeout-ms");
  const dateArgs = flags.date ? ["--date", flags.date] : [];

  run("node", [join(root, "scripts/freela-crm.mjs"), "--root", root, "export", "paperclip-cards", ...dateArgs], {
    cwd: root,
  });

  const cardsFile = join(root, ".scratch/crm/paperclip-lead-cards.md");
  if (!existsSync(cardsFile)) {
    throw new Error(`Arquivo de cards nao encontrado: ${cardsFile}`);
  }

  const exportedBody = readFileSync(cardsFile, "utf8");
  const currentDocument = await readCurrentDocument({ issue, key, apiBase, apiKey, runId, timeoutMs });
  const result = await putDocumentWithConflictRetry({
    issue,
    key,
    apiBase,
    apiKey,
    runId,
    timeoutMs,
    exportedBody,
    currentDocument,
  });

  const revision = result?.document?.latestRevisionId ? ` / revisao ${result.document.latestRevisionId}` : "";
  console.log(`Cards sincronizados no Paperclip: ${issue} / documento ${key}${revision}`);
}

function parseFlags(argv) {
  const flags = {};
  const rest = [...argv];
  while (rest.length) {
    const token = rest.shift();
    if (!token.startsWith("--")) throw new Error(`Opcao invalida: ${token}`);
    const key = token.slice(2);
    const value = rest.shift();
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Valor obrigatorio para --${key}`);
    }
    flags[key] = value;
  }
  return flags;
}

async function readCurrentDocument({ issue, key, apiBase, apiKey, runId, timeoutMs }) {
  try {
    return await requestJson({
      url: documentUrl({ apiBase, issue, key }),
      method: "GET",
      apiKey,
      runId,
      timeoutMs,
    });
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function putDocumentWithConflictRetry({
  issue,
  key,
  apiBase,
  apiKey,
  runId,
  timeoutMs,
  exportedBody,
  currentDocument,
}) {
  const body = mergeLeadCards({
    currentBody: currentDocument?.body,
    exportedBody,
  });

  try {
    return await putDocument({
      issue,
      key,
      apiBase,
      apiKey,
      runId,
      timeoutMs,
      body,
      baseRevisionId: currentDocument?.latestRevisionId ?? null,
    });
  } catch (error) {
    if (error.status !== 409) throw error;
    const latestDocument = await readCurrentDocument({ issue, key, apiBase, apiKey, runId, timeoutMs });
    const mergedBody = mergeLeadCards({
      currentBody: latestDocument?.body,
      exportedBody,
    });
    return putDocument({
      issue,
      key,
      apiBase,
      apiKey,
      runId,
      timeoutMs,
      body: mergedBody,
      baseRevisionId: latestDocument?.latestRevisionId ?? null,
    });
  }
}

async function putDocument({ issue, key, apiBase, apiKey, runId, timeoutMs, body, baseRevisionId }) {
  const payload = {
    title: DOCUMENT_TITLE,
    format: "markdown",
    body,
    changeSummary: CHANGE_SUMMARY,
  };

  if (baseRevisionId) payload.baseRevisionId = baseRevisionId;

  return requestJson({
    url: documentUrl({ apiBase, issue, key }),
    method: "PUT",
    payload,
    apiKey,
    runId,
    timeoutMs,
  });
}

async function requestJson({ url, method, payload, apiKey, runId, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    Accept: "application/json",
  };

  if (payload !== undefined) headers["Content-Type"] = "application/json";
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (runId) headers["X-Paperclip-Run-Id"] = runId;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    const data = parseResponseBody(text, url);

    if (!response.ok) {
      throw httpError({ method, url, status: response.status, data, text });
    }

    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Timeout de ${timeoutMs}ms ao chamar ${method} ${url}`);
    }
    if (error.status) throw error;
    throw new Error(`Falha de rede ao chamar ${method} ${url}: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function parseResponseBody(text, url) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Resposta invalida da API do Paperclip em ${url}: ${text.slice(0, 500)}`);
  }
}

function httpError({ method, url, status, data, text }) {
  const detail = data?.error ?? text?.slice(0, 500) ?? "";
  const suffix = detail ? `: ${detail}` : "";
  const message =
    status === 401 || status === 403
      ? `Paperclip recusou autorizacao (${status}) em ${method} ${url}${suffix}`
      : status === 409
        ? `Conflito de revisao ao atualizar documento em ${method} ${url}${suffix}`
        : `Paperclip retornou HTTP ${status} em ${method} ${url}${suffix}`;
  const error = new Error(message);
  error.status = status;
  error.data = data;
  return error;
}

function documentUrl({ apiBase, issue, key }) {
  return `${apiBase}/api/issues/${encodeURIComponent(issue)}/documents/${encodeURIComponent(key)}`;
}

function normalizeApiBase(apiBase) {
  return apiBase.replace(/\/+$/, "");
}

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Valor invalido para ${label}: ${value}`);
  }
  return parsed;
}

function mergeLeadCards({ currentBody, exportedBody }) {
  const exported = parseLeadCardDocument(exportedBody);
  if (!currentBody || !exported.cards.length) return exportedBody;

  const current = parseLeadCardDocument(currentBody);
  if (!current.cards.length) return exportedBody;

  const seen = new Set();
  const mergedCards = [];

  for (const card of exported.cards) {
    const key = normalizeCardName(card.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    mergedCards.push(card);
  }

  for (const card of current.cards) {
    const key = normalizeCardName(card.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    mergedCards.push(card);
  }

  return renderLeadCardDocument({
    header: exported.header,
    cards: mergedCards,
  });
}

function parseLeadCardDocument(body) {
  const lines = body.split(/\r?\n/);
  const headings = [];
  const headingPattern = /^##\s+\d+\.\s+(.+?)\s*$/;

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(headingPattern);
    if (match) {
      headings.push({
        index,
        name: match[1].trim(),
      });
    }
  }

  if (!headings.length) {
    return {
      header: body.trimEnd(),
      cards: [],
    };
  }

  const cards = headings.map((heading, index) => {
    const nextHeading = headings[index + 1];
    return {
      name: heading.name,
      lines: lines.slice(heading.index, nextHeading?.index ?? lines.length),
    };
  });

  return {
    header: lines.slice(0, headings[0].index).join("\n").trimEnd(),
    cards,
  };
}

function renderLeadCardDocument({ header, cards }) {
  const chunks = [];
  const normalizedHeader = header.trimEnd();
  if (normalizedHeader) chunks.push(normalizedHeader);

  cards.forEach((card, index) => {
    const lines = [...card.lines];
    lines[0] = `## ${index + 1}. ${card.name}`;
    chunks.push(lines.join("\n").trimEnd());
  });

  return `${chunks.join("\n\n").trim()}\n`;
}

function normalizeCardName(name) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function run(command, args, options) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      [`Falha ao executar: ${command} ${args.join(" ")}`, result.stdout, result.stderr]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result;
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
