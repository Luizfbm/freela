#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const chromeApp = process.env.PAPERCLIP_CHROME_APP || "/Applications/Google Chrome.app";
const chromeBin = process.env.PAPERCLIP_CHROME_BIN || join(chromeApp, "Contents/MacOS/Google Chrome");
const diagnosticDir = process.env.PAPERCLIP_BROWSER_DIAGNOSTIC_DIR || join(homedir(), "Library/Logs/DiagnosticReports");
const scratchDir = process.env.PAPERCLIP_BROWSER_SCRATCH_DIR || join(process.cwd(), ".scratch/browser");
const lockDir = join(scratchDir, "chrome-open.lock");
const recentCrashWindowMs = 15 * 60 * 1000;
const staleLockWindowMs = 2 * 60 * 1000;
const statusOnly = process.argv.includes("--status");
const preflight = process.argv.includes("--preflight") || process.argv.includes("--verify");
const force = process.argv.includes("--force");
const urlArgIndex = process.argv.indexOf("--url");
const requestedUrl = urlArgIndex >= 0 ? process.argv[urlArgIndex + 1] : "";
const targetUrl = requestedUrl && !requestedUrl.startsWith("--") ? requestedUrl : "about:blank";
const preflightSmokeUrl = "about:blank";

function runText(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function runCombinedText(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ""}${result.stderr || ""}`.trim(),
  };
}

function installedChromeVersion() {
  const output = runText(chromeBin, ["--version"]);
  return output.replace(/^Google Chrome\s+/i, "").trim();
}

function visibleChromeVersion() {
  return runText("osascript", ["-e", 'tell application "Google Chrome" to version']);
}

function processLines() {
  return runText("ps", ["-axo", "command"]).split("\n").filter(Boolean);
}

function staleHelperVersions(installedVersion) {
  if (!installedVersion) {
    return [];
  }

  const versions = new Set();
  for (const line of processLines()) {
    const match = line.match(/Google Chrome Framework\.framework\/Versions\/([^/]+)\/Helpers\//);
    if (match?.[1] && match[1] !== installedVersion) {
      versions.add(match[1]);
    }
  }

  return [...versions].sort();
}

function recentCrashReports(appName) {
  if (!existsSync(diagnosticDir)) {
    return [];
  }

  const escapedName = appName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedName}-.*\\.ips$`);
  const cutoff = Date.now() - recentCrashWindowMs;
  return readdirSync(diagnosticDir)
    .filter((name) => pattern.test(name))
    .map((name) => join(diagnosticDir, name))
    .filter((file) => statSync(file).mtimeMs >= cutoff)
    .sort();
}

function recentChromeCrashes() {
  return recentCrashReports("Google Chrome");
}

function recentPlaywrightCrashes() {
  return recentCrashReports("Playwright");
}

function recentFirefoxCrashes() {
  return recentCrashReports("firefox");
}

function spotlightStatus() {
  return runCombinedText("mdutil", ["-s", "/"]);
}

function spotlightServerDisabled(status) {
  return /Spotlight server is disabled/i.test(status.output);
}

function chromeMetadataStatus() {
  const status = runCombinedText("mdls", ["-name", "kMDItemCFBundleIdentifier", chromeApp]);
  return {
    ...status,
    visible: /com\.google\.Chrome/i.test(status.output),
  };
}

function fail(message, details = {}) {
  console.error(`PAPERCLIP_CHROME_OPEN_BLOCKED: ${message}`);
  for (const [key, value] of Object.entries(details)) {
    if (Array.isArray(value)) {
      console.error(`${key}: ${value.join(", ") || "none"}`);
    } else {
      console.error(`${key}: ${value || "none"}`);
    }
  }
  process.exitCode = 2;
}

function openChromeWindow() {
  const openResult = spawnSync("open", [chromeApp, "--args", "--new-window", targetUrl], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (openResult.stdout) {
    process.stdout.write(openResult.stdout);
  }

  if (openResult.status === 0) {
    return 0;
  }

  const launchServicesError = `${openResult.stderr || ""}\n${openResult.stdout || ""}`;
  if (/kLSNoExecutableErr|executable is missing|Unable to find application/i.test(launchServicesError)) {
    const currentSpotlightStatus = spotlightStatus();
    const currentChromeMetadataStatus = chromeMetadataStatus();
    const metadataBlocked = spotlightServerDisabled(currentSpotlightStatus) || !currentChromeMetadataStatus.visible;

    fail(
      metadataBlocked
        ? "LaunchServices/Spotlight nao consegue resolver apps; reative o Spotlight antes de usar Chrome assistido"
        : "LaunchServices nao conseguiu abrir o bundle do Chrome",
      {
        chromeApp,
        chromeBin,
        spotlightStatus: currentSpotlightStatus.output,
        chromeMetadataStatus: currentChromeMetadataStatus.output,
        launchServicesError: launchServicesError.trim(),
      },
    );
    return 2;
  }

  if (openResult.stderr) {
    process.stderr.write(openResult.stderr);
  }
  return openResult.status ?? 1;
}

function acquireMachineLock({ emitFailure = true } = {}) {
  try {
    mkdirSync(lockDir);
    return { acquired: true };
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw error;
    }

    let lockAgeMs = staleLockWindowMs + 1;
    try {
      lockAgeMs = Date.now() - statSync(lockDir).mtimeMs;
    } catch {
      // If the lock cannot be statted, treat it as stale and recreate it.
    }

    if (lockAgeMs > staleLockWindowMs) {
      rmSync(lockDir, { recursive: true, force: true });
      mkdirSync(lockDir);
      return { acquired: true, reclaimedStaleLock: true };
    }

    const details = {
      lockDir,
      lockAgeMs: Math.round(lockAgeMs),
    };
    if (emitFailure) {
      fail("lock ativo: outra tentativa de abrir Chrome ja esta em andamento", details);
    }
    return {
      acquired: false,
      status: "blocked_locked",
      message: "lock ativo: outra tentativa de abrir Chrome ja esta em andamento",
      ...details,
    };
  }
}

function acquireLock() {
  return acquireMachineLock({ emitFailure: true }).acquired;
}

function statusPayload() {
  const installedVersion = installedChromeVersion();
  const visibleVersion = visibleChromeVersion();
  const staleVersions = staleHelperVersions(installedVersion);
  const recentCrashes = recentChromeCrashes();
  const recentPlaywrightCrashReports = recentPlaywrightCrashes();
  const recentFirefoxCrashReports = recentFirefoxCrashes();
  const chromeAppExists = existsSync(chromeApp);
  const chromeBinExists = existsSync(chromeBin);
  const currentSpotlightStatus = spotlightStatus();
  const currentChromeMetadataStatus = chromeMetadataStatus();

  return {
    chromeApp,
    chromeAppExists,
    chromeBin,
    chromeBinExists,
    spotlightStatus: currentSpotlightStatus.output,
    spotlightServerDisabled: spotlightServerDisabled(currentSpotlightStatus),
    chromeMetadataVisible: currentChromeMetadataStatus.visible,
    chromeMetadataStatus: currentChromeMetadataStatus.output,
    installedVersion,
    visibleVersion,
    staleHelperVersions: staleVersions,
    recentCrashCount: recentCrashes.length,
    recentCrashes,
    recentPlaywrightCrashCount: recentPlaywrightCrashReports.length,
    recentPlaywrightCrashes: recentPlaywrightCrashReports,
    recentFirefoxCrashCount: recentFirefoxCrashReports.length,
    recentFirefoxCrashes: recentFirefoxCrashReports,
  };
}

function preflightBlockFromStatus(payload) {
  if (!payload.chromeAppExists || !payload.chromeBinExists) {
    return {
      status: "blocked_missing_chrome",
      message: "bundle ou binario do Chrome nao encontrado no caminho esperado",
    };
  }
  if (payload.recentPlaywrightCrashCount > 0) {
    return {
      status: "blocked_recent_playwright_crash",
      message: "crash recente do Playwright WebKit detectado; nao abrir navegador assistido em loop",
    };
  }
  if (payload.recentFirefoxCrashCount > 0) {
    return {
      status: "blocked_recent_firefox_crash",
      message: "crash recente do Playwright Firefox/Nightly detectado; nao abrir navegador assistido em loop",
    };
  }
  if (payload.recentCrashCount > 0) {
    return {
      status: "blocked_recent_chrome_crash",
      message: "crash recente do Chrome detectado; nao abrir novamente em loop",
    };
  }
  if (payload.staleHelperVersions.length > 0) {
    return {
      status: "blocked_stale_version",
      message: "versao desalinhada do Chrome detectada; feche e reabra o Chrome uma vez antes de usar navegador assistido",
    };
  }

  return null;
}

function metadataWarnings(payload) {
  return [
    ...(payload.spotlightServerDisabled ? ["spotlight_unavailable"] : []),
    ...(!payload.chromeMetadataVisible ? ["chrome_metadata_unavailable"] : []),
  ];
}

function smokeTestChromeWindow() {
  const openResult = spawnSync("open", [chromeApp, "--args", "--new-window", preflightSmokeUrl], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${openResult.stdout || ""}${openResult.stderr || ""}`.trim();

  if (openResult.status === 0) {
    return {
      opened: true,
      status: "ready",
      exitCode: 0,
      targetUrl: preflightSmokeUrl,
    };
  }

  if (/kLSNoExecutableErr|executable is missing|Unable to find application/i.test(output)) {
    const currentSpotlightStatus = spotlightStatus();
    const currentChromeMetadataStatus = chromeMetadataStatus();
    let status = "blocked_launchservices";
    if (spotlightServerDisabled(currentSpotlightStatus)) {
      status = "blocked_spotlight";
    } else if (!currentChromeMetadataStatus.visible) {
      status = "blocked_metadata";
    }

    return {
      opened: false,
      status,
      exitCode: openResult.status ?? 2,
      targetUrl: preflightSmokeUrl,
      message: "LaunchServices nao conseguiu abrir o bundle do Chrome",
      launchServicesError: output,
      spotlightStatus: currentSpotlightStatus.output,
      chromeMetadataStatus: currentChromeMetadataStatus.output,
    };
  }

  return {
    opened: false,
    status: "blocked_open_failed",
    exitCode: openResult.status ?? 1,
    targetUrl: preflightSmokeUrl,
    message: "open nao conseguiu abrir Chrome assistido",
    output,
  };
}

function runPreflight(payload) {
  const warnings = metadataWarnings(payload);
  const statusBlock = !force ? preflightBlockFromStatus(payload) : null;
  if (statusBlock) {
    console.log(
      JSON.stringify(
        {
          ...payload,
          ready: false,
          ...statusBlock,
          warnings,
          smokeTest: null,
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
    return;
  }

  const lock = acquireMachineLock({ emitFailure: false });
  if (!lock.acquired) {
    console.log(
      JSON.stringify(
        {
          ...payload,
          ready: false,
          status: lock.status,
          message: lock.message,
          lockDir: lock.lockDir,
          lockAgeMs: lock.lockAgeMs,
          warnings,
          smokeTest: null,
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
    return;
  }

  try {
    const smokeTest = smokeTestChromeWindow();
    const ready = smokeTest.opened;
    console.log(
      JSON.stringify(
        {
          ...payload,
          ready,
          status: ready ? "ready" : smokeTest.status,
          message: ready ? "Chrome assistido pronto" : smokeTest.message,
          warnings,
          smokeTest,
        },
        null,
        2,
      ),
    );
    process.exitCode = ready ? 0 : 2;
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}

mkdirSync(scratchDir, { recursive: true });

const payload = statusPayload();
const installedVersion = payload.installedVersion;
const visibleVersion = payload.visibleVersion;
const staleVersions = payload.staleHelperVersions;
const recentCrashes = payload.recentCrashes;
const recentPlaywrightCrashReports = payload.recentPlaywrightCrashes;
const recentFirefoxCrashReports = payload.recentFirefoxCrashes;
const chromeAppExists = payload.chromeAppExists;
const chromeBinExists = payload.chromeBinExists;

if (statusOnly) {
  console.log(JSON.stringify(payload, null, 2));
} else if (preflight) {
  runPreflight(payload);
} else {
  const locked = acquireLock();

  try {
    if (!locked) {
      // acquireLock already emitted a user-facing reason.
    } else if (!force && recentPlaywrightCrashReports.length > 0) {
      fail("crash recente do Playwright WebKit detectado; nao abrir navegador assistido em loop", {
        recentPlaywrightCrashes: recentPlaywrightCrashReports,
      });
    } else if (!force && recentFirefoxCrashReports.length > 0) {
      fail("crash recente do Playwright Firefox/Nightly detectado; nao abrir navegador assistido em loop", {
        recentFirefoxCrashes: recentFirefoxCrashReports,
      });
    } else if (!chromeAppExists || !chromeBinExists) {
      fail("bundle ou binario do Chrome nao encontrado no caminho esperado", {
        chromeApp,
        chromeAppExists,
        chromeBin,
        chromeBinExists,
      });
    } else if (!force && recentCrashes.length > 0) {
      fail("crash recente do Chrome detectado; nao abrir novamente em loop", {
        installedVersion,
        visibleVersion,
        recentCrashes,
      });
    } else if (!force && staleVersions.length > 0) {
      fail("versao desalinhada do Chrome detectada; feche e reabra o Chrome uma vez antes de usar navegador assistido", {
        installedVersion,
        visibleVersion,
        staleHelperVersions: staleVersions,
      });
    } else {
      process.exitCode = openChromeWindow();
    }
  } finally {
    if (locked) {
      rmSync(lockDir, { recursive: true, force: true });
    }
  }
}
