import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Client, type Pool } from "pg"

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip

function connectionConfig(connectionString: string) {
  return {
    connectionString,
    ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false },
  } as const
}

function urlForSchema(connectionString: string, schema: string) {
  const url = new URL(connectionString)
  url.searchParams.set("options", `-c search_path=${schema}`)
  return url.toString()
}

describeWithDatabase("multi-congregation database isolation", () => {
  const schema = `search_helper_test_${process.pid}_${randomUUID().replaceAll("-", "")}`
  const originalDatabaseUrl = process.env.DATABASE_URL
  let admin: Client
  let pool: Pool
  let centralId: string
  let secondId: string
  let firstUserId: string
  let secondUserId: string

  beforeAll(async () => {
    // This suite deliberately refuses to fall back to DATABASE_URL. A disposable
    // TEST_DATABASE_URL is the only database it will ever mutate.
    admin = new Client(connectionConfig(testDatabaseUrl!))
    await admin.connect()
    await admin.query(`CREATE SCHEMA "${schema}"`)
    await admin.query(`SET search_path TO "${schema}"`)

    // Reproduce a pre-tenancy production row before running the real migrations.
    await admin.query(`CREATE TABLE submissions (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      contact_count INT NOT NULL DEFAULT 0,
      potentially_french INT NOT NULL DEFAULT 0,
      not_french INT NOT NULL DEFAULT 0,
      duplicate INT NOT NULL DEFAULT 0,
      not_checked INT NOT NULL DEFAULT 0,
      global_notes TEXT,
      territory_zipcode TEXT,
      territory_page_range TEXT,
      contacts JSONB NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'pending',
      archived BOOLEAN NOT NULL DEFAULT FALSE
    )`)
    await admin.query(
      `INSERT INTO submissions(user_id,contact_count,contacts) VALUES($1,1,$2::jsonb)`,
      ["  Legacy Person  ", JSON.stringify([{ id: "legacy-contact", name: "Legacy Person" }])],
    )

    process.env.DATABASE_URL = urlForSchema(testDatabaseUrl!, schema)
    const [{ runMigrations }, db] = await Promise.all([
      import("@/lib/migrations"),
      import("@/lib/db-pool"),
    ])
    pool = db.pool
    await runMigrations()
    await runMigrations()

    const central = await pool.query(`SELECT id FROM congregations WHERE slug='central-french-alexandria'`)
    centralId = central.rows[0].id
    const second = await pool.query(
      `INSERT INTO congregations(name,slug) VALUES('North Test','north-test') RETURNING id`,
    )
    secondId = second.rows[0].id

    const users = await pool.query(
      `INSERT INTO users(email,display_name,password_hash) VALUES
        ('same-one@example.test','Same Name','test-hash'),
        ('same-two@example.test','Same Name','test-hash')
       RETURNING id,email`,
    )
    firstUserId = users.rows.find((row) => row.email === "same-one@example.test").id
    secondUserId = users.rows.find((row) => row.email === "same-two@example.test").id
  })

  afterAll(async () => {
    if (pool) await pool.end()
    if (admin) {
      await admin.query("RESET search_path")
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await admin.end()
    }
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = originalDatabaseUrl
  })

  it("records each migration exactly once when the runner is repeated", async () => {
    const ledger = await pool.query(`SELECT version,name FROM schema_migrations ORDER BY version`)
    expect(ledger.rows).toEqual([
      { version: 1, name: "multi tenant foundation" },
      { version: 2, name: "tenant data checks" },
      { version: 3, name: "composite tenant integrity" },
      { version: 4, name: "normalized tenant identities" },
      { version: 5, name: "member preferences" },
      { version: 6, name: "contact package library" },
      { version: 7, name: "personal search activity" },
      { version: 8, name: "platform surname dictionary" },
      { version: 9, name: "invitation revocation history" },
      { version: 10, name: "Excel handoff progress" },
    ])
  })

  it("seeds and atomically mutates the shared platform dictionary", async () => {
    const seeded = await pool.query(
      `SELECT name FROM surname_dictionary
       WHERE name IN ('dupont','file truncated in this viewer for brevity')
       ORDER BY name`,
    )
    expect(seeded.rows).toEqual([{ name: "dupont" }])

    const { applyDictionaryChanges } = await import("@/lib/dictionary")
    expect(await applyDictionaryChanges("add", [" Testname ", "testname"], Number(firstUserId))).toEqual(["testname"])
    expect(await applyDictionaryChanges("add", ["testname"], Number(firstUserId))).toEqual([])

    const added = await pool.query(
      `SELECT name,created_by_user_id FROM surname_dictionary WHERE name='testname'`,
    )
    expect(added.rows).toEqual([{ name: "testname", created_by_user_id: firstUserId }])

    expect(await applyDictionaryChanges("remove", ["TESTNAME"])).toEqual(["testname"])
    expect(await applyDictionaryChanges("remove", ["testname"])).toEqual([])
  })

  it("isolates and deduplicates search activity buckets by congregation", async () => {
    const bucket = "2026-08-21T12:00:00.000Z"
    await pool.query(
      `INSERT INTO search_activity_buckets(congregation_id,user_id,bucket_started_at,active_seconds)
       VALUES($1,$2,$3,10),($4,$2,$3,20)`,
      [centralId, firstUserId, bucket, secondId],
    )
    await pool.query(
      `INSERT INTO search_activity_buckets(congregation_id,user_id,bucket_started_at,active_seconds)
       VALUES($1,$2,$3,25)
       ON CONFLICT(congregation_id,user_id,bucket_started_at) DO UPDATE
       SET active_seconds=GREATEST(search_activity_buckets.active_seconds,EXCLUDED.active_seconds)`,
      [centralId, firstUserId, bucket],
    )
    const central = await pool.query(
      `SELECT active_seconds FROM search_activity_buckets WHERE congregation_id=$1 AND user_id=$2`,
      [centralId, firstUserId],
    )
    const second = await pool.query(
      `SELECT active_seconds FROM search_activity_buckets WHERE congregation_id=$1 AND user_id=$2`,
      [secondId, firstUserId],
    )
    expect(central.rows).toEqual([{ active_seconds: 25 }])
    expect(second.rows).toEqual([{ active_seconds: 20 }])
  })

  it("backfills legacy submissions and normalized identities into Central French Alexandria", async () => {
    const submission = await pool.query(
      `SELECT c.slug,s.user_id,s.contacts FROM submissions s JOIN congregations c ON c.id=s.congregation_id`,
    )
    expect(submission.rows).toEqual([expect.objectContaining({
      slug: "central-french-alexandria",
      user_id: "  Legacy Person  ",
      contacts: [{ id: "legacy-contact", name: "Legacy Person" }],
    })])

    const identity = await pool.query(
      `SELECT normalized_name,display_name FROM legacy_identities WHERE congregation_id=$1`,
      [centralId],
    )
    expect(identity.rows).toContainEqual({ normalized_name: "legacy person", display_name: "Legacy Person" })
  })

  it("allows congregation-local ZIP codes and historical names while keeping reads isolated", async () => {
    await pool.query(
      `INSERT INTO zt_zipcodes(congregation_id,city,zipcode,total_pages) VALUES
        ($1,'Alexandria','22304',100),($2,'North City','22304',200)`,
      [centralId, secondId],
    )
    await pool.query(
      `INSERT INTO zt_users(congregation_id,name) VALUES($1,'Shared Name'),($2,'Shared Name')`,
      [centralId, secondId],
    )

    const centralRows = await pool.query(
      `SELECT city,total_pages FROM zt_zipcodes WHERE congregation_id=$1 AND zipcode='22304'`,
      [centralId],
    )
    const secondRows = await pool.query(
      `SELECT city,total_pages FROM zt_zipcodes WHERE congregation_id=$1 AND zipcode='22304'`,
      [secondId],
    )
    expect(centralRows.rows).toEqual([{ city: "Alexandria", total_pages: 100 }])
    expect(secondRows.rows).toEqual([{ city: "North City", total_pages: 200 }])
  })

  it("changes zero rows when an ID is paired with the wrong congregation", async () => {
    const foreign = await pool.query(
      `SELECT id FROM zt_zipcodes WHERE congregation_id=$1 AND zipcode='22304'`,
      [secondId],
    )
    const mutation = await pool.query(
      `UPDATE zt_zipcodes SET city='Leaked update' WHERE id=$1 AND congregation_id=$2 RETURNING id`,
      [foreign.rows[0].id, centralId],
    )
    expect(mutation.rowCount).toBe(0)

    const untouched = await pool.query(`SELECT city FROM zt_zipcodes WHERE id=$1`, [foreign.rows[0].id])
    expect(untouched.rows[0].city).toBe("North City")
  })

  it("enforces one active draft per user and congregation with independent revisions", async () => {
    await pool.query(
      `INSERT INTO contact_drafts(user_id,congregation_id,revision) VALUES($1,$2,1),($1,$3,7)`,
      [firstUserId, centralId, secondId],
    )
    await expect(pool.query(
      `INSERT INTO contact_drafts(user_id,congregation_id,revision) VALUES($1,$2,2)`,
      [firstUserId, centralId],
    )).rejects.toMatchObject({ code: "23505" })

    const revisions = await pool.query(
      `SELECT congregation_id,revision FROM contact_drafts WHERE user_id=$1 ORDER BY congregation_id`,
      [firstUserId],
    )
    expect(revisions.rows).toHaveLength(2)
    expect(revisions.rows.map((row) => row.revision).sort()).toEqual([1, 7])
  })

  it("keeps packages linked to exactly one segment in the same congregation", async () => {
    const zipcodes = await pool.query(
      `INSERT INTO zt_zipcodes(congregation_id,city,zipcode,total_pages) VALUES
       ($1,'Central City','22001',20),($2,'North City','22002',20) RETURNING id,congregation_id`,
      [centralId, secondId],
    )
    const centralZip = zipcodes.rows.find(row => String(row.congregation_id) === String(centralId))
    const segments = await pool.query(
      `INSERT INTO zt_segments(congregation_id,zipcode_id,page_start,page_end)
       VALUES($1,$2,1,5),($1,$2,6,10) RETURNING id`,
      [centralId, centralZip.id],
    )
    const contacts = JSON.stringify([{ firstName: "Ana", lastName: "Martin", address: "1 Main", city: "Central City", zipcode: "22001", phone: "" }])
    await pool.query(
      `INSERT INTO contact_packages(congregation_id,segment_id,uploaded_by_user_id,name,visibility,contacts,contact_count)
       VALUES($1,$2,$3,'Central package','shared',$4,1)`,
      [centralId, segments.rows[0].id, firstUserId, contacts],
    )
    await expect(pool.query(
      `INSERT INTO contact_packages(congregation_id,segment_id,uploaded_by_user_id,name,visibility,contacts,contact_count)
       VALUES($1,$2,$3,'Wrong tenant','shared',$4,1)`,
      [secondId, segments.rows[1].id, secondUserId, contacts],
    )).rejects.toMatchObject({ code: "23503" })
    await expect(pool.query(
      `INSERT INTO contact_packages(congregation_id,segment_id,uploaded_by_user_id,name,visibility,contacts,contact_count)
       VALUES($1,$2,$3,'Duplicate link','private',$4,1)`,
      [centralId, segments.rows[0].id, firstUserId, contacts],
    )).rejects.toMatchObject({ code: "23505" })
  })

  it("saves member preferences and their audit event atomically", async () => {
    const fields = ["preferences.theme", "preferences.defaultWorkspaceView"]
    const saved = await pool.query(
      `WITH updated AS (
         UPDATE users
            SET preferences=preferences || $2::jsonb,updated_at=NOW()
          WHERE id=$1
      RETURNING preferences
       ), audited AS (
         INSERT INTO audit_events(actor_user_id,congregation_id,action,target_type,target_id,metadata)
         SELECT $1,$3,'profile.updated','user',$1::text,$4::jsonb FROM updated
       )
       SELECT preferences FROM updated`,
      [
        firstUserId,
        JSON.stringify({ theme: "dark", defaultWorkspaceView: "team" }),
        centralId,
        JSON.stringify({ fields }),
      ],
    )
    expect(saved.rows[0].preferences).toEqual({ theme: "dark", defaultWorkspaceView: "team" })

    const audit = await pool.query(
      `SELECT metadata FROM audit_events
        WHERE actor_user_id=$1 AND congregation_id=$2 AND action='profile.updated'`,
      [firstUserId, centralId],
    )
    expect(audit.rows).toContainEqual({ metadata: { fields } })
  })

  it("makes invitation tokens globally unique and excludes accepted tokens from consumption", async () => {
    const invitation = await pool.query(
      `INSERT INTO invitations(congregation_id,email,role,token_hash,expires_at,created_by_user_id)
       VALUES($1,'invitee@example.test','member','one-use-token',NOW()+INTERVAL '7 days',$2)
       RETURNING id`,
      [centralId, firstUserId],
    )
    await expect(pool.query(
      `INSERT INTO invitations(congregation_id,email,role,token_hash,expires_at,created_by_user_id)
       VALUES($1,'other@example.test','member','one-use-token',NOW()+INTERVAL '7 days',$2)`,
      [secondId, secondUserId],
    )).rejects.toMatchObject({ code: "23505" })

    await pool.query(`UPDATE invitations SET accepted_at=NOW() WHERE id=$1`, [invitation.rows[0].id])
    const reusable = await pool.query(
      `SELECT id FROM invitations WHERE token_hash='one-use-token' AND accepted_at IS NULL AND expires_at>NOW()`,
    )
    expect(reusable.rowCount).toBe(0)
  })
})
