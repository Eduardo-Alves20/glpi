function normalizarTexto(value = "", max = 80) {
  return String(value || "").trim().slice(0, max);
}

export function resolverDestinatarioNotificacoes(usuarioSessao) {
  if (!usuarioSessao) return null;

  const perfil = normalizarTexto(usuarioSessao.perfil, 20).toLowerCase();
  const idBase = normalizarTexto(usuarioSessao.id);
  const tecnicoId = normalizarTexto(usuarioSessao.tecnicoId);

  if (!idBase && !tecnicoId) return null;

  if (perfil === "tecnico") {
    return { tipo: "tecnico", id: tecnicoId || idBase };
  }

  if (perfil === "admin") {
    return { tipo: "admin", id: idBase };
  }

  return { tipo: "usuario", id: idBase };
}

export function obterTiposIgnoradosNotificacoes(usuarioSessao) {
  const perfil = normalizarTexto(usuarioSessao?.perfil, 20).toLowerCase();
  if (perfil === "tecnico" || perfil === "admin") {
    return ["atribuido"];
  }
  return [];
}
