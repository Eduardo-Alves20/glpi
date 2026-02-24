import { acharChamadoPorId } from "../../repos/chamados/core/chamadosCoreRepo.js";
import { acharChamadoPorIdDoUsuario } from "../../repos/chamados/usuario/chamadosUsuarioRepo.js";

function parseSince(req) {
  const raw = String(req.query?.since || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function apiPollChamadoGet(req, res) {
  try {
    const usuarioSessao = req.session?.usuario;
    const perfil = String(usuarioSessao?.perfil || "");
    const since = parseSince(req);

    let chamado = null;

    // técnico/admin: vê qualquer chamado
    if (perfil === "tecnico" || perfil === "admin") {
      chamado = await acharChamadoPorId(req.params.id);
    } else {
      // usuário: ownership
      chamado = await acharChamadoPorIdDoUsuario(req.params.id, usuarioSessao.id);
    }

    if (!chamado) return res.status(404).json({ changed: false });

    const updatedAt = chamado.updatedAt ? new Date(chamado.updatedAt) : new Date(0);
    const changed = !since || updatedAt > since;

    if (!changed) {
      return res.json({ changed: false, updatedAt: updatedAt.toISOString() });
    }

    const hist = Array.isArray(chamado.historico) ? chamado.historico : [];
    const novasInteracoes = since
      ? hist.filter((h) => {
          const em = h?.em ? new Date(h.em) : new Date(0);
          return em > since;
        })
      : hist.slice(-20);

    return res.json({
      changed: true,
      updatedAt: updatedAt.toISOString(),
      status: chamado.status,
      novasInteracoes,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ changed: false });
  }
}
