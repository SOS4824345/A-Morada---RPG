(function () {
  "use strict";

  const config = window.A_MORADA_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey && !config.supabaseUrl.startsWith("COLE_"));
  const categories = ["GERAL", "PESSOAS", "LUGARES", "SUSPEITAS", "MEMÓRIAS", "PENDÊNCIAS"];
  const markers = ["ROSA", "OLIVA", "PÉROLA", "VINHO", "CINZA", "CREME"];
  const draftPrefix = "aMoradaPlayerNoteDraft:";
  let notes = [];
  let selectedNoteId = null;
  let searchText = "";
  let categoryFilter = "ALL";
  let viewFilter = "ACTIVE";
  let dirtyFields = new Set();
  let saveTimer = null;
  let saving = false;

  function authHeaders() { return { apikey: config.supabaseAnonKey }; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
  function setText(selector, value) { const element = document.querySelector(selector); if (element) element.textContent = value; }
  function displayTitle(note) { return note?.title.trim() || "Sem título"; }
  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  }
  function categoryOptions(selected) { return categories.map((value) => `<option${value === selected ? " selected" : ""}>${value}</option>`).join(""); }
  function markerOptions(selected) { return markers.map((value) => `<option${value === selected ? " selected" : ""}>${value}</option>`).join(""); }

  async function api(query = "", options = {}) {
    if (!configured) throw new Error("A conexão pública do Supabase não está configurada.");
    const response = await fetch(`${config.supabaseUrl}/rest/v1/player_notes${query}`, {
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

  function readDraft(id) {
    try { return JSON.parse(localStorage.getItem(`${draftPrefix}${id}`) || "null"); } catch { return null; }
  }
  function writeDraft(note) {
    try { localStorage.setItem(`${draftPrefix}${note.id}`, JSON.stringify({ title: note.title, note_text: note.note_text })); } catch { /* proteção indisponível */ }
  }
  function clearDraft(id) {
    try { localStorage.removeItem(`${draftPrefix}${id}`); } catch { /* proteção indisponível */ }
  }

  function sortedNotes(entries) {
    return [...entries].sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned)
      || a.sort_order - b.sort_order
      || new Date(b.updated_at) - new Date(a.updated_at)
      || a.id - b.id);
  }

  function matchesSearch(note) {
    const query = searchText.toLocaleLowerCase("pt-BR");
    return !query || note.title.toLocaleLowerCase("pt-BR").includes(query) || note.note_text.toLocaleLowerCase("pt-BR").includes(query);
  }

  function filteredAliceNotes() {
    return sortedNotes(notes.filter((note) => {
      const categoryMatches = categoryFilter === "ALL" || note.category === categoryFilter;
      const viewMatches = viewFilter === "ARCHIVED" ? note.is_archived
        : viewFilter === "FAVORITES" ? !note.is_archived && note.is_favorite
          : viewFilter === "PINNED" ? !note.is_archived && note.is_pinned
            : !note.is_archived;
      return categoryMatches && viewMatches && matchesSearch(note);
    }));
  }

  function renderAliceList() {
    const list = document.querySelector("[data-notes-list]");
    if (!list) return;
    const filtered = filteredAliceNotes();
    setText("[data-notes-count]", String(filtered.length).padStart(2, "0"));
    if (!filtered.length) {
      list.innerHTML = `<p class="notes-empty">${notes.length ? "Nenhuma anotação corresponde aos filtros." : "O caderno ainda está vazio."}</p>`;
      selectedNoteId = null;
      return;
    }
    if (!filtered.some((note) => note.id === selectedNoteId)) selectedNoteId = filtered[0].id;
    list.innerHTML = filtered.map((note) => `
      <button type="button" class="notes-list-entry marker-${note.marker_style.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "")}${note.id === selectedNoteId ? " is-selected" : ""}" data-select-note="${note.id}" aria-pressed="${note.id === selectedNoteId}">
        <span class="notes-list-flags">${note.is_pinned ? "●" : "○"}${note.is_favorite ? " ★" : ""}</span>
        <strong>${escapeHtml(displayTitle(note))}</strong>
        <small>${escapeHtml(note.category)} · ${escapeHtml(formatDate(note.updated_at))}</small>
      </button>`).join("");
  }

  function renderAliceEditor(openOnMobile = false) {
    const editor = document.querySelector("[data-notes-editor]");
    if (!editor) return;
    const wasOpenOnMobile = editor.classList.contains("is-open-mobile");
    const note = notes.find((entry) => entry.id === selectedNoteId);
    if (!note) {
      editor.innerHTML = '<div class="notes-editor-empty"><span aria-hidden="true">✦</span><h2>Nenhuma anotação selecionada</h2><p>Crie uma página nova ou escolha uma anotação do caderno.</p></div>';
      return;
    }
    const draft = readDraft(note.id);
    if (draft) {
      note.title = typeof draft.title === "string" ? draft.title : note.title;
      note.note_text = typeof draft.note_text === "string" ? draft.note_text : note.note_text;
      if (draft.title !== undefined) dirtyFields.add("title");
      if (draft.note_text !== undefined) dirtyFields.add("note_text");
    }
    const markerClass = note.marker_style.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    editor.innerHTML = `
      <article class="notes-editor marker-${markerClass}">
        <div class="notes-window-bar"><span>CADERNO_${String(note.id).padStart(3, "0")}.TXT</span><span aria-hidden="true">♡　□　×</span></div>
        <button class="notes-mobile-back" type="button" data-notes-mobile-back>← Voltar à lista</button>
        <div class="notes-editor-topline">
          <label>Categoria<select data-note-category>${categoryOptions(note.category)}</select></label>
          <label>Marcador<select data-note-marker>${markerOptions(note.marker_style)}</select></label>
        </div>
        <label class="notes-title-label"><span class="sr-only">Título</span><input data-note-title maxlength="160" value="${escapeHtml(note.title)}" placeholder="Sem título"></label>
        <label class="notes-text-label"><span class="sr-only">Texto da anotação</span><textarea data-note-text maxlength="100000" placeholder="Escreva aqui…">${escapeHtml(note.note_text)}</textarea></label>
        <div class="notes-editor-actions">
          <button type="button" data-toggle-note-favorite aria-pressed="${note.is_favorite}">${note.is_favorite ? "★ Favorita" : "☆ Favoritar"}</button>
          <button type="button" data-toggle-note-pinned aria-pressed="${note.is_pinned}">${note.is_pinned ? "● Fixada" : "○ Fixar"}</button>
          <button type="button" data-toggle-note-archived>${note.is_archived ? "Restaurar" : "Arquivar"}</button>
        </div>
        <footer class="notes-editor-footer">
          <div><span>Criada em ${escapeHtml(formatDate(note.created_at))}</span><span data-note-updated>Última edição ${escapeHtml(formatDate(note.updated_at))}</span></div>
          <div class="notes-save-area"><span data-note-save-state>${draft ? "Rascunho local não salvo restaurado." : "Salvo"}</span><button type="button" data-retry-note-save${draft ? "" : " hidden"}>Tentar novamente</button></div>
        </footer>
        <div class="notes-organization">
          <span>Posição no caderno</span><button type="button" data-move-note="-1">← Anterior</button><button type="button" data-move-note="1">Depois →</button>
          ${note.is_archived ? '<button class="notes-delete-button" type="button" data-delete-note>Excluir definitivamente</button>' : ""}
        </div>
      </article>`;
    if (openOnMobile || wasOpenOnMobile) editor.classList.add("is-open-mobile");
  }

  async function loadAliceNotes() {
    try {
      notes = await api("?select=*&order=is_archived.asc,is_pinned.desc,sort_order.asc,updated_at.desc,id.asc");
      renderAliceList();
      renderAliceEditor();
      setText("[data-notes-state]", notes.length ? "Caderno sincronizado." : "O caderno ainda está vazio.");
    } catch (error) {
      setText("[data-notes-state]", "Não foi possível consultar o caderno.");
      console.warn(error);
    }
  }

  async function createNote() {
    setText("[data-notes-state]", "Criando página…");
    const nextOrder = notes.reduce((maximum, note) => Math.max(maximum, note.sort_order), 0) + 10;
    try {
      const created = await api("", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ title: "", note_text: "", category: "GERAL", marker_style: "PÉROLA", sort_order: nextOrder }) });
      if (!created?.length) throw new Error("A anotação não foi criada.");
      notes.push(created[0]);
      selectedNoteId = created[0].id;
      viewFilter = "ACTIVE";
      document.querySelector("[data-notes-view-filter]").value = viewFilter;
      dirtyFields.clear();
      renderAliceList();
      renderAliceEditor(true);
      setText("[data-notes-state]", "Nova anotação criada.");
    } catch (error) { setText("[data-notes-state]", error.message); }
  }

  function markDirty(field, value) {
    const note = notes.find((entry) => entry.id === selectedNoteId);
    if (!note) return;
    note[field] = value;
    dirtyFields.add(field);
    writeDraft(note);
    setText("[data-note-save-state]", "Alterações pendentes…");
    const retry = document.querySelector("[data-retry-note-save]");
    if (retry) retry.hidden = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDirtyNote, 750);
    if (field === "title") renderAliceList();
  }

  async function saveDirtyNote() {
    if (saving || !dirtyFields.size) return;
    const note = notes.find((entry) => entry.id === selectedNoteId);
    if (!note) return;
    const noteId = note.id;
    const fields = [...dirtyFields];
    const patch = Object.fromEntries(fields.map((field) => [field, note[field]]));
    fields.forEach((field) => dirtyFields.delete(field));
    saving = true;
    setText("[data-note-save-state]", "Salvando…");
    try {
      const updated = await api(`?id=eq.${noteId}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
      if (!updated?.length) throw new Error("A anotação não foi encontrada.");
      const current = notes.find((entry) => entry.id === noteId);
      if (current) {
        const protectedValues = Object.fromEntries([...dirtyFields].map((field) => [field, current[field]]));
        Object.assign(current, updated[0], protectedValues);
      }
      if (!dirtyFields.size) clearDraft(noteId);
      setText("[data-note-save-state]", dirtyFields.size ? "Alterações pendentes…" : "Salvo");
      const updatedLabel = document.querySelector("[data-note-updated]");
      if (updatedLabel && current) updatedLabel.textContent = `Última edição ${formatDate(current.updated_at)}`;
      renderAliceList();
    } catch (error) {
      fields.forEach((field) => dirtyFields.add(field));
      setText("[data-note-save-state]", "Não foi possível salvar. Seu texto foi mantido.");
      const retry = document.querySelector("[data-retry-note-save]");
      if (retry) retry.hidden = false;
      const current = notes.find((entry) => entry.id === noteId);
      if (current) writeDraft(current);
    } finally {
      saving = false;
      if (dirtyFields.size && document.querySelector("[data-note-save-state]")?.textContent === "Alterações pendentes…") {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveDirtyNote, 750);
      }
    }
  }

  async function updateNoteField(field, value, successMessage) {
    const note = notes.find((entry) => entry.id === selectedNoteId);
    if (!note) return;
    const protectedValues = Object.fromEntries([...dirtyFields].map((dirtyField) => [dirtyField, note[dirtyField]]));
    setText("[data-note-save-state]", "Salvando…");
    try {
      const updated = await api(`?id=eq.${note.id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ [field]: value }) });
      if (!updated?.length) throw new Error("A anotação não foi encontrada.");
      Object.assign(note, updated[0], protectedValues);
      renderAliceList();
      renderAliceEditor();
      setText("[data-note-save-state]", successMessage || "Salvo");
    } catch (error) { setText("[data-note-save-state]", error.message); }
  }

  async function toggleArchive() {
    const note = notes.find((entry) => entry.id === selectedNoteId);
    if (!note) return;
    const archived = !note.is_archived;
    await updateNoteField("is_archived", archived, archived ? "Anotação arquivada." : "Anotação restaurada.");
    viewFilter = archived ? "ARCHIVED" : "ACTIVE";
    document.querySelector("[data-notes-view-filter]").value = viewFilter;
    renderAliceList();
    renderAliceEditor();
  }

  async function moveNote(direction) {
    const ordered = filteredAliceNotes();
    const currentIndex = ordered.findIndex((note) => note.id === selectedNoteId);
    const targetIndex = currentIndex + Number(direction);
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
    const current = ordered[currentIndex];
    const target = ordered[targetIndex];
    const currentOrder = current.sort_order === target.sort_order ? (currentIndex + 1) * 10 : current.sort_order;
    const targetOrder = current.sort_order === target.sort_order ? (targetIndex + 1) * 10 : target.sort_order;
    setText("[data-note-save-state]", "Salvando ordem…");
    try {
      const [currentResult, targetResult] = await Promise.all([
        api(`?id=eq.${current.id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ sort_order: targetOrder }) }),
        api(`?id=eq.${target.id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ sort_order: currentOrder }) })
      ]);
      if (!currentResult?.length || !targetResult?.length) throw new Error("Não foi possível salvar a ordem.");
      Object.assign(current, currentResult[0]);
      Object.assign(target, targetResult[0]);
      renderAliceList();
      renderAliceEditor();
      setText("[data-note-save-state]", "Ordem salva.");
    } catch (error) { setText("[data-note-save-state]", error.message); }
  }

  async function deleteNote() {
    const note = notes.find((entry) => entry.id === selectedNoteId);
    if (!note?.is_archived) return;
    if (!confirm(`Excluir definitivamente “${displayTitle(note)}”? Esta ação não pode ser desfeita.`)) return;
    try {
      const removed = await api(`?id=eq.${note.id}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
      if (!removed?.length) throw new Error("A anotação não foi encontrada.");
      clearDraft(note.id);
      notes = notes.filter((entry) => entry.id !== note.id);
      selectedNoteId = null;
      dirtyFields.clear();
      renderAliceList();
      renderAliceEditor();
      setText("[data-notes-state]", "Anotação excluída definitivamente.");
    } catch (error) { setText("[data-note-save-state]", error.message); }
  }

  function bindAliceNotes() {
    document.querySelector("[data-create-note]")?.addEventListener("click", createNote);
    document.querySelector("[data-notes-search]")?.addEventListener("input", (event) => { searchText = event.currentTarget.value.trim(); renderAliceList(); renderAliceEditor(); });
    document.querySelector("[data-notes-category-filter]")?.addEventListener("change", (event) => { categoryFilter = event.currentTarget.value; renderAliceList(); renderAliceEditor(); });
    document.querySelector("[data-notes-view-filter]")?.addEventListener("change", (event) => { viewFilter = event.currentTarget.value; renderAliceList(); renderAliceEditor(); });
    document.querySelector("[data-notes-list]")?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-select-note]");
      if (!button) return;
      await saveDirtyNote();
      selectedNoteId = Number(button.dataset.selectNote);
      dirtyFields.clear();
      renderAliceList();
      renderAliceEditor(true);
    });
    const editor = document.querySelector("[data-notes-editor]");
    editor?.addEventListener("input", (event) => {
      if (event.target.matches("[data-note-title]")) markDirty("title", event.target.value);
      if (event.target.matches("[data-note-text]")) markDirty("note_text", event.target.value);
    });
    editor?.addEventListener("change", async (event) => {
      if (event.target.matches("[data-note-category]")) await updateNoteField("category", event.target.value);
      if (event.target.matches("[data-note-marker]")) await updateNoteField("marker_style", event.target.value);
    });
    editor?.addEventListener("click", async (event) => {
      const note = notes.find((entry) => entry.id === selectedNoteId);
      if (event.target.closest("[data-toggle-note-favorite]") && note) await updateNoteField("is_favorite", !note.is_favorite);
      if (event.target.closest("[data-toggle-note-pinned]") && note) await updateNoteField("is_pinned", !note.is_pinned);
      if (event.target.closest("[data-toggle-note-archived]")) await toggleArchive();
      const move = event.target.closest("[data-move-note]");
      if (move) await moveNote(move.dataset.moveNote);
      if (event.target.closest("[data-delete-note]")) await deleteNote();
      if (event.target.closest("[data-retry-note-save]")) await saveDirtyNote();
      if (event.target.closest("[data-notes-mobile-back]")) editor.classList.remove("is-open-mobile");
    });
    window.addEventListener("beforeunload", () => {
      const note = notes.find((entry) => entry.id === selectedNoteId);
      if (note && dirtyFields.size) writeDraft(note);
    });
  }

  function filteredMasterNotes() {
    return sortedNotes(notes.filter((note) => {
      const categoryMatches = categoryFilter === "ALL" || note.category === categoryFilter;
      const viewMatches = viewFilter === "ACTIVE" ? !note.is_archived
        : viewFilter === "ARCHIVED" ? note.is_archived
          : viewFilter === "FAVORITES" ? note.is_favorite
            : viewFilter === "PINNED" ? note.is_pinned
              : true;
      return categoryMatches && viewMatches && matchesSearch(note);
    }));
  }

  function renderMasterList() {
    const list = document.querySelector("[data-master-notes-list]");
    if (!list) return;
    const filtered = filteredMasterNotes();
    if (!filtered.length) {
      list.innerHTML = '<p class="empty-note">Nenhuma anotação corresponde aos filtros.</p>';
      selectedNoteId = null;
      renderMasterReader();
      return;
    }
    if (!filtered.some((note) => note.id === selectedNoteId)) selectedNoteId = filtered[0].id;
    list.innerHTML = filtered.map((note) => `
      <button type="button" class="master-note-row${note.id === selectedNoteId ? " is-selected" : ""}" data-master-select-note="${note.id}">
        <span><strong>${escapeHtml(displayTitle(note))}</strong><small>${escapeHtml(note.category)} · ${escapeHtml(note.marker_style)}</small></span>
        <span>${note.is_archived ? "ARQUIVADA" : note.is_pinned ? "FIXADA" : note.is_favorite ? "FAVORITA" : "ATIVA"}</span>
      </button>`).join("");
  }

  function renderMasterReader() {
    const reader = document.querySelector("[data-master-note-reader]");
    if (!reader) return;
    const note = notes.find((entry) => entry.id === selectedNoteId);
    if (!note) {
      reader.innerHTML = '<div class="section-heading"><p class="kicker">Leitura</p><h2>Selecione uma anotação</h2></div><p class="empty-note">O conteúdo escolhido será exibido aqui sem controles de edição.</p>';
      return;
    }
    reader.innerHTML = `
      <div class="section-heading"><p class="kicker">${escapeHtml(note.category)} · ${escapeHtml(note.marker_style)}</p><h2>${escapeHtml(displayTitle(note))}</h2></div>
      <div class="master-note-flags"><span>${note.is_favorite ? "★ FAVORITA" : "☆ NÃO FAVORITA"}</span><span>${note.is_pinned ? "● FIXADA" : "○ NÃO FIXADA"}</span><span>${note.is_archived ? "ARQUIVADA" : "ATIVA"}</span></div>
      <p class="master-note-text">${escapeHtml(note.note_text)}</p>
      <dl class="master-note-dates"><div><dt>Criação</dt><dd>${escapeHtml(formatDate(note.created_at))}</dd></div><div><dt>Última alteração</dt><dd>${escapeHtml(formatDate(note.updated_at))}</dd></div></dl>`;
  }

  async function loadMasterNotes() {
    try {
      notes = await api("?select=*&order=is_archived.asc,is_pinned.desc,sort_order.asc,updated_at.desc,id.asc");
      renderMasterList();
      renderMasterReader();
      setText("[data-master-notes-state]", `${notes.length} ${notes.length === 1 ? "anotação consultada" : "anotações consultadas"}.`);
    } catch (error) {
      setText("[data-master-notes-state]", "Não foi possível consultar as anotações.");
      console.warn(error);
    }
  }

  function bindMasterNotes() {
    document.querySelector("[data-master-notes-search]")?.addEventListener("input", (event) => { searchText = event.currentTarget.value.trim(); renderMasterList(); renderMasterReader(); });
    document.querySelector("[data-master-notes-category]")?.addEventListener("change", (event) => { categoryFilter = event.currentTarget.value; renderMasterList(); renderMasterReader(); });
    document.querySelector("[data-master-notes-view]")?.addEventListener("change", (event) => { viewFilter = event.currentTarget.value; renderMasterList(); renderMasterReader(); });
    document.querySelector("[data-master-notes-list]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-master-select-note]");
      if (!button) return;
      selectedNoteId = Number(button.dataset.masterSelectNote);
      renderMasterList();
      renderMasterReader();
    });
  }

  function unlockMasterNotes() {
    document.querySelector("[data-master-notes-gate]").hidden = true;
    document.querySelector("[data-master-notes-app]").hidden = false;
    viewFilter = "ALL";
    bindMasterNotes();
    loadMasterNotes();
  }

  function initMasterNotes() {
    if (sessionStorage.getItem("aMoradaMasterUnlocked") === "yes") return unlockMasterNotes();
    document.querySelector("[data-notes-gate-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (event.currentTarget.password.value === "gato123") {
        sessionStorage.setItem("aMoradaMasterUnlocked", "yes");
        unlockMasterNotes();
      } else {
        setText("[data-notes-gate-state]", "Senha incorreta.");
        event.currentTarget.password.select();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.page === "alice-notes") {
      bindAliceNotes();
      loadAliceNotes();
    }
    if (document.body.dataset.page === "master-notes") initMasterNotes();
  });
})();
