#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const chromeApp = process.env.PAPERCLIP_CHROME_APP || "/Applications/Google Chrome.app";
const chromeBin = process.env.PAPERCLIP_CHROME_BIN || join(chromeApp, "Contents/MacOS/Google Chrome");
const chromeUserDataDir =
  process.env.PAPERCLIP_CHROME_USER_DATA_DIR || join(homedir(), "Library/Application Support/Google/Chrome");
const expectedProfileName = process.env.PAPERCLIP_CHROME_PROFILE_NAME || "Paperclip Scout";
const expectedProfileDir = process.env.PAPERCLIP_CHROME_PROFILE_DIR || "";
const expectedInstagramAccount = process.env.PAPERCLIP_INSTAGRAM_ACCOUNT || "";
const instagramMode = process.argv.includes("--instagram");
const urlArgIndex = process.argv.indexOf("--url");
const requestedUrl = urlArgIndex >= 0 ? process.argv[urlArgIndex + 1] : "";
const targetUrl =
  requestedUrl && !requestedUrl.startsWith("--")
    ? requestedUrl
    : instagramMode
      ? "https://www.instagram.com/"
      : "about:blank";
const navigationUrl = shouldUseInstagramHomeMarker(targetUrl)
  ? withInstagramHomeMarker(targetUrl)
  : targetUrl;

function emit(payload, exitCode = payload.ready ? 0 : 2) {
  console.log(JSON.stringify(payload, null, 2));
  process.exitCode = exitCode;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function shouldUseInstagramHomeMarker(value) {
  if (!instagramMode) return false;

  try {
    const url = new URL(value);
    const isInstagram = /(^|\.)instagram\.com$/i.test(url.hostname);
    const path = url.pathname.replace(/\/+$/g, "");
    return isInstagram && !path && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function withInstagramHomeMarker(value) {
  const url = new URL(value);
  url.hash = `paperclip-scout-smoke-${process.pid}-${Date.now()}`;
  return url.toString();
}

function loadChromeProfile() {
  const localStatePath = join(chromeUserDataDir, "Local State");
  if (!existsSync(localStatePath)) {
    return {
      profile: null,
      status: "blocked_missing_local_state",
      message: "Local State do Chrome nao encontrado para localizar o perfil operacional",
      localStatePath,
    };
  }

  let state;
  try {
    state = JSON.parse(readFileSync(localStatePath, "utf8"));
  } catch (error) {
    return {
      profile: null,
      status: "blocked_invalid_local_state",
      message: "Local State do Chrome nao e JSON valido",
      localStatePath,
      error: error.message,
    };
  }

  const profiles = Object.entries(state.profile?.info_cache || {}).map(([dir, info]) => ({
    dir,
    name: cleanText(info?.name),
  }));
  const profile =
    (expectedProfileDir && profiles.find((candidate) => candidate.dir === expectedProfileDir)) ||
    profiles.find((candidate) => candidate.name === expectedProfileName);

  if (!profile) {
    return {
      profile: null,
      status: "blocked_missing_profile",
      message: "Perfil operacional do Scout nao encontrado no Chrome",
      availableProfiles: profiles.map((candidate) => ({
        dir: candidate.dir,
        name: candidate.name,
      })),
    };
  }

  return { profile };
}

function openChrome(profileDir) {
  const result = spawnSync(chromeBin, [`--profile-directory=${profileDir}`, navigationUrl], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status === 0) {
    return {
      chromeOpenReady: true,
      openStatus: "ready",
    };
  }

  return {
    chromeOpenReady: false,
    openStatus: "blocked_chrome_open",
    openError: `${result.stdout || ""}${result.stderr || ""}`.trim(),
    openExitCode: result.status ?? 1,
  };
}

function appleScriptString(value) {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function wait(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function targetTabMatcher() {
  if (navigationUrl === "about:blank") {
    return {
      condition: `tabUrl is ${appleScriptString(navigationUrl)}`,
      description: navigationUrl,
    };
  }

  try {
    const url = new URL(navigationUrl);
    const hostWithoutWww = url.hostname.replace(/^www\./i, "");
    const hosts = unique([url.hostname, hostWithoutWww, `www.${hostWithoutWww}`]);
    const path = url.pathname.replace(/\/+$/g, "");
    const conditions = [];

    for (const host of hosts) {
      const base = `${url.protocol}//${host}${path}`;
      if (url.search || url.hash) {
        const exactBase = path ? base : `${url.protocol}//${host}/`;
        conditions.push(`tabUrl is ${appleScriptString(`${exactBase}${url.search}${url.hash}`)}`);
        continue;
      }

      if (path) {
        conditions.push(`tabUrl is ${appleScriptString(base)}`);
        conditions.push(`tabUrl is ${appleScriptString(`${base}/`)}`);
        conditions.push(`tabUrl starts with ${appleScriptString(`${base}?`)}`);
        conditions.push(`tabUrl starts with ${appleScriptString(`${base}/?`)}`);
        conditions.push(`tabUrl starts with ${appleScriptString(`${base}#`)}`);
        conditions.push(`tabUrl starts with ${appleScriptString(`${base}/#`)}`);
      } else {
        conditions.push(`tabUrl is ${appleScriptString(base)}`);
        conditions.push(`tabUrl is ${appleScriptString(`${base}/`)}`);
        conditions.push(`tabUrl starts with ${appleScriptString(`${base}/?`)}`);
        conditions.push(`tabUrl starts with ${appleScriptString(`${base}/#`)}`);
      }
    }

    return {
      condition: `(${conditions.join(" or ")})`,
      description: path ? `${hostWithoutWww}${path}` : `${url.protocol}//${url.hostname}/`,
    };
  } catch {
    return {
      condition: `tabUrl contains ${appleScriptString(navigationUrl)}`,
      description: navigationUrl,
    };
  }
}

function readTargetTabDomOnce() {
  const targetMatcher = targetTabMatcher();
  const js = `JSON.stringify({
    href: document.location.href,
    title: document.title,
    readyState: document.readyState,
    bodyText: document.body ? document.body.innerText.slice(0, 12000) : ""
  })`;
  const script = `tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      try
        set tabUrl to URL of t
        if ${targetMatcher.condition} then
          return execute t javascript ${appleScriptString(js)}
        end if
      end try
    end repeat
  end repeat
  error "Aba alvo nao encontrada: ${targetMatcher.description}"
end tell`;

  try {
    const output = execFileSync("osascript", ["-e", script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const dom = JSON.parse(output);
    return {
      domReadReady: true,
      href: cleanText(dom.href),
      title: cleanText(dom.title),
      readyState: cleanText(dom.readyState),
      bodyText: cleanText(dom.bodyText),
    };
  } catch (error) {
    const output = `${error.stdout || ""}${error.stderr || ""}${error.message || ""}`;
    const appleEventsDisabled = /Executing JavaScript through AppleScript is turned off|Allow JavaScript from Apple Events/i.test(
      output,
    );
    return {
      domReadReady: false,
      domStatus: appleEventsDisabled ? "blocked_apple_events_javascript_disabled" : "blocked_dom_read",
      message: appleEventsDisabled
        ? "Ative no Chrome: View > Developer > Allow JavaScript from Apple Events"
        : "Nao foi possivel ler DOM da aba alvo do Chrome",
      domError: output.trim(),
    };
  }
}

function instagramSessionSignals(dom) {
  const body = dom.bodyText || "";
  const href = dom.href || "";
  const loginBlocked = /log in|sign up|entrar|cadastre-se|cadastre|login/i.test(body);
  const challengeBlocked = /challenge|captcha|confirm.*identity|suspicious|try again later/i.test(body + " " + href);
  const accountMatched = expectedInstagramAccount ? body.toLowerCase().includes(expectedInstagramAccount.toLowerCase()) : true;

  return {
    body,
    href,
    loginBlocked,
    challengeBlocked,
    accountMatched,
  };
}

function instagramProfileHandle() {
  if (!instagramMode || shouldUseInstagramHomeMarker(targetUrl)) return "";

  try {
    const url = new URL(targetUrl);
    if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return "";
    const [handle = ""] = url.pathname.split("/").filter(Boolean);
    return handle.toLowerCase();
  } catch {
    return "";
  }
}

function hrefMatchesTarget(href) {
  if (!href || href === "about:blank") return false;

  try {
    const current = new URL(href);
    const target = new URL(navigationUrl);
    const currentHost = current.hostname.replace(/^www\./i, "").toLowerCase();
    const targetHost = target.hostname.replace(/^www\./i, "").toLowerCase();
    const currentPath = current.pathname.replace(/\/+$/g, "");
    const targetPath = target.pathname.replace(/\/+$/g, "");

    if (current.protocol !== target.protocol || currentHost !== targetHost || currentPath !== targetPath) {
      return false;
    }

    if (shouldUseInstagramHomeMarker(targetUrl)) {
      return !current.hash || current.hash.startsWith("#paperclip-scout-smoke");
    }

    return true;
  } catch {
    return false;
  }
}

function domLoadStatus(dom) {
  if (!dom.domReadReady) return "pending_dom_read";
  if (!hrefMatchesTarget(dom.href)) return "pending_target_navigation";
  if (dom.readyState === "loading") return "pending_document_load";
  if (!(dom.bodyText || "").trim()) return "pending_body_text";

  if (instagramMode) {
    const signals = instagramSessionSignals(dom);
    if (signals.loginBlocked || signals.challengeBlocked) return "ready_to_classify";

    if (shouldUseInstagramHomeMarker(targetUrl) && expectedInstagramAccount && !signals.accountMatched) {
      return "pending_instagram_account_marker";
    }

    const handle = instagramProfileHandle();
    if (handle && !signals.body.toLowerCase().includes(handle)) {
      return "pending_instagram_profile_marker";
    }
  }

  return "ready";
}

function readTargetTabDom() {
  let lastResult = null;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    lastResult = readTargetTabDomOnce();
    const loadStatus = domLoadStatus(lastResult);
    if (loadStatus === "ready" || loadStatus === "ready_to_classify") {
      return {
        ...lastResult,
        domLoadReady: true,
        domLoadStatus: loadStatus,
      };
    }
    if (attempt < 19) wait(500);
  }

  return {
    ...lastResult,
    domLoadReady: false,
    domLoadStatus: domLoadStatus(lastResult),
    domStatus: "blocked_instagram_load",
    message: "Instagram ainda nao carregou a aba alvo o suficiente para classificar a sessao",
  };
}

function instagramSessionStatus(dom) {
  if (!instagramMode) {
    return {
      instagramSessionReady: null,
      instagramStatus: "not_checked",
      browserEvidenceStatus: "not_checked",
      instagramSessionStatus: "not_checked",
    };
  }

  const { loginBlocked, challengeBlocked, accountMatched } = instagramSessionSignals(dom);
  const requireAccountMatch = shouldUseInstagramHomeMarker(targetUrl);

  if (challengeBlocked) {
    return {
      instagramSessionReady: false,
      instagramStatus: "blocked_instagram_challenge",
      browserEvidenceStatus: "challenge",
      instagramSessionStatus: "challenge",
      instagramAccountMatched: false,
    };
  }

  if (loginBlocked || (requireAccountMatch && !accountMatched)) {
    return {
      instagramSessionReady: false,
      instagramStatus: "blocked_instagram_session",
      browserEvidenceStatus: loginBlocked ? "login_required" : "session_blocked",
      instagramSessionStatus: "logged_out",
      instagramAccountMatched: false,
    };
  }

  return {
    instagramSessionReady: true,
    instagramStatus: "ready",
    browserEvidenceStatus: "ok",
    instagramSessionStatus: "logged_in",
    instagramAccountMatched: expectedInstagramAccount ? accountMatched : null,
  };
}

function main() {
  const profileResult = loadChromeProfile();
  const base = {
    chromeApp,
    chromeAppExists: existsSync(chromeApp),
    chromeBin,
    chromeBinExists: existsSync(chromeBin),
    chromeUserDataDir,
    expectedChromeProfileName: expectedProfileName,
    targetUrl,
    navigationUrl,
    chromeOpenReady: false,
    domReadReady: false,
    instagramSessionReady: instagramMode ? false : null,
    browser_evidence_status: "not_checked",
    browser_evidence_method: "chrome_operational_profile",
    instagram_session_status: instagramMode ? "not_checked" : null,
  };

  if (!profileResult.profile) {
    emit({
      ...base,
      ready: false,
      status: profileResult.status,
      message: profileResult.message,
      browser_evidence_status: "technical_error",
      localStatePath: profileResult.localStatePath,
      availableProfiles: profileResult.availableProfiles || [],
    });
    return;
  }

  const profile = profileResult.profile;
  const openResult = openChrome(profile.dir);
  if (!openResult.chromeOpenReady) {
    emit({
      ...base,
      chromeProfileName: profile.name,
      chromeProfileDir: profile.dir,
      ...openResult,
      ready: false,
      status: openResult.openStatus,
      message: "Chrome operacional do Scout nao abriu",
      browser_evidence_status: "technical_error",
    });
    return;
  }

  const dom = readTargetTabDom();
  if (!dom.domReadReady) {
    emit({
      ...base,
      chromeProfileName: profile.name,
      chromeProfileDir: profile.dir,
      chromeOpenReady: true,
      domReadReady: false,
      ready: false,
      status: dom.domStatus,
      message: dom.message,
      browser_evidence_status:
        dom.domStatus === "blocked_apple_events_javascript_disabled" ? "dom_blocked" : "technical_error",
    });
    return;
  }

  if (dom.domLoadReady === false) {
    emit({
      ...base,
      chromeProfileName: profile.name,
      chromeProfileDir: profile.dir,
      chromeOpenReady: true,
      domReadReady: true,
      domLoadReady: false,
      domLoadStatus: dom.domLoadStatus,
      ready: false,
      status: dom.domStatus,
      message: dom.message,
      browser_evidence_status: "page_loading",
      instagram_session_status: instagramMode ? "not_checked" : null,
      href: dom.href,
      title: dom.title,
      readyState: dom.readyState,
    });
    return;
  }

  const instagram = instagramSessionStatus(dom);
  const ready = dom.domReadReady && openResult.chromeOpenReady && instagram.instagramSessionReady !== false;
  emit({
    ...base,
    chromeProfileName: profile.name,
    chromeProfileDir: profile.dir,
    chromeOpenReady: true,
    domReadReady: true,
    instagramSessionReady: instagram.instagramSessionReady,
    browser_evidence_status: instagram.browserEvidenceStatus,
    browser_evidence_method: "chrome_operational_profile",
    instagram_session_status: instagram.instagramSessionStatus,
    instagramStatus: instagram.instagramStatus,
    instagramAccountMatched: instagram.instagramAccountMatched,
    ready,
    status: ready ? "ready" : instagram.instagramStatus,
    href: dom.href,
    title: dom.title,
    readyState: dom.readyState,
    message: ready ? "Chrome operacional do Scout pronto" : "Sessao do Instagram operacional nao esta pronta",
  });
}

main();
