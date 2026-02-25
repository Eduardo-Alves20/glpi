(function () {
  if (typeof window === "undefined") return;
  if (typeof window.Swal === "undefined") return;

  function isDarkThemeActive() {
    try {
      const saved = String(localStorage.getItem("glpi-theme") || "").trim().toLowerCase();
      if (saved === "dark") return true;
      if (saved === "light") return false;
    } catch {}

    if (document.documentElement.classList.contains("dark-mode")) return true;
    if (document.body && document.body.classList.contains("dark-mode")) return true;

    try {
      return Boolean(
        window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches,
      );
    } catch {
      return false;
    }
  }

  function withTheme(options) {
    if (!isDarkThemeActive()) return options;

    return {
      ...options,
      background: options.background || "#111c2d",
      color: options.color || "#e2ebf8",
      confirmButtonColor: options.confirmButtonColor || "#3b82f6",
      cancelButtonColor: options.cancelButtonColor || "#334155",
    };
  }

  const flash = window.__FLASH__;
  if (flash && typeof flash === "object") {
    const tipo = String(flash.tipo || "info").toLowerCase();
    const mensagem = String(flash.mensagem || "").slice(0, 300);

    const icon =
      tipo === "success"
        ? "success"
        : tipo === "error"
          ? "error"
          : tipo === "warning"
            ? "warning"
            : "info";

    const title =
      icon === "success"
        ? "Sucesso"
        : icon === "error"
          ? "Erro"
          : icon === "warning"
            ? "Aviso"
            : "Informacao";

    if (mensagem) {
      Swal.fire(
        withTheme({
          icon,
          title,
          text: mensagem,
          confirmButtonText: "OK",
        }),
      );
    }

    try {
      delete window.__FLASH__;
    } catch {
      window.__FLASH__ = null;
    }
    return;
  }

  const params = new URLSearchParams(window.location.search);

  if (params.get("ok") === "1") {
    Swal.fire(
      withTheme({
        icon: "success",
        title: "Sucesso",
        text: "Chamado registrado com sucesso.",
        confirmButtonText: "OK",
      }),
    ).then(() => {
      params.delete("ok");
      const url = window.location.pathname + (params.toString() ? `?${params}` : "");
      window.history.replaceState({}, "", url);
    });
    return;
  }

  if (params.get("err")) {
    const msg = String(params.get("err") || "").slice(0, 200);

    Swal.fire(
      withTheme({
        icon: "error",
        title: "Erro",
        text: msg || "Ocorreu um erro.",
        confirmButtonText: "OK",
      }),
    ).then(() => {
      params.delete("err");
      const url = window.location.pathname + (params.toString() ? `?${params}` : "");
      window.history.replaceState({}, "", url);
    });
  }
})();
