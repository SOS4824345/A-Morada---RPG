(function () {
  "use strict";

  const config = window.A_MORADA_CONFIG || {};
  const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey && !config.supabaseUrl.startsWith("COLE_"));
  const fallbackMessage = "A cidade ainda se lembra de você.";
  const pollEvery = 5000;
  let characterState = null;
  let stats = [];
  let activeRequest = null;

  function authHeaders() { return { apikey: config.supabaseAnonKey }; }
  function setText(selector, text) { document.querySelectorAll(selector).forEach((element) => { element.textContent = text; }); }
  function setStatus(selector, text) { const element = document.querySelector(selector); if (element) element.textContent = text; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]); }
  function safeImageUrl(value) { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } }
  function formValues(form) { return Object.fromEntries(new FormData(form).entries()); }
  function randomDie(sides) {
    const range = 0x100000000;
    const limit = range - (range % sides);
    const values = new Uint32Array(1);
    do { crypto.getRandomValues(values); } while (values[0] >= limit);
    return (values[0] % sides) + 1;
  }

  async function api(table, query = "", options = {}) {
    if (!isConfigured) throw new Error("A conexão pública do Supabase não está configurada.");
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${table}${query}`, {
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

  async function readHubMessage() {
    const target = document.querySelector("[data-hub-message]");
    if (!target) return;
    try {
      const rows = await api("game_messages", "?message_key=eq.hub_message&select=message_text&limit=1");
      target.textContent = rows[0]?.message_text || fallbackMessage;
      setStatus("[data-message-state]", "Mensagem recebida do arquivo");
    } catch (error) {
      target.textContent = fallbackMessage;
      setStatus("[data-message-state]", "Sem contato com o arquivo · exibindo cópia local");
      console.warn(error);
    }
  }

  async function saveHubMessage(event) {
    event.preventDefault();
    const input = document.querySelector("[data-message-input]");
    if (!input?.value.trim()) return setStatus("[data-master-state]", "Escreva uma mensagem antes de salvar.");
    setStatus("[data-master-state]", "Salvando…");
    try {
      await api("game_messages", "?message_key=eq.hub_message", { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ message_text: input.value.trim(), updated_at: new Date().toISOString() }) });
      setStatus("[data-master-state]", "Mensagem salva.");
    } catch (error) { setStatus("[data-master-state]", error.message); }
  }

  function healthLabel(value) { if (value >= 5) return "Íntegra"; if (value === 4) return "Machucada"; if (value >= 2) return "Ferida"; if (value === 1) return "Crítica"; return "Colapso"; }
  function sanityLabel(value) { if (value >= 16) return "Funcional"; if (value >= 11) return "Fragmentada"; if (value >= 6) return "Quebrada"; if (value >= 1) return "Cedente"; return "Aceitação"; }
  function renderCharacterState() {
    if (!characterState) return;
    setText("[data-health]", `${characterState.current_health} / ${characterState.max_health}`);
    setText("[data-sanity]", `${characterState.current_sanity} / ${characterState.max_sanity}`);
    setText("[data-films]", `${characterState.films_remaining} / ${characterState.films_max}`);
    setText("[data-location]", characterState.current_location);
    setText("[data-health-state]", healthLabel(characterState.current_health));
    setText("[data-sanity-state]", sanityLabel(characterState.current_sanity));
    const locationInput = document.querySelector("[data-location-form] [name=location]");
    if (locationInput && document.activeElement !== locationInput) locationInput.value = characterState.current_location;
  }
  async function loadCharacterState() {
    try {
      const rows = await api("character_state", "?id=eq.1&select=*&limit=1");
      characterState = rows[0] || null;
      renderCharacterState();
    } catch (error) { setStatus("[data-character-state]", "A ficha aguarda a migração 002 no Supabase."); console.warn(error); }
  }
  async function updateCharacter(patch) {
    try {
      const rows = await api("character_state", "?id=eq.1", { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }) });
      characterState = rows[0] || characterState;
      renderCharacterState();
      setStatus("[data-character-state]", "Estado atualizado para Alice.");
    } catch (error) { setStatus("[data-character-state]", error.message); }
  }

  async function loadStats() {
    try {
      stats = await api("character_stats", "?select=*&order=id.asc");
      renderStats("attribute", "[data-attributes]");
      renderStats("skill", "[data-skills]");
      populateStatSelect();
    } catch (error) { console.warn(error); }
  }
  function renderStats(type, selector) {
    const container = document.querySelector(selector);
    const filtered = stats.filter((stat) => stat.stat_type === type);
    if (!container || !filtered.length) return;
    container.innerHTML = filtered.map((stat) => `<div><strong>${escapeHtml(stat.stat_name)}</strong><span>+${stat.stat_value}</span></div>`).join("");
  }
  function populateStatSelect() {
    const select = document.querySelector("[data-stat-select]");
    if (!select) return;
    const type = document.querySelector("[data-dice-request-form] [name=stat_type]")?.value || "attribute";
    const filtered = stats.filter((stat) => stat.stat_type === type);
    select.innerHTML = filtered.map((stat) => `<option value="${escapeHtml(stat.stat_key)}">${escapeHtml(stat.stat_name)} +${stat.stat_value}</option>`).join("");
  }

  async function loadConditions() {
    const containers = document.querySelectorAll("[data-conditions]");
    if (!containers.length) return;
    try {
      const rows = await api("character_conditions", "?is_active=eq.true&select=*&order=created_at.asc");
      containers.forEach((container) => {
        const master = document.body.dataset.page === "master";
        container.innerHTML = rows.length ? rows.map((row) => `<span class="condition-tag">${escapeHtml(row.condition_name)}${master ? `<button type="button" data-remove-condition="${row.id}" aria-label="Remover ${escapeHtml(row.condition_name)}">×</button>` : ""}</span>`).join("") : '<p class="empty-note">Nenhuma condição ativa.</p>';
      });
    } catch (error) { console.warn(error); }
  }

  function classifyRoll(die, total, difficulty) {
    if (die === 1) return "FALHA CRÍTICA";
    if (die === 20) return "EXCELENTE";
    const difference = total - difficulty;
    if (difference <= -5) return "FALHA CRÍTICA";
    if (difference < 0) return "RUIM";
    if (difference <= 4) return "BOM";
    return "EXCELENTE";
  }
  async function loadPendingRequest() {
    if (!document.querySelector("[data-request-panel]")) return;
    try {
      const rows = await api("dice_requests", "?status=eq.pending&select=*&order=created_at.desc&limit=1");
      activeRequest = rows[0] || null;
      document.querySelector("[data-no-request]").hidden = Boolean(activeRequest);
      document.querySelector("[data-active-request]").hidden = !activeRequest;
      if (activeRequest) { setText("[data-request-name]", activeRequest.test_name); setText("[data-request-difficulty]", activeRequest.difficulty); }
    } catch (error) { setStatus("[data-dice-state]", "A rolagem aguarda a migração 003."); console.warn(error); }
  }
  async function rollRequestedTest() {
    if (!activeRequest) return;
    const button = document.querySelector("[data-roll-request]");
    button.disabled = true;
    const die = randomDie(20);
    const total = die + activeRequest.bonus;
    const outcome = classifyRoll(die, total, activeRequest.difficulty);
    try {
      await api("dice_results", "", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ request_id: activeRequest.id, die_result: die, bonus: activeRequest.bonus, total, difficulty: activeRequest.difficulty, outcome }) });
      await api("dice_requests", `?id=eq.${activeRequest.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: "rolled", rolled_at: new Date().toISOString() }) });
      const result = document.querySelector("[data-roll-result]");
      result.hidden = false;
      result.innerHTML = `<dl><div><dt>Dado</dt><dd>${die}</dd></div><div><dt>Bônus</dt><dd>+${activeRequest.bonus}</dd></div><div><dt>Total</dt><dd>${total}</dd></div></dl><strong class="outcome outcome-${outcome.toLowerCase().replace(/\s|í/g, "-")}">${outcome}</strong>`;
      setStatus("[data-dice-state]", "Resultado enviado ao Mestre.");
      activeRequest = null;
    } catch (error) { setStatus("[data-dice-state]", error.message); button.disabled = false; }
  }
  async function loadLastRoll() {
    const container = document.querySelector("[data-last-roll]");
    if (!container) return;
    try {
      const rows = await api("dice_results", "?select=*,dice_requests(test_name)&order=created_at.desc&limit=1");
      const row = rows[0];
      container.innerHTML = row ? `<dl class="result-ledger"><div><dt>Teste</dt><dd>${escapeHtml(row.dice_requests?.test_name || "—")}</dd></div><div><dt>Dado</dt><dd>${row.die_result}</dd></div><div><dt>Bônus</dt><dd>+${row.bonus}</dd></div><div><dt>Total</dt><dd>${row.total}</dd></div><div><dt>Dificuldade</dt><dd>${row.difficulty}</dd></div><div><dt>Resultado</dt><dd><strong>${escapeHtml(row.outcome)}</strong></dd></div></dl>` : '<p class="empty-note">Nenhum resultado registrado.</p>';
    } catch (error) { console.warn(error); }
  }

  function photoCard(photo) {
    const url = safeImageUrl(photo.image_url);
    return `<article class="photo-card${photo.is_favorite ? " favorite" : ""}" data-photo-id="${photo.id}"><div class="photo-image">${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(photo.caption || "Fotografia sem legenda")}" loading="lazy">` : '<span>Imagem indisponível</span>'}</div><div class="photo-copy"><strong>${escapeHtml(photo.caption || "Sem legenda")}</strong><span>${escapeHtml(photo.location || "Local não registrado")}${photo.photo_date ? ` · ${escapeHtml(photo.photo_date)}` : ""}</span></div><div class="photo-actions"><button type="button" data-photo-favorite="${photo.id}">${photo.is_favorite ? "★ Favorita" : "☆ Favoritar"}</button><button type="button" data-photo-edit="${photo.id}">Editar</button><button type="button" data-photo-delete="${photo.id}">Excluir</button></div></article>`;
  }
  async function loadDigitalPhotos() {
    const gallery = document.querySelector("[data-digital-gallery]");
    if (!gallery) return;
    try {
      const rows = await api("digital_photos", "?select=*&order=is_favorite.desc,created_at.desc");
      gallery.innerHTML = rows.length ? rows.map(photoCard).join("") : '<p class="empty-note">Nenhuma fotografia arquivada.</p>';
      gallery._photos = rows;
    } catch (error) { setStatus("[data-photo-state]", "A galeria aguarda a migração 004."); console.warn(error); }
  }

  function polaroidCard(photo, master = false) {
    const url = safeImageUrl(photo.image_url);
    const uses = photo.max_uses ? `<span>Usos: ${photo.remaining_uses} / ${photo.max_uses}</span>` : "";
    return `<article class="polaroid-card${photo.is_revealed ? " revealed" : " hidden-photo"}" data-polaroid-id="${photo.id}"><div class="polaroid-image">${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(photo.title)}" loading="lazy">` : '<span>Imagem indisponível</span>'}</div><div class="polaroid-copy"><span class="time-record">${escapeHtml(photo.time_record)}</span><h3>${escapeHtml(photo.title)}</h3><p>${escapeHtml(photo.location || "Local não registrado")}</p><div class="ability"><strong>${escapeHtml(photo.ability_name)}</strong><span>${escapeHtml(photo.ability_type)}</span><p>${escapeHtml(photo.ability_description)}</p>${uses}</div>${master && !photo.is_revealed ? `<button class="ink-button" type="button" data-reveal-polaroid="${photo.id}">Revelar para Alice</button>` : ""}</div></article>`;
  }
  async function loadPolaroids(master = false) {
    const selector = master ? "[data-master-polaroids]" : "[data-special-polaroids]";
    const containers = document.querySelectorAll(selector);
    if (!containers.length) return;
    try {
      const query = `?${master ? "" : "is_revealed=eq.true&"}select=*&order=created_at.desc`;
      const rows = await api("special_polaroids", query);
      containers.forEach((container) => { container.innerHTML = rows.length ? rows.map((row) => polaroidCard(row, master)).join("") : `<p class="empty-note">Nenhuma Polaroid ${master ? "criada" : "foi revelada"}.</p>`; });
    } catch (error) { setStatus("[data-polaroid-state]", "As Polaroids aguardam a migração 004."); console.warn(error); }
  }

  function unlockMaster() {
    document.querySelector("[data-master-gate]").hidden = true;
    document.querySelector("[data-master-app]").hidden = false;
    initMasterData();
  }
  function initMasterGate() {
    if (sessionStorage.getItem("aMoradaMasterUnlocked") === "yes") return unlockMaster();
    document.querySelector("[data-gate-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (event.currentTarget.password.value === "gato123") { sessionStorage.setItem("aMoradaMasterUnlocked", "yes"); unlockMaster(); }
      else { setStatus("[data-gate-state]", "Senha incorreta."); event.currentTarget.password.select(); }
    });
  }

  function bindMasterEvents() {
    document.querySelectorAll("[data-adjust]").forEach((button) => button.addEventListener("click", () => {
      if (!characterState) return;
      const field = button.dataset.adjust;
      const limits = { current_health: [0, 6], current_sanity: [0, 20], films_remaining: [0, 13] };
      const next = Math.min(limits[field][1], Math.max(limits[field][0], Number(characterState[field]) + Number(button.dataset.delta)));
      updateCharacter({ [field]: next });
    }));
    document.querySelector("[data-location-form]")?.addEventListener("submit", (event) => { event.preventDefault(); updateCharacter({ current_location: event.currentTarget.location.value.trim() }); });
    document.querySelector("[data-condition-form]")?.addEventListener("submit", async (event) => { event.preventDefault(); const value = event.currentTarget.condition.value.trim(); if (!value) return; try { await api("character_conditions", "", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ condition_name: value }) }); event.currentTarget.reset(); loadConditions(); } catch (error) { setStatus("[data-character-state]", error.message); } });
    document.addEventListener("click", async (event) => { const button = event.target.closest("[data-remove-condition]"); if (!button) return; try { await api("character_conditions", `?id=eq.${button.dataset.removeCondition}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }); loadConditions(); } catch (error) { setStatus("[data-character-state]", error.message); } });
    document.querySelector("[data-dice-request-form] [name=stat_type]")?.addEventListener("change", populateStatSelect);
    document.querySelector("[data-dice-request-form]")?.addEventListener("submit", async (event) => { event.preventDefault(); const values = formValues(event.currentTarget); const stat = stats.find((item) => item.stat_key === values.stat_key && item.stat_type === values.stat_type); if (!stat) return setStatus("[data-request-state]", "Escolha um valor válido."); try { await api("dice_requests", "", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ test_name: stat.stat_name, test_key: stat.stat_key, stat_type: stat.stat_type, bonus: stat.stat_value, difficulty: Number(values.difficulty) }) }); setStatus("[data-request-state]", `Teste de ${stat.stat_name} enviado para Alice.`); } catch (error) { setStatus("[data-request-state]", error.message); } });
    document.querySelector("[data-polaroid-form]")?.addEventListener("submit", async (event) => { event.preventDefault(); const values = formValues(event.currentTarget); const uses = values.max_uses ? Number(values.max_uses) : null; const payload = { ...values, max_uses: uses, remaining_uses: uses, is_revealed: event.currentTarget.is_revealed.checked }; try { await api("special_polaroids", "", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload) }); event.currentTarget.reset(); setStatus("[data-polaroid-state]", "Polaroid criada."); loadPolaroids(true); } catch (error) { setStatus("[data-polaroid-state]", error.message); } });
    document.addEventListener("click", async (event) => { const button = event.target.closest("[data-reveal-polaroid]"); if (!button) return; try { await api("special_polaroids", `?id=eq.${button.dataset.revealPolaroid}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ is_revealed: true }) }); loadPolaroids(true); } catch (error) { setStatus("[data-polaroid-state]", error.message); } });
  }

  function bindAliceEvents() {
    document.querySelector("[data-roll-request]")?.addEventListener("click", rollRequestedTest);
    document.querySelector("[data-free-dice-form]")?.addEventListener("submit", (event) => { event.preventDefault(); const sides = Number(event.currentTarget.sides.value); setText("[data-free-result]", randomDie(sides)); });
    document.querySelector("[data-photo-form]")?.addEventListener("submit", async (event) => { event.preventDefault(); const values = formValues(event.currentTarget); values.photo_date = values.photo_date || null; try { await api("digital_photos", "", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(values) }); event.currentTarget.reset(); setStatus("[data-photo-state]", "Fotografia guardada."); loadDigitalPhotos(); } catch (error) { setStatus("[data-photo-state]", error.message); } });
    document.querySelector("[data-digital-gallery]")?.addEventListener("click", async (event) => {
      const gallery = event.currentTarget;
      const favorite = event.target.closest("[data-photo-favorite]");
      const edit = event.target.closest("[data-photo-edit]");
      const remove = event.target.closest("[data-photo-delete]");
      const id = Number(favorite?.dataset.photoFavorite || edit?.dataset.photoEdit || remove?.dataset.photoDelete);
      if (!id) return;
      const photo = gallery._photos?.find((item) => item.id === id);
      try {
        if (favorite) await api("digital_photos", `?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ is_favorite: !photo.is_favorite }) });
        if (edit) { const caption = prompt("Legenda da fotografia:", photo.caption || ""); if (caption === null) return; const location = prompt("Local da fotografia:", photo.location || ""); if (location === null) return; await api("digital_photos", `?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ caption: caption.trim(), location: location.trim() }) }); }
        if (remove) { if (!confirm("Excluir esta fotografia da galeria?")) return; await api("digital_photos", `?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }); }
        loadDigitalPhotos();
      } catch (error) { setStatus("[data-photo-state]", error.message); }
    });
  }

  function initMasterData() {
    bindMasterEvents();
    readHubMessage(); loadCharacterState(); loadStats(); loadConditions(); loadLastRoll(); loadPolaroids(true);
    setInterval(() => { loadCharacterState(); loadConditions(); loadLastRoll(); loadPolaroids(true); }, pollEvery);
  }
  function initAliceData() {
    bindAliceEvents();
    loadCharacterState(); loadStats(); loadConditions(); loadPendingRequest(); loadDigitalPhotos(); loadPolaroids(false);
    setInterval(() => { loadCharacterState(); loadConditions(); loadPendingRequest(); loadPolaroids(false); }, pollEvery);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const page = document.body.dataset.page;
    if (page === "master") initMasterGate();
    else if (page === "alice-sheet" || page === "alice-polaroids") initAliceData();
    else readHubMessage();
    document.querySelector("[data-message-form]")?.addEventListener("submit", saveHubMessage);
  });
})();
