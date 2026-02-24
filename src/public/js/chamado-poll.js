import { beepCooldown, playBeep, escapeHtml } from "/js/polling.js";
import { toast } from "/js/toast.js";

function isoNowMinus(seconds) {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

function getAutorId(h) {
  // historico.meta.autor pode ter tecnicoId (ObjectId) ou usuarioId (ObjectId)
  const a = h?.meta?.autor || {};
  const tec = a.tecnicoId ? String(a.tecnicoId) : "";
  const usu = a.usuarioId ? String(a.usuarioId) : "";
  return tec || usu || "";
}

export function startChamadoPoll({
  chamadoId,
  viewerId,
  intervalMs = 1000,
  // ✅ recomendado: só alertar (toast/beep) se a aba estiver em background
  notifyOnlyWhenHidden = true,
} = {}) {
  if (!chamadoId) {
    console.error("[poll] chamadoId ausente");
    return;
  }

  const viewer = String(viewerId || "").trim();

  // janela maior pra não perder eventos
  let since = isoNowMinus(15);

  const poll = async () => {
    try {
      const url = `/api/chamados/${encodeURIComponent(chamadoId)}/poll?since=${encodeURIComponent(since)}`;
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) return;

      const data = await r.json();
      if (!data.changed) return;

      since = data.updatedAt || new Date().toISOString();

      // Atualiza badge do status (se existir)
      const badge = document.querySelector("[data-status-badge]");
      if (badge && data.status) badge.textContent = data.status;

      const chat = document.querySelector("[data-chat-wrap]");
      const novas = Array.isArray(data.novasInteracoes) ? data.novasInteracoes : [];
      if (!chat || !novas.length) return;

      // injeta TODAS as interações (inclusive as próprias)
      for (const h of novas) {
        const autor = h?.meta?.autor?.nome || h?.meta?.autor?.login || h?.por || "sistema";
        const tipo = h?.tipo || "evento";
        const em = h?.em ? new Date(h.em).toLocaleString("pt-BR") : "";
        const msg = h?.mensagem || "—";

        const item = document.createElement("div");
        item.className = "msg";
        item.innerHTML = `
          <div class="msg-top">
            <span class="msg-author">${escapeHtml(autor)}</span>
            <span class="msg-type">${escapeHtml(tipo)}</span>
            <span class="msg-time">${escapeHtml(em)}</span>
          </div>
          <div class="msg-body">${escapeHtml(msg)}</div>
        `;
        chat.appendChild(item);
      }
      chat.scrollTop = chat.scrollHeight;

      // ✅ decide se deve alertar (somente se veio algo de OUTRA pessoa)
      const temDeOutraPessoa = novas.some((h) => {
        const autorId = getAutorId(h);
        return autorId && viewer && autorId !== viewer;
      });

      if (!temDeOutraPessoa) return;

      if (notifyOnlyWhenHidden && !document.hidden) return;

      if (beepCooldown()) {
        playBeep();
        toast({
          title: "Nova atualização no chamado",
          message: "Há novas mensagens/alterações.",
          href: window.location.pathname,
        });
      }
    } catch (e) {
      console.error("[poll] erro", e);
    }
  };

  poll();
  setInterval(poll, Math.max(600, Number(intervalMs) || 1000));
}