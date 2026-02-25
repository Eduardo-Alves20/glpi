function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  }[c]));
}

const TOAST_DURATION_MS = 10000;

function obterWrapToasts() {
  let wrap = document.querySelector("#notif-toast-wrap");
  if (wrap) return wrap;

  wrap = document.createElement("div");
  wrap.id = "notif-toast-wrap";
  document.body.appendChild(wrap);
  return wrap;
}

function toast({ titulo, mensagem, url }) {
  const el = document.createElement("div");
  el.className = "toast-notif";
  el.innerHTML = `
    <div class="toast-title">${escapeHtml(titulo)}</div>
    <div class="toast-msg">${escapeHtml(mensagem)}</div>
  `;
  el.addEventListener("click", () => window.location.assign(url || "/notificacoes"));
  obterWrapToasts().appendChild(el);
  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 200);
  }, TOAST_DURATION_MS);
}

async function apiPatch(url) {
  const r = await fetch(url, { method: "PATCH", headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiGet(url) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function wsEndpoint() {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws/notificacoes`;
}

export function startNotificacoesPoll() {
  const badge = document.querySelector("#notifBadge");
  const bell = document.querySelector("#notifBell");
  const dropdown = document.querySelector("#notifDropdown");
  const mini = document.querySelector("#notifListMini");

  if (!badge || !bell || !dropdown || !mini) return;
  const wsSuportado = typeof window.WebSocket !== "undefined";

  let socket = null;
  let reconnectTimer = null;
  let httpFallbackTimer = null;
  let syncTimer = null;
  let reconnectDelayMs = 1000;
  let inicializado = false;
  let naoLidasConhecidas = new Set();
  let ultimoSnapshotMs = 0;
  let httpSyncEmAndamento = false;

  bell.addEventListener("click", () => {
    dropdown.hidden = !dropdown.hidden;
  });

  function atualizarBadge(count = 0) {
    const qtd = Math.max(0, Number(count) || 0);
    if (qtd > 0) {
      bell.hidden = false;
      badge.hidden = false;
      badge.textContent = String(qtd);
      return;
    }

    bell.hidden = true;
    dropdown.hidden = true;
    badge.hidden = true;
    badge.textContent = "0";
  }

  function marcarNotificacaoLida(id) {
    const notifId = String(id || "").trim();
    if (!notifId) return;

    apiPatch(`/api/notificacoes/${encodeURIComponent(notifId)}/lida`)
      .then(() => {
        if (wsSuportado && socket && socket.readyState === window.WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "sync" }));
          return;
        }
        sincronizarViaHttp();
      })
      .catch(() => {});
  }

  function renderMini(itens = []) {
    const lista = Array.isArray(itens) ? itens : [];
    if (!lista.length) {
      mini.innerHTML = `<div class="notif-empty">Sem notificacoes.</div>`;
      return;
    }

    mini.innerHTML = lista.slice(0, 10).map((n) => `
      <a class="notif-item ${n.lidoEm ? "lida" : "nao-lida"}" href="${n.url || "/notificacoes"}" data-id="${String(n._id || "")}">
        <div class="notif-item-title">${escapeHtml(n.titulo || "Notificacao")}</div>
        <div class="notif-item-msg">${escapeHtml(n.mensagem || "")}</div>
        <div class="notif-item-time">${n.criadoEm ? new Date(n.criadoEm).toLocaleString() : "-"}</div>
      </a>
    `).join("");

    mini.querySelectorAll("a.notif-item").forEach((a) => {
      a.addEventListener("click", () => {
        marcarNotificacaoLida(a.getAttribute("data-id"));
      });
    });
  }

  function timestampSnapshot(payload = {}) {
    const tsServer = Date.parse(String(payload?.serverNow || ""));
    if (Number.isFinite(tsServer)) return tsServer;

    const itens = Array.isArray(payload?.itens) ? payload.itens : [];
    const maxItemTs = itens.reduce((acc, item) => {
      const ts = Date.parse(String(item?.criadoEm || ""));
      if (!Number.isFinite(ts)) return acc;
      return ts > acc ? ts : acc;
    }, 0);

    return maxItemTs || Date.now();
  }

  function tratarSnapshot(payload = {}) {
    const snapshotTs = timestampSnapshot(payload);
    if (snapshotTs < ultimoSnapshotMs) return;
    ultimoSnapshotMs = snapshotTs;

    const itens = Array.isArray(payload.itens) ? payload.itens : [];
    const unreadCount = Math.max(0, Number(payload.unreadCount || 0));
    atualizarBadge(unreadCount);
    renderMini(itens);

    const atuaisNaoLidas = itens
      .filter((n) => !n?.lidoEm)
      .map((n) => String(n?._id || ""))
      .filter(Boolean);

    const novos = itens
      .filter((n) => !n?.lidoEm)
      .filter((n) => {
        const id = String(n?._id || "");
        return Boolean(id) && !naoLidasConhecidas.has(id);
      });

    if (inicializado) {
      novos
        .reverse()
        .forEach((n) => toast({
          titulo: String(n?.titulo || "Notificacao"),
          mensagem: String(n?.mensagem || ""),
          url: String(n?.url || "/notificacoes"),
        }));
    }

    inicializado = true;
    naoLidasConhecidas = new Set(atuaisNaoLidas);
  }

  function agendarReconexao() {
    if (!wsSuportado) return;
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      conectar();
    }, reconnectDelayMs);
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, 15000);
  }

  async function sincronizarViaHttp() {
    if (httpSyncEmAndamento) return;
    httpSyncEmAndamento = true;
    try {
      const [countRes, ultimasRes] = await Promise.all([
        apiGet("/api/notificacoes/unread-count"),
        apiGet("/api/notificacoes?limit=20"),
      ]);

      tratarSnapshot({
        type: "snapshot",
        unreadCount: Number(countRes?.count || 0),
        itens: Array.isArray(ultimasRes?.itens) ? ultimasRes.itens : [],
      });
    } catch {
      // silencioso
    } finally {
      httpSyncEmAndamento = false;
    }
  }

  function agendarFallbackHttp() {
    if (httpFallbackTimer) return;
    httpFallbackTimer = setInterval(() => {
      const socketAberto = wsSuportado && socket && socket.readyState === window.WebSocket.OPEN;
      if (socketAberto) return;
      sincronizarViaHttp();
    }, 5000);
  }

  function agendarSyncPeriodico() {
    if (syncTimer) return;
    syncTimer = setInterval(() => {
      const socketAberto = wsSuportado && socket && socket.readyState === window.WebSocket.OPEN;
      if (socketAberto) {
        try {
          socket.send(JSON.stringify({ type: "sync" }));
        } catch {
          // noop
        }
      }
      sincronizarViaHttp();
    }, 15000);
  }

  function conectar() {
    if (!wsSuportado) return;

    try {
      socket = new window.WebSocket(wsEndpoint());
    } catch {
      agendarReconexao();
      return;
    }

    socket.addEventListener("open", () => {
      reconnectDelayMs = 1000;
      try {
        socket.send(JSON.stringify({ type: "sync" }));
      } catch {
        // noop
      }
    });

    socket.addEventListener("message", (ev) => {
      let data = null;
      try {
        data = JSON.parse(String(ev?.data || ""));
      } catch {
        data = null;
      }
      if (data?.type === "snapshot") {
        tratarSnapshot(data);
      }
    });

    socket.addEventListener("close", () => {
      agendarReconexao();
    });

    socket.addEventListener("error", () => {
      try {
        socket.close();
      } catch {
        // noop
      }
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (wsSuportado && socket && socket.readyState === window.WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type: "sync" }));
      } catch {
        sincronizarViaHttp();
      }
      return;
    }
    sincronizarViaHttp();
  });

  conectar();
  agendarFallbackHttp();
  agendarSyncPeriodico();
  sincronizarViaHttp();
}
