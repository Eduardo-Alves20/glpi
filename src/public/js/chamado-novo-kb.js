(function startChamadoNovoKb() {
  const tituloEl = document.getElementById("titulo");
  const descricaoEl = document.getElementById("descricao");
  const stateEl = document.getElementById("kbSuggestState");
  const listEl = document.getElementById("kbSuggestList");
  const refsInput = document.getElementById("kbRefsInput");

  if (!tituloEl || !descricaoEl || !stateEl || !listEl || !refsInput) return;

  const refs = new Set();
  let timer = null;
  let ultimoTexto = "";

  function escapeHtml(valor = "") {
    return String(valor || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[c]));
  }

  function atualizarRefsInput() {
    refsInput.value = Array.from(refs).join(",");
  }

  function isDarkThemeActive() {
    try {
      const saved = String(localStorage.getItem("glpi-theme") || "").trim().toLowerCase();
      if (saved === "dark") return true;
      if (saved === "light") return false;
    } catch {}

    if (document.documentElement.classList.contains("dark-mode")) return true;
    if (document.body && document.body.classList.contains("dark-mode")) return true;

    try {
      return Boolean(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch {
      return false;
    }
  }

  async function confirmarResolucao() {
    if (typeof window.Swal === "undefined") {
      return window.confirm(
        "Perfeito. Se ja resolveu, vamos voltar para seus chamados sem abrir um novo registro.",
      );
    }

    const dark = isDarkThemeActive();
    const result = await window.Swal.fire({
      icon: "question",
      title: "Ja resolveu?",
      text: "Se ja resolveu, vamos voltar para seus chamados sem abrir um novo registro.",
      showCancelButton: true,
      confirmButtonText: "Sim, resolveu",
      cancelButtonText: "Continuar aqui",
      reverseButtons: true,
      confirmButtonColor: "#3b82f6",
      cancelButtonColor: dark ? "#334155" : "#1f5f94",
      background: dark ? "#111c2d" : undefined,
      color: dark ? "#e2ebf8" : undefined,
    });

    return Boolean(result?.isConfirmed);
  }

  async function registrarEvento({ acao, slug = "", contexto = "chamado_novo" } = {}) {
    try {
      await fetch("/api/base-conhecimento/evento", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          acao,
          slug,
          origem: "form_chamado_novo",
          contexto,
        }),
      });
    } catch {}
  }

  function marcarRef(slug = "") {
    const key = String(slug || "").trim().toLowerCase();
    if (!key) return;
    refs.add(key);
    atualizarRefsInput();
  }

  function obterConsulta() {
    const titulo = String(tituloEl.value || "").trim();
    const descricao = String(descricaoEl.value || "").trim();
    return `${titulo} ${descricao}`.trim();
  }

  function renderVazio(msg) {
    listEl.innerHTML = "";
    listEl.hidden = true;
    stateEl.hidden = false;
    stateEl.textContent = msg;
  }

  function montarPassos(passos = []) {
    if (!Array.isArray(passos) || !passos.length) return "";
    const itens = passos
      .slice(0, 4)
      .map((p) => `<li>${escapeHtml(p)}</li>`)
      .join("");
    return `<ul class="kb-card__steps">${itens}</ul>`;
  }

  function renderItens(itens = []) {
    if (!Array.isArray(itens) || !itens.length) {
      renderVazio("Nenhuma sugestao encontrada para esse texto. Voce pode abrir o chamado normalmente.");
      return;
    }

    listEl.innerHTML = itens.map((item) => {
      const slug = String(item?.slug || "");
      const titulo = escapeHtml(item?.titulo || "Guia sem titulo");
      const categoria = escapeHtml(item?.categoria || "Geral");
      const resumo = escapeHtml(item?.resumo || "");
      const url = escapeHtml(item?.url || "/base-conhecimento");
      return `
        <article class="kb-card" data-kb-slug="${escapeHtml(slug)}">
          <div class="kb-card__top">
            <span class="kb-card__tag">${categoria}</span>
            <strong class="kb-card__title">${titulo}</strong>
          </div>
          <p class="kb-card__summary">${resumo}</p>
          ${montarPassos(item?.passos)}
          <div class="kb-card__actions">
            <a class="btn btn--ghost kb-open-link" href="${url}" target="_blank" rel="noopener" data-kb-open="${escapeHtml(slug)}">Ver guia</a>
            <button class="btn btn--primary kb-resolve-btn" type="button" data-kb-resolve="${escapeHtml(slug)}">Isso resolveu</button>
          </div>
        </article>
      `;
    }).join("");

    stateEl.hidden = true;
    listEl.hidden = false;

    listEl.querySelectorAll("[data-kb-open]").forEach((el) => {
      el.addEventListener("click", () => {
        const slug = String(el.getAttribute("data-kb-open") || "").trim().toLowerCase();
        if (!slug) return;
        marcarRef(slug);
        registrarEvento({ acao: "abrir_artigo", slug });
      });
    });

    listEl.querySelectorAll("[data-kb-resolve]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const slug = String(btn.getAttribute("data-kb-resolve") || "").trim().toLowerCase();
        if (slug) marcarRef(slug);

        const confirmou = await confirmarResolucao();
        if (!confirmou) return;

        await registrarEvento({ acao: "resolveu_sem_chamado", slug });
        window.location.assign("/chamados/meus");
      });
    });
  }

  async function buscarSugestoes() {
    const consulta = obterConsulta();
    if (consulta.length < 12) {
      renderVazio("Digite titulo e descricao com mais detalhes para sugerirmos artigos.");
      return;
    }

    if (consulta === ultimoTexto) return;
    ultimoTexto = consulta;

    stateEl.hidden = false;
    stateEl.textContent = "Buscando sugestoes na base de conhecimento...";
    listEl.hidden = true;

    try {
      const resp = await fetch(`/api/base-conhecimento/sugestoes?q=${encodeURIComponent(consulta)}&limit=5`, {
        headers: { Accept: "application/json" },
      });
      const data = await resp.json();
      const itens = Array.isArray(data?.itens) ? data.itens : [];

      if (itens.length > 0) {
        const topSlug = String(itens[0]?.slug || "").trim().toLowerCase();
        if (topSlug) {
          registrarEvento({ acao: "sugestao_exibida", slug: topSlug });
        }
      }

      renderItens(itens);
    } catch {
      renderVazio("Falha ao buscar sugestoes agora. Voce pode abrir o chamado normalmente.");
    }
  }

  function agendarBusca() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(buscarSugestoes, 380);
  }

  tituloEl.addEventListener("input", agendarBusca);
  descricaoEl.addEventListener("input", agendarBusca);

  agendarBusca();
})();
