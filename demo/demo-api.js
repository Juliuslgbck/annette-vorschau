/* Demo-Modus fuer die statische Vorschau (siehe build-vorschau.php).
   Faengt alle api/*.php-Aufrufe im Browser ab und ersetzt den Server:
   Daten kommen aus data/*.json, Aenderungen landen nur im localStorage des
   jeweiligen Besuchers. Nichts wird an einen Server gesendet. */
(() => {
  const realFetch = window.fetch.bind(window);
  const PREFIX = 'agb-demo:';
  const SEEDS = { gallery: 'data/gallery.json', courses: 'data/courses.json', settings: 'data/settings.json' };

  const load = (k) => { try { return JSON.parse(localStorage.getItem(PREFIX + k)); } catch { return null; } };
  const save = (k, v) => { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); return true; } catch { return false; } };
  const isAuthed = () => { try { return sessionStorage.getItem(PREFIX + 'auth') === '1'; } catch { return false; } };
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

  async function handle(name, query, opts) {
    const action = new URLSearchParams(query || '').get('action') || 'check';
    const post = (opts.method || 'GET').toUpperCase() === 'POST';

    if (name === 'auth') {
      if (action === 'login') { sessionStorage.setItem(PREFIX + 'auth', '1'); return reply({ ok: true, csrf: 'demo' }); }
      if (action === 'logout') { sessionStorage.removeItem(PREFIX + 'auth'); return reply({ ok: true }); }
      return reply({ authenticated: isAuthed(), csrf: isAuthed() ? 'demo' : null });
    }

    if (name in SEEDS) {
      if (!post) {
        const stored = load(name);
        if (stored) return reply(stored);
        const seed = await realFetch(SEEDS[name]).catch(() => null);
        return seed?.ok ? seed : reply(name === 'settings' ? { aiStyleNotes: '' } : {});
      }
      if (!isAuthed()) return reply({ ok: false, error: 'Nicht autorisiert' }, 403);
      const ok = save(name, JSON.parse(opts.body));
      return ok ? reply({ ok: true }) : reply({ ok: false, error: 'Demo-Speicher voll – bitte unten „Demo zurücksetzen“ klicken oder kleinere/weniger Bilder nutzen.' }, 507);
    }

    if (name === 'upload') {
      if (!isAuthed()) return reply({ ok: false, error: 'Nicht autorisiert' }, 403);
      const file = opts.body.get('image');
      try { return reply({ ok: true, url: await toDataUrl(file), filename: file.name }); }
      catch { return reply({ ok: false, error: 'Bild konnte nicht gelesen werden.' }, 400); }
    }

    if (name === 'describe') {
      await new Promise((r) => setTimeout(r, 900));
      return reply({ ok: true, description: 'Kräftige Farbflächen treffen auf zarte Linien und lassen Raum für eigene Assoziationen. (Beispieltext aus der Demo – in der echten Version beschreibt die KI das hochgeladene Bild im Stil der Künstlerin.)' });
    }

    if (name === 'contact') return reply({ ok: false, error: 'In der Demo werden keine Nachrichten versendet.' }, 501);

    return reply({ ok: false, error: 'In der Demo nicht verfügbar.' }, 404);
  }

  window.fetch = (url, opts = {}) => {
    const m = String(url).match(/api\/(\w+)\.php(?:\?(.*))?$/);
    return m ? handle(m[1], m[2], opts) : realFetch(url, opts);
  };

  window.addEventListener('DOMContentLoaded', () => {
    if (!location.pathname.includes('/admin')) return;

    // Backup ist eine Seitennavigation (kein fetch) und gibt es in der Demo nicht.
    window.downloadBackup = () => alert('Das ZIP-Backup gibt es nur in der echten Version – hier liegen die Daten nur in deinem Browser.');

    const bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:9999;padding:.6rem 1rem;background:#2a2a2a;color:#fff;font:13px/1.4 sans-serif;text-align:center';
    bar.innerHTML = 'Demo-Modus · Anmeldung mit beliebigen Daten (z. B. „demo“) · Änderungen bleiben nur in diesem Browser · '
      + '<a href="#" style="color:#f0c674">Demo zurücksetzen</a>';
    bar.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k));
      sessionStorage.removeItem(PREFIX + 'auth');
      location.reload();
    });
    document.body.append(bar);
  });
})();
