import {
  buscarSugestoesBaseConhecimento,
  obterOrientacaoBuscaBaseConhecimento,
  obterArtigoBaseConhecimento,
} from "../../service/baseConhecimentoService.js";
import { registrarEventoSistema } from "../../service/logsService.js";
import { criarChamadoResolvidoBaseConhecimento } from "../../repos/chamados/core/chamadosCoreRepo.js";
import { obterClassificacoesAtivasChamados } from "../../repos/chamados/classificacoesChamadosRepo.js";

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
    const orientacao = obterOrientacaoBuscaBaseConhecimento({ q, itens });

    return res.json({
      ok: true,
      query: q,
      total: itens.length,
      itens,
      orientacao,
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

  if (!["abrir_artigo", "resolveu_sem_chamado", "resolveu_com_registro", "sugestao_exibida"].includes(acao)) {
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

function normalizarListaReferencias(valor) {
  if (!Array.isArray(valor)) return [];
  return Array.from(new Set(
    valor
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean)
      .map((item) => item.slice(0, 120)),
  )).slice(0, 12);
}

export async function apiBaseConhecimentoResolverPost(req, res) {
  const usuario = req.session?.usuario || null;
  if (!usuario?.id) {
    return res.status(401).json({ ok: false, error: "nao_autenticado" });
  }

  const slug = String(req.body?.slug || "").trim().toLowerCase().slice(0, 120);
  const titulo = String(req.body?.titulo || "").trim();
  const descricao = String(req.body?.descricao || "").trim();
  const categoria = String(req.body?.categoria || "").trim().toLowerCase();
  const prioridade = String(req.body?.prioridade || "").trim().toLowerCase();
  const referencias = normalizarListaReferencias(req.body?.referencias);

  try {
    const classificacoes = await obterClassificacoesAtivasChamados();
    const categoriasAtivas = Array.isArray(classificacoes?.categoriasValores)
      ? classificacoes.categoriasValores
      : [];
    const prioridadesAtivas = Array.isArray(classificacoes?.prioridadesValores)
      ? classificacoes.prioridadesValores
      : [];

    const categoriaPadrao = categoriasAtivas.includes("outros")
      ? "outros"
      : (categoriasAtivas[0] || "");
    const prioridadePadrao = prioridadesAtivas.includes("baixa")
      ? "baixa"
      : (prioridadesAtivas[0] || "");

    const categoriaFinal = categoriasAtivas.includes(categoria) ? categoria : categoriaPadrao;
    const prioridadeFinal = prioridadesAtivas.includes(prioridade) ? prioridade : prioridadePadrao;

    if (!categoriaFinal || !prioridadeFinal) {
      return res.status(400).json({
        ok: false,
        error: "classificacoes_indisponiveis",
      });
    }

    const artigo = slug ? await obterArtigoBaseConhecimento(slug) : null;

    const chamado = await criarChamadoResolvidoBaseConhecimento({
      usuarioId: usuario.id,
      usuarioNome: usuario.nome,
      usuarioLogin: usuario.usuario,
      titulo,
      descricao,
      categoria: categoriaFinal,
      prioridade: prioridadeFinal,
      slug,
      referencias,
      artigoTitulo: artigo?.titulo || "",
    });

    await registrarEventoSistema({
      req,
      nivel: "info",
      modulo: "base_conhecimento",
      evento: "base_conhecimento.resolveu_com_registro",
      acao: "registrar_chamado_fechado",
      resultado: "sucesso",
      mensagem: `Chamado #${chamado.numero} registrado como resolvido pela base de conhecimento.`,
      alvo: {
        tipo: "chamado",
        id: String(chamado._id),
        numero: String(chamado.numero),
      },
      meta: {
        slug,
        categoria: chamado.categoria,
        prioridade: chamado.prioridade,
      },
    });

    return res.json({
      ok: true,
      chamado: {
        id: String(chamado._id),
        numero: chamado.numero,
      },
      redirectUrl: `/chamados/${String(chamado._id)}`,
    });
  } catch (err) {
    console.error("Erro ao registrar resolucao com chamado:", err);
    return res.status(400).json({
      ok: false,
      error: err?.message || "falha_registro_chamado",
    });
  }
}
