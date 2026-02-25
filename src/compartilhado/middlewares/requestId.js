import { randomUUID } from "crypto";

function sanitizeRequestId(input = "") {
  const raw = String(input || "").trim();
  if (!raw) return "";
  return raw.replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 80);
}

function gerarRequestId() {
  try {
    return randomUUID();
  } catch {
    const now = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 10);
    return `req-${now}-${rand}`;
  }
}

export function anexarRequestId(req, res, next) {
  const recebido = sanitizeRequestId(req.get?.("x-request-id"));
  const requestId = recebido || gerarRequestId();

  req.requestId = requestId;
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  return next();
}

