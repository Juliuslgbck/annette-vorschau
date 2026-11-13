/* Textauszeichnung fuer "Ueber mich" und Impressum im Browser - dieselben Regeln wie partials/rich-text.php
   (siehe dort). Wird von demo/pages-live.js fuer die Live-Ansicht der Redaktion benutzt. */
(() => {
  // wie PHP htmlspecialchars(..., ENT_QUOTES)
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const unesc = (s) => s.replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  const safeUrl = (url) => /^(https?:\/\/|mailto:|tel:|#)/.test(url) || /^[A-Za-z0-9_\-./]+\.(php|html)(\?[^\s]*)?$/.test(url);

  // In der statischen Vorschau heissen die Seiten *.html statt *.php
  const pageUrl = (url) => (typeof location === 'undefined' || location.pathname.endsWith('.html') || location.pathname.endsWith('/') ? url.replace(/^([A-Za-z0-9_\-./]+)\.php/, '$1.html') : url);

  function inline(text, rewrite = false) {
    let t = esc(text);
    const links = [];
    t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, rawUrl) => {
      const url = unesc(rawUrl);
      if (!safeUrl(url)) return m;
      links.push('<a href="' + esc(rewrite ? pageUrl(url) : url) + '">' + label + '</a>');
      return '\x01' + (links.length - 1) + '\x02';
    });
    t = t.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(?<![A-Za-z0-9_@.+-])([A-Za-z0-9_.+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)|(https?:\/\/[^\s<>"\x01]*[^\s<>".,;:!?)\x01])/g,
      (m, mail, url) => (mail ? '<a href="mailto:' + mail + '">' + mail + '</a>' : '<a href="' + url + '">' + url + '</a>'));
    return t.replace(/\x01(\d+)\x02/g, (m, i) => links[+i]);
  }

  function block(text, rewrite = false) {
    text = String(text ?? '').replace(/\r\n/g, '\n').trim();
    if (!text) return '';
    return text.split(/\n{2,}/).map((p) => '<p>' + inline(p, rewrite).replace(/\n/g, '<br>') + '</p>\n').join('');
  }

  const api = { inline, block, esc };
  if (typeof module !== 'undefined') module.exports = api; else window.RichText = api;
})();
