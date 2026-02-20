import { Pool } from "pg"

// Singleton pool — reused across hot-reloads in development
const globalForPg = globalThis as unknown as { _pgPool?: Pool }

export const pool =
  globalForPg._pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
  })

if (process.env.NODE_ENV !== "production") {
  globalForPg._pgPool = pool
}

/**
 * Run the one-time migration to create the submissions table.
 * Called from the POST /api/submissions route on first use.
 */
export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id           SERIAL PRIMARY KEY,
      user_id      TEXT        NOT NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      contact_count       INT  NOT NULL DEFAULT 0,
      potentially_french  INT  NOT NULL DEFAULT 0,
      not_french          INT  NOT NULL DEFAULT 0,
      duplicate           INT  NOT NULL DEFAULT 0,
      not_checked         INT  NOT NULL DEFAULT 0,
      global_notes TEXT,
      territory_zipcode TEXT,
      territory_page_range TEXT,
      contacts     JSONB       NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'pending',
      archived      BOOLEAN NOT NULL DEFAULT FALSE
    )
  `)

  // Index so admin queries by user_id are fast
  await pool.query(`
    CREATE INDEX IF NOT EXISTS submissions_user_id_idx ON submissions(user_id)
  `)

  // Add new columns to existing tables (idempotent — errors ignored)
  await pool.query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending'`)
  await pool.query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE`)

  // OTM file storage — single-row singleton (id is always 1)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS otm_files (
      id          INT PRIMARY KEY,
      filename    TEXT NOT NULL,
      filedata    BYTEA NOT NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}
