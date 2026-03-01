import http from "k6/http";
import { check, fail, sleep } from "k6";

function intEnv(name, fallback, { min = 1, max = 100000 } = {}) {
  const raw = Number.parseInt(String(__ENV[name] || "").trim(), 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(raw, max));
}

function boolEnv(name, fallback = false) {
  const raw = String(__ENV[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on", "sim"].includes(raw)) return true;
  if (["0", "false", "no", "off", "nao"].includes(raw)) return false;
  return fallback;
}

function floatEnv(name, fallback, { min = 0, max = 1 } = {}) {
  const raw = Number.parseFloat(String(__ENV[name] || "").trim());
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(raw, max));
}

const BASE_URL = String(__ENV.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const VUS = intEnv("VUS", 40, { min: 1, max: 5000 });
const RAMP = String(__ENV.RAMP || "30s");
const HOLD = String(__ENV.HOLD || "2m");
const COOLDOWN = String(__ENV.COOLDOWN || "15s");
const THINK_MIN = Number.parseFloat(String(__ENV.THINK_MIN || "0.2"));
const THINK_MAX = Number.parseFloat(String(__ENV.THINK_MAX || "0.8"));

const USER_PREFIX = String(__ENV.USER_PREFIX || "usuario");
const TECH_PREFIX = String(__ENV.TECH_PREFIX || "tecnico");
const ADMIN_PREFIX = String(__ENV.ADMIN_PREFIX || "admin");
const USER_COUNT = intEnv("USER_COUNT", 100, { min: 1, max: 20000 });
const TECH_COUNT = intEnv("TECH_COUNT", 20, { min: 1, max: 20000 });
const ADMIN_COUNT = intEnv("ADMIN_COUNT", 5, { min: 1, max: 10000 });
const PASSWORD = String(__ENV.DEFAULT_PASSWORD || "senha123");

const CATEGORIA = String(__ENV.CATEGORIA || "incidente");
const PRIORIDADE = String(__ENV.PRIORIDADE || "media");
const ENABLE_REOPEN = boolEnv("ENABLE_REOPEN", false);
const ENABLE_ADMIN_CHECK = boolEnv("ENABLE_ADMIN_CHECK", true);

const CHAT_INTERACTIONS = intEnv("CHAT_INTERACTIONS", 10, { min: 2, max: 100 });
const ATTACHMENT_SENDS = intEnv("ATTACHMENT_SENDS", 5, { min: 0, max: 100 });
const ENABLE_ATTACHMENT_TRAFFIC = boolEnv("ENABLE_ATTACHMENT_TRAFFIC", true);
const ENABLE_AVALIACAO = boolEnv("ENABLE_AVALIACAO", true);
const AVALIACAO_MODE = String(__ENV.AVALIACAO_MODE || "mixed").trim().toLowerCase();
const ENABLE_CLOSED_URL_CHECK = boolEnv("ENABLE_CLOSED_URL_CHECK", true);
const ENABLE_PERMISSION_NEGATIVE = boolEnv("ENABLE_PERMISSION_NEGATIVE", true);
const NEGATIVE_SAMPLE_EVERY = intEnv("NEGATIVE_SAMPLE_EVERY", 100, { min: 1, max: 1000000 });
const NEGATIVE_RANDOM_RATE = floatEnv("NEGATIVE_RANDOM_RATE", 0, { min: 0, max: 1 });

const ATTACHMENT_VARIANTS = [
  {
    nomeBase: "evidencia-pdf",
    ext: "pdf",
    mime: "application/pdf",
    payloadPrefix: "%PDF-1.4",
  },
  {
    nomeBase: "print-png",
    ext: "png",
    mime: "image/png",
    payloadPrefix: "\u0089PNG",
  },
  {
    nomeBase: "documento-word",
    ext: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    payloadPrefix: "PK-DOCX",
  },
  {
    nomeBase: "planilha-excel",
    ext: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    payloadPrefix: "PK-XLSX",
  },
  {
    nomeBase: "foto-jpg",
    ext: "jpg",
    mime: "image/jpeg",
    payloadPrefix: "JPEG",
  },
];

const AVALIACOES_FIXAS = [
  { nota: 5, feedback: "Atendimento excelente, resolveu rapido.", sugestao: "Manter padrao de resposta." },
  { nota: 4, feedback: "Bom atendimento, pequenas duvidas no final.", sugestao: "Detalhar mais o passo final." },
  { nota: 3, feedback: "Resolvido, mas demorou mais que o esperado.", sugestao: "Melhorar tempo de retorno inicial." },
  { nota: 2, feedback: "Resolucao parcial, precisei insistir no chamado.", sugestao: "Revisar checklist tecnico." },
  { nota: 1, feedback: "Nao resolveu no primeiro ciclo de atendimento.", sugestao: "Escalar casos similares mais cedo." },
];

function pad3(n) {
  return String(n).padStart(3, "0");
}

function roleLogin(prefix, count) {
  const lim = Number.isFinite(count) && count > 0 ? count : 1;
  const idx = ((__VU - 1) % lim) + 1;
  return `${prefix}${pad3(idx)}`;
}

function formBody(fields = {}) {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(String(k))}=${encodeURIComponent(String(v ?? ""))}`)
    .join("&");
}

function randomBetween(min, max) {
  const a = Number.isFinite(min) ? min : 0.2;
  const b = Number.isFinite(max) ? max : 0.8;
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return low + Math.random() * (high - low);
}

function escapeRegex(s = "") {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractChamadoIdByToken(html, token) {
  const safeToken = escapeRegex(token);
  const rx = new RegExp(
    `<a\\s+class="table-link"\\s+href="/chamados/([a-f0-9]{24})">\\s*${safeToken}`,
    "i",
  );
  const m = String(html || "").match(rx);
  return m ? String(m[1] || "") : "";
}

function redirectOk(status) {
  return status === 302 || status === 303;
}

function bloqueadoOk(res) {
  const location = String(res?.headers?.Location || "");
  return res.status === 403 || (redirectOk(res.status) && location.includes("/auth"));
}

function postUrlEncoded(url, fields, { jar, tags } = {}) {
  return http.post(
    url,
    formBody(fields),
    {
      jar,
      redirects: 0,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      tags,
    },
  );
}

function postMultipart(url, fields, { jar, tags } = {}) {
  return http.post(
    url,
    fields,
    {
      jar,
      redirects: 0,
      tags,
    },
  );
}

function anexarArquivo(token, sequence) {
  const idx = Math.abs(Number(sequence || 0)) % ATTACHMENT_VARIANTS.length;
  const meta = ATTACHMENT_VARIANTS[idx];
  const nome = `${meta.nomeBase}-${token}-${sequence}.${meta.ext}`;
  const payload = `${meta.payloadPrefix}\nload-test=${token}\nseq=${sequence}\n`;
  return {
    meta,
    file: http.file(payload, nome, meta.mime),
  };
}

function deveRodarNegativo() {
  if (!ENABLE_PERMISSION_NEGATIVE) return false;
  if (NEGATIVE_RANDOM_RATE > 0 && Math.random() < NEGATIVE_RANDOM_RATE) return true;
  return ((__ITER + 1) % NEGATIVE_SAMPLE_EVERY) === 0;
}

function escolherAvaliacao() {
  if (AVALIACAO_MODE === "random") {
    const nota = 1 + Math.floor(Math.random() * 5);
    const base = AVALIACOES_FIXAS[(nota - 1) % AVALIACOES_FIXAS.length];
    return { nota, feedback: base.feedback, sugestao: base.sugestao };
  }

  // mixed (padrao): distribuicao deterministica por VU/iteracao, cobrindo 1..5
  const idx = Math.abs((__VU * 17 + __ITER * 31) % AVALIACOES_FIXAS.length);
  return AVALIACOES_FIXAS[idx];
}

const jarUsuario = new http.CookieJar();
const jarTecnico = new http.CookieJar();
const jarAdmin = new http.CookieJar();
let loggedUser = false;
let loggedTech = false;
let loggedAdmin = false;

const cred = {
  user: roleLogin(USER_PREFIX, USER_COUNT),
  tech: roleLogin(TECH_PREFIX, TECH_COUNT),
  admin: roleLogin(ADMIN_PREFIX, ADMIN_COUNT),
  pass: PASSWORD,
};

function loginOnce(jar, username, password, flagName) {
  const flag = flagName === "user"
    ? loggedUser
    : flagName === "tech"
      ? loggedTech
      : loggedAdmin;
  if (flag) return;

  const res = postUrlEncoded(
    `${BASE_URL}/auth`,
    { username, password },
    { jar, tags: { name: `POST /auth (${flagName})` } },
  );

  const ok = check(res, {
    [`login ${flagName} status`]: (r) => redirectOk(r.status) || r.status === 200,
  });
  if (!ok) fail(`Falha login ${flagName}: ${username} status=${res.status}`);

  const appRes = http.get(`${BASE_URL}/app`, { jar, tags: { name: `GET /app (${flagName})` } });
  const appOk = check(appRes, {
    [`app ${flagName} ok`]: (r) => r.status >= 200 && r.status < 400,
  });
  if (!appOk) fail(`Sessao invalida ${flagName}: ${username} status /app=${appRes.status}`);

  if (flagName === "user") loggedUser = true;
  if (flagName === "tech") loggedTech = true;
  if (flagName === "admin") loggedAdmin = true;
}

function criarChamado(token) {
  const titulo = `LT-WF-${token}`;
  const descricao = `Fluxo de carga ${token} para validar criacao, interacoes, anexos, avaliacao e fechamento.`;

  const post = postUrlEncoded(
    `${BASE_URL}/chamados/novo`,
    {
      titulo,
      descricao,
      categoria: CATEGORIA,
      prioridade: PRIORIDADE,
    },
    { jar: jarUsuario, tags: { name: "POST /chamados/novo (workflow)" } },
  );

  const created = check(post, {
    "criou chamado (redirect)": (r) => redirectOk(r.status),
  });
  if (!created) fail(`Falha ao criar chamado: status=${post.status}`);

  const lista = http.get(
    `${BASE_URL}/chamados/meus?q=${encodeURIComponent(titulo)}&limit=10`,
    { jar: jarUsuario, tags: { name: "GET /chamados/meus (workflow)" } },
  );
  const listaOk = check(lista, {
    "lista chamados ok": (r) => r.status === 200,
  });
  if (!listaOk) fail(`Falha ao listar chamados apos criar: status=${lista.status}`);

  const chamadoId = extractChamadoIdByToken(lista.body, titulo);
  if (!chamadoId) fail(`Nao encontrou chamado criado pelo token=${titulo}`);
  return { chamadoId, titulo };
}

function tecnicoAssume(chamadoId) {
  const res = postUrlEncoded(
    `${BASE_URL}/tecnico/chamados/${encodeURIComponent(chamadoId)}/assumir`,
    {},
    { jar: jarTecnico, tags: { name: "POST /tecnico/chamados/:id/assumir" } },
  );

  const ok = check(res, {
    "tecnico assumiu": (r) => redirectOk(r.status),
  });
  if (!ok) fail(`Falha ao assumir chamado ${chamadoId}: status=${res.status}`);
}

function tecnicoMensagem(chamadoId, token, turn, anexo = null) {
  let res = null;
  if (anexo) {
    res = postMultipart(
      `${BASE_URL}/tecnico/chamados/${encodeURIComponent(chamadoId)}/interacao`,
      {
        texto: `Mensagem tecnica ${token} turno ${turn} com anexo ${anexo.meta.ext}`,
        tipo: "mensagem",
        anexos: anexo.file,
      },
      { jar: jarTecnico, tags: { name: "POST /tecnico/chamados/:id/interacao (msg+anexo)" } },
    );
  } else {
    res = postUrlEncoded(
      `${BASE_URL}/tecnico/chamados/${encodeURIComponent(chamadoId)}/interacao`,
      {
        texto: `Mensagem tecnica ${token} turno ${turn}`,
        tipo: "mensagem",
      },
      { jar: jarTecnico, tags: { name: "POST /tecnico/chamados/:id/interacao (mensagem)" } },
    );
  }

  const ok = check(res, {
    "tecnico enviou mensagem": (r) => redirectOk(r.status),
  });
  if (!ok) fail(`Falha mensagem tecnica ${chamadoId}: status=${res.status}`);
}

function usuarioMensagem(chamadoId, token, turn, anexo = null) {
  let res = null;
  if (anexo) {
    res = postMultipart(
      `${BASE_URL}/chamados/${encodeURIComponent(chamadoId)}/interacao`,
      {
        texto: `Mensagem usuario ${token} turno ${turn} com anexo ${anexo.meta.ext}`,
        anexos: anexo.file,
      },
      { jar: jarUsuario, tags: { name: "POST /chamados/:id/interacao (msg+anexo)" } },
    );
  } else {
    res = postUrlEncoded(
      `${BASE_URL}/chamados/${encodeURIComponent(chamadoId)}/interacao`,
      {
        texto: `Mensagem usuario ${token} turno ${turn}`,
      },
      { jar: jarUsuario, tags: { name: "POST /chamados/:id/interacao (usuario)" } },
    );
  }

  const ok = check(res, {
    "usuario enviou mensagem": (r) => redirectOk(r.status),
  });
  if (!ok) fail(`Falha mensagem usuario ${chamadoId}: status=${res.status}`);
}

function tecnicoSolucao(chamadoId, token, anexo = null) {
  let res = null;
  if (anexo) {
    res = postMultipart(
      `${BASE_URL}/tecnico/chamados/${encodeURIComponent(chamadoId)}/interacao`,
      {
        texto: `Solucao tecnica ${token} com passos para resolucao definitiva.`,
        tipo: "solucao",
        anexos: anexo.file,
      },
      { jar: jarTecnico, tags: { name: "POST /tecnico/chamados/:id/interacao (solucao+anexo)" } },
    );
  } else {
    res = postUrlEncoded(
      `${BASE_URL}/tecnico/chamados/${encodeURIComponent(chamadoId)}/interacao`,
      {
        texto: `Solucao tecnica ${token} com passos para resolucao definitiva.`,
        tipo: "solucao",
      },
      { jar: jarTecnico, tags: { name: "POST /tecnico/chamados/:id/interacao (solucao)" } },
    );
  }

  const ok = check(res, {
    "tecnico enviou solucao": (r) => redirectOk(r.status),
  });
  if (!ok) fail(`Falha solucao tecnica ${chamadoId}: status=${res.status}`);
}

function usuarioConfirma(chamadoId, token) {
  const res = postUrlEncoded(
    `${BASE_URL}/chamados/${encodeURIComponent(chamadoId)}/confirmar`,
    {
      comentario: `Confirmado no workflow ${token}`,
    },
    { jar: jarUsuario, tags: { name: "POST /chamados/:id/confirmar" } },
  );

  const ok = check(res, {
    "usuario confirmou solucao": (r) => redirectOk(r.status),
  });
  if (!ok) fail(`Falha confirmar chamado ${chamadoId}: status=${res.status}`);
}

function usuarioAvalia(chamadoId, token) {
  if (!ENABLE_AVALIACAO) return;

  const avaliacao = escolherAvaliacao();
  const res = postUrlEncoded(
    `${BASE_URL}/chamados/${encodeURIComponent(chamadoId)}/avaliacao`,
    {
      nota: String(avaliacao.nota),
      feedback: `${avaliacao.feedback} [${token}]`,
      sugestao: avaliacao.sugestao,
    },
    { jar: jarUsuario, tags: { name: "POST /chamados/:id/avaliacao" } },
  );

  const ok = check(res, {
    "usuario enviou avaliacao": (r) => redirectOk(r.status),
  });
  if (!ok) fail(`Falha ao avaliar chamado ${chamadoId}: status=${res.status}`);
}

function usuarioReabre(chamadoId, token) {
  const res = postUrlEncoded(
    `${BASE_URL}/chamados/${encodeURIComponent(chamadoId)}/reabrir`,
    {
      comentario: `Reabrindo no workflow ${token}`,
    },
    { jar: jarUsuario, tags: { name: "POST /chamados/:id/reabrir" } },
  );

  const ok = check(res, {
    "usuario reabriu chamado": (r) => redirectOk(r.status),
  });
  if (!ok) fail(`Falha reabrir chamado ${chamadoId}: status=${res.status}`);
}

function validarAcessoUrlAposFechar(chamadoId) {
  if (!ENABLE_CLOSED_URL_CHECK) return;

  const usuarioUrl = `${BASE_URL}/chamados/${encodeURIComponent(chamadoId)}`;
  const tecnicoUrl = `${BASE_URL}/tecnico/chamados/${encodeURIComponent(chamadoId)}`;

  const userRes = http.get(usuarioUrl, {
    jar: jarUsuario,
    redirects: 0,
    tags: { name: "GET /chamados/:id (fechado)" },
  });
  check(userRes, {
    "usuario acessa url do chamado fechado": (r) => r.status === 200,
  });

  const techRes = http.get(tecnicoUrl, {
    jar: jarTecnico,
    redirects: 0,
    tags: { name: "GET /tecnico/chamados/:id (fechado)" },
  });
  check(techRes, {
    "tecnico acessa url do chamado fechado": (r) => r.status === 200,
  });
}

function rodarAcessosNegados(chamadoId) {
  const userAdmin = http.get(`${BASE_URL}/admin`, {
    jar: jarUsuario,
    redirects: 0,
    tags: { name: "NEG GET /admin (usuario)" },
  });
  check(userAdmin, {
    "usuario bloqueado em /admin": (r) => bloqueadoOk(r),
  });

  const userAssumir = postUrlEncoded(
    `${BASE_URL}/tecnico/chamados/${encodeURIComponent(chamadoId)}/assumir`,
    {},
    { jar: jarUsuario, tags: { name: "NEG POST /tecnico/chamados/:id/assumir (usuario)" } },
  );
  check(userAssumir, {
    "usuario bloqueado ao assumir chamado tecnico": (r) => bloqueadoOk(r),
  });

  const techAdmin = http.get(`${BASE_URL}/admin/usuarios`, {
    jar: jarTecnico,
    redirects: 0,
    tags: { name: "NEG GET /admin/usuarios (tecnico)" },
  });
  check(techAdmin, {
    "tecnico bloqueado em /admin/usuarios": (r) => bloqueadoOk(r),
  });
}

function adminCheck() {
  if (!ENABLE_ADMIN_CHECK) return;

  const page = http.get(`${BASE_URL}/admin`, {
    jar: jarAdmin,
    tags: { name: "GET /admin" },
  });
  check(page, {
    "admin page ok": (r) => r.status === 200 || redirectOk(r.status),
  });

  const api = http.get(
    `${BASE_URL}/api/admin/home?since=${encodeURIComponent(new Date(Date.now() - 15000).toISOString())}`,
    {
      jar: jarAdmin,
      tags: { name: "GET /api/admin/home" },
    },
  );
  check(api, {
    "admin api ok": (r) => r.status === 200,
  });
}

export const options = {
  scenarios: {
    workflow_completo: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: RAMP, target: VUS },
        { duration: HOLD, target: VUS },
        { duration: COOLDOWN, target: 0 },
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    http_req_failed: [`rate<${String(__ENV.MAX_ERROR_RATE || "0.03")}`],
    http_req_duration: [`p(95)<${String(__ENV.P95_MS || "1800")}`],
    checks: [`rate>${String(__ENV.MIN_CHECK_RATE || "0.97")}`],
  },
};

export default function () {
  loginOnce(jarUsuario, cred.user, cred.pass, "user");
  loginOnce(jarTecnico, cred.tech, cred.pass, "tech");
  if (ENABLE_ADMIN_CHECK) {
    loginOnce(jarAdmin, cred.admin, cred.pass, "admin");
  }

  const token = `vu${__VU}-it${__ITER}-${Date.now()}`;
  const { chamadoId } = criarChamado(token);
  sleep(randomBetween(THINK_MIN, THINK_MAX));

  tecnicoAssume(chamadoId);
  sleep(randomBetween(THINK_MIN, THINK_MAX));

  let anexosUsados = 0;
  for (let turn = 1; turn <= CHAT_INTERACTIONS; turn += 1) {
    const deveAnexar = ENABLE_ATTACHMENT_TRAFFIC && anexosUsados < ATTACHMENT_SENDS;
    const anexo = deveAnexar ? anexarArquivo(token, turn + __ITER) : null;

    if (turn % 2 === 1) {
      tecnicoMensagem(chamadoId, token, turn, anexo);
    } else {
      usuarioMensagem(chamadoId, token, turn, anexo);
    }

    if (anexo) anexosUsados += 1;
    sleep(randomBetween(THINK_MIN, THINK_MAX));
  }

  let anexoSolucao = null;
  if (ENABLE_ATTACHMENT_TRAFFIC && anexosUsados < ATTACHMENT_SENDS) {
    anexoSolucao = anexarArquivo(token, CHAT_INTERACTIONS + __ITER + 1);
    anexosUsados += 1;
  }
  tecnicoSolucao(chamadoId, token, anexoSolucao);
  sleep(randomBetween(THINK_MIN, THINK_MAX));

  usuarioConfirma(chamadoId, token);
  sleep(randomBetween(THINK_MIN, THINK_MAX));

  validarAcessoUrlAposFechar(chamadoId);

  let chamadoReaberto = false;
  if (ENABLE_REOPEN && __ITER % 3 === 0) {
    sleep(randomBetween(THINK_MIN, THINK_MAX));
    usuarioReabre(chamadoId, token);
    chamadoReaberto = true;
  }

  if (ENABLE_AVALIACAO && !chamadoReaberto) {
    sleep(randomBetween(THINK_MIN, THINK_MAX));
    usuarioAvalia(chamadoId, token);
  }

  if (deveRodarNegativo()) {
    sleep(randomBetween(THINK_MIN, THINK_MAX));
    rodarAcessosNegados(chamadoId);
  }

  if (__ITER % 2 === 0) {
    adminCheck();
  }
}
