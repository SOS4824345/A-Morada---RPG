(function () {
  "use strict";

  const fallbackMessage = "A cidade ainda se lembra de você.";
  const config = window.A_MORADA_CONFIG || {};
  const isConfigured = config.supabaseUrl && config.supabaseAnonKey && !config.supabaseUrl.startsWith("COLE_");

  async function readHubMessage() {
    const target = document.querySelector("[data-hub-message]");
    if (!target) return;
    if (!isConfigured) {
      target.textContent = fallbackMessage;
      setState("Exibindo mensagem local · Supabase ainda não configurado");
      return;
    }
    try {
      const url = `${config.supabaseUrl}/rest/v1/game_messages?message_key=eq.hub_message&select=message_text&limit=1`;
      const response = await fetch(url, { headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível consultar a mensagem.");
      const rows = await response.json();
      target.textContent = rows[0]?.message_text || fallbackMessage;
      setState("Mensagem recebida do arquivo");
    } catch (error) {
      target.textContent = fallbackMessage;
      setState("Sem contato com o arquivo · exibindo cópia local");
      console.warn(error);
    }
  }

  async function saveHubMessage(event) {
    event.preventDefault();
    const input = document.querySelector("[data-message-input]");
    const button = document.querySelector("[data-save-message]");
    if (!input || !button) return;
    if (!isConfigured) {
      setMasterState("A conexão ainda não foi configurada. Leia o Guia para David.");
      return;
    }
    const value = input.value.trim();
    if (!value) {
      setMasterState("Escreva uma mensagem antes de salvar.");
      return;
    }
    button.disabled = true;
    setMasterState("Salvando…");
    try {
      const url = `${config.supabaseUrl}/rest/v1/game_messages?message_key=eq.hub_message`;
      const response = await fetch(url, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ message_text: value, updated_at: new Date().toISOString() })
      });
      if (!response.ok) throw new Error("O Supabase recusou a alteração.");
      setMasterState("Mensagem salva. Alice verá o novo texto ao abrir ou atualizar o Hub.");
    } catch (error) {
      setMasterState("Não foi possível salvar. Confira a configuração e as políticas da tabela.");
      console.warn(error);
    } finally {
      button.disabled = false;
    }
  }

  function authHeaders() {
    return { apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}` };
  }
  function setState(text) { const el = document.querySelector("[data-message-state]"); if (el) el.textContent = text; }
  function setMasterState(text) { const el = document.querySelector("[data-master-state]"); if (el) el.textContent = text; }

  document.addEventListener("DOMContentLoaded", function () {
    readHubMessage();
    const form = document.querySelector("[data-message-form]");
    if (form) form.addEventListener("submit", saveHubMessage);
  });
})();

