import { contarChamados, listarChamados, obterUltimaAtualizacaoChamados } from "../../repos/chamados/chamadosRepo.js";

function inicioDeHoje() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseSince(req) {
  const raw = String(req.query?.since || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function apiTecnicoInboxGet(req, res) {
  try {
    const usuarioSessao = req.session?.usuario;
    const since = parseSince(req);

    const hoje = inicioDeHoje();

    const [
      filaGeralCount,
      chamadosAbertos,
      emAtendimento,
      aguardandoUsuario,
      minhaFila,
      criadosHoje,
      chamadosCriticos,
      ultimaMudanca,
    ] = await Promise.all([
      contarChamados({ status: "aberto", somenteSemResponsavel: true }),
      contarChamados({ status: "aberto" }),
      contarChamados({ status: "em_atendimento" }),
      contarChamados({ status: "aguardando_usuario" }),
      contarChamados({ responsavelId: usuarioSessao?.id, status: ["em_atendimento", "aguardando_usuario"] }),
      contarChamados({ createdFrom: hoje }),
      contarChamados({ prioridade: "alta", status: ["aberto", "em_atendimento", "aguardando_usuario"] }),
      obterUltimaAtualizacaoChamados(),
    ]);

    const fila = await listarChamados({ status: "aberto", limit: 10 });
    const semResp = (fila || []).filter((c) => !c.responsavelId).slice(0, 5);

    const changed = !since || (!!ultimaMudanca && ultimaMudanca > since);

    return res.json({
      changed,
      serverTime: new Date().toISOString(),
      lastChangeAt: ultimaMudanca ? new Date(ultimaMudanca).toISOString() : null,
      filaGeralCount,
      kpis: { chamadosAbertos, emAtendimento, aguardandoUsuario, minhaFila, filaGeral: filaGeralCount, criadosHoje, chamadosCriticos },
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
