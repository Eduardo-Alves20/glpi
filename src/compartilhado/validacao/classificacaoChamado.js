const TIPOS_ALLOWED = ["categoria", "prioridade"];

function limparTexto(valor) {
  return String(valor ?? "").trim();
}

function parseAtivo(valor) {
  if (typeof valor === "boolean") return valor;

  const texto = limparTexto(valor).toLowerCase();
  if (!texto || texto === "ativo" || texto === "1" || texto === "true") return true;
  if (texto === "inativo" || texto === "0" || texto === "false") return false;
  return null;
}

function normalizarDados(payload = {}) {
  const ordemRaw = limparTexto(payload.ordem);
  const ordemNum = ordemRaw === "" ? 100 : Number(ordemRaw);
  const ativo = parseAtivo(payload.status ?? payload.ativo);

  return {
    tipo: limparTexto(payload.tipo).toLowerCase(),
    nome: limparTexto(payload.nome),
    chave: limparTexto(payload.chave).toLowerCase(),
    ordemRaw,
    ordemNum,
    ativo,
  };
}

export function validarClassificacaoChamado(payload) {
  const dados = normalizarDados(payload);
  const erros = [];

  if (!TIPOS_ALLOWED.includes(dados.tipo)) {
    erros.push("Tipo invalido.");
  }

  if (dados.nome.length < 2 || dados.nome.length > 60) {
    erros.push("Nome deve ter entre 2 e 60 caracteres.");
  }

  if (dados.chave && dados.chave.length > 60) {
    erros.push("Chave muito grande.");
  }

  if (!dados.ordemRaw) {
    // ordem padrao
  } else if (!Number.isFinite(dados.ordemNum)) {
    erros.push("Ordem invalida.");
  } else if (dados.ordemNum < 0 || dados.ordemNum > 9999) {
    erros.push("Ordem deve ser entre 0 e 9999.");
  }

  if (dados.ativo === null) {
    erros.push("Status invalido.");
  }

  return {
    ok: erros.length === 0,
    erros,
    valores: {
      tipo: dados.tipo,
      nome: dados.nome,
      chave: dados.chave,
      ordem: Number.isFinite(dados.ordemNum) ? Math.trunc(dados.ordemNum) : 100,
      ativo: dados.ativo === null ? true : dados.ativo,
      status: dados.ativo === false ? "inativo" : "ativo",
    },
  };
}

