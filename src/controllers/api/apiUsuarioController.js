import { listarChamados } from "../../repos/chamados/core/chamadosCoreRepo.js";

export async function apiUsuarioInboxGet(req, res) {
  try {
    const usuarioSessao = req.session?.usuario;

    const meus = await listarChamados({ solicitanteId: usuarioSessao.id, limit: 20 });

    return res.json({
      changed: true,
      serverTime: new Date().toISOString(),
      meus: (meus || []).map((c) => ({
        chamadoId: String(c._id),
        numero: c.numero,
        titulo: c.titulo,
        status: c.status,
        updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
      })),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ changed: false });
  }
}
