import {
  criarChamado,
  listarMeusChamados,
  acharChamadoPorIdDoUsuario,
  atualizarChamadoDoUsuario,
} from "../../repos/chamados/chamadosRepo.js";

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

  try {
    // validações mínimas
    if (valores.titulo.length < 6 || valores.titulo.length > 120) throw new Error("Título deve ter entre 6 e 120 caracteres.");
    if (valores.descricao.length < 20 || valores.descricao.length > 5000) throw new Error("Descrição deve ter entre 20 e 5000 caracteres.");

    const categoriasPermitidas = ["acesso", "incidente", "solicitacao", "infra", "outros"];
    if (!categoriasPermitidas.includes(valores.categoria)) throw new Error("Selecione uma categoria válida.");

    const prioridadesPermitidas = ["baixa", "media", "alta", "critica"];
    if (!prioridadesPermitidas.includes(valores.prioridade)) throw new Error("Selecione uma prioridade válida.");

    await criarChamado({
      usuarioId: usuarioSessao.id,
      usuarioNome: usuarioSessao.nome,
      usuarioLogin: usuarioSessao.usuario, // ou login
      ...valores,
    });

    req.session.flash = { tipo: "success", mensagem: "Chamado criado com sucesso!" };
    return res.redirect("/chamados/meus");
  } catch (e) {
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
    const lista = await listarMeusChamados(usuarioSessao.id, { limit: 50 });

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

/**
 * GET editar (usuário): só dono
 * Regra de edição por status será aplicada no POST (repo já exige status=aberto)
 */
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

  // 1) Ownership check ANTES de atualizar (segurança + UX)
  const chamadoAtual = await acharChamadoPorIdDoUsuario(req.params.id, usuarioSessao.id);
  if (!chamadoAtual) {
    return res.status(404).render("erros/erro", {
      layout: "layout-app",
      titulo: "Não encontrado",
      mensagem: "Chamado não encontrado.",
    });
  }

  // 2) Se status não é aberto, não tenta atualizar (regra profissional)
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
    await atualizarChamadoDoUsuario(
      req.params.id,
      usuarioSessao.id,
      valores,
      { porLogin: usuarioSessao.usuario }
    );

    req.session.flash = { tipo: "success", mensagem: "Chamado atualizado com sucesso!" };
    return res.redirect("/chamados/meus");
  } catch (e) {
    console.error("Erro ao editar chamado:", e);

    // Recarrega para garantir status/numero atualizados (se mudou entre o check e o update)
    const chamadoDepois = await acharChamadoPorIdDoUsuario(req.params.id, usuarioSessao.id) || chamadoAtual;
    const bloqueadoDepois = (chamadoDepois.status !== "aberto");

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