#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const DEFAULT_API_BASE = "http://127.0.0.1:3100";
const DEFAULT_ISSUE = "FRE-7";
const DEFAULT_LEAD_KEY = "lead-cards";
const DEFAULT_STATUS_KEY = "ops-status";
const DEFAULT_TIMEOUT_MS = 15000;

function main() {
  const flags = parseFlags(process.argv.slice(2));
  const root = resolve(flags.root ?? process.cwd());
  const issue = flags.issue ?? DEFAULT_ISSUE;
  const leadKey = flags["lead-key"] ?? DEFAULT_LEAD_KEY;
  const statusKey = flags["status-key"] ?? DEFAULT_STATUS_KEY;
  const apiBase = normalizeApiBase(flags["api-base"] ?? process.env.PAPERCLIP_API_URL ?? DEFAULT_API_BASE);
  const apiKey = flags["api-key"] ?? process.env.PAPERCLIP_API_KEY ?? null;
  const runId = flags["run-id"] ?? process.env.PAPERCLIP_RUN_ID ?? null;
  const timeoutMs = parsePositiveInteger(flags["timeout-ms"] ?? `${DEFAULT_TIMEOUT_MS}`, "--timeout-ms");
  const dateArgs = flags.date ? ["--date", flags.date] : [];

  runSurfaceSync({
    label: "lead-cards",
    script: "paperclip-sync-lead-cards.mjs",
    args: buildSurfaceArgs({ root, issue, key: leadKey, apiBase, apiKey, runId, timeoutMs, dateArgs }),
    root,
  });
  runSurfaceSync({
    label: "ops-status",
    script: "paperclip-sync-operator-status.mjs",
    args: buildSurfaceArgs({ root, issue, key: statusKey, apiBase, apiKey, runId, timeoutMs, dateArgs }),
    root,
  });

  console.log(`Superficies operacionais sincronizadas: ${issue} / ${leadKey}, ${statusKey}`);
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

function buildSurfaceArgs({ root, issue, key, apiBase, apiKey, runId, timeoutMs, dateArgs }) {
  return [
    "--root",
    root,
    "--issue",
    issue,
    "--key",
    key,
    "--api-base",
    apiBase,
    ...optionalFlag("--api-key", apiKey),
    ...optionalFlag("--run-id", runId),
    "--timeout-ms",
    `${timeoutMs}`,
    ...dateArgs,
  ];
}

function optionalFlag(name, value) {
  return value ? [name, value] : [];
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

function runSurfaceSync({ label, script, args, root }) {
  const commandArgs = [join(root, "scripts", script), ...args];
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const command = `${process.execPath} ${redactArgs(commandArgs).join(" ")}`;
    throw new Error(`Falha ao sincronizar ${label}: ${command}`);
  }
}

function redactArgs(args) {
  const redacted = [...args];
  for (let index = 0; index < redacted.length; index += 1) {
    if (redacted[index] === "--api-key" && redacted[index + 1]) {
      redacted[index + 1] = "[redacted]";
    }
  }
  return redacted;
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
