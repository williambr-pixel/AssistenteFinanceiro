"use strict";

/**
 * Núcleo de dados do Meu Financeiro.
 *
 * Responsabilidades:
 * - carregar/salvar o estado no localStorage (com migração da versão antiga);
 * - manter categorias, lançamentos, orçamentos, metas, dívidas, assinaturas,
 *   contas a pagar e recorrências;
 * - oferecer consultas e cálculos usados por todas as telas.
 *
 * Nenhum dado fictício é criado: o estado começa vazio e só recebe o que a
 * pessoa cadastrar (as categorias padrão são apenas configuração).
 */
window.Fin = window.Fin || {};

(function (Fin) {
  const STORAGE_KEY = "meu-financeiro-dados-v2";
  const LEGACY_KEY = "meu-financeiro-lancamentos-v1";
  const ALERTS_KEY = "meu-financeiro-alertas-v1";
  const SCHEMA_VERSION = 2;

  const PAYMENTS = {
    pix: "Pix",
    cash: "Dinheiro",
    debit: "Débito",
    credit: "Crédito",
    transfer: "Transferência",
    boleto: "Boleto",
    other: "Outro",
  };

  const FREQUENCIES = {
    weekly: "Semanal",
    monthly: "Mensal",
    yearly: "Anual",
  };

  const PERIOD_LABELS = {
    day: "Hoje",
    week: "Esta semana",
    month: "Este mês",
    year: "Este ano",
  };

  const DEFAULT_CATEGORIES = [
    { id: "housing", name: "Moradia", type: "expense", color: "#3b82f6", icon: "home", system: true },
    { id: "food", name: "Alimentação", type: "expense", color: "#f59e0b", icon: "food", system: true },
    { id: "transport", name: "Transporte", type: "expense", color: "#8b5cf6", icon: "car", system: true },
    { id: "health", name: "Saúde", type: "expense", color: "#ef4444", icon: "heart", system: true },
    { id: "education", name: "Educação", type: "expense", color: "#06b6d4", icon: "book", system: true },
    { id: "leisure", name: "Lazer", type: "expense", color: "#ec4899", icon: "sparkles", system: true },
    { id: "shopping", name: "Compras", type: "expense", color: "#a855f7", icon: "bag", system: true },
    { id: "bills", name: "Contas", type: "expense", color: "#0ea5e9", icon: "receipt", system: true },
    { id: "other-expense", name: "Outros gastos", type: "expense", color: "#64748b", icon: "dots", system: true },
    { id: "salary", name: "Salário", type: "income", color: "#10b981", icon: "briefcase", system: true },
    { id: "freelance", name: "Freelance", type: "income", color: "#14b8a6", icon: "laptop", system: true },
    { id: "investments", name: "Investimentos", type: "income", color: "#22c55e", icon: "trend", system: true },
    { id: "gifts", name: "Presentes", type: "income", color: "#84cc16", icon: "gift", system: true },
    { id: "other-income", name: "Outras receitas", type: "income", color: "#64748b", icon: "dots", system: true },
  ];

  // ---------------------------------------------------------------- utilidades

  function uid(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return `${prefix}_${window.crypto.randomUUID().slice(0, 8)}`;
    }
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  const pad = (value) => String(value).padStart(2, "0");

  function toISO(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseISO(iso) {
    const [year, month, day] = String(iso).split("-").map(Number);
    return new Date(year, month - 1, day, 12);
  }

  function todayISO() {
    return toISO(new Date());
  }

  function addDaysISO(iso, days) {
    const date = parseISO(iso);
    date.setDate(date.getDate() + days);
    return toISO(date);
  }

  function addMonthsISO(iso, months) {
    const date = parseISO(iso);
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(day, lastDay));
    return toISO(date);
  }

  function isValidISODate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
    const date = parseISO(value);
    return !Number.isNaN(date.getTime()) && toISO(date) === value;
  }

  function monthKey(iso) {
    return String(iso).slice(0, 7);
  }

  function monthRange(key) {
    const [year, month] = key.split("-").map(Number);
    return [`${key}-01`, toISO(new Date(year, month, 0, 12))];
  }

  function startOfMonth(iso) {
    return `${monthKey(iso)}-01`;
  }

  function endOfMonth(iso) {
    return monthRange(monthKey(iso))[1];
  }

  function startOfWeek(iso) {
    const date = parseISO(iso);
    const shift = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - shift);
    return toISO(date);
  }

  function endOfWeek(iso) {
    return addDaysISO(startOfWeek(iso), 6);
  }

  function startOfYear(iso) {
    return `${String(iso).slice(0, 4)}-01-01`;
  }

  function endOfYear(iso) {
    return `${String(iso).slice(0, 4)}-12-31`;
  }

  function periodRange(period, reference = todayISO()) {
    if (period === "day") return [reference, reference];
    if (period === "week") return [startOfWeek(reference), endOfWeek(reference)];
    if (period === "year") return [startOfYear(reference), endOfYear(reference)];
    return [startOfMonth(reference), endOfMonth(reference)];
  }

  function previousPeriodRange(period, reference = todayISO()) {
    if (period === "day") {
      const yesterday = addDaysISO(reference, -1);
      return [yesterday, yesterday];
    }
    if (period === "week") {
      const start = addDaysISO(startOfWeek(reference), -7);
      return [start, addDaysISO(start, 6)];
    }
    if (period === "year") {
      const year = Number(String(reference).slice(0, 4)) - 1;
      return [`${year}-01-01`, `${year}-12-31`];
    }
    const previous = addMonthsISO(startOfMonth(reference), -1);
    return [startOfMonth(previous), endOfMonth(previous)];
  }

  function daysInMonth(key) {
    return Number(monthRange(key)[1].slice(8));
  }

  function monthLabel(key, style = "long") {
    const [year, month] = key.split("-").map(Number);
    return new Intl.DateTimeFormat("pt-BR", { month: style, year: "numeric" }).format(
      new Date(year, month - 1, 1, 12),
    );
  }

  function shortDate(iso) {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(parseISO(iso));
  }

  function longDate(iso) {
    return new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(parseISO(iso));
  }

  const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  function money(value) {
    const number = Number(value);
    return moneyFormatter.format(Number.isFinite(number) ? number : 0);
  }

  function compactMoney(value) {
    const number = Number(value) || 0;
    if (Math.abs(number) >= 1000000) return `R$ ${(number / 1000000).toFixed(1).replace(".", ",")} mi`;
    if (Math.abs(number) >= 1000) return `R$ ${(number / 1000).toFixed(1).replace(".", ",")} mil`;
    return money(number);
  }

  function percent(value, digits = 0) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return `${number.toFixed(digits).replace(".", ",")}%`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  }

  // ------------------------------------------------------------------ estado

  function defaultState() {
    return {
      version: SCHEMA_VERSION,
      transactions: [],
      categories: DEFAULT_CATEGORIES.map((category) => ({ ...category })),
      budgets: {},
      goals: [],
      debts: [],
      subscriptions: [],
      recurrences: [],
      bills: [],
      settings: {
        name: "",
        theme: "system",
        accent: "emerald",
        pinHash: null,
        notifications: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      meta: {
        migratedFromV1: false,
        lastRecurrenceRun: null,
      },
    };
  }

  function normalizeCategory(raw, fallbackType) {
    if (!raw || typeof raw !== "object") return null;
    const name = String(raw.name || "").trim();
    if (!name) return null;
    const type = raw.type === "income" ? "income" : raw.type === "expense" ? "expense" : fallbackType;
    return {
      id: String(raw.id || uid("cat")),
      name,
      type,
      color: /^#[0-9a-f]{6}$/i.test(String(raw.color)) ? raw.color : "#64748b",
      icon: String(raw.icon || "dots"),
      system: Boolean(raw.system),
    };
  }

  function normalizeTransaction(raw, categories) {
    if (!raw || typeof raw !== "object") return null;
    const description = String(raw.description || "").trim();
    const amount = Number(raw.amount);
    const date = String(raw.date || "");
    if (!description || !Number.isFinite(amount) || amount <= 0 || !isValidISODate(date)) return null;
    const type = raw.type === "income" ? "income" : "expense";
    const categoryFallback = type === "income" ? "other-income" : "other-expense";
    const categoryId = categories.some((category) => category.id === raw.categoryId)
      ? raw.categoryId
      : categoryFallback;
    return {
      id: String(raw.id || uid("tx")),
      type,
      description,
      amount: round(amount, 2),
      date,
      categoryId,
      payment: PAYMENTS[raw.payment] ? raw.payment : "other",
      fixed: Boolean(raw.fixed),
      notes: String(raw.notes || "").slice(0, 500),
      recurrenceId: raw.recurrenceId ? String(raw.recurrenceId) : null,
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    };
  }

  function normalizeState(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== "object") return base;

    const state = { ...base, ...raw };
    state.settings = { ...base.settings, ...(raw.settings || {}) };
    state.meta = { ...base.meta, ...(raw.meta || {}) };

    const categories = Array.isArray(raw.categories)
      ? raw.categories.map((category) => normalizeCategory(category, "expense")).filter(Boolean)
      : [];
    state.categories = categories.length ? categories : base.categories;

    state.transactions = (Array.isArray(raw.transactions) ? raw.transactions : [])
      .map((transaction) => normalizeTransaction(transaction, state.categories))
      .filter(Boolean);

    state.budgets = raw.budgets && typeof raw.budgets === "object" ? raw.budgets : {};
    state.goals = (Array.isArray(raw.goals) ? raw.goals : []).filter((goal) => goal && goal.id && goal.name);
    state.debts = (Array.isArray(raw.debts) ? raw.debts : []).filter((debt) => debt && debt.id && debt.name);
    state.subscriptions = (Array.isArray(raw.subscriptions) ? raw.subscriptions : []).filter(
      (subscription) => subscription && subscription.id && subscription.name,
    );
    state.recurrences = (Array.isArray(raw.recurrences) ? raw.recurrences : []).filter(
      (recurrence) => recurrence && recurrence.id && recurrence.description,
    );
    state.bills = (Array.isArray(raw.bills) ? raw.bills : []).filter((bill) => bill && bill.id && bill.name);

    state.version = SCHEMA_VERSION;
    return state;
  }

  /** Converte os lançamentos da versão antiga (v1) sem perder nada. */
  function migrateLegacy() {
    const state = defaultState();
    let stored;
    try {
      stored = localStorage.getItem(LEGACY_KEY);
    } catch (error) {
      return { state, error: null };
    }
    if (!stored) return { state, error: null };

    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) throw new Error("Formato inesperado");
      const migrated = parsed
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const type = entry.type === "entrada" ? "income" : "expense";
          return normalizeTransaction(
            {
              id: entry.id,
              type,
              description: entry.description,
              amount: entry.amount,
              date: entry.date,
              categoryId: type === "income" ? "other-income" : "other-expense",
              payment: "other",
              createdAt: entry.createdAt,
            },
            state.categories,
          );
        })
        .filter(Boolean);
      state.transactions = migrated;
      state.meta.migratedFromV1 = migrated.length > 0;
      return { state, error: null };
    } catch (error) {
      localStorage.removeItem(LEGACY_KEY);
      return {
        state,
        error: "Não foi possível ler os dados da versão anterior. Uma cópia foi preservada no console.",
        legacyRaw: stored,
      };
    }
  }

  function loadState() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return { state: defaultState(), error: "O armazenamento do navegador não está disponível." };
    }

    if (raw) {
      try {
        return { state: normalizeState(JSON.parse(raw)), error: null };
      } catch (error) {
        console.error("Dados corrompidos no armazenamento:", error);
        return {
          state: defaultState(),
          error:
            "Os dados salvos estão corrompidos e não puderam ser lidos. Faça uma cópia de segurança do armazenamento antes de continuar.",
        };
      }
    }

    const { state, error, legacyRaw } = migrateLegacy();
    if (legacyRaw) console.warn("Conteúdo antigo preservado:", legacyRaw);
    return { state, error };
  }

  function persist(state) {
    state.settings.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  const loaded = loadState();
  let current = loaded.state;
  const listeners = new Set();

  // Recorrências são geradas na abertura do app; falhas não impedem o uso.
  try {
    const generated = runRecurrences(current);
    if (generated > 0) persist(current);
  } catch (error) {
    console.error("Não foi possível gerar as recorrências:", error);
  }

  function notify() {
    listeners.forEach((listener) => {
      try {
        listener(current);
      } catch (error) {
        console.error("Erro ao atualizar a interface:", error);
      }
    });
  }

  function save() {
    try {
      persist(current);
      return true;
    } catch (error) {
      console.error("Erro ao salvar:", error);
      return false;
    }
  }

  function update(mutator) {
    mutator(current);
    const saved = save();
    notify();
    return saved;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function replace(nextState) {
    current = normalizeState(nextState);
    save();
    notify();
  }

  function reset() {
    current = defaultState();
    persist(current);
    notify();
  }

  // -------------------------------------------------------------- consultas

  function transactionInRange(transaction, from, to) {
    return transaction.date >= from && transaction.date <= to;
  }

  function listTransactions(from, to, filters = {}) {
    return current.transactions
      .filter((transaction) => {
        if (from && to && !transactionInRange(transaction, from, to)) return false;
        if (filters.type && transaction.type !== filters.type) return false;
        if (filters.categoryId && transaction.categoryId !== filters.categoryId) return false;
        if (filters.payment && transaction.payment !== filters.payment) return false;
        if (filters.fixed !== undefined && Boolean(transaction.fixed) !== filters.fixed) return false;
        if (filters.query) {
          const haystack = `${transaction.description} ${transaction.notes}`.toLowerCase();
          if (!haystack.includes(filters.query.toLowerCase())) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }

  function totals(from, to) {
    let income = 0;
    let expense = 0;
    for (const transaction of current.transactions) {
      if (!transactionInRange(transaction, from, to)) continue;
      if (transaction.type === "income") income += transaction.amount;
      else expense += transaction.amount;
    }
    return { income: round(income), expense: round(expense), result: round(income - expense) };
  }

  function balanceUntil(iso = todayISO()) {
    let balance = 0;
    for (const transaction of current.transactions) {
      if (transaction.date > iso) continue;
      balance += transaction.type === "income" ? transaction.amount : -transaction.amount;
    }
    return round(balance);
  }

  function categoryById(id) {
    return current.categories.find((category) => category.id === id) || null;
  }

  function categoriesByType(type) {
    return current.categories.filter((category) => category.type === type);
  }

  function expensesByCategory(from, to) {
    const map = new Map();
    for (const transaction of current.transactions) {
      if (transaction.type !== "expense" || !transactionInRange(transaction, from, to)) continue;
      const entry = map.get(transaction.categoryId) || { categoryId: transaction.categoryId, total: 0, count: 0 };
      entry.total = round(entry.total + transaction.amount);
      entry.count += 1;
      map.set(transaction.categoryId, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }

  /** Receitas e despesas por mês, do mais antigo para o mais recente. */
  function monthlySeries(months = 6, reference = todayISO()) {
    const series = [];
    for (let index = months - 1; index >= 0; index -= 1) {
      const key = monthKey(addMonthsISO(startOfMonth(reference), -index));
      const [from, to] = monthRange(key);
      const totalsForMonth = totals(from, to);
      series.push({ key, ...totalsForMonth });
    }
    return series;
  }

  /** Saldo acumulado ao final de cada mês da série. */
  function balanceSeries(months = 6, reference = todayISO()) {
    return monthlySeries(months, reference).map((entry) => ({
      key: entry.key,
      value: balanceUntil(entry.key === monthKey(reference) ? todayISO() : monthRange(entry.key)[1]),
    }));
  }

  function dailySeries(days = 30, reference = todayISO()) {
    const series = [];
    for (let index = days - 1; index >= 0; index -= 1) {
      const iso = addDaysISO(reference, -index);
      const totalsForDay = totals(iso, iso);
      series.push({ date: iso, ...totalsForDay });
    }
    return series;
  }

  function savingsRate(income, expense) {
    if (income <= 0) return null;
    return round(((income - expense) / income) * 100, 1);
  }

  function budgetFor(key = monthKey(todayISO())) {
    return current.budgets[key] || { total: 0, categories: {} };
  }

  function budgetUsage(key = monthKey(todayISO())) {
    const budget = budgetFor(key);
    const [from, to] = monthRange(key);
    const expense = totals(from, to).expense;
    const categories = Object.entries(budget.categories || {})
      .map(([categoryId, limit]) => {
        const category = categoryById(categoryId);
        const spent = expensesByCategory(from, to).find((entry) => entry.categoryId === categoryId);
        return {
          categoryId,
          name: category ? category.name : "Categoria",
          color: category ? category.color : "#64748b",
          limit: Number(limit) || 0,
          spent: spent ? spent.total : 0,
          ratio: limit > 0 ? spent ? spent.total / Number(limit) : 0 : 0,
        };
      })
      .sort((a, b) => b.ratio - a.ratio);
    return {
      total: Number(budget.total) || 0,
      spent: expense,
      ratio: Number(budget.total) > 0 ? expense / Number(budget.total) : 0,
      remaining: Number(budget.total) > 0 ? Number(budget.total) - expense : null,
      categories,
    };
  }

  function upcomingBills(days = 7, reference = todayISO()) {
    const limit = addDaysISO(reference, days);
    return current.bills
      .filter((bill) => !bill.paid && bill.dueDate <= limit)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  function overdueBills(reference = todayISO()) {
    return current.bills.filter((bill) => !bill.paid && bill.dueDate < reference);
  }

  function activeSubscriptions() {
    return current.subscriptions.filter((subscription) => subscription.active !== false);
  }

  function monthlySubscriptionCost() {
    return round(
      activeSubscriptions().reduce((total, subscription) => {
        return total + (subscription.cycle === "yearly" ? subscription.amount / 12 : subscription.amount);
      }, 0),
    );
  }

  function fixedMonthlyCost(from, to) {
    return round(
      current.transactions
        .filter((transaction) => transaction.type === "expense" && transaction.fixed && transactionInRange(transaction, from, to))
        .reduce((total, transaction) => total + transaction.amount, 0),
    );
  }

  function topCategory(from, to) {
    const list = expensesByCategory(from, to);
    return list.length ? list[0] : null;
  }

  function transactionsByDay(from, to) {
    const map = new Map();
    for (const transaction of current.transactions) {
      if (!transactionInRange(transaction, from, to)) continue;
      const day = map.get(transaction.date) || { income: 0, expense: 0, items: [] };
      if (transaction.type === "income") day.income = round(day.income + transaction.amount);
      else day.expense = round(day.expense + transaction.amount);
      day.items.push(transaction);
      map.set(transaction.date, day);
    }
    return map;
  }

  function projections(reference = todayISO()) {
    const key = monthKey(reference);
    const day = Number(reference.slice(8));
    const days = daysInMonth(key);
    const [from, to] = monthRange(key);
    const currentTotals = totals(from, to);
    const elapsed = Math.max(1, day);
    const projectedExpense = round((currentTotals.expense / elapsed) * days);
    const projectedIncome = currentTotals.income > 0 ? round((currentTotals.income / elapsed) * days) : 0;
    return {
      day,
      days,
      projectedExpense,
      projectedIncome,
      projectedResult: projectedIncome ? round(projectedIncome - projectedExpense) : null,
      dailyExpense: round(currentTotals.expense / elapsed),
    };
  }

  // ----------------------------------------------------- operações de dados

  function addTransaction(input) {
    let created = null;
    update((state) => {
      const transaction = normalizeTransaction(input, state.categories);
      if (!transaction) return;
      state.transactions.push(transaction);
      created = transaction;
    });
    return created;
  }

  /** Adiciona várias movimentações de uma vez (importação de extrato). */
  function addTransactions(inputs) {
    let count = 0;
    update((state) => {
      for (const input of inputs || []) {
        const transaction = normalizeTransaction(input, state.categories);
        if (!transaction) continue;
        state.transactions.push(transaction);
        count += 1;
      }
    });
    return count;
  }

  function updateTransaction(id, input) {
    update((state) => {
      const index = state.transactions.findIndex((transaction) => transaction.id === id);
      if (index < 0) return;
      const merged = normalizeTransaction(
        { ...state.transactions[index], ...input, id, updatedAt: new Date().toISOString() },
        state.categories,
      );
      if (merged) state.transactions[index] = merged;
    });
  }

  function deleteTransaction(id) {
    update((state) => {
      state.transactions = state.transactions.filter((transaction) => transaction.id !== id);
    });
  }

  function addCategory(input) {
    let created = null;
    update((state) => {
      const category = normalizeCategory({ ...input, id: uid("cat") }, input.type);
      if (!category) return;
      state.categories.push(category);
      created = category;
    });
    return created;
  }

  function updateCategory(id, input) {
    update((state) => {
      const category = state.categories.find((entry) => entry.id === id);
      if (!category) return;
      const next = normalizeCategory({ ...category, ...input, id, system: category.system }, category.type);
      if (next) Object.assign(category, next);
    });
  }

  function deleteCategory(id) {
    const category = categoryById(id);
    if (!category || category.system) return false;
    const fallback = category.type === "income" ? "other-income" : "other-expense";
    update((state) => {
      state.categories = state.categories.filter((entry) => entry.id !== id);
      for (const transaction of state.transactions) {
        if (transaction.categoryId === id) transaction.categoryId = fallback;
      }
      for (const key of Object.keys(state.budgets)) {
        if (state.budgets[key].categories) delete state.budgets[key].categories[id];
      }
    });
    return true;
  }

  function setBudget(key, { total, categories }) {
    update((state) => {
      const previous = state.budgets[key] || { total: 0, categories: {} };
      state.budgets[key] = {
        total: Number(total) >= 0 ? round(Number(total)) : previous.total,
        categories: categories ? { ...categories } : previous.categories,
      };
    });
  }

  function addGoal(input) {
    update((state) => {
      state.goals.push({
        id: uid("goal"),
        name: String(input.name || "Meta").trim(),
        target: Math.max(0, round(Number(input.target) || 0)),
        saved: 0,
        deadline: isValidISODate(input.deadline) ? input.deadline : null,
        color: input.color || "#10b981",
        contributions: [],
        createdAt: new Date().toISOString(),
      });
    });
  }

  function contributeGoal(id, amount) {
    const value = round(Number(amount));
    if (!Number.isFinite(value) || value === 0) return;
    update((state) => {
      const goal = state.goals.find((entry) => entry.id === id);
      if (!goal) return;
      goal.saved = Math.max(0, round(goal.saved + value));
      goal.contributions = goal.contributions || [];
      goal.contributions.push({ date: todayISO(), amount: value });
    });
  }

  function updateGoal(id, input) {
    update((state) => {
      const goal = state.goals.find((entry) => entry.id === id);
      if (!goal) return;
      if (input.name !== undefined) {
        const name = String(input.name).trim();
        if (name) goal.name = name;
      }
      if (input.target !== undefined) goal.target = Math.max(0, round(Number(input.target) || 0));
      if (input.deadline !== undefined) goal.deadline = isValidISODate(input.deadline) ? input.deadline : null;
      if (/^#[0-9a-f]{6}$/i.test(String(input.color || ""))) goal.color = input.color;
    });
  }

  function deleteGoal(id) {
    update((state) => {
      state.goals = state.goals.filter((goal) => goal.id !== id);
    });
  }

  function addDebt(input) {
    update((state) => {
      state.debts.push({
        id: uid("debt"),
        name: String(input.name || "Dívida").trim(),
        total: Math.max(0, round(Number(input.total) || 0)),
        installments: Math.max(1, Math.round(Number(input.installments) || 1)),
        paidInstallments: 0,
        installmentValue: Math.max(0, round(Number(input.installmentValue) || 0)),
        dueDay: clamp(Number(input.dueDay) || 1, 1, 31),
        categoryId: state.categories.some((category) => category.id === input.categoryId)
          ? input.categoryId
          : "bills",
        createdAt: new Date().toISOString(),
      });
    });
  }

  function updateDebt(id, input) {
    update((state) => {
      const debt = state.debts.find((entry) => entry.id === id);
      if (!debt) return;
      if (input.name !== undefined) {
        const name = String(input.name).trim();
        if (name) debt.name = name;
      }
      if (input.total !== undefined) debt.total = Math.max(0, round(Number(input.total) || 0));
      if (input.installments !== undefined) {
        debt.installments = Math.max(debt.paidInstallments, Math.round(Number(input.installments) || 1));
      }
      if (input.installmentValue !== undefined) {
        debt.installmentValue = Math.max(0, round(Number(input.installmentValue) || 0));
      }
      if (input.dueDay !== undefined) debt.dueDay = clamp(Number(input.dueDay) || 1, 1, 31);
      if (state.categories.some((category) => category.id === input.categoryId)) debt.categoryId = input.categoryId;
    });
  }

  function payInstallment(id) {
    let paid = 0;
    update((state) => {
      const debt = state.debts.find((entry) => entry.id === id);
      if (!debt || debt.paidInstallments >= debt.installments) return;
      paid = debt.installmentValue || round(debt.total / debt.installments);
      debt.paidInstallments += 1;
      const transaction = normalizeTransaction(
        {
          type: "expense",
          description: `Parcela ${debt.paidInstallments}/${debt.installments} — ${debt.name}`,
          amount: paid,
          date: todayISO(),
          categoryId: debt.categoryId,
          payment: "boleto",
          notes: "Parcela de dívida registrada pelo planejamento.",
        },
        state.categories,
      );
      if (transaction) state.transactions.push(transaction);
    });
    return paid;
  }

  function deleteDebt(id) {
    update((state) => {
      state.debts = state.debts.filter((debt) => debt.id !== id);
    });
  }

  function addSubscription(input) {
    update((state) => {
      state.subscriptions.push({
        id: uid("sub"),
        name: String(input.name || "Assinatura").trim(),
        amount: Math.max(0, round(Number(input.amount) || 0)),
        cycle: input.cycle === "yearly" ? "yearly" : "monthly",
        nextDate: isValidISODate(input.nextDate) ? input.nextDate : todayISO(),
        categoryId: state.categories.some((category) => category.id === input.categoryId)
          ? input.categoryId
          : "leisure",
        active: true,
        createdAt: new Date().toISOString(),
      });
    });
  }

  function updateSubscription(id, input) {
    update((state) => {
      const subscription = state.subscriptions.find((entry) => entry.id === id);
      if (!subscription) return;
      if (input.name !== undefined) {
        const name = String(input.name).trim();
        if (name) subscription.name = name;
      }
      if (input.amount !== undefined) subscription.amount = Math.max(0, round(Number(input.amount) || 0));
      if (input.cycle === "yearly" || input.cycle === "monthly") subscription.cycle = input.cycle;
      if (isValidISODate(input.nextDate)) subscription.nextDate = input.nextDate;
      if (state.categories.some((category) => category.id === input.categoryId)) subscription.categoryId = input.categoryId;
    });
  }

  function chargeSubscription(id) {
    let charged = 0;
    update((state) => {
      const subscription = state.subscriptions.find((entry) => entry.id === id);
      if (!subscription) return;
      charged = subscription.amount;
      const transaction = normalizeTransaction(
        {
          type: "expense",
          description: subscription.name,
          amount: subscription.amount,
          date: todayISO(),
          categoryId: subscription.categoryId,
          payment: "credit",
          fixed: true,
          notes: "Cobrança de assinatura registrada pelo app.",
        },
        state.categories,
      );
      if (transaction) state.transactions.push(transaction);
      subscription.nextDate = addMonthsISO(
        subscription.nextDate < todayISO() ? todayISO() : subscription.nextDate,
        subscription.cycle === "yearly" ? 12 : 1,
      );
    });
    return charged;
  }

  function deleteSubscription(id) {
    update((state) => {
      state.subscriptions = state.subscriptions.filter((subscription) => subscription.id !== id);
    });
  }

  function toggleSubscription(id) {
    update((state) => {
      const subscription = state.subscriptions.find((entry) => entry.id === id);
      if (subscription) subscription.active = subscription.active === false;
    });
  }

  function addBill(input) {
    update((state) => {
      state.bills.push({
        id: uid("bill"),
        name: String(input.name || "Conta").trim(),
        amount: Math.max(0, round(Number(input.amount) || 0)),
        dueDate: isValidISODate(input.dueDate) ? input.dueDate : todayISO(),
        categoryId: state.categories.some((category) => category.id === input.categoryId)
          ? input.categoryId
          : "bills",
        paid: false,
        paidTransactionId: null,
        createdAt: new Date().toISOString(),
      });
    });
  }

  function updateBill(id, input) {
    update((state) => {
      const bill = state.bills.find((entry) => entry.id === id);
      if (!bill) return;
      if (input.name !== undefined) {
        const name = String(input.name).trim();
        if (name) bill.name = name;
      }
      if (input.amount !== undefined) bill.amount = Math.max(0, round(Number(input.amount) || 0));
      if (isValidISODate(input.dueDate)) bill.dueDate = input.dueDate;
      if (state.categories.some((category) => category.id === input.categoryId)) bill.categoryId = input.categoryId;
      const linked = bill.paidTransactionId
        ? state.transactions.find((transaction) => transaction.id === bill.paidTransactionId)
        : null;
      if (linked) {
        linked.description = bill.name;
        linked.amount = bill.amount;
        linked.categoryId = bill.categoryId;
        linked.updatedAt = new Date().toISOString();
      }
    });
  }

  function payBill(id) {
    update((state) => {
      const bill = state.bills.find((entry) => entry.id === id);
      if (!bill || bill.paid) return;
      const transaction = normalizeTransaction(
        {
          type: "expense",
          description: bill.name,
          amount: bill.amount,
          date: todayISO(),
          categoryId: bill.categoryId,
          payment: "boleto",
          notes: `Conta com vencimento em ${bill.dueDate}.`,
        },
        state.categories,
      );
      if (transaction) {
        state.transactions.push(transaction);
        bill.paid = true;
        bill.paidTransactionId = transaction.id;
        bill.paidAt = todayISO();
      }
    });
  }

  function unpayBill(id) {
    update((state) => {
      const bill = state.bills.find((entry) => entry.id === id);
      if (!bill || !bill.paid) return;
      if (bill.paidTransactionId) {
        state.transactions = state.transactions.filter(
          (transaction) => transaction.id !== bill.paidTransactionId,
        );
      }
      bill.paid = false;
      bill.paidTransactionId = null;
      bill.paidAt = null;
    });
  }

  function deleteBill(id) {
    update((state) => {
      state.bills = state.bills.filter((bill) => bill.id !== id);
    });
  }

  function addRecurrence(input) {
    update((state) => {
      state.recurrences.push({
        id: uid("rec"),
        description: String(input.description || "Lançamento recorrente").trim(),
        amount: Math.max(0, round(Number(input.amount) || 0)),
        type: input.type === "income" ? "income" : "expense",
        categoryId: state.categories.some((category) => category.id === input.categoryId)
          ? input.categoryId
          : input.type === "income"
            ? "other-income"
            : "other-expense",
        payment: PAYMENTS[input.payment] ? input.payment : "other",
        fixed: input.fixed !== false,
        frequency: FREQUENCIES[input.frequency] ? input.frequency : "monthly",
        nextDate: isValidISODate(input.nextDate) ? input.nextDate : todayISO(),
        active: true,
        createdAt: new Date().toISOString(),
      });
    });
  }

  function updateRecurrence(id, input) {
    update((state) => {
      const recurrence = state.recurrences.find((entry) => entry.id === id);
      if (!recurrence) return;
      if (input.description !== undefined) {
        const description = String(input.description).trim();
        if (description) recurrence.description = description;
      }
      if (input.amount !== undefined) recurrence.amount = Math.max(0, round(Number(input.amount) || 0));
      if (input.type === "income" || input.type === "expense") recurrence.type = input.type;
      if (isValidISODate(input.nextDate)) recurrence.nextDate = input.nextDate;
      if (PAYMENTS[input.payment]) recurrence.payment = input.payment;
      if (FREQUENCIES[input.frequency]) recurrence.frequency = input.frequency;
      if (input.fixed !== undefined) recurrence.fixed = Boolean(input.fixed);
      const category = state.categories.find((entry) => entry.id === input.categoryId);
      if (category && category.type === recurrence.type) recurrence.categoryId = category.id;
      else if (!state.categories.some((entry) => entry.id === recurrence.categoryId)) {
        recurrence.categoryId = recurrence.type === "income" ? "other-income" : "other-expense";
      }
    });
  }

  function toggleRecurrence(id) {
    update((state) => {
      const recurrence = state.recurrences.find((entry) => entry.id === id);
      if (recurrence) recurrence.active = recurrence.active === false;
    });
  }

  function deleteRecurrence(id) {
    update((state) => {
      state.recurrences = state.recurrences.filter((recurrence) => recurrence.id !== id);
    });
  }

  /** Cria os lançamentos das recorrências vencidas e avança a próxima data. */
  function runRecurrences(reference = current) {
    const state = reference;
    const today = todayISO();
    let generated = 0;
    for (const recurrence of state.recurrences || []) {
      if (!recurrence || recurrence.active === false) continue;
      let guard = 0;
      while (recurrence.nextDate <= today && guard < 36) {
        guard += 1;
        const marker = `${recurrence.id}|${recurrence.nextDate}`;
        const exists = state.transactions.some((transaction) => transaction.recurrenceId === marker);
        if (!exists) {
          const transaction = normalizeTransaction(
            {
              type: recurrence.type,
              description: recurrence.description,
              amount: recurrence.amount,
              date: recurrence.nextDate,
              categoryId: recurrence.categoryId,
              payment: recurrence.payment,
              fixed: recurrence.fixed,
              recurrenceId: marker,
              notes: "Gerado automaticamente por recorrência.",
            },
            state.categories,
          );
          if (transaction) {
            state.transactions.push(transaction);
            generated += 1;
          }
        }
        recurrence.nextDate =
          recurrence.frequency === "weekly"
            ? addDaysISO(recurrence.nextDate, 7)
            : addMonthsISO(recurrence.nextDate, recurrence.frequency === "yearly" ? 12 : 1);
      }
    }
    state.meta = state.meta || {};
    state.meta.lastRecurrenceRun = today;
    return generated;
  }

  function updateSettings(patch) {
    update((state) => {
      Object.assign(state.settings, patch);
    });
  }

  function exportJSON() {
    return JSON.stringify(
      { app: "meu-financeiro", version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: current },
      null,
      2,
    );
  }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    const data = parsed && parsed.data ? parsed.data : parsed;
    if (!data || typeof data !== "object" || !Array.isArray(data.transactions)) {
      throw new Error("Arquivo inválido: não encontrei a lista de lançamentos.");
    }
    replace(data);
  }

  function alertMemory() {
    try {
      return JSON.parse(localStorage.getItem(ALERTS_KEY) || "{}");
    } catch (error) {
      return {};
    }
  }

  function rememberAlert(key) {
    try {
      const memory = alertMemory();
      memory[key] = todayISO();
      localStorage.setItem(ALERTS_KEY, JSON.stringify(memory));
    } catch (error) {
      /* armazenamento indisponível: o alerta apenas se repete */
    }
  }

  function alertAlreadySent(key) {
    return alertMemory()[key] === todayISO();
  }

  Fin.core = {
    STORAGE_KEY,
    ALERTS_KEY,
    SCHEMA_VERSION,
    PAYMENTS,
    FREQUENCIES,
    PERIOD_LABELS,
    DEFAULT_CATEGORIES,
    uid,
    toISO,
    parseISO,
    todayISO,
    addDaysISO,
    addMonthsISO,
    isValidISODate,
    monthKey,
    monthRange,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    startOfYear,
    endOfYear,
    periodRange,
    previousPeriodRange,
    daysInMonth,
    monthLabel,
    shortDate,
    longDate,
    money,
    compactMoney,
    percent,
    clamp,
    round,
    defaultState,
  };

  Fin.store = {
    get state() {
      return current;
    },
    get loadError() {
      return loaded.error;
    },
    subscribe,
    update,
    save,
    replace,
    reset,
    notify,
    listTransactions,
    totals,
    balanceUntil,
    categoryById,
    categoriesByType,
    expensesByCategory,
    monthlySeries,
    balanceSeries,
    dailySeries,
    savingsRate,
    budgetFor,
    budgetUsage,
    upcomingBills,
    overdueBills,
    activeSubscriptions,
    monthlySubscriptionCost,
    fixedMonthlyCost,
    topCategory,
    transactionsByDay,
    projections,
    addTransaction,
    addTransactions,
    updateTransaction,
    deleteTransaction,
    addCategory,
    updateCategory,
    deleteCategory,
    setBudget,
    addGoal,
    contributeGoal,
    updateGoal,
    deleteGoal,
    addDebt,
    updateDebt,
    payInstallment,
    deleteDebt,
    addSubscription,
    updateSubscription,
    chargeSubscription,
    deleteSubscription,
    toggleSubscription,
    addBill,
    updateBill,
    payBill,
    unpayBill,
    deleteBill,
    addRecurrence,
    updateRecurrence,
    toggleRecurrence,
    deleteRecurrence,
    runRecurrences,
    updateSettings,
    exportJSON,
    importJSON,
    alertAlreadySent,
    rememberAlert,
  };
})(window.Fin);
