function normalizarDadosUsuario(payload = {}) {
  return {
    nome: String(payload.nome || "").trim(),
    usuario: String(payload.usuario || "").trim().toLowerCase(),
    email: String(payload.email || "").trim().toLowerCase(),
    perfil: String(payload.perfil || "").trim(),
    status: String(payload.status || "ativo").trim(),
    senhaTemporaria: String(payload.senhaTemporaria || "").trim(),
    senhaTemporariaConfirmacao: String(payload.senhaTemporariaConfirmacao || "").trim(),
  };
}

function normalizarPerfisPermitidos(allowedProfiles = []) {
  const lista = Array.isArray(allowedProfiles)
    ? allowedProfiles.map((p) => String(p || "").trim().toLowerCase()).filter(Boolean)
    : [];
  if (!lista.length) return ["admin", "tecnico", "usuario"];
  return [...new Set(lista)];
}

function validarBaseUsuario(
  payload,
  { exigirSenhaTemporaria = true, allowedProfiles = ["admin", "tecnico", "usuario"] } = {},
) {
  const erros = [];
  const dados = normalizarDadosUsuario(payload);
  const perfisPermitidos = normalizarPerfisPermitidos(allowedProfiles);

  if (dados.nome.length < 3) erros.push("Nome completo e obrigatorio.");

  if (!/^[a-z0-9._-]{3,40}$/.test(dados.usuario)) {
    erros.push("Usuario invalido (use letras, numeros, ponto e underscore de 3 a 40 chars).");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) {
    erros.push("E-mail invalido.");
  }

  if (!perfisPermitidos.includes(dados.perfil)) {
    erros.push("Perfil invalido.");
  }

  if (!['ativo', 'bloqueado'].includes(dados.status)) {
    erros.push("Status invalido.");
  }

  if (exigirSenhaTemporaria) {
    if (dados.senhaTemporaria.length < 8) {
      erros.push("Senha temporaria deve ter no minimo 8 caracteres.");
    }

    if (!dados.senhaTemporariaConfirmacao) {
      erros.push("Confirme a senha temporaria.");
    } else if (dados.senhaTemporaria !== dados.senhaTemporariaConfirmacao) {
      erros.push("Confirmacao da senha temporaria nao confere.");
    }
  } else {
    const informouSenha = Boolean(dados.senhaTemporaria || dados.senhaTemporariaConfirmacao);

    if (informouSenha) {
      if (dados.senhaTemporaria.length < 8) {
        erros.push("Se informar senha, use no minimo 8 caracteres.");
      }
      if (!dados.senhaTemporariaConfirmacao) {
        erros.push("Confirme a nova senha.");
      } else if (dados.senhaTemporaria !== dados.senhaTemporariaConfirmacao) {
        erros.push("Confirmacao da nova senha nao confere.");
      }
    }
  }

  return {
    ok: erros.length === 0,
    erros,
    valores: {
      nome: dados.nome,
      usuario: dados.usuario,
      email: dados.email,
      perfil: dados.perfil,
      status: dados.status,
    },
    senhaTemporaria: dados.senhaTemporaria,
  };
}

export function validarNovoUsuario(payload, { allowedProfiles } = {}) {
  return validarBaseUsuario(payload, {
    exigirSenhaTemporaria: true,
    allowedProfiles,
  });
}

export function validarAtualizacaoUsuario(payload, { allowedProfiles } = {}) {
  return validarBaseUsuario(payload, {
    exigirSenhaTemporaria: false,
    allowedProfiles,
  });
}
