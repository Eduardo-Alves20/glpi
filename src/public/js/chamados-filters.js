document.addEventListener("DOMContentLoaded", () => {
  const forms = Array.from(document.querySelectorAll("[data-chamados-filters]"));
  if (!forms.length) return;

  const salvarJsonLocal = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // noop
    }
  };

  const lerJsonLocal = (key, fallback = []) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  };

  const storageKeyPorPagina = () => `glpi:filtros-salvos:${window.location.pathname}`;

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
    const savedWrap = form.querySelector("[data-saved-filters]");
    const savedSelect = form.querySelector('[data-action="saved-select"]');
    const btnSavedApply = form.querySelector('[data-action="saved-apply"]');
    const btnSavedSave = form.querySelector('[data-action="saved-save"]');
    const btnSavedDelete = form.querySelector('[data-action="saved-delete"]');

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

    if (savedWrap && savedSelect) {
      const key = storageKeyPorPagina();

      const listarSalvos = () => lerJsonLocal(key, []);

      const coletarValoresAtuais = () => {
        const data = new FormData(form);
        const out = {};
        for (const [k, v] of data.entries()) {
          if (k === "page") continue;
          out[k] = String(v || "");
        }
        return out;
      };

      const aplicarValores = (values = {}) => {
        const entries = Object.entries(values || {});
        entries.forEach(([name, value]) => {
          const controls = form.querySelectorAll(`[name="${CSS.escape(name)}"]`);
          if (!controls.length) return;
          controls.forEach((control) => {
            const tag = String(control.tagName || "").toLowerCase();
            const type = String(control.getAttribute("type") || "").toLowerCase();
            if (type === "checkbox" || type === "radio") {
              control.checked = String(control.value || "") === String(value || "");
              return;
            }
            if (tag === "select" || tag === "input" || tag === "textarea") {
              control.value = String(value || "");
            }
          });
        });
      };

      const renderSalvos = () => {
        const salvos = listarSalvos();
        const selecionadoAnterior = String(savedSelect.value || "");
        savedSelect.innerHTML = '<option value="">Filtros salvos</option>';

        salvos.forEach((item) => {
          const opt = document.createElement("option");
          opt.value = String(item?.id || "");
          opt.textContent = String(item?.nome || "Filtro sem nome");
          if (opt.value && opt.value === selecionadoAnterior) opt.selected = true;
          savedSelect.appendChild(opt);
        });
      };

      btnSavedSave?.addEventListener("click", () => {
        const nome = window.prompt("Nome deste filtro salvo:", "");
        const nomeSan = String(nome || "").trim().slice(0, 50);
        if (!nomeSan) return;

        const salvos = listarSalvos();
        const novo = {
          id: `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          nome: nomeSan,
          values: coletarValoresAtuais(),
          createdAt: new Date().toISOString(),
        };

        salvarJsonLocal(key, [novo, ...salvos].slice(0, 12));
        renderSalvos();
        savedSelect.value = novo.id;
      });

      btnSavedApply?.addEventListener("click", () => {
        const id = String(savedSelect.value || "");
        if (!id) return;
        const salvo = listarSalvos().find((x) => String(x?.id || "") === id);
        if (!salvo?.values || typeof salvo.values !== "object") return;
        aplicarValores(salvo.values);
        form.requestSubmit();
      });

      btnSavedDelete?.addEventListener("click", () => {
        const id = String(savedSelect.value || "");
        if (!id) return;
        const salvos = listarSalvos();
        const alvo = salvos.find((x) => String(x?.id || "") === id);
        if (!alvo) return;

        const ok = window.confirm(`Remover o filtro salvo "${String(alvo?.nome || "sem nome")}"?`);
        if (!ok) return;

        const atualizados = salvos.filter((x) => String(x?.id || "") !== id);
        salvarJsonLocal(key, atualizados);
        renderSalvos();
      });

      renderSalvos();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAllModals();
    }
  });
});
