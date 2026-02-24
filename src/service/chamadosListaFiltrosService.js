import {
  CATEGORIAS_ALLOWED,
  PRIORIDADES_ALLOWED,
  STATUS_ALLOWED,
} from "../repos/chamados/core/chamadosCoreRepo.js";

const ALOCACOES_ALLOWED = [
  "",
  "sem_responsavel",
  "com_responsavel",
  "meus",
  "outros",
];

const STATUS_LABELS = {
  aberto: "Aberto",
  em_atendimento: "Em atendimento",
  aguardando_usuario: "Aguardando usuario",
  fechado: "Fechado",
};

const CATEGORIA_LABELS = {
  acesso: "Acesso",
  incidente: "Incidente",
  solicitacao: "Solicitacao",
  infra: "Infra",
  outros: "Outros",
};

const PRIORIDADE_LABELS = {
  baixa: "Baixa",
  media: "Media",
  alta: "Alta",
  critica: "Critica",
};

function limparTexto(valor) {
  return String(valor ?? "").trim();
}

function normalizarTexto(valor) {
  return limparTexto(valor).toLowerCase();
}

function limitarInteiro(valor, { min = 10, max = 200, fallback = 50 } = {}) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(Math.trunc(n), max));
}

function dataIsoValida(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(valor || ""));
}

function inicioDoDiaIso(valor) {
  if (!dataIsoValida(valor)) return null;
  const d = new Date(`${valor}T00:00:00.000`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fimDoDiaIso(valor) {
  if (!dataIsoValida(valor)) return null;
  const d = new Date(`${valor}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sanitizeEnum(value, allowed) {
  const v = normalizarTexto(value);
  return allowed.includes(v) ? v : "";
}

function toDateSafe(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
}

export function lerFiltrosListaChamados(
  query,
  {
    limitDefault = 50,
    allowAlocacao = false,
    allowResponsavelLogin = false,
  } = {},
) {
  const status = sanitizeEnum(query?.status, STATUS_ALLOWED);
  const categoria = sanitizeEnum(query?.categoria, CATEGORIAS_ALLOWED);
  const prioridade = sanitizeEnum(query?.prioridade, PRIORIDADES_ALLOWED);

  const dataInicioRaw = limparTexto(query?.dataInicio);
  const dataFimRaw = limparTexto(query?.dataFim);

  const dataInicio = dataIsoValida(dataInicioRaw) ? dataInicioRaw : "";
  const dataFim = dataIsoValida(dataFimRaw) ? dataFimRaw : "";

  const filtros = {
    q: limparTexto(query?.q),
    status,
    categoria,
    prioridade,
    dataInicio,
    dataFim,
    limit: limitarInteiro(query?.limit, { fallback: limitDefault }),
    alocacao: "",
    responsavelLogin: "",
  };

  if (allowAlocacao) {
    filtros.alocacao = sanitizeEnum(query?.alocacao, ALOCACOES_ALLOWED);
  }

  if (allowResponsavelLogin) {
    filtros.responsavelLogin = limparTexto(query?.responsavelLogin);
  }

  return filtros;
}

function incluiBusca(chamado, termoBusca) {
  if (!termoBusca) return true;

  const campos = [
    chamado?.numero,
    chamado?.titulo,
    chamado?.status,
    chamado?.categoria,
    chamado?.prioridade,
    chamado?.criadoPor?.nome,
    chamado?.criadoPor?.login,
    chamado?.responsavelNome,
    chamado?.responsavelLogin,
  ];

  const texto = campos
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");

  return texto.includes(termoBusca);
}

function incluiDataCriacao(chamado, dataInicio, dataFim) {
  if (!dataInicio && !dataFim) return true;

  const criadoEm = toDateSafe(chamado?.createdAt);
  if (!criadoEm) return false;

  if (dataInicio && criadoEm < dataInicio) return false;
  if (dataFim && criadoEm > dataFim) return false;

  return true;
}

function incluiAlocacao(chamado, alocacao, usuarioLogin) {
  if (!alocacao) return true;

  const possuiResponsavel = Boolean(chamado?.responsavelId);
  const respLogin = normalizarTexto(chamado?.responsavelLogin);
  const loginSessao = normalizarTexto(usuarioLogin);

  if (alocacao === "sem_responsavel") return !possuiResponsavel;
  if (alocacao === "com_responsavel") return possuiResponsavel;
  if (alocacao === "meus") return possuiResponsavel && respLogin === loginSessao;
  if (alocacao === "outros") return possuiResponsavel && respLogin && respLogin !== loginSessao;

  return true;
}

export function aplicarFiltrosListaChamados(
  chamados,
  filtros,
  { usuarioLogin = "" } = {},
) {
  const lista = Array.isArray(chamados) ? chamados : [];
  const termoBusca = normalizarTexto(filtros?.q);
  const filtroResponsavelLogin = normalizarTexto(filtros?.responsavelLogin);

  const dataInicio = inicioDoDiaIso(filtros?.dataInicio);
  const dataFim = fimDoDiaIso(filtros?.dataFim);

  const filtrados = lista.filter((chamado) => {
    if (filtros?.status && String(chamado?.status || "") !== filtros.status) return false;
    if (filtros?.categoria && String(chamado?.categoria || "") !== filtros.categoria) return false;
    if (filtros?.prioridade && String(chamado?.prioridade || "") !== filtros.prioridade) return false;

    if (filtroResponsavelLogin) {
      const resp = normalizarTexto(chamado?.responsavelLogin);
      if (!resp.includes(filtroResponsavelLogin)) return false;
    }

    if (!incluiAlocacao(chamado, filtros?.alocacao, usuarioLogin)) return false;
    if (!incluiBusca(chamado, termoBusca)) return false;
    if (!incluiDataCriacao(chamado, dataInicio, dataFim)) return false;

    return true;
  });

  return {
    total: filtrados.length,
    itens: filtrados.slice(0, filtros?.limit || 50),
  };
}

export function obterOpcoesFiltrosChamados({ incluirAlocacao = false } = {}) {
  const opcoes = {
    status: STATUS_ALLOWED.map((value) => ({
      value,
      label: rotuloStatusChamado(value),
    })),
    categorias: CATEGORIAS_ALLOWED.map((value) => ({
      value,
      label: rotuloCategoriaChamado(value),
    })),
    prioridades: PRIORIDADES_ALLOWED.map((value) => ({
      value,
      label: rotuloPrioridadeChamado(value),
    })),
    alocacao: [],
  };

  if (incluirAlocacao) {
    opcoes.alocacao = [
      { value: "", label: "Todas" },
      { value: "sem_responsavel", label: "Sem responsavel" },
      { value: "com_responsavel", label: "Com responsavel" },
      { value: "meus", label: "Meus chamados" },
      { value: "outros", label: "Atribuidos a outros" },
    ];
  }

  return opcoes;
}

export function rotuloStatusChamado(status) {
  const key = normalizarTexto(status);
  return STATUS_LABELS[key] || limparTexto(status) || "-";
}

export function rotuloCategoriaChamado(categoria) {
  const key = normalizarTexto(categoria);
  return CATEGORIA_LABELS[key] || limparTexto(categoria) || "-";
}

export function rotuloPrioridadeChamado(prioridade) {
  const key = normalizarTexto(prioridade);
  return PRIORIDADE_LABELS[key] || limparTexto(prioridade) || "-";
}
