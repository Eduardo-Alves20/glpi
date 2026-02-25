// docker/mongo-init.js
// Dev bootstrap for single-node replica set (idempotent)

(function () {
  function log(msg) {
    print(`[mongo-init] ${msg}`);
  }

  function waitForPrimary(maxSeconds) {
    for (let i = 0; i < maxSeconds; i++) {
      try {
        const hello = db.adminCommand({ hello: 1 });
        if (hello && hello.isWritablePrimary) return true;
      } catch (err) {
        // wait and retry
      }
      sleep(1000);
    }
    return false;
  }

  try {
    // 1) Ensure replica set
    let alreadyInitiated = false;
    try {
      const status = rs.status();
      alreadyInitiated = !!(status && status.ok === 1);
    } catch (err) {
      alreadyInitiated = false;
    }

    if (!alreadyInitiated) {
      log("Replica set not initialized. Running rs.initiate()...");
      try {
        rs.initiate({
          _id: "rs0",
          members: [{ _id: 0, host: "mongo:27017" }],
        });
      } catch (err) {
        const msg = String(err?.message || err || "");
        const already = /already\s+initialized/i.test(msg) || err?.codeName === "AlreadyInitialized";
        if (!already) throw err;
        log("Replica set already initialized by previous run.");
      }
    } else {
      log("Replica set already initialized.");
    }

    if (!waitForPrimary(90)) {
      throw new Error("Replica set did not become PRIMARY in time.");
    }
    log("Replica set PRIMARY is ready.");

    // 2) Ensure database and marker collection
    const glpiDb = db.getSiblingDB("glpi_dev");
    try {
      glpiDb.createCollection("_bootstrap");
      log("Created glpi_dev._bootstrap.");
    } catch (err) {
      const msg = String(err?.message || err || "");
      const exists = /NamespaceExists/i.test(msg) || err?.code === 48;
      if (!exists) throw err;
      log("glpi_dev._bootstrap already exists.");
    }

    log("Initialization finished successfully.");
  } catch (err) {
    print(`[mongo-init] FATAL: ${String(err?.stack || err)}`);
    quit(1);
  }
})();
