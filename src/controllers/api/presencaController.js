import {
  obterResumoPresencaOnline,
  listarPresencaOnline,
} from "../../repos/presencaOnlineRepo.js";

export async function apiPresencaOnlineGet(req, res) {
  try {
    const janelaSegundos = Number.parseInt(String(req.query?.window || "").trim(), 10);
    const resumo = await obterResumoPresencaOnline({
      janelaSegundos: Number.isFinite(janelaSegundos) ? janelaSegundos : null,
    });
    return res.json(resumo);
  } catch (err) {
    console.error("[api.presenca] erro:", err);
    return res.status(500).json({
      usuariosOnline: 0,
      tecnicosOnline: 0,
      adminsOnline: 0,
      totalOnline: 0,
      janelaSegundos: null,
      serverNow: new Date().toISOString(),
      error: "internal_error",
    });
  }
}

export async function apiPresencaOnlineDetalhesGet(req, res) {
  try {
    const janelaSegundos = Number.parseInt(String(req.query?.window || "").trim(), 10);
    const grupo = String(req.query?.grupo || "").trim().toLowerCase() || "usuario";
    const usuarioLogadoId = String(req.session?.usuario?.id || "").trim();

    const out = await listarPresencaOnline({
      grupo,
      janelaSegundos: Number.isFinite(janelaSegundos) ? janelaSegundos : null,
    });

    const itens = (out?.itens || []).map((item) => ({
      ...item,
      logadoNoMomento: Boolean(usuarioLogadoId && item?.usuarioId === usuarioLogadoId),
    }));

    return res.json({
      ...out,
      itens,
    });
  } catch (err) {
    console.error("[api.presenca.detalhes] erro:", err);
    return res.status(500).json({
      grupo: "usuario",
      janelaSegundos: null,
      serverNow: new Date().toISOString(),
      total: 0,
      itens: [],
      error: "internal_error",
    });
  }
}
