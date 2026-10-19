(() => {
  let styles = [];
  let works = [];
  let currentStyleId = null;
  let currentWork = null;
  let lightboxImages = [];
  let lightboxIndex = 0;
  let lightboxTitle = "";

  async function fetchJson(endpoints) {
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint);
        if (!response.ok) continue;
        return await response.json();
      } catch (error) {
        // Try the next endpoint. This keeps the POC usable with simple local servers.
      }
    }
    throw new Error("Galerie konnte nicht geladen werden.");
  }

  async function loadGalleryData() {
    const data = await fetchJson(["api/gallery.php", "data/gallery.json"]);
    styles = (data.styles || []).map((style) => ({
      id: style.id,
      name: style.name,
      description: style.description,
      thumbnail: style.thumbnail,
      thumbnailPosition: style.thumbnailPosition || null,
    }));
    works = (data.works || []).map((work) => ({
      id: work.id,
      styleId: work.styleId,
      title: work.title,
      technique: work.technique,
      price: work.price || "",
      description: work.description,
      images: Array.isArray(work.images) ? work.images : work.image ? [work.image] : [],
      sold: !!work.sold,
    }));
  }

  function textNode(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text || "";
    return element;
  }

  function renderOverview() {
    const overview = document.getElementById("gov");
    const detail = document.getElementById("gdet");
    const grid = document.getElementById("sgrid");
    if (!overview || !detail || !grid) return;

    overview.style.display = "block";
    detail.style.display = "none";
    grid.replaceChildren();

    styles.forEach((style) => {
      const count = works.filter((work) => work.styleId === style.id).length;
      const card = document.createElement("article");
      card.className = "style-card";
      card.tabIndex = 0;
      card.addEventListener("click", () => openStyle(style.id));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openStyle(style.id);
        }
      });

      const image = document.createElement("img");
      image.className = "sthumb";
      image.src = style.thumbnail;
      image.alt = style.name;
      image.loading = "lazy";
      image.style.objectPosition = style.thumbnailPosition || "50% 50%";

      const info = document.createElement("div");
      info.className = "sinfo";
      info.append(
        textNode("div", "sname", style.name),
        textNode("div", "scount", `${count} Werk${count !== 1 ? "e" : ""}`),
        textNode("div", "sdesc", style.description),
        textNode("span", "senter", "Werke ansehen ->")
      );

      card.append(image, info);
      grid.append(card);
    });
  }

  function openStyle(id) {
    currentStyleId = id;
    const style = styles.find((item) => item.id === id);
    if (!style) return;

    document.getElementById("g-title").textContent = style.name;
    document.getElementById("g-desc").textContent = style.description;
    renderWorksList();

    document.getElementById("gov").style.display = "none";
    document.getElementById("gdet").style.display = "block";
    window.Site?.scrollToTop();
  }

  function backToOverview() {
    document.getElementById("gdet").style.display = "none";
    document.getElementById("gov").style.display = "block";
    window.Site?.scrollToTop();
  }

  function highlightWork(workId) {
    const target = document.getElementById("work-" + workId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("witem-highlighted");
    setTimeout(() => target.classList.remove("witem-highlighted"), 2500);
  }

  function renderWorksList() {
    const list = works.filter((work) => work.styleId === currentStyleId);
    const count = document.getElementById("wcount");
    const wrap = document.getElementById("wlist");
    if (!count || !wrap) return;

    count.textContent = `${list.length} Werk${list.length !== 1 ? "e" : ""}`;
    wrap.replaceChildren();

    if (!list.length) {
      wrap.append(textNode("p", "empty", "Keine Werke gefunden."));
      return;
    }

    list.forEach((work) => {
      const item = document.createElement("article");
      item.className = "witem";
      item.id = "work-" + work.id;

      let previewIndex = 0;

      const imageWrap = document.createElement("div");
      imageWrap.className = "witem-image";

      const image = document.createElement("img");
      image.src = work.images[0] || "";
      image.alt = work.title;
      image.loading = "lazy";

      if (work.images.length) {
        imageWrap.classList.add("is-zoomable");
        imageWrap.tabIndex = 0;
        imageWrap.setAttribute("role", "button");
        imageWrap.setAttribute("aria-label", `${work.title} groß ansehen`);
        imageWrap.addEventListener("click", () => openLightbox(work.images, previewIndex, work.title));
        imageWrap.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openLightbox(work.images, previewIndex, work.title);
          }
        });
      }

      imageWrap.append(image);

      if (work.images.length > 1) {
        const showPreview = (index) => {
          previewIndex = (index + work.images.length) % work.images.length;
          image.src = work.images[previewIndex];
        };

        const prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.className = "witem-nav witem-prev";
        prevBtn.innerHTML = "‹";
        prevBtn.setAttribute("aria-label", "Vorheriges Bild");
        prevBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          showPreview(previewIndex - 1);
        });

        const nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "witem-nav witem-next";
        nextBtn.innerHTML = "›";
        nextBtn.setAttribute("aria-label", "Nächstes Bild");
        nextBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          showPreview(previewIndex + 1);
        });

        imageWrap.append(prevBtn, nextBtn);
      }

      if (work.sold) {
        imageWrap.append(textNode("span", "sold-badge", "Verkauft"));
      }

      const details = document.createElement("div");
      details.className = "wdet";
      details.append(
        textNode("h3", "wtitle", work.title),
        textNode("p", "wmeta", work.technique),
        textNode("p", "wdesc", work.description)
      );
      if (work.price) {
        details.append(textNode("p", "wprice", work.price));
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "abtn";
      if (work.sold) {
        button.textContent = "Nicht verfügbar";
        button.disabled = true;
      } else {
        button.textContent = "Werk anfragen";
        button.addEventListener("click", () => openModal(work));
      }
      details.append(button);

      item.append(imageWrap, details);
      wrap.append(item);
    });
  }

  function openModal(work) {
    const modal = document.getElementById("modal");
    if (!modal) return;
    currentWork = work;
    document.getElementById("m-t").textContent = work.title;
    document.getElementById("m-m").textContent = work.technique || "";
    ["m-name", "m-email", "m-msg"].forEach((id) => {
      const field = document.getElementById(id);
      if (field) field.value = "";
    });
    modal.classList.add("open");
  }

  function closeModal() {
    document.getElementById("modal")?.classList.remove("open");
  }

  function openLightbox(images, index, title = "") {
    if (!images?.length) return;
    lightboxImages = images;
    lightboxIndex = index;
    lightboxTitle = title;
    showLightboxImage();
    document.getElementById("glightbox")?.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function showLightboxImage() {
    const img = document.getElementById("glightbox-img");
    const counter = document.getElementById("glightbox-counter");
    const prevBtn = document.querySelector("[data-lightbox-prev]");
    const nextBtn = document.querySelector("[data-lightbox-next]");
    if (!img) return;

    img.src = lightboxImages[lightboxIndex];
    img.alt = lightboxTitle;

    const multiple = lightboxImages.length > 1;
    if (counter) {
      counter.textContent = multiple ? `${lightboxIndex + 1} / ${lightboxImages.length}` : "";
      counter.style.display = multiple ? "block" : "none";
    }
    if (prevBtn) prevBtn.style.display = multiple ? "flex" : "none";
    if (nextBtn) nextBtn.style.display = multiple ? "flex" : "none";
  }

  function nextLightboxImage() {
    if (lightboxImages.length < 2) return;
    lightboxIndex = (lightboxIndex + 1) % lightboxImages.length;
    showLightboxImage();
  }

  function prevLightboxImage() {
    if (lightboxImages.length < 2) return;
    lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length;
    showLightboxImage();
  }

  function closeLightbox() {
    document.getElementById("glightbox")?.classList.remove("open");
    document.body.style.overflow = "";
  }

  function sendAnfrage() {
    if (!currentWork) return;

    const name = document.getElementById("m-name").value.trim();
    const email = document.getElementById("m-email").value.trim();
    const message = document.getElementById("m-msg").value.trim();

    if (!name || !email) {
      alert("Bitte Name und E-Mail angeben.");
      return;
    }

    const subject = encodeURIComponent(`Anfrage: ${currentWork.title}`);
    const body = encodeURIComponent(
      `Guten Tag,\n\nIch interessiere mich für das Werk ${currentWork.title} (${currentWork.technique}).\n\n${message || ""}\n\nMit freundlichen Grüßen,\n${name}\n${email}`
    );

    window.location.href = `mailto:annettegerke3@aol.com?subject=${subject}&body=${body}`;
    closeModal();
  }

  async function initGallery() {
    if (!document.getElementById("page-galerie")) return;

    const backButton = document.querySelector("[data-gallery-back]");
    backButton?.addEventListener("click", backToOverview);

    const modal = document.getElementById("modal");
    modal?.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });
    document.querySelector("[data-gallery-modal-close]")?.addEventListener("click", closeModal);
    document.querySelector("[data-gallery-modal-send]")?.addEventListener("click", sendAnfrage);

    const lightbox = document.getElementById("glightbox");
    lightbox?.addEventListener("click", (event) => {
      if (event.target === lightbox) closeLightbox();
    });
    document.querySelector("[data-lightbox-close]")?.addEventListener("click", closeLightbox);
    document.querySelector("[data-lightbox-prev]")?.addEventListener("click", prevLightboxImage);
    document.querySelector("[data-lightbox-next]")?.addEventListener("click", nextLightboxImage);
    document.addEventListener("keydown", (event) => {
      if (!lightbox?.classList.contains("open")) return;
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowLeft") prevLightboxImage();
      if (event.key === "ArrowRight") nextLightboxImage();
    });

    try {
      await loadGalleryData();

      const params = new URLSearchParams(window.location.search);
      const requestedStyleId = params.get("style");
      const requestedWorkId = params.get("work");
      const styleExists = requestedStyleId && styles.some((style) => style.id === requestedStyleId);

      if (styleExists) {
        openStyle(requestedStyleId);
        if (requestedWorkId) {
          requestAnimationFrame(() => highlightWork(requestedWorkId));
        }
      } else {
        renderOverview();
      }
    } catch (error) {
      const grid = document.getElementById("sgrid");
      grid?.replaceChildren(textNode("p", "empty", "Galerie konnte nicht geladen werden."));
      console.error(error);
    }
  }

  window.Site?.onReady(initGallery);
})();
