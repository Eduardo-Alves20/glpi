(function () {
  if (typeof window === "undefined") return;
  if (typeof window.Swal === "undefined") return;

  // =========================
  // 1) Preferência: FLASH server-side (req.session.flash)
  // =========================
  const flash = window.__FLASH__;
  if (flash && typeof flash === "object") {
    const tipo = String(flash.tipo || "info").toLowerCase();
    const mensagem = String(flash.mensagem || "").slice(0, 300); // limite defensivo

    const icon =
      tipo === "success" ? "success" :
      tipo === "error" ? "error" :
      tipo === "warning" ? "warning" : "info";

    const title =
      icon === "success" ? "Sucesso" :
      icon === "error" ? "Erro" :
      icon === "warning" ? "Aviso" : "Informação";

    if (mensagem) {
      Swal.fire({
        icon,
        title,
        text: mensagem,
        confirmButtonText: "OK",
      });
    }

    // evita repetir caso a view seja re-hidratada por algum motivo
    try { delete window.__FLASH__; } catch (_) { window.__FLASH__ = null; }
    return;
  }

  // =========================
  // 2) Fallback: querystring (?ok=1 / ?err=...)
  //    )
  // =========================
  const params = new URLSearchParams(window.location.search);

  // sucesso genérico
  if (params.get("ok") === "1") {
    Swal.fire({
      icon: "success",
      title: "Sucesso",
      text: "Chamado registrado com sucesso.",
      confirmButtonText: "OK",
    }).then(() => {
      params.delete("ok");
      const url = window.location.pathname + (params.toString() ? `?${params}` : "");
      window.history.replaceState({}, "", url);
    });
    return;
  }

  // erro genérico
  if (params.get("err")) {
    // sanitiza e limita mensagem (evita URL gigante / abuso)
    const msg = String(params.get("err") || "").slice(0, 200);

    Swal.fire({
      icon: "error",
      title: "Erro",
      text: msg || "Ocorreu um erro.",
      confirmButtonText: "OK",
    }).then(() => {
      params.delete("err");
      const url = window.location.pathname + (params.toString() ? `?${params}` : "");
      window.history.replaceState({}, "", url);
    });
  }
})();
