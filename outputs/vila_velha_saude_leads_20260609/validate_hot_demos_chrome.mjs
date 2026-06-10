import childProcess from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT = "/Users/luiz_fbm/Documents/programacao/freela";
const OUT_DIR = path.join(ROOT, "outputs", "vila_velha_saude_leads_20260609");
const README = path.join(ROOT, "demos", "README.md");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const START = "<!-- vila-velha-hot-demos:start -->";
const END = "<!-- vila-velha-hot-demos:end -->";

const viewports = [
  { label: "desktop", width: 1440, height: 1100, mobile: false },
  { label: "mobile", width: 390, height: 844, mobile: true },
];

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".md", "text/markdown; charset=utf-8"],
]);

function getHotSlugs() {
  return fs.readFile(README, "utf8").then((text) => {
    const block = text.split(START)[1]?.split(END)[0];
    if (!block) {
      throw new Error("Bloco de demos Hot não encontrado no README.");
    }
    return [...new Set([...block.matchAll(/\/demos\/([^/\s]+)\//g)].map((match) => match[1]))].sort();
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function startStaticServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      let requestedPath = decodeURIComponent(url.pathname);
      if (requestedPath.endsWith("/")) {
        requestedPath += "index.html";
      }

      const filePath = path.normalize(path.join(ROOT, requestedPath));
      if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      const data = await fs.readFile(filePath);
      res.writeHead(200, {
        "content-type": mimeTypes.get(path.extname(filePath)) || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(data);
    } catch (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end(String(error.message || error));
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

async function waitForChrome(port) {
  const deadline = Date.now() + 15_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await fetchJson(`http://127.0.0.1:${port}/json/version`);
    } catch (error) {
      lastError = error;
      await sleep(250);
    }
  }
  throw new Error(`Chrome DevTools não iniciou: ${lastError?.message || "timeout"}`);
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.consoleErrors = [];
    this.ws = new WebSocket(wsUrl);
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
      this.ws.addEventListener("message", (event) => this.handleMessage(event));
    });
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result || {});
      }
      return;
    }

    if (message.method === "Runtime.exceptionThrown") {
      this.consoleErrors.push(`exception: ${message.params?.exceptionDetails?.text || "erro sem texto"}`);
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      const text = (message.params.args || []).map((arg) => arg.value || arg.description || "").join(" ");
      this.consoleErrors.push(`console.error: ${text}`);
    }
    if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
      this.consoleErrors.push(`log.error: ${message.params.entry.text}`);
    }
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Timeout em ${method}`));
        }
      }, 30_000);
    });
  }

  close() {
    this.ws.close();
  }
}

async function createTarget(remotePort, url) {
  const response = await fetch(`http://127.0.0.1:${remotePort}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
  });
  if (!response.ok) {
    throw new Error(`Falha ao criar target: ${response.status}`);
  }
  return response.json();
}

async function closeTarget(remotePort, targetId) {
  await fetch(`http://127.0.0.1:${remotePort}/json/close/${targetId}`).catch(() => {});
}

async function waitForReady(client) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await client.send("Runtime.evaluate", {
      expression: "document.readyState",
      returnByValue: true,
    });
    if (result.result?.value === "complete") {
      return;
    }
    await sleep(100);
  }
  throw new Error("document.readyState não chegou em complete");
}

async function evaluatePage(client) {
  const expression = `(() => {
    const root = document.documentElement;
    const body = document.body;
    const all = Array.from(body.querySelectorAll("*"));
    const rights = all.map((element) => element.getBoundingClientRect().right).filter(Number.isFinite);
    const lefts = all.map((element) => element.getBoundingClientRect().left).filter(Number.isFinite);
    const images = Array.from(document.images).map((image) => ({
      src: image.getAttribute("src") || image.currentSrc,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    }));
    const scrollWidth = Math.max(root.scrollWidth, body.scrollWidth);
    const scrollHeight = Math.max(root.scrollHeight, body.scrollHeight);
    const maxRight = Math.max(window.innerWidth, ...rights);
    const minLeft = Math.min(0, ...lefts);

    return {
      title: document.title,
      robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") || "",
      scrollWidth,
      scrollHeight,
      innerWidth: window.innerWidth,
      overflowX: scrollWidth > window.innerWidth + 1 || maxRight > window.innerWidth + 1 || minLeft < -1,
      brokenImages: images.filter((image) => !image.complete || image.naturalWidth < 1 || image.naturalHeight < 1),
      imageCount: images.length,
      bodyTextLength: body.innerText.trim().length,
    };
  })()`;

  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  return result.result.value;
}

async function validateViewport({ slug, viewport, baseUrl, remotePort }) {
  const url = `${baseUrl}/demos/${slug}/`;
  const target = await createTarget(remotePort, "about:blank");
  const client = new CDPClient(target.webSocketDebuggerUrl);
  await client.open();

  try {
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Log.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
    });
    await client.send("Page.navigate", { url });
    await waitForReady(client);
    await client.send("Runtime.evaluate", {
      expression: `Promise.all(Array.from(document.images).map((image) => image.complete ? true : new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      })))`,
      awaitPromise: true,
    });
    await sleep(250);

    const page = await evaluatePage(client);
    await client.send("Runtime.evaluate", {
      expression: `(() => {
        const style = document.createElement("style");
        style.setAttribute("data-screenshot-override", "true");
        style.textContent = ".reveal{opacity:1!important;transform:none!important;transition:none!important}";
        document.head.appendChild(style);
        document.querySelectorAll(".reveal").forEach((element) => element.classList.add("is-visible"));
      })()`,
    });
    await sleep(100);
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width: viewport.width,
        height: Math.ceil(page.scrollHeight),
        scale: 1,
      },
    });
    await fs.writeFile(
      path.join(ROOT, "demos", slug, `screenshot-${viewport.label}.png`),
      screenshot.data,
      "base64",
    );

    return {
      slug,
      viewport: viewport.label,
      url,
      screenshot: `demos/${slug}/screenshot-${viewport.label}.png`,
      ...page,
      consoleErrors: client.consoleErrors,
    };
  } finally {
    client.close();
    await closeTarget(remotePort, target.id);
  }
}

function resultFailures(result) {
  const failures = [];
  if (result.robots !== "noindex, nofollow") {
    failures.push("robots inválido");
  }
  if (result.overflowX) {
    failures.push(`overflow horizontal: scrollWidth=${result.scrollWidth}, innerWidth=${result.innerWidth}`);
  }
  if (result.brokenImages.length > 0) {
    failures.push(`imagens quebradas: ${result.brokenImages.map((image) => image.src).join(", ")}`);
  }
  if (result.consoleErrors.length > 0) {
    failures.push(`erros de console: ${result.consoleErrors.join(" | ")}`);
  }
  if (result.bodyTextLength < 200) {
    failures.push("texto da página parece vazio");
  }
  return failures;
}

async function main() {
  const slugs = await getHotSlugs();
  const server = await startStaticServer();
  const serverPort = server.address().port;
  const remotePort = await getFreePort();
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-hot-demos-chrome-"));
  const chrome = childProcess.spawn(CHROME, [
    `--remote-debugging-port=${remotePort}`,
    `--user-data-dir=${userDataDir}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-dev-shm-usage",
  ], {
    stdio: "ignore",
  });

  const results = [];
  const failures = [];

  try {
    await waitForChrome(remotePort);
    const baseUrl = `http://127.0.0.1:${serverPort}`;

    for (const slug of slugs) {
      for (const viewport of viewports) {
        const result = await validateViewport({ slug, viewport, baseUrl, remotePort });
        results.push(result);
        for (const failure of resultFailures(result)) {
          failures.push(`${slug} ${viewport.label}: ${failure}`);
        }
      }
    }

    await fs.writeFile(
      path.join(OUT_DIR, "hot-demos-chrome-validation.json"),
      `${JSON.stringify({ checkedAt: new Date().toISOString(), results, failures }, null, 2)}\n`,
      "utf8",
    );
  } finally {
    server.close();
    chrome.kill("SIGTERM");
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  }

  if (failures.length > 0) {
    console.error(failures.join("\n"));
    return 1;
  }

  console.log(`Chrome ok: ${results.length} verificações, ${slugs.length} demos, screenshots atualizados.`);
  return 0;
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
