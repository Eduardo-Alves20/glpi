import {
  listarNotificacoes,
  contarNaoLidas,
  marcarComoLida,
  marcarTodasComoLidas,
} from "../../repos/notificacoesRepo.js";
import {
  resolverDestinatarioNotificacoes,
  obterTiposIgnoradosNotificacoes,
} from "../../service/notificacoesDestinatarioService.js";

const LIMIT_DEFAULT = 80;
const LIMIT_MAX = 100;
const ESTADOS_VALIDOS = new Set(["todas", "nao_lidas", "lidas"]);
const TIPOS_VALIDOS = new Set([
  "todos",
  "nova_mensagem",
  "nova_solucao",
  "mudou_status",
  "novo_chamado_fila",
  "atribuido",
]);

const ROTULO_TIPO = {
  nova_mensagem: "Nova mensagem",
  nova_solucao: "Nova solucao",
  mudou_status: "Mudanca de status",
  novo_chamado_fila: "Novo chamado na fila",
  atribuido: "Chamado atribuido",
};

function cssPortalPorPerfil(perfil) {
  return String(perfil || "").toLowerCase() === "admin"
    ? "/styles/admin.css"
    : "/styles/usuario.css";
}

function parseEstado(estado) {
  const san = String(estado || "").trim().toLowerCase();
  return ESTADOS_VALIDOS.has(san) ? san : "todas";
}

function parseTipo(tipo) {
  const san = String(tipo || "").trim().toLowerCase();
  return TIPOS_VALIDOS.has(san) ? san : "todos";
}

function parseLimit(limit) {
  const n = Number.parseInt(limit, 10);
  if (!Number.isFinite(n) || n <= 0) return LIMIT_DEFAULT;
  return Math.min(Math.max(n, 1), LIMIT_MAX);
}

function rotuloTipo(tipo) {
  return ROTULO_TIPO[String(tipo || "").toLowerCase()] || "Notificacao";
}

function dataPtBr(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return "-";
  }
}

function dataIso(value) {
  if (!value) return "";
  try {
    return new Date(value).toISOString();
  } catch {
    return "";
  }
}

function garantirUrlInterna(url) {
  const san = String(url || "").trim();
  if (!san.startsWith("/")) return "/app";
  if (san.startsWith("//")) return "/app";
  return san;
}

function retornoSeguro(value) {
  const san = String(value || "").trim();
  if (!/^\/notificacoes(?:[/?]|$)/.test(san)) return "/notificacoes";
  return san;
}

function montarRetornoAtual(filtros) {
  const params = new URLSearchParams();
  if (filtros.estado !== "todas") params.set("estado", filtros.estado);
  if (filtros.tipo !== "todos") params.set("tipo", filtros.tipo);
  if (filtros.limit !== LIMIT_DEFAULT) params.set("limit", String(filtros.limit));
  const query = params.toString();
  return query ? `/notificacoes?${query}` : "/notificacoes";
}

function mapearNotificacaoView(n) {
  const id = String(n?._id || "");
  const tipo = String(n?.tipo || "").toLowerCase();
  const lido = Boolean(n?.lidoEm);

  return {
    id,
    tipo,
    tipoLabel: rotuloTipo(tipo),
    titulo: String(n?.titulo || "Notificacao"),
    mensagem: String(n?.mensagem || ""),
    url: garantirUrlInterna(n?.url),
    lido,
    criadoEmIso: dataIso(n?.criadoEm),
    criadoEm: dataPtBr(n?.criadoEm),
    lidoEm: lido ? dataPtBr(n?.lidoEm) : null,
  };
}

export async function notificacoesIndexGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  const destinatario = resolverDestinatarioNotificacoes(usuarioSessao);
  if (!destinatario) return res.redirect("/auth");

  const filtros = {
    estado: parseEstado(req.query?.estado),
    tipo: parseTipo(req.query?.tipo),
    limit: parseLimit(req.query?.limit),
  };

  const readState =
    filtros.estado === "nao_lidas"
      ? "unread"
      : (filtros.estado === "lidas" ? "read" : "all");
  const tipoFiltro = filtros.tipo === "todos" ? null : filtros.tipo;
  const tiposIgnorados = obterTiposIgnoradosNotificacoes(usuarioSessao);
  const retornoAtual = montarRetornoAtual(filtros);
  const opcoesTipo = [...TIPOS_VALIDOS]
    .filter((tipo) => tipo !== "todos")
    .filter((tipo) => !tiposIgnorados.includes(tipo))
    .map((tipo) => ({ valor: tipo, label: rotuloTipo(tipo) }));

  try {
    const [itens, totalNaoLidas] = await Promise.all([
      listarNotificacoes({
        destinatario,
        readState,
        tipo: tipoFiltro,
        limit: filtros.limit,
        tiposIgnorados,
      }),
      contarNaoLidas(destinatario, { tiposIgnorados }),
    ]);

    const notificacoes = (itens || []).map(mapearNotificacaoView);

    return res.render("notificacoes/index", {
      layout: "layout-app",
      titulo: "Notificacoes",
      cssPortal: cssPortalPorPerfil(usuarioSessao?.perfil),
      cssExtra: "/styles/notificacoes.css",
      usuarioSessao,
      filtros,
      retornoAtual,
      opcoesTipo,
      notificacoes,
      totais: {
        listadas: notificacoes.length,
        naoLidas: totalNaoLidas,
      },
      erroGeral: null,
    });
  } catch (err) {
    console.error("Erro ao carregar notificacoes:", err);
    return res.status(500).render("notificacoes/index", {
      layout: "layout-app",
      titulo: "Notificacoes",
      cssPortal: cssPortalPorPerfil(usuarioSessao?.perfil),
      cssExtra: "/styles/notificacoes.css",
      usuarioSessao,
      filtros,
      retornoAtual,
      opcoesTipo,
      notificacoes: [],
      totais: {
        listadas: 0,
        naoLidas: 0,
      },
      erroGeral: "Nao foi possivel carregar suas notificacoes.",
    });
  }
}

export async function notificacaoMarcarLidaPost(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  const destinatario = resolverDestinatarioNotificacoes(usuarioSessao);
  if (!destinatario) return res.redirect("/auth");

  const retorno = retornoSeguro(req.body?.returnTo);

  try {
    const out = await marcarComoLida({
      notifId: req.params.id,
      destinatario,
    });

    req.session.flash = out?.ok
      ? { tipo: "success", mensagem: "Notificacao marcada como lida." }
      : { tipo: "info", mensagem: "Notificacao ja estava lida ou nao existe." };
  } catch (err) {
    console.error("Erro ao marcar notificacao como lida:", err);
    req.session.flash = { tipo: "error", mensagem: "Nao foi possivel atualizar a notificacao." };
  }

  return res.redirect(retorno);
}

export async function notificacoesMarcarTodasPost(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  const destinatario = resolverDestinatarioNotificacoes(usuarioSessao);
  if (!destinatario) return res.redirect("/auth");

  const retorno = retornoSeguro(req.body?.returnTo);

  try {
    const out = await marcarTodasComoLidas(destinatario);
    const qtd = Number(out?.modified || 0);
    req.session.flash = {
      tipo: "success",
      mensagem: qtd > 0
        ? `${qtd} notificacao(oes) marcada(s) como lida(s).`
        : "Nao havia notificacoes pendentes.",
    };
  } catch (err) {
    console.error("Erro ao marcar todas notificacoes:", err);
    req.session.flash = { tipo: "error", mensagem: "Nao foi possivel atualizar as notificacoes." };
  }

  return res.redirect(retorno);
}
