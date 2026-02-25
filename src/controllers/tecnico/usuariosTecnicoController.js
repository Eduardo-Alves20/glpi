import {
  validarNovoUsuario,
  validarAtualizacaoUsuario,
} from "../../compartilhado/validacao/usuario.js";
import { gerarHashSenha } from "../../compartilhado/seguranca/senha.js";
import {
  criarUsuario,
  acharConflitoUsuarioEmail,
  listarUsuariosPaginadoFiltrado,
  acharUsuarioPorIdSeguro,
  atualizarUsuarioAdmin,
} from "../../repos/usuariosRepo.js";
import { sugerirLoginsDisponiveis } from "../../compartilhado/usuario/sugestaoLogin.js";
import { registrarEventoSistema } from "../../service/logsService.js";
import { normalizarPaginacao } from "../../service/paginacaoService.js";
import { pegarDb } from "../../compartilhado/db/mongo.js";

const COL_SESSOES = "sessoes";
const PERFIS_PERMITIDOS_TECNICO = ["tecnico", "usuario"];

function viewBaseTecnico(req, extra = {}) {
  return {
    layout: "layout-app.ejs",
    ambiente: process.env.AMBIENTE || "LOCAL",
    cssPortal: "/styles/usuario.css",
    cssExtra: "/styles/usuario-perfil.css",
    req,
    ...extra,
  };
}

function viewBaseNovoUsuario(req, extra = {}) {
  return viewBaseTecnico(req, {
    titulo: "GLPI - Novo Usuario",
    jsExtra: ["/js/usuarios-novo.js"],
    ...extra,
  });
}

function viewBaseEditarUsuario(req, extra = {}) {
  return viewBaseTecnico(req, {
    titulo: "GLPI - Editar Usuario",
    ...extra,
  });
}

function lerFiltrosUsuarios(query = {}) {
  const perfilRaw = String(query.perfil || "").trim().toLowerCase();
  const statusRaw = String(query.status || "").trim().toLowerCase();

  return {
    q: String(query.q || "").trim().slice(0, 120),
    perfil: ["admin", "tecnico", "usuario"].includes(perfilRaw) ? perfilRaw : "",
    status: ["ativo", "bloqueado"].includes(statusRaw) ? statusRaw : "",
  };
}

function montarValoresUsuario(usuario = {}) {
  return {
    nome: String(usuario.nome || "").trim(),
    usuario: String(usuario.usuario || "").trim().toLowerCase(),
    email: String(usuario.email || "").trim().toLowerCase(),
    perfil: String(usuario.perfil || "").trim().toLowerCase(),
    status: String(usuario.status || "ativo").trim().toLowerCase(),
  };
}

function mapearUsuarioParaTecnico(usuario = {}) {
  const perfil = String(usuario.perfil || "").trim().toLowerCase();
  const isAdmin = perfil === "admin";
  return {
    ...usuario,
    id: String(usuario._id || usuario.id || ""),
    usuario: isAdmin ? "restrito" : String(usuario.usuario || "").trim().toLowerCase(),
    podeEditar: !isAdmin,
    isAdmin,
  };
}

async function invalidarSessoesDoUsuario(usuarioId) {
  const db = pegarDb();
  await db.collection(COL_SESSOES).deleteMany({
    "session.usuario.id": String(usuarioId || "").trim(),
  });
}

function bloquearEdicaoAdmin(req, res) {
  if (req.session) {
    req.session.flash = {
      tipo: "error",
      mensagem: "Por seguranca, tecnico nao pode editar usuarios admin.",
    };
  }
  return res.redirect("/tecnico/usuarios");
}

export async function tecnicoUsuariosIndexGet(req, res) {
  const filtros = lerFiltrosUsuarios(req.query);
  const { page, limit } = normalizarPaginacao(
    { page: req.query?.page, limit: req.query?.limit },
    { pageDefault: 1, limitDefault: 10, limitMin: 10, limitMax: 200 },
  );

  const dados = await listarUsuariosPaginadoFiltrado({
    page,
    limit,
    filtros,
  });

  const usuarios = (dados.itens || []).map((u) => mapearUsuarioParaTecnico(u));
  const flash = req.session?.flash || null;
  if (req.session) req.session.flash = null;

  return res.render(
    "tecnico/usuarios/index",
    viewBaseTecnico(req, {
      titulo: "GLPI - Usuarios",
      usuarios,
      filtros,
      flash,
      paginacao: {
        total: dados.total || 0,
        page: dados.page || 1,
        pages: dados.pages || 1,
        limit: dados.limit || limit,
      },
      paginacaoQuery: {
        ...filtros,
        limit: dados.limit || limit,
      },
    }),
  );
}

export function tecnicoUsuariosNovoGet(req, res) {
  return res.render(
    "tecnico/usuarios/novo",
    viewBaseNovoUsuario(req, {
      erros: [],
      valores: {},
    }),
  );
}

export async function tecnicoUsuariosCreatePost(req, res) {
  const v = validarNovoUsuario(req.body, { allowedProfiles: PERFIS_PERMITIDOS_TECNICO });

  if (!v.ok) {
    return res.status(400).render(
      "tecnico/usuarios/novo",
      viewBaseNovoUsuario(req, {
        erros: v.erros,
        valores: v.valores,
      }),
    );
  }

  try {
    const conflito = await acharConflitoUsuarioEmail({
      usuario: v.valores.usuario,
      email: v.valores.email,
    });

    if (conflito) {
      return res.status(409).render(
        "tecnico/usuarios/novo",
        viewBaseNovoUsuario(req, {
          erros: ["Ja existe usuario com esse login ou e-mail."],
          valores: v.valores,
        }),
      );
    }

    const senhaHash = await gerarHashSenha(v.senhaTemporaria);
    const doc = {
      nome: v.valores.nome,
      usuario: v.valores.usuario,
      email: v.valores.email,
      perfil: v.valores.perfil,
      status: v.valores.status,
      senhaHash,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
      updatedAt: new Date(),
    };

    await criarUsuario(doc);

    await registrarEventoSistema({
      req,
      nivel: "security",
      modulo: "tecnico",
      evento: "tecnico.usuario.criado",
      acao: "criar_usuario",
      resultado: "sucesso",
      mensagem: `Usuario ${doc.usuario} criado por tecnico.`,
      alvo: {
        tipo: "usuario",
        login: doc.usuario,
        perfil: doc.perfil,
      },
      meta: {
        status: doc.status,
        email: doc.email,
      },
    });

    if (req.session) {
      req.session.flash = { tipo: "success", mensagem: "Usuario criado com sucesso." };
    }

    return res.redirect("/tecnico/usuarios");
  } catch (e) {
    console.error("Erro ao criar usuario (tecnico):", e);
    return res.status(400).render(
      "tecnico/usuarios/novo",
      viewBaseNovoUsuario(req, {
        erros: [e?.message || "Nao foi possivel criar o usuario."],
        valores: v.valores,
      }),
    );
  }
}

export async function tecnicoUsuariosEditarGet(req, res) {
  const usuario = await acharUsuarioPorIdSeguro(req.params.id);
  if (!usuario) {
    if (req.session) {
      req.session.flash = { tipo: "error", mensagem: "Usuario nao encontrado." };
    }
    return res.redirect("/tecnico/usuarios");
  }

  if (String(usuario.perfil || "").toLowerCase() === "admin") {
    return bloquearEdicaoAdmin(req, res);
  }

  return res.render(
    "tecnico/usuarios/editar",
    viewBaseEditarUsuario(req, {
      usuarioId: String(usuario._id),
      valores: montarValoresUsuario(usuario),
      erros: [],
    }),
  );
}

export async function tecnicoUsuariosEditarPost(req, res) {
  const usuarioId = String(req.params.id || "").trim();
  const usuarioSessao = req.session?.usuario || null;

  const atual = await acharUsuarioPorIdSeguro(usuarioId);
  if (!atual) {
    if (req.session) {
      req.session.flash = { tipo: "error", mensagem: "Usuario nao encontrado." };
    }
    return res.redirect("/tecnico/usuarios");
  }

  if (String(atual.perfil || "").toLowerCase() === "admin") {
    return bloquearEdicaoAdmin(req, res);
  }

  const v = validarAtualizacaoUsuario(req.body, { allowedProfiles: PERFIS_PERMITIDOS_TECNICO });
  if (!v.ok) {
    return res.status(400).render(
      "tecnico/usuarios/editar",
      viewBaseEditarUsuario(req, {
        usuarioId,
        valores: {
          ...montarValoresUsuario(atual),
          ...v.valores,
        },
        erros: v.erros,
      }),
    );
  }

  const confirmouAlteracaoLogin = String(req.body?.confirmarAlteracaoLogin || "").trim() === "1";
  const loginAtual = String(atual.usuario || "").trim().toLowerCase();
  const loginNovo = String(v.valores.usuario || "").trim().toLowerCase();
  const tentouAlterarLogin = loginAtual !== loginNovo;

  if (tentouAlterarLogin && !confirmouAlteracaoLogin) {
    return res.status(400).render(
      "tecnico/usuarios/editar",
      viewBaseEditarUsuario(req, {
        usuarioId,
        valores: {
          ...montarValoresUsuario(atual),
          ...v.valores,
        },
        erros: ["Confirme no modal antes de alterar o login do usuario."],
      }),
    );
  }

  try {
    const conflito = await acharConflitoUsuarioEmail({
      usuario: v.valores.usuario,
      email: v.valores.email,
      excluirId: usuarioId,
    });

    if (conflito) {
      return res.status(409).render(
        "tecnico/usuarios/editar",
        viewBaseEditarUsuario(req, {
          usuarioId,
          valores: {
            ...montarValoresUsuario(atual),
            ...v.valores,
          },
          erros: ["Ja existe usuario com esse login ou e-mail."],
        }),
      );
    }

    const senhaHash = v.senhaTemporaria ? await gerarHashSenha(v.senhaTemporaria) : null;

    const atualizado = await atualizarUsuarioAdmin(usuarioId, {
      ...v.valores,
      ...(senhaHash ? { senhaHash } : {}),
    });

    const mudouLogin = atual.usuario !== atualizado.usuario;
    const mudouPerfil = atual.perfil !== atualizado.perfil;
    const mudouStatus = atual.status !== atualizado.status;
    const mudouSenha = Boolean(senhaHash);
    const deveRevogarSessoes = mudouLogin || mudouPerfil || mudouStatus || mudouSenha;

    if (deveRevogarSessoes) {
      await invalidarSessoesDoUsuario(usuarioId);
    }

    await registrarEventoSistema({
      req,
      nivel: "security",
      modulo: "tecnico",
      evento: "tecnico.usuario.editado",
      acao: "editar_usuario",
      resultado: "sucesso",
      mensagem: `Usuario ${atualizado.usuario} atualizado por tecnico.`,
      alvo: {
        tipo: "usuario",
        id: String(atualizado._id || usuarioId),
        login: atualizado.usuario,
        perfil: atualizado.perfil,
      },
      meta: {
        mudouLogin,
        mudouPerfil,
        mudouStatus,
        mudouSenha,
        revogouSessoes: deveRevogarSessoes,
      },
    });

    const editouPropriaConta = String(usuarioSessao?.id || "") === usuarioId;

    if (editouPropriaConta && deveRevogarSessoes) {
      req.session?.destroy(() => {
        res.clearCookie("glpi.sid");
        res.redirect("/auth?reason=senha_alterada");
      });
      return;
    }

    if (editouPropriaConta && req.session?.usuario) {
      req.session.usuario.nome = atualizado.nome || req.session.usuario.nome;
      req.session.usuario.usuario = atualizado.usuario || req.session.usuario.usuario;
      req.session.usuario.perfil = atualizado.perfil || req.session.usuario.perfil;
    }

    if (req.session) {
      req.session.flash = { tipo: "success", mensagem: "Usuario atualizado com sucesso." };
    }

    return res.redirect("/tecnico/usuarios");
  } catch (e) {
    console.error("Erro ao editar usuario (tecnico):", e);
    return res.status(400).render(
      "tecnico/usuarios/editar",
      viewBaseEditarUsuario(req, {
        usuarioId,
        valores: {
          ...montarValoresUsuario(atual),
          ...v.valores,
        },
        erros: [e?.message || "Nao foi possivel atualizar o usuario."],
      }),
    );
  }
}

export async function tecnicoUsuariosSugerirLoginGet(req, res) {
  const nome = String(req.query.nome || "").trim();
  if (!nome) return res.json({ ok: false, sugestoes: [] });

  const sugestoes = await sugerirLoginsDisponiveis(nome, 5);
  return res.json({ ok: true, sugestoes });
}
