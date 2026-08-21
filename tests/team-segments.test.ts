import type { PoolClient } from "pg"
import { describe, expect, it, vi } from "vitest"
import { assertNoSegmentConflict, parseSegmentPageRange } from "@/lib/team-segments"

function clientWithConflict(row?: Record<string, unknown>) {
  const query = vi.fn()
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: row ? [row] : [] })
  return { client: { query } as unknown as PoolClient, query }
}

describe("team segment conflict checks", () => {
  it("serializes writes and checks inclusive endpoints while excluding the edited segment", async () => {
    const { client, query } = clientWithConflict()
    await expect(assertNoSegmentConflict(client, {
      congregationId: 12,
      zipcodeId: 34,
      pageStart: 20,
      pageEnd: 30,
      excludeSegmentId: 56,
    })).resolves.toBeUndefined()

    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[0][0]).toContain("pg_advisory_xact_lock")
    expect(query.mock.calls[1][0]).toContain("s.page_start <= $4")
    expect(query.mock.calls[1][0]).toContain("COALESCE(s.page_end,z.total_pages) >= $3")
    expect(query.mock.calls[1][1]).toEqual([12, 34, 20, 30, 56])
  })

  it("returns useful owner, range, status, and package details for a conflict", async () => {
    const { client } = clientWithConflict({
      id: "9",
      owner: "Ari",
      owner_user_id: "17",
      page_start: 30,
      page_end: 40,
      status: "In progress",
      package_name: "March list",
    })

    await expect(assertNoSegmentConflict(client, {
      congregationId: 1,
      zipcodeId: 2,
      pageStart: 40,
      pageEnd: 50,
    })).rejects.toMatchObject({
      status: 409,
      conflict: {
        segmentId: 9,
        owner: "Ari",
        ownerUserId: 17,
        pageStart: 30,
        pageEnd: 40,
        status: "In progress",
        packageName: "March list",
      },
    })
  })
})

describe("team segment page ranges", () => {
  it("parses the range formats saved by assignment drafts", () => {
    expect(parseSegmentPageRange("1-50")).toEqual({ pageStart: 1, pageEnd: 50 })
    expect(parseSegmentPageRange("51–100")).toEqual({ pageStart: 51, pageEnd: 100 })
    expect(parseSegmentPageRange("101 to 150")).toEqual({ pageStart: 101, pageEnd: 150 })
  })

  it("rejects missing, malformed, and reversed ranges", () => {
    expect(parseSegmentPageRange("")).toBeNull()
    expect(parseSegmentPageRange("pages 1-50")).toBeNull()
    expect(parseSegmentPageRange("50-1")).toBeNull()
  })
})
