function text(el, value) {
  if (!el) return;
  el.textContent = String(value ?? 0);
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
    path === "/tecnico/chamados" || path === "/tecnico/meus-chamados";
  let since = new Date(Date.now() - 15000).toISOString();
  const reloadKey = `tecnico_live_reload_${path}`;

  async function loop() {
    try {
      const data = await apiGet(`/api/tecnico/inbox?since=${encodeURIComponent(since)}`);
      since = data.serverTime || new Date().toISOString();
      if (data.kpis) updateHomeKpis(data.kpis);

      if (data.changed && isListaTecnico) {
        const marker = String(data.lastChangeAt || "");
        const lastReloadMarker = sessionStorage.getItem(reloadKey) || "";
        if (marker && marker !== lastReloadMarker) {
          sessionStorage.setItem(reloadKey, marker);
          window.location.reload();
          return;
        }
      }
    } catch (_) {
      // silencioso
    }

    setTimeout(loop, 4000);
  }

  loop();
})();
