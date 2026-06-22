const state = {
  requestCount: 0,
  modalOpen: false,
  modalStale: false,
  currentLead: null,
  modalSnapshot: null,
  selectedAction: null,
  refreshTimer: null,
  leadWatchTimer: null,
  leadWatchController: null,
  leadWatchBusy: false,
  searchController: null,
  toastTimer: null,
  errorTimer: null,
};

const columns = [
  ["enviarAgora", "Enviar agora"],
  ["followupResposta", "Follow-up / resposta"],
  ["aguardandoWorker", "Aguardando worker"],
  ["bloqueados", "Bloqueados"],
  ["revisar", "Revisar"],
];

const actionLabels = {
  enviado: "Marcar enviado",
  followup_enviado: "Follow-up enviado",
  respondeu: "Registrar resposta",
  pediu_exemplo: "Pediu exemplo",
  pediu_preco: "Pediu preco",
  perdido: "Marcar perdido",
  descartar: "Descartar",
};

const strongActions = new Set(["respondeu", "pediu_exemplo", "pediu_preco", "perdido", "descartar"]);
const requiredMessageActions = new Set(["respondeu"]);
const requiredReasonActions = new Set(["perdido", "descartar"]);
const optionalContextActions = new Set(["pediu_preco", "pediu_exemplo"]);

const elements = {
  app: document.getElementById("app"),
  dbHealth: document.getElementById("db-health"),
  lastRefresh: document.getElementById("last-refresh"),
  refreshButton: document.getElementById("refresh-button"),
  scorebar: document.getElementById("scorebar"),
  searchInput: document.getElementById("lead-search"),
  searchResults: document.getElementById("search-results"),
  searchState: document.getElementById("search-state"),
  kanban: document.getElementById("kanban"),
  wahaSummary: document.getElementById("waha-summary"),
  commandInput: document.getElementById("command-input"),
  previewButton: document.getElementById("preview-command"),
  commandPreview: document.getElementById("command-preview"),
  modal: document.getElementById("lead-modal"),
  modalKind: document.getElementById("lead-modal-kind"),
  modalTitle: document.getElementById("lead-modal-title"),
  modalClose: document.getElementById("modal-close"),
  leadDetail: document.getElementById("lead-detail"),
  toast: document.getElementById("toast"),
  errorBox: document.getElementById("error-box"),
};

elements.refreshButton.addEventListener("click", () => refresh({ manual: true }));
elements.previewButton.addEventListener("click", () => previewCommand());
elements.commandInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") previewCommand();
});
elements.searchInput.addEventListener("input", debounce(searchLeads, 250));
elements.modalClose.addEventListener("click", closeModal);
elements.modal.addEventListener("click", (event) => {
  if (event.target === elements.modal) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.modalOpen) closeModal();
});

elements.kanban.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-lead]");
  if (!button) return;
  openLead(button.dataset.openLead);
});

elements.searchResults.addEventListener("click", (event) => {
  const item = event.target.closest("[data-open-lead]");
  if (!item) return;
  openLead(item.dataset.openLead);
});

elements.commandPreview.addEventListener("click", (event) => {
  const item = event.target.closest("[data-open-lead]");
  if (!item) return;
  openLead(item.dataset.openLead);
});

elements.leadDetail.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-select-action]");
  if (actionButton) {
    selectAction(actionButton.dataset.selectAction);
    return;
  }

  const submitButton = event.target.closest("[data-submit-action]");
  if (submitButton) {
    submitSelectedAction();
    return;
  }

  const retryPaperclipButton = event.target.closest("[data-retry-paperclip]");
  if (retryPaperclipButton) {
    retryPaperclipRefresh();
    return;
  }

  const reloadButton = event.target.closest("[data-reload-open-lead]");
  if (reloadButton) {
    reloadOpenLead();
  }
});

elements.leadDetail.addEventListener("input", (event) => {
  if (
    event.target.id === "action-message" ||
    event.target.id === "action-reason" ||
    event.target.id === "action-confirm"
  ) {
    updateActionSubmitState();
  }
});

await refresh({ manual: true });
state.refreshTimer = setInterval(() => {
  if (!isBusy() && !state.modalOpen) {
    refresh();
  }
}, 30000);

async function refresh({ manual = false, force = false } = {}) {
  if ((isBusy() && !force) || state.modalOpen) {
    if (manual) showToast("Atualizacao pausada.");
    return;
  }

  startRequest();
  try {
    const [summaryBody, leadsBody, wahaBody] = await Promise.all([
      fetchJson("/api/summary"),
      fetchJson("/api/leads"),
      fetchJson("/api/waha"),
    ]);

    renderSummary(summaryBody.summary);
    renderKanban(leadsBody.kanban);
    renderWaha(wahaBody.waha);
    setHealth("green", "SQLite OK");
    elements.lastRefresh.textContent = `Atualizado ${new Date().toLocaleTimeString("pt-BR")}`;
    hideError();
  } catch (error) {
    setHealth("red", "SQLite erro");
    showError(error.message);
  } finally {
    endRequest();
  }
}

function renderSummary(summary = {}) {
  const waha = summary.waha ?? {};
  const items = [
    ["Enviar hoje", summary.readyLeadCards, "green"],
    ["Follow-ups", summary.followupsToday, "blue"],
    ["Redator", summary.readyForWriter, "neutral"],
    ["Validacao", summary.pendingValidation, summary.pendingValidation ? "amber" : "neutral"],
    ["QA", summary.pendingQa, summary.pendingQa ? "amber" : "neutral"],
    ["Handoffs", summary.openHandoffs, summary.openHandoffs ? "amber" : "neutral"],
    ["WAHA ambiguas", waha.dispatchAmbiguous, waha.dispatchAmbiguous ? "red" : "neutral"],
  ];

  const nextStep = summary.nextStep
    ? `<article class="metric"><span class="badge blue">Proximo passo</span><span>${escapeHtml(summary.nextStep)}</span></article>`
    : "";

  elements.scorebar.innerHTML = `${items.map(renderMetric).join("")}${nextStep}`;
}

function renderMetric([label, value, color]) {
  return `
    <article class="metric">
      <span class="badge ${escapeAttr(color || "neutral")}">${escapeHtml(label)}</span>
      <strong>${escapeHtml(formatNumber(value))}</strong>
    </article>
  `;
}

function renderKanban(kanban = {}) {
  elements.kanban.innerHTML = columns
    .map(([key, label]) => {
      const cards = Array.isArray(kanban[key]) ? kanban[key] : [];
      return `
        <section class="column" aria-labelledby="column-${escapeAttr(key)}">
          <div class="column-header">
            <h2 id="column-${escapeAttr(key)}" class="column-title">${escapeHtml(label)}</h2>
            <span class="badge neutral">${cards.length}</span>
          </div>
          ${cards.length ? cards.map(renderCard).join("") : '<p class="empty-state">Nenhum item.</p>'}
        </section>
      `;
    })
    .join("");
}

function renderCard(card = {}) {
  const kind = card.cardKind || "lead";
  const leadId = numberOrNull(card.leadId);
  const statusTone = toneForStatus(card.status || card.commercialStage || kind);
  const location = compactJoin([card.category, card.area, card.city], " - ");
  const contact = compactJoin([card.contact, card.instagram], " | ");
  const updated = formatDateTime(card.updatedAt || card.createdAt);
  const title = card.canonicalName || card.title || "Item sem nome";
  const blocker = card.validationBlocker || card.dispatchError || card.guardianReason || "";
  const message = card.message || card.requiredAction || "";

  return `
    <article class="lead-card" tabindex="0">
      <div class="card-body">
        <h3>${escapeHtml(title)}</h3>
        <div class="meta-line">
          <span class="badge ${escapeAttr(statusTone)}">${escapeHtml(labelForKind(kind))}</span>
          <span class="badge neutral">${escapeHtml(card.status || "-")}</span>
          ${card.commercialStage ? `<span class="badge blue">${escapeHtml(card.commercialStage)}</span>` : ""}
        </div>
        ${location ? `<div class="muted card-note">${escapeHtml(location)}</div>` : ""}
        ${contact ? `<div class="muted card-note">${escapeHtml(contact)}</div>` : ""}
        ${card.targetAgentName ? `<div class="muted card-note">${escapeHtml(card.targetAgentName)}</div>` : ""}
        ${card.outboxId ? `<div class="badge amber">Outbox ${escapeHtml(card.outboxId)}</div>` : ""}
        ${blocker ? `<div class="badge amber">${escapeHtml(blocker)}</div>` : ""}
        ${message ? `<div class="message-preview">${escapeHtml(message)}</div>` : ""}
        ${updated ? `<div class="muted">Atualizado ${escapeHtml(updated)}</div>` : ""}
      </div>
      ${
        leadId
          ? `<button class="button secondary" type="button" data-open-lead="${escapeAttr(leadId)}" data-busy-control>Abrir lead</button>`
          : '<span class="empty-state">Sem lead vinculado.</span>'
      }
    </article>
  `;
}

function renderWaha(waha = {}) {
  const items = [
    ["Aprovadas", waha.approved, "green", "Prontas no outbox"],
    ["ACK pendente", waha.deliveryPending, waha.deliveryPending ? "amber" : "neutral", "Nao entregue"],
    ["Ambiguas", waha.dispatchAmbiguous, waha.dispatchAmbiguous ? "red" : "neutral", "Gargalo"],
    ["ACK forte", waha.sentStrongAck, "green", "Entrega confirmada"],
  ];

  elements.wahaSummary.innerHTML = items
    .map(
      ([label, value, color, note]) => `
        <article class="metric">
          <span class="badge ${escapeAttr(color)}">${escapeHtml(label)}</span>
          <strong>${escapeHtml(formatNumber(value))}</strong>
          <span class="muted">${escapeHtml(note)}</span>
        </article>
      `,
    )
    .join("");
}

async function searchLeads() {
  const q = elements.searchInput.value.trim();
  if (state.searchController) state.searchController.abort();

  if (!q) {
    elements.searchState.textContent = "Todos os status";
    elements.searchResults.innerHTML = "";
    return;
  }

  state.searchController = new AbortController();
  elements.searchState.textContent = "Buscando";
  startRequest();
  try {
    const body = await fetchJson(`/api/leads?q=${encodeURIComponent(q)}`, { signal: state.searchController.signal });
    const leads = Array.isArray(body.leads) ? body.leads : [];
    elements.searchState.textContent = `${leads.length} resultado${leads.length === 1 ? "" : "s"}`;
    elements.searchResults.innerHTML = leads.length
      ? leads.map(renderSearchResult).join("")
      : '<p class="empty-state">Nenhum resultado.</p>';
  } catch (error) {
    if (error.name !== "AbortError") {
      elements.searchState.textContent = "Falha";
      showError(error.message);
    }
  } finally {
    endRequest();
  }
}

function renderSearchResult(lead = {}) {
  const leadId = numberOrNull(lead.leadId);
  const title = lead.canonicalName || "Lead";
  const meta = compactJoin([lead.status, lead.commercialStage, lead.city, lead.area], " | ");
  const attrs = leadId ? `data-open-lead="${escapeAttr(leadId)}" data-busy-control` : "disabled";
  return `
    <button class="search-item" type="button" ${attrs}>
      <strong>${escapeHtml(title)}</strong>
      <span class="muted">${escapeHtml(meta || "-")}</span>
    </button>
  `;
}

async function openLead(leadId) {
  const parsedLeadId = numberOrNull(leadId);
  if (!parsedLeadId) return;

  startRequest();
  try {
    const body = await fetchJson(`/api/leads/${encodeURIComponent(parsedLeadId)}`);
    state.currentLead = body.lead;
    state.modalSnapshot = leadSnapshot(body.lead);
    state.modalStale = false;
    state.selectedAction = null;
    state.modalOpen = true;
    renderLeadModal(body.lead);
    elements.modal.classList.remove("hidden");
    startLeadWatch();
    elements.modalClose.focus();
  } catch (error) {
    showError(error.message);
  } finally {
    endRequest();
  }
}

function renderLeadModal(lead = {}) {
  elements.modalKind.textContent = lead.cardKind === "waha_blocker" ? "WAHA" : "Lead";
  elements.modalTitle.textContent = lead.canonicalName || "Lead";

  const actionButtons = Array.isArray(lead.availableActions) && lead.availableActions.length
    ? `<div class="action-list">${lead.availableActions.map(renderActionButton).join("")}</div>`
    : '<p class="empty-state">Sem acoes disponiveis.</p>';

  elements.leadDetail.innerHTML = `
    <section class="detail-band">
      <h3>Estado</h3>
      <dl class="detail-grid">
        ${detailItem("Status", lead.status)}
        ${detailItem("Stage", lead.commercialStage)}
        ${detailItem("Oferta", lead.recommendedOffer)}
        ${detailItem("Categoria", lead.category)}
        ${detailItem("Local", compactJoin([lead.area, lead.city], " - "))}
        ${detailItem("Contato", lead.contact)}
        ${detailItem("Instagram", lead.instagram)}
        ${detailItem("QA", lead.qaStatus)}
        ${detailItem("Atualizado", formatDateTime(lead.updatedAt))}
      </dl>
    </section>
    ${
      lead.validationBlocker
        ? `<section class="detail-band"><h3>Bloqueio</h3><p class="error-text">${escapeHtml(lead.validationBlocker)}</p></section>`
        : ""
    }
    <section class="detail-band">
      <h3>Mensagem</h3>
      <pre class="code-block">${escapeHtml(lead.message || "Sem mensagem pronta.")}</pre>
    </section>
    <section class="detail-band">
      <h3>Acoes</h3>
      ${actionButtons}
      <div id="modal-stale-warning"></div>
      <div id="action-form-slot"></div>
      <div id="paperclip-recovery-slot"></div>
    </section>
    <section class="detail-band">
      <h3>Outbox</h3>
      ${renderOutbox(lead.outbox)}
    </section>
  `;
}

function detailItem(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value || "-")}</dd>
    </div>
  `;
}

function renderActionButton(action) {
  const tone = ["perdido", "descartar"].includes(action) ? "danger" : "";
  return `
    <button class="button ${escapeAttr(tone)}" type="button" data-select-action="${escapeAttr(action)}" data-busy-control data-action-control>
      ${escapeHtml(labelForAction(action))}
    </button>
  `;
}

function renderOutbox(outbox) {
  if (!Array.isArray(outbox) || outbox.length === 0) {
    return '<p class="empty-state">Sem historico de outbox.</p>';
  }

  return `
    <div class="outbox-list">
      ${outbox.map(renderOutboxRow).join("")}
    </div>
  `;
}

function renderOutboxRow(row = {}) {
  const statusTone = toneForStatus(row.status);
  const date = formatDateTime(row.deliveryCheckedAt || row.deliveredAt || row.sentAt || row.failedAt || row.approvedAt || row.createdAt);
  const reason = row.dispatchError || row.guardianReason || row.guardianDecision || "";
  return `
    <article class="outbox-row">
      <h3>Outbox ${escapeHtml(row.id || "-")}</h3>
      <div class="meta-line">
        <span class="badge ${escapeAttr(statusTone)}">${escapeHtml(row.status || "-")}</span>
        ${row.deliveryAckName ? `<span class="badge green">${escapeHtml(row.deliveryAckName)}</span>` : ""}
        ${date ? `<span class="muted">${escapeHtml(date)}</span>` : ""}
      </div>
      ${reason ? `<p class="error-text">${escapeHtml(reason)}</p>` : ""}
      <p class="outbox-body">${escapeHtml(row.body || "")}</p>
    </article>
  `;
}

function selectAction(action) {
  if (!state.currentLead) return;
  state.selectedAction = action;
  const slot = document.getElementById("action-form-slot");
  if (!slot) return;

  const needsMessage = requiredMessageActions.has(action);
  const needsReason = requiredReasonActions.has(action);
  const optionalContext = optionalContextActions.has(action);
  const strong = strongActions.has(action);
  const textareaId = needsReason ? "action-reason" : "action-message";
  const textareaLabel = needsReason ? "Motivo" : needsMessage ? "Resposta recebida" : "Contexto";
  const textareaPlaceholder = needsReason
    ? "Explique o motivo"
    : needsMessage
      ? "Cole a mensagem recebida"
      : "Opcional";

  slot.innerHTML = `
    <form class="action-form" id="action-form">
      <h3>${escapeHtml(labelForAction(action))}</h3>
      ${
        needsMessage || needsReason || optionalContext
          ? `
            <label class="field-label" for="${escapeAttr(textareaId)}">${escapeHtml(textareaLabel)}</label>
            <textarea id="${escapeAttr(textareaId)}" placeholder="${escapeAttr(textareaPlaceholder)}"></textarea>
          `
          : ""
      }
      ${
        strong
          ? `
            <label class="confirm-line">
              <input id="action-confirm" type="checkbox">
              <span>Confirmo ${escapeHtml(labelForAction(action).toLowerCase())} para este lead.</span>
            </label>
          `
          : ""
      }
      <div class="action-row">
        <button id="action-submit" class="button ${["perdido", "descartar"].includes(action) ? "danger" : ""}" type="button" data-submit-action="${escapeAttr(action)}" data-busy-control data-action-control>
          Executar
        </button>
        <button class="button secondary" type="button" data-select-action="" data-busy-control>Cancelar</button>
      </div>
    </form>
  `;

  if (!action) {
    slot.innerHTML = "";
    state.selectedAction = null;
    return;
  }

  updateActionSubmitState();
  const textarea = document.getElementById(textareaId);
  if (textarea) textarea.focus();
  else document.getElementById("action-confirm")?.focus();
}

function updateActionSubmitState() {
  const action = state.selectedAction;
  const submit = document.getElementById("action-submit");
  if (!action || !submit) return;

  const message = document.getElementById("action-message")?.value.trim() ?? "";
  const reason = document.getElementById("action-reason")?.value.trim() ?? "";
  const confirmed = document.getElementById("action-confirm")?.checked ?? true;
  const validMessage = !requiredMessageActions.has(action) || Boolean(message);
  const validReason = !requiredReasonActions.has(action) || Boolean(reason);
  submit.disabled = isBusy() || state.modalStale || !confirmed || !validMessage || !validReason;
}

async function submitSelectedAction() {
  const lead = state.currentLead;
  const action = state.selectedAction;
  if (!lead || !action) return;

  const payload = {};
  const message = document.getElementById("action-message")?.value.trim() ?? "";
  const reason = document.getElementById("action-reason")?.value.trim() ?? "";

  if (requiredMessageActions.has(action) && !message) {
    showError("Mensagem obrigatoria.");
    updateActionSubmitState();
    return;
  }
  if (requiredReasonActions.has(action) && !reason) {
    showError("Motivo obrigatorio.");
    updateActionSubmitState();
    return;
  }
  if (message) payload.message = message;
  if (reason) payload.reason = reason;

  startRequest();
  try {
    const body = await fetchJson(`/api/actions/${encodeURIComponent(action)}`, {
      method: "POST",
      body: JSON.stringify({
        leadId: lead.leadId,
        expectedStage: lead.commercialStage,
        payload,
      }),
    });

    const result = body.result ?? {};
    if (isPaperclipPartialFailure(result)) {
      showPaperclipRecovery(result);
      showError("CRM atualizado. Publicacao Paperclip pendente.");
      return;
    }

    if (!body.ok || result.ok === false) {
      showActionError(result);
      if (result.nextRefreshRecommended) {
        closeModal();
        await refresh({ manual: true, force: true });
      }
      return;
    }

    showToast("Acao registrada.");
    closeModal();
    await refresh({ manual: true, force: true });
  } catch (error) {
    showError(error.message);
  } finally {
    endRequest();
  }
}

async function retryPaperclipRefresh() {
  startRequest();
  try {
    const body = await fetchJson("/api/refresh-paperclip", { method: "POST" });
    if (!body.ok) {
      showPaperclipRecovery({ reason: "paperclip_sync_failed", errors: [runnerMessage(body.result)] });
      showError(runnerMessage(body.result) || "Publicacao Paperclip pendente.");
      return;
    }

    showToast("Paperclip atualizado.");
    closeModal();
    await refresh({ manual: true, force: true });
  } catch (error) {
    showPaperclipRecovery({ reason: "paperclip_sync_failed", errors: [error.message] });
    showError(error.message);
  } finally {
    endRequest();
  }
}

async function previewCommand() {
  const command = elements.commandInput.value.trim();
  startRequest();
  try {
    const body = await fetchJson("/api/command/preview", {
      method: "POST",
      body: JSON.stringify({ command }),
    });
    renderCommandPreview(body.preview);
  } catch (error) {
    showError(error.message);
  } finally {
    endRequest();
  }
}

function renderCommandPreview(preview = {}) {
  if (!preview.ok) {
    const matches = Array.isArray(preview.matches) && preview.matches.length
      ? `<div class="action-list">${preview.matches.map(renderPreviewMatch).join("")}</div>`
      : "";
    elements.commandPreview.innerHTML = `
      <section class="preview-panel">
        <h3>Falha</h3>
        <p class="error-text">${escapeHtml(reasonLabel(preview.reason))}</p>
        ${preview.availableActions ? `<p class="muted">Acoes: ${escapeHtml(preview.availableActions.join(", "))}</p>` : ""}
        ${matches}
      </section>
    `;
    return;
  }

  const lead = preview.lead ?? {};
  elements.commandPreview.innerHTML = `
    <section class="preview-panel">
      <h3>Preview</h3>
      <dl class="preview-grid">
        ${detailItem("Status", "OK")}
        ${detailItem("Acao", labelForAction(preview.action))}
        ${detailItem("Lead", lead.canonicalName || preview.leadId || "-")}
        ${detailItem("CRM", preview.crmEffect)}
        ${detailItem("Paperclip", preview.paperclipEffect)}
        ${detailItem("Agente", preview.agentMayWake ? "Pode acordar" : "Nao")}
        ${detailItem("Confirmacao", preview.requiresStrongConfirmation ? "Forte" : "Simples")}
        ${detailItem("Stage", lead.commercialStage)}
      </dl>
      ${
        Array.isArray(lead.availableActions)
          ? `<p class="muted">Acoes disponiveis: ${escapeHtml(lead.availableActions.map(labelForAction).join(", ") || "-")}</p>`
          : ""
      }
      <pre class="code-block">${escapeHtml(JSON.stringify(preview.payload ?? {}, null, 2))}</pre>
    </section>
  `;
}

function renderPreviewMatch(lead = {}) {
  const leadId = numberOrNull(lead.leadId);
  const attrs = leadId ? `data-open-lead="${escapeAttr(leadId)}" data-busy-control` : "disabled";
  return `
    <button class="button secondary" type="button" ${attrs}>
      ${escapeHtml(lead.canonicalName || "Lead")}
    </button>
  `;
}

async function fetchJson(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok && !body.result) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return body;
}

function closeModal() {
  stopLeadWatch();
  state.modalOpen = false;
  state.modalStale = false;
  state.currentLead = null;
  state.modalSnapshot = null;
  state.selectedAction = null;
  elements.modal.classList.add("hidden");
  elements.leadDetail.innerHTML = "";
  syncBusyState();
}

function startRequest() {
  state.requestCount += 1;
  syncBusyState();
}

function endRequest() {
  state.requestCount = Math.max(0, state.requestCount - 1);
  syncBusyState();
}

function isBusy() {
  return state.requestCount > 0;
}

function syncBusyState() {
  const busy = isBusy();
  elements.app.setAttribute("aria-busy", busy ? "true" : "false");
  elements.refreshButton.disabled = busy || state.modalOpen;
  elements.previewButton.disabled = busy;
  for (const button of document.querySelectorAll("[data-busy-control]")) {
    button.disabled = busy;
  }
  for (const button of document.querySelectorAll("[data-action-control]")) {
    button.disabled = busy || state.modalStale;
  }
  updateActionSubmitState();
}

function setHealth(tone, label) {
  elements.dbHealth.className = `status-pill ${tone}`;
  elements.dbHealth.textContent = label;
}

function showActionError(result = {}) {
  const messages = [
    result.reason ? reasonLabel(result.reason) : "",
    ...(Array.isArray(result.warnings) ? result.warnings : []),
    ...(Array.isArray(result.errors) ? result.errors : []),
  ].filter(Boolean);
  showError(messages.join("\n") || "Acao incompleta.");
}

function showPaperclipRecovery(result = {}) {
  const slot = document.getElementById("paperclip-recovery-slot");
  if (!slot) return;

  const details = [
    ...(Array.isArray(result.warnings) ? result.warnings : []),
    ...(Array.isArray(result.errors) ? result.errors : []),
  ].filter(Boolean);

  slot.innerHTML = `
    <section class="action-form paperclip-recovery" role="alert">
      <h3>Paperclip pendente</h3>
      <p>CRM atualizado. Publicacao Paperclip pendente.</p>
      ${details.length ? `<pre class="code-block">${escapeHtml(details.join("\n"))}</pre>` : ""}
      <div class="action-row">
        <button class="button secondary" type="button" data-retry-paperclip data-busy-control>
          Republicar Paperclip
        </button>
      </div>
    </section>
  `;
  syncBusyState();
}

async function reloadOpenLead() {
  const leadId = numberOrNull(state.currentLead?.leadId);
  if (!leadId) return;

  startRequest();
  try {
    const body = await fetchJson(`/api/leads/${encodeURIComponent(leadId)}`);
    state.currentLead = body.lead;
    state.modalSnapshot = leadSnapshot(body.lead);
    state.modalStale = false;
    state.selectedAction = null;
    renderLeadModal(body.lead);
    startLeadWatch();
    showToast("Lead atualizado.");
  } catch (error) {
    showError(error.message);
  } finally {
    endRequest();
  }
}

function startLeadWatch() {
  stopLeadWatch();
  state.leadWatchTimer = setInterval(() => {
    pollOpenLead();
  }, 10000);
}

function stopLeadWatch() {
  if (state.leadWatchTimer) {
    clearInterval(state.leadWatchTimer);
    state.leadWatchTimer = null;
  }
  if (state.leadWatchController) {
    state.leadWatchController.abort();
    state.leadWatchController = null;
  }
  state.leadWatchBusy = false;
}

async function pollOpenLead() {
  const leadId = numberOrNull(state.currentLead?.leadId);
  if (!state.modalOpen || state.modalStale || state.leadWatchBusy || isBusy() || !leadId) return;

  state.leadWatchBusy = true;
  state.leadWatchController = new AbortController();
  try {
    const body = await fetchJson(`/api/leads/${encodeURIComponent(leadId)}`, {
      signal: state.leadWatchController.signal,
    });
    if (hasLeadMaterialChange(state.modalSnapshot, body.lead)) {
      markModalStale();
    }
  } catch (error) {
    if (error.name !== "AbortError") showError(error.message);
  } finally {
    state.leadWatchBusy = false;
    state.leadWatchController = null;
  }
}

function markModalStale() {
  state.modalStale = true;
  const warning = document.getElementById("modal-stale-warning");
  if (warning) {
    warning.innerHTML = `
      <section class="stale-warning" role="alert">
        <p>Este lead mudou desde que voce abriu</p>
        <button class="button secondary" type="button" data-reload-open-lead data-busy-control>
          Recarregar lead
        </button>
      </section>
    `;
  }
  syncBusyState();
}

function hasLeadMaterialChange(openedSnapshot, latestLead) {
  const latestSnapshot = leadSnapshot(latestLead);
  if (!openedSnapshot || !latestSnapshot) return false;
  return (
    openedSnapshot.status !== latestSnapshot.status ||
    openedSnapshot.commercialStage !== latestSnapshot.commercialStage ||
    openedSnapshot.updatedAt !== latestSnapshot.updatedAt ||
    openedSnapshot.availableActions !== latestSnapshot.availableActions
  );
}

function leadSnapshot(lead = {}) {
  return {
    status: String(lead.status ?? ""),
    commercialStage: String(lead.commercialStage ?? ""),
    updatedAt: String(lead.updatedAt ?? ""),
    availableActions: Array.isArray(lead.availableActions) ? [...lead.availableActions].sort().join("|") : "",
  };
}

function isPaperclipPartialFailure(result = {}) {
  return result.reason === "paperclip_sync_failed" || (result.crmUpdated === true && result.paperclipUpdated === false);
}

function runnerMessage(result = {}) {
  return String(result?.stderr || result?.stdout || result?.error || "Publicacao Paperclip pendente.").trim();
}

function showToast(message) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  state.toastTimer = setTimeout(() => elements.toast.classList.add("hidden"), 3200);
}

function showError(message) {
  clearTimeout(state.errorTimer);
  elements.errorBox.textContent = message;
  elements.errorBox.classList.remove("hidden");
  state.errorTimer = setTimeout(() => elements.errorBox.classList.add("hidden"), 9000);
}

function hideError() {
  clearTimeout(state.errorTimer);
  elements.errorBox.classList.add("hidden");
  elements.errorBox.textContent = "";
}

function labelForAction(action) {
  return actionLabels[action] || action || "-";
}

function labelForKind(kind) {
  return {
    worker_handoff: "Worker",
    waha_blocker: "WAHA bloqueio",
    lead: "Lead",
  }[kind] || "Lead";
}

function toneForStatus(status) {
  const normalized = String(status ?? "").toLowerCase();
  if (/(bloque|ambiguous|failed|erro|perdido|descart)/.test(normalized)) return "red";
  if (/(pending|pendente|aguard|qa|validation|validacao|delivery)/.test(normalized)) return "amber";
  if (/(ready|aprov|sent|device|read|lead_quente|interessado)/.test(normalized)) return "green";
  return "neutral";
}

function reasonLabel(reason) {
  return (
    {
      empty_command: "Comando vazio.",
      unknown_command: "Comando desconhecido.",
      lead_name_required: "Nome do lead obrigatorio.",
      response_message_required: "Mensagem obrigatoria.",
      closure_reason_required: "Motivo obrigatorio.",
      lead_not_found: "Lead nao encontrado.",
      ambiguous_lead: "Lead ambiguo.",
      action_unavailable: "Acao indisponivel.",
      lead_stage_changed: "Lead mudou de etapa.",
      healthcheck_failed: "Healthcheck falhou.",
      crm_write_failed: "Falha ao gravar no CRM.",
      paperclip_sync_failed: "CRM atualizado; Paperclip pendente.",
      unsupported_action: "Acao nao suportada.",
    }[reason] || reason || "Falha"
  );
}

function compactJoin(values, separator) {
  return values.map((value) => String(value ?? "").trim()).filter(Boolean).join(separator);
}

function formatNumber(value) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat("pt-BR").format(number);
}

function formatDateTime(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function debounce(fn, delay) {
  let timeout = null;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char];
  });
}

function escapeAttr(value) {
  return escapeHtml(value);
}
