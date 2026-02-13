export function validarNovoUsuario(payload) {
  const erros = [];

  const nome = (payload.nome || "").trim();
  const usuario = (payload.usuario || "").trim().toLowerCase();
  const email = (payload.email || "").trim().toLowerCase();
  const perfil = (payload.perfil || "").trim();
  const status = (payload.status || "ativo").trim();
  const senhaTemporaria = (payload.senhaTemporaria || "").trim();

  if (nome.length < 3) erros.push("Nome completo é obrigatório.");
  if (!/^[a-z0-9._-]{3,40}$/.test(usuario))
    erros.push("Usuário inválido (use letras/números/ponto/underscore e 3–40 chars).");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    erros.push("E-mail inválido.");

  if (!["admin", "tecnico", "usuario"].includes(perfil))
    erros.push("Perfil inválido.");

  if (!["ativo", "bloqueado"].includes(status))
    erros.push("Status inválido.");

  if (senhaTemporaria.length < 8)
    erros.push("Senha temporária deve ter no mínimo 8 caracteres.");

  return {
    ok: erros.length === 0,
    erros,
    valores: { nome, usuario, email, perfil, status },
    senhaTemporaria,
  };
}
