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
})();
