/* Modo Empreendedor
 * Área independente do controle financeiro pessoal.
 * Os dados ficam neste navegador, em uma chave JSON própria.
 * Não são misturados aos lançamentos pessoais do Meu Financeiro.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "meu-financeiro-modo-empreendedor-v1";
  const root = document.getElementById("view-entrepreneur");
  if (!root) return;

  // Lê o arquivo JSON local. Se ainda não existir, começa vazio.
  function carregarDados() {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      if (!salvo) return { clientes: [], historico: [] };
      const dados = JSON.parse(salvo);
      return {
        clientes: Array.isArray(dados.clientes) ? dados.clientes : [],
        historico: Array.isArray(dados.historico) ? dados.historico : [],
      };
    } catch (erro) {
      console.error("Não foi possível ler os dados do Modo Empreendedor:", erro);
      return { clientes: [], historico: [] };
    }
  }

  let dados = carregarDados();

  // Salva tudo em JSON separado dos dados pessoais do aplicativo.
  function salvarDados() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
      return true;
    } catch (erro) {
      console.error("Não foi possível salvar o Modo Empreendedor:", erro);
      mostrarAviso("Não foi possível salvar. Verifique o espaço disponível no aparelho.", "erro");
      return false;
    }
  }

  function criarId() {
    return window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : "cliente-" + Date.now() + "-" + Math.floor(Math.random() * 1000000);
  }

  // Converte valores digitados em reais para centavos, evitando erros de arredondamento.
  function lerValor(valor) {
    let texto = String(valor || "").trim().replace(/R\$\s?/gi, "").replace(/\s/g, "");
    if (!texto) return NaN;
    if (texto.includes(",") && texto.includes(".")) {
      texto = texto.lastIndexOf(",") > texto.lastIndexOf(".")
        ? texto.replace(/\./g, "").replace(",", ".")
        : texto.replace(/,/g, "");
    } else if (texto.includes(",")) {
      texto = texto.replace(",", ".");
    }
    if (!/^\d+(\.\d{1,2})?$/.test(texto)) return NaN;
    const numero = Number(texto);
    return Number.isFinite(numero) ? Math.round(numero * 100) : NaN;
  }

  function formatarDinheiro(centavos) {
    return (Number(centavos || 0) / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function escapar(texto) {
    return String(texto == null ? "" : texto)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function dataHora(iso) {
    const data = new Date(iso);
    if (Number.isNaN(data.getTime())) return "Data indisponível";
    return data.toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  function mostrarAviso(mensagem, tipo) {
    const aviso = document.getElementById("emp-message");
    if (!aviso) return;
    aviso.textContent = mensagem;
    aviso.className = "emp-message " + (tipo || "info");
    aviso.hidden = false;
  }

  function registrarHistorico(cliente, tipo, valorCentavos) {
    dados.historico.unshift({
      id: criarId(),
      dataHora: new Date().toISOString(),
      clienteId: cliente.id,
      nomeCliente: cliente.nome,
      tipo: tipo,
      valor: valorCentavos,
      saldoRestante: cliente.saldo,
    });
  }

  // Cadastra um cliente e registra a dívida inicial no histórico.
  function cadastrar_cliente(nome, valorCentavos) {
    const nomeLimpo = String(nome || "").trim();
    if (!nomeLimpo) throw new Error("Informe o nome do cliente.");
    if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) {
      throw new Error("Informe uma dívida maior que zero.");
    }

    const cliente = {
      id: criarId(),
      nome: nomeLimpo,
      valorInicial: valorCentavos,
      saldo: valorCentavos,
      dataCadastro: new Date().toISOString(),
    };
    dados.clientes.push(cliente);
    registrarHistorico(cliente, "Dívida", valorCentavos);
    if (!salvarDados()) {
      dados.clientes = dados.clientes.filter((item) => item.id !== cliente.id);
      dados.historico = dados.historico.filter((item) => item.clienteId !== cliente.id);
      throw new Error("O cliente não foi cadastrado porque o salvamento falhou.");
    }
    return cliente;
  }

  // Registra um pagamento e reduz o saldo, sem permitir pagamento acima da dívida.
  function registrar_pagamento(clienteId, valorCentavos) {
    const cliente = dados.clientes.find((item) => item.id === clienteId);
    if (!cliente) throw new Error("Selecione um cliente cadastrado.");
    if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) {
      throw new Error("Informe um pagamento maior que zero.");
    }
    if (cliente.saldo <= 0) throw new Error("Este cliente já está quitado.");
    if (valorCentavos > cliente.saldo) {
      throw new Error("O pagamento não pode ser maior que a dívida restante de " + formatarDinheiro(cliente.saldo) + ".");
    }

    const saldoAnterior = cliente.saldo;
    cliente.saldo -= valorCentavos;
    registrarHistorico(cliente, "Pagamento", valorCentavos);
    if (!salvarDados()) {
      cliente.saldo = saldoAnterior;
      dados.historico.shift();
      throw new Error("O pagamento não foi registrado porque o salvamento falhou.");
    }
    return cliente;
  }

  // Mostra a lista de clientes, o saldo de cada um e o total a receber.
  function mostrar_clientes() {
    const lista = document.getElementById("emp-client-list");
    const total = dados.clientes.reduce((soma, cliente) => soma + cliente.saldo, 0);
    const quantidade = dados.clientes.length;
    document.getElementById("emp-total-receber").textContent = formatarDinheiro(total);
    document.getElementById("emp-total-clientes").textContent = String(quantidade);
    document.getElementById("emp-total-pendentes").textContent =
      String(dados.clientes.filter((cliente) => cliente.saldo > 0).length);

    if (!quantidade) {
      lista.innerHTML = '<div class="emp-empty">Nenhum cliente cadastrado ainda.</div>';
      return;
    }

    lista.innerHTML = dados.clientes.map((cliente) => {
      const quitado = cliente.saldo === 0;
      return '<article class="emp-client-row">' +
        '<div class="emp-client-info"><strong>' + escapar(cliente.nome) + '</strong>' +
        '<span>Cadastro: ' + escapar(dataHora(cliente.dataCadastro)) + '</span></div>' +
        '<div class="emp-client-balance"><strong>' + formatarDinheiro(cliente.saldo) + '</strong>' +
        '<span class="' + (quitado ? "emp-paid" : "emp-open") + '">' + (quitado ? "Quitado" : "Em aberto") + '</span></div>' +
        '</article>';
    }).join("");
  }

  // Filtra o histórico geral ou deixa visível somente um cliente.
  function mostrar_historico(clienteId) {
    const corpo = document.getElementById("emp-history-list");
    const registros = dados.historico.filter((item) => !clienteId || item.clienteId === clienteId);
    if (!registros.length) {
      corpo.innerHTML = '<div class="emp-empty">Nenhuma movimentação encontrada.</div>';
      return;
    }
    corpo.innerHTML = registros.map((item) =>
      '<article class="emp-history-row">' +
        '<div><strong>' + escapar(item.nomeCliente) + '</strong><span>' + escapar(dataHora(item.dataHora)) + '</span></div>' +
        '<span class="emp-history-type ' + (item.tipo === "Pagamento" ? "payment" : "debt") + '">' + escapar(item.tipo) + '</span>' +
        '<div class="emp-history-values"><strong>' + formatarDinheiro(item.valor) + '</strong><span>Saldo: ' + formatarDinheiro(item.saldoRestante) + '</span></div>' +
      '</article>'
    ).join("");
  }

  function atualizarSeletores() {
    const seletorPagamento = document.getElementById("emp-payment-client");
    const seletorHistorico = document.getElementById("emp-history-client");
    const pagamentoAtual = seletorPagamento.value;
    const historicoAtual = seletorHistorico.value;
    const opcoes = dados.clientes.map((cliente) =>
      '<option value="' + escapar(cliente.id) + '">' + escapar(cliente.nome) +
      (cliente.saldo === 0 ? " — Quitado" : " — " + formatarDinheiro(cliente.saldo)) + '</option>'
    ).join("");
    seletorPagamento.innerHTML = '<option value="">Selecione um cliente</option>' +
      dados.clientes.filter((cliente) => cliente.saldo > 0).map((cliente) =>
        '<option value="' + escapar(cliente.id) + '">' + escapar(cliente.nome) +
        " — " + formatarDinheiro(cliente.saldo) + '</option>'
      ).join("");
    seletorHistorico.innerHTML = '<option value="">Todos os clientes</option>' + opcoes;
    if (dados.clientes.some((cliente) => cliente.id === pagamentoAtual && cliente.saldo > 0)) {
      seletorPagamento.value = pagamentoAtual;
    }
    if (dados.clientes.some((cliente) => cliente.id === historicoAtual)) {
      seletorHistorico.value = historicoAtual;
    }
  }

  // Atualiza todos os quadros quando a tela é aberta ou um dado muda.
  function render() {
    mostrar_clientes();
    atualizarSeletores();
    mostrar_historico(document.getElementById("emp-history-client").value);
  }

  document.getElementById("emp-client-form").addEventListener("submit", function (evento) {
    evento.preventDefault();
    const nome = document.getElementById("emp-client-name").value;
    const valor = lerValor(document.getElementById("emp-client-debt").value);
    try {
      const cliente = cadastrar_cliente(nome, valor);
      this.reset();
      mostrarAviso("Cliente " + cliente.nome + " cadastrado com sucesso.", "sucesso");
      render();
    } catch (erro) {
      mostrarAviso(erro.message, "erro");
    }
  });

  document.getElementById("emp-payment-form").addEventListener("submit", function (evento) {
    evento.preventDefault();
    const clienteId = document.getElementById("emp-payment-client").value;
    const valor = lerValor(document.getElementById("emp-payment-value").value);
    try {
      const cliente = registrar_pagamento(clienteId, valor);
      this.reset();
      mostrarAviso(cliente.saldo === 0
        ? "Pagamento registrado. " + cliente.nome + " está Quitado!"
        : "Pagamento registrado. Restam " + formatarDinheiro(cliente.saldo) + " para " + cliente.nome + ".",
      "sucesso");
      render();
    } catch (erro) {
      mostrarAviso(erro.message, "erro");
    }
  });

  document.getElementById("emp-history-client").addEventListener("change", function () {
    mostrar_historico(this.value);
  });

  // Mantém o histórico atualizado ao trocar de tela e ao voltar para ela.
  window.FinEntrepreneur = { render: render };
  render();
})();
