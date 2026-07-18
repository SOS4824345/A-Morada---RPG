(function () {
  "use strict";

  const config = window.A_MORADA_CONFIG || {};
  const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey && !config.supabaseUrl.startsWith("COLE_"));
  const categories = ["CARTA", "BILHETE", "RELATÓRIO", "DIÁRIO", "RECORTE", "REGISTRO", "PÁGINA", "FOTOGRAFIA", "OUTRO"];
  const statuses = ["OCULTO", "REVELADO", "INCOMPLETO", "COMPLETO"];
  const documentFields = ["title", "category", "found_location", "document_date", "visible_summary", "master_notes", "status", "is_visible", "sort_order"];
  const pageFields = ["page_number", "page_title", "page_text", "image_url", "is_visible", "sort_order"];
  let documents = [];
  let pages = [];
  let notes = [];
  let selectedDocumentId = null;
  let selectedPageId = null;
  let alicePageIndex = 0;
  let categoryFilter = "ALL";
  let titleSearch = "";

  function authHeaders() { return { apikey: config.supabaseAnonKey }; }
  function now() { return new Date().toISOString(); }
  function checked(form, name) { return Boolean(form.elements[name]?.checked); }
  function setStatus(selector, value) { const element = document.querySelector(selector); if (element) element.textContent = value; }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
  function safeImageUrl(value) { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } }
  function formatDate(value) {
    if (!value) return "";
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  }
  function options(values, selected) { return values.map((value) => `<option${value === selected ? " selected" : ""}>${value}</option>`).join(""); }
  function diffPatch(current, next, fields) {
    return fields.reduce((patch, field) => {
      if (current[field] !== next[field]) patch[field] = next[field];
      return patch;
    }, {});
  }

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

  function visibleDocuments() {
    const query = titleSearch.toLocaleLowerCase("pt-BR");
    return documents.filter((document) => {
      const categoryMatches = categoryFilter === "ALL" || document.category === categoryFilter;
      const titleMatches = !query || document.title.toLocaleLowerCase("pt-BR").includes(query);
      return categoryMatches && titleMatches;
    });
  }

  function alicePagesFor(documentId) {
    return pages.filter((page) => page.document_id === documentId)
      .sort((a, b) => a.sort_order - b.sort_order || a.page_number - b.page_number || a.id - b.id);
  }

  function renderAliceDocumentList() {
    const list = document.querySelector("[data-document-list]");
    if (!list) return;
    const filtered = visibleDocuments();
    document.querySelector("[data-document-count]").textContent = String(filtered.length).padStart(2, "0");
    if (!filtered.length) {
      list.innerHTML = `<p class="document-empty">${documents.length ? "Nenhum documento corresponde ao filtro." : "Nenhum documento revelado."}</p>`;
      selectedDocumentId = null;
      renderAliceReader();
      return;
    }
    if (!filtered.some((document) => document.id === selectedDocumentId)) {
      selectedDocumentId = filtered[0].id;
      alicePageIndex = 0;
    }
    list.innerHTML = filtered.map((document, index) => `
      <button type="button" class="document-list-entry${document.id === selectedDocumentId ? " is-selected" : ""}${document.is_favorite ? " is-favorite" : ""}" data-select-document="${document.id}" aria-pressed="${document.id === selectedDocumentId}">
        <span class="document-list-number">${String(index + 1).padStart(2, "0")}</span>
        <span><strong>${escapeHtml(document.title)}</strong><small>${escapeHtml(document.category)} · ${escapeHtml(document.status)}</small></span>
        <span aria-hidden="true">${document.is_favorite ? "★" : "◇"}</span>
      </button>`).join("");
  }

  function renderAliceReader() {
    const reader = document.querySelector("[data-document-reader]");
    if (!reader) return;
    const record = documents.find((entry) => entry.id === selectedDocumentId);
    if (!record) {
      reader.innerHTML = '<div class="document-reader-empty"><span aria-hidden="true">◇</span><h2>Nenhum documento selecionado</h2><p>Escolha um registro do arquivo para iniciar a leitura.</p></div>';
      return;
    }
    const documentPages = alicePagesFor(record.id);
    if (alicePageIndex >= documentPages.length) alicePageIndex = Math.max(0, documentPages.length - 1);
    const page = documentPages[alicePageIndex];
    const note = notes.find((entry) => entry.document_id === record.id);
    const metadata = [
      record.found_location ? `<div><dt>Local</dt><dd>${escapeHtml(record.found_location)}</dd></div>` : "",
      record.document_date ? `<div><dt>Data</dt><dd>${escapeHtml(formatDate(record.document_date))}</dd></div>` : ""
    ].join("");
    const imageUrl = page ? safeImageUrl(page.image_url) : "";
    const pageBody = page ? `
      <article class="document-paper">
        ${page.page_title ? `<h3>${escapeHtml(page.page_title)}</h3>` : ""}
        ${page.page_text ? `<p class="document-page-text">${escapeHtml(page.page_text)}</p>` : ""}
        ${imageUrl ? `<button type="button" class="document-page-image" data-open-document-image data-image-url="${escapeHtml(imageUrl)}" data-image-alt="${escapeHtml(page.page_title || record.title)}"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(page.page_title || record.title)}" loading="lazy"></button>` : ""}
      </article>`
      : '<div class="document-no-pages"><p>Nenhuma página revelada neste documento.</p></div>';
    reader.innerHTML = `
      <div class="document-reader-header">
        <div><span>${escapeHtml(record.category)}</span><h2>${escapeHtml(record.title)}</h2></div>
        <button type="button" class="document-favorite-button" data-toggle-document-favorite aria-label="${record.is_favorite ? "Remover dos favoritos" : "Marcar como favorito"}">${record.is_favorite ? "★" : "☆"}</button>
      </div>
      ${record.status === "INCOMPLETO" ? '<p class="document-incomplete-state">INCOMPLETO</p>' : ""}
      ${metadata ? `<dl class="document-metadata">${metadata}</dl>` : ""}
      ${record.visible_summary ? `<p class="document-visible-summary">${escapeHtml(record.visible_summary)}</p>` : ""}
      <div class="document-page-toolbar">
        <button type="button" data-document-page-direction="-1" ${alicePageIndex <= 0 ? "disabled" : ""}>← Página anterior</button>
        <span>${page ? `${alicePageIndex + 1} / ${documentPages.length}` : "0 / 0"}</span>
        <button type="button" data-document-page-direction="1" ${alicePageIndex >= documentPages.length - 1 ? "disabled" : ""}>Próxima página →</button>
      </div>
      ${pageBody}
      <section class="document-personal-panel">
        <label>Observação pessoal<textarea data-document-note maxlength="2000" placeholder="Escreva uma observação sobre este documento.">${escapeHtml(note?.note_text || "")}</textarea></label>
        <div><button type="button" data-save-document-note>Salvar observação</button><span data-document-note-state></span></div>
      </section>
      <div class="document-personal-order"><span>Ordem no arquivo</span><button type="button" data-move-document="-1">← Anterior</button><button type="button" data-move-document="1">Depois →</button></div>`;
  }

  async function loadAliceDocuments() {
    try {
      [documents, pages, notes] = await Promise.all([
        api("documents_alice", "?select=*&order=is_favorite.desc,alice_sort_order.asc,sort_order.asc,id.asc"),
        api("document_pages_alice", "?select=*&order=document_id.asc,sort_order.asc,page_number.asc,id.asc"),
        api("document_notes_alice", "?select=*")
      ]);
      renderAliceDocumentList();
      renderAliceReader();
      setStatus("[data-document-state]", documents.length ? "Arquivo sincronizado." : "Nenhum documento revelado.");
    } catch (error) {
      setStatus("[data-document-state]", "Não foi possível consultar o arquivo.");
      console.warn(error);
    }
  }

  async function updateAliceDocument(patch, successMessage) {
    const record = documents.find((entry) => entry.id === selectedDocumentId);
    if (!record) return;
    setStatus("[data-document-state]", "Salvando…");
    try {
      await api("documents", `?id=eq.${record.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...patch, updated_at: now() }) });
      await loadAliceDocuments();
      setStatus("[data-document-state]", successMessage);
    } catch (error) { setStatus("[data-document-state]", error.message); }
  }

  async function saveAliceNote() {
    const record = documents.find((entry) => entry.id === selectedDocumentId);
    if (!record) return;
    const noteText = window.document.querySelector("[data-document-note]")?.value.trim() || "";
    const existing = notes.find((entry) => entry.document_id === record.id);
    setStatus("[data-document-note-state]", "Salvando…");
    try {
      if (existing) {
        await api("document_notes", `?id=eq.${existing.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ note_text: noteText, updated_at: now() }) });
      } else {
        await api("document_notes", "?on_conflict=document_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ document_id: record.id, note_text: noteText }) });
      }
      await loadAliceDocuments();
      setStatus("[data-document-note-state]", "Observação salva.");
    } catch (error) { setStatus("[data-document-note-state]", error.message); }
  }

  async function moveAliceDocument(direction) {
    const ordered = [...documents].sort((a, b) => a.alice_sort_order - b.alice_sort_order || a.sort_order - b.sort_order || a.id - b.id);
    const currentIndex = ordered.findIndex((document) => document.id === selectedDocumentId);
    const targetIndex = currentIndex + Number(direction);
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
    const current = ordered[currentIndex];
    const target = ordered[targetIndex];
    const currentOrder = current.alice_sort_order === target.alice_sort_order ? (currentIndex + 1) * 10 : current.alice_sort_order;
    const targetOrder = current.alice_sort_order === target.alice_sort_order ? (targetIndex + 1) * 10 : target.alice_sort_order;
    try {
      await Promise.all([
        api("documents", `?id=eq.${current.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ alice_sort_order: targetOrder, updated_at: now() }) }),
        api("documents", `?id=eq.${target.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ alice_sort_order: currentOrder, updated_at: now() }) })
      ]);
      await loadAliceDocuments();
      setStatus("[data-document-state]", "Ordem salva.");
    } catch (error) { setStatus("[data-document-state]", error.message); }
  }

  function openDocumentImage(button) {
    const dialog = document.querySelector("[data-document-image-dialog]");
    const image = dialog?.querySelector("[data-document-dialog-image]");
    const url = safeImageUrl(button.dataset.imageUrl);
    if (!dialog || !image || !url) return;
    image.src = url;
    image.alt = button.dataset.imageAlt || "Imagem do documento";
    dialog.showModal();
  }

  function bindAliceDocuments() {
    document.querySelector("[data-document-category-filter]")?.addEventListener("change", (event) => {
      categoryFilter = event.currentTarget.value;
      renderAliceDocumentList();
      renderAliceReader();
    });
    document.querySelector("[data-document-search]")?.addEventListener("input", (event) => {
      titleSearch = event.currentTarget.value.trim();
      renderAliceDocumentList();
      renderAliceReader();
    });
    document.querySelector("[data-document-list]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-select-document]");
      if (!button) return;
      selectedDocumentId = Number(button.dataset.selectDocument);
      alicePageIndex = 0;
      renderAliceDocumentList();
      renderAliceReader();
    });
    document.querySelector("[data-document-reader]")?.addEventListener("click", async (event) => {
      const direction = event.target.closest("[data-document-page-direction]");
      const favorite = event.target.closest("[data-toggle-document-favorite]");
      const saveNote = event.target.closest("[data-save-document-note]");
      const move = event.target.closest("[data-move-document]");
      const image = event.target.closest("[data-open-document-image]");
      if (direction) {
        alicePageIndex += Number(direction.dataset.documentPageDirection);
        renderAliceReader();
      }
      if (favorite) {
        const record = documents.find((entry) => entry.id === selectedDocumentId);
        if (record) await updateAliceDocument({ is_favorite: !record.is_favorite }, record.is_favorite ? "Removido dos favoritos." : "Marcado como favorito.");
      }
      if (saveNote) await saveAliceNote();
      if (move) await moveAliceDocument(move.dataset.moveDocument);
      if (image) openDocumentImage(image);
    });
    const dialog = document.querySelector("[data-document-image-dialog]");
    dialog?.querySelector("[data-close-document-image]")?.addEventListener("click", () => dialog.close());
    dialog?.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  }

  function documentPayload(form) {
    const title = form.elements.title.value.trim();
    if (!title) throw new Error("Informe o título do documento.");
    return {
      title,
      category: form.elements.category.value,
      found_location: form.elements.found_location.value.trim(),
      document_date: form.elements.document_date.value || null,
      visible_summary: form.elements.visible_summary.value.trim(),
      master_notes: form.elements.master_notes.value.trim(),
      status: form.elements.status.value,
      is_visible: checked(form, "is_visible"),
      sort_order: Math.trunc(Number(form.elements.sort_order.value)) || 0
    };
  }

  function pagePayload(form, documentId) {
    const pageText = form.elements.page_text.value.trim();
    const imageUrl = form.elements.image_url.value.trim();
    if (!pageText && !imageUrl) throw new Error("A página precisa de texto ou imagem.");
    if (imageUrl && !safeImageUrl(imageUrl)) throw new Error("Informe uma URL de imagem HTTP ou HTTPS.");
    return {
      document_id: documentId,
      page_number: Math.trunc(Number(form.elements.page_number.value)),
      page_title: form.elements.page_title.value.trim(),
      page_text: pageText,
      image_url: imageUrl,
      is_visible: checked(form, "is_visible"),
      sort_order: Math.trunc(Number(form.elements.sort_order.value)) || 0
    };
  }

  function pagesFor(documentId) {
    return pages.filter((page) => page.document_id === documentId)
      .sort((a, b) => a.sort_order - b.sort_order || a.page_number - b.page_number || a.id - b.id);
  }

  function renderMasterDocumentList() {
    const list = document.querySelector("[data-master-document-list]");
    if (!list) return;
    if (!documents.length) {
      list.innerHTML = '<p class="empty-note">Nenhum documento registrado.</p>';
      selectedDocumentId = null;
      selectedPageId = null;
      renderMasterDocumentEditor();
      return;
    }
    if (!documents.some((document) => document.id === selectedDocumentId)) selectedDocumentId = documents[0].id;
    list.innerHTML = documents.map((document) => `
      <button type="button" class="master-document-row${document.id === selectedDocumentId ? " is-selected" : ""}" data-master-select-document="${document.id}">
        <span><strong>${escapeHtml(document.title)}</strong><small>${escapeHtml(document.category)} · ${escapeHtml(document.status)}</small></span>
        <span>${document.is_visible ? "VISÍVEL" : "OCULTO"}</span>
      </button>`).join("");
  }

  function renderMasterPageEditor(document, documentPages) {
    const page = documentPages.find((entry) => entry.id === selectedPageId);
    if (!page) return '<div class="document-page-edit-empty"><p class="empty-note">Selecione uma página para editar.</p></div>';
    return `
      <form class="document-page-form" data-master-page-edit-form>
        <h4>Editar página ${page.page_number}</h4>
        <label>Número<input name="page_number" type="number" min="1" value="${page.page_number}" required></label>
        <label>Ordem<input name="sort_order" type="number" value="${page.sort_order}" required></label>
        <label class="wide-field">Título da página<input name="page_title" maxlength="160" value="${escapeHtml(page.page_title)}"></label>
        <label class="wide-field">Texto simples<textarea name="page_text" maxlength="12000">${escapeHtml(page.page_text)}</textarea></label>
        <label class="wide-field">Imagem (URL opcional)<input name="image_url" type="url" maxlength="2048" value="${escapeHtml(page.image_url)}"></label>
        <label class="document-check wide-field"><input name="is_visible" type="checkbox"${page.is_visible ? " checked" : ""}> Página visível para Alice</label>
        <div class="document-page-actions wide-field"><button class="ink-button" type="submit">Salvar página</button><button class="danger-button" type="button" data-delete-master-page>Remover página</button></div>
        <p class="status-line wide-field" data-master-page-state></p>
      </form>`;
  }

  function renderMasterDocumentEditor() {
    const editor = document.querySelector("[data-master-document-editor]");
    if (!editor) return;
    const record = documents.find((entry) => entry.id === selectedDocumentId);
    if (!record) {
      editor.innerHTML = '<div class="section-heading"><p class="kicker">Edição</p><h2>Selecione um documento</h2></div><p class="empty-note">Os dados gerais e as páginas serão exibidos aqui.</p>';
      renderMasterPreview();
      return;
    }
    const documentPages = pagesFor(record.id);
    if (!documentPages.some((page) => page.id === selectedPageId)) selectedPageId = documentPages[0]?.id || null;
    const nextNumber = documentPages.reduce((maximum, page) => Math.max(maximum, page.page_number), 0) + 1;
    const nextOrder = documentPages.reduce((maximum, page) => Math.max(maximum, page.sort_order), 0) + 10;
    editor.innerHTML = `
      <div class="section-heading"><p class="kicker">Registro #${record.id}</p><h2>${escapeHtml(record.title)}</h2></div>
      <form class="document-admin-form document-edit-form" data-master-document-edit-form>
        <fieldset><legend>Dados gerais</legend>
          <label>Título<input name="title" required maxlength="160" value="${escapeHtml(record.title)}"></label>
          <label>Categoria<select name="category">${options(categories, record.category)}</select></label>
          <label>Local encontrado<input name="found_location" maxlength="160" value="${escapeHtml(record.found_location)}"></label>
          <label>Data do documento<input name="document_date" type="date" value="${escapeHtml(record.document_date || "")}"></label>
          <label class="wide-field">Resumo visível<textarea name="visible_summary" maxlength="1200">${escapeHtml(record.visible_summary)}</textarea></label>
          <label>Status<select name="status">${options(statuses, record.status)}</select></label>
        </fieldset>
        <fieldset><legend>Controle</legend>
          <label>Ordem geral<input name="sort_order" type="number" value="${record.sort_order}" required></label>
          <label class="wide-field">Notas privadas do Mestre<textarea name="master_notes" maxlength="3000">${escapeHtml(record.master_notes)}</textarea></label>
          <label class="document-check"><input name="is_visible" type="checkbox"${record.is_visible ? " checked" : ""}> Visível para Alice</label>
        </fieldset>
        <div class="document-editor-actions">
          <button class="ink-button" type="submit">Salvar alterações</button>
          <button class="secondary-ink-button" type="button" data-toggle-master-document-visibility>${record.is_visible ? "Ocultar sem apagar" : "Revelar documento"}</button>
          <button class="danger-button" type="button" data-delete-master-document>Remover documento</button>
        </div>
        <p class="status-line" data-master-document-editor-state></p>
      </form>

      <section class="document-pages-manager">
        <div class="section-heading"><p class="kicker">Conteúdo</p><h3>Páginas</h3></div>
        <div class="master-page-list">${documentPages.length ? documentPages.map((page) => `
          <div class="master-page-row${page.id === selectedPageId ? " is-selected" : ""}">
            <button type="button" data-master-select-page="${page.id}"><span>Página ${page.page_number}</span><strong>${escapeHtml(page.page_title || "Sem título")}</strong><small>${page.is_visible ? "VISÍVEL" : "OCULTA"}</small></button>
            <div><button type="button" data-move-master-page="-1" data-page-id="${page.id}" aria-label="Mover página para cima">↑</button><button type="button" data-move-master-page="1" data-page-id="${page.id}" aria-label="Mover página para baixo">↓</button></div>
          </div>`).join("") : '<p class="empty-note">Nenhuma página registrada.</p>'}</div>

        <form class="document-page-form document-page-create-form" data-master-page-create-form>
          <h4>Adicionar página</h4>
          <label>Número<input name="page_number" type="number" min="1" value="${nextNumber}" required></label>
          <label>Ordem<input name="sort_order" type="number" value="${nextOrder}" required></label>
          <label class="wide-field">Título da página<input name="page_title" maxlength="160"></label>
          <label class="wide-field">Texto simples<textarea name="page_text" maxlength="12000"></textarea></label>
          <label class="wide-field">Imagem (URL opcional)<input name="image_url" type="url" maxlength="2048"></label>
          <label class="document-check wide-field"><input name="is_visible" type="checkbox"> Página visível para Alice</label>
          <button class="ink-button" type="submit">Adicionar página</button>
          <p class="status-line" data-master-page-create-state></p>
        </form>
        ${renderMasterPageEditor(record, documentPages)}
      </section>`;
    renderMasterPreview();
  }

  function renderMasterPreview() {
    const preview = document.querySelector("[data-master-document-preview]");
    if (!preview) return;
    const record = documents.find((entry) => entry.id === selectedDocumentId);
    if (!record) {
      preview.innerHTML = '<p class="empty-note">Selecione um documento para conferir somente os campos públicos.</p>';
      return;
    }
    if (!record.is_visible) {
      preview.innerHTML = '<p class="empty-note">Documento oculto. Alice não recebe este registro.</p>';
      return;
    }
    const visiblePages = pagesFor(record.id).filter((page) => page.is_visible);
    const page = visiblePages[0];
    const imageUrl = page ? safeImageUrl(page.image_url) : "";
    preview.innerHTML = `
      <article class="document-master-preview-paper">
        <span>${escapeHtml(record.category)} · ${escapeHtml(record.status)}</span>
        <h3>${escapeHtml(record.title)}</h3>
        ${record.found_location ? `<p>Local: ${escapeHtml(record.found_location)}</p>` : ""}
        ${record.document_date ? `<p>Data: ${escapeHtml(formatDate(record.document_date))}</p>` : ""}
        ${record.visible_summary ? `<p>${escapeHtml(record.visible_summary)}</p>` : ""}
        <strong>${visiblePages.length} ${visiblePages.length === 1 ? "página visível" : "páginas visíveis"}</strong>
        ${page?.page_title ? `<h4>${escapeHtml(page.page_title)}</h4>` : ""}
        ${page?.page_text ? `<p class="document-page-text">${escapeHtml(page.page_text)}</p>` : ""}
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(page.page_title || record.title)}">` : ""}
      </article>`;
  }

  async function loadMasterDocuments() {
    try {
      [documents, pages] = await Promise.all([
        api("documents", "?select=*&order=sort_order.asc,id.asc"),
        api("document_pages", "?select=*&order=document_id.asc,sort_order.asc,page_number.asc,id.asc")
      ]);
      renderMasterDocumentList();
      renderMasterDocumentEditor();
    } catch (error) {
      setStatus("[data-master-document-state]", "Não foi possível consultar os documentos.");
      console.warn(error);
    }
  }

  async function createMasterDocument(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setStatus("[data-master-document-state]", "Salvando…");
    try {
      const payload = documentPayload(form);
      const created = await api("documents", "", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) });
      selectedDocumentId = created?.[0]?.id || null;
      selectedPageId = null;
      form.reset();
      form.elements.sort_order.value = 0;
      form.elements.status.value = "OCULTO";
      await loadMasterDocuments();
      setStatus("[data-master-document-state]", "Documento criado.");
    } catch (error) { setStatus("[data-master-document-state]", error.message); }
  }

  async function saveMasterDocument(form) {
    const document = documents.find((entry) => entry.id === selectedDocumentId);
    if (!document) return;
    setStatus("[data-master-document-editor-state]", "Salvando…");
    try {
      const next = documentPayload(form);
      const patch = diffPatch(document, next, documentFields);
      if (!Object.keys(patch).length) {
        setStatus("[data-master-document-editor-state]", "Nenhuma alteração.");
        return;
      }
      await api("documents", `?id=eq.${document.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...patch, updated_at: now() }) });
      await loadMasterDocuments();
      setStatus("[data-master-document-editor-state]", "Salvo.");
    } catch (error) { setStatus("[data-master-document-editor-state]", error.message); }
  }

  async function toggleMasterDocumentVisibility() {
    const document = documents.find((entry) => entry.id === selectedDocumentId);
    if (!document) return;
    try {
      await api("documents", `?id=eq.${document.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ is_visible: !document.is_visible, updated_at: now() }) });
      await loadMasterDocuments();
      setStatus("[data-master-document-editor-state]", document.is_visible ? "Documento ocultado sem apagar." : "Documento revelado.");
    } catch (error) { setStatus("[data-master-document-editor-state]", error.message); }
  }

  async function deleteMasterDocument() {
    const document = documents.find((entry) => entry.id === selectedDocumentId);
    if (!document || !confirm(`Remover o documento “${document.title}”? Suas páginas e observação também serão removidas. Esta ação não pode ser desfeita.`)) return;
    try {
      await api("documents", `?id=eq.${document.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      selectedDocumentId = null;
      selectedPageId = null;
      await loadMasterDocuments();
      setStatus("[data-master-document-state]", "Documento removido.");
    } catch (error) { setStatus("[data-master-document-editor-state]", error.message); }
  }

  async function createMasterPage(form) {
    const document = documents.find((entry) => entry.id === selectedDocumentId);
    if (!document) return;
    setStatus("[data-master-page-create-state]", "Salvando…");
    try {
      const payload = pagePayload(form, document.id);
      const created = await api("document_pages", "", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(payload) });
      selectedPageId = created?.[0]?.id || null;
      await loadMasterDocuments();
      setStatus("[data-master-page-create-state]", "Página adicionada.");
    } catch (error) { setStatus("[data-master-page-create-state]", error.message); }
  }

  async function saveMasterPage(form) {
    const document = documents.find((entry) => entry.id === selectedDocumentId);
    const page = pages.find((entry) => entry.id === selectedPageId);
    if (!document || !page) return;
    setStatus("[data-master-page-state]", "Salvando…");
    try {
      const next = pagePayload(form, document.id);
      const patch = diffPatch(page, next, pageFields);
      if (!Object.keys(patch).length) {
        setStatus("[data-master-page-state]", "Nenhuma alteração.");
        return;
      }
      await api("document_pages", `?id=eq.${page.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...patch, updated_at: now() }) });
      await loadMasterDocuments();
      setStatus("[data-master-page-state]", "Página salva.");
    } catch (error) { setStatus("[data-master-page-state]", error.message); }
  }

  async function deleteMasterPage() {
    const page = pages.find((entry) => entry.id === selectedPageId);
    if (!page) return;
    const label = page.page_title || `Página ${page.page_number}`;
    if (!confirm(`Remover a página “${label}”? Esta ação não pode ser desfeita.`)) return;
    try {
      await api("document_pages", `?id=eq.${page.id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      selectedPageId = null;
      await loadMasterDocuments();
      setStatus("[data-master-document-editor-state]", "Página removida.");
    } catch (error) { setStatus("[data-master-page-state]", error.message); }
  }

  async function moveMasterPage(pageId, direction) {
    const ordered = pagesFor(selectedDocumentId);
    const currentIndex = ordered.findIndex((page) => page.id === pageId);
    const targetIndex = currentIndex + Number(direction);
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) return;
    const current = ordered[currentIndex];
    const target = ordered[targetIndex];
    const currentOrder = current.sort_order === target.sort_order ? (currentIndex + 1) * 10 : current.sort_order;
    const targetOrder = current.sort_order === target.sort_order ? (targetIndex + 1) * 10 : target.sort_order;
    try {
      await Promise.all([
        api("document_pages", `?id=eq.${current.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ sort_order: targetOrder, updated_at: now() }) }),
        api("document_pages", `?id=eq.${target.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ sort_order: currentOrder, updated_at: now() }) })
      ]);
      await loadMasterDocuments();
      setStatus("[data-master-page-state]", "Ordem das páginas salva.");
    } catch (error) { setStatus("[data-master-page-state]", error.message); }
  }

  function bindMasterDocuments() {
    document.querySelector("[data-master-document-create-form]")?.addEventListener("submit", createMasterDocument);
    document.querySelector("[data-master-document-list]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-master-select-document]");
      if (!button) return;
      selectedDocumentId = Number(button.dataset.masterSelectDocument);
      selectedPageId = null;
      renderMasterDocumentList();
      renderMasterDocumentEditor();
    });
    const editor = document.querySelector("[data-master-document-editor]");
    editor?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (event.target.matches("[data-master-document-edit-form]")) await saveMasterDocument(event.target);
      if (event.target.matches("[data-master-page-create-form]")) await createMasterPage(event.target);
      if (event.target.matches("[data-master-page-edit-form]")) await saveMasterPage(event.target);
    });
    editor?.addEventListener("click", async (event) => {
      const selectPage = event.target.closest("[data-master-select-page]");
      const movePage = event.target.closest("[data-move-master-page]");
      if (selectPage) {
        selectedPageId = Number(selectPage.dataset.masterSelectPage);
        renderMasterDocumentEditor();
      }
      if (movePage) await moveMasterPage(Number(movePage.dataset.pageId), movePage.dataset.moveMasterPage);
      if (event.target.closest("[data-toggle-master-document-visibility]")) await toggleMasterDocumentVisibility();
      if (event.target.closest("[data-delete-master-document]")) await deleteMasterDocument();
      if (event.target.closest("[data-delete-master-page]")) await deleteMasterPage();
    });
  }

  function unlockMasterDocuments() {
    document.querySelector("[data-master-documents-gate]").hidden = true;
    document.querySelector("[data-master-documents-app]").hidden = false;
    bindMasterDocuments();
    loadMasterDocuments();
  }

  function initMasterDocuments() {
    if (sessionStorage.getItem("aMoradaMasterUnlocked") === "yes") return unlockMasterDocuments();
    document.querySelector("[data-documents-gate-form]")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (event.currentTarget.password.value === "gato123") {
        sessionStorage.setItem("aMoradaMasterUnlocked", "yes");
        unlockMasterDocuments();
      } else {
        setStatus("[data-documents-gate-state]", "Senha incorreta.");
        event.currentTarget.password.select();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.page === "alice-documents") {
      bindAliceDocuments();
      loadAliceDocuments();
    }
    if (document.body.dataset.page === "master-documents") initMasterDocuments();
  });
})();
