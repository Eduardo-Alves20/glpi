import { MongoClient } from "mongodb";

let client;
let db;

function intEnv(name, fallback, { min = 1, max = 10000 } = {}) {
  const raw = Number.parseInt(String(process.env[name] || "").trim(), 10);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(raw, max));
}

function mascararUri(uri) {
  try {
    return uri.replace(/\/\/([^:/@]+):([^@]+)@/g, "//***:***@");
  } catch {
    return "[uri]";
  }
}

export async function conectarMongo() {
  if (db) return db;

  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
  const dbName = process.env.MONGO_DB || "glpi_dev";
  const maxPoolSize = intEnv("MONGO_MAX_POOL_SIZE", 60, { min: 10, max: 500 });
  const minPoolSize = intEnv("MONGO_MIN_POOL_SIZE", 5, { min: 0, max: 100 });
  const serverSelectionTimeoutMS = intEnv("MONGO_SERVER_SELECTION_TIMEOUT_MS", 8000, { min: 1000, max: 60000 });
  const connectTimeoutMS = intEnv("MONGO_CONNECT_TIMEOUT_MS", 8000, { min: 1000, max: 60000 });
  const socketTimeoutMS = intEnv("MONGO_SOCKET_TIMEOUT_MS", 20000, { min: 5000, max: 120000 });

  client = new MongoClient(uri, {
    retryWrites: true,
    serverSelectionTimeoutMS,
    connectTimeoutMS,
    socketTimeoutMS,
    maxPoolSize,
    minPoolSize: Math.min(minPoolSize, maxPoolSize),
    family: 4,
  });

  await client.connect();
  db = client.db(dbName);

  console.log(
    `[mongo] conectado em ${mascararUri(uri)} (db=${dbName}, pool=${Math.min(minPoolSize, maxPoolSize)}..${maxPoolSize})`,
  );

  // encerra graceful
  const fechar = async (signal) => {
    try {
      if (client) {
        console.log(`[mongo] encerrando conexão (${signal})...`);
        await client.close(true);
      }
    } catch (e) {
      console.error("[mongo] erro ao encerrar:", e);
    } finally {
      client = undefined;
      db = undefined;
      process.exit(0);
    }
  };

  if (!process.__mongoHooksRegistered) {
    process.__mongoHooksRegistered = true;
    process.on("SIGINT", () => fechar("SIGINT"));
    process.on("SIGTERM", () => fechar("SIGTERM"));
  }

  return db;
}

export function pegarDb() {
  if (!db) throw new Error("Mongo ainda não conectado. Chame conectarMongo() no start.");
  return db;
}

// opcional: útil se você for usar transactions no replica set
export function pegarClient() {
  if (!client) throw new Error("MongoClient ainda não conectado. Chame conectarMongo() no start.");
  return client;
}
