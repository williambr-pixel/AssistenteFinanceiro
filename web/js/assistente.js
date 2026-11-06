"use strict";

/**
 * Inteligência financeira do app.
 *
 * Tudo é calculado a partir dos lançamentos reais salvos no aparelho.
 * Não há chamadas de rede nem valores inventados: quando faltam dados, o
 * assistente diz isso de forma explícita.
 */
window.Fin = window.Fin || {};

(function (Fin) {
  const { store } = Fin;
  const core = Fin.core;

  function normalize(text) {
    return String(text || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function plural(count, singular, pluralForm) {
    return `${count} ${count === 1 ? singular : pluralForm}`;
  }

  function list(items, limit = 4) {
    return items
      .slice(0, limit)
      .map((item) => `• ${item}`)
      .join("\n");
  }

  function hasAnyData() {
    return store.state.transactions.length > 0;
  }

  /**
   * Gera os insights exibidos no painel e na aba do assistente.
   * Retorna uma lista ordenada por urgência.
   */
  function insights() {
    const state = store.state;
    const today = core.todayISO();
    const month = core.monthKey(today);
    const [from, to] = core.monthRange(month);
    const current = store.totals(from, to);
    const previousRange = core.previousPeriodRange("month", today);
    const previous = store.totals(previousRange[0], previousRange[1]);
    const budget = store.budgetUsage(month);
    const items = [];

    if (!hasAnyData()) {
      return [
        {
          tone: "info",
          icon: "sparkles",
          title: "Comece pelo primeiro lançamento",
          text: "Assim que você registrar uma receita ou um gasto, o assistente passa a analisar seus números reais.",
          action: { label: "Adicionar lançamento", view: "transactions", modal: "transaction" },
        },
      ];
    }

    // 1. Taxa de economia do mês.
    const rate = store.savingsRate(current.income, current.expense);
    if (rate === null) {
      items.push({
        tone: "info",
        icon: "trend",
        title: "Sem receitas neste mês",
        text: `Foram registrados ${core.money(current.expense)} em gastos. Cadastre suas receitas para calcular a taxa de economia.`,
      });
    } else if (rate < 0) {
      items.push({
        tone: "danger",
        icon: "alert",
        title: "Gastos acima das receitas",
        text: `Neste mês as despesas superam as receitas em ${core.money(Math.abs(current.result))}. Reveja as categorias com maior peso antes de assumir novos compromissos.`,
      });
    } else if (rate >= 20) {
      items.push({
        tone: "positive",
        icon: "check",
        title: `Você está economizando ${core.percent(rate)}`,
        text: `Sobraram ${core.money(current.result)} das ${core.money(current.income)} de receita neste mês. Considere direcionar parte desse valor para uma meta.`,
      });
    } else {
      items.push({
        tone: "info",
        icon: "coins",
        title: `Sobrou ${core.percent(rate)} da renda`,
        text: `Resultado de ${core.money(current.result)} neste mês. Uma reserva de 20% já faria diferença no fim do ano.`,
      });
    }

    // 2. Orçamento.
    if (!budget.total) {
      items.push({
        tone: "info",
        icon: "target",
        title: "Defina um orçamento mensal",
        text: "Com um limite total e limites por categoria, o app avisa antes de você ultrapassar o planejado.",
        action: { label: "Criar orçamento", view: "planning" },
      });
    } else if (budget.ratio >= 1) {
      items.push({
        tone: "danger",
        icon: "alert",
        title: "Orçamento estourado",
        text: `Você usou ${core.percent(budget.ratio * 100)} do orçamento de ${core.money(budget.total)}. Excedente de ${core.money(budget.spent - budget.total)}.`,
        action: { label: "Revisar orçamento", view: "planning" },
      });
    } else if (budget.ratio >= 0.8) {
      items.push({
        tone: "warning",
        icon: "gauge",
        title: "Orçamento perto do limite",
        text: `Já foram usados ${core.percent(budget.ratio * 100)} do orçamento. Restam ${core.money(budget.remaining)} para o resto do mês.`,
        action: { label: "Ver orçamento", view: "planning" },
      });
    } else if (budget.ratio > 0) {
      items.push({
        tone: "positive",
        icon: "check",
        title: "Orçamento sob controle",
        text: `${core.percent(budget.ratio * 100)} do limite mensal utilizado. Ainda restam ${core.money(budget.remaining)}.`,
      });
    }

    // 3. Categoria com maior peso.
    const top = store.topCategory(from, to);
    if (top && current.expense > 0) {
      const category = store.categoryById(top.categoryId);
      const share = (top.total / current.expense) * 100;
      if (share >= 35) {
        items.push({
          tone: "warning",
          icon: "chart",
          title: `${category ? category.name : "Uma categoria"} concentra ${core.percent(share)} dos gastos`,
          text: `Foram ${core.money(top.total)} em ${plural(top.count, "lançamento", "lançamentos")}. Reduzir 10% aqui liberaria ${core.money(top.total * 0.1)} por mês.`,
          action: { label: "Ver lançamentos", view: "transactions", categoryId: top.categoryId },
        });
      } else {
        items.push({
          tone: "info",
          icon: "chart",
          title: `Maior gasto: ${category ? category.name : "categoria"}`,
          text: `${core.money(top.total)} no mês, ${core.percent(share)} do total de despesas.`,
        });
      }
    }

    // 4. Contas.
    const overdue = store.overdueBills(today);
    const upcoming = store.upcomingBills(7, today).filter((bill) => bill.dueDate >= today);
    if (overdue.length) {
      items.push({
        tone: "danger",
        icon: "receipt",
        title: `${plural(overdue.length, "conta atrasada", "contas atrasadas")}`,
        text: list(overdue.map((bill) => `${bill.name} — venceu em ${core.shortDate(bill.dueDate)} (${core.money(bill.amount)})`), 3),
        action: { label: "Ver contas", view: "planning" },
      });
    } else if (upcoming.length) {
      items.push({
        tone: "warning",
        icon: "calendar",
        title: `${plural(upcoming.length, "conta vence", "contas vencem")} nos próximos 7 dias`,
        text: list(upcoming.map((bill) => `${bill.name} — ${core.shortDate(bill.dueDate)} (${core.money(bill.amount)})`), 3),
        action: { label: "Ver contas", view: "planning" },
      });
    }

    // 5. Comparação com o mês anterior.
    if (previous.expense > 0) {
      const change = ((current.expense - previous.expense) / previous.expense) * 100;
      if (change >= 20) {
        items.push({
          tone: "warning",
          icon: "up",
          title: `Gastos ${core.percent(change)} maiores que no mês passado`,
          text: `Foram ${core.money(current.expense)} contra ${core.money(previous.expense)}. Se o aumento veio de um gasto pontual, marque-o como variável para não distorcer a média.`,
        });
      } else if (change <= -10) {
        items.push({
          tone: "positive",
          icon: "down",
          title: `Gastos ${core.percent(Math.abs(change))} menores que no mês passado`,
          text: `Boa evolução: ${core.money(current.expense)} contra ${core.money(previous.expense)}.`,
        });
      }
    }

    // 6. Projeção de fechamento.
    const projection = store.projections(today);
    if (current.expense > 0 && projection.day >= 5) {
      const budgetLimit = budget.total || 0;
      const text = budgetLimit
        ? `No ritmo atual, o mês deve fechar em ${core.money(projection.projectedExpense)}. ${
            projection.projectedExpense > budgetLimit
              ? `Isso ultrapassa o orçamento em ${core.money(projection.projectedExpense - budgetLimit)}.`
              : `Ficaria ${core.money(budgetLimit - projection.projectedExpense)} abaixo do limite.`
          }`
        : `No ritmo atual, o mês deve fechar em ${core.money(projection.projectedExpense)} em despesas.`;
      items.push({
        tone: budgetLimit && projection.projectedExpense > budgetLimit ? "warning" : "info",
        icon: "compass",
        title: "Previsão para o fim do mês",
        text,
      });
    }

    // 7. Assinaturas.
    const subscriptionsCost = store.monthlySubscriptionCost();
    if (subscriptionsCost > 0) {
      const annual = subscriptionsCost * 12;
      items.push({
        tone: subscriptionsCost > current.income * 0.05 ? "warning" : "info",
        icon: "repeat",
        title: `Assinaturas custam ${core.money(subscriptionsCost)} por mês`,
        text: `São ${core.money(annual)} por ano. Revise os serviços que você não usa mais.`,
        action: { label: "Ver assinaturas", view: "planning" },
      });
    }

    // 8. Dívidas.
    if (store.state.debts.length) {
      const remaining = store.state.debts.reduce((total, debt) => {
        const paid = (debt.installmentValue || debt.total / debt.installments) * debt.paidInstallments;
        return total + Math.max(0, debt.total - paid);
      }, 0);
      if (remaining > 0) {
        items.push({
          tone: "info",
          icon: "wallet",
          title: `Dívidas em aberto: ${core.money(remaining)}`,
          text: "Quitar as parcelas mais caras primeiro costuma reduzir mais rápido o total de juros.",
          action: { label: "Ver dívidas", view: "planning" },
        });
      }
    }

    // 9. Metas.
    const goals = [...state.goals].sort((a, b) => String(a.deadline || "9999").localeCompare(String(b.deadline || "9999")));
    for (const goal of goals) {
      const progress = goal.target > 0 ? (goal.saved / goal.target) * 100 : 0;
      if (goal.deadline && progress < 100) {
        const days = Math.ceil((core.parseISO(goal.deadline) - core.parseISO(today)) / 86400000);
        if (days >= 0 && days <= 90) {
          items.push({
            tone: days <= 30 ? "warning" : "info",
            icon: "flag",
            title: `Meta "${goal.name}" vence em ${plural(days, "dia", "dias")}`,
            text: `Faltam ${core.money(goal.target - goal.saved)} para chegar aos ${core.money(goal.target)}.`,
            action: { label: "Ver metas", view: "planning" },
          });
        }
      }
    }

    return items;
  }

  // ------------------------------------------------------------- perguntas

  function detectPeriod(question) {
    const text = normalize(question);
    if (text.includes("mes passado") || text.includes("mes anterior")) {
      const range = core.previousPeriodRange("month", core.todayISO());
      return { from: range[0], to: range[1], label: "no mês passado" };
    }
    if (text.includes("ano passado")) {
      const range = core.previousPeriodRange("year", core.todayISO());
      return { from: range[0], to: range[1], label: "no ano passado" };
    }
    if (text.includes("esta semana") || text.includes("essa semana") || text.includes("semana")) {
      const range = core.periodRange("week", core.todayISO());
      return { from: range[0], to: range[1], label: "nesta semana" };
    }
    if (text.includes("hoje")) {
      return { from: core.todayISO(), to: core.todayISO(), label: "hoje" };
    }
    if (text.includes("este ano") || text.includes("nesse ano") || text.includes("no ano")) {
      const range = core.periodRange("year", core.todayISO());
      return { from: range[0], to: range[1], label: "neste ano" };
    }
    const range = core.monthRange(core.monthKey(core.todayISO()));
    return { from: range[0], to: range[1], label: "neste mês" };
  }

  function detectCategory(question) {
    const text = normalize(question);
    let found = null;
    for (const category of store.state.categories) {
      if (category.type !== "expense") continue;
      if (text.includes(normalize(category.name)) && (!found || category.name.length > found.name.length)) {
        found = category;
      }
    }
    return found;
  }

  function incomeByCategory(from, to) {
    const map = new Map();
    for (const transaction of store.state.transactions) {
      if (transaction.type !== "income" || transaction.date < from || transaction.date > to) continue;
      map.set(transaction.categoryId, (map.get(transaction.categoryId) || 0) + transaction.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }

  function answer(question) {
    const text = normalize(question);
    const state = store.state;
    const today = core.todayISO();

    if (!text) {
      return { text: "Escreva uma pergunta sobre suas finanças. Eu respondo apenas com os dados que você cadastrou." };
    }

    if (/^(oi|ola|bom dia|boa tarde|boa noite|tudo bem)/.test(text)) {
      return {
        text: `Olá${state.settings.name ? `, ${state.settings.name}` : ""}! Posso analisar seu saldo, gastos por categoria, orçamento, contas, metas, dívidas e assinaturas. O que você quer saber?`,
        chips: ["Qual é o meu saldo?", "Quanto gastei neste mês?", "Como está meu orçamento?"],
      };
    }

    if (text.includes("ajuda") || text.includes("o que voce faz") || text.includes("como funciona")) {
      return {
        text:
          "Eu leio os lançamentos salvos neste aparelho e respondo com números reais. Você pode perguntar sobre:\n" +
          "• saldo e resultado do mês\n• gastos por categoria e por período\n• orçamento e economia\n• contas vencendo, metas, dívidas e assinaturas\n• previsão de fechamento do mês",
        chips: ["Qual é o meu saldo?", "Onde mais gastei?", "Vou fechar o mês no azul?"],
      };
    }

    if (!hasAnyData()) {
      return {
        text: "Ainda não há lançamentos salvos, então não tenho números para analisar. Registre sua primeira receita ou despesa e eu começo a responder com dados reais.",
        chips: ["Adicionar lançamento"],
      };
    }

    // Saldo.
    if (text.includes("saldo") || text.includes("quanto tenho") || text.includes("quanto eu tenho")) {
      const balance = store.balanceUntil(today);
      const month = core.monthRange(core.monthKey(today));
      const current = store.totals(month[0], month[1]);
      return {
        text: `Seu saldo acumulado é ${core.money(balance)}.\nNeste mês: ${core.money(current.income)} de receitas e ${core.money(current.expense)} de despesas, resultado de ${core.money(current.result)}.`,
        chips: ["Como está meu orçamento?", "Quanto gastei neste mês?", "Previsão para o fim do mês"],
      };
    }

    // Previsão.
    if (text.includes("previs") || text.includes("fim do mes") || text.includes("vai fechar") || text.includes("vou fechar")) {
      const projection = store.projections(today);
      const budget = store.budgetUsage();
      const parts = [
        `Estamos no dia ${projection.day} de ${projection.days}.`,
        `Média diária de gastos: ${core.money(projection.dailyExpense)}.`,
        `Projeção de despesas para o mês: ${core.money(projection.projectedExpense)}.`,
      ];
      if (budget.total) {
        parts.push(
          projection.projectedExpense > budget.total
            ? `Isso ultrapassa seu orçamento de ${core.money(budget.total)} em ${core.money(projection.projectedExpense - budget.total)}.`
            : `Isso fica ${core.money(budget.total - projection.projectedExpense)} abaixo do orçamento de ${core.money(budget.total)}.`,
        );
      } else {
        parts.push("Defina um orçamento mensal para eu comparar a projeção com um limite.");
      }
      return { text: parts.join("\n"), chips: ["Como está meu orçamento?", "Onde mais gastei?"] };
    }

    // Maior categoria / onde mais gastei.
    if (text.includes("maior") || text.includes("mais gastei") || text.includes("onde gastei") || text.includes("categoria")) {
      const period = detectPeriod(question);
      const top = store.topCategory(period.from, period.to);
      if (!top) {
        return { text: `Não há despesas registradas ${period.label}.`, chips: ["Quanto gastei neste mês?"] };
      }
      const category = store.categoryById(top.categoryId);
      const totals = store.totals(period.from, period.to);
      const share = totals.expense > 0 ? (top.total / totals.expense) * 100 : 0;
      const ranking = store
        .expensesByCategory(period.from, period.to)
        .slice(0, 4)
        .map((entry) => {
          const info = store.categoryById(entry.categoryId);
          return `${info ? info.name : "Categoria"}: ${core.money(entry.total)}`;
        });
      return {
        text: `${category ? category.name : "Sua maior categoria"} lidera os gastos ${period.label}, com ${core.money(top.total)} (${core.percent(share)} do total).\n\nRanking:\n${list(ranking)}`,
        chips: ["Como está meu orçamento?", "Quanto economizei?", "Comparar com o mês passado"],
      };
    }

    // Orçamento.
    if (text.includes("orcamento") || text.includes("limite de gasto") || text.includes("estourei")) {
      const budget = store.budgetUsage();
      if (!budget.total) {
        return {
          text: "Você ainda não definiu um orçamento para este mês. Na aba Planejamento é possível criar um limite total e limites por categoria.",
          chips: ["Como está meu orçamento?"],
        };
      }
      const lines = [
        `Orçamento do mês: ${core.money(budget.total)}.`,
        `Utilizado: ${core.money(budget.spent)} (${core.percent(budget.ratio * 100)}).`,
        budget.remaining >= 0
          ? `Disponível: ${core.money(budget.remaining)}.`
          : `Excedido em ${core.money(Math.abs(budget.remaining))}.`,
      ];
      const over = budget.categories.filter((entry) => entry.limit > 0 && entry.spent > entry.limit);
      if (over.length) {
        lines.push(
          `Categorias acima do limite:\n${list(over.map((entry) => `${entry.name}: ${core.money(entry.spent)} de ${core.money(entry.limit)}`))}`,
        );
      }
      return { text: lines.join("\n"), chips: ["Onde mais gastei?", "Quanto economizei?"] };
    }

    // Contas.
    if (text.includes("conta") || text.includes("vence") || text.includes("vencimento") || text.includes("pagar")) {
      const overdue = store.overdueBills(today);
      const upcoming = store.upcomingBills(7, today).filter((bill) => bill.dueDate >= today);
      if (!overdue.length && !upcoming.length) {
        return { text: "Nenhuma conta a pagar vencida ou vencendo nos próximos 7 dias. Tudo em dia com o que está cadastrado.", chips: ["Como está meu orçamento?"] };
      }
      const parts = [];
      if (overdue.length) {
        parts.push(`Atrasadas (${overdue.length}):\n${list(overdue.map((bill) => `${bill.name} — ${core.money(bill.amount)} (venceu em ${core.shortDate(bill.dueDate)})`))}`);
      }
      if (upcoming.length) {
        parts.push(`Próximos 7 dias (${upcoming.length}):\n${list(upcoming.map((bill) => `${bill.name} — ${core.money(bill.amount)} (${core.shortDate(bill.dueDate)})`))}`);
      }
      return { text: parts.join("\n\n"), chips: ["Qual é o meu saldo?", "Como está meu orçamento?"] };
    }

    // Metas.
    if (text.includes("meta") || text.includes("objetivo") || text.includes("cofrinho")) {
      if (!state.goals.length) {
        return { text: "Você ainda não criou metas. Na aba Planejamento dá para definir objetivo, valor e prazo, e acompanhar o progresso.", chips: ["Quanto economizei?"] };
      }
      const lines = state.goals.map((goal) => {
        const progress = goal.target > 0 ? (goal.saved / goal.target) * 100 : 0;
        return `${goal.name}: ${core.money(goal.saved)} de ${core.money(goal.target)} (${core.percent(progress)})${
          goal.deadline ? ` — prazo ${core.shortDate(goal.deadline)}` : ""
        }`;
      });
      return { text: `Suas metas:\n${list(lines, 6)}`, chips: ["Quanto economizei?", "Como está meu orçamento?"] };
    }

    // Dívidas.
    if (text.includes("divida") || text.includes("parcela") || text.includes("devo")) {
      if (!state.debts.length) {
        return { text: "Não há dívidas cadastradas. Se você tiver parcelas em aberto, cadastre-as em Planejamento para acompanhar o quanto falta.", chips: ["Como está meu orçamento?"] };
      }
      const lines = state.debts.map((debt) => {
        const paid = Math.min(debt.paidInstallments, debt.installments);
        const remaining = Math.max(0, debt.total - (debt.installmentValue || debt.total / debt.installments) * paid);
        return `${debt.name}: ${paid}/${debt.installments} parcelas pagas, faltando ${core.money(remaining)}`;
      });
      return { text: `Suas dívidas:\n${list(lines, 6)}`, chips: ["Quanto economizei?", "Como está meu orçamento?"] };
    }

    // Assinaturas.
    if (text.includes("assinatura") || text.includes("streaming") || text.includes("mensalidade")) {
      const subscriptions = store.activeSubscriptions();
      if (!subscriptions.length) {
        return { text: "Nenhuma assinatura ativa cadastrada.", chips: ["Onde mais gastei?"] };
      }
      const monthly = store.monthlySubscriptionCost();
      const lines = subscriptions.map(
        (subscription) =>
          `${subscription.name}: ${core.money(subscription.amount)} (${subscription.cycle === "yearly" ? "anual" : "mensal"}), próxima em ${core.shortDate(subscription.nextDate)}`,
      );
      return {
        text: `Custo mensal estimado: ${core.money(monthly)} — ${core.money(monthly * 12)} por ano.\n\n${list(lines, 6)}`,
        chips: ["Onde mais gastei?", "Como está meu orçamento?"],
      };
    }

    // Economia.
    if (text.includes("economi") || text.includes("sobrou") || text.includes("poupei") || text.includes("reserva")) {
      const period = detectPeriod(question);
      const totals = store.totals(period.from, period.to);
      const rate = store.savingsRate(totals.income, totals.expense);
      if (rate === null) {
        return { text: `Não há receitas registradas ${period.label}, então não consigo calcular a taxa de economia. As despesas somam ${core.money(totals.expense)}.`, chips: ["Quanto gastei neste mês?"] };
      }
      const status = rate < 0 ? "Você gastou mais do que recebeu" : rate >= 20 ? "Boa margem de economia" : "Margem apertada";
      return {
        text: `${status} ${period.label}: sobraram ${core.money(totals.result)} de ${core.money(totals.income)} (${core.percent(rate)}).\nDespesas: ${core.money(totals.expense)}.`,
        chips: ["Onde mais gastei?", "Como está meu orçamento?", "Previsão para o fim do mês"],
      };
    }

    // Comparação com o mês anterior.
    if (text.includes("comparar") || text.includes("comparacao") || text.includes("mes passado")) {
      const currentRange = core.monthRange(core.monthKey(today));
      const previousRange = core.previousPeriodRange("month", today);
      const current = store.totals(currentRange[0], currentRange[1]);
      const previous = store.totals(previousRange[0], previousRange[1]);
      if (!previous.income && !previous.expense) {
        return { text: "Não há lançamentos no mês anterior para comparar.", chips: ["Quanto gastei neste mês?"] };
      }
      const change = (value, base) => (base > 0 ? ((value - base) / base) * 100 : null);
      const expenseChange = change(current.expense, previous.expense);
      const incomeChange = change(current.income, previous.income);
      return {
        text:
          `Mês atual: ${core.money(current.income)} de receitas e ${core.money(current.expense)} de despesas.\n` +
          `Mês anterior: ${core.money(previous.income)} e ${core.money(previous.expense)}.\n` +
          `Variação de despesas: ${expenseChange === null ? "sem base" : core.percent(expenseChange)}. ` +
          `Variação de receitas: ${incomeChange === null ? "sem base" : core.percent(incomeChange)}.`,
        chips: ["Onde mais gastei?", "Como está meu orçamento?"],
      };
    }

    // Receitas.
    if (text.includes("recebi") || text.includes("receita") || text.includes("ganhei") || text.includes("entrada")) {
      const period = detectPeriod(question);
      const totals = store.totals(period.from, period.to);
      if (totals.income <= 0) {
        return { text: `Não há receitas registradas ${period.label}.`, chips: ["Quanto gastei neste mês?"] };
      }
      const entries = incomeByCategory(period.from, period.to).map(([categoryId, value]) => {
        const category = store.categoryById(categoryId);
        return `${category ? category.name : "Outras receitas"}: ${core.money(value)}`;
      });
      return {
        text: `Você recebeu ${core.money(totals.income)} ${period.label}.\n\n${list(entries)}`,
        chips: ["Quanto economizei?", "Comparar com o mês passado"],
      };
    }

    // Gastos (inclui categoria específica).
    if (text.includes("gastei") || text.includes("gasto") || text.includes("despesa") || text.includes("paguei")) {
      const period = detectPeriod(question);
      const category = detectCategory(question);
      if (category) {
        const entry = store.expensesByCategory(period.from, period.to).find((item) => item.categoryId === category.id);
        const total = entry ? entry.total : 0;
        if (!total) return { text: `Não há gastos em ${category.name} ${period.label}.`, chips: ["Quanto gastei neste mês?"] };
        const totals = store.totals(period.from, period.to);
        const share = totals.expense > 0 ? (total / totals.expense) * 100 : 0;
        return {
          text: `Você gastou ${core.money(total)} em ${category.name} ${period.label}, ${core.percent(share)} das despesas do período (${plural(entry.count, "lançamento", "lançamentos")}).`,
          chips: ["Onde mais gastei?", "Como está meu orçamento?"],
        };
      }
      const totals = store.totals(period.from, period.to);
      if (totals.expense <= 0) {
        return { text: `Não há despesas registradas ${period.label}.`, chips: ["Qual é o meu saldo?"] };
      }
      const ranking = store
        .expensesByCategory(period.from, period.to)
        .slice(0, 3)
        .map((entry) => {
          const info = store.categoryById(entry.categoryId);
          return `${info ? info.name : "Categoria"}: ${core.money(entry.total)}`;
        });
      return {
        text: `Você gastou ${core.money(totals.expense)} ${period.label}.\n\nMaiores categorias:\n${list(ranking)}`,
        chips: ["Onde mais gastei?", "Como está meu orçamento?", "Quanto economizei?"],
      };
    }

    return {
      text:
        "Não entendi a pergunta. Posso ajudar com saldo, gastos, receitas, economia, orçamento, contas, metas, dívidas, assinaturas e previsão do mês. Tente reformular usando um desses temas.",
      chips: ["Qual é o meu saldo?", "Quanto gastei neste mês?", "Como está meu orçamento?"],
    };
  }

  const suggestions = [
    "Qual é o meu saldo?",
    "Quanto gastei neste mês?",
    "Onde mais gastei?",
    "Como está meu orçamento?",
    "Quanto economizei?",
    "Previsão para o fim do mês",
    "Quais contas vencem em breve?",
    "Como estão minhas metas?",
  ];

  Fin.assistant = { insights, answer, suggestions, normalize };
})(window.Fin);
