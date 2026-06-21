#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const DEFAULT_API_BASE = "http://127.0.0.1:3100";
const DEFAULT_COMPANY_ID = "50a2756c-2942-40c1-90f8-b16807a62ef3";
const DEFAULT_TIMEOUT_MS = 15000;
const SAFE_AGENT_FIELDS = ["name", "role", "title", "icon", "reportsTo", "capabilities"];
const SAFE_ADAPTER_CONFIG_FIELDS = ["cwd", "extraArgs", "instructionsRootPath", "env"];
const SAFE_ADAPTER_ENV_FIELDS = ["PATH", "CODEX_HOME"];

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    printHelp();
    return;
  }
  if (flags.apply && flags["dry-run"]) {
    throw new Error("Use apenas um modo: --dry-run ou --apply");
  }

  const root = resolve(flags.root ?? process.cwd());
  const mode = flags.apply ? "apply" : "dry-run";
  const apiBase = normalizeApiBase(flags["api-base"] ?? process.env.PAPERCLIP_API_URL ?? DEFAULT_API_BASE);
  const apiKey = flags["api-key"] ?? process.env.PAPERCLIP_API_KEY ?? null;
  const runId = normalizeRunId(flags["run-id"] ?? process.env.PAPERCLIP_RUN_ID ?? null);
  const companyId = flags["company-id"] ?? process.env.PAPERCLIP_COMPANY_ID ?? DEFAULT_COMPANY_ID;
  const timeoutMs = parsePositiveInteger(flags["timeout-ms"] ?? `${DEFAULT_TIMEOUT_MS}`, "--timeout-ms");

  const { localAgents, skippedDraftAgents } = readLocalAgents(root);
  const liveAgents = await fetchLiveAgents({ apiBase, apiKey, runId, companyId, timeoutMs });
  const plan = buildSyncPlan({ localAgents, liveAgents });

  if (mode === "apply") {
    await applySyncPlan({ plan, apiBase, apiKey, runId, timeoutMs });
  }

  const result = buildResult({ mode, companyId, plan, localAgents, liveAgents, skippedDraftAgents });
  result.auditReportPath = writeAuditReport({ root, result });
  console.log(`${JSON.stringify(result, null, 2)}\n`);
}

function parseFlags(argv) {
  const flags = {};
  const booleanFlags = new Set(["apply", "dry-run", "help"]);
  const rest = [...argv];

  while (rest.length) {
    const token = rest.shift();
    if (!token.startsWith("--")) throw new Error(`Opcao invalida: ${token}`);
    const key = token.slice(2);

    if (booleanFlags.has(key)) {
      flags[key] = true;
      continue;
    }

    const value = rest.shift();
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Valor obrigatorio para --${key}`);
    }
    flags[key] = value;
  }

  return flags;
}

function printHelp() {
  console.log(`Uso:
  node scripts/paperclip-sync-agents.mjs [--dry-run]
  node scripts/paperclip-sync-agents.mjs --apply

Opcoes:
  --root [dir]          Raiz do repositorio
  --company-id [id]    Company ID do Paperclip
  --api-base [url]     Base da API local
  --api-key [token]    Token bearer, quando necessario
  --run-id [uuid]      UUID da execucao Paperclip para auditoria
  --timeout-ms [n]     Timeout HTTP
`);
}

function readLocalAgents(root) {
  const configDir = join(root, "docs/freelancer/paperclip");
  if (!existsSync(configDir)) {
    throw new Error(`Diretorio de agentes nao encontrado: ${configDir}`);
  }

  const skippedDraftAgents = [];
  const localAgents = readdirSync(configDir)
    .filter((name) => /^agent-.*\.json$/.test(name))
    .sort()
    .flatMap((fileName) => {
      const filePath = join(configDir, fileName);
      const agent = parseJsonFile(filePath);
      if (!isNonEmptyString(agent.id)) {
        skippedDraftAgents.push({
          fileName,
          agentName: agent.name ?? null,
          reason: "missing_id",
        });
        return [];
      }
      return [{
        fileName,
        filePath,
        agent,
      }];
    });

  return {
    localAgents,
    skippedDraftAgents,
  };
}

function parseJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`JSON invalido em ${path}: ${error.message}`);
  }
}

async function fetchLiveAgents({ apiBase, apiKey, runId, companyId, timeoutMs }) {
  const response = await requestJson({
    url: `${apiBase}/api/companies/${encodeURIComponent(companyId)}/agents`,
    method: "GET",
    apiKey,
    runId,
    timeoutMs,
  });

  return normalizeAgentsResponse(response);
}

function normalizeAgentsResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.agents)) return response.agents;
  if (Array.isArray(response?.data)) return response.data;
  throw new Error("Resposta de agentes da API do Paperclip nao contem lista de agentes");
}

function buildSyncPlan({ localAgents, liveAgents }) {
  const liveById = new Map(liveAgents.map((agent) => [agent.id, agent]));
  const changes = [];
  let unchangedAgents = 0;
  let missingLiveAgents = 0;

  for (const localEntry of localAgents) {
    const local = localEntry.agent;
    const live = liveById.get(local.id);

    if (!live) {
      missingLiveAgents += 1;
      changes.push({
        agentId: local.id,
        fileName: localEntry.fileName,
        agentName: local.name ?? null,
        status: "missing_live_agent",
        safePatch: {},
        adapterConfigPatch: null,
        instructionsPath: null,
      });
      continue;
    }

    const safePatch = buildSafePatch({ local, live });
    const adapterConfigPatch = buildAdapterConfigPatch({ local, live });
    const instructionsPath = buildInstructionsPathPatch({ local, live });

    if (Object.keys(safePatch).length === 0 && !adapterConfigPatch && !instructionsPath) {
      unchangedAgents += 1;
      continue;
    }

    changes.push({
      agentId: local.id,
      fileName: localEntry.fileName,
      agentName: local.name ?? live.name ?? null,
      status: "changed",
      safePatch,
      adapterConfigPatch,
      instructionsPath,
    });
  }

  return {
    changes,
    unchangedAgents,
    missingLiveAgents,
  };
}

function buildSafePatch({ local, live }) {
  const patch = {};

  for (const field of SAFE_AGENT_FIELDS) {
    if (!Object.hasOwn(local, field)) continue;
    if (!deepEqual(local[field], live[field])) {
      patch[field] = local[field];
    }
  }

  if (Object.hasOwn(local, "metadata")) {
    const localMetadata = asPlainObject(local.metadata, "metadata");
    const liveMetadata = isPlainObject(live.metadata) ? live.metadata : {};
    const mergedMetadata = {
      ...liveMetadata,
      ...localMetadata,
    };
    if (!deepEqual(mergedMetadata, liveMetadata)) {
      patch.metadata = mergedMetadata;
    }
  }

  return patch;
}

function buildAdapterConfigPatch({ local, live }) {
  const localAdapterConfig = isPlainObject(local.adapterConfig) ? local.adapterConfig : {};
  const liveAdapterConfig = isPlainObject(live.adapterConfig) ? live.adapterConfig : {};
  const patch = {};

  for (const field of SAFE_ADAPTER_CONFIG_FIELDS) {
    if (!Object.hasOwn(localAdapterConfig, field)) continue;
    const value = normalizeSafeAdapterConfigField({ agentId: local.id, field, value: localAdapterConfig[field] });
    const liveValue = Object.hasOwn(liveAdapterConfig, field)
      ? normalizeComparableAdapterConfigField({ field, value: liveAdapterConfig[field] })
      : undefined;
    if (!deepEqual(value, liveValue)) {
      patch[field] = value;
    }
  }

  return Object.keys(patch).length === 0 ? null : patch;
}

function normalizeSafeAdapterConfigField({ agentId, field, value }) {
  if (field === "cwd" || field === "instructionsRootPath") {
    if (!isNonEmptyString(value)) {
      throw new Error(`adapterConfig.${field} invalido para agente ${agentId}`);
    }
    return value;
  }

  if (field === "extraArgs") {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
      throw new Error(`adapterConfig.extraArgs invalido para agente ${agentId}`);
    }
    return value;
  }

  if (field === "env") {
    return normalizeSafeAdapterEnv({ agentId, value });
  }

  throw new Error(`Campo adapterConfig.${field} nao permitido para sincronizacao`);
}

function normalizeComparableAdapterConfigField({ field, value }) {
  if (field !== "env") return value;
  return normalizeComparableAdapterEnv(value);
}

function normalizeSafeAdapterEnv({ agentId, value }) {
  const env = asPlainObject(value, `adapterConfig.env para agente ${agentId}`);
  const safeEnv = {};

  for (const key of Object.keys(env).sort()) {
    if (!SAFE_ADAPTER_ENV_FIELDS.includes(key)) {
      throw new Error(`adapterConfig.env.${key} nao pode ser sincronizado para agente ${agentId}`);
    }
    const stringValue = envBindingString(env[key]);
    if (!isNonEmptyString(stringValue)) {
      throw new Error(`adapterConfig.env.${key} invalido para agente ${agentId}`);
    }
    safeEnv[key] = stringValue;
  }

  if (!isNonEmptyString(safeEnv.PATH)) {
    throw new Error(`adapterConfig.env.PATH obrigatorio para agente ${agentId}`);
  }
  if (!isNonEmptyString(safeEnv.CODEX_HOME)) {
    throw new Error(`adapterConfig.env.CODEX_HOME obrigatorio para agente ${agentId}`);
  }
  if (/\/\.codex\/?$/.test(safeEnv.CODEX_HOME)) {
    throw new Error(`adapterConfig.env.CODEX_HOME deve ser isolado para agente ${agentId}`);
  }

  return safeEnv;
}

function normalizeComparableAdapterEnv(value) {
  if (!isPlainObject(value)) return value;
  const env = {};

  for (const key of SAFE_ADAPTER_ENV_FIELDS) {
    const stringValue = envBindingString(value[key]);
    if (stringValue !== undefined) {
      env[key] = stringValue;
    }
  }

  return env;
}

function envBindingString(value) {
  if (typeof value === "string") return value;
  if (isPlainObject(value) && value.type === "plain" && typeof value.value === "string") {
    return value.value;
  }
  return undefined;
}

function buildInstructionsPathPatch({ local, live }) {
  const localAdapterConfig = isPlainObject(local.adapterConfig) ? local.adapterConfig : {};
  if (!Object.hasOwn(localAdapterConfig, "instructionsFilePath")) return null;

  const liveAdapterConfig = isPlainObject(live.adapterConfig) ? live.adapterConfig : {};
  const localPath = localAdapterConfig.instructionsFilePath ?? null;
  const livePath = liveAdapterConfig.instructionsFilePath ?? null;

  if (localPath !== null && !isNonEmptyString(localPath)) {
    throw new Error(`adapterConfig.instructionsFilePath invalido para agente ${local.id}`);
  }

  return localPath === livePath ? null : { path: localPath };
}

async function applySyncPlan({ plan, apiBase, apiKey, runId, timeoutMs }) {
  for (const change of plan.changes) {
    if (change.status !== "changed") continue;

    const genericPatch = {
      ...change.safePatch,
      ...(change.adapterConfigPatch ? { adapterConfig: change.adapterConfigPatch } : {}),
    };

    if (Object.keys(genericPatch).length > 0) {
      await requestJson({
        url: `${apiBase}/api/agents/${encodeURIComponent(change.agentId)}`,
        method: "PATCH",
        payload: genericPatch,
        apiKey,
        runId,
        timeoutMs,
      });
      change.appliedSafePatch = true;
      change.appliedAdapterConfigPatch = Boolean(change.adapterConfigPatch);
    }

    if (change.instructionsPath) {
      await requestJson({
        url: `${apiBase}/api/agents/${encodeURIComponent(change.agentId)}/instructions-path`,
        method: "PATCH",
        payload: change.instructionsPath,
        apiKey,
        runId,
        timeoutMs,
      });
      change.appliedInstructionsPath = true;
    }
  }
}

function buildResult({ mode, companyId, plan, localAgents, liveAgents, skippedDraftAgents }) {
  const changedAgents = plan.changes.filter((change) => change.status === "changed").length;
  const genericPatches = plan.changes.filter(
    (change) => change.status === "changed" && (
      Object.keys(change.safePatch).length > 0 || change.adapterConfigPatch
    ),
  ).length;
  const instructionsPathPatches = plan.changes.filter(
    (change) => change.status === "changed" && change.instructionsPath,
  ).length;
  const adapterConfigPatches = plan.changes.filter(
    (change) => change.status === "changed" && change.adapterConfigPatch,
  ).length;

  return {
    mode,
    companyId,
    summary: {
      localAgents: localAgents.length,
      liveAgents: liveAgents.length,
      skippedDraftAgents: skippedDraftAgents.length,
      changedAgents,
      missingLiveAgents: plan.missingLiveAgents,
      unchangedAgents: plan.unchangedAgents,
      genericPatches,
      adapterConfigPatches,
      instructionsPathPatches,
    },
    changes: plan.changes,
    skippedDraftAgents,
  };
}

function writeAuditReport({ root, result }) {
  const reportDir = join(root, ".scratch/ops");
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, `paperclip-agent-sync-${new Date().toISOString().slice(0, 10)}.md`);
  const lines = [
    "# Paperclip agent sync",
    "",
    `- mode: ${result.mode}`,
    `- company_id: ${result.companyId}`,
    `- local_agents: ${result.summary.localAgents}`,
    `- live_agents: ${result.summary.liveAgents}`,
    `- skipped_draft_agents: ${result.summary.skippedDraftAgents}`,
    `- changed_agents: ${result.summary.changedAgents}`,
    `- missing_live_agents: ${result.summary.missingLiveAgents}`,
    `- generic_patches: ${result.summary.genericPatches}`,
    `- adapter_config_patches: ${result.summary.adapterConfigPatches}`,
    `- instructions_path_patches: ${result.summary.instructionsPathPatches}`,
    "",
    "## Changes",
    "",
  ];

  for (const change of result.changes) {
    lines.push(`- ${change.agentName ?? change.agentId} (${change.agentId})`);
    lines.push(`  - file: ${basename(change.fileName)}`);
    lines.push(`  - status: ${change.status}`);
    lines.push(`  - safe_fields: ${Object.keys(change.safePatch).join(", ") || "none"}`);
    lines.push(`  - adapter_config_fields: ${change.adapterConfigPatch ? Object.keys(change.adapterConfigPatch).join(", ") : "none"}`);
    lines.push(`  - instructions_path: ${change.instructionsPath ? "changed" : "none"}`);
  }

  writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");
  return reportPath;
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
  const error = new Error(`Paperclip retornou HTTP ${status} em ${method} ${url}${suffix}`);
  error.status = status;
  error.data = data;
  return error;
}

function normalizeApiBase(apiBase) {
  return apiBase.replace(/\/+$/, "");
}

function normalizeRunId(value) {
  if (!value) return null;
  const runId = String(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) {
    throw new Error(`Valor invalido para --run-id/PAPERCLIP_RUN_ID: ${runId}. Use um UUID valido.`);
  }
  return runId;
}

function parsePositiveInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Valor invalido para ${label}: ${value}`);
  }
  return parsed;
}

function asPlainObject(value, label) {
  if (!isPlainObject(value)) {
    throw new Error(`${label} deve ser objeto`);
  }
  return value;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function deepEqual(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value) {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortDeep(value[key])]));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
