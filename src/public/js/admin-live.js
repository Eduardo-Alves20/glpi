function text(el, value) {
  if (!el) return;
  el.textContent = String(value ?? 0);
}

function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));
}

function formatDateBr(isoOrDate) {
  try {
    return new Date(isoOrDate).toLocaleString("pt-BR");
  } catch {
    return "-";
  }
}

async function apiGet(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function renderLogs(logs = []) {
  const list = document.querySelector('[data-hook="admin-logs-list"]');
  const badge = document.querySelector('[data-hook="admin-logs-count"]');
  if (!list) return;
  if (badge) badge.textContent = String(logs.length || 0);

  if (!logs.length) {
    list.innerHTML = '<li class="empty">Nenhum log ainda.</li>';
    return;
  }

  list.innerHTML = logs.slice(0, 5).map((l) => `
    <li>
      <div class="highlight-title">${escapeHtml(l.titulo || "Evento do sistema")}</div>
      <div class="highlight-meta">
        <span class="highlight-status">${escapeHtml(l.tipo || "INFO")}</span>
        <span class="highlight-date">${escapeHtml(l.quando || "-")}</span>
      </div>
    </li>
  `).join("");
}

function renderChamados(chamados = []) {
  const list = document.querySelector('[data-hook="admin-chamados-list"]');
  if (!list) return;
  if (!chamados.length) {
    list.innerHTML = '<li class="empty">Nenhum chamado ainda.</li>';
    return;
  }

  list.innerHTML = chamados.slice(0, 5).map((c) => `
    <li class="clickable">
      <div class="highlight-title">#${escapeHtml(c.numero || "-")} - ${escapeHtml(c.titulo || "(sem titulo)")}</div>
      <div class="highlight-meta">
        <span class="highlight-status">${escapeHtml(c.status || "-")}</span>
        <span class="highlight-user">${escapeHtml(c.solicitante || "-")}</span>
        <span class="highlight-date">${escapeHtml(c.quando || "-")}</span>
      </div>
    </li>
  `).join("");
}

function renderUsuarios(usuarios = []) {
  const list = document.querySelector('[data-hook="admin-usuarios-list"]');
  if (!list) return;
  if (!usuarios.length) {
    list.innerHTML = '<li class="empty">Nenhum usuario criado ainda.</li>';
    return;
  }

  list.innerHTML = usuarios.slice(0, 5).map((u) => `
    <li>
      <div class="highlight-title">${escapeHtml(u.nome || "-")}</div>
      <div class="highlight-meta">
        <span class="highlight-status">${escapeHtml(u.perfil || "-")}</span>
        <span class="highlight-date">${escapeHtml(u.quando || "-")}</span>
      </div>
    </li>
  `).join("");
}

function renderKpis(kpis = {}) {
  text(document.querySelector('[data-hook="kpi-abertos"]'), kpis.chamadosAbertos);
  text(document.querySelector('[data-hook="kpi-criticos"]'), kpis.chamadosCriticos);
  text(document.querySelector('[data-hook="kpi-aguardando"]'), kpis.aguardandoTecnico);
  text(document.querySelector('[data-hook="kpi-hoje"]'), kpis.criadosHoje);

  text(document.querySelector('[data-hook="metric-chamados-abertos"]'), kpis.chamadosAbertos);
  text(document.querySelector('[data-hook="metric-chamados-andamento"]'), kpis.emAndamento);
  text(document.querySelector('[data-hook="metric-chamados-aguardando"]'), kpis.aguardandoUsuario);
  text(document.querySelector('[data-hook="metric-chamados-sla"]'), kpis.vencendoSla);

  text(document.querySelector('[data-hook="metric-usuarios-total"]'), kpis.totalUsuarios);
  text(document.querySelector('[data-hook="metric-usuarios-tecnicos"]'), kpis.totalTecnicos);
  text(document.querySelector('[data-hook="metric-usuarios-admins"]'), kpis.totalAdmins);
  text(document.querySelector('[data-hook="metric-usuarios-bloqueados"]'), kpis.usuariosBloqueados);
}

(function startAdminLive() {
  const body = document.body;
  const perfil = String(body?.dataset?.perfil || "");
  const path = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
  if (!body || perfil !== "admin" || path !== "/admin") return;

  const lastUpdateEl = document.querySelector("#last-update");
  let since = new Date(Date.now() - 10000).toISOString();

  async function loop() {
    try {
      const data = await apiGet(`/api/admin/home?since=${encodeURIComponent(since)}`);
      since = data.serverTime || new Date().toISOString();

      if (lastUpdateEl) {
        lastUpdateEl.textContent = `Atualizado em: ${formatDateBr(data.serverTime || new Date())}`;
      }

      if (data.changed) {
        renderKpis(data.kpis || {});
        renderLogs(data.logs || []);
        renderChamados(data.ultimosChamados || []);
        renderUsuarios(data.ultimosUsuarios || []);
      }
    } catch (_) {
      // silencioso
    }

    setTimeout(loop, 5000);
  }

  loop();
})();
