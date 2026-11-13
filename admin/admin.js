/* ═══════════════════════════════════════════════════════════════════════════
   Admin-Panel · Annette Gerke-Bischoff
   Verwaltung der Galerie-Daten über die PHP-API
   ═══════════════════════════════════════════════════════════════════════════ */

const API = {
  auth:     '/api/auth.php',
  gallery:  '/api/gallery.php',
  upload:   '/api/upload.php',
  describe: '/api/describe.php',
  backup:   '/api/backup.php',
};

// ── Globaler State ──────────────────────────────────────────────────────────
let galleryData   = { styles: [], works: [] };
let currentStyleId = null;       // welcher Stil ist gerade geöffnet?
let editingWorkId  = null;       // null = neues Werk, sonst work.id
let editingStyleId = null;       // null = neuer Stil, sonst style.id
let workImages           = [];   // Bild-URLs des Werks, das gerade bearbeitet wird
let pendingStyleImageUrl = null; // bereits hochgeladene Bild-URL (Stil)
let pendingStyleThumbnailPosition = null; // gewaehlter Bildausschnitt (object-position), Stil
let csrfToken            = null; // Schutz-Token fuer aendernde Anfragen, kommt vom Server nach Login

/* ─────────────────────────────────────────────────────────────────────────
   INITIALISIERUNG
   ───────────────────────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', async () => {
  initWorkImageDropzone();
  initStyleFocusPicker();

  // Prüfen ob schon eingeloggt
  const res = await fetch(API.auth + '?action=check').catch(() => null);
  if (res?.ok) {
    const data = await res.json();
    if (data.authenticated) {
      csrfToken = data.csrf;
      await startApp();
      return;
    }
  }
  showScreen('login');

  // Enter-Taste im Login-Formular
  ['l-user', 'l-pass'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') doLogin();
    });
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   AUTH
   ───────────────────────────────────────────────────────────────────────── */
async function doLogin() {
  const user = document.getElementById('l-user').value.trim();
  const pass = document.getElementById('l-pass').value.trim();
  hideError('login-error');

  if (!user || !pass) {
    showError('login-error', 'Bitte Benutzername und Passwort eingeben.');
    return;
  }

  const btn = document.getElementById('l-btn');
  btn.disabled = true;
  btn.textContent = '…';

  const res = await fetch(API.auth + '?action=login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass })
  }).catch(() => null);

  btn.disabled = false;
  btn.textContent = 'Anmelden';

  if (!res) {
    showError('login-error', 'Server nicht erreichbar.');
    return;
  }

  const data = await res.json().catch(() => ({}));
  if (data.ok) {
    csrfToken = data.csrf;
    await startApp();
  } else {
    showError('login-error', data.error || 'Anmeldung fehlgeschlagen.');
  }
}

function downloadBackup() {
  window.location.href = API.backup;
}

async function doLogout() {
  await fetch(API.auth + '?action=logout', { method: 'POST' }).catch(() => {});
  showScreen('login');
  document.getElementById('l-user').value = '';
  document.getElementById('l-pass').value = '';
}

/* ─────────────────────────────────────────────────────────────────────────
   APP START
   ───────────────────────────────────────────────────────────────────────── */
async function startApp() {
  showScreen('app');
  await loadGallery();
  renderStylesOverview();
}

async function loadGallery() {
  const res = await fetch(API.gallery).catch(() => null);
  if (res?.ok) {
    galleryData = await res.json();
  }
}

async function saveGallery() {
  const res = await fetch(API.gallery, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(galleryData)
  }).catch(() => null);

  // Die Fehlermeldung des Servers (z.B. "Inhalt zwischenzeitlich geaendert") auch bei einem Fehlerstatus anzeigen
  const data = await res?.json().catch(() => null);
  if (!data?.ok) throw new Error(data?.error || 'Speichern fehlgeschlagen');
}

/* ─────────────────────────────────────────────────────────────────────────
   STILE-ÜBERSICHT
   ───────────────────────────────────────────────────────────────────────── */
function renderStylesOverview() {
  showView('overview');
  const list = document.getElementById('styles-list');

  if (!galleryData.styles.length) {
    list.innerHTML = '<p style="color:var(--ink-f);padding:1rem 0">Noch keine Stile vorhanden.</p>';
    return;
  }

  list.innerHTML = galleryData.styles.map(style => {
    const count = galleryData.works.filter(w => w.styleId === style.id).length;
    return `<div class="style-card-admin">
      <div class="thumb-wrap" onclick="openStyle('${style.id}')">
        <img src="${escHtml(style.thumbnail)}" alt="${escHtml(style.name)}" loading="lazy" style="object-position:${escAttr(style.thumbnailPosition || '50% 50%')}">
      </div>
      <div class="card-body">
        <div class="card-name">${escHtml(style.name)}</div>
        <div class="card-count">${count} Werk${count !== 1 ? 'e' : ''}</div>
        <div class="card-actions">
          <button class="btn-primary"   onclick="openStyle('${style.id}')">Werke ansehen</button>
          <button class="btn-secondary" onclick="openEditStyle('${style.id}')">Bearbeiten</button>
          <button class="btn-danger"    onclick="deleteStyle('${style.id}')">Löschen</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function showOverview() {
  currentStyleId = null;
  renderStylesOverview();
}

/* ─────────────────────────────────────────────────────────────────────────
   WERKE EINES STILS
   ───────────────────────────────────────────────────────────────────────── */
function openStyle(styleId) {
  currentStyleId = styleId;
  const style = galleryData.styles.find(s => s.id === styleId);
  document.getElementById('works-style-title').textContent = style.name;
  renderWorksList();
  showView('works');
}

// Robust gegen alte gespeicherte Werke, die noch das fruehere Einzelbild-Feld
// "image" statt "images" haben (z.B. durch eine zwischengespeicherte alte
// Admin-Seite gespeichert).
function workImagesOf(w) {
  return Array.isArray(w.images) ? w.images : (w.image ? [w.image] : []);
}

function renderWorksList() {
  const list  = document.getElementById('works-list');
  const works = galleryData.works.filter(w => w.styleId === currentStyleId);

  if (!works.length) {
    list.innerHTML = '<p style="color:var(--ink-f);padding:1rem 0">Noch keine Werke in diesem Stil.</p>';
    return;
  }

  list.innerHTML = works.map(w => {
    const images = workImagesOf(w);
    return `<div class="work-row">
    <img src="${escHtml(images[0] || '')}" alt="${escHtml(w.title)}" loading="lazy">
    <div class="work-info">
      <div class="work-title">${escHtml(w.title)}${w.sold ? ' <span style="color:var(--red);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em">· Verkauft</span>' : ''}${images.length > 1 ? ` <span style="color:var(--ink-f);font-size:0.7rem">(${images.length} Bilder)</span>` : ''}</div>
      <div class="work-meta">${escHtml(w.technique || '')}</div>
    </div>
    <div class="work-actions">
      <button class="btn-secondary" onclick="openEditWork('${w.id}')">Bearbeiten</button>
      <button class="btn-danger"    onclick="deleteWork('${w.id}')">Löschen</button>
    </div>
  </div>`;
  }).join('');
}

/* ─────────────────────────────────────────────────────────────────────────
   WERK HINZUFÜGEN / BEARBEITEN
   ───────────────────────────────────────────────────────────────────────── */
function openAddWork() {
  editingWorkId = null;
  workImages = [];
  resetWorkForm();
  document.getElementById('modal-work-title').textContent = 'Werk hinzufügen';

  // Stil-Dropdown vorausfüllen
  const sel = document.getElementById('w-style');
  sel.value = currentStyleId || galleryData.styles[0]?.id || '';

  document.getElementById('modal-work').style.display = 'flex';
}

function openEditWork(workId) {
  editingWorkId = workId;
  const work = galleryData.works.find(w => w.id === workId);
  if (!work) return;
  workImages = [...workImagesOf(work)];

  resetWorkForm();
  document.getElementById('modal-work-title').textContent = 'Werk bearbeiten';
  document.getElementById('w-style').value     = work.styleId;
  document.getElementById('w-title').value     = work.title;
  document.getElementById('w-technique').value = work.technique || '';
  document.getElementById('w-price').value     = work.price || '';
  document.getElementById('w-desc').value      = work.description || '';
  document.getElementById('w-sold').checked    = !!work.sold;

  renderWorkImagesGrid();
  document.getElementById('modal-work').style.display = 'flex';
}

function renderWorkImagesGrid() {
  const grid = document.getElementById('work-images-grid');
  if (!workImages.length) {
    grid.style.display = 'none';
    grid.innerHTML = '';
    return;
  }
  grid.style.display = 'flex';
  grid.innerHTML = workImages.map((url, i) => `
    <div class="work-image-thumb">
      <img src="${escHtml(url)}" alt="">
      <button type="button" class="work-image-remove" onclick="removeWorkImage(${i})" title="Bild entfernen">×</button>
    </div>
  `).join('');
}

function removeWorkImage(index) {
  workImages.splice(index, 1);
  renderWorkImagesGrid();
}

function resetWorkForm() {
  document.getElementById('w-title').value     = '';
  document.getElementById('w-technique').value = '';
  document.getElementById('w-price').value     = '';
  document.getElementById('w-desc').value      = '';
  document.getElementById('w-ai-context').value = '';
  document.getElementById('w-sold').checked    = false;
  document.getElementById('w-ai-status').textContent = '';
  document.getElementById('w-ai-status').classList.remove('is-error');

  // Upload zurücksetzen
  document.getElementById('w-file').value             = '';
  document.getElementById('upload-status').style.display = 'none';
  renderWorkImagesGrid();

  // Stil-Dropdown befüllen
  const sel = document.getElementById('w-style');
  sel.innerHTML = galleryData.styles.map(s =>
    `<option value="${s.id}">${escHtml(s.name)}</option>`
  ).join('');

  hideError('modal-error');
}

async function handleFileSelect(input) {
  await uploadWorkFiles(input.files);
  input.value = '';
}

async function uploadWorkFiles(fileList) {
  const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
  if (!files.length) return;

  const status = document.getElementById('upload-status');
  status.style.display = 'block';
  status.style.color = '';

  let uploaded = 0;
  let failed = 0;

  for (const file of files) {
    status.textContent = files.length > 1
      ? `Bild ${uploaded + failed + 1} von ${files.length} wird hochgeladen…`
      : 'Wird hochgeladen…';

    const formData = new FormData();
    formData.append('image', file);

    const res = await fetch(API.upload, { method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body: formData }).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => null) : null;

    if (data?.ok) {
      workImages.push(data.url);
      renderWorkImagesGrid();
      uploaded++;
    } else {
      failed++;
    }
  }

  if (failed) {
    status.textContent = `${uploaded} von ${files.length} Bildern hochgeladen, ${failed} fehlgeschlagen.`;
    status.style.color = 'var(--red)';
  } else {
    status.textContent = uploaded > 1 ? `✓ ${uploaded} Bilder hinzugefügt` : '✓ Bild hinzugefügt';
    status.style.color = 'var(--gold)';
  }
}

function initWorkImageDropzone() {
  const area = document.getElementById('upload-area');
  if (!area) return;

  ['dragenter', 'dragover'].forEach(evt => {
    area.addEventListener(evt, (e) => {
      e.preventDefault();
      area.classList.add('is-dragover');
    });
  });

  ['dragleave', 'dragend'].forEach(evt => {
    area.addEventListener(evt, () => area.classList.remove('is-dragover'));
  });

  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('is-dragover');
    uploadWorkFiles(e.dataTransfer.files);
  });
}

async function generateDescription() {
  const btn    = document.getElementById('w-ai-suggest');
  const status = document.getElementById('w-ai-status');
  status.classList.remove('is-error');

  if (!workImages.length) {
    status.textContent = 'Bitte zuerst ein Bild hochladen.';
    status.classList.add('is-error');
    return;
  }

  const title     = document.getElementById('w-title').value.trim();
  const technique = document.getElementById('w-technique').value.trim();
  const context   = document.getElementById('w-ai-context').value.trim();

  btn.disabled = true;
  status.textContent = 'Beschreibung wird erstellt …';

  try {
    const res = await fetch(API.describe, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ imageUrl: workImages[0], title, technique, context }),
    }).catch(() => null);

    if (!res) throw new Error('Server nicht erreichbar.');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Unbekannter Fehler.');

    document.getElementById('w-desc').value = data.description;
    status.textContent = 'Vorschlag eingefügt – bitte prüfen und bei Bedarf anpassen.';
  } catch (e) {
    status.textContent = e.message;
    status.classList.add('is-error');
  } finally {
    btn.disabled = false;
  }
}

async function saveWork() {
  hideError('modal-error');

  const styleId   = document.getElementById('w-style').value;
  const title     = document.getElementById('w-title').value.trim();
  const technique = document.getElementById('w-technique').value.trim();
  const price     = document.getElementById('w-price').value.trim();
  const desc      = document.getElementById('w-desc').value.trim();
  const sold      = document.getElementById('w-sold').checked;

  if (!title) { showError('modal-error', 'Bitte einen Titel eingeben.'); return; }

  if (!workImages.length) { showError('modal-error', 'Bitte mindestens ein Bild hochladen.'); return; }

  const btn = document.getElementById('save-work-btn');
  btn.disabled = true;

  if (editingWorkId) {
    // Werk aktualisieren
    const idx = galleryData.works.findIndex(w => w.id === editingWorkId);
    if (idx !== -1) {
      galleryData.works[idx] = { ...galleryData.works[idx], styleId, title, technique, price, description: desc, images: [...workImages], sold };
    }
  } else {
    // Neues Werk anlegen
    const newWork = {
      id: 'w' + Date.now(),
      styleId, title, technique, price, description: desc, images: [...workImages], sold
    };
    galleryData.works.push(newWork);
  }

  try {
    await saveGallery();
    closeModal('modal-work');
    showToast(editingWorkId ? 'Werk aktualisiert' : 'Werk hinzugefügt');
    if (currentStyleId) renderWorksList();
  } catch (e) {
    showError('modal-error', e.message);
  }

  btn.disabled = false;
}

function closeWorkModal(e) {
  if (e.target === document.getElementById('modal-work')) closeModal('modal-work');
}

/* ─────────────────────────────────────────────────────────────────────────
   WERK LÖSCHEN
   ───────────────────────────────────────────────────────────────────────── */
async function deleteWork(workId) {
  const work = galleryData.works.find(w => w.id === workId);
  if (!work) return;
  if (!confirm(`Werk „${work.title}" wirklich löschen?`)) return;

  galleryData.works = galleryData.works.filter(w => w.id !== workId);

  try {
    await saveGallery();
    showToast('Werk gelöscht');
    renderWorksList();
  } catch (e) {
    alert('Fehler beim Löschen: ' + e.message);
    await loadGallery(); // State wiederherstellen
    renderWorksList();
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   STIL HINZUFÜGEN / BEARBEITEN
   ───────────────────────────────────────────────────────────────────────── */
function openAddStyle() {
  editingStyleId = null;
  pendingStyleImageUrl = null;
  resetStyleForm();
  document.getElementById('modal-style-title').textContent = 'Neuer Stil';
  document.getElementById('modal-style').style.display = 'flex';
}

function openEditStyle(styleId) {
  editingStyleId = styleId;
  pendingStyleImageUrl = null;
  const style = galleryData.styles.find(s => s.id === styleId);
  if (!style) return;

  resetStyleForm();
  document.getElementById('modal-style-title').textContent = 'Stil bearbeiten';
  document.getElementById('s-name').value = style.name;
  document.getElementById('s-desc').value = style.description || '';

  const wrap  = document.getElementById('style-current-wrap');
  const thumb = document.getElementById('style-current-thumb');
  wrap.style.display = 'block';
  thumb.src = style.thumbnail;

  pendingStyleThumbnailPosition = style.thumbnailPosition || '50% 50%';
  document.getElementById('s-thumb-position').value = pendingStyleThumbnailPosition;
  const showMarker = () => placeFocusMarker(document.getElementById('style-current-marker'), pendingStyleThumbnailPosition);
  thumb.onload = showMarker;
  if (thumb.complete) showMarker();

  document.getElementById('modal-style').style.display = 'flex';
}

function resetStyleForm() {
  document.getElementById('s-name').value = '';
  document.getElementById('s-desc').value = '';
  document.getElementById('s-file').value = '';
  document.getElementById('style-preview-wrap').style.display = 'none';
  document.getElementById('style-upload-placeholder').style.display = 'flex';
  document.getElementById('style-current-wrap').style.display = 'none';
  pendingStyleThumbnailPosition = null;
  document.getElementById('s-thumb-position').value = '';
  document.getElementById('style-preview-marker').style.display = 'none';
  document.getElementById('style-current-marker').style.display = 'none';
  hideError('modal-style-error');
}

async function handleStyleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;

  const preview     = document.getElementById('style-upload-preview');
  const previewWrap = document.getElementById('style-preview-wrap');
  const placeholder = document.getElementById('style-upload-placeholder');
  preview.src = URL.createObjectURL(file);
  previewWrap.style.display = 'inline-block';
  placeholder.style.display = 'none';

  setStyleThumbnailPosition('50% 50%');
  preview.onload = () => placeFocusMarker(document.getElementById('style-preview-marker'), pendingStyleThumbnailPosition);

  const formData = new FormData();
  formData.append('image', file);

  const res = await fetch(API.upload, { method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body: formData }).catch(() => null);
  if (res?.ok) {
    const data = await res.json();
    if (data.ok) pendingStyleImageUrl = data.url;
  }
}

/* ── Fokuspunkt-Picker (Bildausschnitt Stil-Vorschaubild) ── */
function focusPercentFromClick(imgEl, clientX, clientY) {
  // Der Klick legt die MITTE des quadratischen Ausschnitts fest; zurueck kommt die passende
  // CSS-object-position. Entlang der kurzen Bildseite gibt es nichts zu verschieben (50%).
  const rect = imgEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const side = Math.min(rect.width, rect.height);
  const pct = (pos, size) => size > side ? Math.min(100, Math.max(0, (pos - side / 2) / (size - side) * 100)) : 50;
  return pct(clientX - rect.left, rect.width).toFixed(1) + '% ' + pct(clientY - rect.top, rect.height).toFixed(1) + '%';
}

// Zeichnet den quadratischen Ausschnitt (so wie er auf der Website sichtbar ist) als Rahmen ins Bild.
function placeFocusMarker(markerEl, positionStr) {
  if (!markerEl) return;
  const img = markerEl.parentElement.querySelector('img');
  const dw = img?.clientWidth, dh = img?.clientHeight;
  const parts = (positionStr || '').split(' ').map(v => parseFloat(v));
  if (!dw || !dh || parts.length !== 2 || parts.some(isNaN)) { markerEl.style.display = 'none'; return; }
  const side = Math.min(dw, dh);
  markerEl.style.width  = side + 'px';
  markerEl.style.height = side + 'px';
  markerEl.style.left   = (dw > dh ? (dw - side) * parts[0] / 100 : 0) + 'px';
  markerEl.style.top    = (dh > dw ? (dh - side) * parts[1] / 100 : 0) + 'px';
  markerEl.style.display = 'block';
}

function setStyleThumbnailPosition(positionStr) {
  pendingStyleThumbnailPosition = positionStr;
  document.getElementById('s-thumb-position').value = positionStr;
  placeFocusMarker(document.getElementById('style-preview-marker'), positionStr);
  placeFocusMarker(document.getElementById('style-current-marker'), positionStr);
}

function initStyleFocusPicker() {
  ['style-preview-wrap', 'style-current-picker'].forEach(wrapperId => {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;
    wrapper.addEventListener('click', (e) => {
      const img = wrapper.querySelector('img');
      if (!img || !img.src) return;
      const pos = focusPercentFromClick(img, e.clientX, e.clientY);
      if (pos) setStyleThumbnailPosition(pos);
    });
  });
}

async function saveStyle() {
  hideError('modal-style-error');

  const name = document.getElementById('s-name').value.trim();
  const desc = document.getElementById('s-desc').value.trim();

  if (!name) { showError('modal-style-error', 'Bitte einen Namen eingeben.'); return; }

  const existingStyle = editingStyleId ? galleryData.styles.find(s => s.id === editingStyleId) : null;
  const thumbnail = pendingStyleImageUrl || existingStyle?.thumbnail || null;
  const thumbnailPosition = document.getElementById('s-thumb-position').value || '50% 50%';

  if (!thumbnail) { showError('modal-style-error', 'Bitte ein Vorschaubild hochladen.'); return; }

  if (editingStyleId) {
    const idx = galleryData.styles.findIndex(s => s.id === editingStyleId);
    if (idx !== -1) {
      galleryData.styles[idx] = { ...galleryData.styles[idx], name, description: desc, thumbnail, thumbnailPosition };
    }
  } else {
    const newId = name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20) + '_' + Date.now();
    galleryData.styles.push({ id: newId, name, description: desc, thumbnail, thumbnailPosition });
  }

  try {
    await saveGallery();
    closeModal('modal-style');
    showToast(editingStyleId ? 'Stil aktualisiert' : 'Stil hinzugefügt');
    renderStylesOverview();
  } catch (e) {
    showError('modal-style-error', e.message);
  }
}

function closeStyleModal(e) {
  if (e.target === document.getElementById('modal-style')) closeModal('modal-style');
}

/* ─────────────────────────────────────────────────────────────────────────
   STIL LÖSCHEN
   ───────────────────────────────────────────────────────────────────────── */
async function deleteStyle(styleId) {
  const style  = galleryData.styles.find(s => s.id === styleId);
  const wCount = galleryData.works.filter(w => w.styleId === styleId).length;

  if (!confirm(`Stil „${style?.name}" und alle ${wCount} zugehörigen Werke wirklich löschen?`)) return;

  galleryData.styles = galleryData.styles.filter(s => s.id !== styleId);
  galleryData.works  = galleryData.works.filter(w => w.styleId !== styleId);

  try {
    await saveGallery();
    showToast('Stil gelöscht');
    renderStylesOverview();
  } catch (e) {
    alert('Fehler beim Löschen: ' + e.message);
    await loadGallery();
    renderStylesOverview();
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   HILFSFUNKTIONEN
   ───────────────────────────────────────────────────────────────────────── */
function showScreen(name) {
  document.getElementById('screen-login').style.display = name === 'login' ? 'flex' : 'none';
  document.getElementById('screen-app').style.display   = name === 'app'   ? 'block' : 'none';
}

function showView(name) {
  document.getElementById('view-overview').style.display = name === 'overview' ? 'block' : 'none';
  document.getElementById('view-works').style.display    = name === 'works'    ? 'block' : 'none';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.display = 'block';
}

function hideError(id) {
  const el = document.getElementById(id);
  el.textContent = '';
  el.style.display = 'none';
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => { t.style.display = 'none'; }, 3000);
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ═══════════════════════════════════════════════════════════════════════
   KURSANGEBOTE — Admin
   ═══════════════════════════════════════════════════════════════════════ */

let coursesData = null;
const MONAT_NAMEN_ADMIN = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const TAG_NAMEN_ADMIN   = ['Mo','Di','Mi','Do','Fr','Sa','So'];

/* ── Section-Switcher ── */
function showSection(name, btn) {
  document.getElementById('section-galerie').style.display       = name === 'galerie'       ? 'block' : 'none';
  document.getElementById('section-startseite').style.display    = name === 'startseite'    ? 'block' : 'none';
  document.getElementById('section-kurse').style.display         = name === 'kurse'         ? 'block' : 'none';
  document.getElementById('section-einstellungen').style.display = name === 'einstellungen' ? 'block' : 'none';
  document.querySelectorAll('.section-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (name === 'startseite') loadHome();
  if (name === 'kurse' && !coursesData) loadCourses();
  if (name === 'einstellungen' && !settingsData) loadSettings();
}

/* ═══════════════════════════════════════════════════════════════════════
   EINSTELLUNGEN — Admin
   ═══════════════════════════════════════════════════════════════════════ */
let settingsData = null;

async function loadSettings() {
  const res = await fetch('/api/settings.php').catch(() => null);
  if (res?.ok) {
    settingsData = await res.json();
    document.getElementById('set-ai-style-notes').value = settingsData.aiStyleNotes || '';
  }
}

async function saveSettings() {
  hideError('settings-error');
  settingsData = settingsData || {};
  settingsData.aiStyleNotes = document.getElementById('set-ai-style-notes').value.trim();

  try {
    const res = await fetch('/api/settings.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(settingsData)
    });
    const data = await res.json();
    if (data.ok) showToast('Einstellungen gespeichert');
    else showError('settings-error', data.error || 'Speichern fehlgeschlagen');
  } catch (e) {
    showError('settings-error', 'Verbindungsfehler');
  }
}

/* ── Kurs-Tabs ── */
function switchCourseTab(id, btn) {
  document.querySelectorAll('.kurs-admin-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.kurs-admin-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('cadmin-' + id).classList.add('active');
  btn.classList.add('active');
}

/* ── Laden ── */
async function loadCourses() {
  const res = await fetch('/api/courses.php').catch(() => null);
  if (res?.ok) {
    coursesData = await res.json();
    fillCourseForms();
  }
}

/* ── Formulare befüllen ── */
function fillCourseForms() {
  const k = coursesData.kurse;
  const g = coursesData.geburtstag;
  const a = coursesData.atelier;

  // Kurse
  setVal('k-eyebrow', k.eyebrow);
  setVal('k-title',   k.title);
  setVal('k-desc',    k.description);
  setVal('k-hint',    k.hinweis);
  ensureAngebot(k);
  renderAngebotAdmin();
  ensureSlideshow(k);
  renderSlideshowAdmin();
  ensureKalender(k);
  renderKursBoxen();
  renderKalSummary();
  renderPreisListAdmin('preise-list', k.preise);
  renderEinzelnList(k.einzelstunden);

  // Geburtstag
  setVal('g-eyebrow', g.eyebrow);
  setVal('g-title',   g.title);
  setVal('g-desc',    g.description);
  setVal('g-text1',   g.text1);
  setVal('g-text2',   g.text2);
  setVal('g-text3',   g.text3);
  renderPreisListAdmin('geb-preise-list', g.preise);

  // Atelier
  setVal('a-eyebrow', a.eyebrow);
  setVal('a-title',   a.title);
  setVal('a-desc',    a.description);
  setVal('a-text1',   a.text1);
  setVal('a-text2',   a.text2);
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}

/* ── Kurs-Boxen (Aufbau wie auf der Kursseite) ── */
// Pro Kursart: Wochentag, Zeit und Details (die Box auf der Kursseite) plus Laufzeit.
// Der Wochentag steuert zugleich den Kalender (assets/js/calendar.js).
const WOCHENTAGE = [[1, 'Montags'], [2, 'Dienstags'], [3, 'Mittwochs'], [4, 'Donnerstags'], [5, 'Freitags'], [6, 'Samstags'], [0, 'Sonntags']];
const KAL_KURSE  = [
  { id: 'erwachsene', label: 'Erwachsenenkurs', weekday: 1, zeit: '', detail: '', from: '', to: '' },
  { id: 'kinder',     label: 'Kinderkurs',      weekday: 4, zeit: '', detail: '', from: '', to: '' },
];

function ensureKalender(k) {
  const kal = k.kalender || {};
  const alt = k.zeiten || []; // frühere Datenform: Zeiten getrennt vom Kalender
  k.kalender = {
    kurse: KAL_KURSE.map(d => {
      const old = (kal.kurse || []).find(x => x.id === d.id) || {};
      const z   = alt.find(z => (z.detail || '').startsWith(d.id === 'kinder' ? 'Kinder' : 'Erwachsene')) || {};
      return { ...d, zeit: z.zeit || '', detail: z.detail || '', ...old };
    }),
    ausfaelle: kal.ausfaelle || [],
    specials: kal.specials || [],
  };
  delete k.termine;
  delete k.zeiten;
}

function updateKal(list, i, key, val) { coursesData.kurse.kalender[list][i][key] = val; }

function renderKursBoxen() {
  document.getElementById('kurs-boxen').innerHTML = coursesData.kurse.kalender.kurse.map((k, i) => `
    <div class="mirror-box">
      <div class="mirror-box-kopf"><i class="kal-dot kal-dot--${k.id}"></i>${escHtml(k.label)} <small>(Farbe im Kalender)</small></div>
      <select class="mirror-day" onchange="updateKal('kurse',${i},'weekday',+this.value)">
        ${WOCHENTAGE.map(([v, n]) => `<option value="${v}"${v === +k.weekday ? ' selected' : ''}>${n}</option>`).join('')}
      </select>
      <input class="mirror-time" type="text" value="${escAttr(k.zeit)}" placeholder="Uhrzeit, z.B. 18:00 – 19:30 Uhr" oninput="updateKal('kurse',${i},'zeit',this.value)">
      <textarea class="mirror-detail" rows="2" placeholder="Details" oninput="updateKal('kurse',${i},'detail',this.value)">${escHtml(k.detail)}</textarea>
    </div>`).join('');
}

function renderKalSummary() {
  const kal = coursesData.kurse.kalender;
  const n = (c, one, many) => `${c} ${c === 1 ? one : many}`;
  document.getElementById('kal-summary').textContent =
    `${n(kal.ausfaelle.length, 'Ausfall', 'Ausfälle')} · ${n(kal.specials.length, 'besonderer Termin', 'besondere Termine')}`;
}

/* ── Kalender-Pop-up: Laufzeit, Ausfälle, Besondere Termine ── */
let kalSnapshot = null;

function openKalenderModal() {
  kalSnapshot = JSON.stringify(coursesData.kurse.kalender); // für „Abbrechen“
  hideError('modal-kal-error');
  renderKalenderModal();
  document.getElementById('modal-kal').style.display = 'flex';
}

function cancelKalenderModal() {
  if (kalSnapshot) coursesData.kurse.kalender = JSON.parse(kalSnapshot);
  kalSnapshot = null;
  renderKursBoxen();
  renderKalSummary();
  closeModal('modal-kal');
}

async function saveKalenderModal() {
  hideError('modal-kal-error');
  if (await saveCourses('modal-kal-error')) {
    kalSnapshot = null;
    closeModal('modal-kal');
  }
}

function renderKalenderModal() {
  const kal = coursesData.kurse.kalender;

  document.getElementById('kal-laufzeit').innerHTML = kal.kurse.map((k, i) => `
    <div class="ca-list-item">
      <div class="ca-fields">
        <strong class="kal-kursname"><i class="kal-dot kal-dot--${k.id}"></i>${escHtml(k.label)}</strong>
        <label class="mini-field">Läuft ab (leer = schon laufend)
          <input type="date" value="${escAttr(k.from)}" onchange="updateKal('kurse',${i},'from',this.value)"></label>
        <label class="mini-field">Läuft bis (leer = unbefristet)
          <input type="date" value="${escAttr(k.to)}" onchange="updateKal('kurse',${i},'to',this.value)"></label>
      </div>
    </div>`).join('');

  document.getElementById('kal-ausfaelle').innerHTML = kal.ausfaelle.length ? kal.ausfaelle.map((a, i) => `
    <div class="ca-list-item">
      <div class="ca-fields">
        <label class="mini-field">Datum (oder von)
          <input type="date" value="${escAttr(a.from)}" onchange="updateKal('ausfaelle',${i},'from',this.value)"></label>
        <label class="mini-field">bis (optional, für Zeiträume)
          <input type="date" value="${escAttr(a.to)}" onchange="updateKal('ausfaelle',${i},'to',this.value)"></label>
        <label class="mini-field">Welcher Kurs?
          <select onchange="updateKal('ausfaelle',${i},'kurse',this.value)">
            <option value="beide"${a.kurse === 'beide' ? ' selected' : ''}>Beide Kurse</option>
            <option value="kinder"${a.kurse === 'kinder' ? ' selected' : ''}>Nur Kinderkurs</option>
            <option value="erwachsene"${a.kurse === 'erwachsene' ? ' selected' : ''}>Nur Erwachsenenkurs</option>
          </select></label>
        <label class="mini-field" style="flex-basis:100%">Grund (optional, steht unter dem Kalender)
          <input type="text" value="${escAttr(a.grund)}" placeholder="z.B. Krankheit, Betriebsferien" oninput="updateKal('ausfaelle',${i},'grund',this.value)"></label>
      </div>
      <button class="remove-btn" onclick="removeKal('ausfaelle',${i})">×</button>
    </div>`).join('') : '<p class="section-hint" style="margin:0 0 .6rem">Keine Ausfälle eingetragen.</p>';

  document.getElementById('kal-specials').innerHTML = kal.specials.length ? kal.specials.map((s, i) => `
    <div class="ca-list-item">
      <div class="ca-fields">
        <label class="mini-field">Datum
          <input type="date" value="${escAttr(s.date)}" onchange="updateKal('specials',${i},'date',this.value)"></label>
        <label class="mini-field">Farbe im Kalender
          <select onchange="updateKal('specials',${i},'color',this.value)">
            <option value="kinder"${s.color === 'kinder' ? ' selected' : ''}>Wie Kinderkurs</option>
            <option value="erwachsene"${s.color === 'erwachsene' ? ' selected' : ''}>Wie Erwachsenenkurs</option>
            <option value="special"${!s.color || s.color === 'special' ? ' selected' : ''}>Eigene Farbe (Bernstein)</option>
          </select></label>
        <label class="mini-field" style="flex-basis:100%">Titel
          <input type="text" value="${escAttr(s.title)}" placeholder="z.B. Weihnachtsmalen" oninput="updateKal('specials',${i},'title',this.value)"></label>
        <label class="mini-field" style="flex-basis:100%">Uhrzeit / Hinweis (optional)
          <input type="text" value="${escAttr(s.time)}" placeholder="z.B. 14:00 – 17:00 Uhr" oninput="updateKal('specials',${i},'time',this.value)"></label>
      </div>
      <button class="remove-btn" onclick="removeKal('specials',${i})">×</button>
    </div>`).join('') : '<p class="section-hint" style="margin:0 0 .6rem">Keine besonderen Termine eingetragen.</p>';
}

function addAusfall() {
  coursesData.kurse.kalender.ausfaelle.push({ from: '', to: '', kurse: 'beide', grund: '' });
  renderKalenderModal();
}

function addSpecial() {
  coursesData.kurse.kalender.specials.push({ id: 's' + Date.now(), date: '', title: '', time: '', color: 'special' });
  renderKalenderModal();
}

function removeKal(list, i) {
  coursesData.kurse.kalender[list].splice(i, 1);
  renderKalenderModal();
}

// Fehlertext oder '' - sortiert nebenbei die Listen nach Datum
function validateKalender() {
  const kal = coursesData.kurse.kalender;
  if (kal.kurse.some(c => c.from && c.to && c.to < c.from)) return 'Beim Kurs liegt „Läuft bis“ vor „Läuft ab“.';
  if (kal.ausfaelle.some(a => !a.from)) return 'Bitte bei jedem Ausfall ein Datum angeben (oder den Eintrag mit × entfernen).';
  if (kal.ausfaelle.some(a => a.to && a.to < a.from)) return 'Bei einem Ausfall liegt „bis“ vor dem Anfangsdatum.';
  if (kal.specials.some(s => !s.date || !s.title.trim())) return 'Bitte bei jedem besonderen Termin Datum und Titel angeben (oder den Eintrag mit × entfernen).';
  kal.ausfaelle.sort((a, b) => a.from.localeCompare(b.from));
  kal.specials.sort((a, b) => a.date.localeCompare(b.date));
  return '';
}

/* ── Slideshow: Werke aus den Kursen (Anfang der Kursseite) ── */
function ensureSlideshow(k) {
  k.slideshow = Array.isArray(k.slideshow) ? k.slideshow : [];
}

function renderSlideshowAdmin() {
  const list = coursesData.kurse.slideshow;
  document.getElementById('slideshow-list').innerHTML = list.map((s, i) => `
    <div class="slide-tile">
      <img src="${escAttr(s.image)}" alt="">
      <div class="slide-tile-btns">
        <button type="button" onclick="moveSlide(${i},-1)" ${i === 0 ? 'disabled' : ''} title="Nach vorn">←</button>
        <button type="button" onclick="moveSlide(${i},1)" ${i === list.length - 1 ? 'disabled' : ''} title="Nach hinten">→</button>
        <button type="button" onclick="removeSlide(${i})" title="Entfernen">×</button>
      </div>
    </div>`).join('') +
    `<button type="button" class="mirror-add slide-add" onclick="document.getElementById('slide-file').click()">+ Bilder hinzufügen</button>`;
}

function moveSlide(i, delta) {
  const list = coursesData.kurse.slideshow;
  [list[i], list[i + delta]] = [list[i + delta], list[i]];
  renderSlideshowAdmin();
}

function removeSlide(i) {
  coursesData.kurse.slideshow.splice(i, 1);
  renderSlideshowAdmin();
}

async function addSlides(input) {
  const files = Array.from(input.files || []).filter(f => f.type.startsWith('image/'));
  input.value = '';
  if (!files.length) return;
  const status = document.getElementById('slideshow-status');
  let failed = 0;
  for (const [n, file] of files.entries()) {
    status.textContent = `Bild ${n + 1} von ${files.length} wird hochgeladen…`;
    try {
      coursesData.kurse.slideshow.push({ image: await uploadImage(file) });
      renderSlideshowAdmin();
    } catch (e) { failed++; }
  }
  status.textContent = (failed ? `${failed} Bild(er) konnten nicht hochgeladen werden. ` : '')
    + 'Zum Übernehmen auf die Website unten auf „Änderungen speichern“ klicken.';
}

/* ── Gutschein / Spezialangebot (Kursseite, unter der Privatstunden-Tabelle) ── */
function ensureAngebot(k) {
  // frühere Datenform: einfache Fußzeile "Titel: Text" in einzelstunden_note
  const note = (k.einzelstunden_note || '').trim();
  const m = note.match(/^([^:]{1,40}):\s*([\s\S]+)$/);
  k.angebot = { titel: m ? m[1].trim() : '', text: m ? m[2].trim() : note, icon: 'geschenk', from: '', to: '', ...(k.angebot || {}) };
  delete k.einzelstunden_note;
}

function angebotStatus(a) {
  const today = todayStr();
  if (!(a.text || '').trim()) return ['ohne Text – wird nicht angezeigt', 'is-expired'];
  if (a.to && a.to < today)     return ['abgelaufen', 'is-expired'];
  if (a.from && a.from > today) return ['geplant', 'is-planned'];
  return ['aktiv', 'is-active'];
}

function renderAngebotAdmin() {
  const a = coursesData.kurse.angebot;
  const [label, cls] = angebotStatus(a);
  document.getElementById('angebot-box').innerHTML = `
    <div class="mirror-box">
      <div class="angebot-icons">
        <button type="button" class="icon-opt${!a.icon ? ' selected' : ''}" onclick="updateAngebot('icon','')" title="Kein Symbol">–</button>
        ${Object.entries(Angebot.ICONS).map(([key, ic]) =>
          `<button type="button" class="icon-opt${a.icon === key ? ' selected' : ''}" onclick="updateAngebot('icon','${key}')" title="${ic.label}">${ic.svg}</button>`
        ).join('')}
      </div>
      <input class="mirror-day" type="text" placeholder="Überschrift, z.B. Weihnachtsspecial" value="${escAttr(a.titel)}" oninput="updateAngebot('titel',this.value,true)">
      <textarea class="mirror-detail" rows="2" placeholder="Kleiner Text, z.B. Gutscheine für Malkurse im Atelier erhältlich" oninput="updateAngebot('text',this.value,true)">${escHtml(a.text)}</textarea>
      <div class="angebot-dates">
        <label class="mini-field">Von (leer = sofort sichtbar)
          <input type="date" value="${escAttr(a.from)}" onchange="updateAngebot('from',this.value)"></label>
        <label class="mini-field">Bis (leer = unbefristet)
          <input type="date" value="${escAttr(a.to)}" onchange="updateAngebot('to',this.value)"></label>
        <span id="angebot-status" class="badge ${cls}">${label}</span>
      </div>
    </div>`;
}

// keepFocus: beim Tippen nur die Status-Anzeige aktualisieren (sonst springt der Cursor)
function updateAngebot(key, val, keepFocus) {
  coursesData.kurse.angebot[key] = val;
  if (!keepFocus) return renderAngebotAdmin();
  const [label, cls] = angebotStatus(coursesData.kurse.angebot);
  const badge = document.getElementById('angebot-status');
  badge.textContent = label;
  badge.className = 'badge ' + cls;
}

/* ── Preise (Boxen wie auf der Kursseite) ── */
function renderPreisListAdmin(listId, preise) {
  document.getElementById(listId).innerHTML = preise.map((p, i) => `
    <div class="mirror-price">
      <button class="mirror-x" onclick="removePreis('${listId}',${i})" title="Box entfernen">×</button>
      <input class="mp-label"  type="text" placeholder="Bezeichnung" value="${escAttr(p.label)}"  oninput="updatePreis('${listId}',${i},'label',this.value)">
      <input class="mp-wert"   type="text" placeholder="Preis"       value="${escAttr(p.wert)}"   oninput="updatePreis('${listId}',${i},'wert',this.value)">
      <input class="mp-detail" type="text" placeholder="Details"     value="${escAttr(p.detail)}" oninput="updatePreis('${listId}',${i},'detail',this.value)">
    </div>`).join('') + `<button class="mirror-add" onclick="addPreis('${listId}')">+ Preis-Box hinzufügen</button>`;
}

function getPreisArray(listId) {
  if (listId === 'preise-list')     return coursesData.kurse.preise;
  if (listId === 'geb-preise-list') return coursesData.geburtstag.preise;
  return [];
}

function updatePreis(listId, i, key, val) { getPreisArray(listId)[i][key] = val; }
function removePreis(listId, i) {
  getPreisArray(listId).splice(i, 1);
  renderPreisListAdmin(listId, getPreisArray(listId));
}
function addPreis(listId) {
  getPreisArray(listId).push({ label: '', wert: '', detail: '' });
  renderPreisListAdmin(listId, getPreisArray(listId));
}

/* ── Privatstunden-Tabelle ── */
function renderEinzelnList(rows) {
  document.getElementById('einzeln-list').innerHTML = `
    <table class="mirror-table">
      <thead><tr><th>Privatstunden – Personen</th><th>Preis je Person</th><th></th></tr></thead>
      <tbody>${rows.map((r, i) => `
        <tr>
          <td><input type="text" value="${escAttr(r.personen)}" oninput="updateEinzeln(${i},'personen',this.value)"></td>
          <td><input type="text" value="${escAttr(r.preis)}"    oninput="updateEinzeln(${i},'preis',this.value)"></td>
          <td><button class="mirror-x mirror-x--row" onclick="removeEinzeln(${i})" title="Zeile entfernen">×</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
    <button class="mirror-add mirror-add--row" onclick="addEinzeln()">+ Zeile hinzufügen</button>`;
}

function updateEinzeln(i, key, val) { coursesData.kurse.einzelstunden[i][key] = val; }
function removeEinzeln(i) {
  coursesData.kurse.einzelstunden.splice(i, 1);
  renderEinzelnList(coursesData.kurse.einzelstunden);
}
function addEinzeln() {
  coursesData.kurse.einzelstunden.push({ personen: '', preis: '' });
  renderEinzelnList(coursesData.kurse.einzelstunden);
}

/* ── Speichern ── */
// errId: wo Fehler erscheinen (Seite oder Kalender-Pop-up). Gibt true zurück, wenn gespeichert wurde.
async function saveCourses(errId = 'courses-error') {
  hideError(errId);
  const kalError = validateKalender();
  if (kalError) { showError(errId, kalError); return false; }
  const ang = coursesData.kurse.angebot;
  if (ang.from && ang.to && ang.to < ang.from) { showError(errId, 'Beim Gutschein/Spezialangebot liegt „Bis“ vor „Von“.'); return false; }

  // Felder auslesen
  const k = coursesData.kurse;
  k.eyebrow     = document.getElementById('k-eyebrow').value;
  k.title       = document.getElementById('k-title').value;
  k.description = document.getElementById('k-desc').value;
  k.hinweis     = document.getElementById('k-hint').value;

  const g = coursesData.geburtstag;
  g.eyebrow     = document.getElementById('g-eyebrow').value;
  g.title       = document.getElementById('g-title').value;
  g.description = document.getElementById('g-desc').value;
  g.text1       = document.getElementById('g-text1').value;
  g.text2       = document.getElementById('g-text2').value;
  g.text3       = document.getElementById('g-text3').value;

  const a = coursesData.atelier;
  a.eyebrow     = document.getElementById('a-eyebrow').value;
  a.title       = document.getElementById('a-title').value;
  a.description = document.getElementById('a-desc').value;
  a.text1       = document.getElementById('a-text1').value;
  a.text2       = document.getElementById('a-text2').value;

  try {
    const res = await fetch('/api/courses.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(coursesData)
    });
    const data = await res.json();
    if (data.ok) {
      showToast('Kursangebote gespeichert');
      renderKalSummary();
      return true;
    }
    showError(errId, data.error || 'Speichern fehlgeschlagen');
  } catch (e) {
    showError(errId, 'Verbindungsfehler');
  }
  return false;
}

function escAttr(s) {
  return String(s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ═══════════════════════════════════════════════════════════════════════
   STARTSEITE — Admin: "Aktuelles" und Highlights (api/home.php, data/home.json)
   ═══════════════════════════════════════════════════════════════════════ */
const MAX_HIGHLIGHTS = 4; // gleicher Wert wie HOME_MAX_HIGHLIGHTS in partials/home-data.php
let homeData      = null; // { highlights: [workId, …], news: [{id,title,text,image,from,to}, …] }
let editingNewsId = null;
let newsImage     = '';

const todayStr = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in lokaler Zeit
const fmtDate  = d => d.split('-').reverse().join('.');

async function loadHome() {
  const res  = await fetch('/api/home.php').catch(() => null);
  const data = res?.ok ? await res.json().catch(() => ({})) : {};
  const ids  = Array.isArray(data.highlights) ? data.highlights : [];
  homeData = {
    // Ids geloeschter Werke aussortieren, damit Reihenfolge-Buttons immer zur Liste passen
    highlights: ids.filter(id => galleryData.works.some(w => w.id === id)),
    news: Array.isArray(data.news) ? data.news : [],
    focus: data.focus && typeof data.focus === 'object' && !Array.isArray(data.focus) ? data.focus : {}, // Werk-ID -> Ausschnitt
  };
  document.getElementById('max-highlights').textContent = MAX_HIGHLIGHTS;
  renderNews();
  renderHighlights();
}

async function saveHome() {
  const res = await fetch('/api/home.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(homeData),
  }).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (!data?.ok) throw new Error(data?.error || 'Speichern fehlgeschlagen');
}

async function uploadImage(file) {
  const formData = new FormData();
  formData.append('image', file);
  const res  = await fetch(API.upload, { method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body: formData }).catch(() => null);
  const data = await res?.json().catch(() => null);
  if (!data?.ok) throw new Error(data?.error || 'Bild konnte nicht hochgeladen werden.');
  return data.url;
}

/* ── Aktuelles ── */
function newsStatus(n) {
  const today = todayStr();
  if (n.to && n.to < today)     return ['abgelaufen', 'is-expired'];
  if (n.from && n.from > today) return ['geplant', 'is-planned'];
  return ['aktiv', 'is-active'];
}

function newsPeriodText(n) {
  if (n.from && n.to) return n.from === n.to ? fmtDate(n.to) : `${fmtDate(n.from)} – ${fmtDate(n.to)}`;
  if (n.from) return 'ab ' + fmtDate(n.from);
  if (n.to)   return 'bis ' + fmtDate(n.to);
  return 'unbefristet';
}

function renderNews() {
  const list = document.getElementById('news-list');
  if (!homeData.news.length) {
    list.innerHTML = '<p style="color:var(--ink-f);padding:.5rem 0">Noch keine Einträge – auf der Startseite wird „Aktuelles“ deshalb nicht angezeigt.</p>';
    return;
  }
  // Abgelaufene Eintraege nach unten (stabile Sortierung: sonst bleibt die Reihenfolge wie gespeichert)
  const sorted = [...homeData.news].sort((a, b) => (newsStatus(a)[1] === 'is-expired') - (newsStatus(b)[1] === 'is-expired'));
  list.innerHTML = sorted.map(n => {
    const [label, cls] = newsStatus(n);
    return `<div class="work-row${cls === 'is-expired' ? ' is-dimmed' : ''}">
    <img src="${escHtml(n.image)}" alt="" loading="lazy">
    <div class="work-info">
      <div class="work-title">${escHtml(n.title)} <span class="badge ${cls}">${label}</span></div>
      <div class="work-meta">${escHtml(newsPeriodText(n))}</div>
    </div>
    <div class="work-actions">
      <button class="btn-secondary" onclick="openNewsModal('${escHtml(n.id)}')">Bearbeiten</button>
      <button class="btn-danger"    onclick="deleteNews('${escHtml(n.id)}')">Löschen</button>
    </div>
  </div>`;
  }).join('');
}

function setNewsImage(url) {
  newsImage = url || '';
  const img = document.getElementById('n-preview');
  img.src = newsImage;
  img.style.display = newsImage ? 'inline-block' : 'none';
  document.getElementById('n-placeholder').style.display = newsImage ? 'none' : 'block';
}

function openNewsModal(id) {
  editingNewsId = id || null;
  const n = id ? homeData.news.find(x => x.id === id) : null;
  document.getElementById('modal-news-title').textContent = n ? 'Aktuelles: Eintrag bearbeiten' : 'Aktuelles: Eintrag hinzufügen';
  document.getElementById('n-title').value = n?.title || '';
  document.getElementById('n-text').value  = n?.text  || '';
  document.getElementById('n-from').value  = n?.from  || '';
  document.getElementById('n-to').value    = n?.to    || '';
  document.getElementById('n-file').value  = '';
  setNewsImage(n?.image);
  hideError('modal-news-error');
  document.getElementById('modal-news').style.display = 'flex';
}

async function handleNewsFile(input) {
  const file = input.files[0];
  if (!file) return;
  try {
    setNewsImage(await uploadImage(file));
    hideError('modal-news-error');
  } catch (e) {
    showError('modal-news-error', e.message);
  }
  input.value = '';
}

async function saveNews() {
  hideError('modal-news-error');
  const title = document.getElementById('n-title').value.trim();
  const text  = document.getElementById('n-text').value.trim();
  const from  = document.getElementById('n-from').value;
  const to    = document.getElementById('n-to').value;

  if (!title)     { showError('modal-news-error', 'Bitte eine Überschrift eingeben.'); return; }
  if (!newsImage) { showError('modal-news-error', 'Bitte ein Bild auswählen.'); return; }
  if (from && to && to < from) { showError('modal-news-error', '„Bis“ darf nicht vor „Von“ liegen.'); return; }

  const entry = { id: editingNewsId || 'n' + Date.now(), title, text, image: newsImage, from, to };
  const previous = homeData.news;
  homeData.news = editingNewsId
    ? previous.map(n => n.id === editingNewsId ? entry : n)
    : [entry, ...previous]; // neuester Eintrag zuerst

  const btn = document.getElementById('save-news-btn');
  btn.disabled = true;
  try {
    await saveHome();
    closeModal('modal-news');
    showToast(editingNewsId ? 'Eintrag aktualisiert' : 'Eintrag hinzugefügt');
    renderNews();
  } catch (e) {
    homeData.news = previous;
    showError('modal-news-error', e.message);
  }
  btn.disabled = false;
}

async function deleteNews(id) {
  const n = homeData.news.find(x => x.id === id);
  if (!n || !confirm(`Eintrag „${n.title}" wirklich löschen?`)) return;
  const previous = homeData.news;
  homeData.news = previous.filter(x => x.id !== id);
  try {
    await saveHome();
    showToast('Eintrag gelöscht');
  } catch (e) {
    homeData.news = previous;
    alert('Fehler beim Löschen: ' + e.message);
  }
  renderNews();
}

/* ── Highlights ── */
/* ── Highlights: quadratischen Ausschnitt wählen ── */
let focusWorkId = null;
let focusPos    = '50% 50%';

function openHighlightFocus(i) {
  const work = galleryData.works.find(w => w.id === homeData.highlights[i]);
  if (!work) return;
  focusWorkId = work.id;
  focusPos    = homeData.focus[work.id] || '50% 50%';
  const url = workImagesOf(work)[0] || '';
  const img = document.getElementById('focus-img');
  document.getElementById('focus-preview').style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
  img.onload = () => setFocusPos(focusPos);
  img.src = url;
  document.getElementById('modal-focus').style.display = 'flex';
  if (img.complete) setFocusPos(focusPos);
}

function setFocusPos(pos) {
  focusPos = pos;
  placeFocusMarker(document.getElementById('focus-marker'), pos);
  document.getElementById('focus-preview').style.backgroundPosition = pos;
}

function pickFocus(event) {
  const pos = focusPercentFromClick(document.getElementById('focus-img'), event.clientX, event.clientY);
  if (pos) setFocusPos(pos);
}

async function saveHighlightFocus() {
  const previous = { ...homeData.focus };
  if (focusPos === '50% 50%') delete homeData.focus[focusWorkId];
  else homeData.focus[focusWorkId] = focusPos;
  try {
    await saveHome();
    closeModal('modal-focus');
    showToast('Ausschnitt gespeichert');
    renderHighlights();
  } catch (e) {
    homeData.focus = previous;
    showError('modal-focus-error', e.message);
  }
}

/* ── Highlights: Liste ── */
function renderHighlights() {
  const list  = document.getElementById('highlights-list');
  const works = homeData.highlights.map(id => galleryData.works.find(w => w.id === id));
  document.getElementById('highlight-add-btn').disabled = works.length >= MAX_HIGHLIGHTS;

  if (!works.length) {
    list.innerHTML = '<p style="color:var(--ink-f);padding:.5rem 0">Nichts ausgewählt – die Startseite zeigt automatisch die ersten Werke der Galerie.</p>';
    return;
  }
  list.innerHTML = works.map((w, i) => `<div class="work-row">
    <img src="${escHtml(workImagesOf(w)[0] || '')}" alt="" loading="lazy" style="object-position:${escAttr(homeData.focus[w.id] || '50% 50%')}">
    <div class="work-info">
      <div class="work-title">${i + 1}. ${escHtml(w.title)}</div>
      <div class="work-meta">${escHtml(galleryData.styles.find(s => s.id === w.styleId)?.name || '')}</div>
    </div>
    <div class="work-actions">
      <button class="btn-secondary" onclick="openHighlightFocus(${i})" title="Bildausschnitt wählen">Ausschnitt</button>
      <button class="btn-secondary" onclick="moveHighlight(${i}, -1)" ${i === 0 ? 'disabled' : ''} title="Nach vorn">←</button>
      <button class="btn-secondary" onclick="moveHighlight(${i}, 1)" ${i === works.length - 1 ? 'disabled' : ''} title="Nach hinten">→</button>
      <button class="btn-danger"    onclick="setHighlights(homeData.highlights.filter((_, k) => k !== ${i}))">Entfernen</button>
    </div>
  </div>`).join('');
}

async function setHighlights(ids) {
  const previous = homeData.highlights;
  homeData.highlights = ids;
  try {
    await saveHome();
    hideError('home-error');
  } catch (e) {
    homeData.highlights = previous;
    showError('home-error', e.message);
  }
  renderHighlights();
  if (document.getElementById('modal-pick').style.display === 'flex') renderPickGrid();
}

function moveHighlight(i, delta) {
  const ids = [...homeData.highlights];
  [ids[i], ids[i + delta]] = [ids[i + delta], ids[i]];
  setHighlights(ids);
}

function openHighlightPicker() {
  const sel = document.getElementById('pick-style');
  sel.innerHTML = '<option value="">Alle Stile</option>' +
    galleryData.styles.map(s => `<option value="${escHtml(s.id)}">${escHtml(s.name)}</option>`).join('');
  document.getElementById('modal-pick').style.display = 'flex';
  renderPickGrid();
}

function renderPickGrid() {
  const styleId = document.getElementById('pick-style').value;
  const works   = galleryData.works.filter(w => !styleId || w.styleId === styleId);
  document.getElementById('pick-hint').textContent =
    `${homeData.highlights.length} von ${MAX_HIGHLIGHTS} ausgewählt – zum Auswählen oder Abwählen anklicken.`;
  document.getElementById('pick-grid').innerHTML = works.map(w => {
    const selected = homeData.highlights.includes(w.id);
    return `<button type="button" class="pick-tile${selected ? ' selected' : ''}" onclick="togglePick('${escHtml(w.id)}')">
      <img src="${escHtml(workImagesOf(w)[0] || '')}" alt="" loading="lazy">
      <span>${escHtml(w.title)}</span>
    </button>`;
  }).join('') || '<p style="color:var(--ink-f)">Keine Werke in diesem Stil.</p>';
}

function togglePick(id) {
  if (homeData.highlights.includes(id)) return setHighlights(homeData.highlights.filter(x => x !== id));
  if (homeData.highlights.length >= MAX_HIGHLIGHTS) return showToast(`Maximal ${MAX_HIGHLIGHTS} Highlights – zuerst eines abwählen.`);
  setHighlights([...homeData.highlights, id]);
}
