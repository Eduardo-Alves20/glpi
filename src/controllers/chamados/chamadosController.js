import {
  criarChamado,
  listarChamados,
} from "../../repos/chamados/core/chamadosCoreRepo.js";
import {
  acharChamadoPorIdDoUsuario,
  editarChamadoDoUsuario,
} from "../../repos/chamados/usuario/chamadosUsuarioRepo.js";
import { listarUsuariosPorPerfis } from "../../repos/usuariosRepo.js";
import { notificarNovoChamadoFila } from "../../service/notificacoesService.js";
import { registrarEventoSistema } from "../../service/logsService.js";
import { apagarArquivosUpload, mapearArquivosUpload } from "../../service/anexosService.js";

export async function chamadoNovoGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;

  return res.render("chamados/novo", {
    layout: "layout-app",
    titulo: "Abrir chamado",
    cssPortal: "/styles/usuario.css",
    cssExtra: "/styles/chamado-novo.css",
    usuarioSessao,
    erroGeral: null,
    valores: { titulo: "", descricao: "", categoria: "", prioridade: "" },
  });
}

export async function chamadoNovoPost(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

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

    // validações mínimas
    if (valores.titulo.length < 6 || valores.titulo.length > 120) {
      throw new Error("Título deve ter entre 6 e 120 caracteres.");
    }
    if (valores.descricao.length < 20 || valores.descricao.length > 5000) {
      throw new Error("Descrição deve ter entre 20 e 5000 caracteres.");
    }

    const categoriasPermitidas = ["acesso", "incidente", "solicitacao", "infra", "outros"];
    if (!categoriasPermitidas.includes(valores.categoria)) {
      throw new Error("Selecione uma categoria válida.");
    }

    const prioridadesPermitidas = ["baixa", "media", "alta", "critica"];
    if (!prioridadesPermitidas.includes(valores.prioridade)) {
      throw new Error("Selecione uma prioridade válida.");
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
      erroGeral: e?.message || "Não foi possível registrar o chamado.",
      valores,
    });
  }
}

export async function meusChamadosGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  const flash = req.session?.flash || null;
  if (req.session) req.session.flash = null;

  try {
    const lista = await listarChamados({ solicitanteId: usuarioSessao.id, limit: 50 });

    const chamados = (lista || []).map((c) => ({
      id: String(c._id),
      numero: c.numero,
      titulo: c.titulo,
      status: c.status || "—",
      prioridade: c.prioridade || "—",
      categoria: c.categoria || "—",
      quando: c.createdAt ? new Date(c.createdAt).toLocaleString("pt-BR") : "—",
      responsavel: c.responsavelLogin ? `${c.responsavelNome || ""} (${c.responsavelLogin})` : "—",
      solicitante: c?.criadoPor?.login ? `${c.criadoPor.nome || ""} (${c.criadoPor.login})` : "—",
    }));

    return res.render("chamados/meus", {
      layout: "layout-app",
      titulo: "Meus chamados",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamados.css",
      usuarioSessao,
      chamados,
      erroGeral: null,
      flash,
    });
  } catch (e) {
    console.error("Erro ao listar meus chamados:", e);
    const flashErro = flash || { tipo: "error", mensagem: "Não foi possível carregar seus chamados." };

    return res.status(500).render("chamados/meus", {
      layout: "layout-app",
      titulo: "Meus chamados",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamados.css",
      usuarioSessao,
      chamados: [],
      erroGeral: "Não foi possível carregar seus chamados.",
      flash: flashErro,
    });
  }
}

export async function chamadoEditarGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  const chamado = await acharChamadoPorIdDoUsuario(req.params.id, usuarioSessao.id);
  if (!chamado) {
    return res.status(404).render("erros/erro", {
      layout: "layout-app",
      titulo: "Não encontrado",
      mensagem: "Chamado não encontrado.",
    });
  }

  const bloqueado = chamado.status !== "aberto";

  return res.render("chamados/editar", {
    layout: "layout-app",
    titulo: `Editar chamado #${chamado.numero}`,
    cssPortal: "/styles/usuario.css",
    cssExtra: "/styles/chamado-novo.css",
    usuarioSessao,
    erroGeral: bloqueado ? "Este chamado não pode mais ser editado (status diferente de aberto)." : null,
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

  const valores = {
    titulo: String(req.body?.titulo ?? "").trim(),
    descricao: String(req.body?.descricao ?? "").trim(),
    categoria: String(req.body?.categoria ?? "").trim(),
  };

  // 1) Ownership check ANTES de atualizar
  const chamadoAtual = await acharChamadoPorIdDoUsuario(req.params.id, usuarioSessao.id);
  if (!chamadoAtual) {
    return res.status(404).render("erros/erro", {
      layout: "layout-app",
      titulo: "Não encontrado",
      mensagem: "Chamado não encontrado.",
    });
  }

  // 2) Se status não é aberto, não tenta atualizar
  const bloqueado = chamadoAtual.status !== "aberto";
  if (bloqueado) {
    return res.status(400).render("chamados/editar", {
      layout: "layout-app",
      titulo: `Editar chamado #${chamadoAtual.numero}`,
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamado-novo.css",
      usuarioSessao,
      erroGeral: "Este chamado não pode mais ser editado (status diferente de aberto).",
      bloqueado: true,
      chamado: {
        id: String(chamadoAtual._id),
        numero: chamadoAtual.numero,
        status: chamadoAtual.status,
      },
      valores: {
        titulo: chamadoAtual.titulo || valores.titulo,
        descricao: chamadoAtual.descricao || valores.descricao,
        categoria: chamadoAtual.categoria || valores.categoria,
      },
    });
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

    const chamadoDepois = (await acharChamadoPorIdDoUsuario(req.params.id, usuarioSessao.id)) || chamadoAtual;
    const bloqueadoDepois = chamadoDepois.status !== "aberto";

    return res.status(400).render("chamados/editar", {
      layout: "layout-app",
      titulo: `Editar chamado #${chamadoDepois.numero}`,
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamado-novo.css",
      usuarioSessao,
      erroGeral: e?.message || "Não foi possível atualizar o chamado.",
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