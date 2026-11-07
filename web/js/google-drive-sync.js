"use strict";

/**
 * Backup criptografado no Google Drive (appDataFolder).
 * O token OAuth e a chave de criptografia permanecem somente em memória.
 * O app continua local/offline quando o Google Drive não está conectado.
 */
(function () {
  const CLIENT_KEY = "meu-financeiro-google-client-id";
  const REMOTE_KEY = "meu-financeiro-drive-remote";
  const FILE_NAME = "meu-financeiro-backup.enc";
  const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
  const MAX_BACKUP_BYTES = 80 * 1024 * 1024;
  const $ = (id) => document.getElementById(id);

  let token = null;
  let tokenExpiresAt = 0;
  let passphrase = "";
  let syncTimer = null;
  let syncing = false;
  let suspended = false;
  let lastRemoteModified = localStorage.getItem(REMOTE_KEY) || "";
  let knownFileId = null;
  let pendingConflict = false;

  function status(message, tone) {
    const node = $("drive-sync-status");
    if (!node) return;
    node.textContent = message;
    node.dataset.tone = tone || "info";
  }

  function clientId() {
    return ($("drive-client-id")?.value || localStorage.getItem(CLIENT_KEY) || "").trim();
  }

  function setBusy(value) {
    ["drive-connect", "drive-backup", "drive-restore"].forEach((id) => {
      const button = $(id);
      if (button) button.disabled = value;
    });
  }

  function loadGoogleIdentity() {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts?.oauth2) return resolve();
      const existing = document.querySelector('script[data-google-identity]');
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = "true";
      script.onload = resolve;
      script.onerror = () => reject(new Error("Não foi possível carregar a autenticação do Google. Verifique sua conexão."));
      document.head.appendChild(script);
    });
  }

  async function connect() {
    const id = clientId();
    const secret = $("drive-passphrase")?.value || "";
    if (!id || !id.endsWith(".apps.googleusercontent.com")) {
      throw new Error("Informe um ID de cliente OAuth válido do Google Cloud.");
    }
    if (secret.length < 12) {
      throw new Error("Crie uma senha de criptografia com pelo menos 12 caracteres. Não use a senha da sua conta Google.");
    }
    if (!window.isSecureContext || !crypto.subtle) {
      throw new Error("A criptografia exige HTTPS e um navegador compatível.");
    }
    localStorage.setItem(CLIENT_KEY, id);
    if ($("drive-client-id")) $("drive-client-id").value = id;
    passphrase = secret;
    await loadGoogleIdentity();
    return new Promise((resolve, reject) => {
      const tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: id,
        scope: SCOPE,
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(new Error(response.error_description || response.error || "O Google não autorizou o acesso ao Drive."));
            return;
          }
          token = response.access_token;
          tokenExpiresAt = Date.now() + Math.max(60, Number(response.expires_in || 3600) - 60) * 1000;
          resolve();
        },
        error_callback: (error) => reject(new Error(error.message || "A janela de autorização do Google foi bloqueada.")),
      });
      tokenClient.requestAccessToken({ prompt: "consent" });
    });
  }

  function requireSession() {
    if (!token || Date.now() >= tokenExpiresAt) {
      token = null;
      throw new Error("A conexão com o Google expirou. Toque em “Conectar ao Google Drive” novamente.");
    }
    if (!passphrase) throw new Error("Digite novamente sua senha de criptografia.");
  }

  async function driveRequest(url, options = {}) {
    requireSession();
    const response = await fetch(url, {
      ...options,
      headers: { Authorization: "Bearer " + token, ...(options.headers || {}) },
    });
    if (response.status === 401) {
      token = null;
      throw new Error("A autorização do Google expirou. Conecte novamente sua conta.");
    }
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json()).error?.message || ""; } catch (_) {}
      throw new Error(detail || "O Google Drive recusou a operação (HTTP " + response.status + ").");
    }
    return response;
  }

  async function findBackup() {
    const query = encodeURIComponent("name = '" + FILE_NAME + "' and 'appDataFolder' in parents and trashed = false");
    const response = await driveRequest("https://www.googleapis.com/drive/v3/files?q=" + query + "&spaces=appDataFolder&pageSize=10&fields=files(id,name,modifiedTime,size)");
    const data = await response.json();
    const files = data.files || [];
    if (!files.length) return null;
    files.sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)));
    return files[0];
  }

  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function deriveKey(salt) {
    const material = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  async function makePackage() {
    const documents = window.FinDocuments?.exportBackup
      ? await window.FinDocuments.exportBackup()
      : [];
    const financialBackup = JSON.parse(window.Fin.store.exportJSON());
    // O PIN é específico do aparelho e não deve ser transferido junto com o backup.
    if (financialBackup.data?.settings) delete financialBackup.data.settings.pinHash;
    const payload = {
      app: "meu-financeiro",
      version: 1,
      createdAt: new Date().toISOString(),
      financialBackup,
      documents,
    };
    const plain = new TextEncoder().encode(JSON.stringify(payload));
    if (plain.byteLength > MAX_BACKUP_BYTES) {
      throw new Error("O backup ultrapassou 80 MB. Remova arquivos grandes da biblioteca e tente novamente.");
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(salt);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
    return JSON.stringify({
      app: "meu-financeiro-encrypted-backup",
      version: 1,
      algorithm: "AES-256-GCM",
      kdf: "PBKDF2-SHA-256",
      iterations: 310000,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    });
  }

  async function decodePackage(text) {
    const envelope = JSON.parse(text);
    if (envelope.app !== "meu-financeiro-encrypted-backup" || envelope.version !== 1) {
      throw new Error("O arquivo do Drive não é um backup compatível do Meu Financeiro.");
    }
    const key = await deriveKey(base64ToBytes(envelope.salt));
    let plain;
    try {
      plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
        key,
        base64ToBytes(envelope.ciphertext),
      );
    } catch (_) {
      throw new Error("Não foi possível abrir o backup. Confira a senha de criptografia.");
    }
    const payload = JSON.parse(new TextDecoder().decode(plain));
    if (payload.app !== "meu-financeiro" || !payload.financialBackup?.data) {
      throw new Error("O conteúdo do backup está incompleto ou é inválido.");
    }
    return payload;
  }

  async function downloadRemote(file) {
    const response = await driveRequest("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(file.id) + "?alt=media");
    return decodePackage(await response.text());
  }

  async function uploadEncrypted(fileId) {
    const encryptedText = await makePackage();
    const blob = new Blob([encryptedText], { type: "application/octet-stream" });
    let response;
    if (fileId) {
      response = await driveRequest(
        "https://www.googleapis.com/upload/drive/v3/files/" + encodeURIComponent(fileId) + "?uploadType=media&fields=id,name,modifiedTime",
        { method: "PATCH", headers: { "Content-Type": "application/octet-stream" }, body: blob },
      );
    } else {
      const boundary = "mf_" + crypto.randomUUID().replace(/-/g, "");
      const metadata = { name: FILE_NAME, parents: ["appDataFolder"], mimeType: "application/octet-stream" };
      const body = new Blob([
        "--" + boundary + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n",
        JSON.stringify(metadata) + "\r\n--" + boundary + "\r\nContent-Type: application/octet-stream\r\n\r\n",
        blob, "\r\n--" + boundary + "--",
      ]);
      response = await driveRequest(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime",
        { method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + boundary }, body },
      );
    }
    const result = await response.json();
    knownFileId = result.id || fileId;
    lastRemoteModified = result.modifiedTime || new Date().toISOString();
    localStorage.setItem(REMOTE_KEY, lastRemoteModified);
    pendingConflict = false;
    return result;
  }

  async function restorePayload(payload) {
    const docs = Array.isArray(payload.documents) ? payload.documents : [];
    if (!window.confirm("Restaurar o backup substituirá seus lançamentos, categorias, metas e configurações atuais. Os documentos do backup serão adicionados à biblioteca. Faça um backup local antes de continuar. Deseja prosseguir?")) return false;
    suspended = true;
    try {
      if (docs.length && window.FinDocuments?.restoreBackup) {
        await window.FinDocuments.restoreBackup(docs);
      }
      const restoredState = JSON.parse(JSON.stringify(payload.financialBackup.data));
      restoredState.settings = restoredState.settings || {};
      // Preserva o PIN já definido neste aparelho; o PIN não viaja entre dispositivos.
      restoredState.settings.pinHash = window.Fin.store.state.settings.pinHash || "";
      window.Fin.store.replace(restoredState, { allowRecovery: true });
      return true;
    } finally {
      suspended = false;
    }
  }

  async function backupNow({ automatic = false } = {}) {
    if (syncing || suspended) return;
    requireSession();
    syncing = true;
    setBusy(true);
    try {
      const remote = await findBackup();
      if (remote && !knownFileId) {
        knownFileId = remote.id;
        if (!automatic) {
          status("Já existe um backup nesta conta. Escolha restaurar a cópia da nuvem ou substituí-la pela deste aparelho.", "warning");
          $("drive-restore")?.removeAttribute("hidden");
          $("drive-backup")?.removeAttribute("hidden");
          pendingConflict = true;
          return;
        }
        status("Há um backup na nuvem. Abra Configurações e escolha restaurar ou substituir para evitar sobrescrever dados.", "warning");
        pendingConflict = true;
        return;
      }
      if (remote && lastRemoteModified && remote.modifiedTime !== lastRemoteModified) {
        pendingConflict = true;
        status("O backup na nuvem foi alterado em outro aparelho. A sincronização automática foi pausada para evitar perda de dados. Escolha restaurar ou substituir.", "warning");
        return;
      }
      const result = await uploadEncrypted(remote?.id || knownFileId);
      status("Backup criptografado atualizado em " + new Date(result.modifiedTime || Date.now()).toLocaleString("pt-BR") + ".", "success");
    } finally {
      syncing = false;
      setBusy(false);
    }
  }

  async function restoreNow() {
    if (syncing) return;
    requireSession();
    syncing = true;
    setBusy(true);
    try {
      const remote = await findBackup();
      if (!remote) throw new Error("Não há backup do Meu Financeiro nesta conta Google.");
      const payload = await downloadRemote(remote);
      const restored = await restorePayload(payload);
      if (restored) {
        knownFileId = remote.id;
        lastRemoteModified = remote.modifiedTime || "";
        localStorage.setItem(REMOTE_KEY, lastRemoteModified);
        pendingConflict = false;
        status("Backup restaurado neste aparelho. A sincronização automática está pronta.", "success");
      }
    } finally {
      syncing = false;
      setBusy(false);
    }
  }

  function schedule(reason) {
    if (!token || !passphrase || pendingConflict || suspended) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      backupNow({ automatic: true }).catch((error) => status(error.message, "warning"));
    }, 4000);
  }

  function bind() {
    const clientInput = $("drive-client-id");
    if (clientInput) clientInput.value = localStorage.getItem(CLIENT_KEY) || "";
    $("drive-connect")?.addEventListener("click", async () => {
      try {
        setBusy(true);
        status("Conectando à sua conta Google…", "info");
        await connect();
        const remote = await findBackup();
        if (!remote) {
          const result = await uploadEncrypted(null);
          status("Conectado! Primeiro backup criptografado salvo no Google Drive.", "success");
        } else {
          knownFileId = remote.id;
          status("Conta conectada. Já existe um backup na nuvem. Escolha restaurar ou substituir para evitar perda de dados.", "warning");
          pendingConflict = true;
          $("drive-restore")?.removeAttribute("hidden");
          $("drive-backup")?.removeAttribute("hidden");
        }
      } catch (error) {
        status(error.message || "Não foi possível conectar ao Google Drive.", "danger");
      } finally {
        setBusy(false);
      }
    });
    $("drive-backup")?.addEventListener("click", async () => {
      try {
        if (pendingConflict && knownFileId) {
          if (!window.confirm("Isso substituirá o backup que já está no Google Drive pelo conteúdo deste aparelho. Deseja continuar?")) return;
          // A escolha explícita do usuário autoriza substituir a versão remota atual.
          lastRemoteModified = "";
          localStorage.removeItem(REMOTE_KEY);
          pendingConflict = false;
        }
        await backupNow();
      } catch (error) { status(error.message, "danger"); }
    });
    $("drive-restore")?.addEventListener("click", async () => {
      try { await restoreNow(); }
      catch (error) { status(error.message, "danger"); }
    });
    if (window.Fin?.store?.subscribe) {
      window.Fin.store.subscribe(() => schedule("financial-data"));
    }
    window.addEventListener("online", () => schedule("reconnected"));
    status("Desconectado. Os dados continuam salvos somente neste aparelho até você conectar o Google Drive.", "info");
  }

  window.FinDriveSync = { schedule, backupNow, restoreNow };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})();
