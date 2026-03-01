// src/compartilhado/middlewares/seguranca.js

const usuarioAtivoCache = new Map();

function intEnv(name, fallback, { min = 1000, max = 600000 } = {}) {
  const raw = Number.parseInt(String(process.env[name] || "").trim(), 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(raw, max));
}

const USUARIO_ATIVO_CACHE_TTL_MS = intEnv("USER_ACTIVE_CACHE_TTL_MS", 15000);

function getUsuarioAtivoCached(id) {
  const key = String(id || "").trim();
  if (!key) return null;

  const cached = usuarioAtivoCache.get(key);
  if (!cached) return null;

  if (cached.expiraEm <= Date.now()) {
    usuarioAtivoCache.delete(key);
    return null;
  }

  return cached.ativo;
}

function setUsuarioAtivoCache(id, ativo) {
  const key = String(id || "").trim();
  if (!key) return;

  usuarioAtivoCache.set(key, {
    ativo: Boolean(ativo),
    expiraEm: Date.now() + USUARIO_ATIVO_CACHE_TTL_MS,
  });
}

/**
 * Middleware: exige sessao autenticada
 */
export function exigirLogin(req, res, next) {
  if (!req.session || !req.session.usuario) {
    return res.redirect("/auth");
  }

  const u = req.session.usuario;
  if (!u.id || !u.perfil) {
    try {
      req.session.destroy(() => res.redirect("/auth"));
    } catch {
      return res.redirect("/auth");
    }
    return;
  }

  return next();
}

/**
 * Middleware: exige que o usuario logado esteja ativo.
 *
 * IMPORTANTE: enquanto existir admin hardcoded (bootstrap),
 * precisamos ignorar ele aqui.
 */
export function exigirUsuarioAtivo(getUsuarioPorId) {
  return async function (req, res, next) {
    const sess = req.session?.usuario;
    if (!sess?.id) return res.redirect("/auth");

    // Ignora o bootstrap (temporario)
    if (sess.id === "admin-bootstrap" || sess.id === "admin-local") {
      return next();
    }

    const cachedAtivo = getUsuarioAtivoCached(sess.id);
    if (cachedAtivo === true) return next();
    if (cachedAtivo === false) {
      return req.session.destroy(() => res.redirect("/auth"));
    }

    try {
      const usuario = await getUsuarioPorId(sess.id);
      const ativo = Boolean(usuario) && usuario.status !== "bloqueado";
      setUsuarioAtivoCache(sess.id, ativo);

      // se nao existe mais, ou status bloqueado -> derruba sessao
      if (!ativo) {
        return req.session.destroy(() => res.redirect("/auth"));
      }

      return next();
    } catch (err) {
      console.error("[exigirUsuarioAtivo] erro ao validar usuario:", err);
      return res.status(500).send("Erro ao validar sessao.");
    }
  };
}

/**
 * Middleware: exige um ou mais perfis
 *
 * onNegado: funcao opcional para auditoria/log (async ok)
 */
export function exigirPerfis(perfisPermitidos = [], { onNegado } = {}) {
  const permitidos = new Set((perfisPermitidos || []).map((p) => String(p)));

  return async function (req, res, next) {
    if (!req.session?.usuario) return res.redirect("/auth");

    const perfil = String(req.session.usuario.perfil || "");

    if (!permitidos.has(perfil)) {
      try {
        if (typeof onNegado === "function") {
          await onNegado(req, {
            motivo: "perfil_nao_autorizado",
            perfisPermitidos: [...permitidos],
          });
        }
      } catch (err) {
        // nao quebra o fluxo por falha de auditoria
        console.error("[exigirPerfis] falha ao auditar acesso negado:", err);
      }

      return res.status(403).render("erros/403", {
        titulo: "Acesso nao autorizado",
        mensagem:
          "Voce nao tem autorizacao para acessar este recurso. Esta tentativa foi registrada e podera ser analisada pela administracao.",
      });
    }

    return next();
  };
}
