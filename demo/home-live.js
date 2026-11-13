/* Startseite in der Vorschau mit dem GESPEICHERTEN Stand aus dem Repo (nur fuer angemeldete Redaktion).
   Auf der echten Seite erzeugt PHP Highlights und "Aktuelles" (partials/highlights.php, news.php); die
   statische Vorschau hat sie beim Bauen fest eingebaut. Damit Annette ihre Aenderungen sofort sieht,
   werden beide Bereiche hier im Browser neu aufgebaut - mit derselben Logik wie in PHP.
   Ohne Anmeldung (window.AGB_STORE fehlt) passiert nichts. Test: node demo/home-live.test.js */
(() => {
  const MAX_HIGHLIGHTS = 4; // wie HOME_MAX_HIGHLIGHTS in partials/home-data.php

  const fmt = (d, withYear = true) => {
    const [y, m, day] = d.split('-');
    return withYear ? `${day}.${m}.${y}` : `${day}.${m}.`;
  };

  // Eintraege, die heute sichtbar sind (wie news_active in PHP)
  function newsActive(items, today) {
    return (items || []).filter((n) => n.title && n.image && (!n.from || n.from <= today) && (!n.to || n.to >= today));
  }

  // Kleine Zeitraum-Angabe, z.B. "12.11. – 30.11.2026" (wie news_period in PHP)
  function newsPeriod(from, to) {
    if (from && to) {
      if (from === to) return fmt(to);
      return fmt(from, from.slice(0, 4) !== to.slice(0, 4)) + ' – ' + fmt(to);
    }
    if (from) return 'ab ' + fmt(from);
    if (to) return 'bis ' + fmt(to);
    return '';
  }

  // Gewaehlte Highlights in Reihenfolge; ohne gueltige Auswahl die ersten Werke
  function highlightWorks(home, works) {
    const byId = Object.fromEntries(works.map((w) => [w.id, w]));
    const chosen = (home.highlights || []).map((id) => byId[id]).filter(Boolean);
    return (chosen.length ? chosen : works).slice(0, MAX_HIGHLIGHTS);
  }

  const api = { newsActive, newsPeriod, highlightWorks };
  if (typeof module !== 'undefined') { module.exports = api; return; }

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function run() {
    const store = window.AGB_STORE;
    if (!store || !document.getElementById('page-home')) return;
    let home, gallery;
    try { [home, gallery] = await Promise.all([store.read('home'), store.read('gallery')]); } catch { return; }
    if (!home || !gallery) return; // noch nichts gespeichert: die veroeffentlichte Fassung bleibt

    const works = gallery.works || [];
    const focus = home.focus || {};

    // Highlights
    const grid = document.querySelector('.highlights-grid');
    if (grid) {
      grid.innerHTML = highlightWorks(home, works).map((w) => {
        const thumb = (w.images && w.images[0]) || w.image || '';
        const href = w.styleId && w.id ? `gallery.html?style=${encodeURIComponent(w.styleId)}&work=${encodeURIComponent(w.id)}` : 'gallery.html';
        return `<a href="${esc(href)}" class="highlights-item" style="background-image:url('${esc(thumb)}');background-position:${esc(focus[w.id] || '50% 50%')}" aria-label="${esc(w.title)}"></a>`;
      }).join('');
      const link = document.querySelector('.highlights-link');
      if (link) link.textContent = `Alle ${works.length} Werke →`;
    }

    // Aktuelles
    document.getElementById('aktuelles')?.remove();
    const items = newsActive(home.news, new Date().toLocaleDateString('sv-SE'));
    if (items.length) {
      const section = document.createElement('section');
      section.className = 'news';
      section.id = 'aktuelles';
      section.innerHTML = `<p class="highlights-eyebrow">Ausstellungen &amp; Specials</p>
  <h2 class="highlights-heading">Aktuelles</h2>
  <div class="news-grid">${items.map((n) => {
    const period = newsPeriod(n.from, n.to);
    return `<article class="news-card"><img src="${esc(n.image)}" alt="${esc(n.title)}" loading="lazy"><div class="news-body">
      <h3 class="news-title">${esc(n.title)}</h3>${n.text ? `<p class="news-text">${esc(n.text).replace(/\n/g, '<br>')}</p>` : ''}${period ? `<p class="news-period">${esc(period)}</p>` : ''}
    </div></article>`;
  }).join('')}</div>`;
      const anchor = document.querySelector('.highlights');
      anchor ? anchor.after(section) : document.getElementById('page-home').append(section);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
