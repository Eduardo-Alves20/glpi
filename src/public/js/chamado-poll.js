import { beepCooldown, playBeep, escapeHtml } from "/js/polling.js";
import { toast } from "/js/toast.js";

function getAutorId(h) {
  const a = h?.meta?.autor || {};
  const tec = a.tecnicoId ? String(a.tecnicoId) : "";
  const usu = a.usuarioId ? String(a.usuarioId) : "";
  return tec || usu || "";
}

function formatBytes(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function extArquivo(nome = "") {
  const s = String(nome || "").trim().toLowerCase();
  const i = s.lastIndexOf(".");
  if (i <= 0 || i === s.length - 1) return "";
  return s.slice(i);
}

function getAnexoExt(a) {
  return (
    extArquivo(a?.extensao) ||
    extArquivo(a?.nomeOriginal) ||
    extArquivo(a?.nomeArmazenado)
  );
}

function isImageAnexo(a) {
  const mime = String(a?.mimeType || "").toLowerCase();
  const ext = getAnexoExt(a);
  if (mime.startsWith("image/")) return true;
  return [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext);
}

function isPdfAnexo(a) {
  const mime = String(a?.mimeType || "").toLowerCase();
  const ext = getAnexoExt(a);
  return mime === "application/pdf" || ext === ".pdf";
}

function renderAnexosHtml(anexos = []) {
  if (!Array.isArray(anexos) || !anexos.length) return "";

  return `
    <div class="anexos">
      ${anexos
        .map((a) => {
          const id = encodeURIComponent(String(a?.id || ""));
          const nome = escapeHtml(String(a?.nomeOriginal || "anexo"));
          const isImg = isImageAnexo(a);
          const isPdf = isPdfAnexo(a);
          const size = escapeHtml(formatBytes(a?.tamanhoBytes));

          return `
            <div class="anexo-item">
              <a class="anexo-link" href="/anexos/${id}" target="_blank" rel="noopener">
                <strong>${nome}</strong>
                <span>${size}</span>
              </a>
              ${isImg ? `<img class="anexo-preview-img" src="/anexos/${id}" alt="${nome}" loading="lazy" />` : ""}
              ${isPdf ? `<iframe class="anexo-preview-pdf" src="/anexos/${id}#view=FitH" title="${nome}"></iframe>` : ""}
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

export function startChamadoPoll({
  chamadoId,
  viewerId,
  intervalMs = 1000,
  notifyOnlyWhenHidden = true,
} = {}) {
  if (!chamadoId) {
    console.error("[poll] chamadoId ausente");
    return;
  }

  const viewer = String(viewerId || "").trim();
  let since = new Date().toISOString();

  const poll = async () => {
    try {
      const url = `/api/chamados/${encodeURIComponent(chamadoId)}/poll?since=${encodeURIComponent(since)}`;
      const r = await fetch(url, { headers: { Accept: "application/json" } });
      if (!r.ok) return;

      const data = await r.json();
      if (!data.changed) return;

      since = data.updatedAt || new Date().toISOString();

      const badge = document.querySelector("[data-status-badge]");
      if (badge && data.status) badge.textContent = data.status;

      const chat = document.querySelector("[data-chat-wrap]");
      const novas = Array.isArray(data.novasInteracoes) ? data.novasInteracoes : [];
      if (!chat || !novas.length) return;

      for (const h of novas) {
        const autor = h?.meta?.autor?.nome || h?.meta?.autor?.login || h?.por || "sistema";
        const tipo = h?.tipo || "evento";
        const em = h?.em ? new Date(h.em).toLocaleString("pt-BR") : "";
        const msg = h?.mensagem || "-";
        const anexos = Array.isArray(h?.meta?.anexos) ? h.meta.anexos : [];

        const item = document.createElement("div");
        item.className = "msg";
        item.innerHTML = `
          <div class="msg-top">
            <span class="msg-author">${escapeHtml(autor)}</span>
            <span class="msg-type">${escapeHtml(tipo)}</span>
            <span class="msg-time">${escapeHtml(em)}</span>
          </div>
          <div class="msg-body">${escapeHtml(msg)}</div>
          ${renderAnexosHtml(anexos)}
        `;
        chat.appendChild(item);
      }
      chat.scrollTop = chat.scrollHeight;

      const temDeOutraPessoa = novas.some((h) => {
        const autorId = getAutorId(h);
        return autorId && viewer && autorId !== viewer;
      });

      if (!temDeOutraPessoa) return;
      if (notifyOnlyWhenHidden && !document.hidden) return;

      if (beepCooldown()) {
        playBeep();
        toast({
          title: "Nova atualizacao no chamado",
          message: "Ha novas mensagens ou alteracoes.",
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
