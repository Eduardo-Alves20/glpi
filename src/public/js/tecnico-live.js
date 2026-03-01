function text(el, value) {
  if (!el) return;
  el.textContent = String(value ?? 0);
}

function isInteractiveElement(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "a,button,input,select,textarea,label,summary,details,form,[role='button'],[data-row-ignore]",
    ),
  );
}

function navigateToRow(row) {
  let href = String(row.getAttribute("data-row-href") || "").trim();
  if (!href) return;
  const hasDoubleQuotes = href.startsWith("\"") && href.endsWith("\"");
  const hasSingleQuotes = href.startsWith("'") && href.endsWith("'");
  if (hasDoubleQuotes || hasSingleQuotes) href = href.slice(1, -1).trim();
  if (!href) return;
  window.location.assign(href);
}

function enableClickableRows(root = document) {
  const rows = root.querySelectorAll("[data-row-href]");
  rows.forEach((row) => {
    if (!(row instanceof HTMLElement)) return;
    if (row.dataset.rowClickableReady === "1") return;

    row.dataset.rowClickableReady = "1";
    row.classList.add("table-row-clickable");
    if (!row.hasAttribute("tabindex")) row.tabIndex = 0;
    if (!row.hasAttribute("role")) row.setAttribute("role", "link");

    row.addEventListener("click", (event) => {
      if (event.defaultPrevented) return;
      if (isInteractiveElement(event.target)) return;
      navigateToRow(row);
    });

    row.addEventListener("keydown", (event) => {
      if (event.defaultPrevented) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      if (isInteractiveElement(event.target)) return;
      event.preventDefault();
      navigateToRow(row);
    });
  });
}

async function apiGet(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function updateHomeKpis(kpis = {}) {
  text(document.querySelector('[data-hook="kpi-abertos"]'), kpis.chamadosAbertos);
  text(document.querySelector('[data-hook="kpi-em-atendimento"]'), kpis.emAtendimento);
  text(document.querySelector('[data-hook="kpi-aguardando-usuario"]'), kpis.aguardandoUsuario);
  text(document.querySelector('[data-hook="kpi-fila-geral"]'), kpis.filaGeral);
  text(document.querySelector('[data-hook="kpi-criticos"]'), kpis.chamadosCriticos);
  text(document.querySelector('[data-hook="kpi-criados-hoje"]'), kpis.criadosHoje);

  const filaBadge = document.querySelector('[data-hook="fila-count"]');
  if (filaBadge) {
    const total = Number(kpis.filaGeral || 0);
    filaBadge.textContent = String(total);
    filaBadge.hidden = total <= 0;
  }
}

(function startTecnicoLive() {
  const body = document.body;
  const perfil = String(body?.dataset?.perfil || "");
  if (!body || (perfil !== "tecnico" && perfil !== "admin")) return;

  const path = window.location.pathname;
  const isListaTecnico =
    path === "/tecnico/chamados" ||
    path === "/tecnico/meus-chamados" ||
    path === "/tecnico/historico-chamados";
  const POLL_INTERVAL_MS = 6000;
  let since = new Date(Date.now() - 15000).toISOString();
  let listaSyncInFlight = false;

  async function sincronizarListaTecnico() {
    if (!isListaTecnico || listaSyncInFlight) return;
    listaSyncInFlight = true;
    try {
      const url = `${window.location.pathname}${window.location.search || ""}`;
      const resp = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "text/html" },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const html = await resp.text();
      const doc = new DOMParser().parseFromString(html, "text/html");

      const novoCardTabela = doc.querySelector(".chamados-table-card");
      const cardTabelaAtual = document.querySelector(".chamados-table-card");
      if (novoCardTabela && cardTabelaAtual) {
        cardTabelaAtual.replaceWith(novoCardTabela);
        enableClickableRows(novoCardTabela);
      }

      const novaPaginacao = doc.querySelector("[data-pagination]");
      const paginacaoAtual = document.querySelector("[data-pagination]");
      if (novaPaginacao && paginacaoAtual) {
        paginacaoAtual.replaceWith(novaPaginacao);
      }

      const novoResumo = doc.querySelector(".chamados-summary-line");
      const resumoAtual = document.querySelector(".chamados-summary-line");
      if (novoResumo && resumoAtual) {
        resumoAtual.replaceWith(novoResumo);
      }
    } finally {
      listaSyncInFlight = false;
    }
  }

  async function loop() {
    try {
      const data = await apiGet(`/api/tecnico/inbox?since=${encodeURIComponent(since)}`);
      since = data.serverTime || new Date().toISOString();
      if (data.kpis) updateHomeKpis(data.kpis);

      if (data.changed && isListaTecnico) {
        await sincronizarListaTecnico();
      }
    } catch (_) {
      // silencioso
    }

    setTimeout(loop, POLL_INTERVAL_MS);
  }

  loop();
})();
