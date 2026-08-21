import { pool } from "@/lib/db-pool"
import { runMigrations } from "@/lib/migrations"

export { pool }

/** Idempotent lazy migration entrypoint used by serverless request handlers. */
export function ensureSchema() {
  return runMigrations()
}
