(function () {
  const MAX_FILES_DEFAULT = 5;
  const MAX_SIZE_BYTES = 10 * 1024 * 1024;

  function toArray(list) {
    return Array.from(list || []);
  }

  function extOf(name = "") {
    const value = String(name || "").trim().toLowerCase();
    const idx = value.lastIndexOf(".");
    if (idx <= 0 || idx === value.length - 1) return "";
    return value.slice(idx);
  }

  function parseAccept(input) {
    return String(input?.getAttribute("accept") || "")
      .split(",")
      .map((t) => String(t || "").trim().toLowerCase())
      .filter(Boolean);
  }

  function isAcceptedByInput(file, input) {
    const accept = parseAccept(input);
    if (!accept.length) return true;

    const mime = String(file?.type || "").toLowerCase();
    const ext = extOf(file?.name || "");

    return accept.some((rule) => {
      if (rule.startsWith(".")) return ext === rule;
      if (rule.endsWith("/*")) {
        const prefix = rule.slice(0, -1);
        return mime.startsWith(prefix);
      }
      return mime === rule;
    });
  }

  function normalizeFileName(file) {
    if (!(file instanceof File)) return null;
    if (String(file.name || "").trim()) return file;

    const mime = String(file.type || "").toLowerCase();
    const ext = mime === "image/png"
      ? ".png"
      : mime === "image/jpeg"
        ? ".jpg"
        : mime === "image/webp"
          ? ".webp"
          : mime === "image/gif"
            ? ".gif"
            : ".bin";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `print-${stamp}${ext}`;
    return new File([file], name, {
      type: mime || "application/octet-stream",
      lastModified: Date.now(),
    });
  }

  function extractFilesFromDataTransfer(dataTransfer) {
    const out = [];
    if (!dataTransfer) return out;

    const dtFiles = toArray(dataTransfer.files);
    if (dtFiles.length) {
      dtFiles.forEach((file) => {
        const normalized = normalizeFileName(file);
        if (normalized) out.push(normalized);
      });
      return out;
    }

    toArray(dataTransfer.items).forEach((item) => {
      if (String(item?.kind || "") !== "file") return;
      const file = item.getAsFile?.();
      const normalized = normalizeFileName(file);
      if (normalized) out.push(normalized);
    });

    return out;
  }

  function canHandleFileDrag(event) {
    const types = toArray(event?.dataTransfer?.types).map((t) => String(t || ""));
    return types.includes("Files");
  }

  function ensureInfoNode(input) {
    const wrapper = input?.parentElement;
    if (!wrapper) return null;

    let node = wrapper.querySelector("[data-anexos-assist-msg]");
    if (!node) {
      node = document.createElement("small");
      node.className = "anexos-assist-msg";
      node.setAttribute("data-anexos-assist-msg", "1");
      input.insertAdjacentElement("afterend", node);
    }
    return node;
  }

  function showInfo(input, text, isError = false) {
    const node = ensureInfoNode(input);
    if (!node) return;
    const value = String(text || "").trim();
    node.textContent = value;
    node.classList.toggle("is-error", Boolean(isError && value));
    node.hidden = !value;
  }

  function updateCountLabel(input) {
    const total = Number(input?.files?.length || 0);
    if (!total) {
      showInfo(input, "");
      return;
    }
    showInfo(input, `${total} anexo(s) pronto(s) para envio.`);
  }

  function getMaxFiles(input) {
    if (!input?.multiple) return 1;
    const raw = Number(input?.dataset?.maxFiles || "");
    if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
    return MAX_FILES_DEFAULT;
  }

  function mergeIntoInput(input, newFiles) {
    if (!input || !newFiles.length) return { added: 0, ignored: 0 };
    if (typeof DataTransfer === "undefined") {
      showInfo(input, "Seu navegador nao suporta adicionar anexos por cola/arrastar.", true);
      return { added: 0, ignored: newFiles.length };
    }

    const maxFiles = getMaxFiles(input);
    const existing = toArray(input.files);
    const dt = new DataTransfer();
    const accepted = [];
    const errors = [];

    existing.forEach((file) => accepted.push(file));

    newFiles.forEach((file) => {
      if (!(file instanceof File)) return;
      if (!isAcceptedByInput(file, input)) {
        errors.push(`Arquivo nao permitido: ${file.name || "sem nome"}.`);
        return;
      }
      if ((Number(file.size) || 0) > MAX_SIZE_BYTES) {
        errors.push(`Arquivo acima de 10MB: ${file.name || "sem nome"}.`);
        return;
      }
      accepted.push(file);
    });

    const limited = accepted.slice(0, maxFiles);
    const ignoredByLimit = Math.max(0, accepted.length - limited.length);
    limited.forEach((file) => dt.items.add(file));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    const added = Math.max(0, limited.length - existing.length);
    const ignored = errors.length + ignoredByLimit;

    if (errors.length) {
      showInfo(input, errors[0], true);
      return { added, ignored };
    }
    if (ignoredByLimit > 0) {
      showInfo(input, `Limite de ${maxFiles} anexos por envio.`, true);
      return { added, ignored };
    }

    if (added > 0) {
      showInfo(input, `${added} anexo(s) adicionado(s).`);
    }
    return { added, ignored };
  }

  function setupForm(form) {
    if (!(form instanceof HTMLFormElement)) return;
    if (form.dataset.anexosAssistReady === "1") return;

    const fileInput = form.querySelector("input[type='file'][name='anexos']");
    if (!(fileInput instanceof HTMLInputElement)) return;

    form.dataset.anexosAssistReady = "1";
    let dragDepth = 0;

    fileInput.addEventListener("change", () => {
      updateCountLabel(fileInput);
    });

    toArray(form.querySelectorAll("textarea")).forEach((textarea) => {
      textarea.addEventListener("paste", (event) => {
        const files = extractFilesFromDataTransfer(event.clipboardData);
        if (!files.length) return;
        event.preventDefault();
        mergeIntoInput(fileInput, files);
      });
    });

    form.addEventListener("dragenter", (event) => {
      if (!canHandleFileDrag(event)) return;
      event.preventDefault();
      dragDepth += 1;
      form.classList.add("anexos-drop-active");
    });

    form.addEventListener("dragover", (event) => {
      if (!canHandleFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    });

    form.addEventListener("dragleave", (event) => {
      if (!canHandleFileDrag(event)) return;
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) form.classList.remove("anexos-drop-active");
    });

    form.addEventListener("drop", (event) => {
      if (!canHandleFileDrag(event)) return;
      event.preventDefault();
      dragDepth = 0;
      form.classList.remove("anexos-drop-active");
      const files = extractFilesFromDataTransfer(event.dataTransfer);
      if (!files.length) return;
      mergeIntoInput(fileInput, files);
    });
  }

  function init() {
    toArray(document.querySelectorAll("form")).forEach((form) => setupForm(form));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
