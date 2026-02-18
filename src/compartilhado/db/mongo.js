import { MongoClient } from "mongodb";

let client;
let db;

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

  client = new MongoClient(uri, {
    retryWrites: true,
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 8000,
    socketTimeoutMS: 20000,
    maxPoolSize: 20,
    family: 4,
  });

  await client.connect();
  db = client.db(dbName);

  console.log(`[mongo] conectado em ${mascararUri(uri)} (db=${dbName})`);

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
