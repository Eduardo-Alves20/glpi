function intValido(valor, fallback) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

export function normalizarPaginacao(
  dados = {},
  {
    pageDefault = 1,
    limitDefault = 10,
    pageMin = 1,
    pageMax = 100000,
    limitMin = 5,
    limitMax = 200,
  } = {},
) {
  const pageRaw = intValido(dados.page, pageDefault);
  const limitRaw = intValido(dados.limit, limitDefault);

  const page = Math.max(pageMin, Math.min(pageRaw, pageMax));
  const limit = Math.max(limitMin, Math.min(limitRaw, limitMax));

  return { page, limit };
}

export function criarMetaPaginacao(total, { page = 1, limit = 10 } = {}) {
  const totalSeguro = Math.max(0, intValido(total, 0));
  const limitSeguro = Math.max(1, intValido(limit, 10));

  const pages = Math.max(1, Math.ceil(totalSeguro / limitSeguro));
  const pageAtual = Math.min(Math.max(1, intValido(page, 1)), pages);

  const from = totalSeguro === 0 ? 0 : ((pageAtual - 1) * limitSeguro) + 1;
  const to = totalSeguro === 0 ? 0 : Math.min(pageAtual * limitSeguro, totalSeguro);

  return {
    total: totalSeguro,
    page: pageAtual,
    pages,
    limit: limitSeguro,
    from,
    to,
    hasPrev: pageAtual > 1,
    hasNext: pageAtual < pages,
    prevPage: Math.max(1, pageAtual - 1),
    nextPage: Math.min(pages, pageAtual + 1),
    offset: (pageAtual - 1) * limitSeguro,
  };
}

export function paginarLista(itens, { page = 1, limit = 10 } = {}) {
  const lista = Array.isArray(itens) ? itens : [];
  const meta = criarMetaPaginacao(lista.length, { page, limit });

  const itensPagina = lista.slice(meta.offset, meta.offset + meta.limit);
  return {
    ...meta,
    itens: itensPagina,
  };
}
