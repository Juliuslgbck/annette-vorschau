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

  function buildCalendar(dates) {
    const { jahr, monate } = dates;
    return (monate || [])
      .map(({ monat, tage }) => {
        const firstDay = new Date(jahr, monat, 1);
        const startsAt = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
        const daysInMonth = new Date(jahr, monat + 1, 0).getDate();
        let html = `<div class="kal-monat">
          <div class="kal-monat-head">${MONTH_NAMES[monat]}</div>
          <div class="kal-days">`;
        DAY_NAMES.forEach((day) => {
          html += `<div class="kal-day-head">${day}</div>`;
        });
        for (let index = 0; index < startsAt; index += 1) {
          html += `<div class="kal-day leer">0</div>`;
        }
        for (let day = 1; day <= daysInMonth; day += 1) {
          html += `<div class="kal-day${tage.includes(day) ? " termin" : ""}">${day}</div>`;
        }
        return `${html}</div></div>`;
      })
      .join("");
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
          <img src="uploads/kurs_kinder_1.jpg" alt="Kinder im Kurs" data-lightbox-image>
          <img src="uploads/kurs_zeichnen.jpg" alt="Zeichnen" data-lightbox-image>
        </div>
        <div class="kurs-times">${data.zeiten
          .map(
            (time) => `
              <div class="kurs-time-card">
                <div class="day">${esc(time.tag)}</div>
                <div class="time">${esc(time.zeit)}</div>
                <div class="detail">${esc(time.detail)}</div>
              </div>`
          )
          .join("")}</div>
        <div class="kalender-wrap">
          <div class="kalender-label">Termine ${esc(data.termine.jahr)}</div>
          <div class="kalender-grid">${buildCalendar(data.termine)}</div>
        </div>
        <p class="kurs-note">${esc(data.hinweis)}</p>
        <p class="preis-heading">Preise</p>
        ${priceGrid(data.preise)}
        <table class="einzeln-table">
          <thead><tr><th>Einzelstunden - Personen</th><th>Preis je Person</th></tr></thead>
          <tbody>${data.einzelstunden
            .map((row) => `<tr><td>${esc(row.personen)}</td><td>${esc(row.preis)}</td></tr>`)
            .join("")}</tbody>
        </table>
        <p class="course-small-note">${esc(data.einzelstunden_note)}</p>
      </div>`;
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
