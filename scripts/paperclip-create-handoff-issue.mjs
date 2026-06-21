#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const DEFAULT_API_BASE = "http://127.0.0.1:3100";
const DEFAULT_PRIORITY = "medium";
const DEFAULT_STATUS = "todo";
const TERMINAL_ISSUE_STATUSES = new Set(["done", "cancelled"]);

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const handoffFile = flags["handoff-file"];
  if (!handoffFile) {
    throw new Error("Informe --handoff-file. Use --dry-run para validar sem criar issue.");
  }

  const root = resolve(flags.root ?? process.cwd());
  const apiBase = flags["api-base"] ?? process.env.PAPERCLIP_API_URL ?? DEFAULT_API_BASE;
  const apiKey = flags["api-key"] ?? process.env.PAPERCLIP_API_KEY;
  const runId = flags["run-id"] ?? process.env.PAPERCLIP_RUN_ID;
  const companyId = flags["company-id"] ?? process.env.PAPERCLIP_COMPANY_ID;
  const handoff = readJson(resolve(root, handoffFile));

  validateHandoff(handoff);

  const existingIssue = await findReusableIssue({ root, handoff, apiBase, apiKey, runId });
  if (existingIssue) {
    const existingIssueUpdate = await maybeUpdateExistingIssue({
      existingIssue,
      handoff,
      apiBase,
      apiKey,
      runId,
    });
    console.log(
      JSON.stringify(
        {
          reusedExistingIssue: true,
          createdIssueId: existingIssue.paperclip_issue_id,
          createdIssueIdentifier: existingIssue.paperclip_issue_identifier ?? null,
          dedupeKey: existingIssue.dedupe_key,
          ...existingIssueUpdate,
          target_agent_id: handoff.target_agent_id,
          source_issue: handoff.source_issue,
          blockedSourceIssue: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  const childPayload = buildChildIssuePayload(handoff);
  const sourceUpdatePayload = buildSourceUpdatePayload(handoff, ["<created-child-issue-id>"]);

  if (flags["dry-run"]) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          wouldCreateChildIssue: true,
          wouldBlockSourceIssue: Boolean(handoff.block_source_issue),
          childIssuePayload: childPayload,
          sourceUpdatePayload,
        },
        null,
        2,
      ),
    );
    return;
  }

  const childIssue = await createChildIssue({
    payload: childPayload,
    apiBase,
    apiKey,
    runId,
    companyId,
  });

  if (handoff.block_source_issue) {
    await blockSourceIssue({
      sourceIssueId: handoff.source_issue.id,
      childIssueId: childIssue.id,
      handoff,
      apiBase,
      apiKey,
      runId,
    });
  }

  console.log(
    JSON.stringify(
      {
        createdIssueId: childIssue.id,
        createdIssueIdentifier: childIssue.identifier ?? null,
        target_agent_id: handoff.target_agent_id,
        source_issue: handoff.source_issue,
        blockedSourceIssue: Boolean(handoff.block_source_issue),
      },
      null,
      2,
    ),
  );
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
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Nao foi possivel ler JSON de handoff em ${path}: ${error.message}`);
  }
}

function validateHandoff(handoff) {
  const required = [
    "handoff_version",
    "source_agent_id",
    "source_issue",
    "target_agent_id",
    "target_agent_name",
    "title",
    "required_action",
    "workflow",
    "artifacts",
    "acceptance_criteria",
  ];

  for (const key of required) {
    if (handoff[key] === undefined || handoff[key] === null || handoff[key] === "") {
      throw new Error(`Campo obrigatorio ausente no handoff: ${key}`);
    }
  }

  if (handoff.handoff_version !== 1) {
    throw new Error("handoff_version deve ser 1");
  }

  for (const key of ["id", "identifier"]) {
    if (!handoff.source_issue?.[key]) {
      throw new Error(`Campo obrigatorio ausente em source_issue: ${key}`);
    }
  }

  if (!Array.isArray(handoff.artifacts) || handoff.artifacts.length === 0) {
    throw new Error("artifacts deve ser uma lista nao vazia");
  }

  if (!Array.isArray(handoff.acceptance_criteria) || handoff.acceptance_criteria.length === 0) {
    throw new Error("acceptance_criteria deve ser uma lista nao vazia");
  }

  validateWorkflow(handoff.workflow);
}

function validateWorkflow(workflow) {
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) {
    throw new Error("workflow deve ser um objeto com contrato de maquina");
  }

  for (const key of ["run_id", "round_date", "stage", "expected_count", "next_owner"]) {
    if (workflow[key] === undefined || workflow[key] === null || workflow[key] === "") {
      throw new Error(`Campo obrigatorio ausente em workflow: ${key}`);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(workflow.round_date))) {
    throw new Error("workflow.round_date deve estar no formato YYYY-MM-DD");
  }

  if (!Number.isInteger(workflow.expected_count) || workflow.expected_count < 0) {
    throw new Error("workflow.expected_count deve ser inteiro maior ou igual a zero");
  }

  if (
    workflow.actual_count !== undefined &&
    (!Number.isInteger(workflow.actual_count) || workflow.actual_count < 0)
  ) {
    throw new Error("workflow.actual_count deve ser inteiro maior ou igual a zero");
  }
}

async function findReusableIssue({ root, handoff, apiBase, apiKey, runId }) {
  const dedupeKey = handoffDedupeKey(handoff);
  if (!dedupeKey) return null;

  const dbPath = resolve(root, ".scratch/db/freela.sqlite");
  if (!existsSync(dbPath)) return null;

  let database;
  try {
    database = new DatabaseSync(dbPath);
    database.exec("PRAGMA busy_timeout = 10000;");
    const existing =
      database
        .prepare(
          `select dedupe_key, paperclip_issue_id, paperclip_issue_identifier
           from worker_handoffs
           where dedupe_key = ?
             and status not in ('completed', 'cancelled')
             and paperclip_issue_id is not null
             and trim(paperclip_issue_id) != ''
           order by id asc
           limit 1`,
        )
        .get(dedupeKey) ?? null;
    if (!existing) return null;
    if (!(await isReusablePaperclipIssue({ issueId: existing.paperclip_issue_id, apiBase, apiKey, runId }))) {
      return null;
    }
    return existing;
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

async function isReusablePaperclipIssue({ issueId, apiBase, apiKey, runId }) {
  try {
    const issue = await requestJson({
      url: `${apiBase}/api/issues/${issueId}`,
      method: "GET",
      apiKey,
      runId,
      action: "verificar issue existente por dedupe",
    });
    return !TERMINAL_ISSUE_STATUSES.has(String(issue.status ?? "").trim());
  } catch {
    return true;
  }
}

function buildChildIssuePayload(handoff) {
  return removeUndefined({
    title: handoff.title,
    description: renderDescription(handoff),
    assigneeAgentId: handoff.target_agent_id,
    projectId: handoff.project_id,
    goalId: handoff.goal_id,
    parentId: handoff.source_issue.id,
    priority: handoff.priority ?? DEFAULT_PRIORITY,
    status: handoff.status ?? DEFAULT_STATUS,
    blockedByIssueIds: handoff.blocked_by_issue_ids ?? [],
  });
}

function buildExistingIssueUpdatePayload(handoff) {
  return removeUndefined({
    title: handoff.title,
    description: renderDescription(handoff),
    assigneeAgentId: handoff.target_agent_id,
    projectId: handoff.project_id,
    goalId: handoff.goal_id,
    priority: handoff.priority ?? DEFAULT_PRIORITY,
  });
}

function renderDescription(handoff) {
  const workflow = renderWorkflow(handoff);
  const artifacts = handoff.artifacts
    .map((artifact) => {
      const required = artifact.required === false ? "opcional" : "obrigatorio";
      return `- ${artifact.path} (${required}): ${artifact.description}`;
    })
    .join("\n");

  const criteria = handoff.acceptance_criteria.map((item, index) => `${index + 1}. ${item}`).join("\n");

  return [
    "## Handoff entre workers",
    "",
    `- source_agent_id: ${handoff.source_agent_id}`,
    `- source_agent_name: ${handoff.source_agent_name ?? "nao informado"}`,
    `- source_issue: ${formatIssueLink(handoff.source_issue.identifier)} / ${handoff.source_issue.id}`,
    `- target_agent_id: ${handoff.target_agent_id}`,
    `- target_agent_name: ${handoff.target_agent_name}`,
    "",
    "## Workflow",
    "",
    workflow,
    "",
    "## Acao requerida",
    "",
    handoff.required_action,
    "",
    "## Contexto",
    "",
    handoff.context ?? "Sem contexto adicional.",
    "",
    "## Artifacts",
    "",
    artifacts,
    "",
    "## Acceptance criteria",
    "",
    criteria,
    "",
    "## Regras",
    "",
    "- Nao copiar e colar contexto manualmente para outro worker; crie novo handoff se precisar delegar.",
    "- Respeitar docs/freelancer/paperclip/worker-handoff-protocol.md.",
    "- Nao enviar WhatsApp nem automatizar Instagram.",
  ].join("\n");
}

function renderWorkflow(handoff) {
  const { workflow } = handoff;
  const lines = [
    ...(workflow.batch_id ? [`- batch_id: ${workflow.batch_id}`] : []),
    `- run_id: ${workflow.run_id}`,
    `- round_date: ${workflow.round_date}`,
    `- stage: ${workflow.stage}`,
  ];
  const dedupeKey = handoffDedupeKey(handoff);
  if (dedupeKey) lines.push(`- dedupe_key: ${dedupeKey}`);
  lines.push(`- expected_count: ${workflow.expected_count}`);
  if (workflow.actual_count !== undefined) lines.push(`- actual_count: ${workflow.actual_count}`);
  if (workflow.gate_status) lines.push(`- gate_status: ${workflow.gate_status}`);
  lines.push(`- next_owner: ${workflow.next_owner}`);
  return lines.join("\n");
}

function handoffDedupeKey(handoff) {
  const explicit = String(handoff.workflow?.dedupe_key ?? handoff.dedupe_key ?? "").trim();
  if (explicit) return explicit;
  const batchId = String(handoff.workflow?.batch_id ?? "").trim();
  const targetAgentId = String(handoff.target_agent_id ?? "").trim();
  if (!batchId || !targetAgentId) return "";
  return `batch:${batchId}:target:${targetAgentId}`;
}

function formatIssueLink(identifier) {
  const value = String(identifier ?? "").trim();
  const match = value.match(/^([A-Z][A-Z0-9]*)-\d+$/);
  if (!match) return value;
  return `[${value}](/${match[1]}/issues/${value})`;
}

async function createChildIssue({ payload, apiBase, apiKey, runId, companyId }) {
  if (!companyId) {
    throw new Error("Informe --company-id ou PAPERCLIP_COMPANY_ID para criar a child issue pela API.");
  }

  return postJson({
    url: `${apiBase}/api/companies/${companyId}/issues`,
    payload,
    apiKey,
    runId,
    action: "criar child issue",
  });
}

async function blockSourceIssue({ sourceIssueId, childIssueId, handoff, apiBase, apiKey, runId }) {
  const payload = buildSourceUpdatePayload(handoff, [childIssueId]);
  await patchJson({
    url: `${apiBase}/api/issues/${sourceIssueId}`,
    payload,
    apiKey,
    runId,
    action: "atualizar blockedByIssueIds da issue de origem",
  });
}

async function updateExistingIssue({ issueId, payload, apiBase, apiKey, runId }) {
  await patchJson({
    url: `${apiBase}/api/issues/${issueId}`,
    payload,
    apiKey,
    runId,
    action: "atualizar issue existente por dedupe",
  });
}

async function maybeUpdateExistingIssue({ existingIssue, handoff, apiBase, apiKey, runId }) {
  if (shouldPreserveExistingIssue(existingIssue)) {
    return {
      existingIssueUpdateSkipped: true,
      existingIssueUpdateSkipReason: "publish_fre7_dedupe_preserves_original_issue",
    };
  }

  try {
    await updateExistingIssue({
      issueId: existingIssue.paperclip_issue_id,
      payload: buildExistingIssueUpdatePayload(handoff),
      apiBase,
      apiKey,
      runId,
    });
    return { existingIssueUpdateSkipped: false };
  } catch (error) {
    if (!isAuthorizationBoundaryError(error)) throw error;
    return {
      existingIssueUpdateSkipped: true,
      existingIssueUpdateError: error.message,
    };
  }
}

function shouldPreserveExistingIssue(existingIssue) {
  return String(existingIssue.dedupe_key ?? "").trim().startsWith("publish_fre7:");
}

function isAuthorizationBoundaryError(error) {
  return error?.httpStatus === 401 || error?.httpStatus === 403 || /HTTP 40[13]\b/.test(error?.message ?? "");
}

function buildSourceUpdatePayload(handoff, blockedByIssueIds) {
  return {
    status: "blocked",
    blockedByIssueIds,
    comment:
      handoff.comment ??
      `Bloqueado aguardando ${handoff.target_agent_name}: ${handoff.required_action}`,
  };
}

function buildHeaders({ apiKey, runId }) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (runId) headers["X-Paperclip-Run-Id"] = runId;
  return headers;
}

async function postJson({ url, payload, apiKey, runId, action }) {
  return requestJson({ url, method: "POST", payload, apiKey, runId, action });
}

async function patchJson({ url, payload, apiKey, runId, action }) {
  return requestJson({ url, method: "PATCH", payload, apiKey, runId, action });
}

async function requestJson({ url, method, payload, apiKey, runId, action }) {
  const response = await fetch(url, {
    method,
    headers: buildHeaders({ apiKey, runId }),
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`Falha ao ${action}: HTTP ${response.status}\n${text}`);
    error.httpStatus = response.status;
    throw error;
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Resposta invalida ao ${action}: ${error.message}\n${text}`);
  }
}

function removeUndefined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
