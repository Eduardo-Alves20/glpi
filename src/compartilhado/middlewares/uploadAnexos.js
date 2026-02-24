import fs from "fs";
import path from "path";
import multer from "multer";
import {
  BASE_ANEXOS_DIR,
  MAX_ANEXOS_POR_REQUISICAO,
  MAX_TAMANHO_ANEXO_BYTES,
  arquivoPermitido,
  gerarNomeArmazenado,
  mensagemErroUploadArquivo,
  apagarArquivosUpload,
} from "../../service/anexosService.js";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const now = new Date();
      const year = String(now.getFullYear());
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const dir = path.join(BASE_ANEXOS_DIR, year, month);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    try {
      cb(null, gerarNomeArmazenado(file.originalname));
    } catch (err) {
      cb(err);
    }
  },
});

const upload = multer({
  storage,
  limits: {
    files: MAX_ANEXOS_POR_REQUISICAO,
    fileSize: MAX_TAMANHO_ANEXO_BYTES,
  },
  fileFilter: (req, file, cb) => {
    if (!arquivoPermitido(file)) {
      const err = new Error(mensagemErroUploadArquivo());
      err.code = "ANEXO_INVALIDO";
      return cb(err);
    }
    return cb(null, true);
  },
});

function traduzirErroUpload(err) {
  if (!err) return "";

  if (err.code === "ANEXO_INVALIDO") return err.message || mensagemErroUploadArquivo();
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") return "Arquivo muito grande. Limite de 10MB por anexo.";
    if (err.code === "LIMIT_FILE_COUNT") return `Limite de ${MAX_ANEXOS_POR_REQUISICAO} anexos por envio.`;
    return "Falha no envio dos anexos.";
  }

  return err.message || "Falha no envio dos anexos.";
}

export function uploadAnexos(req, res, next) {
  const run = upload.array("anexos", MAX_ANEXOS_POR_REQUISICAO);

  run(req, res, async (err) => {
    if (!err) return next();

    await apagarArquivosUpload(req.files);
    req.files = [];
    req.uploadError = traduzirErroUpload(err);
    return next();
  });
}
