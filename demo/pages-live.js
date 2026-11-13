/* "Ueber mich" und Impressum in der Vorschau mit dem GESPEICHERTEN Stand aus dem Repo (nur fuer angemeldete Redaktion).
   Browser-Gegenstueck zu render_about_body()/render_impressum_body() in partials/pages-data.php - dieselbe Ausgabe
   (Abgleich: node demo/pages-live.test.js). Ohne Anmeldung (window.AGB_STORE fehlt) passiert nichts. */
(() => {
  const RT = typeof module !== 'undefined' ? require('./rich-text.js') : window.RichText;
  const e = RT.esc;
  const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  // Bildpfade: auf der Vorschau unter einem Unterpfad muessen "/media/..." und "/uploads/..." relativ sein
  const src = (s, rewrite) => (rewrite ? String(s ?? '').replace(/^\/(uploads|media)\//, '$1/') : String(s ?? ''));
  const standText = (iso) => { const m = /^(\d{4})-(\d{2})-\d{2}/.exec(iso || ''); return m ? MONATE[+m[2] - 1] + ' ' + m[1] : ''; };
  const lines = (text, rewrite) => RT.inline(String(text ?? '').replace(/\r\n/g, '\n').trim(), rewrite).replace(/\n/g, '<br>');

  function renderAbout(a, rewrite = false) {
    let html = `<div class="ueber-hero">
      <img class="ueber-portrait" src="${e(src(a.portrait?.src, rewrite))}" alt="${e(a.portrait?.alt)}">
      <div class="ueber-intro">
        <p class="eyebrow">${e(a.eyebrow)}</p>
        <h2>${e(a.name)}</h2>
        ${(a.intro || []).map((p) => `<p>${RT.inline(p, rewrite)}</p>`).join('\n')}
        ${a.quote?.text ? `<blockquote>${e(a.quote.text)}<cite>${e(a.quote.author)}</cite></blockquote>` : ''}
      </div>
    </div>
    <div class="ueber-sections">`;
    for (const s of a.sections || []) {
      const images = s.images || [];
      html += `<div class="ueber-section${images.length ? '' : ' ueber-section--text'}">
        <div class="ueber-text">
          <h3>${e(s.title)}</h3>
          <ul class="timeline">${(s.items || []).map((i) => `<li><span class="yr">${e(i.year)}</span><span>${RT.inline(i.text, rewrite)}</span></li>`).join('')}</ul>
        </div>
        ${images.length ? `<div class="ueber-photos">${images.map((img) => `<img src="${e(src(img.src, rewrite))}" alt="${e(img.alt)}" loading="lazy">`).join('')}</div>` : ''}
      </div>`;
    }
    html += '</div>';
    if (a.contact?.text) html += `<div class="ueber-contact" style="margin-top:2rem"><h3>${e(a.contact.title)}</h3><p>${lines(a.contact.text, rewrite)}</p></div>`;
    return html;
  }

  function renderImpressum(i, rewrite = false) {
    let html = `<h2>${e(i.title)}</h2>`;
    for (const b of i.blocks || []) {
      if (b.heading) html += `<h3>${e(b.heading)}</h3>`;
      html += b.boxed ? `<div class="contact-block"><p>${lines(b.text, rewrite)}</p></div>` : RT.block(b.text, rewrite);
    }
    if (i.stand) html += `<p style="margin-top:1.5rem;font-size:0.75rem;color:var(--text-faint)">Stand: ${e(standText(i.stand))}</p>`;
    return html;
  }

  const api = { renderAbout, renderImpressum };
  if (typeof module !== 'undefined') { module.exports = api; return; }

  async function run() {
    const store = window.AGB_STORE;
    const about = document.querySelector('.ueber-body');
    const impressum = document.querySelector('.impressum-body');
    if (!store || (!about && !impressum)) return;
    let pages;
    try { pages = await store.read('pages'); } catch { return; }
    if (!pages) return; // noch nichts gespeichert: die veroeffentlichte Fassung bleibt
    if (about && pages.about?.name) about.innerHTML = renderAbout(pages.about, true);
    if (impressum && pages.impressum?.title) impressum.innerHTML = renderImpressum(pages.impressum, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
