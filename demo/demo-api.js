/* Ersatz fuer die api/*.php-Aufrufe im Browser (siehe build-vorschau.php). Faengt alle Aufrufe ab:
   - Admin (admin/): Speicher ist ein privates GitHub-Repo (demo/github-store.js, window.AGB_STORE).
   - oeffentliche Seiten: lesen die Vorlagen aus data/*.json (Galerie und Kurse laden ihre Daten so).
   Nichts wird an einen eigenen Server gesendet. */
(() => {
  const realFetch = window.fetch.bind(window);
  const PREFIX = 'agb-demo:';
  const SEEDS = { gallery: 'data/gallery.json', courses: 'data/courses.json', settings: 'data/settings.json', home: 'data/home.json' };
  const EMPTY = { settings: { aiStyleNotes: '' }, home: { highlights: [], news: [], focus: {} } };

  const reply = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

  // Bild im Browser auf max. 1400 px verkleinern und als data-URL liefern:
  // so bleibt der Demo-Speicher (ca. 5 MB localStorage) fuer ~15-20 Bilder reichlich.
  function toDataUrl(file) {
    return new Promise((resolve, reject) => {
      const src = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(src);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  // Demo-Speicher: localStorage. Gleiche Schnittstelle wie der GitHub-Speicher (github-store.js).
  const localStore = {
    mode: 'demo',
    isAuthed: () => { try { return sessionStorage.getItem(PREFIX + 'auth') === '1'; } catch { return false; } },
    async login() { sessionStorage.setItem(PREFIX + 'auth', '1'); return { ok: true }; },
    logout() { sessionStorage.removeItem(PREFIX + 'auth'); },
    async read(name) { try { return JSON.parse(localStorage.getItem(PREFIX + name)); } catch { return null; } },
    async write(name, obj) {
      try { localStorage.setItem(PREFIX + name, JSON.stringify(obj)); return { ok: true }; }
      catch { return { ok: false, error: 'Demo-Speicher voll – bitte unten „Demo zurücksetzen“ klicken oder kleinere/weniger Bilder nutzen.' }; }
    },
    async upload(file) {
      try { return { ok: true, url: await toDataUrl(file), filename: file.name }; }
      catch { return { ok: false, error: 'Bild konnte nicht gelesen werden.' }; }
    },
  };
  const store = window.AGB_STORE || localStore;

  async function handle(name, query, opts) {
    const action = new URLSearchParams(query || '').get('action') || 'check';
    const post = (opts.method || 'GET').toUpperCase() === 'POST';

    if (name === 'auth') {
      if (action === 'login') {
        const res = await store.login(JSON.parse(opts.body || '{}'));
        return res.ok ? reply({ ok: true, csrf: 'demo' }) : reply({ ok: false, error: res.error }, 401);
      }
      if (action === 'logout') { store.logout(); return reply({ ok: true }); }
      return reply({ authenticated: store.isAuthed(), csrf: store.isAuthed() ? 'demo' : null });
    }

    if (name in SEEDS) {
      if (!post) {
        try {
          const stored = await store.read(name);
          if (stored) return reply(stored);
        } catch (e) {
          // Lesefehler NICHT als "leer" melden - sonst wuerde der Admin mit leeren Daten weiterarbeiten
          return reply({ ok: false, error: e.message }, 502);
        }
        const seed = await realFetch(SEEDS[name]).catch(() => null);
        return seed?.ok ? seed : reply(EMPTY[name] || {});
      }
      if (!store.isAuthed()) return reply({ ok: false, error: 'Nicht autorisiert' }, 403);
      const res = await store.write(name, JSON.parse(opts.body));
      return res.ok ? reply({ ok: true }) : reply({ ok: false, error: res.error }, res.status || 409);
    }

    if (name === 'upload') {
      if (!store.isAuthed()) return reply({ ok: false, error: 'Nicht autorisiert' }, 403);
      const res = await store.upload(opts.body.get('image'));
      return res.ok ? reply(res) : reply(res, 400);
    }

    if (name === 'describe') {
      if (store.mode === 'github') return reply({ ok: false, error: 'Der KI-Vorschlag ist in der Redaktion noch nicht verfügbar.' }, 501);
      await new Promise((r) => setTimeout(r, 900));
      return reply({ ok: true, description: 'Kräftige Farbflächen treffen auf zarte Linien und lassen Raum für eigene Assoziationen. (Beispieltext aus der Demo – in der echten Version beschreibt die KI das hochgeladene Bild im Stil der Künstlerin.)' });
    }

    if (name === 'contact') return reply({ ok: false, error: 'Hier werden keine Nachrichten versendet.' }, 501);

    return reply({ ok: false, error: 'Hier nicht verfügbar.' }, 404);
  }

  window.fetch = (url, opts = {}) => {
    const m = String(url).match(/api\/(\w+)\.php(?:\?(.*))?$/);
    return m ? handle(m[1], m[2], opts) : realFetch(url, opts);
  };

  window.addEventListener('DOMContentLoaded', () => {
    if (!location.pathname.includes('/admin')) return;
    store.patchLogin?.(document);

    // Backup ist eine Seitennavigation (kein fetch) und gibt es hier nicht.
    window.downloadBackup = () => alert('Ein Backup ist nicht nötig: Jede Speicherung steht im Verlauf des Repositories und lässt sich zurücknehmen.');

    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:.6rem 1rem;background:#2a2a2a;color:#fff;font:13px/1.4 sans-serif;text-align:center';
    bar.textContent = 'Redaktion · Änderungen werden beim Speichern direkt gesichert und sind noch nicht öffentlich sichtbar';
    document.body.append(bar);
  });
})();
