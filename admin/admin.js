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

  if (!res?.ok) throw new Error('Speichern fehlgeschlagen');
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Speichern fehlgeschlagen');
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
        <img src="${escHtml(style.thumbnail)}" alt="${escHtml(style.name)}" loading="lazy">
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
      <div class="work-title">${escHtml(w.title)}${w.sold ? ' <span style="color:var(--red);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em">· Verkauft</span>' : ''}${w.highlight ? ' <span style="color:var(--gold);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em">· Highlight</span>' : ''}${images.length > 1 ? ` <span style="color:var(--ink-f);font-size:0.7rem">(${images.length} Bilder)</span>` : ''}</div>
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
  document.getElementById('w-highlight').checked = !!work.highlight;

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
  document.getElementById('w-highlight').checked = false;
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
  const highlight = document.getElementById('w-highlight').checked;

  if (!title) { showError('modal-error', 'Bitte einen Titel eingeben.'); return; }

  if (!workImages.length) { showError('modal-error', 'Bitte mindestens ein Bild hochladen.'); return; }

  const btn = document.getElementById('save-work-btn');
  btn.disabled = true;

  if (editingWorkId) {
    // Werk aktualisieren
    const idx = galleryData.works.findIndex(w => w.id === editingWorkId);
    if (idx !== -1) {
      galleryData.works[idx] = { ...galleryData.works[idx], styleId, title, technique, price, description: desc, images: [...workImages], sold, highlight };
    }
  } else {
    // Neues Werk anlegen
    const newWork = {
      id: 'w' + Date.now(),
      styleId, title, technique, price, description: desc, images: [...workImages], sold, highlight
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
  const rect = imgEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const xPct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
  const yPct = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
  return xPct.toFixed(1) + '% ' + yPct.toFixed(1) + '%';
}

function placeFocusMarker(markerEl, positionStr) {
  if (!markerEl) return;
  if (!positionStr) { markerEl.style.display = 'none'; return; }
  const parts = positionStr.split(' ').map(v => parseFloat(v));
  if (parts.length !== 2 || parts.some(isNaN)) { markerEl.style.display = 'none'; return; }
  markerEl.style.left = parts[0] + '%';
  markerEl.style.top  = parts[1] + '%';
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
  document.getElementById('section-kurse').style.display         = name === 'kurse'         ? 'block' : 'none';
  document.getElementById('section-einstellungen').style.display = name === 'einstellungen' ? 'block' : 'none';
  document.querySelectorAll('.section-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
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
  setVal('k-jahr',    k.termine.jahr);
  setVal('k-einzeln-note', k.einzelstunden_note);
  renderZeiten(k.zeiten);
  renderKalender(k.termine);
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

/* ── Zeiten ── */
function renderZeiten(zeiten) {
  document.getElementById('zeiten-list').innerHTML = zeiten.map((z, i) => `
    <div class="ca-list-item" data-idx="${i}">
      <div class="ca-fields">
        <input type="text" placeholder="Tag (z.B. Montags)"  value="${escAttr(z.tag)}"    oninput="updateZeit(${i},'tag',this.value)">
        <input type="text" placeholder="Zeit"                 value="${escAttr(z.zeit)}"   oninput="updateZeit(${i},'zeit',this.value)">
        <input type="text" placeholder="Details"              value="${escAttr(z.detail)}" oninput="updateZeit(${i},'detail',this.value)" style="flex-basis:100%">
      </div>
      <button class="remove-btn" onclick="removeZeit(${i})">×</button>
    </div>`).join('');
}

function updateZeit(i, key, val) { coursesData.kurse.zeiten[i][key] = val; }
function removeZeit(i) { coursesData.kurse.zeiten.splice(i,1); renderZeiten(coursesData.kurse.zeiten); }
function addZeit() {
  coursesData.kurse.zeiten.push({ tag:'', zeit:'', detail:'' });
  renderZeiten(coursesData.kurse.zeiten);
}

/* ── Kalender ── */
function renderKalender(termine) {
  const wrap = document.getElementById('admin-kalender');
  wrap.innerHTML = '';
  termine.monate.forEach((mon, mIdx) => {
    const { monat: m, tage } = mon;
    const erster  = new Date(termine.jahr, m, 1);
    let startWt   = erster.getDay(); startWt = startWt===0?6:startWt-1;
    const dimMonth = new Date(termine.jahr, m+1, 0).getDate();

    let html = `<div class="admin-kal-monat">
      <div class="admin-kal-head">
        <span>${MONAT_NAMEN_ADMIN[m]}</span>
        <button onclick="removeMonat(${mIdx})" title="Monat entfernen">✕</button>
      </div>
      <div class="admin-kal-days">`;
    TAG_NAMEN_ADMIN.forEach(t => { html += `<div class="admin-kal-dayhead">${t}</div>`; });
    for (let i=0; i<startWt; i++) html += `<div class="admin-kal-day leer">0</div>`;
    for (let d=1; d<=dimMonth; d++) {
      const isT = tage.includes(d);
      html += `<div class="admin-kal-day${isT?' termin':''}" onclick="toggleTag(${mIdx},${d})">${d}</div>`;
    }
    html += '</div></div>';
    wrap.innerHTML += html;
  });
}

function toggleTag(mIdx, day) {
  const mon = coursesData.kurse.termine.monate[mIdx];
  const i   = mon.tage.indexOf(day);
  if (i === -1) mon.tage.push(day);
  else mon.tage.splice(i, 1);
  mon.tage.sort((a,b)=>a-b);
  renderKalender(coursesData.kurse.termine);
}

function removeMonat(mIdx) {
  if (!confirm('Monat wirklich entfernen?')) return;
  coursesData.kurse.termine.monate.splice(mIdx, 1);
  renderKalender(coursesData.kurse.termine);
}

function addMonat() {
  const m = coursesData.kurse.termine.monate;
  const letzter = m.length ? m[m.length-1].monat : -1;
  const naechster = (letzter + 1) % 12;
  m.push({ monat: naechster, tage: [] });
  renderKalender(coursesData.kurse.termine);
}

/* ── Preise ── */
function renderPreisListAdmin(listId, preise) {
  document.getElementById(listId).innerHTML = preise.map((p, i) => `
    <div class="ca-list-item">
      <div class="ca-fields">
        <input type="text" placeholder="Bezeichnung" value="${escAttr(p.label)}"  oninput="updatePreis('${listId}',${i},'label',this.value)" style="flex-basis:100%">
        <input type="text" placeholder="Preis"        value="${escAttr(p.wert)}"   oninput="updatePreis('${listId}',${i},'wert',this.value)">
        <input type="text" placeholder="Details"      value="${escAttr(p.detail)}" oninput="updatePreis('${listId}',${i},'detail',this.value)">
      </div>
      <button class="remove-btn" onclick="removePreis('${listId}',${i})">×</button>
    </div>`).join('');
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
  getPreisArray(listId).push({ label:'', wert:'', detail:'' });
  renderPreisListAdmin(listId, getPreisArray(listId));
}

/* ── Einzelstunden ── */
function renderEinzelnList(rows) {
  document.getElementById('einzeln-list').innerHTML = rows.map((r, i) => `
    <div class="ca-list-item">
      <div class="ca-fields">
        <input type="text" placeholder="Personen" value="${escAttr(r.personen)}" oninput="updateEinzeln(${i},'personen',this.value)">
        <input type="text" placeholder="Preis"    value="${escAttr(r.preis)}"    oninput="updateEinzeln(${i},'preis',this.value)">
      </div>
      <button class="remove-btn" onclick="removeEinzeln(${i})">×</button>
    </div>`).join('');
}

function updateEinzeln(i, key, val) { coursesData.kurse.einzelstunden[i][key] = val; }
function removeEinzeln(i) {
  coursesData.kurse.einzelstunden.splice(i, 1);
  renderEinzelnList(coursesData.kurse.einzelstunden);
}

/* ── Speichern ── */
async function saveCourses() {
  hideError('courses-error');

  // Felder auslesen
  const k = coursesData.kurse;
  k.eyebrow     = document.getElementById('k-eyebrow').value;
  k.title       = document.getElementById('k-title').value;
  k.description = document.getElementById('k-desc').value;
  k.hinweis     = document.getElementById('k-hint').value;
  k.termine.jahr          = parseInt(document.getElementById('k-jahr').value) || 2026;
  k.einzelstunden_note    = document.getElementById('k-einzeln-note').value;

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
    if (data.ok) showToast('Kursangebote gespeichert');
    else showError('courses-error', data.error || 'Speichern fehlgeschlagen');
  } catch(e) {
    showError('courses-error', 'Verbindungsfehler');
  }
}

function escAttr(s) {
  return String(s||'').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
