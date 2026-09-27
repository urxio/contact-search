import { PGlite } from "@electric-sql/pglite"
import { afterAll, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ db: null as PGlite | null }))
vi.mock("@/lib/db-pool", () => ({ pool: {
  query: (sql: string, args?: unknown[]) => state.db!.query(sql, args),
  connect: async () => ({ query: (sql: string, args?: unknown[]) => state.db!.query(sql, args), release() {} }),
} }))

afterAll(async () => { await state.db?.close() })

describe("platform surname origin cache migration", () => {
  it("backfills the newest research for each surname across workspaces", async () => {
    state.db = new PGlite()
    const originalQuery = state.db.query.bind(state.db)
    vi.spyOn(state.db, "query").mockImplementation(async (sql: string, args?: unknown[]) => {
      if (sql.includes("CREATE TABLE platform_surname_origin_cache")) {
        const second = await originalQuery<{ id: number }>(
          "INSERT INTO congregations(name,slug) VALUES('Second','second') RETURNING id",
        )
        await originalQuery(
          `INSERT INTO surname_origin_cache(congregation_id,surname,origins,updated_at) VALUES
            (1,'dupont','[{"country":"France","explanation":"Older","sources":[]}]'::jsonb,'2026-09-24'),
            ($1,'dupont','[{"country":"France","explanation":"Newer","sources":[]}]'::jsonb,'2026-09-25'),
            (1,'unknown','[]'::jsonb,'2026-09-24')`,
          [second.rows[0].id],
        )
      }
      return originalQuery(sql, args)
    })

    const { runMigrations } = await import("@/lib/migrations")
    await runMigrations()
    const migrated = await state.db.query<{ surname: string; origins: Array<{ explanation: string }> }>(
      "SELECT surname,origins FROM platform_surname_origin_cache ORDER BY surname",
    )
    expect(migrated.rows).toEqual([
      { surname: "dupont", origins: [{ country: "France", explanation: "Newer", sources: [] }] },
      { surname: "unknown", origins: [] },
    ])
  })
})
