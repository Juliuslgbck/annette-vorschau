// Kurskalender-Logik (ohne DOM, damit testbar: node assets/js/calendar.test.js).
// Kurse laufen woechentlich am eingestellten Wochentag weiter; es entfallen
//   - gesetzliche Feiertage in NRW (automatisch),
//   - eingetragene Ausfaelle (einmalig, auch als Zeitraum, fuer einen Kurs oder beide),
// dazu kommen "Besondere Termine" (ausserplanmaessig, in einer Kursfarbe oder einer eigenen).
(() => {
  const pad = (n) => String(n).padStart(2, "0");

  // m = Monat 0-11 (wie bei Date)
  const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const isoOf = (date) => iso(date.getFullYear(), date.getMonth(), date.getDate());

  // Ostersonntag (Gauss/Butcher, gregorianisch)
  function easter(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  const holidayCache = {};

  // Gesetzliche Feiertage NRW plus Heiligabend und Silvester (keine gesetzlichen Feiertage, aber
  // keine Kurse) als { "YYYY-MM-DD": "Name" }. Heiligabend/Silvester bei Bedarf unten streichen.
  function holidays(year) {
    if (holidayCache[year]) return holidayCache[year];
    const e = easter(year);
    const rel = (days) => isoOf(new Date(e.getFullYear(), e.getMonth(), e.getDate() + days));
    return (holidayCache[year] = {
      [iso(year, 0, 1)]: "Neujahr",
      [rel(-2)]: "Karfreitag",
      [rel(1)]: "Ostermontag",
      [iso(year, 4, 1)]: "Tag der Arbeit",
      [rel(39)]: "Christi Himmelfahrt",
      [rel(50)]: "Pfingstmontag",
      [rel(60)]: "Fronleichnam",
      [iso(year, 9, 3)]: "Tag der Deutschen Einheit",
      [iso(year, 10, 1)]: "Allerheiligen",
      [iso(year, 11, 24)]: "Heiligabend",
      [iso(year, 11, 25)]: "1. Weihnachtstag",
      [iso(year, 11, 26)]: "2. Weihnachtstag",
      [iso(year, 11, 31)]: "Silvester",
    });
  }

  // Was passiert am Tag `date`? kal = { kurse:[{id,weekday,from,to}], ausfaelle:[{from,to,kurse,grund}], specials:[{date,title,time,color}] }
  // weekday wie Date.getDay(): 0 = Sonntag, 1 = Montag ... 6 = Samstag. Leeres from/to = unbegrenzt.
  function dayInfo(date, kal) {
    const key = isoOf(date);
    const holiday = holidays(date.getFullYear())[key];
    const info = { key, courses: [], cancelled: [], specials: (kal.specials || []).filter((s) => s.date === key) };
    for (const k of kal.kurse || []) {
      if (date.getDay() !== Number(k.weekday)) continue;
      if ((k.from && key < k.from) || (k.to && key > k.to)) continue;
      const ausfall = (kal.ausfaelle || []).find(
        (a) => (a.kurse === "beide" || a.kurse === k.id) && key >= a.from && key <= (a.to || a.from)
      );
      const reason = holiday || (ausfall && (ausfall.grund || "Entfällt"));
      if (reason) info.cancelled.push({ id: k.id, reason });
      else info.courses.push(k.id);
    }
    return info;
  }

  const api = { iso, isoOf, easter, holidays, dayInfo };
  if (typeof module !== "undefined") module.exports = api;
  else window.Kalender = api;
})();
