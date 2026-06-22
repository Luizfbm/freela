#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  executeCockpitAction,
  openCockpitDatabase,
  previewCommand,
  readCockpitSummary,
  readKanban,
  readLeadDetail,
  readWahaSummary,
  searchLeads,
} from "./freela-cockpit-core.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3200;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(SCRIPT_DIR);
const CRM_SCRIPT = join(SCRIPT_DIR, "freela-crm.mjs");
const OPERATIONAL_SURFACES_SCRIPT = join(SCRIPT_DIR, "paperclip-sync-operational-surfaces.mjs");

const MIME = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

export function createCockpitServer({
  root = process.cwd(),
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  dbPath = null,
  operationalSurfacesScript = OPERATIONAL_SURFACES_SCRIPT,
} = {}) {
  assertLoopbackHost(host);
  const resolvedRoot = resolve(root);
  const publicDir = resolve(resolvedRoot, "dev/freela-cockpit");
  const resolvedOperationalSurfacesScript = resolve(operationalSurfacesScript ?? OPERATIONAL_SURFACES_SCRIPT);

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        await handleApi({
          request,
          response,
          url,
          root: resolvedRoot,
          dbPath,
          operationalSurfacesScript: resolvedOperationalSurfacesScript,
        });
        return;
      }

      serveStatic({ response, publicDir, pathname: url.pathname });
    } catch (error) {
      sendJson(response, error.status ?? 500, {
        ok: false,
        error: error.message,
        code: error.code ?? "INTERNAL_ERROR",
      });
    }
  });

  return enforceLoopbackListen(server, host);
}

async function handleApi({ request, response, url, root, dbPath, operationalSurfacesScript }) {
  const postBlocker = validatePostRequest({ request });
  if (postBlocker) {
    sendJson(response, postBlocker.status, postBlocker.payload);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/summary") {
    return withReadDb({ root, dbPath }, (database) =>
      sendJson(response, 200, { ok: true, summary: readCockpitSummary(database) }),
    );
  }

  if (request.method === "GET" && url.pathname === "/api/leads") {
    return withReadDb({ root, dbPath }, (database) => {
      if (url.searchParams.has("q")) {
        sendJson(response, 200, {
          ok: true,
          mode: "search",
          leads: searchLeads(database, { q: url.searchParams.get("q") ?? "" }),
        });
        return;
      }

      const kanban = readKanban(database);
      const stage = url.searchParams.get("stage");
      sendJson(response, 200, {
        ok: true,
        mode: "kanban",
        kanban: stage ? { [stage]: kanban[stage] ?? [] } : kanban,
      });
    });
  }

  const leadDetailMatch = url.pathname.match(/^\/api\/leads\/([^/]+)$/);
  if (request.method === "GET" && leadDetailMatch) {
    const leadId = Number.parseInt(decodePathParam(leadDetailMatch[1]), 10);
    if (!Number.isInteger(leadId) || leadId <= 0) {
      throw httpError(400, "Lead id invalido", { code: "INVALID_LEAD_ID" });
    }
    return withReadDb({ root, dbPath }, (database) =>
      sendJson(response, 200, { ok: true, lead: readLeadDetail(database, leadId) }),
    );
  }

  if (request.method === "GET" && url.pathname === "/api/waha") {
    return withReadDb({ root, dbPath }, (database) =>
      sendJson(response, 200, { ok: true, waha: readWahaSummary(database) }),
    );
  }

  if (request.method === "POST" && url.pathname === "/api/command/preview") {
    const body = await readJsonBody(request);
    return withReadDb({ root, dbPath }, (database) =>
      sendJson(response, 200, { ok: true, preview: previewCommand(database, body.command) }),
    );
  }

  const actionMatch = url.pathname.match(/^\/api\/actions\/([^/]+)$/);
  if (request.method === "POST" && actionMatch) {
    const body = await readJsonBody(request);
    const result = await executeCockpitAction({
      root,
      dbPath,
      action: decodePathParam(actionMatch[1]),
      leadId: body.leadId,
      expectedStage: body.expectedStage ?? null,
      payload: body.payload ?? {},
      runCommand: (args) => runCrmCommand({ root, dbPath, args }),
      syncPaperclip: () => syncOperationalSurfaces({ root, operationalSurfacesScript }),
    });
    return sendJson(response, result.ok ? 200 : 409, { ok: result.ok, result });
  }

  if (request.method === "POST" && url.pathname === "/api/refresh-paperclip") {
    const result = await syncOperationalSurfaces({ root, operationalSurfacesScript });
    if (runnerFailed(result)) {
      sendJson(response, 500, { ok: false, result: serializeRunnerResult(result) });
      return;
    }
    sendJson(response, 200, { ok: true, result: serializeRunnerResult(result) });
    return;
  }

  sendJson(response, 404, { ok: false, error: "Rota nao encontrada", code: "NOT_FOUND" });
}

function enforceLoopbackListen(server, configuredHost) {
  const originalListen = server.listen.bind(server);
  server.listen = (...args) => originalListen(...normalizeListenArgs(args, configuredHost));
  return server;
}

function normalizeListenArgs(args, configuredHost) {
  if (args.length === 0) return [{ host: configuredHost }];

  const [first, second, ...rest] = args;

  if (typeof first === "number") {
    if (typeof second === "string") {
      assertLoopbackHost(second);
      return args;
    }
    return [first, configuredHost, second, ...rest].filter((value) => value !== undefined);
  }

  if (first && typeof first === "object" && !("fd" in first)) {
    const options = { ...first };
    if ("path" in options) throw new Error("Freela Cockpit deve escutar apenas em TCP loopback");
    if (options.host) assertLoopbackHost(options.host);
    return [{ ...options, host: options.host ?? configuredHost }, second, ...rest].filter((value) => value !== undefined);
  }

  throw new Error("Freela Cockpit deve escutar apenas em loopback");
}

function assertLoopbackHost(host) {
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error("Freela Cockpit deve escutar apenas em loopback");
  }
}

function withReadDb({ root, dbPath }, fn) {
  const database = openCockpitDatabase({ root, dbPath, readOnly: true });
  try {
    return fn(database);
  } finally {
    database.close();
  }
}

function validatePostRequest({ request }) {
  if (request.method !== "POST") return null;

  const fetchSite = String(request.headers["sec-fetch-site"] ?? "").toLowerCase();
  if (fetchSite === "cross-site") {
    return forbiddenPost("SEC_FETCH_SITE_FORBIDDEN", "Requisicao cross-site bloqueada");
  }

  if (!originAllowed(request)) {
    return forbiddenPost("ORIGIN_FORBIDDEN", "Origin nao permitido");
  }

  if (requestHasBody(request) && !hasJsonContentType(request)) {
    return {
      status: 415,
      payload: {
        ok: false,
        error: "Content-Type JSON obrigatorio",
        code: "UNSUPPORTED_MEDIA_TYPE",
      },
    };
  }

  return null;
}

function forbiddenPost(code, error) {
  return {
    status: 403,
    payload: { ok: false, error, code },
  };
}

function originAllowed(request) {
  const origin = request.headers.origin;
  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(`http://${request.headers.host ?? ""}`);
    return (
      originUrl.protocol === "http:" &&
      LOOPBACK_HOSTS.has(originUrl.hostname) &&
      LOOPBACK_HOSTS.has(requestUrl.hostname) &&
      originUrl.port === requestUrl.port
    );
  } catch {
    return false;
  }
}

function requestHasBody(request) {
  const contentLength = request.headers["content-length"];
  if (contentLength && contentLength !== "0") return true;
  return Boolean(request.headers["transfer-encoding"]);
}

function hasJsonContentType(request) {
  const contentType = String(request.headers["content-type"] ?? "")
    .split(";")
    .at(0)
    .trim()
    .toLowerCase();
  return contentType === "application/json" || contentType.endsWith("+json");
}

async function readJsonBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
  }

  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw httpError(400, "JSON invalido", { code: "INVALID_JSON" });
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function serveStatic({ response, publicDir, pathname }) {
  const file = resolveStaticPath({ publicDir, pathname });
  if (!file) {
    sendJson(response, 404, { ok: false, error: "Arquivo nao encontrado", code: "STATIC_NOT_FOUND" });
    return;
  }

  const stream = createReadStream(file);
  stream.once("error", (error) => {
    if (!response.headersSent) {
      sendJson(response, 500, {
        ok: false,
        error: error.message,
        code: "STATIC_READ_ERROR",
      });
      return;
    }
    response.destroy(error);
  });
  stream.once("open", () => {
    response.writeHead(200, { "Content-Type": MIME.get(extname(file)) ?? "application/octet-stream" });
    stream.pipe(response);
  });
}

function resolveStaticPath({ publicDir, pathname }) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const publicRoot = resolve(publicDir);
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
  let candidate = resolve(publicRoot, relativePath);
  if (!isInside(candidate, publicRoot)) return null;

  try {
    const stats = statSync(candidate);
    if (stats.isDirectory()) {
      candidate = resolve(candidate, "index.html");
      if (!isInside(candidate, publicRoot)) return null;
    }
    const fileStats = statSync(candidate);
    if (!fileStats.isFile()) return null;
  } catch {
    return null;
  }

  try {
    const realRoot = realpathSync(publicRoot);
    const realFile = realpathSync(candidate);
    if (!isInside(realFile, realRoot)) return null;
    return realFile;
  } catch {
    return null;
  }
}

function runCrmCommand({ root, dbPath, args }) {
  return runNode({
    args: [CRM_SCRIPT, "--root", root, ...optionalDb(dbPath), ...args],
    cwd: PROJECT_ROOT,
  });
}

function syncOperationalSurfaces({ root, operationalSurfacesScript = OPERATIONAL_SURFACES_SCRIPT }) {
  if (!existsSync(operationalSurfacesScript)) {
    return Promise.resolve({
      status: 1,
      stdout: "",
      stderr: `paperclip-sync-operational-surfaces.mjs nao encontrado: ${operationalSurfacesScript}\n`,
    });
  }

  return runNode({
    args: [operationalSurfacesScript, "--root", root],
    cwd: PROJECT_ROOT,
  });
}

function optionalDb(dbPath) {
  return dbPath ? ["--db", dbPath] : [];
}

function runNode({ args, cwd }) {
  return new Promise((resolveRun) => {
    let stdout = "";
    let stderr = "";
    let resolved = false;

    function settle(result) {
      if (resolved) return;
      resolved = true;
      resolveRun({
        status: typeof result.status === "number" ? result.status : 1,
        stdout,
        stderr,
        ...result,
      });
    }

    let child;
    try {
      child = spawn(process.execPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      settle({ status: 1, error });
      return;
    }

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      settle({ status: 1, error });
    });
    child.on("close", (status, signal) => {
      settle({ status: status ?? 1, signal });
    });
  });
}

function runnerFailed(result) {
  if (!result) return true;
  if (result.error || result.signal || result.ok === false) return true;
  if (typeof result.status === "number") return result.status !== 0;
  return result.ok !== true;
}

function serializeRunnerResult(result) {
  return {
    ...result,
    error: result?.error ? errorMessage(result.error) : undefined,
  };
}

function httpError(status, message, extra = {}) {
  return Object.assign(new Error(message), { status, ...extra });
}

function decodePathParam(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw httpError(400, "Parametro de rota invalido", { code: "INVALID_PATH_PARAM" });
  }
}

function isInside(child, parent) {
  const relativePath = relative(parent, child);
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}

function parseFlags(argv) {
  const flags = {};
  const rest = [...argv];
  while (rest.length) {
    const token = rest.shift();
    if (!token.startsWith("--")) throw new Error(`Opcao invalida: ${token}`);

    const key = token.slice(2);
    if (!["db", "host", "port", "root"].includes(key)) {
      throw new Error(`Opcao desconhecida: --${key}`);
    }

    const value = rest.shift();
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Valor obrigatorio para --${key}`);
    }
    flags[key] = value;
  }
  return flags;
}

function parsePort(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Porta invalida: ${value}`);
  }
  return parsed;
}

function errorMessage(error) {
  return String(error?.message ?? error);
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const root = resolve(flags.root ?? process.cwd());
  const host = flags.host ?? DEFAULT_HOST;
  const port = parsePort(flags.port ?? `${DEFAULT_PORT}`);
  const server = createCockpitServer({ root, host, port, dbPath: flags.db ?? null });
  server.listen(port, host, () => {
    console.log(`Freela Cockpit: http://${host}:${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
