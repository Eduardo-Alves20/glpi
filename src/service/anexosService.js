import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export const BASE_ANEXOS_DIR = path.resolve(process.cwd(), "storage", "anexos", "chamados");
export const MAX_ANEXOS_POR_REQUISICAO = 5;
export const MAX_TAMANHO_ANEXO_BYTES = 10 * 1024 * 1024; // 10MB
export const ACCEPT_ANEXOS_HTML =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.ods,.odp";

const EXTENSOES_BLOQUEADAS = new Set([
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".msi",
  ".scr",
  ".pif",
  ".ps1",
  ".vbs",
  ".vbe",
  ".js",
  ".jse",
  ".jar",
  ".hta",
  ".dll",
  ".sh",
]);

const MIME_EXT_PERMITIDOS = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.oasis.opendocument.text": [".odt"],
  "application/vnd.oasis.opendocument.spreadsheet": [".ods"],
  "application/vnd.oasis.opendocument.presentation": [".odp"],
};
const EXTENSOES_PERMITIDAS = new Set(
  Object.values(MIME_EXT_PERMITIDOS).flatMap((arr) => arr),
);
const EXTENSOES_IMAGEM = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const EXTENSOES_PDF = new Set([".pdf"]);

function texto(v, { max = 300, fallback = "" } = {}) {
  const s = String(v ?? "").trim();
  return (s || fallback).slice(0, max);
}

export function extensaoArquivo(nome = "") {
  return path.extname(String(nome || "")).toLowerCase();
}

function normalizarExtensao(ext = "") {
  return String(ext || "").trim().toLowerCase();
}

function extAnexoFallback({ extensao = "", nomeOriginal = "", nomeArmazenado = "" } = {}) {
  const extSan = normalizarExtensao(extensao);
  if (extSan) return extSan;

  const fromOriginal = extensaoArquivo(nomeOriginal);
  if (fromOriginal) return fromOriginal;

  return extensaoArquivo(nomeArmazenado);
}

export function limparNomeOriginal(nomeOriginal = "") {
  const base = String(nomeOriginal || "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .trim();
  return (base || "arquivo").slice(0, 180);
}

export function gerarNomeArmazenado(nomeOriginal = "") {
  const ext = extensaoArquivo(nomeOriginal);
  const safeExt = ext && ext.length <= 10 ? ext : "";
  return `${crypto.randomUUID()}${safeExt}`;
}

export function arquivoPermitido({ mimetype = "", originalname = "" } = {}) {
  const mime = texto(mimetype, { max: 120 }).toLowerCase();
  const ext = extensaoArquivo(originalname);

  if (!mime || !ext) return false;
  if (EXTENSOES_BLOQUEADAS.has(ext)) return false;

  const extensoesMime = MIME_EXT_PERMITIDOS[mime];
  if (!extensoesMime || !extensoesMime.length) {
    if (mime === "application/octet-stream") {
      return EXTENSOES_PERMITIDAS.has(ext);
    }
    return false;
  }

  return extensoesMime.includes(ext);
}

export function mensagemErroUploadArquivo() {
  return "Anexo invalido. Permitidos: imagem, PDF e documentos Office (doc/docx/ppt/pptx/xls/xlsx/odt/ods/odp).";
}

export function mapearArquivosUpload(files = []) {
  const lista = Array.isArray(files) ? files : [];

  return lista
    .map((f) => {
      const rel = path.relative(BASE_ANEXOS_DIR, String(f.path || ""));
      const relSan = rel.split(path.sep).join("/");

      if (!relSan || relSan.startsWith("..")) return null;

      const mimeType = texto(f.mimetype, { max: 120 }).toLowerCase() || "application/octet-stream";
      const nomeOriginal = limparNomeOriginal(f.originalname || f.filename || "arquivo");
      const ext = extensaoArquivo(nomeOriginal);

      return {
        id: crypto.randomUUID(),
        nomeOriginal,
        nomeArmazenado: texto(f.filename, { max: 180 }),
        mimeType,
        extensao: texto(ext, { max: 12 }),
        tamanhoBytes: Number(f.size) || 0,
        caminhoRelativo: relSan,
        criadoEm: new Date(),
      };
    })
    .filter(Boolean);
}

export function sanitizarAnexosHistorico(anexos = []) {
  const lista = Array.isArray(anexos) ? anexos : [];

  return lista
    .slice(0, 20)
    .map((a) => {
      const id = texto(a?.id, { max: 80 });
      const caminhoRelativo = texto(a?.caminhoRelativo, { max: 260 });
      const mimeType = texto(a?.mimeType, { max: 120 }).toLowerCase();
      const nomeOriginal = limparNomeOriginal(a?.nomeOriginal || a?.nomeArmazenado || "arquivo");
      const extensao = texto(a?.extensao, { max: 12 }).toLowerCase();
      const tamanhoBytes = Number(a?.tamanhoBytes) || 0;

      if (!id || !caminhoRelativo || caminhoRelativo.startsWith("..")) return null;
      if (!mimeType) return null;

      return {
        id,
        nomeOriginal,
        nomeArmazenado: texto(a?.nomeArmazenado, { max: 180 }),
        mimeType,
        extensao,
        tamanhoBytes,
        caminhoRelativo,
        criadoEm: a?.criadoEm ? new Date(a.criadoEm) : new Date(),
      };
    })
    .filter(Boolean);
}

export function resolverCaminhoAnexo(caminhoRelativo = "") {
  const rel = texto(caminhoRelativo, { max: 260 });
  if (!rel) return null;

  const absoluto = path.resolve(BASE_ANEXOS_DIR, rel);
  if (!absoluto.startsWith(BASE_ANEXOS_DIR)) return null;

  return absoluto;
}

function parseAnexoLike(anexoOuMimeType, extensao = "", nomeOriginal = "") {
  if (anexoOuMimeType && typeof anexoOuMimeType === "object") {
    const mimeType = texto(anexoOuMimeType?.mimeType, { max: 120 }).toLowerCase();
    const ext = extAnexoFallback({
      extensao: anexoOuMimeType?.extensao,
      nomeOriginal: anexoOuMimeType?.nomeOriginal,
      nomeArmazenado: anexoOuMimeType?.nomeArmazenado,
    });
    return { mimeType, extensao: ext };
  }

  const mimeType = texto(anexoOuMimeType, { max: 120 }).toLowerCase();
  const ext = extAnexoFallback({ extensao, nomeOriginal });
  return { mimeType, extensao: ext };
}

export function anexoEhImagem(anexoOuMimeType, extensao = "", nomeOriginal = "") {
  const info = parseAnexoLike(anexoOuMimeType, extensao, nomeOriginal);
  if (info.mimeType.startsWith("image/")) return true;
  return EXTENSOES_IMAGEM.has(info.extensao);
}

export function anexoEhPdf(anexoOuMimeType, extensao = "", nomeOriginal = "") {
  const info = parseAnexoLike(anexoOuMimeType, extensao, nomeOriginal);
  if (info.mimeType === "application/pdf") return true;
  return EXTENSOES_PDF.has(info.extensao);
}

export function mimeTypeAnexoPreferido(anexoOuMimeType, extensao = "", nomeOriginal = "") {
  const info = parseAnexoLike(anexoOuMimeType, extensao, nomeOriginal);
  const mime = String(info.mimeType || "").toLowerCase();

  if (mime && mime !== "application/octet-stream") return mime;

  if (anexoEhPdf(info)) return "application/pdf";

  if (anexoEhImagem(info)) {
    if (info.extensao === ".jpg" || info.extensao === ".jpeg") return "image/jpeg";
    if (info.extensao === ".png") return "image/png";
    if (info.extensao === ".webp") return "image/webp";
    if (info.extensao === ".gif") return "image/gif";
    return "image/jpeg";
  }

  return mime || "application/octet-stream";
}

export function podeRenderizarInline(anexoOuMimeType, extensao = "", nomeOriginal = "") {
  return (
    anexoEhImagem(anexoOuMimeType, extensao, nomeOriginal) ||
    anexoEhPdf(anexoOuMimeType, extensao, nomeOriginal)
  );
}

export function formatarBytes(bytes = 0) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export async function apagarArquivosUpload(files = []) {
  const lista = Array.isArray(files) ? files : [];
  await Promise.all(
    lista.map(async (f) => {
      const p = String(f?.path || "");
      if (!p) return;
      try {
        await fs.unlink(p);
      } catch {
        // best effort
      }
    }),
  );
}
