(function () {
  const THEME_KEY = "glpi-theme";

  const collapseBtn = document.getElementById("sidebar-collapse-toggle");
  const profileBtn = document.getElementById("profile-menu-button");
  const profileDrop = document.getElementById("profile-dropdown");
  const darkModeToggle = document.getElementById("darkmode-toggle");
  const root = document.documentElement;

  function temaPreferidoSistemaEscuro() {
    return Boolean(
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches,
    );
  }

  function atualizarRotuloDarkMode(escuroAtivo) {
    if (!darkModeToggle) return;
    darkModeToggle.setAttribute("aria-pressed", String(escuroAtivo));
    darkModeToggle.innerHTML = `<span>${escuroAtivo ? "Modo claro" : "Modo escuro"}</span>`;
  }

  function aplicarTema(tema, { persistir = true } = {}) {
    const escuroAtivo = tema === "dark";
    root.classList.toggle("dark-mode", escuroAtivo);
    document.body.classList.toggle("dark-mode", escuroAtivo);
    root.setAttribute("data-theme", escuroAtivo ? "dark" : "light");
    atualizarRotuloDarkMode(escuroAtivo);

    if (!persistir) return;
    try {
      localStorage.setItem(THEME_KEY, escuroAtivo ? "dark" : "light");
    } catch {}
  }

  function resolverTemaInicial() {
    try {
      const salvo = String(localStorage.getItem(THEME_KEY) || "").trim().toLowerCase();
      if (salvo === "dark" || salvo === "light") return salvo;
    } catch {}
    return temaPreferidoSistemaEscuro() ? "dark" : "light";
  }

  aplicarTema(resolverTemaInicial(), { persistir: false });

  if (darkModeToggle) {
    darkModeToggle.addEventListener("click", (event) => {
      event.preventDefault();
      const escuroAtivo = document.body.classList.contains("dark-mode");
      aplicarTema(escuroAtivo ? "light" : "dark", { persistir: true });
    });
  }

  try {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener?.("change", (ev) => {
      let salvo = "";
      try {
        salvo = String(localStorage.getItem(THEME_KEY) || "").trim().toLowerCase();
      } catch {}
      if (salvo === "dark" || salvo === "light") return;
      aplicarTema(ev.matches ? "dark" : "light", { persistir: false });
    });
  } catch {}

  // Accordion: abre/fecha ao clicar nos blocos que tem <p class="accordion-main-item">
  document.querySelectorAll(".main-anchor-wrapper").forEach((wrap) => {
    const clickable = wrap.querySelector("p.accordion-main-item");
    const content = wrap.querySelector(".accordion-content");
    if (!clickable || !content) return;

    clickable.addEventListener("click", () => {
      if (document.body.classList.contains("sidebar-collapsed")) {
        document.body.classList.remove("sidebar-collapsed");
        wrap.classList.add("open");
        return;
      }
      wrap.classList.toggle("open");
    });
  });

  // Colapsar sidebar (desktop)
  if (collapseBtn) {
    collapseBtn.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-collapsed");
    });
  }

  // Dropdown do perfil
  if (profileBtn && profileDrop) {
    profileBtn.addEventListener("click", () => {
      const aberto = profileDrop.classList.toggle("open");
      profileBtn.setAttribute("aria-expanded", String(aberto));
      profileDrop.setAttribute("aria-hidden", String(!aberto));
    });

    document.addEventListener("click", (event) => {
      const alvo = event.target;
      if (!profileDrop.contains(alvo) && !profileBtn.contains(alvo)) {
        profileDrop.classList.remove("open");
        profileBtn.setAttribute("aria-expanded", "false");
        profileDrop.setAttribute("aria-hidden", "true");
      }
    });
  }
})();
