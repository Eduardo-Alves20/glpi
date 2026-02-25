import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import expressLayouts from "express-ejs-layouts";
import session from "express-session";
import MongoStore from "connect-mongo";
import { garantirIndicesChamados } from "./src/repos/chamados/core/chamadosCoreRepo.js";
import { garantirIndicesLogs } from "./src/repos/logsRepo.js";

import { injetarLocalsLayout } from "./src/compartilhado/middlewares/viewLocals.js";
import { conectarMongo, pegarDb } from "./src/compartilhado/db/mongo.js";
import { montarRotas } from "./src/rotas/index.js";
import { anexarWebSocketNotificacoes } from "./src/app/notificacoesWebSocket.js";

import { criarAuditoriaRepo } from "./src/repos/auditoriaRepo.js";
import { criarAuditoriaSeguranca } from "./src/compartilhado/middlewares/auditoria.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const MONGO_DB = process.env.MONGO_DB || "glpi_dev";

// --------- Config básica
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: "200kb" }));

// --------- Views + Layouts
app.use(expressLayouts);
app.set("layout", "layout-public");
app.set("views", path.join(__dirname, "src", "views"));
app.set("view engine", "ejs");

// --------- Static
app.use("/styles", express.static(path.join(__dirname, "src", "public", "styles")));
app.use("/assets", express.static(path.join(__dirname, "src", "public", "assets")));
app.use("/js", express.static(path.join(__dirname, "src", "public", "js")));

// --------- Headers simples
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

// --------- Mongo
await conectarMongo();
await garantirIndicesChamados();
await garantirIndicesLogs();

// --------- Auditoria
const auditoriaRepo = criarAuditoriaRepo(pegarDb);
const auditoria = criarAuditoriaSeguranca({ auditoriaRepo });

// --------- Session
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  if (isProd) throw new Error("SESSION_SECRET fraca/ausente em produção.");
  console.warn("[warn] SESSION_SECRET ausente/fraca (ok em dev, não em produção).");
}

const sessionStore = MongoStore.create({
  mongoUrl: MONGO_URI,
  dbName: MONGO_DB,
  collectionName: "sessoes",
  ttl: 60 * 60 * 8,
  stringify: false,
});

const sessionMiddleware = session({
  name: "glpi.sid",
  secret: process.env.SESSION_SECRET || "dev-secret-troque-isso",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 8,
  },
});

app.use(sessionMiddleware);

app.use(injetarLocalsLayout);

// --------- Rotas
montarRotas(app, { auditoria });

// --------- 404
app.use((req, res) => {
  return res.status(404).render("erros/erro", {
    layout: "layout-public",
    titulo: "Página não encontrada",
    mensagem: "A rota informada não existe ou foi removida.",
  });
});

// --------- Error handler
app.use((err, req, res, next) => {
  console.error("[erro]", err);
  return res.status(500).render("erros/erro", {
    layout: "layout-public",
    titulo: "Erro interno",
    mensagem: "Ocorreu um erro inesperado. Tente novamente.",
  });
});

// --------- Start
const porta = Number(process.env.PORT || 3000);
const server = http.createServer(app);
anexarWebSocketNotificacoes({ server, sessionMiddleware });
server.listen(porta, () => console.log(`Rodando em http://localhost:${porta}/auth (env=${NODE_ENV})`));
