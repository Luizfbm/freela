const state = {
  requestCount: 0,
  activeMode: "enviarAgora",
  selectedLeadId: null,
  currentLead: null,
  modalOpen: false,
  modalStale: false,
  paperclipRecoveryOnly: false,
  paperclipRecoveryResult: null,
  selectedAction: null,
  inlineConfirmLeadId: null,
  refreshTimer: null,
  boardSnapshots: new Map(),
  boardSnapshotsPrimed: false,
  leadWatchTimer: null,
  leadWatchController: null,
  leadWatchBusy: false,
  searchController: null,
  toastTimer: null,
  errorTimer: null,
  kanban: {},
  waha: {},
  wahaReconcileDrafts: new Map(),
  wahaNoMatchDrafts: new Map(),
  wahaNoMatchOpenId: null,
  modalSnapshot: null,
};

const modes = [
  ["enviarAgora", "Enviar", "Leads com mensagem pronta para envio manual"],
  ["followupResposta", "Follow-up", "Respostas e follow-ups que pedem proxima acao"],
  ["aguardandoWorker", "Workers", "Itens aguardando redator, QA ou handoff ativo"],
  ["bloqueados", "Bloqueios", "Leads bloqueados por validacao, evidencia ou guardiao"],
  ["revisar", "Revisar", "Leads que precisam reanalise antes de operar"],
  ["waha", "WAHA", "Outbox com gargalo operacional ou ACK ambiguo"],
];

const modeByKey = new Map(modes.map(([key, label, description]) => [key, { key, label, description }]));

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
  modeTabs: document.getElementById("mode-tabs"),
  queueTitle: document.getElementById("queue-title"),
  queueSubtitle: document.getElementById("queue-subtitle"),
  modeCount: document.getElementById("mode-count"),
  leadList: document.getElementById("lead-list"),
  detailEmpty: document.getElementById("detail-empty"),
  detailBody: document.getElementById("detail-body"),
  searchInput: document.getElementById("lead-search"),
  searchResults: document.getElementById("search-results"),
  searchState: document.getElementById("search-state"),
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

elements.refreshButton.addEventListener("click", () => refresh({ manual: true, force: true }));
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

elements.modeTabs.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-mode]");
  if (!button) return;
  await activateMode(button.dataset.mode);
});

elements.leadList.addEventListener("click", async (event) => {
  const whatsappLink = event.target.closest("[data-open-whatsapp]");
  if (whatsappLink) {
    showToast("WhatsApp aberto. Registre enviado so depois do envio real.");
    return;
  }

  const copyButton = event.target.closest("[data-copy-message]");
  if (copyButton) {
    await copyLeadMessage(copyButton.dataset.copyMessage);
    return;
  }

  const confirmButton = event.target.closest("[data-confirm-send]");
  if (confirmButton) {
    state.inlineConfirmLeadId = numberOrNull(confirmButton.dataset.confirmSend);
    renderLeadList();
    return;
  }

  const cancelButton = event.target.closest("[data-cancel-send]");
  if (cancelButton) {
    state.inlineConfirmLeadId = null;
    renderLeadList();
    return;
  }

  const submitButton = event.target.closest("[data-submit-send]");
  if (submitButton) {
    await submitQuickSend(submitButton.dataset.submitSend);
    return;
  }

  const reconcileButton = event.target.closest("[data-waha-reconcile]");
  if (reconcileButton) {
    await submitWahaReconcile(reconcileButton.dataset.wahaReconcile);
    return;
  }

  const noMatchButton = event.target.closest("[data-waha-no-match]");
  if (noMatchButton) {
    state.wahaNoMatchOpenId = numberOrNull(noMatchButton.dataset.wahaNoMatch);
    renderLeadList();
    return;
  }

  const cancelNoMatchButton = event.target.closest("[data-waha-cancel-no-match]");
  if (cancelNoMatchButton) {
    state.wahaNoMatchOpenId = null;
    renderLeadList();
    return;
  }

  const submitNoMatchButton = event.target.closest("[data-waha-submit-no-match]");
  if (submitNoMatchButton) {
    await submitWahaNoMatch(submitNoMatchButton.dataset.wahaSubmitNoMatch);
    return;
  }

  const row = event.target.closest("[data-open-lead]");
  if (!row) return;
  await openLead(row.dataset.openLead);
});

elements.leadList.addEventListener("change", (event) => {
  const select = event.target.closest("[data-waha-lead-select]");
  if (select) {
    const unmatchedId = numberOrNull(select.dataset.wahaLeadSelect);
    if (!unmatchedId) return;
    const draft = wahaDraft(unmatchedId);
    draft.leadId = numberOrNull(select.value);
    renderLeadList();
    return;
  }

  const confirm = event.target.closest("[data-waha-confirm]");
  if (confirm) {
    const unmatchedId = numberOrNull(confirm.dataset.wahaConfirm);
    if (!unmatchedId) return;
    const draft = wahaDraft(unmatchedId);
    draft.confirmed = confirm.checked;
    renderLeadList();
  }
});

elements.leadList.addEventListener("input", (event) => {
  const reason = event.target.closest("[data-waha-no-match-reason]");
  if (!reason) return;
  const unmatchedId = numberOrNull(reason.dataset.wahaNoMatchReason);
  if (!unmatchedId) return;
  state.wahaNoMatchDrafts.set(unmatchedId, reason.value);
});

elements.leadList.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest("[data-open-lead]");
  if (!row || event.target.closest("button")) return;
  event.preventDefault();
  await openLead(row.dataset.openLead);
});

elements.searchResults.addEventListener("click", async (event) => {
  const item = event.target.closest("[data-open-lead]");
  if (!item) return;
  await openLead(item.dataset.openLead);
});

elements.commandPreview.addEventListener("click", async (event) => {
  const item = event.target.closest("[data-open-lead]");
  if (!item) return;
  await openLead(item.dataset.openLead);
});

for (const detailRoot of [elements.detailBody, elements.leadDetail]) {
  detailRoot.addEventListener("click", async (event) => {
    const copyButton = event.target.closest("[data-detail-copy-message]");
    if (copyButton) {
      await copyText(state.currentLead?.message || "");
      showToast("Mensagem copiada.");
      return;
    }

    const actionButton = event.target.closest("[data-select-action]");
    if (actionButton) {
      selectAction(actionButton.dataset.selectAction);
      return;
    }

    const submitButton = event.target.closest("[data-submit-action]");
    if (submitButton) {
      await submitSelectedAction();
      return;
    }

    const retryPaperclipButton = event.target.closest("[data-retry-paperclip]");
    if (retryPaperclipButton) {
      await retryPaperclipRefresh();
      return;
    }

    const reloadButton = event.target.closest("[data-reload-open-lead]");
    if (reloadButton) {
      await reloadOpenLead();
    }
  });

  detailRoot.addEventListener("input", (event) => {
    if (
      event.target.id === "action-message" ||
      event.target.id === "action-reason" ||
      event.target.id === "action-confirm"
    ) {
      updateActionSubmitState();
    }
  });
}

await refresh({ manual: true, force: true });
state.refreshTimer = setInterval(() => {
  if (!isBusy()) {
    refresh();
  }
}, 30000);

async function refresh({ manual = false, force = false } = {}) {
  if (isBusy() && !force) {
    if (manual) showToast("Atualizacao em andamento.");
    return;
  }

  startRequest();
  try {
    const [summaryBody, leadsBody, wahaBody] = await Promise.all([
      fetchJson("/api/summary"),
      fetchJson("/api/leads"),
      fetchJson("/api/waha"),
    ]);

    state.kanban = annotateChangedCards(leadsBody.kanban);
    state.waha = wahaBody.waha ?? {};
    reconcileSelection();
    renderSummary(summaryBody.summary);
    renderOperations();
    renderWaha(state.waha);
    setHealth("green", "SQLite OK");
    elements.lastRefresh.textContent = `Atualizado ${new Date().toLocaleTimeString("pt-BR")}`;
    hideError();

    if (state.selectedLeadId && state.currentLead?.leadId !== state.selectedLeadId) {
      await loadLeadDetail(state.selectedLeadId, { manageBusy: false });
    }
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
    ["WAHA sem ID", waha.unmatchedOpen, waha.unmatchedOpen ? "amber" : "neutral"],
    ["WAHA ambiguas", waha.dispatchAmbiguous, waha.dispatchAmbiguous ? "red" : "neutral"],
  ];

  const nextStep = summary.nextStep
    ? `<article class="metric next-step"><span class="badge blue">Proximo passo</span><span>${escapeHtml(summary.nextStep)}</span></article>`
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

function renderOperations() {
  renderModeTabs();
  renderLeadList();
  renderSelectedDetail();
}

function renderModeTabs() {
  elements.modeTabs.innerHTML = modes
    .map(([key, label]) => {
      const count = getModeCount(key);
      const active = key === state.activeMode;
      return `
        <button class="mode-tab${active ? " active" : ""}" type="button" data-mode="${escapeAttr(key)}" aria-pressed="${active ? "true" : "false"}">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(formatNumber(count))}</strong>
        </button>
      `;
    })
    .join("");
}

function renderLeadList() {
  const mode = modeByKey.get(state.activeMode) ?? modeByKey.get("enviarAgora");
  if (mode.key === "waha") {
    renderWahaModeList(mode);
    return;
  }

  const cards = getCardsForMode(mode.key);
  elements.queueTitle.textContent = mode.key === "enviarAgora" ? "Enviar hoje" : mode.label;
  elements.queueSubtitle.textContent = mode.description;
  elements.modeCount.textContent = formatNumber(cards.length);

  if (!cards.length) {
    elements.leadList.innerHTML = renderModeEmptyState(mode.key);
    return;
  }

  elements.leadList.innerHTML = cards.map(renderLeadRow).join("");
}

function renderModeEmptyState(modeKey) {
  if (modeKey === "waha") {
    return `
      <section class="empty-panel">
        <h3>Sem gargalo WAHA na fila</h3>
        <p class="muted">Use o resumo lateral para acompanhar mensagens sem identidade, ACK pendente, ambiguas e ACK forte.</p>
      </section>
    `;
  }
  return `
    <section class="empty-panel">
      <h3>Nenhum item neste modo</h3>
      <p class="muted">Os leads podem mudar de modo automaticamente conforme agentes e WAHA atualizam o CRM.</p>
    </section>
  `;
}

function renderWahaModeList(mode) {
  const blockers = getCardsForMode("waha");
  const unmatched = Array.isArray(state.waha.unmatched) ? state.waha.unmatched : [];
  elements.queueTitle.textContent = "WAHA";
  elements.queueSubtitle.textContent = mode.description;
  elements.modeCount.textContent = formatNumber(blockers.length + unmatched.length);

  if (!blockers.length && !unmatched.length) {
    elements.leadList.innerHTML = renderModeEmptyState("waha");
    return;
  }

  elements.leadList.innerHTML = `
    <section class="waha-unmatched-section">
      <div class="section-title-row">
        <h3>Mensagens sem identidade</h3>
        <span class="badge ${unmatched.length ? "amber" : "neutral"}">${escapeHtml(formatNumber(unmatched.length))}</span>
      </div>
      ${
        unmatched.length
          ? unmatched.map(renderWahaUnmatchedRow).join("")
          : '<p class="empty-state">Nenhuma mensagem sem identidade.</p>'
      }
    </section>
    <section class="waha-unmatched-section">
      <div class="section-title-row">
        <h3>Gargalos WAHA</h3>
        <span class="badge ${blockers.length ? "red" : "neutral"}">${escapeHtml(formatNumber(blockers.length))}</span>
      </div>
      ${blockers.length ? blockers.map(renderLeadRow).join("") : '<p class="empty-state">Nenhum gargalo WAHA.</p>'}
    </section>
  `;
}

function renderWahaUnmatchedRow(item = {}) {
  const unmatchedId = numberOrNull(item.id);
  const draft = wahaDraft(unmatchedId);
  const selectedLeadId = numberOrNull(draft.leadId);
  const confirmed = Boolean(draft.confirmed);
  const canReconcile = Boolean(unmatchedId && selectedLeadId && confirmed);
  const noMatchOpen = state.wahaNoMatchOpenId === unmatchedId;
  const reason = state.wahaNoMatchDrafts.get(unmatchedId) || "";
  const sender = item.senderName || item.senderPhone || item.chatId || "Remetente desconhecido";
  const candidates = Array.isArray(state.waha.recentCandidates) ? state.waha.recentCandidates : [];

  return `
    <article class="waha-unmatched-card">
      <div class="waha-unmatched-head">
        <div>
          <h3>${escapeHtml(sender)}</h3>
          <p class="row-meta">${escapeHtml(compactJoin([item.chatId, item.classification, formatDateTime(item.receivedAt)], " | "))}</p>
        </div>
        <span class="badge amber">sem identidade</span>
      </div>
      <p class="row-note">${escapeHtml(item.matchReason || "Lead nao identificado pelo gateway.")}</p>
      <pre class="code-block compact">${escapeHtml(item.body || "")}</pre>

      <div class="waha-reconcile-grid">
        <label>
          <span>Lead correto</span>
          <select data-waha-lead-select="${escapeAttr(unmatchedId || "")}" data-busy-control>
            <option value="">Selecione o lead</option>
            ${candidates.map((lead) => renderWahaCandidateOption(lead, selectedLeadId)).join("")}
          </select>
        </label>
        <label class="confirm-line compact-confirm">
          <input type="checkbox" data-waha-confirm="${escapeAttr(unmatchedId || "")}" ${confirmed ? "checked" : ""} data-busy-control>
          <span>Confirmo que este LID pertence ao lead selecionado.</span>
        </label>
      </div>

      <div class="action-row">
        <button class="button small" type="button" data-waha-reconcile="${escapeAttr(unmatchedId || "")}" data-waha-reconcile-ready="${canReconcile ? "true" : "false"}" ${canReconcile ? "" : "disabled"} data-busy-control>
          Conciliar + acordar agente
        </button>
        <button class="button ghost small" type="button" data-waha-no-match="${escapeAttr(unmatchedId || "")}" data-busy-control>
          Marcar no-match
        </button>
      </div>

      ${
        noMatchOpen
          ? `
            <div class="inline-confirm vertical">
              <label>
                <span>Motivo do no-match</span>
                <textarea data-waha-no-match-reason="${escapeAttr(unmatchedId || "")}" placeholder="Ex.: conversa pessoal sem lead comercial">${escapeHtml(reason)}</textarea>
              </label>
              <div class="action-row">
                <button class="button danger small" type="button" data-waha-submit-no-match="${escapeAttr(unmatchedId || "")}" data-busy-control>Confirmar no-match</button>
                <button class="button ghost small" type="button" data-waha-cancel-no-match data-busy-control>Cancelar</button>
              </div>
            </div>
          `
          : ""
      }
    </article>
  `;
}

function renderWahaCandidateOption(lead = {}, selectedLeadId = null) {
  const leadId = numberOrNull(lead.leadId);
  if (!leadId) return "";
  const meta = compactJoin([lead.status, lead.category, lead.area, lead.city, lead.contactedAt], " - ");
  return `
    <option value="${escapeAttr(leadId)}" ${leadId === selectedLeadId ? "selected" : ""}>
      ${escapeHtml(`${lead.canonicalName || "Lead"}${meta ? ` | ${meta}` : ""}`)}
    </option>
  `;
}

function renderLeadRow(card = {}) {
  const leadId = numberOrNull(card.leadId);
  const selected = leadId && leadId === state.selectedLeadId;
  const title = card.canonicalName || card.title || "Item sem nome";
  const meta = compactJoin([card.category, card.area, card.city], " - ");
  const channel = inferChannel(card);
  const qa = qaLabel(card);
  const risk = riskLabel(card);
  const updated = formatDateTime(card.updatedAt || card.createdAt);
  const note = rowNote(card);
  const canQuickSend = state.activeMode === "enviarAgora" && leadId && card.commercialStage === "ready_lead_card";
  const confirming = canQuickSend && state.inlineConfirmLeadId === leadId;
  const attrs = leadId ? `data-open-lead="${escapeAttr(leadId)}"` : "";

  return `
    <article class="lead-row${selected ? " selected" : ""}${card.externallyChanged ? " changed" : ""}" tabindex="${leadId ? "0" : "-1"}" ${attrs}>
      <div class="lead-row-main">
        <div class="lead-row-title">
          <h3>${escapeHtml(title)}</h3>
          ${card.externallyChanged ? '<span class="badge amber">Mudou agora</span>' : ""}
        </div>
        ${meta ? `<p class="row-meta">${escapeHtml(meta)}</p>` : '<p class="row-meta">Sem nicho/local no CRM</p>'}
        ${note ? `<p class="row-note">${escapeHtml(note)}</p>` : ""}
      </div>

      <div class="lead-row-signals" aria-label="Sinais do lead">
        <span class="badge blue">${escapeHtml(channel)}</span>
        <span class="badge ${escapeAttr(qa.tone)}">${escapeHtml(qa.label)}</span>
        <span class="badge ${escapeAttr(risk.tone)}">${escapeHtml(risk.label)}</span>
        ${updated ? `<span class="updated-time">${escapeHtml(updated)}</span>` : ""}
      </div>

      <div class="lead-row-actions">
        ${renderMessageShortcut(card, { leadId })}
        ${
          canQuickSend
            ? `<button class="button small" type="button" data-confirm-send="${escapeAttr(leadId)}" data-busy-control data-action-control>Marcar enviado</button>`
            : ""
        }
      </div>

      ${
        confirming
          ? `
            <div class="inline-confirm" role="group" aria-label="Confirmar envio manual">
              <span>Confirmar que voce enviou manualmente?</span>
              <button class="button small" type="button" data-submit-send="${escapeAttr(leadId)}" data-busy-control data-action-control>Confirmar</button>
              <button class="button ghost small" type="button" data-cancel-send data-busy-control>Cancelar</button>
            </div>
          `
          : ""
      }
    </article>
  `;
}

function renderSelectedDetail() {
  if (!state.selectedLeadId) {
    elements.detailEmpty.classList.remove("hidden");
    elements.detailBody.classList.add("hidden");
    elements.detailBody.innerHTML = "";
    return;
  }

  if (!state.currentLead || state.currentLead.leadId !== state.selectedLeadId) {
    elements.detailEmpty.classList.add("hidden");
    elements.detailBody.classList.remove("hidden");
    elements.detailBody.innerHTML = `
      <section class="detail-band">
        <h2>Carregando lead</h2>
        <p class="empty-state">Buscando dados completos.</p>
      </section>
    `;
    return;
  }

  elements.detailEmpty.classList.add("hidden");
  elements.detailBody.classList.remove("hidden");
  elements.detailBody.innerHTML = renderLeadDetailContent(state.currentLead);
  if (state.paperclipRecoveryOnly) {
    enterPaperclipRecoveryMode(state.paperclipRecoveryResult ?? {});
  }
}

function renderLeadDetailContent(lead = {}) {
  const actionButtons = Array.isArray(lead.availableActions) && lead.availableActions.length
    ? `<div class="action-list">${lead.availableActions.map(renderActionButton).join("")}</div>`
    : '<p class="empty-state">Sem acoes disponiveis.</p>';
  const location = compactJoin([lead.area, lead.city], " - ");
  const blocker = lead.validationBlocker || lead.dispatchError || lead.guardianReason || "";

  return `
    <section class="detail-hero">
      <p class="eyebrow">${escapeHtml(lead.cardKind === "waha_blocker" ? "WAHA" : "Lead")}</p>
      <h2>${escapeHtml(lead.canonicalName || "Lead")}</h2>
      <div class="meta-line">
        <span class="badge ${escapeAttr(toneForStatus(lead.status))}">${escapeHtml(lead.status || "-")}</span>
        <span class="badge blue">${escapeHtml(lead.commercialStage || "-")}</span>
        <span class="badge neutral">${escapeHtml(inferChannel(lead))}</span>
      </div>
    </section>

    <section class="detail-band">
      <h3>Estado</h3>
      <dl class="detail-grid">
        ${detailItem("Stage", lead.commercialStage)}
        ${detailItem("QA", lead.qaStatus)}
        ${detailItem("Oferta", lead.recommendedOffer)}
        ${detailItem("Categoria", lead.category)}
        ${detailItem("Local", location)}
        ${detailItem("Contato", lead.contact)}
        ${detailItem("Instagram", lead.instagram)}
        ${detailItem("Atualizado", formatDateTime(lead.updatedAt))}
      </dl>
    </section>

    ${
      blocker
        ? `<section class="detail-band alert-band"><h3>Observacao</h3><p class="error-text">${escapeHtml(blocker)}</p></section>`
        : ""
    }

    <section class="detail-band">
      <div class="detail-section-header">
        <h3>Mensagem</h3>
        ${renderMessageShortcut(lead, { detail: true, leadId: lead.leadId })}
      </div>
      <pre class="code-block">${escapeHtml(lead.message || "Sem mensagem pronta.")}</pre>
    </section>

    <section class="detail-band">
      <h3>Acoes</h3>
      <div id="action-list-slot">${actionButtons}</div>
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

function renderLeadModal(lead = {}) {
  elements.modalKind.textContent = lead.cardKind === "waha_blocker" ? "WAHA" : "Lead";
  elements.modalTitle.textContent = lead.canonicalName || "Lead";
  elements.leadDetail.innerHTML = renderLeadDetailContent(lead);
}

function renderActionButton(action) {
  const tone = ["perdido", "descartar"].includes(action) ? "danger" : "secondary";
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

function renderWaha(waha = {}) {
  const items = [
    ["Sem identidade", waha.unmatchedOpen, waha.unmatchedOpen ? "amber" : "neutral", "Conciliar LID"],
    ["Aprovadas", waha.approved, "green", "Outbox pronto"],
    ["ACK pendente", waha.deliveryPending, waha.deliveryPending ? "amber" : "neutral", "Aguardar confirmacao"],
    ["Ambiguas", waha.dispatchAmbiguous, waha.dispatchAmbiguous ? "red" : "neutral", "Handoff operacional"],
    ["ACK forte", waha.sentStrongAck, "green", "Entrega confirmada"],
  ];

  elements.wahaSummary.innerHTML = items
    .map(
      ([label, value, color, note]) => `
        <article class="waha-metric">
          <span class="badge ${escapeAttr(color)}">${escapeHtml(label)}</span>
          <strong>${escapeHtml(formatNumber(value))}</strong>
          <span class="muted">${escapeHtml(note)}</span>
        </article>
      `,
    )
    .join("");
}

async function activateMode(modeKey) {
  if (!modeByKey.has(modeKey)) return;
  state.activeMode = modeKey;
  state.inlineConfirmLeadId = null;
  reconcileSelection({ preferFirstInMode: true });
  renderOperations();
  if (state.selectedLeadId) {
    await loadLeadDetail(state.selectedLeadId);
  }
}

function reconcileSelection({ preferFirstInMode = false } = {}) {
  const activeCards = getCardsForMode(state.activeMode);
  const selectedInActiveMode = activeCards.some((card) => numberOrNull(card.leadId) === state.selectedLeadId);
  const selectedExists = findCardByLeadId(state.selectedLeadId);
  const nextLeadId = numberOrNull(activeCards.find((card) => numberOrNull(card.leadId))?.leadId);

  if (preferFirstInMode || !state.selectedLeadId || !selectedExists || !selectedInActiveMode) {
    state.selectedLeadId = nextLeadId;
    state.currentLead = state.currentLead?.leadId === nextLeadId ? state.currentLead : null;
    state.modalSnapshot = state.currentLead ? leadSnapshot(state.currentLead) : null;
    state.modalStale = false;
    state.paperclipRecoveryOnly = false;
    state.paperclipRecoveryResult = null;
    state.selectedAction = null;
    stopLeadWatch();
  }
}

async function openLead(leadId) {
  const parsedLeadId = numberOrNull(leadId);
  if (!parsedLeadId) return;
  state.selectedLeadId = parsedLeadId;
  state.inlineConfirmLeadId = null;
  state.currentLead = state.currentLead?.leadId === parsedLeadId ? state.currentLead : null;
  state.modalStale = false;
  state.paperclipRecoveryOnly = false;
  state.paperclipRecoveryResult = null;
  state.selectedAction = null;
  renderOperations();
  await loadLeadDetail(parsedLeadId);
}

async function loadLeadDetail(leadId, { manageBusy = true, preserveRecovery = false } = {}) {
  const parsedLeadId = numberOrNull(leadId);
  if (!parsedLeadId) return;

  if (manageBusy) startRequest();
  try {
    const recoveryOnly = preserveRecovery ? state.paperclipRecoveryOnly : false;
    const recoveryResult = preserveRecovery ? state.paperclipRecoveryResult : null;
    const body = await fetchJson(`/api/leads/${encodeURIComponent(parsedLeadId)}`);
    state.currentLead = body.lead;
    state.selectedLeadId = body.lead.leadId;
    state.modalSnapshot = leadSnapshot(body.lead);
    state.modalStale = false;
    state.selectedAction = null;
    state.paperclipRecoveryOnly = recoveryOnly;
    state.paperclipRecoveryResult = recoveryResult;
    renderOperations();
    if (recoveryOnly) {
      enterPaperclipRecoveryMode(recoveryResult ?? {});
    }
    startLeadWatch();
  } catch (error) {
    showError(error.message);
  } finally {
    if (manageBusy) endRequest();
  }
}

async function copyLeadMessage(leadId) {
  const parsedLeadId = numberOrNull(leadId);
  const card = findCardByLeadId(parsedLeadId);
  if (!card?.message) {
    showError("Lead sem mensagem pronta.");
    return;
  }
  await copyText(card.message);
  showToast("Mensagem copiada.");
}

function renderMessageShortcut(item = {}, { leadId = null, detail = false } = {}) {
  const whatsappUrl = buildWhatsAppUrl(item);
  if (whatsappUrl) {
    return `
      <a class="button whatsapp small" href="${escapeAttr(whatsappUrl)}" target="_blank" rel="noopener noreferrer" data-open-whatsapp="${escapeAttr(leadId || "")}">
        WhatsApp
      </a>
    `;
  }

  const copyAttr = detail ? "data-detail-copy-message" : `data-copy-message="${escapeAttr(leadId || "")}"`;
  return `
    <button class="button ghost small" type="button" ${copyAttr} ${item.message && leadId ? "" : "disabled"} data-busy-control>
      Copiar mensagem
    </button>
  `;
}

function buildWhatsAppUrl(item = {}) {
  const phone = normalizedWhatsAppPhone(item.phoneNormalized);
  const message = String(item.message ?? "").trim();
  if (!phone || !message) return "";
  return `https://wa.me/${encodeURIComponent(phone)}?text=${encodeURIComponent(message)}`;
}

function normalizedWhatsAppPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits.length >= 12 ? digits : "";
}

async function submitQuickSend(leadId) {
  const parsedLeadId = numberOrNull(leadId);
  const card = findCardByLeadId(parsedLeadId);
  if (!parsedLeadId || !card) return;
  if (card.commercialStage !== "ready_lead_card") {
    showError("Lead mudou de etapa.");
    await refresh({ manual: true, force: true });
    return;
  }

  startRequest();
  try {
    const body = await fetchJson("/api/actions/enviado", {
      method: "POST",
      body: JSON.stringify({
        leadId: parsedLeadId,
        expectedStage: card.commercialStage,
        payload: {},
      }),
    });
    const result = body.result ?? {};

    if (isPaperclipPartialFailure(result)) {
      state.selectedLeadId = parsedLeadId;
      state.paperclipRecoveryOnly = true;
      state.paperclipRecoveryResult = result;
      await loadLeadDetail(parsedLeadId, { manageBusy: false, preserveRecovery: true });
      showError("CRM atualizado. Publicacao Paperclip pendente.");
      return;
    }

    if (!body.ok || result.ok === false) {
      showActionError(result);
      if (result.reason === "lead_stage_changed" || result.nextRefreshRecommended) {
        await refresh({ manual: true, force: true });
      }
      return;
    }

    state.inlineConfirmLeadId = null;
    showToast("Envio manual registrado.");
    await refresh({ manual: true, force: true });
  } catch (error) {
    showError(error.message);
  } finally {
    endRequest();
  }
}

async function submitWahaReconcile(unmatchedId) {
  const parsedUnmatchedId = numberOrNull(unmatchedId);
  const item = findWahaUnmatched(parsedUnmatchedId);
  const draft = wahaDraft(parsedUnmatchedId);
  const leadId = numberOrNull(draft.leadId);
  if (!parsedUnmatchedId || !item || !leadId || !draft.confirmed) {
    showError("Selecione o lead e confirme o vinculo.");
    return;
  }

  startRequest();
  try {
    const body = await fetchJson("/api/waha/unmatched/reconcile", {
      method: "POST",
      body: JSON.stringify({
        unmatchedId: parsedUnmatchedId,
        leadId,
        expectedUpdatedAt: item.updatedAt,
        confirmed: true,
      }),
    });
    const result = body.result ?? {};
    if (!body.ok || result.ok === false) {
      showActionError(result);
      if (result.nextRefreshRecommended) await refresh({ manual: true, force: true });
      return;
    }

    state.wahaReconcileDrafts.delete(parsedUnmatchedId);
    state.wahaNoMatchDrafts.delete(parsedUnmatchedId);
    state.wahaNoMatchOpenId = null;
    showToast(`Conciliado. Eventos acordados: ${formatNumber(result.eventsWoken || 0)}.`);
    await refresh({ manual: true, force: true });
  } catch (error) {
    showError(error.message);
  } finally {
    endRequest();
  }
}

async function submitWahaNoMatch(unmatchedId) {
  const parsedUnmatchedId = numberOrNull(unmatchedId);
  const item = findWahaUnmatched(parsedUnmatchedId);
  const reason = String(state.wahaNoMatchDrafts.get(parsedUnmatchedId) || "").trim();
  if (!parsedUnmatchedId || !item) return;
  if (!reason) {
    showError("Motivo obrigatorio para no-match.");
    return;
  }

  startRequest();
  try {
    const body = await fetchJson("/api/waha/unmatched/no-match", {
      method: "POST",
      body: JSON.stringify({
        unmatchedId: parsedUnmatchedId,
        expectedUpdatedAt: item.updatedAt,
        reason,
      }),
    });
    const result = body.result ?? {};
    if (!body.ok || result.ok === false) {
      showActionError(result);
      if (result.nextRefreshRecommended) await refresh({ manual: true, force: true });
      return;
    }

    state.wahaNoMatchDrafts.delete(parsedUnmatchedId);
    state.wahaReconcileDrafts.delete(parsedUnmatchedId);
    state.wahaNoMatchOpenId = null;
    showToast(`No-match registrado: ${formatNumber(result.marked || 0)} evento(s).`);
    await refresh({ manual: true, force: true });
  } catch (error) {
    showError(error.message);
  } finally {
    endRequest();
  }
}

function selectAction(action) {
  if (!action) {
    state.selectedAction = null;
    const slot = document.getElementById("action-form-slot");
    if (slot) slot.innerHTML = "";
    return;
  }

  if (state.paperclipRecoveryOnly) {
    showError("Publicacao Paperclip pendente.");
    return;
  }
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
  submit.disabled =
    isBusy() || state.modalStale || state.paperclipRecoveryOnly || !confirmed || !validMessage || !validReason;
}

async function submitSelectedAction() {
  if (state.paperclipRecoveryOnly) {
    showError("Publicacao Paperclip pendente.");
    return;
  }

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
      enterPaperclipRecoveryMode(result);
      showError("CRM atualizado. Publicacao Paperclip pendente.");
      return;
    }

    if (!body.ok || result.ok === false) {
      showActionError(result);
      if (result.nextRefreshRecommended) {
        await refresh({ manual: true, force: true });
      }
      return;
    }

    showToast("Acao registrada.");
    state.currentLead = null;
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
      enterPaperclipRecoveryMode({ reason: "paperclip_sync_failed", errors: [runnerMessage(body.result)] });
      showError(runnerMessage(body.result) || "Publicacao Paperclip pendente.");
      return;
    }

    showToast("Paperclip atualizado.");
    state.paperclipRecoveryOnly = false;
    state.paperclipRecoveryResult = null;
    await refresh({ manual: true, force: true });
  } catch (error) {
    enterPaperclipRecoveryMode({ reason: "paperclip_sync_failed", errors: [error.message] });
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
  state.modalOpen = false;
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
  elements.refreshButton.disabled = busy;
  elements.previewButton.disabled = busy;
  for (const button of document.querySelectorAll("[data-busy-control]")) {
    button.disabled = busy;
  }
  for (const button of document.querySelectorAll("[data-action-control]")) {
    button.disabled = busy || state.modalStale || state.paperclipRecoveryOnly;
  }
  for (const button of document.querySelectorAll("[data-waha-reconcile]")) {
    button.disabled = busy || button.dataset.wahaReconcileReady !== "true";
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

function enterPaperclipRecoveryMode(result = {}) {
  state.paperclipRecoveryOnly = true;
  state.paperclipRecoveryResult = result;
  state.selectedAction = null;
  clearActionSurface();
  showPaperclipRecovery(result);
}

function clearActionSurface() {
  const actionList = document.getElementById("action-list-slot");
  const actionForm = document.getElementById("action-form-slot");
  if (actionList) {
    actionList.innerHTML = '<p class="empty-state">CRM atualizado. Resolva Paperclip antes de continuar.</p>';
  }
  if (actionForm) {
    actionForm.innerHTML = "";
  }
  for (const button of document.querySelectorAll("[data-action-control]")) {
    button.disabled = true;
  }
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
  const leadId = numberOrNull(state.selectedLeadId || state.currentLead?.leadId);
  if (!leadId) return;

  const keepRecoveryOnly = state.paperclipRecoveryOnly;
  const recoveryResult = state.paperclipRecoveryResult;
  await loadLeadDetail(leadId, { preserveRecovery: keepRecoveryOnly });
  if (keepRecoveryOnly) {
    enterPaperclipRecoveryMode(recoveryResult ?? {});
  }
  showToast("Lead atualizado.");
}

function startLeadWatch() {
  stopLeadWatch();
  if (!state.selectedLeadId) return;
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
  const leadId = numberOrNull(state.selectedLeadId);
  if (state.modalStale || state.leadWatchBusy || isBusy() || !leadId || !state.modalSnapshot) return;

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

function annotateChangedCards(kanban = {}) {
  const nextSnapshots = new Map();
  const annotated = {};
  for (const [columnKey, cards] of Object.entries(kanban ?? {})) {
    annotated[columnKey] = Array.isArray(cards)
      ? cards.map((card) => annotateChangedCard(card, nextSnapshots))
      : [];
  }
  state.boardSnapshots = nextSnapshots;
  state.boardSnapshotsPrimed = true;
  return annotated;
}

function annotateChangedCard(card = {}, nextSnapshots) {
  const snapshot = boardCardSnapshot(card);
  if (!snapshot) return card;

  nextSnapshots.set(snapshot.key, snapshot);
  const previous = state.boardSnapshots.get(snapshot.key);
  const externallyChanged = state.boardSnapshotsPrimed && previous ? boardCardChanged(previous, snapshot) : false;
  return externallyChanged ? { ...card, externallyChanged: true } : card;
}

function boardCardSnapshot(card = {}) {
  const leadId = numberOrNull(card.leadId);
  if (!leadId) return null;

  return {
    key: String(leadId),
    status: String(card.status ?? ""),
    commercialStage: String(card.commercialStage ?? ""),
    updatedAt: String(card.updatedAt ?? ""),
    availableActions: Array.isArray(card.availableActions) ? [...card.availableActions].sort().join("|") : "",
    cardKind: String(card.cardKind ?? "lead"),
  };
}

function boardCardChanged(previous, next) {
  return (
    previous.status !== next.status ||
    previous.commercialStage !== next.commercialStage ||
    previous.updatedAt !== next.updatedAt ||
    previous.availableActions !== next.availableActions ||
    previous.cardKind !== next.cardKind
  );
}

function getCardsForMode(modeKey) {
  if (modeKey === "waha") {
    return (state.kanban.bloqueados ?? []).filter((card) => card.cardKind === "waha_blocker");
  }
  return Array.isArray(state.kanban[modeKey]) ? state.kanban[modeKey] : [];
}

function getModeCount(modeKey) {
  const base = getCardsForMode(modeKey).length;
  if (modeKey === "waha") return base + Number(state.waha.unmatchedOpen || 0);
  return base;
}

function wahaDraft(unmatchedId) {
  const key = numberOrNull(unmatchedId);
  if (!key) return {};
  if (!state.wahaReconcileDrafts.has(key)) {
    state.wahaReconcileDrafts.set(key, { leadId: null, confirmed: false });
  }
  return state.wahaReconcileDrafts.get(key);
}

function findWahaUnmatched(unmatchedId) {
  const key = numberOrNull(unmatchedId);
  if (!key || !Array.isArray(state.waha.unmatched)) return null;
  return state.waha.unmatched.find((item) => numberOrNull(item.id) === key) || null;
}

function findCardByLeadId(leadId) {
  const parsedLeadId = numberOrNull(leadId);
  if (!parsedLeadId) return null;
  for (const cards of Object.values(state.kanban)) {
    const found = Array.isArray(cards) ? cards.find((card) => numberOrNull(card.leadId) === parsedLeadId) : null;
    if (found) return found;
  }
  return null;
}

function detailItem(label, value) {
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value || "-")}</dd>
    </div>
  `;
}

function inferChannel(card = {}) {
  const contact = String(card.contact ?? "").toLowerCase();
  const instagram = String(card.instagram ?? "").trim();
  const targetChat = String(card.targetChatId ?? "").toLowerCase();
  if (targetChat.includes("@")) return "WAHA";
  if (/whatsapp|\+55|\(\d{2}\)|\d{8,}/i.test(contact)) return "WhatsApp";
  if (instagram || contact.includes("instagram") || contact.includes("/")) return "Instagram";
  if (contact.includes("direct")) return "Direct";
  if (contact) return "Contato";
  return "Canal pendente";
}

function qaLabel(card = {}) {
  const value = card.qaStatus || card.cardStatus || card.bioGateStatus || card.status || "";
  const normalized = String(value).toLowerCase();
  if (!value) return { label: "QA pendente", tone: "neutral" };
  if (/(aprov|ready|ok|sent|novo)/.test(normalized)) return { label: "QA ok", tone: "green" };
  if (/(not_ok|bloque|erro|failed|ambiguous)/.test(normalized)) return { label: "QA alerta", tone: "red" };
  return { label: shortLabel(value, 18), tone: toneForStatus(value) };
}

function riskLabel(card = {}) {
  const blocker = card.validationBlocker || card.dispatchError || card.guardianReason || "";
  if (blocker) return { label: shortLabel(blocker, 22), tone: "amber" };
  if (card.cardKind === "waha_blocker") return { label: "WAHA", tone: "red" };
  if (card.externallyChanged) return { label: "Atualizado", tone: "amber" };
  return { label: "Sem alerta", tone: "neutral" };
}

function rowNote(card = {}) {
  return firstFilled(
    card.validationBlocker,
    card.dispatchError,
    card.guardianReason,
    card.requiredAction,
    card.message ? shortLabel(card.message, 108) : "",
    card.contact,
  );
}

function firstFilled(...values) {
  return values.map((value) => String(value ?? "").trim()).find(Boolean) || "";
}

function shortLabel(value, maxLength) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

async function copyText(text) {
  const value = String(text ?? "");
  if (!value) {
    showError("Nada para copiar.");
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
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

function toneForStatus(status) {
  const normalized = String(status ?? "").toLowerCase();
  if (/(bloque|ambiguous|failed|erro|perdido|descart)/.test(normalized)) return "red";
  if (/(pending|pendente|aguard|qa|validation|validacao|delivery)/.test(normalized)) return "amber";
  if (/(ready|aprov|sent|device|read|lead_quente|interessado|novo)/.test(normalized)) return "green";
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
      confirmation_required: "Confirmacao obrigatoria.",
      invalid_unmatched_id: "Mensagem WAHA invalida.",
      unmatched_not_found: "Mensagem WAHA nao encontrada.",
      unmatched_changed: "Mensagem WAHA mudou desde que voce abriu.",
      invalid_lead_id: "Lead invalido.",
      identity_link_failed: "Falha ao vincular identidade.",
      unmatched_reconcile_failed: "Falha ao conciliar mensagem.",
      wake_failed: "Falha ao acordar agente.",
      no_match_reason_required: "Motivo obrigatorio.",
      no_match_failed: "Falha ao marcar no-match.",
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
