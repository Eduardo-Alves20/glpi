import { criarChamado, listarMeusChamados } from "../../repos/chamados/chamadosRepo.js";

function renderNovo(res, { usuarioSessao, dados = {}, erros = {} } = {}) {
  return res.render("chamados/novo", {
    layout: "layout-app",
    titulo: "Abrir chamado",
    cssPortal: "/styles/usuario.css",
    cssExtra: "/styles/chamados.css",

    usuarioSessao,
    dados,
    erros,
    sucesso: "",
  });
}

export async function chamadoNovoGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;

  return res.render("chamados/novo", {
    layout: "layout-app",
    titulo: "Abrir chamado",
    cssPortal: "/styles/usuario.css",
   cssExtra: "/styles/chamado-novo.css",
   usuarioSessao,
    
    erroGeral: null, 
    valores: {
      titulo: "",
      descricao: "",
      categoria: "",
      prioridade: "",
    },
  });
}


export async function chamadoNovoPost(req, res) {
  const usuarioSessao = req.session?.usuario || null;

  // defesa: sem login não cria chamado
  if (!usuarioSessao?.id) return res.redirect("/auth");

  // normaliza valores
  const valores = {
    titulo: String(req.body?.titulo ?? "").trim(),
    descricao: String(req.body?.descricao ?? "").trim(),
    categoria: String(req.body?.categoria ?? "").trim(),
    prioridade: String(req.body?.prioridade ?? "").trim(),
  };

  try {
    // validações mínimas (server-side)
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

    // cria de fato no banco
    await criarChamado({
      usuarioId: usuarioSessao.id,                  
  usuarioNome: usuarioSessao.nome,              
  usuarioLogin: usuarioSessao.usuario,
      titulo: valores.titulo,
      descricao: valores.descricao,
      categoria: valores.categoria,
      prioridade: valores.prioridade,
      
    });
    

    // flash para SweetAlert na próxima tela
    req.session.flash = { tipo: "success", mensagem: "Chamado criado com sucesso!" };

    return res.redirect("/chamados/meus");
  } catch (e) {
    console.error("Erro ao criar chamado:", e);

    // opcional: flash de erro (se você quiser alert também)
    // req.session.flash = { tipo: "error", mensagem: e?.message || "Não foi possível registrar o chamado." };

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

  // defesa: rota não deve rodar sem usuário logado
  if (!usuarioSessao?.id) return res.redirect("/auth");

  // flash (para SweetAlert após redirect)
  const flash = req.session?.flash || null;
  if (req.session) req.session.flash = null;

  try {
    // limite defensivo (evita payload grande / abuso)
    const limit = 50;

    const lista = await listarMeusChamados(usuarioSessao.id, { limit });

    const chamados = (lista || []).map((c) => ({
      id: String(c._id),
      numero: c.numero,
      titulo: c.titulo,
      status: c.status,
      prioridade: c.prioridade || "—",
      categoria: c.categoria || "—",
      quando: c.createdAt ? new Date(c.createdAt).toLocaleString("pt-BR") : "—",
    }));

    return res.render("chamados/meus", {
      layout: "layout-app",
      titulo: "Meus chamados",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamados.css",
      usuarioSessao,
      chamados,
      erroGeral: null,
      flash, // <<< ADD
    });
  } catch (e) {
    console.error("Erro ao listar meus chamados:", e);

    // opcional: se não tem flash, seta um erro genérico pra alert também
    const flashErro = flash || { tipo: "error", mensagem: "Não foi possível carregar seus chamados." };

    return res.status(500).render("chamados/meus", {
      layout: "layout-app",
      titulo: "Meus chamados",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamados.css",
      usuarioSessao,
      chamados: [],
      erroGeral: "Não foi possível carregar seus chamados.",
      flash: flashErro, // <<< ADD
    });
  }
}


