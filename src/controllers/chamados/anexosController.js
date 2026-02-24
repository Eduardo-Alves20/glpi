import fs from "fs";
import { acharChamadoPorAnexoId } from "../../repos/chamados/core/chamadosCoreRepo.js";
import {
  mimeTypeAnexoPreferido,
  podeRenderizarInline,
  resolverCaminhoAnexo,
} from "../../service/anexosService.js";

function encontrarAnexoNoHistorico(chamado, anexoId) {
  const hist = Array.isArray(chamado?.historico) ? chamado.historico : [];

  for (const h of hist) {
    const anexos = Array.isArray(h?.meta?.anexos) ? h.meta.anexos : [];
    const encontrado = anexos.find((a) => String(a?.id || "") === String(anexoId || ""));
    if (encontrado) return encontrado;
  }

  return null;
}

function podeAcessarChamado(usuarioSessao, chamado) {
  const perfil = String(usuarioSessao?.perfil || "");
  if (perfil === "admin" || perfil === "tecnico") return true;

  const donoId = String(chamado?.criadoPor?.usuarioId || "");
  return donoId && donoId === String(usuarioSessao?.id || "");
}

function contentDisposition(nomeArquivo, inline = false) {
  const fileName = encodeURIComponent(String(nomeArquivo || "anexo"));
  const mode = inline ? "inline" : "attachment";
  return `${mode}; filename*=UTF-8''${fileName}`;
}

export async function baixarAnexoGet(req, res) {
  try {
    const usuarioSessao = req.session?.usuario;
    const anexoId = String(req.params?.anexoId || "").trim();
    if (!anexoId) return res.status(400).send("Anexo invalido.");

    const chamado = await acharChamadoPorAnexoId(anexoId);
    if (!chamado) return res.status(404).send("Anexo nao encontrado.");

    if (!podeAcessarChamado(usuarioSessao, chamado)) {
      return res.status(403).send("Acesso negado.");
    }

    const anexo = encontrarAnexoNoHistorico(chamado, anexoId);
    if (!anexo) return res.status(404).send("Anexo nao encontrado.");

    const absPath = resolverCaminhoAnexo(anexo.caminhoRelativo);
    if (!absPath || !fs.existsSync(absPath)) {
      return res.status(404).send("Arquivo nao localizado.");
    }

    const mimeType = mimeTypeAnexoPreferido(anexo);
    const inline = podeRenderizarInline(anexo);

    res.setHeader("Content-Type", mimeType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Disposition",
      contentDisposition(anexo.nomeOriginal || "anexo", inline),
    );

    return res.sendFile(absPath);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Falha ao abrir anexo.");
  }
}
