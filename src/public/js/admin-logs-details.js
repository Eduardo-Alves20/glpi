document.addEventListener("DOMContentLoaded", () => {
  const modal = document.getElementById("logs-details-modal");
  const dataEl = document.getElementById("logs-details-data");
  const openButtons = Array.from(document.querySelectorAll(".logs-open-details"));
  const openRows = Array.from(document.querySelectorAll(".logs-details-row[data-log-index]"));
  const closeTop = document.getElementById("logs-details-close");
  const closeBottom = document.getElementById("logs-details-close-bottom");

  if (!modal || !dataEl || (!openButtons.length && !openRows.length)) return;

  let logs = [];
  try {
    logs = JSON.parse(dataEl.textContent || "[]");
  } catch {
    logs = [];
  }

  const refs = {
    id: document.getElementById("ld-id"),
    quando: document.getElementById("ld-quando"),
    nivel: document.getElementById("ld-nivel"),
    modulo: document.getElementById("ld-modulo"),
    evento: document.getElementById("ld-evento"),
    acao: document.getElementById("ld-acao"),
    resultado: document.getElementById("ld-resultado"),
    usuarioLogin: document.getElementById("ld-usuario-login"),
    usuarioNome: document.getElementById("ld-usuario-nome"),
    usuarioPerfil: document.getElementById("ld-usuario-perfil"),
    loginTentativa: document.getElementById("ld-login-tentativa"),
    alvoTipo: document.getElementById("ld-alvo-tipo"),
    alvoId: document.getElementById("ld-alvo-id"),
    rota: document.getElementById("ld-rota"),
    metodo: document.getElementById("ld-metodo"),
    ip: document.getElementById("ld-ip"),
    ua: document.getElementById("ld-ua"),
    tags: document.getElementById("ld-tags"),
    mensagem: document.getElementById("ld-mensagem"),
    meta: document.getElementById("ld-meta"),
    chamadoLink: document.getElementById("ld-chamado-link"),
  };

  const txt = (value) => {
    const s = String(value ?? "").trim();
    return s || "-";
  };

  const formatDate = (value) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return txt(value);
    return d.toLocaleString("pt-BR");
  };

  const fill = (id, value) => {
    const el = refs[id];
    if (!el) return;
    el.textContent = txt(value);
  };

  const open = () => {
    modal.hidden = false;
    document.body.classList.add("logs-modal-open");
  };

  const close = () => {
    modal.hidden = true;
    document.body.classList.remove("logs-modal-open");
  };

  const bind = (button, fn) => {
    button?.addEventListener("click", fn);
  };

  const isInteractiveTarget = (target, container = null) => {
    if (!(target instanceof Element)) return false;
    const interactive = target.closest("a,button,input,select,textarea,label,[role='button']");
    if (!interactive) return false;
    if (container && interactive === container) return false;
    return true;
  };

  const applyData = (detail = {}) => {
    fill("id", detail?.id);
    fill("quando", formatDate(detail?.criadoEm));
    fill("nivel", detail?.nivel);
    fill("modulo", detail?.modulo);
    fill("evento", detail?.evento);
    fill("acao", detail?.acao);
    fill("resultado", detail?.resultado);
    fill("usuarioLogin", detail?.usuario?.login);
    fill("usuarioNome", detail?.usuario?.nome);
    fill("usuarioPerfil", detail?.usuario?.perfil);
    fill("loginTentativa", detail?.loginTentativa);
    fill("alvoTipo", detail?.alvo?.tipo);
    fill("alvoId", detail?.alvo?.id);
    fill("rota", detail?.req?.rota);
    fill("metodo", detail?.req?.metodo);
    fill("ip", detail?.req?.ip);
    fill("ua", detail?.req?.userAgent);
    fill("tags", Array.isArray(detail?.tags) && detail.tags.length ? detail.tags.join(", ") : "-");
    fill("mensagem", detail?.mensagem);
    fill("meta", detail?.meta);

    if (refs.chamadoLink) {
      const url = String(detail?.chamadoUrl || "").trim();
      if (url) {
        refs.chamadoLink.hidden = false;
        refs.chamadoLink.setAttribute("href", url);
      } else {
        refs.chamadoLink.hidden = true;
        refs.chamadoLink.setAttribute("href", "#");
      }
    }
  };

  const openByIndex = (idxRaw) => {
    const idx = Number.parseInt(String(idxRaw || "-1"), 10);
    const detail = Number.isFinite(idx) && idx >= 0 ? logs[idx] : null;
    applyData(detail || {});
    open();
  };

  openButtons.forEach((btn) => {
    btn.addEventListener("click", () => openByIndex(btn.dataset.logIndex));
  });

  openRows.forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.defaultPrevented) return;
      if (isInteractiveTarget(event.target, row)) return;
      openByIndex(row.dataset.logIndex);
    });

    row.addEventListener("keydown", (event) => {
      if (event.defaultPrevented) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      if (isInteractiveTarget(event.target, row)) return;
      event.preventDefault();
      openByIndex(row.dataset.logIndex);
    });
  });

  bind(closeTop, close);
  bind(closeBottom, close);

  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) close();
  });
});
