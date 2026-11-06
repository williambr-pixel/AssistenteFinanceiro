"use strict";

(() => {
  const STORAGE_KEY = "meu-financeiro-lancamentos-v1";
  const PERIODS = {
    diario: { label: "GASTOS DE HOJE", range: "Hoje" },
    semanal: { label: "GASTOS DESTA SEMANA", range: "Esta semana" },
    mensal: { label: "GASTOS DESTE MÊS", range: "Este mês" },
    anual: { label: "GASTOS DESTE ANO", range: "Este ano" },
  };
  const currency = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const longDateFormatter = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const elements = {
    balance: document.querySelector("#balance-value"),
    income: document.querySelector("#income-total"),
    expense: document.querySelector("#expense-total"),
    today: document.querySelector("#today-label"),
    form: document.querySelector("#entry-form"),
    description: document.querySelector("#description"),
    amount: document.querySelector("#amount"),
    entryDate: document.querySelector("#entry-date"),
    formMessage: document.querySelector("#form-message"),
    recentList: document.querySelector("#recent-list"),
    reportLabel: document.querySelector("#period-label"),
    reportTotal: document.querySelector("#period-total"),
    reportRange: document.querySelector("#period-range"),
    reportCount: document.querySelector("#report-count"),
    reportList: document.querySelector("#report-list"),
    exportButton: document.querySelector("#export-button"),
    installButton: document.querySelector("#install-button"),
    toast: document.querySelector("#toast"),
  };

  let entries = loadEntries();
  let selectedPeriod = "diario";
  let toastTimer;
  let deferredInstallPrompt = null;

  function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseLocalDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }

  function loadEntries() {
    let stored;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
      if (stored === null) return [];
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed) || !parsed.every(isValidEntry)) {
        throw new Error("Os lançamentos salvos têm um formato inválido.");
      }
      return parsed;
    } catch (error) {
      document.querySelector("#form-message").textContent =
        "Não foi possível ler os dados salvos. Não faça novos lançamentos até verificar o armazenamento do navegador.";
      document.querySelector("#entry-form button[type=submit]").disabled = true;
      console.error("Erro ao carregar lançamentos:", error);
      return [];
    }
  }

  function isValidEntry(entry) {
    return (
      entry !== null &&
      typeof entry === "object" &&
      typeof entry.id === "string" &&
      typeof entry.description === "string" &&
      entry.description.trim().length > 0 &&
      Number.isFinite(entry.amount) &&
      entry.amount > 0 &&
      (entry.type === "entrada" || entry.type === "saida") &&
      typeof entry.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
    );
  }

  function persist(candidate) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate));
      entries = candidate;
      return true;
    } catch (error) {
      console.error("Erro ao salvar lançamentos:", error);
      showToast("Não foi possível salvar. Verifique o espaço disponível no aparelho.");
      return false;
    }
  }

  function currentType() {
    return document.querySelector('input[name="type"]:checked').value;
  }

  function parseAmount(text) {
    let value = text.trim().replace(/\s/g, "");
    if (!value) return NaN;
    if (value.includes(",")) {
      value = value.replace(/\./g, "").replace(",", ".");
    }
    return Number(value);
  }

  function entryOrder(a, b) {
    return b.date.localeCompare(a.date) || b.id.localeCompare(a.id);
  }

  function render() {
    const income = entries
      .filter((entry) => entry.type === "entrada")
      .reduce((total, entry) => total + entry.amount, 0);
    const expense = entries
      .filter((entry) => entry.type === "saida")
      .reduce((total, entry) => total + entry.amount, 0);
    elements.balance.textContent = currency.format(income - expense);
    elements.income.textContent = currency.format(income);
    elements.expense.textContent = currency.format(expense);
    renderTransactions(
      elements.recentList,
      [...entries].sort(entryOrder).slice(0, 5),
      "Seus lançamentos vão aparecer aqui. Anote o primeiro acima!",
      false,
    );
    renderReport();
  }

  function renderTransactions(list, items, emptyMessage, canDelete) {
    list.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      empty.textContent = emptyMessage;
      list.append(empty);
      return;
    }

    for (const entry of items) {
      const item = document.createElement("li");
      item.className = "transaction-item";
      const symbol = document.createElement("span");
      symbol.className = `transaction-symbol ${entry.type === "entrada" ? "is-income" : "is-expense"}`;
      symbol.setAttribute("aria-hidden", "true");
      symbol.textContent = entry.type === "entrada" ? "+" : "−";

      const info = document.createElement("div");
      info.className = "transaction-info";
      const name = document.createElement("p");
      name.className = "transaction-name";
      name.textContent = entry.description;
      const date = document.createElement("p");
      date.className = "transaction-date";
      date.textContent = dateFormatter.format(parseLocalDate(entry.date));
      info.append(name, date);

      const side = document.createElement("div");
      side.className = "transaction-side";
      const amount = document.createElement("span");
      amount.className = `transaction-amount ${entry.type === "entrada" ? "is-income" : ""}`;
      amount.textContent = `${entry.type === "entrada" ? "+" : "−"} ${currency.format(entry.amount)}`;
      side.append(amount);

      if (canDelete) {
        const remove = document.createElement("button");
        remove.className = "delete-button";
        remove.type = "button";
        remove.dataset.deleteId = entry.id;
        remove.setAttribute("aria-label", `Apagar lançamento: ${entry.description}`);
        remove.textContent = "×";
        side.append(remove);
      }
      item.append(symbol, info, side);
      list.append(item);
    }
  }

  function periodBounds(period, now = new Date()) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    if (period === "diario") {
      return [localDateString(today), localDateString(today)];
    }
    if (period === "semanal") {
      const start = new Date(today);
      start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return [localDateString(start), localDateString(end)];
    }
    if (period === "mensal") {
      return [
        localDateString(new Date(today.getFullYear(), today.getMonth(), 1, 12)),
        localDateString(new Date(today.getFullYear(), today.getMonth() + 1, 0, 12)),
      ];
    }
    if (period === "anual") {
      return [
        localDateString(new Date(today.getFullYear(), 0, 1, 12)),
        localDateString(new Date(today.getFullYear(), 11, 31, 12)),
      ];
    }
    throw new Error(`Período inválido: ${period}`);
  }

  function formatPeriodRange(period, start, end) {
    const startDate = parseLocalDate(start);
    const endDate = parseLocalDate(end);
    if (period === "diario") return dateFormatter.format(startDate);
    if (period === "semanal") {
      return `${dateFormatter.format(startDate)} — ${dateFormatter.format(endDate)}`;
    }
    if (period === "mensal") {
      return new Intl.DateTimeFormat("pt-BR", {
        month: "long",
        year: "numeric",
      }).format(startDate);
    }
    return String(startDate.getFullYear());
  }

  function periodEntries(period = selectedPeriod) {
    const [start, end] = periodBounds(period);
    return entries
      .filter(
        (entry) =>
          entry.type === "saida" && entry.date >= start && entry.date <= end,
      )
      .sort(entryOrder);
  }

  function renderReport() {
    const config = PERIODS[selectedPeriod];
    const [start, end] = periodBounds(selectedPeriod);
    const items = periodEntries();
    const total = items.reduce((sum, entry) => sum + entry.amount, 0);
    elements.reportLabel.textContent = config.label;
    elements.reportTotal.textContent = currency.format(total);
    elements.reportRange.textContent = formatPeriodRange(selectedPeriod, start, end);
    elements.reportCount.textContent = `${items.length} ${items.length === 1 ? "gasto" : "gastos"}`;
    renderTransactions(
      elements.reportList,
      items,
      "Nenhum gasto neste período. Seus novos lançamentos aparecerão aqui.",
      true,
    );
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2800);
  }

  function downloadReport() {
    const [start, end] = periodBounds(selectedPeriod);
    const items = periodEntries();
    const rows = [
      ["Data", "Descrição", "Valor (R$)"],
      ...items.map((entry) => [
        entry.date,
        entry.description,
        entry.amount.toFixed(2).replace(".", ","),
      ]),
      ["Total do período", "", items.reduce((sum, entry) => sum + entry.amount, 0).toFixed(2).replace(".", ",")],
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `gastos_${selectedPeriod}_${start}_${end}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Relatório baixado.");
  }

  function csvCell(value) {
    return `"${String(value).replace(/"/g, '""')}"`;
  }

  function setView(viewName) {
    for (const view of document.querySelectorAll(".view")) {
      const active = view.id === viewName;
      view.hidden = !active;
      view.classList.toggle("active", active);
    }
    for (const button of document.querySelectorAll(".nav-button")) {
      const active = button.dataset.view === viewName;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
    if (viewName === "relatorios") renderReport();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.hidden = false;
  });

  elements.installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
    if (choice.outcome === "accepted") showToast("Instalação iniciada.");
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    elements.installButton.hidden = true;
    showToast("App instalado com sucesso!");
  });

  function updateTypePicker() {
    for (const option of document.querySelectorAll(".type-option")) {
      option.classList.toggle(
        "selected",
        option.querySelector("input").checked,
      );
    }
  }

  elements.today.textContent = longDateFormatter.format(new Date());
  elements.entryDate.value = localDateString(new Date());
  elements.form.addEventListener("change", (event) => {
    if (event.target.name === "type") updateTypePicker();
  });

  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    elements.formMessage.textContent = "";
    const description = elements.description.value.trim();
    const amount = parseAmount(elements.amount.value);
    const date = elements.entryDate.value;
    if (!description) {
      elements.formMessage.textContent = "Escreva uma descrição para o lançamento.";
      elements.description.focus();
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      elements.formMessage.textContent = "Digite um valor válido maior que zero.";
      elements.amount.focus();
      return;
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      elements.formMessage.textContent = "Escolha uma data válida.";
      elements.entryDate.focus();
      return;
    }

    const type = currentType();
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description,
      amount,
      type,
      date,
    };
    if (!persist([...entries, entry])) return;

    elements.form.reset();
    document.querySelector('input[name="type"][value="saida"]').checked = true;
    elements.entryDate.value = localDateString(new Date());
    updateTypePicker();
    render();
    showToast(type === "saida" ? "Gasto anotado!" : "Entrada anotada!");
    elements.description.focus();
  });

  document.querySelectorAll(".nav-button, .text-button").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  document.querySelectorAll(".period-button").forEach((button) => {
    button.addEventListener("click", () => {
      selectedPeriod = button.dataset.period;
      document.querySelectorAll(".period-button").forEach((periodButton) => {
        const active = periodButton === button;
        periodButton.classList.toggle("active", active);
        periodButton.setAttribute("aria-pressed", String(active));
      });
      renderReport();
    });
  });

  elements.reportList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-id]");
    if (!button) return;
    const entry = entries.find((item) => item.id === button.dataset.deleteId);
    if (!entry || !window.confirm(`Apagar o lançamento "${entry.description}"?`)) {
      return;
    }
    if (persist(entries.filter((item) => item.id !== entry.id))) {
      render();
      showToast("Lançamento apagado.");
    }
  });

  elements.exportButton.addEventListener("click", downloadReport);
  render();

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch((error) => {
        console.error("Não foi possível ativar o modo offline:", error);
      });
    });
  }
})();
