"use strict";

/**
 * Biblioteca local de documentos.
 * Os arquivos ficam em IndexedDB (não no localStorage), para não ocupar
 * o pequeno limite destinado às configurações e lançamentos do aplicativo.
 */
(function () {
  const DB_NAME = "meu-financeiro-arquivos";
  const STORE_NAME = "documentos";
  const MAX_FILE_SIZE = 25 * 1024 * 1024;
  const CATEGORIES = ["Comprovantes", "Receitas", "Despesas", "Relatórios", "Outros"];
  let dbPromise = null;
  let documents = [];
  let busy = false;

  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  function database() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("Este navegador não oferece armazenamento local de arquivos."));
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Não foi possível abrir a biblioteca de arquivos."));
    });
    return dbPromise;
  }

  async function runTransaction(mode, action) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;
      try { result = action(store); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result);
      tx.onerror = () => reject(tx.error || new Error("Não foi possível salvar o arquivo."));
      tx.onabort = () => reject(tx.error || new Error("A operação foi cancelada."));
    });
  }

  async function getAll() {
    const db = await database();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1).replace(".", ",") + " MB";
  }

  function formatDate(value) {
    try { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value)); }
    catch (_) { return "Data não disponível"; }
  }

  function fileIcon(name) {
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (ext === "pdf") return "PDF";
    if (["xls", "xlsx", "csv", "ods"].includes(ext)) return "XLS";
    if (["doc", "docx", "odt", "txt"].includes(ext)) return "DOC";
    if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "IMG";
    return "ARQ";
  }

  function notify(message, type) {
    if (window.FinApp && typeof window.FinApp.toast === "function") window.FinApp.toast(message, type || "info");
    else window.alert(message);
  }

  async function refresh() {
    documents = (await getAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    render();
  }

  function visibleDocuments() {
    const query = ($("#documents-search")?.value || "").trim().toLocaleLowerCase("pt-BR");
    const category = $("#documents-filter")?.value || "";
    return documents.filter((doc) => {
      const text = (doc.name + " " + (doc.description || "")).toLocaleLowerCase("pt-BR");
      return (!query || text.includes(query)) && (!category || doc.category === category);
    });
  }

  function render() {
    const list = $("#documents-list");
    if (!list) return;
    const filtered = visibleDocuments();
    const summary = $("#documents-summary");
    if (summary) summary.textContent = documents.length + (documents.length === 1 ? " arquivo armazenado" : " arquivos armazenados") + (filtered.length !== documents.length ? " · " + filtered.length + " exibidos" : "");
    if (!filtered.length) {
      list.innerHTML = '<div class="card documents-empty"><strong>' + (documents.length ? "Nenhum arquivo encontrado" : "Sua biblioteca está vazia") + '</strong><p>' + (documents.length ? "Tente mudar a busca ou a categoria." : "Toque em “Adicionar arquivos” para importar seu primeiro documento.") + '</p></div>';
      return;
    }
    list.innerHTML = filtered.map((doc) => {
      const options = CATEGORIES.map((category) => '<option value="' + category + '"' + (doc.category === category ? " selected" : "") + '>' + category + '</option>').join("");
      return '<article class="card document-item" data-document-id="' + esc(doc.id) + '">' +
        '<div class="document-type-icon" aria-label="Tipo de arquivo">' + fileIcon(doc.name) + '</div>' +
        '<div class="document-info"><strong>' + esc(doc.name) + '</strong>' +
        '<p>' + formatSize(doc.size) + ' · Adicionado em ' + formatDate(doc.createdAt) + '</p>' +
        (doc.description ? '<p>' + esc(doc.description) + '</p>' : '') +
        '<div class="document-meta"><label class="visually-hidden" for="category-' + esc(doc.id) + '">Categoria</label><select id="category-' + esc(doc.id) + '" data-document-category>' + options + '</select></div></div>' +
        '<div class="document-actions"><button class="btn secondary" type="button" data-document-action="open">Abrir</button><button class="btn ghost" type="button" data-document-action="download">Baixar</button><button class="btn ghost" type="button" data-document-action="delete">Excluir</button></div></article>';
    }).join("");
  }

  async function importFiles(files) {
    if (busy || !files.length) return;
    busy = true;
    let saved = 0;
    const failures = [];
    try {
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          failures.push(file.name + " (limite de 25 MB)");
          continue;
        }
        const id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
        const category = $("#documents-new-category")?.value || "Outros";
        const description = ($("#documents-description")?.value || "").trim().slice(0, 180);
        const record = { id, name: file.name, type: file.type || "application/octet-stream", size: file.size, category, description, createdAt: new Date().toISOString(), blob: file };
        await runTransaction("readwrite", (store) => store.put(record));
        saved += 1;
      }
      await refresh();
      if (saved) notify(saved + (saved === 1 ? " arquivo adicionado à biblioteca." : " arquivos adicionados à biblioteca."), "success");
      if (failures.length) notify("Não foi possível importar: " + failures.join(", "), "warning");
    } catch (error) {
      notify(error.message || "Falha ao importar os arquivos.", "danger");
      await refresh().catch(() => {});
    } finally {
      busy = false;
      const input = $("#documents-file-input");
      if (input) input.value = "";
    }
  }

  async function openFile(doc, download) {
    const url = URL.createObjectURL(doc.blob);
    const link = document.createElement("a");
    link.href = url;
    if (download) {
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } else {
      const opened = window.open(url, "_blank", "noopener");
      if (!opened) {
        link.download = doc.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        notify("O navegador bloqueou a nova aba. O arquivo foi baixado.", "info");
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  }

  async function handleListChange(event) {
    const select = event.target.closest("[data-document-category]");
    if (!select) return;
    const card = select.closest("[data-document-id]");
    const doc = documents.find((item) => item.id === card?.dataset.documentId);
    if (!doc) return;
    try {
      doc.category = select.value;
      await runTransaction("readwrite", (store) => store.put(doc));
      await refresh();
      notify("Categoria atualizada.", "success");
    } catch (error) { notify(error.message || "Não foi possível alterar a categoria.", "danger"); }
  }

  async function handleListClick(event) {
    const button = event.target.closest("[data-document-action]");
    if (!button) return;
    const card = button.closest("[data-document-id]");
    const doc = documents.find((item) => item.id === card?.dataset.documentId);
    if (!doc) return;
    try {
      if (button.dataset.documentAction === "open") await openFile(doc, false);
      if (button.dataset.documentAction === "download") await openFile(doc, true);
      if (button.dataset.documentAction === "delete") {
        if (!window.confirm('Excluir "' + doc.name + '" da biblioteca deste aparelho?')) return;
        await runTransaction("readwrite", (store) => store.delete(doc.id));
        await refresh();
        notify("Arquivo excluído da biblioteca.", "success");
      }
    } catch (error) { notify(error.message || "Não foi possível realizar a operação.", "danger"); }
  }

  function bind() {
    $("#documents-add")?.addEventListener("click", () => {
      const input = $("#documents-file-input");
      if (!input) return;
      input.click();
    });
    $("#documents-file-input")?.addEventListener("change", (event) => importFiles(Array.from(event.target.files || [])));
    $("#documents-search")?.addEventListener("input", render);
    $("#documents-filter")?.addEventListener("change", render);
    $("#documents-list")?.addEventListener("change", handleListChange);
    $("#documents-list")?.addEventListener("click", handleListClick);
    // Categorias e descrição são perguntadas antes de selecionar os arquivos.
    $("#documents-add")?.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  window.FinDocuments = {
    render() {
      refresh().catch((error) => {
        const list = $("#documents-list");
        if (list) list.innerHTML = '<div class="card documents-empty">Não foi possível acessar a biblioteca: ' + esc(error.message) + '</div>';
      });
    },
  };

  bind();
})();
