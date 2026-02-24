import { contarChamados, listarChamados } from "../../repos/chamados/chamadosRepo.js";

function parseSince(req) {
  const raw = String(req.query?.since || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function apiTecnicoInboxGet(req, res) {
  try {
    const since = parseSince(req);

    const filaGeralCount = await contarChamados({ status: "aberto", somenteSemResponsavel: true });

    // Eventos simples: últimos abertos sem responsável (top 5)
    const fila = await listarChamados({ status: "aberto", limit: 10 });
    const semResp = (fila || []).filter((c) => !c.responsavelId).slice(0, 5);

    // "changed" simples: sempre true (MVP). Se quiser otimizar depois, a gente usa max(updatedAt).
    return res.json({
      changed: true,
      serverTime: new Date().toISOString(),
      filaGeralCount,
      eventos: semResp.map((c) => ({
        tipo: "novo_chamado",
        chamadoId: String(c._id),
        numero: c.numero,
        titulo: c.titulo,
        quando: c.createdAt ? new Date(c.createdAt).toISOString() : null,
      })),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ changed: false });
  }
}