import {
  STATUS_ALLOWED,
} from "../repos/chamados/core/chamadosCoreRepo.js";
import {
  CATEGORIAS_LABELS_PADRAO,
  CATEGORIAS_PADRAO_VALUES,
  PRIORIDADES_LABELS_PADRAO,
  PRIORIDADES_PADRAO_VALUES,
} from "../repos/chamados/classificacoesDefaults.js";
import {
  normalizarPaginacao,
  paginarLista,
} from "./paginacaoService.js";

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
  aguardando_usuario: "Em fechamento",
  fechado: "Fechado",
};

const CATEGORIA_LABELS = { ...CATEGORIAS_LABELS_PADRAO };
const PRIORIDADE_LABELS = { ...PRIORIDADES_LABELS_PADRAO };

function limparTexto(valor) {
  return String(valor ?? "").trim();
}

function normalizarTexto(valor) {
  return limparTexto(valor).toLowerCase();
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

function normalizarListaValores(lista, fallback = []) {
  const origem = Array.isArray(lista) && lista.length ? lista : fallback;

  return origem
    .map((item) => {
      if (typeof item === "string") return normalizarTexto(item);
      if (item && typeof item === "object") {
        return normalizarTexto(item.value || item.chave || "");
      }
      return "";
    })
    .filter(Boolean);
}

function normalizarOpcoesClassificacao(lista, labelsPadrao, rotuloFn) {
  const opcoes = Array.isArray(lista) ? lista : [];
  const vistos = new Set();

  return opcoes
    .map((item) => {
      if (typeof item === "string") {
        const value = normalizarTexto(item);
        return {
          value,
          label: rotuloFn(value, labelsPadrao),
        };
      }

      if (!item || typeof item !== "object") return null;

      const value = normalizarTexto(item.value || item.chave || "");
      if (!value) return null;

      const label = limparTexto(item.label || item.nome) || rotuloFn(value, labelsPadrao);
      return { value, label };
    })
    .filter((item) => {
      if (!item || !item.value) return false;
      if (vistos.has(item.value)) return false;
      vistos.add(item.value);
      return true;
    });
}

function toDateSafe(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
}

export function lerFiltrosListaChamados(
  query,
  {
    limitDefault = 10,
    allowAlocacao = false,
    allowResponsavelLogin = false,
    categoriasPermitidas = CATEGORIAS_PADRAO_VALUES,
    prioridadesPermitidas = PRIORIDADES_PADRAO_VALUES,
  } = {},
) {
  const categoriasAllowed = normalizarListaValores(
    categoriasPermitidas,
    CATEGORIAS_PADRAO_VALUES,
  );

  const prioridadesAllowed = normalizarListaValores(
    prioridadesPermitidas,
    PRIORIDADES_PADRAO_VALUES,
  );

  const status = sanitizeEnum(query?.status, STATUS_ALLOWED);
  const categoria = sanitizeEnum(query?.categoria, categoriasAllowed);
  const prioridade = sanitizeEnum(query?.prioridade, prioridadesAllowed);

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
    ...normalizarPaginacao(
      { page: query?.page, limit: query?.limit },
      { pageDefault: 1, limitDefault, limitMin: 10, limitMax: 200 },
    ),
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

  const apoio = Array.isArray(chamado?.tecnicosApoio) ? chamado.tecnicosApoio : [];
  const apoioTexto = apoio
    .map((a) => `${String(a?.nome || "")} ${String(a?.login || "")}`)
    .join(" ");

  const campos = [
    chamado?.numero,
    chamado?.titulo,
    chamado?.descricao,
    chamado?.status,
    chamado?.categoria,
    chamado?.prioridade,
    chamado?.criadoPor?.nome,
    chamado?.criadoPor?.login,
    chamado?.responsavelNome,
    chamado?.responsavelLogin,
    apoioTexto,
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
  const apoio = Array.isArray(chamado?.tecnicosApoio) ? chamado.tecnicosApoio : [];
  const possuiApoio = apoio.length > 0;
  const possuiAlocacao = possuiResponsavel || possuiApoio;
  const respLogin = normalizarTexto(chamado?.responsavelLogin);
  const loginSessao = normalizarTexto(usuarioLogin);
  const apoioLogins = apoio.map((a) => normalizarTexto(a?.login)).filter(Boolean);
  const souApoio = loginSessao && apoioLogins.includes(loginSessao);
  const souAlocado = (possuiResponsavel && respLogin === loginSessao) || souApoio;

  if (alocacao === "sem_responsavel") return !possuiAlocacao;
  if (alocacao === "com_responsavel") return possuiAlocacao;
  if (alocacao === "meus") return souAlocado;
  if (alocacao === "outros") return possuiAlocacao && !souAlocado;

  return true;
}

export function aplicarFiltrosListaChamados(
  chamados,
  filtros,
  { usuarioLogin = "", ordenarItensFn = null } = {},
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
      const apoio = Array.isArray(chamado?.tecnicosApoio) ? chamado.tecnicosApoio : [];
      const apoioMatch = apoio.some((a) => normalizarTexto(a?.login).includes(filtroResponsavelLogin));
      if (!resp.includes(filtroResponsavelLogin) && !apoioMatch) return false;
    }

    if (!incluiAlocacao(chamado, filtros?.alocacao, usuarioLogin)) return false;
    if (!incluiBusca(chamado, termoBusca)) return false;
    if (!incluiDataCriacao(chamado, dataInicio, dataFim)) return false;

    return true;
  });

  const ordenados = typeof ordenarItensFn === "function"
    ? ordenarItensFn([...filtrados])
    : filtrados;

  const pagina = paginarLista(ordenados, {
    page: filtros?.page || 1,
    limit: filtros?.limit || 10,
  });

  return {
    total: pagina.total,
    itens: pagina.itens,
    page: pagina.page,
    pages: pagina.pages,
    limit: pagina.limit,
    from: pagina.from,
    to: pagina.to,
    hasPrev: pagina.hasPrev,
    hasNext: pagina.hasNext,
  };
}

export function obterOpcoesFiltrosChamados({
  incluirAlocacao = false,
  categorias = CATEGORIAS_PADRAO_VALUES,
  prioridades = PRIORIDADES_PADRAO_VALUES,
  categoriasLabels = CATEGORIA_LABELS,
  prioridadesLabels = PRIORIDADE_LABELS,
} = {}) {
  const categoriasOpcoes = normalizarOpcoesClassificacao(
    categorias,
    categoriasLabels,
    rotuloCategoriaChamado,
  );

  const prioridadesOpcoes = normalizarOpcoesClassificacao(
    prioridades,
    prioridadesLabels,
    rotuloPrioridadeChamado,
  );

  const opcoes = {
    status: STATUS_ALLOWED.map((value) => ({
      value,
      label: rotuloStatusChamado(value),
    })),
    categorias: categoriasOpcoes,
    prioridades: prioridadesOpcoes,
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

function humanizarCodigo(codigo) {
  const texto = normalizarTexto(codigo).replace(/_/g, " ");
  if (!texto) return "";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function rotuloCategoriaChamado(categoria, labels = CATEGORIA_LABELS) {
  const key = normalizarTexto(categoria);
  return labels?.[key] || CATEGORIA_LABELS[key] || humanizarCodigo(key) || limparTexto(categoria) || "-";
}

export function rotuloPrioridadeChamado(prioridade, labels = PRIORIDADE_LABELS) {
  const key = normalizarTexto(prioridade);
  return labels?.[key] || PRIORIDADE_LABELS[key] || humanizarCodigo(key) || limparTexto(prioridade) || "-";
}
