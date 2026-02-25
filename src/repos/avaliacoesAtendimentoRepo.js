import { pegarDb } from "../compartilhado/db/mongo.js";

const COL_AVALIACOES = "avaliacoes_atendimento";

let indicesPromise = null;

function col() {
  return pegarDb().collection(COL_AVALIACOES);
}

async function garantirIndices() {
  if (!indicesPromise) {
    indicesPromise = Promise.all([
      col().createIndex({ chamadoId: 1 }, { unique: true }),
      col().createIndex({ "tecnico.id": 1, atualizadoEm: -1 }),
      col().createIndex({ "avaliador.id": 1, atualizadoEm: -1 }),
      col().createIndex({ nota: -1, atualizadoEm: -1 }),
      col().createIndex({ atualizadoEm: -1 }),
    ]).catch((err) => {
      indicesPromise = null;
      throw err;
    });
  }
  return indicesPromise;
}

function texto(v, { max = 300, fallback = "" } = {}) {
  const s = String(v ?? "").trim();
  return (s || fallback).slice(0, max);
}

function inteiroPositivo(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const int = Math.floor(n);
  return int > 0 ? int : fallback;
}

function validarNota(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("Informe uma nota valida entre 1 e 5.");
  const nota = Math.round(n * 10) / 10;
  if (nota < 1 || nota > 5) throw new Error("Informe uma nota valida entre 1 e 5.");
  return nota;
}

function documentoAvaliacao({
  chamado = {},
  avaliador = {},
  nota,
  feedback = "",
  sugestao = "",
} = {}) {
  const chamadoId = texto(chamado?._id, { max: 120 });
  if (!chamadoId) throw new Error("Chamado invalido para avaliacao.");

  const tecnicoId = texto(chamado?.responsavelId, { max: 120 });
  if (!tecnicoId) {
    throw new Error("Nao ha tecnico responsavel para vincular esta avaliacao.");
  }

  const avaliadorId = texto(avaliador?.id, { max: 120 });
  if (!avaliadorId) throw new Error("Sessao invalida para avaliar.");

  return {
    chamadoId,
    chamado: {
      id: chamadoId,
      numero: inteiroPositivo(chamado?.numero, 0),
      titulo: texto(chamado?.titulo, { max: 180 }),
      status: texto(chamado?.status, { max: 40 }),
    },
    tecnico: {
      id: tecnicoId,
      nome: texto(chamado?.responsavelNome, { max: 140, fallback: "Tecnico" }),
      login: texto(chamado?.responsavelLogin, { max: 120 }),
    },
    avaliador: {
      id: avaliadorId,
      nome: texto(avaliador?.nome, { max: 140 }),
      login: texto(avaliador?.usuario, { max: 120 }),
      perfil: texto(avaliador?.perfil, { max: 40 }),
    },
    nota: validarNota(nota),
    feedback: texto(feedback, { max: 1500 }),
    sugestao: texto(sugestao, { max: 1500 }),
  };
}

function matchBuscaLivre(q = "") {
  const termo = texto(q, { max: 120 });
  if (!termo) return null;
  const rx = new RegExp(termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const or = [
    { "chamado.titulo": rx },
    { "avaliador.nome": rx },
    { "avaliador.login": rx },
    { "tecnico.nome": rx },
    { "tecnico.login": rx },
    { feedback: rx },
    { sugestao: rx },
  ];
  const numero = Number(termo);
  if (Number.isFinite(numero)) {
    or.push({ "chamado.numero": numero });
  }
  return {
    $or: or,
  };
}

function resolverRecorteDias(periodo = "") {
  const bruto = texto(periodo, { max: 20 }).toLowerCase();
  if (!bruto || bruto === "todos" || bruto === "all") return 0;
  if (bruto === "7") return 7;
  if (bruto === "30") return 30;
  if (bruto === "90") return 90;
  const n = Number(bruto);
  if (!Number.isFinite(n)) return 0;
  const dias = Math.floor(n);
  if (dias <= 0) return 0;
  return Math.min(dias, 3650);
}

function aplicarRecortePeriodo(query = {}, periodo = "") {
  const dias = resolverRecorteDias(periodo);
  if (!dias) return;
  const inicio = new Date(Date.now() - (dias * 24 * 60 * 60 * 1000));
  query.atualizadoEm = { $gte: inicio };
}

function aplicarNotaMin(query = {}, notaMinRaw = "") {
  const notaMin = Number(notaMinRaw);
  if (Number.isFinite(notaMin) && notaMin >= 1 && notaMin <= 5) {
    query.nota = { $gte: notaMin };
  }
}

export async function registrarOuAtualizarAvaliacao({
  chamado,
  avaliador,
  nota,
  feedback = "",
  sugestao = "",
} = {}) {
  await garantirIndices();
  const now = new Date();
  const doc = documentoAvaliacao({
    chamado,
    avaliador,
    nota,
    feedback,
    sugestao,
  });

  await col().updateOne(
    { chamadoId: doc.chamadoId },
    {
      $set: {
        ...doc,
        atualizadoEm: now,
      },
      $setOnInsert: {
        criadoEm: now,
      },
    },
    { upsert: true },
  );

  return col().findOne({ chamadoId: doc.chamadoId });
}

export async function acharAvaliacaoPorChamado(chamadoId) {
  await garantirIndices();
  const id = texto(chamadoId, { max: 120 });
  if (!id) return null;
  return col().findOne({ chamadoId: id });
}

export async function removerAvaliacaoPorChamado(chamadoId) {
  await garantirIndices();
  const id = texto(chamadoId, { max: 120 });
  if (!id) return { removidos: 0 };
  const out = await col().deleteOne({ chamadoId: id });
  return { removidos: Number(out?.deletedCount || 0) };
}

export async function moderarAvaliacaoPorChamado(
  chamadoId,
  {
    nota,
    feedback = "",
    sugestao = "",
    motivo = "",
    moderador = {},
  } = {},
) {
  await garantirIndices();
  const id = texto(chamadoId, { max: 120 });
  if (!id) throw new Error("Chamado invalido para moderacao da avaliacao.");

  const avaliacaoAtual = await col().findOne({ chamadoId: id });
  if (!avaliacaoAtual) throw new Error("Este chamado nao possui avaliacao para moderar.");

  const motivoTexto = texto(motivo, { max: 600 });
  if (motivoTexto.length < 8) {
    throw new Error("Informe um motivo com no minimo 8 caracteres para moderar a avaliacao.");
  }

  const now = new Date();
  const payloadModerador = {
    id: texto(moderador?.id, { max: 120 }),
    nome: texto(moderador?.nome, { max: 140 }),
    login: texto(moderador?.usuario || moderador?.login, { max: 120 }),
    perfil: texto(moderador?.perfil, { max: 40 }),
  };

  await col().updateOne(
    { chamadoId: id },
    {
      $set: {
        nota: validarNota(nota),
        feedback: texto(feedback, { max: 1500 }),
        sugestao: texto(sugestao, { max: 1500 }),
        atualizadoEm: now,
        moderacao: {
          editadaPorAdmin: true,
          editadaEm: now,
          motivo: motivoTexto,
          moderador: payloadModerador,
        },
      },
    },
  );

  return col().findOne({ chamadoId: id });
}

export async function obterResumoAvaliacoesTecnico(tecnicoId, { limit = 8 } = {}) {
  await garantirIndices();
  const id = texto(tecnicoId, { max: 120 });
  if (!id) {
    return { total: 0, media: 0, mediaTexto: "0.0/5", itens: [] };
  }

  const lim = Math.max(1, Math.min(inteiroPositivo(limit, 8), 40));
  const [total, dadosMedia, itens] = await Promise.all([
    col().countDocuments({ "tecnico.id": id }),
    col().aggregate([
      { $match: { "tecnico.id": id } },
      { $group: { _id: null, media: { $avg: "$nota" } } },
    ]).toArray(),
    col().find({ "tecnico.id": id })
      .project({
        nota: 1,
        feedback: 1,
        sugestao: 1,
        atualizadoEm: 1,
      })
      .sort({ atualizadoEm: -1 })
      .limit(lim)
      .toArray(),
  ]);

  const media = Number(dadosMedia?.[0]?.media || 0);
  return {
    total,
    media,
    mediaTexto: `${media.toFixed(1)}/5`,
    itens: (itens || []).map((item) => ({
      nota: Number(item?.nota || 0),
      feedback: texto(item?.feedback, { max: 1500 }),
      sugestao: texto(item?.sugestao, { max: 1500 }),
      atualizadoEm: item?.atualizadoEm || null,
    })),
  };
}

export async function obterResumoAvaliacoesGeral({ limit = 8 } = {}) {
  await garantirIndices();
  const lim = Math.max(1, Math.min(inteiroPositivo(limit, 8), 40));
  const [total, dadosMedia, itens] = await Promise.all([
    col().countDocuments({}),
    col().aggregate([
      { $group: { _id: null, media: { $avg: "$nota" } } },
    ]).toArray(),
    col().find({})
      .project({
        nota: 1,
        feedback: 1,
        sugestao: 1,
        atualizadoEm: 1,
        chamado: 1,
        avaliador: 1,
        tecnico: 1,
      })
      .sort({ atualizadoEm: -1 })
      .limit(lim)
      .toArray(),
  ]);

  const media = Number(dadosMedia?.[0]?.media || 0);
  return {
    total,
    media,
    mediaTexto: `${media.toFixed(1)}/5`,
    itens: itens || [],
  };
}

export async function obterResumoAvaliacoesDoUsuario(avaliadorId, { limit = 8 } = {}) {
  await garantirIndices();
  const id = texto(avaliadorId, { max: 120 });
  if (!id) {
    return { total: 0, media: 0, mediaTexto: "0.0/5", itens: [] };
  }

  const lim = Math.max(1, Math.min(inteiroPositivo(limit, 8), 40));
  const [total, dadosMedia, itens] = await Promise.all([
    col().countDocuments({ "avaliador.id": id }),
    col().aggregate([
      { $match: { "avaliador.id": id } },
      { $group: { _id: null, media: { $avg: "$nota" } } },
    ]).toArray(),
    col().find({ "avaliador.id": id })
      .project({
        nota: 1,
        feedback: 1,
        sugestao: 1,
        atualizadoEm: 1,
        chamado: 1,
        tecnico: 1,
      })
      .sort({ atualizadoEm: -1 })
      .limit(lim)
      .toArray(),
  ]);

  const media = Number(dadosMedia?.[0]?.media || 0);
  return {
    total,
    media,
    mediaTexto: `${media.toFixed(1)}/5`,
    itens: itens || [],
  };
}

export async function listarAvaliacoesAdmin({
  page = 1,
  limit = 10,
  filtros = {},
} = {}) {
  await garantirIndices();

  const pg = Math.max(1, inteiroPositivo(page, 1));
  const lim = Math.max(1, Math.min(inteiroPositivo(limit, 10), 200));
  const skip = (pg - 1) * lim;

  const query = {};
  const busca = matchBuscaLivre(filtros?.q);
  if (busca) Object.assign(query, busca);

  const tecnicoLogin = texto(filtros?.tecnicoLogin, { max: 120 }).toLowerCase();
  if (tecnicoLogin) query["tecnico.login"] = tecnicoLogin;

  const avaliadorLogin = texto(filtros?.avaliadorLogin, { max: 120 }).toLowerCase();
  if (avaliadorLogin) query["avaliador.login"] = avaliadorLogin;

  aplicarNotaMin(query, filtros?.notaMin);
  aplicarRecortePeriodo(query, filtros?.periodo);

  const [itens, total] = await Promise.all([
    col().find(query)
      .sort({ atualizadoEm: -1 })
      .skip(skip)
      .limit(lim)
      .toArray(),
    col().countDocuments(query),
  ]);

  return {
    itens: itens || [],
    total,
    page: pg,
    limit: lim,
    pages: Math.max(1, Math.ceil(total / lim)),
  };
}

export async function listarAvaliacoesTecnico({
  tecnicoId,
  page = 1,
  limit = 10,
  filtros = {},
} = {}) {
  await garantirIndices();
  const id = texto(tecnicoId, { max: 120 });
  if (!id) {
    return { itens: [], total: 0, page: 1, limit: Math.max(1, inteiroPositivo(limit, 10)), pages: 1 };
  }

  const pg = Math.max(1, inteiroPositivo(page, 1));
  const lim = Math.max(1, Math.min(inteiroPositivo(limit, 10), 200));
  const skip = (pg - 1) * lim;

  const query = { "tecnico.id": id };
  const termo = texto(filtros?.q, { max: 120 });
  if (termo) {
    const rx = new RegExp(termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ feedback: rx }, { sugestao: rx }];
  }
  aplicarNotaMin(query, filtros?.notaMin);
  aplicarRecortePeriodo(query, filtros?.periodo);

  const [itens, total] = await Promise.all([
    col().find(query)
      .project({
        nota: 1,
        feedback: 1,
        sugestao: 1,
        atualizadoEm: 1,
      })
      .sort({ atualizadoEm: -1 })
      .skip(skip)
      .limit(lim)
      .toArray(),
    col().countDocuments(query),
  ]);

  return {
    itens: itens || [],
    total,
    page: pg,
    limit: lim,
    pages: Math.max(1, Math.ceil(total / lim)),
  };
}

export async function listarAvaliacoesDoUsuario({
  avaliadorId,
  page = 1,
  limit = 10,
  filtros = {},
} = {}) {
  await garantirIndices();
  const id = texto(avaliadorId, { max: 120 });
  if (!id) {
    return { itens: [], total: 0, page: 1, limit: Math.max(1, inteiroPositivo(limit, 10)), pages: 1 };
  }

  const pg = Math.max(1, inteiroPositivo(page, 1));
  const lim = Math.max(1, Math.min(inteiroPositivo(limit, 10), 200));
  const skip = (pg - 1) * lim;

  const query = { "avaliador.id": id };
  const termo = texto(filtros?.q, { max: 120 });
  if (termo) {
    const rx = new RegExp(termo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const or = [
      { "chamado.titulo": rx },
      { "tecnico.nome": rx },
      { "tecnico.login": rx },
      { feedback: rx },
      { sugestao: rx },
    ];
    const numero = Number(termo);
    if (Number.isFinite(numero)) or.push({ "chamado.numero": numero });
    query.$or = or;
  }
  aplicarNotaMin(query, filtros?.notaMin);
  aplicarRecortePeriodo(query, filtros?.periodo);

  const [itens, total] = await Promise.all([
    col().find(query)
      .project({
        nota: 1,
        feedback: 1,
        sugestao: 1,
        atualizadoEm: 1,
        chamado: 1,
        tecnico: 1,
      })
      .sort({ atualizadoEm: -1 })
      .skip(skip)
      .limit(lim)
      .toArray(),
    col().countDocuments(query),
  ]);

  return {
    itens: itens || [],
    total,
    page: pg,
    limit: lim,
    pages: Math.max(1, Math.ceil(total / lim)),
  };
}
