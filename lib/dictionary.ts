import type { Pool, PoolClient } from "pg"

import { pool } from "@/lib/db-pool"
import { normalizeName } from "@/utils/french-name-detection"

export type DictionaryAction = "add" | "remove"
type Queryable = Pick<Pool | PoolClient, "query">

const VALID_SURNAME = /^[a-z'-]+(?:\s[a-z'-]+)*$/
const LEGACY_PLACEHOLDERS = new Set(["file truncated in this viewer for brevity"])

export function normalizeDictionaryNames(rawNames: unknown[]): string[] {
  return Array.from(new Set(rawNames
    .map((rawName) => {
      const raw = String(rawName ?? "").trim().toLowerCase().normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[’‘]/g, "'")
        .replace(/\s+/g, " ")
      return VALID_SURNAME.test(raw) ? normalizeName(raw) : ""
    })
    .filter((name) => name.length > 0 && name.length <= 120 && VALID_SURNAME.test(name) && !LEGACY_PLACEHOLDERS.has(name))))
    .sort((a, b) => a.localeCompare(b))
}

export async function listDictionaryNames(queryable: Queryable = pool): Promise<string[]> {
  const result = await queryable.query(`SELECT name FROM surname_dictionary ORDER BY name`)
  return result.rows.map((row) => String(row.name))
}

export async function getDictionarySet(queryable: Queryable = pool): Promise<Set<string>> {
  return new Set(await listDictionaryNames(queryable))
}

export async function applyDictionaryChanges(
  action: DictionaryAction,
  rawNames: unknown[],
  actorUserId: number | null = null,
  queryable: Queryable = pool,
): Promise<string[]> {
  const names = normalizeDictionaryNames(rawNames)
  if (names.length === 0) return []

  const result = action === "add"
    ? await queryable.query(
      `INSERT INTO surname_dictionary(name, created_by_user_id)
       SELECT candidate, $2 FROM unnest($1::text[]) candidate
       ON CONFLICT(name) DO NOTHING
       RETURNING name`,
      [names, actorUserId],
    )
    : await queryable.query(
      `DELETE FROM surname_dictionary WHERE name = ANY($1::text[]) RETURNING name`,
      [names],
    )

  return result.rows.map((row) => String(row.name)).sort((a, b) => a.localeCompare(b))
}
