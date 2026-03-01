// Cleanup de usuarios seed de load test (mongosh)
// Uso:
//   mongosh "mongodb://localhost:27017/glpi_dev" --file scripts/load/cleanup-loadtest-users.mongo.js
//
// Variaveis de ambiente opcionais:
//   SEED_DB=glpi_dev
//   SEED_TAG=loadtest_v1
//   SEED_PREFIX_USUARIO=usuario
//   SEED_PREFIX_TECNICO=tecnico
//   SEED_PREFIX_ADMIN=admin

(function cleanupLoadtestUsers() {
  function env(name, fallback) {
    try {
      const v = String(process?.env?.[name] ?? "").trim();
      return v || fallback;
    } catch {
      return fallback;
    }
  }

  const DB_NAME = env("SEED_DB", "glpi_dev");
  const SEED_TAG = env("SEED_TAG", "loadtest_v1");
  const PREFIX_USUARIO = env("SEED_PREFIX_USUARIO", "usuario");
  const PREFIX_TECNICO = env("SEED_PREFIX_TECNICO", "tecnico");
  const PREFIX_ADMIN = env("SEED_PREFIX_ADMIN", "admin");

  const dbRef = db.getSiblingDB(DB_NAME);
  const col = dbRef.getCollection("usuarios");

  const filtro = {
    $or: [
      { seedTag: SEED_TAG },
      { usuario: { $regex: `^${PREFIX_USUARIO}[0-9]{3,}$`, $options: "i" } },
      { usuario: { $regex: `^${PREFIX_TECNICO}[0-9]{3,}$`, $options: "i" } },
      { usuario: { $regex: `^${PREFIX_ADMIN}[0-9]{3,}$`, $options: "i" } },
    ],
  };

  const totalAntes = col.countDocuments(filtro);
  const out = col.deleteMany(filtro);
  const totalDepois = col.countDocuments(filtro);

  print(`[cleanup-loadtest] DB=${DB_NAME} | tag=${SEED_TAG}`);
  print(`[cleanup-loadtest] Antes: ${totalAntes}`);
  print(`[cleanup-loadtest] Removidos: ${Number(out?.deletedCount || 0)}`);
  print(`[cleanup-loadtest] Depois: ${totalDepois}`);
})();
