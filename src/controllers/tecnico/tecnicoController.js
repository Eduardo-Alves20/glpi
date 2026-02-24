import {
  listarFilaChamados,
  listarMeusAtendimentos,
  assumirChamado,
} from "../../repos/chamados/chamadosRepo.js";

import { obterHomeTecnicoData } from "../../repos/tecnico/tecnicoDashboardRepo.js";

export async function tecnicoFilaGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  const flash = req.session?.flash || null;
  if (req.session) req.session.flash = null;

  try {
    const lista = await listarFilaChamados({ status: ["aberto", "em_atendimento"], limit: 80 });

    const chamados = (lista || []).map((c) => ({
      id: String(c._id),
      numero: c.numero,
      titulo: c.titulo,
      categoria: c.categoria || "—",
      prioridade: c.prioridade || "—",
      status: c.status || "—",
      quando: c.createdAt ? new Date(c.createdAt).toLocaleString("pt-BR") : "—",
      solicitante: c?.criadoPor?.login ? `${c.criadoPor.nome || ""} (${c.criadoPor.login})` : "—",
      responsavel: c.responsavelLogin ? `${c.responsavelNome || ""} (${c.responsavelLogin})` : "—",
      isMeu: c.responsavelLogin && c.responsavelLogin === usuarioSessao.usuario,
    }));

    return res.render("tecnico/fila", {
      layout: "layout-app",
      titulo: "Fila de chamados",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamados.css",
      usuarioSessao,
      chamados,
      erroGeral: null,
      flash,
    });
  } catch (e) {
    console.error("Erro ao carregar fila técnico:", e);
    return res.status(500).render("tecnico/fila", {
      layout: "layout-app",
      titulo: "Fila de chamados",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamados.css",
      usuarioSessao,
      chamados: [],
      erroGeral: "Não foi possível carregar a fila.",
      flash: flash || { tipo: "error", mensagem: "Não foi possível carregar a fila." },
    });
  }
}

export async function tecnicoAssumirPost(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  try {
    await assumirChamado(
      req.params.id,
      { id: usuarioSessao.id, nome: usuarioSessao.nome, usuario: usuarioSessao.usuario },
      { porLogin: usuarioSessao.usuario }
    );

    req.session.flash = { tipo: "success", mensagem: "Chamado assumido." };
    return res.redirect("/tecnico/chamados");
  } catch (e) {
    console.error("Erro ao assumir chamado:", e);
    req.session.flash = { tipo: "error", mensagem: e?.message || "Não foi possível assumir o chamado." };
    return res.redirect(`/tecnico/chamados/${req.params.id}`);
  }
}

export async function tecnicoHomeGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  const flash = req.session?.flash || null;
  if (req.session) req.session.flash = null;

  const { kpis, logs, ultimosChamados } = await obterHomeTecnicoData(usuarioSessao.id);

  return res.render("tecnico/home", {
    layout: "layout-app",
    titulo: "Home Técnico",
    ambiente: process.env.AMBIENTE || "LOCAL",
    usuarioSessao,
    flash,
    kpis,
    logs,
    ultimosChamados,
    ultimosUsuarios: [], // não quebra view
  });
}

export async function tecnicoMeusChamadosGet(req, res) {
  const usuarioSessao = req.session?.usuario || null;
  if (!usuarioSessao?.id) return res.redirect("/auth");

  const flash = req.session?.flash || null;
  if (req.session) req.session.flash = null;

  try {
    const lista = await listarMeusAtendimentos(usuarioSessao.id, { limit: 80 });

    const chamados = (lista || []).map((c) => ({
      id: String(c._id),
      numero: c.numero,
      titulo: c.titulo,
      categoria: c.categoria || "—",
      prioridade: c.prioridade || "—",
      status: c.status || "—",
      quando: c.updatedAt ? new Date(c.updatedAt).toLocaleString("pt-BR") : (c.createdAt ? new Date(c.createdAt).toLocaleString("pt-BR") : "—"),
      solicitante: c?.criadoPor?.login || c?.criadoPor?.nome || "—",
    }));

    return res.render("tecnico/meus-chamados", {
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
    console.error("Erro ao carregar chamados atribuídos:", e);
    return res.status(500).render("tecnico/meus-chamados", {
      layout: "layout-app",
      titulo: "Meus chamados",
      cssPortal: "/styles/usuario.css",
      cssExtra: "/styles/chamados.css",
      usuarioSessao,
      chamados: [],
      erroGeral: "Não foi possível carregar seus chamados.",
      flash: flash || { tipo: "error", mensagem: "Não foi possível carregar seus chamados." },
    });
  }
}
