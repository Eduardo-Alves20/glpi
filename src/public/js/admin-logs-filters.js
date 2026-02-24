document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("logs-filters-form");
  const modal = document.getElementById("logs-advanced-modal");
  const openBtn = document.getElementById("logs-open-advanced");
  const closeBtn = document.getElementById("logs-close-advanced");
  const cancelBtn = document.getElementById("logs-cancel-advanced");
  const clearBtn = document.getElementById("logs-clear-advanced");

  if (!form || !modal || !openBtn) {
    return;
  }

  const advancedFields = Array.from(modal.querySelectorAll("[data-advanced-field]"));

  const openModal = () => {
    modal.hidden = false;
    openBtn.setAttribute("aria-expanded", "true");
    document.body.classList.add("logs-modal-open");
  };

  const closeModal = () => {
    modal.hidden = true;
    openBtn.setAttribute("aria-expanded", "false");
    document.body.classList.remove("logs-modal-open");
  };

  openBtn.addEventListener("click", openModal);

  closeBtn?.addEventListener("click", closeModal);
  cancelBtn?.addEventListener("click", closeModal);

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
      closeModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) {
      closeModal();
    }
  });

  form.addEventListener("submit", () => {
    if (!modal.hidden) {
      document.body.classList.remove("logs-modal-open");
    }
  });
});
