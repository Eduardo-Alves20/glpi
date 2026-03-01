async function apiGet(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function setText(el, value) {
  if (!el) return;
  el.textContent = String(value ?? "0");
}

function aplicarResumo(data = {}, { usuariosEl, tecnicosEl, painel }) {
  setText(usuariosEl, Number(data?.usuariosOnline || 0));
  setText(tecnicosEl, Number(data?.tecnicosOnline || 0));
  if (painel) painel.hidden = false;
}

(function startPresencaOnline() {
  const body = document.body;
  const perfil = String(body?.dataset?.perfil || "").toLowerCase();
  if (!body || (perfil !== "tecnico" && perfil !== "admin")) return;

  const usuariosEl = document.querySelector('[data-hook="online-usuarios"]');
  const tecnicosEl = document.querySelector('[data-hook="online-tecnicos"]');
  const painel = document.querySelector('[data-hook="online-painel"]');
  if (!usuariosEl || !tecnicosEl || !painel) return;

  let timer = null;
  let ultimaAtualizacaoMs = 0;

  async function atualizarResumoViaHttp() {
    try {
      const data = await apiGet("/api/presenca/online");
      aplicarResumo(data, { usuariosEl, tecnicosEl, painel });
      ultimaAtualizacaoMs = Date.now();
    } catch {
      // silencioso
    } finally {
      timer = setTimeout(atualizarResumoViaHttp, 30000);
    }
  }

  function onPresenceSnapshot(ev) {
    const data = ev?.detail || {};
    aplicarResumo(data, { usuariosEl, tecnicosEl, painel });
    ultimaAtualizacaoMs = Date.now();
  }

  function onVisibilityChange() {
    if (document.hidden) return;
    const passouMuitoTempo = (Date.now() - ultimaAtualizacaoMs) > 15000;
    if (passouMuitoTempo) {
      void atualizarResumoViaHttp();
    }
  }

  window.addEventListener("glpi:presence-snapshot", onPresenceSnapshot);
  document.addEventListener("visibilitychange", onVisibilityChange);

  void atualizarResumoViaHttp();

  window.addEventListener("beforeunload", () => {
    if (timer) clearTimeout(timer);
    window.removeEventListener("glpi:presence-snapshot", onPresenceSnapshot);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  });
})();
