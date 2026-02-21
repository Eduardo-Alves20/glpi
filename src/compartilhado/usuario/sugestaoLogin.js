import { acharPorUsuarioOuEmail } from "../../repos/usuariosRepo.js";

function normalizarToken(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "") // allowlist
    .trim();
}

function extrairPartesNome(nomeCompleto) {
  const limpo = String(nomeCompleto || "")
    .trim()
    .replace(/\s+/g, " ");

  const partes = limpo.split(" ").filter(Boolean);
  return partes;
}

async function usuarioExiste(login) {
  const r = await acharPorUsuarioOuEmail(login);
  return !!r;
}

/**
 * Gera uma lista de sugestões disponíveis.
 * Regra: primeira letra do primeiro nome + último sobrenome;
 * fallback: primeira letra + sobrenomes anteriores;
 * fallback final: sufixo numérico.
 */
export async function sugerirLoginsDisponiveis(nomeCompleto, maxSugestoes = 5) {
  const partes = extrairPartesNome(nomeCompleto);
  if (partes.length === 0) return [];

  const primeiroNome = normalizarToken(partes[0]);
  if (!primeiroNome) return [];

  const inicial = primeiroNome[0];

  // sobrenomes em ordem reversa (último -> primeiro)
  const sobrenomes = partes.slice(1).map(normalizarToken).filter(Boolean).reverse();

  const candidatos = [];
  if (sobrenomes.length === 0) {
    // sem sobrenome: usa só inicial + nome
    candidatos.push(normalizarToken(inicial + primeiroNome));
  } else {
    for (const s of sobrenomes) {
      candidatos.push(normalizarToken(inicial + s));
    }
  }

  // remove duplicados mantendo ordem
  const uniq = [...new Set(candidatos)].filter(Boolean);

  const disponiveis = [];
  for (const c of uniq) {
    if (disponiveis.length >= maxSugestoes) break;
    if (!(await usuarioExiste(c))) disponiveis.push(c);
  }

  // fallback: sufixo numérico no "primeiro candidato natural"
  const base = uniq[0] || normalizarToken(inicial + (sobrenomes[0] || primeiroNome));
  if (base) {
    let n = 2;
    while (disponiveis.length < maxSugestoes && n < 200) {
      const cand = `${base}${n}`;
      // eslint-disable-next-line no-await-in-loop
      if (!(await usuarioExiste(cand))) disponiveis.push(cand);
      n += 1;
    }
  }

  return disponiveis;
}