import type { PoolClient } from "pg"
import { pool } from "@/lib/db-pool"

const CENTRAL_SLUG = "central-french-alexandria"
const CENTRAL_NAME = "Central French Alexandria"
const CENTRAL_SEARCH_ZIPCODES = `20101 20102 20103 20104 20105 20108 20109 20110 20111 20112 20113 20117 20118 20119 20120 20121 20122 20124 20129 20131 20132 20134 20135 20136 20137 20141 20142 20143 20146 20147 20148 20151 20152 20153 20155 20156 20158 20159 20160 20163 20164 20165 20166 20167 20168 20169 20170 20171 20172 20175 20176 20177 20178 20180 20181 20182 20187 20190 20191 20192 20193 20194 20195 20196 20197 22003 22009 22015 22025 22026 22027 22030 22031 22032 22033 22034 22035 22036 22037 22038 22039 22040 22041 22042 22043 22044 22045 22046 22047 22060 22066 22067 22079 22081 22082 22092 22093 22095 22101 22102 22103 22106 22107 22108 22109 22110 22111 22112 22113 22114 22115 22116 22117 22118 22119 22120 22121 22122 22124 22125 22134 22135 22150 22151 22152 22153 22154 22155 22156 22157 22158 22159 22160 22161 22172 22180 22181 22182 22183 22184 22185 22191 22192 22193 22194 22195 22199 22201 22202 22203 22204 22205 22206 22207 22208 22209 22210 22211 22212 22213 22214 22215 22216 22217 22218 22219 22222 22223 22225 22226 22227 22229 22230 22234 22240 22241 22242 22243 22244 22245 22246 22301 22302 22303 22304 22305 22306 22307 22308 22309 22310 22311 22312 22313 22314 22315 22320 22321 22331 22332 22333 22334 22336 22401 22402 22403 22404 22405 22406 22407 22412 22430 22463 22471 22554 22555 22556 22712`.split(" ")

type Migration = { version: number; name: string; run(client: PoolClient): Promise<void> }

async function bootstrapLegacyTables(client: PoolClient) {
  await client.query(`CREATE TABLE IF NOT EXISTS submissions (id SERIAL PRIMARY KEY,user_id TEXT NOT NULL,submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),contact_count INT NOT NULL DEFAULT 0,potentially_french INT NOT NULL DEFAULT 0,not_french INT NOT NULL DEFAULT 0,duplicate INT NOT NULL DEFAULT 0,not_checked INT NOT NULL DEFAULT 0,global_notes TEXT,territory_zipcode TEXT,territory_page_range TEXT,contacts JSONB NOT NULL,review_status TEXT NOT NULL DEFAULT 'pending',archived BOOLEAN NOT NULL DEFAULT FALSE)`)
  await client.query(`CREATE TABLE IF NOT EXISTS otm_files (id INT PRIMARY KEY,filename TEXT NOT NULL,filedata BYTEA NOT NULL,uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
  await client.query(`CREATE TABLE IF NOT EXISTS dismissed_name_feedback (id SERIAL PRIMARY KEY,name TEXT NOT NULL,list TEXT NOT NULL CHECK(list IN ('add','remove')),dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(name,list))`)
  await client.query(`CREATE TABLE IF NOT EXISTS dismissed_dictionary_scan_matches (id SERIAL PRIMARY KEY,submission_id INT NOT NULL,contact_id TEXT NOT NULL,dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(submission_id,contact_id))`)
  await client.query(`CREATE TABLE IF NOT EXISTS zt_zipcodes (id SERIAL PRIMARY KEY,city TEXT NOT NULL,zipcode TEXT NOT NULL UNIQUE,total_pages INT NOT NULL DEFAULT 0,territory TEXT NOT NULL DEFAULT 'Lacy Boulevard',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
  await client.query(`CREATE TABLE IF NOT EXISTS zt_users (id SERIAL PRIMARY KEY,name TEXT NOT NULL UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
  await client.query(`CREATE TABLE IF NOT EXISTS zt_segments (id SERIAL PRIMARY KEY,zipcode_id INT NOT NULL REFERENCES zt_zipcodes(id) ON DELETE CASCADE,page_start INT NOT NULL,page_end INT,owner TEXT NOT NULL DEFAULT '',stopped_at_page INT,status TEXT NOT NULL DEFAULT 'Not started',notes TEXT NOT NULL DEFAULT '',updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
  await client.query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending'`)
  await client.query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE`)
  await client.query(`ALTER TABLE zt_zipcodes ADD COLUMN IF NOT EXISTS territory TEXT NOT NULL DEFAULT 'Lacy Boulevard'`)
}

const migrations: Migration[] = [{
  version: 1,
  name: "multi tenant foundation",
  async run(client) {
    await client.query(`CREATE TABLE congregations (id BIGSERIAL PRIMARY KEY,name TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),settings JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
    await client.query(`CREATE TABLE users (id BIGSERIAL PRIMARY KEY,email TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,password_hash TEXT NOT NULL,is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,failed_login_count INT NOT NULL DEFAULT 0,locked_until TIMESTAMPTZ,password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK(email=lower(trim(email))))`)
    await client.query(`CREATE TABLE congregation_memberships (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,congregation_id BIGINT NOT NULL REFERENCES congregations(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN ('member','admin')),status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),display_name TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(user_id,congregation_id))`)
    await client.query(`CREATE TABLE auth_sessions (id TEXT PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL,last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),revoked_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
    await client.query(`CREATE TABLE legacy_identities (id BIGSERIAL PRIMARY KEY,congregation_id BIGINT NOT NULL REFERENCES congregations(id) ON DELETE CASCADE,normalized_name TEXT NOT NULL,display_name TEXT NOT NULL,linked_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(congregation_id,normalized_name))`)
    await client.query(`CREATE TABLE invitations (id BIGSERIAL PRIMARY KEY,congregation_id BIGINT NOT NULL REFERENCES congregations(id) ON DELETE CASCADE,email TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('member','admin')),token_hash TEXT NOT NULL UNIQUE,legacy_identity_id BIGINT REFERENCES legacy_identities(id) ON DELETE SET NULL,expires_at TIMESTAMPTZ NOT NULL,accepted_at TIMESTAMPTZ,created_by_user_id BIGINT NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
    await client.query(`CREATE TABLE password_reset_tokens (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,token_hash TEXT NOT NULL UNIQUE,expires_at TIMESTAMPTZ NOT NULL,used_at TIMESTAMPTZ,created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
    await client.query(`CREATE TABLE contact_drafts (id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,congregation_id BIGINT NOT NULL REFERENCES congregations(id) ON DELETE CASCADE,contacts JSONB NOT NULL DEFAULT '[]'::jsonb,global_notes TEXT NOT NULL DEFAULT '',territory_zipcode TEXT NOT NULL DEFAULT '',territory_page_range TEXT NOT NULL DEFAULT '',last_verified_contact_id TEXT,revision INT NOT NULL DEFAULT 1 CHECK(revision>0),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(user_id,congregation_id))`)
    await client.query(`CREATE TABLE audit_events (id BIGSERIAL PRIMARY KEY,actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,congregation_id BIGINT REFERENCES congregations(id) ON DELETE SET NULL,action TEXT NOT NULL,target_type TEXT,target_id TEXT,metadata JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)

    await client.query(`INSERT INTO congregations(name,slug,settings) VALUES($1,$2,$3::jsonb) ON CONFLICT(slug) DO NOTHING`,[CENTRAL_NAME,CENTRAL_SLUG,JSON.stringify({searchTerritoryZipcodes:CENTRAL_SEARCH_ZIPCODES})])
    const result=await client.query<{id:string}>(`SELECT id FROM congregations WHERE slug=$1`,[CENTRAL_SLUG]); const congregationId=result.rows[0].id
    for (const table of ["submissions","otm_files","dismissed_name_feedback","dismissed_dictionary_scan_matches","zt_zipcodes","zt_users","zt_segments"]) {
      await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS congregation_id BIGINT REFERENCES congregations(id) ON DELETE CASCADE`)
      await client.query(`UPDATE ${table} SET congregation_id=$1 WHERE congregation_id IS NULL`,[congregationId])
      await client.query(`ALTER TABLE ${table} ALTER COLUMN congregation_id SET NOT NULL`)
    }
    await client.query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL`)
    await client.query(`ALTER TABLE zt_segments ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL`)
    await client.query(`CREATE SEQUENCE IF NOT EXISTS otm_files_id_seq OWNED BY otm_files.id`)
    await client.query(`SELECT setval('otm_files_id_seq',COALESCE((SELECT max(id) FROM otm_files),0)+1,false)`)
    await client.query(`ALTER TABLE otm_files ALTER COLUMN id SET DEFAULT nextval('otm_files_id_seq')`)
    await client.query(`ALTER TABLE otm_files ADD CONSTRAINT otm_files_congregation_unique UNIQUE(congregation_id)`)
    await client.query(`ALTER TABLE zt_zipcodes DROP CONSTRAINT IF EXISTS zt_zipcodes_zipcode_key`)
    await client.query(`ALTER TABLE zt_zipcodes ADD CONSTRAINT zt_zipcodes_congregation_zipcode_unique UNIQUE(congregation_id,zipcode)`)
    await client.query(`ALTER TABLE zt_users DROP CONSTRAINT IF EXISTS zt_users_name_key`)
    await client.query(`ALTER TABLE zt_users ADD CONSTRAINT zt_users_congregation_name_unique UNIQUE(congregation_id,name)`)
    await client.query(`ALTER TABLE dismissed_name_feedback DROP CONSTRAINT IF EXISTS dismissed_name_feedback_name_list_key`)
    await client.query(`ALTER TABLE dismissed_name_feedback ADD CONSTRAINT dismissed_feedback_congregation_name_list_unique UNIQUE(congregation_id,name,list)`)
    await client.query(`ALTER TABLE dismissed_dictionary_scan_matches DROP CONSTRAINT IF EXISTS dismissed_dictionary_scan_matches_submission_id_contact_id_key`)
    await client.query(`ALTER TABLE dismissed_dictionary_scan_matches ADD CONSTRAINT dismissed_scan_congregation_submission_contact_unique UNIQUE(congregation_id,submission_id,contact_id)`)
    await client.query(`DELETE FROM dismissed_dictionary_scan_matches d WHERE NOT EXISTS (SELECT 1 FROM submissions s WHERE s.id=d.submission_id AND s.congregation_id=d.congregation_id)`)
    await client.query(`ALTER TABLE dismissed_dictionary_scan_matches ADD CONSTRAINT dismissed_scan_submission_fk FOREIGN KEY(submission_id) REFERENCES submissions(id) ON DELETE CASCADE`)
    await client.query(`INSERT INTO legacy_identities(congregation_id,normalized_name,display_name) SELECT $1,lower(trim(name)),min(trim(name)) FROM (SELECT user_id name FROM submissions UNION ALL SELECT owner name FROM zt_segments WHERE trim(owner)<>'' UNION ALL SELECT name FROM zt_users) n WHERE trim(name)<>'' GROUP BY lower(trim(name)) ON CONFLICT DO NOTHING`,[congregationId])
    await client.query(`CREATE INDEX submissions_tenant_date_idx ON submissions(congregation_id,submitted_at DESC)`)
    await client.query(`CREATE INDEX zt_segments_tenant_zip_idx ON zt_segments(congregation_id,zipcode_id)`)
    await client.query(`CREATE INDEX memberships_tenant_status_idx ON congregation_memberships(congregation_id,status)`)
    await client.query(`CREATE INDEX audit_events_tenant_date_idx ON audit_events(congregation_id,created_at DESC)`)
    await client.query(`CREATE INDEX auth_sessions_user_expiry_idx ON auth_sessions(user_id,expires_at)`)
  },
},{
  version:2,name:"tenant data checks",async run(client){
    await client.query(`ALTER TABLE zt_zipcodes ADD CONSTRAINT zt_zipcodes_total_pages_check CHECK(total_pages>=0) NOT VALID`)
    await client.query(`ALTER TABLE zt_segments ADD CONSTRAINT zt_segments_page_range_check CHECK(page_start>0 AND (page_end IS NULL OR page_end>=page_start) AND (stopped_at_page IS NULL OR stopped_at_page>=page_start)) NOT VALID`)
    await client.query(`ALTER TABLE zt_segments ADD CONSTRAINT zt_segments_status_check CHECK(status IN ('Not started','In progress','Completed')) NOT VALID`)
  }
},{
  version:3,name:"composite tenant integrity",async run(client){
    await client.query(`ALTER TABLE submissions ADD CONSTRAINT submissions_id_congregation_unique UNIQUE(id,congregation_id)`)
    await client.query(`ALTER TABLE zt_zipcodes ADD CONSTRAINT zt_zipcodes_id_congregation_unique UNIQUE(id,congregation_id)`)
    await client.query(`ALTER TABLE zt_segments ADD CONSTRAINT zt_segments_zipcode_tenant_fk FOREIGN KEY(zipcode_id,congregation_id) REFERENCES zt_zipcodes(id,congregation_id) ON DELETE CASCADE`)
    await client.query(`ALTER TABLE dismissed_dictionary_scan_matches DROP CONSTRAINT dismissed_scan_submission_fk`)
    await client.query(`ALTER TABLE dismissed_dictionary_scan_matches ADD CONSTRAINT dismissed_scan_submission_tenant_fk FOREIGN KEY(submission_id,congregation_id) REFERENCES submissions(id,congregation_id) ON DELETE CASCADE`)
  }
},{
  version:4,name:"normalized tenant identities",async run(client){
    await client.query(`DELETE FROM zt_users duplicate USING zt_users keeper WHERE duplicate.congregation_id=keeper.congregation_id AND lower(trim(duplicate.name))=lower(trim(keeper.name)) AND duplicate.id>keeper.id`)
    await client.query(`CREATE UNIQUE INDEX zt_users_tenant_normalized_name_unique ON zt_users(congregation_id,lower(trim(name)))`)
    await client.query(`CREATE INDEX submissions_tenant_user_date_idx ON submissions(congregation_id,user_id,submitted_at DESC)`)
    await client.query(`ALTER TABLE submissions ADD CONSTRAINT submissions_nonnegative_counts_check CHECK(contact_count>=0 AND potentially_french>=0 AND not_french>=0 AND duplicate>=0 AND not_checked>=0) NOT VALID`)
    await client.query(`ALTER TABLE submissions ADD CONSTRAINT submissions_review_status_check CHECK(review_status IN ('pending','in_review','reviewed')) NOT VALID`)
  }
},{
  version:5,name:"member preferences",async run(client){
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb`)
  }
},{
  version:6,name:"contact package library",async run(client){
    await client.query(`ALTER TABLE zt_segments ADD CONSTRAINT zt_segments_id_congregation_unique UNIQUE(id,congregation_id)`)
    await client.query(`CREATE TABLE contact_packages (
      id BIGSERIAL PRIMARY KEY,
      congregation_id BIGINT NOT NULL REFERENCES congregations(id) ON DELETE CASCADE,
      segment_id INT NOT NULL,
      uploaded_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
      visibility TEXT NOT NULL CHECK(visibility IN ('shared','private')),
      original_filename TEXT NOT NULL DEFAULT '',
      contacts JSONB NOT NULL CHECK(jsonb_typeof(contacts)='array'),
      contact_count INT NOT NULL CHECK(contact_count>0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(segment_id),
      CONSTRAINT contact_packages_segment_tenant_fk FOREIGN KEY(segment_id,congregation_id)
        REFERENCES zt_segments(id,congregation_id) ON DELETE RESTRICT
    )`)
    await client.query(`CREATE INDEX contact_packages_tenant_date_idx ON contact_packages(congregation_id,created_at DESC)`)
    await client.query(`CREATE INDEX contact_packages_uploader_idx ON contact_packages(congregation_id,uploaded_by_user_id)`)
  }
},{
  version:7,name:"personal search activity",async run(client){
    await client.query(`CREATE TABLE search_activity_buckets (
      congregation_id BIGINT NOT NULL REFERENCES congregations(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bucket_started_at TIMESTAMPTZ NOT NULL,
      active_seconds SMALLINT NOT NULL CHECK(active_seconds BETWEEN 1 AND 30),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(congregation_id,user_id,bucket_started_at)
    )`)
    await client.query(`CREATE INDEX search_activity_user_date_idx ON search_activity_buckets(congregation_id,user_id,bucket_started_at DESC)`)
    await client.query(`CREATE INDEX search_activity_team_date_idx ON search_activity_buckets(congregation_id,bucket_started_at DESC)`)
  }
}]

const LATEST_MIGRATION_VERSION = migrations[migrations.length - 1].version

let migrationPromise:Promise<void>|undefined
export function runMigrations(){if(!migrationPromise)migrationPromise=migrate().catch(error=>{migrationPromise=undefined;throw error});return migrationPromise}

async function migrate(){
  const client=await pool.connect()
  let migrationLockHeld=false
  try{
    // Most serverless invocations start in a fresh process. Avoid taking the
    // advisory lock and replaying bootstrap DDL when the database is current.
    // The locked path below still performs the authoritative second check.
    try {
      const current=await client.query<{version:number|null}>(`SELECT max(version)::int version FROM schema_migrations`)
      if(current.rows[0]?.version===LATEST_MIGRATION_VERSION)return
    } catch(error:any) {
      if(error?.code!=="42P01")throw error
    }
    await client.query(`SELECT pg_advisory_lock(hashtext('search-helper-schema-migrations'))`)
    migrationLockHeld=true
    await bootstrapLegacyTables(client)
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations(version INT PRIMARY KEY,name TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`)
    const applied=await client.query<{version:number}>(`SELECT version FROM schema_migrations`); const versions=new Set(applied.rows.map(r=>r.version))
    for(const migration of migrations){if(versions.has(migration.version))continue;await client.query('BEGIN');try{await migration.run(client);await client.query(`INSERT INTO schema_migrations(version,name) VALUES($1,$2)`,[migration.version,migration.name]);await client.query('COMMIT')}catch(error){await client.query('ROLLBACK');throw error}}
  } finally {if(migrationLockHeld)await client.query(`SELECT pg_advisory_unlock(hashtext('search-helper-schema-migrations'))`).catch(()=>undefined);client.release()}
}
