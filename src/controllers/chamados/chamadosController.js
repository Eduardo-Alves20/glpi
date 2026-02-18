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
    sucesso: "", // não usamos mais banner; vamos usar SweetAlert via querystring
  });
}

export function chamadoNovoGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  return renderNovo(res, { usuarioSessao });
}

export async function chamadoNovoPost(req, res) {
  const usuarioSessao = req.session?.usuario || null;

  const titulo = String(req.body.titulo || "").trim();
  const categoria = String(req.body.categoria || "").trim();
  const prioridade = String(req.body.prioridade || "").trim();
  const descricao = String(req.body.descricao || "").trim();

  const dados = { titulo, categoria, prioridade, descricao };
  const erros = {};

  // validação UX (repo deve validar novamente por segurança)
  if (!titulo) erros.titulo = "Informe um título.";
  if (titulo && titulo.length < 6) erros.titulo = "Título muito curto (mín. 6 caracteres).";

  if (!categoria) erros.categoria = "Selecione uma categoria.";
  if (!prioridade) erros.prioridade = "Selecione uma prioridade.";

  if (!descricao) erros.descricao = "Descreva o problema/solicitação.";
  if (descricao && descricao.length < 20) erros.descricao = "Descrição muito curta (mín. 20 caracteres).";

  if (Object.keys(erros).length > 0) {
    return res.status(400).render("chamados/novo", {
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

  try {
    await criarChamado({
      usuarioId: usuarioSessao?.id,
      usuarioNome: usuarioSessao?.nome,
      usuarioLogin: usuarioSessao?.usuario,
      titulo,
      descricao,
      categoria,
      prioridade,
    });

    // ✅ SweetAlert via /js/alerts.js lendo ok=1
    return res.redirect("/chamados/meus?ok=1");
  } catch (e) {
    console.error("Erro ao criar chamado:", e);
    return res.status(500).render("chamados/novo", {
      layout: "layout-app",
      titulo: "Abrir chamado",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamados.css",
      usuarioSessao,
      dados,
      erros: { geral: "Não foi possível registrar o chamado. Tente novamente." },
      sucesso: "",
    });
  }
}

export async function meusChamadosGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;

  try {
    const lista = await listarMeusChamados(usuarioSessao?.id, { limit: 50 });

    const chamados = (lista || []).map((c) => ({
      id: String(c._id),
      numero: c.numero,
      titulo: c.titulo,
      status: c.status,
      quando: c.createdAt ? new Date(c.createdAt).toLocaleString("pt-BR") : "—",
    }));

    return res.render("chamados/meus", {
      layout: "layout-app",
      titulo: "Meus chamados",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamados.css",
      usuarioSessao,
      chamados,
    });
  } catch (e) {
    console.error("Erro ao listar meus chamados:", e);
    return res.status(500).render("chamados/meus", {
      layout: "layout-app",
      titulo: "Meus chamados",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamados.css",
      usuarioSessao,
      chamados: [],
      erroGeral: "Não foi possível carregar seus chamados.",
    });
  }
}
