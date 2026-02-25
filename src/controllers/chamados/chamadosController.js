import {
  criarChamado,
  listarChamados,
} from "../../repos/chamados/core/chamadosCoreRepo.js";
import { obterClassificacoesAtivasChamados } from "../../repos/chamados/classificacoesChamadosRepo.js";
import {
  acharChamadoPorIdDoUsuario,
  editarChamadoDoUsuario,
} from "../../repos/chamados/usuario/chamadosUsuarioRepo.js";
import { listarUsuariosPorPerfis } from "../../repos/usuariosRepo.js";
import { notificarNovoChamadoFila } from "../../service/notificacoesService.js";
import { registrarEventoSistema } from "../../service/logsService.js";
import { apagarArquivosUpload, mapearArquivosUpload } from "../../service/anexosService.js";
import {
  aplicarFiltrosListaChamados,
  lerFiltrosListaChamados,
  obterOpcoesFiltrosChamados,
  rotuloCategoriaChamado,
  rotuloPrioridadeChamado,
  rotuloStatusChamado,
} from "../../service/chamadosListaFiltrosService.js";

async function carregarClassificacoesChamados() {
  try {
    return await obterClassificacoesAtivasChamados();
  } catch (err) {
    console.error("Erro ao carregar classificacoes de chamados:", err);
    return {
      categorias: [],
      prioridades: [],
      categoriasValores: [],
      prioridadesValores: [],
      categoriasLabels: {},
      prioridadesLabels: {},
    };
  }
}

export async function chamadoNovoGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  const classificacoes = await carregarClassificacoesChamados();

  return res.render("chamados/novo", {
    layout: "layout-app",
    titulo: "Abrir chamado",
    cssPortal: "/styles/usuario.css",
    cssExtra: "/styles/chamado-novo.css",
    usuarioSessao,
    opcoesClassificacao: classificacoes,
    erroGeral: null,
    valores: { titulo: "", descricao: "", categoria: "", prioridade: "" },
  });
}

export async function chamadoNovoPost(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");
  const classificacoes = await carregarClassificacoesChamados();

  const valores = {
    titulo: String(req.body?.titulo ?? "").trim(),
    descricao: String(req.body?.descricao ?? "").trim(),
    categoria: String(req.body?.categoria ?? "").trim(),
    prioridade: String(req.body?.prioridade ?? "").trim(),
  };
  let chamadoCriado = null;
  let anexos = [];

  try {
    if (req.uploadError) throw new Error(req.uploadError);
    anexos = mapearArquivosUpload(req.files);

    if (valores.titulo.length < 6 || valores.titulo.length > 120) {
      throw new Error("Titulo deve ter entre 6 e 120 caracteres.");
    }
    if (valores.descricao.length < 20 || valores.descricao.length > 5000) {
      throw new Error("Descricao deve ter entre 20 e 5000 caracteres.");
    }

    if (!classificacoes.categoriasValores.includes(valores.categoria)) {
      throw new Error("Selecione uma categoria valida.");
    }

    if (!classificacoes.prioridadesValores.includes(valores.prioridade)) {
      throw new Error("Selecione uma prioridade valida.");
    }

    chamadoCriado = await criarChamado({
      usuarioId: usuarioSessao.id,
      usuarioNome: usuarioSessao.nome,
      usuarioLogin: usuarioSessao.usuario,
      anexos,
      ...valores,
    });

    const recipients = await listarUsuariosPorPerfis(["tecnico", "admin"]);
    const destinatarios = (recipients || [])
      .map((u) => ({
        tipo: u.perfil === "admin" ? "admin" : "tecnico",
        id: String(u._id),
        perfilDestinatario: u.perfil,
      }))
      .filter((d) => d.id !== String(usuarioSessao.id));

    if (destinatarios.length) {
      await notificarNovoChamadoFila({
        chamadoId: String(chamadoCriado._id),
        tituloChamado: chamadoCriado.titulo,
        destinatarios,
        autor: {
          tipo: "usuario",
          id: String(usuarioSessao.id),
          nome: usuarioSessao.nome,
          login: usuarioSessao.usuario,
        },
      });
    }

    await registrarEventoSistema({
      req,
      nivel: "info",
      modulo: "chamados",
      evento: "chamado.criado",
      acao: "criar",
      resultado: "sucesso",
      mensagem: `Chamado #${chamadoCriado.numero} criado por usuario.`,
      alvo: {
        tipo: "chamado",
        id: String(chamadoCriado._id),
        numero: String(chamadoCriado.numero),
      },
      meta: {
        categoria: chamadoCriado.categoria,
        prioridade: chamadoCriado.prioridade,
        qtdAnexos: anexos.length,
      },
    });

    req.session.flash = { tipo: "success", mensagem: "Chamado criado com sucesso!" };
    return res.redirect("/chamados/meus");
  } catch (e) {
    if (!chamadoCriado) {
      await apagarArquivosUpload(req.files);
    }

    console.error("Erro ao criar chamado:", e);
    return res.status(400).render("chamados/novo", {
      layout: "layout-app",
      titulo: "Abrir chamado",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamado-novo.css",
      usuarioSessao,
      opcoesClassificacao: classificacoes,
      erroGeral: e?.message || "Nao foi possivel registrar o chamado.",
      valores,
    });
  }
}

export async function meusChamadosGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  const flash = req.session?.flash || null;
  if (req.session) req.session.flash = null;
  const classificacoes = await carregarClassificacoesChamados();

  const filtros = lerFiltrosListaChamados(req.query, {
    limitDefault: 10,
    allowResponsavelLogin: true,
    categoriasPermitidas: classificacoes.categoriasValores,
    prioridadesPermitidas: classificacoes.prioridadesValores,
  });
  const opcoes = obterOpcoesFiltrosChamados({
    incluirAlocacao: false,
    categorias: classificacoes.categorias,
    prioridades: classificacoes.prioridades,
    categoriasLabels: classificacoes.categoriasLabels,
    prioridadesLabels: classificacoes.prioridadesLabels,
  });

  try {
    const lista = await listarChamados({ solicitanteId: usuarioSessao.id, limit: 200 });
    const resultado = aplicarFiltrosListaChamados(lista, filtros, {
      usuarioLogin: usuarioSessao.usuario,
    });

    const chamados = (resultado.itens || []).map((c) => ({
      id: String(c._id),
      numero: c.numero,
      titulo: c.titulo,
      status: c.status || "-",
      statusLabel: rotuloStatusChamado(c.status),
      prioridade: c.prioridade || "-",
      prioridadeLabel: rotuloPrioridadeChamado(c.prioridade, classificacoes.prioridadesLabels),
      categoria: c.categoria || "-",
      categoriaLabel: rotuloCategoriaChamado(c.categoria, classificacoes.categoriasLabels),
      quando: c.createdAt ? new Date(c.createdAt).toLocaleString("pt-BR") : "-",
      responsavel: c.responsavelLogin
        ? `${c.responsavelNome || ""} (${c.responsavelLogin})`
        : "-",
      solicitante: c?.criadoPor?.login
        ? `${c.criadoPor.nome || ""} (${c.criadoPor.login})`
        : "-",
    }));

    return res.render("chamados/meus", {
      layout: "layout-app",
      titulo: "Meus chamados",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamados.css",
      jsExtra: "/js/chamados-filters.js",
      usuarioSessao,
      chamados,
      filtros,
      paginacao: {
        total: resultado.total,
        page: resultado.page,
        pages: resultado.pages,
        limit: resultado.limit,
      },
      paginacaoQuery: { ...filtros },
      opcoes,
      totalFiltrados: resultado.total,
      totalBase: Array.isArray(lista) ? lista.length : 0,
      erroGeral: null,
      flash,
    });
  } catch (e) {
    console.error("Erro ao listar meus chamados:", e);
    const flashErro = flash || {
      tipo: "error",
      mensagem: "Nao foi possivel carregar seus chamados.",
    };

    return res.status(500).render("chamados/meus", {
      layout: "layout-app",
      titulo: "Meus chamados",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamados.css",
      jsExtra: "/js/chamados-filters.js",
      usuarioSessao,
      chamados: [],
      filtros,
      paginacao: {
        total: 0,
        page: filtros.page || 1,
        pages: 1,
        limit: filtros.limit || 10,
      },
      paginacaoQuery: { ...filtros },
      opcoes,
      totalFiltrados: 0,
      totalBase: 0,
      erroGeral: "Nao foi possivel carregar seus chamados.",
      flash: flashErro,
    });
  }
}

export async function chamadoEditarGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");
  const classificacoes = await carregarClassificacoesChamados();

  const chamado = await acharChamadoPorIdDoUsuario(req.params.id, usuarioSessao.id);
  if (!chamado) {
    return res.status(404).render("erros/erro", {
      layout: "layout-app",
      titulo: "Nao encontrado",
      mensagem: "Chamado nao encontrado.",
    });
  }

  const bloqueado = chamado.status !== "aberto";

  if (bloqueado) {
    if (req.session) {
      req.session.flash = {
        tipo: "info",
        mensagem: "Chamado fechado nao pode ser editado. Exibindo os detalhes.",
      };
    }
    return res.redirect(`/chamados/${req.params.id}`);
  }

  return res.render("chamados/editar", {
    layout: "layout-app",
    titulo: `Editar chamado #${chamado.numero}`,
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamado-novo.css",
      usuarioSessao,
      opcoesClassificacao: classificacoes,
      erroGeral: null,
      bloqueado,
    chamado: {
      id: String(chamado._id),
      numero: chamado.numero,
      status: chamado.status,
    },
    valores: {
      titulo: chamado.titulo || "",
      descricao: chamado.descricao || "",
      categoria: chamado.categoria || "",
    },
  });
}

export async function chamadoEditarPost(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");
  const classificacoes = await carregarClassificacoesChamados();

  const valores = {
    titulo: String(req.body?.titulo ?? "").trim(),
    descricao: String(req.body?.descricao ?? "").trim(),
    categoria: String(req.body?.categoria ?? "").trim(),
  };

  const chamadoAtual = await acharChamadoPorIdDoUsuario(req.params.id, usuarioSessao.id);
  if (!chamadoAtual) {
    return res.status(404).render("erros/erro", {
      layout: "layout-app",
      titulo: "Nao encontrado",
      mensagem: "Chamado nao encontrado.",
    });
  }

  const bloqueado = chamadoAtual.status !== "aberto";
  if (bloqueado) {
    if (req.session) {
      req.session.flash = {
        tipo: "info",
        mensagem: "Chamado fechado nao pode ser editado. Exibindo os detalhes.",
      };
    }
    return res.redirect(`/chamados/${req.params.id}`);
  }

  try {
    const chamadoEditado = await editarChamadoDoUsuario(
      req.params.id,
      usuarioSessao.id,
      valores,
      { porLogin: usuarioSessao.usuario },
    );

    await registrarEventoSistema({
      req,
      nivel: "info",
      modulo: "chamados",
      evento: "chamado.editado_usuario",
      acao: "editar",
      resultado: "sucesso",
      mensagem: `Chamado #${chamadoEditado?.numero || ""} editado pelo solicitante.`,
      alvo: {
        tipo: "chamado",
        id: String(chamadoEditado?._id || req.params.id),
        numero: String(chamadoEditado?.numero || ""),
      },
      meta: {
        campos: Object.keys(valores || {}),
      },
    });

    req.session.flash = { tipo: "success", mensagem: "Chamado atualizado com sucesso!" };
    return res.redirect("/chamados/meus");
  } catch (e) {
    console.error("Erro ao editar chamado:", e);

    const chamadoDepois =
      (await acharChamadoPorIdDoUsuario(req.params.id, usuarioSessao.id)) || chamadoAtual;
    const bloqueadoDepois = chamadoDepois.status !== "aberto";

    return res.status(400).render("chamados/editar", {
      layout: "layout-app",
      titulo: `Editar chamado #${chamadoDepois.numero}`,
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamado-novo.css",
      usuarioSessao,
      opcoesClassificacao: classificacoes,
      erroGeral: e?.message || "Nao foi possivel atualizar o chamado.",
      bloqueado: bloqueadoDepois,
      chamado: {
        id: String(chamadoDepois._id),
        numero: chamadoDepois.numero,
        status: chamadoDepois.status,
      },
      valores,
    });
  }
}
