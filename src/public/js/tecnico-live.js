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
  if (!body || body.dataset?.perfil !== "tecnico") return;

  const path = window.location.pathname;
  let since = new Date(Date.now() - 15000).toISOString();

  async function loop() {
    try {
      const data = await apiGet(`/api/tecnico/inbox?since=${encodeURIComponent(since)}`);
      since = data.serverTime || new Date().toISOString();
      if (data.kpis) updateHomeKpis(data.kpis);

      if (data.changed && (path.startsWith('/tecnico/chamados') || path.startsWith('/tecnico/meus-chamados'))) {
        window.location.reload();
        return;
      }
    } catch (_) {
      // silencioso
    }

    setTimeout(loop, 4000);
  }

  loop();
})();
