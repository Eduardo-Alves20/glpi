function escapeHtml(s="") {
  return s.replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function toast({ titulo, mensagem, url }) {
  const el = document.createElement("div");
  el.className = "toast-notif";
  el.innerHTML = `
    <div class="toast-title">${escapeHtml(titulo)}</div>
    <div class="toast-msg">${escapeHtml(mensagem)}</div>
  `;
  el.addEventListener("click", () => window.location.assign(url));
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("show"), 10);
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 200);
  }, 6000);
}

async function apiGet(url) {
  const r = await fetch(url, { headers: { "Accept":"application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiPatch(url) {
  const r = await fetch(url, { method:"PATCH", headers: { "Accept":"application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export function startNotificacoesPoll({ perfil }) {
  const badge = document.querySelector("#notifBadge");
  const bell = document.querySelector("#notifBell");
  const dropdown = document.querySelector("#notifDropdown");
  const mini = document.querySelector("#notifListMini");

  if (!badge || !bell || !dropdown || !mini) return;

  const keySince = "notif_since_v1";
  let since = localStorage.getItem(keySince) || new Date().toISOString();
  let initialized = false;

  bell.addEventListener("click", () => {
    dropdown.hidden = !dropdown.hidden;
  });

  async function atualizarBadge() {
    const { count } = await apiGet("/api/notificacoes/unread-count");
    if (count > 0) {
      badge.hidden = false;
      badge.textContent = String(count);
    } else {
      badge.hidden = true;
      badge.textContent = "0";
    }
  }

  function renderMini(itens) {
    if (!itens.length) {
      mini.innerHTML = `<div class="notif-empty">Sem notificações.</div>`;
      return;
    }
    mini.innerHTML = itens.slice(0, 10).map(n => `
      <a class="notif-item ${n.lidoEm ? "lida" : "nao-lida"}" href="${n.url}" data-id="${n._id}">
        <div class="notif-item-title">${escapeHtml(n.titulo)}</div>
        <div class="notif-item-msg">${escapeHtml(n.mensagem || "")}</div>
        <div class="notif-item-time">${new Date(n.criadoEm).toLocaleString()}</div>
      </a>
    `).join("");

    mini.querySelectorAll("a.notif-item").forEach(a => {
      a.addEventListener("click", async (e) => {
        const id = a.getAttribute("data-id");
        // marca como lida sem atrapalhar a navegação
        if (id) { try { await apiPatch(`/api/notificacoes/${id}/lida`); } catch {} }
      });
    });
  }

  async function loop() {
    try {
      // pega novas
      const data = await apiGet(`/api/notificacoes?since=${encodeURIComponent(since)}&limit=20`);
      const novos = data.itens || [];
      // atualiza since (serverNow dá menos “deriva”)
      since = data.serverNow || new Date().toISOString();
      localStorage.setItem(keySince, since);

      // toast pros NÃO lidos novos
      if (initialized) {
        novos
          .filter(n => !n.lidoEm)
          .reverse()
          .forEach(n => toast({ titulo: n.titulo, mensagem: n.mensagem, url: n.url }));
      }
      initialized = true;

      // badge + dropdown (últimas)
      await atualizarBadge();
      const ultimas = await apiGet(`/api/notificacoes?limit=10`);
      renderMini(ultimas.itens || []);

    } catch (e) {
      // silencioso (não spammar console em prod)
    } finally {
      setTimeout(loop, 3500);
    }
  }

  // start
  atualizarBadge().catch(()=>{});
  loop();
}
