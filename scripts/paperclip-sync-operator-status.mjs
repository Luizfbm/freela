#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DEFAULT_API_BASE = "http://127.0.0.1:3100";
const DEFAULT_ISSUE = "FRE-7";
const DEFAULT_KEY = "ops-status";
const DEFAULT_TIMEOUT_MS = 15000;
const DOCUMENT_TITLE = "Status operacional";
const CHANGE_SUMMARY = "Atualiza status executivo da operacao";

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

  run("node", [join(root, "scripts/freela-crm.mjs"), "--root", root, "export", "operator-status", ...dateArgs], {
    cwd: root,
  });

  const statusFile = join(root, ".scratch/ops/paperclip-operator-status.md");
  if (!existsSync(statusFile)) {
    throw new Error(`Arquivo de status operacional nao encontrado: ${statusFile}`);
  }

  const body = readFileSync(statusFile, "utf8");
  const currentRevisionId = await readCurrentRevisionId({ issue, key, apiBase, apiKey, runId, timeoutMs });
  const result = await putDocumentWithConflictRetry({
    issue,
    key,
    apiBase,
    apiKey,
    runId,
    timeoutMs,
    body,
    baseRevisionId: currentRevisionId,
  });

  const revision = result?.document?.latestRevisionId ? ` / revisao ${result.document.latestRevisionId}` : "";
  console.log(`Status operacional sincronizado no Paperclip: ${issue} / documento ${key}${revision}`);
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

async function readCurrentRevisionId({ issue, key, apiBase, apiKey, runId, timeoutMs }) {
  try {
    const document = await requestJson({
      url: documentUrl({ apiBase, issue, key }),
      method: "GET",
      apiKey,
      runId,
      timeoutMs,
    });
    return document.latestRevisionId ?? null;
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
  body,
  baseRevisionId,
}) {
  try {
    return await putDocument({ issue, key, apiBase, apiKey, runId, timeoutMs, body, baseRevisionId });
  } catch (error) {
    if (error.status !== 409) throw error;
    const latestRevisionId = await readCurrentRevisionId({ issue, key, apiBase, apiKey, runId, timeoutMs });
    return putDocument({
      issue,
      key,
      apiBase,
      apiKey,
      runId,
      timeoutMs,
      body,
      baseRevisionId: latestRevisionId,
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
