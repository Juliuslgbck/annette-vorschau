(() => {
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function initScrollNav() {
    const nav = document.getElementById("site-nav");
    if (!nav) return;

    let ticking = false;
    window.addEventListener(
      "scroll",
      () => {
        if (ticking) return;
        requestAnimationFrame(() => {
          nav.classList.toggle("scrolled", window.scrollY > 70);
          ticking = false;
        });
        ticking = true;
      },
      { passive: true }
    );
  }

  // Handy-Menue: Knopf oeffnet/schliesst, Link/Escape/Vergroessern schliesst ebenfalls
  function initMenu() {
    const nav = document.getElementById("site-nav");
    const btn = nav && nav.querySelector(".nav-toggle");
    if (!btn) return;
    const set = (open) => {
      nav.classList.toggle("menu-open", open);
      document.body.classList.toggle("menu-open", open);
      btn.setAttribute("aria-expanded", String(open));
      btn.setAttribute("aria-label", open ? "Menü schließen" : "Menü öffnen");
    };
    btn.addEventListener("click", () => set(!nav.classList.contains("menu-open")));
    nav.querySelectorAll(".nav-menu a").forEach((a) => a.addEventListener("click", () => set(false)));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
    window.matchMedia("(min-width: 701px)").addEventListener("change", () => set(false));
  }

  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback);
    } else {
      callback();
    }
  }

  window.Site = {
    escapeHtml,
    onReady,
    scrollToTop(behavior = "auto") {
      window.scrollTo({ top: 0, behavior });
    },
  };

  onReady(initScrollNav);
  onReady(initMenu);
})();
