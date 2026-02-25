function text(el, value) {
  if (!el) return;
  el.textContent = String(value ?? 0);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

async function apiGet(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function renderKpis(kpis = {}) {
  text(document.querySelector('[data-hook="user-total"]'), kpis.total);
  text(document.querySelector('[data-hook="user-abertos"]'), kpis.abertos);
  text(document.querySelector('[data-hook="user-em-andamento"]'), kpis.emAndamento);
  text(document.querySelector('[data-hook="user-aguardando"]'), kpis.aguardando);
  text(document.querySelector('[data-hook="user-fechados"]'), kpis.fechados);
}

function renderChamados(chamados = []) {
  const list = document.querySelector('[data-hook="user-chamados-list"]');
  if (!list) return;

  if (!chamados.length) {
    list.innerHTML = '<li class="empty">Nenhum chamado ainda.</li>';
    return;
  }

  list.innerHTML = chamados.slice(0, 5).map((c) => `
    <li class="clickable">
      <a class="highlight-link" href="/chamados/${escapeHtml(c.chamadoId || "")}">
        <div class="highlight-title">#${escapeHtml(c.numero || "-")} - ${escapeHtml(c.titulo || "(sem titulo)")}</div>
        <div class="highlight-meta">
          <span class="highlight-status">${escapeHtml(c.statusLabel || c.status || "-")}</span>
          <span class="highlight-date">${escapeHtml(c.quando || "-")}</span>
        </div>
      </a>
    </li>
  `).join("");
}

(function startUsuarioLive() {
  const body = document.body;
  const path = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
  if (!body || (path !== "/usuario" && path !== "/usuario/home")) return;

  let since = new Date(Date.now() - 10000).toISOString();

  async function loop() {
    try {
      const data = await apiGet(`/api/usuario/inbox?since=${encodeURIComponent(since)}`);
      since = data.serverTime || new Date().toISOString();

      renderKpis(data.kpis || {});
      renderChamados(data.meus || []);
    } catch (_) {
      // silencioso
    }

    setTimeout(loop, 5000);
  }

  loop();
})();
