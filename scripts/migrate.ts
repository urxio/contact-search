import { loadEnvConfig } from "@next/env"

loadEnvConfig(process.cwd())

Promise.all([import("../lib/migrations"), import("../lib/db-pool")])
  .then(async ([{ runMigrations }, { pool }]) => {
    await runMigrations()
    console.log("Database migrations are up to date.")
    await pool.end()
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
