// docker/mongo-init.js
// - Inicia replica set rs0 (idempotente)
// - Garante que o DB glpi_dev existe
// - (Opcional) cria um usuário de app (descomente se quiser separar do root)

(function () {
  function log(msg) {
    print(`[mongo-init] ${msg}`);
  }

  // 1) Iniciar replica set, se ainda não estiver iniciado
  try {
    const status = rs.status();
    if (status && status.ok === 1) {
      log("Replica set já está iniciado.");
    }
  } catch (e) {
    log("Replica set não iniciado. Executando rs.initiate()...");
    rs.initiate({
      _id: "rs0",
      members: [{ _id: 0, host: "mongo:27017" }],
    });

    // Espera o PRIMARY
    let isPrimary = false;
    for (let i = 0; i < 60; i++) {
      try {
        const hello = db.adminCommand({ hello: 1 });
        if (hello && hello.isWritablePrimary) {
          isPrimary = true;
          break;
        }
      } catch (err) {}
      sleep(1000);
    }
    if (!isPrimary) {
      throw new Error("Replica set não virou PRIMARY a tempo.");
    }
    log("Replica set iniciado e PRIMARY ok.");
  }

  // 2) Garantir DB glpi_dev
  const glpiDb = db.getSiblingDB("glpi_dev");
  glpiDb.createCollection("_bootstrap", { capped: false });
  log("DB glpi_dev garantido (_bootstrap criado se não existia).");

  // 3) (Opcional) Usuário dedicado do app — se você quiser separar do root:
  //    Exemplo: user "glpi_app" / senha "glpi_app@"
  //    Se usar isso, troque o MONGO_URI do app para glpi_app + authSource=glpi_dev (ou admin, conforme criar).
  /*
  try {
    glpiDb.createUser({
      user: "glpi_app",
      pwd: "glpi_app@",
      roles: [{ role: "readWrite", db: "glpi_dev" }],
    });
    log("Usuário glpi_app criado.");
  } catch (e) {
    log("Usuário glpi_app já existe (ou falhou por outro motivo): " + e);
  }
  */
})();
