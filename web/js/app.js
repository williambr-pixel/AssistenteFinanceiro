"use strict";

/**
 * Interface do Meu Financeiro.
 *
 * Este arquivo liga os dados reais de Fin.store às telas definidas em
 * index.html. Tudo roda no aparelho; nenhuma informação sai do navegador.
 */
(function () {
  const Fin = window.Fin;
  const core = Fin.core;
  const store = Fin.store;
  const charts = Fin.charts;
  const assistant = Fin.assistant;

  const VIEW_META = {
    dashboard: { title: "Visão geral", sub: "Seu painel financeiro" },
    transactions: { title: "Lançamentos", sub: "Receitas, despesas e recorrências" },
    planning: { title: "Planejamento", sub: "Orçamento, metas e compromissos" },
    reports: { title: "Relatórios", sub: "Análises e exportação" },
    assistant: { title: "Assistente", sub: "Inteligência financeira offline" },
    calendar: { title: "Calendário", sub: "Sua vida financeira dia a dia" },
    tools: { title: "Ferramentas", sub: "Simuladores e calculadoras" },
    settings: { title: "Configurações", sub: "Preferências, segurança e dados" },
    documents: { title: "Documentos", sub: "Arquivos pessoais organizados no aparelho" },
  };
  const VIEWS = Object.keys(VIEW_META);
  const CATEGORY_ICONS = [
    "home", "food", "car", "heart", "book", "bag", "dots", "briefcase",
    "laptop", "trend", "gift", "receipt", "sparkles", "coins", "wallet", "flag",
  ];

  const state = {
    view: "dashboard",
    started: false,
    dashPeriod: "month",
    txFilters: { query: "", type: "", categoryId: "", month: "", payment: "" },
    txLimit: 40,
    report: {
      mode: "month",
      month: core.monthKey(core.todayISO()),
      year: String(new Date().getFullYear()),
      from: core.monthRange(core.monthKey(core.todayISO()))[0],
      to: core.monthRange(core.monthKey(core.todayISO()))[1],
    },
    calendarMonth: core.monthKey(core.todayISO()),
    calendarDay: core.todayISO(),
    chat: [],
    insights: [],
    deferredPrompt: null,
    notificationTimer: null,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  // --------------------------------------------------------------- utilitários

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function nl2br(value) {
    return esc(value).replace(/\n/g, "<br>");
  }

  function icon(name, className = "icon") {
    const safe = String(name || "dots").replace(/[^a-z0-9-]/gi, "");
    return `<svg class="${className}" aria-hidden="true"><use href="#i-${safe}"></use></svg>`;
  }

  function categoryIcon(category, className = "icon") {
    const name = category && CATEGORY_ICONS.includes(category.icon) ? category.icon : "dots";
    return icon(name, className);
  }

  function capitalize(text) {
    const value = String(text || "");
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
  }

  function plural(count, singular, pluralForm) {
    return `${count} ${count === 1 ? singular : pluralForm}`;
  }

  function parseAmount(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    let text = String(value == null ? "" : value).trim();
    if (!text) return NaN;

    text = text
      .replace(/R\$\s?/gi, "")
      .replace(/[\s\u00a0]/g, "")
      .replace(/[€£$]/g, "");
    if (!text || !/^[+\-()\d.,]+$/.test(text)) return NaN;

    const negative = text.startsWith("-") || text.endsWith("-") || /^\(.*\)$/.test(text);
    text = text.replace(/[()]/g, "").replace(/^-/, "").replace(/-$/, "");
    if (!text) return NaN;

    const commas = (text.match(/,/g) || []).length;
    const dots = (text.match(/\./g) || []).length;
    let normalized = text;

    if (commas && dots) {
      // O último separador é o decimal: 1.234,56 ou 1,234.56.
      normalized = text.lastIndexOf(",") > text.lastIndexOf(".")
        ? text.replace(/\./g, "").replace(/,/g, ".")
        : text.replace(/,/g, "");
    } else if (commas) {
      // Vírgula é decimal no padrão brasileiro. Com 3 casas, tratamos como
      // separador de milhar para aceitar valores colados de outros formatos.
      if (commas > 1) {
        normalized = text.replace(/,/g, "");
      } else {
        const [whole, fraction] = text.split(",");
        normalized = fraction.length === 3 && whole.length > 0 && whole.length <= 3 && !/^0+$/.test(whole)
          ? `${whole}${fraction}`
          : `${whole || "0"}.${fraction}`;
      }
    } else if (dots) {
      if (dots > 1) {
        normalized = text.replace(/\./g, "");
      } else {
        const [whole, fraction] = text.split(".");
        normalized = fraction.length === 3 && whole.length > 0 && whole.length <= 3 && !/^0+$/.test(whole)
          ? `${whole}${fraction}`
          : `${whole || "0"}.${fraction}`;
      }
    }

    const number = Number(normalized);
    if (!Number.isFinite(number)) return NaN;
    return negative ? -number : number;
  }

  function moneyInput(value) {
    return Number(value || 0).toFixed(2).replace(".", ",");
  }

  function usableAmount(value) {
    const number = parseAmount(value);
    return Number.isFinite(number) ? core.round(number) : null;
  }

  function percentLabel(ratio) {
    const value = Number(ratio);
    if (!Number.isFinite(value)) return "—";
    return `${(value * 100).toFixed(value >= 0.1 || value === 0 ? 0 : 1).replace(".", ",")}%`;
  }

  function monthShort(key) {
    return new Intl.DateTimeFormat("pt-BR", { month: "short" })
      .format(core.parseISO(`${key}-01`))
      .replace(".", "");
  }

  function monthLong(key) {
    return core.monthLabel(key, "long");
  }

  function todayLabel() {
    return capitalize(core.longDate(core.todayISO()));
  }

  function dayLabel(iso) {
    const today = core.todayISO();
    if (iso === today) return "Hoje";
    if (iso === core.addDaysISO(today, -1)) return "Ontem";
    return capitalize(core.longDate(iso));
  }

  function dateChip(iso) {
    const date = core.parseISO(iso);
    return `<span class="date-chip"><strong>${String(date.getDate()).padStart(2, "0")}</strong><small>${new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "")}</small></span>`;
  }

  function progressBar(ratio, tone = "") {
    const pct = Math.max(0, Math.min(100, (Number(ratio) || 0) * 100));
    return `<div class="progress ${tone}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><span style="width:${pct.toFixed(1)}%"></span></div>`;
  }

  function toneForRatio(ratio) {
    if (ratio >= 1) return "danger";
    if (ratio >= 0.8) return "warning";
    return "";
  }

  function emptyState(iconName, title, text, action = "") {
    return `<div class="empty"><span class="empty-icon">${icon(iconName)}</span><h4>${esc(title)}</h4><p>${esc(text)}</p>${action}</div>`;
  }

  function badge(text, tone = "") {
    return `<span class="badge ${tone}">${esc(text)}</span>`;
  }

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function fileName(prefix, extension) {
    return `${prefix}-${core.todayISO().replace(/-/g, "")}.${extension}`;
  }

  // ------------------------------------------------------------------ elementos

  const el = {
    boot: $("#boot"),
    app: $("#app"),
    lock: $("#lock-screen"),
    lockForm: $("#lock-form"),
    lockPin: $("#lock-pin"),
    lockError: $("#lock-error"),
    sidebar: $("#sidebar"),
    sidebarBackdrop: $("#sidebar-backdrop"),
    pageTitle: $("#page-title"),
    pageSubtitle: $("#page-subtitle"),
    mainContent: $("#main-content"),
    dashDate: $("#dash-date"),
    dashGreeting: $("#dash-greeting"),
    dashSub: $("#dash-sub"),
    dashPeriod: $("#dash-period"),
    dashAlerts: $("#dash-alerts"),
    kpiBalance: $("#kpi-balance"),
    kpiBalanceMeta: $("#kpi-balance-meta"),
    kpiIncome: $("#kpi-income"),
    kpiIncomeMeta: $("#kpi-income-meta"),
    kpiExpense: $("#kpi-expense"),
    kpiExpenseMeta: $("#kpi-expense-meta"),
    kpiResult: $("#kpi-result"),
    kpiResultMeta: $("#kpi-result-meta"),
    chartBalance: $("#chart-balance"),
    chartBalancePill: $("#chart-balance-pill"),
    chartMonthly: $("#chart-monthly"),
    monthlyLegend: $("#monthly-legend"),
    dashBudget: $("#dash-budget"),
    dashBills: $("#dash-bills"),
    dashGoals: $("#dash-goals"),
    dashRecent: $("#dash-recent"),
    txSearch: $("#tx-search"),
    txType: $("#tx-type"),
    txCategory: $("#tx-category"),
    txMonth: $("#tx-month"),
    txPayment: $("#tx-payment"),
    txClear: $("#tx-clear"),
    txSummary: $("#tx-summary"),
    txList: $("#tx-list"),
    txMore: $("#tx-more"),
    planningBudget: $("#planning-budget"),
    budgetCaption: $("#budget-caption"),
    goalsList: $("#goals-list"),
    billsList: $("#bills-list"),
    debtsList: $("#debts-list"),
    subsList: $("#subs-list"),
    recsList: $("#recs-list"),
    reportMode: $("#report-mode"),
    reportMonthField: $("#report-month-field"),
    reportMonth: $("#report-month"),
    reportYearField: $("#report-year-field"),
    reportYear: $("#report-year"),
    reportFromField: $("#report-from-field"),
    reportFrom: $("#report-from"),
    reportToField: $("#report-to-field"),
    reportTo: $("#report-to"),
    reportSummary: $("#report-summary"),
    reportDonut: $("#report-donut"),
    reportLegend: $("#report-legend"),
    reportTop: $("#report-top"),
    reportBars: $("#report-bars"),
    reportBalance: $("#report-balance"),
    insightsList: $("#insights-list"),
    chatLog: $("#chat-log"),
    chatChips: $("#chat-chips"),
    chatForm: $("#chat-form"),
    chatInput: $("#chat-input"),
    calTitle: $("#cal-title"),
    calGrid: $("#cal-grid"),
    calDayTitle: $("#cal-day-title"),
    calDaySub: $("#cal-day-sub"),
    calDay: $("#cal-day"),
    interestResult: $("#interest-result"),
    goalsimResult: $("#goalsim-result"),
    installmentResult: $("#installment-result"),
    settingsName: $("#settings-name"),
    themeChoices: $("#theme-choices"),
    accentChoices: $("#accent-choices"),
    notifStatus: $("#notif-status"),
    pinStatus: $("#pin-status"),
    categoriesList: $("#categories-list"),
    storageInfo: $("#storage-info"),
    btnNotif: $("#btn-notif"),
    btnPin: $("#btn-pin"),
    btnInstall: $("#btn-install"),
    importJson: $("#import-json-input"),
    importCsv: $("#import-csv-input"),
    modal: $("#modal"),
    modalForm: $("#modal-form"),
    modalTitle: $("#modal-title"),
    modalSubtitle: $("#modal-subtitle"),
    modalBody: $("#modal-body"),
    modalSubmit: $("#modal-submit"),
    welcomeDialog: $("#welcome-dialog"),
    welcomeForm: $("#welcome-form"),
    welcomeName: $("#welcome-name"),
    welcomeError: $("#welcome-error"),
    welcomeSkip: $("#welcome-skip"),
    confirmDialog: $("#confirm-dialog"),
    confirmTitle: $("#confirm-title"),
    confirmText: $("#confirm-text"),
    confirmOk: $("#confirm-ok"),
    confirmCancel: $("#confirm-cancel"),
    searchOverlay: $("#search-overlay"),
    searchInput: $("#search-input"),
    searchResults: $("#search-results"),
    toasts: $("#toasts"),
    printArea: $("#print-area"),
    themeToggle: $("#theme-toggle"),
    newTransaction: $("#new-transaction"),
    mobileAdd: $("#mobile-add"),
    mobileMenu: $("#mobile-menu"),
  };

  // --------------------------------------------------------------- inicialização

  function init() {
    applyAppearance();
    bindStaticEvents();

    const locked = Boolean(store.state.settings.pinHash);
    if (locked) {
      el.lock.hidden = false;
      el.app.hidden = true;
      setTimeout(() => el.lockPin.focus(), 500);
    } else {
      begin();
    }

    store.subscribe(onStoreChange);
    hideBoot();

    if (store.loadError) {
      setTimeout(() => toast(store.loadError, "danger", 12000), 1200);
    }

    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.deferredPrompt = event;
      if (el.btnInstall) el.btnInstall.hidden = false;
    });

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (store.state.settings.theme === "system") applyAppearance();
    };
    if (typeof media.addEventListener === "function") media.addEventListener("change", onChange);

    if ("serviceWorker" in navigator && window.isSecureContext) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" }).catch((error) => {
          console.warn("Service worker não registrado:", error);
        });
      });
    }
  }

  function begin() {
    if (state.started) return;
    state.started = true;
    el.lock.hidden = true;
    el.app.hidden = false;
    const generated = runRecurrenceEngine();
    route();
    if (generated > 0) {
      setTimeout(() => toast(`${plural(generated, "lançamento recorrente gerado", "lançamentos recorrentes gerados")}.`, "info", 5000), 900);
    }
    setTimeout(() => deliverNotifications(), 2500);
    // A apresentação inicial não deve bloquear os controles do aplicativo.
    // O nome pode ser preenchido depois em Configurações, sem interromper lançamentos.
    state.notificationTimer = window.setInterval(deliverNotifications, 30 * 60 * 1000);
  }

  function hideBoot() {
    if (!el.boot) return;
    setTimeout(() => {
      el.boot.classList.add("done");
      setTimeout(() => { el.boot.hidden = true; }, 600);
    }, 420);
  }

  function maybeShowWelcome() {
    if (!state.started || !el.welcomeDialog || el.welcomeDialog.open) return;
    if (el.modal.open || el.confirmDialog.open) {
      window.setTimeout(maybeShowWelcome, 1200);
      return;
    }
    const settings = store.state.settings;
    if (settings.onboardingDone) return;
    if (String(settings.name || "").trim()) return;
    el.welcomeName.value = "";
    el.welcomeError.textContent = "";
    el.welcomeError.hidden = true;
    el.welcomeForm.classList.remove("shake");
    el.welcomeDialog.showModal();
    window.setTimeout(() => el.welcomeName.focus(), 90);
  }

  function submitWelcome(event) {
    event.preventDefault();
    const name = String(el.welcomeName.value || "").trim().replace(/\s+/g, " ").slice(0, 40);
    if (!name) {
      el.welcomeError.textContent = "Digite seu nome para começar ou toque em “Preencher depois”.";
      el.welcomeError.hidden = false;
      el.welcomeName.focus();
      el.welcomeForm.classList.add("shake");
      window.setTimeout(() => el.welcomeForm.classList.remove("shake"), 450);
      return;
    }
    el.welcomeError.hidden = true;
    store.updateSettings({ name, onboardingDone: true });
    el.welcomeDialog.close();
    toast(`Tudo pronto, ${name.split(" ")[0]}!`, "success");
  }

  function skipWelcome() {
    store.updateSettings({ onboardingDone: true });
    el.welcomeDialog.close();
    toast("Você pode informar seu nome depois em Configurações.", "info", 4500);
  }

  function onStoreChange() {
    if (!state.started) return;
    applyAppearance();
    renderActiveView();
  }

  function applyAppearance() {
    const setting = store.state.settings.theme || "system";
    const resolved = setting === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : setting;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.accent = store.state.settings.accent || "emerald";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = resolved === "dark" ? "#07111d" : "#0b1f33";
    const use = el.themeToggle ? $("use", el.themeToggle) : null;
    if (use) use.setAttribute("href", resolved === "dark" ? "#i-sun" : "#i-moon");
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    store.updateSettings({ theme: current === "dark" ? "light" : "dark" });
    toast(current === "dark" ? "Tema claro ativado." : "Tema escuro ativado.", "info", 2400);
  }

  // ------------------------------------------------------------------- rotas

  function currentHashView() {
    const raw = location.hash.replace(/^#\/?/, "").split("?")[0];
    return VIEWS.includes(raw) ? raw : "dashboard";
  }

  function route() {
    const view = currentHashView();
    state.view = view;
    if (!location.hash) history.replaceState(null, "", `#/${view}`);
    $$(".view").forEach((section) => {
      section.hidden = section.dataset.view !== view;
    });
    syncNavigation();
    renderActiveView();
    closeSidebar();
  }

  function navigate(view) {
    if (!VIEWS.includes(view)) view = "dashboard";
    if (state.view === view && location.hash === `#/${view}`) {
      renderActiveView();
    } else {
      location.hash = `#/${view}`;
    }
    closeSidebar();
  }

  function syncNavigation() {
    $$(".nav-link[data-view], .mobile-link[data-view]").forEach((button) => {
      const active = button.dataset.view === state.view;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    const meta = VIEW_META[state.view] || VIEW_META.dashboard;
    el.pageTitle.textContent = meta.title;
    el.pageSubtitle.textContent = meta.sub;
  }

  function renderActiveView() {
    switch (state.view) {
      case "dashboard": renderDashboard(); break;
      case "transactions": renderTransactions(); break;
      case "planning": renderPlanning(); break;
      case "reports": renderReports(); break;
      case "assistant": renderAssistant(); break;
      case "calendar": renderCalendar(); break;
      case "tools": break;
      case "documents": if (window.FinDocuments) window.FinDocuments.render(); break;
      case "settings": renderSettings(); break;
      default: renderDashboard();
    }
  }

  // -------------------------------------------------------------- menu lateral

  function openSidebar() {
    el.sidebar.classList.add("open");
    el.sidebarBackdrop.hidden = false;
    document.body.classList.add("sidebar-open");
  }

  function closeSidebar() {
    el.sidebar.classList.remove("open");
    el.sidebarBackdrop.hidden = true;
    document.body.classList.remove("sidebar-open");
  }

  // ------------------------------------------------------------------- toasts

  function toast(message, tone = "info", duration = 4200) {
    if (!el.toasts || !message) return;
    const item = document.createElement("div");
    item.className = `toast ${tone}`;
    const iconName = tone === "success" ? "check" : tone === "danger" ? "alert" : tone === "warning" ? "alert" : "info";
    item.innerHTML = `<span class="toast-icon">${icon(iconName)}</span><span>${esc(message)}</span>`;
    el.toasts.appendChild(item);
    requestAnimationFrame(() => item.classList.add("show"));
    setTimeout(() => {
      item.classList.remove("show");
      setTimeout(() => item.remove(), 320);
    }, duration);
  }

  // ------------------------------------------------------------------ modais

  let currentModal = null;

  function openModal({ title, subtitle = "", body, submit = "Salvar", onSubmit, wide = false }) {
    if (!el.modal || !el.modalForm || !el.modalBody || !el.modalSubmit) {
      throw new Error("A janela de lançamento não está disponível nesta tela.");
    }
    currentModal = { onSubmit };
    // Cada abertura começa com o comportamento padrão do formulário.
    el.modalSubmit.onclick = null;
    el.modalSubmit.type = "submit";
    el.modalTitle.textContent = title;
    el.modalSubtitle.textContent = subtitle;
    el.modalBody.innerHTML = `<p class="form-error" id="modal-error" role="alert" hidden></p>${body}`;
    el.modalSubmit.textContent = submit;
    // Toda nova etapa/modal precisa reabilitar o botão, inclusive quando
    // a revisão por voz substitui o formulário durante uma submissão.
    el.modalSubmit.disabled = false;
    el.modalSubmit.hidden = false;
    el.modal.classList.toggle("wide", Boolean(wide));
    if (!el.modal.open) {
      try {
        el.modal.showModal();
      } catch (error) {
        // Alternativa para navegadores com suporte incompleto ao elemento dialog.
        el.modal.setAttribute("open", "");
      }
    }
    const first = el.modalBody.querySelector("input:not([type=hidden]):not([disabled]):not([data-no-focus]), select:not([data-no-focus]), textarea:not([data-no-focus])");
    if (first) setTimeout(() => first.focus(), 40);
  }

  function closeModal() {
    // Fechar o formulário é independente do recurso de voz.
    if (el.modal.open) el.modal.close();
    currentModal = null;
  }

  function showModalError(message) {
    const box = $("#modal-error", el.modalBody);
    if (!box) { toast(message, "danger"); return; }
    box.textContent = message;
    box.hidden = false;
    box.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  async function submitModal(event) {
    event.preventDefault();
    if (!currentModal || el.modalSubmit.disabled) return;
    // Guarde a etapa atual: o fluxo por voz pode abrir outro formulário
    // enquanto esta submissão ainda está terminando.
    const submittingModal = currentModal;
    const error = $("#modal-error", el.modalBody);
    if (error) error.hidden = true;
    el.modalSubmit.disabled = true;
    const originalLabel = el.modalSubmit.textContent;
    el.modalSubmit.textContent = "Salvando...";
    try {
      const data = new FormData(el.modalForm);
      const result = await submittingModal.onSubmit(data);
      // A etapa de voz retorna false depois de abrir a tela de revisão.
      // Não feche nem altere a nova tela.
      if (currentModal !== submittingModal || result === false) return;
      closeModal();
      if (typeof result === "string" && result) toast(result, "success");
    } catch (err) {
      if (currentModal === submittingModal) {
        showModalError(err && err.message ? err.message : "Não foi possível salvar. Confira os campos e tente novamente.");
      } else {
        toast(err && err.message ? err.message : "Não foi possível continuar. Tente novamente.", "danger");
      }
    } finally {
      // A primeira etapa não pode reativar nem renomear o botão da segunda.
      if (currentModal === submittingModal) {
        el.modalSubmit.disabled = false;
        el.modalSubmit.textContent = originalLabel;
      }
    }
  }

  let confirmResolver = null;

  function confirmDialog({ title, text, ok = "Excluir", cancel = "Cancelar", danger = true }) {
    el.confirmTitle.textContent = title;
    el.confirmText.textContent = text;
    el.confirmOk.textContent = ok;
    el.confirmCancel.textContent = cancel;
    el.confirmOk.className = `btn ${danger ? "danger" : "primary"}`;
    if (!el.confirmDialog.open) el.confirmDialog.showModal();
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  function settleConfirm(value) {
    if (el.confirmDialog.open) el.confirmDialog.close();
    if (confirmResolver) {
      const resolve = confirmResolver;
      confirmResolver = null;
      resolve(value);
    }
  }

  // --------------------------------------------------------------------- PIN

  function fallbackHash(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fallback:${(hash >>> 0).toString(16)}`;
  }

  async function hashPin(pin) {
    const text = `meu-financeiro::${pin}`;
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      try {
        const buffer = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
        const bytes = Array.from(new Uint8Array(buffer));
        return `sha256:${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
      } catch (error) {
        console.warn("SHA-256 indisponível, usando proteção local simplificada.", error);
      }
    }
    return fallbackHash(text);
  }

  async function pinMatches(pin, savedHash) {
    const normalizedPin = String(pin || "").trim();
    if (!savedHash || !/^\d{4,6}$/.test(normalizedPin)) return false;

    // Aceita o formato SHA-256 atual e o hash simplificado de versões
    // anteriores, evitando rejeitar PINs após mudanças de ambiente/navegador.
    const currentHash = await hashPin(normalizedPin);
    if (currentHash === savedHash) return true;

    const compatibleFallback = fallbackHash(`meu-financeiro::${normalizedPin}`);
    return compatibleFallback === savedHash;
  }

  async function unlock(event) {
    event.preventDefault();
    const typed = String(el.lockPin.value || "").trim();
    if (!typed) return;
    const matches = await pinMatches(typed, store.state.settings.pinHash);
    if (matches) {
      el.lockError.textContent = "";
      el.lockPin.value = "";
      begin();
      el.lock.hidden = true;
    } else {
      el.lockError.textContent = "PIN incorreto. Tente novamente.";
      el.lockPin.value = "";
      el.lockPin.focus();
      el.lockForm.classList.add("shake");
      setTimeout(() => el.lockForm.classList.remove("shake"), 450);
    }
  }

  // ------------------------------------------------------------- eventos fixos

  function bindStaticEvents() {
    // Registre os botões principais primeiro para preservar o acesso ao lançamento manual.
    el.newTransaction.addEventListener("click", (event) => {
      event.preventDefault();
      openTransactionModal();
    });
    el.mobileAdd.addEventListener("click", (event) => {
      event.preventDefault();
      openTransactionModal();
    });

    window.addEventListener("hashchange", route);
    el.lockForm.addEventListener("submit", unlock);
    el.welcomeForm.addEventListener("submit", submitWelcome);
    el.welcomeSkip.addEventListener("click", skipWelcome);
    el.welcomeDialog.addEventListener("close", () => {
      el.welcomeError.hidden = true;
      el.welcomeError.textContent = "";
    });
    el.modalForm.addEventListener("submit", submitModal);
    el.modal.addEventListener("close", () => {
      // O evento "close" pode chegar depois que o fluxo por voz já reabriu
      // o mesmo dialog para a tela de revisão. Só limpe se ele continuar fechado.
      if (!el.modal.open) currentModal = null;
    });
    // Mesmo quando um formulário apresenta erro, o usuário sempre pode sair.
    el.modal.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeModal();
    });
    el.modal.addEventListener("click", (event) => {
      // Clique fora do cartão (na área escura) fecha a janela sem salvar.
      if (event.target === el.modal) closeModal();
    });
    $("#modal-close").addEventListener("click", closeModal);
    $("#modal-cancel").addEventListener("click", closeModal);
    el.confirmOk.addEventListener("click", () => settleConfirm(true));
    el.confirmCancel.addEventListener("click", () => settleConfirm(false));
    el.confirmDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      settleConfirm(false);
    });
    el.confirmDialog.addEventListener("click", (event) => {
      if (event.target === el.confirmDialog) settleConfirm(false);
    });

    $("#menu-toggle").addEventListener("click", openSidebar);
    el.mobileMenu.addEventListener("click", openSidebar);
    $("#sidebar-close").addEventListener("click", closeSidebar);
    el.sidebarBackdrop.addEventListener("click", closeSidebar);
    el.themeToggle.addEventListener("click", toggleTheme);
    $("#search-trigger").addEventListener("click", openSearch);
    $("#search-close").addEventListener("click", closeSearch);
    el.searchOverlay.addEventListener("click", (event) => {
      if (event.target === el.searchOverlay) closeSearch();
    });
    el.searchInput.addEventListener("input", () => renderSearchResults(el.searchInput.value));
    el.searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        const first = $(".search-result", el.searchResults);
        if (first) { event.preventDefault(); first.click(); }
      }
    });

    el.txClear.addEventListener("click", clearTransactionFilters);
    el.txMore.addEventListener("click", () => { state.txLimit += 40; renderTransactionsList(); });

    el.txSearch.addEventListener("input", () => {
      state.txFilters.query = el.txSearch.value;
      state.txLimit = 40;
      renderTransactionsList();
    });
    [el.txType, el.txCategory, el.txMonth, el.txPayment].forEach((select) => {
      select.addEventListener("change", () => {
        state.txFilters.type = el.txType.value;
        state.txFilters.categoryId = el.txCategory.value;
        state.txFilters.month = el.txMonth.value;
        state.txFilters.payment = el.txPayment.value;
        state.txLimit = 40;
        renderTransactionsList();
      });
    });

    $("#btn-edit-budget").addEventListener("click", () => openBudgetModal());
    $("#btn-copy-budget").addEventListener("click", copyPreviousBudget);
    $("#btn-new-goal").addEventListener("click", () => openGoalModal());
    $("#btn-new-bill").addEventListener("click", () => openBillModal());
    $("#btn-new-debt").addEventListener("click", () => openDebtModal());
    $("#btn-new-sub").addEventListener("click", () => openSubscriptionModal());
    $("#btn-new-rec").addEventListener("click", () => openRecurrenceModal());
    $("#btn-new-category").addEventListener("click", () => openCategoryModal());

    $("#btn-export-csv").addEventListener("click", exportReportCSV);
    $("#btn-export-pdf").addEventListener("click", printReport);
    el.reportMode.addEventListener("change", () => {
      state.report.mode = el.reportMode.value;
      syncReportFieldVisibility();
      renderReportResults();
    });
    [el.reportMonth, el.reportYear, el.reportFrom, el.reportTo].forEach((input) => {
      input.addEventListener("change", () => {
        state.report.month = el.reportMonth.value || state.report.month;
        state.report.year = el.reportYear.value || state.report.year;
        state.report.from = el.reportFrom.value || state.report.from;
        state.report.to = el.reportTo.value || state.report.to;
        if (state.report.from && state.report.to && state.report.from > state.report.to) {
          const temp = state.report.from;
          state.report.from = state.report.to;
          state.report.to = temp;
          el.reportFrom.value = state.report.from;
          el.reportTo.value = state.report.to;
          toast("As datas foram ajustadas para manter o intervalo válido.", "info", 3000);
        }
        renderReportResults();
      });
    });

    $("#cal-prev").addEventListener("click", () => moveCalendar(-1));
    $("#cal-next").addEventListener("click", () => moveCalendar(1));

    $("#form-interest").addEventListener("submit", calculateInterest);
    $("#form-goal-sim").addEventListener("submit", calculateGoalSimulation);
    $("#form-installment").addEventListener("submit", calculateInstallment);

    $("#form-profile").addEventListener("submit", saveProfile);
    el.btnNotif.addEventListener("click", enableNotifications);
    $("#btn-notif-test").addEventListener("click", testNotification);
    el.btnPin.addEventListener("click", openPinModal);
    $("#btn-export-json").addEventListener("click", exportBackup);
    $("#btn-import-json").addEventListener("click", () => el.importJson.click());
    $("#btn-export-csv-all").addEventListener("click", exportAllCSV);
    $("#btn-import-csv").addEventListener("click", openCsvHelp);
    el.btnInstall.addEventListener("click", installApp);
    $("#btn-reset").addEventListener("click", resetData);
    el.importJson.addEventListener("change", importBackupFile);
    el.importCsv.addEventListener("change", importCsvFile);

    el.chatForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const question = el.chatInput.value.trim();
      if (!question) return;
      el.chatInput.value = "";
      sendQuestion(question);
    });

    el.modalBody.addEventListener("click", (event) => {
      const typeButton = event.target.closest("[data-type-choice]");
      if (typeButton) {
        const tabs = typeButton.closest("[data-type-tabs]");
        if (!tabs) return;
        const field = tabs.dataset.field || "type";
        const hidden = el.modalForm.elements[field];
        if (hidden) hidden.value = typeButton.dataset.typeChoice;
        $$("[data-type-choice]", tabs).forEach((button) => button.classList.toggle("active", button === typeButton));
        const select = el.modalForm.elements.categoryId;
        if (select) {
          const options = categoryOptions(typeButton.dataset.typeChoice, "");
          select.innerHTML = options;
        }
      }
    });

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleKeydown);
  }

  function handleDocumentClick(event) {
    const target = event.target;

    if (target.closest("#menu-toggle") || target.closest("#mobile-menu")) {
      openSidebar();
      return;
    }
    if (target.closest("#sidebar-close") || target.closest("#sidebar-backdrop")) {
      closeSidebar();
      return;
    }

    const viewButton = target.closest("button[data-view], a[data-view]");
    if (viewButton) {
      event.preventDefault();
      navigate(viewButton.dataset.view);
      if (!el.searchOverlay.hidden) closeSearch();
      return;
    }

    const actionButton = target.closest("[data-action]");
    if (actionButton) {
      event.preventDefault();
      runAction(actionButton.dataset.action, actionButton);
      return;
    }

    const periodButton = target.closest("#dash-period [data-period]");
    if (periodButton) {
      state.dashPeriod = periodButton.dataset.period;
      renderDashboard();
      return;
    }

    const themeButton = target.closest("[data-theme-choice]");
    if (themeButton) {
      store.updateSettings({ theme: themeButton.dataset.themeChoice });
      return;
    }

    const accentButton = target.closest("[data-accent-choice]");
    if (accentButton) {
      store.updateSettings({ accent: accentButton.dataset.accentChoice });
      toast("Cor de destaque atualizada.", "success", 2200);
      return;
    }

    const dayButton = target.closest("[data-cal-day]");
    if (dayButton) {
      state.calendarDay = dayButton.dataset.calDay;
      renderCalendar();
      return;
    }

    const questionButton = target.closest("[data-question]");
    if (questionButton) {
      const question = questionButton.dataset.question;
      if (assistant.normalize(question) === "adicionar lancamento") openTransactionModal();
      else sendQuestion(question);
      return;
    }

    const insightButton = target.closest("[data-insight-index]");
    if (insightButton) {
      const action = state.insights[Number(insightButton.dataset.insightIndex)];
      if (action && action.action) runInsightAction(action.action);
      return;
    }

    const searchResult = target.closest("[data-search-kind]");
    if (searchResult) {
      openSearchResult(searchResult);
      return;
    }
  }

  function handleKeydown(event) {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openSearch();
      return;
    }
    if (event.key === "/" && !typing && el.searchOverlay.hidden) {
      event.preventDefault();
      openSearch();
      return;
    }
    if (event.key === "Escape") {
      // Escape sempre libera a interface, fechando primeiro a camada superior.
      if (el.modal.open) {
        event.preventDefault();
        closeModal();
        return;
      }
      if (el.confirmDialog.open) {
        event.preventDefault();
        settleConfirm(false);
        return;
      }
      if (el.welcomeDialog.open) {
        event.preventDefault();
        el.welcomeDialog.close();
        return;
      }
      if (!el.searchOverlay.hidden) closeSearch();
      if (el.sidebar.classList.contains("open")) closeSidebar();
    }
  }

  function runAction(action, button) {
    const id = button.dataset.id;
    switch (action) {
      case "new-transaction": openTransactionModal(null, button.dataset.date || undefined); break;
      case "voice": openVoiceModal(); break;
      case "clear-tx-filters": clearTransactionFilters(); break;
      case "edit-transaction": openTransactionModal(findTransaction(id)); break;
      case "delete-transaction": deleteTransaction(id); break;
      case "edit-budget": openBudgetModal(); break;
      case "copy-budget": copyPreviousBudget(); break;
      case "new-goal": openGoalModal(); break;
      case "edit-goal": openGoalModal(store.state.goals.find((goal) => goal.id === id)); break;
      case "delete-goal": deleteGoal(id); break;
      case "contribute-goal": openContributionModal(id); break;
      case "new-bill": openBillModal(); break;
      case "edit-bill": openBillModal(store.state.bills.find((bill) => bill.id === id)); break;
      case "delete-bill": deleteBill(id); break;
      case "pay-bill": payBill(id); break;
      case "unpay-bill": unpayBill(id); break;
      case "new-debt": openDebtModal(); break;
      case "edit-debt": openDebtModal(store.state.debts.find((debt) => debt.id === id)); break;
      case "delete-debt": deleteDebt(id); break;
      case "pay-installment": payInstallment(id); break;
      case "new-sub": openSubscriptionModal(); break;
      case "edit-sub": openSubscriptionModal(store.state.subscriptions.find((sub) => sub.id === id)); break;
      case "delete-sub": deleteSubscription(id); break;
      case "charge-sub": chargeSubscription(id); break;
      case "toggle-sub": toggleSubscription(id); break;
      case "new-rec": openRecurrenceModal(); break;
      case "edit-rec": openRecurrenceModal(store.state.recurrences.find((rec) => rec.id === id)); break;
      case "delete-rec": deleteRecurrence(id); break;
      case "toggle-rec": toggleRecurrence(id); break;
      case "edit-category": openCategoryModal(store.state.categories.find((category) => category.id === id)); break;
      case "delete-category": deleteCategory(id); break;
      case "remove-pin": removePin(); break;
      default: break;
    }
  }
  // --------------------------------------------------------------------- voz

  const VOICE_NUMBERS = {
    zero: 0,
    um: 1,
    uma: 1,
    dois: 2,
    duas: 2,
    tres: 3,
    quatro: 4,
    cinco: 5,
    seis: 6,
    sete: 7,
    oito: 8,
    nove: 9,
    dez: 10,
    onze: 11,
    doze: 12,
    treze: 13,
    quatorze: 14,
    catorze: 14,
    quinze: 15,
    dezesseis: 16,
    dezessete: 17,
    dezoito: 18,
    dezenove: 19,
    vinte: 20,
    trinta: 30,
    quarenta: 40,
    cinquenta: 50,
    sessenta: 60,
    setenta: 70,
    oitenta: 80,
    noventa: 90,
    cem: 100,
    cento: 100,
    duzentos: 200,
    duzentas: 200,
    trezentos: 300,
    trezentas: 300,
    quatrocentos: 400,
    quatrocentas: 400,
    quinhentos: 500,
    quinhentas: 500,
    seiscentos: 600,
    seiscentas: 600,
    setecentos: 700,
    setecentas: 700,
    oitocentos: 800,
    oitocentas: 800,
    novecentos: 900,
    novecentas: 900,
  };
  const VOICE_MULTIPLIERS = {
    mil: 1000,
    milhao: 1000000,
    milhoes: 1000000,
    bilhao: 1000000000,
    bilhoes: 1000000000,
  };
  const VOICE_CURRENCIES = new Set(["reais", "real", "contos", "conto", "pilas", "pila"]);
  const VOICE_CENTS = new Set(["centavo", "centavos"]);
  const VOICE_QUANTITIES = new Set([
    "parcela", "parcelas", "vez", "vezes", "mes", "meses", "dia", "dias",
    "ano", "anos", "unidade", "unidades", "pessoa", "pessoas", "camiseta",
    "camisetas", "camisa", "camisas", "quilo", "quilos", "litro", "litros",
  ]);
  const VOICE_WEEKDAYS = {
    domingo: 0,
    segunda: 1,
    terca: 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sabado: 6,
  };
  const VOICE_COMMANDS = new Set([
    "gastei", "gastar", "gasto", "paguei", "pagar", "pagamento", "comprei",
    "comprar", "compra", "recebi", "receber", "ganhei", "ganhar", "entrou",
    "entrada", "anota", "anotar", "registra", "registrar", "lanca", "lancar",
    "adiciona", "adicionar", "cria", "criar", "favor", "ai", "me", "foi",
    "venceu", "vence", "vencimento", "vencido", "vencida",
  ]);
  const VOICE_EXPENSE_GROUPS = [
    { id: "shopping", names: ["compras", "shopping"], words: ["mercado livre", "roupa", "roupas", "sapato", "sapatos", "tenis", "camisa", "camiseta", "calca", "loja", "eletronico", "notebook", "tv", "movel", "amazon", "shopee", "magalu", "presente"] },
    { id: "housing", names: ["moradia", "casa"], words: ["aluguel", "condominio", "luz", "energia", "agua", "gas", "internet", "moradia", "iptu", "faxina", "diarista", "reforma"] },
    { id: "bills", names: ["contas", "conta"], words: ["conta de celular", "conta de telefone", "telefone", "fatura", "imposto", "taxa", "seguro", "boleto", "conta", "contas"] },
    { id: "food", names: ["alimentacao", "comida"], words: ["mercado", "supermercado", "padaria", "restaurante", "almoco", "jantar", "lanche", "cafe", "pizza", "hamburguer", "ifood", "rappi", "delivery", "feira", "acougue", "sorvete", "doce", "comida", "marmita"] },
    { id: "transport", names: ["transporte"], words: ["uber", "taxi", "onibus", "metro", "trem", "combustivel", "gasolina", "etanol", "diesel", "posto", "estacionamento", "pedagio", "mecanico", "pneu", "passagem", "bilhete"] },
    { id: "health", names: ["saude"], words: ["farmacia", "remedio", "medico", "dentista", "consulta", "exame", "hospital", "plano de saude", "academia", "terapia", "psicologo", "fisioterapia"] },
    { id: "education", names: ["educacao", "estudo"], words: ["curso", "escola", "faculdade", "universidade", "livro", "material escolar", "mensalidade", "aula", "idiomas", "alura", "udemy"] },
    { id: "leisure", names: ["lazer", "diversao"], words: ["cinema", "netflix", "spotify", "disney", "hbo", "prime video", "jogo", "viagem", "show", "teatro", "bar", "cerveja", "streaming", "parque", "museu", "assinatura"] },
    { id: "shopping", names: ["compras", "shopping"], words: ["compra", "compras", "celular", "video game", "videogame", "calcado", "calcados"] },
    { id: "pets", names: ["pets", "pet", "animais", "bichos"], words: ["pet", "pets", "racao", "veterinario", "veterinaria", "banho e tosa", "tosa", "animal", "animais"] },
  ];
  const VOICE_INCOME_GROUPS = [
    { id: "salary", names: ["salario"], words: ["salario", "holerite", "contracheque", "ordenado", "pagamento do salario", "provento"] },
    { id: "freelance", names: ["freelance"], words: ["freelance", "freela", "freelancer", "consultoria", "projeto", "cliente", "servico prestado"] },
    { id: "investments", names: ["investimentos"], words: ["rendimento", "dividendo", "juros", "investimento", "poupanca", "tesouro", "acao", "acoes", "fundo", "cdb", "fii", "cripto", "bitcoin"] },
    { id: "gifts", names: ["presentes"], words: ["presente", "doacao", "mesada", "heranca", "ajuda"] },
    { id: "other-income", names: ["outras receitas"], words: ["reembolso", "restituicao", "estorno", "venda", "devolucao", "bonus"] },
  ];

  function normalizeVoiceToken(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  }

  function tokenizeVoice(text) {
    const cleaned = String(text || "")
      .replace(/R\$\s?/gi, "")
      .replace(/[€£$]/g, "")
      .replace(/[–—]/g, " ")
      .replace(/-/g, " ");
    return cleaned
      .split(/\s+/)
      .map((original, index) => ({ original, index, norm: normalizeVoiceToken(original) }))
      .filter((token) => token.norm);
  }

  function parseVoiceNumberWords(tokens, start) {
    let total = 0;
    let current = 0;
    let index = start;
    let consumed = false;

    while (index < tokens.length) {
      const token = tokens[index].norm;
      if (token === "e") {
        const next = tokens[index + 1] ? tokens[index + 1].norm : "";
        if (VOICE_NUMBERS[next] !== undefined || VOICE_MULTIPLIERS[next]) {
          index += 1;
          continue;
        }
        break;
      }
      if (VOICE_MULTIPLIERS[token]) {
        current = (current || 1) * VOICE_MULTIPLIERS[token];
        total += current;
        current = 0;
        consumed = true;
        index += 1;
        continue;
      }
      if (VOICE_NUMBERS[token] !== undefined) {
        current += VOICE_NUMBERS[token];
        consumed = true;
        index += 1;
        continue;
      }
      break;
    }

    return consumed ? { value: total + current, end: index } : null;
  }

  function voiceRange(start, end) {
    const set = new Set();
    for (let index = start; index < end; index += 1) set.add(index);
    return set;
  }

  function voiceSequenceAt(tokens, index, words) {
    for (let offset = 0; offset < words.length; offset += 1) {
      if (!tokens[index + offset] || tokens[index + offset].norm !== words[offset]) return false;
    }
    return true;
  }

  function findVoiceAmount(tokens, skip = new Set()) {
    for (let index = 0; index < tokens.length; index += 1) {
      if (skip.has(index)) continue;
      const token = tokens[index].norm;
      let value = null;
      let end = index + 1;

      if (/^\d/.test(token)) {
        const parsed = parseAmount(token);
        if (!Number.isFinite(parsed)) continue;
        value = parsed;
      } else if (VOICE_NUMBERS[token] !== undefined || VOICE_MULTIPLIERS[token]) {
        const parsed = parseVoiceNumberWords(tokens, index);
        if (!parsed) continue;
        value = parsed.value;
        end = parsed.end;
      } else {
        continue;
      }

      if (!Number.isFinite(value) || value <= 0) continue;
      const following = tokens[end] ? tokens[end].norm : "";
      if (VOICE_QUANTITIES.has(following)) continue;
      if ((token === "um" || token === "uma") && !VOICE_CURRENCIES.has(following) && !VOICE_MULTIPLIERS[following]) continue;

      if (/^\d/.test(token) && VOICE_MULTIPLIERS[following]) {
        value *= VOICE_MULTIPLIERS[following];
        end += 1;
        const extraStart = tokens[end] && tokens[end].norm === "e" ? end + 1 : end;
        const extraToken = tokens[extraStart] ? tokens[extraStart].norm : "";
        if (VOICE_NUMBERS[extraToken] !== undefined || /^\d/.test(extraToken)) {
          const extra = parseVoiceNumberWords(tokens, extraStart);
          if (extra && extra.value > 0) {
            value += extra.value;
            end = extra.end;
          }
        }
      }

      let hasCurrency = false;
      if (tokens[end] && VOICE_CURRENCIES.has(tokens[end].norm)) {
        hasCurrency = true;
        end += 1;
      }

      if (tokens[end] && VOICE_CENTS.has(tokens[end].norm)) {
        if (!hasCurrency && value < 100) value /= 100;
        end += 1;
      } else if (hasCurrency && tokens[end] && tokens[end].norm === "e") {
        const centsStart = end + 1;
        let centsValue = null;
        let centsEnd = centsStart;
        if (tokens[centsStart] && /^\d/.test(tokens[centsStart].norm)) {
          const parsed = parseAmount(tokens[centsStart].norm);
          if (Number.isFinite(parsed)) {
            centsValue = parsed;
            centsEnd = centsStart + 1;
          }
        } else if (tokens[centsStart]) {
          const parsed = parseVoiceNumberWords(tokens, centsStart);
          if (parsed) {
            centsValue = parsed.value;
            centsEnd = parsed.end;
          }
        }
        if (centsValue !== null && tokens[centsEnd] && VOICE_CENTS.has(tokens[centsEnd].norm)) {
          value += centsValue / 100;
          end = centsEnd + 1;
        }
      }

      return { value: core.round(value), start: index, end };
    }
    return null;
  }

  function findVoiceDate(tokens) {
    const today = core.todayISO();
    const todayDate = core.parseISO(today);
    const relative = [
      { words: ["depois", "de", "amanha"], days: 2 },
      { words: ["antes", "de", "ontem"], days: -2 },
      { words: ["anteontem"], days: -2 },
      { words: ["ontem"], days: -1 },
      { words: ["hoje"], days: 0 },
      { words: ["amanha"], days: 1 },
    ];

    for (const phrase of relative) {
      for (let index = 0; index < tokens.length; index += 1) {
        if (voiceSequenceAt(tokens, index, phrase.words)) {
          return { date: core.addDaysISO(today, phrase.days), start: index, end: index + phrase.words.length };
        }
      }
    }

    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index].norm === "mes" && tokens[index + 1] && tokens[index + 1].norm === "passado") {
        return { date: core.addMonthsISO(today, -1), start: index, end: index + 2 };
      }
      if (tokens[index].norm === "semana" && tokens[index + 1] && tokens[index + 1].norm === "passada") {
        return { date: core.addDaysISO(today, -7), start: index, end: index + 2 };
      }
    }

    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index].norm !== "dia") continue;
      let end = index + 1;
      let day = null;
      if (tokens[end] && /^\d+$/.test(tokens[end].norm)) {
        day = Number(tokens[end].norm);
        end += 1;
      } else if (tokens[end]) {
        const parsed = parseVoiceNumberWords(tokens, end);
        if (parsed && parsed.value >= 1 && parsed.value <= 31) {
          day = parsed.value;
          end = parsed.end;
        }
      }
      if (day === null || day < 1 || day > 31) continue;

      let year = todayDate.getFullYear();
      let month = todayDate.getMonth();
      if (day > todayDate.getDate()) {
        month -= 1;
        if (month < 0) {
          month = 11;
          year -= 1;
        }
      }
      const lastDay = new Date(year, month + 1, 0).getDate();
      const safeDay = Math.min(day, lastDay);
      const start = tokens[index - 1] && ["no", "na", "em"].includes(tokens[index - 1].norm) ? index - 1 : index;
      return { date: core.toISO(new Date(year, month, safeDay, 12)), start, end };
    }

    for (let index = 0; index < tokens.length; index += 1) {
      const target = VOICE_WEEKDAYS[tokens[index].norm];
      if (target === undefined) continue;
      let end = index + 1;
      if (tokens[end] && tokens[end].norm === "feira") end += 1;
      let explicitPast = false;
      if (tokens[end] && ["passada", "passado", "ultima", "ultimo"].includes(tokens[end].norm)) {
        explicitPast = true;
        end += 1;
      }
      let delta = (todayDate.getDay() - target + 7) % 7;
      if (delta === 0 && explicitPast) delta = 7;
      const start = tokens[index - 1] && ["na", "no", "nesta", "nessa", "ultima"].includes(tokens[index - 1].norm)
        ? index - 1
        : index;
      return { date: core.addDaysISO(today, -delta), start, end };
    }

    return null;
  }

  function findVoicePayment(tokens) {
    const phrases = [
      { words: ["cartao", "de", "credito"], payment: "credit" },
      { words: ["cartao", "de", "debito"], payment: "debit" },
      { words: ["no", "cartao"], payment: "credit" },
      { words: ["no", "pix"], payment: "pix" },
      { words: ["via", "pix"], payment: "pix" },
      { words: ["com", "pix"], payment: "pix" },
      { words: ["em", "dinheiro"], payment: "cash" },
      { words: ["em", "especie"], payment: "cash" },
      { words: ["no", "boleto"], payment: "boleto" },
      { words: ["por", "boleto"], payment: "boleto" },
      { words: ["por", "transferencia"], payment: "transfer" },
    ];
    for (const phrase of phrases) {
      for (let index = 0; index < tokens.length; index += 1) {
        if (voiceSequenceAt(tokens, index, phrase.words)) {
          return { payment: phrase.payment, start: index, end: index + phrase.words.length };
        }
      }
    }
    const singles = [
      ["boleto", "boleto"],
      ["pix", "pix"],
      ["transferencia", "transfer"],
      ["ted", "transfer"],
      ["doc", "transfer"],
      ["dinheiro", "cash"],
      ["especie", "cash"],
      ["debito", "debit"],
      ["credito", "credit"],
      ["cartao", "credit"],
      ["parcelado", "credit"],
    ];
    for (const [word, payment] of singles) {
      for (let index = 0; index < tokens.length; index += 1) {
        if (tokens[index].norm === word) return { payment, start: index, end: index + 1 };
      }
    }
    return null;
  }

  function inferVoiceType(normalized) {
    const incomeVerb = /\b(recebi|receber|ganhei|ganhar|entrou|entrada|vendi|vender|depositei|deposito|caiu|creditou)\b/;
    const expenseVerb = /\b(gastei|gastar|paguei|pagar|comprei|comprar|saiu|debitou)\b/;
    const incomeIndex = normalized.search(incomeVerb);
    const expenseIndex = normalized.search(expenseVerb);
    if (incomeIndex >= 0 && (expenseIndex < 0 || incomeIndex < expenseIndex)) return "income";
    if (expenseIndex >= 0) return "expense";
    if (/\b(salario|holerite|contracheque|freelance|freela|rendimento|dividendo|reembolso|restituicao|bonus|comissao|mesada|heranca|lucro)\b/.test(normalized)) {
      return "income";
    }
    return "expense";
  }

  function resolveVoiceCategory(type, group) {
    const categories = store.categoriesByType(type);
    let category = categories.find((entry) => entry.id === group.id);
    if (category) return category;
    for (const name of group.names) {
      category = categories.find((entry) => normalizeVoiceToken(entry.name).includes(name));
      if (category) return category;
    }
    return null;
  }

  function inferVoiceCategory(type, normalized) {
    const padded = ` ${normalized} `;
    const categories = store.categoriesByType(type);
    const byName = categories.find((category) => {
      const name = normalizeVoiceToken(category.name);
      return name.length >= 3 && padded.includes(` ${name} `);
    });
    if (byName) return byName;

    const groups = type === "income" ? VOICE_INCOME_GROUPS : VOICE_EXPENSE_GROUPS;
    for (const group of groups) {
      if (!group.words.some((word) => padded.includes(` ${word} `))) continue;
      const category = resolveVoiceCategory(type, group);
      if (category) return category;
    }

    const fallbackId = type === "income" ? "other-income" : "other-expense";
    return store.categoryById(fallbackId) || categories[0] || { id: fallbackId, name: type === "income" ? "Outras receitas" : "Outros gastos" };
  }

  function buildVoiceDescription(tokens, remove, type) {
    const edge = new Set([
      "a", "o", "as", "os", "de", "do", "da", "dos", "das", "no", "na",
      "nos", "nas", "em", "com", "por", "para", "pra", "e", "que", "um",
      "uma", "uns", "umas", "meu", "minha", "meus", "minhas",
    ]);
    const words = tokens
      .filter((token) => !remove.has(token.index))
      .map((token) => token.original.replace(/^[.,;:!?]+|[.,;:!?]+$/g, "").trim())
      .filter(Boolean);
    while (words.length && edge.has(normalizeVoiceToken(words[0]))) words.shift();
    while (words.length && edge.has(normalizeVoiceToken(words[words.length - 1]))) words.pop();
    const description = words.join(" ").replace(/\s+/g, " ").trim();
    if (!description) return type === "income" ? "Receita por voz" : "Despesa por voz";
    return capitalize(description.slice(0, 100));
  }

  function parseVoiceTransaction(text) {
    const transcript = String(text || "").trim();
    const tokens = tokenizeVoice(transcript);
    const normalized = tokens.map((token) => token.norm).join(" ");
    const dateInfo = findVoiceDate(tokens);
    const date = dateInfo ? dateInfo.date : core.todayISO();
    const amountInfo = findVoiceAmount(tokens, dateInfo ? voiceRange(dateInfo.start, dateInfo.end) : new Set());
    const paymentInfo = findVoicePayment(tokens);
    const type = inferVoiceType(normalized);
    const ignoredForCategory = new Set();
    if (dateInfo) voiceRange(dateInfo.start, dateInfo.end).forEach((index) => ignoredForCategory.add(index));
    if (amountInfo) voiceRange(amountInfo.start, amountInfo.end).forEach((index) => ignoredForCategory.add(index));
    if (paymentInfo) voiceRange(paymentInfo.start, paymentInfo.end).forEach((index) => ignoredForCategory.add(index));
    const categoryText = tokens
      .filter((token) => !ignoredForCategory.has(token.index) && !VOICE_COMMANDS.has(token.norm))
      .map((token) => token.norm)
      .join(" ");
    const category = inferVoiceCategory(type, categoryText || normalized);
    const remove = new Set();

    if (dateInfo) voiceRange(dateInfo.start, dateInfo.end).forEach((index) => remove.add(index));
    if (amountInfo) {
      voiceRange(amountInfo.start, amountInfo.end).forEach((index) => remove.add(index));
      const previous = amountInfo.start > 0 ? tokens[amountInfo.start - 1].norm : "";
      if (["por", "de", "em", "a", "com"].includes(previous)) remove.add(amountInfo.start - 1);
    }
    if (paymentInfo) voiceRange(paymentInfo.start, paymentInfo.end).forEach((index) => remove.add(index));
    tokens.forEach((token) => {
      if (VOICE_COMMANDS.has(token.norm)) remove.add(token.index);
    });

    return {
      type,
      description: buildVoiceDescription(tokens, remove, type),
      amount: amountInfo ? amountInfo.value : null,
      date,
      categoryId: category.id,
      payment: paymentInfo ? paymentInfo.payment : "other",
      fixed: false,
      notes: "",
      transcript,
    };
  }

  const voice = Fin.voice.create({
    $,
    $$,
    el,
    esc,
    icon,
    openModal,
    closeModal,
    parseVoiceTransaction,
    openTransactionModal,
  });

  function openVoiceModal() {
    voice.openVoiceModal();
  }

  // --------------------------------------------------------------- lançamentos

  function categoryOptions(type, selected) {
    return store.categoriesByType(type)
      .map((category) => `<option value="${esc(category.id)}" ${category.id === selected ? "selected" : ""}>${esc(category.name)}</option>`)
      .join("");
  }

  function paymentOptions(selected) {
    return Object.entries(core.PAYMENTS)
      .map(([key, label]) => `<option value="${esc(key)}" ${key === selected ? "selected" : ""}>${esc(label)}</option>`)
      .join("");
  }

  function typeTabs(field, selected) {
    return `<div class="segmented type-tabs" data-type-tabs data-field="${esc(field)}">
      <button type="button" data-type-choice="expense" class="${selected === "expense" ? "active" : ""}">Despesa</button>
      <button type="button" data-type-choice="income" class="${selected === "income" ? "active" : ""}">Receita</button>
    </div><input type="hidden" name="${esc(field)}" value="${selected === "income" ? "income" : "expense"}">`;
  }

  function findTransaction(id) {
    return store.state.transactions.find((transaction) => transaction.id === id) || null;
  }

  function openTransactionModal(transaction = null, defaultDate, draft = null, sourceText = "") {
    const base = transaction || draft || null;
    const type = base ? base.type : "expense";
    const categoryId = base && store.categoryById(base.categoryId)
      ? base.categoryId
      : (store.categoriesByType(type)[0] || {}).id || "";
    const body = `<div class="form-grid">
      <div class="field span-2"><span class="field-label">Tipo</span>${typeTabs("type", type)}</div>
      <label class="field span-2"><span>Descrição</span><input name="description" type="text" maxlength="100" required autocomplete="off" placeholder="Ex.: Supermercado, salário, aluguel" value="${esc(base ? base.description : "")}"></label>
      <label class="field"><span>Valor</span><input name="amount" type="text" inputmode="decimal" required placeholder="0,00" value="${base && Number(base.amount) > 0 ? moneyInput(base.amount) : ""}"></label>
      <label class="field"><span>Data</span><input name="date" type="date" required value="${esc(base ? base.date : defaultDate || core.todayISO())}"></label>
      <label class="field"><span>Categoria</span><select name="categoryId">${categoryOptions(type, categoryId)}</select></label>
      <label class="field"><span>Forma de pagamento</span><select name="payment">${paymentOptions(base ? base.payment : "pix")}</select></label>
      <label class="check-field span-2"><input name="fixed" type="checkbox" ${base && base.fixed ? "checked" : ""}><span>Movimentação fixa ou recorrente</span></label>
      <label class="field span-2"><span>Observações (opcional)</span><textarea name="notes" rows="2" maxlength="500" placeholder="Detalhes que ajudem a lembrar deste lançamento">${esc(base ? base.notes : "")}</textarea></label>
    </div>`;

    const heard = sourceText ? sourceText.trim() : "";
    const subtitle = draft
      ? `Ouvi: “${heard.length > 140 ? `${heard.slice(0, 137)}...` : heard}”. ${draft.amount ? "Confira os campos antes de salvar." : "Não encontrei o valor: complete o campo."}`
      : "Os indicadores são atualizados assim que você salvar.";

    openModal({
      title: transaction ? "Editar lançamento" : draft ? "Revisar lançamento por voz" : "Novo lançamento",
      subtitle,
      body,
      submit: transaction ? "Salvar alterações" : draft ? "Salvar lançamento" : "Adicionar lançamento",
      onSubmit: (data) => {
        const description = String(data.get("description") || "").trim();
        if (description.length < 2) throw new Error("Informe uma descrição com pelo menos 2 caracteres.");
        const amount = usableAmount(data.get("amount"));
        if (amount === null || amount <= 0) throw new Error("Informe um valor maior que zero.");
        const date = String(data.get("date") || "");
        if (!core.isValidISODate(date)) throw new Error("Informe uma data válida.");
        const nextType = data.get("type") === "income" ? "income" : "expense";
        let nextCategory = String(data.get("categoryId") || "");
        const category = store.categoryById(nextCategory);
        if (!category || category.type !== nextType) {
          nextCategory = nextType === "income" ? "other-income" : "other-expense";
        }
        const payload = {
          type: nextType,
          description,
          amount,
          date,
          categoryId: nextCategory,
          payment: core.PAYMENTS[data.get("payment")] ? data.get("payment") : "other",
          fixed: data.get("fixed") === "on",
          notes: String(data.get("notes") || "").trim(),
        };
        if (transaction) {
          store.updateTransaction(transaction.id, payload);
          return "Lançamento atualizado.";
        }
        const created = store.addTransaction(payload);
        if (!created) throw new Error("Não foi possível salvar o lançamento.");
        return "Lançamento adicionado.";
      },
    });


  }

  async function deleteTransaction(id) {
    const transaction = findTransaction(id);
    if (!transaction) return;
    const ok = await confirmDialog({
      title: "Excluir lançamento?",
      text: `"${transaction.description}" de ${core.money(transaction.amount)} será removido. Esta ação não pode ser desfeita.`,
    });
    if (!ok) return;
    store.deleteTransaction(id);
    toast("Lançamento excluído.", "success");
  }

  function transactionItem(transaction, actions = true) {
    const category = store.categoryById(transaction.categoryId);
    const color = category ? category.color : "#64748b";
    const sign = transaction.type === "income" ? "+" : "−";
    return `<li class="tx-item">
      <button class="tx-main" type="button" data-action="edit-transaction" data-id="${esc(transaction.id)}">
        <span class="tx-icon" style="--tx-color:${esc(color)}">${categoryIcon(category)}</span>
        <span class="tx-info">
          <strong>${esc(transaction.description)}</strong>
          <small>${esc(category ? category.name : "Sem categoria")} · ${esc(core.PAYMENTS[transaction.payment] || "Outro")}${transaction.fixed ? " · fixa" : ""}</small>
        </span>
        <span class="tx-amount ${transaction.type}">${sign} ${core.money(transaction.amount)}</span>
      </button>
      ${actions ? `<div class="tx-actions">
        <button class="icon-btn tiny" type="button" data-action="edit-transaction" data-id="${esc(transaction.id)}" aria-label="Editar ${esc(transaction.description)}">${icon("edit", "icon xs")}</button>
        <button class="icon-btn tiny danger" type="button" data-action="delete-transaction" data-id="${esc(transaction.id)}" aria-label="Excluir ${esc(transaction.description)}">${icon("trash", "icon xs")}</button>
      </div>` : ""}
    </li>`;
  }

  function groupedTransactionsMarkup(list, { actions = true, limit = null } = {}) {
    const selected = limit ? list.slice(0, limit) : list;
    const groups = new Map();
    for (const transaction of selected) {
      if (!groups.has(transaction.date)) groups.set(transaction.date, []);
      groups.get(transaction.date).push(transaction);
    }
    let html = "";
    for (const [date, items] of groups) {
      html += `<li class="tx-date"><span>${esc(dayLabel(date))}</span></li>`;
      html += items.map((transaction) => transactionItem(transaction, actions)).join("");
    }
    return html;
  }

  function renderTransactions() {
    const monthKeys = new Set(store.state.transactions.map((transaction) => core.monthKey(transaction.date)));
    monthKeys.add(core.monthKey(core.todayISO()));
    const months = Array.from(monthKeys).sort((a, b) => b.localeCompare(a));

    el.txCategory.innerHTML = `<option value="">Todas as categorias</option>` +
      ["expense", "income"].map((type) => {
        const items = store.categoriesByType(type);
        if (!items.length) return "";
        return `<optgroup label="${type === "income" ? "Receitas" : "Despesas"}">${items.map((category) => `<option value="${esc(category.id)}">${esc(category.name)}</option>`).join("")}</optgroup>`;
      }).join("");

    el.txMonth.innerHTML = `<option value="">Todos os meses</option>` +
      months.map((key) => `<option value="${esc(key)}">${esc(monthLong(key))}</option>`).join("");

    el.txPayment.innerHTML = `<option value="">Todas as formas</option>` +
      Object.entries(core.PAYMENTS).map(([key, label]) => `<option value="${esc(key)}">${esc(label)}</option>`).join("");

    el.txSearch.value = state.txFilters.query;
    el.txType.value = state.txFilters.type;
    el.txCategory.value = state.txFilters.categoryId;
    el.txMonth.value = state.txFilters.month;
    el.txPayment.value = state.txFilters.payment;

    renderTransactionsList();
  }

  function renderTransactionsList() {
    let from = null;
    let to = null;
    if (state.txFilters.month) {
      const range = core.monthRange(state.txFilters.month);
      from = range[0];
      to = range[1];
    }
    const list = store.listTransactions(from, to, {
      query: state.txFilters.query.trim(),
      type: state.txFilters.type,
      categoryId: state.txFilters.categoryId,
      payment: state.txFilters.payment,
    });
    const income = core.round(list.filter((transaction) => transaction.type === "income").reduce((total, transaction) => total + transaction.amount, 0));
    const expense = core.round(list.filter((transaction) => transaction.type === "expense").reduce((total, transaction) => total + transaction.amount, 0));
    const result = core.round(income - expense);
    const hasFilters = Boolean(
      state.txFilters.query || state.txFilters.type || state.txFilters.categoryId ||
      state.txFilters.month || state.txFilters.payment,
    );

    el.txSummary.innerHTML = `<div class="summary-strip">
      <div class="summary-item"><span>Lançamentos</span><strong>${list.length}</strong></div>
      <div class="summary-item"><span>Receitas</span><strong class="income">${core.money(income)}</strong></div>
      <div class="summary-item"><span>Despesas</span><strong class="expense">${core.money(expense)}</strong></div>
      <div class="summary-item"><span>Resultado</span><strong class="${result < 0 ? "expense" : "income"}">${core.money(result)}</strong></div>
    </div>`;

    el.txList.innerHTML = list.length
      ? groupedTransactionsMarkup(list, { actions: true, limit: state.txLimit })
      : `<li class="empty-row">${emptyState(
          "search",
          hasFilters ? "Nenhum lançamento encontrado" : "Seu histórico começa aqui",
          hasFilters
            ? "Ajuste os filtros ou limpe a busca para ver todos os lançamentos."
            : "Cadastre sua primeira receita ou despesa para acompanhar saldo, orçamento e relatórios.",
          hasFilters
            ? `<button class="btn secondary" type="button" data-action="clear-tx-filters">Limpar filtros</button>`
            : `<button class="btn primary" type="button" data-action="new-transaction">${icon("plus")}Novo lançamento</button>`,
        )}</li>`;

    el.txMore.hidden = list.length <= state.txLimit;
  }

  function clearTransactionFilters() {
    state.txFilters = { query: "", type: "", categoryId: "", month: "", payment: "" };
    state.txLimit = 40;
    if (state.view === "transactions") renderTransactions();
  }
  // ------------------------------------------------------------------ dashboard

  function comparisonHtml(current, previous, goodWhenUp) {
    if (!Number.isFinite(previous) || previous === 0) {
      return `<span class="muted">Sem base no período anterior</span>`;
    }
    const change = ((current - previous) / Math.abs(previous)) * 100;
    if (!Number.isFinite(change)) return `<span class="muted">Sem base no período anterior</span>`;
    const rounded = Math.round(change);
    const flat = rounded === 0;
    const up = rounded > 0;
    const tone = flat ? "" : (up === goodWhenUp ? "good" : "bad");
    const arrow = flat ? icon("info", "icon xs") : icon(up ? "up" : "down", "icon xs");
    return `<span class="trend ${tone}">${arrow}${Math.abs(rounded).toLocaleString("pt-BR")}%</span> <span class="muted">vs. período anterior</span>`;
  }

  function renderDashboard() {
    const today = core.todayISO();
    const period = state.dashPeriod;
    const range = core.periodRange(period, today);
    const previousRange = core.previousPeriodRange(period, today);
    const current = store.totals(range[0], range[1]);
    const previous = store.totals(previousRange[0], previousRange[1]);
    const balance = store.balanceUntil(today);
    const name = store.state.settings.name.trim();
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

    el.dashDate.textContent = todayLabel();
    el.dashGreeting.textContent = name ? `${greeting}, ${name}` : greeting;
    el.dashSub.textContent = `Resumo ${core.PERIOD_LABELS[period].toLowerCase()} com receitas, despesas e resultado.`;

    $$("button", el.dashPeriod).forEach((button) => {
      const active = button.dataset.period === period;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    el.kpiBalance.textContent = core.money(balance);
    el.kpiBalance.classList.toggle("negative", balance < 0);
    el.kpiBalanceMeta.textContent = `${plural(store.state.transactions.length, "lançamento registrado", "lançamentos registrados")} até hoje`;
    el.kpiIncome.textContent = core.money(current.income);
    el.kpiIncomeMeta.innerHTML = comparisonHtml(current.income, previous.income, true);
    el.kpiExpense.textContent = core.money(current.expense);
    el.kpiExpenseMeta.innerHTML = comparisonHtml(current.expense, previous.expense, false);
    el.kpiResult.textContent = core.money(current.result);
    el.kpiResult.classList.toggle("negative", current.result < 0);
    el.kpiResultMeta.innerHTML = current.result === 0 && previous.result === 0
      ? `<span class="muted">Receitas menos despesas</span>`
      : comparisonHtml(current.result, previous.result, true);

    renderDashAlerts();

    const accent = cssVar("--accent", "#0f9d74");
    if (store.state.transactions.length) {
      charts.line(el.chartBalance, {
        points: store.balanceSeries(6, today).map((point) => ({
          label: capitalize(monthShort(point.key)),
          value: point.value,
        })),
        color: accent,
      });
    } else {
      charts.line(el.chartBalance, { points: [], emptyText: "Registre lançamentos para ver a evolução do saldo." });
    }
    el.chartBalancePill.textContent = core.money(balance);

    const monthly = store.monthlySeries(6, today);
    if (monthly.some((entry) => entry.income > 0 || entry.expense > 0)) {
      charts.bars(el.chartMonthly, {
        labels: monthly.map((entry) => capitalize(monthShort(entry.key))),
        series: [
          { name: "Receitas", color: "#0f9d74", values: monthly.map((entry) => entry.income) },
          { name: "Despesas", color: "#e0565b", values: monthly.map((entry) => entry.expense) },
        ],
      });
    } else {
      charts.bars(el.chartMonthly, { labels: [], series: [], emptyText: "Sem movimentações nos últimos meses." });
    }
    el.monthlyLegend.innerHTML = `<li><i style="background:#0f9d74"></i>Receitas</li><li><i style="background:#e0565b"></i>Despesas</li>`;

    renderDashBudget();
    renderDashBills();
    renderDashGoals();

    const recent = store.listTransactions(null, null).slice(0, 5);
    el.dashRecent.innerHTML = recent.length
      ? groupedTransactionsMarkup(recent, { actions: false })
      : `<li class="empty-row">${emptyState(
          "wallet",
          "Nenhuma movimentação ainda",
          "Cadastre receitas e despesas para ver o resumo aqui.",
          `<button class="btn primary" type="button" data-action="new-transaction">${icon("plus")}Novo lançamento</button>`,
        )}</li>`;
  }

  function renderDashAlerts() {
    const today = core.todayISO();
    const items = [];
    const overdue = store.overdueBills(today);
    const upcoming = store.upcomingBills(7, today).filter((bill) => bill.dueDate >= today);
    const budget = store.budgetUsage();
    const reached = store.state.goals.filter((goal) => goal.target > 0 && goal.saved >= goal.target);

    if (overdue.length) {
      items.push({ tone: "danger", icon: "alert", text: plural(overdue.length, "conta atrasada", "contas atrasadas"), view: "planning" });
    }
    if (upcoming.length) {
      items.push({ tone: "warning", icon: "calendar", text: `${plural(upcoming.length, "conta vence", "contas vencem")} nos próximos 7 dias`, view: "planning" });
    }
    if (budget.total && budget.ratio >= 0.8) {
      items.push({
        tone: budget.ratio >= 1 ? "danger" : "warning",
        icon: "gauge",
        text: budget.ratio >= 1 ? "Orçamento estourado" : `${percentLabel(budget.ratio)} do orçamento usado`,
        view: "planning",
      });
    }
    if (reached.length) {
      items.push({ tone: "positive", icon: "check", text: plural(reached.length, "meta alcançada", "metas alcançadas"), view: "planning" });
    }

    if (!items.length) {
      el.dashAlerts.hidden = true;
      el.dashAlerts.innerHTML = "";
      return;
    }
    el.dashAlerts.hidden = false;
    el.dashAlerts.innerHTML = items.map((item) =>
      `<button class="alert-chip ${item.tone}" type="button" data-view="${item.view}">
        ${icon(item.icon)}
        <span>${esc(item.text)}</span>
        ${icon("right", "icon xs")}
      </button>`,
    ).join("");
  }

  function renderDashBudget() {
    const budget = store.budgetUsage();
    const month = core.monthLabel(core.monthKey(core.todayISO()));
    let html = `<header class="card-head">
      <div><h3>Orçamento</h3><p>${esc(month)}</p></div>
      <button class="link-btn" type="button" data-view="planning">Gerenciar</button>
    </header>`;
    if (!budget.total) {
      html += emptyState(
        "target",
        "Defina um orçamento",
        "Estabeleça um limite mensal e acompanhe o quanto já foi usado.",
        `<button class="btn secondary small" type="button" data-action="edit-budget">Criar orçamento</button>`,
      );
    } else {
      const tone = toneForRatio(budget.ratio);
      html += `<div class="budget-line"><strong>${core.money(budget.spent)}</strong><span>de ${core.money(budget.total)}</span></div>
        ${progressBar(budget.ratio, tone)}
        <div class="budget-meta">
          <span>${percentLabel(budget.ratio)} utilizado</span>
          <span class="${budget.remaining < 0 ? "expense" : ""}">${budget.remaining < 0 ? `${core.money(Math.abs(budget.remaining))} acima` : `${core.money(budget.remaining)} restantes`}</span>
        </div>`;
    }
    el.dashBudget.innerHTML = html;
  }

  function renderDashBills() {
    const today = core.todayISO();
    const bills = store.state.bills
      .filter((bill) => !bill.paid)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 4);
    let html = `<header class="card-head">
      <div><h3>Contas a vencer</h3><p>Próximos vencimentos</p></div>
      <button class="link-btn" type="button" data-view="planning">Ver contas</button>
    </header>`;
    if (!bills.length) {
      html += emptyState(
        "receipt",
        "Nenhuma conta em aberto",
        "Cadastre contas a pagar para receber alertas de vencimento.",
        `<button class="btn secondary small" type="button" data-action="new-bill">Nova conta</button>`,
      );
    } else {
      html += `<div class="mini-list">${bills.map((bill) => {
        const overdue = bill.dueDate < today;
        return `<div class="mini-item">
          ${dateChip(bill.dueDate)}
          <div class="mini-info">
            <strong>${esc(bill.name)}</strong>
            <small class="${overdue ? "expense" : ""}">${overdue ? "Atrasada" : bill.dueDate === today ? "Vence hoje" : `Vence em ${core.shortDate(bill.dueDate)}`}</small>
          </div>
          <strong class="mini-value">${core.money(bill.amount)}</strong>
        </div>`;
      }).join("")}</div>`;
    }
    el.dashBills.innerHTML = html;
  }

  function renderDashGoals() {
    const goals = store.state.goals.slice().sort((a, b) => {
      const left = a.deadline || "9999-12-31";
      const right = b.deadline || "9999-12-31";
      return left.localeCompare(right);
    }).slice(0, 3);
    let html = `<header class="card-head">
      <div><h3>Metas</h3><p>Seus objetivos</p></div>
      <button class="link-btn" type="button" data-view="planning">Ver metas</button>
    </header>`;
    if (!goals.length) {
      html += emptyState(
        "flag",
        "Crie sua primeira meta",
        "Defina um objetivo, um valor e um prazo para acompanhar o progresso.",
        `<button class="btn secondary small" type="button" data-action="new-goal">Nova meta</button>`,
      );
    } else {
      html += `<div class="mini-list">${goals.map((goal) => {
        const ratio = goal.target > 0 ? goal.saved / goal.target : 0;
        return `<div class="goal-mini">
          <div class="goal-mini-head">
            <span class="color-dot" style="background:${esc(goal.color)}"></span>
            <strong>${esc(goal.name)}</strong>
            <span class="muted">${percentLabel(ratio)}</span>
          </div>
          ${progressBar(ratio)}
          <div class="goal-mini-foot"><span>${core.money(goal.saved)} de ${core.money(goal.target)}</span>${goal.deadline ? `<span>${core.shortDate(goal.deadline)}</span>` : ""}</div>
        </div>`;
      }).join("")}</div>`;
    }
    el.dashGoals.innerHTML = html;
  }

  // --------------------------------------------------------------- planejamento

  function renderPlanning() {
    const month = core.monthKey(core.todayISO());
    el.budgetCaption.textContent = `${monthLong(month)} · acompanhe o limite e o uso por categoria.`;
    renderPlanningBudget();
    renderGoals();
    renderBills();
    renderDebts();
    renderSubscriptions();
    renderRecurrences();
  }

  function renderPlanningBudget() {
    const usage = store.budgetUsage();
    const limits = usage.categories.filter((category) => category.limit > 0);

    if (!usage.total && !limits.length) {
      el.planningBudget.innerHTML = emptyState(
        "target",
        "Nenhum orçamento definido",
        "Crie um limite total para o mês e limites por categoria. O app avisa antes de você ultrapassar.",
        `<button class="btn primary" type="button" data-action="edit-budget">${icon("plus")}Criar orçamento</button>`,
      );
      return;
    }

    const totalTone = toneForRatio(usage.ratio);
    let html = `<div class="budget-hero">
      <div class="budget-hero-item"><span>Limite mensal</span><strong>${core.money(usage.total)}</strong></div>
      <div class="budget-hero-item"><span>Utilizado</span><strong>${core.money(usage.spent)}</strong></div>
      <div class="budget-hero-item"><span>${usage.remaining >= 0 ? "Disponível" : "Excedido"}</span><strong class="${usage.remaining < 0 ? "expense" : "income"}">${core.money(Math.abs(usage.remaining || 0))}</strong></div>
      <span class="badge ${totalTone}">${usage.total ? percentLabel(usage.ratio) : "Sem limite total"}</span>
    </div>`;
    if (usage.total) html += progressBar(usage.ratio, totalTone);

    if (limits.length) {
      html += `<div class="limit-list">${limits.map((category) => {
        const ratio = category.limit > 0 ? category.spent / category.limit : 0;
        const tone = toneForRatio(ratio);
        return `<div class="limit-row">
          <div class="limit-head">
            <span><i class="dot" style="background:${esc(category.color)}"></i>${esc(category.name)}</span>
            <span>${core.money(category.spent)} <small>de ${core.money(category.limit)}</small></span>
          </div>
          ${progressBar(ratio, tone)}
          <div class="limit-foot"><span>${percentLabel(ratio)}</span><span>${ratio >= 1 ? `${core.money(category.spent - category.limit)} acima` : `${core.money(category.limit - category.spent)} restantes`}</span></div>
        </div>`;
      }).join("")}</div>`;
    } else {
      html += `<p class="hint">Defina limites por categoria para ver o detalhamento do orçamento.</p>`;
    }

    el.planningBudget.innerHTML = html;
  }

  function renderGoals() {
    const goals = store.state.goals.slice().sort((a, b) => String(a.deadline || "9999").localeCompare(String(b.deadline || "9999")));
    if (!goals.length) {
      el.goalsList.innerHTML = emptyState(
        "flag",
        "Nenhuma meta cadastrada",
        "Crie cofrinhos para viagens, reserva de emergência ou qualquer objetivo.",
        `<button class="btn secondary" type="button" data-action="new-goal">${icon("plus")}Nova meta</button>`,
      );
      return;
    }
    const today = core.todayISO();
    el.goalsList.innerHTML = goals.map((goal) => {
      const ratio = goal.target > 0 ? goal.saved / goal.target : 0;
      const done = ratio >= 1;
      const late = goal.deadline && goal.deadline < today && !done;
      return `<article class="plan-item">
        <div class="plan-head">
          <div class="plan-title">
            <span class="color-dot" style="background:${esc(goal.color)}"></span>
            <strong>${esc(goal.name)}</strong>
            ${done ? badge("Concluída", "positive") : ""}
            ${late ? badge("Prazo vencido", "warning") : ""}
          </div>
          <div class="plan-actions">
            <button class="icon-btn tiny" type="button" data-action="edit-goal" data-id="${esc(goal.id)}" aria-label="Editar meta">${icon("edit", "icon xs")}</button>
            <button class="icon-btn tiny danger" type="button" data-action="delete-goal" data-id="${esc(goal.id)}" aria-label="Excluir meta">${icon("trash", "icon xs")}</button>
          </div>
        </div>
        ${progressBar(ratio)}
        <div class="plan-foot">
          <span>${core.money(goal.saved)} de ${core.money(goal.target)} · ${percentLabel(ratio)}</span>
          <span>${goal.deadline ? `Prazo: ${core.shortDate(goal.deadline)}` : "Sem prazo"}</span>
        </div>
        <div class="plan-foot">
          <span class="muted">Faltam ${core.money(Math.max(0, goal.target - goal.saved))}</span>
          <button class="link-btn" type="button" data-action="contribute-goal" data-id="${esc(goal.id)}">Guardar dinheiro</button>
        </div>
      </article>`;
    }).join("");
  }

  function renderBills() {
    const today = core.todayISO();
    const bills = store.state.bills.slice().sort((a, b) => {
      if (Boolean(a.paid) !== Boolean(b.paid)) return a.paid ? 1 : -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
    if (!bills.length) {
      el.billsList.innerHTML = emptyState(
        "receipt",
        "Nenhuma conta cadastrada",
        "Cadastre contas com vencimento para receber alertas e registrar o pagamento.",
        `<button class="btn secondary" type="button" data-action="new-bill">${icon("plus")}Nova conta</button>`,
      );
      return;
    }
    el.billsList.innerHTML = bills.map((bill) => {
      const overdue = !bill.paid && bill.dueDate < today;
      const dueToday = !bill.paid && bill.dueDate === today;
      const category = store.categoryById(bill.categoryId);
      const status = bill.paid ? badge("Paga", "positive") : overdue ? badge("Atrasada", "danger") : dueToday ? badge("Vence hoje", "warning") : badge("Em aberto", "");
      return `<article class="plan-item">
        <div class="plan-head">
          ${dateChip(bill.dueDate)}
          <div class="plan-title grow">
            <div><strong>${esc(bill.name)}</strong> ${status}</div>
            <small class="muted">${esc(category ? category.name : "Contas")} · vencimento ${core.shortDate(bill.dueDate)}</small>
          </div>
          <strong class="plan-value">${core.money(bill.amount)}</strong>
          <div class="plan-actions">
            ${bill.paid
              ? `<button class="icon-btn tiny" type="button" data-action="unpay-bill" data-id="${esc(bill.id)}" aria-label="Desfazer pagamento" title="Desfazer pagamento">${icon("repeat", "icon xs")}</button>`
              : `<button class="icon-btn tiny" type="button" data-action="pay-bill" data-id="${esc(bill.id)}" aria-label="Marcar como paga" title="Marcar como paga">${icon("check", "icon xs")}</button>`}
            <button class="icon-btn tiny" type="button" data-action="edit-bill" data-id="${esc(bill.id)}" aria-label="Editar conta">${icon("edit", "icon xs")}</button>
            <button class="icon-btn tiny danger" type="button" data-action="delete-bill" data-id="${esc(bill.id)}" aria-label="Excluir conta">${icon("trash", "icon xs")}</button>
          </div>
        </div>
      </article>`;
    }).join("");
  }

  function renderDebts() {
    if (!store.state.debts.length) {
      el.debtsList.innerHTML = emptyState(
        "wallet",
        "Nenhuma dívida em aberto",
        "Cadastre parcelas e acompanhe o quanto ainda falta pagar.",
        `<button class="btn secondary" type="button" data-action="new-debt">${icon("plus")}Nova dívida</button>`,
      );
      return;
    }
    el.debtsList.innerHTML = store.state.debts.map((debt) => {
      const installment = debt.installmentValue || (debt.installments > 0 ? debt.total / debt.installments : 0);
      const paidAmount = Math.min(debt.total, installment * debt.paidInstallments);
      const remaining = Math.max(0, debt.total - paidAmount);
      const ratio = debt.installments > 0 ? debt.paidInstallments / debt.installments : 0;
      const done = debt.paidInstallments >= debt.installments;
      return `<article class="plan-item">
        <div class="plan-head">
          <div class="plan-title grow">
            <div><strong>${esc(debt.name)}</strong> ${done ? badge("Quitada", "positive") : badge(`${debt.paidInstallments}/${debt.installments} parcelas`, "")}</div>
            <small class="muted">Parcela de ${core.money(installment)} · vence dia ${debt.dueDay}</small>
          </div>
          <strong class="plan-value">${core.money(remaining)}</strong>
          <div class="plan-actions">
            ${done ? "" : `<button class="icon-btn tiny" type="button" data-action="pay-installment" data-id="${esc(debt.id)}" aria-label="Pagar parcela" title="Pagar parcela">${icon("check", "icon xs")}</button>`}
            <button class="icon-btn tiny" type="button" data-action="edit-debt" data-id="${esc(debt.id)}" aria-label="Editar dívida">${icon("edit", "icon xs")}</button>
            <button class="icon-btn tiny danger" type="button" data-action="delete-debt" data-id="${esc(debt.id)}" aria-label="Excluir dívida">${icon("trash", "icon xs")}</button>
          </div>
        </div>
        ${progressBar(ratio)}
        <div class="plan-foot"><span>${core.money(paidAmount)} pagos</span><span>Faltam ${core.money(remaining)}</span></div>
      </article>`;
    }).join("");
  }

  function renderSubscriptions() {
    const monthly = store.monthlySubscriptionCost();
    if (!store.state.subscriptions.length) {
      el.subsList.innerHTML = emptyState(
        "repeat",
        "Nenhuma assinatura cadastrada",
        "Registre serviços recorrentes para saber quanto eles custam por ano.",
        `<button class="btn secondary" type="button" data-action="new-sub">${icon("plus")}Nova assinatura</button>`,
      );
      return;
    }
    const summary = `<p class="section-note">Custo mensal estimado: <strong>${core.money(monthly)}</strong> · ${core.money(monthly * 12)} por ano.</p>`;
    el.subsList.innerHTML = summary + store.state.subscriptions.map((subscription) => {
      const active = subscription.active !== false;
      return `<article class="plan-item">
        <div class="plan-head">
          <div class="plan-title grow">
            <div><strong>${esc(subscription.name)}</strong> ${active ? badge("Ativa", "positive") : badge("Pausada", "")}</div>
            <small class="muted">${subscription.cycle === "yearly" ? "Cobrança anual" : "Cobrança mensal"} · próxima em ${core.shortDate(subscription.nextDate)}</small>
          </div>
          <strong class="plan-value">${core.money(subscription.amount)}</strong>
          <div class="plan-actions">
            <button class="icon-btn tiny" type="button" data-action="charge-sub" data-id="${esc(subscription.id)}" aria-label="Registrar cobrança" title="Registrar cobrança">${icon("receipt", "icon xs")}</button>
            <button class="icon-btn tiny" type="button" data-action="toggle-sub" data-id="${esc(subscription.id)}" aria-label="${active ? "Pausar" : "Ativar"} assinatura" title="${active ? "Pausar" : "Ativar"}">${icon(active ? "close" : "check", "icon xs")}</button>
            <button class="icon-btn tiny" type="button" data-action="edit-sub" data-id="${esc(subscription.id)}" aria-label="Editar assinatura">${icon("edit", "icon xs")}</button>
            <button class="icon-btn tiny danger" type="button" data-action="delete-sub" data-id="${esc(subscription.id)}" aria-label="Excluir assinatura">${icon("trash", "icon xs")}</button>
          </div>
        </div>
      </article>`;
    }).join("");
  }

  function renderRecurrences() {
    if (!store.state.recurrences.length) {
      el.recsList.innerHTML = emptyState(
        "repeat",
        "Nenhuma recorrência cadastrada",
        "Automatize salário, aluguel ou outras movimentações que se repetem.",
        `<button class="btn secondary" type="button" data-action="new-rec">${icon("plus")}Nova recorrência</button>`,
      );
      return;
    }
    el.recsList.innerHTML = store.state.recurrences.map((recurrence) => {
      const active = recurrence.active !== false;
      return `<article class="plan-item">
        <div class="plan-head">
          <div class="plan-title grow">
            <div><strong>${esc(recurrence.description)}</strong> ${active ? badge("Ativa", "positive") : badge("Pausada", "")}</div>
            <small class="muted">${recurrence.type === "income" ? "Receita" : "Despesa"} · ${esc(core.FREQUENCIES[recurrence.frequency] || "Mensal")} · próxima em ${core.shortDate(recurrence.nextDate)}</small>
          </div>
          <strong class="plan-value ${recurrence.type === "income" ? "income" : "expense"}">${recurrence.type === "income" ? "+" : "−"} ${core.money(recurrence.amount)}</strong>
          <div class="plan-actions">
            <button class="icon-btn tiny" type="button" data-action="toggle-rec" data-id="${esc(recurrence.id)}" aria-label="${active ? "Pausar" : "Ativar"} recorrência" title="${active ? "Pausar" : "Ativar"}">${icon(active ? "close" : "check", "icon xs")}</button>
            <button class="icon-btn tiny" type="button" data-action="edit-rec" data-id="${esc(recurrence.id)}" aria-label="Editar recorrência">${icon("edit", "icon xs")}</button>
            <button class="icon-btn tiny danger" type="button" data-action="delete-rec" data-id="${esc(recurrence.id)}" aria-label="Excluir recorrência">${icon("trash", "icon xs")}</button>
          </div>
        </div>
      </article>`;
    }).join("");
  }
  // ----------------------------------------------------- modais de planejamento

  function openBudgetModal() {
    const month = core.monthKey(core.todayISO());
    const budget = store.budgetFor(month);
    const categories = store.categoriesByType("expense");
    const body = `<div class="form-grid">
      <label class="field span-2"><span>Limite total do mês</span><input name="total" type="text" inputmode="decimal" placeholder="0,00" value="${budget.total ? moneyInput(budget.total) : ""}"></label>
      <div class="field span-2"><span class="field-label">Limites por categoria</span>
        <div class="limit-grid">
          ${categories.map((category) => {
            const limit = Number(budget.categories && budget.categories[category.id]) || 0;
            return `<label class="field">
              <span><i class="dot" style="background:${esc(category.color)}"></i>${esc(category.name)}</span>
              <input name="cat_${esc(category.id)}" type="text" inputmode="decimal" placeholder="Sem limite" value="${limit > 0 ? moneyInput(limit) : ""}">
            </label>`;
          }).join("")}
        </div>
      </div>
    </div>
    <p class="hint">Deixe um campo em branco para não definir limite naquela categoria.</p>`;

    openModal({
      title: `Orçamento de ${monthLong(month)}`,
      subtitle: "O limite total e os limites por categoria são independentes.",
      body,
      submit: "Salvar orçamento",
      wide: true,
      onSubmit: (data) => {
        const total = usableAmount(data.get("total"));
        if (total === null && String(data.get("total")).trim() !== "") throw new Error("Informe um limite total válido.");
        const limits = {};
        for (const category of categories) {
          const raw = String(data.get(`cat_${category.id}`) || "").trim();
          if (!raw) continue;
          const value = usableAmount(raw);
          if (value === null || value < 0) throw new Error(`Limite inválido em ${category.name}.`);
          if (value > 0) limits[category.id] = value;
        }
        store.setBudget(month, { total: total && total > 0 ? total : 0, categories: limits });
        return "Orçamento salvo.";
      },
    });
  }

  async function copyPreviousBudget() {
    const currentKey = core.monthKey(core.todayISO());
    const previousKey = core.monthKey(core.addMonthsISO(core.startOfMonth(core.todayISO()), -1));
    const previous = store.budgetFor(previousKey);
    if (!previous.total && !Object.keys(previous.categories || {}).length) {
      toast(`Não há orçamento em ${monthLong(previousKey)} para copiar.`, "warning");
      return;
    }
    const current = store.budgetFor(currentKey);
    if (current.total || Object.keys(current.categories || {}).length) {
      const ok = await confirmDialog({
        title: "Substituir orçamento atual?",
        text: `O orçamento de ${monthLong(currentKey)} será substituído pelo de ${monthLong(previousKey)}.`,
        ok: "Substituir",
        danger: false,
      });
      if (!ok) return;
    }
    store.setBudget(currentKey, {
      total: previous.total,
      categories: { ...(previous.categories || {}) },
    });
    toast("Orçamento do mês anterior copiado.", "success");
  }

  function openGoalModal(goal = null) {
    const body = `<div class="form-grid">
      <label class="field span-2"><span>Nome da meta</span><input name="name" type="text" maxlength="60" required placeholder="Ex.: Reserva de emergência" value="${esc(goal ? goal.name : "")}"></label>
      <label class="field"><span>Valor da meta</span><input name="target" type="text" inputmode="decimal" required placeholder="0,00" value="${goal ? moneyInput(goal.target) : ""}"></label>
      <label class="field"><span>Prazo (opcional)</span><input name="deadline" type="date" value="${esc(goal && goal.deadline ? goal.deadline : "")}"></label>
      <label class="field"><span>Cor da meta</span><input name="color" type="color" value="${esc(goal ? goal.color : "#0f9d74")}"></label>
    </div>`;

    openModal({
      title: goal ? "Editar meta" : "Nova meta",
      subtitle: "Metas funcionam como cofrinhos: você registra cada valor guardado.",
      body,
      submit: goal ? "Salvar alterações" : "Criar meta",
      onSubmit: (data) => {
        const name = String(data.get("name") || "").trim();
        if (name.length < 2) throw new Error("Informe um nome para a meta.");
        const target = usableAmount(data.get("target"));
        if (target === null || target <= 0) throw new Error("Informe um valor de meta maior que zero.");
        const deadline = String(data.get("deadline") || "");
        if (deadline && !core.isValidISODate(deadline)) throw new Error("Informe um prazo válido.");
        const color = /^#[0-9a-f]{6}$/i.test(String(data.get("color"))) ? String(data.get("color")) : "#0f9d74";
        const payload = { name, target, deadline: deadline || null, color };
        if (goal) {
          store.updateGoal(goal.id, payload);
          return "Meta atualizada.";
        }
        store.addGoal(payload);
        return "Meta criada.";
      },
    });
  }

  function openContributionModal(goalId) {
    const goal = store.state.goals.find((entry) => entry.id === goalId);
    if (!goal) return;
    const remaining = Math.max(0, goal.target - goal.saved);
    const body = `<div class="form-grid">
      <div class="field span-2"><span>Meta</span><strong>${esc(goal.name)}</strong><small class="muted">Faltam ${core.money(remaining)} para atingir ${core.money(goal.target)}.</small></div>
      <label class="field span-2"><span>Valor a guardar</span><input name="amount" type="text" inputmode="decimal" required placeholder="0,00" value="${remaining > 0 ? moneyInput(remaining) : ""}"></label>
    </div>`;
    openModal({
      title: "Guardar dinheiro na meta",
      subtitle: "O valor entra no cofrinho desta meta.",
      body,
      submit: "Guardar",
      onSubmit: (data) => {
        const amount = usableAmount(data.get("amount"));
        if (amount === null || amount <= 0) throw new Error("Informe um valor maior que zero.");
        store.contributeGoal(goalId, amount);
        return "Valor guardado na meta.";
      },
    });
  }

  async function deleteGoal(id) {
    const goal = store.state.goals.find((entry) => entry.id === id);
    if (!goal) return;
    const ok = await confirmDialog({
      title: "Excluir meta?",
      text: `"${goal.name}" e o histórico de valores guardados serão removidos.`,
    });
    if (!ok) return;
    store.deleteGoal(id);
    toast("Meta excluída.", "success");
  }

  function openBillModal(bill = null) {
    const body = `<div class="form-grid">
      <label class="field span-2"><span>Nome da conta</span><input name="name" type="text" maxlength="80" required placeholder="Ex.: Aluguel, internet, energia" value="${esc(bill ? bill.name : "")}"></label>
      <label class="field"><span>Valor</span><input name="amount" type="text" inputmode="decimal" required placeholder="0,00" value="${bill ? moneyInput(bill.amount) : ""}"></label>
      <label class="field"><span>Vencimento</span><input name="dueDate" type="date" required value="${esc(bill ? bill.dueDate : core.todayISO())}"></label>
      <label class="field span-2"><span>Categoria</span><select name="categoryId">${categoryOptions("expense", bill ? bill.categoryId : "bills")}</select></label>
    </div>`;

    openModal({
      title: bill ? "Editar conta" : "Nova conta a pagar",
      subtitle: "Contas vencidas e próximas do vencimento geram alertas.",
      body,
      submit: bill ? "Salvar alterações" : "Cadastrar conta",
      onSubmit: (data) => {
        const name = String(data.get("name") || "").trim();
        if (name.length < 2) throw new Error("Informe o nome da conta.");
        const amount = usableAmount(data.get("amount"));
        if (amount === null || amount <= 0) throw new Error("Informe um valor maior que zero.");
        const dueDate = String(data.get("dueDate") || "");
        if (!core.isValidISODate(dueDate)) throw new Error("Informe uma data de vencimento válida.");
        const categoryId = String(data.get("categoryId") || "");
        const payload = { name, amount, dueDate, categoryId: store.categoryById(categoryId) ? categoryId : "bills" };
        if (bill) {
          store.updateBill(bill.id, payload);
          return "Conta atualizada.";
        }
        store.addBill(payload);
        return "Conta cadastrada.";
      },
    });
  }

  async function payBill(id) {
    const bill = store.state.bills.find((entry) => entry.id === id);
    if (!bill) return;
    const ok = await confirmDialog({
      title: "Registrar pagamento?",
      text: `"${bill.name}" de ${core.money(bill.amount)} será marcada como paga e um lançamento será criado.`,
      ok: "Registrar pagamento",
      danger: false,
    });
    if (!ok) return;
    store.payBill(id);
    toast("Pagamento registrado.", "success");
  }

  async function unpayBill(id) {
    const bill = store.state.bills.find((entry) => entry.id === id);
    if (!bill) return;
    const ok = await confirmDialog({
      title: "Desfazer pagamento?",
      text: `O lançamento criado para "${bill.name}" será removido e a conta voltará para em aberto.`,
      ok: "Desfazer",
      danger: false,
    });
    if (!ok) return;
    store.unpayBill(id);
    toast("Pagamento desfeito.", "success");
  }

  async function deleteBill(id) {
    const bill = store.state.bills.find((entry) => entry.id === id);
    if (!bill) return;
    const ok = await confirmDialog({
      title: "Excluir conta?",
      text: `"${bill.name}" será removida da lista de contas.`,
    });
    if (!ok) return;
    store.deleteBill(id);
    toast("Conta excluída.", "success");
  }
  function openDebtModal(debt = null) {
    const body = `<div class="form-grid">
      <label class="field span-2"><span>Nome da dívida</span><input name="name" type="text" maxlength="80" required placeholder="Ex.: Cartão de crédito, financiamento" value="${esc(debt ? debt.name : "")}"></label>
      <label class="field"><span>Valor total</span><input name="total" type="text" inputmode="decimal" required placeholder="0,00" value="${debt ? moneyInput(debt.total) : ""}"></label>
      <label class="field"><span>Número de parcelas</span><input name="installments" type="number" min="1" max="600" required value="${debt ? debt.installments : 12}"></label>
      <label class="field"><span>Valor da parcela (opcional)</span><input name="installmentValue" type="text" inputmode="decimal" placeholder="Automático" value="${debt && debt.installmentValue ? moneyInput(debt.installmentValue) : ""}"></label>
      <label class="field"><span>Dia do vencimento</span><input name="dueDay" type="number" min="1" max="31" value="${debt ? debt.dueDay : 10}" required></label>
      <label class="field span-2"><span>Categoria</span><select name="categoryId">${categoryOptions("expense", debt ? debt.categoryId : "bills")}</select></label>
    </div>
    <p class="hint">Se o valor da parcela ficar em branco, o app divide o total pelo número de parcelas.</p>`;

    openModal({
      title: debt ? "Editar dívida" : "Nova dívida",
      subtitle: "Ao pagar uma parcela, um lançamento é criado automaticamente.",
      body,
      submit: debt ? "Salvar alterações" : "Cadastrar dívida",
      onSubmit: (data) => {
        const name = String(data.get("name") || "").trim();
        if (name.length < 2) throw new Error("Informe o nome da dívida.");
        const total = usableAmount(data.get("total"));
        if (total === null || total <= 0) throw new Error("Informe um valor total maior que zero.");
        const installments = Math.round(Number(data.get("installments")));
        if (!Number.isFinite(installments) || installments < 1) throw new Error("Informe o número de parcelas.");
        if (debt && installments < debt.paidInstallments) {
          throw new Error(`Esta dívida já tem ${debt.paidInstallments} parcelas pagas.`);
        }
        if (debt && debt.paidInstallments > 0) {
          const paidValue = debt.installmentValue > 0
            ? debt.installmentValue * debt.paidInstallments
            : debt.total * (debt.paidInstallments / debt.installments);
          if (total < paidValue - 0.005) {
            throw new Error(`O valor total não pode ser menor que o valor já pago (${core.money(paidValue)}).`);
          }
        }
        const rawInstallment = String(data.get("installmentValue") || "").trim();
        let installmentValue = 0;
        if (rawInstallment) {
          const parsed = usableAmount(rawInstallment);
          if (parsed === null || parsed <= 0) throw new Error("Valor de parcela inválido.");
          installmentValue = parsed;
        }
        const dueDay = Math.max(1, Math.min(31, Math.round(Number(data.get("dueDay")) || 1)));
        const categoryId = String(data.get("categoryId") || "");
        const payload = {
          name,
          total,
          installments,
          installmentValue,
          dueDay,
          categoryId: store.categoryById(categoryId) ? categoryId : "bills",
        };
        if (debt) {
          store.updateDebt(debt.id, payload);
          return "Dívida atualizada.";
        }
        store.addDebt(payload);
        return "Dívida cadastrada.";
      },
    });
  }

  async function payInstallment(id) {
    const debt = store.state.debts.find((entry) => entry.id === id);
    if (!debt) return;
    if (debt.paidInstallments >= debt.installments) {
      toast("Esta dívida já está quitada.", "info");
      return;
    }
    const value = debt.installmentValue || (debt.total / debt.installments);
    const ok = await confirmDialog({
      title: "Registrar parcela paga?",
      text: `Será criado um lançamento de ${core.money(value)} referente à parcela ${debt.paidInstallments + 1} de ${debt.installments}.`,
      ok: "Registrar parcela",
      danger: false,
    });
    if (!ok) return;
    store.payInstallment(id);
    toast("Parcela registrada.", "success");
  }

  async function deleteDebt(id) {
    const debt = store.state.debts.find((entry) => entry.id === id);
    if (!debt) return;
    const ok = await confirmDialog({
      title: "Excluir dívida?",
      text: `"${debt.name}" será removida. Os lançamentos de parcelas já pagas serão mantidos.`,
    });
    if (!ok) return;
    store.deleteDebt(id);
    toast("Dívida excluída.", "success");
  }

  function openSubscriptionModal(subscription = null) {
    const body = `<div class="form-grid">
      <label class="field span-2"><span>Nome da assinatura</span><input name="name" type="text" maxlength="80" required placeholder="Ex.: Streaming, academia, software" value="${esc(subscription ? subscription.name : "")}"></label>
      <label class="field"><span>Valor</span><input name="amount" type="text" inputmode="decimal" required placeholder="0,00" value="${subscription ? moneyInput(subscription.amount) : ""}"></label>
      <label class="field"><span>Ciclo de cobrança</span><select name="cycle">
        <option value="monthly" ${!subscription || subscription.cycle === "monthly" ? "selected" : ""}>Mensal</option>
        <option value="yearly" ${subscription && subscription.cycle === "yearly" ? "selected" : ""}>Anual</option>
      </select></label>
      <label class="field"><span>Próxima cobrança</span><input name="nextDate" type="date" required value="${esc(subscription ? subscription.nextDate : core.todayISO())}"></label>
      <label class="field"><span>Categoria</span><select name="categoryId">${categoryOptions("expense", subscription ? subscription.categoryId : "leisure")}</select></label>
    </div>`;

    openModal({
      title: subscription ? "Editar assinatura" : "Nova assinatura",
      subtitle: "O app calcula o custo mensal e anual dos serviços ativos.",
      body,
      submit: subscription ? "Salvar alterações" : "Cadastrar assinatura",
      onSubmit: (data) => {
        const name = String(data.get("name") || "").trim();
        if (name.length < 2) throw new Error("Informe o nome da assinatura.");
        const amount = usableAmount(data.get("amount"));
        if (amount === null || amount <= 0) throw new Error("Informe um valor maior que zero.");
        const nextDate = String(data.get("nextDate") || "");
        if (!core.isValidISODate(nextDate)) throw new Error("Informe uma data válida.");
        const categoryId = String(data.get("categoryId") || "");
        const payload = {
          name,
          amount,
          cycle: data.get("cycle") === "yearly" ? "yearly" : "monthly",
          nextDate,
          categoryId: store.categoryById(categoryId) ? categoryId : "leisure",
        };
        if (subscription) {
          store.updateSubscription(subscription.id, payload);
          return "Assinatura atualizada.";
        }
        store.addSubscription(payload);
        return "Assinatura cadastrada.";
      },
    });
  }

  async function chargeSubscription(id) {
    const subscription = store.state.subscriptions.find((entry) => entry.id === id);
    if (!subscription) return;
    if (subscription.active === false) {
      toast("Ative a assinatura antes de registrar uma cobrança.", "warning");
      return;
    }
    const ok = await confirmDialog({
      title: "Registrar cobrança?",
      text: `Será criado um lançamento de ${core.money(subscription.amount)} para "${subscription.name}" e a próxima cobrança será adiantada.`,
      ok: "Registrar cobrança",
      danger: false,
    });
    if (!ok) return;
    store.chargeSubscription(id);
    toast("Cobrança registrada.", "success");
  }

  function toggleSubscription(id) {
    const subscription = store.state.subscriptions.find((entry) => entry.id === id);
    if (!subscription) return;
    store.toggleSubscription(id);
    toast(subscription.active === false ? "Assinatura pausada." : "Assinatura reativada.", "success", 2600);
  }

  async function deleteSubscription(id) {
    const subscription = store.state.subscriptions.find((entry) => entry.id === id);
    if (!subscription) return;
    const ok = await confirmDialog({
      title: "Excluir assinatura?",
      text: `"${subscription.name}" será removida do controle de assinaturas.`,
    });
    if (!ok) return;
    store.deleteSubscription(id);
    toast("Assinatura excluída.", "success");
  }

  function runRecurrenceEngine() {
    let generated = 0;
    store.update((data) => {
      generated = store.runRecurrences(data);
    });
    return generated;
  }

  function openRecurrenceModal(recurrence = null) {
    const type = recurrence ? recurrence.type : "expense";
    const body = `<div class="form-grid">
      <div class="field span-2"><span class="field-label">Tipo</span>${typeTabs("type", type)}</div>
      <label class="field span-2"><span>Descrição</span><input name="description" type="text" maxlength="100" required placeholder="Ex.: Salário, aluguel, internet" value="${esc(recurrence ? recurrence.description : "")}"></label>
      <label class="field"><span>Valor</span><input name="amount" type="text" inputmode="decimal" required placeholder="0,00" value="${recurrence ? moneyInput(recurrence.amount) : ""}"></label>
      <label class="field"><span>Próxima ocorrência</span><input name="nextDate" type="date" required value="${esc(recurrence ? recurrence.nextDate : core.todayISO())}"></label>
      <label class="field"><span>Categoria</span><select name="categoryId">${categoryOptions(type, recurrence ? recurrence.categoryId : "")}</select></label>
      <label class="field"><span>Forma de pagamento</span><select name="payment">${paymentOptions(recurrence ? recurrence.payment : "pix")}</select></label>
      <label class="field"><span>Frequência</span><select name="frequency">
        ${Object.entries(core.FREQUENCIES).map(([key, label]) => `<option value="${esc(key)}" ${(recurrence ? recurrence.frequency === key : key === "monthly") ? "selected" : ""}>${esc(label)}</option>`).join("")}
      </select></label>
      <label class="check-field"><input name="fixed" type="checkbox" ${!recurrence || recurrence.fixed ? "checked" : ""}><span>Marcar como fixa</span></label>
    </div>
    <p class="hint">Ao abrir o app, as ocorrências vencidas são lançadas automaticamente.</p>`;

    openModal({
      title: recurrence ? "Editar recorrência" : "Nova recorrência",
      subtitle: "Salário, aluguel e assinaturas podem ser automáticos.",
      body,
      submit: recurrence ? "Salvar alterações" : "Cadastrar recorrência",
      onSubmit: (data) => {
        const description = String(data.get("description") || "").trim();
        if (description.length < 2) throw new Error("Informe uma descrição.");
        const amount = usableAmount(data.get("amount"));
        if (amount === null || amount <= 0) throw new Error("Informe um valor maior que zero.");
        const nextDate = String(data.get("nextDate") || "");
        if (!core.isValidISODate(nextDate)) throw new Error("Informe uma data válida.");
        const nextType = data.get("type") === "income" ? "income" : "expense";
        const categoryId = String(data.get("categoryId") || "");
        const category = store.categoryById(categoryId);
        const payload = {
          description,
          amount,
          type: nextType,
          categoryId: category && category.type === nextType ? categoryId : nextType === "income" ? "other-income" : "other-expense",
          payment: core.PAYMENTS[data.get("payment")] ? data.get("payment") : "other",
          frequency: core.FREQUENCIES[data.get("frequency")] ? data.get("frequency") : "monthly",
          nextDate,
          fixed: data.get("fixed") === "on",
        };
        if (recurrence) store.updateRecurrence(recurrence.id, payload);
        else store.addRecurrence(payload);
        const generated = runRecurrenceEngine();
        return generated > 0
          ? `Recorrência salva. ${plural(generated, "lançamento gerado", "lançamentos gerados")}.`
          : "Recorrência salva.";
      },
    });
  }

  function toggleRecurrence(id) {
    const recurrence = store.state.recurrences.find((entry) => entry.id === id);
    if (!recurrence) return;
    store.toggleRecurrence(id);
    toast(recurrence.active === false ? "Recorrência pausada." : "Recorrência reativada.", "success", 2600);
  }

  async function deleteRecurrence(id) {
    const recurrence = store.state.recurrences.find((entry) => entry.id === id);
    if (!recurrence) return;
    const ok = await confirmDialog({
      title: "Excluir recorrência?",
      text: `"${recurrence.description}" não gerará novos lançamentos. Os lançamentos já criados serão mantidos.`,
    });
    if (!ok) return;
    store.deleteRecurrence(id);
    toast("Recorrência excluída.", "success");
  }

  function openCategoryModal(category = null) {
    const type = category ? category.type : "expense";
    const icons = CATEGORY_ICONS.map((name) => `<option value="${name}" ${category && category.icon === name ? "selected" : ""}>${name}</option>`).join("");
    const body = `<div class="form-grid">
      <label class="field span-2"><span>Nome da categoria</span><input name="name" type="text" maxlength="40" required placeholder="Ex.: Pet, viagens, investimentos" value="${esc(category ? category.name : "")}"></label>
      ${category
        ? `<div class="field"><span>Tipo</span><strong>${category.type === "income" ? "Receita" : "Despesa"}</strong><input type="hidden" name="type" value="${category.type}"></div>`
        : `<div class="field"><span class="field-label">Tipo</span>${typeTabs("type", type)}</div>`}
      <label class="field"><span>Cor</span><input name="color" type="color" value="${esc(category ? category.color : "#64748b")}"></label>
      <label class="field"><span>Ícone</span><select name="icon">${icons}</select></label>
    </div>`;

    openModal({
      title: category ? "Editar categoria" : "Nova categoria",
      subtitle: "Categorias ajudam a comparar seus gastos e a definir limites.",
      body,
      submit: category ? "Salvar alterações" : "Criar categoria",
      onSubmit: (data) => {
        const name = String(data.get("name") || "").trim();
        if (name.length < 2) throw new Error("Informe o nome da categoria.");
        const nextType = data.get("type") === "income" ? "income" : "expense";
        const color = /^#[0-9a-f]{6}$/i.test(String(data.get("color"))) ? String(data.get("color")) : "#64748b";
        const iconName = CATEGORY_ICONS.includes(String(data.get("icon"))) ? String(data.get("icon")) : "dots";
        if (category) {
          store.updateCategory(category.id, { name, color, icon: iconName });
          return "Categoria atualizada.";
        }
        store.addCategory({ name, type: nextType, color, icon: iconName });
        return "Categoria criada.";
      },
    });
  }

  async function deleteCategory(id) {
    const category = store.categoryById(id);
    if (!category) return;
    if (category.system) {
      toast("Categorias padrão não podem ser excluídas.", "warning");
      return;
    }
    const ok = await confirmDialog({
      title: "Excluir categoria?",
      text: `"${category.name}" será removida e os lançamentos que usam esta categoria passarão para "Outros".`,
    });
    if (!ok) return;
    store.deleteCategory(id);
    toast("Categoria excluída.", "success");
  }
  // ------------------------------------------------------------------ relatórios

  function populateReportYears() {
    const currentYear = new Date().getFullYear();
    const years = new Set();
    for (let offset = -5; offset <= 1; offset += 1) years.add(String(currentYear + offset));
    for (const transaction of store.state.transactions) years.add(String(transaction.date).slice(0, 4));
    if (/^\d{4}$/.test(state.report.year)) years.add(state.report.year);
    const sorted = Array.from(years).sort((a, b) => b.localeCompare(a));
    el.reportYear.innerHTML = sorted.map((year) => `<option value="${esc(year)}">${esc(year)}</option>`).join("");
  }

  function syncReportFieldVisibility() {
    el.reportMonthField.hidden = state.report.mode !== "month";
    el.reportYearField.hidden = state.report.mode !== "year";
    el.reportFromField.hidden = state.report.mode !== "custom";
    el.reportToField.hidden = state.report.mode !== "custom";
  }

  function reportRange() {
    if (state.report.mode === "year") {
      const year = /^\d{4}$/.test(state.report.year) ? state.report.year : String(new Date().getFullYear());
      return { from: `${year}-01-01`, to: `${year}-12-31`, label: `Ano ${year}` };
    }
    if (state.report.mode === "custom") {
      const defaultRange = core.monthRange(core.monthKey(core.todayISO()));
      let from = core.isValidISODate(state.report.from) ? state.report.from : defaultRange[0];
      let to = core.isValidISODate(state.report.to) ? state.report.to : defaultRange[1];
      if (from > to) {
        const temp = from;
        from = to;
        to = temp;
      }
      return { from, to, label: `${core.shortDate(from)} a ${core.shortDate(to)}` };
    }
    const fallback = core.monthKey(core.todayISO());
    const month = /^\d{4}-\d{2}$/.test(state.report.month) && Number(state.report.month.slice(5, 7)) >= 1 && Number(state.report.month.slice(5, 7)) <= 12
      ? state.report.month
      : fallback;
    const range = core.monthRange(month);
    return { from: range[0], to: range[1], label: capitalize(monthLong(month)) };
  }

  function renderReports() {
    populateReportYears();
    el.reportMode.value = state.report.mode;
    el.reportMonth.value = state.report.month;
    el.reportYear.value = state.report.year;
    el.reportFrom.value = state.report.from;
    el.reportTo.value = state.report.to;
    syncReportFieldVisibility();
    renderReportResults();
  }

  function renderReportResults() {
    const range = reportRange();
    const totals = store.totals(range.from, range.to);
    const list = store.listTransactions(range.from, range.to);
    const rate = store.savingsRate(totals.income, totals.expense);

    el.reportSummary.innerHTML = `<div class="summary-strip report-summary-strip">
      <div class="summary-item wide"><span>Período</span><strong>${esc(range.label)}</strong></div>
      <div class="summary-item"><span>Receitas</span><strong class="income">${core.money(totals.income)}</strong></div>
      <div class="summary-item"><span>Despesas</span><strong class="expense">${core.money(totals.expense)}</strong></div>
      <div class="summary-item"><span>Resultado</span><strong class="${totals.result < 0 ? "expense" : "income"}">${core.money(totals.result)}</strong></div>
      <div class="summary-item"><span>Economia</span><strong class="${rate !== null && rate < 0 ? "expense" : "income"}">${rate === null ? "—" : core.percent(rate, 1)}</strong></div>
    </div>`;

    const categories = store.expensesByCategory(range.from, range.to);
    const slices = categories.map((entry) => {
      const category = store.categoryById(entry.categoryId);
      return {
        label: category ? category.name : "Sem categoria",
        value: entry.total,
        color: category ? category.color : "#64748b",
      };
    });
    charts.donut(el.reportDonut, { slices, total: totals.expense, centerLabel: "Despesas" });
    if (slices.length) charts.legend(el.reportLegend, slices);
    else el.reportLegend.innerHTML = `<li class="legend-item muted">Sem despesas no período.</li>`;

    if (categories.length) {
      el.reportTop.innerHTML = categories.slice(0, 6).map((entry) => {
        const category = store.categoryById(entry.categoryId);
        const ratio = totals.expense > 0 ? entry.total / totals.expense : 0;
        return `<div class="rank-item">
          <div class="rank-head">
            <span><i class="dot" style="background:${esc(category ? category.color : "#64748b")}"></i>${esc(category ? category.name : "Sem categoria")}</span>
            <strong>${core.money(entry.total)}</strong>
          </div>
          ${progressBar(ratio)}
          <div class="rank-foot"><span>${percentLabel(ratio)} das despesas</span><span>${plural(entry.count, "lançamento", "lançamentos")}</span></div>
        </div>`;
      }).join("");
    } else {
      el.reportTop.innerHTML = emptyState("chart", "Sem despesas no período", "Ajuste o período ou registre novos gastos para ver o ranking.");
    }

    const months = [];
    let cursor = core.startOfMonth(range.from);
    const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);
    let guard = 0;
    while (cursor <= range.to && guard < 36) {
      guard += 1;
      const key = core.monthKey(cursor);
      const monthRange = core.monthRange(key);
      months.push({
        key,
        label: sameYear ? capitalize(monthShort(key)) : `${capitalize(monthShort(key))}/${key.slice(2, 4)}`,
        ...store.totals(monthRange[0], monthRange[1]),
      });
      cursor = core.addMonthsISO(cursor, 1);
    }

    if (months.some((entry) => entry.income > 0 || entry.expense > 0)) {
      charts.bars(el.reportBars, {
        labels: months.map((entry) => entry.label),
        series: [
          { name: "Receitas", color: "#0f9d74", values: months.map((entry) => entry.income) },
          { name: "Despesas", color: "#e0565b", values: months.map((entry) => entry.expense) },
        ],
      });
    } else {
      charts.bars(el.reportBars, { labels: [], series: [], emptyText: "Sem movimentações no período." });
    }

    const points = buildBalancePoints(range.from, range.to);
    if (store.state.transactions.length) {
      charts.line(el.reportBalance, {
        points,
        color: cssVar("--accent", "#0f9d74"),
        emptyText: "Sem movimentações no período.",
      });
    } else {
      charts.line(el.reportBalance, { points: [], emptyText: "Sem lançamentos para calcular o saldo." });
    }
  }

  function buildBalancePoints(from, to) {
    const points = [];
    const days = Math.round((core.parseISO(to) - core.parseISO(from)) / 86400000);
    if (days <= 92) {
      let iso = from;
      let guard = 0;
      while (iso <= to && guard < 100) {
        guard += 1;
        points.push({ label: core.shortDate(iso), value: store.balanceUntil(iso) });
        iso = core.addDaysISO(iso, 1);
      }
    } else {
      let cursor = core.startOfMonth(from);
      let guard = 0;
      while (cursor <= to && guard < 36) {
        guard += 1;
        const end = core.monthRange(core.monthKey(cursor))[1];
        points.push({
          label: `${capitalize(monthShort(core.monthKey(cursor)))}/${String(cursor).slice(2, 4)}`,
          value: store.balanceUntil(end > to ? to : end),
        });
        cursor = core.addMonthsISO(cursor, 1);
      }
    }
    if (points.length === 1) {
      const previous = core.addDaysISO(from, -1);
      points.unshift({ label: core.shortDate(previous), value: store.balanceUntil(previous) });
    }
    return points;
  }

  // --------------------------------------------------------- exportação e PDF

  function csvEscape(value) {
    const text = String(value == null ? "" : value);
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function csvMoney(value) {
    return Number(value || 0).toFixed(2).replace(".", ",");
  }

  function transactionsCSV(list) {
    const rows = [["Data", "Tipo", "Descrição", "Categoria", "Forma de pagamento", "Valor (R$)", "Fixa", "Observações"]];
    for (const transaction of list) {
      const category = store.categoryById(transaction.categoryId);
      rows.push([
        transaction.date,
        transaction.type === "income" ? "Receita" : "Despesa",
        transaction.description,
        category ? category.name : "",
        core.PAYMENTS[transaction.payment] || "Outro",
        csvMoney(transaction.amount),
        transaction.fixed ? "Sim" : "Não",
        transaction.notes || "",
      ]);
    }
    return "\uFEFF" + rows.map((row) => row.map(csvEscape).join(";")).join("\r\n");
  }

  function exportAllCSV() {
    if (!store.state.transactions.length) {
      toast("Não há lançamentos para exportar.", "warning");
      return;
    }
    downloadFile(
      transactionsCSV(store.listTransactions(null, null)),
      fileName("meu-financeiro-lancamentos", "csv"),
      "text/csv;charset=utf-8",
    );
    toast("Arquivo CSV gerado.", "success");
  }

  function exportReportCSV() {
    const range = reportRange();
    const list = store.listTransactions(range.from, range.to);
    if (!list.length) {
      toast("Não há lançamentos no período selecionado.", "warning");
      return;
    }
    downloadFile(
      transactionsCSV(list),
      fileName(`relatorio-${range.from}-a-${range.to}`, "csv"),
      "text/csv;charset=utf-8",
    );
    toast("Relatório CSV gerado.", "success");
  }

  function printReport() {
    const range = reportRange();
    const totals = store.totals(range.from, range.to);
    const list = store.listTransactions(range.from, range.to);
    const rate = store.savingsRate(totals.income, totals.expense);
    const categories = store.expensesByCategory(range.from, range.to);
    const categoryRows = categories.map((entry) => {
      const category = store.categoryById(entry.categoryId);
      const share = totals.expense > 0 ? (entry.total / totals.expense) * 100 : 0;
      return `<tr><td>${esc(category ? category.name : "Sem categoria")}</td><td>${core.money(entry.total)}</td><td>${share.toFixed(1).replace(".", ",")}%</td><td>${entry.count}</td></tr>`;
    }).join("");
    const transactionRows = list.map((transaction) => {
      const category = store.categoryById(transaction.categoryId);
      return `<tr>
        <td>${esc(core.shortDate(transaction.date))}</td>
        <td>${esc(transaction.description)}</td>
        <td>${esc(category ? category.name : "")}</td>
        <td>${transaction.type === "income" ? "Receita" : "Despesa"}</td>
        <td class="right">${core.money(transaction.amount)}</td>
      </tr>`;
    }).join("");

    el.printArea.innerHTML = `<header class="print-head">
      <div><h1>Meu Financeiro</h1><p>Relatório financeiro · ${esc(range.label)}</p></div>
      <p>Gerado em ${esc(todayLabel())}</p>
    </header>
    <section class="print-summary">
      <div><span>Receitas</span><strong>${core.money(totals.income)}</strong></div>
      <div><span>Despesas</span><strong>${core.money(totals.expense)}</strong></div>
      <div><span>Resultado</span><strong>${core.money(totals.result)}</strong></div>
      <div><span>Economia</span><strong>${rate === null ? "—" : core.percent(rate, 1)}</strong></div>
    </section>
    <h2>Despesas por categoria</h2>
    ${categories.length ? `<table><thead><tr><th>Categoria</th><th>Total</th><th>Participação</th><th>Lançamentos</th></tr></thead><tbody>${categoryRows}</tbody></table>` : "<p>Sem despesas no período.</p>"}
    <h2>Lançamentos</h2>
    ${list.length ? `<table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th class="right">Valor</th></tr></thead><tbody>${transactionRows}</tbody></table>` : "<p>Sem lançamentos no período.</p>"}
    <footer class="print-foot">Documento gerado pelo app Meu Financeiro. Dados salvos somente neste aparelho.</footer>`;
    el.printArea.setAttribute("aria-hidden", "false");
    document.body.classList.add("printing");
    setTimeout(() => {
      window.print();
      setTimeout(() => {
        document.body.classList.remove("printing");
        el.printArea.setAttribute("aria-hidden", "true");
        el.printArea.innerHTML = "";
      }, 300);
    }, 80);
  }

  function renderCalendar() {}
  // ----------------------------------------------------------------- assistente

  function ensureChat() {
    if (state.chat.length) return;
    const name = store.state.settings.name.trim();
    state.chat.push({
      role: "assistant",
      text: `Olá${name ? `, ${name}` : ""}! Eu leio apenas os lançamentos salvos neste aparelho. Pergunte sobre saldo, gastos, orçamento, contas, metas, dívidas, assinaturas ou previsões.`,
      chips: assistant.suggestions.slice(0, 4),
    });
  }

  function renderAssistant() {
    ensureChat();
    renderInsights();
    renderChat();
  }

  function renderInsights() {
    state.insights = assistant.insights();
    el.insightsList.innerHTML = state.insights.map((item, index) => `
      <article class="insight ${esc(item.tone)}">
        <span class="insight-icon">${icon(item.icon)}</span>
        <div class="insight-body">
          <strong>${esc(item.title)}</strong>
          <p>${nl2br(item.text)}</p>
          ${item.action ? `<button class="link-btn" type="button" data-insight-index="${index}">${esc(item.action.label)} ${icon("right", "icon xs")}</button>` : ""}
        </div>
      </article>
    `).join("");
  }

  function runInsightAction(action) {
    if (!action) return;
    if (action.categoryId) state.txFilters.categoryId = action.categoryId;
    if (action.view) navigate(action.view);
    if (action.modal === "transaction") openTransactionModal();
  }

  function renderChat() {
    el.chatLog.innerHTML = state.chat.map((message) => {
      if (message.role === "user") {
        return `<div class="msg user"><div class="bubble">${nl2br(message.text)}</div></div>`;
      }
      return `<div class="msg assistant">
        <span class="msg-avatar">${icon("sparkles")}</span>
        <div class="bubble">${nl2br(message.text)}</div>
      </div>`;
    }).join("");
    const lastAssistant = [...state.chat].reverse().find((message) => message.role === "assistant");
    const chips = lastAssistant && lastAssistant.chips && lastAssistant.chips.length
      ? lastAssistant.chips
      : assistant.suggestions.slice(0, 4);
    el.chatChips.innerHTML = chips
      .map((question) => `<button class="chip" type="button" data-question="${esc(question)}">${esc(question)}</button>`)
      .join("");
    el.chatLog.scrollTop = el.chatLog.scrollHeight;
  }

  function sendQuestion(question) {
    ensureChat();
    const text = String(question || "").trim();
    if (!text) return;
    state.chat.push({ role: "user", text });
    let reply;
    try {
      reply = assistant.answer(text);
    } catch (error) {
      console.error("Falha ao responder:", error);
      reply = {
        text: "Não foi possível analisar essa pergunta agora. Tente novamente em instantes.",
        chips: assistant.suggestions.slice(0, 3),
      };
    }
    state.chat.push({ role: "assistant", text: reply.text, chips: reply.chips });
    renderChat();
  }

  // ------------------------------------------------------------------- calendário

  function compactValue(value) {
    const number = Math.abs(Number(value) || 0);
    if (number >= 1000) return `${(number / 1000).toFixed(1).replace(".", ",")}k`;
    return String(Math.round(number));
  }

  function moveCalendar(offset) {
    const currentKey = core.monthKey(core.todayISO());
    state.calendarMonth = core.monthKey(core.addMonthsISO(`${state.calendarMonth}-01`, offset));
    state.calendarDay = state.calendarMonth === currentKey ? core.todayISO() : `${state.calendarMonth}-01`;
    renderCalendar();
  }

  function renderCalendar() {
    const key = /^\d{4}-\d{2}$/.test(state.calendarMonth) ? state.calendarMonth : core.monthKey(core.todayISO());
    state.calendarMonth = key;
    const [from, to] = core.monthRange(key);
    const days = core.daysInMonth(key);
    const first = core.parseISO(from);
    const shift = (first.getDay() + 6) % 7;
    const today = core.todayISO();
    const selected = state.calendarDay >= from && state.calendarDay <= to ? state.calendarDay : (key === core.monthKey(today) ? today : from);
    state.calendarDay = selected;

    el.calTitle.textContent = capitalize(monthLong(key));

    const byDay = store.transactionsByDay(from, to);
    const billsByDay = new Map();
    for (const bill of store.state.bills) {
      if (bill.dueDate < from || bill.dueDate > to) continue;
      if (!billsByDay.has(bill.dueDate)) billsByDay.set(bill.dueDate, []);
      billsByDay.get(bill.dueDate).push(bill);
    }

    let cells = "";
    for (let index = 0; index < shift; index += 1) {
      cells += `<span class="cal-day blank" aria-hidden="true"></span>`;
    }
    for (let day = 1; day <= days; day += 1) {
      const iso = `${key}-${String(day).padStart(2, "0")}`;
      const data = byDay.get(iso) || { income: 0, expense: 0, items: [] };
      const bills = billsByDay.get(iso) || [];
      const classes = ["cal-day"];
      if (iso === today) classes.push("today");
      if (iso === selected) classes.push("selected");
      if (data.income > 0) classes.push("has-income");
      if (data.expense > 0) classes.push("has-expense");
      const dots = [
        data.income > 0 ? `<i class="dot income"></i>` : "",
        data.expense > 0 ? `<i class="dot expense"></i>` : "",
        bills.length ? `<i class="dot bill"></i>` : "",
      ].join("");
      cells += `<button class="${classes.join(" ")}" type="button" data-cal-day="${iso}" aria-label="${esc(core.longDate(iso))}${bills.length ? `, ${plural(bills.length, "conta", "contas")}` : ""}">
        <span class="cal-num">${day}</span>
        <span class="cal-values">
          ${data.income > 0 ? `<span class="income">+${compactValue(data.income)}</span>` : ""}
          ${data.expense > 0 ? `<span class="expense">−${compactValue(data.expense)}</span>` : ""}
        </span>
        <span class="cal-dots">${dots}</span>
      </button>`;
    }
    el.calGrid.innerHTML = cells;
    renderCalendarDay();
  }

  function renderCalendarDay() {
    const iso = state.calendarDay;
    const transactions = store.listTransactions(iso, iso);
    const bills = store.state.bills.filter((bill) => bill.dueDate === iso);
    const totals = store.totals(iso, iso);
    el.calDayTitle.textContent = capitalize(core.longDate(iso));
    el.calDaySub.textContent = transactions.length || bills.length
      ? `${core.money(totals.income)} em receitas · ${core.money(totals.expense)} em despesas · ${plural(bills.length, "conta", "contas")}`
      : "Nenhuma movimentação registrada neste dia.";

    let html = "";
    if (bills.length) {
      html += bills.map((bill) => `<li class="tx-item bill-row">
        <div class="tx-main static">
          <span class="tx-icon" style="--tx-color:${bill.paid ? "#0f9d74" : "#d97706"}">${icon("receipt")}</span>
          <span class="tx-info"><strong>${esc(bill.name)}</strong><small>Conta · ${bill.paid ? "paga" : "a pagar"} · vencimento hoje</small></span>
          <span class="tx-amount ${bill.paid ? "income" : "expense"}">${core.money(bill.amount)}</span>
        </div>
        <div class="tx-actions">
          ${bill.paid
            ? `<button class="icon-btn tiny" type="button" data-action="unpay-bill" data-id="${esc(bill.id)}" aria-label="Desfazer pagamento">${icon("repeat", "icon xs")}</button>`
            : `<button class="icon-btn tiny" type="button" data-action="pay-bill" data-id="${esc(bill.id)}" aria-label="Pagar conta">${icon("check", "icon xs")}</button>`}
        </div>
      </li>`).join("");
    }
    if (transactions.length) {
      html += transactions.map((transaction) => transactionItem(transaction, true)).join("");
    }
    if (!html) {
      html = `<li class="empty-row">${emptyState(
        "calendar",
        "Dia sem movimentações",
        "Registre uma receita ou despesa para este dia.",
        `<button class="btn secondary" type="button" data-action="new-transaction" data-date="${iso}">${icon("plus")}Adicionar lançamento</button>`,
      )}</li>`;
    }
    el.calDay.innerHTML = html;
  }

  // ---------------------------------------------------------------- configurações

  function renderSettings() {
    const settings = store.state.settings;
    if (document.activeElement !== el.settingsName) el.settingsName.value = settings.name || "";

    $$("[data-theme-choice]", el.themeChoices).forEach((button) => {
      const active = button.dataset.themeChoice === (settings.theme || "system");
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    $$("[data-accent-choice]", el.accentChoices).forEach((button) => {
      const active = button.dataset.accentChoice === (settings.accent || "emerald");
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });

    const supportsNotifications = "Notification" in window;
    const permission = supportsNotifications ? Notification.permission : "unsupported";
    el.notifStatus.textContent = !supportsNotifications
      ? "Este navegador não oferece notificações."
      : permission === "granted"
        ? "Notificações permitidas neste aparelho."
        : permission === "denied"
          ? "As notificações foram bloqueadas nas permissões do navegador."
          : "As notificações ainda não foram ativadas.";
    const notifLabel = $("span", el.btnNotif);
    if (notifLabel) notifLabel.textContent = permission === "granted" ? "Notificações ativas" : "Ativar notificações";

    const hasPin = Boolean(settings.pinHash);
    el.pinStatus.textContent = hasPin
      ? "PIN ativo. O app pede o código ao abrir neste aparelho."
      : "Nenhum PIN definido. Qualquer pessoa com acesso ao aparelho pode abrir o app.";
    const pinLabel = $("span", el.btnPin);
    if (pinLabel) pinLabel.textContent = hasPin ? "Alterar PIN" : "Definir PIN";

    el.btnInstall.hidden = !state.deferredPrompt;
    renderCategories();

    let bytes = 0;
    try { bytes = new Blob([store.exportJSON()]).size; }
    catch (error) { bytes = JSON.stringify(store.state).length; }
    el.storageInfo.textContent = `${plural(store.state.transactions.length, "lançamento", "lançamentos")} · ${plural(store.state.goals.length, "meta", "metas")} · ${(bytes / 1024).toFixed(1).replace(".", ",")} KB salvos neste navegador.`;
  }

  function renderCategories() {
    const counts = new Map();
    for (const transaction of store.state.transactions) {
      counts.set(transaction.categoryId, (counts.get(transaction.categoryId) || 0) + 1);
    }
    const sorted = store.state.categories.slice().sort((a, b) => {
      if (a.type !== b.type) return a.type === "expense" ? -1 : 1;
      return a.name.localeCompare(b.name, "pt-BR");
    });
    el.categoriesList.innerHTML = sorted.map((category) => {
      const count = counts.get(category.id) || 0;
      return `<div class="category-card">
        <button class="category-main" type="button" data-action="edit-category" data-id="${esc(category.id)}">
          <span class="category-icon" style="--cat-color:${esc(category.color)}">${categoryIcon(category)}</span>
          <span class="category-info">
            <strong>${esc(category.name)}</strong>
            <small>${category.type === "income" ? "Receita" : "Despesa"} · ${plural(count, "lançamento", "lançamentos")}</small>
          </span>
          ${category.system ? badge("Padrão", "") : ""}
        </button>
        <button class="icon-btn tiny ${category.system ? "" : "danger"}" type="button" data-action="delete-category" data-id="${esc(category.id)}" aria-label="Excluir categoria" title="${category.system ? "Categorias padrão não podem ser excluídas" : "Excluir categoria"}" ${category.system ? "disabled" : ""}>${icon(category.system ? "lock" : "trash", "icon xs")}</button>
      </div>`;
    }).join("");
  }

  function saveProfile(event) {
    event.preventDefault();
    const name = String(el.settingsName.value || "").trim().replace(/\s+/g, " ").slice(0, 40);
    store.updateSettings({ name, onboardingDone: true });
    toast(name ? `Perfil salvo. Olá, ${name}!` : "Nome removido do perfil.", "success");
  }

  async function enableNotifications() {
    if (!("Notification" in window)) {
      toast("Este navegador não oferece notificações.", "warning");
      return;
    }
    if (!window.isSecureContext) {
      toast("Notificações exigem HTTPS ou localhost. Em arquivo local elas podem não funcionar.", "warning", 6000);
    }
    try {
      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      if (permission === "denied") {
        store.updateSettings({ notifications: false });
        toast("Permissão negada. Libere as notificações nas configurações do navegador.", "warning", 6000);
        return;
      }
      store.updateSettings({ notifications: permission === "granted" });
      if (permission === "granted") {
        toast("Notificações ativadas.", "success");
        deliverNotifications(true);
      }
    } catch (error) {
      console.error("Notificações:", error);
      toast("Não foi possível ativar as notificações neste navegador.", "danger");
    }
  }

  async function testNotification() {
    if (!("Notification" in window)) {
      toast("Este navegador não oferece notificações.", "warning");
      return;
    }
    let permission = Notification.permission;
    if (permission === "default") {
      try { permission = await Notification.requestPermission(); }
      catch (error) { permission = "denied"; }
    }
    if (permission !== "granted") {
      toast("Permita as notificações no navegador para receber o teste.", "warning");
      return;
    }
    try {
      await showSystemNotification(
        "Meu Financeiro",
        "Notificações funcionando. Os avisos usam apenas os dados deste aparelho.",
        "meu-financeiro-teste",
      );
      toast("Notificação de teste enviada.", "success");
    } catch (error) {
      toast("O navegador bloqueou a notificação de teste.", "danger");
    }
  }

  function openPinModal() {
    const hasPin = Boolean(store.state.settings.pinHash);
    const body = `<div class="form-grid">
      ${hasPin ? `<label class="field span-2"><span>PIN atual</span><input name="current" type="password" inputmode="numeric" autocomplete="current-password" pattern="[0-9]{4,6}" minlength="4" maxlength="6" required></label>` : ""}
      <label class="field"><span>Novo PIN (4 a 6 dígitos)</span><input name="pin" type="password" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{4,6}" minlength="4" maxlength="6" required></label>
      <label class="field"><span>Confirmar novo PIN</span><input name="confirm" type="password" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{4,6}" minlength="4" maxlength="6" required></label>
    </div>
    <div class="hint">
      <strong>Importante sobre seus dados</strong>
      <p>Trocar o PIN não apaga suas receitas, despesas, metas ou demais registros. O novo código será usado nos próximos desbloqueios neste aparelho.</p>
      <p>O PIN bloqueia a interface, mas não criptografa os dados armazenados no navegador e não é sincronizado com outros aparelhos.</p>
      <p>Se esqueceu o PIN atual, não limpe os dados do navegador: isso pode apagar seus registros locais.</p>
    </div>
    ${hasPin ? `<button class="btn ghost small" type="button" data-action="remove-pin">Remover PIN</button>` : ""}`;

    openModal({
      title: hasPin ? "Alterar PIN" : "Definir PIN",
      subtitle: "O bloqueio é local, neste aparelho.",
      body,
      submit: hasPin ? "Salvar PIN" : "Ativar PIN",
      onSubmit: async (data) => {
        const pin = String(data.get("pin") || "").trim();
        const confirm = String(data.get("confirm") || "").trim();
        if (!/^\d{4,6}$/.test(pin)) throw new Error("O novo PIN deve ter de 4 a 6 números, sem letras ou espaços.");
        if (pin !== confirm) throw new Error("Os dois campos do novo PIN estão diferentes. Confira e digite novamente.");
        if (hasPin) {
          const current = String(data.get("current") || "").trim();
          const currentMatches = await pinMatches(current, store.state.settings.pinHash);
          if (!currentMatches) throw new Error("O PIN atual não confere. O PIN não foi alterado; confira o código e tente novamente.");
        }
        const pinHash = await hashPin(pin);
        store.updateSettings({ pinHash });
        return hasPin ? "PIN alterado com sucesso. Use o novo código no próximo desbloqueio." : "PIN ativado com sucesso.";
      },
    });
  }

  async function removePin() {
    const ok = await confirmDialog({
      title: "Remover PIN?",
      text: "O app deixará de pedir o código ao abrir neste aparelho.",
      ok: "Remover PIN",
    });
    if (!ok) return;
    closeModal();
    store.updateSettings({ pinHash: null });
    toast("PIN removido.", "success");
  }

  // ------------------------------------------------------------------- dados

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
      reader.readAsText(file, "utf-8");
    });
  }

  function exportBackup() {
    downloadFile(store.exportJSON(), fileName("meu-financeiro-backup", "json"), "application/json;charset=utf-8");
    toast("Backup baixado.", "success");
  }

  async function importBackupFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await readFile(file);
      const parsed = JSON.parse(text);
      const data = parsed && parsed.data ? parsed.data : parsed;
      if (!data || !Array.isArray(data.transactions)) {
        throw new Error("Arquivo inválido: não encontrei a lista de lançamentos.");
      }
      const ok = await confirmDialog({
        title: "Restaurar backup?",
        text: `${plural(data.transactions.length, "lançamento", "lançamentos")} serão restaurados e substituirão todos os dados atuais. O PIN salvo no backup também será restaurado.`,
        ok: "Restaurar backup",
        danger: true,
      });
      if (!ok) return;
      store.importJSON(text);
      state.chat = [];
      state.insights = [];
      navigate("dashboard");
      toast("Backup restaurado.", "success");
    } catch (error) {
      console.error("Importação de backup:", error);
      toast(error && error.message ? error.message : "Não foi possível restaurar o backup.", "danger", 7000);
    }
  }

  function openCsvHelp() {
    openModal({
      title: "Importar extrato CSV",
      subtitle: "Adicione movimentações de outro app ou banco.",
      body: `<p>O arquivo deve conter, no mínimo, <strong>data</strong>, <strong>descrição</strong> e <strong>valor</strong>. As colunas podem usar vírgula ou ponto e vírgula como separador.</p>
        <div class="code-block">data;descricao;valor;tipo;categoria<br>05/11/2026;Supermercado;152,90;despesa;Alimentação<br>01/11/2026;Salário;3500,00;receita;Salário</div>
        <ul class="hint-list">
          <li>Datas em <strong>AAAA-MM-DD</strong> ou <strong>DD/MM/AAAA</strong>.</li>
          <li>Valores com vírgula ou ponto. Valores negativos viram despesas.</li>
          <li>A coluna <strong>tipo</strong> ajuda a classificar receitas e despesas; sem ela, valores positivos entram como receita.</li>
          <li>Categorias são associadas pelo nome quando existirem.</li>
          <li>Linhas inválidas são ignoradas e mostradas antes da confirmação.</li>
        </ul>`,
      submit: "Escolher arquivo",
      onSubmit: () => {
        el.importCsv.click();
        closeModal();
        return false;
      },
    });
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9$ ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseDelimited(text) {
    const clean = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!clean) throw new Error("O arquivo está vazio.");
    const firstLine = clean.split(/\r?\n/)[0];
    const semicolons = (firstLine.match(/;/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    const delimiter = semicolons >= commas ? ";" : ",";
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < clean.length; index += 1) {
      const char = clean[index];
      if (quoted) {
        if (char === '"' && clean[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === delimiter) {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (char !== "\r") {
        field += char;
      }
    }
    row.push(field);
    rows.push(row);
    return rows.filter((line) => line.some((cell) => String(cell).trim() !== ""));
  }

  function parseFlexibleDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return core.isValidISODate(raw) ? raw : null;
    const match = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (!match) return null;
    let year = Number(match[3]);
    if (year < 100) year += year >= 50 ? 1900 : 2000;
    const iso = `${year}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
    return core.isValidISODate(iso) ? iso : null;
  }

  function parseCsvAmount(value) {
    const raw = String(value || "").trim();
    if (!raw) return NaN;
    const negative = /^-/.test(raw) || /^\(/.test(raw);
    const cleaned = raw.replace(/[^\d,.\-]/g, "");
    const number = parseAmount(cleaned);
    if (!Number.isFinite(number)) return NaN;
    return negative ? -Math.abs(number) : number;
  }

  function matchCategoryName(value, type) {
    const wanted = normalizeText(value);
    if (!wanted) return null;
    const options = store.categoriesByType(type);
    return options.find((category) => normalizeText(category.name) === wanted)
      || options.find((category) => normalizeText(category.name).includes(wanted) || wanted.includes(normalizeText(category.name)))
      || null;
  }

  function matchPaymentName(value) {
    const wanted = normalizeText(value);
    if (!wanted) return "other";
    const pairs = [
      ["pix", "pix"], ["dinheiro", "cash"], ["cash", "cash"], ["debito", "debit"],
      ["debit", "debit"], ["credito", "credit"], ["credit", "credit"], ["transferencia", "transfer"],
      ["transfer", "transfer"], ["boleto", "boleto"], ["outro", "other"], ["other", "other"],
    ];
    const found = pairs.find(([alias]) => wanted.includes(alias));
    return found ? found[1] : "other";
  }

  function detectCsvType(value, amount) {
    const text = normalizeText(value);
    if (/receita|entrada|credito|credit|income/.test(text)) return "income";
    if (/despesa|saida|debito|debit|expense|gasto/.test(text)) return "expense";
    return amount < 0 ? "expense" : "income";
  }

  function parseCsvText(text) {
    const table = parseDelimited(text);
    if (table.length < 2) throw new Error("O arquivo precisa ter um cabeçalho e pelo menos uma linha.");

    const aliases = {
      date: ["data", "date", "dia", "data movimentacao"],
      description: ["descricao", "historico", "lancamento", "estabelecimento", "memo", "title", "description"],
      amount: ["valor", "amount", "value", "quantia"],
      type: ["tipo", "type", "natureza"],
      category: ["categoria", "category"],
      payment: ["forma de pagamento", "forma", "pagamento", "payment", "metodo"],
      notes: ["observacoes", "observacao", "notas", "notes"],
      fixed: ["fixa", "fixo", "fixed", "recorrente"],
    };

    function findColumn(cells, names) {
      return cells.findIndex((cell) => {
        const header = normalizeText(cell);
        return names.some((name) => header === name || header.startsWith(`${name} `) || header.includes(name));
      });
    }

    let headerIndex = -1;
    let columns = null;
    for (let index = 0; index < Math.min(6, table.length); index += 1) {
      const cells = table[index].map((cell) => normalizeText(cell));
      const candidate = {
        date: findColumn(cells, aliases.date),
        description: findColumn(cells, aliases.description),
        amount: findColumn(cells, aliases.amount),
        type: findColumn(cells, aliases.type),
        category: findColumn(cells, aliases.category),
        payment: findColumn(cells, aliases.payment),
        notes: findColumn(cells, aliases.notes),
        fixed: findColumn(cells, aliases.fixed),
      };
      if (candidate.date >= 0 && candidate.description >= 0 && candidate.amount >= 0) {
        headerIndex = index;
        columns = candidate;
        break;
      }
    }

    if (!columns) {
      headerIndex = -1;
      columns = { date: 0, description: 1, amount: 2, type: 3, category: 4, payment: 5, notes: -1, fixed: -1 };
    }

    const rows = [];
    let skipped = 0;
    for (const line of table.slice(headerIndex + 1)) {
      try {
        const date = parseFlexibleDate(line[columns.date]);
        const description = String(line[columns.description] || "").trim().slice(0, 100);
        const rawAmount = parseCsvAmount(line[columns.amount]);
        if (!date || description.length < 2 || !Number.isFinite(rawAmount) || rawAmount === 0) {
          skipped += 1;
          continue;
        }
        const type = detectCsvType(columns.type >= 0 ? line[columns.type] : "", rawAmount);
        const category = matchCategoryName(columns.category >= 0 ? line[columns.category] : "", type);
        const payment = matchPaymentName(columns.payment >= 0 ? line[columns.payment] : "");
        const fixedText = columns.fixed >= 0 ? normalizeText(line[columns.fixed]) : "";
        rows.push({
          type,
          description,
          amount: core.round(Math.abs(rawAmount)),
          date,
          categoryId: category ? category.id : type === "income" ? "other-income" : "other-expense",
          payment,
          fixed: /^(sim|true|1|fixa|fixo|recorrente)$/.test(fixedText),
          notes: columns.notes >= 0 ? String(line[columns.notes] || "").slice(0, 500) : "",
        });
      } catch (error) {
        skipped += 1;
      }
    }

    return { rows, skipped, total: Math.max(0, table.length - headerIndex - 1) };
  }

  async function importCsvFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await readFile(file);
      const parsed = parseCsvText(text);
      if (!parsed.rows.length) {
        throw new Error("Nenhuma linha válida foi encontrada. Verifique data, descrição e valor.");
      }
      const income = core.round(parsed.rows.filter((row) => row.type === "income").reduce((total, row) => total + row.amount, 0));
      const expense = core.round(parsed.rows.filter((row) => row.type === "expense").reduce((total, row) => total + row.amount, 0));
      const ok = await confirmDialog({
        title: "Importar extrato?",
        text: `${plural(parsed.rows.length, "lançamento válido", "lançamentos válidos")} (${core.money(income)} em receitas e ${core.money(expense)} em despesas). ${parsed.skipped} linha(s) ignorada(s). Os lançamentos serão adicionados ao histórico existente.`,
        ok: "Importar",
        danger: false,
      });
      if (!ok) return;
      const added = store.addTransactions(parsed.rows);
      state.txFilters = { query: "", type: "", categoryId: "", month: "", payment: "" };
      navigate("transactions");
      toast(`${plural(added, "lançamento importado", "lançamentos importados")}.`, "success");
    } catch (error) {
      console.error("Importação CSV:", error);
      toast(error && error.message ? error.message : "Não foi possível importar o extrato.", "danger", 7000);
    }
  }

  async function installApp() {
    if (!state.deferredPrompt) {
      toast("Use o menu do navegador e escolha 'Instalar app' ou 'Adicionar à tela de início'.", "info", 6000);
      return;
    }
    state.deferredPrompt.prompt();
    try {
      const choice = await state.deferredPrompt.userChoice;
      toast(choice.outcome === "accepted" ? "Instalação iniciada." : "Instalação cancelada.", choice.outcome === "accepted" ? "success" : "info");
    } catch (error) {
      console.error("Instalação:", error);
    }
    state.deferredPrompt = null;
    el.btnInstall.hidden = true;
  }

  function resetData() {
    openModal({
      title: "Apagar todos os dados",
      subtitle: "Esta ação não pode ser desfeita.",
      body: `<p>Lançamentos, orçamentos, metas, contas, dívidas, assinaturas, recorrências e configurações serão apagados <strong>somente deste aparelho</strong>.</p>
        <p class="hint">Se quiser guardar uma cópia, cancele e use "Baixar backup (JSON)" antes de continuar.</p>
        <label class="field"><span>Digite APAGAR para confirmar</span><input name="confirmation" type="text" autocomplete="off" placeholder="APAGAR" required></label>`,
      submit: "Apagar tudo",
      onSubmit: (data) => {
        if (String(data.get("confirmation") || "").trim().toUpperCase() !== "APAGAR") {
          throw new Error("Digite APAGAR exatamente como solicitado.");
        }
        store.reset();
        state.chat = [];
        state.insights = [];
        state.txFilters = { query: "", type: "", categoryId: "", month: "", payment: "" };
        navigate("dashboard");
        window.setTimeout(maybeShowWelcome, 700);
        return "Todos os dados foram apagados.";
      },
    });
  }

  // --------------------------------------------------------------- ferramentas

  function showToolResult(container, html) {
    if (!container) return;
    container.innerHTML = html;
    container.hidden = false;
  }

  function validRate(value, label) {
    const parsed = usableAmount(value);
    if (parsed === null || parsed < 0 || parsed > 100) {
      throw new Error(`Informe uma ${label} entre 0 e 100.`);
    }
    return parsed;
  }

  function calculateInterest(event) {
    event.preventDefault();
    try {
      const data = new FormData(event.currentTarget);
      const initial = usableAmount(data.get("initial")) ?? 0;
      const monthly = usableAmount(data.get("monthly")) ?? 0;
      const rate = validRate(data.get("rate"), "taxa mensal");
      const months = Math.round(Number(data.get("months")));
      if (initial < 0 || monthly < 0) throw new Error("Os valores não podem ser negativos.");
      if (!Number.isFinite(months) || months < 1 || months > 600) throw new Error("Informe um período entre 1 e 600 meses.");
      if (initial === 0 && monthly === 0) throw new Error("Informe um valor inicial ou um aporte mensal.");

      const factor = rate > 0 ? Math.pow(1 + rate / 100, months) : 1;
      const contributed = core.round(initial + monthly * months);
      const finalValue = rate > 0
        ? core.round(initial * factor + monthly * ((factor - 1) / (rate / 100)))
        : core.round(initial + monthly * months);
      const interest = core.round(finalValue - contributed);
      const date = core.addMonthsISO(core.todayISO(), months);

      showToolResult(el.interestResult, `
        <div class="tool-highlight"><span>Valor final estimado</span><strong>${core.money(finalValue)}</strong></div>
        <div class="tool-grid">
          <div><span>Total investido</span><strong>${core.money(contributed)}</strong></div>
          <div><span>Rendimento</span><strong class="income">${core.money(interest)}</strong></div>
          <div><span>Período</span><strong>${plural(months, "mês", "meses")}</strong></div>
          <div><span>Data estimada</span><strong>${core.shortDate(date)}</strong></div>
        </div>
        <p class="tool-note">Simulação com juros compostos de ${rate.toFixed(2).replace(".", ",")}% ao mês e aportes ao fim de cada mês. Não considera impostos, taxas ou inflação.</p>
      `);
    } catch (error) {
      el.interestResult.hidden = true;
      toast(error.message || "Não foi possível calcular.", "warning");
    }
  }

  function calculateGoalSimulation(event) {
    event.preventDefault();
    try {
      const data = new FormData(event.currentTarget);
      const target = usableAmount(data.get("target"));
      const saved = usableAmount(data.get("saved")) ?? 0;
      const monthly = usableAmount(data.get("monthly"));
      const rate = validRate(data.get("rate"), "taxa mensal");
      if (target === null || target <= 0) throw new Error("Informe o valor da meta.");
      if (saved < 0) throw new Error("O valor já guardado não pode ser negativo.");
      if (monthly === null || monthly < 0) throw new Error("Informe a poupança mensal.");
      if (saved < target && monthly === 0 && rate === 0) throw new Error("Sem aporte mensal e sem rendimento, a meta não avança.");

      const monthlyRate = rate / 100;
      let balance = saved;
      let months = 0;
      const maxMonths = 1200;
      while (balance < target && months < maxMonths) {
        balance = balance * (1 + monthlyRate) + monthly;
        months += 1;
      }

      if (months >= maxMonths && balance < target) {
        throw new Error("Com esses valores a meta levaria mais de 100 anos. Ajuste o aporte mensal.");
      }

      const projected = core.round(balance);
      const contributed = core.round(saved + monthly * months);
      const interest = core.round(projected - contributed);
      const date = core.addMonthsISO(core.todayISO(), months);

      showToolResult(el.goalsimResult, `
        <div class="tool-highlight"><span>Tempo estimado</span><strong>${months === 0 ? "Meta já atingida" : plural(months, "mês", "meses")}</strong></div>
        <div class="tool-grid">
          <div><span>Valor projetado</span><strong>${core.money(projected)}</strong></div>
          <div><span>Total aportado</span><strong>${core.money(contributed)}</strong></div>
          <div><span>Rendimento</span><strong class="income">${core.money(interest)}</strong></div>
          <div><span>Previsão</span><strong>${core.shortDate(date)}</strong></div>
        </div>
        <p class="tool-note">Projeção mês a mês usando rendimento de ${rate.toFixed(2).replace(".", ",")}% ao mês. Para atingir ${core.money(target)}, faltam ${core.money(Math.max(0, target - saved))} no valor de hoje.</p>
      `);
    } catch (error) {
      el.goalsimResult.hidden = true;
      toast(error.message || "Não foi possível calcular.", "warning");
    }
  }

  function calculateInstallment(event) {
    event.preventDefault();
    try {
      const data = new FormData(event.currentTarget);
      const total = usableAmount(data.get("total"));
      const count = Math.round(Number(data.get("count")));
      const rate = validRate(data.get("rate"), "taxa mensal");
      if (total === null || total <= 0) throw new Error("Informe o valor da compra.");
      if (!Number.isFinite(count) || count < 2 || count > 120) throw new Error("Informe de 2 a 120 parcelas.");

      const monthlyRate = rate / 100;
      const installment = monthlyRate > 0
        ? total * monthlyRate / (1 - Math.pow(1 + monthlyRate, -count))
        : total / count;
      const paid = installment * count;
      const interest = paid - total;

      showToolResult(el.installmentResult, `
        <div class="tool-highlight"><span>Parcela estimada</span><strong>${core.money(installment)}</strong></div>
        <div class="tool-grid">
          <div><span>Total a pagar</span><strong>${core.money(paid)}</strong></div>
          <div><span>Juros embutidos</span><strong class="${interest > 0 ? "expense" : "income"}">${core.money(interest)}</strong></div>
          <div><span>Parcelas</span><strong>${count}x</strong></div>
          <div><span>Custo sobre o valor</span><strong>${total > 0 ? core.percent((interest / total) * 100, 1) : "—"}</strong></div>
        </div>
        <p class="tool-note">Tabela Price com juros de ${rate.toFixed(2).replace(".", ",")}% ao mês. Compare com o desconto para pagamento à vista antes de decidir.</p>
      `);
    } catch (error) {
      el.installmentResult.hidden = true;
      toast(error.message || "Não foi possível calcular.", "warning");
    }
  }

  // -------------------------------------------------------------- busca global

  const SEARCH_VIEW_ICONS = {
    dashboard: "dashboard",
    transactions: "list",
    planning: "target",
    reports: "chart",
    assistant: "sparkles",
    calendar: "calendar",
    tools: "tools",
    settings: "settings",
  };

  function openSearch() {
    if (!state.started) return;
    el.searchOverlay.hidden = false;
    document.body.classList.add("search-open");
    el.searchInput.value = "";
    renderSearchResults("");
    setTimeout(() => el.searchInput.focus(), 40);
  }

  function closeSearch() {
    el.searchOverlay.hidden = true;
    document.body.classList.remove("search-open");
    el.searchInput.value = "";
    el.searchResults.innerHTML = "";
  }

  function searchResultMarkup({ kind, id = "", view = "", iconName, color = "", title, subtitle, value = "", tone = "" }) {
    return `<button class="search-result" type="button" data-search-kind="${esc(kind)}" data-id="${esc(id)}" data-view-search="${esc(view)}">
      <span class="search-result-icon ${esc(tone)}" ${color ? `style="--result-color:${esc(color)}"` : ""}>${icon(iconName)}</span>
      <span class="search-result-info"><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></span>
      ${value ? `<span class="search-result-value ${esc(tone)}">${esc(value)}</span>` : ""}
    </button>`;
  }

  function renderSearchResults(rawQuery) {
    const query = normalizeText(rawQuery);
    let html = "";

    if (!query) {
      html += `<p class="search-group">Acesso rápido</p>`;
      html += VIEWS.map((view) => searchResultMarkup({
        kind: "view",
        view,
        iconName: SEARCH_VIEW_ICONS[view],
        title: VIEW_META[view].title,
        subtitle: VIEW_META[view].sub,
      })).join("");
      const recent = store.state.transactions.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
      if (recent.length) {
        html += `<p class="search-group">Últimos lançamentos</p>`;
        html += recent.map((transaction) => {
          const category = store.categoryById(transaction.categoryId);
          return searchResultMarkup({
            kind: "transaction",
            id: transaction.id,
            iconName: category ? category.icon : "list",
            color: category ? category.color : "#64748b",
            title: transaction.description,
            subtitle: `${core.shortDate(transaction.date)} · ${category ? category.name : "Sem categoria"}`,
            value: core.money(transaction.amount),
            tone: transaction.type,
          });
        }).join("");
      }
      el.searchResults.innerHTML = html;
      return;
    }

    const views = VIEWS.filter((view) => normalizeText(`${VIEW_META[view].title} ${VIEW_META[view].sub}`).includes(query));
    if (views.length) {
      html += `<p class="search-group">Telas</p>` + views.map((view) => searchResultMarkup({
        kind: "view",
        view,
        iconName: SEARCH_VIEW_ICONS[view],
        title: VIEW_META[view].title,
        subtitle: VIEW_META[view].sub,
      })).join("");
    }

    const transactions = store.state.transactions.filter((transaction) => {
      const category = store.categoryById(transaction.categoryId);
      return normalizeText(`${transaction.description} ${transaction.notes} ${category ? category.name : ""}`).includes(query);
    }).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    if (transactions.length) {
      html += `<p class="search-group">Lançamentos</p>` + transactions.map((transaction) => {
        const category = store.categoryById(transaction.categoryId);
        return searchResultMarkup({
          kind: "transaction",
          id: transaction.id,
          iconName: category ? category.icon : "list",
          color: category ? category.color : "#64748b",
          title: transaction.description,
          subtitle: `${core.shortDate(transaction.date)} · ${category ? category.name : "Sem categoria"}`,
          value: core.money(transaction.amount),
          tone: transaction.type,
        });
      }).join("");
    }

    const categories = store.state.categories.filter((category) => normalizeText(category.name).includes(query)).slice(0, 4);
    if (categories.length) {
      html += `<p class="search-group">Categorias</p>` + categories.map((category) => searchResultMarkup({
        kind: "category",
        id: category.id,
        iconName: category.icon,
        color: category.color,
        title: category.name,
        subtitle: category.type === "income" ? "Categoria de receita" : "Categoria de despesa",
      })).join("");
    }

    const goals = store.state.goals.filter((goal) => normalizeText(goal.name).includes(query)).slice(0, 4);
    if (goals.length) {
      html += `<p class="search-group">Metas</p>` + goals.map((goal) => searchResultMarkup({
        kind: "goal",
        id: goal.id,
        iconName: "flag",
        title: goal.name,
        subtitle: `${core.money(goal.saved)} de ${core.money(goal.target)}`,
        value: percentLabel(goal.target > 0 ? goal.saved / goal.target : 0),
        tone: "income",
      })).join("");
    }

    const bills = store.state.bills.filter((bill) => normalizeText(bill.name).includes(query)).slice(0, 4);
    if (bills.length) {
      html += `<p class="search-group">Contas</p>` + bills.map((bill) => searchResultMarkup({
        kind: "bill",
        id: bill.id,
        iconName: "receipt",
        title: bill.name,
        subtitle: `${bill.paid ? "Paga" : "Em aberto"} · vencimento ${core.shortDate(bill.dueDate)}`,
        value: core.money(bill.amount),
        tone: bill.paid ? "income" : "expense",
      })).join("");
    }

    const debts = store.state.debts.filter((debt) => normalizeText(debt.name).includes(query)).slice(0, 4);
    if (debts.length) {
      html += `<p class="search-group">Dívidas</p>` + debts.map((debt) => searchResultMarkup({
        kind: "debt",
        id: debt.id,
        iconName: "wallet",
        title: debt.name,
        subtitle: `${debt.paidInstallments} de ${debt.installments} parcelas pagas`,
        value: core.money(debt.total),
        tone: "expense",
      })).join("");
    }

    const subscriptions = store.state.subscriptions.filter((subscription) => normalizeText(subscription.name).includes(query)).slice(0, 4);
    if (subscriptions.length) {
      html += `<p class="search-group">Assinaturas</p>` + subscriptions.map((subscription) => searchResultMarkup({
        kind: "subscription",
        id: subscription.id,
        iconName: "repeat",
        title: subscription.name,
        subtitle: `${subscription.cycle === "yearly" ? "Anual" : "Mensal"} · próxima ${core.shortDate(subscription.nextDate)}`,
        value: core.money(subscription.amount),
        tone: "expense",
      })).join("");
    }

    el.searchResults.innerHTML = html || `<div class="search-empty">${emptyState("search", "Nada encontrado", "Tente outro termo ou navegue pelas telas usando o menu.")}</div>`;
  }

  function openSearchResult(button) {
    const kind = button.dataset.searchKind;
    const id = button.dataset.id;
    const view = button.dataset.viewSearch;
    closeSearch();
    if (kind === "view") {
      navigate(view);
      return;
    }
    if (kind === "transaction") {
      const transaction = findTransaction(id);
      if (transaction) {
        navigate("transactions");
        openTransactionModal(transaction);
      }
      return;
    }
    if (kind === "goal") {
      const goal = store.state.goals.find((entry) => entry.id === id);
      if (goal) openGoalModal(goal);
      return;
    }
    if (kind === "bill") {
      const bill = store.state.bills.find((entry) => entry.id === id);
      if (bill) openBillModal(bill);
      return;
    }
    if (kind === "debt") {
      const debt = store.state.debts.find((entry) => entry.id === id);
      if (debt) openDebtModal(debt);
      return;
    }
    if (kind === "subscription") {
      const subscription = store.state.subscriptions.find((entry) => entry.id === id);
      if (subscription) openSubscriptionModal(subscription);
      return;
    }
    if (kind === "category") {
      const category = store.categoryById(id);
      if (category) openCategoryModal(category);
    }
  }

  // -------------------------------------------------------------- notificações

  async function showSystemNotification(title, body, tag) {
    const options = {
      body,
      icon: "./icons/icone-512.png",
      badge: "./icons/icone.svg",
      tag,
      data: { url: "./" },
    };
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration && typeof registration.showNotification === "function") {
          await registration.showNotification(title, options);
          return;
        }
      } catch (error) {
        console.warn("Falha ao notificar pelo service worker:", error);
      }
    }
    new Notification(title, options);
  }

  async function deliverNotifications(force = false) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (!force && store.state.settings.notifications !== true) return;

    const today = core.todayISO();
    const items = [];
    const overdue = store.overdueBills(today);
    const upcoming = store.upcomingBills(7, today).filter((bill) => bill.dueDate >= today);
    const budget = store.budgetUsage();
    const reached = store.state.goals.filter((goal) => goal.target > 0 && goal.saved >= goal.target);

    if (overdue.length) {
      items.push({
        key: "contas-atrasadas",
        title: plural(overdue.length, "Conta atrasada", "Contas atrasadas"),
        body: overdue.slice(0, 4).map((bill) => `${bill.name}: ${core.money(bill.amount)} (venceu ${core.shortDate(bill.dueDate)})`).join("\n"),
      });
    }
    if (upcoming.length) {
      items.push({
        key: "contas-proximas",
        title: "Contas próximas do vencimento",
        body: upcoming.slice(0, 4).map((bill) => `${bill.name}: ${core.money(bill.amount)} em ${core.shortDate(bill.dueDate)}`).join("\n"),
      });
    }
    if (budget.total && budget.ratio >= 0.8) {
      items.push({
        key: `orcamento-${core.monthKey(today)}`,
        title: budget.ratio >= 1 ? "Orçamento estourado" : "Orçamento perto do limite",
        body: budget.ratio >= 1
          ? `Você usou ${percentLabel(budget.ratio)} do orçamento de ${core.money(budget.total)}. Excedente de ${core.money(budget.spent - budget.total)}.`
          : `Você usou ${percentLabel(budget.ratio)} do orçamento. Restam ${core.money(budget.remaining)}.`,
      });
    }
    if (reached.length) {
      items.push({
        key: "metas-alcancadas",
        title: plural(reached.length, "Meta alcançada", "Metas alcançadas"),
        body: reached.slice(0, 3).map((goal) => `${goal.name}: ${core.money(goal.saved)} de ${core.money(goal.target)}`).join("\n"),
      });
    }

    const weekday = new Date().getDay();
    if (weekday === 1) {
      const week = core.periodRange("week", today);
      const totals = store.totals(week[0], today);
      if (totals.income || totals.expense) {
        items.push({
          key: `resumo-semanal-${week[0]}`,
          title: "Resumo da semana",
          body: `Receitas: ${core.money(totals.income)}\nDespesas: ${core.money(totals.expense)}\nResultado: ${core.money(totals.result)}`,
        });
      }
    }

    if (Number(today.slice(8)) === 1) {
      const previousKey = core.monthKey(core.addMonthsISO(core.startOfMonth(today), -1));
      const previousRange = core.monthRange(previousKey);
      const totals = store.totals(previousRange[0], previousRange[1]);
      if (totals.income || totals.expense) {
        items.push({
          key: `resumo-mensal-${previousKey}`,
          title: `Resumo de ${monthLong(previousKey)}`,
          body: `Receitas: ${core.money(totals.income)}\nDespesas: ${core.money(totals.expense)}\nResultado: ${core.money(totals.result)}`,
        });
      }
    }

    let sent = 0;
    for (const item of items) {
      if (sent >= 3) break;
      if (store.alertAlreadySent(item.key)) continue;
      try {
        await showSystemNotification(item.title, item.body, item.key);
        store.rememberAlert(item.key);
        sent += 1;
      } catch (error) {
        console.warn("Notificação bloqueada pelo navegador:", error);
        break;
      }
    }
  }

  window.FinApp = { state, toast, navigate, parseVoiceTransaction, openVoiceModal };
  init();
})();
