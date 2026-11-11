(() => {
  const MONTH_NAMES = [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
  ];
  const DAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  // Index = Wochentag wie Date.getDay() (0 = Sonntag)
  const WEEKDAYS_ADVERB = ["Sonntags", "Montags", "Dienstags", "Mittwochs", "Donnerstags", "Freitags", "Samstags"];
  let coursesData = null;

  const esc = (value) => window.Site.escapeHtml(value);

  async function fetchJson(endpoints) {
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint);
        if (!response.ok) continue;
        return await response.json();
      } catch (error) {
        // Try the next endpoint for simple local POC hosting.
      }
    }
    throw new Error("Kursangebote konnten nicht geladen werden.");
  }

  async function loadCourses() {
    coursesData = await fetchJson(["api/courses.php", "data/courses.json"]);
    renderAll();
  }

  function priceGrid(prices = []) {
    return `<div class="preis-grid">${prices
      .map(
        (price) => `
          <div class="preis-item">
            <div class="preis-label">${esc(price.label)}</div>
            <div class="preis-wert">${esc(price.wert)}</div>
            <div class="preis-detail">${esc(price.detail)}</div>
          </div>`
      )
      .join("")}</div>`;
  }

  // ── Kalender: beginnt immer im aktuellen Monat, mit Pfeilen weiter blaetterbar ──
  const KAL_MONTHS = 4; // so viele Monate nebeneinander
  const KAL_MAX_OFFSET = 12; // so weit darf man vorblaettern
  let kalOffset = 0;

  const fmtDate = (key) => {
    const [y, m, d] = key.split("-");
    return `${d}.${m}.${y}`;
  };
  const weekdayShort = (key) => {
    const [y, m, d] = key.split("-").map(Number);
    return DAY_NAMES[(new Date(y, m - 1, d).getDay() + 6) % 7];
  };

  function drawCalendar(kal) {
    const root = document.getElementById("kal-root");
    if (!root || !kal || !window.Kalender) return;
    const K = window.Kalender;
    const now = new Date();
    const todayKey = K.isoOf(now);
    const kurse = kal.kurse || [];
    const labelOf = (id) => kurse.find((k) => k.id === id)?.label || id;

    const months = Array.from({ length: KAL_MONTHS }, (_, i) => new Date(now.getFullYear(), now.getMonth() + kalOffset + i, 1));
    const first = months[0];
    const last = months[months.length - 1];

    const monthHtml = months
      .map((first) => {
        const year = first.getFullYear();
        const month = first.getMonth();
        const startsAt = (first.getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let html = `<div class="kal-monat">
          <div class="kal-monat-head">${MONTH_NAMES[month]}${year !== now.getFullYear() ? " " + year : ""}</div>
          <div class="kal-days">`;
        DAY_NAMES.forEach((day) => {
          html += `<div class="kal-day-head">${day}</div>`;
        });
        for (let index = 0; index < startsAt; index += 1) html += `<div class="kal-day leer">0</div>`;
        for (let day = 1; day <= daysInMonth; day += 1) {
          const info = K.dayInfo(new Date(year, month, day), kal);
          const classes = ["kal-day"];
          let title = "";
          if (info.specials.length) {
            classes.push(`kal-c-${info.specials[0].color || "special"}`);
            title = info.specials.map((s) => s.title).join(", ");
          } else if (info.courses.length === 2) {
            classes.push("kal-c-both");
            title = info.courses.map(labelOf).join(" + ");
          } else if (info.courses.length === 1) {
            classes.push(`kal-c-${info.courses[0]}`);
            title = labelOf(info.courses[0]);
          }
          if (info.key < todayKey) classes.push("kal-vergangen");
          if (info.key === todayKey) classes.push("kal-heute");
          html += `<div class="${classes.join(" ")}"${title ? ` title="${esc(title)}"` : ""}>${day}</div>`;
        }
        return `${html}</div></div>`;
      })
      .join("");

    const legend = [
      ...kurse.map((k) => `<span><i class="kal-swatch kal-c-${esc(k.id)}"></i>${esc(k.label)}</span>`),
      ...(kal.specials?.length ? [`<span><i class="kal-swatch kal-c-special"></i>Besonderer Termin</span>`] : []),
    ].join("");

    // Hinweise zu kommenden Sonderterminen und Ausfaellen, damit sie auch ohne Maus-Tooltip lesbar sind
    const notes = [
      ...(kal.specials || [])
        .filter((s) => s.date >= todayKey)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((s) => `<li><strong>${weekdayShort(s.date)}, ${fmtDate(s.date)}</strong> – ${esc(s.title)}${s.time ? ` · ${esc(s.time)}` : ""}</li>`),
      ...(kal.ausfaelle || [])
        .filter((a) => (a.to || a.from) >= todayKey)
        .sort((a, b) => a.from.localeCompare(b.from))
        .map((a) => {
          const range = a.to && a.to !== a.from ? `${fmtDate(a.from)} – ${fmtDate(a.to)}` : fmtDate(a.from);
          const who = a.kurse === "beide" ? "" : ` (${esc(labelOf(a.kurse))})`;
          return `<li><strong>Entfällt: ${range}</strong>${who}${a.grund ? ` – ${esc(a.grund)}` : ""}</li>`;
        }),
    ].join("");

    root.innerHTML = `
      <div class="kal-kopf">
        <div class="kalender-label">Termine · ${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()} – ${MONTH_NAMES[last.getMonth()]} ${last.getFullYear()}</div>
        <div class="kal-nav">
          <button type="button" data-kal-dir="-1" aria-label="Frühere Monate"${kalOffset <= 0 ? " disabled" : ""}>‹</button>
          <button type="button" data-kal-dir="1" aria-label="Spätere Monate"${kalOffset >= KAL_MAX_OFFSET ? " disabled" : ""}>›</button>
        </div>
      </div>
      <div class="kalender-grid">${monthHtml}</div>
      <div class="kal-legende">${legend}</div>
      ${notes ? `<ul class="kal-notes">${notes}</ul>` : ""}`;

    root.querySelectorAll("[data-kal-dir]").forEach((button) => {
      button.addEventListener("click", () => {
        kalOffset = Math.min(KAL_MAX_OFFSET, Math.max(0, kalOffset + Number(button.dataset.kalDir)));
        drawCalendar(kal);
      });
    });
  }

  // Gutschein / Spezialangebot unter der Privatstunden-Tabelle; nur sichtbar, solange es im Zeitraum liegt
  function renderAngebot(offer) {
    const A = window.Angebot;
    if (!A || !A.isActive(offer, new Date().toLocaleDateString("sv-SE"))) return "";
    const icon = A.ICONS[offer.icon]?.svg || "";
    return `
      <div class="angebot">
        ${icon ? `<div class="angebot-icon">${icon}</div>` : ""}
        <div class="angebot-body">
          ${offer.titel ? `<div class="angebot-titel">${esc(offer.titel)}</div>` : ""}
          <p class="angebot-text">${esc(offer.text)}</p>
        </div>
      </div>`;
  }
  // Slideshow mit Werken aus den Kursen (direkt ueber dem Kalender); ohne Bilder gibt es sie nicht.
  // Nur Bilder und zwei feste Pfeile: das Bild behaelt sein Seitenverhaeltnis, die Pfeile bleiben an Ort und Stelle.
  function renderSlideshow(items = []) {
    const slides = items.filter((item) => item && item.image);
    if (!slides.length) return "";
    return `
      <div class="slideshow" id="slideshow" role="region" aria-roledescription="Bildergalerie" aria-label="Werke aus den Kursen">
        <h3 class="preis-heading">Werke aus den Kursen</h3>
        <div class="slideshow-stage">
          ${slides
            .map(
              (slide, index) => `
            <figure class="slide${index === 0 ? " active" : ""}">
              <img src="${esc(slide.image)}" alt="Werk aus dem Kurs" data-lightbox-image>
            </figure>`
            )
            .join("")}
          ${slides.length > 1 ? `<button type="button" class="slide-nav slide-prev" aria-label="Vorheriges Werk">‹</button>
          <button type="button" class="slide-nav slide-next" aria-label="Nächstes Werk">›</button>` : ""}
        </div>
      </div>`;
  }

  function initSlideshow() {
    const root = document.getElementById("slideshow");
    if (!root) return;
    const slides = [...root.querySelectorAll(".slide")];
    if (slides.length < 2) return;
    const INTERVAL = 4500;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let index = 0;
    let paused = false;
    let timer = null;

    const show = (next) => {
      index = (next + slides.length) % slides.length;
      slides.forEach((slide, i) => slide.classList.toggle("active", i === index));
    };
    // Nach jeder Bedienung die Wartezeit neu starten, damit es nicht sofort weiterspringt
    const restart = () => {
      clearInterval(timer);
      if (reduceMotion) return;
      timer = setInterval(() => {
        if (!paused && root.offsetParent !== null) show(index + 1); // nicht weiterblaettern, solange der Tab verborgen ist
      }, INTERVAL);
    };

    root.querySelector(".slide-prev").addEventListener("click", () => { show(index - 1); restart(); });
    root.querySelector(".slide-next").addEventListener("click", () => { show(index + 1); restart(); });

    root.addEventListener("mouseenter", () => { paused = true; });
    root.addEventListener("mouseleave", () => { paused = false; });
    root.addEventListener("focusin", () => { paused = true; });
    root.addEventListener("focusout", () => { paused = false; });

    let touchStartX = null;
    root.addEventListener("touchstart", (event) => { touchStartX = event.touches[0].clientX; }, { passive: true });
    root.addEventListener("touchend", (event) => {
      if (touchStartX === null) return;
      const delta = event.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(delta) > 40) { show(index + (delta < 0 ? 1 : -1)); restart(); }
    });

    restart();
  }

  function renderKurse(data) {
    document.getElementById("tab-kurse").innerHTML = `
      <div class="panel-intro">
        <p class="panel-eyebrow">${esc(data.eyebrow)}</p>
        <h2>${esc(data.title)}</h2>
        <p>${esc(data.description)}</p>
      </div>
      <div class="panel-body">
        <div class="foto-duo">
          <img src="uploads/kurs_erwachsene.jpg" alt="Malkurs im Atelier" data-lightbox-image>
          <img src="uploads/kurs_kinder_1.jpg" alt="Kinder im Kurs" data-lightbox-image>
        </div>
        <div class="kurs-times">${data.kalender.kurse
          .map(
            (course) => `
              <div class="kurs-time-card">
                <div class="day">${esc(WEEKDAYS_ADVERB[course.weekday])}</div>
                <div class="time">${esc(course.zeit)}</div>
                <div class="detail">${esc(course.detail)}</div>
              </div>`
          )
          .join("")}</div>
        ${renderSlideshow(data.slideshow)}
        <div class="kalender-wrap" id="kal-root"></div>
        <p class="kurs-note">${esc(data.hinweis)}</p>
        <p class="preis-heading">Preise</p>
        ${priceGrid(data.preise)}
        <table class="einzeln-table">
          <thead><tr><th>Privatstunden - Personen</th><th>Preis je Person</th></tr></thead>
          <tbody>${data.einzelstunden
            .map((row) => `<tr><td>${esc(row.personen)}</td><td>${esc(row.preis)}</td></tr>`)
            .join("")}</tbody>
        </table>
        ${renderAngebot(data.angebot)}
      </div>`;
    drawCalendar(data.kalender);
    initSlideshow();
  }

  function renderGeburtstag(data) {
    document.getElementById("tab-geburtstag").innerHTML = `
      <div class="panel-intro">
        <p class="panel-eyebrow">${esc(data.eyebrow)}</p>
        <h2>${esc(data.title)}</h2>
        <p>${esc(data.description)}</p>
      </div>
      <div class="panel-body">
        <div class="foto-duo">
          <img src="uploads/kurs_kinder_2.jpg" alt="Kinder" data-lightbox-image>
          <img src="uploads/kurs_maske.jpg" alt="Gipsmaske" data-lightbox-image>
        </div>
        <p>${esc(data.text1)}</p>
        <p>${esc(data.text2)}</p>
        <p>${esc(data.text3)}</p>
        <div class="foto-strip">
          <img src="uploads/kurs_jungen.jpg" alt="Jungen" data-lightbox-image>
          <img src="uploads/kurs_kinder_3.jpg" alt="Kurs" data-lightbox-image>
          <img src="uploads/kurs_stein.jpg" alt="Stein" data-lightbox-image>
        </div>
        <p class="preis-heading">Preise</p>
        ${priceGrid(data.preise)}
      </div>`;
  }

  function renderAtelier(data) {
    document.getElementById("tab-atelier").innerHTML = `
      <div class="panel-intro">
        <p class="panel-eyebrow">${esc(data.eyebrow)}</p>
        <h2>${esc(data.title)}</h2>
        <p>${esc(data.description)}</p>
      </div>
      <div class="panel-body">
        <div class="foto-wide"><img src="uploads/atelier_neu_2.jpg" alt="Atelier" data-lightbox-image></div>
        <div class="foto-strip">
          <img src="uploads/atelier_1.jpg" alt="Werkstatt" data-lightbox-image>
          <img src="uploads/atelier_neu_1.jpg" alt="Raum" data-lightbox-image>
          <img src="uploads/atelier_2.jpg" alt="Eingang" data-lightbox-image>
        </div>
        <p>${esc(data.text1)}</p>
        <p>${esc(data.text2)}</p>
        <div class="foto-duo">
          <img src="uploads/atelier_neu_3.jpg" alt="Gang" data-lightbox-image>
          <img src="uploads/kurs_zeichnen.jpg" alt="Kurs" data-lightbox-image>
        </div>
        <div class="kurs-cta">
          <div>
            <h3>Besuchen Sie das Atelier</h3>
            <p>Rudolf-Harbig-Weg 3 · 33332 Gütersloh<br>
            Tel.: <a href="tel:052415270280">05241 / 527 02 80</a><br>
            E-Mail: <a href="mailto:annettegerke3@aol.com">annettegerke3@aol.com</a></p>
          </div>
          <a href="mailto:annettegerke3@aol.com?subject=Kursanfrage" class="cta-btn cta-btn--primary">Kursanfrage senden</a>
        </div>
      </div>`;
  }

  function renderAll() {
    if (!coursesData) return;
    renderKurse(coursesData.kurse);
    renderGeburtstag(coursesData.geburtstag);
    renderAtelier(coursesData.atelier);
    bindLightboxImages();
  }

  function switchTab(tabId, button) {
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
    document.querySelectorAll(".tab-btn").forEach((tab) => tab.classList.remove("active"));
    document.getElementById(`tab-${tabId}`).classList.add("active");
    button.classList.add("active");
    window.scrollTo({
      top: document.querySelector(".tab-nav").offsetTop - 80,
      behavior: "smooth",
    });
  }

  function openLightbox(src, alt = "") {
    const lightbox = document.getElementById("lightbox");
    const image = document.getElementById("lightbox-img");
    if (!lightbox || !image) return;
    image.src = src;
    image.alt = alt;
    lightbox.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    document.getElementById("lightbox")?.classList.remove("open");
    document.body.style.overflow = "";
  }

  function bindLightboxImages() {
    document.querySelectorAll("[data-lightbox-image]").forEach((image) => {
      image.addEventListener("click", () => openLightbox(image.currentSrc || image.src, image.alt));
    });
  }

  function initCourses() {
    if (!document.getElementById("page-kurse")) return;

    document.querySelectorAll("[data-course-tab]").forEach((button) => {
      button.addEventListener("click", () => switchTab(button.dataset.courseTab, button));
    });

    const lightbox = document.getElementById("lightbox");
    lightbox?.addEventListener("click", (event) => {
      if (event.target === lightbox) closeLightbox();
    });
    document.querySelector("[data-lightbox-close]")?.addEventListener("click", closeLightbox);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeLightbox();
    });

    loadCourses().catch((error) => {
      document.querySelectorAll(".kurs-loading").forEach((element) => {
        element.textContent = "Kursangebote konnten nicht geladen werden.";
      });
      console.error(error);
    });
  }

  window.Site?.onReady(initCourses);
})();
