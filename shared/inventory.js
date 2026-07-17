(function () {
  "use strict";

  const config = window.A_MORADA_CONFIG || {};
  const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey && !config.supabaseUrl.startsWith("COLE_"));
  const categories = ["OBJETO", "CHAVE", "CONSUMÍVEL", "ARMA", "REMÉDIO", "OUTRO"];
  const states = ["NORMAL", "DANIFICADO", "VAZIO", "INCOMPLETO", "USADO"];
  const actionLabels = { USE: "USAR", DISCARD: "DESCARTAR", EXAMINE: "EXAMINAR" };
  const statusLabels = { PENDING: "PENDENTE", ACCEPTED: "ACEITA", REJECTED: "REJEITADA" };
  let items = [];
  let actions = [];
  let selectedItemId = null;
  let categoryFilter = "ALL";

  function authHeaders() { return { apikey: config.supabaseAnonKey }; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
  function safeImageUrl(value) { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } }
  function setStatus(selector, text) { const element = document.querySelector(selector); if (element) element.textContent = text; }
  function checked(form, name) { return Boolean(form.elements[name]?.checked); }
  function now() { return new Date().toISOString(); }

  async function api(resource, query = "", options = {}) {
    if (!isConfigured) throw new Error("A conexão pública do Supabase não está configurada.");
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${resource}${query}`, {
      ...options,
      headers: { ...authHeaders(), ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
    });
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json()).message || ""; } catch { /* resposta sem JSON */ }
      throw new Error(detail || `O Supabase recusou a operação (${response.status}).`);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function itemImage(item, className) {
    const url = safeImageUrl(item.image_url);
    return url
      ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(item.name)}" loading="lazy">`
      : `<span class="inventory-image-placeholder" aria-label="Sem imagem">◇</span>`;
  }

  function visibleItems() {
    return categoryFilter === "ALL" ? items : items.filter((item) => item.category === categoryFilter);
  }

  function renderAliceGrid() {
    const grid = document.querySelector("[data-inventory-grid]");
    if (!grid) return;
    const filtered = visibleItems();
    document.querySelector("[data-inventory-count]").textContent = String(filtered.length).padStart(2, "0");
    if (!filtered.length) {
      grid.innerHTML = `<p class="inventory-empty">${items.length ? "Nenhum item nesta categoria." : "Nenhum item visível no inventário."}</p>`;
      selectedItemId = null;
      renderAliceDetail();
      return;
    }
    if (!filtered.some((item) => item.id === selectedItemId)) selectedItemId = filtered[0].id;
    grid.innerHTML = filtered.map((item, index) => `
      <button class="inventory-slot${item.id === selectedItemId ? " is-selected" : ""}${item.is_favorite ? " is-favorite" : ""}" type="button" data-select-item="${item.id}" aria-pressed="${item.id === selectedItemId}">
        <span class="inventory-slot-number">${String(index + 1).padStart(2, "0")}</span>
        <span class="inventory-slot-image">${itemImage(item)}</span>
        <strong>${escapeHtml(item.name)}</strong>
        <span class="inventory-slot-meta">${escapeHtml(item.category)} · ${item.quantity}</span>
      </button>`).join("");
  }

  function renderAliceDetail() {
    const panel = document.querySelector("[data-inventory-detail]");
    if (!panel) return;
    const item = items.find((entry) => entry.id === selectedItemId);
    if (!item) {
      panel.innerHTML = '<div class="inventory-no-selection"><span class="inventory-reticle" aria-hidden="true">◇</span><h2>Nenhum item selecionado</h2><p>Escolha um espaço da grade para abrir os detalhes.</p></div>';
      return;
    }
    const examined = item.is_examined && item.examined_description
      ? `<section class="inventory-examined"><span>EXAMINADO</span><p>${escapeHtml(item.examined_description)}</p></section>`
      : "";
    const quantityControl = item.can_player_change_quantity
      ? `<div class="inventory-quantity-control"><button type="button" data-quantity-delta="-1" aria-label="Reduzir quantidade">−</button><strong>${item.quantity}</strong><button type="button" data-quantity-delta="1" aria-label="Aumentar quantidade">+</button></div>`
      : `<strong class="inventory-quantity-value">${item.quantity}</strong>`;
    panel.innerHTML = `
      <div class="inventory-panel-label"><span>ITEM SELECIONADO</span><span>#${String(item.id).padStart(3, "0")}</span></div>
      <div class="inventory-preview">${itemImage(item)}</div>
      <div class="inventory-detail-copy">
        <div class="inventory-item-title"><div><span>${escapeHtml(item.category)}</span><h2>${escapeHtml(item.name)}</h2></div><button class="inventory-favorite-button" type="button" data-toggle-favorite aria-label="${item.is_favorite ? "Remover dos favoritos" : "Marcar como favorito"}">${item.is_favorite ? "★" : "☆"}</button></div>
        <dl class="inventory-facts"><div><dt>Estado</dt><dd>${escapeHtml(item.item_state)}</dd></div><div><dt>Quantidade</dt><dd>${quantityControl}</dd></div></dl>
        <p class="inventory-description">${escapeHtml(item.visible_description || "Sem descrição visível.")}</p>
        ${examined}
        <label class="inventory-player-note">Observação pessoal<textarea data-player-note maxlength="1000" placeholder="Escreva uma observação sobre este item.">${escapeHtml(item.player_note)}</textarea></label>
        <div class="inventory-note-row"><button class="inventory-secondary-button" type="button" data-save-player-note>Salvar observação</button><span data-note-state></span></div>
        <label class="inventory-action-message">Mensagem opcional ao Mestre<textarea data-action-message maxlength="1000"></textarea></label>
        <div class="inventory-actions">
          ${item.can_be_examined ? '<button type="button" data-request-action="EXAMINE">Examinar</button>' : ""}
          <button type="button" data-request-action="USE">Usar</button>
          ${item.can_be_discarded ? '<button type="button" data-request-action="DISCARD">Descartar</button>' : ""}
        </div>
        <div class="inventory-order-controls"><span>Ordem visual</span><button type="button" data-move-item="-1">← Anterior</button><button type="button" data-move-item="1">Depois →</button></div>
      </div>`;
  }

  async function loadAliceItems() {
    try {
      items = await api("inventory_items_alice", "?select=*&order=is_favorite.desc,sort_order.asc,id.asc");
      renderAliceGrid();
      renderAliceDetail();
      setStatus("[data-inventory-state]", items.length ? "Inventário sincronizado." : "Nenhum item visível.");
    } catch (error) {
      setStatus("[data-inventory-state]", "O inventário aguarda a migração 007.");
      console.warn(error);
    }
  }

  async function updateAliceItem(patch, successMessage) {
    const item = items.find((entry) => entry.id === selectedItemId);
    if (!item) return;
    setStatus("[data-inventory-state]", "Salvando…");
    try {
      await api("inventory_items", `?id=eq.${item.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...patch, updated_at: now() }) });
      await loadAliceItems();
      setStatus("[data-inventory-state]", successMessage);
    } catch (error) { setStatus("[data-inventory-state]", error.message); }
  }

  async function moveAliceItem(direction) {
    const ordered = [...items].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    const currentIndex = ordered.findIndex((item) => item.id === selectedItemId);
    const targetIndex = currentIndex + Number(direction);
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
    [ordered[currentIndex], ordered[targetIndex]] = [ordered[targetIndex], ordered[currentIndex]];
    setStatus("[data-inventory-state]", "Reorganizando…");
    try {
      await Promise.all(ordered.map((item, index) => api("inventory_items", `?id=eq.${item.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ sort_order: (index + 1) * 10, updated_at: now() }) })));
      await loadAliceItems();
      setStatus("[data-inventory-state]", "Ordem salva.");
    } catch (error) { setStatus("[data-inventory-state]", error.message); }
  }

  async function requestInventoryAction(actionType) {
    const item = items.find((entry) => entry.id === selectedItemId);
    if (!item) return;
    const message = document.querySelector("[data-action-message]")?.value.trim() || "";
    setStatus("[data-inventory-state]", "Enviando solicitação…");
    try {
      await api("inventory_actions", "", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ item_id: item.id, item_name_snapshot: item.name, action_type: actionType, message }) });
      setStatus("[data-inventory-state]", `Solicitação de ${actionLabels[actionType].toLowerCase()} enviada ao Mestre.`);
    } catch (error) {
      const duplicate = error.message.includes("duplicate key");
      setStatus("[data-inventory-state]", duplicate ? "Já existe uma solicitação igual pendente." : error.message);
    }
  }

  function bindAliceInventory() {
    document.querySelector("[data-inventory-filter]")?.addEventListener("change", (event) => {
      categoryFilter = event.currentTarget.value;
      renderAliceGrid();
      renderAliceDetail();
    });
    document.querySelector("[data-inventory-grid]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-select-item]");
      if (!button) return;
      selectedItemId = Number(button.dataset.selectItem);
      renderAliceGrid();
      renderAliceDetail();
    });
    document.querySelector("[data-inventory-detail]")?.addEventListener("click", async (event) => {
      const favorite = event.target.closest("[data-toggle-favorite]");
      const quantity = event.target.closest("[data-quantity-delta]");
      const note = event.target.closest("[data-save-player-note]");
      const action = event.target.closest("[data-request-action]");
      const move = event.target.closest("[data-move-item]");
      const item = items.find((entry) => entry.id === selectedItemId);
      if (!item) return;
      if (favorite) await updateAliceItem({ is_favorite: !item.is_favorite }, item.is_favorite ? "Removido dos favoritos." : "Marcado como favorito.");
      if (quantity && item.can_player_change_quantity) {
        const max = item.allows_multiple ? 9999 : 1;
        const next = Math.max(0, Math.min(max, item.quantity + Number(quantity.dataset.quantityDelta)));
        if (next !== item.quantity) await updateAliceItem({ quantity: next }, "Quantidade salva.");
      }
      if (note) await updateAliceItem({ player_note: document.querySelector("[data-player-note]").value.trim() }, "Observação salva.");
      if (action) await requestInventoryAction(action.dataset.requestAction);
      if (move) await moveAliceItem(move.dataset.moveItem);
    });
  }

  function masterItemPayload(form) {
    const quantity = Math.trunc(Number(form.elements.quantity.value));
    const allowsMultiple = checked(form, "allows_multiple");
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 9999) throw new Error("Informe uma quantidade entre 0 e 9999.");
    if (!allowsMultiple && quantity > 1) throw new Error("Marque que o item permite múltiplas unidades para usar quantidade maior que 1.");
    return {
      name: form.elements.name.value.trim(),
      image_url: form.elements.image_url.value.trim(),
      category: form.elements.category.value,
      visible_description: form.elements.visible_description.value.trim(),
      examined_description: form.elements.examined_description.value.trim(),
      secret_description: form.elements.secret_description.value.trim(),
      master_notes: form.elements.master_notes.value.trim(),
      quantity,
      allows_multiple: allowsMultiple,
      item_state: form.elements.item_state.value,
      is_examined: checked(form, "is_examined"),
      is_visible: checked(form, "is_visible"),
      is_favorite: checked(form, "is_favorite"),
      can_be_examined: checked(form, "can_be_examined"),
      can_be_discarded: checked(form, "can_be_discarded"),
      can_player_change_quantity: checked(form, "can_player_change_quantity"),
      sort_order: Math.trunc(Number(form.elements.sort_order.value)) || 0,
      updated_at: now()
    };
  }

  function options(values, selected) { return values.map((value) => `<option${value === selected ? " selected" : ""}>${value}</option>`).join(""); }
  function checkbox(name, label, value) { return `<label><input type="checkbox" name="${name}"${value ? " checked" : ""}> ${label}</label>`; }

  function renderMasterItems() {
    const list = document.querySelector("[data-master-item-list]");
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<p class="empty-note">Nenhum item registrado.</p>';
      selectedItemId = null;
      renderMasterEditor();
      return;
    }
    if (!items.some((item) => item.id === selectedItemId)) selectedItemId = items[0].id;
    list.innerHTML = items.map((item) => `<button type="button" class="master-item-row${item.id === selectedItemId ? " is-selected" : ""}" data-master-select-item="${item.id}"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category)} · ${escapeHtml(item.item_state)}</small></span><span>${item.is_visible ? "VISÍVEL" : "OCULTO"} · ${item.quantity}</span></button>`).join("");
  }

  function renderMasterEditor() {
    const editor = document.querySelector("[data-master-item-editor]");
    if (!editor) return;
    const item = items.find((entry) => entry.id === selectedItemId);
    if (!item) {
      editor.innerHTML = '<div class="section-heading"><p class="kicker">Edição</p><h2>Selecione um item</h2></div><p class="empty-note">Os campos completos serão exibidos aqui.</p>';
      return;
    }
    editor.innerHTML = `
      <div class="section-heading"><p class="kicker">Registro #${item.id}</p><h2>${escapeHtml(item.name)}</h2></div>
      <form class="inventory-admin-form" data-master-item-edit-form>
        <label>Nome<input name="name" required maxlength="120" value="${escapeHtml(item.name)}"></label>
        <label>Imagem (URL opcional)<input name="image_url" type="url" value="${escapeHtml(item.image_url)}"></label>
        <label>Categoria<select name="category">${options(categories, item.category)}</select></label>
        <label>Estado<select name="item_state">${options(states, item.item_state)}</select></label>
        <label>Quantidade<input name="quantity" type="number" min="0" max="9999" value="${item.quantity}" required></label>
        <label>Ordem<input name="sort_order" type="number" value="${item.sort_order}" required></label>
        <label class="wide-field">Descrição visível<textarea name="visible_description" maxlength="2000">${escapeHtml(item.visible_description)}</textarea></label>
        <label class="wide-field">Descrição examinada<textarea name="examined_description" maxlength="2000">${escapeHtml(item.examined_description)}</textarea></label>
        <label class="wide-field">Descrição secreta<textarea name="secret_description" maxlength="2000">${escapeHtml(item.secret_description)}</textarea></label>
        <label class="wide-field">Notas do Mestre<textarea name="master_notes" maxlength="2000">${escapeHtml(item.master_notes)}</textarea></label>
        <div class="inventory-checks wide-field">
          ${checkbox("is_visible", "Visível para Alice", item.is_visible)}
          ${checkbox("allows_multiple", "Permite quantidade maior que 1", item.allows_multiple)}
          ${checkbox("is_examined", "Examinado", item.is_examined)}
          ${checkbox("is_favorite", "Favorito", item.is_favorite)}
          ${checkbox("can_be_examined", "Pode ser examinado", item.can_be_examined)}
          ${checkbox("can_be_discarded", "Pode ser descartado", item.can_be_discarded)}
          ${checkbox("can_player_change_quantity", "Alice altera quantidade", item.can_player_change_quantity)}
        </div>
        <div class="inventory-editor-actions wide-field"><button class="ink-button" type="submit">Salvar alterações</button><button class="danger-button" type="button" data-delete-master-item>Remover item</button></div>
        <p class="status-line wide-field" data-master-editor-state></p>
      </form>`;
  }

  function renderMasterActions() {
    const list = document.querySelector("[data-master-action-list]");
    if (!list) return;
    list.innerHTML = actions.length ? actions.map((action) => `
      <article class="master-action-row${action.status === "PENDING" ? " is-pending" : ""}">
        <div><span>${actionLabels[action.action_type]} · ${statusLabels[action.status]}</span><h3>${escapeHtml(action.item_name_snapshot)}</h3><p>${escapeHtml(action.message || "Sem mensagem adicional.")}</p><small>${new Date(action.created_at).toLocaleString("pt-BR")}</small></div>
        ${action.status === "PENDING" ? `<div><button class="ink-button" type="button" data-resolve-action="ACCEPTED" data-action-id="${action.id}">Aceitar</button><button class="secondary-ink-button" type="button" data-resolve-action="REJECTED" data-action-id="${action.id}">Rejeitar</button></div>` : ""}
      </article>`).join("") : '<p class="empty-note">Nenhuma solicitação registrada.</p>';
  }

  async function loadMasterItems() {
    try {
      items = await api("inventory_items", "?select=*&order=sort_order.asc,id.asc");
      renderMasterItems();
      renderMasterEditor();
    } catch (error) { setStatus("[data-master-inventory-state]", "O inventário aguarda a migração 007."); console.warn(error); }
  }

  async function loadMasterActions() {
    try {
      actions = await api("inventory_actions", "?select=*&order=created_at.desc");
      renderMasterActions();
    } catch (error) { console.warn(error); }
  }

  async function createMasterItem(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setStatus("[data-master-inventory-state]", "Criando registro…");
    try {
      const payload = masterItemPayload(form);
      await api("inventory_items", "", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload) });
      form.reset();
      form.elements.can_be_examined.checked = true;
      form.elements.quantity.value = 1;
      form.elements.sort_order.value = 0;
      await loadMasterItems();
      setStatus("[data-master-inventory-state]", "Item criado.");
    } catch (error) { setStatus("[data-master-inventory-state]", error.message); }
  }

  async function saveMasterItem(event) {
    event.preventDefault();
    const item = items.find((entry) => entry.id === selectedItemId);
    if (!item) return;
    setStatus("[data-master-editor-state]", "Salvando…");
    try {
      const payload = masterItemPayload(event.target);
      await api("inventory_items", `?id=eq.${item.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload) });
      await loadMasterItems();
      setStatus("[data-master-editor-state]", "Alterações salvas.");
    } catch (error) { setStatus("[data-master-editor-state]", error.message); }
  }

  async function deleteMasterItem() {
    const item = items.find((entry) => entry.id === selectedItemId);
    if (!item || !confirm(`Remover o item “${item.name}”? Esta ação não pode ser desfeita.`)) return;
    setStatus("[data-master-editor-state]", "Removendo…");
    try {
      await api("inventory_items", `?id=eq.${item.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      selectedItemId = null;
      await Promise.all([loadMasterItems(), loadMasterActions()]);
      setStatus("[data-master-inventory-state]", "Item removido.");
    } catch (error) { setStatus("[data-master-editor-state]", error.message); }
  }

  async function resolveInventoryAction(id, status) {
    const action = actions.find((entry) => entry.id === id);
    if (!action || action.status !== "PENDING") return;
    try {
      if (status === "ACCEPTED" && action.action_type === "EXAMINE" && action.item_id) {
        await api("inventory_items", `?id=eq.${action.item_id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ is_examined: true, updated_at: now() }) });
      }
      await api("inventory_actions", `?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status, resolved_at: now() }) });
      await Promise.all([loadMasterItems(), loadMasterActions()]);
    } catch (error) { setStatus("[data-master-inventory-state]", error.message); }
  }

  function bindMasterInventory() {
    document.querySelector("[data-master-item-create-form]")?.addEventListener("submit", createMasterItem);
    document.querySelector("[data-master-item-list]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-master-select-item]");
      if (!button) return;
      selectedItemId = Number(button.dataset.masterSelectItem);
      renderMasterItems();
      renderMasterEditor();
    });
    document.querySelector("[data-master-item-editor]")?.addEventListener("submit", saveMasterItem);
    document.querySelector("[data-master-item-editor]")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-delete-master-item]")) deleteMasterItem();
    });
    document.querySelector("[data-master-action-list]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-resolve-action]");
      if (button) resolveInventoryAction(Number(button.dataset.actionId), button.dataset.resolveAction);
    });
  }

  function unlockMasterInventory() {
    document.querySelector("[data-master-inventory-gate]").hidden = true;
    document.querySelector("[data-master-inventory-app]").hidden = false;
    bindMasterInventory();
    loadMasterItems();
    loadMasterActions();
    setInterval(loadMasterActions, 5000);
  }

  function initMasterInventory() {
    if (sessionStorage.getItem("aMoradaMasterUnlocked") === "yes") return unlockMasterInventory();
    document.querySelector("[data-inventory-gate-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (event.currentTarget.password.value === "gato123") {
        sessionStorage.setItem("aMoradaMasterUnlocked", "yes");
        unlockMasterInventory();
      } else {
        setStatus("[data-inventory-gate-state]", "Senha incorreta.");
        event.currentTarget.password.select();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.page === "alice-inventory") {
      bindAliceInventory();
      loadAliceItems();
    }
    if (document.body.dataset.page === "master-inventory") initMasterInventory();
  });
})();
