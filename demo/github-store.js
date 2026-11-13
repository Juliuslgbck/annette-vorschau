/* Redaktions-Modus: speichert die Inhalte (data/*.json, uploads/*) direkt in einem privaten
   GitHub-Repo (eigener Zweig), statt in einem Server. So kann Annette von ueberall pflegen,
   ohne dass die Seite oeffentlich gehostet sein muss; Julius holt den Stand per git (inhalt-holen.bat).

   Wird von demo/demo-api.js als Speicher benutzt, wenn window.AGB_STORE_CONFIG gesetzt ist
   (siehe build-vorschau.php, Seite admin/). Testbar ohne Browser: node demo/github-store.test.js */
(() => {
  const PATHS = { gallery: 'data/gallery.json', courses: 'data/courses.json', settings: 'data/settings.json', home: 'data/home.json', pages: 'data/pages.json' };
  const TOKEN_KEY = 'agb-gh-token';

  const b64FromBytes = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const bytesFromB64 = (b64) => Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0));
  const utf8 = (text) => new TextEncoder().encode(text);

  // Im Repo (und fuer PHP) stehen Bildpfade root-absolut ("/uploads/x.jpg", "/media/x.jpg"); die Redaktionsseite liegt
  // unter einem Unterpfad (github.io/<repo>/), dort muessen sie relativ sein. Beim Speichern zurueck.
  const toRelative = (obj) => JSON.parse(JSON.stringify(obj).replace(/"\/(uploads|media)\//g, '"$1/'));
  const toAbsolute = (obj) => JSON.parse(JSON.stringify(obj).replace(/"(uploads|media)\//g, '"/$1/'));

  // env: { fetch, storage, resize(file) -> Blob, cacheUpload(relativeUrl, blob), shareWithWorker(cfg|null), baseUrl }
  function create(cfg, env) {
    const shas = {};      // Pfad -> sha der zuletzt GELADENEN Fassung (null = Datei gibt es noch nicht)
    let writeChain = Promise.resolve(); // Schreibvorgaenge nacheinander, sonst kollidieren die sha-Werte

    const token = () => env.storage.getItem(TOKEN_KEY) || '';
    const api = (path, init = {}, tok = token()) => env.fetch(cfg.apiBase + '/repos/' + cfg.repo + path, {
      cache: 'no-store',
      ...init,
      headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', ...(init.headers || {}) },
    });
    const explain = async (r) => {
      const detail = await r.json().then((j) => j.message).catch(() => '');
      if (r.status === 401) return 'Der Zugangscode ist nicht mehr gültig. Bitte abmelden und neu anmelden.';
      if (r.status === 403) return 'Zugriff verweigert' + (detail ? ' (' + detail + ')' : '') + '.';
      return 'Speichern fehlgeschlagen (' + r.status + (detail ? ': ' + detail : '') + ').';
    };
    const CONFLICT = 'Der Inhalt wurde zwischenzeitlich an anderer Stelle geändert. Bitte die Seite neu laden (Strg + F5) und die Änderung noch einmal eingeben.';

    async function put(path, contentB64, message) {
      const body = { message, content: contentB64, branch: cfg.branch };
      if (shas[path]) body.sha = shas[path];
      const r = await api('/contents/' + path, { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
      if (r.status === 409 || r.status === 422) return { ok: false, error: CONFLICT };
      if (!r.ok) return { ok: false, error: await explain(r) };
      shas[path] = (await r.json()).content.sha;
      return { ok: true };
    }

    return {
      mode: 'github',
      isAuthed: () => !!token(),

      // Das "Passwort" der Anmeldeseite ist der Zugangscode (GitHub-Token mit Schreibrecht auf dieses Repo).
      async login({ password }) {
        const tok = (password || '').trim();
        if (!tok) return { ok: false, error: 'Bitte den Zugangscode eingeben.' };
        let r;
        try { r = await env.fetch(cfg.apiBase + '/repos/' + cfg.repo, { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json' } }); }
        catch { return { ok: false, error: 'Keine Verbindung zu GitHub.' }; }
        if (r.status === 401) return { ok: false, error: 'Der Zugangscode ist ungültig oder abgelaufen.' };
        if (!r.ok) return { ok: false, error: 'Kein Zugriff auf den Inhalt (Zugangscode ohne Berechtigung).' };
        if (!(await r.json()).permissions?.push) return { ok: false, error: 'Der Zugangscode hat kein Schreibrecht.' };
        const b = await env.fetch(cfg.apiBase + '/repos/' + cfg.repo + '/branches/' + encodeURIComponent(cfg.branch), { headers: { Authorization: 'Bearer ' + tok } });
        if (!b.ok) return { ok: false, error: 'Der Inhalts-Zweig „' + cfg.branch + '“ fehlt im Repository.' };
        env.storage.setItem(TOKEN_KEY, tok);
        env.shareWithWorker?.({ ...cfg, token: tok });
        return { ok: true };
      },

      logout() {
        env.storage.removeItem(TOKEN_KEY);
        env.shareWithWorker?.(null);
      },

      // null = Datei gibt es noch nicht (dann greift die Vorlage der Vorschau)
      async read(name) {
        const path = PATHS[name];
        const r = await api('/contents/' + path + '?ref=' + encodeURIComponent(cfg.branch));
        if (r.status === 404) { shas[path] = null; return null; }
        if (!r.ok) throw new Error(await explain(r));
        const file = await r.json();
        const data = toRelative(JSON.parse(new TextDecoder().decode(bytesFromB64(file.content))));
        shas[path] = file.sha; // erst NACH erfolgreichem Lesen: nur wer den Stand kennt, darf ihn ueberschreiben
        return data;
      },

      write(name, obj) {
        const path = PATHS[name];
        const run = async () => {
          if (!(path in shas)) return { ok: false, error: 'Der Inhalt wurde nicht vollständig geladen. Bitte die Seite neu laden (Strg + F5).' };
          return put(path, b64FromBytes(utf8(JSON.stringify(toAbsolute(obj), null, 4))), 'Inhalt aktualisiert: ' + path + ' (Redaktion)');
        };
        const result = writeChain.then(run, run);
        writeChain = result.catch(() => {});
        return result;
      },

      async upload(file) {
        let blob;
        try { blob = await env.resize(file); } catch { return { ok: false, error: 'Bild konnte nicht gelesen werden.' }; }
        const base = (file.name || 'bild').replace(/\.[^.]*$/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'bild';
        const name = base + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + '.jpg';
        const res = await put('uploads/' + name, b64FromBytes(new Uint8Array(await blob.arrayBuffer())), 'Bild hinzugefügt: uploads/' + name + ' (Redaktion)');
        if (!res.ok) return res;
        delete shas['uploads/' + name];
        await env.cacheUpload?.('uploads/' + name, blob); // sofort sichtbar, auch ehe die Vorschau neu gebaut ist
        return { ok: true, url: 'uploads/' + name, filename: name };
      },

      // Anpassungen der Anmeldeseite: der "Zugangscode" ersetzt Benutzername + Passwort
      patchLogin(doc) {
        doc.getElementById('l-user').value = 'annette';
        doc.getElementById('l-user').previousElementSibling.style.display = 'none';
        doc.getElementById('l-user').style.display = 'none';
        doc.getElementById('l-pass').previousElementSibling.textContent = 'Zugangscode';
        doc.getElementById('l-pass').placeholder = 'Zugangscode einfügen';
        const sub = doc.querySelector('.login-sub');
        if (sub) sub.textContent = 'Redaktion · Inhalte pflegen';
        doc.title = 'Redaktion · Annette Gerke-Bischoff';
      },
    };
  }

  // ── Browser-Umgebung ──
  function browserEnv() {
    const idb = () => new Promise((resolve, reject) => {
      const open = indexedDB.open('agb', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('kv');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    return {
      fetch: window.fetch.bind(window),
      storage: window.localStorage,
      // max. 2000 px Kantenlaenge (wie api/image.php), Drehung steckt bereits im dekodierten Bild
      resize: (file) => new Promise((resolve, reject) => {
        const src = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(src);
          canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob'))), 'image/jpeg', 0.82);
        };
        img.onerror = reject;
        img.src = src;
      }),
      // Hochgeladene Bilder gleich im Service-Worker-Cache ablegen (siehe sw.js)
      cacheUpload: async (relativeUrl, blob) => {
        const cache = await caches.open('agb-uploads');
        await cache.put(new URL(relativeUrl, document.baseURI).href, new Response(blob, { headers: { 'Content-Type': 'image/jpeg' } }));
      },
      // Zugangsdaten fuer den Service Worker (er kann nicht auf localStorage zugreifen)
      shareWithWorker: async (config) => {
        const db = await idb();
        const tx = db.transaction('kv', 'readwrite');
        config ? tx.objectStore('kv').put(config, 'config') : tx.objectStore('kv').delete('config');
      },
    };
  }

  const api = { create, PATHS, TOKEN_KEY, toRelative, toAbsolute };
  if (typeof module !== 'undefined') { module.exports = api; return; }

  // Admin: immer. Oeffentliche Vorschau-Seiten: nur fuer Angemeldete - sie sehen dort ihren gespeicherten
  // Stand; alle anderen sehen die veroeffentlichte Fassung.
  if (window.AGB_STORE_CONFIG) {
    const env = browserEnv();
    const tok = env.storage.getItem(TOKEN_KEY);
    if (location.pathname.includes('/admin') || tok) {
      window.AGB_STORE = create(window.AGB_STORE_CONFIG, env);
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
      // Wer schon angemeldet ist, gibt dem Service Worker die Zugangsdaten (z.B. nach einem Update)
      if (tok) env.shareWithWorker({ ...window.AGB_STORE_CONFIG, token: tok });
    }
  }
})();
