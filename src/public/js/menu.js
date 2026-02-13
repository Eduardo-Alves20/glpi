(function () {
  const collapseBtn = document.getElementById("sidebar-collapse-toggle");
  const profileBtn = document.getElementById("profile-menu-button");
  const profileDrop = document.getElementById("profile-dropdown");

  // Accordion: abre/fecha ao clicar nos blocos que têm <p class="accordion-main-item">
  document.querySelectorAll(".main-anchor-wrapper").forEach((wrap) => {
    const clickable = wrap.querySelector("p.accordion-main-item");
    const content = wrap.querySelector(".accordion-content");
    if (!clickable || !content) return;

    clickable.addEventListener("click", () => {
      wrap.classList.toggle("open");
    });
  });

  // Colapsar sidebar (desktop)
  if (collapseBtn) {
    collapseBtn.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-collapsed");
      // você pode salvar preferencia depois em localStorage
    });
  }

  // Dropdown do perfil
  if (profileBtn && profileDrop) {
    profileBtn.addEventListener("click", () => {
      const aberto = profileDrop.classList.toggle("open");
      profileBtn.setAttribute("aria-expanded", String(aberto));
      profileDrop.setAttribute("aria-hidden", String(!aberto));
    });

    document.addEventListener("click", (e) => {
      const alvo = e.target;
      if (!profileDrop.contains(alvo) && !profileBtn.contains(alvo)) {
        profileDrop.classList.remove("open");
        profileBtn.setAttribute("aria-expanded", "false");
        profileDrop.setAttribute("aria-hidden", "true");
      }
    });
  }
})();
