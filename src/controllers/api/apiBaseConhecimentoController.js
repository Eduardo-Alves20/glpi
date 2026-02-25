import {
  buscarSugestoesBaseConhecimento,
} from "../../service/baseConhecimentoService.js";
import { registrarEventoSistema } from "../../service/logsService.js";

function limitar(valor, min, max, fallback) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export async function apiBaseConhecimentoSugestoesGet(req, res) {
  try {
    const q = String(req.query?.q || "").trim();
    const limit = limitar(req.query?.limit, 1, 10, 5);
    const itens = await buscarSugestoesBaseConhecimento({ q, limit });

    return res.json({
      ok: true,
      query: q,
      total: itens.length,
      itens,
    });
  } catch (err) {
    console.error("Erro ao buscar sugestoes da base de conhecimento:", err);
    return res.status(500).json({
      ok: false,
      total: 0,
      itens: [],
      error: "Nao foi possivel obter sugestoes agora.",
    });
  }
}

export async function apiBaseConhecimentoEventoPost(req, res) {
  const acao = String(req.body?.acao || "").trim().toLowerCase();
  const slug = String(req.body?.slug || "").trim().toLowerCase();
  const origem = String(req.body?.origem || "").trim().slice(0, 80);
  const contexto = String(req.body?.contexto || "").trim().slice(0, 120);

  if (!["abrir_artigo", "resolveu_sem_chamado", "sugestao_exibida"].includes(acao)) {
    return res.status(400).json({ ok: false, error: "acao_invalida" });
  }

  try {
    await registrarEventoSistema({
      req,
      nivel: "info",
      modulo: "base_conhecimento",
      evento: "base_conhecimento.interacao",
      acao,
      resultado: "sucesso",
      mensagem: `Interacao com base de conhecimento: ${acao}.`,
      alvo: slug ? { tipo: "artigo", id: slug } : null,
      meta: { origem, contexto },
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Erro ao registrar evento base de conhecimento:", err);
    return res.status(500).json({ ok: false, error: "falha_registro" });
  }
}
