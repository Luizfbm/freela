import { execFile, execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rootDir = fileURLToPath(new URL("../", import.meta.url));

const followupCrm = () => read("docs/freelancer/prompt-thread-followup-crm.md");
const ceoProspeccao = () => read("docs/freelancer/prompt-thread-ceo-prospeccao.md");
const atendimento = () => read("docs/freelancer/prompt-thread-atendimento-clientes.md");
const criacao72h = () => read("docs/freelancer/prompt-thread-criacao-72h.md");
const prospeccao = () => read("docs/freelancer/prompt-thread-prospeccao-leads.md");
const intakeConversas = () => read("docs/freelancer/prompt-thread-intake-conversas.md");
const qaDemos = () => read("docs/freelancer/prompt-thread-qa-demos.md");
const cooFreelancer = () => read("docs/freelancer/prompt-thread-coo-freelancer.md");
const validadorDados = () => read("docs/freelancer/prompt-thread-validador-dados-leads.md");
const redatorPrimeiraMensagem = () => read("docs/freelancer/prompt-thread-redator-primeira-mensagem.md");
const qaMensagens = () => read("docs/freelancer/prompt-thread-qa-mensagens.md");
const diagnosticoTresPontos = () => read("docs/freelancer/prompt-thread-diagnostico-3-pontos.md");
const checklistEntrega = () => read("docs/freelancer/checklist-entrega.md");
const paperclipReadme = () => read("docs/freelancer/paperclip/README.md");
const browserAutomation = () => read("docs/freelancer/paperclip/browser-automation.md");
const workerHandoffProtocol = () => read("docs/freelancer/paperclip/worker-handoff-protocol.md");
const workerHandoffSchema = () => JSON.parse(read("docs/freelancer/paperclip/worker-handoff.schema.json"));
const triggerProspeccao = () => JSON.parse(read("docs/freelancer/paperclip/trigger-prospeccao-dias-uteis.json"));
const rotinaCrm = () => JSON.parse(read("docs/freelancer/paperclip/routine-followup-crm-diario.json"));
const agentConfig = (name) => JSON.parse(read(`docs/freelancer/paperclip/${name}`));
const agentConfigNames = [
  "agent-atendimento.json",
  "agent-ceo-prospeccao.json",
  "agent-coo-freelancer.json",
  "agent-diagnostico-3-pontos.json",
  "agent-entregas.json",
  "agent-followup-crm.json",
  "agent-intake-conversas.json",
  "agent-validador-dados-leads.json",
  "agent-presenca72h.json",
  "agent-prospeccao.json",
  "agent-qa-demos.json",
  "agent-qa-mensagens.json",
  "agent-redator-primeira-mensagem.json",
  "agent-whatsapp-atendimento.json",
  "agent-whatsapp-guardiao.json",
];
const expectedAgentDisplayNames = new Map([
  ["agent-atendimento.json", "Jhon Snow - Atendimento e Fechamento"],
  ["agent-ceo-prospeccao.json", "Steve - CEO de Prospecção"],
  ["agent-coo-freelancer.json", "Natienska - COO"],
  ["agent-diagnostico-3-pontos.json", "Walter - Diagnóstico 3 Pontos"],
  ["agent-entregas.json", "Tony - Ops de Entrega"],
  ["agent-followup-crm.json", "Polina - Follow-up CRM"],
  ["agent-intake-conversas.json", "Sanji - Intake de Conversas"],
  ["agent-presenca72h.json", "OZZY - Criador Presença 72h"],
  ["agent-prospeccao.json", "Scout - Lead Searcher GV"],
  ["agent-qa-demos.json", "Johan - QA de Demos/Exemplos"],
  ["agent-qa-mensagens.json", "Temma - QA de Mensagens"],
  ["agent-redator-primeira-mensagem.json", "Levi - Redator de Primeira Mensagem"],
  ["agent-validador-dados-leads.json", "Gilmor - Validador de Dados de Leads"],
  ["agent-whatsapp-atendimento.json", "Atendimento WhatsApp"],
  ["agent-whatsapp-guardiao.json", "Guardiao de Envio WhatsApp"],
]);
const browserRuntimeAgentConfigNames = new Set(["agent-coo-freelancer.json", "agent-prospeccao.json"]);
const companyId = "50a2756c-2942-40c1-90f8-b16807a62ef3";
const paperclipInstanceRoot = "/Users/luiz_fbm/.paperclip/instances/default";
const repoRoot = "/Users/luiz_fbm/Developer/freela";
const sqliteWritableRoot = "/Users/luiz_fbm/Library/Application Support/freela-paperclip";

function expectedAgentCodexHome(agentId) {
  return `${paperclipInstanceRoot}/companies/${companyId}/agents/${agentId}/codex-home`;
}

function walkFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walkFiles(path) : [path];
  });
}

function execFileText(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function writeTempAgentConfig(tempRoot, agent, fileName = "agent-sync-test.json") {
  const configDir = join(tempRoot, "docs/freelancer/paperclip");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, fileName), `${JSON.stringify(agent, null, 2)}\n`, "utf8");
}

function writeExecutable(path, body) {
  writeFileSync(path, body, "utf8");
  chmodSync(path, 0o755);
}

async function withAgentApiServer(liveAgents, run) {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const body = bodyText ? JSON.parse(bodyText) : null;
    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body,
    });

    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && req.url === "/api/companies/company-1/agents") {
      res.end(JSON.stringify({ agents: liveAgents }));
      return;
    }

    if (req.method === "PATCH" && req.url?.startsWith("/api/agents/")) {
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    return await run(`http://127.0.0.1:${port}`, requests);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function withPaperclipDocumentServer(initialDocuments, run) {
  const requests = [];
  const documents = new Map(Object.entries(initialDocuments));
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyText = Buffer.concat(chunks).toString("utf8");
    const body = bodyText ? JSON.parse(bodyText) : null;
    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body,
    });

    res.setHeader("Content-Type", "application/json");

    const match = req.url?.match(/^\/api\/issues\/([^/]+)\/documents\/([^/]+)$/);
    if (!match) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    const documentKey = `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`;
    const current = documents.get(documentKey);

    if (req.method === "GET") {
      if (!current) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "not found" }));
        return;
      }
      res.end(JSON.stringify(current));
      return;
    }

    if (req.method === "PUT") {
      const latestRevisionId = `${documentKey}:rev-${requests.filter((request) => request.method === "PUT").length}`;
      const next = {
        key: decodeURIComponent(match[2]),
        title: body.title,
        format: body.format,
        body: body.body,
        latestRevisionId,
      };
      documents.set(documentKey, next);
      res.end(JSON.stringify({ document: next }));
      return;
    }

    res.statusCode = 405;
    res.end(JSON.stringify({ error: "method not allowed" }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    return await run(`http://127.0.0.1:${port}`, requests, documents);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("Configs dos agentes preservam nomes operacionais do Paperclip vivo", () => {
  for (const fileName of agentConfigNames) {
    const agent = agentConfig(fileName);
    assert.equal(agent.name, expectedAgentDisplayNames.get(fileName));
  }
});

test("Follow-up CRM classifica respostas recebidas e roteia o proximo dono", () => {
  const prompt = followupCrm();

  assert.match(prompt, /Classificacao automatica de respostas/i);
  assert.match(prompt, /intencao_detectada/i);
  assert.match(prompt, /resposta_permissao/i);
  assert.match(prompt, /resposta_pediu_exemplo/i);
  assert.match(prompt, /resposta_pediu_preco/i);
  assert.match(prompt, /resposta_objeção|resposta_objecao/i);
  assert.match(prompt, /resposta_sem_interesse/i);
  assert.match(prompt, /triagem-respostas-YYYY-MM-DD\.md/i);
  assert.match(prompt, /Atendimento e Fechamento/i);
  assert.match(prompt, /Criador Presenca 72h|Criador Presença 72h/i);
});

test("Atendimento gera tres pontos reais a partir de evidencias do dossie", () => {
  const prompt = atendimento();

  assert.match(prompt, /3 pontos reais/i);
  assert.match(prompt, /diagnostico-3-pontos-YYYY-MM-DD\.md/i);
  assert.match(prompt, /evidencia_observada/i);
  assert.match(prompt, /fonte_ou_arquivo/i);
  assert.match(prompt, /lead-dossiers\.md/i);
  assert.match(prompt, /atendimento-handoff\.md/i);
  assert.match(prompt, /Nao usar ponto generico|Não usar ponto genérico/i);
  assert.match(prompt, /Ponto 1/i);
  assert.match(prompt, /Ponto 2/i);
  assert.match(prompt, /Ponto 3/i);
});

test("Pedido de exemplo gera handoff privado e aciona o criador correto", () => {
  const crm = followupCrm();
  const presenca72h = criacao72h();

  assert.match(crm, /pedido-exemplo-handoff-YYYY-MM-DD\.md/i);
  assert.match(crm, /tipo_exemplo/i);
  assert.match(crm, /Presenca Local em 72h/i);
  assert.match(crm, /Criador Presenca 72h/i);
  assert.match(crm, /nao criar copy-whatsapp\.md|não criar copy-whatsapp\.md/i);

  assert.match(presenca72h, /pedido-exemplo-handoff-YYYY-MM-DD\.md/i);
  assert.match(presenca72h, /Nao criar copy-whatsapp\.md|Não criar copy-whatsapp\.md/i);
});

test("Presenca Local em 72h e a unica oferta ativa de criacao", () => {
  assert.equal(
    existsSync(join(rootDir, "docs/freelancer/paperclip/agent-essencial.json")),
    false,
    "agent-essencial.json nao deve existir como config ativa",
  );
  assert.equal(
    existsSync(join(rootDir, "docs/freelancer/prompt-thread-criacao-exemplos.md")),
    false,
    "prompt de criacao Essencial nao deve existir como rota ativa",
  );

  const activeDocs = [
    followupCrm(),
    ceoProspeccao(),
    atendimento(),
    criacao72h(),
    qaDemos(),
    cooFreelancer(),
    prospeccao(),
    paperclipReadme(),
    read("docs/freelancer/data-contract.md"),
    read("docs/freelancer/playbook.md"),
    read("docs/freelancer/ofertas.md"),
    read("docs/freelancer/scripts-whatsapp.md"),
    read("docs/freelancer/objecoes.md"),
    workerHandoffProtocol(),
  ];

  for (const doc of activeDocs) {
    assert.doesNotMatch(doc, /Presen[cç]a Local Essencial|Criador Presen[cç]a Essencial/i);
    assert.doesNotMatch(doc, /Essencial vs 72h|Essencial\/72h/i);
    assert.match(doc, /Presen[cç]a Local em 72h/i);
  }

  assert.doesNotMatch(atendimento(), /72h enxuta|escopo_72h|enxuto/i);
  assert.doesNotMatch(followupCrm(), /72h enxuta|escopo_72h|enxuto/i);
  assert.match(criacao72h(), /nivel:\s*Presen[cç]a Local em 72h/i);
  assert.doesNotMatch(criacao72h(), /72h enxuta|escopo_72h|enxuto/i);
  assert.doesNotMatch(qaDemos(), /72h enxuta|escopo_72h|enxuto/i);
});

test("Presenca Local em 72h nao tem rota enxuta nem preco nos bots", () => {
  const activeDocs = [
    ["docs/freelancer/prompt-thread-followup-crm.md", followupCrm()],
    ["docs/freelancer/prompt-thread-atendimento-clientes.md", atendimento()],
    ["docs/freelancer/prompt-thread-criacao-72h.md", criacao72h()],
    ["docs/freelancer/prompt-thread-qa-demos.md", qaDemos()],
    ["docs/freelancer/prompt-thread-coo-freelancer.md", cooFreelancer()],
    ["docs/freelancer/prompt-thread-prospeccao-leads.md", prospeccao()],
    ["docs/freelancer/prompt-thread-diagnostico-3-pontos.md", diagnosticoTresPontos()],
    ["docs/freelancer/prompt-thread-redator-primeira-mensagem.md", redatorPrimeiraMensagem()],
    ["docs/freelancer/prompt-thread-qa-mensagens.md", qaMensagens()],
    ["docs/freelancer/paperclip/README.md", paperclipReadme()],
    ["docs/freelancer/paperclip/worker-handoff-protocol.md", workerHandoffProtocol()],
    ["docs/freelancer/data-contract.md", read("docs/freelancer/data-contract.md")],
    ["docs/freelancer/ofertas.md", read("docs/freelancer/ofertas.md")],
    ["docs/freelancer/playbook.md", read("docs/freelancer/playbook.md")],
    ["docs/freelancer/scripts-whatsapp.md", read("docs/freelancer/scripts-whatsapp.md")],
    ["docs/freelancer/objecoes.md", read("docs/freelancer/objecoes.md")],
  ];

  for (const [path, doc] of activeDocs) {
    assert.doesNotMatch(
      doc,
      /72h enxuta|escopo_72h:\s*enxuto|enxuto\|padrao|enxuto ou padrao|vers[aã]o enxuta|R\$\s*397|397 reais|pre[cç]o baixo|pacote barato/i,
      path,
    );
    assert.match(doc, /Presen[cç]a Local em 72h/i, path);
  }

  assert.match(atendimento(), /nao fala pre[cç]o|nao deve falar pre[cç]o|não fala preço|não deve falar preço/i);
  assert.match(followupCrm(), /preco_pedido|preço_pedido|pedido de preco|pedido de preço/i);
  assert.match(criacao72h(), /nivel:\s*Presen[cç]a Local em 72h/i);
  assert.doesNotMatch(criacao72h(), /escopo_72h/i);
  assert.doesNotMatch(qaDemos(), /escopo_72h|enxuto/i);
});

test("Demos antigas preservam sites sem artefatos operacionais", () => {
  const demoRoot = join(rootDir, "demos");
  const files = walkFiles(demoRoot).map((path) => relative(rootDir, path).replaceAll("\\", "/"));

  const forbiddenArtifacts = files.filter((path) => {
    const fileName = path.split("/").at(-1);
    return (
      fileName === ".DS_Store" ||
      fileName === "README.md" ||
      fileName === "copy-whatsapp.md" ||
      fileName === "whatsapp-links.js" ||
      /^screenshot-.*\.png$/.test(fileName) ||
      path.startsWith("demos/research/") ||
      path.startsWith("demos/thumbnails/")
    );
  });

  assert.deepEqual(forbiddenArtifacts, []);

  const demoSites = files.filter((path) => /^demos\/[^/]+\/index\.html$/.test(path));
  assert.ok(demoSites.length > 0, "ao menos um site demo deve permanecer");

  const panel = read("demos/index.html");
  const gallery = read("demos/gallery.js");
  const cpanelDeploy = read(".cpanel.yml");

  assert.doesNotMatch(panel, /README\.md|whatsapp-links\.js/i);
  assert.doesNotMatch(gallery, /copy-whatsapp\.md|screenshot-(desktop|mobile)\.png|demoWhatsappLinks|wa\.me|thumbnails/i);
  assert.match(cpanelDeploy, /rsync .*--delete .*demos\/.*\$DEPLOYPATH\/demos\//i);
});

test("Deploy automatico para cPanel usa GitHub Actions sem segredos no repo", () => {
  const workflowPath = ".github/workflows/deploy-cpanel.yml";
  const guidePath = "docs/deploy-cpanel.md";

  assert.equal(existsSync(join(rootDir, workflowPath)), true, `${workflowPath} deve existir`);
  assert.equal(existsSync(join(rootDir, guidePath)), true, `${guidePath} deve existir`);

  const workflow = read(workflowPath);
  const guide = read(guidePath);

  assert.match(workflow, /name:\s*Deploy cPanel/i);
  assert.match(workflow, /push:/i);
  assert.match(workflow, /branches:\s*\[\s*main\s*\]/i);
  assert.match(workflow, /workflow_dispatch:/i);
  assert.match(workflow, /concurrency:/i);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/i);
  assert.match(workflow, /timeout-minutes:/i);

  for (const requiredSecret of ["CPANEL_SSH_HOST", "CPANEL_SSH_USER", "CPANEL_SSH_KEY"]) {
    assert.match(workflow, new RegExp(`secrets\\.${requiredSecret}`));
    assert.match(guide, new RegExp(requiredSecret));
  }

  for (const requiredVariable of ["CPANEL_REPO_PATH", "CPANEL_BRANCH", "CPANEL_UAPI_BIN"]) {
    assert.match(workflow, new RegExp(`vars\\.${requiredVariable}`));
    assert.match(guide, new RegExp(requiredVariable));
  }

  assert.match(workflow, /CPANEL_SSH_KNOWN_HOSTS/i);
  assert.match(workflow, /git pull --ff-only origin "\$CPANEL_BRANCH"/i);
  assert.match(workflow, /VersionControlDeployment create repository_root="\$CPANEL_REPO_PATH"/i);
  assert.match(workflow, /ssh-keyscan/i);
  assert.match(workflow, /IdentityAgent=none/i);
  assert.match(workflow, /PreferredAuthentications=publickey/i);
  assert.match(workflow, /PasswordAuthentication=no/i);
  assert.match(workflow, /PAPERCLIP_DEPLOY_REMOTE_OK/i);
  assert.match(workflow, /Shell access is not enabled/i);
  assert.match(workflow, /^          REMOTE$/m);
  assert.doesNotMatch(workflow, /^REMOTE$/m);

  assert.match(workflow, /CPANEL_API_TOKEN/i);
  assert.match(workflow, /VersionControl\/update/i);
  assert.match(workflow, /VersionControlDeployment\/create/i);
  assert.match(workflow, /uapi_status\(\)/i);
  assert.match(workflow, /\.result\.status\s*\/\/\s*\.status/i);
  assert.match(workflow, /\.result\.data\s*\/\/\s*\.data/i);
  assert.match(workflow, /\.result\.errors\s*\/\/\s*\.errors/i);
  assert.match(workflow, /normalize_deployable\(\)/i);
  assert.match(workflow, /\.deployable\s*==\s*true/i);
  assert.match(workflow, /\.deployable\s*==\s*1/i);
  assert.match(workflow, /\.deployable\s*==\s*"true"/i);
  assert.match(workflow, /PAPERCLIP_DEPLOY_UPDATE_ONLY_OK/i);
  assert.match(workflow, /repository reports deployable=/i);

  assert.match(guide, /agentes podem acionar deploy automatico|agentes podem acionar deploy automático/i);
  assert.match(guide, /nao usar cPanel manual|não usar cPanel manual/i);
  assert.match(guide, /Actions > Deploy cPanel/i);
  assert.match(guide, /update-only/i);
  assert.match(guide, /repo do cPanel ja e a raiz publicada|repo do cPanel já é a raiz publicada/i);
  assert.match(guide, /Authorized Keys/i);
  assert.match(guide, /Deploy Key read-only/i);
  assert.match(guide, /\/usr\/bin\/uapi|\/usr\/local\/cpanel\/bin\/uapi/i);
  assert.doesNotMatch(`${workflow}\n${guide}`, /BEGIN (OPENSSH|RSA|EC|DSA) PRIVATE KEY/);
});

test("Paperclip orienta agentes a usar deploy automatico, nao cPanel manual", () => {
  const readme = paperclipReadme();
  const coo = cooFreelancer();
  const entrega = checklistEntrega();
  const qa = qaDemos();
  const ops = agentConfig("agent-entregas.json");

  for (const doc of [readme, coo, entrega, qa]) {
    assert.match(doc, /deploy automatico|deploy automático/i);
    assert.match(doc, /GitHub Actions/i);
    assert.match(doc, /Actions > Deploy cPanel/i);
    assert.match(doc, /push.*main|main.*push/i);
    assert.match(doc, /agente[s]?.*podem?.*deploy automatico|agente[s]?.*podem?.*deploy automático/i);
    assert.match(doc, /nao usar cPanel manual|não usar cPanel manual/i);
    assert.match(doc, /nao usar FTP|não usar FTP/i);
    assert.match(doc, /nao fazer SSH manual|não fazer SSH manual/i);
  }

  assert.match(ops.capabilities, /deploy automatico|deploy automático/i);
});

test("WhatsApp Gateway e o unico ponto autorizado a chamar bridge send", () => {
  const gateway = read("scripts/whatsapp-local-gateway.mjs");
  const readme = paperclipReadme();
  const wahaGuide = read("docs/freelancer/paperclip/whatsapp-waha-local.md");
  const controlledDocs = `${wahaGuide}\n${readme}`;
  const scriptSendCallers = walkFiles(join(rootDir, "scripts"))
    .filter((path) => readFileSync(path, "utf8").includes("/api/send"))
    .map((path) => relative(rootDir, path))
    .sort();
  const wahaSendTextCallers = walkFiles(join(rootDir, "scripts"))
    .filter((path) => readFileSync(path, "utf8").includes("/api/sendText"))
    .map((path) => relative(rootDir, path))
    .sort();

  assert.match(gateway, /import-jsonl/i);
  assert.match(gateway, /import-waha-event/i);
  assert.match(gateway, /serve-waha-webhook/i);
  assert.match(gateway, /dispatch-approved-outbox/i);
  assert.match(gateway, /\/api\/send/i);
  assert.match(gateway, /\/api\/sendText/i);
  assert.deepEqual(scriptSendCallers, ["scripts/whatsapp-local-gateway.mjs"]);
  assert.deepEqual(wahaSendTextCallers, ["scripts/whatsapp-local-gateway.mjs"]);
  assert.doesNotMatch(gateway, /send_message|send_file|send_audio_message/i);
  assert.doesNotMatch(gateway, /whatsapp-mcp|import-mcp-sqlite|watch-mcp-sqlite|WHATSAPP_MCP/i);
  for (const term of [/Humanizer/i, /Outbox/i, /Guardiao|Guardião/i, /Gateway/i]) {
    assert.match(controlledDocs, term);
  }
});

test("WAHA local fica em laboratorio ate ACK forte confirmar entrega", () => {
  const readme = paperclipReadme();
  const wahaGuide = read("docs/freelancer/paperclip/whatsapp-waha-local.md");
  const gateway = read("scripts/whatsapp-local-gateway.mjs");
  const crm = read("scripts/freela-crm.mjs");

  for (const doc of [readme, wahaGuide]) {
    assert.match(doc, /WAHA/i);
    assert.match(doc, /laboratorio|laboratório/i);
    assert.match(doc, /--provider waha/i);
    assert.match(doc, /delivery_pending/i);
    assert.match(doc, /message\.ack/i);
    assert.match(doc, /DEVICE|READ|PLAYED/i);
    assert.match(doc, /message\.waiting/i);
    assert.match(doc, /@c\.us/i);
    assert.match(doc, /@lid/i);
  }

  assert.match(gateway, /dispatch_provider/i);
  assert.match(gateway, /provider_message_id/i);
  assert.match(gateway, /delivery_pending/i);
  assert.match(gateway, /message\.ack/i);
  assert.match(gateway, /message\.waiting/i);
  assert.match(crm, /delivery_ack_name/i);
  assert.match(crm, /delivered_at/i);
});

test("WAHA local usa Docker Compose com sessao persistente e webhook inbound seguro", () => {
  const compose = read("docker-compose.waha.yml");
  const guide = read("docs/freelancer/paperclip/whatsapp-waha-local.md");

  assert.match(compose, /container_name:\s*freela-waha/i);
  assert.match(compose, /image:\s*devlikeapro\/waha:latest/i);
  assert.match(compose, /platform:\s*linux\/amd64/i);
  assert.match(compose, /127\.0\.0\.1:3000:3000/i);
  assert.match(compose, /\.\/\.scratch\/waha\/\.sessions:\/app\/\.sessions/i);
  assert.match(compose, /restart:\s*unless-stopped/i);
  assert.match(compose, /WHATSAPP_HOOK_URL=http:\/\/host\.docker\.internal:3105\/waha\/webhook/i);
  assert.match(compose, /WHATSAPP_HOOK_EVENTS=message,message\.ack,message\.waiting/i);
  assert.match(compose, /WHATSAPP_HOOK_CUSTOM_HEADERS=X-Webhook-Secret:\$\{WHATSAPP_WAHA_WEBHOOK_SECRET(?::\?[^}]*)?\}/i);
  assert.match(compose, /WAHA_API_KEY=\$\{WAHA_API_KEY(?::\?[^}]*)?\}/i);
  assert.match(compose, /WAHA_DASHBOARD_USERNAME=\$\{WAHA_DASHBOARD_USERNAME:-admin\}/i);
  assert.match(compose, /WAHA_DASHBOARD_PASSWORD=\$\{WAHA_DASHBOARD_PASSWORD(?::\?[^}]*)?\}/i);
  assert.match(compose, /WHATSAPP_SWAGGER_USERNAME=\$\{WHATSAPP_SWAGGER_USERNAME:-admin\}/i);
  assert.match(compose, /WHATSAPP_SWAGGER_PASSWORD=\$\{WHATSAPP_SWAGGER_PASSWORD(?::\?[^}]*)?\}/i);
  assert.doesNotMatch(compose, /0\.0\.0\.0:3000/i);
  assert.doesNotMatch(compose, /^\s*-\s*["']?3000:3000["']?\s*$/im);

  assert.match(guide, /docker compose -f docker-compose\.waha\.yml up -d/i);
  assert.match(guide, /host\.docker\.internal:3105\/waha\/webhook/i);
  assert.match(guide, /127\.0\.0\.1:3000/i);
  assert.match(guide, /\/app\/\.sessions/i);
  assert.match(guide, /WAHA_API_KEY/i);
  assert.match(guide, /WAHA_DASHBOARD_PASSWORD/i);
  assert.match(guide, /127\.0\.0\.1:3105/i);
  assert.match(guide, /--host\s+0\.0\.0\.0/i);
  assert.match(guide, /WHATSAPP_WAHA_WEBHOOK_SECRET/i);
});

test("WAHA pleno usa Outbox-first para respostas seguras e preserva manual para excecoes", () => {
  const dataContract = read("docs/freelancer/data-contract.md");
  const readme = paperclipReadme();
  const waha = read("docs/freelancer/paperclip/whatsapp-waha-local.md");

  for (const [name, doc] of [
    ["data-contract", dataContract],
    ["paperclip README", readme],
    ["WAHA local", waha],
  ]) {
    assert.match(doc, /Outbox-first|Outbox first|outbox-first/i, `${name} deve nomear o modo alvo`);
    assert.match(
      doc,
      /pos-consentimento|p[oó]s-consentimento|depois do "Pode/i,
      `${name} deve limitar a respostas apos consentimento`,
    );
    assert.match(
      doc,
      /primeira abordagem fria.*manual|manual.*primeira abordagem fria/is,
      `${name} deve manter primeira abordagem manual`,
    );
    assert.match(doc, /preco|preço|fechamento|proposta/i, `${name} deve preservar excecoes comerciais`);
    assert.match(doc, /ACK forte|DEVICE|READ|PLAYED/i, `${name} deve exigir ACK forte para entrega`);
    assert.match(doc, /dispatch_ambiguous/i, `${name} deve tratar ambiguidade como excecao operacional`);
    assert.doesNotMatch(
      doc,
      /\/api\/sendText.*permitido|permitido.*\/api\/sendText/i,
      `${name} nao pode liberar envio cru`,
    );
  }
});

test("README documenta fronteira atual de automacao WhatsApp", () => {
  const readme = paperclipReadme();

  assert.match(readme, /primeira abordagem fria continua manual/i);
  assert.match(readme, /workers nao recebem ferramentas cruas de envio/i);
  assert.match(readme, /depois do "Pode!".*automaticamente.*Gateway.*Outbox aprovada.*Humanizer.*Guardiao/is);
  assert.match(readme, /preco.*fechamento.*handoff.*Luiz/is);
  assert.doesNotMatch(readme, /WhatsApp continua manual/i);
  assert.doesNotMatch(readme, /sem envio automatico de WhatsApp/i);
});

test("WhatsApp workers exigem Humanizer antes de qualquer Outbox automatica", () => {
  const atendimentoWa = read("docs/freelancer/prompt-thread-whatsapp-atendimento.md");
  const guardiaoWa = read("docs/freelancer/prompt-thread-whatsapp-guardiao.md");
  const guide = read("docs/freelancer/paperclip/whatsapp-waha-local.md");

  assert.match(atendimentoWa, /humanizer/i);
  assert.match(atendimentoWa, /humanizer_pass\s*=\s*true/i);
  assert.match(atendimentoWa, /used_last_inbound\s*=\s*true/i);
  assert.match(atendimentoWa, /contextual_reply\s*=\s*true/i);
  assert.match(guardiaoWa, /humanizer_pass\s*=\s*true/i);
  assert.match(guardiaoWa, /5 respostas automaticas|5 respostas automáticas/i);
  assert.match(guide, /dispatch-approved-outbox/i);
  assert.match(guide, /serve-waha-webhook/i);
});

test("WhatsApp MCP foi removido da superficie operacional ativa", () => {
  const mcpGuidePath = join(rootDir, "docs/freelancer/paperclip/whatsapp-mcp-local.md");
  const activeFiles = [
    ...walkFiles(join(rootDir, "docs/freelancer"))
      .filter((path) => !path.includes("/docs/freelancer/paperclip/whatsapp-mcp-local.md"))
      .filter((path) => !path.includes("/docs/freelancer/superpowers/")),
    join(rootDir, "scripts/whatsapp-local-gateway.mjs"),
  ];

  assert.equal(existsSync(mcpGuidePath), false);
  for (const path of activeFiles) {
    const text = readFileSync(path, "utf8");
    assert.doesNotMatch(text, /lharries\/whatsapp-mcp|whatsapp-mcp|import-mcp-sqlite|watch-mcp-sqlite|WHATSAPP_MCP/i);
    assert.doesNotMatch(text, /send_message|send_file|send_audio_message/i);
  }
});

test("WhatsApp Identity e auto-wake ficam documentados no contrato operacional", () => {
  const guide = read("docs/freelancer/paperclip/whatsapp-waha-local.md");
  const contract = read("docs/freelancer/data-contract.md");
  const readme = paperclipReadme();
  const gateway = read("scripts/whatsapp-local-gateway.mjs");
  const crm = read("scripts/freela-crm.mjs");

  for (const doc of [guide, contract, readme]) {
    assert.match(doc, /@lid/i);
    assert.match(doc, /whatsapp identity link/i);
    assert.match(doc, /whatsapp unmatched reconcile/i);
    assert.match(doc, /Sem identidade/i);
    assert.match(doc, /--auto-wake/i);
    assert.match(doc, /--host\s+0\.0\.0\.0/i);
    assert.match(doc, /WHATSAPP_WAHA_WEBHOOK_SECRET/i);
    assert.match(doc, /whatsapp_worker_wakes/i);
  }

  assert.match(gateway, /paperclip-api-base/i);
  assert.match(gateway, /assigneeAgentId/i);
  assert.match(gateway, /whatsapp_worker_wakes/i);
  assert.match(crm, /whatsapp_identity_aliases/i);
  assert.match(crm, /whatsapp_unmatched_inbound_events/i);
});

test("WhatsApp auto-wake roteia fechamento para Jhon Snow", () => {
  const guide = read("docs/freelancer/paperclip/whatsapp-waha-local.md");
  const contract = read("docs/freelancer/data-contract.md");
  const readme = paperclipReadme();
  const gateway = read("scripts/whatsapp-local-gateway.mjs");
  const crm = read("scripts/freela-crm.mjs");

  for (const doc of [guide, contract, readme]) {
    assert.match(doc, /Atendimento WhatsApp.*conversa normal|conversa normal.*Atendimento WhatsApp/is);
    assert.match(doc, /Jhon Snow|Atendimento e Fechamento/i);
    assert.match(doc, /preco_pedido|preço|pedido de preco|pedido de preço/i);
    assert.match(doc, /lead_quente/i);
    assert.match(doc, /objecao_comercial|obje[cç][aã]o comercial/i);
    assert.match(doc, /--closer-agent-id/i);
  }

  assert.match(gateway, /DEFAULT_CLOSER_AGENT_ID/);
  assert.match(gateway, /WHATSAPP_CLOSER_WAKE_TYPE/);
  assert.match(gateway, /resposta_lead_quente/);
  assert.match(gateway, /resposta_objecao/);
  assert.match(crm, /resposta_lead_quente/);
  assert.match(crm, /objecao_comercial/);
});

test("WhatsApp handoff notifica Luiz sem enviar mensagem", () => {
  const script = read("scripts/paperclip-create-whatsapp-handoff.mjs");
  const readme = paperclipReadme();

  assert.match(script, /preco_pedido|lead_quente|handoff_luiz/i);
  assert.match(script, /POST/i);
  assert.match(script, /\/api\/companies\/\$\{encodeURIComponent\(companyId\)\}\/issues/i);
  assert.doesNotMatch(script, /send_message|send_file|send_audio_message|whatsapp-mcp/i);
  assert.match(readme, /Notificador Luiz/i);
});

test("Workers WhatsApp separam atendimento de guardiao e nao enviam direto", () => {
  const atendimentoWa = read("docs/freelancer/prompt-thread-whatsapp-atendimento.md");
  const guardiaoWa = read("docs/freelancer/prompt-thread-whatsapp-guardiao.md");
  const atendimentoAgent = agentConfig("agent-whatsapp-atendimento.json");
  const guardiaoAgent = agentConfig("agent-whatsapp-guardiao.json");

  assert.match(atendimentoWa, /Atendimento do Luiz/i);
  assert.match(atendimentoWa, /nao envia|não envia/i);
  assert.match(atendimentoWa, /tom direto/i);
  assert.match(atendimentoWa, /nao fala preco|não fala preço/i);
  assert.match(guardiaoWa, /Guardiao de Envio/i);
  assert.match(guardiaoWa, /bloquear/i);
  assert.match(guardiaoWa, /R\$ 397|397|enxuta/i);
  assert.doesNotMatch(atendimentoWa, /send_message|send_file|send_audio_message/i);
  assert.doesNotMatch(guardiaoWa, /send_message|send_file|send_audio_message/i);
  assert.match(atendimentoAgent.capabilities, /respostas curtas/i);
  assert.match(guardiaoAgent.capabilities, /outbox/i);
});

test("Guardiao WhatsApp despacha somente via Gateway com outbox id explicito", () => {
  const guardiaoWa = read("docs/freelancer/prompt-thread-whatsapp-guardiao.md");
  const guide = read("docs/freelancer/paperclip/whatsapp-waha-local.md");
  const readme = paperclipReadme();
  const guardiaoAgent = agentConfig("agent-whatsapp-guardiao.json");

  for (const doc of [guardiaoWa, guide, readme]) {
    assert.match(doc, /whatsapp outbox status/i);
    assert.match(doc, /dispatch-approved-outbox/i);
    assert.match(doc, /--outbox-id/i);
    assert.match(doc, /delivery_pending/i);
    assert.match(doc, /message\.ack/i);
  }

  assert.match(guardiaoWa, /nao chamar.*\/api\/sendText|não chamar.*\/api\/sendText/is);
  assert.match(guardiaoWa, /Unauthorized/i);
  assert.match(guardiaoWa, /check-exists/i);
  assert.match(guardiaoWa, /falha de credencial|falha de transporte/i);
  assert.match(guardiaoWa, /nao .*bloqueio de conteudo|não .*bloqueio de conteúdo/is);
  assert.match(guardiaoWa, /dispatch_ambiguous/i);
  assert.match(guardiaoWa, /nova Outbox|liberacao explicita auditada|liberação explícita auditada/i);
  assert.match(guardiaoAgent.capabilities, /Gateway/i);
  assert.match(guardiaoAgent.capabilities, /outbox-id/i);
  assert.match(guardiaoAgent.capabilities, /transporte|credencial/i);
});

test("Workers WhatsApp compartilham contexto de falha WAHA operacional", () => {
  const transportFailureDocs = [
    ["COO Freelancer", read("docs/freelancer/prompt-thread-coo-freelancer.md")],
    ["Atendimento WhatsApp", read("docs/freelancer/prompt-thread-whatsapp-atendimento.md")],
    ["Atendimento e Fechamento", read("docs/freelancer/prompt-thread-atendimento-clientes.md")],
    ["Follow-up CRM", read("docs/freelancer/prompt-thread-followup-crm.md")],
    ["Redator de Primeira Mensagem", read("docs/freelancer/prompt-thread-redator-primeira-mensagem.md")],
    ["QA de Mensagens", read("docs/freelancer/prompt-thread-qa-mensagens.md")],
    ["Guardiao de Envio WhatsApp", read("docs/freelancer/prompt-thread-whatsapp-guardiao.md")],
  ];

  for (const [name, doc] of transportFailureDocs) {
    assert.match(doc, /Unauthorized/i, `${name} deve reconhecer Unauthorized WAHA`);
    assert.match(doc, /check-exists/i, `${name} deve reconhecer falha no check-exists`);
    assert.match(doc, /dispatch_ambiguous/i, `${name} deve reconhecer outbox ambigua`);
    assert.match(doc, /falha de credencial|falha de transporte|transporte\/credencial/i, `${name} deve classificar como transporte/credencial`);
    assert.match(doc, /nao .*bloqueio de conteudo|não .*bloqueio de conteúdo/is, `${name} nao deve chamar transporte de bloqueio de conteudo`);
    assert.match(doc, /nova Outbox|liberacao explicita auditada|liberação explícita auditada/i, `${name} deve exigir novo teste auditado`);
    assert.doesNotMatch(doc, /chame\s+\/api\/sendText|chamar\s+\/api\/sendText diretamente/i, `${name} nao deve orientar envio cru`);
  }

  const contextAwareAgents = [
    agentConfig("agent-coo-freelancer.json"),
    agentConfig("agent-whatsapp-atendimento.json"),
    agentConfig("agent-whatsapp-guardiao.json"),
    agentConfig("agent-atendimento.json"),
    agentConfig("agent-followup-crm.json"),
    agentConfig("agent-redator-primeira-mensagem.json"),
    agentConfig("agent-qa-mensagens.json"),
  ];

  for (const agent of contextAwareAgents) {
    assert.match(agent.capabilities, /transporte|credencial|dispatch_ambiguous|WAHA/i, `${agent.name} deve expor contexto WAHA nas capabilities`);
  }
});

test("Pedido de exemplo no WhatsApp passa por demo completa e QA antes do envio", () => {
  const followup = followupCrm();
  const criador = criacao72h();
  const qa = qaDemos();
  const atendimentoWa = read("docs/freelancer/prompt-thread-whatsapp-atendimento.md");
  const guardiaoWa = read("docs/freelancer/prompt-thread-whatsapp-guardiao.md");

  for (const doc of [followup, criador, qa, atendimentoWa, guardiaoWa]) {
    assert.match(doc, /demo-brief/i);
    assert.match(doc, /QA de Demos|qa-demos/i);
  }
  assert.match(atendimentoWa, /nao enviar link direto|não enviar link direto/i);
  assert.match(guardiaoWa, /exemplo_aprovado_para_envio/i);
  assert.doesNotMatch(atendimentoWa, /copy-whatsapp\.md/i);
});

test("Demo aprovada pedida no WhatsApp vira nova Outbox, nao fluxo manual", () => {
  const atendimentoComercial = atendimento();
  const atendimentoWa = read("docs/freelancer/prompt-thread-whatsapp-atendimento.md");
  const readme = paperclipReadme();
  const jhonAgent = agentConfig("agent-atendimento.json");
  const atendimentoWaAgent = agentConfig("agent-whatsapp-atendimento.json");

  for (const [name, doc] of [
    ["Atendimento e Fechamento", atendimentoComercial],
    ["Atendimento WhatsApp", atendimentoWa],
    ["Paperclip README", readme],
  ]) {
    assert.match(
      doc,
      /demo ja aprovada|demo já aprovada|exemplo aprovado|exemplo_aprovado_para_envio/i,
      `${name} deve reconhecer demo ja aprovada`,
    );
    assert.match(
      doc,
      /whatsapp outbox propose/i,
      `${name} deve criar nova Outbox para link aprovado`,
    );
    assert.match(
      doc,
      /Guardiao|Guardião/i,
      `${name} deve passar pelo Guardiao`,
    );
    assert.match(
      doc,
      /dispatch-approved-outbox[\s\S]*--outbox-id|--outbox-id[\s\S]*dispatch-approved-outbox/i,
      `${name} deve despachar pelo Gateway com outbox id explicito`,
    );
    assert.match(
      doc,
      /nao usar lead-cards|não usar lead-cards|nao cair em lead-cards|não cair em lead-cards/i,
      `${name} nao deve voltar para lead-cards quando a demo ja esta aprovada`,
    );
    assert.match(
      doc,
      /manual[\s\S]*(Guardiao|Guardião)[\s\S]*bloque|manual[\s\S]*WAHA[\s\S]*falh|manual[\s\S]*(preco|preço|fechamento)/i,
      `${name} deve limitar fallback manual a bloqueio, falha WAHA ou fechamento/preco`,
    );
  }

  assert.match(jhonAgent.capabilities, /demo.*aprovad|exemplo_aprovado_para_envio/i);
  assert.match(jhonAgent.capabilities, /Outbox|Gateway/i);
  assert.match(atendimentoWaAgent.capabilities, /demo.*aprovad|exemplo_aprovado_para_envio/i);
  assert.match(atendimentoWaAgent.capabilities, /Outbox|Gateway/i);
});

test("Follow-up CRM usa matriz inteligente por etapa do lead", () => {
  const prompt = followupCrm();

  assert.match(prompt, /Matriz de follow-up inteligente/i);
  assert.match(prompt, /aguardando_envio_manual/i);
  assert.match(prompt, /enviado/i);
  assert.match(prompt, /diagnostico_enviado/i);
  assert.match(prompt, /exemplo_enviado/i);
  assert.match(prompt, /preco_pedido|proposta_enviada/i);
  assert.match(prompt, /followup_inteligente-YYYY-MM-DD\.md/i);
  assert.match(prompt, /motivo_do_followup/i);
  assert.match(prompt, /nao repetir a mesma mensagem|não repetir a mesma mensagem/i);
});

test("Rotina diaria gera resumo executivo comercial", () => {
  const prompt = followupCrm();
  const routine = rotinaCrm();

  assert.match(prompt, /Resumo diario executivo|Resumo diário executivo/i);
  assert.match(prompt, /resumo-executivo-YYYY-MM-DD\.md/i);
  assert.match(prompt, /leads_para_enviar/i);
  assert.match(prompt, /respostas_recebidas/i);
  assert.match(prompt, /leads_quentes/i);
  assert.match(prompt, /acoes_do_usuario_hoje/i);
  assert.match(prompt, /riscos_ou_bloqueios/i);
  assert.match(routine.description, /resumo-executivo/i);
  assert.match(routine.description, /hoje-enviar\.md/i);
});

test("Paperclip expõe cards de leads copiáveis no FRE-7", () => {
  const readme = paperclipReadme();
  const crm = followupCrm();
  const coo = cooFreelancer();
  const atendimentoPrompt = atendimento();
  const syncScript = read("scripts/paperclip-sync-lead-cards.mjs");

  assert.match(readme, /paperclip-lead-cards\.md/i);
  assert.match(readme, /documento `lead-cards`.*FRE-7/i);
  assert.match(readme, /scripts\/paperclip-sync-lead-cards\.mjs/i);
  assert.match(readme, /automaticamente.*lead-cards|lead-cards.*automaticamente/i);

  assert.match(crm, /queue set-message/i);
  assert.doesNotMatch(crm, /paperclip-sync-lead-cards\.mjs/i);
  assert.match(crm, /handoff.*COO.*lead-cards|COO.*publicar.*lead-cards/is);
  assert.match(crm, /lead-cards/i);
  assert.match(crm, /15 mensagens|mensagens.*15/i);

  assert.match(coo, /paperclip-sync-lead-cards\.mjs/i);
  assert.match(coo, /lead-cards/i);
  assert.match(coo, /15 leads|leads.*15/i);

  assert.match(atendimentoPrompt, /paperclip-sync-lead-cards\.mjs/i);
  assert.match(atendimentoPrompt, /15 mensagens|mensagens.*15/i);

  assert.doesNotMatch(syncScript, /npx|paperclipai/i);
  assert.match(syncScript, /fetch\(/i);
  assert.match(syncScript, /\/api\/issues\/\$\{encodeURIComponent\(issue\)\}\/documents\/\$\{encodeURIComponent\(key\)\}/i);
  assert.match(syncScript, /PAPERCLIP_API_URL/i);
  assert.match(syncScript, /PAPERCLIP_API_KEY/i);
  assert.match(syncScript, /PAPERCLIP_RUN_ID/i);
  assert.match(syncScript, /timeout-ms/i);
  assert.match(syncScript, /AbortController/i);
  assert.match(syncScript, /baseRevisionId/i);
  assert.match(syncScript, /changeSummary/i);
  assert.match(syncScript, /FRE-7/i);
});

test("sync de lead-cards preserva cards remotos ainda acionaveis", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "paperclip-lead-cards-merge-"));
  const scriptsDir = join(tempRoot, "scripts");
  const cardsDir = join(tempRoot, ".scratch/crm");
  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(cardsDir, { recursive: true });

  writeFileSync(
    join(scriptsDir, "freela-crm.mjs"),
    `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[process.argv.indexOf("--root") + 1];
mkdirSync(join(root, ".scratch/crm"), { recursive: true });
writeFileSync(join(root, ".scratch/crm/paperclip-lead-cards.md"), \`# Leads para copiar e enviar - 2026-06-21

Superficie: acao_manual_hoje
Somente mensagens prontas e aprovadas para envio manual hoje.

## 1. Lead Novo da Rodada

- Status: novo

Mensagem pronta:

\\\`\\\`\\\`text
Mensagem nova.
\\\`\\\`\\\`

---

## 2. Lead Atualizado

- Status: novo

Mensagem pronta:

\\\`\\\`\\\`text
Mensagem atualizada.
\\\`\\\`\\\`

---
\`, "utf8");
`,
    "utf8",
  );

  const remoteBody = `# Leads para copiar e enviar - 2026-06-20

Superficie: acao_manual_hoje
Somente mensagens prontas e aprovadas para envio manual hoje.

## 1. Lead Antigo Acionavel

- Status: novo

Mensagem pronta:

\`\`\`text
Mensagem antiga ainda acionavel.
\`\`\`

---

## 2. Lead Atualizado

- Status: novo

Mensagem pronta:

\`\`\`text
Mensagem antiga que deve sair.
\`\`\`

---
`;

  await withPaperclipDocumentServer(
    {
      "FRE-7/lead-cards": {
        key: "lead-cards",
        title: "Leads para copiar e enviar",
        format: "markdown",
        body: remoteBody,
        latestRevisionId: "rev-remota-1",
      },
    },
    async (apiBase, requests, documents) => {
      await execFileText(process.execPath, [
        join(rootDir, "scripts/paperclip-sync-lead-cards.mjs"),
        "--root",
        tempRoot,
        "--issue",
        "FRE-7",
        "--key",
        "lead-cards",
        "--api-base",
        apiBase,
        "--timeout-ms",
        "1000",
        "--date",
        "2026-06-21",
      ]);

      const putRequest = requests.find((request) => request.method === "PUT");
      assert.ok(putRequest, "sync deve publicar documento atualizado");
      assert.equal(putRequest.body.baseRevisionId, "rev-remota-1");

      const finalBody = documents.get("FRE-7/lead-cards").body;
      assert.match(finalBody, /Lead Novo da Rodada/i);
      assert.match(finalBody, /Mensagem nova/i);
      assert.match(finalBody, /Lead Antigo Acionavel/i);
      assert.match(finalBody, /Mensagem antiga ainda acionavel/i);
      assert.match(finalBody, /Lead Atualizado/i);
      assert.match(finalBody, /Mensagem atualizada/i);
      assert.doesNotMatch(finalBody, /Mensagem antiga que deve sair/i);
      assert.equal((finalBody.match(/^## \d+\. Lead Atualizado$/gm) ?? []).length, 1);
      assert.deepEqual(
        [...finalBody.matchAll(/^## \d+\. (.+)$/gm)].map((match) => match[1]),
        ["Lead Novo da Rodada", "Lead Atualizado", "Lead Antigo Acionavel"],
      );
    },
  );
});

test("Paperclip separa lead-cards de status operacional no FRE-7", () => {
  const readme = paperclipReadme();
  const contract = read("docs/freelancer/data-contract.md");
  const coo = cooFreelancer();
  const crmScript = read("scripts/freela-crm.mjs");
  const syncScriptPath = join(rootDir, "scripts/paperclip-sync-operator-status.mjs");
  const syncScript = read("scripts/paperclip-sync-operator-status.mjs");

  assert.equal(existsSync(syncScriptPath), true, "sync do status operacional deve existir");

  for (const doc of [readme, contract, coo]) {
    assert.match(doc, /paperclip-operator-status\.md/i);
    assert.match(doc, /ops-status/i);
    assert.match(doc, /status_executivo/i);
    assert.match(doc, /lead-cards/i);
    assert.match(doc, /acao_manual_hoje|ação_manual_hoje/i);
    assert.match(doc, /Nao copiar mensagem por este documento|Não copiar mensagem por este documento/i);
  }

  assert.match(crmScript, /exportOperatorStatus/i);
  assert.match(crmScript, /Superficie: status_executivo/i);
  assert.match(crmScript, /Acoes manuais em lead-cards/i);
  assert.match(crmScript, /Nao copiar mensagem por este documento/i);

  assert.match(syncScript, /export", "operator-status"|export operator-status/i);
  assert.match(syncScript, /paperclip-operator-status\.md/i);
  assert.match(syncScript, /ops-status/i);
  assert.match(syncScript, /\/api\/issues\/\$\{encodeURIComponent\(issue\)\}\/documents\/\$\{encodeURIComponent\(key\)\}/i);
  assert.match(syncScript, /PAPERCLIP_API_URL/i);
  assert.match(syncScript, /PAPERCLIP_API_KEY/i);
  assert.match(syncScript, /PAPERCLIP_RUN_ID/i);
  assert.doesNotMatch(syncScript, /npx|paperclipai/i);
});

test("Paperclip docs expose Ops Health reliability loop without private data leakage", () => {
  const readme = paperclipReadme();
  const contract = read("docs/freelancer/data-contract.md");
  const coo = cooFreelancer();
  const opsDoctorScript = read("scripts/freela-ops-doctor.mjs");
  const snapshotPlist = read("docs/freelancer/paperclip/launchd/com.luiz-fbm.freela-ops-snapshot.plist");
  const publishPlist = read("docs/freelancer/paperclip/launchd/com.luiz-fbm.freela-ops-publish.plist");

  for (const doc of [readme, contract, coo]) {
    assert.match(doc, /Ops Health/i);
    assert.match(doc, /freela-ops-doctor\.mjs/i);
    assert.match(doc, /\.scratch\/ops\/reliability-status\.json/i);
    assert.match(doc, /status.*green.*yellow.*red|green.*yellow.*red/is);
    assert.match(doc, /nao.*dados brutos|sem.*dados brutos/is);
  }

  assert.match(opsDoctorScript, /reliability-status/i);
  assert.match(opsDoctorScript, /DEFAULT_BACKUP_DIR/i);
  assert.match(snapshotPlist, /freela-ops-doctor\.mjs/);
  assert.match(snapshotPlist, /snapshot/);
  assert.match(snapshotPlist, /StartInterval/);
  assert.match(publishPlist, /freela-ops-doctor\.mjs/);
  assert.match(publishPlist, /publish/);
  assert.match(publishPlist, /StartCalendarInterval/);
});

test("Automacao operacional publica lead-cards e ops-status em um unico comando", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "paperclip-operational-surfaces-"));
  const scriptsDir = join(tempRoot, "scripts");
  mkdirSync(scriptsDir, { recursive: true });

  const stubScript = `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { join } from "node:path";

const rootIndex = process.argv.indexOf("--root");
const root = rootIndex === -1 ? process.cwd() : process.argv[rootIndex + 1];
const name = process.argv[1].includes("lead-cards") ? "lead-cards" : "ops-status";

appendFileSync(
  join(root, "surface-sync-calls.jsonl"),
  JSON.stringify({
    name,
    args: process.argv.slice(2),
    apiUrl: process.env.PAPERCLIP_API_URL ?? null,
    apiKey: process.env.PAPERCLIP_API_KEY ?? null,
    runId: process.env.PAPERCLIP_RUN_ID ?? null,
  }) + "\\n",
  "utf8",
);

console.log(\`stub \${name}\`);
`;

  writeFileSync(join(scriptsDir, "paperclip-sync-lead-cards.mjs"), stubScript, "utf8");
  writeFileSync(join(scriptsDir, "paperclip-sync-operator-status.mjs"), stubScript, "utf8");

  const stdout = await execFileText(
    process.execPath,
    [
      join(rootDir, "scripts/paperclip-sync-operational-surfaces.mjs"),
      "--root",
      tempRoot,
      "--date",
      "2026-06-19",
      "--issue",
      "FRE-7",
      "--lead-key",
      "lead-cards-test",
      "--status-key",
      "ops-status-test",
      "--api-base",
      "http://127.0.0.1:3100",
      "--api-key",
      "test-key",
      "--run-id",
      "11111111-1111-4111-8111-111111111111",
      "--timeout-ms",
      "321",
    ],
    {
      env: {
        ...process.env,
        PAPERCLIP_API_URL: "http://127.0.0.1:3999",
        PAPERCLIP_API_KEY: "env-key",
        PAPERCLIP_RUN_ID: "22222222-2222-4222-8222-222222222222",
      },
    },
  );

  const calls = readFileSync(join(tempRoot, "surface-sync-calls.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const [leadCardsCall, statusCall] = calls;

  assert.deepEqual(calls.map((call) => call.name), ["lead-cards", "ops-status"]);
  assert.match(stdout, /lead-cards/i);
  assert.match(stdout, /ops-status/i);

  assert.deepEqual(leadCardsCall.args, [
    "--root",
    tempRoot,
    "--issue",
    "FRE-7",
    "--key",
    "lead-cards-test",
    "--api-base",
    "http://127.0.0.1:3100",
    "--api-key",
    "test-key",
    "--run-id",
    "11111111-1111-4111-8111-111111111111",
    "--timeout-ms",
    "321",
    "--date",
    "2026-06-19",
  ]);
  assert.deepEqual(statusCall.args, [
    "--root",
    tempRoot,
    "--issue",
    "FRE-7",
    "--key",
    "ops-status-test",
    "--api-base",
    "http://127.0.0.1:3100",
    "--api-key",
    "test-key",
    "--run-id",
    "11111111-1111-4111-8111-111111111111",
    "--timeout-ms",
    "321",
    "--date",
    "2026-06-19",
  ]);
  assert.equal(leadCardsCall.apiUrl, "http://127.0.0.1:3999");
  assert.equal(statusCall.apiKey, "env-key");
  assert.equal(statusCall.runId, "22222222-2222-4222-8222-222222222222");

  const script = read("scripts/paperclip-sync-operational-surfaces.mjs");
  const readme = paperclipReadme();
  const contract = read("docs/freelancer/data-contract.md");
  const coo = cooFreelancer();
  const crm = followupCrm();
  const qa = qaMensagens();

  assert.match(script, /paperclip-sync-lead-cards\.mjs/i);
  assert.match(script, /paperclip-sync-operator-status\.mjs/i);
  assert.match(script, /lead-key/i);
  assert.match(script, /status-key/i);
  assert.match(script, /PAPERCLIP_API_URL/i);
  assert.match(script, /PAPERCLIP_API_KEY/i);
  assert.match(script, /PAPERCLIP_RUN_ID/i);
  assert.doesNotMatch(script, /send_message|send_file|send_audio_message|whatsapp-mcp/i);

  for (const doc of [readme, contract, coo, crm, qa]) {
    assert.match(doc, /paperclip-sync-operational-surfaces\.mjs/i);
    assert.match(doc, /lead-cards/i);
    assert.match(doc, /ops-status/i);
  }
});

test("Lead Scout roda as 09:30 nos dias uteis", () => {
  const trigger = triggerProspeccao();
  const readme = paperclipReadme();

  assert.equal(trigger.kind, "schedule");
  assert.equal(trigger.enabled, true);
  assert.equal(trigger.cronExpression, "30 9 * * 1-5");
  assert.equal(trigger.timezone, "America/Sao_Paulo");
  assert.match(trigger.label, /09:30/i);
  assert.match(readme, /Agenda: dias uteis as 09:30/i);
  assert.match(readme, /Cron: `30 9 \* \* 1-5`/i);
});

test("Lead Scout e CRM mantem SQLite e master exportado sem duplicar historico", () => {
  const scout = prospeccao();
  const crm = followupCrm();

  assert.match(scout, /Atualizacao automatica do CRM e master exportado/i);
  assert.match(scout, /master-leads\.csv/i);
  assert.match(scout, /master-leads-update-log-YYYY-MM-DD\.md/i);
  assert.match(scout, /merge_key/i);
  assert.match(scout, /dedupe_decision/i);
  assert.match(scout, /preservar historico|preservar histórico/i);
  assert.match(scout, /exclusion-list\.json/i);
  assert.match(scout, /nao sobrescrever dados existentes|não sobrescrever dados existentes/i);

  assert.match(crm, /grave o estado no SQLite/i);
  assert.match(crm, /master-leads\.csv/i);
  assert.match(crm, /contacted_at/i);
  assert.match(crm, /response_status/i);
});

test("Lead Scout alimenta o CRM e entrega pacote de decisao, nao planilha como produto principal", () => {
  const scout = prospeccao();
  const ceo = ceoProspeccao();
  const coo = cooFreelancer();
  const readme = paperclipReadme();
  const agent = agentConfig("agent-prospeccao.json");

  for (const doc of [scout, ceo, coo, readme]) {
    assert.match(doc, /Lead Scout nao entrega uma planilha|Lead Scout não entrega uma planilha/i);
    assert.match(doc, /planilha.*espelho|planilha.*exportacao|planilha.*exportação/i);
    assert.match(doc, /pacote de decisao|pacote de decisão/i);
    assert.match(doc, /lead-scout-decision-package\.md/i);
    assert.match(doc, /crm-upsert-leads\.json/i);
    assert.match(doc, /lead-dossiers\.md/i);
    assert.match(doc, /atendimento-handoff\.md/i);
    assert.match(doc, /node scripts\/freela-crm\.mjs lead upsert --file/i);
    assert.match(doc, /node scripts\/freela-crm\.mjs queue generate/i);
    assert.match(doc, /node scripts\/freela-crm\.mjs export all/i);
  }

  assert.match(agent.capabilities, /alimenta o CRM/i);
  assert.match(agent.capabilities, /pacote de decisao|pacote de decisão/i);
});

test("Prospecção separa volume do Scout e qualidade do Steve com meta de 15 leads", () => {
  const scout = prospeccao();
  const steve = ceoProspeccao();
  const coo = cooFreelancer();
  const readme = paperclipReadme();
  const agentScout = agentConfig("agent-prospeccao.json");
  const agentSteve = agentConfig("agent-ceo-prospeccao.json");

  for (const doc of [scout, steve, coo, readme]) {
    assert.match(doc, /15 leads|leads.*15/i);
    assert.match(doc, /Scout.*volume|volume.*Scout/i);
    assert.match(doc, /Steve.*qualidade|qualidade.*Steve/i);
    assert.match(doc, /lead-cards/i);
  }

  assert.match(scout, /25 candidatos|candidatos.*25/i);
  assert.match(scout, /mínimo de 15|minimo de 15/i);
  assert.match(scout, /nao parar em 5|não parar em 5/i);

  assert.match(steve, /gate qualitativo/i);
  assert.match(steve, /se menos de 15|menos de 15/i);
  assert.match(steve, /devolver.*Lead Scout|Lead Scout.*devolver/i);

  assert.match(agentScout.capabilities, /volume/i);
  assert.match(agentScout.capabilities, /15 leads/i);
  assert.match(agentSteve.name, /Steve/i);
  assert.match(agentSteve.capabilities, /qualidade/i);
});

test("Validador de Dados fica entre Scout e Steve com contrato de qualidade", () => {
  const promptPath = join(rootDir, "docs/freelancer/prompt-thread-validador-dados-leads.md");
  const agentPath = join(rootDir, "docs/freelancer/paperclip/agent-validador-dados-leads.json");

  assert.equal(existsSync(promptPath), true, "prompt do Validador de Dados deve existir");
  assert.equal(existsSync(agentPath), true, "config do agente Validador de Dados deve existir");

  const prompt = validadorDados();
  const scout = prospeccao();
  const steve = ceoProspeccao();
  const readme = paperclipReadme();
  const contract = read("docs/freelancer/data-contract.md");
  const agent = agentConfig("agent-validador-dados-leads.json");

  for (const doc of [prompt, scout, steve, readme, contract]) {
    assert.match(doc, /Validador de Dados/i);
    assert.match(doc, /data-quality-report\.md/i);
    assert.match(doc, /Scout.*Validador|Validador.*Scout/i);
    assert.match(doc, /Validador.*Steve|Steve.*Validador/i);
  }

  assert.match(prompt, /^# Prompt para worker:/m);
  assert.match(prompt, /nome/i);
  assert.match(prompt, /nicho/i);
  assert.match(prompt, /cidade|bairro/i);
  assert.match(prompt, /Instagram/i);
  assert.match(prompt, /WhatsApp|contato/i);
  assert.match(prompt, /evidencia.*dor|dor.*evidencia/i);
  assert.match(prompt, /duplicidade/i);
  assert.match(prompt, /fonte/i);
  assert.match(prompt, /data_quality_status/i);
  assert.match(prompt, /confidence_score/i);
  assert.match(prompt, /SQLite/i);
  assert.match(prompt, /scripts\/freela-crm\.mjs/i);
  assert.match(prompt, /Nunca envie mensagem|nao envia mensagens|não envia mensagens/i);

  assert.equal(agent.name, "Gilmor - Validador de Dados de Leads");
  assert.equal(agent.adapterType, "codex_local");
  assert.equal(agent.metadata.noAutomaticMessaging, true);
  assert.match(agent.capabilities, /data-quality-report\.md/i);
  assert.match(agent.capabilities, /dados minimos|dados mínimos/i);
  assert.match(agent.adapterConfig.instructionsFilePath, /prompt-thread-validador-dados-leads\.md$/);
});

test("Redator de Primeira Mensagem separa abordagem em lote do Atendimento", () => {
  const promptPath = join(rootDir, "docs/freelancer/prompt-thread-redator-primeira-mensagem.md");
  const agentPath = join(rootDir, "docs/freelancer/paperclip/agent-redator-primeira-mensagem.json");

  assert.equal(existsSync(promptPath), true, "prompt do Redator de Primeira Mensagem deve existir");
  assert.equal(existsSync(agentPath), true, "config do agente Redator de Primeira Mensagem deve existir");

  const prompt = redatorPrimeiraMensagem();
  const steve = ceoProspeccao();
  const atendimentoPrompt = atendimento();
  const crm = followupCrm();
  const readme = paperclipReadme();
  const agent = agentConfig("agent-redator-primeira-mensagem.json");

  for (const doc of [prompt, steve, atendimentoPrompt, crm, readme]) {
    assert.match(doc, /Redator de Primeira Mensagem/i);
    assert.match(doc, /mensagens-prontas-YYYY-MM-DD\.md/i);
  }

  assert.match(prompt, /^# Prompt para worker:/m);
  assert.match(prompt, /fila-abordagem\.md/i);
  assert.match(prompt, /atendimento-handoff\.md/i);
  assert.match(prompt, /ceo-curadoria\.md/i);
  assert.match(prompt, /15 mensagens|mensagens.*15/i);
  assert.match(prompt, /queue set-message/i);
  assert.match(prompt, /QA de Mensagens/i);
  assert.match(prompt, /nao vender site no primeiro contato|não vender site no primeiro contato/i);
  assert.match(prompt, /permissao|permissão/i);
  assert.match(prompt, /Nunca envie mensagem|nao envia mensagens|não envia mensagens/i);

  assert.match(atendimentoPrompt, /respostas reais|lead respondeu|objeções|objecoes/i);
  assert.match(atendimentoPrompt, /Redator de Primeira Mensagem.*primeira abordagem|primeira abordagem.*Redator de Primeira Mensagem/i);

  assert.equal(agent.name, "Levi - Redator de Primeira Mensagem");
  assert.equal(agent.adapterType, "codex_local");
  assert.equal(agent.metadata.noAutomaticMessaging, true);
  assert.match(agent.capabilities, /primeira abordagem/i);
  assert.match(agent.capabilities, /15 mensagens/i);
  assert.match(agent.adapterConfig.instructionsFilePath, /prompt-thread-redator-primeira-mensagem\.md$/);
});

test("QA de Mensagens bloqueia lead-cards ate aprovar primeira abordagem", () => {
  const promptPath = join(rootDir, "docs/freelancer/prompt-thread-qa-mensagens.md");
  const agentPath = join(rootDir, "docs/freelancer/paperclip/agent-qa-mensagens.json");
  const qaSchemaPath = join(rootDir, "docs/freelancer/paperclip/message-qa-report.schema.json");

  assert.equal(existsSync(promptPath), true, "prompt do QA de Mensagens deve existir");
  assert.equal(existsSync(agentPath), true, "config do agente QA de Mensagens deve existir");
  assert.equal(existsSync(qaSchemaPath), true, "schema estruturado de QA deve existir");

  const prompt = qaMensagens();
  const redator = redatorPrimeiraMensagem();
  const crm = followupCrm();
  const readme = paperclipReadme();
  const contract = read("docs/freelancer/data-contract.md");
  const agent = agentConfig("agent-qa-mensagens.json");
  const qaSchema = JSON.parse(read("docs/freelancer/paperclip/message-qa-report.schema.json"));

  for (const doc of [prompt, redator, crm, readme, contract]) {
    assert.match(doc, /QA de Mensagens/i);
    assert.match(doc, /message-qa-report\.md/i);
    assert.match(doc, /message-qa-report\.json/i);
  }

  assert.match(prompt, /^# Prompt para worker:/m);
  assert.match(prompt, /aprovado_para_lead_cards/i);
  assert.match(prompt, /requer_ajuste/i);
  assert.match(prompt, /generica|genérica/i);
  assert.match(prompt, /longa/i);
  assert.match(prompt, /artificial/i);
  assert.match(prompt, /agressiva/i);
  assert.match(prompt, /dado inventado|dados inventados/i);
  assert.match(prompt, /nao vender site no primeiro contato|não vender site no primeiro contato/i);
  assert.match(prompt, /COO Freelancer/i);
  assert.match(prompt, /paperclip-create-handoff-issue\.mjs/i);
  assert.match(prompt, /qa_to_coo_publish_fre7/i);
  assert.match(prompt, /lead-cards/i);
  assert.match(prompt, /queue approve-card/i);
  assert.match(prompt, /Nunca envie mensagem|nao envia mensagens|não envia mensagens/i);

  assert.match(crm, /aprovado_para_lead_cards/i);
  assert.match(crm, /QA de Mensagens.*lead-cards|lead-cards.*QA de Mensagens/i);
  assert.match(crm, /queue approve-card/i);
  assert.match(readme, /queue approve-card/i);
  assert.match(contract, /queue approve-card/i);

  assert.equal(agent.name, "Temma - QA de Mensagens");
  assert.equal(agent.role, "qa");
  assert.equal(agent.adapterType, "codex_local");
  assert.equal(agent.metadata.noAutomaticMessaging, true);
  assert.match(agent.capabilities, /message-qa-report\.md/i);
  assert.match(agent.capabilities, /message-qa-report\.json/i);
  assert.match(agent.capabilities, /lead-cards/i);
  assert.match(agent.adapterConfig.instructionsFilePath, /prompt-thread-qa-mensagens\.md$/);

  assert.deepEqual(qaSchema.required, [
    "schema_version",
    "review_date",
    "queue_date",
    "source",
    "reviews",
  ]);
  assert.equal(qaSchema.properties.schema_version.const, 1);
  assert.equal(qaSchema.properties.reviews.items.required.includes("lead_name"), true);
  assert.equal(qaSchema.properties.reviews.items.required.includes("status_qa"), true);
});

test("QA libera FRE-7 via COO e Follow-up nao publica console diretamente", () => {
  const qa = qaMensagens();
  const followup = followupCrm();
  const coo = cooFreelancer();
  const contract = read("docs/freelancer/data-contract.md");
  const readme = paperclipReadme();
  const schema = workerHandoffSchema();

  assert.match(qa, /COO Freelancer/i);
  assert.match(qa, /qa_to_coo_publish_fre7/i);
  assert.match(qa, /dedupe_key.*publish_fre7/is);
  assert.match(qa, /paperclip-create-handoff-issue\.mjs/i);
  assert.doesNotMatch(qa, /acione Follow-up CRM.*paperclip-sync-operational-surfaces/is);

  assert.match(followup, /nao (escreve|publica).*FRE-7/i);
  assert.match(followup, /handoff.*COO.*FRE-7|COO.*paperclip-sync-operational-surfaces/is);
  assert.doesNotMatch(
    followup,
    /Use `node scripts\/paperclip-sync-(lead-cards|operator-status|operational-surfaces)\.mjs`/i,
  );

  assert.match(coo, /paperclip-sync-operational-surfaces\.mjs/i);
  assert.match(coo, /publicador autorizado.*FRE-7|FRE-7.*publicador autorizado/i);

  for (const doc of [contract, readme]) {
    assert.match(doc, /COO.*FRE-7/is);
    assert.match(doc, /Follow-up CRM.*nao.*FRE-7/is);
    assert.match(doc, /dedupe_key.*publish_fre7/is);
  }

  assert.equal(schema.properties.workflow.properties.dedupe_key.type, "string");
});

test("Gate comercial inicial nao aciona Redator e Follow-up CRM em paralelo", () => {
  const steve = ceoProspeccao();
  const followup = followupCrm();
  const readme = paperclipReadme();

  assert.match(steve, /somente.*Redator de Primeira Mensagem/is);
  assert.match(steve, /nao.*Follow-up CRM.*paralelo/is);
  assert.match(steve, /QA de Mensagens.*COO Freelancer/is);
  assert.match(followup, /commercial_pending_qa.*aguard.*QA/is);
  assert.match(followup, /commercial_ready_lead_cards.*COO Freelancer/is);
  assert.match(readme, /Steve.*somente.*Redator de Primeira Mensagem/is);
  assert.match(readme, /Follow-up CRM.*nao.*commercial_pending_qa/is);
});

test("Bio Evidence Pack do Instagram e gate obrigatorio de prospeccao", () => {
  const scout = prospeccao();
  const validador = validadorDados();
  const steve = ceoProspeccao();
  const redator = redatorPrimeiraMensagem();
  const contract = read("docs/freelancer/data-contract.md");
  const localProspector = read("docs/freelancer/prompt-local-client-prospector-vitoria.md");
  const browser = browserAutomation();
  const crmScript = read("scripts/freela-crm.mjs");
  const agentScout = agentConfig("agent-prospeccao.json");
  const agentValidador = agentConfig("agent-validador-dados-leads.json");
  const agentSteve = agentConfig("agent-ceo-prospeccao.json");
  const agentRedator = agentConfig("agent-redator-primeira-mensagem.json");

  assert.match(crmScript, /lead_platform_profiles/i);
  assert.match(crmScript, /lead_platform_links/i);
  assert.match(crmScript, /profile-evidence/i);
  assert.match(crmScript, /bio_status/i);
  assert.match(crmScript, /commercial_hook/i);

  for (const doc of [contract, scout, validador, steve, redator, localProspector]) {
    assert.match(doc, /Bio Evidence Pack/i);
    assert.match(doc, /profile-evidence upsert/i);
    assert.match(doc, /lead_platform_profiles/i);
    assert.match(doc, /bio_status/i);
    assert.match(doc, /bio_text/i);
    assert.match(doc, /bio_link_url/i);
    assert.match(doc, /bio_link_status/i);
    assert.match(doc, /commercial_hook/i);
  }

  assert.match(scout, /sempre.*bio|bio.*sempre/i);
  assert.match(scout, /Linktree|bio\.site/i);
  assert.match(scout, /Chrome pessoal/i);
  assert.match(scout, /read-only|somente leitura/i);

  assert.match(validador, /reanalisar/i);
  assert.match(validador, /apto_com_observacao/i);
  assert.match(validador, /sem bio analisada|bio nao foi analisada|bio não foi analisada/i);

  assert.match(steve, /gancho comercial|commercial_hook/i);
  assert.match(redator, /devolve|devolver/i);
  assert.match(redator, /nao inventar|não inventar/i);

  assert.match(browser, /link da bio/i);
  assert.match(browser, /Linktree|bio\.site/i);

  for (const agent of [agentScout, agentValidador, agentSteve, agentRedator]) {
    assert.match(agent.capabilities, /Bio Evidence Pack|bio do Instagram|lead_platform_profiles/i);
  }
});

test("Backfill de enriquecimento reprocessa base existente sem virar prospeccao nova", () => {
  const crmScript = read("scripts/freela-crm.mjs");
  const contract = read("docs/freelancer/data-contract.md");
  const readme = paperclipReadme();
  const coo = cooFreelancer();
  const scout = prospeccao();
  const validador = validadorDados();

  for (const doc of [crmScript, contract, readme, coo, scout, validador]) {
    assert.match(doc, /enrichment-plan/i);
    assert.match(doc, /duplicate-audit/i);
    assert.match(doc, /enrichment-backfill/i);
  }

  for (const doc of [contract, readme, coo, scout, validador]) {
    assert.match(doc, /base existente|leads existentes/i);
    assert.match(doc, /nao.*prospeccao nova|não.*prospecção nova|backfill/i);
    assert.match(doc, /nao.*merge automatico|não.*merge automático|manual_review_only/i);
  }
});

test("SQLite comercial tem views oficiais e handoffs estruturados", () => {
  const crmScript = read("scripts/freela-crm.mjs");
  const contract = read("docs/freelancer/data-contract.md");
  const readme = paperclipReadme();
  const handoffProtocol = workerHandoffProtocol();
  const coo = cooFreelancer();
  const scout = prospeccao();
  const validador = validadorDados();
  const steve = ceoProspeccao();
  const redator = redatorPrimeiraMensagem();
  const qa = qaMensagens();
  const followup = followupCrm();

  for (const term of [
    "commercial_lead_context",
    "commercial_pending_validation",
    "commercial_ready_for_writer",
    "commercial_pending_qa",
    "commercial_ready_lead_cards",
    "commercial_followups_today",
    "commercial_stale_leads",
    "worker_handoffs",
  ]) {
    assert.match(crmScript, new RegExp(term, "i"));
  }
  assert.match(crmScript, /command\[0\].*commercial.*command\[1\].*export/is);
  assert.match(crmScript, /command\[0\].*commercial.*command\[1\].*status/is);
  assert.match(crmScript, /command\[0\].*handoff.*command\[1\].*record/is);

  for (const doc of [contract, readme]) {
    assert.match(doc, /SQLite comercial/i);
    assert.match(doc, /commercial export/i);
    assert.match(doc, /commercial status/i);
    assert.match(doc, /commercial-funnel\.md/i);
    assert.match(doc, /commercial-status\.md/i);
    assert.match(doc, /worker_handoffs/i);
    assert.match(doc, /handoff record/i);
    assert.match(doc, /commercial_pending_validation/i);
    assert.match(doc, /commercial_ready_lead_cards/i);
  }

  assert.match(handoffProtocol, /handoff record/i);
  assert.match(handoffProtocol, /worker_handoffs/i);
  assert.match(handoffProtocol, /pending_issue|issue_created/i);

  for (const prompt of [coo, scout, validador, steve, redator, qa, followup]) {
    assert.match(prompt, /commercial status|commercial export/i);
    assert.match(prompt, /SQLite comercial/i);
  }

  assert.match(scout, /commercial_pending_validation|commercial_ready_for_writer/i);
  assert.match(validador, /commercial_pending_validation/i);
  assert.match(steve, /commercial_ready_for_writer/i);
  assert.match(redator, /commercial_ready_for_writer|commercial_pending_qa/i);
  assert.match(qa, /commercial_pending_qa|commercial_ready_lead_cards/i);
  assert.match(followup, /commercial_followups_today|commercial_ready_lead_cards/i);

  for (const name of [
    "agent-coo-freelancer.json",
    "agent-prospeccao.json",
    "agent-validador-dados-leads.json",
    "agent-ceo-prospeccao.json",
    "agent-redator-primeira-mensagem.json",
    "agent-qa-mensagens.json",
    "agent-followup-crm.json",
  ]) {
    const agent = agentConfig(name);
    assert.match(agent.capabilities, /SQLite comercial|commercial_/i);
  }
});

test("Lead Scout nao instrui status rejeitados pela CLI", () => {
  const prompt = prospeccao();
  const contract = read("docs/freelancer/data-contract.md");

  assert.match(contract, /novo/i);
  assert.match(contract, /reanalisar/i);
  assert.doesNotMatch(prompt, /sem_resposta|lead_esquecido/i);
});

test("Diagnostico 3 Pontos separa evidencias da resposta comercial", () => {
  const promptPath = join(rootDir, "docs/freelancer/prompt-thread-diagnostico-3-pontos.md");
  const agentPath = join(rootDir, "docs/freelancer/paperclip/agent-diagnostico-3-pontos.json");

  assert.equal(existsSync(promptPath), true, "prompt do Diagnostico 3 Pontos deve existir");
  assert.equal(existsSync(agentPath), true, "config do agente Diagnostico 3 Pontos deve existir");

  const prompt = diagnosticoTresPontos();
  const atendimentoPrompt = atendimento();
  const crm = followupCrm();
  const readme = paperclipReadme();
  const contract = read("docs/freelancer/data-contract.md");
  const agent = agentConfig("agent-diagnostico-3-pontos.json");

  for (const doc of [prompt, atendimentoPrompt, crm, readme, contract]) {
    assert.match(doc, /Diagnostico 3 Pontos|Diagnóstico 3 Pontos/i);
    assert.match(doc, /diagnostico-3-pontos-YYYY-MM-DD\.md/i);
  }

  assert.match(prompt, /^# Prompt para worker:/m);
  assert.match(prompt, /lead respondeu.*pode|pode.*lead respondeu/i);
  assert.match(prompt, /evidencia_observada/i);
  assert.match(prompt, /fonte_ou_arquivo/i);
  assert.match(prompt, /Ponto 1/i);
  assert.match(prompt, /Ponto 2/i);
  assert.match(prompt, /Ponto 3/i);
  assert.match(prompt, /Nao usar ponto generico|Não usar ponto genérico/i);
  assert.match(prompt, /nao escrever resposta final|não escrever resposta final/i);
  assert.match(prompt, /Atendimento e Fechamento/i);
  assert.match(prompt, /Nunca envie mensagem|nao envia mensagens|não envia mensagens/i);

  assert.match(atendimentoPrompt, /Diagnostico 3 Pontos.*resposta comercial|Diagnóstico 3 Pontos.*resposta comercial|resposta comercial.*Diagnostico 3 Pontos/i);
  assert.match(crm, /pode \[nome\]/i);
  assert.match(crm, /Diagnostico 3 Pontos|Diagnóstico 3 Pontos/i);

  assert.equal(agent.name, "Walter - Diagnóstico 3 Pontos");
  assert.equal(agent.adapterType, "codex_local");
  assert.equal(agent.metadata.noAutomaticMessaging, true);
  assert.match(agent.capabilities, /3 pontos reais/i);
  assert.match(agent.capabilities, /evidencias|evidências/i);
  assert.match(agent.adapterConfig.instructionsFilePath, /prompt-thread-diagnostico-3-pontos\.md$/);
});

test("Demo Brief e contrato obrigatorio antes de criar exemplos", () => {
  const followup = followupCrm();
  const presenca72h = criacao72h();
  const qa = qaDemos();
  const readme = paperclipReadme();
  const contract = read("docs/freelancer/data-contract.md");

  for (const doc of [followup, presenca72h, qa, readme, contract]) {
    assert.match(doc, /demo-brief\.md/i);
    assert.match(doc, /objetivo da demo|objetivo/i);
    assert.match(doc, /lead/i);
    assert.match(doc, /oferta/i);
    assert.match(doc, /tom/i);
    assert.match(doc, /dados permitidos/i);
    assert.match(doc, /dados proibidos/i);
    assert.match(doc, /CTA/i);
    assert.match(doc, /WhatsApp correto/i);
    assert.match(doc, /nivel:\s*Presen[cç]a Local em 72h|Presen[cç]a Local em 72h/i);
    assert.match(doc, /criterios de QA|critérios de QA/i);
  }

  assert.match(presenca72h, /Nao iniciar|Não iniciar/i);
  assert.match(qa, /demo-brief\.md.*qa-demos|qa-demos.*demo-brief\.md/i);
});

test("Follow-up separa Fila do Dia de CRM Historico", () => {
  const prompt = followupCrm();
  const readme = paperclipReadme();
  const contract = read("docs/freelancer/data-contract.md");
  const routine = rotinaCrm();

  for (const doc of [prompt, readme, contract, routine.description]) {
    assert.match(doc, /Fila do Dia/i);
    assert.match(doc, /CRM Historico|CRM Histórico/i);
    assert.match(doc, /hoje-enviar\.md/i);
    assert.match(doc, /lead-cards/i);
    assert.match(doc, /historico-atendimento\.md/i);
    assert.match(doc, /status-commands-log\.md/i);
    assert.match(doc, /nao misturar|não misturar/i);
    assert.match(doc, /acionavel|acionável/i);
  }

  assert.match(prompt, /rotina de estado|estado e historico|estado e histórico/i);
  assert.match(prompt, /rotina de execucao diaria|rotina de execução diária|execucao diaria|execução diária/i);
  assert.match(prompt, /lead-cards.*somente.*hoje|hoje.*lead-cards/i);
});

test("Paperclip tem protocolo unico de handoff e auto-delegacao entre workers", () => {
  const protocolPath = join(rootDir, "docs/freelancer/paperclip/worker-handoff-protocol.md");
  const schemaPath = join(rootDir, "docs/freelancer/paperclip/worker-handoff.schema.json");
  const scriptPath = join(rootDir, "scripts/paperclip-create-handoff-issue.mjs");

  assert.equal(existsSync(protocolPath), true, "protocolo de handoff deve existir");
  assert.equal(existsSync(schemaPath), true, "schema de handoff deve existir");
  assert.equal(existsSync(scriptPath), true, "script de auto-delegacao deve existir");

  const protocol = workerHandoffProtocol();
  const schema = workerHandoffSchema();
  const script = read("scripts/paperclip-create-handoff-issue.mjs");
  const readme = paperclipReadme();
  const contract = read("docs/freelancer/data-contract.md");
  const coo = cooFreelancer();

  for (const doc of [protocol, readme, contract, coo]) {
    assert.match(doc, /worker-handoff-protocol\.md/i);
    assert.match(doc, /paperclip-create-handoff-issue\.mjs/i);
    assert.match(doc, /handoff reconcile/i);
    assert.match(doc, /batch_id/i);
    assert.match(doc, /target_agent_id/i);
    assert.match(doc, /source_issue/i);
    assert.match(doc, /artifacts/i);
    assert.match(doc, /acceptance_criteria/i);
    assert.match(doc, /blockedByIssueIds/i);
    assert.match(doc, /parentId/i);
    assert.match(doc, /nao copiar e colar|não copiar e colar/i);
  }

  assert.deepEqual(schema.required, [
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
  ]);
  assert.equal(schema.properties.handoff_version.const, 1);
  assert.equal(schema.properties.workflow.type, "object");
  assert.equal(schema.properties.workflow.properties.batch_id.type, "string");
  assert.deepEqual(schema.properties.workflow.required, [
    "run_id",
    "round_date",
    "stage",
    "expected_count",
    "next_owner",
  ]);
  assert.equal(schema.properties.block_source_issue.type, "boolean");
  assert.equal(schema.properties.source_issue.properties.id.type, "string");
  assert.equal(schema.properties.source_issue.properties.identifier.type, "string");
  assert.equal(schema.properties.artifacts.type, "array");
  assert.equal(schema.properties.acceptance_criteria.type, "array");

  assert.match(script, /--handoff-file/i);
  assert.match(script, /--dry-run/i);
  assert.match(script, /blockedByIssueIds/i);
  assert.match(script, /parentId/i);
  assert.match(script, /target_agent_id/i);
  assert.match(script, /source_issue/i);
  assert.match(script, /workflow/i);
  assert.match(script, /run_id/i);
  assert.match(script, /round_date/i);
  assert.match(script, /\/api\/companies\/.*\/issues/i);
  assert.match(script, /\/api\/issues\/.*PATCH|method:\s*"PATCH"/is);
  assert.match(script, /PAPERCLIP_COMPANY_ID/i);
  assert.match(script, /Authorization/i);
  assert.match(script, /X-Paperclip-Run-Id/i);
  assert.doesNotMatch(script, /npx|paperclipai|child_process|spawnSync/i);
});

test("Script de handoff gera dry-run auditavel sem tocar no Paperclip", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "paperclip-handoff-"));
  const handoff = {
    handoff_version: 1,
    source_agent_id: "source-agent-id",
    source_agent_name: "Worker Origem",
    source_issue: {
      id: "source-issue-id",
      identifier: "FRE-99",
      title: "Issue de origem",
    },
    target_agent_id: "target-agent-id",
    target_agent_name: "Worker Alvo",
    title: "Delegar ajuste",
    required_action: "Corrigir o artefato e devolver para QA.",
    context: "Contexto curto do handoff.",
    workflow: {
      batch_id: "backfill:2026-06-18:lote-1:final-15",
      run_id: "prospeccao-vitoria-2026-06-18",
      round_date: "2026-06-18",
      stage: "redator_to_qa",
      dedupe_key: "test-dedupe-key",
      expected_count: 15,
      next_owner: "QA de Mensagens",
    },
    artifacts: [
      {
        path: ".scratch/crm/exemplo.md",
        description: "Artefato privado do trabalho",
        required: true,
      },
    ],
    acceptance_criteria: ["Artefato corrigido", "Comentario final com proximo dono"],
    block_source_issue: true,
    priority: "high",
  };

  writeFileSync(join(tempRoot, "handoff.json"), JSON.stringify(handoff), "utf8");

  const stdout = execFileSync(
    process.execPath,
    [
      join(rootDir, "scripts/paperclip-create-handoff-issue.mjs"),
      "--root",
      tempRoot,
      "--handoff-file",
      "handoff.json",
      "--dry-run",
    ],
    { encoding: "utf8" },
  );

  const preview = JSON.parse(stdout);

  assert.equal(preview.mode, "dry-run");
  assert.equal(preview.wouldCreateChildIssue, true);
  assert.equal(preview.wouldBlockSourceIssue, true);
  assert.equal(preview.childIssuePayload.parentId, "source-issue-id");
  assert.equal(preview.childIssuePayload.assigneeAgentId, "target-agent-id");
  assert.equal(preview.childIssuePayload.priority, "high");
  assert.deepEqual(preview.childIssuePayload.blockedByIssueIds, []);
  assert.deepEqual(preview.sourceUpdatePayload.blockedByIssueIds, ["<created-child-issue-id>"]);
  assert.match(preview.childIssuePayload.description, /target_agent_id: target-agent-id/i);
  assert.match(preview.childIssuePayload.description, /batch_id: backfill:2026-06-18:lote-1:final-15/i);
  assert.match(preview.childIssuePayload.description, /run_id: prospeccao-vitoria-2026-06-18/i);
  assert.match(preview.childIssuePayload.description, /round_date: 2026-06-18/i);
  assert.match(preview.childIssuePayload.description, /dedupe_key: test-dedupe-key/i);
  assert.match(preview.childIssuePayload.description, /expected_count: 15/i);
  assert.match(preview.childIssuePayload.description, /Acceptance criteria/i);
  assert.match(preview.childIssuePayload.description, /Nao copiar e colar/i);
});

test("Script de handoff bloqueia dry-run sem workflow de maquina", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "paperclip-handoff-missing-workflow-"));
  const handoff = {
    handoff_version: 1,
    source_agent_id: "source-agent-id",
    source_issue: {
      id: "source-issue-id",
      identifier: "FRE-99",
    },
    target_agent_id: "target-agent-id",
    target_agent_name: "Worker Alvo",
    title: "Delegar ajuste",
    required_action: "Corrigir o artefato e devolver para QA.",
    artifacts: [
      {
        path: ".scratch/crm/exemplo.md",
        description: "Artefato privado do trabalho",
      },
    ],
    acceptance_criteria: ["Artefato corrigido"],
  };

  writeFileSync(join(tempRoot, "handoff.json"), JSON.stringify(handoff), "utf8");

  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [
          join(rootDir, "scripts/paperclip-create-handoff-issue.mjs"),
          "--root",
          tempRoot,
          "--handoff-file",
          "handoff.json",
          "--dry-run",
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ),
    /workflow/i,
  );
});

test("Script de handoff reutiliza issue ativa de publicacao sem sobrescrever a issue original", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "paperclip-handoff-dedupe-"));
  const dedupeKey = "publish_fre7:50a2756c-2942-40c1-90f8-b16807a62ef3:2026-06-19";
  const handoff = {
    handoff_version: 1,
    source_agent_id: "qa-agent-id",
    source_agent_name: "QA de Mensagens",
    source_issue: {
      id: "qa-source-issue-id",
      identifier: "FRE-72",
      title: "QA aprovou mensagens",
    },
    target_agent_id: "coo-agent-id",
    target_agent_name: "COO Freelancer",
    title: "Publicar lead-cards no FRE-7",
    required_action: "Publicar lead-cards e ops-status no console COO.",
    workflow: {
      run_id: "prospeccao-vitoria-2026-06-19",
      round_date: "2026-06-19",
      stage: "qa_to_coo_publish_fre7",
      dedupe_key: dedupeKey,
      expected_count: 15,
      actual_count: 15,
      gate_status: "approved",
      next_owner: "COO Freelancer",
    },
    artifacts: [
      {
        path: ".scratch/crm/paperclip-lead-cards.md",
        description: "Cards aprovados para publicacao",
        required: true,
      },
    ],
    acceptance_criteria: ["FRE-7 atualizado com lead-cards e ops-status"],
  };

  writeFileSync(join(tempRoot, "handoff-existing.json"), JSON.stringify(handoff), "utf8");
  execFileSync(process.execPath, [join(rootDir, "scripts/freela-crm.mjs"), "--root", tempRoot, "init"]);
  execFileSync(process.execPath, [
    join(rootDir, "scripts/freela-crm.mjs"),
    "--root",
    tempRoot,
    "handoff",
    "record",
    "--file",
    "handoff-existing.json",
    "--status",
    "issue_created",
    "--paperclip-issue-id",
    "coo-publish-issue-id",
    "--paperclip-issue-identifier",
    "FRE-75",
  ]);

  writeFileSync(
    join(tempRoot, "handoff-duplicate.json"),
    JSON.stringify({
      ...handoff,
      source_issue: {
        id: "followup-source-issue-id",
        identifier: "FRE-74",
        title: "Follow-up tentou publicar",
      },
      workflow: {
        ...handoff.workflow,
        stage: "followup_to_coo_publish_fre7",
      },
    }),
    "utf8",
  );

  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyText = Buffer.concat(chunks).toString("utf8");
    requests.push({
      method: req.method,
      url: req.url,
      body: bodyText ? JSON.parse(bodyText) : null,
    });
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET" && req.url === "/api/issues/coo-publish-issue-id") {
      res.end(JSON.stringify({ id: "coo-publish-issue-id", identifier: "FRE-75", status: "in_progress" }));
      return;
    }
    res.end(JSON.stringify({ id: "new-child-id", identifier: "FRE-99" }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const stdout = await execFileText(process.execPath, [
      join(rootDir, "scripts/paperclip-create-handoff-issue.mjs"),
      "--root",
      tempRoot,
      "--handoff-file",
      "handoff-duplicate.json",
      "--api-base",
      `http://127.0.0.1:${port}`,
      "--company-id",
      "company-1",
    ]);
    const result = JSON.parse(stdout);

    assert.equal(result.reusedExistingIssue, true);
    assert.equal(result.createdIssueId, "coo-publish-issue-id");
    assert.equal(result.createdIssueIdentifier, "FRE-75");
    assert.equal(result.existingIssueUpdateSkipped, true);
    assert.equal(requests[0].method, "GET");
    assert.equal(requests[0].url, "/api/issues/coo-publish-issue-id");
    assert.equal(requests.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Script de handoff de publicacao nao tenta PATCH quando reaproveita issue por dedupe", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "paperclip-handoff-dedupe-403-"));
  const dedupeKey = "publish_fre7:50a2756c-2942-40c1-90f8-b16807a62ef3:2026-06-20";
  const handoff = {
    handoff_version: 1,
    source_agent_id: "qa-agent-id",
    source_agent_name: "QA de Mensagens",
    source_issue: {
      id: "qa-source-issue-id",
      identifier: "FRE-149",
      title: "QA aprovou mensagens",
    },
    target_agent_id: "coo-agent-id",
    target_agent_name: "COO Freelancer",
    title: "Publicar lead-cards no FRE-7",
    required_action: "Publicar lead-cards e ops-status no console COO.",
    workflow: {
      run_id: "backfill-lote-3",
      round_date: "2026-06-20",
      stage: "qa_to_coo_publish_fre7",
      dedupe_key: dedupeKey,
      expected_count: 15,
      actual_count: 15,
      gate_status: "approved",
      next_owner: "COO Freelancer",
    },
    artifacts: [
      {
        path: ".scratch/crm/paperclip-lead-cards.md",
        description: "Cards aprovados para publicacao",
        required: true,
      },
    ],
    acceptance_criteria: ["FRE-7 atualizado com lead-cards e ops-status"],
  };

  writeFileSync(join(tempRoot, "handoff-existing.json"), JSON.stringify(handoff), "utf8");
  execFileSync(process.execPath, [join(rootDir, "scripts/freela-crm.mjs"), "--root", tempRoot, "init"]);
  execFileSync(process.execPath, [
    join(rootDir, "scripts/freela-crm.mjs"),
    "--root",
    tempRoot,
    "handoff",
    "record",
    "--file",
    "handoff-existing.json",
    "--status",
    "issue_created",
    "--paperclip-issue-id",
    "coo-publish-issue-id",
    "--paperclip-issue-identifier",
    "FRE-150",
  ]);

  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ method: req.method, url: req.url });
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET" && req.url === "/api/issues/coo-publish-issue-id") {
      res.end(JSON.stringify({ id: "coo-publish-issue-id", identifier: "FRE-150", status: "in_progress" }));
      return;
    }
    if (req.method === "PATCH" && req.url === "/api/issues/coo-publish-issue-id") {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: "forbidden" }));
      return;
    }
    if (req.method === "POST" && req.url === "/api/companies/company-1/issues") {
      res.end(JSON.stringify({ id: "duplicate-issue-id", identifier: "FRE-151" }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const stdout = await execFileText(process.execPath, [
      join(rootDir, "scripts/paperclip-create-handoff-issue.mjs"),
      "--root",
      tempRoot,
      "--handoff-file",
      "handoff-existing.json",
      "--api-base",
      `http://127.0.0.1:${port}`,
      "--company-id",
      "company-1",
    ]);
    const result = JSON.parse(stdout);

    assert.equal(result.reusedExistingIssue, true);
    assert.equal(result.createdIssueId, "coo-publish-issue-id");
    assert.equal(result.existingIssueUpdateSkipped, true);
    assert.deepEqual(requests.map((request) => `${request.method} ${request.url}`), [
      "GET /api/issues/coo-publish-issue-id",
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Script de handoff nao reutiliza issue Paperclip terminal com handoff stale", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "paperclip-handoff-terminal-dedupe-"));
  const dedupeKey = "publish_fre7:50a2756c-2942-40c1-90f8-b16807a62ef3:2026-06-20";
  const handoff = {
    handoff_version: 1,
    source_agent_id: "qa-agent-id",
    source_agent_name: "QA de Mensagens",
    source_issue: {
      id: "qa-source-issue-id",
      identifier: "FRE-135",
      title: "QA consolidado",
    },
    target_agent_id: "coo-agent-id",
    target_agent_name: "COO Freelancer",
    title: "Publicar lead-cards no FRE-7",
    required_action: "Publicar lead-cards e ops-status no console COO.",
    workflow: {
      run_id: "fre-126-backfill-lote-2-2026-06-20",
      round_date: "2026-06-20",
      stage: "qa_to_coo_publish_fre7",
      dedupe_key: dedupeKey,
      expected_count: 15,
      actual_count: 15,
      gate_status: "passed",
      next_owner: "COO Freelancer",
    },
    artifacts: [
      {
        path: ".scratch/crm/paperclip-lead-cards.md",
        description: "Cards aprovados para publicacao",
        required: true,
      },
    ],
    acceptance_criteria: ["FRE-7 atualizado com lead-cards e ops-status"],
  };

  writeFileSync(join(tempRoot, "handoff-existing.json"), JSON.stringify(handoff), "utf8");
  execFileSync(process.execPath, [join(rootDir, "scripts/freela-crm.mjs"), "--root", tempRoot, "init"]);
  execFileSync(process.execPath, [
    join(rootDir, "scripts/freela-crm.mjs"),
    "--root",
    tempRoot,
    "handoff",
    "record",
    "--file",
    "handoff-existing.json",
    "--status",
    "issue_created",
    "--paperclip-issue-id",
    "old-done-issue-id",
    "--paperclip-issue-identifier",
    "FRE-121",
  ]);

  const requests = [];
  const server = createServer(async (req, res) => {
    requests.push({ method: req.method, url: req.url });
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET" && req.url === "/api/issues/old-done-issue-id") {
      res.end(JSON.stringify({ id: "old-done-issue-id", identifier: "FRE-121", status: "done" }));
      return;
    }
    if (req.method === "POST" && req.url === "/api/companies/company-1/issues") {
      res.end(JSON.stringify({ id: "new-publish-issue-id", identifier: "FRE-137" }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    const stdout = await execFileText(process.execPath, [
      join(rootDir, "scripts/paperclip-create-handoff-issue.mjs"),
      "--root",
      tempRoot,
      "--handoff-file",
      "handoff-existing.json",
      "--api-base",
      `http://127.0.0.1:${port}`,
      "--company-id",
      "company-1",
    ]);
    const result = JSON.parse(stdout);

    assert.equal(result.reusedExistingIssue, undefined);
    assert.equal(result.createdIssueId, "new-publish-issue-id");
    assert.deepEqual(requests.map((request) => `${request.method} ${request.url}`), [
      "GET /api/issues/old-done-issue-id",
      "POST /api/companies/company-1/issues",
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Workers delegam entre si por handoff estruturado, nao pelo usuario", () => {
  const delegatingPrompts = [
    prospeccao(),
    validadorDados(),
    ceoProspeccao(),
    redatorPrimeiraMensagem(),
    qaMensagens(),
    followupCrm(),
    diagnosticoTresPontos(),
    atendimento(),
    criacao72h(),
    qaDemos(),
    cooFreelancer(),
  ];

  for (const prompt of delegatingPrompts) {
    assert.match(prompt, /worker-handoff-protocol\.md/i);
    assert.match(prompt, /paperclip-create-handoff-issue\.mjs/i);
    assert.match(prompt, /target_agent_id/i);
    assert.match(prompt, /source_issue/i);
    assert.match(prompt, /acceptance_criteria/i);
    assert.match(prompt, /nao copiar e colar|não copiar e colar/i);
  }

  assert.match(prospeccao(), /Validador de Dados.*paperclip-create-handoff-issue|paperclip-create-handoff-issue.*Validador de Dados/i);
  assert.match(validadorDados(), /Steve.*paperclip-create-handoff-issue|paperclip-create-handoff-issue.*Steve/i);
  assert.match(ceoProspeccao(), /Redator de Primeira Mensagem.*paperclip-create-handoff-issue|paperclip-create-handoff-issue.*Redator de Primeira Mensagem/i);
  assert.match(redatorPrimeiraMensagem(), /QA de Mensagens.*paperclip-create-handoff-issue|paperclip-create-handoff-issue.*QA de Mensagens/i);
  assert.match(qaMensagens(), /requer_ajuste.*Redator de Primeira Mensagem|Redator de Primeira Mensagem.*requer_ajuste/i);
  assert.match(qaMensagens(), /block_source_issue/i);
  assert.match(followupCrm(), /Diagnostico 3 Pontos.*paperclip-create-handoff-issue|paperclip-create-handoff-issue.*Diagnostico 3 Pontos/i);
  assert.match(diagnosticoTresPontos(), /Atendimento e Fechamento.*paperclip-create-handoff-issue|paperclip-create-handoff-issue.*Atendimento e Fechamento/i);
  assert.match(qaDemos(), /requer_ajuste.*Criador|Criador.*requer_ajuste/i);
  assert.match(qaDemos(), /block_source_issue/i);

  for (const name of [
    "agent-prospeccao.json",
    "agent-validador-dados-leads.json",
    "agent-ceo-prospeccao.json",
    "agent-redator-primeira-mensagem.json",
    "agent-qa-mensagens.json",
    "agent-followup-crm.json",
    "agent-diagnostico-3-pontos.json",
    "agent-atendimento.json",
    "agent-qa-demos.json",
  ]) {
    const agent = agentConfig(name);
    assert.match(agent.capabilities, /handoff|auto-delegacao|auto-delegação|worker-handoff/i, name);
  }
});

test("Configs dos agentes anunciam as automacoes implementadas", () => {
  const scout = agentConfig("agent-prospeccao.json");
  const steve = agentConfig("agent-ceo-prospeccao.json");
  const atendimentoAgent = agentConfig("agent-atendimento.json");
  const crm = agentConfig("agent-followup-crm.json");
  const presenca72h = agentConfig("agent-presenca72h.json");
  const qaDemosAgent = agentConfig("agent-qa-demos.json");
  const validador = agentConfig("agent-validador-dados-leads.json");
  const redator = agentConfig("agent-redator-primeira-mensagem.json");
  const qaMensagemAgent = agentConfig("agent-qa-mensagens.json");
  const diagnosticoAgent = agentConfig("agent-diagnostico-3-pontos.json");

  assert.match(scout.capabilities, /alimenta o CRM/i);
  assert.match(scout.capabilities, /deduplic/i);
  assert.match(scout.capabilities, /Validador de Dados/i);
  assert.match(steve.capabilities, /data-quality-report\.md/i);
  assert.match(steve.capabilities, /Redator de Primeira Mensagem/i);
  assert.match(atendimentoAgent.capabilities, /3 pontos reais/i);
  assert.match(atendimentoAgent.capabilities, /evidenc/i);
  assert.match(atendimentoAgent.capabilities, /Diagnostico 3 Pontos|Diagnóstico 3 Pontos/i);
  assert.match(atendimentoAgent.capabilities, /demo-brief/i);
  assert.match(crm.capabilities, /triagem/i);
  assert.match(crm.capabilities, /resumo executivo/i);
  assert.match(crm.capabilities, /follow-up inteligente/i);
  assert.match(crm.capabilities, /Fila do Dia/i);
  assert.match(crm.capabilities, /CRM Historico|CRM Histórico/i);
  assert.match(crm.capabilities, /QA de Mensagens/i);
  assert.match(crm.capabilities, /Diagnostico 3 Pontos|Diagnóstico 3 Pontos/i);
  assert.match(presenca72h.capabilities, /demo-brief/i);
  assert.match(qaDemosAgent.capabilities, /demo-brief/i);
  assert.match(validador.capabilities, /data-quality-report\.md/i);
  assert.match(redator.capabilities, /QA de Mensagens/i);
  assert.match(qaMensagemAgent.capabilities, /message-qa-report\.md/i);
  assert.match(diagnosticoAgent.capabilities, /fonte_ou_arquivo/i);
});

test("Worker Intake de Conversas normaliza prints ou textos e entrega evento para o CRM", () => {
  const prompt = intakeConversas();
  const crm = followupCrm();
  const readme = paperclipReadme();
  const agent = agentConfig("agent-intake-conversas.json");

  assert.match(prompt, /Worker Intake de Conversas/i);
  assert.match(prompt, /print|screenshot/i);
  assert.match(prompt, /texto colado/i);
  assert.match(prompt, /preservar resposta bruta/i);
  assert.match(prompt, /intake-conversas-YYYY-MM-DD\.md/i);
  assert.match(prompt, /conversas-normalizadas\.md/i);
  assert.match(prompt, /pipeline\.md/i);
  assert.match(prompt, /master-leads\.csv|master-leads\.xlsx/i);
  assert.match(prompt, /FRE-6/i);
  assert.match(prompt, /respondeu \[nome\]: \[mensagem recebida\]/i);
  assert.match(prompt, /ambiguidade/i);
  assert.match(prompt, /nao atualize o CRM|não atualize o CRM/i);
  assert.match(prompt, /Nunca envie mensagem para cliente/i);

  assert.match(crm, /Intake de Conversas/i);
  assert.match(crm, /intake-conversas-YYYY-MM-DD\.md/i);

  assert.equal(agent.name, "Sanji - Intake de Conversas");
  assert.equal(agent.adapterType, "codex_local");
  assert.equal(agent.metadata.noAutomaticMessaging, true);
  assert.match(agent.capabilities, /prints ou textos/i);
  assert.match(agent.capabilities, /CRM/i);
  assert.match(agent.adapterConfig.instructionsFilePath, /prompt-thread-intake-conversas\.md$/);

  assert.match(readme, /Intake de Conversas/i);
  assert.match(readme, /normalizar prints ou textos/i);
});

test("Worker QA de Demos revisa exemplos antes do link ser enviado", () => {
  const prompt = qaDemos();
  const presenca72h = criacao72h();
  const readme = paperclipReadme();
  const agent = agentConfig("agent-qa-demos.json");

  assert.match(prompt, /Worker QA de Demos\/Exemplos/i);
  assert.match(prompt, /qa-demos-YYYY-MM-DD\.md/i);
  assert.match(prompt, /aprovado_para_envio/i);
  assert.match(prompt, /requer_ajuste/i);
  assert.match(prompt, /dados inventados/i);
  assert.match(prompt, /nivel.*Presenca Local em 72h|nivel.*Presença Local em 72h/i);
  assert.doesNotMatch(prompt, /escopo_72h|72h enxuta|enxuto/i);
  assert.match(prompt, /copy-whatsapp\.md/i);
  assert.match(prompt, /galeria|gallery\.js/i);
  assert.match(prompt, /README\.md publico|README\.md público/i);
  assert.match(prompt, /desktop/i);
  assert.match(prompt, /mobile/i);
  assert.match(prompt, /links quebrados/i);
  assert.match(prompt, /nao enviar mensagem para cliente|não enviar mensagem para cliente/i);

  assert.match(presenca72h, /QA de Demos\/Exemplos/i);
  assert.match(presenca72h, /qa-request-YYYY-MM-DD\.md/i);
  assert.match(presenca72h, /nao entregue o link final ao usuario antes do QA|não entregue o link final ao usuário antes do QA/i);

  assert.equal(agent.name, "Johan - QA de Demos/Exemplos");
  assert.equal(agent.role, "qa");
  assert.equal(agent.adapterType, "codex_local");
  assert.equal(agent.metadata.noAutomaticMessaging, true);
  assert.match(agent.capabilities, /revisa demos/i);
  assert.match(agent.adapterConfig.instructionsFilePath, /prompt-thread-qa-demos\.md$/);

  assert.match(readme, /QA de Demos\/Exemplos/i);
  assert.match(readme, /qa-demos-YYYY-MM-DD\.md/i);
});

test("COO Freelancer orquestra a operacao sem executar trabalho dos especialistas", () => {
  const prompt = cooFreelancer();
  const readme = paperclipReadme();
  const agent = agentConfig("agent-coo-freelancer.json");

  assert.match(prompt, /COO Freelancer/i);
  assert.match(prompt, /ponto unico de entrada|ponto único de entrada/i);
  assert.match(prompt, /orquestrador operacional/i);
  assert.match(prompt, /Lead Scout Grande Vitoria|Lead Scout Grande Vitória/i);
  assert.match(prompt, /Validador de Dados de Leads/i);
  assert.match(prompt, /Redator de Primeira Mensagem/i);
  assert.match(prompt, /QA de Mensagens/i);
  assert.match(prompt, /Diagnostico 3 Pontos|Diagnóstico 3 Pontos/i);
  assert.match(prompt, /Follow-up CRM/i);
  assert.match(prompt, /Atendimento e Fechamento/i);
  assert.match(prompt, /Criador Presenca 72h|Criador Presença 72h/i);
  assert.match(prompt, /QA de Demos\/Exemplos/i);
  assert.match(prompt, /Ops de Entrega/i);
  assert.match(prompt, /status de hoje/i);
  assert.match(prompt, /proximo melhor passo|próximo melhor passo/i);
  assert.match(prompt, /coo-status-YYYY-MM-DD\.md/i);
  assert.match(prompt, /coo-decisions-YYYY-MM-DD\.md/i);
  assert.match(prompt, /orchestration-log\.md/i);
  assert.match(prompt, /nao envia WhatsApp|não envia WhatsApp/i);
  assert.match(prompt, /nao cria demo|não cria demo/i);
  assert.match(prompt, /nao muda preco|não muda preço/i);
  assert.match(prompt, /nao edita prompts|não edita prompts/i);
  assert.match(prompt, /sem QA/i);
  assert.match(prompt, /Scout.*Validador|Validador.*Scout/i);
  assert.match(prompt, /Validador.*Steve|Steve.*Validador/i);
  assert.match(prompt, /Redator de Primeira Mensagem.*primeira abordagem|primeira abordagem.*Redator de Primeira Mensagem/i);
  assert.match(prompt, /QA de Mensagens.*lead-cards|lead-cards.*QA de Mensagens/i);
  assert.match(prompt, /Diagnostico 3 Pontos.*Atendimento|Diagnóstico 3 Pontos.*Atendimento|Atendimento.*Diagnostico 3 Pontos/i);
  assert.match(prompt, /demo-brief\.md/i);
  assert.match(prompt, /Fila do Dia/i);
  assert.match(prompt, /CRM Historico|CRM Histórico/i);

  assert.equal(agent.name, "Natienska - COO");
  assert.equal(agent.role, "pm");
  assert.equal(agent.adapterType, "codex_local");
  assert.equal(agent.metadata.noAutomaticMessaging, true);
  assert.match(agent.capabilities, /orquestra/i);
  assert.match(agent.capabilities, /Validador de Dados/i);
  assert.match(agent.capabilities, /Redator de Primeira Mensagem/i);
  assert.match(agent.capabilities, /QA de Mensagens/i);
  assert.match(agent.capabilities, /Diagnostico 3 Pontos|Diagnóstico 3 Pontos/i);
  assert.match(agent.adapterConfig.instructionsFilePath, /prompt-thread-coo-freelancer\.md$/);

  assert.match(readme, /COO Freelancer/i);
  assert.match(readme, /ponto unico de entrada|ponto único de entrada/i);
});

test("Workers usam contrato de dados e CLI SQLite como unica escrita de estado", () => {
  const contract = read("docs/freelancer/data-contract.md");
  const prompts = [
    prospeccao(),
    ceoProspeccao(),
    followupCrm(),
    atendimento(),
    intakeConversas(),
    cooFreelancer(),
    validadorDados(),
    redatorPrimeiraMensagem(),
    qaMensagens(),
    diagnosticoTresPontos(),
    criacao72h(),
    qaDemos(),
    checklistEntrega(),
  ];
  const readme = paperclipReadme();

  assert.match(contract, /SQLite/i);
  assert.match(contract, /\.scratch\/db\/freela\.sqlite/i);
  assert.match(contract, /scripts\/freela-crm\.mjs/i);
  assert.match(contract, /fonte de verdade/i);
  assert.match(contract, /nao sobrescrever|não sobrescrever/i);
  assert.match(contract, /Dados privados/i);

  for (const prompt of prompts) {
    assert.match(prompt, /docs\/freelancer\/data-contract\.md/i);
    assert.match(prompt, /scripts\/freela-crm\.mjs/i);
    assert.match(prompt, /SQLite/i);
    assert.match(prompt, /nao edite.*\.scratch.*manualmente|não edite.*\.scratch.*manualmente/i);
  }

  assert.match(readme, /SQLite/i);
  assert.match(readme, /data-contract\.md/i);
  assert.match(readme, /scripts\/freela-crm\.mjs/i);
});

test("Paperclip instructions know SQLite physical path and compatibility symlink", () => {
  const dataContract = read("docs/freelancer/data-contract.md");
  const paperclipReadme = read("docs/freelancer/paperclip/README.md");

  for (const doc of [dataContract, paperclipReadme]) {
    assert.match(doc, /Application Support\/freela-paperclip\/db\/freela\.sqlite/i);
    assert.match(doc, /\.scratch\/db\/freela\.sqlite/i);
    assert.match(doc, /compatibilidade|symlink/i);
    assert.match(doc, /node scripts\/freela-crm\.mjs/i);
  }

  const promptFiles = [
    "docs/freelancer/prompt-thread-atendimento-clientes.md",
    "docs/freelancer/prompt-thread-ceo-prospeccao.md",
    "docs/freelancer/prompt-thread-coo-freelancer.md",
    "docs/freelancer/prompt-thread-criacao-72h.md",
    "docs/freelancer/prompt-thread-diagnostico-3-pontos.md",
    "docs/freelancer/prompt-thread-followup-crm.md",
    "docs/freelancer/prompt-thread-intake-conversas.md",
    "docs/freelancer/prompt-thread-prospeccao-leads.md",
    "docs/freelancer/prompt-thread-qa-demos.md",
    "docs/freelancer/prompt-thread-qa-mensagens.md",
    "docs/freelancer/prompt-thread-redator-primeira-mensagem.md",
    "docs/freelancer/prompt-thread-validador-dados-leads.md",
    "docs/freelancer/checklist-entrega.md",
  ];

  for (const file of promptFiles) {
    const prompt = read(file);
    assert.match(prompt, /\.scratch\/db\/freela\.sqlite/i, file);
    assert.match(prompt, /compatibilidade|symlink|data-contract/i, file);
  }
});

test("Agentes Paperclip declaram repo como raiz de trabalho e escrita", () => {
  const readme = paperclipReadme();

  for (const name of agentConfigNames) {
    const agent = agentConfig(name);
    const args = agent.adapterConfig.extraArgs;
    const addDirs = args.flatMap((arg, index) => (arg === "--add-dir" ? [args[index + 1]] : []));
    const env = agent.adapterConfig.env ?? {};

    assert.equal(agent.adapterConfig.cwd, repoRoot, `${name} cwd`);
    assert.ok(args.includes("-C"), `${name} deve passar -C`);
    assert.equal(args[args.indexOf("-C") + 1], repoRoot, `${name} -C`);
    assert.ok(addDirs.includes(repoRoot), `${name} deve permitir escrita no repo`);
    assert.ok(addDirs.includes(sqliteWritableRoot), `${name} deve permitir escrita no DB oficial`);
    assert.equal(env.CODEX_HOME, expectedAgentCodexHome(agent.id), `${name} CODEX_HOME isolado`);
    assert.notEqual(env.CODEX_HOME, "/Users/luiz_fbm/.codex", `${name} nao deve usar CODEX_HOME pessoal`);
    assert.ok(args.includes("--sandbox"), `${name} deve manter sandbox`);
    assert.equal(
      args[args.indexOf("--sandbox") + 1],
      browserRuntimeAgentConfigNames.has(name) ? "danger-full-access" : "workspace-write",
      `${name} sandbox`,
    );
  }

  assert.match(readme, /-C \/Users\/luiz_fbm\/Developer\/freela/i);
  assert.match(readme, /--add-dir \/Users\/luiz_fbm\/Developer\/freela/i);
  assert.match(readme, /--add-dir \/Users\/luiz_fbm\/Library\/Application Support\/freela-paperclip/i);
  assert.match(readme, /CODEX_HOME=.*companies\/.*\/agents\/.*\/codex-home/i);
  assert.doesNotMatch(readme, /CODEX_HOME=\/Users\/luiz_fbm\/\.codex/i);
  assert.match(readme, /COO Freelancer.*Scout.*danger-full-access|Scout.*COO Freelancer.*danger-full-access/i);
  assert.match(readme, /dangerouslyBypassApprovalsAndSandbox=false/i);
});

test("Sync de agentes Paperclip e dry-run por padrao e documenta apply explicito", () => {
  const scriptPath = join(rootDir, "scripts/paperclip-sync-agents.mjs");
  const readme = paperclipReadme();
  const script = read("scripts/paperclip-sync-agents.mjs");

  assert.equal(existsSync(scriptPath), true, "script de sync de agentes deve existir");
  assert.match(readme, /paperclip-sync-agents\.mjs/i);
  assert.match(readme, /--dry-run/i);
  assert.match(readme, /--apply/i);
  assert.match(readme, /allowlist/i);
  assert.match(readme, /instructions-path/i);
  assert.match(readme, /cwd|extraArgs|instructionsRootPath/i);

  assert.match(script, /GET/i);
  assert.match(script, /\/api\/companies\/.*\/agents/i);
  assert.match(script, /PATCH/i);
  assert.match(script, /\/api\/agents\/.*\/instructions-path/i);
  assert.match(script, /SAFE_AGENT_FIELDS|safeAgentFields|ALLOWED_AGENT_FIELDS/i);
  assert.match(script, /PAPERCLIP_API_URL/i);
  assert.match(script, /PAPERCLIP_API_KEY/i);
  assert.match(script, /PAPERCLIP_RUN_ID/i);
  assert.match(script, /PAPERCLIP_COMPANY_ID/i);
  assert.doesNotMatch(script, /npx|paperclipai|child_process|spawnSync/i);
});

test("Sync de agentes Paperclip em dry-run calcula somente allowlist sem fazer PATCH", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "paperclip-agent-sync-dry-run-"));
  writeTempAgentConfig(tempRoot, {
    id: "agent-1",
    name: "Worker Local",
    role: "qa",
    title: "Titulo local",
    icon: "shield-check",
    reportsTo: "manager-1",
    capabilities: "Capacidade local revisada",
    adapterConfig: {
      instructionsFilePath: "/repo/docs/agent.md",
      instructionsRootPath: "/repo/docs",
      cwd: "/repo",
      extraArgs: ["--skip-git-repo-check", "-C", "/repo", "--add-dir", "/repo"],
      model: "gpt-5.5",
      env: {
        PATH: "/safe/bin:/usr/bin",
        CODEX_HOME: "/paperclip/companies/company-1/agents/agent-1/codex-home",
      },
    },
    permissions: {
      canCreateAgents: true,
      trustPreset: "admin",
    },
    budgetMonthlyCents: 999999,
    metadata: {
      paperclipOperationKey: "qa-local",
      noAutomaticMessaging: true,
    },
  });

  const liveAgents = [
    {
      id: "agent-1",
      name: "Worker Antigo",
      role: "general",
      title: "Titulo antigo",
      icon: "circle",
      reportsTo: "manager-old",
      capabilities: "Capacidade antiga",
      adapterConfig: {
        instructionsFilePath: "/repo/docs/old.md",
        instructionsRootPath: "/old/docs",
        cwd: "/old",
        extraArgs: ["--skip-git-repo-check", "-C", "/old", "--add-dir", "/old"],
        model: "gpt-4.1",
        env: {
          PATH: {
            type: "plain",
            value: "/old/bin:/usr/bin",
          },
          CODEX_HOME: {
            type: "plain",
            value: "/old/codex-home",
          },
          OPENAI_API_KEY: {
            type: "plain",
            value: "",
          },
        },
      },
      permissions: {
        canCreateAgents: false,
        trustPreset: "standard",
      },
      budgetMonthlyCents: 0,
      metadata: {
        paperclipOperationKey: "qa-old",
        liveOnly: "preservar",
      },
    },
  ];

  await withAgentApiServer(liveAgents, async (apiBase, requests) => {
    const stdout = await execFileText(
      process.execPath,
      [
        join(rootDir, "scripts/paperclip-sync-agents.mjs"),
        "--root",
        tempRoot,
        "--company-id",
        "company-1",
        "--api-base",
        apiBase,
      ],
      { encoding: "utf8" },
    );

    const result = JSON.parse(stdout);
    const change = result.changes[0];

    assert.equal(result.mode, "dry-run");
    assert.equal(result.summary.localAgents, 1);
    assert.equal(result.summary.changedAgents, 1);
    assert.equal(change.agentId, "agent-1");
    assert.equal(change.safePatch.name, "Worker Local");
    assert.equal(change.safePatch.capabilities, "Capacidade local revisada");
    assert.equal(change.safePatch.metadata.paperclipOperationKey, "qa-local");
    assert.equal(change.safePatch.metadata.liveOnly, "preservar");
    assert.deepEqual(change.adapterConfigPatch, {
      cwd: "/repo",
      extraArgs: ["--skip-git-repo-check", "-C", "/repo", "--add-dir", "/repo"],
      env: {
        PATH: "/safe/bin:/usr/bin",
        CODEX_HOME: "/paperclip/companies/company-1/agents/agent-1/codex-home",
      },
      instructionsRootPath: "/repo/docs",
    });
    assert.deepEqual(change.instructionsPath, { path: "/repo/docs/agent.md" });
    assert.deepEqual(
      requests.map((request) => request.method),
      ["GET"],
      "dry-run nao deve fazer PATCH",
    );
    assert.doesNotMatch(stdout, /gpt-5\.5|SECRET_TOKEN|budgetMonthlyCents|permissions|trustPreset/i);
  });
});

test("Sync de agentes Paperclip pula configs planejadas sem id vivo", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "paperclip-agent-sync-draft-"));
  writeTempAgentConfig(
    tempRoot,
    {
      name: "Atendimento WhatsApp",
      role: "general",
      title: "Agente planejado",
      capabilities: "Ainda nao criado no Paperclip vivo.",
      adapterConfig: {
        instructionsFilePath: "/repo/docs/whatsapp.md",
      },
    },
    "agent-whatsapp-draft.json",
  );

  await withAgentApiServer([], async (apiBase, requests) => {
    const stdout = await execFileText(
      process.execPath,
      [
        join(rootDir, "scripts/paperclip-sync-agents.mjs"),
        "--root",
        tempRoot,
        "--company-id",
        "company-1",
        "--api-base",
        apiBase,
      ],
      { encoding: "utf8" },
    );

    const result = JSON.parse(stdout);

    assert.equal(result.mode, "dry-run");
    assert.equal(result.summary.localAgents, 0);
    assert.equal(result.summary.skippedDraftAgents, 1);
    assert.equal(result.summary.changedAgents, 0);
    assert.deepEqual(result.changes, []);
    assert.deepEqual(
      requests.map((request) => request.method),
      ["GET"],
    );
  });
});

test("Sync de agentes Paperclip rejeita run-id manual que nao seja UUID", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "paperclip-agent-sync-invalid-run-id-"));
  writeTempAgentConfig(tempRoot, {
    id: "agent-1",
    name: "Worker Local",
    role: "qa",
    capabilities: "Capacidade local",
  });

  await assert.rejects(
    execFileText(process.execPath, [
      join(rootDir, "scripts/paperclip-sync-agents.mjs"),
      "--root",
      tempRoot,
      "--company-id",
      "company-1",
      "--api-base",
      "http://127.0.0.1:9",
      "--run-id",
      "codex-agent-sync-debug",
    ]),
    (error) => {
      assert.match(error.stderr, /--run-id.*UUID/i);
      return true;
    },
  );
});

test("Sync de agentes Paperclip rejeita env perigoso em configs versionadas", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "paperclip-agent-sync-dangerous-env-"));
  writeTempAgentConfig(tempRoot, {
    id: "agent-1",
    name: "Worker Local",
    role: "qa",
    capabilities: "Capacidade local",
    adapterConfig: {
      cwd: "/repo",
      extraArgs: ["--skip-git-repo-check", "-C", "/repo", "--add-dir", "/repo"],
      instructionsRootPath: "/repo/docs",
      env: {
        PATH: "/safe/bin:/usr/bin",
        CODEX_HOME: "/paperclip/companies/company-1/agents/agent-1/codex-home",
        SECRET_TOKEN: "nao-sincronizar",
      },
    },
  });

  const liveAgents = [
    {
      id: "agent-1",
      name: "Worker Antigo",
      role: "qa",
      capabilities: "Capacidade antiga",
      adapterConfig: {
        cwd: "/old",
        extraArgs: ["--skip-git-repo-check", "-C", "/old", "--add-dir", "/old"],
        instructionsRootPath: "/old/docs",
      },
    },
  ];

  await withAgentApiServer(liveAgents, async (apiBase) => {
    await assert.rejects(
      execFileText(process.execPath, [
        join(rootDir, "scripts/paperclip-sync-agents.mjs"),
        "--root",
        tempRoot,
        "--company-id",
        "company-1",
        "--api-base",
        apiBase,
      ]),
      (error) => {
        assert.match(error.stderr, /adapterConfig\.env\.SECRET_TOKEN/i);
        return true;
      },
    );
  });
});

test("Sync de agentes Paperclip em apply usa rota dedicada de instructions e bloqueia campos perigosos", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "paperclip-agent-sync-apply-"));
  writeTempAgentConfig(tempRoot, {
    id: "agent-1",
    name: "Worker Local",
    role: "qa",
    title: "Titulo local",
    icon: "shield-check",
    reportsTo: "manager-1",
    capabilities: "Capacidade local revisada",
    adapterConfig: {
      instructionsFilePath: "/repo/docs/agent.md",
      instructionsRootPath: "/repo/docs",
      cwd: "/repo",
      extraArgs: ["--skip-git-repo-check", "-C", "/repo", "--add-dir", "/repo"],
      model: "gpt-5.5",
      env: {
        PATH: "/safe/bin:/usr/bin",
        CODEX_HOME: "/paperclip/companies/company-1/agents/agent-1/codex-home",
      },
    },
    desiredSkills: ["nao-sincronizar"],
    runtimeConfig: {
      heartbeat: {
        enabled: true,
      },
    },
    permissions: {
      canCreateAgents: true,
      trustPreset: "admin",
    },
    metadata: {
      paperclipOperationKey: "qa-local",
      noAutomaticMessaging: true,
    },
  });

  const liveAgents = [
    {
      id: "agent-1",
      name: "Worker Antigo",
      role: "general",
      title: "Titulo antigo",
      icon: "circle",
      reportsTo: "manager-old",
      capabilities: "Capacidade antiga",
      adapterConfig: {
        instructionsFilePath: "/repo/docs/old.md",
        instructionsRootPath: "/old/docs",
        cwd: "/old",
        extraArgs: ["--skip-git-repo-check", "-C", "/old", "--add-dir", "/old"],
        model: "gpt-4.1",
      },
      metadata: {
        paperclipOperationKey: "qa-old",
        liveOnly: "preservar",
      },
    },
  ];

  await withAgentApiServer(liveAgents, async (apiBase, requests) => {
    const stdout = await execFileText(
      process.execPath,
      [
        join(rootDir, "scripts/paperclip-sync-agents.mjs"),
        "--root",
        tempRoot,
        "--company-id",
        "company-1",
        "--api-base",
        apiBase,
        "--run-id",
        "11111111-1111-4111-8111-111111111111",
        "--apply",
      ],
      { encoding: "utf8" },
    );

    const result = JSON.parse(stdout);
    const patchRequests = requests.filter((request) => request.method === "PATCH");
    const genericPatch = patchRequests.find((request) => request.url === "/api/agents/agent-1");
    const instructionsPatch = patchRequests.find((request) => request.url === "/api/agents/agent-1/instructions-path");

    assert.equal(result.mode, "apply");
    assert.equal(result.summary.changedAgents, 1);
    assert.equal(patchRequests.length, 2);
    assert.ok(genericPatch, "campos seguros devem usar PATCH /api/agents/:id");
    assert.ok(instructionsPatch, "instructions path deve usar rota dedicada");
    assert.equal(genericPatch.headers["x-paperclip-run-id"], "11111111-1111-4111-8111-111111111111");
    assert.equal(instructionsPatch.headers["x-paperclip-run-id"], "11111111-1111-4111-8111-111111111111");
    assert.equal(genericPatch.body.name, "Worker Local");
    assert.equal(genericPatch.body.capabilities, "Capacidade local revisada");
    assert.equal(genericPatch.body.metadata.liveOnly, "preservar");
    assert.equal(genericPatch.body.metadata.paperclipOperationKey, "qa-local");
    assert.deepEqual(genericPatch.body.adapterConfig, {
      cwd: "/repo",
      extraArgs: ["--skip-git-repo-check", "-C", "/repo", "--add-dir", "/repo"],
      env: {
        PATH: "/safe/bin:/usr/bin",
        CODEX_HOME: "/paperclip/companies/company-1/agents/agent-1/codex-home",
      },
      instructionsRootPath: "/repo/docs",
    });
    assert.deepEqual(instructionsPatch.body, { path: "/repo/docs/agent.md" });

    const genericBody = JSON.stringify(genericPatch.body);
    assert.doesNotMatch(genericBody, /model|SECRET_TOKEN|permissions|desiredSkills|runtimeConfig/i);
    assert.doesNotMatch(stdout, /SECRET_TOKEN|trustPreset|desiredSkills|runtimeConfig/i);
  });
});

test("Paperclip freelancer e tratado como operacao diaria, nao piloto ou MVP", () => {
  const readme = paperclipReadme();
  const docs = [
    readme,
    ...agentConfigNames.map((name) => read(`docs/freelancer/paperclip/${name}`)),
  ];

  assert.match(readme, /sistema diario da operacao freelancer/i);

  for (const doc of docs) {
    assert.doesNotMatch(doc, /piloto|pilot|mvp/i);
  }
});

test("Prompts externos dos agentes Paperclip se apresentam como workers", () => {
  const promptAgents = [
    ["Atendimento e Fechamento", "prompt-thread-atendimento-clientes.md"],
    ["CEO de Prospeccao", "prompt-thread-ceo-prospeccao.md"],
    ["COO Freelancer", "prompt-thread-coo-freelancer.md"],
    ["Criador Presenca 72h", "prompt-thread-criacao-72h.md"],
    ["Diagnóstico 3 Pontos", "prompt-thread-diagnostico-3-pontos.md"],
    ["Follow-up CRM", "prompt-thread-followup-crm.md"],
    ["Intake de Conversas", "prompt-thread-intake-conversas.md"],
    ["Lead Scout Grande Vitoria", "prompt-thread-prospeccao-leads.md"],
    ["QA de Demos/Exemplos", "prompt-thread-qa-demos.md"],
    ["QA de Mensagens", "prompt-thread-qa-mensagens.md"],
    ["Redator de Primeira Mensagem", "prompt-thread-redator-primeira-mensagem.md"],
    ["Validador de Dados de Leads", "prompt-thread-validador-dados-leads.md"],
  ];

  for (const [agentName, fileName] of promptAgents) {
    const prompt = read(`docs/freelancer/${fileName}`);
    assert.match(prompt, /^# Prompt para worker:/m, `${fileName} deve ser prompt de worker`);
    assert.match(prompt, /Use este arquivo como instrucao externa do agente Paperclip/i, fileName);
    assert.doesNotMatch(prompt, /Prompt para nova conversa/i, fileName);
    assert.doesNotMatch(prompt, /Use este texto como a primeira mensagem de uma conversa nova/i, fileName);
    assert.match(prompt, new RegExp(agentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), fileName);
  }
});

test("Navegador assistido isola perfil pessoal e Scout usa perfil operacional", () => {
  const spec = browserAutomation();
  const openerPath = join(rootDir, "scripts/paperclip-open-chrome-window.mjs");
  const openerScript = read("scripts/paperclip-open-chrome-window.mjs");
  const scout = prospeccao();
  const localProspector = read("docs/freelancer/prompt-local-client-prospector-vitoria.md");
  const coo = cooFreelancer();
  const readme = paperclipReadme();

  assert.equal(existsSync(openerPath), true, "opener seguro do Chrome deve existir");
  assert.match(openerScript, /function acquireLock/i);
  assert.match(openerScript, /staleLockWindowMs/i);
  assert.match(openerScript, /recentPlaywrightCrashes/i);
  assert.match(openerScript, /recentFirefoxCrashes/i);
  assert.match(openerScript, /spotlightStatus/i);
  assert.match(openerScript, /chromeMetadataVisible/i);
  assert.match(openerScript, /--preflight/i);
  assert.match(openerScript, /LaunchServices\/Spotlight nao consegue resolver apps/i);
  assert.ok(
    openerScript.indexOf("if (statusOnly)") < openerScript.indexOf("acquireLock();"),
    "--status deve ser somente leitura e nao disputar lock",
  );
  assert.match(openerScript, /PAPERCLIP_CHROME_OPEN_BLOCKED/i);
  assert.match(spec, /Chrome pessoal/i);
  assert.match(spec, /perfil pessoal/i);
  assert.match(spec, /permissao permanente|permissão permanente/i);
  assert.match(spec, /--new-window/i);
  assert.match(spec, /nao usar.*--user-data-dir|não usar.*--user-data-dir/i);
  assert.match(spec, /nao reutilizar.*abas abertas|não reutilizar.*abas abertas/i);
  assert.match(spec, /somente leitura/i);
  assert.match(spec, /scripts\/paperclip-open-chrome-window\.mjs/i);
  assert.match(spec, /--preflight/i);
  assert.match(spec, /nao chamar.*open -a "Google Chrome".*direto|não chamar.*open -a "Google Chrome".*direto/i);
  assert.match(spec, /crash recente/i);
  assert.match(spec, /versao.*desalinhada|versão.*desalinhada/i);
  assert.match(spec, /spotlightStatus/i);
  assert.match(spec, /chromeMetadataVisible/i);
  assert.match(spec, /Spotlight\/metadata services/i);
  assert.match(spec, /lock/i);
  assert.match(spec, /Playwright WebKit/i);
  assert.match(spec, /org\.webkit\.Playwright/i);
  assert.match(spec, /Playwright Firefox/i);
  assert.match(spec, /org\.mozilla\.nightly/i);
  assert.match(spec, /nao usar.*in-app browser|não usar.*in-app browser/i);

  for (const prompt of [coo]) {
    assert.match(prompt, /docs\/freelancer\/paperclip\/browser-automation\.md/i);
    assert.match(prompt, /nova janela/i);
    assert.match(prompt, /Chrome pessoal/i);
    assert.match(prompt, /perfil pessoal/i);
    assert.match(prompt, /scripts\/paperclip-open-chrome-window\.mjs/i);
    assert.match(prompt, /--preflight/i);
  }

  for (const prompt of [scout, localProspector, readme]) {
    assert.match(prompt, /docs\/freelancer\/paperclip\/browser-automation\.md/i);
    assert.match(prompt, /perfil operacional `Paperclip Scout` pode reutilizar a janela existente/i);
    assert.match(prompt, /Chrome pessoal/i);
    assert.match(prompt, /perfil pessoal/i);
    assert.match(prompt, /scripts\/paperclip-open-chrome-window\.mjs/i);
    assert.match(prompt, /--preflight/i);
  }
});

test("Scout e Validador tratam preflight do Chrome como gate do Bio Evidence Pack", () => {
  const scout = prospeccao();
  const localProspector = read("docs/freelancer/prompt-local-client-prospector-vitoria.md");
  const validator = validadorDados();

  for (const prompt of [scout, localProspector]) {
    assert.match(prompt, /--preflight/i);
    assert.match(prompt, /Bio Evidence Pack/i);
    assert.match(prompt, /preflight.*falh|falh.*preflight/i);
    assert.match(prompt, /nao declarar.*bio.*ok|não declarar.*bio.*ok/i);
  }

  assert.match(validator, /--preflight/i);
  assert.match(validator, /Bio Evidence Pack/i);
  assert.match(validator, /preflight.*falh|falh.*preflight/i);
  assert.match(validator, /bloquear.*bio.*ok|bloqueie.*bio.*ok|não aceitar.*bio.*ok|nao aceitar.*bio.*ok/i);
});

test("Preflight do Chrome assistido retorna contrato de maquina antes da prospeccao", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "paperclip-chrome-preflight-"));
  const fakeBinDir = join(tempRoot, "bin");
  const fakeChromeApp = join(tempRoot, "Google Chrome.app");
  const fakeChromeBinDir = join(fakeChromeApp, "Contents/MacOS");
  const fakeChromeBin = join(fakeChromeBinDir, "Google Chrome");
  const openArgsPath = join(tempRoot, "open-args.txt");

  mkdirSync(fakeBinDir, { recursive: true });
  mkdirSync(fakeChromeBinDir, { recursive: true });
  mkdirSync(join(tempRoot, "DiagnosticReports"), { recursive: true });

  writeExecutable(
    fakeChromeBin,
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Google Chrome 149.0.7827.115"
  exit 0
fi
echo "unexpected chrome invocation: $*" >&2
exit 1
`,
  );
  writeExecutable(join(fakeBinDir, "osascript"), `#!/bin/sh\necho "149.0.7827.115"\n`);
  writeExecutable(join(fakeBinDir, "mdutil"), `#!/bin/sh\nprintf '/:\\n\\tIndexing enabled.\\n'\n`);
  writeExecutable(join(fakeBinDir, "mdls"), `#!/bin/sh\necho 'kMDItemCFBundleIdentifier = "com.google.Chrome"'\n`);
  writeExecutable(join(fakeBinDir, "ps"), `#!/bin/sh\nprintf 'COMMAND\\n'\n`);
  writeExecutable(
    join(fakeBinDir, "open"),
    `#!/bin/sh
echo "$*" > "${openArgsPath}"
exit 0
`,
  );

  const stdout = await execFileText(process.execPath, ["scripts/paperclip-open-chrome-window.mjs", "--preflight"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH}`,
      PAPERCLIP_CHROME_APP: fakeChromeApp,
      PAPERCLIP_BROWSER_DIAGNOSTIC_DIR: join(tempRoot, "DiagnosticReports"),
      PAPERCLIP_BROWSER_SCRATCH_DIR: join(tempRoot, "scratch"),
    },
  });

  const result = JSON.parse(stdout);

  assert.equal(result.ready, true);
  assert.equal(result.status, "ready");
  assert.equal(result.chromeApp, fakeChromeApp);
  assert.equal(result.chromeAppExists, true);
  assert.equal(result.chromeBinExists, true);
  assert.equal(result.chromeMetadataVisible, true);
  assert.equal(result.spotlightServerDisabled, false);
  assert.equal(result.smokeTest.opened, true);
  assert.equal(result.smokeTest.targetUrl, "about:blank");
  assert.match(readFileSync(openArgsPath, "utf8"), /--new-window about:blank/);
});

test("Preflight do Chrome assistido trata metadata indisponivel como alerta se o smoke test abre", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "paperclip-chrome-preflight-metadata-warning-"));
  const fakeBinDir = join(tempRoot, "bin");
  const fakeChromeApp = join(tempRoot, "Google Chrome.app");
  const fakeChromeBinDir = join(fakeChromeApp, "Contents/MacOS");
  const fakeChromeBin = join(fakeChromeBinDir, "Google Chrome");
  const openArgsPath = join(tempRoot, "open-args.txt");

  mkdirSync(fakeBinDir, { recursive: true });
  mkdirSync(fakeChromeBinDir, { recursive: true });
  mkdirSync(join(tempRoot, "DiagnosticReports"), { recursive: true });

  writeExecutable(
    fakeChromeBin,
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Google Chrome 149.0.7827.115"
  exit 0
fi
echo "unexpected chrome invocation: $*" >&2
exit 1
`,
  );
  writeExecutable(join(fakeBinDir, "osascript"), `#!/bin/sh\necho "149.0.7827.115"\n`);
  writeExecutable(join(fakeBinDir, "mdutil"), `#!/bin/sh\necho "Spotlight server is disabled."\n`);
  writeExecutable(join(fakeBinDir, "mdls"), `#!/bin/sh\necho "$1: could not find $1."\nexit 1\n`);
  writeExecutable(join(fakeBinDir, "ps"), `#!/bin/sh\nprintf 'COMMAND\\n'\n`);
  writeExecutable(
    join(fakeBinDir, "open"),
    `#!/bin/sh
echo "$*" > "${openArgsPath}"
exit 0
`,
  );

  const stdout = await execFileText(process.execPath, ["scripts/paperclip-open-chrome-window.mjs", "--preflight"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH}`,
      PAPERCLIP_CHROME_APP: fakeChromeApp,
      PAPERCLIP_BROWSER_DIAGNOSTIC_DIR: join(tempRoot, "DiagnosticReports"),
      PAPERCLIP_BROWSER_SCRATCH_DIR: join(tempRoot, "scratch"),
    },
  });

  const result = JSON.parse(stdout);

  assert.equal(result.ready, true);
  assert.equal(result.status, "ready");
  assert.equal(result.spotlightServerDisabled, true);
  assert.equal(result.chromeMetadataVisible, false);
  assert.deepEqual(result.warnings, ["spotlight_unavailable", "chrome_metadata_unavailable"]);
  assert.equal(result.smokeTest.opened, true);
  assert.match(readFileSync(openArgsPath, "utf8"), /--new-window about:blank/);
});

test("Abertura do Chrome assistido nao bloqueia por metadata indisponivel quando open funciona", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "paperclip-chrome-open-metadata-warning-"));
  const fakeBinDir = join(tempRoot, "bin");
  const fakeChromeApp = join(tempRoot, "Google Chrome.app");
  const fakeChromeBinDir = join(fakeChromeApp, "Contents/MacOS");
  const fakeChromeBin = join(fakeChromeBinDir, "Google Chrome");
  const openArgsPath = join(tempRoot, "open-args.txt");

  mkdirSync(fakeBinDir, { recursive: true });
  mkdirSync(fakeChromeBinDir, { recursive: true });
  mkdirSync(join(tempRoot, "DiagnosticReports"), { recursive: true });

  writeExecutable(
    fakeChromeBin,
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Google Chrome 149.0.7827.115"
  exit 0
fi
echo "unexpected chrome invocation: $*" >&2
exit 1
`,
  );
  writeExecutable(join(fakeBinDir, "osascript"), `#!/bin/sh\necho "149.0.7827.115"\n`);
  writeExecutable(join(fakeBinDir, "mdutil"), `#!/bin/sh\necho "Spotlight server is disabled."\n`);
  writeExecutable(join(fakeBinDir, "mdls"), `#!/bin/sh\necho "$1: could not find $1."\nexit 1\n`);
  writeExecutable(join(fakeBinDir, "ps"), `#!/bin/sh\nprintf 'COMMAND\\n'\n`);
  writeExecutable(
    join(fakeBinDir, "open"),
    `#!/bin/sh
echo "$*" > "${openArgsPath}"
exit 0
`,
  );

  await execFileText(process.execPath, ["scripts/paperclip-open-chrome-window.mjs", "--url", "https://example.com/"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH}`,
      PAPERCLIP_CHROME_APP: fakeChromeApp,
      PAPERCLIP_BROWSER_DIAGNOSTIC_DIR: join(tempRoot, "DiagnosticReports"),
      PAPERCLIP_BROWSER_SCRATCH_DIR: join(tempRoot, "scratch"),
    },
  });

  assert.match(readFileSync(openArgsPath, "utf8"), /--new-window https:\/\/example\.com\//);
});

test("Smoke test do Scout valida perfil operacional e leitura DOM do Instagram", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "paperclip-scout-smoke-"));
  const fakeBinDir = join(tempRoot, "bin");
  const fakeChromeApp = join(tempRoot, "Google Chrome.app");
  const fakeChromeBinDir = join(fakeChromeApp, "Contents/MacOS");
  const fakeChromeBin = join(fakeChromeBinDir, "Google Chrome");
  const chromeUserDataDir = join(tempRoot, "Chrome");
  const chromeArgsPath = join(tempRoot, "chrome-args.txt");
  const osascriptPath = join(tempRoot, "osascript.txt");

  mkdirSync(fakeBinDir, { recursive: true });
  mkdirSync(fakeChromeBinDir, { recursive: true });
  mkdirSync(chromeUserDataDir, { recursive: true });

  writeFileSync(
    join(chromeUserDataDir, "Local State"),
    JSON.stringify({
      profile: {
        info_cache: {
          Default: { name: "Luiz Filipe", user_name: "lfilipe051@gmail.com" },
          "Profile 1": { name: "Paperclip Scout", user_name: "paperclip@example.com" },
        },
      },
    }),
  );
  writeExecutable(
    fakeChromeBin,
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Google Chrome 149.0.7827.115"
  exit 0
fi
printf '%s\\n' "$@" > "${chromeArgsPath}"
exit 0
`,
  );
  writeExecutable(
    join(fakeBinDir, "open"),
    `#!/bin/sh
echo "Scout smoke must open profile URL through Chrome binary, not open" >&2
exit 9
`,
  );
  writeExecutable(
    join(fakeBinDir, "osascript"),
    `#!/bin/sh
printf '%s\\n' "$2" > "${osascriptPath}"
if printf '%s' "$2" | grep -q 'front window'; then
  echo "front window must not be used for Scout smoke" >&2
  exit 1
fi
if ! printf '%s' "$2" | grep -q 'https://www.instagram.com/'; then
  echo "Scout smoke must target the Instagram home tab/window by exact root URL" >&2
  exit 1
fi
if ! printf '%s' "$2" | grep -q 'paperclip-scout-smoke'; then
  echo "Scout smoke must use a unique tab marker for the Instagram home check" >&2
  exit 1
fi
if ! printf '%s' "$2" | grep -q 'instagram.com/#paperclip-scout-smoke'; then
  echo "Scout smoke marker must preserve the root slash before the hash" >&2
  exit 1
fi
cat <<'JSON'
{"href":"https://www.instagram.com/#paperclip-scout-smoke-test","title":"Instagram","bodyText":"Home Search Messages lztesteprivado Suggested for you","readyState":"complete"}
JSON
`,
  );

  const stdout = await execFileText(process.execPath, ["scripts/paperclip-chrome-scout-smoke.mjs", "--instagram"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PATH: `${fakeBinDir}:${process.env.PATH}`,
      PAPERCLIP_CHROME_APP: fakeChromeApp,
      PAPERCLIP_CHROME_BIN: fakeChromeBin,
      PAPERCLIP_CHROME_USER_DATA_DIR: chromeUserDataDir,
      PAPERCLIP_CHROME_PROFILE_NAME: "Paperclip Scout",
      PAPERCLIP_INSTAGRAM_ACCOUNT: "lztesteprivado",
    },
  });

  const result = JSON.parse(stdout);

  assert.equal(result.ready, true);
  assert.equal(result.status, "ready");
  assert.equal(result.href, "https://www.instagram.com/#paperclip-scout-smoke-test");
  assert.equal(result.chromeOpenReady, true);
  assert.equal(result.domReadReady, true);
  assert.equal(result.instagramSessionReady, true);
  assert.equal(result.browser_evidence_status, "ok");
  assert.equal(result.browser_evidence_method, "chrome_operational_profile");
  assert.equal(result.instagram_session_status, "logged_in");
  assert.equal(result.chromeProfileName, "Paperclip Scout");
  assert.equal(result.chromeProfileDir, "Profile 1");
  assert.match(readFileSync(chromeArgsPath, "utf8"), /--profile-directory=Profile 1/);
  assert.match(readFileSync(chromeArgsPath, "utf8"), /https:\/\/www\.instagram\.com\//);
  assert.match(readFileSync(chromeArgsPath, "utf8"), /paperclip-scout-smoke/);
  assert.match(readFileSync(osascriptPath, "utf8"), /repeat with w in windows/i);
  assert.match(readFileSync(osascriptPath, "utf8"), /https:\/\/www\.instagram\.com\//i);
  assert.match(readFileSync(osascriptPath, "utf8"), /instagram\.com\/#paperclip-scout-smoke/i);
});

test("Smoke test do Scout espera home do Instagram carregar antes de classificar sessao", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "paperclip-scout-home-wait-"));
  const fakeBinDir = join(tempRoot, "bin");
  const fakeChromeApp = join(tempRoot, "Google Chrome.app");
  const fakeChromeBinDir = join(fakeChromeApp, "Contents/MacOS");
  const fakeChromeBin = join(fakeChromeBinDir, "Google Chrome");
  const chromeUserDataDir = join(tempRoot, "Chrome");
  const osascriptCountPath = join(tempRoot, "osascript-count.txt");

  mkdirSync(fakeBinDir, { recursive: true });
  mkdirSync(fakeChromeBinDir, { recursive: true });
  mkdirSync(chromeUserDataDir, { recursive: true });

  writeFileSync(
    join(chromeUserDataDir, "Local State"),
    JSON.stringify({
      profile: {
        info_cache: {
          "Profile 1": { name: "Paperclip Scout", user_name: "paperclip@example.com" },
        },
      },
    }),
  );
  writeExecutable(
    fakeChromeBin,
    `#!/bin/sh
exit 0
`,
  );
  writeExecutable(
    join(fakeBinDir, "osascript"),
    `#!/bin/sh
count="$(cat "${osascriptCountPath}" 2>/dev/null || echo 0)"
count=$((count + 1))
printf '%s\\n' "$count" > "${osascriptCountPath}"
if [ "$count" -eq 1 ]; then
  cat <<'JSON'
{"href":"about:blank","title":"","bodyText":"","readyState":"complete"}
JSON
  exit 0
fi
cat <<'JSON'
{"href":"https://www.instagram.com/#paperclip-scout-smoke-test","title":"Instagram","bodyText":"Home Search Messages lztesteprivado Suggested for you","readyState":"complete"}
JSON
`,
  );

  let stdout;
  try {
    stdout = await execFileText(process.execPath, ["scripts/paperclip-chrome-scout-smoke.mjs", "--instagram"], {
      cwd: rootDir,
      env: {
        ...process.env,
        PATH: `${fakeBinDir}:${process.env.PATH}`,
        PAPERCLIP_CHROME_APP: fakeChromeApp,
        PAPERCLIP_CHROME_BIN: fakeChromeBin,
        PAPERCLIP_CHROME_USER_DATA_DIR: chromeUserDataDir,
        PAPERCLIP_CHROME_PROFILE_NAME: "Paperclip Scout",
        PAPERCLIP_INSTAGRAM_ACCOUNT: "lztesteprivado",
      },
    });
  } catch (error) {
    stdout = error.stdout;
  }

  const result = JSON.parse(stdout);

  assert.equal(result.ready, true);
  assert.equal(result.status, "ready");
  assert.equal(result.href, "https://www.instagram.com/#paperclip-scout-smoke-test");
  assert.equal(result.instagram_session_status, "logged_in");
  assert.equal(result.instagramAccountMatched, true);
  assert.equal(readFileSync(osascriptCountPath, "utf8").trim(), "2");
});

test("Smoke do Scout reutiliza perfil operacional e mira a URL Instagram solicitada", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "paperclip-scout-profile-reuse-"));
  const fakeBinDir = join(tempRoot, "bin");
  const fakeChromeApp = join(tempRoot, "Google Chrome.app");
  const fakeChromeBinDir = join(fakeChromeApp, "Contents/MacOS");
  const fakeChromeBin = join(fakeChromeBinDir, "Google Chrome");
  const chromeUserDataDir = join(tempRoot, "Chrome");
  const chromeArgsPath = join(tempRoot, "chrome-args.txt");
  const osascriptPath = join(tempRoot, "osascript.txt");

  mkdirSync(fakeBinDir, { recursive: true });
  mkdirSync(fakeChromeBinDir, { recursive: true });
  mkdirSync(chromeUserDataDir, { recursive: true });

  writeFileSync(
    join(chromeUserDataDir, "Local State"),
    JSON.stringify({
      profile: {
        info_cache: {
          Default: { name: "Luiz Filipe", user_name: "lfilipe051@gmail.com" },
          "Profile 1": { name: "Paperclip Scout", user_name: "paperclip@example.com" },
        },
      },
    }),
  );
  writeExecutable(
    fakeChromeBin,
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "Google Chrome 149.0.7827.115"
  exit 0
fi
printf '%s\\n' "$@" > "${chromeArgsPath}"
if printf '%s\\n' "$@" | grep -q -- '--new-window'; then
  echo "Scout smoke must reuse the existing operational profile instead of forcing --new-window" >&2
  exit 8
fi
exit 0
`,
  );
  writeExecutable(
    join(fakeBinDir, "open"),
    `#!/bin/sh
echo "Scout smoke must open profile URL through Chrome binary, not open" >&2
exit 9
`,
  );
  writeExecutable(
    join(fakeBinDir, "osascript"),
    `#!/bin/sh
printf '%s\\n' "$2" > "${osascriptPath}"
if printf '%s' "$2" | grep -q 'front window'; then
  echo "front window must not be used for Scout smoke" >&2
  exit 1
fi
if ! printf '%s' "$2" | grep -q 'instagram.com/anaflaviamiranda'; then
  echo "Scout smoke must target the requested Instagram profile URL, not any Instagram tab" >&2
  exit 1
fi
cat <<'JSON'
{"href":"https://www.instagram.com/anaflaviamiranda/","title":"Ana Flávia Miranda Pilates e Fisioterapia","bodyText":"anaflaviamiranda Ana Flávia Miranda Pilates e Fisioterapia This profile is private Follow","readyState":"complete"}
JSON
`,
  );

  const stdout = await execFileText(
    process.execPath,
    ["scripts/paperclip-chrome-scout-smoke.mjs", "--instagram", "--url", "https://www.instagram.com/anaflaviamiranda/"],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        PATH: `${fakeBinDir}:${process.env.PATH}`,
        PAPERCLIP_CHROME_APP: fakeChromeApp,
        PAPERCLIP_CHROME_BIN: fakeChromeBin,
        PAPERCLIP_CHROME_USER_DATA_DIR: chromeUserDataDir,
        PAPERCLIP_CHROME_PROFILE_NAME: "Paperclip Scout",
        PAPERCLIP_INSTAGRAM_ACCOUNT: "lztesteprivado",
      },
    },
  );

  const result = JSON.parse(stdout);
  const chromeArgs = readFileSync(chromeArgsPath, "utf8");
  const osascript = readFileSync(osascriptPath, "utf8");

  assert.equal(result.ready, true);
  assert.equal(result.chromeProfileName, "Paperclip Scout");
  assert.equal(result.href, "https://www.instagram.com/anaflaviamiranda/");
  assert.equal(result.instagramAccountMatched, false);
  assert.match(chromeArgs, /--profile-directory=Profile 1/);
  assert.match(chromeArgs, /https:\/\/www\.instagram\.com\/anaflaviamiranda\//);
  assert.doesNotMatch(chromeArgs, /--new-window/);
  assert.match(osascript, /instagram\.com\/anaflaviamiranda/i);
});

test("Scout trata smoke test do perfil operacional como gate obrigatorio de Instagram", () => {
  const scoutSmokePath = join(rootDir, "scripts/paperclip-chrome-scout-smoke.mjs");
  const scoutSmokeScript = read("scripts/paperclip-chrome-scout-smoke.mjs");
  const scout = prospeccao();
  const localProspector = read("docs/freelancer/prompt-local-client-prospector-vitoria.md");
  const validator = validadorDados();
  const steve = ceoProspeccao();
  const contract = read("docs/freelancer/data-contract.md");
  const browser = browserAutomation();
  const readme = paperclipReadme();
  const agentScout = agentConfig("agent-prospeccao.json");
  const agentValidador = agentConfig("agent-validador-dados-leads.json");

  assert.equal(existsSync(scoutSmokePath), true, "smoke test do Scout deve existir");
  assert.match(scoutSmokeScript, /PAPERCLIP_CHROME_PROFILE_NAME/i);
  assert.match(scoutSmokeScript, /Paperclip Scout/i);
  assert.match(scoutSmokeScript, /PAPERCLIP_INSTAGRAM_ACCOUNT/i);
  assert.match(scoutSmokeScript, /blocked_apple_events_javascript_disabled/i);
  assert.match(scoutSmokeScript, /chrome_operational_profile|profile-directory/i);

  for (const doc of [contract, browser, readme, scout, localProspector, validator, steve]) {
    assert.match(doc, /paperclip-chrome-scout-smoke\.mjs/i);
    assert.match(doc, /Paperclip Scout/i);
    assert.match(doc, /browser_evidence_status/i);
    assert.match(doc, /browser_evidence_method/i);
    assert.match(doc, /instagram_session_status/i);
    assert.match(doc, /chrome_operational_profile/i);
  }

  assert.match(scout, /nao inicia|não inicia|bloqueia.*rodada|rodada.*bloqueia/i);
  assert.match(validator, /nao aceitar.*bio.*ok|não aceitar.*bio.*ok|bloquear.*bio.*ok/i);
  assert.match(agentScout.capabilities, /paperclip-chrome-scout-smoke|Paperclip Scout|chrome_operational_profile/i);
  assert.match(agentValidador.capabilities, /browser_evidence_status|chrome_operational_profile/i);
});

test("Docs do Scout tratam perfil operacional como janela reutilizavel", () => {
  const docs = [
    ["docs/freelancer/paperclip/browser-automation.md", browserAutomation()],
    ["docs/freelancer/paperclip/README.md", paperclipReadme()],
    ["docs/freelancer/prompt-thread-prospeccao-leads.md", prospeccao()],
    ["docs/freelancer/prompt-local-client-prospector-vitoria.md", read("docs/freelancer/prompt-local-client-prospector-vitoria.md")],
  ];

  for (const [path, doc] of docs) {
    assert.doesNotMatch(doc, /smoke abre nova janela dedicada/i, path);
    assert.doesNotMatch(doc, /nao deve reutilizar abas do Chrome pessoal\/perfil pessoal diario/i, path);
  }

  assert.match(browserAutomation(), /perfil operacional `Paperclip Scout` pode reutilizar a janela existente/i);
  assert.match(prospeccao(), /perfil operacional `Paperclip Scout` pode reutilizar a janela existente/i);
  assert.match(read("docs/freelancer/prompt-local-client-prospector-vitoria.md"), /perfil operacional `Paperclip Scout` pode reutilizar a janela existente/i);
});

test("QA e criadores nao usam Playwright WebKit para validar demos", () => {
  const docs = [qaDemos(), criacao72h(), checklistEntrega()];

  for (const doc of docs) {
    assert.match(doc, /docs\/freelancer\/paperclip\/browser-automation\.md/i);
    assert.match(doc, /Playwright WebKit/i);
    assert.match(doc, /org\.webkit\.Playwright/i);
    assert.match(doc, /Playwright Firefox/i);
    assert.match(doc, /org\.mozilla\.nightly/i);
    assert.match(doc, /nao usar.*in-app browser|não usar.*in-app browser/i);
    assert.match(doc, /curl|parser HTML|validacao estatica|validação estática/i);
  }
});
