import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import expressLayouts from "express-ejs-layouts";
import session from "express-session";
import MongoStore from "connect-mongo";
import { injetarLocalsLayout } from "./src/compartilhado/middlewares/viewLocals.js";
import { conectarMongo, pegarDb } from "./src/compartilhado/db/mongo.js";
import { montarRotas } from "./src/rotas/index.js";

import { criarAuditoriaRepo } from "./src/repos/auditoriaRepo.js";
import { criarAuditoriaSeguranca } from "./src/compartilhado/middlewares/auditoria.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// --------- Config básica
app.disable("x-powered-by");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


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

// --------- Mongo + Session
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const MONGO_DB = process.env.MONGO_DB || "glpi_dev";

await conectarMongo(); // lê MONGO_URI e MONGO_DB a partir do env (mongo.js)

const auditoriaRepo = criarAuditoriaRepo(pegarDb);
const auditoria = criarAuditoriaSeguranca({ auditoriaRepo });

app.use(
  session({
    name: "glpi.sid",
    secret: process.env.SESSION_SECRET || "troque-essa-chave-grande-aqui-depois",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    store: MongoStore.create({
      mongoUrl: MONGO_URI,
      dbName: MONGO_DB,
      collectionName: "sessoes",
      ttl: 60 * 60 * 8,
    }),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      // secure: true, // habilite em produção HTTPS
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

app.use(injetarLocalsLayout);

// --------- Rotas
montarRotas(app, { auditoria });

// --------- Start
const porta = process.env.PORT || 3000;
app.listen(porta, () => console.log(`Rodando em http://localhost:${porta}/auth`));
