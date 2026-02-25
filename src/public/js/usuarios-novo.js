(() => {
  const nomeEl = document.getElementById("nome");
  const usuarioEl = document.getElementById("usuario");
  if (!nomeEl || !usuarioEl) return;

  // Evita sobrescrever quando o admin editar manualmente
  let manualOverride = false;
  let debounceId = null;

  // Cria um "alert" acima do campo usuário
  const wrapper = usuarioEl.closest(".form-field") || usuarioEl.parentElement;
  let alertEl = null;

  function ensureAlert() {
    if (alertEl) return alertEl;
    alertEl = document.createElement("div");
    alertEl.className = "login-sugestao-alert";
    alertEl.style.display = "none";
    // insere antes do label/input
    wrapper.insertBefore(alertEl, wrapper.firstChild);
    return alertEl;
  }

  function showAlert(html) {
    const el = ensureAlert();
    el.innerHTML = html;
    el.style.display = "block";
  }

  function hideAlert() {
    if (!alertEl) return;
    alertEl.style.display = "none";
    alertEl.innerHTML = "";
  }

  usuarioEl.addEventListener("input", () => {
    // se o cara mexeu no usuário, assume controle manual
    manualOverride = usuarioEl.value.trim().length > 0;
    hideAlert();
  });

  async function buscarSugestoes(nome) {
    const form = nomeEl.closest("form");
    const action = String(form?.getAttribute("action") || "").trim();
    const base = action.startsWith("/tecnico/usuarios")
      ? "/tecnico/usuarios"
      : "/admin/usuarios";
    const url = `${base}/sugerir-login?nome=${encodeURIComponent(nome)}`;
    const resp = await fetch(url, { headers: { Accept: "application/json" } });
    if (!resp.ok) return [];
    const data = await resp.json();
    if (!data || !data.ok) return [];
    return Array.isArray(data.sugestoes) ? data.sugestoes : [];
  }

  async function sugerir() {
    const nome = nomeEl.value.trim();
    if (!nome) {
      hideAlert();
      if (!manualOverride) usuarioEl.value = "";
      return;
    }

    let sugestoes = [];
    try {
      sugestoes = await buscarSugestoes(nome);
    } catch (e) {
      // falha silenciosa (mas você pode logar se quiser)
      return;
    }

    if (!sugestoes.length) {
      hideAlert();
      return;
    }

    // Preenche automaticamente só se não houve override manual
    if (!manualOverride) {
      usuarioEl.value = sugestoes[0];
    }

    // Mostra alerta acima do campo
    const lista = sugestoes.slice(0, 5).join(", ");
    showAlert(
      `<strong>Sugestão de login:</strong> <code>${sugestoes[0]}</code>
       <span style="opacity:.8"> • alternativas: ${lista}</span>
       <div style="opacity:.75;margin-top:6px;font-size:12px">Você pode editar o login se quiser.</div>`
    );
  }

  function agendarSugestao() {
    clearTimeout(debounceId);
    debounceId = setTimeout(sugerir, 250);
  }

  nomeEl.addEventListener("input", agendarSugestao);
  nomeEl.addEventListener("blur", sugerir);
})();
