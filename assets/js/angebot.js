// "Gutschein / Spezialangebot" auf der Kursseite: Symbole + Zeitraum-Logik.
// Von courses.js (Anzeige) und admin.js (Auswahl) genutzt; ohne DOM, damit testbar:
// node assets/js/angebot.test.js
(() => {
  // Einfache Linien-Symbole (24x24, nehmen die Textfarbe an). Reihenfolge = Reihenfolge im Admin.
  const SVG = (inner) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

  const ICONS = {
    geschenk: {
      label: "Geschenk",
      svg: SVG('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/><path d="M12 8v13"/><path d="M12 8C10.5 4 6 4 7 6.8c.6 1.5 3.2 1.2 5 1.2zM12 8c1.5-4 6-4 5-1.2-.6 1.5-3.2 1.2-5 1.2z"/>'),
    },
    gutschein: {
      label: "Gutschein",
      svg: SVG('<path d="M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M14 7v2M14 11v2M14 15v2"/>'),
    },
    osterei: {
      label: "Osterei",
      svg: SVG('<path d="M12 3c-3.5 0-6.5 5-6.5 10a6.5 6.5 0 0 0 13 0c0-5-3-10-6.5-10z"/><path d="M5.8 13l2.1-1.8L10 13l2-1.8 2 1.8 2.1-1.8L18.2 13"/>'),
    },
    kuerbis: {
      label: "Kürbis",
      svg: SVG('<path d="M12 7c-5 0-9 2.6-9 6.5S7 20 12 20s9-2.6 9-6.5S17 7 12 7z"/><path d="M12 7c-2 1-3 3.5-3 6.5s1 5.5 3 6.5M12 7c2 1 3 3.5 3 6.5s-1 5.5-3 6.5"/><path d="M12 7c0-1.5.6-2.8 2-3.5"/>'),
    },
    tannenbaum: {
      label: "Tannenbaum",
      svg: SVG('<path d="M12 2.5 7.5 9H10l-4 5.5h3.2L5 20h14l-4.2-5.5H18L14 9h2.5z"/><path d="M12 20v2"/>'),
    },
    schneeflocke: {
      label: "Schneeflocke",
      svg: SVG('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2"/>'),
    },
    herz: {
      label: "Herz",
      svg: SVG('<path d="M12 20s-8-4.9-8-10.6A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.4C20 15.1 12 20 12 20z"/>'),
    },
    stern: {
      label: "Stern",
      svg: SVG('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
    },
    blume: {
      label: "Blume",
      svg: SVG('<circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="6" r="2.8"/><circle cx="17.7" cy="10.1" r="2.8"/><circle cx="15.5" cy="16.9" r="2.8"/><circle cx="8.5" cy="16.9" r="2.8"/><circle cx="6.3" cy="10.1" r="2.8"/>'),
    },
  };

  // Sichtbar, wenn Text vorhanden ist und `today` (YYYY-MM-DD) im Zeitraum liegt.
  // Leeres "from" = sofort, leeres "to" = unbefristet.
  function isActive(offer, today) {
    if (!offer || !(offer.text || "").trim()) return false;
    return (!offer.from || offer.from <= today) && (!offer.to || offer.to >= today);
  }

  const api = { ICONS, isActive };
  if (typeof module !== "undefined") module.exports = api;
  else window.Angebot = api;
})();
