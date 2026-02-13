import { MongoClient } from "mongodb";

let client;
let db;

export async function conectarMongo() {
  if (db) return db;

  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
  const dbName = process.env.MONGO_DB || "glpi_dev";

  client = new MongoClient(uri);
  await client.connect();

  db = client.db(dbName);
  console.log(`[mongo] conectado em ${uri}/${dbName}`);
  return db;
}

export function pegarDb() {
  if (!db) throw new Error("Mongo ainda não conectado. Chame conectarMongo() no start.");
  return db;
}
