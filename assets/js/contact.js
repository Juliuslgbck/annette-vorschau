(() => {
  function initContactForm() {
    const form = document.getElementById("kontakt-form");
    if (!form) return;

    const status = document.getElementById("kontakt-status");
    const submitButton = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "";
      status.classList.remove("is-error", "is-success");
      submitButton.disabled = true;

      try {
        const response = await fetch("api/contact.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.value,
            email: form.email.value,
            message: form.message.value,
            website: form.website.value,
          }),
        });
        const data = await response.json();

        if (data.ok) {
          status.textContent = "Danke, Ihre Nachricht wurde gesendet.";
          status.classList.add("is-success");
          form.reset();
        } else {
          status.textContent = data.error || "Die Nachricht konnte nicht gesendet werden.";
          status.classList.add("is-error");
        }
      } catch (error) {
        status.textContent = "Die Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.";
        status.classList.add("is-error");
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  window.Site?.onReady(initContactForm);
})();
