(function () {
  if (typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);

  // sucesso genérico
  if (params.get("ok") === "1") {
    Swal.fire({
      icon: "success",
      title: "Sucesso",
      text: "Chamado registrado com sucesso.",
      confirmButtonText: "OK",
    }).then(() => {
      // limpa querystring pra não repetir ao dar refresh
      params.delete("ok");
      const url = window.location.pathname + (params.toString() ? `?${params}` : "");
      window.history.replaceState({}, "", url);
    });
    return;
  }

  // erro genérico (não coloque stacktrace aqui)
  if (params.get("err")) {
    const msg = params.get("err");
    Swal.fire({
      icon: "error",
      title: "Erro",
      text: msg,
      confirmButtonText: "OK",
    }).then(() => {
      params.delete("err");
      const url = window.location.pathname + (params.toString() ? `?${params}` : "");
      window.history.replaceState({}, "", url);
    });
  }
})();
