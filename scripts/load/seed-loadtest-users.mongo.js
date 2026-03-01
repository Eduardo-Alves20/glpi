// Seed de usuarios para teste de carga (mongosh)
// Uso:
//   mongosh "mongodb://localhost:27017/glpi_dev" --file scripts/load/seed-loadtest-users.mongo.js
//
// Variaveis de ambiente opcionais:
//   SEED_DB=glpi_dev
//   SEED_USUARIOS=100
//   SEED_TECNICOS=20
//   SEED_ADMINS=5
//   SEED_PREFIX_USUARIO=usuario
//   SEED_PREFIX_TECNICO=tecnico
//   SEED_PREFIX_ADMIN=admin
//   SEED_STATUS=ativo
//   SEED_TAG=loadtest_v1
//   SEED_PASSWORD_HASH=$2b$12$...
//
// Hash padrao corresponde a senha: senha123

(function seedLoadtestUsers() {
  function env(name, fallback) {
    try {
      const v = String(process?.env?.[name] ?? "").trim();
      return v || fallback;
    } catch {
      return fallback;
    }
  }

  function envInt(name, fallback, min, max) {
    const n = Number.parseInt(env(name, String(fallback)), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function pad(num, len) {
    const n = String(num);
    if (n.length >= len) return n;
    return `${"0".repeat(len - n.length)}${n}`;
  }

  function nowDate() {
    return new Date();
  }

  const DB_NAME = env("SEED_DB", "glpi_dev");
  const USUARIOS_COUNT = envInt("SEED_USUARIOS", 100, 0, 10000);
  const TECNICOS_COUNT = envInt("SEED_TECNICOS", 20, 0, 10000);
  const ADMINS_COUNT = envInt("SEED_ADMINS", 5, 0, 10000);
  const PREFIX_USUARIO = env("SEED_PREFIX_USUARIO", "usuario");
  const PREFIX_TECNICO = env("SEED_PREFIX_TECNICO", "tecnico");
  const PREFIX_ADMIN = env("SEED_PREFIX_ADMIN", "admin");
  const STATUS = env("SEED_STATUS", "ativo").toLowerCase() === "bloqueado" ? "bloqueado" : "ativo";
  const SEED_TAG = env("SEED_TAG", "loadtest_v1");
  const PASSWORD_HASH = env(
    "SEED_PASSWORD_HASH",
    "$2b$12$TVo2SdvaUA12bIodNNjXcufdaD2iihHEhUHS6TBu3rVH4k.0gthjS", // senha123
  );

  const dbRef = db.getSiblingDB(DB_NAME);
  const col = dbRef.getCollection("usuarios");

  function buildDoc(perfil, prefix, idx) {
    const sufixo = pad(idx, 3);
    const login = `${prefix}${sufixo}`.toLowerCase();
    const roleLabel = perfil === "admin" ? "Admin" : (perfil === "tecnico" ? "Tecnico" : "Usuario");
    const now = nowDate();

    return {
      nome: `${roleLabel} Loadtest ${sufixo}`,
      usuario: login,
      email: `${login}@loadtest.local`,
      perfil,
      status: STATUS,
      senhaHash: PASSWORD_HASH,
      customFields: {},
      seedTag: SEED_TAG,
      criadoEm: now,
      atualizadoEm: now,
      updatedAt: now,
    };
  }

  function buildOps(perfil, prefix, count) {
    const ops = [];
    for (let i = 1; i <= count; i += 1) {
      const doc = buildDoc(perfil, prefix, i);
      ops.push({
        updateOne: {
          filter: { usuario: doc.usuario },
          update: {
            $set: {
              nome: doc.nome,
              email: doc.email,
              perfil: doc.perfil,
              status: doc.status,
              senhaHash: doc.senhaHash,
              customFields: doc.customFields,
              seedTag: doc.seedTag,
              atualizadoEm: doc.atualizadoEm,
              updatedAt: doc.updatedAt,
            },
            $setOnInsert: {
              usuario: doc.usuario,
              criadoEm: doc.criadoEm,
            },
          },
          upsert: true,
        },
      });
    }
    return ops;
  }

  function runBulk(ops, label) {
    if (!ops.length) {
      print(`[seed-loadtest] ${label}: 0 (ignorado)`);
      return { matched: 0, modified: 0, upserted: 0 };
    }

    const result = col.bulkWrite(ops, { ordered: false });
    const out = {
      matched: Number(result?.matchedCount || 0),
      modified: Number(result?.modifiedCount || 0),
      upserted: Number(result?.upsertedCount || 0),
    };
    print(`[seed-loadtest] ${label}: matched=${out.matched}, modified=${out.modified}, upserted=${out.upserted}`);
    return out;
  }

  print(`[seed-loadtest] DB=${DB_NAME} | tag=${SEED_TAG}`);
  print("[seed-loadtest] Gerando usuarios...");

  const resUsuarios = runBulk(buildOps("usuario", PREFIX_USUARIO, USUARIOS_COUNT), "usuarios");
  const resTecnicos = runBulk(buildOps("tecnico", PREFIX_TECNICO, TECNICOS_COUNT), "tecnicos");
  const resAdmins = runBulk(buildOps("admin", PREFIX_ADMIN, ADMINS_COUNT), "admins");

  const totalUpserted = resUsuarios.upserted + resTecnicos.upserted + resAdmins.upserted;
  const totalModified = resUsuarios.modified + resTecnicos.modified + resAdmins.modified;

  const totalSeedTag = col.countDocuments({ seedTag: SEED_TAG });

  print(`[seed-loadtest] Concluido. upserted=${totalUpserted}, modified=${totalModified}, totalTag=${totalSeedTag}`);
  print("[seed-loadtest] Senha padrao esperada para login: senha123 (ou hash custom via SEED_PASSWORD_HASH).");
})();
