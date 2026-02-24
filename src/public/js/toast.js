let wrap = null;

function ensureWrap() {
  if (wrap) return wrap;
  wrap = document.createElement("div");
  wrap.id = "toast-wrap";
  document.body.appendChild(wrap);
  return wrap;
}

function escapeHtml(s = "") {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

export function toast({ title, message, href = null, timeout = 6000 } = {}) {
  const host = ensureWrap();
  const el = document.createElement("div");
  el.className = "toast";

  el.innerHTML = `
    <div class="toast-title">${escapeHtml(title || "Notificação")}</div>
    <div class="toast-msg">${escapeHtml(message || "")}</div>
    ${href ? `<div class="toast-link">Abrir</div>` : ""}
  `;

  if (href) {
    el.classList.add("clickable");
    el.addEventListener("click", () => window.location.assign(href));
  }

  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));

  const close = () => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 180);
  };

  const t = setTimeout(close, timeout);
  el.addEventListener("mouseenter", () => clearTimeout(t));
  el.addEventListener("mouseleave", () => setTimeout(close, 1200));
}