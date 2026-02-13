// src/compartilhado/middlewares/seguranca.js

/**
 * Middleware: exige sessão autenticada
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
 * Middleware: exige que o usuário logado esteja ativo
 * (garante que bloqueio posterior invalida acesso)
 *
 * ⚠️ IMPORTANTE: enquanto existir admin hardcoded (bootstrap),
 * precisamos ignorar ele aqui, senão vai derrubar a sessão.
 */
export function exigirUsuarioAtivo(getUsuarioPorId) {
  return async function (req, res, next) {
    const sess = req.session?.usuario;
    if (!sess?.id) return res.redirect("/auth");

    // ✅ Ignora o bootstrap (temporário)
    if (sess.id === "admin-bootstrap" || sess.id === "admin-local") {
      return next();
    }

    try {
      const usuario = await getUsuarioPorId(sess.id);

      // se não existe mais, ou status bloqueado -> derruba sessão
      if (!usuario || usuario.status === "bloqueado") {
        return req.session.destroy(() => res.redirect("/auth"));
      }

      return next();
    } catch (err) {
      console.error("[exigirUsuarioAtivo] erro ao validar usuário:", err);
      return res.status(500).send("Erro ao validar sessão.");
    }
  };
}

/**
 * Middleware: exige um ou mais perfis
 *
 * onNegado: função opcional para auditoria/log (async ok)
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
        // não quebra o fluxo por falha de auditoria
        console.error("[exigirPerfis] falha ao auditar acesso negado:", err);
      }

      return res.status(403).render("erros/403", {
        titulo: "Acesso não autorizado",
        mensagem:
          "Você não tem autorização para acessar este recurso. Esta tentativa foi registrada e poderá ser analisada pela administração.",
      });
    }

    return next();
  };
}


