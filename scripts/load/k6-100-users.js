import http from "k6/http";
import { check, fail, sleep } from "k6";
import { SharedArray } from "k6/data";

const BASE_URL = String(__ENV.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const VUS = Number.parseInt(String(__ENV.VUS || "100"), 10);
const RAMP = String(__ENV.RAMP || "30s");
const HOLD = String(__ENV.HOLD || "2m");
const COOLDOWN = String(__ENV.COOLDOWN || "15s");
const THINK_MIN = Number.parseFloat(String(__ENV.THINK_MIN || "0.4"));
const THINK_MAX = Number.parseFloat(String(__ENV.THINK_MAX || "1.2"));
const HIT_CHAMADOS = String(__ENV.HIT_CHAMADOS || "1") === "1";

function parseCsvCreds(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line, index) => {
      const cols = line.split(",");
      const username = String(cols[0] || "").trim();
      const password = String(cols[1] || "").trim();
      if (!username || !password) {
        throw new Error(`Linha invalida no CSV de credenciais (linha ${index + 1}): ${line}`);
      }
      return { username, password };
    });
}

const credentials = new SharedArray("credentials", () => {
  const list = [];
  const csvFile = String(__ENV.CREDS_FILE || "scripts/load/credentials.csv").trim();

  try {
    const raw = open(csvFile);
    list.push(...parseCsvCreds(raw));
  } catch (_) {
    // fallback para variaveis de ambiente
  }

  const envUser = String(__ENV.LT_USER || "").trim();
  const envPass = String(__ENV.LT_PASS || "").trim();
  if (list.length === 0 && envUser && envPass) {
    list.push({ username: envUser, password: envPass });
  }

  if (list.length === 0) {
    throw new Error(
      "Sem credenciais. Informe CREDS_FILE (csv) ou LT_USER/LT_PASS.",
    );
  }

  return list;
});

export const options = {
  scenarios: {
    usuarios_logados: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: RAMP, target: Number.isFinite(VUS) ? VUS : 100 },
        { duration: HOLD, target: Number.isFinite(VUS) ? VUS : 100 },
        { duration: COOLDOWN, target: 0 },
      ],
      gracefulRampDown: "5s",
    },
  },
  thresholds: {
    http_req_failed: [`rate<${String(__ENV.MAX_ERROR_RATE || "0.02")}`],
    http_req_duration: [`p(95)<${String(__ENV.P95_MS || "1200")}`],
    checks: [`rate>${String(__ENV.MIN_CHECK_RATE || "0.98")}`],
  },
};

let loggedIn = false;

function randomBetween(min, max) {
  const a = Number.isFinite(min) ? min : 0.4;
  const b = Number.isFinite(max) ? max : 1.2;
  const low = Math.min(a, b);
  const high = Math.max(a, b);
  return low + Math.random() * (high - low);
}

function credForVu() {
  const idx = (__VU - 1) % credentials.length;
  return credentials[idx];
}

function loginIfNeeded() {
  if (loggedIn) return;

  const cred = credForVu();
  const body = `username=${encodeURIComponent(cred.username)}&password=${encodeURIComponent(cred.password)}`;

  const loginRes = http.post(`${BASE_URL}/auth`, body, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    redirects: 0,
    tags: { name: "POST /auth" },
  });

  const location = String(loginRes.headers.Location || "");
  const loginOk = check(loginRes, {
    "login status esperado": (r) => r.status === 302 || r.status === 303 || r.status === 200,
    "login redireciona para app": () => !location || location.includes("/app") || location === "/",
  });

  if (!loginOk) {
    fail(`Falha de login para usuario "${cred.username}" (status=${loginRes.status}, location=${location}).`);
  }

  const appRes = http.get(`${BASE_URL}/app`, { tags: { name: "GET /app" } });
  const appOk = check(appRes, {
    "app acessivel com sessao": (r) => r.status >= 200 && r.status < 400,
  });

  if (!appOk) {
    fail(`Sessao invalida apos login para usuario "${cred.username}" (status /app=${appRes.status}).`);
  }

  loggedIn = true;
}

export default function () {
  loginIfNeeded();

  const since = encodeURIComponent(new Date(Date.now() - 15000).toISOString());

  const inbox = http.get(`${BASE_URL}/api/usuario/inbox?since=${since}`, {
    tags: { name: "GET /api/usuario/inbox" },
  });
  check(inbox, {
    "usuario/inbox responde": (r) => r.status === 200,
  });

  const unread = http.get(`${BASE_URL}/api/notificacoes/unread-count`, {
    tags: { name: "GET /api/notificacoes/unread-count" },
  });
  check(unread, {
    "notificacoes/unread-count responde": (r) => r.status === 200,
  });

  if (__ITER % 3 === 0) {
    const notif = http.get(`${BASE_URL}/api/notificacoes?limit=20`, {
      tags: { name: "GET /api/notificacoes" },
    });
    check(notif, {
      "notificacoes lista responde": (r) => r.status === 200,
    });
  }

  if (HIT_CHAMADOS && __ITER % 4 === 0) {
    const chamados = http.get(`${BASE_URL}/chamados/meus`, {
      tags: { name: "GET /chamados/meus" },
    });
    check(chamados, {
      "chamados/meus responde": (r) => r.status === 200,
    });
  }

  sleep(randomBetween(THINK_MIN, THINK_MAX));
}
