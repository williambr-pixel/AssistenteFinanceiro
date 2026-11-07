"use strict";

/**
 * Interface e controle do registro por voz.
 * O reconhecimento é fornecido pelo navegador; os dados continuam sob controle
 * do app principal e só são salvos depois da revisão do usuário.
 */
(function () {
  const Fin = window.Fin = window.Fin || {};

  function createVoiceController(dependencies) {
    const { $, el, esc, icon, openModal, closeModal, parseVoiceTransaction, openTransactionModal } = dependencies;
    let voiceRecognition = null;
    let voiceTranscript = "";

    function stopVoiceRecognition() {
      if (!voiceRecognition) return;
      const current = voiceRecognition;
      voiceRecognition = null;
      try { current.abort(); }
      catch (error) { console.warn("Não foi possível interromper o reconhecimento de voz:", error); }
    }

    function openVoiceModal() {
      stopVoiceRecognition();
      voiceTranscript = "";
      const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
      const supported = Boolean(SpeechRecognitionCtor);
      const canListen = supported && window.isSecureContext;
      let statusText = "Toque no microfone e diga o lançamento.";
      if (!supported) statusText = "Este navegador não oferece reconhecimento de voz. Digite o lançamento abaixo.";
      else if (!window.isSecureContext) statusText = "O microfone exige HTTPS ou localhost. Digite o lançamento abaixo.";

      const body = `<div class="voice-stage" id="voice-stage">
        <button class="voice-mic" id="voice-mic" type="button" aria-label="Começar a ouvir" ${canListen ? "" : "disabled"}>${icon("mic")}</button>
        <p class="voice-status" id="voice-status" role="status">${esc(statusText)}</p>
        <p class="voice-transcript empty" id="voice-transcript" aria-live="polite">A transcrição aparece aqui.</p>
        <div class="voice-actions">
          <button class="btn secondary small" id="voice-again" type="button" hidden>${icon("mic")}<span>Ouvir de novo</span></button>
          <button class="btn ghost small" id="voice-clear" type="button" hidden>Limpar</button>
        </div>
        <div class="voice-examples">
          <span>Experimente dizer</span>
          <button class="chip" type="button" data-voice-example="Gastei 45 reais no supermercado hoje">“Gastei 45 reais no supermercado hoje”</button>
          <button class="chip" type="button" data-voice-example="Paguei 120 no boleto da internet ontem">“Paguei 120 no boleto da internet ontem”</button>
          <button class="chip" type="button" data-voice-example="Recebi 3000 de salário">“Recebi 3000 de salário”</button>
        </div>
        <label class="field voice-fallback"><span>Ou digite o lançamento</span><textarea id="voice-text" data-no-focus rows="2" maxlength="240" placeholder="Ex.: Farmácia 45 reais ontem no débito"></textarea></label>
        <p class="hint">${canListen ? "O navegador pode enviar o áudio para o serviço de voz. Você revisa tudo antes de salvar." : "O formulário manual continua disponível a qualquer momento."}</p>
      </div>`;

      openModal({
        title: "Registrar por voz",
        subtitle: "Fale um lançamento por vez. A categoria e os campos são sugeridos para você revisar.",
        body,
        submit: "Revisar lançamento",
        onSubmit: () => {
          const text = (voiceTranscript || $("#voice-text", el.modalBody).value || "").trim();
          if (!text) throw new Error("Fale ou digite o lançamento antes de revisar.");
          stopVoiceRecognition();
          const draft = parseVoiceTransaction(text);
          // Troca o conteúdo do mesmo modal, sem fechar e reabrir o <dialog>.
          // Isso evita que o evento "close" da etapa de voz interfira na revisão.
          openTransactionModal(null, draft.date, draft, text);
          // Garanta que o botão represente a ação desta segunda etapa.
          el.modalSubmit.textContent = "Salvar lançamento";
          el.modalSubmit.disabled = false;
          return false;
        },
      });

      const stage = $("#voice-stage", el.modalBody);
      const micButton = $("#voice-mic", el.modalBody);
      const statusBox = $("#voice-status", el.modalBody);
      const transcriptBox = $("#voice-transcript", el.modalBody);
      const textArea = $("#voice-text", el.modalBody);
      const againButton = $("#voice-again", el.modalBody);
      const clearButton = $("#voice-clear", el.modalBody);

      function syncTranscript(value) {
        voiceTranscript = String(value || "").trim();
        transcriptBox.textContent = voiceTranscript || "A transcrição aparece aqui.";
        transcriptBox.classList.toggle("empty", !voiceTranscript);
        if (textArea.value !== voiceTranscript) textArea.value = voiceTranscript;
        againButton.hidden = !voiceTranscript;
        clearButton.hidden = !voiceTranscript;
        if (voiceTranscript) statusBox.textContent = "Confira a transcrição e toque em “Revisar lançamento”.";
      }

      function startListening() {
        if (!canListen || voiceRecognition) return;
        voiceTranscript = "";
        syncTranscript("");
        againButton.hidden = true;
        clearButton.hidden = true;
        stage.classList.add("listening");
        micButton.setAttribute("aria-label", "Parar de ouvir");
        statusBox.textContent = "Ouvindo... fale agora.";

        const recognition = new SpeechRecognitionCtor();
        voiceRecognition = recognition;
        let finalText = "";
        let interimText = "";
        let failed = false;
        recognition.lang = "pt-BR";
        recognition.interimResults = true;
        recognition.continuous = true;
        recognition.maxAlternatives = 3;

        recognition.onstart = () => {
          statusBox.textContent = "Ouvindo... fale com naturalidade. Toque no microfone para encerrar.";
        };
        recognition.onresult = (event) => {
          interimText = "";
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            let bestAlternative = null;
            for (let alternativeIndex = 0; alternativeIndex < result.length; alternativeIndex += 1) {
              const alternative = result[alternativeIndex];
              if (!bestAlternative || Number(alternative.confidence || 0) > Number(bestAlternative.confidence || 0)) bestAlternative = alternative;
            }
            const piece = String(bestAlternative && bestAlternative.transcript ? bestAlternative.transcript : "").trim();
            if (!piece) continue;
            if (result.isFinal) finalText = `${finalText} ${piece}`.trim();
            else interimText = `${interimText} ${piece}`.trim();
          }
          const combined = `${finalText} ${interimText}`.trim();
          if (combined) syncTranscript(combined);
        };
        recognition.onerror = (event) => {
          failed = true;
          const messages = {
            "not-allowed": "Permissão do microfone negada. Libere o acesso nas configurações do navegador ou digite abaixo.",
            "service-not-allowed": "O reconhecimento de voz foi bloqueado. Digite abaixo.",
            "audio-capture": "Nenhum microfone foi encontrado. Digite abaixo.",
            "no-speech": "Não ouvi nada. Tente novamente ou digite abaixo.",
            "network": "Sem conexão com o serviço de voz. Verifique a internet ou digite abaixo.",
            "aborted": "Gravação interrompida.",
          };
          statusBox.textContent = messages[event.error] || "Não foi possível ouvir. Tente novamente ou digite abaixo.";
        };
        recognition.onend = () => {
          if (voiceRecognition === recognition) voiceRecognition = null;
          stage.classList.remove("listening");
          micButton.setAttribute("aria-label", "Começar a ouvir");
          if (!voiceTranscript && interimText) syncTranscript(interimText);
          if (voiceTranscript) {
            micButton.classList.add("done");
            setTimeout(() => micButton.classList.remove("done"), 600);
          } else if (!failed) {
            statusBox.textContent = "Não entendi. Toque no microfone e tente de novo.";
          }
        };
        try { recognition.start(); }
        catch (error) {
          voiceRecognition = null;
          stage.classList.remove("listening");
          micButton.setAttribute("aria-label", "Começar a ouvir");
          statusBox.textContent = "Não foi possível iniciar o microfone. Digite abaixo.";
          console.warn("Reconhecimento de voz indisponível:", error);
        }
      }

      micButton.addEventListener("click", () => {
        if (voiceRecognition) stopVoiceRecognition();
        else startListening();
      });
      againButton.addEventListener("click", startListening);
      clearButton.addEventListener("click", () => {
        syncTranscript("");
        statusBox.textContent = canListen ? "Toque no microfone e diga o lançamento." : statusText;
      });
      textArea.addEventListener("input", () => syncTranscript(textArea.value));
      $$("[data-voice-example]", el.modalBody).forEach((button) => {
        button.addEventListener("click", () => {
          syncTranscript(button.dataset.voiceExample);
          statusBox.textContent = "Exemplo carregado. Toque em “Revisar lançamento” para conferir os campos.";
        });
      });
    }

    return { openVoiceModal };
  }

  Fin.voice = { create: createVoiceController };
})();
