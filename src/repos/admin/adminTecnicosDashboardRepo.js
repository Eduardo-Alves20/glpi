import { ObjectId } from "mongodb";
import { pegarDb } from "../../compartilhado/db/mongo.js";
import {
  normalizarPaginacao,
  paginarLista,
} from "../../service/paginacaoService.js";

const COL_USUARIOS = "usuarios";
const COL_CHAMADOS = "chamados";

const PERIODOS_DIAS_ALLOWED = [7, 15, 30, 60, 90];
const STATUS_TECNICO_ALLOWED = ["", "ativo", "bloqueado"];
const DESEMPENHO_ALLOWED = [
  "",
  "sobrecarregado",
  "pendencias_criticas",
  "sem_fila",
  "destaque",
];
const ORDENACAO_ALLOWED = [
  "carga_desc",
  "performance_desc",
  "atividade_recente",
  "nome_asc",
];

function limparTexto(valor, { max = 120 } = {}) {
  return String(valor || "").trim().slice(0, max);
}

function escaparRegex(texto = "") {
  return String(texto).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function numeroValido(valor, fallback) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function inicioPeriodoDias(dias) {
  const now = new Date();
  const out = new Date(now);
  out.setDate(out.getDate() - Math.max(1, Number(dias) || 30));
  out.setHours(0, 0, 0, 0);
  return out;
}

function fmtData(valor) {
  if (!valor) return "-";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR");
}

function maxData(...datas) {
  const validas = datas
    .map((d) => (d ? new Date(d) : null))
    .filter((d) => d && !Number.isNaN(d.getTime()));

  if (!validas.length) return null;
  return new Date(Math.max(...validas.map((d) => d.getTime())));
}

function toObjectIdString(valor) {
  const texto = String(valor || "").trim();
  if (!ObjectId.isValid(texto)) return "";
  return String(new ObjectId(texto));
}

function normalizarTecnicoIdsFiltro(filtros = {}) {
  const ids = [];
  const adicionarId = (valor) => {
    const texto = String(valor || "").trim();
    if (!ObjectId.isValid(texto)) return;
    const normalizado = String(new ObjectId(texto));
    if (!ids.includes(normalizado)) ids.push(normalizado);
  };

  if (filtros.tecnicoId) adicionarId(filtros.tecnicoId);
  if (Array.isArray(filtros.tecnicoIds)) {
    filtros.tecnicoIds.forEach((id) => adicionarId(id));
  }

  return ids;
}

function isSobrecarregado(row) {
  return row.ativos >= 8 || row.criticosAtivos >= 2;
}

function isDestaque(row) {
  return (
    row.fechadosPeriodo >= 8 &&
    row.interacoesPeriodo >= 8 &&
    row.tempoPrimeiroAtendimentoAmostras > 0 &&
    row.tempoPrimeiroAtendimentoHoras > 0 &&
    row.tempoPrimeiroAtendimentoHoras <= 6
  );
}

function classificarSaude(row) {
  if (row.ativos >= 12 || row.criticosAtivos >= 4) {
    return { codigo: "critico", label: "Critico" };
  }
  if (isSobrecarregado(row)) {
    return { codigo: "atencao", label: "Atencao" };
  }
  if (isDestaque(row)) {
    return { codigo: "destaque", label: "Destaque" };
  }
  if (!row.ultimaAtuacaoEm && row.ativos === 0) {
    return { codigo: "inativo", label: "Sem atividade" };
  }
  return { codigo: "estavel", label: "Estavel" };
}

function aplicarFiltroDesempenho(lista, desempenho) {
  if (!desempenho) return [...lista];

  return lista.filter((row) => {
    if (desempenho === "sobrecarregado") return isSobrecarregado(row);
    if (desempenho === "pendencias_criticas") return row.criticosAtivos > 0;
    if (desempenho === "sem_fila") return row.ativos === 0;
    if (desempenho === "destaque") return isDestaque(row);
    return true;
  });
}

function ordenarTecnicos(lista, ordenacao) {
  const rows = [...lista];

  const nomeAsc = (a, b) =>
    String(a.nome || a.usuario || "").localeCompare(
      String(b.nome || b.usuario || ""),
      "pt-BR",
      { sensitivity: "base" },
    );

  if (ordenacao === "nome_asc") {
    rows.sort(nomeAsc);
    return rows;
  }

  if (ordenacao === "atividade_recente") {
    rows.sort((a, b) => {
      const ta = a.ultimaAtuacaoEm ? new Date(a.ultimaAtuacaoEm).getTime() : 0;
      const tb = b.ultimaAtuacaoEm ? new Date(b.ultimaAtuacaoEm).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return nomeAsc(a, b);
    });
    return rows;
  }

  if (ordenacao === "performance_desc") {
    rows.sort((a, b) => {
      if (b.fechadosPeriodo !== a.fechadosPeriodo) return b.fechadosPeriodo - a.fechadosPeriodo;
      if (b.interacoesPeriodo !== a.interacoesPeriodo) return b.interacoesPeriodo - a.interacoesPeriodo;

      const aTempo = a.tempoPrimeiroAtendimentoAmostras > 0
        ? a.tempoPrimeiroAtendimentoHoras
        : Number.POSITIVE_INFINITY;
      const bTempo = b.tempoPrimeiroAtendimentoAmostras > 0
        ? b.tempoPrimeiroAtendimentoHoras
        : Number.POSITIVE_INFINITY;
      if (aTempo !== bTempo) return aTempo - bTempo;

      if (a.ativos !== b.ativos) return a.ativos - b.ativos;
      return nomeAsc(a, b);
    });
    return rows;
  }

  rows.sort((a, b) => {
    if (b.ativos !== a.ativos) return b.ativos - a.ativos;
    if (b.criticosAtivos !== a.criticosAtivos) return b.criticosAtivos - a.criticosAtivos;
    if (b.aguardandoUsuario !== a.aguardandoUsuario) return b.aguardandoUsuario - a.aguardandoUsuario;
    if (b.fechadosPeriodo !== a.fechadosPeriodo) return b.fechadosPeriodo - a.fechadosPeriodo;
    return nomeAsc(a, b);
  });
  return rows;
}

function montarKpis(lista, periodoDias) {
  const totalTecnicos = lista.length;
  const tecnicosComAtivos = lista.filter((row) => row.ativos > 0).length;
  const tecnicosSobrecarregados = lista.filter((row) => isSobrecarregado(row)).length;
  const tecnicosSemAtividade = lista.filter(
    (row) => row.ativos === 0 && row.fechadosPeriodo === 0 && row.interacoesPeriodo === 0,
  ).length;
  const tecnicosDestaque = lista.filter((row) => isDestaque(row)).length;

  const chamadosAtivos = lista.reduce((acc, row) => acc + row.ativos, 0);
  const chamadosCriticosAtivos = lista.reduce((acc, row) => acc + row.criticosAtivos, 0);
  const fechadosPeriodo = lista.reduce((acc, row) => acc + row.fechadosPeriodo, 0);
  const interacoesPeriodo = lista.reduce((acc, row) => acc + row.interacoesPeriodo, 0);

  const baseTempo = lista
    .filter((row) => row.tempoPrimeiroAtendimentoAmostras > 0)
    .reduce(
      (acc, row) => {
        acc.somaHoras += row.tempoPrimeiroAtendimentoHoras * row.tempoPrimeiroAtendimentoAmostras;
        acc.amostras += row.tempoPrimeiroAtendimentoAmostras;
        return acc;
      },
      { somaHoras: 0, amostras: 0 },
    );

  const tempoMedioPrimeiroAtendimentoHoras = baseTempo.amostras
    ? Number((baseTempo.somaHoras / baseTempo.amostras).toFixed(2))
    : 0;

  return {
    periodoDias,
    totalTecnicos,
    tecnicosComAtivos,
    tecnicosSobrecarregados,
    tecnicosSemAtividade,
    tecnicosDestaque,
    chamadosAtivos,
    chamadosCriticosAtivos,
    fechadosPeriodo,
    interacoesPeriodo,
    tempoMedioPrimeiroAtendimentoHoras,
  };
}

function montarInsights(lista) {
  const ordenadaCarga = [...lista].sort((a, b) => b.ativos - a.ativos);
  const ordenadaFechados = [...lista].sort((a, b) => b.fechadosPeriodo - a.fechadosPeriodo);
  const semAtividade = lista
    .filter((row) => row.ativos === 0 && row.fechadosPeriodo === 0 && row.interacoesPeriodo === 0)
    .slice(0, 3);
  const atencao = lista
    .filter((row) => row.saudeCodigo === "critico" || row.saudeCodigo === "atencao")
    .slice(0, 3);

  return {
    topoCarga: ordenadaCarga[0] || null,
    topoFechamentos: ordenadaFechados[0] || null,
    semAtividade,
    atencao,
  };
}

function mapPorId(agregados = []) {
  const mapa = new Map();
  (agregados || []).forEach((item) => {
    const key = toObjectIdString(item?._id);
    if (!key) return;
    mapa.set(key, item);
  });
  return mapa;
}

function mapPorString(agregados = []) {
  const mapa = new Map();
  (agregados || []).forEach((item) => {
    const key = String(item?._id || "").trim();
    if (!key) return;
    mapa.set(key, item);
  });
  return mapa;
}

export function lerFiltrosAdminTecnicos(query = {}) {
  const status = limparTexto(query.status, { max: 20 }).toLowerCase();
  const desempenho = limparTexto(query.desempenho, { max: 40 }).toLowerCase();
  const ordenacao = limparTexto(query.ordenacao, { max: 40 }).toLowerCase();
  const periodoRaw = numeroValido(query.periodoDias, 30);
  const periodoDias = PERIODOS_DIAS_ALLOWED.includes(periodoRaw) ? periodoRaw : 30;

  const { page, limit } = normalizarPaginacao(
    { page: query.page, limit: query.limit },
    { pageDefault: 1, limitDefault: 10, limitMin: 10, limitMax: 200 },
  );

  return {
    q: limparTexto(query.q, { max: 120 }),
    status: STATUS_TECNICO_ALLOWED.includes(status) ? status : "",
    desempenho: DESEMPENHO_ALLOWED.includes(desempenho) ? desempenho : "",
    ordenacao: ORDENACAO_ALLOWED.includes(ordenacao) ? ordenacao : "carga_desc",
    periodoDias,
    page,
    limit,
  };
}

export async function obterDashboardTecnicosAdmin(filtros = {}) {
  const db = pegarDb();
  const periodoInicio = inicioPeriodoDias(filtros.periodoDias || 30);
  const tecnicoIdsFiltro = normalizarTecnicoIdsFiltro(filtros);

  const queryTecnicos = { perfil: "tecnico" };
  if (tecnicoIdsFiltro.length === 1) {
    queryTecnicos._id = new ObjectId(tecnicoIdsFiltro[0]);
  } else if (tecnicoIdsFiltro.length > 1) {
    queryTecnicos._id = { $in: tecnicoIdsFiltro.map((id) => new ObjectId(id)) };
  }
  if (filtros.status) queryTecnicos.status = filtros.status;
  if (filtros.q) {
    const rx = new RegExp(escaparRegex(filtros.q), "i");
    queryTecnicos.$or = [{ nome: rx }, { usuario: rx }, { email: rx }];
  }

  const tecnicosBase = await db
    .collection(COL_USUARIOS)
    .find(queryTecnicos, {
      projection: {
        nome: 1,
        usuario: 1,
        email: 1,
        perfil: 1,
        status: 1,
        criadoEm: 1,
        updatedAt: 1,
      },
    })
    .sort({ nome: 1, usuario: 1 })
    .toArray();

  if (!tecnicosBase.length) {
    const pag = paginarLista([], { page: filtros.page, limit: filtros.limit });
    return {
      tecnicos: [],
      paginacao: {
        total: pag.total,
        page: pag.page,
        pages: pag.pages,
        limit: pag.limit,
      },
      kpis: montarKpis([], filtros.periodoDias || 30),
      insights: {
        topoCarga: null,
        topoFechamentos: null,
        semAtividade: [],
        atencao: [],
      },
    };
  }

  const tecnicoIds = tecnicosBase
    .map((t) => (ObjectId.isValid(t?._id) ? new ObjectId(t._id) : null))
    .filter(Boolean);
  const tecnicoIdsString = tecnicoIds.map((id) => String(id));

  const [
    ativosAgg,
    fechadosAgg,
    interacoesAgg,
    atribuicoesAgg,
    tempoPrimeiroAtendimentoAgg,
  ] = await Promise.all([
    db.collection(COL_CHAMADOS).aggregate([
      {
        $match: {
          responsavelId: { $in: tecnicoIds },
          status: { $in: ["em_atendimento", "aguardando_usuario"] },
        },
      },
      {
        $group: {
          _id: "$responsavelId",
          ativos: { $sum: 1 },
          emAtendimento: {
            $sum: { $cond: [{ $eq: ["$status", "em_atendimento"] }, 1, 0] },
          },
          aguardandoUsuario: {
            $sum: { $cond: [{ $eq: ["$status", "aguardando_usuario"] }, 1, 0] },
          },
          criticosAtivos: {
            $sum: { $cond: [{ $in: ["$prioridade", ["alta", "critica"]] }, 1, 0] },
          },
          ultimaAtualizacao: { $max: "$updatedAt" },
        },
      },
    ]).toArray(),

    db.collection(COL_CHAMADOS).aggregate([
      {
        $match: {
          responsavelId: { $in: tecnicoIds },
          status: "fechado",
          fechadoEm: { $gte: periodoInicio },
        },
      },
      {
        $group: {
          _id: "$responsavelId",
          fechadosPeriodo: { $sum: 1 },
          ultimoFechadoEm: { $max: "$fechadoEm" },
        },
      },
    ]).toArray(),

    db.collection(COL_CHAMADOS).aggregate([
      { $match: { "historico.meta.autor.tecnicoId": { $in: tecnicoIds } } },
      { $unwind: "$historico" },
      {
        $match: {
          "historico.meta.autor.tecnicoId": { $in: tecnicoIds },
          "historico.tipo": { $in: ["mensagem", "solucao", "comentario_interno"] },
          "historico.em": { $gte: periodoInicio },
        },
      },
      {
        $group: {
          _id: "$historico.meta.autor.tecnicoId",
          interacoesPeriodo: { $sum: 1 },
          ultimaInteracao: { $max: "$historico.em" },
        },
      },
    ]).toArray(),

    db.collection(COL_CHAMADOS).aggregate([
      { $match: { "historico.meta.responsavelId": { $in: tecnicoIdsString } } },
      { $unwind: "$historico" },
      {
        $match: {
          "historico.meta.responsavelId": { $in: tecnicoIdsString },
          "historico.tipo": { $in: ["atribuicao", "transferencia"] },
          "historico.em": { $gte: periodoInicio },
        },
      },
      {
        $group: {
          _id: "$historico.meta.responsavelId",
          atribuicoesPeriodo: { $sum: 1 },
          ultimaAtribuicao: { $max: "$historico.em" },
        },
      },
    ]).toArray(),

    db.collection(COL_CHAMADOS).aggregate([
      {
        $match: {
          responsavelId: { $in: tecnicoIds },
          createdAt: { $type: "date" },
          atendidoEm: { $type: "date", $gte: periodoInicio },
        },
      },
      {
        $project: {
          responsavelId: 1,
          diffMs: {
            $cond: [
              { $gt: [{ $subtract: ["$atendidoEm", "$createdAt"] }, 0] },
              { $subtract: ["$atendidoEm", "$createdAt"] },
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: "$responsavelId",
          mediaHoras: { $avg: { $divide: ["$diffMs", 3600000] } },
          amostras: { $sum: 1 },
        },
      },
    ]).toArray(),
  ]);

  const ativosMap = mapPorId(ativosAgg);
  const fechadosMap = mapPorId(fechadosAgg);
  const interacoesMap = mapPorId(interacoesAgg);
  const tempoPrimeiroMap = mapPorId(tempoPrimeiroAtendimentoAgg);
  const atribuicoesMap = mapPorString(atribuicoesAgg);

  const consolidados = tecnicosBase.map((tecnico) => {
    const id = String(tecnico._id);
    const ativos = ativosMap.get(id) || {};
    const fechados = fechadosMap.get(id) || {};
    const interacoes = interacoesMap.get(id) || {};
    const atribuicoes = atribuicoesMap.get(id) || {};
    const tempoPrimeiro = tempoPrimeiroMap.get(id) || {};

    const ultimaAtuacaoEm = maxData(
      ativos.ultimaAtualizacao,
      fechados.ultimoFechadoEm,
      interacoes.ultimaInteracao,
      atribuicoes.ultimaAtribuicao,
      tecnico.updatedAt,
    );

    const row = {
      id,
      nome: String(tecnico.nome || "").trim() || "-",
      usuario: String(tecnico.usuario || "").trim() || "-",
      email: String(tecnico.email || "").trim() || "-",
      status: String(tecnico.status || "ativo").trim().toLowerCase() || "ativo",
      ativos: Number(ativos.ativos || 0),
      emAtendimento: Number(ativos.emAtendimento || 0),
      aguardandoUsuario: Number(ativos.aguardandoUsuario || 0),
      criticosAtivos: Number(ativos.criticosAtivos || 0),
      fechadosPeriodo: Number(fechados.fechadosPeriodo || 0),
      interacoesPeriodo: Number(interacoes.interacoesPeriodo || 0),
      atribuicoesPeriodo: Number(atribuicoes.atribuicoesPeriodo || 0),
      tempoPrimeiroAtendimentoHoras: Number(tempoPrimeiro.mediaHoras || 0),
      tempoPrimeiroAtendimentoAmostras: Number(tempoPrimeiro.amostras || 0),
      ultimaAtuacaoEm,
      ultimaAtuacaoFmt: fmtData(ultimaAtuacaoEm),
    };

    const saude = classificarSaude(row);
    row.saudeCodigo = saude.codigo;
    row.saudeLabel = saude.label;
    return row;
  });

  const filtrados = aplicarFiltroDesempenho(consolidados, filtros.desempenho);
  const ordenados = ordenarTecnicos(filtrados, filtros.ordenacao);
  const paginados = paginarLista(ordenados, {
    page: filtros.page,
    limit: filtros.limit,
  });

  return {
    tecnicos: paginados.itens,
    paginacao: {
      total: paginados.total,
      page: paginados.page,
      pages: paginados.pages,
      limit: paginados.limit,
    },
    kpis: montarKpis(filtrados, filtros.periodoDias || 30),
    insights: montarInsights(filtrados),
  };
}

export function opcoesAdminTecnicos() {
  return {
    periodosDias: PERIODOS_DIAS_ALLOWED.map((dias) => ({
      value: String(dias),
      label: `Ultimos ${dias} dias`,
    })),
    status: [
      { value: "", label: "Todos" },
      { value: "ativo", label: "Ativo" },
      { value: "bloqueado", label: "Bloqueado" },
    ],
    desempenho: [
      { value: "", label: "Todos" },
      { value: "sobrecarregado", label: "Sobrecarregados" },
      { value: "pendencias_criticas", label: "Com pendencias criticas" },
      { value: "sem_fila", label: "Sem fila ativa" },
      { value: "destaque", label: "Destaques" },
    ],
    ordenacao: [
      { value: "carga_desc", label: "Maior carga" },
      { value: "performance_desc", label: "Melhor performance" },
      { value: "atividade_recente", label: "Atividade recente" },
      { value: "nome_asc", label: "Nome (A-Z)" },
    ],
  };
}
