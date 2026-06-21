#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_API_BASE = "http://127.0.0.1:3100";
const DEFAULT_ASSIGNEE_AGENT_ID = "75be697f-26c9-4d4d-a40e-a9ad675dcba7";

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const file = flags.file;
  if (!file) throw new Error("Informe --file com o handoff WhatsApp.");

  const root = resolve(flags.root ?? process.cwd());
  const handoff = readJson(resolve(root, file));
  validateHandoff(handoff);

  const apiBase = flags["api-base"] ?? process.env.PAPERCLIP_API_URL ?? DEFAULT_API_BASE;
  const apiKey = flags["api-key"] ?? process.env.PAPERCLIP_API_KEY;
  const runId = flags["run-id"] ?? process.env.PAPERCLIP_RUN_ID;
  const companyId = flags["company-id"] ?? process.env.PAPERCLIP_COMPANY_ID;
  const payload = buildIssuePayload(handoff, flags["assignee-agent-id"]);

  if (flags["dry-run"]) {
    console.log(JSON.stringify({ mode: "dry-run", issuePayload: payload }, null, 2));
    return;
  }

  if (!companyId) {
    throw new Error("Informe --company-id ou PAPERCLIP_COMPANY_ID.");
  }

  const issue = await postJson({
    url: `${apiBase}/api/companies/${encodeURIComponent(companyId)}/issues`,
    payload,
    apiKey,
    runId,
  });

  console.log(JSON.stringify({ createdIssueId: issue.id, identifier: issue.identifier ?? null }, null, 2));
}

function parseFlags(argv) {
  const flags = {};
  const rest = [...argv];
  while (rest.length) {
    const token = rest.shift();
    if (!token.startsWith("--")) throw new Error(`Opcao invalida: ${token}`);
    const key = token.slice(2);
    if (key === "dry-run") {
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

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function validateHandoff(handoff) {
  for (const key of [
    "reason",
    "lead_name",
    "latest_message",
    "conversation_state",
    "suggested_action",
  ]) {
    if (!handoff[key]) throw new Error(`Campo obrigatorio ausente: ${key}`);
  }

  if (!["preco_pedido", "lead_quente", "handoff_luiz", "bloqueado_guardiao"].includes(handoff.reason)) {
    throw new Error(`reason invalido: ${handoff.reason}`);
  }
}

function buildIssuePayload(handoff, assigneeAgentId) {
  return {
    title: `WhatsApp: ${handoff.reason} - ${handoff.lead_name}`,
    description: renderDescription(handoff),
    assigneeAgentId: assigneeAgentId ?? DEFAULT_ASSIGNEE_AGENT_ID,
    priority: "high",
    status: "todo",
  };
}

function renderDescription(handoff) {
  const artifacts = Array.isArray(handoff.source_artifacts)
    ? handoff.source_artifacts.map((artifact) => `- ${artifact}`).join("\n")
    : "- nenhum";

  return [
    "## Handoff WhatsApp para Luiz",
    "",
    `- reason: ${handoff.reason}`,
    `- lead_name: ${handoff.lead_name}`,
    `- conversation_state: ${handoff.conversation_state}`,
    "",
    "## Ultima mensagem",
    "",
    handoff.latest_message,
    "",
    "## Acao sugerida",
    "",
    handoff.suggested_action,
    "",
    "## Artifacts",
    "",
    artifacts,
    "",
    "## Regras",
    "",
    "- Criar contexto para o operador decidir a resposta.",
    "- Nao acionar canal externo a partir deste script.",
  ].join("\n");
}

function buildHeaders({ apiKey, runId }) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (runId) headers["X-Paperclip-Run-Id"] = runId;
  return headers;
}

async function postJson({ url, payload, apiKey, runId }) {
  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders({ apiKey, runId }),
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Falha ao criar issue WhatsApp: HTTP ${response.status}\n${text}`);
  }
  return text ? JSON.parse(text) : {};
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
