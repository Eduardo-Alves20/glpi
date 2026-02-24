document.addEventListener("DOMContentLoaded", () => {
  const forms = Array.from(document.querySelectorAll("[data-chamados-filters]"));
  if (!forms.length) return;

  const closeAllModals = () => {
    forms.forEach((form) => {
      const modal = form.querySelector('[data-role="advanced-modal"]');
      const openBtn = form.querySelector('[data-action="open-advanced"]');
      if (!modal) return;
      modal.hidden = true;
      if (openBtn) openBtn.setAttribute("aria-expanded", "false");
    });
    document.body.classList.remove("chamados-modal-open");
  };

  forms.forEach((form) => {
    const modal = form.querySelector('[data-role="advanced-modal"]');
    const openBtn = form.querySelector('[data-action="open-advanced"]');
    const closeBtn = form.querySelector('[data-action="close-advanced"]');
    const cancelBtn = form.querySelector('[data-action="cancel-advanced"]');
    const clearBtn = form.querySelector('[data-action="clear-advanced"]');

    if (!modal || !openBtn) return;

    const advancedFields = Array.from(modal.querySelectorAll("[data-advanced-field]"));

    openBtn.addEventListener("click", () => {
      closeAllModals();
      modal.hidden = false;
      openBtn.setAttribute("aria-expanded", "true");
      document.body.classList.add("chamados-modal-open");
    });

    const closeCurrent = () => {
      modal.hidden = true;
      openBtn.setAttribute("aria-expanded", "false");
      if (!document.querySelector('[data-role="advanced-modal"]:not([hidden])')) {
        document.body.classList.remove("chamados-modal-open");
      }
    };

    closeBtn?.addEventListener("click", closeCurrent);
    cancelBtn?.addEventListener("click", closeCurrent);

    clearBtn?.addEventListener("click", () => {
      advancedFields.forEach((field) => {
        const tag = field.tagName.toLowerCase();
        const type = String(field.getAttribute("type") || "").toLowerCase();

        if (tag === "select") {
          field.selectedIndex = 0;
          return;
        }

        if (type === "checkbox" || type === "radio") {
          field.checked = false;
          return;
        }

        field.value = "";
      });
    });

    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        closeCurrent();
      }
    });

    form.addEventListener("submit", () => {
      closeCurrent();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAllModals();
    }
  });
});
