import { Pool } from "pg"

const globalForPg = globalThis as unknown as { _pgPool?: Pool }

export const pool = globalForPg._pgPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
  max: 5,
})

if (process.env.NODE_ENV !== "production") globalForPg._pgPool = pool
